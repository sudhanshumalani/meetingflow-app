/**
 * AssemblyAI Transcription Service
 * Provides real-time streaming and pre-recorded audio transcription
 * Using AssemblyAI's WebSocket API for browser-based transcription
 */

class AssemblyAIService {
  constructor() {
    this.tokenUrl = import.meta.env.VITE_ASSEMBLYAI_TOKEN_URL
    this.apiKey = import.meta.env.VITE_ASSEMBLYAI_API_KEY

    // For backward compatibility (single connection mode)
    this.ws = null
    this.isStreaming = false
    this.audioContext = null
    this.processor = null
    this.source = null
    this.mediaRecorder = null
    this.recordedChunks = []

    // Track multiple concurrent connections (for hybrid mode)
    this.connections = new Map()

    // Reconnection tracking
    this.reconnectionEnabled = false
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 5
    this.reconnectDelay = 1000 // Start with 1 second
    this.reconnectTimeout = null
    this.lastAudioStream = null
    this.lastCallbacks = null
    this.lastTurnOrder = 0 // Track Turn sequence for gap detection

    // Keepalive for preventing idle disconnections
    this.keepaliveInterval = null
    this.lastActivityTime = Date.now()
    this.KEEPALIVE_INTERVAL = 30000 // Send keepalive every 30 seconds
    this.INACTIVITY_TIMEOUT = 180000 // Warn if no activity for 3 minutes

    console.log('🎯 AssemblyAI Service initialized')
  }

  /**
   * Create a new independent connection instance
   * This allows multiple concurrent streaming connections without interference
   */
  createIndependentConnection() {
    const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const connection = {
      id: connectionId,
      ws: null,
      audioContext: null,
      processor: null,
      source: null,
      isStreaming: false,
      audioBuffer: null,
      audioBufferIndex: 0,
      keepaliveInterval: null, // Keepalive timer
      lastActivityTime: Date.now() // Track last activity
    }
    this.connections.set(connectionId, connection)
    console.log(`🆕 Created independent connection: ${connectionId}`)
    return connectionId
  }

  /**
   * Get connection by ID
   */
  getConnection(connectionId) {
    return this.connections.get(connectionId)
  }

