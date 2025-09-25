/**
 * Whisper.cpp Service for Audio Transcription
 * Uses official whisper.cpp WASM binaries with quantized models for mobile efficiency
 */

import modelManager from '../utils/modelManager.js'
import { getDeviceCapabilities } from '../utils/deviceDetection.js'

class WhisperService {
  constructor() {
    this.whisperModule = null
    this.isLoading = false
    this.isInitialized = false
    this.modelId = null // Will be determined based on device
    this.wasmPath = '/models/whisper.wasm'
    this.context = null
  }

  /**
   * Initialize the Whisper WASM module and model
   */
  async initialize(progressCallback = null) {
    if (this.isInitialized || this.isLoading) {
      return this.isInitialized
    }

    try {
      this.isLoading = true

      console.log('🤖 Initializing Whisper.cpp WASM...')

      if (progressCallback) {
        progressCallback({ stage: 'loading_wasm', progress: 10 })
      }

      // Load the whisper.js binding (which loads the WASM)
      const whisperModuleScript = document.createElement('script')
      whisperModuleScript.src = '/models/whisper.js'

      await new Promise((resolve, reject) => {
        whisperModuleScript.onload = resolve
        whisperModuleScript.onerror = reject
        document.head.appendChild(whisperModuleScript)
      })

      if (progressCallback) {
        progressCallback({ stage: 'loading_module', progress: 30 })
      }

      // Initialize the Whisper module
      if (typeof window.Whisper === 'undefined') {
        throw new Error('Whisper module not loaded')
      }

      this.whisperModule = await window.Whisper({
        wasmBinaryFile: this.wasmPath,
        print: (text) => console.log('Whisper:', text),
        printErr: (text) => console.error('Whisper Error:', text)
      })

      if (progressCallback) {
        progressCallback({ stage: 'loading_model', progress: 50 })
      }

      console.log('✅ Whisper WASM loaded, determining optimal model...')

      if (progressCallback) {
        progressCallback({ stage: 'selecting_model', progress: 50 })
      }

      // Determine optimal model based on device capabilities
      const deviceCapabilities = getDeviceCapabilities()
      this.modelId = modelManager.getOptimalModelForDevice(deviceCapabilities)

      if (!this.modelId) {
        throw new Error('No suitable Whisper model for this device')
      }

      console.log(`📱 Selected model: ${this.modelId} for ${deviceCapabilities.device.type}`)

      // Check storage availability
      const hasStorage = await modelManager.checkStorageAvailable(this.modelId)
      if (!hasStorage) {
        // Fallback to smaller model
        this.modelId = deviceCapabilities.device.type === 'desktop' ? 'base' : 'tiny-q8'
        console.log(`⚠️ Limited storage, using smaller model: ${this.modelId}`)
      }

      // Download/load model via model manager
      const modelBuffer = await modelManager.downloadModel(this.modelId, (progress) => {
        if (progressCallback) {
          progressCallback({
            stage: progress.stage,
            progress: 50 + (progress.progress * 0.3), // Scale to 50-80% range
            ...progress
          })
        }
      })

      if (progressCallback) {
        progressCallback({ stage: 'initializing_context', progress: 80 })
      }

      // Create Whisper context with the model
      const modelData = new Uint8Array(modelBuffer)
      this.context = this.whisperModule.init(modelData)

      if (!this.context) {
        throw new Error('Failed to initialize Whisper context')
      }

      this.isInitialized = true
      this.isLoading = false

      if (progressCallback) {
        progressCallback({ stage: 'ready', progress: 100 })
      }

      console.log('✅ Whisper.cpp service initialized successfully')
      return true

    } catch (error) {
      this.isLoading = false
      console.error('❌ Failed to initialize Whisper.cpp service:', error)
      throw new Error(`Whisper initialization failed: ${error.message}`)
    }
  }

  /**
   * Transcribe audio data using Whisper.cpp WASM
   * @param {AudioBuffer|Blob|ArrayBuffer} audioData - Audio data to transcribe
   * @param {Object} options - Transcription options
   * @returns {Promise<Object>} Transcription result
   */
  async transcribe(audioData, options = {}) {
    if (!this.isInitialized) {
      throw new Error('Whisper service not initialized. Call initialize() first.')
    }

    try {
      console.log('🎯 Starting Whisper.cpp transcription...')

      const {
        language = 'en',
        progressCallback = null
      } = options

      if (progressCallback) {
        progressCallback({ stage: 'preprocessing', progress: 10 })
      }

      // Preprocess audio data to 16kHz mono float32
      const audioSamples = await this.preprocessAudio(audioData)

      if (progressCallback) {
        progressCallback({ stage: 'transcribing', progress: 30 })
      }

      // Run Whisper transcription
      const params = this.whisperModule.defaultParams()
      params.language = language === 'en' ? 0 : -1 // 0 for English, -1 for auto-detect
      params.no_timestamps = false
      params.print_progress = false
      params.print_realtime = false

      // Process the audio
      const result = this.whisperModule.full(this.context, params, audioSamples)

      if (progressCallback) {
        progressCallback({ stage: 'processing_results', progress: 80 })
      }

      // Extract transcribed text
      const segmentCount = this.whisperModule.full_n_segments(this.context)
      let fullText = ''
      const segments = []

      for (let i = 0; i < segmentCount; i++) {
        const segmentText = this.whisperModule.full_get_segment_text(this.context, i)
        const startTime = this.whisperModule.full_get_segment_t0(this.context, i) * 10 // Convert to ms
        const endTime = this.whisperModule.full_get_segment_t1(this.context, i) * 10

        fullText += segmentText
        segments.push({
          text: segmentText,
          start: startTime,
          end: endTime
        })
      }

      if (progressCallback) {
        progressCallback({ stage: 'complete', progress: 100 })
      }

      console.log('✅ Whisper.cpp transcription completed')

      return {
        success: true,
        text: fullText.trim(),
        segments: segments,
        duration: audioSamples.length / 16000, // Duration in seconds
        timestamp: new Date().toISOString()
      }

    } catch (error) {
      console.error('❌ Whisper.cpp transcription failed:', error)
      return {
        success: false,
        error: error.message,
        text: '',
        timestamp: new Date().toISOString()
      }
    }
  }

