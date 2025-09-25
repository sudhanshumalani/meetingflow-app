/**
 * Enhanced Audio Transcription Service for MeetingFlow
 * Supports microphone + tab audio capture for live transcription
 */

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

    // Simple mode - real-time transcription
    this.mode = 'realtime'
    this.realtimeEnabled = this.checkWebSpeechSupport()
    this.tabAudioEnabled = this.checkTabAudioSupport()

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
        mode: 'realtime'
      })

      return { success: true, source, mode: 'realtime' }
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
   * Start microphone recording (existing functionality)
   */
  async startMicrophoneRecording(options = {}) {
    if (!this.realtimeEnabled) {
      throw new Error('Speech recognition is not supported in this browser')
    }

    console.log('🎤 Starting microphone recording...')

    // Configure and start speech recognition
    this.recognition.lang = options.language || 'en-US'
    this.recognition.continuous = options.continuous !== false
    this.recognition.start()
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

      // Set up Web Audio API for processing
      await this.setupTabAudioProcessing(stream, options)

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
   * Note: Web Speech API doesn't work directly with captured streams,
   * so we'll emit raw audio events for external processing
   */
  startTabAudioTranscription(stream, options = {}) {
    console.log('🔄 Setting up tab audio transcription...')

    // Create MediaRecorder for audio processing
    try {
      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm'
      })

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          // Emit audio chunk for external processing
          this.notifyListeners('tabAudioChunk', {
            source: 'tabAudio',
            audioData: event.data,
            timestamp: new Date().toISOString(),
            size: event.data.size
          })

          // For demo purposes, emit periodic transcript updates
          // In production, you'd send this to a speech-to-text service
          this.emitTabAudioTranscript()
        }
      }

      // Start recording in small chunks for real-time processing
      this.mediaRecorder.start(1000)

      console.log('✅ Tab audio transcription started')
      console.log('💡 Tab audio transcription requires external speech service for production use')
    } catch (error) {
      console.error('❌ Failed to start tab audio transcription:', error)
      // Don't throw - continue with audio capture even if transcription fails
    }
  }

  /**
   * Emit placeholder transcript for tab audio (demo implementation)
   */
  emitTabAudioTranscript() {
    // This is a placeholder - in production you'd get real transcripts from a service
    const placeholderMessages = [
      'Tab audio detected...',
      'Processing audio from tab/screen...',
      'Audio stream active...'
    ]

    // Emit a status message every few seconds
    if (Math.random() < 0.3) { // 30% chance per chunk
      this.notifyListeners('transcript', {
        type: 'tabAudio',
        source: 'tabAudio',
        final: '',
        interim: placeholderMessages[Math.floor(Math.random() * placeholderMessages.length)],
        timestamp: new Date().toISOString(),
        isPlaceholder: true
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
   * Stop recording and transcription
   */
  async stopRecording() {
    if (!this.isRecording) {
      throw new Error('No recording in progress')
    }

    console.log('🛑 Stopping recording')
    this.isRecording = false

    // Stop microphone transcription
    if (this.recognition) {
      this.recognition.stop()
    }

    // Stop tab audio capture
    if (this.audioSources.tabAudio) {
      this.audioSources.tabAudio.getTracks().forEach(track => track.stop())
      this.audioSources.tabAudio = null
    }

    // Stop media recorder
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop()
      this.mediaRecorder = null
    }

    // Close audio context
    if (this.audioContext && this.audioContext.state !== 'closed') {
      await this.audioContext.close()
      this.audioContext = null
    }

    this.analyserNode = null

    this.notifyListeners('status', {
      type: 'recording_stopped',
      source: this.activeSource
    })

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