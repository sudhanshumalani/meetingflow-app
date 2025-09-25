/**
 * iOS Whisper Bridge
 * Interfaces with native iOS Whisper.cpp implementation via WKWebView bridge
 * Uses Core ML optimized Whisper models for on-device transcription
 */

class IOSWhisperBridge {
  constructor() {
    this.isInitialized = false
    this.isLoading = false
    this.modelType = 'base-coreml' // Core ML optimized model
    this.messageQueue = new Map() // Track pending messages
    this.messageId = 0
  }

  /**
   * Initialize the iOS native Whisper bridge
   */
  async initialize(progressCallback = null) {
    if (this.isInitialized || this.isLoading) {
      return this.isInitialized
    }

    try {
      this.isLoading = true
      console.log('📱 Initializing iOS Whisper.cpp bridge...')

      if (progressCallback) {
        progressCallback({ stage: 'checking_native_bridge', progress: 10 })
      }

      // Check if native bridge is available
      if (!this.isNativeBridgeAvailable()) {
        throw new Error('iOS native bridge not available')
      }

      if (progressCallback) {
        progressCallback({ stage: 'loading_coreml_model', progress: 30 })
      }

      // Initialize native Whisper context
      const initResult = await this.sendNativeMessage({
        action: 'initialize',
        modelType: this.modelType,
        config: {
          language: 'en',
          quantized: true, // Use int8 quantized model
          useGPU: true,    // Use Neural Engine if available
          maxMemory: 512   // Limit memory usage (MB)
        }
      })

      if (!initResult.success) {
        throw new Error(`Native initialization failed: ${initResult.error}`)
      }

      if (progressCallback) {
        progressCallback({ stage: 'ready', progress: 100 })
      }

      this.isInitialized = true
      this.isLoading = false

      console.log('✅ iOS Whisper.cpp bridge initialized')
      return true

    } catch (error) {
      this.isLoading = false
      console.error('❌ iOS bridge initialization failed:', error)
      throw error
    }
  }

  /**
   * Transcribe audio using native iOS Whisper.cpp
   */
  async transcribe(audioData, options = {}) {
    if (!this.isInitialized) {
      throw new Error('iOS bridge not initialized')
    }

    try {
      console.log('🎯 Starting iOS native Whisper transcription...')

      const {
        language = 'en',
        progressCallback = null,
        enableBatteryOptimization = true
      } = options

      if (progressCallback) {
        progressCallback({ stage: 'preprocessing_mobile', progress: 10 })
      }

      // Check battery level if optimization enabled
      if (enableBatteryOptimization) {
        const batteryInfo = await this.getBatteryStatus()
        if (batteryInfo.level < 0.15 || batteryInfo.isLowPowerMode) {
          console.log('⚠️ Low battery detected, using efficient processing')
          // Use more efficient processing parameters
        }
      }

      // Convert audio to format expected by native bridge
      const processedAudio = await this.prepareAudioForNative(audioData)

      if (progressCallback) {
        progressCallback({ stage: 'transcribing_native', progress: 30 })
      }

      // Send audio to native Whisper implementation
      const transcriptionResult = await this.sendNativeMessage({
        action: 'transcribe',
        audioData: processedAudio,
        options: {
          language,
          enableTimestamps: true,
          enableProgressCallback: true
        }
      }, {
        progressCallback: (progress) => {
          if (progressCallback) {
            progressCallback({
              stage: 'transcribing_native',
              progress: 30 + (progress * 0.6)
            })
          }
        }
      })

      if (!transcriptionResult.success) {
        throw new Error(transcriptionResult.error)
      }

      if (progressCallback) {
        progressCallback({ stage: 'complete', progress: 100 })
      }

      console.log('✅ iOS native transcription completed')

      return {
        success: true,
        text: transcriptionResult.text,
        segments: transcriptionResult.segments || [],
        duration: transcriptionResult.duration || 0,
        timestamp: new Date().toISOString(),
        engine: 'whisper.cpp-ios-native'
      }

    } catch (error) {
      console.error('❌ iOS native transcription failed:', error)
      return {
        success: false,
        error: error.message,
        text: '',
        timestamp: new Date().toISOString()
      }
    }
  }

