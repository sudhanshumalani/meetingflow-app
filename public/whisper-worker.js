/**
 * Whisper Worker - Real Whisper.cpp Integration
 * This runs Whisper processing in a Web Worker to avoid blocking the main thread
 */

// Import Whisper.js from CDN - using a more stable implementation
importScripts('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.1/dist/transformers.min.js');

let whisperInstance = null;
let currentModel = null;

self.onmessage = async function(e) {
  const { type, data } = e.data;

  try {
    switch (type) {
      case 'init':
        await initializeWhisper(data);
        break;
      case 'load-model':
        await loadModel(data);
        break;
      case 'transcribe':
        await transcribeAudio(data);
        break;
      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      error: error.message
    });
  }
};

async function initializeWhisper(config) {
  try {
    // Initialize Transformers.js
    if (typeof Transformers !== 'undefined') {
      // Set up the environment for transformers.js
      Transformers.env.allowRemoteModels = true;
      Transformers.env.allowLocalModels = true;

      whisperInstance = {
        ready: true,
        pipeline: null
      };

      self.postMessage({
        type: 'init-complete',
        success: true
      });
    } else {
      throw new Error('Transformers.js not loaded');
    }
  } catch (error) {
    self.postMessage({
      type: 'init-complete',
      success: false,
      error: error.message
    });
  }
}

async function loadModel(data) {
  try {
    const { modelBuffer, modelId } = data;

    // Create the ASR pipeline with the model
    const { pipeline } = Transformers;

    // Map model IDs to Hugging Face model names
    const modelMap = {
      'tiny': 'Xenova/whisper-tiny.en',
      'base': 'Xenova/whisper-base.en',
      'small': 'Xenova/whisper-small.en',
      'medium': 'Xenova/whisper-medium.en',
      'large': 'Xenova/whisper-large'
    };

    const huggingFaceModelId = modelMap[modelId] || 'Xenova/whisper-base.en';

    // Initialize the pipeline
    whisperInstance.pipeline = await pipeline('automatic-speech-recognition', huggingFaceModelId, {
      quantized: false,
    });

    currentModel = {
      id: modelId,
      pipeline: whisperInstance.pipeline
    };

    self.postMessage({
      type: 'model-loaded',
      success: true,
      modelId: modelId
    });
  } catch (error) {
    self.postMessage({
      type: 'model-loaded',
      success: false,
      error: error.message
    });
  }
}

async function transcribeAudio(data) {
  try {
    const { audioBuffer, options = {} } = data;

    if (!currentModel || !currentModel.pipeline) {
      throw new Error('No model loaded');
    }

    // Convert Float32Array to the format expected by transformers.js
    const audioData = new Float32Array(audioBuffer);

    // Run transcription using the pipeline
    const result = await currentModel.pipeline(audioData, {
      language: options.language || 'english',
      task: 'transcribe',
      return_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5
    });

    // Format the result to match our expected structure
    const formattedResult = {
      text: result.text || '',
      segments: result.chunks ? result.chunks.map(chunk => ({
        text: chunk.text,
        start: chunk.timestamp[0] * 1000,
        end: chunk.timestamp[1] * 1000
      })) : [],
      language: options.language || 'en'
    };

    self.postMessage({
      type: 'transcribe-complete',
      success: true,
      result: formattedResult
    });

  } catch (error) {
    self.postMessage({
      type: 'transcribe-complete',
      success: false,
      error: error.message
    });
  }
}