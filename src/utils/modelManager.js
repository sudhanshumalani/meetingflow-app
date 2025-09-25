/**
 * Model Manager for Whisper Quantized Models
 * Handles downloading and caching of int8 quantized models for mobile efficiency
 */

class ModelManager {
  constructor() {
    this.modelUrls = {
      // Desktop models (standard precision)
      'base': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin',
      'small': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin',

      // Mobile optimized quantized models (int8)
      'base-q8': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en-q8_0.bin',
      'small-q8': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en-q8_0.bin',

      // iOS Core ML models (would be hosted separately)
      'base-coreml-q8': '/meetingflow-app/models/whisper-base-coreml-q8.mlpackage',

      // Tiny model for very low-end devices
      'tiny-q8': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en-q8_0.bin'
    }

    this.modelSizes = {
      'base': 142,      // MB
      'small': 466,     // MB
      'base-q8': 71,    // MB (50% reduction)
      'small-q8': 233,  // MB (50% reduction)
      'base-coreml-q8': 45,  // MB (Core ML optimized)
      'tiny-q8': 18     // MB
    }

    this.cache = null
    this.dbName = 'WhisperModels'
    this.storeName = 'models'
  }

  /**
   * Initialize IndexedDB cache
   */
  async initializeCache() {
    if (this.cache) return this.cache

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 2)

      request.onerror = () => reject(request.error)

      request.onupgradeneeded = (event) => {
        const db = event.target.result

        // Create models store
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'modelId' })
          store.createIndex('downloadDate', 'downloadDate')
          store.createIndex('size', 'size')
        }

        // Create metadata store for version tracking
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata')
        }
      }

      request.onsuccess = (event) => {
        this.cache = event.target.result
        resolve(this.cache)
      }
    })
  }

  /**
   * Get optimal model for device capabilities
   */
  getOptimalModelForDevice(deviceCapabilities) {
    const { device, capabilities } = deviceCapabilities
    const ramGB = device.memory || 2

    // Desktop - use full precision models
    if (device.type === 'desktop') {
      return ramGB >= 8 ? 'small' : 'base'
    }

    // iOS - prefer Core ML if available, otherwise quantized
    if (device.type === 'ios') {
      if (capabilities.ios_bridge) {
        return 'base-coreml-q8'
      }
      return ramGB >= 3 ? 'base-q8' : 'tiny-q8'
    }

    // Android - use quantized models
    if (device.type === 'android') {
      if (ramGB >= 4) {
        return 'base-q8'
      } else if (ramGB >= 2) {
        return 'tiny-q8'
      } else {
        // Very low-end devices
        return null // Use Web Speech fallback
      }
    }

    return 'base-q8' // Default quantized model
  }

  /**
   * Download and cache model
   */
  async downloadModel(modelId, progressCallback = null) {
    try {
      await this.initializeCache()

      // Check if already cached
      const cached = await this.getCachedModel(modelId)
      if (cached && cached.data) {
        console.log(`✅ Model ${modelId} loaded from cache`)
        return cached.data
      }

      console.log(`📥 Downloading model ${modelId} (${this.modelSizes[modelId]}MB)...`)

      const url = this.modelUrls[modelId]
      if (!url) {
        throw new Error(`Unknown model: ${modelId}`)
      }

      // Download with progress tracking
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Download failed: ${response.statusText}`)
      }

      const contentLength = parseInt(response.headers.get('content-length'), 10)
      const reader = response.body.getReader()
      const chunks = []
      let receivedLength = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        chunks.push(value)
        receivedLength += value.length

        if (progressCallback && contentLength) {
          const progress = (receivedLength / contentLength) * 100
          progressCallback({
            stage: 'downloading_model',
            progress: Math.min(99, progress),
            modelId,
            receivedMB: Math.round(receivedLength / 1024 / 1024),
            totalMB: Math.round(contentLength / 1024 / 1024)
          })
        }
      }

      // Combine chunks
      const modelBuffer = new Uint8Array(receivedLength)
      let position = 0
      for (const chunk of chunks) {
        modelBuffer.set(chunk, position)
        position += chunk.length
      }

      // Cache the model
      await this.cacheModel(modelId, modelBuffer)

      if (progressCallback) {
        progressCallback({
          stage: 'model_ready',
          progress: 100,
          modelId
        })
      }

      console.log(`✅ Model ${modelId} downloaded and cached`)
      return modelBuffer

    } catch (error) {
      console.error(`❌ Failed to download model ${modelId}:`, error)
      throw error
    }
  }

  /**
   * Cache model in IndexedDB
   */
  async cacheModel(modelId, modelBuffer) {
    await this.initializeCache()

    return new Promise((resolve, reject) => {
      const transaction = this.cache.transaction([this.storeName], 'readwrite')
      const store = transaction.objectStore(this.storeName)

      const modelRecord = {
        modelId,
        data: modelBuffer,
        size: modelBuffer.length,
        downloadDate: new Date().toISOString(),
        version: '1.0'
      }

      const request = store.put(modelRecord)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Get cached model from IndexedDB
   */
  async getCachedModel(modelId) {
    await this.initializeCache()

    return new Promise((resolve, reject) => {
      const transaction = this.cache.transaction([this.storeName], 'readonly')
      const store = transaction.objectStore(this.storeName)
      const request = store.get(modelId)

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Get cache statistics
   */
  async getCacheStats() {
    await this.initializeCache()

    return new Promise((resolve, reject) => {
      const transaction = this.cache.transaction([this.storeName], 'readonly')
      const store = transaction.objectStore(this.storeName)
      const request = store.getAll()

      request.onsuccess = () => {
        const models = request.result
        const totalSize = models.reduce((sum, model) => sum + model.size, 0)
        const totalSizeMB = Math.round(totalSize / 1024 / 1024)

        resolve({
          modelCount: models.length,
          totalSizeMB,
          models: models.map(m => ({
            modelId: m.modelId,
            sizeMB: Math.round(m.size / 1024 / 1024),
            downloadDate: m.downloadDate
          }))
        })
      }

      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Clear model cache
   */
  async clearCache() {
    await this.initializeCache()

    return new Promise((resolve, reject) => {
      const transaction = this.cache.transaction([this.storeName], 'readwrite')
      const store = transaction.objectStore(this.storeName)
      const request = store.clear()

      request.onsuccess = () => {
        console.log('🧹 Model cache cleared')
        resolve()
      }
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Check if device has sufficient storage for model
   */
  async checkStorageAvailable(modelId) {
    const modelSizeMB = this.modelSizes[modelId] || 100
    const requiredBytes = modelSizeMB * 1024 * 1024 * 2 // 2x buffer

    if ('storage' in navigator && 'estimate' in navigator.storage) {
      try {
        const estimate = await navigator.storage.estimate()
        const availableBytes = estimate.quota - estimate.usage
        return availableBytes >= requiredBytes
      } catch (error) {
        console.warn('Could not check storage:', error)
      }
    }

    return true // Assume available if can't check
  }

  /**
   * Get model info
   */
  getModelInfo(modelId) {
    return {
      id: modelId,
      url: this.modelUrls[modelId],
      sizeMB: this.modelSizes[modelId],
      isQuantized: modelId.includes('q8'),
      isCoreML: modelId.includes('coreml'),
      platform: modelId.includes('coreml') ? 'ios' : 'universal'
    }
  }
}

// Create singleton instance
const modelManager = new ModelManager()

export default modelManager