  /**
   * Check if native iOS bridge is available
   */
  isNativeBridgeAvailable() {
    // Check for WKWebView message handler
    return (
      window.webkit &&
      window.webkit.messageHandlers &&
      window.webkit.messageHandlers.whisperBridge
    )
  }

  /**
   * Send message to native iOS code
   */
  async sendNativeMessage(message, options = {}) {
    const messageId = `msg_${++this.messageId}`
    const fullMessage = { ...message, messageId }

    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeout = setTimeout(() => {
        this.messageQueue.delete(messageId)
        reject(new Error('Native bridge timeout'))
      }, 30000) // 30 second timeout

      // Store promise resolvers
      this.messageQueue.set(messageId, {
        resolve,
        reject,
        timeout,
        progressCallback: options.progressCallback
      })

      try {
        // Send to native iOS code via WKWebView bridge
        window.webkit.messageHandlers.whisperBridge.postMessage(fullMessage)
      } catch (error) {
        clearTimeout(timeout)
        this.messageQueue.delete(messageId)
        reject(error)
      }
    })
  }

  /**
   * Handle response from native iOS code
   * This method should be called by the native bridge
   */
  handleNativeResponse(response) {
    const messageId = response.messageId
    const pending = this.messageQueue.get(messageId)

    if (!pending) {
      console.warn('Received response for unknown message:', messageId)
      return
    }

    // Handle progress updates
    if (response.type === 'progress' && pending.progressCallback) {
      pending.progressCallback(response.progress)
      return // Don't resolve yet
    }

    // Handle final response
    clearTimeout(pending.timeout)
    this.messageQueue.delete(messageId)

    if (response.success) {
      pending.resolve(response)
    } else {
      pending.reject(new Error(response.error || 'Native operation failed'))
    }
  }

  /**
   * Get battery status for optimization
   */
  async getBatteryStatus() {
    try {
      if ('getBattery' in navigator) {
        const battery = await navigator.getBattery()
        return {
          level: battery.level,
          isCharging: battery.charging,
          isLowPowerMode: false // Would need native bridge to detect
        }
      } else {
        // Fallback for iOS - request from native bridge
        const batteryResult = await this.sendNativeMessage({
          action: 'getBatteryStatus'
        })
        return batteryResult.batteryInfo
      }
    } catch (error) {
      console.warn('Could not get battery status:', error)
      return {
        level: 1.0,
        isCharging: true,
        isLowPowerMode: false
      }
    }
  }

  /**
   * Prepare audio data for native bridge
   */
  async prepareAudioForNative(audioData) {
    // Convert audio blob to base64 for native bridge transfer
    if (audioData instanceof Blob) {
      const arrayBuffer = await audioData.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)
      const base64 = btoa(String.fromCharCode.apply(null, uint8Array))

      return {
        format: 'base64',
        data: base64,
        mimeType: audioData.type
      }
    }

    // Handle other audio formats
    throw new Error('Unsupported audio format for native bridge')
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
      engine: 'whisper.cpp-ios-coreml',
      nativeBridgeAvailable: this.isNativeBridgeAvailable()
    }
  }

  /**
   * Clean up resources
   */
  destroy() {
    // Clear pending messages
    for (const [messageId, pending] of this.messageQueue) {
      clearTimeout(pending.timeout)
      pending.reject(new Error('Bridge destroyed'))
    }
    this.messageQueue.clear()

    // Send cleanup message to native code
    if (this.isNativeBridgeAvailable()) {
      try {
        window.webkit.messageHandlers.whisperBridge.postMessage({
          action: 'cleanup'
        })
      } catch (error) {
        console.warn('Error sending cleanup message:', error)
      }
    }

    this.isInitialized = false
    this.isLoading = false
    console.log('🧹 iOS Whisper bridge destroyed')
  }
}

// Global function for native bridge to call
window.handleWhisperBridgeResponse = function(response) {
  if (window.iosWhisperBridge) {
    window.iosWhisperBridge.handleNativeResponse(response)
  }
}

// Create singleton instance
const iosWhisperBridge = new IOSWhisperBridge()
window.iosWhisperBridge = iosWhisperBridge // Make available for native bridge

export default iosWhisperBridge