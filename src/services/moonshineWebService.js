/**
 * Whisper Web Service - High Accuracy Speech Recognition
 * Uses Transformers.js with Whisper models for post-recording enhancement
 * Provides better accuracy than Web Speech API with client-side processing
 */

import { pipeline, env } from '@xenova/transformers'

class WhisperWebService {
  constructor() {
    this.pipeline = null
    this.isInitialized = false
    this.isLoading = false
    this.modelName = 'Xenova/whisper-tiny.en' // Use Xenova optimized version for Transformers.js
    this.fallbackModel = 'Xenova/whisper-tiny.en' // Smallest model for quick fallback
    this.capabilities = {
      webgpu: false,
      wasm: true,
      memory: 0
    }
    this.initPromise = null // Cache initialization promise
    this.preloadStarted = false
    this.loadingStrategy = 'lazy' // 'lazy', 'preload', 'progressive'
    this.audioCache = new Map() // Cache for processed audio data

    console.log('🎵 WhisperWebService initialized (optimized loading enabled)')

    // Start background preloading if on good connection
    this.maybeStartPreload()
  }

  /**
   * Maybe start preloading if conditions are favorable
   */
  maybeStartPreload() {
    try {
      // Check connection quality
      const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection
      const isGoodConnection = !connection ||
        (connection.effectiveType && ['4g', '3g'].includes(connection.effectiveType)) ||
        !connection.saveData

      // Check if user is likely to use transcription (has used before, or first visit)
      const hasUsedBefore = localStorage.getItem('whisper-used') === 'true'
      const shouldPreload = isGoodConnection && (hasUsedBefore || Math.random() > 0.7)

      if (shouldPreload && !this.preloadStarted) {
        console.log('🚀 Starting background Whisper preload...')
        this.loadingStrategy = 'preload'
        // Delay to not block initial app loading
        setTimeout(() => this.startBackgroundPreload(), 2000)
      }
    } catch (error) {
      console.warn('Error checking preload conditions:', error)
    }
  }

  /**
   * Start background preloading
   */
  async startBackgroundPreload() {
    if (this.preloadStarted || this.isInitialized) return

    this.preloadStarted = true
    try {
      console.log('🔄 Background preloading Whisper model...')
      await this.initialize()
      console.log('✅ Background preload completed!')
    } catch (error) {
      console.warn('Background preload failed:', error)
      this.preloadStarted = false
    }
  }

  /**
   * Check device capabilities
   */
  async checkCapabilities() {
    try {
      // Check WebGPU support
      this.capabilities.webgpu = !!navigator.gpu

      // Check available memory
      if (performance.memory) {
        this.capabilities.memory = performance.memory.usedJSHeapSize / (1024 * 1024) // MB
      }

      // Determine optimal model based on capabilities
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
      const isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone
      const hasHighMemory = this.capabilities.memory < 200 // Use tiny if already using >200MB

      // Use extra small model for iOS PWAs due to stricter memory constraints
      if (isIOS && isPWA) {
        this.modelName = 'Xenova/whisper-tiny.en' // Smallest model for iOS PWA
        console.log('📱 Detected iOS PWA - using minimal model for compatibility')
      } else if (isMobile || hasHighMemory) {
        this.modelName = 'Xenova/whisper-tiny.en' // ~39M parameters, Transformers.js optimized
      } else {
        this.modelName = 'Xenova/whisper-base.en' // ~74M parameters, better accuracy
      }

      console.log('🎵 Device capabilities:', {
        webgpu: this.capabilities.webgpu,
        memory: `${this.capabilities.memory}MB`,
        model: this.modelName,
        mobile: isMobile,
        iOS: isIOS,
        PWA: isPWA
      })

      return this.capabilities
    } catch (error) {
      console.warn('Error checking capabilities:', error)
      return this.capabilities
    }
  }

  /**
   * Initialize Whisper pipeline with optimizations
   */
  async initialize() {
    // Return cached promise if already initializing
    if (this.initPromise) {
      return this.initPromise
    }

    if (this.isInitialized) {
      return true
    }

    // Cache the initialization promise
    this.initPromise = this._doInitialize()
    return this.initPromise
  }

