/**
 * Audio Transcription Service for MeetingFlow
 * Handles both real-time (Web Speech API) and high-accuracy (Whisper) transcription
 */

class AudioTranscriptionService {
  constructor() {
    this.isInitialized = false
    this.whisperPipeline = null
    this.recognition = null
    this.isRecording = false
    this.mediaRecorder = null
    this.audioChunks = []
    this.listeners = new Set()

    // Transcription modes
    this.mode = 'hybrid' // 'realtime', 'whisper', 'hybrid'
    this.realtimeEnabled = this.checkWebSpeechSupport()

    // Error recovery
    this.stream = null
    this.autoReconnectAttempts = 0
    this.maxReconnectAttempts = 3
  }

  /**
   * Check if Web Speech API is supported
   */
  checkWebSpeechSupport() {
    return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window
  }

  /**
   * Initialize the transcription service
   */
  async initialize() {
    try {
      console.log('🎤 Initializing Audio Transcription Service...')

      // Initialize Web Speech API if supported
      if (this.realtimeEnabled) {
        await this.initializeWebSpeech()
      }

      // Initialize Whisper (lazy loaded)
      // We'll load this when first needed to avoid blocking the UI

      this.isInitialized = true
      console.log('✅ Audio Transcription Service initialized')

      return {
        success: true,
        realtimeSupported: this.realtimeEnabled,
        whisperSupported: true // We'll check this lazily when needed
      }
    } catch (error) {
      console.error('❌ Failed to initialize transcription service:', error)
      throw new Error(`Transcription service initialization failed: ${error.message}`)
    }
  }

  /**
   * Initialize Web Speech API for real-time transcription
   */
  async initializeWebSpeech() {
    if (!this.realtimeEnabled) return

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    this.recognition = new SpeechRecognition()

    // Configure recognition
    this.recognition.continuous = true
    this.recognition.interimResults = true
    this.recognition.lang = 'en-US'
    this.recognition.maxAlternatives = 1

    // Set up event handlers
    this.recognition.onstart = () => {
      console.log('🎤 Real-time transcription started')
      this.notifyListeners('status', { type: 'realtime_started' })
    }

    this.recognition.onresult = (event) => {
      let interimTranscript = ''
      let finalTranscript = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript

        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' '
        } else {
          interimTranscript += transcript
        }
      }

