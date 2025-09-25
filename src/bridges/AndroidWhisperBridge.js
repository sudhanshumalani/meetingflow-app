/**
 * Android Whisper Bridge
 * Interfaces with native Android Whisper.cpp implementation via JNI bridge
 * Uses quantized models and optimized processing for Android devices
 */

class AndroidWhisperBridge {
  constructor() {
    this.isInitialized = false
    this.isLoading = false
    this.modelType = 'base-q8' // Quantized int8 model
    this.messageQueue = new Map()
    this.messageId = 0
    this.audioChunkSize = 1024 * 16 // 16KB chunks for memory efficiency
  }

  /**
   * Initialize the Android native Whisper bridge
   */
  async initialize(progressCallback = null) {
    if (this.isInitialized || this.isLoading) {
      return this.isInitialized
    }

    try {
      this.isLoading = true
      console.log('🤖 Initializing Android Whisper.cpp bridge...')

      if (progressCallback) {
        progressCallback({ stage: 'checking_android_bridge', progress: 10 })
      }

      // Check if native Android bridge is available
      if (!this.isAndroidBridgeAvailable()) {
        throw new Error('Android native bridge not available')
      }

      if (progressCallback) {
        progressCallback({ stage: 'loading_quantized_model', progress: 30 })
      }

      // Get device specifications for optimization
      const deviceSpecs = await this.getDeviceSpecs()
      console.log('📱 Android device specs:', deviceSpecs)

      // Initialize native Whisper with device-optimized settings
      const initResult = await this.callAndroidNative({
        action: 'initialize',
        modelType: this.modelType,
        config: {
          language: 'en',
          quantized: true,
          useGPU: deviceSpecs.hasGPU,
          numThreads: Math.min(deviceSpecs.cores, 4), // Limit threads
          maxMemory: Math.min(deviceSpecs.ramGB * 256, 1024), // Conservative memory limit
          enableBatteryOptimization: true
        }
      })

      if (!initResult.success) {
        throw new Error(`Android native initialization failed: ${initResult.error}`)
      }

      if (progressCallback) {
        progressCallback({ stage: 'ready', progress: 100 })
      }

      this.isInitialized = true
      this.isLoading = false

      console.log('✅ Android Whisper.cpp bridge initialized')
      return true

    } catch (error) {
      this.isLoading = false
      console.error('❌ Android bridge initialization failed:', error)
      throw error
    }
  }

  /**
   * Transcribe audio using native Android Whisper.cpp with chunking
   */
  async transcribe(audioData, options = {}) {
    if (!this.isInitialized) {
      throw new Error('Android bridge not initialized')
    }

    try {
      console.log('🎯 Starting Android native Whisper transcription...')

      const {
        language = 'en',
        progressCallback = null,
        enableBatteryOptimization = true,
        useAudioChunking = true
      } = options

      if (progressCallback) {
        progressCallback({ stage: 'checking_battery_mobile', progress: 5 })
      }

      // Monitor battery and thermal state
      const powerState = await this.checkPowerState()
      if (powerState.shouldThrottle && enableBatteryOptimization) {
        console.log('⚠️ Device throttling detected, using efficient processing')
      }

      if (progressCallback) {
        progressCallback({ stage: 'preprocessing_android', progress: 10 })
      }

      // Prepare audio for native processing
      const processedAudio = await this.prepareAudioForAndroid(audioData)

      let transcriptionResult

      if (useAudioChunking && processedAudio.size > this.audioChunkSize) {
        // Process in chunks for memory efficiency
        transcriptionResult = await this.transcribeWithChunking(
          processedAudio,
          { language, powerState, progressCallback }
        )
      } else {
        // Process entire audio at once
        transcriptionResult = await this.transcribeComplete(
          processedAudio,
          { language, powerState, progressCallback }
        )
      }

      if (!transcriptionResult.success) {
        throw new Error(transcriptionResult.error)
      }

      console.log('✅ Android native transcription completed')

      return {
        success: true,
        text: transcriptionResult.text,
        segments: transcriptionResult.segments || [],
        duration: transcriptionResult.duration || 0,
        timestamp: new Date().toISOString(),
        engine: 'whisper.cpp-android-jni',
        processingMethod: useAudioChunking ? 'chunked' : 'complete'
      }

    } catch (error) {
      console.error('❌ Android native transcription failed:', error)
      return {
        success: false,
        error: error.message,
        text: '',
        timestamp: new Date().toISOString()
      }
    }
  }

  /**
   * Transcribe audio using chunking for memory efficiency
   */
  async transcribeWithChunking(audioData, options) {
    const { progressCallback } = options
    const chunks = await this.chunkAudioData(audioData)
    const results = []

    console.log(`🔄 Processing ${chunks.length} audio chunks`)

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]

      if (progressCallback) {
        const progress = 20 + ((i / chunks.length) * 70)
        progressCallback({
          stage: 'processing_chunk',
          progress,
          chunkIndex: i + 1,
          totalChunks: chunks.length
        })
      }

      const chunkResult = await this.callAndroidNative({
        action: 'transcribeChunk',
        audioChunk: chunk,
        chunkIndex: i,
        isLastChunk: i === chunks.length - 1,
        options
      })