  /**
   * Internal initialization method
   */
  async _doInitialize() {
    if (this.isLoading) {
      console.log('🎵 Whisper already loading...')
      return false
    }

    try {
      this.isLoading = true
      console.log('🎵 Initializing Whisper Web (optimized)...')

      await this.checkCapabilities()

      // Configure Transformers.js environment for speed
      env.allowRemoteModels = true
      env.allowLocalModels = false
      env.useBrowserCache = true // Enable browser caching

      // iOS-specific optimizations
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
      const isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone

      if (isIOS) {
        // iOS has stricter memory and SharedArrayBuffer limitations
        env.backends.onnx.wasm.proxy = false // Disable worker for iOS compatibility
        env.backends.onnx.wasm.numThreads = 1 // Single thread for iOS stability
        console.log('📱 Using iOS-optimized settings')
      } else {
        // Optimize based on loading strategy for other platforms
        if (this.loadingStrategy === 'preload') {
          env.backends.onnx.wasm.proxy = false // Disable worker for preload
          console.log('🚀 Using preload optimization strategy')
        }
      }

      // Use WebGPU if available, otherwise fallback to WASM
      if (this.capabilities.webgpu && !isIOS) {
        // WebGPU often has issues in iOS PWAs
        env.backends.onnx.device = 'webgpu'
        console.log('🚀 Using WebGPU acceleration')
      } else {
        env.backends.onnx.device = 'wasm'
        if (!isIOS) {
          env.backends.onnx.wasm.numThreads = Math.max(2, Math.min(4, navigator.hardwareConcurrency || 4))
        }
        console.log('🔧 Using WASM with', env.backends.onnx.wasm.numThreads, 'threads')
      }

      // Progressive loading: try tiny first, then upgrade if needed
      let modelToTry = this.loadingStrategy === 'progressive' ? this.fallbackModel : this.modelName

      console.log(`🎵 Loading ${modelToTry} model...`)
      const startTime = performance.now()

      this.pipeline = await pipeline(
        'automatic-speech-recognition',
        modelToTry,
        {
          dtype: (this.capabilities.webgpu && !isIOS) ? 'fp16' : 'fp32',
          device: (this.capabilities.webgpu && !isIOS) ? 'webgpu' : 'wasm',
          progress_callback: (progress) => {
            if (progress.status === 'downloading') {
              const percent = Math.round((progress.loaded / progress.total) * 100)
              console.log(`📥 Downloading model: ${percent}%`)
            }
          }
        }
      )

      const loadTime = (performance.now() - startTime) / 1000
      console.log(`✅ Whisper Web initialized in ${loadTime.toFixed(2)}s`)

      // Mark as used for future preloading
      localStorage.setItem('whisper-used', 'true')

      this.isInitialized = true
      this.isLoading = false
      this.initPromise = null // Clear promise cache

      return true

    } catch (error) {
      this.isLoading = false
      this.initPromise = null // Clear failed promise
      console.error('❌ Failed to initialize Whisper Web:', error)

      // Progressive fallback to smaller model
      if (this.modelName !== this.fallbackModel) {
        console.log('🔄 Falling back to tiny model...')
        this.modelName = this.fallbackModel
        return this._doInitialize()
      }

      throw error
    }
  }

