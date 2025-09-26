/**
 * Service Worker Whisper Integration
 * Handles whisper.cpp WASM model caching and execution via Service Worker
 */

class ServiceWorkerWhisper {
  constructor() {
    this.isInitialized = false;
    this.isLoading = false;
    this.currentModelId = null;
    this.serviceWorkerReady = false;
    this.messageChannel = null;

    // Web Worker for main thread Whisper processing
    this.whisperWorker = null;
    this.whisperWorkerReady = false;
    this.pendingMessages = new Map();
  }

  /**
   * Initialize Service Worker Whisper system
   */
  async initialize(options = {}) {
    if (this.isInitialized && !options.forceReload) {
      return true;
    }

    if (this.isLoading) {
      throw new Error('ServiceWorkerWhisper is already being initialized');
    }

    try {
      this.isLoading = true;
      const {
        modelId = 'base',
        progressCallback = null
      } = options;

      console.log('🔧 Initializing Service Worker Whisper...');

      // Step 1: Initialize Service Worker communication
      if (progressCallback) {
        progressCallback({
          stage: 'initializing_sw',
          progress: 10,
          message: 'Setting up Service Worker communication...'
        });
      }

      await this.initServiceWorkerCommunication();

      // Step 2: Check if model is cached
      if (progressCallback) {
        progressCallback({
          stage: 'checking_cache',
          progress: 30,
          message: 'Checking model cache...'
        });
      }

      const isCached = await this.isModelCached(modelId);

      if (!isCached) {
        // Step 3: Download and cache model
        if (progressCallback) {
          progressCallback({
            stage: 'downloading_model',
            progress: 40,
            message: `Downloading ${modelId} model...`
          });
        }

        await this.downloadAndCacheModel(modelId, (downloadProgress) => {
          if (progressCallback) {
            const scaledProgress = Math.min(80, 40 + (downloadProgress * 0.4));
            progressCallback({
              stage: 'downloading_model',
              progress: scaledProgress,
              message: `Downloading ${modelId}: ${downloadProgress}%`
            });
          }
        });
      }

      // Step 4: Initialize WASM module
      if (progressCallback) {
        progressCallback({
          stage: 'loading_wasm',
          progress: 85,
          message: 'Loading Whisper WASM module...'
        });
      }

      await this.initializeWhisperWASM(modelId);

      this.currentModelId = modelId;
      this.isInitialized = true;
      this.isLoading = false;

      if (progressCallback) {
        progressCallback({
          stage: 'ready',
          progress: 100,
          message: `Ready! Using ${modelId} model`
        });
      }

      console.log(`✅ Service Worker Whisper initialized with ${modelId} model`);
      return true;

    } catch (error) {
      this.isLoading = false;
      this.isInitialized = false;
      console.error('❌ Service Worker Whisper initialization failed:', error);
      throw error;
    }
  }

  /**
   * Initialize Service Worker communication
   */
  async initServiceWorkerCommunication() {
    if (!('serviceWorker' in navigator)) {
      throw new Error('Service Worker not supported in this browser');
    }

    // Wait for service worker to be ready
    const registration = await navigator.serviceWorker.ready;
    console.log('✅ Service Worker ready');

    // Create message channel for communication
    this.messageChannel = new MessageChannel();
    this.serviceWorkerReady = true;

    // Set up message handling
    this.messageChannel.port1.onmessage = (event) => {
      this.handleServiceWorkerMessage(event.data);
    };

    // Try to send port to service worker (may not be supported by default VitePWA)
    if (registration.active) {
      try {
        registration.active.postMessage({
          type: 'INIT_WHISPER_CHANNEL'
        }, [this.messageChannel.port2]);
      } catch (error) {
        console.warn('Service Worker communication not supported, using fallback');
        // For now, we'll simulate the service worker functionality
        setTimeout(() => {
          this.serviceWorkerReady = true;
        }, 100);
      }
    }
  }

  /**
   * Handle messages from Service Worker
   */
  async handleServiceWorkerMessage(message) {
    console.log('📨 Received from Service Worker:', message);

    // Handle delegation to main thread
    if (message.type === 'DELEGATE_TO_MAIN_THREAD') {
      console.log('🔄 Service Worker delegated task to main thread:', message.originalMessage.type);

      // Initialize Web Worker if not already done
      if (!this.whisperWorker || !this.whisperWorkerReady) {
        await this.initializeWhisperWorker();
      }

      // Handle the original message using Web Worker
      await this.handleWebWorkerMessage(message.originalMessage, message.messageId);
    }
  }

