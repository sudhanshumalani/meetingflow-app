/**
 * Audio Buffer Service - Records Audio for Post-Processing
 * Captures audio data during Web Speech API recording for Moonshine Web enhancement
 * Handles different audio sources: microphone, tab audio, hybrid mode
 */

class AudioBufferService {
  constructor() {
    this.isRecording = false
    this.mediaRecorder = null
    this.audioStream = null
    this.recordedChunks = []
    this.audioContext = null
    this.analyser = null
    this.audioLevels = { microphone: 0, tabAudio: 0 }
    this.selectedSource = 'microphone'

    console.log('🎵 AudioBufferService initialized')
  }

  /**
   * Start recording audio buffer alongside Web Speech API
   */
  async startRecording(options = {}) {
    if (this.isRecording) {
      console.log('⚠️ Audio buffer recording already in progress')
      return false
    }

    try {
      this.selectedSource = options.source || 'microphone'
      this.recordedChunks = []

      console.log(`🎵 Starting audio buffer recording with source: ${this.selectedSource}`)

      // Get audio stream based on selected source
      this.audioStream = await this.getAudioStream(this.selectedSource)

      // Set up MediaRecorder
      const mimeType = this.getSupportedMimeType()
      this.mediaRecorder = new MediaRecorder(this.audioStream, {
        mimeType,
        audioBitsPerSecond: 128000 // Good quality for Moonshine processing
      })

      // Set up audio analysis for levels
      this.setupAudioAnalysis(this.audioStream)

      // Handle recorded data
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.recordedChunks.push(event.data)
        }
      }

      this.mediaRecorder.onstop = () => {
        console.log('🎵 Audio buffer recording stopped')
        this.isRecording = false
      }

      this.mediaRecorder.onerror = (event) => {
        console.error('❌ MediaRecorder error:', event.error)
        this.isRecording = false
      }

      // Start recording
      this.mediaRecorder.start(1000) // Collect data every second
      this.isRecording = true

      console.log('✅ Audio buffer recording started successfully')
      return true

    } catch (error) {
      console.error('❌ Failed to start audio buffer recording:', error)
      this.cleanup()
      throw error
    }
  }

  /**
   * Stop recording and get audio blob
   */
  async stopRecording() {
    if (!this.isRecording || !this.mediaRecorder) {
      console.log('⚠️ No active audio buffer recording to stop')
      return null
    }

    return new Promise((resolve) => {
      this.mediaRecorder.onstop = () => {
        try {
          if (this.recordedChunks.length === 0) {
            console.warn('⚠️ No audio data recorded')
            resolve(null)
            return
          }

          // Create audio blob
          const mimeType = this.mediaRecorder.mimeType
          const audioBlob = new Blob(this.recordedChunks, { type: mimeType })

          console.log(`🎵 Audio buffer created: ${(audioBlob.size / 1024 / 1024).toFixed(2)}MB`)

          this.cleanup()
          resolve(audioBlob)

        } catch (error) {
          console.error('❌ Error creating audio blob:', error)
          this.cleanup()
          resolve(null)
        }
      }

      this.mediaRecorder.stop()
    })
  }

  /**
   * Get audio stream based on selected source
   */
  async getAudioStream(source) {
    switch (source) {
      case 'microphone':
        return navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 16000 // Optimal for Moonshine
          }
        })

      case 'tabAudio':
        // For tab audio, we need getDisplayMedia with audio
        return navigator.mediaDevices.getDisplayMedia({
          video: false,
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            sampleRate: 16000
          }
        })

      case 'mixed':
        // For mixed mode, we'll combine microphone + tab audio
        return this.getMixedAudioStream()

      default:
        throw new Error(`Unsupported audio source: ${source}`)
    }
  }

  /**
   * Get mixed audio stream (microphone + tab audio)
   */
  async getMixedAudioStream() {
    try {
      // Get both streams
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000
        }
      })

      const tabStream = await navigator.mediaDevices.getDisplayMedia({
        video: false,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 16000
        }
      })

      // Create audio context to mix streams
      const audioContext = new (window.AudioContext || window.webkitAudioContext)()
      const destination = audioContext.createMediaStreamDestination()

      // Connect both sources to destination
      const micSource = audioContext.createMediaStreamSource(micStream)
      const tabSource = audioContext.createMediaStreamSource(tabStream)

      micSource.connect(destination)
      tabSource.connect(destination)

      console.log('🎵 Mixed audio stream created (microphone + tab audio)')
      return destination.stream

    } catch (error) {
      console.error('❌ Failed to create mixed audio stream, falling back to microphone:', error)
      return this.getAudioStream('microphone')
    }
  }

  /**
   * Set up audio analysis for level monitoring
   */
  setupAudioAnalysis(stream) {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)()
      this.analyser = this.audioContext.createAnalyser()
      this.analyser.fftSize = 256

      const source = this.audioContext.createMediaStreamSource(stream)
      source.connect(this.analyser)

      // Start level monitoring
      this.monitorAudioLevels()

    } catch (error) {
      console.warn('Failed to set up audio analysis:', error)
    }
  }

  /**
   * Monitor audio levels
   */
  monitorAudioLevels() {
    if (!this.analyser) return

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount)

    const updateLevels = () => {
      if (!this.isRecording) return

      this.analyser.getByteFrequencyData(dataArray)

      // Calculate RMS level
      let sum = 0
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] * dataArray[i]
      }
      const rms = Math.sqrt(sum / dataArray.length)
      const level = rms / 255 // Normalize to 0-1

      // Update levels based on source
      if (this.selectedSource === 'microphone') {
        this.audioLevels.microphone = level
        this.audioLevels.tabAudio = 0
      } else if (this.selectedSource === 'tabAudio') {
        this.audioLevels.microphone = 0
        this.audioLevels.tabAudio = level
      } else if (this.selectedSource === 'mixed') {
        // For mixed mode, show combined level
        this.audioLevels.microphone = level * 0.6 // Estimate mic portion
        this.audioLevels.tabAudio = level * 0.4   // Estimate tab portion
      }

      // Continue monitoring
      requestAnimationFrame(updateLevels)
    }

    updateLevels()
  }

  /**
   * Get supported MIME type for recording
   */
  getSupportedMimeType() {
    const possibleTypes = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/wav'
    ]

    for (const type of possibleTypes) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type
      }
    }

    return 'audio/webm' // Fallback
  }

  /**
   * Get current audio levels
   */
  getAudioLevels() {
    return { ...this.audioLevels }
  }

  /**
   * Check if recording is active
   */
  isRecordingActive() {
    return this.isRecording
  }

  /**
   * Get recording status
   */
  getStatus() {
    return {
      isRecording: this.isRecording,
      source: this.selectedSource,
      audioLevels: this.audioLevels,
      supportedMimeTypes: [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/wav'
      ].filter(type => MediaRecorder.isTypeSupported(type))
    }
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    console.log('🎵 Cleaning up audio buffer service...')

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop()
    }

    if (this.audioStream) {
      this.audioStream.getTracks().forEach(track => track.stop())
      this.audioStream = null
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(err => console.warn('Error closing audio context:', err))
    }

    this.mediaRecorder = null
    this.analyser = null
    this.audioContext = null
    this.recordedChunks = []
    this.isRecording = false
    this.audioLevels = { microphone: 0, tabAudio: 0 }

    console.log('✅ Audio buffer service cleaned up')
  }
}

// Export singleton instance
const audioBufferService = new AudioBufferService()
export default audioBufferService