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
        whisperSupported: true
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
   * Initialize Whisper pipeline (lazy loaded)
   */
  async initializeWhisper() {
    if (this.whisperPipeline) return this.whisperPipeline

    try {
      console.log('🤖 Loading Whisper model...')
      this.notifyListeners('status', { type: 'whisper_loading' })

      const { pipeline } = await import('@xenova/transformers')

      // Use the smallest model for mobile compatibility
      this.whisperPipeline = await pipeline(
        'automatic-speech-recognition',
        'Xenova/whisper-tiny.en',
        {
          dtype: 'fp32', // Use fp32 for better mobile compatibility
          device: 'cpu'   // Ensure CPU usage for compatibility
        }
      )

      console.log('✅ Whisper model loaded')
      this.notifyListeners('status', { type: 'whisper_ready' })

      return this.whisperPipeline
    } catch (error) {
      console.error('❌ Failed to load Whisper:', error)
      this.notifyListeners('error', {
        type: 'whisper_error',
        error: error.message
      })
      throw error
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
        language = 'en-US'
      } = options

      if (this.isRecording) {
        throw new Error('Recording is already in progress')
      }

      console.log(`🎤 Starting recording in ${mode} mode`)
      this.mode = mode
      this.isRecording = true
      this.audioChunks = []

      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000 // Optimal for Whisper
        }
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
          await this.processRecordingWithWhisper()
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

      // Stop all tracks
      if (this.mediaRecorder.stream) {
        this.mediaRecorder.stream.getTracks().forEach(track => track.stop())
      }
    }

    this.notifyListeners('status', { type: 'recording_stopped' })

    return { success: true }
  }

  /**
   * Process recorded audio with Whisper
   */
  async processRecordingWithWhisper() {
    if (this.audioChunks.length === 0) return

    try {
      console.log('🤖 Processing audio with Whisper...')
      this.notifyListeners('status', { type: 'whisper_processing' })

      // Initialize Whisper if not already done
      const pipeline = await this.initializeWhisper()

      // Convert audio chunks to blob
      const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' })

      // Convert to audio buffer for Whisper
      const audioBuffer = await this.convertBlobToAudioBuffer(audioBlob)

      // Transcribe with Whisper
      const result = await pipeline(audioBuffer, {
        return_timestamps: 'word',
        chunk_length_s: 30,
        stride_length_s: 5
      })

      console.log('✅ Whisper transcription complete')

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
      console.error('❌ Whisper processing failed:', error)
      this.notifyListeners('error', {
        type: 'whisper_processing_error',
        error: error.message
      })
      throw error
    }
  }

  /**
   * Convert blob to audio buffer for Whisper
   */
  async convertBlobToAudioBuffer(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()

      reader.onload = async () => {
        try {
          const arrayBuffer = reader.result
          const audioContext = new (window.AudioContext || window.webkitAudioContext)()
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

          // Convert to mono and resample to 16kHz for Whisper
          const sampleRate = 16000
          const channelData = audioBuffer.getChannelData(0)
          const samples = new Float32Array(
            Math.floor(channelData.length * sampleRate / audioBuffer.sampleRate)
          )

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

          resolve(samples)
        } catch (error) {
          reject(error)
        }
      }

      reader.onerror = () => reject(new Error('Failed to read audio blob'))
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
    if (this.isRecording) {
      this.stopRecording()
    }

    this.listeners.clear()
    this.whisperPipeline = null
    this.recognition = null
  }
}

// Create singleton instance
const audioTranscriptionService = new AudioTranscriptionService()
export default audioTranscriptionService