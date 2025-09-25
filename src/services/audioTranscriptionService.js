/**
 * Simple Audio Transcription Service for MeetingFlow
 * Uses only Web Speech API - no complex dependencies
 */

class AudioTranscriptionService {
  constructor() {
    this.isInitialized = false
    this.recognition = null
    this.isRecording = false
    this.listeners = new Set()

    // Simple mode - only real-time transcription
    this.mode = 'realtime'
    this.realtimeEnabled = this.checkWebSpeechSupport()

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
   * Start recording and transcription
   */
  async startRecording(options = {}) {
    try {
      const {
        continuous = true,
        language = 'en-US'
      } = options

      if (this.isRecording) {
        throw new Error('Recording is already in progress')
      }

      if (!this.realtimeEnabled) {
        throw new Error('Speech recognition is not supported in this browser')
      }

      console.log(`🎤 Starting simple recording in real-time mode`)
      this.isRecording = true
      this.autoReconnectAttempts = 0

      // Configure language
      this.recognition.lang = language
      this.recognition.continuous = continuous

      // Start recognition
      this.recognition.start()

      this.notifyListeners('status', {
        type: 'recording_started',
        mode: 'realtime'
      })

      return { success: true, mode: 'realtime' }
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
    if (this.recognition) {
      this.recognition.stop()
    }

    this.notifyListeners('status', { type: 'recording_stopped' })

    return { success: true }
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
      realtimeSupported: this.realtimeEnabled,
      whisperLoaded: false, // No Whisper anymore
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
    this.isRecording = false
    this.autoReconnectAttempts = 0
    this.listeners.clear()
    this.recognition = null
  }
}

// Create singleton instance
const audioTranscriptionService = new AudioTranscriptionService()
export default audioTranscriptionService