  /**
   * Initialize Web Worker in main thread
   */
  async initializeWhisperWorker() {
    if (this.whisperWorker && this.whisperWorkerReady) {
      return this.whisperWorker;
    }

    try {
      console.log('🔧 Initializing Whisper Web Worker in main thread...');

      // Create Web Worker from separate file
      this.whisperWorker = new Worker('./src/whisperWorker.js', { type: 'module' });

      // Set up message handling
      this.whisperWorker.addEventListener('message', (event) => {
        const { type, messageId, ...data } = event.data;

        console.log('📨 Received from Web Worker:', type, messageId);

        // Handle Web Worker responses
        if (type === 'LOADING_PROGRESS') {
          console.log('📥 Web Worker loading progress:', data);
        }

        // Forward responses to pending message handlers
        if (messageId && this.pendingMessages.has(messageId)) {
          const callback = this.pendingMessages.get(messageId);
          callback(event.data);
          this.pendingMessages.delete(messageId);
        }
      });

      this.whisperWorker.addEventListener('error', (error) => {
        console.error('❌ Web Worker error:', error);
        this.whisperWorkerReady = false;
      });

      this.whisperWorkerReady = true;
      console.log('✅ Whisper Web Worker initialized in main thread');

      return this.whisperWorker;

    } catch (error) {
      console.error('❌ Failed to initialize Web Worker in main thread:', error);
      throw new Error(`Failed to initialize Web Worker: ${error.message}`);
    }
  }

  /**
   * Handle messages using Web Worker
   */
  async handleWebWorkerMessage(originalMessage, serviceWorkerMessageId) {
    const { type } = originalMessage;

    try {
      switch (type) {
        case 'DOWNLOAD_MODEL':
          // Web Worker handles model downloading automatically during initialization
          // Send success response back through Service Worker communication
          if (this.messageChannel && this.messageChannel.port1) {
            this.messageChannel.port1.postMessage({
              type: 'MODEL_DOWNLOADED',
              messageId: serviceWorkerMessageId,
              success: true
            });
          }
          break;

        case 'INIT_WHISPER_WASM':
          // Initialize Web Worker with specified model
          const initResult = await this.sendWorkerMessage('INITIALIZE', {
            modelId: originalMessage.modelId || 'base'
          });

          // Send response back through Service Worker communication
          if (this.messageChannel && this.messageChannel.port1) {
            this.messageChannel.port1.postMessage({
              type: 'WHISPER_INITIALIZED',
              messageId: serviceWorkerMessageId,
              success: initResult.success,
              modelId: initResult.modelId
            });
          }
          break;

        case 'TRANSCRIBE_AUDIO':
          // Perform transcription using Web Worker
          const transcribeResult = await this.sendWorkerMessage('TRANSCRIBE', {
            audioData: originalMessage.audioData,
            options: originalMessage.options || {}
          });

          // Send response back through Service Worker communication
          if (this.messageChannel && this.messageChannel.port1) {
            this.messageChannel.port1.postMessage({
              type: 'TRANSCRIPTION_RESULT',
              messageId: serviceWorkerMessageId,
              success: transcribeResult.success,
              text: transcribeResult.text,
              segments: transcribeResult.segments,
              duration: transcribeResult.duration,
              language: transcribeResult.language,
              model: transcribeResult.model
            });
          }
          break;

        default:
          console.warn('Unknown delegated message type:', type);
      }
    } catch (error) {
      console.error('Error handling Web Worker message:', error);

      // Send error response back through Service Worker communication
      if (this.messageChannel && this.messageChannel.port1) {
        this.messageChannel.port1.postMessage({
          type: 'ERROR',
          messageId: serviceWorkerMessageId,
          error: error.message
        });
      }
    }
  }

  /**
   * Send message to Web Worker and wait for response
   */
  sendWorkerMessage(type, data = {}) {
    return new Promise((resolve, reject) => {
      if (!this.whisperWorker || !this.whisperWorkerReady) {
        reject(new Error('Web Worker not ready'));
        return;
      }

      const messageId = `${type}_${Date.now()}_${Math.random()}`;

      // Store callback for response
      this.pendingMessages.set(messageId, (response) => {
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.error || 'Unknown Web Worker error'));
        }
      });