      if (chunkResult.success) {
        results.push(chunkResult)
      } else {
        console.warn(`Chunk ${i} failed:`, chunkResult.error)
      }
    }

    // Combine results
    const combinedText = results.map(r => r.text).join(' ').trim()
    const combinedSegments = results.flatMap(r => r.segments || [])

    return {
      success: true,
      text: combinedText,
      segments: combinedSegments,
      duration: results.reduce((sum, r) => sum + (r.duration || 0), 0)
    }
  }

  /**
   * Transcribe complete audio without chunking
   */
  async transcribeComplete(audioData, options) {
    const { progressCallback } = options

    if (progressCallback) {
      progressCallback({ stage: 'transcribing_complete', progress: 30 })
    }

    return await this.callAndroidNative({
      action: 'transcribeComplete',
      audioData,
      options,
      progressCallback: true
    })
  }

  /**
   * Check if Android native bridge is available
   */
  isAndroidBridgeAvailable() {
    // Check for Android WebView interface
    return (
      typeof Android !== 'undefined' &&
      Android.whisperBridge &&
      typeof Android.whisperBridge.processMessage === 'function'
    )
  }

  /**
   * Call native Android code via JNI bridge
   */
  async callAndroidNative(message) {
    const messageId = `android_msg_${++this.messageId}`
    const fullMessage = { ...message, messageId }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.messageQueue.delete(messageId)
        reject(new Error('Android native bridge timeout'))
      }, 60000) // 60 second timeout for heavy processing

      this.messageQueue.set(messageId, { resolve, reject, timeout })

      try {
        // Call native Android method via JNI
        const responseJson = Android.whisperBridge.processMessage(
          JSON.stringify(fullMessage)
        )

        // Handle synchronous response
        const response = JSON.parse(responseJson)

        clearTimeout(timeout)
        this.messageQueue.delete(messageId)

        resolve(response)
      } catch (error) {
        clearTimeout(timeout)
        this.messageQueue.delete(messageId)
        reject(error)
      }
    })
  }

  /**
   * Get Android device specifications
   */
  async getDeviceSpecs() {
    try {
      if (this.isAndroidBridgeAvailable()) {
        const specs = await this.callAndroidNative({
          action: 'getDeviceSpecs'
        })
        return specs.deviceInfo
      }

      // Fallback estimation
      return {
        cores: navigator.hardwareConcurrency || 4,
        ramGB: this.estimateRAM(),
        hasGPU: this.checkGPUSupport(),
        apiLevel: 28 // Default assumption
      }
    } catch (error) {
      console.warn('Could not get device specs:', error)
      return {
        cores: 4,
        ramGB: 2,
        hasGPU: false,
        apiLevel: 28
      }
    }
  }

  /**
   * Check power and thermal state for optimization
   */
  async checkPowerState() {
    try {
      if (this.isAndroidBridgeAvailable()) {
        const powerResult = await this.callAndroidNative({
          action: 'getPowerState'
        })
        return powerResult.powerState
      }

      // Fallback using web APIs
      const battery = 'getBattery' in navigator ? await navigator.getBattery() : null
      return {
        batteryLevel: battery?.level || 1.0,
        isCharging: battery?.charging || true,
        isLowPowerMode: false,
        thermalState: 'normal',
        shouldThrottle: false
      }
    } catch (error) {
      console.warn('Could not check power state:', error)
      return {
        batteryLevel: 1.0,
        isCharging: true,
        isLowPowerMode: false,
        thermalState: 'normal',
        shouldThrottle: false
      }
    }
  }

  /**
   * Prepare audio for Android native processing
   */
  async prepareAudioForAndroid(audioData) {
    if (audioData instanceof Blob) {
      const arrayBuffer = await audioData.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)

      return {
        format: 'raw',
        data: Array.from(uint8Array), // Convert to regular array for JNI
        size: uint8Array.length,
        mimeType: audioData.type
      }
    }

    throw new Error('Unsupported audio format for Android bridge')
  }

  /**
   * Split audio data into chunks for memory-efficient processing
   */
  async chunkAudioData(audioData) {
    const chunks = []
    const data = audioData.data

    for (let i = 0; i < data.length; i += this.audioChunkSize) {
      const chunkData = data.slice(i, i + this.audioChunkSize)
      chunks.push({
        format: audioData.format,
        data: chunkData,
        size: chunkData.length,
        offset: i
      })
    }

    return chunks
  }

  /**
   * Estimate device RAM (fallback)
   */
  estimateRAM() {
    if ('deviceMemory' in navigator) {
      return navigator.deviceMemory
    }

    // Rough estimation based on screen resolution and user agent
    const screenArea = screen.width * screen.height
    if (screenArea > 1920 * 1080) return 4 // High-res likely has more RAM
    if (screenArea > 1280 * 720) return 3
    return 2
  }

  /**
   * Check for GPU support
   */
  checkGPUSupport() {
    try {
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
      return !!gl
    } catch (e) {
      return false
    }
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      isLoading: this.isLoading,
      modelType: this.modelType,
      ready: this.isInitialized && !this.isLoading,
      engine: 'whisper.cpp-android-jni',
      nativeBridgeAvailable: this.isAndroidBridgeAvailable(),
      audioChunkSize: this.audioChunkSize
    }
  }

  /**
   * Clean up resources
   */
  destroy() {
    // Clear pending messages
    for (const [messageId, pending] of this.messageQueue) {
      clearTimeout(pending.timeout)
      pending.reject(new Error('Android bridge destroyed'))
    }
    this.messageQueue.clear()

    // Send cleanup to native code
    if (this.isAndroidBridgeAvailable()) {
      try {
        Android.whisperBridge.processMessage(JSON.stringify({
          action: 'cleanup'
        }))
      } catch (error) {
        console.warn('Error sending Android cleanup:', error)
      }
    }

    this.isInitialized = false
    this.isLoading = false
    console.log('🧹 Android Whisper bridge destroyed')
  }
}

// Create singleton instance
const androidWhisperBridge = new AndroidWhisperBridge()

export default androidWhisperBridge