/**
 * Dedicated Web Worker for Whisper.js Processing
 * This runs in a separate Web Worker context with full ES6 module support
 */

import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.1.0/dist/transformers.min.js'

// Configure environment for Web Worker
env.allowLocalModels = false
env.allowRemoteModels = true
env.useBrowserCache = true
env.backends.onnx.wasm.numThreads = navigator.hardwareConcurrency || 4

let whisperPipeline = null
let currentModelId = null

console.log('🔧 Whisper Web Worker initialized')

/**
 * Initialize Whisper pipeline
 */
async function initializePipeline(modelId) {
  try {
    console.log(`🤖 Web Worker: Initializing Whisper pipeline with ${modelId}`)

    // Map model IDs to HuggingFace models
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    const modelMap = {
      'tiny': isMobile ? 'onnx-community/whisper-tiny' : 'onnx-community/whisper-tiny.en',
      'base': isMobile ? 'onnx-community/whisper-base' : 'onnx-community/whisper-base.en',
      'small': isMobile ? 'onnx-community/whisper-small' : 'onnx-community/whisper-small.en'
    }

    const hfModelId = modelMap[modelId] || modelMap['base']

    // Create pipeline
    whisperPipeline = await pipeline('automatic-speech-recognition', hfModelId, {
      device: 'wasm',
      dtype: {
        encoder_model: 'fp32',
        decoder_model_merged: 'q4',
      },
      progress_callback: (data) => {
        // Send progress updates to main thread
        self.postMessage({
          type: 'LOADING_PROGRESS',
          data: data
        })
      }
    })

    currentModelId = modelId
    console.log(`✅ Web Worker: Pipeline initialized with ${hfModelId}`)

    return { success: true, modelId: hfModelId }

  } catch (error) {
    console.error('❌ Web Worker: Failed to initialize pipeline:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Transcribe audio using the initialized pipeline
 */
async function transcribeAudio(audioData, options = {}) {
  try {
    if (!whisperPipeline) {
      throw new Error('Whisper pipeline not initialized')
    }

    console.log('🎯 Web Worker: Starting transcription...')

    // Perform transcription
    const result = await whisperPipeline(audioData, {
      language: options.language || 'english',
      return_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5,
    })

    console.log('✅ Web Worker: Transcription completed')

    // Format result
    return {
      success: true,
      text: result.text || 'No speech detected',
      segments: result.chunks ? result.chunks.map(chunk => ({
        text: chunk.text,
        start: Math.round(chunk.timestamp[0] * 1000),
        end: Math.round(chunk.timestamp[1] * 1000)
      })) : [{
        text: result.text || 'No speech detected',
        start: 0,
        end: 5000
      }],
      duration: options.duration || 0,
      language: options.language || 'english',
      model: currentModelId
    }

  } catch (error) {
    console.error('❌ Web Worker: Transcription failed:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * Handle messages from main thread
 */
self.addEventListener('message', async (event) => {
  const { type, messageId, ...data } = event.data

  console.log(`📨 Web Worker: Received ${type} message`)

  try {
    let result

    switch (type) {
      case 'INITIALIZE':
        result = await initializePipeline(data.modelId)
        break

      case 'TRANSCRIBE':
        result = await transcribeAudio(data.audioData, data.options)
        break

      default:
        result = { success: false, error: `Unknown message type: ${type}` }
    }

    // Send response back to main thread
    self.postMessage({
      type: `${type}_RESPONSE`,
      messageId,
      ...result
    })

  } catch (error) {
    console.error(`❌ Web Worker: Error handling ${type}:`, error)

    self.postMessage({
      type: `${type}_RESPONSE`,
      messageId,
      success: false,
      error: error.message
    })
  }
})