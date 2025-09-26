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
    this.originalTabStream = null
    this.micStreamForMixed = null
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

      // Start recording with iOS Safari fix - research shows 500ms timing resolves transcription issues
      this.mediaRecorder.start(500) // iOS Safari fix: collect data every 500ms
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
    console.log(`🎵 Requesting audio stream for source: ${source}`)

    switch (source) {
      case 'microphone':
        const micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 16000 // Optimal for Moonshine
          }
        })
        console.log('🎤 Microphone stream obtained:', {
          audioTracks: micStream.getAudioTracks().length,
          trackSettings: micStream.getAudioTracks()[0]?.getSettings()
        })
        return micStream

      case 'tabAudio':
        // For tab audio, we need getDisplayMedia with video enabled (required for audio capture)
        const tabStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            mediaSource: 'tab', // Prefer tab sharing
            width: { ideal: 1 },  // Minimal video to reduce overhead
            height: { ideal: 1 },
            frameRate: { ideal: 1 }
          },
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            sampleRate: 16000,
            channelCount: 2, // Stereo capture
            suppressLocalAudioPlayback: false // Don't suppress local audio
          }
        })
        console.log('🖥️ Tab audio stream obtained:', {
          audioTracks: tabStream.getAudioTracks().length,
          videoTracks: tabStream.getVideoTracks().length,
          audioTrackSettings: tabStream.getAudioTracks()[0]?.getSettings(),
          videoTrackSettings: tabStream.getVideoTracks()[0]?.getSettings()
        })

        // Create audio-only stream for MediaRecorder compatibility
        const audioTracks = tabStream.getAudioTracks()
        if (audioTracks.length === 0) {
          throw new Error('No audio tracks found in tab stream')
        }

        const audioOnlyStream = new MediaStream(audioTracks)
        console.log('🎵 Created audio-only stream from tab:', {
          audioTracks: audioOnlyStream.getAudioTracks().length,
          trackSettings: audioOnlyStream.getAudioTracks()[0]?.getSettings()
        })

        // Store the original stream for cleanup
        this.originalTabStream = tabStream
        return audioOnlyStream

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
        video: {
          mediaSource: 'tab', // Prefer tab sharing
          width: { ideal: 1 },  // Minimal video to reduce overhead
          height: { ideal: 1 },
          frameRate: { ideal: 1 }
        },
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 16000,
          channelCount: 2, // Stereo capture
          suppressLocalAudioPlayback: false // Don't suppress local audio
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

      // Store original tab stream for cleanup (has both audio and video)
      this.originalTabStream = tabStream

      // Store microphone stream separately for cleanup
      this.micStreamForMixed = micStream

      console.log('🎵 Mixed audio stream created:', {
        micAudioTracks: micStream.getAudioTracks().length,
        tabAudioTracks: tabStream.getAudioTracks().length,
        tabVideoTracks: tabStream.getVideoTracks().length,
        mixedAudioTracks: destination.stream.getAudioTracks().length
      })
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
   * Get supported MIME type for recording with iOS compatibility
   */
  getSupportedMimeType() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
    const isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone

    console.log(`🎵 Testing audio formats for ${isIOS ? 'iOS' : 'other'} platform (PWA: ${isPWA}, Safari: ${isSafari}):`)

    // CRITICAL iOS Safari Fix: Force video/mp4 for iOS regardless of isTypeSupported()
    // Research shows iOS Safari MediaRecorder.isTypeSupported() can be unreliable
    // but video/mp4 actually works for audio recording on iOS Safari
    if (isIOS || isSafari) {
      console.log('🍎 iOS/Safari detected - forcing video/mp4 format for maximum compatibility')
      console.log(`🎵 Selected audio format: video/mp4 (iOS/Safari forced)`)
      return 'video/mp4'
    }

    // Enhanced format list for other browsers
    const possibleTypes = [
      'audio/webm;codecs=opus', // Best quality for Chrome/Firefox
      'audio/webm',            // Fallback for Chrome/Firefox
      'audio/mp4',             // Cross-browser compatibility
      'video/mp4',             // Also works for other browsers
      'audio/wav'              // Universal fallback
    ]

    for (const type of possibleTypes) {
      const isSupported = MediaRecorder.isTypeSupported(type)
      console.log(`  ${type}: ${isSupported ? '✅' : '❌'}`)
      if (isSupported) {
        console.log(`🎵 Selected audio format: ${type}`)
        return type
      }
    }

    // Last resort fallback
    const fallback = 'audio/webm'
    console.warn(`⚠️ No supported format found, using fallback: ${fallback}`)
    return fallback
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

    // Clean up original tab stream (contains both audio and video tracks)
    if (this.originalTabStream) {
      this.originalTabStream.getTracks().forEach(track => track.stop())
      this.originalTabStream = null
      console.log('🎵 Original tab stream cleaned up')
    }

    // Clean up microphone stream used in mixed mode
    if (this.micStreamForMixed) {
      this.micStreamForMixed.getTracks().forEach(track => track.stop())
      this.micStreamForMixed = null
      console.log('🎵 Mixed mode microphone stream cleaned up')
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