  /**
   * Preprocess audio data for Whisper.cpp (16kHz mono float32)
   * @param {AudioBuffer|Blob|ArrayBuffer} audioData - Input audio data
   * @returns {Promise<Float32Array>} Preprocessed audio samples
   */
  async preprocessAudio(audioData) {
    try {
      let audioBuffer

      if (audioData instanceof Blob) {
        // Convert Blob to AudioBuffer
        const arrayBuffer = await audioData.arrayBuffer()
        const audioContext = new (window.AudioContext || window.webkitAudioContext)()
        audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
      } else if (audioData instanceof ArrayBuffer) {
        // Convert ArrayBuffer to AudioBuffer
        const audioContext = new (window.AudioContext || window.webkitAudioContext)()
        audioBuffer = await audioContext.decodeAudioData(audioData)
      } else if (audioData instanceof AudioBuffer) {
        audioBuffer = audioData
      } else {
        throw new Error('Unsupported audio data format')
      }

      // Convert to mono and resample to 16kHz (Whisper's expected format)
      const targetSampleRate = 16000
      const samples = this.resampleAudio(audioBuffer, targetSampleRate)

      console.log(`🔧 Audio preprocessed: ${samples.length} samples at ${targetSampleRate}Hz`)

      return samples

    } catch (error) {
      console.error('❌ Audio preprocessing failed:', error)
      throw new Error(`Audio preprocessing failed: ${error.message}`)
    }
  }

  /**
   * Resample audio to 16kHz and convert to mono Float32Array
   * @param {AudioBuffer} audioBuffer - Input audio buffer
   * @param {number} targetSampleRate - Target sample rate (16000 for Whisper)
   * @returns {Float32Array} Resampled mono audio samples
   */
  resampleAudio(audioBuffer, targetSampleRate = 16000) {
    const sourceSampleRate = audioBuffer.sampleRate
    const channels = audioBuffer.numberOfChannels

    // Get channel data (convert to mono if needed)
    let sourceData
    if (channels === 1) {
      sourceData = audioBuffer.getChannelData(0)
    } else {
      // Mix down to mono
      const leftChannel = audioBuffer.getChannelData(0)
      const rightChannel = channels > 1 ? audioBuffer.getChannelData(1) : leftChannel
      sourceData = new Float32Array(leftChannel.length)
      for (let i = 0; i < leftChannel.length; i++) {
        sourceData[i] = (leftChannel[i] + rightChannel[i]) / 2
      }
    }

    // Resample if necessary
    if (sourceSampleRate === targetSampleRate) {
      return sourceData
    }

    const ratio = targetSampleRate / sourceSampleRate
    const outputLength = Math.floor(sourceData.length * ratio)
    const outputData = new Float32Array(outputLength)

    // Simple linear interpolation resampling
    for (let i = 0; i < outputLength; i++) {
      const sourceIndex = i / ratio
      const index = Math.floor(sourceIndex)
      const fraction = sourceIndex - index

      if (index + 1 < sourceData.length) {
        outputData[i] = sourceData[index] * (1 - fraction) + sourceData[index + 1] * fraction
      } else {
        outputData[i] = sourceData[index]
      }
    }

    return outputData
  }

  /**
   * Get service status
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      isLoading: this.isLoading,
      modelPath: this.modelPath,
      ready: this.isInitialized && !this.isLoading,
      engine: 'whisper.cpp-wasm'
    }
  }

  /**
   * Cache model in IndexedDB for offline use
   */
  async cacheModel(modelBuffer) {
    if (!('indexedDB' in window)) {
      throw new Error('IndexedDB not supported')
    }

    const dbName = 'WhisperModels'
    const storeName = 'models'

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, 1)

      request.onerror = () => reject(request.error)

      request.onupgradeneeded = (event) => {
        const db = event.target.result
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName)
        }
      }

      request.onsuccess = (event) => {
        const db = event.target.result
        const transaction = db.transaction([storeName], 'readwrite')
        const store = transaction.objectStore(storeName)

        store.put(modelBuffer, 'ggml-base.en.bin')

        transaction.oncomplete = () => {
          db.close()
          resolve()
        }

        transaction.onerror = () => {
          db.close()
          reject(transaction.error)
        }
      }
    })
  }

  /**
   * Clean up resources
   */
  destroy() {
    if (this.context && this.whisperModule) {
      this.whisperModule.free(this.context)
      this.context = null
    }
    this.whisperModule = null
    this.isInitialized = false
    this.isLoading = false
    console.log('🧹 Whisper.cpp service destroyed')
  }
}

// Create singleton instance
const whisperService = new WhisperService()

export default whisperService