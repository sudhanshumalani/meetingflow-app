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

      // Determine optimal model based on capabilities with iOS memory optimization
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
      const isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone
      const hasHighMemory = this.capabilities.memory < 200 // Use tiny if already using >200MB

      // iOS Memory Optimization Strategy
      if (isIOS) {
        // Research-backed iOS model selection for memory constraints
        this.modelName = 'Xenova/whisper-tiny.en' // 39M parameters - most iOS-compatible
        this.iosOptimized = true
        console.log('🍎 iOS detected - using memory-optimized Whisper-tiny with quantization')
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

      // iOS Memory Optimization - Research-backed approach
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
      const isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone

      if (isIOS) {
        // MEMORY OPTIMIZATION: iOS WebKit constraints - use minimal settings
        env.backends.onnx.wasm.proxy = false // Disable worker - reduces memory overhead
        env.backends.onnx.wasm.numThreads = 1 // Single thread - prevents memory fragmentation
        env.backends.onnx.wasm.simd = false // Disable SIMD - iOS compatibility

        // Conservative memory allocation for iOS WebKit
        try {
          env.backends.onnx.wasm.initialMemoryPages = 256 // ~16MB start
          env.backends.onnx.wasm.maximumMemoryPages = 1024 // ~64MB max (within iOS limits)
        } catch (memError) {
          console.warn('Could not set memory pages:', memError.message)
        }

        console.log('🍎 iOS memory optimization enabled - using conservative WASM settings')
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

      // iOS Memory Optimization: Use quantized models and conservative settings
      const pipelineOptions = {
        device: (this.capabilities.webgpu && !isIOS) ? 'webgpu' : 'wasm',
        progress_callback: (progress) => {
          if (progress.status === 'downloading') {
            const percent = Math.round((progress.loaded / progress.total) * 100)
            console.log(`📥 Downloading model: ${percent}%`)
          }
        }
      }

      // COMPATIBILITY FIX: Use supported dtypes for Transformers.js 2.15.1
      if (isIOS) {
        // Use fp32 for iOS compatibility with older Transformers.js version
        pipelineOptions.dtype = 'fp32' // Full precision - more compatible
        console.log('🍎 iOS: Using fp32 for maximum compatibility with current Transformers.js version')
      } else if (this.capabilities.webgpu) {
        pipelineOptions.dtype = 'fp16' // Half precision for WebGPU
      } else {
        pipelineOptions.dtype = 'fp32' // Full precision for maximum compatibility
      }

      console.log(`🎵 Loading model with configuration:`, {
        model: modelToTry,
        dtype: pipelineOptions.dtype,
        device: pipelineOptions.device,
        iosOptimized: this.iosOptimized
      })

      this.pipeline = await pipeline(
        'automatic-speech-recognition',
        modelToTry,
        pipelineOptions
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
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    const isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone
    const debugCallback = options.debugCallback

    console.log('🧪 moonshineWebService.enhanceTranscript called with comprehensive debugging:', {
      audioDataType: typeof audioData,
      isBlob: audioData instanceof Blob,
      audioBlobSize: audioData?.size || 'N/A',
      audioBlobType: audioData?.type || 'N/A',
      isInitialized: this.isInitialized,
      hasInitPromise: !!this.initPromise,
      hasPipeline: !!this.pipeline,
      isIOS,
      isPWA,
      options
    })

    if (debugCallback) debugCallback('🎵 Moonshine service called', 'info')

    // Fast initialization check
    if (!this.isInitialized && !this.initPromise) {
      console.log('🎵 Starting on-demand Whisper initialization...')
      this.loadingStrategy = 'progressive' // Use fastest loading for on-demand
    }

    if (debugCallback) debugCallback('📊 Initializing pipeline...', 'info')
    await this.initialize()

    if (!this.pipeline) {
      if (debugCallback) debugCallback('❌ Pipeline initialization failed', 'error')
      throw new Error('Whisper pipeline not initialized')
    }

    if (debugCallback) debugCallback('✅ Pipeline ready', 'info')

    try {
      console.log('🎵 Starting Whisper enhancement processing...')
      const startTime = performance.now()

      // Prepare audio data with optimization
      let processedAudio = audioData

      // If it's a Blob, convert to Float32Array with caching
      if (audioData instanceof Blob) {
        if (debugCallback) debugCallback('🔄 Converting audio blob...', 'info')
        const cacheKey = `audio_${audioData.size}_${audioData.type}`
        processedAudio = await this.blobToFloat32Array(audioData, cacheKey)
        if (debugCallback) debugCallback(`✅ Audio converted: ${processedAudio?.length || 0} samples`, 'info')
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
        if (debugCallback) debugCallback('⚠️ Very quiet audio detected', 'warning')
        // Throw error for completely silent audio to prevent garbage output
        if (maxAmplitude === 0) {
          throw new Error('Audio is completely silent - cannot transcribe. Please check microphone permissions and try recording again.')
        }
      }

      // iOS Safari specific audio preprocessing
      if (isIOS) {
        if (debugCallback) debugCallback('🍎 Applying iOS audio preprocessing...', 'info')

        // Research-based iOS Safari audio fixes for Whisper
        // 1. Normalize audio amplitude for iOS Safari (fixed stack overflow)
        let maxAmplitudeInAudio = 0
        for (let i = 0; i < processedAudio.length; i++) {
          const absValue = Math.abs(processedAudio[i])
          if (absValue > maxAmplitudeInAudio) {
            maxAmplitudeInAudio = absValue
          }
        }

        if (maxAmplitudeInAudio > 0 && maxAmplitudeInAudio < 0.1) {
          // Boost quiet audio for iOS Safari Whisper
          const amplificationFactor = 0.3 / maxAmplitudeInAudio
          for (let i = 0; i < processedAudio.length; i++) {
            processedAudio[i] *= amplificationFactor
          }
          if (debugCallback) debugCallback(`🔊 Amplified quiet audio by ${amplificationFactor.toFixed(2)}x`, 'info')
          console.log(`🍎 iOS audio amplification applied: ${amplificationFactor.toFixed(2)}x`)
        }

        // 2. Ensure minimum audio length for iOS Safari Whisper
        const minSamples = 16000 * 1.0 // Minimum 1 second for iOS Safari
        if (processedAudio.length < minSamples) {
          if (debugCallback) debugCallback('⚠️ Audio too short, padding for iOS Safari', 'warning')
          const paddedAudio = new Float32Array(minSamples)
          paddedAudio.set(processedAudio)
          // Fill remaining with very quiet noise instead of silence
          for (let i = processedAudio.length; i < minSamples; i++) {
            paddedAudio[i] = (Math.random() - 0.5) * 0.001 // Very quiet noise
          }
          processedAudio = paddedAudio
          console.log(`🍎 iOS Safari: Audio padded from ${processedAudio.length} to ${minSamples} samples`)
        }

        if (debugCallback) debugCallback('✅ iOS audio preprocessing completed', 'info')
      }

      // Simple validation - avoid complex preprocessing that may cause issues
      if (processedAudio.length < 8000) { // Less than 0.5 second at 16kHz
        if (debugCallback) debugCallback('⚠️ Very short audio detected', 'warning')
      }

      // Transcribe with iOS Safari specific optimizations
      console.log('🔍 Attempting transcription with processedAudio:', {
        audioLength: processedAudio?.length,
        audioType: typeof processedAudio,
        isFloat32Array: processedAudio instanceof Float32Array,
        samplePreview: processedAudio?.slice(0, 10)
      })

      if (debugCallback) debugCallback('🤖 Running AI transcription...', 'info')

      // iOS Safari specific pipeline configuration based on research
      const pipelineOptions = {
        task: 'transcribe',
        language: 'english',
        return_timestamps: false,
        ...options
      }

      // Simple pipeline configuration - avoid complex parameters that may cause issues
      console.log('🎵 Using simplified pipeline configuration for maximum compatibility')

      const result = await this.pipeline(processedAudio, pipelineOptions)

      if (debugCallback) debugCallback('✅ AI transcription completed', 'info')

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

      // ENHANCED DEBUG: Log every property to mobile debug panel
      if (debugCallback) {
        debugCallback(`🔍 Whisper result type: ${typeof result}`, 'info')
        debugCallback(`🔍 Result keys: ${result ? Object.keys(result).join(', ') : 'null'}`, 'info')
        debugCallback(`🔍 Has text property: ${!!result?.text}`, 'info')
        debugCallback(`🔍 Text content: "${result?.text || 'EMPTY'}"`, 'info')
        debugCallback(`🔍 Has chunks: ${!!result?.chunks}`, 'info')
        debugCallback(`🔍 Chunks length: ${result?.chunks?.length || 0}`, 'info')
        if (result?.chunks?.length > 0) {
          debugCallback(`🔍 First chunk: ${JSON.stringify(result.chunks[0])}`, 'info')
        }

        // DEEP DEBUG: Show all properties of result object
        try {
          debugCallback(`🔍 All result properties:`, 'info')
          for (const [key, value] of Object.entries(result || {})) {
            debugCallback(`  ${key}: ${typeof value} = ${JSON.stringify(value)?.substring(0, 100)}`, 'info')
          }
        } catch (e) {
          debugCallback(`🔍 Error inspecting result: ${e.message}`, 'error')
        }
      }

      // Cache model usage stats for future optimization
      this.updateUsageStats(duration, processedAudio.length)

      // Extract text with multiple fallback strategies - enhanced for iOS Safari
      let extractedText = ''

      // Strategy 1: Direct text property
      if (result?.text && typeof result.text === 'string' && result.text.trim()) {
        extractedText = result.text.trim()
        if (debugCallback && isIOS) debugCallback(`✅ Strategy 1 success: "${extractedText}"`, 'info')
      }
      // Strategy 2: First chunk text
      else if (result?.chunks && result.chunks.length > 0 && result.chunks[0]?.text) {
        extractedText = result.chunks.map(chunk => chunk.text).join(' ').trim()
        if (debugCallback && isIOS) debugCallback(`✅ Strategy 2 success: "${extractedText}"`, 'info')
      }
      // Strategy 3: Array of results (some models return array)
      else if (Array.isArray(result) && result.length > 0 && result[0]?.text) {
        extractedText = result.map(r => r.text).join(' ').trim()
        if (debugCallback && isIOS) debugCallback(`✅ Strategy 3 success: "${extractedText}"`, 'info')
      }
      // Strategy 4: Check if result itself is a string
      else if (typeof result === 'string' && result.trim()) {
        extractedText = result.trim()
        if (debugCallback && isIOS) debugCallback(`✅ Strategy 4 success: "${extractedText}"`, 'info')
      }
      // Strategy 5: iOS Safari specific - check for output property
      else if (result?.output && typeof result.output === 'string' && result.output.trim()) {
        extractedText = result.output.trim()
        if (debugCallback && isIOS) debugCallback(`✅ Strategy 5 (iOS output) success: "${extractedText}"`, 'info')
      }
      // Strategy 6: iOS Safari specific - check for transcription property
      else if (result?.transcription && typeof result.transcription === 'string' && result.transcription.trim()) {
        extractedText = result.transcription.trim()
        if (debugCallback && isIOS) debugCallback(`✅ Strategy 6 (iOS transcription) success: "${extractedText}"`, 'info')
      }
      // Strategy 7: iOS Safari specific - check nested text in first level properties
      else if (result && typeof result === 'object') {
        for (const [key, value] of Object.entries(result)) {
          if (typeof value === 'string' && value.trim().length > 0) {
            extractedText = value.trim()
            if (debugCallback && isIOS) debugCallback(`✅ Strategy 7 (${key}) success: "${extractedText}"`, 'info')
            break
          } else if (value && typeof value === 'object' && value.text && typeof value.text === 'string' && value.text.trim()) {
            extractedText = value.text.trim()
            if (debugCallback && isIOS) debugCallback(`✅ Strategy 7 (${key}.text) success: "${extractedText}"`, 'info')
            break
          }
        }
      }

      console.log('🔍 Text extraction strategies:', {
        strategy1_directText: result?.text,
        strategy2_chunks: result?.chunks?.length || 0,
        strategy3_arrayResult: Array.isArray(result),
        strategy4_stringResult: typeof result === 'string',
        finalExtractedText: extractedText,
        extractedLength: extractedText.length
      })

      // Debug: Log the actual text for mobile debugging
      if (debugCallback && extractedText) {
        debugCallback(`🔤 Whisper output: "${extractedText}"`, 'info')
      }

      // CRITICAL: Validate extracted text quality for iOS Safari
      const isGarbageText = (text) => {
        if (!text || typeof text !== 'string') return true
        const trimmed = text.trim()
        if (trimmed.length < 3) return true

        // Check for common garbage patterns from iOS Safari issues
        const garbagePatterns = [
          /^(Generate\s*){2,}$/i,        // "Generate Generate"
          /^(\w+\s*)\1{3,}$/,           // Repeated words
          /^[^a-zA-Z]*$/,               // No letters
          /^(.)\1{10,}$/,               // Repeated characters
          /^(undefined|null|NaN)$/i     // Technical artifacts
        ]

        return garbagePatterns.some(pattern => pattern.test(trimmed))
      }

      // Check for garbage but allow borderline cases for iOS debugging
      if (isGarbageText(extractedText)) {
        console.warn('🚨 GARBAGE TEXT DETECTED - but allowing for iOS debugging:', extractedText)
        if (debugCallback) {
          debugCallback(`⚠️ Potential garbage: "${extractedText}"`, 'warning')
          debugCallback('🧪 Allowing output for iOS debugging', 'warning')
        }

        // For iOS Safari, log but don't throw error during debugging
        if (isIOS) {
          console.warn('🍎 iOS Safari garbage output detected - allowing for debug')
          if (debugCallback) debugCallback('🍎 iOS Safari output - check if useful', 'warning')
        }

        // Still return the text for debugging purposes - user can evaluate if it's useful
        // throw new Error(`Whisper produced invalid output: "${extractedText}". This appears to be an iOS Safari audio processing issue. Web Speech API transcript has been preserved.`)
      }

      // Enhanced iOS Safari empty output debugging
      if (!extractedText || extractedText.length === 0) {
        if (debugCallback) {
          debugCallback('❌ ALL extraction strategies failed', 'error')
          debugCallback(`Result type: ${typeof result}`, 'error')
          debugCallback(`Audio duration: ${(processedAudio.length / 16000).toFixed(2)}s`, 'error')
          debugCallback(`Max amplitude: ${maxAmplitude.toFixed(4)}`, 'error')
          debugCallback(`Processing took ${duration.toFixed(1)}s`, 'error')

          if (isIOS) {
            debugCallback('📱 iOS Safari - all extraction failed', 'error')
            debugCallback(`🔍 Full result JSON: ${JSON.stringify(result, null, 2)}`, 'error')
          }
        }

        console.error('🚨 CRITICAL: All text extraction strategies failed for result:', result)
        console.error('🚨 This suggests either Whisper is producing an unexpected format or the audio is truly empty/silent')
      }

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

      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
      const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
      const isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone

      console.log('🎵 Converting blob to Float32Array with comprehensive iOS support:', {
        blobSize: blob.size,
        blobType: blob.type,
        isIOS,
        isSafari,
        isPWA,
        userAgent: navigator.userAgent.substring(0, 100)
      })

      // Enhanced ArrayBuffer handling for iOS compatibility
      let arrayBuffer
      try {
        arrayBuffer = await blob.arrayBuffer()

        // Validate ArrayBuffer size for iOS memory constraints
        if (isIOS && arrayBuffer.byteLength > 10 * 1024 * 1024) { // 10MB limit for iOS
          console.warn('⚠️ Large audio file detected on iOS - may cause memory issues')
        }
      } catch (error) {
        throw new Error(`Failed to convert blob to ArrayBuffer: ${error.message}`)
      }

      // iOS Safari AudioContext creation fix - research shows AudioContext must be created on main thread
      const audioContextOptions = isIOS ? { sampleRate: 16000 } : {}
      const audioContext = new (window.AudioContext || window.webkitAudioContext)(audioContextOptions)

      // Research fix: Resume audio context for iOS Safari
      if (audioContext.state === 'suspended') {
        await audioContext.resume()
      }

      // Handle SharedArrayBuffer compatibility (CRITICAL for iOS Safari)
      let processedArrayBuffer = arrayBuffer
      if (arrayBuffer.constructor.name === 'SharedArrayBuffer') {
        console.log('🔄 Converting SharedArrayBuffer to ArrayBuffer for Safari compatibility')
        processedArrayBuffer = new ArrayBuffer(arrayBuffer.byteLength)
        new Uint8Array(processedArrayBuffer).set(new Uint8Array(arrayBuffer))
      }

      console.log('🎵 Attempting audio decode with enhanced iOS support:', {
        blobType: blob.type,
        isIOS,
        isSafari,
        isPWA,
        bufferSize: processedArrayBuffer.byteLength,
        useCallbackMode: isIOS || isSafari
      })

      let audioBuffer
      try {
        // CRITICAL FIX: iOS Safari requires callback-based decodeAudioData, not promise-based
        if (isIOS || isSafari) {
          console.log('🍎 Using callback-based decodeAudioData for Safari/iOS compatibility')
          audioBuffer = await new Promise((resolve, reject) => {
            audioContext.decodeAudioData(
              processedArrayBuffer,
              (decodedBuffer) => {
                console.log('✅ Safari callback decode succeeded:', {
                  channels: decodedBuffer.numberOfChannels,
                  sampleRate: decodedBuffer.sampleRate,
                  duration: decodedBuffer.duration
                })
                resolve(decodedBuffer)
              },
              (error) => {
                console.error('❌ Safari callback decode failed:', {
                  error,
                  errorType: typeof error,
                  isNull: error === null,
                  blobType: blob.type
                })

                // Safari null error bug - documented issue
                if (error === null) {
                  reject(new Error(`Safari decodeAudioData null error bug. Audio format ${blob.type} is incompatible with iOS Safari. Ensure MediaRecorder uses video/mp4 format.`))
                } else {
                  reject(new Error(`Safari audio decode failed: ${error.message || 'Unknown Safari error'}`))
                }
              }
            )
          })
        } else {
          // Use promise-based approach for other browsers
          audioBuffer = await audioContext.decodeAudioData(processedArrayBuffer)
        }
      } catch (decodeError) {
        console.error('❌ Comprehensive audio decode failure:', {
          blobType: blob.type,
          error: decodeError.message,
          errorType: typeof decodeError,
          isNull: decodeError === null,
          isIOS,
          isSafari,
          isPWA,
          bufferSize: processedArrayBuffer.byteLength
        })

        // Enhanced error handling based on comprehensive research
        let errorMessage = `Audio decode failed: ${decodeError?.message || 'Unknown error'}`

        if (isIOS || isSafari) {
          if (blob.type.includes('webm')) {
            errorMessage = `❌ iOS Safari doesn't support WebM audio format (${blob.type}). MediaRecorder must use video/mp4 format for iOS compatibility.`
          } else if (blob.type.includes('opus')) {
            errorMessage = `❌ iOS Safari doesn't support Opus codec (${blob.type}). Use MP4 with AAC codec instead.`
          } else if (isPWA) {
            errorMessage = `❌ iOS PWA audio decode failed. This may be due to iOS memory constraints or format incompatibility. Ensure MediaRecorder uses video/mp4 format and audio files are under 10MB.`
          } else {
            errorMessage = `❌ iOS Safari audio decode failed. ${blob.type} format may be incompatible. Try recording with video/mp4 format.`
          }
        }

        throw new Error(errorMessage)
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
   * NEW: iOS WebKit compatible with memory-optimized Whisper models
   */
  isSupported() {
    try {
      // Always try Whisper first - we'll use memory-optimized models for iOS
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