      // Send message to worker
      this.whisperWorker.postMessage({
        type,
        messageId,
        ...data
      });

      // Set timeout for message
      setTimeout(() => {
        if (this.pendingMessages.has(messageId)) {
          this.pendingMessages.delete(messageId);
          reject(new Error(`Web Worker ${type} timeout`));
        }
      }, 300000); // 5 minute timeout
    });
  }

  /**
   * Check if model is cached
   */
  async isModelCached(modelId) {
    return new Promise((resolve) => {
      if (!this.serviceWorkerReady) {
        resolve(false);
        return;
      }

      // For default VitePWA, we'll check Cache API directly
      this.checkCacheDirectly(modelId).then(resolve).catch(() => resolve(false));
    });
  }

  /**
   * Check cache directly using Cache API
   */
  async checkCacheDirectly(modelId) {
    try {
      const cache = await caches.open('whisper-models');
      const modelUrls = {
        'tiny': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin',
        'base': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin',
        'small': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin'
      };
      const response = await cache.match(modelUrls[modelId]);
      return !!response;
    } catch (error) {
      console.warn('Cache check failed:', error);
      return false;
    }
  }

  /**
   * Download and cache model
   */
  async downloadAndCacheModel(modelId, progressCallback = null) {
    const modelUrls = {
      'tiny': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin',
      'base': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin',
      'small': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin'
    };

    const wasmUrl = 'https://cdn.jsdelivr.net/npm/whisper-cpp-wasm@1.0.0/dist/whisper.wasm';

    return new Promise((resolve, reject) => {
      if (!this.serviceWorkerReady) {
        reject(new Error('Service Worker not ready'));
        return;
      }

      const messageId = `download_${Date.now()}`;

      // Add timeout for download operation (5 minutes)
      const downloadTimeout = setTimeout(() => {
        this.messageChannel.port1.removeEventListener('message', handleResponse);
        reject(new Error(`Model download timeout after 5 minutes for ${modelId}`));
      }, 300000);

      const handleResponse = (event) => {
        if (event.data.messageId === messageId) {
          if (event.data.type === 'DOWNLOAD_PROGRESS' && progressCallback) {
            progressCallback(event.data.progress);
          } else if (event.data.type === 'DOWNLOAD_COMPLETE') {
            clearTimeout(downloadTimeout);
            this.messageChannel.port1.removeEventListener('message', handleResponse);
            if (event.data.success) {
              resolve();
            } else {
              reject(new Error(event.data.error));
            }
          }
        }
      };

      this.messageChannel.port1.addEventListener('message', handleResponse);

      this.messageChannel.port1.postMessage({
        type: 'DOWNLOAD_MODEL',
        modelId,
        modelUrl: modelUrls[modelId],
        wasmUrl,
        messageId
      });
    });
  }

  /**
   * Initialize Whisper WASM module
   */
  async initializeWhisperWASM(modelId) {
    return new Promise((resolve, reject) => {
      if (!this.serviceWorkerReady) {
        reject(new Error('Service Worker not ready'));
        return;
      }

      const messageId = `init_wasm_${Date.now()}`;

      const handleResponse = (event) => {
        if (event.data.messageId === messageId) {
          this.messageChannel.port1.removeEventListener('message', handleResponse);
          if (event.data.success) {
            resolve();
          } else {
            reject(new Error(event.data.error));
          }
        }
      };

      this.messageChannel.port1.addEventListener('message', handleResponse);

      this.messageChannel.port1.postMessage({
        type: 'INIT_WHISPER_WASM',
        modelId,
        messageId
      });
    });
  }

  /**
   * Transcribe audio data
   */
  async transcribe(audioData, options = {}) {
    if (!this.isInitialized) {
      throw new Error('ServiceWorkerWhisper not initialized');
    }

    const {
      language = 'en',
      progressCallback = null
    } = options;

    console.log('🎯 Starting Service Worker transcription...');

    // Preprocess audio
    const processedAudio = await this.preprocessAudio(audioData);

    return new Promise((resolve, reject) => {
      const messageId = `transcribe_${Date.now()}`;

      const handleResponse = (event) => {
        if (event.data.messageId === messageId) {
          if (event.data.type === 'TRANSCRIBE_PROGRESS' && progressCallback) {
            progressCallback(event.data.progress);
          } else if (event.data.type === 'TRANSCRIBE_COMPLETE') {
            this.messageChannel.port1.removeEventListener('message', handleResponse);
            if (event.data.success) {
              resolve({
                success: true,
                text: event.data.result.text,
                segments: event.data.result.segments || [],
                duration: event.data.result.duration || 0,
                language: language,
                model: this.currentModelId,
                timestamp: new Date().toISOString()
              });
            } else {
              resolve({
                success: false,
                error: event.data.error,
                text: '',
                timestamp: new Date().toISOString()
              });
            }
          }
        }
      };

      this.messageChannel.port1.addEventListener('message', handleResponse);

      this.messageChannel.port1.postMessage({
        type: 'TRANSCRIBE_AUDIO',
        audioData: processedAudio,
        options: { language },
        messageId
      });
    });
  }

  /**
   * Preprocess audio for Whisper (16kHz mono)
   */
  async preprocessAudio(audioData) {
    try {
      let audioBuffer;

      // Handle different input types
      if (audioData instanceof Blob) {
        const arrayBuffer = await audioData.arrayBuffer();
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      } else if (audioData instanceof AudioBuffer) {
        audioBuffer = audioData;
      } else {
        throw new Error('Unsupported audio data type');
      }

      // Convert to 16kHz mono
      const targetSampleRate = 16000;
      const samples = this.resampleToMono(audioBuffer, targetSampleRate);

      console.log(`🔧 Audio preprocessed: ${samples.length} samples at ${targetSampleRate}Hz`);
      return samples;

    } catch (error) {
      console.error('❌ Audio preprocessing failed:', error);
      throw new Error(`Audio preprocessing failed: ${error.message}`);
    }
  }

  /**
   * Resample audio to 16kHz mono
   */
  resampleToMono(audioBuffer, targetSampleRate = 16000) {
    const sourceSampleRate = audioBuffer.sampleRate;
    const channels = audioBuffer.numberOfChannels;

    // Convert to mono
    let monoData;
    if (channels === 1) {
      monoData = audioBuffer.getChannelData(0);
    } else {
      const left = audioBuffer.getChannelData(0);
      const right = channels > 1 ? audioBuffer.getChannelData(1) : left;
      monoData = new Float32Array(left.length);
      for (let i = 0; i < left.length; i++) {
        monoData[i] = (left[i] + right[i]) / 2;
      }
    }

    // Resample if needed
    if (sourceSampleRate === targetSampleRate) {
      return monoData;
    }

    const ratio = targetSampleRate / sourceSampleRate;
    const outputLength = Math.floor(monoData.length * ratio);
    const outputData = new Float32Array(outputLength);

    // Linear interpolation resampling
    for (let i = 0; i < outputLength; i++) {
      const sourceIndex = i / ratio;
      const index = Math.floor(sourceIndex);
      const fraction = sourceIndex - index;

      if (index + 1 < monoData.length) {
        outputData[i] = monoData[index] * (1 - fraction) + monoData[index + 1] * fraction;
      } else {
        outputData[i] = monoData[index];
      }
    }

    return outputData;
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      isLoading: this.isLoading,
      currentModel: this.currentModelId,
      serviceWorkerReady: this.serviceWorkerReady,
      ready: this.isInitialized && !this.isLoading && this.serviceWorkerReady
    };
  }

  /**
   * Switch to different model
   */
  async switchModel(modelId, progressCallback = null) {
    if (this.currentModelId === modelId) {
      console.log(`Model ${modelId} is already loaded`);
      return;
    }

    console.log(`🔄 Switching from ${this.currentModelId} to ${modelId}`);
    this.isInitialized = false;

    await this.initialize({
      modelId,
      progressCallback,
      forceReload: true
    });
  }

  /**
   * Clean up resources
   */
  destroy() {
    if (this.messageChannel) {
      this.messageChannel.port1.close();
      this.messageChannel = null;
    }

    this.currentModelId = null;
    this.isInitialized = false;
    this.isLoading = false;
    this.serviceWorkerReady = false;

    console.log('🧹 Service Worker Whisper destroyed');
  }
}

// Export singleton
const serviceWorkerWhisper = new ServiceWorkerWhisper();
export default serviceWorkerWhisper;