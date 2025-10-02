/**
 * AssemblyAI Transcription Service
 * Provides real-time streaming and pre-recorded audio transcription
 * Using AssemblyAI's WebSocket API for browser-based transcription
 */

class AssemblyAIService {
  constructor() {
    this.tokenUrl = import.meta.env.VITE_ASSEMBLYAI_TOKEN_URL
    this.apiKey = import.meta.env.VITE_ASSEMBLYAI_API_KEY
    this.ws = null
    this.isStreaming = false
    this.audioContext = null
    this.processor = null
    this.source = null
    this.mediaRecorder = null
    this.recordedChunks = []

    console.log('🎯 AssemblyAI Service initialized')
  }

  /**
   * Check if token URL or API key is configured
   */
  isConfigured() {
    const tokenConfigured = this.tokenUrl && this.tokenUrl !== 'your_token_url_here'
    const apiKeyConfigured = this.apiKey && this.apiKey !== 'your_api_key_here' && this.apiKey !== 'your_production_api_key_here'

    const configured = tokenConfigured || apiKeyConfigured

    if (!configured) {
      console.error('❌ AssemblyAI not configured. Please add VITE_ASSEMBLYAI_TOKEN_URL (recommended) or VITE_ASSEMBLYAI_API_KEY to your .env file')
    }

    if (apiKeyConfigured && !tokenConfigured) {
      console.warn('⚠️ Using API key directly (not recommended for production). Deploy Cloudflare Worker for better security.')
    }

    return configured
  }

  /**
   * Get authentication token (either from Cloudflare Worker or API key)
   */
  async getAuthToken() {
    // Preferred: Get temporary token from Cloudflare Worker
    if (this.tokenUrl && this.tokenUrl !== 'your_token_url_here') {
      try {
        console.log('🔐 Fetching temporary token from Cloudflare Worker...')
        const response = await fetch(this.tokenUrl)

        if (!response.ok) {
          throw new Error(`Token endpoint returned ${response.status}: ${response.statusText}`)
        }

        const data = await response.json()
        console.log('✅ Got temporary token from Cloudflare Worker')
        return { token: data.token, isTemporary: true }
      } catch (error) {
        console.error('❌ Failed to get token from Cloudflare Worker:', error)

        // Fallback to API key if available
        if (this.apiKey && this.apiKey !== 'your_api_key_here') {
          console.warn('⚠️ Falling back to direct API key (not recommended)')
          return { apiKey: this.apiKey, isTemporary: false }
        }

        throw new Error('Failed to get authentication token and no API key fallback available')
      }
    }

    // Fallback: Use API key directly (generates token on-the-fly)
    if (this.apiKey && this.apiKey !== 'your_api_key_here') {
      console.log('🔑 Using API key to generate token...')
      const response = await fetch('https://streaming.assemblyai.com/v3/token?expires_in_seconds=600', {
        method: 'GET',
        headers: { Authorization: this.apiKey }
      })

      if (!response.ok) {
        throw new Error(`Failed to get auth token: ${response.statusText}`)
      }

      const data = await response.json()
      console.log('✅ Generated token from API key')
      return { token: data.token, isTemporary: true }
    }

    throw new Error('No authentication method configured')
  }

  /**
   * Start real-time streaming transcription (for microphone)
   * @param {MediaStream} audioStream - Audio stream from getUserMedia
   * @param {Object} callbacks - { onTranscript, onError, onClose }
   */
  async startRealtimeTranscription(audioStream, callbacks = {}) {
    if (!this.isConfigured()) {
      const error = new Error('AssemblyAI API key not configured')
      if (callbacks.onError) callbacks.onError(error)
      throw error
    }

    const { onTranscript, onError, onClose } = callbacks

    try {
      console.log('🎙️ AssemblyAI: Starting real-time transcription...')

      // Step 1: Get authentication token
      const auth = await this.getAuthToken()
      const token = auth.token

      // Step 2: Connect to WebSocket (v3 Universal Streaming)
      const sampleRate = 16000
      this.ws = new WebSocket(
        `wss://streaming.assemblyai.com/v3/ws?sample_rate=${sampleRate}&token=${token}`
      )

      // Step 3: Set up WebSocket event handlers
      this.ws.onopen = () => {
        console.log('🔌 AssemblyAI: WebSocket connected')
        this.isStreaming = true
      }

      this.ws.onmessage = (message) => {
        const data = JSON.parse(message.data)
        console.log('📩 AssemblyAI message:', data.type, data)

        if (data.type === 'Begin') {
          console.log('🎬 AssemblyAI: Session started:', data.id, 'expires:', data.expires_at)
        } else if (data.type === 'Turn') {
          // v3 Universal Streaming: All transcripts come as "Turn" messages
          const isFinal = data.end_of_turn === true
          const text = data.transcript || ''

          if (text) {
            console.log(`📝 AssemblyAI Turn #${data.turn_order}:`, {
              text: text.substring(0, 50),
              isFinal,
              confidence: data.end_of_turn_confidence
            })
            if (onTranscript) {
              onTranscript(text, isFinal)
            }
          }
        } else if (data.type === 'Termination') {
          console.log('🛑 AssemblyAI: Session terminated:', data.reason || 'normal')
        } else {
          console.warn('⚠️ Unknown AssemblyAI message type:', data.type, data)
        }
      }

      this.ws.onerror = (error) => {
        console.error('❌ AssemblyAI WebSocket error:', error)
        if (onError) {
          onError(new Error('WebSocket connection error'))
        }
      }

      this.ws.onclose = (event) => {
        console.log('🔌 AssemblyAI: WebSocket closed', {
          code: event.code,
          reason: event.reason || 'No reason provided',
          wasClean: event.wasClean
        })
        this.isStreaming = false
        if (onClose) onClose()
        this.cleanup()
      }

      // Step 4: Set up audio processing
      await this.setupAudioProcessing(audioStream, sampleRate)

      console.log('✅ AssemblyAI: Real-time transcription started')
    } catch (error) {
      console.error('❌ AssemblyAI: Failed to start real-time transcription:', error)
      this.cleanup()
      if (onError) onError(error)
      throw error
    }
  }