      this.notifyListeners('transcript', {
        type: 'realtime',
        final: finalTranscript.trim(),
        interim: interimTranscript.trim(),
        timestamp: new Date().toISOString()
      })
    }

    this.recognition.onerror = (event) => {
      console.error('🎤 Speech recognition error:', event.error)
      this.notifyListeners('error', {
        type: 'realtime_error',
        error: event.error,
        message: this.getErrorMessage(event.error)
      })
    }

    this.recognition.onend = () => {
      console.log('🎤 Real-time transcription ended')
      this.notifyListeners('status', { type: 'realtime_ended' })
    }
  }

  /**
   * Initialize Whisper with modern Hugging Face Transformers (2024)
   */
  async initializeWhisper() {
    if (this.whisperPipeline) return this.whisperPipeline

    try {
      console.log('🚀 Loading Whisper with modern Transformers.js...')
      this.notifyListeners('status', { type: 'whisper_loading' })

      // Import the modern Hugging Face Transformers.js
      const { pipeline } = await import('@huggingface/transformers')

      // Try WebGPU first, then fall back to WASM (not CPU)
      try {
        console.log('🎯 Attempting WebGPU acceleration...')
        this.whisperPipeline = await pipeline(
          'automatic-speech-recognition',
          'onnx-community/whisper-tiny.en',
          {
            device: 'webgpu',
            dtype: 'fp16'
          }
        )
        console.log('✅ Whisper WebGPU model loaded successfully')
      } catch (webgpuError) {
        console.warn('⚠️ WebGPU failed, falling back to WASM:', webgpuError.message)

        // Fallback to WASM (not CPU - that's not supported)
        try {
          this.whisperPipeline = await pipeline(
            'automatic-speech-recognition',
            'Xenova/whisper-tiny.en',
            {
              device: 'wasm',
              dtype: 'fp32'
            }
          )
          console.log('✅ Whisper WASM fallback loaded successfully')
        } catch (wasmError) {
          console.error('❌ WASM fallback also failed:', wasmError.message)

          // Final fallback - try without specifying device (let library choose)
          try {
            console.log('🔄 Trying default device configuration...')
            this.whisperPipeline = await pipeline(
              'automatic-speech-recognition',
              'Xenova/whisper-tiny.en'
              // No device specified - let the library choose the best available
            )
            console.log('✅ Whisper default configuration loaded successfully')
          } catch (defaultError) {
            console.error('❌ All Whisper fallbacks failed:', defaultError.message)
            throw new Error(`Whisper initialization failed: WebGPU (${webgpuError.message}), WASM (${wasmError.message}), Default (${defaultError.message})`)
          }
        }
      }

      this.notifyListeners('status', { type: 'whisper_ready' })
      return this.whisperPipeline

    } catch (error) {
      console.error('❌ Failed to load Whisper:', error)

      // Don't throw the error - gracefully continue with real-time only mode
      console.warn('⚠️ Whisper unavailable, continuing with real-time transcription only')
      this.whisperPipeline = null

      this.notifyListeners('status', {
        type: 'whisper_unavailable',
        message: 'Whisper high-accuracy transcription is not available. Using real-time transcription only.'
      })

      // Return null to indicate Whisper is not available
      return null
    }
  }

  /**
   * Start recording and transcription
   */
  async startRecording(options = {}) {
    try {
      const {
        mode = 'hybrid',
        continuous = true,
        language = 'en-US',
        deviceId = null
      } = options

      if (this.isRecording) {
        throw new Error('Recording is already in progress')
      }

      console.log(`🎤 Starting recording in ${mode} mode`)
      this.mode = mode
      this.isRecording = true
      this.audioChunks = []

      // Enhanced audio constraints for simultaneous speaker/mic usage
      const audioConstraints = {
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000, // Optimal for Whisper
          // Advanced constraints for better speaker/mic coexistence
          suppressLocalAudioPlayback: false, // Allow local audio playback
          googEchoCancellation: true,
          googAutoGainControl: true,
          googNoiseSuppression: true,
          googHighpassFilter: true,
          googAudioMirroring: false,
          // Prevent audio device conflicts
          latency: 0.01, // Low latency for better real-time performance
          channelCount: 1, // Mono to reduce processing load
          volume: 1.0
        }
      }

      console.log('🎤 Requesting microphone with enhanced constraints for speaker coexistence', deviceId ? `(device: ${deviceId})` : '(default device)')

      // Try enhanced constraints first, fallback to basic if not supported
      let stream
      try {
        stream = await navigator.mediaDevices.getUserMedia(audioConstraints)
        console.log('✅ Enhanced audio constraints applied')
      } catch (enhancedError) {
        console.warn('⚠️ Enhanced constraints failed, trying basic constraints:', enhancedError)
        // Fallback with device selection if specified
        const fallbackConstraints = {
          audio: {
            deviceId: deviceId ? { exact: deviceId } : undefined,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 16000
          }
        }
        stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints)
        console.log('✅ Basic audio constraints applied')
      }

      this.stream = stream

      // Monitor stream health
      stream.getTracks().forEach(track => {
        track.addEventListener('ended', () => {
          console.warn('⚠️ Audio track ended unexpectedly')
          if (this.isRecording) {
            this.notifyListeners('error', {
              type: 'recording_disrupted',
              reason: 'track_ended',
              message: 'Recording was disrupted: microphone disconnected'
            })
          }
        })
      })

      // Start real-time transcription if enabled
      if ((mode === 'realtime' || mode === 'hybrid') && this.realtimeEnabled) {
        this.recognition.lang = language
        this.recognition.start()
      }

      // Set up audio recording for Whisper processing
      if (mode === 'whisper' || mode === 'hybrid') {
        this.mediaRecorder = new MediaRecorder(stream, {
          mimeType: 'audio/webm;codecs=opus'
        })

        this.mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            this.audioChunks.push(event.data)
          }
        }

        this.mediaRecorder.onstop = async () => {
          console.log('🎤 Recording stopped, processing with Whisper...')
          try {
            const result = await this.processRecordingWithWhisper()
            if (!result) {
              console.log('⚠️ Whisper processing skipped - using real-time transcript only')
            }
          } catch (error) {
            console.error('Whisper processing failed:', error)
            // Don't crash - just continue without Whisper output
            this.notifyListeners('status', {
              type: 'whisper_processing_failed',
              message: 'High-accuracy processing unavailable. Real-time transcript saved.',
              error: error.message
            })
          }
        }

        this.mediaRecorder.onerror = (event) => {
          console.error('MediaRecorder error:', event.error)
          if (this.isRecording) {
            this.notifyListeners('error', {
              type: 'recording_disrupted',
              reason: 'recorder_error',
              message: `Recording error: ${event.error}`
            })
          }
        }

        // Record in chunks for processing
        this.mediaRecorder.start(5000) // 5-second chunks
      }

      this.notifyListeners('status', {
        type: 'recording_started',
        mode: this.mode
      })

      return { success: true, mode: this.mode }
    } catch (error) {
      console.error('❌ Failed to start recording:', error)
      this.isRecording = false

      this.notifyListeners('error', {
        type: 'recording_error',
        error: error.message
      })

      throw error
    }
  }

  /**
   * Stop recording and transcription
   */
  async stopRecording() {
    if (!this.isRecording) {
      throw new Error('No recording in progress')
    }

    console.log('🛑 Stopping recording')
    this.isRecording = false

    // Stop real-time transcription
    if (this.recognition && this.realtimeEnabled) {
      this.recognition.stop()
    }

    // Stop audio recording
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop()
    }

    // Stop media stream
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop())
      this.stream = null
    }

    this.notifyListeners('status', { type: 'recording_stopped' })

    return { success: true }
  }

  /**
   * Process recorded audio with modern Transformers.js
   */
  async processRecordingWithWhisper() {
    if (this.audioChunks.length === 0) return null

    try {
      console.log('🤖 Processing audio with modern Transformers.js...')
      console.log(`📊 Audio chunks: ${this.audioChunks.length} chunks`)
      this.notifyListeners('status', { type: 'whisper_processing' })

      // Initialize Whisper if not already done
      const pipeline = await this.initializeWhisper()
      if (!pipeline) {
        console.log('⚠️ Whisper not available, skipping processing')
        return null
      }
      console.log('✅ Pipeline ready, processing audio...')

      // Convert audio chunks to blob
      const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' })
      console.log(`📦 Audio blob size: ${audioBlob.size} bytes, type: ${audioBlob.type}`)

      // Convert to audio buffer for Transformers.js
      console.log('🔄 Converting audio blob to Float32Array...')
      const audioBuffer = await this.convertBlobToAudioBuffer(audioBlob)
      console.log(`🎵 Audio buffer length: ${audioBuffer.length} samples, sample rate: 16kHz`)

      // Transcribe with modern Transformers.js pipeline API
      console.log('🚀 Starting transcription...')
      const result = await pipeline(audioBuffer, {
        return_timestamps: 'word',
        chunk_length_s: 30,
        stride_length_s: 5
      })

      console.log('✅ Modern Transformers.js transcription complete:', result)

      this.notifyListeners('transcript', {
        type: 'whisper',
        text: result.text,
        chunks: result.chunks || [],
        timestamp: new Date().toISOString()
      })

      // Clear chunks for next recording
      this.audioChunks = []

      return result
    } catch (error) {
      console.error('❌ Modern Transformers.js processing failed:', error)
      console.error('❌ Error details:', {
        message: error.message,
        stack: error.stack,
        audioChunks: this.audioChunks.length,
        pipelineStatus: !!this.whisperPipeline
      })
      this.notifyListeners('error', {
        type: 'whisper_processing_error',
        error: error.message
      })
      throw error
    }
  }

  /**
   * Convert blob to audio buffer for Whisper (optimized for Transformers.js)
   */
  async convertBlobToAudioBuffer(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()

      reader.onload = async () => {
        try {
          console.log('📥 Reading audio blob as ArrayBuffer...')
          const arrayBuffer = reader.result
          console.log(`📊 ArrayBuffer size: ${arrayBuffer.byteLength} bytes`)

          // Create AudioContext optimized for Whisper
          const audioContext = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: 16000 // Try to match target sample rate
          })
          console.log(`🎛️ AudioContext created with sample rate: ${audioContext.sampleRate}`)

          // Decode the audio data
          console.log('🔄 Decoding audio data...')
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
          console.log(`🎵 Decoded audio: ${audioBuffer.duration}s, ${audioBuffer.sampleRate}Hz, ${audioBuffer.numberOfChannels} channels`)

          // Get the first channel and convert to Float32Array
          const channelData = audioBuffer.getChannelData(0)
          console.log(`📊 Channel data length: ${channelData.length} samples`)

          let samples
          if (audioBuffer.sampleRate === 16000) {
            // Already at target sample rate, just use the data
            console.log('✅ Audio already at 16kHz, using directly')
            samples = channelData.slice()
          } else {
            // Resample to 16kHz for Whisper
            console.log(`🔄 Resampling from ${audioBuffer.sampleRate}Hz to 16000Hz`)
            const sampleRate = 16000
            const resampledLength = Math.floor(channelData.length * sampleRate / audioBuffer.sampleRate)
            samples = new Float32Array(resampledLength)

            // Simple linear interpolation for resampling
            const ratio = channelData.length / samples.length
            for (let i = 0; i < samples.length; i++) {
              const index = i * ratio
              const lower = Math.floor(index)
              const upper = Math.ceil(index)
              const weight = index - lower

              if (upper < channelData.length) {
                samples[i] = channelData[lower] * (1 - weight) + channelData[upper] * weight
              } else {
                samples[i] = channelData[lower]
              }
            }
          }

          console.log(`✅ Audio conversion complete: ${samples.length} samples at 16kHz`)

          // Validate the audio data
          if (samples.length === 0) {
            throw new Error('Audio conversion resulted in empty buffer')
          }

          resolve(samples)
        } catch (error) {
          console.error('❌ Audio conversion failed:', error)
          reject(new Error(`Audio conversion failed: ${error.message}`))
        }
      }

      reader.onerror = () => {
        console.error('❌ FileReader failed')
        reject(new Error('Failed to read audio blob'))
      }

      console.log('📖 Starting to read audio blob...')
      reader.readAsArrayBuffer(blob)
    })
  }

  /**
   * Add event listener
   */
  addEventListener(callback) {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  /**
   * Notify all listeners
   */
  notifyListeners(event, data) {
    this.listeners.forEach(listener => {
      try {
        listener(event, data)
      } catch (error) {
        console.error('❌ Listener error:', error)
      }
    })
  }

  /**
   * Get user-friendly error message
   */
  getErrorMessage(error) {
    const errorMessages = {
      'no-speech': 'No speech was detected. Please try speaking louder.',
      'audio-capture': 'Microphone access was denied. Please allow microphone permissions.',
      'not-allowed': 'Microphone access is not allowed. Please check your browser settings.',
      'network': 'Network error occurred. Please check your internet connection.',
      'aborted': 'Speech recognition was aborted.',
      'language-not-supported': 'The selected language is not supported.'
    }

    return errorMessages[error] || `Speech recognition error: ${error}`
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      isRecording: this.isRecording,
      realtimeSupported: this.realtimeEnabled,
      whisperLoaded: !!this.whisperPipeline,
      mode: this.mode
    }
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    if (this.recognition) {
      try {
        this.recognition.stop()
      } catch (error) {
        console.warn('Error stopping recognition:', error)
      }
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop()
      } catch (error) {
        console.warn('Error stopping media recorder:', error)
      }
    }
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop())
      this.stream = null
    }
    this.audioChunks = []
    this.isRecording = false
    this.autoReconnectAttempts = 0
    this.listeners.clear()
    this.whisperPipeline = null
    this.recognition = null
  }
}

// Create singleton instance
const audioTranscriptionService = new AudioTranscriptionService()
export default audioTranscriptionService