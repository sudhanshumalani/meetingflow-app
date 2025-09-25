/**
 * Enhanced Audio Transcription Service for MeetingFlow
 * Supports microphone + tab audio capture with Whisper batch processing
 */

import transcriptionService from './transcription/TranscriptionService.js'

class AudioTranscriptionService {
  constructor() {
    this.isInitialized = false
    this.recognition = null
    this.isRecording = false
    this.listeners = new Set()

    // Audio sources
    this.audioSources = {
      microphone: null,
      tabAudio: null,
      mixed: null
    }
    this.activeSource = 'microphone' // microphone | tabAudio | mixed

    // Web Audio API for tab audio processing
    this.audioContext = null
    this.mediaRecorder = null
    this.analyserNode = null

    // Whisper batch processing mode
    this.mode = 'whisper'
    this.realtimeEnabled = false // Disabled for Whisper mode
    this.tabAudioEnabled = this.checkTabAudioSupport()
    this.whisperEnabled = true

    // Audio recording for batch processing
    this.recordedChunks = []
    this.finalAudioBlob = null

    // Error recovery
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
   * Check if tab audio capture is supported
   */
  checkTabAudioSupport() {
    return 'getDisplayMedia' in navigator.mediaDevices
  }

  /**
   * Get available audio sources
   */
  getAvailableAudioSources() {
    const sources = []

    if (this.realtimeEnabled) {
      sources.push({
        id: 'microphone',
        name: 'Microphone',
        description: 'Capture your voice for transcription',
        icon: '🎤',
        supported: true
      })
    }

    if (this.tabAudioEnabled) {
      sources.push({
        id: 'tabAudio',
        name: 'Tab/Screen Audio',
        description: 'Capture audio from browser tabs or shared applications (YouTube, web meetings)',
        icon: '🖥️',
        supported: true
      })

      if (this.realtimeEnabled) {
        sources.push({
          id: 'mixed',
          name: 'Microphone + Tab Audio',
          description: 'Capture both your voice and tab/screen audio simultaneously',
          icon: '🎙️',
          supported: true
        })
      }
    }

    return sources
  }

  /**
   * Initialize the transcription service
   */
  async initialize() {
    try {
      console.log('🎤 Initializing Simple Audio Transcription Service...')

      if (!this.realtimeEnabled) {
        throw new Error('Web Speech API is not supported in this browser')
      }

      // Initialize Web Speech API
      await this.initializeWebSpeech()

      this.isInitialized = true
      console.log('✅ Simple Audio Transcription Service initialized')

      return {
        success: true,
        realtimeSupported: this.realtimeEnabled,
        tabAudioSupported: this.tabAudioEnabled,
        availableSources: this.getAvailableAudioSources(),
        whisperSupported: false // We don't use Whisper anymore
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

    // Configure recognition for best results
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

      // Handle network errors with auto-reconnect
      if (event.error === 'network' && this.autoReconnectAttempts < this.maxReconnectAttempts) {
        console.log(`🔄 Network error, attempting reconnect ${this.autoReconnectAttempts + 1}/${this.maxReconnectAttempts}`)
        this.autoReconnectAttempts++

        setTimeout(() => {
          if (this.isRecording) {
            this.recognition.start()
          }
        }, 1000)
        return
      }

      this.notifyListeners('error', {
        type: 'realtime_error',
        error: event.error,
        message: this.getErrorMessage(event.error)
      })
    }

    this.recognition.onend = () => {
      console.log('🎤 Real-time transcription ended')
      this.notifyListeners('status', { type: 'realtime_ended' })

      // Auto-restart if we're still supposed to be recording
      if (this.isRecording) {
        console.log('🔄 Auto-restarting transcription')
        setTimeout(() => {
          if (this.isRecording) {
            this.recognition.start()
          }
        }, 100)
      }
    }
  }

  /**
   * Start recording and transcription with specified audio source
   */
  async startRecording(options = {}) {
    try {
      const {
        continuous = true,
        language = 'en-US',
        source = 'microphone' // microphone | tabAudio | mixed
      } = options

      if (this.isRecording) {
        throw new Error('Recording is already in progress')
      }

      console.log(`🎤 Starting recording with source: ${source}`)
      this.activeSource = source
      this.isRecording = true
      this.autoReconnectAttempts = 0

      // Start recording based on selected source
      switch (source) {
        case 'microphone':
          await this.startMicrophoneRecording({ continuous, language })
          break
        case 'tabAudio':
          await this.startTabAudioRecording({ continuous, language })
          break
        case 'mixed':
          await this.startMixedAudioRecording({ continuous, language })
          break
        default:
          throw new Error(`Unsupported audio source: ${source}`)
      }

      this.notifyListeners('status', {
        type: 'recording_started',
        source,
        mode: 'whisper'
      })

      return { success: true, source, mode: 'whisper' }
    } catch (error) {
      console.error('❌ Failed to start recording:', error)
      this.isRecording = false

      this.notifyListeners('error', {
        type: 'recording_error',
        source: this.activeSource,
        error: error.message
      })

      throw error
    }
  }

  /**
   * Start microphone recording for Whisper batch processing
   */
  async startMicrophoneRecording(options = {}) {
    console.log('🎤 Starting microphone recording for Whisper...')

    try {
      // Get microphone stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
          channelCount: 1
        }
      })

      this.audioSources.microphone = stream
      await this.setupMediaRecorder(stream, 'microphone')

    } catch (error) {
      console.error('❌ Microphone access failed:', error)
      if (error.name === 'NotAllowedError') {
        throw new Error('Microphone access denied. Please allow microphone permissions.')
      }
      throw new Error(`Microphone capture failed: ${error.message}`)
    }
  }

  /**
   * Start tab audio recording
   */
  async startTabAudioRecording(options = {}) {
    if (!this.tabAudioEnabled) {
      throw new Error('Tab audio capture is not supported in this browser')
    }

    try {
      console.log('🖥️ Requesting tab/screen audio capture...')

      // Request tab/screen audio capture
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true, // Chrome requires video for getDisplayMedia
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        }
      })

      console.log('✅ Tab audio stream acquired')
      this.audioSources.tabAudio = stream

      // Set up MediaRecorder for batch processing
      await this.setupMediaRecorder(stream, 'tabAudio')

      // Hide the video track (we only want audio)
      const videoTrack = stream.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.enabled = false
      }

    } catch (error) {
      console.error('❌ Tab audio capture failed:', error)

      if (error.name === 'NotAllowedError') {
        throw new Error('Tab audio access denied. Please allow screen/tab sharing with audio.')
      }

      throw new Error(`Tab audio capture failed: ${error.message}`)
    }
  }

  /**
   * Start mixed audio recording (microphone + tab audio)
   */
  async startMixedAudioRecording(options = {}) {
    console.log('🎙️ Starting mixed audio recording...')

    // Start both microphone and tab audio
    await this.startMicrophoneRecording(options)
    await this.startTabAudioRecording(options)

    console.log('✅ Mixed audio recording started')
  }

  /**
   * Set up Web Audio API processing for tab audio
   */
  async setupTabAudioProcessing(stream, options = {}) {
    try {
      // Create audio context if not exists
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)()
      }

      // Create source from the stream
      const source = this.audioContext.createMediaStreamSource(stream)

      // Create analyser for audio visualization
      this.analyserNode = this.audioContext.createAnalyser()
      this.analyserNode.fftSize = 256
      source.connect(this.analyserNode)

      // For tab audio transcription, we need to route audio through speech recognition
      // Create a new MediaStream that can be used with getUserMedia-like APIs
      const audioTrack = stream.getAudioTracks()[0]
      if (audioTrack) {
        // Create a destination node and connect to it
        const destination = this.audioContext.createMediaStreamDestination()
        source.connect(destination)

        // Start transcription using the processed audio
        this.startTabAudioTranscription(destination.stream, options)
      }

      // Start audio level monitoring
      this.startAudioLevelMonitoring()

      console.log('✅ Tab audio processing setup complete')
    } catch (error) {
      console.error('❌ Tab audio processing setup failed:', error)
      throw error
    }
  }

  /**
   * Start transcription for tab audio
   * Note: Browser security limitations prevent direct transcription of captured audio
   */
  startTabAudioTranscription(stream, options = {}) {
    console.log('🔄 Setting up tab audio transcription...')

    try {
      // Create MediaRecorder for audio processing
      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm'
      })

      let audioBlobs = []
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioBlobs.push(event.data)

          // Emit audio chunk for monitoring
          this.notifyListeners('tabAudioChunk', {
            source: 'tabAudio',
            audioData: event.data,
            timestamp: new Date().toISOString(),
            size: event.data.size
          })

          // Show helpful guidance
          this.emitTabAudioGuidance()
        }
      }

      this.mediaRecorder.onstop = () => {
        // When recording stops, we have the complete audio
        const audioBlob = new Blob(audioBlobs, { type: 'audio/webm' })
        const audioUrl = URL.createObjectURL(audioBlob)

        console.log('🎵 Tab audio recording complete, size:', audioBlob.size, 'bytes')

        // Emit final message with audio data
        this.notifyListeners('transcript', {
          type: 'tabAudio',
          source: 'tabAudio',
          final: `Tab audio captured successfully (${Math.round(audioBlob.size / 1024)}KB). Ready for external transcription service.`,
          interim: '',
          timestamp: new Date().toISOString(),
          audioBlob: audioBlob,
          audioUrl: audioUrl,
          isComplete: true
        })

        audioBlobs = []
      }

      // Start recording in small chunks
      this.mediaRecorder.start(2000) // 2-second chunks

      console.log('✅ Tab audio capture started - audio will be available for external transcription')

      // Show immediate guidance
      this.notifyListeners('transcript', {
        type: 'tabAudio',
        source: 'tabAudio',
        final: '',
        interim: '🎵 Capturing tab audio... For live transcription: ensure audio plays through speakers (not headphones) and enable microphone to pick up the sound.',
        timestamp: new Date().toISOString(),
        isGuidance: true
      })

    } catch (error) {
      console.error('❌ Failed to start tab audio transcription:', error)

      // Show helpful message
      this.notifyListeners('transcript', {
        type: 'tabAudio',
        source: 'tabAudio',
        final: 'Tab audio capture failed. Please try again or check browser permissions.',
        interim: '',
        timestamp: new Date().toISOString(),
        isError: true
      })
    }
  }

  /**
   * Provide helpful guidance for tab audio transcription
   */
  emitTabAudioGuidance() {
    const guidanceMessages = [
      '🎵 Tab audio is being captured...',
      '💡 For real-time transcription: play audio through speakers and enable microphone',
      '🔊 Audio chunks are being saved for processing',
      '⏺️ Recording tab audio for external transcription...'
    ]

    // Show guidance periodically
    if (Math.random() < 0.1) { // 10% chance per chunk
      this.notifyListeners('transcript', {
        type: 'tabAudio',
        source: 'tabAudio',
        final: '',
        interim: guidanceMessages[Math.floor(Math.random() * guidanceMessages.length)],
        timestamp: new Date().toISOString(),
        isGuidance: true
      })
    }
  }

  /**
   * Start audio level monitoring for visualization
   */
  startAudioLevelMonitoring() {
    if (!this.analyserNode) return

    const bufferLength = this.analyserNode.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    const updateAudioLevel = () => {
      if (!this.isRecording) return

      this.analyserNode.getByteFrequencyData(dataArray)

      // Calculate average audio level
      let sum = 0
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i]
      }
      const average = sum / bufferLength

      this.notifyListeners('audioLevel', {
        source: 'tabAudio',
        level: average / 255, // Normalize to 0-1
        timestamp: new Date().toISOString()
      })

      if (this.isRecording) {
        requestAnimationFrame(updateAudioLevel)
      }
    }

    updateAudioLevel()
  }

  /**
   * Set up MediaRecorder for audio capture
   */
  async setupMediaRecorder(stream, sourceType) {
    try {
      console.log(`🎙️ Setting up MediaRecorder for ${sourceType}`)

      // Reset recorded chunks
      this.recordedChunks = []

      // Set up MediaRecorder with appropriate MIME type
      const options = {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm'
      }

      this.mediaRecorder = new MediaRecorder(stream, options)

      // Handle data available events
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.recordedChunks.push(event.data)
          console.log(`📦 Audio chunk captured: ${event.data.size} bytes`)

          // Notify UI of recording progress
          this.notifyListeners('status', {
            type: 'recording_chunk',
            source: sourceType,
            chunkSize: event.data.size,
            totalChunks: this.recordedChunks.length
          })
        }
      }

      // Handle recording stop
      this.mediaRecorder.onstop = () => {
        // Create final audio blob
        this.finalAudioBlob = new Blob(this.recordedChunks, {
          type: options.mimeType
        })

        console.log(`🎵 Recording stopped, final size: ${this.finalAudioBlob.size} bytes`)
      }

      // Handle errors
      this.mediaRecorder.onerror = (event) => {
        console.error('❌ MediaRecorder error:', event.error)
        this.notifyListeners('error', {
          type: 'recording_error',
          error: event.error.message
        })
      }

      // Start recording
      this.mediaRecorder.start(1000) // Collect data every 1 second
      console.log(`✅ MediaRecorder started for ${sourceType}`)

    } catch (error) {
      console.error('❌ Failed to setup MediaRecorder:', error)
      throw new Error(`MediaRecorder setup failed: ${error.message}`)
    }
  }

  /**
   * Stop recording and transcription
   */
  async stopRecording() {
    if (!this.isRecording) {
      throw new Error('No recording in progress')
    }

    console.log('🛑 Stopping recording and starting Whisper transcription...')
    this.isRecording = false

    return new Promise((resolve, reject) => {
      // Set up one-time handler for when recording stops
      const handleRecordingStop = async () => {
        try {
          if (this.finalAudioBlob) {
            console.log('🎯 Processing audio with Whisper...')

            // Notify UI that processing started
            this.notifyListeners('status', {
              type: 'processing_started',
              stage: 'initializing'
            })

            // Initialize transcription service if needed
            if (!transcriptionService.getStatus().isInitialized) {
              await transcriptionService.initialize((progress) => {
                this.notifyListeners('status', {
                  type: 'processing_progress',
                  stage: progress.stage,
                  progress: progress.progress,
                  method: progress.method,
                  description: progress.description
                })
              })
            }

            // Transcribe the audio
            const result = await transcriptionService.transcribe(this.finalAudioBlob, {
              progressCallback: (progress) => {
                this.notifyListeners('status', {
                  type: 'processing_progress',
                  stage: progress.stage,
                  progress: progress.progress
                })
              }
            })

            if (result.success) {
              // Send final transcript
              this.notifyListeners('transcript', {
                type: 'whisper',
                final: result.text,
                interim: '',
                source: this.activeSource
              })

              console.log('✅ Whisper transcription completed:', result.text.substring(0, 100) + '...')
            } else {
              throw new Error(result.error || 'Transcription failed')
            }

            resolve({ success: true, text: result.text })
          } else {
            resolve({ success: true, text: '' })
          }
        } catch (error) {
          console.error('❌ Whisper processing failed:', error)
          this.notifyListeners('error', {
            type: 'processing_error',
            error: error.message
          })
          reject(error)
        } finally {
          // Clean up
          this.cleanup()
        }
      }

      // Stop media recorder if active
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.addEventListener('stop', handleRecordingStop, { once: true })
        this.mediaRecorder.stop()
      } else {
        // No recording to stop, resolve immediately
        this.cleanup()
        resolve({ success: true, text: '' })
      }
    })
  }

  /**
   * Clean up audio resources
   */
  cleanup() {
    // Stop all audio tracks
    Object.values(this.audioSources).forEach(stream => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop())
      }
    })

    // Reset audio sources
    this.audioSources = {
      microphone: null,
      tabAudio: null,
      mixed: null
    }

    // Close audio context
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(console.warn)
      this.audioContext = null
    }

    // Reset recording state
    this.mediaRecorder = null
    this.recordedChunks = []
    this.finalAudioBlob = null
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
      'no-speech': 'No speech was detected. Please try speaking louder and clearer.',
      'audio-capture': 'Microphone access was denied. Please allow microphone permissions.',
      'not-allowed': 'Microphone access is not allowed. Please check your browser settings.',
      'network': 'Network error occurred. Please check your internet connection.',
      'aborted': 'Speech recognition was aborted.',
      'language-not-supported': 'The selected language is not supported.',
      'service-not-allowed': 'Speech recognition service is not allowed.'
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
      activeSource: this.activeSource,
      realtimeSupported: this.realtimeEnabled,
      tabAudioSupported: this.tabAudioEnabled,
      availableSources: this.getAvailableAudioSources(),
      audioContext: !!this.audioContext,
      whisperLoaded: false, // No Whisper anymore
      mode: this.mode
    }
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    // Stop all recording
    if (this.isRecording) {
      this.stopRecording().catch(console.warn)
    }

    // Stop speech recognition
    if (this.recognition) {
      try {
        this.recognition.stop()
      } catch (error) {
        console.warn('Error stopping recognition:', error)
      }
    }


    // Stop all audio sources
    Object.values(this.audioSources).forEach(source => {
      if (source) {
        source.getTracks().forEach(track => track.stop())
      }
    })

    // Close audio context
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(console.warn)
    }

    // Reset state
    this.isRecording = false
    this.autoReconnectAttempts = 0
    this.listeners.clear()
    this.recognition = null
    this.audioContext = null
    this.mediaRecorder = null
    this.analyserNode = null
    this.audioSources = { microphone: null, tabAudio: null, mixed: null }
  }
}

// Create singleton instance
const audioTranscriptionService = new AudioTranscriptionService()
export default audioTranscriptionService