  /**
   * Enhance transcript using Whisper Web
   * @param {AudioBuffer|Float32Array|Blob} audioData - Audio data to transcribe
   * @param {Object} options - Transcription options
   * @returns {Promise<Object>} Enhanced transcript result
   */
  async enhanceTranscript(audioData, options = {}) {
    // Fast initialization check
    if (!this.isInitialized && !this.initPromise) {
      console.log('🎵 Starting on-demand Whisper initialization...')
      this.loadingStrategy = 'progressive' // Use fastest loading for on-demand
    }

    await this.initialize()

    if (!this.pipeline) {
      throw new Error('Whisper pipeline not initialized')
    }

    try {
      console.log('🎵 Starting Whisper enhancement...')
      const startTime = performance.now()

      // Prepare audio data with optimization
      let processedAudio = audioData

      // If it's a Blob, convert to Float32Array with caching
      if (audioData instanceof Blob) {
        const cacheKey = `audio_${audioData.size}_${audioData.type}`
        processedAudio = await this.blobToFloat32Array(audioData, cacheKey)
      }

      // Validate processed audio
      if (!processedAudio || processedAudio.length === 0) {
        throw new Error('Processed audio is empty or invalid')
      }

      // Check for silence (all zeros) which might cause empty transcription
      let maxAmplitude = 0
      let sumAmplitude = 0

      // Efficiently calculate max and average without stack overflow
      for (let i = 0; i < processedAudio.length; i++) {
        const absValue = Math.abs(processedAudio[i])
        if (absValue > maxAmplitude) {
          maxAmplitude = absValue
        }
        sumAmplitude += absValue
      }

      const avgAmplitude = sumAmplitude / processedAudio.length

      console.log('🔍 Audio analysis:', {
        length: processedAudio.length,
        duration: `${(processedAudio.length / 16000).toFixed(2)}s`,
        maxAmplitude: maxAmplitude.toFixed(6),
        avgAmplitude: avgAmplitude.toFixed(6),
        isLikelySilent: maxAmplitude < 0.001
      })

      if (maxAmplitude < 0.001) {
        console.warn('⚠️ Audio appears to be silent or very quiet')
      }

      // Transcribe with simplified settings to avoid empty results
      console.log('🔍 Attempting transcription with processedAudio:', {
        audioLength: processedAudio?.length,
        audioType: typeof processedAudio,
        isFloat32Array: processedAudio instanceof Float32Array,
        samplePreview: processedAudio?.slice(0, 10)
      })

      const result = await this.pipeline(processedAudio, {
        task: 'transcribe',
        language: 'english',
        return_timestamps: false, // Disable timestamps to simplify
        // Remove potentially problematic options
        ...options
      })

      const endTime = performance.now()
      const duration = (endTime - startTime) / 1000

      console.log(`🎵 Whisper enhancement completed in ${duration.toFixed(2)}s`)
      console.log('🔍 Raw Whisper result:', {
        resultType: typeof result,
        resultKeys: result ? Object.keys(result) : 'null',
        text: result?.text,
        textType: typeof result?.text,
        chunks: result?.chunks,
        chunksLength: result?.chunks?.length,
        allProperties: result
      })

      // Log the full result structure for debugging
      console.log('🔍 Complete Whisper result object:', result)

      // Cache model usage stats for future optimization
      this.updateUsageStats(duration, processedAudio.length)

      // Extract text with multiple fallback strategies
      let extractedText = ''

      // Strategy 1: Direct text property
      if (result?.text && typeof result.text === 'string' && result.text.trim()) {
        extractedText = result.text.trim()
      }
      // Strategy 2: First chunk text
      else if (result?.chunks && result.chunks.length > 0 && result.chunks[0]?.text) {
        extractedText = result.chunks.map(chunk => chunk.text).join(' ').trim()
      }
      // Strategy 3: Array of results (some models return array)
      else if (Array.isArray(result) && result.length > 0 && result[0]?.text) {
        extractedText = result.map(r => r.text).join(' ').trim()
      }
      // Strategy 4: Check if result itself is a string
      else if (typeof result === 'string' && result.trim()) {
        extractedText = result.trim()
      }

      console.log('🔍 Text extraction strategies:', {
        strategy1_directText: result?.text,
        strategy2_chunks: result?.chunks?.length || 0,
        strategy3_arrayResult: Array.isArray(result),
        strategy4_stringResult: typeof result === 'string',
        finalExtractedText: extractedText,
        extractedLength: extractedText.length
      })

      // Format result
      const enhancedResult = {
        text: extractedText,
        segments: result.chunks ? result.chunks.map(chunk => ({
          text: chunk.text,
          start: Math.round(chunk.timestamp[0] * 1000),
          end: Math.round(chunk.timestamp[1] * 1000)
        })) : [{
          text: extractedText,
          start: 0,
          end: Math.round(duration * 1000)
        }],
        confidence: result.confidence || 0.95, // Whisper generally high confidence
        language: options.language || 'english',
        model: this.modelName,
        processingTime: duration,
        enhanced: true
      }

      console.log('✅ Whisper result:', {
        text: enhancedResult.text.substring(0, 100) + '...',
        segments: enhancedResult.segments.length,
        confidence: enhancedResult.confidence,
        time: `${duration.toFixed(2)}s`
      })

      return enhancedResult

    } catch (error) {
      console.error('❌ Whisper enhancement failed:', error)
      throw error
    }
  }

  /**
   * Update usage statistics for optimization
   */
  updateUsageStats(duration, audioLength) {
    try {
      const stats = JSON.parse(localStorage.getItem('whisper-stats') || '{}')
      stats.totalUsage = (stats.totalUsage || 0) + 1
      stats.avgDuration = ((stats.avgDuration || 0) * (stats.totalUsage - 1) + duration) / stats.totalUsage
      stats.lastUsed = Date.now()
      localStorage.setItem('whisper-stats', JSON.stringify(stats))
    } catch (error) {
      console.warn('Failed to update usage stats:', error)
    }
  }

