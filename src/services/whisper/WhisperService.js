/**
 * Whisper Transcription Service
 * Handles Whisper.cpp WASM loading and audio transcription
 */

import modelCacheService from './ModelCacheService.js';
import { WHISPER_MODELS, WHISPER_WASM, getRecommendedModel } from '../../config/modelConfig.js';

class WhisperService {
  constructor() {
    this.isInitialized = false;
    this.isLoading = false;
    this.whisperModule = null;
    this.model = null;
    this.currentModelId = null;
  }

  /**
   * Initialize Whisper with automatic model selection
   */
  async initialize(options = {}) {
    if (this.isInitialized && !options.forceReload) {
      return true;
    }

    if (this.isLoading) {
      throw new Error('Whisper is already being initialized');
    }

    try {
      this.isLoading = true;

      const {
        modelId = null,
        progressCallback = null,
        autoSelectModel = true
      } = options;

      console.log('🤖 Initializing Whisper.cpp WASM...');

      // Step 1: Load WASM module
      if (progressCallback) {
        progressCallback({
          stage: 'loading_wasm',
          progress: 10,
          message: 'Loading Whisper WASM module...'
        });
      }

      await this.loadWASM();

      // Step 2: Determine model to use
      let selectedModelId = modelId;
      if (!selectedModelId && autoSelectModel) {
        const recommended = getRecommendedModel();
        selectedModelId = recommended.id;
        console.log(`📱 Auto-selected model: ${selectedModelId} (${recommended.description})`);
      }

      if (!selectedModelId) {
        throw new Error('No model specified and auto-selection disabled');
      }

      // Step 3: Get/download model
      if (progressCallback) {
        progressCallback({
          stage: 'loading_model',
          progress: 30,
          message: `Preparing model: ${selectedModelId}...`
        });
      }

      const modelBlob = await modelCacheService.getModel(selectedModelId, (progress) => {
        if (progressCallback) {
          const scaledProgress = 30 + (progress.progress * 0.5); // Scale to 30-80% range
          progressCallback({
            stage: progress.type === 'download' ? 'downloading_model' : 'loading_model',
            progress: scaledProgress,
            message: progress.type === 'download' ?
              `Downloading ${selectedModelId}: ${progress.receivedMB || 0}MB / ${progress.totalMB || '?'}MB` :
              `Loading model: ${selectedModelId}`,
            ...progress
          });
        }
      });

      // Step 4: Initialize model
      if (progressCallback) {
        progressCallback({
          stage: 'initializing_model',
          progress: 85,
          message: 'Initializing model...'
        });
      }

      await this.loadModel(modelBlob, selectedModelId);

      this.currentModelId = selectedModelId;
      this.isInitialized = true;
      this.isLoading = false;

      if (progressCallback) {
        progressCallback({
          stage: 'ready',
          progress: 100,
          message: `Ready! Using ${selectedModelId} model`
        });
      }

      console.log(`✅ Whisper initialized with ${selectedModelId} model`);
      return true;

    } catch (error) {
      this.isLoading = false;
      this.isInitialized = false;
      console.error('❌ Whisper initialization failed:', error);
      throw error;
    }
  }

  /**
   * Load WASM module
   */
  async loadWASM() {
    if (this.whisperModule) return;

    // For now, we'll use a simple approach - in production you'd load the actual WASM
    // This is a placeholder that simulates WASM loading
    return new Promise((resolve) => {
      setTimeout(() => {
        this.whisperModule = {
          // Placeholder WASM module simulation
          loadModel: async (modelData) => ({ success: true, modelData }),
          transcribe: async (audioData, options) => this.simulateTranscription(audioData, options)
        };
        console.log('✅ Whisper WASM module loaded (simulated)');
        resolve();
      }, 500);
    });
  }

  /**
   * Load model into WASM
   */
  async loadModel(modelBlob, modelId) {
    if (!this.whisperModule) {
      throw new Error('WASM module not loaded');
    }

    console.log(`📚 Loading ${modelId} model into WASM...`);

    // Convert blob to ArrayBuffer
    const arrayBuffer = await modelBlob.arrayBuffer();

    // Load model (placeholder - in real implementation this would load into WASM)
    this.model = await this.whisperModule.loadModel(new Uint8Array(arrayBuffer));

    console.log(`✅ Model ${modelId} loaded successfully`);
  }

  /**
   * Transcribe audio data
   */
  async transcribe(audioData, options = {}) {
    if (!this.isInitialized) {
      throw new Error('Whisper not initialized. Call initialize() first.');
    }

    try {
      console.log('🎯 Starting Whisper transcription...');

      const {
        language = 'en',
        progressCallback = null
      } = options;

      if (progressCallback) {
        progressCallback({
          stage: 'preprocessing',
          progress: 10,
          message: 'Preprocessing audio...'
        });
      }

      // Preprocess audio
      const processedAudio = await this.preprocessAudio(audioData);

      if (progressCallback) {
        progressCallback({
          stage: 'transcribing',
          progress: 50,
          message: 'Transcribing audio...'
        });
      }

      // Transcribe with WASM
      const result = await this.whisperModule.transcribe(processedAudio, {
        language,
        model: this.currentModelId
      });

      if (progressCallback) {
        progressCallback({
          stage: 'complete',
          progress: 100,
          message: 'Transcription complete!'
        });
      }

      console.log('✅ Whisper transcription completed');

      return {
        success: true,
        text: result.text,
        segments: result.segments || [],
        duration: result.duration || 0,
        language: result.language || language,
        model: this.currentModelId,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ Whisper transcription failed:', error);
      return {
        success: false,
        error: error.message,
        text: '',
        timestamp: new Date().toISOString()
      };
    }
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
   * Simulate transcription (placeholder for development)
   * In production, this would be handled by the actual WASM module
   */
  async simulateTranscription(audioData, options) {
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

    // Generate simulated result
    const modelName = WHISPER_MODELS[this.currentModelId]?.name || 'unknown';
    const duration = audioData.length / 16000; // Approximate duration

    return {
      text: `[Simulated transcription using ${modelName}] This is a placeholder transcription result. The audio was ${duration.toFixed(1)} seconds long. In production, this would be the actual Whisper.cpp transcription.`,
      segments: [
        {
          text: `[Simulated transcription using ${modelName}]`,
          start: 0,
          end: 1000
        },
        {
          text: "This is a placeholder transcription result.",
          start: 1000,
          end: 3000
        }
      ],
      duration: duration,
      language: options.language || 'en'
    };
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      isLoading: this.isLoading,
      currentModel: this.currentModelId,
      modelInfo: this.currentModelId ? WHISPER_MODELS[this.currentModelId] : null,
      ready: this.isInitialized && !this.isLoading
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
    if (this.model) {
      // In real implementation, free WASM model memory
      this.model = null;
    }

    this.whisperModule = null;
    this.currentModelId = null;
    this.isInitialized = false;
    this.isLoading = false;

    console.log('🧹 Whisper service destroyed');
  }
}

// Export singleton
const whisperService = new WhisperService();
export default whisperService;