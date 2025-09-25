/**
 * Model Cache Service for Whisper Models
 * Handles downloading, caching, and management of Whisper models using IndexedDB
 */

import { WHISPER_MODELS, CDN_CONFIG } from '../../config/modelConfig.js';

class ModelCacheService {
  constructor() {
    this.dbName = 'WhisperModelCache';
    this.dbVersion = 1;
    this.storeName = 'models';
    this.metadataStore = 'metadata';
    this.db = null;
  }

  /**
   * Initialize IndexedDB
   */
  async initDB() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(request.error);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create models store
        if (!db.objectStoreNames.contains(this.storeName)) {
          const modelsStore = db.createObjectStore(this.storeName, { keyPath: 'modelId' });
          modelsStore.createIndex('downloadDate', 'downloadDate');
          modelsStore.createIndex('size', 'size');
          modelsStore.createIndex('version', 'version');
        }

        // Create metadata store for cache stats
        if (!db.objectStoreNames.contains(this.metadataStore)) {
          db.createObjectStore(this.metadataStore);
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };
    });
  }

  /**
   * Check if model is cached
   */
  async isModelCached(modelId) {
    await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(modelId);

      request.onsuccess = () => {
        resolve(!!request.result && request.result.data);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get cached model
   */
  async getCachedModel(modelId) {
    await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(modelId);

      request.onsuccess = () => {
        const result = request.result;
        if (result && result.data) {
          console.log(`✅ Model ${modelId} loaded from cache`);
          resolve(result.data);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Download model from CDN with progress tracking
   */
  async downloadModel(modelId, progressCallback = null) {
    const modelConfig = WHISPER_MODELS[modelId];
    if (!modelConfig) {
      throw new Error(`Unknown model: ${modelId}`);
    }

    console.log(`📥 Downloading model ${modelId} (${modelConfig.size}) from CDN...`);

    try {
      // Try primary CDN first
      const modelBlob = await this._downloadWithProgress(
        modelConfig.url,
        modelConfig.sizeBytes,
        progressCallback
      );

      // Cache the model
      await this._cacheModel(modelId, modelBlob, modelConfig);

      console.log(`✅ Model ${modelId} downloaded and cached successfully`);
      return modelBlob;

    } catch (error) {
      console.error(`❌ Primary CDN download failed for ${modelId}:`, error);

      // Try fallback CDN
      try {
        const fallbackUrl = CDN_CONFIG.fallback.baseUrl + modelConfig.name;
        console.log(`🔄 Trying fallback CDN: ${fallbackUrl}`);

        const modelBlob = await this._downloadWithProgress(
          fallbackUrl,
          modelConfig.sizeBytes,
          progressCallback
        );

        await this._cacheModel(modelId, modelBlob, modelConfig);
        console.log(`✅ Model ${modelId} downloaded from fallback CDN`);
        return modelBlob;

      } catch (fallbackError) {
        console.error(`❌ Fallback CDN also failed for ${modelId}:`, fallbackError);
        throw new Error(`Failed to download model ${modelId} from all CDNs`);
      }
    }
  }

  /**
   * Download with progress tracking
   */
  async _downloadWithProgress(url, expectedSize, progressCallback) {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentLength = parseInt(response.headers.get('content-length'), 10) || expectedSize;
    const reader = response.body.getReader();
    const chunks = [];
    let receivedLength = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      receivedLength += value.length;

      // Report progress
      if (progressCallback) {
        const progress = Math.min(99, (receivedLength / contentLength) * 100);
        progressCallback({
          type: 'download',
          progress: progress,
          receivedBytes: receivedLength,
          totalBytes: contentLength,
          receivedMB: (receivedLength / (1024 * 1024)).toFixed(1),
          totalMB: (contentLength / (1024 * 1024)).toFixed(1)
        });
      }
    }

    // Create blob from chunks
    const blob = new Blob(chunks);

    if (progressCallback) {
      progressCallback({
        type: 'download',
        progress: 100,
        receivedBytes: blob.size,
        totalBytes: contentLength,
        complete: true
      });
    }

    return blob;
  }

  /**
   * Cache model in IndexedDB
   */
  async _cacheModel(modelId, blob, modelConfig) {
    await this.initDB();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);

      const modelRecord = {
        modelId,
        data: blob,
        size: blob.size,
        downloadDate: new Date().toISOString(),
        version: '1.0',
        config: modelConfig
      };

      const request = store.put(modelRecord);

      request.onsuccess = () => {
        console.log(`💾 Model ${modelId} cached in IndexedDB`);
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Delete cached model
   */
  async deleteCachedModel(modelId) {
    await this.initDB();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(modelId);

      request.onsuccess = () => {
        console.log(`🗑️ Model ${modelId} deleted from cache`);
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get cache statistics
   */
  async getCacheStats() {
    await this.initDB();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        const models = request.result;
        const totalSize = models.reduce((sum, model) => sum + (model.size || 0), 0);

        resolve({
          modelCount: models.length,
          totalSizeBytes: totalSize,
          totalSizeMB: (totalSize / (1024 * 1024)).toFixed(1),
          models: models.map(model => ({
            modelId: model.modelId,
            sizeMB: ((model.size || 0) / (1024 * 1024)).toFixed(1),
            downloadDate: model.downloadDate,
            config: model.config
          }))
        });
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear all cached models
   */
  async clearCache() {
    await this.initDB();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();

      request.onsuccess = () => {
        console.log('🧹 All models cleared from cache');
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Check storage quota and availability
   */
  async checkStorageQuota() {
    if (!('storage' in navigator) || !('estimate' in navigator.storage)) {
      return { available: true, quota: null, usage: null, warning: 'Storage API not supported' };
    }

    try {
      const estimate = await navigator.storage.estimate();
      const availableBytes = estimate.quota - estimate.usage;
      const availableMB = availableBytes / (1024 * 1024);

      return {
        available: availableMB > 100, // Need at least 100MB
        quota: estimate.quota,
        usage: estimate.usage,
        available: availableBytes,
        quotaMB: (estimate.quota / (1024 * 1024)).toFixed(1),
        usageMB: (estimate.usage / (1024 * 1024)).toFixed(1),
        availableMB: availableMB.toFixed(1),
        warning: availableMB < 500 ? 'Low storage space available' : null
      };
    } catch (error) {
      console.error('Failed to check storage quota:', error);
      return { available: true, quota: null, usage: null, warning: 'Could not check storage' };
    }
  }

  /**
   * Get or download model (main entry point)
   */
  async getModel(modelId, progressCallback = null) {
    // Check if already cached
    const cached = await this.getCachedModel(modelId);
    if (cached) {
      if (progressCallback) {
        progressCallback({
          type: 'cache_hit',
          progress: 100,
          message: `Model ${modelId} loaded from cache`
        });
      }
      return cached;
    }

    // Check storage before downloading
    const storage = await this.checkStorageQuota();
    const modelConfig = WHISPER_MODELS[modelId];

    if (!storage.available || (storage.availableMB && storage.availableMB < (modelConfig.sizeBytes / (1024 * 1024)))) {
      throw new Error('Insufficient storage space for model download');
    }

    // Download and cache
    return await this.downloadModel(modelId, progressCallback);
  }
}

// Export singleton
const modelCacheService = new ModelCacheService();
export default modelCacheService;