  /**
   * Convert blob to Float32Array for processing with caching
   */
  async blobToFloat32Array(blob, cacheKey = null) {
    try {
      // Check cache first if key provided
      if (cacheKey && this.audioCache && this.audioCache.has(cacheKey)) {
        console.log('🔄 Using cached audio data')
        return this.audioCache.get(cacheKey)
      }

      console.log('🎵 Converting blob to Float32Array:', {
        blobSize: blob.size,
        blobType: blob.type,
        isIOS: /iPad|iPhone|iPod/.test(navigator.userAgent)
      })

      const arrayBuffer = await blob.arrayBuffer()
      const audioContext = new (window.AudioContext || window.webkitAudioContext)()

      let audioBuffer
      try {
        audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
      } catch (decodeError) {
        console.error('❌ Audio decode failed - likely unsupported format:', {
          blobType: blob.type,
          error: decodeError.message,
          isIOS: /iPad|iPhone|iPod/.test(navigator.userAgent)
        })

        // Provide more specific error for iOS format issues
        if (/iPad|iPhone|iPod/.test(navigator.userAgent) && blob.type.includes('webm')) {
          throw new Error(`iOS Safari doesn't support ${blob.type}. Please use audio/mp4 or audio/wav format.`)
        }

        throw new Error(`Audio format ${blob.type} is not supported by this browser. Error: ${decodeError.message}`)
      }

      // Get first channel and resample to 16kHz if needed
      let audioData = audioBuffer.getChannelData(0)

      console.log('🎵 Audio decoded successfully:', {
        channels: audioBuffer.numberOfChannels,
        sampleRate: audioBuffer.sampleRate,
        duration: audioBuffer.duration,
        samples: audioData.length
      })

      if (audioBuffer.sampleRate !== 16000) {
        console.log(`🔄 Resampling from ${audioBuffer.sampleRate}Hz to 16000Hz`)
        audioData = this.resampleAudio(audioData, audioBuffer.sampleRate, 16000)
      }

      // Cache the result if key provided and cache exists
      if (cacheKey && this.audioCache) {
        this.audioCache.set(cacheKey, audioData)
      }

      return audioData
    } catch (error) {
      console.error('❌ Error converting blob to Float32Array:', {
        message: error.message,
        blobType: blob?.type,
        blobSize: blob?.size
      })
      throw error
    }
  }

  /**
   * Simple audio resampling
   */
  resampleAudio(audioData, fromSampleRate, toSampleRate) {
    if (fromSampleRate === toSampleRate) {
      return audioData
    }

    const ratio = fromSampleRate / toSampleRate
    const newLength = Math.round(audioData.length / ratio)
    const result = new Float32Array(newLength)

    for (let i = 0; i < newLength; i++) {
      const sourceIndex = i * ratio
      const leftIndex = Math.floor(sourceIndex)
      const rightIndex = Math.ceil(sourceIndex)
      const fraction = sourceIndex - leftIndex

      if (rightIndex >= audioData.length) {
        result[i] = audioData[leftIndex]
      } else {
        result[i] = audioData[leftIndex] * (1 - fraction) + audioData[rightIndex] * fraction
      }
    }

    return result
  }

  /**
   * Check if Moonshine is supported
   */
  isSupported() {
    try {
      return !!(window.OffscreenCanvas || window.WebGLRenderingContext)
    } catch (error) {
      return false
    }
  }

  /**
   * Get service status
   */
  getStatus() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    const isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone

    return {
      isSupported: this.isSupported(),
      isInitialized: this.isInitialized,
      isLoading: this.isLoading,
      model: this.modelName,
      capabilities: this.capabilities,
      platform: {
        isIOS,
        isPWA,
        userAgent: navigator.userAgent,
        hardwareConcurrency: navigator.hardwareConcurrency,
        sharedArrayBufferSupported: typeof SharedArrayBuffer !== 'undefined',
        webGPUAvailable: !!navigator.gpu
      }
    }
  }

  /**
   * Reset service
   */
  reset() {
    // Whisper doesn't need reset like Web Speech API
    console.log('🎵 Whisper service ready for next transcription')
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    try {
      if (this.pipeline) {
        // Transformers.js handles cleanup automatically
        this.pipeline = null
      }

      // Clear caches
      if (this.audioCache) {
        this.audioCache.clear()
      }

      this.isInitialized = false
      this.isLoading = false
      this.initPromise = null
      this.preloadStarted = false

      console.log('🎵 Whisper Web service cleaned up')
    } catch (error) {
      console.warn('Error cleaning up Whisper service:', error)
    }
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    try {
      const stats = JSON.parse(localStorage.getItem('whisper-stats') || '{}')
      return {
        totalUsage: stats.totalUsage || 0,
        avgDuration: stats.avgDuration || 0,
        lastUsed: stats.lastUsed || null,
        cacheSize: this.audioCache ? this.audioCache.size : 0,
        isPreloaded: this.isInitialized && this.preloadStarted,
        loadingStrategy: this.loadingStrategy
      }
    } catch (error) {
      console.warn('Error getting performance metrics:', error)
      return {}
    }
  }
}

// Export singleton instance
const whisperWebService = new WhisperWebService()
export default whisperWebService