  /**
   * Remove connection from tracking
   */
  removeConnection(connectionId) {
    this.connections.delete(connectionId)
    console.log(`🗑️ Removed connection: ${connectionId}`)
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
   * Start real-time streaming with independent connection (for hybrid mode)
   * @param {string} connectionId - Connection ID from createIndependentConnection()
   * @param {MediaStream} audioStream - Audio stream
   * @param {Object} callbacks - { onTranscript, onError, onClose }
   */
  async startRealtimeTranscriptionWithConnection(connectionId, audioStream, callbacks = {}) {
    if (!this.isConfigured()) {
      const error = new Error('AssemblyAI API key not configured')
      if (callbacks.onError) callbacks.onError(error)
      throw error
    }

    const conn = this.getConnection(connectionId)
    if (!conn) {
      throw new Error(`Connection ${connectionId} not found`)
    }

    const { onTranscript, onError, onClose } = callbacks

    try {
      console.log(`🎙️ AssemblyAI [${connectionId}]: Starting real-time transcription...`)

      // Step 1: Get authentication token
      const auth = await this.getAuthToken()
      const token = auth.token

      // Step 2: Connect to WebSocket (v3 Universal Streaming)
      const sampleRate = 16000
      conn.ws = new WebSocket(
        `wss://streaming.assemblyai.com/v3/ws?sample_rate=${sampleRate}&token=${token}`
      )

      // Step 3: Set up WebSocket event handlers
      conn.ws.onopen = () => {
        console.log(`🔌 AssemblyAI [${connectionId}]: WebSocket connected`)
        conn.isStreaming = true
        conn.lastActivityTime = Date.now()

        // Start keepalive to prevent idle disconnections
        this.startKeepalive(connectionId)
      }

      conn.ws.onmessage = (message) => {
        const data = JSON.parse(message.data)
        console.log(`📩 AssemblyAI [${connectionId}] message:`, data.type)

        // Update last activity time on any message
        conn.lastActivityTime = Date.now()

        if (data.type === 'Begin') {
          console.log(`🎬 AssemblyAI [${connectionId}]: Session started:`, data.id, 'expires:', data.expires_at)
        } else if (data.type === 'Turn') {
          const isFinal = data.end_of_turn === true
          const text = data.transcript || ''

          if (text) {
            console.log(`📝 AssemblyAI [${connectionId}] Turn #${data.turn_order}:`, {
              text: text.substring(0, 50),
              isFinal,
              confidence: data.end_of_turn_confidence
            })
            if (onTranscript) {
              onTranscript(text, isFinal)
            }
          }
        } else if (data.type === 'Termination') {
          console.log(`🛑 AssemblyAI [${connectionId}]: Session terminated:`, data.reason || 'normal')
        }
      }

      conn.ws.onerror = (error) => {
        console.error(`❌ AssemblyAI [${connectionId}] WebSocket error:`, error)
        if (onError) {
          onError(new Error('WebSocket connection error'))
        }
      }

      conn.ws.onclose = (event) => {
        console.log(`🔌 AssemblyAI [${connectionId}]: WebSocket closed`, {
          code: event.code,
          reason: event.reason || 'No reason provided',
          wasClean: event.wasClean
        })
        conn.isStreaming = false
        if (onClose) onClose()
        this.cleanupConnection(connectionId)
      }

      // Step 4: Set up audio processing
      await this.setupAudioProcessingForConnection(connectionId, audioStream, sampleRate)

      console.log(`✅ AssemblyAI [${connectionId}]: Real-time transcription started`)

      // Return connection ID for cleanup
      return connectionId
    } catch (error) {
      console.error(`❌ AssemblyAI [${connectionId}]: Failed to start:`, error)
      this.cleanupConnection(connectionId)
      if (onError) onError(error)
      throw error
    }
  }

  /**
   * Set up audio processing for a specific connection
   */
  async setupAudioProcessingForConnection(connectionId, stream, targetSampleRate) {
    const conn = this.getConnection(connectionId)
    if (!conn) throw new Error(`Connection ${connectionId} not found`)

    try {
      // Create audio context with target sample rate
      conn.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: targetSampleRate
      })

      conn.source = conn.audioContext.createMediaStreamSource(stream)

      // Try to use AudioWorklet (modern approach)
      try {
        await conn.audioContext.audioWorklet.addModule('/meetingflow-app/audio-processor.js')

        conn.processor = new AudioWorkletNode(conn.audioContext, 'audio-stream-processor')

        // Listen for audio data from the worklet
        conn.processor.port.onmessage = (event) => {
          if (event.data.type === 'audio' && conn.ws && conn.ws.readyState === WebSocket.OPEN) {
            const int16Data = event.data.data
            conn.ws.send(int16Data.buffer)
          }
        }

        conn.source.connect(conn.processor)
        conn.processor.connect(conn.audioContext.destination)

        console.log(`✅ [${connectionId}] Audio processing pipeline set up (AudioWorklet)`)
      } catch (workletError) {
        // Fallback to ScriptProcessorNode
        console.warn(`⚠️ [${connectionId}] AudioWorklet not available, using ScriptProcessorNode`)

        const bufferSize = 4096
        conn.processor = conn.audioContext.createScriptProcessor(bufferSize, 1, 1)

        // Buffer for accumulating audio chunks
        conn.audioBuffer = new Float32Array(1600)
        conn.audioBufferIndex = 0

        conn.processor.onaudioprocess = (e) => {
          if (conn.ws && conn.ws.readyState === WebSocket.OPEN) {
            const audioData = e.inputBuffer.getChannelData(0)

            for (let i = 0; i < audioData.length; i++) {
              conn.audioBuffer[conn.audioBufferIndex++] = audioData[i]

              if (conn.audioBufferIndex >= conn.audioBuffer.length) {
                const int16Data = this.float32ToInt16(conn.audioBuffer.slice(0, conn.audioBufferIndex))
                conn.ws.send(int16Data.buffer)
                conn.audioBufferIndex = 0
              }
            }
          }
        }

        conn.source.connect(conn.processor)
        conn.processor.connect(conn.audioContext.destination)

        console.log(`✅ [${connectionId}] Audio processing pipeline set up (ScriptProcessorNode)`)
      }
    } catch (error) {
      console.error(`❌ [${connectionId}] Failed to set up audio processing:`, error)
      throw error
    }
  }

  /**
   * Stop a specific connection
   */
  stopConnection(connectionId) {
    const conn = this.getConnection(connectionId)
    if (!conn) return

    console.log(`🛑 [${connectionId}] Stopping connection...`)

    if (conn.ws && conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(JSON.stringify({ terminate_session: true }))
      setTimeout(() => {
        if (conn.ws) conn.ws.close()
      }, 100)
    }

    this.cleanupConnection(connectionId)
  }

  /**
   * Cleanup a specific connection
   */
  cleanupConnection(connectionId) {
    const conn = this.getConnection(connectionId)
    if (!conn) return

    console.log(`🧹 [${connectionId}] Cleaning up resources...`)

    // Stop keepalive for this connection
    this.stopKeepalive(connectionId)

    if (conn.processor) {
      conn.processor.disconnect()
      conn.processor = null
    }

    if (conn.source) {
      conn.source.disconnect()
      conn.source = null
    }

    if (conn.audioContext && conn.audioContext.state !== 'closed') {
      conn.audioContext.close()
      conn.audioContext = null
    }

    if (conn.ws) {
      conn.ws = null
    }

    conn.isStreaming = false
    this.removeConnection(connectionId)
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

    // Save for reconnection
    this.lastAudioStream = audioStream
    this.lastCallbacks = callbacks

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
        this.lastActivityTime = Date.now()

        // Start keepalive to prevent idle disconnections
        this.startKeepalive()
      }

      this.ws.onmessage = (message) => {
        const data = JSON.parse(message.data)
        console.log('📩 AssemblyAI message:', data.type, data)

        // Update last activity time on any message
        this.lastActivityTime = Date.now()

        if (data.type === 'Begin') {
          console.log('🎬 AssemblyAI: Session started:', data.id, 'expires:', data.expires_at)
          this.reconnectionEnabled = true // Enable reconnection after successful connection
        } else if (data.type === 'Turn') {
          // v3 Universal Streaming: All transcripts come as "Turn" messages
          const isFinal = data.end_of_turn === true
          const text = data.transcript || ''

          // Track Turn sequence for gap detection
          if (data.turn_order > this.lastTurnOrder) {
            this.lastTurnOrder = data.turn_order
          }

          if (text) {
            console.log(`📝 AssemblyAI Turn #${data.turn_order}:`, {
              text: text.substring(0, 50),
              isFinal,
              confidence: data.end_of_turn_confidence
            })
            if (onTranscript) {
              onTranscript(text, isFinal, data.turn_order)
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

        // Attempt reconnection if enabled and close was unexpected
        if (this.reconnectionEnabled && !event.wasClean && this.reconnectAttempts < this.maxReconnectAttempts) {
          console.warn(`⚠️ Unexpected disconnect. Attempting reconnection (${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})...`)
          this.attemptReconnect(audioStream, callbacks)
        } else {
          // Normal close or max retries reached
          if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('❌ Max reconnection attempts reached. Giving up.')
            if (onError) onError(new Error('Max reconnection attempts reached'))
          }
          this.reconnectionEnabled = false
          if (onClose) onClose()
          this.cleanup()
        }
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

        // Buffer for accumulating audio chunks (100ms = 1600 samples at 16kHz)
        this.audioBuffer = new Float32Array(1600)
        this.audioBufferIndex = 0

        this.processor.onaudioprocess = (e) => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const audioData = e.inputBuffer.getChannelData(0)

            // Add to buffer
            for (let i = 0; i < audioData.length; i++) {
              this.audioBuffer[this.audioBufferIndex++] = audioData[i]

              // When buffer is full, send it
              if (this.audioBufferIndex >= this.audioBuffer.length) {
                const int16Data = this.float32ToInt16(this.audioBuffer.slice(0, this.audioBufferIndex))
                this.ws.send(int16Data.buffer)
                this.audioBufferIndex = 0
              }
            }
          }
        }

        this.source.connect(this.processor)
        this.processor.connect(this.audioContext.destination)

        console.log('✅ Audio processing pipeline set up (ScriptProcessorNode fallback, 100ms chunks)')
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

    // Disable reconnection before intentional stop
    this.disableReconnection()

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
   * Attempt to reconnect WebSocket with exponential backoff
   * @param {MediaStream} audioStream
   * @param {Object} callbacks
   */
  async attemptReconnect(audioStream, callbacks) {
    this.reconnectAttempts++

    // Calculate delay with exponential backoff (max 30 seconds)
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      30000
    )

    console.log(`🔄 Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`)

    // Clear any existing reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
    }

    this.reconnectTimeout = setTimeout(async () => {
      try {
        console.log('🔄 Attempting to reconnect WebSocket...')

        // Cleanup old connection first (but keep audioStream reference)
        if (this.processor) {
          this.processor.disconnect()
          this.processor = null
        }
        if (this.source) {
          this.source.disconnect()
          this.source = null
        }
        if (this.audioContext && this.audioContext.state !== 'closed') {
          await this.audioContext.close()
          this.audioContext = null
        }
        if (this.ws) {
          this.ws = null
        }

        // Attempt reconnection
        await this.startRealtimeTranscription(audioStream, callbacks)

        // Success - reset reconnection state
        this.reconnectAttempts = 0
        console.log('✅ Reconnection successful!')
      } catch (error) {
        console.error('❌ Reconnection failed:', error)

        // If we haven't exceeded max attempts, the onclose handler will trigger another attempt
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          console.error('❌ Max reconnection attempts reached')
          this.reconnectionEnabled = false
          if (callbacks.onError) {
            callbacks.onError(new Error('Failed to reconnect after maximum attempts'))
          }
        }
      }
    }, delay)
  }

  /**
   * Disable reconnection (call this before intentional stop)
   */
  disableReconnection() {
    this.reconnectionEnabled = false
    this.reconnectAttempts = 0
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    console.log('🧹 AssemblyAI: Cleaning up resources...')

    // Stop keepalive timer
    this.stopKeepalive()

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
   * Start keepalive mechanism to prevent idle disconnections
   * Sends periodic empty audio frames to keep WebSocket alive
   * @param {string} connectionId - Optional connection ID for multi-connection mode
   */
  startKeepalive(connectionId = null) {
    const conn = connectionId ? this.getConnection(connectionId) : this

    if (!conn) {
      console.warn('⚠️ Cannot start keepalive: connection not found')
      return
    }

    // Stop any existing keepalive
    this.stopKeepalive(connectionId)

    console.log(`💓 Starting keepalive ${connectionId ? `[${connectionId}]` : ''}`)

    const interval = setInterval(() => {
      const ws = conn.ws
      const lastActivity = conn.lastActivityTime
      const timeSinceActivity = Date.now() - lastActivity

      if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.warn(`⚠️ Keepalive ${connectionId ? `[${connectionId}]` : ''}: WebSocket not open, stopping keepalive`)
        this.stopKeepalive(connectionId)
        return
      }

      // Warn if no activity for a long time
      if (timeSinceActivity > this.INACTIVITY_TIMEOUT) {
        console.warn(`⚠️ Keepalive ${connectionId ? `[${connectionId}]` : ''}: No activity for ${Math.round(timeSinceActivity / 1000)}s`)
      }

      // Send empty audio frame as keepalive
      // Note: AssemblyAI expects audio data, so we send a minimal silent frame
      try {
        const silentFrame = new Int16Array(160) // 10ms of silence at 16kHz
        ws.send(silentFrame.buffer)
        console.log(`💓 Keepalive ${connectionId ? `[${connectionId}]` : ''}: Sent silent frame (${Math.round(timeSinceActivity / 1000)}s since last activity)`)
      } catch (error) {
        console.error(`❌ Keepalive ${connectionId ? `[${connectionId}]` : ''}: Failed to send frame:`, error)
        this.stopKeepalive(connectionId)
      }
    }, this.KEEPALIVE_INTERVAL)

    if (connectionId) {
      conn.keepaliveInterval = interval
    } else {
      this.keepaliveInterval = interval
    }
  }

  /**
   * Stop keepalive mechanism
   * @param {string} connectionId - Optional connection ID for multi-connection mode
   */
  stopKeepalive(connectionId = null) {
    const conn = connectionId ? this.getConnection(connectionId) : this

    if (!conn) return

    if (conn.keepaliveInterval) {
      clearInterval(conn.keepaliveInterval)
      conn.keepaliveInterval = null
      console.log(`💔 Stopped keepalive ${connectionId ? `[${connectionId}]` : ''}`)
    }
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