  /**
   * Set up audio processing to send to WebSocket
   * Uses AudioWorklet for optimal performance (off main thread)
   */
  async setupAudioProcessing(stream, targetSampleRate) {
    try {
      // Create audio context with target sample rate
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: targetSampleRate
      })

      this.source = this.audioContext.createMediaStreamSource(stream)

      // Try to use AudioWorklet (modern approach)
      try {
        await this.audioContext.audioWorklet.addModule('/meetingflow-app/audio-processor.js')

        this.processor = new AudioWorkletNode(this.audioContext, 'audio-stream-processor')

        // Listen for audio data from the worklet
        this.processor.port.onmessage = (event) => {
          if (event.data.type === 'audio' && this.ws && this.ws.readyState === WebSocket.OPEN) {
            const int16Data = event.data.data
            // Send to AssemblyAI
            this.ws.send(int16Data.buffer)
          }
        }

        this.source.connect(this.processor)
        this.processor.connect(this.audioContext.destination)

        console.log('✅ Audio processing pipeline set up (AudioWorklet)')
      } catch (workletError) {
        // Fallback to ScriptProcessorNode for older browsers
        console.warn('⚠️ AudioWorklet not available, using ScriptProcessorNode fallback')

        const bufferSize = 4096
        this.processor = this.audioContext.createScriptProcessor(bufferSize, 1, 1)

        this.processor.onaudioprocess = (e) => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const audioData = e.inputBuffer.getChannelData(0)
            const int16Data = this.float32ToInt16(audioData)

            // Send to AssemblyAI
            this.ws.send(int16Data)
          }
        }

        this.source.connect(this.processor)
        this.processor.connect(this.audioContext.destination)

        console.log('✅ Audio processing pipeline set up (ScriptProcessorNode fallback)')
      }
    } catch (error) {
      console.error('❌ Failed to set up audio processing:', error)
      throw error
    }
  }

  /**
   * Convert Float32Array to Int16Array (required by AssemblyAI)
   */
  float32ToInt16(float32Array) {
    const int16Array = new Int16Array(float32Array.length)
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]))
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
    }
    return int16Array.buffer
  }

  /**
   * Stop real-time transcription
   */
  stopRealtimeTranscription() {
    console.log('🛑 AssemblyAI: Stopping real-time transcription...')

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // Send terminate message
      this.ws.send(JSON.stringify({ terminate_session: true }))

      // Close after a short delay to allow message to send
      setTimeout(() => {
        if (this.ws) {
          this.ws.close()
        }
      }, 100)
    }

    this.cleanup()
  }

  /**
   * Start real-time streaming for tab audio
   * Same as startRealtimeTranscription but explicitly for tab audio use case
   * @param {MediaStream} audioStream - Display audio stream from getDisplayMedia
   * @param {Object} callbacks - { onTranscript, onError, onClose }
   */
  async startTabAudioStreaming(audioStream, callbacks = {}) {
    console.log('🖥️ AssemblyAI: Starting tab audio streaming...')
    // Use the same real-time transcription method
    return this.startRealtimeTranscription(audioStream, callbacks)
  }

  /**
   * Transcribe pre-recorded audio (LEGACY - for backwards compatibility)
   * @param {Blob} audioBlob - Recorded audio blob
   * @param {Function} onProgress - Progress callback (optional)
   * @returns {Promise<string>} - Transcription text
   */
  async transcribeAudioFile(audioBlob, onProgress = null) {
    if (!this.isConfigured()) {
      throw new Error('AssemblyAI API key not configured')
    }

    try {
      console.log('📤 AssemblyAI: Uploading audio file...', {
        size: `${(audioBlob.size / 1024 / 1024).toFixed(2)} MB`,
        type: audioBlob.type
      })

      if (onProgress) onProgress({ stage: 'uploading', progress: 0 })

      // Step 1: Get API key for upload (tokens don't work for upload endpoint)
      let apiKey = this.apiKey
      if (!apiKey || apiKey === 'your_api_key_here') {
        throw new Error('API key required for file upload. Please add VITE_ASSEMBLYAI_API_KEY to your .env file')
      }

      // Step 2: Upload audio file
      const uploadResponse = await fetch('https://api.assemblyai.com/v2/upload', {
        method: 'POST',
        headers: {
          authorization: apiKey
        },
        body: audioBlob
      })

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed: ${uploadResponse.statusText}`)
      }

      const { upload_url } = await uploadResponse.json()
      console.log('✅ AssemblyAI: Audio uploaded:', upload_url)

      if (onProgress) onProgress({ stage: 'uploaded', progress: 33 })

      // Step 3: Request transcription
      console.log('🎯 AssemblyAI: Requesting transcription...')
      const transcriptResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
        method: 'POST',
        headers: {
          authorization: apiKey,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          audio_url: upload_url,
          language_code: 'en' // Can be made configurable
        })
      })

      if (!transcriptResponse.ok) {
        throw new Error(`Transcription request failed: ${transcriptResponse.statusText}`)
      }

      const { id } = await transcriptResponse.json()
      console.log('✅ AssemblyAI: Transcription job created:', id)

      if (onProgress) onProgress({ stage: 'processing', progress: 50 })

      // Step 3: Poll for result
      const transcript = await this.pollTranscript(id, onProgress)

      console.log('✅ AssemblyAI: Transcription completed:', {
        length: transcript.length,
        words: transcript.split(' ').length
      })

      if (onProgress) onProgress({ stage: 'completed', progress: 100 })

      return transcript
    } catch (error) {
      console.error('❌ AssemblyAI: Transcription failed:', error)
      if (onProgress) onProgress({ stage: 'error', progress: 0, error: error.message })
      throw error
    }
  }

  /**
   * Poll for transcription result
   */
  async pollTranscript(id, onProgress = null) {
    const maxAttempts = 120 // 2 minutes max (120 * 1 second)
    let attempts = 0

    while (attempts < maxAttempts) {
      attempts++

      // Use API key for polling (required for REST API)
      let apiKey = this.apiKey
      if (!apiKey || apiKey === 'your_api_key_here') {
        throw new Error('API key required for transcript polling')
      }

      const response = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
        headers: { authorization: apiKey }
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch transcript: ${response.statusText}`)
      }

      const transcript = await response.json()

      if (transcript.status === 'completed') {
        return transcript.text
      } else if (transcript.status === 'error') {
        throw new Error(transcript.error || 'Transcription failed')
      }

      // Update progress
      if (onProgress && transcript.status === 'processing') {
        const progress = 50 + Math.min(45, attempts * 0.5) // 50-95%
        onProgress({ stage: 'processing', progress })
      }

      // Wait 1 second before next poll
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    throw new Error('Transcription timed out')
  }

  /**
   * Record audio stream to blob (for tab audio capture)
   */
  async recordAudioToBlob(stream, onDataAvailable = null) {
    return new Promise((resolve, reject) => {
      try {
        this.recordedChunks = []

        // Use webm codec if available, fallback to default
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm'

        this.mediaRecorder = new MediaRecorder(stream, {
          mimeType,
          audioBitsPerSecond: 128000
        })

        this.mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            this.recordedChunks.push(event.data)
            console.log(`📦 Recorded chunk: ${(event.data.size / 1024).toFixed(2)} KB`)
            if (onDataAvailable) onDataAvailable(event.data)
          }
        }

        this.mediaRecorder.onstop = () => {
          const blob = new Blob(this.recordedChunks, { type: mimeType })
          console.log(`✅ Recording stopped. Total size: ${(blob.size / 1024 / 1024).toFixed(2)} MB`)
          resolve(blob)
        }

        this.mediaRecorder.onerror = (error) => {
          console.error('❌ MediaRecorder error:', error)
          reject(error)
        }

        this.mediaRecorder.start(1000) // Collect data every second
        console.log('🎙️ Recording started')
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * Stop recording audio to blob
   */
  stopRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop()
    }
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    console.log('🧹 AssemblyAI: Cleaning up resources...')

    if (this.processor) {
      this.processor.disconnect()
      this.processor = null
    }

    if (this.source) {
      this.source.disconnect()
      this.source = null
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close()
      this.audioContext = null
    }

    if (this.ws) {
      this.ws = null
    }

    this.isStreaming = false
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      configured: this.isConfigured(),
      streaming: this.isStreaming,
      recording: this.mediaRecorder && this.mediaRecorder.state === 'recording'
    }
  }
}

// Export singleton instance
const assemblyAIService = new AssemblyAIService()
export default assemblyAIService
