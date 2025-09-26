/**
 * Enhanced Service Worker with PWA + Whisper.cpp WASM Integration (Development Version)
 * This is a simplified version for development that doesn't use ES modules
 */

// Whisper-specific caches
const WHISPER_CACHE_NAME = 'whisper-models-v1'
const WHISPER_WASM_CACHE = 'whisper-wasm-v1'

// Transformers.js for real Whisper processing
let transformersLoaded = false
let WhisperPipeline = null

// Whisper.cpp WASM integration
let whisperModule = null
let currentModel = null
let currentModelId = null

// Message ports for communication
const clientPorts = new Set()

console.log('🔧 Enhanced Service Worker (PWA + Whisper) installed - DEV MODE')

/**
 * Load Transformers.js library for Service Worker environment (Development Mode)
 */
async function loadTransformers() {
  if (transformersLoaded) {
    return WhisperPipeline
  }

  try {
    console.log('📦 Loading Transformers.js library for Service Worker (DEV)...')

    // Service Worker compatible import using importScripts
    try {
      // Import the UMD build which is more compatible with Service Workers
      importScripts('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.1.0/dist/transformers.min.js')

      // Access the global Transformers object
      const { pipeline, env } = self.Transformers || globalThis.Transformers

      if (!pipeline) {
        throw new Error('Transformers pipeline not found in global scope')
      }

      // Configure environment for Service Worker
      env.allowLocalModels = false
      env.allowRemoteModels = true
      env.useBrowserCache = false  // Important for Service Workers
      env.backends.onnx.wasm.numThreads = 1  // Single thread for SW

      console.log('✅ Transformers.js library loaded via importScripts (DEV)')
      transformersLoaded = true

      return pipeline

    } catch (importError) {
      console.log('📦 importScripts failed, trying dynamic import with polyfill (DEV)...')

      // Fallback: Create window polyfill for Service Worker
      if (typeof window === 'undefined') {
        self.window = self
        self.document = {
          createElement: () => ({}),
          createElementNS: () => ({}),
          getElementsByTagName: () => []
        }
        self.navigator = self.navigator || {
          userAgent: 'ServiceWorker'
        }
      }

      // Try dynamic import with polyfill
      const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.1.0/dist/transformers.min.js')

      // Configure environment for Service Worker
      env.allowLocalModels = false
      env.allowRemoteModels = true
      env.useBrowserCache = false
      env.backends.onnx.wasm.numThreads = 1

      console.log('✅ Transformers.js library loaded with polyfill (DEV)')
      transformersLoaded = true

      return pipeline
    }

  } catch (error) {
    console.error('❌ Failed to load Transformers.js (DEV):', error)
    throw new Error(`Failed to load Transformers.js: ${error.message}`)
  }
}

/**
 * Initialize Whisper pipeline with specified model (Development Mode)
 */
async function initializeWhisperPipeline(modelId) {
  try {
    const pipeline = await loadTransformers()

    // Map our model IDs to HuggingFace model names with mobile optimization
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    const modelMap = {
      'tiny': isMobile ? 'onnx-community/whisper-tiny' : 'onnx-community/whisper-tiny.en',
      'base': isMobile ? 'onnx-community/whisper-base' : 'onnx-community/whisper-base.en',
      'small': isMobile ? 'onnx-community/whisper-small' : 'onnx-community/whisper-small.en'
    }

    const hfModelId = modelMap[modelId] || modelMap['base']

    console.log(`🤖 Initializing Whisper pipeline (DEV) with model: ${hfModelId}`)

    // Create the pipeline with Service Worker specific configuration
    WhisperPipeline = await pipeline('automatic-speech-recognition', hfModelId, {
      device: 'wasm', // Use WASM backend for Service Worker compatibility
      dtype: {
        encoder_model: 'fp32',
        decoder_model_merged: 'q4', // Quantized for better performance
      },
      // Service Worker specific options
      progress_callback: (data) => {
        console.log('📥 Model loading progress (DEV):', data)
      },
      // Ensure WASM runs single-threaded in Service Worker
      processors: {
        device: 'wasm'
      }
    })

    console.log(`✅ Whisper pipeline initialized (DEV) with ${hfModelId}`)
    return WhisperPipeline
  } catch (error) {
    console.error('❌ Failed to initialize Whisper pipeline (DEV):', error)
    throw error
  }
}

/**
 * Service Worker Installation
 */
self.addEventListener('install', (event) => {
  console.log('🔧 Installing Enhanced Service Worker (PWA + Whisper) - DEV MODE')

  event.waitUntil(
    Promise.all([
      // Pre-cache essential Whisper files
      caches.open(WHISPER_WASM_CACHE).then((cache) => {
        return cache.addAll([
          // Pre-cache could include tiny model for immediate availability
          // 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin'
        ])
      }),
      // Allow immediate activation
      self.skipWaiting()
    ]).then(() => {
      console.log('✅ Enhanced Service Worker installed - DEV MODE')
    })
  )
})

/**
 * Service Worker Activation
 */
self.addEventListener('activate', (event) => {
  console.log('🚀 Activating Enhanced Service Worker (PWA + Whisper) - DEV MODE')

  event.waitUntil(
    Promise.all([
      // Clean up old caches
      cleanupOldCaches(),
      // Take control of all clients
      self.clients.claim()
    ]).then(() => {
      console.log('✅ Enhanced Service Worker activated - DEV MODE')
    })
  )
})

/**
 * Message handling from main thread
 */
self.addEventListener('message', async (event) => {
  const { data, ports } = event

  console.log('📨 Service Worker received message:', data?.type)

  // Handle port setup for Whisper communication
  if (data.type === 'INIT_WHISPER_CHANNEL' && ports && ports[0]) {
    clientPorts.add(ports[0])
    ports[0].onmessage = (messageEvent) => {
      handleWhisperMessage(messageEvent.data, ports[0])
    }
    console.log('📡 Whisper channel initialized')
    return
  }

  // Handle other PWA messages
  if (data && data.type === 'SKIP_WAITING') {
    self.skipWaiting()
    return
  }
})

/**
 * Handle Whisper-specific messages
 */
async function handleWhisperMessage(message, port) {
  const { type, messageId } = message

  console.log('🎯 Handling Whisper message:', type)

  try {
    switch (type) {
      case 'CHECK_MODEL_CACHE':
        const isCached = await isModelCached(message.modelId)
        port.postMessage({
          type: 'CACHE_CHECK_RESULT',
          messageId,
          isCached
        })
        break

      case 'DOWNLOAD_MODEL':
        await downloadModel(message, port)
        break

      case 'INIT_WHISPER_WASM':
        await initializeWhisperWASM(message, port)
        break

      case 'TRANSCRIBE_AUDIO':
        await transcribeAudio(message, port)
        break

      default:
        console.warn('Unknown Whisper message type:', type)
    }
  } catch (error) {
    console.error('Error handling Whisper message:', error)
    port.postMessage({
      type: 'ERROR',
      messageId,
      error: error.message
    })
  }
}

/**
 * Check if model is cached
 */
async function isModelCached(modelId) {
  try {
    const cache = await caches.open(WHISPER_CACHE_NAME)
    const modelUrl = getModelUrl(modelId)
    const response = await cache.match(modelUrl)
    return !!response
  } catch (error) {
    console.error('Error checking cache:', error)
    return false
  }
}

/**
 * Download and cache model
 */
async function downloadModel(message, port) {
  const { modelId, modelUrl, wasmUrl, messageId } = message

  try {
    console.log(`📥 Downloading model ${modelId}...`)

    // Open caches
    const modelCache = await caches.open(WHISPER_CACHE_NAME)
    const wasmCache = await caches.open(WHISPER_WASM_CACHE)

    // Download model with progress tracking
    const modelResponse = await fetch(modelUrl)
    if (!modelResponse.ok) {
      throw new Error(`Failed to download model: ${modelResponse.status}`)
    }

    const totalBytes = parseInt(modelResponse.headers.get('content-length')) || 0
    const reader = modelResponse.body.getReader()
    const chunks = []
    let receivedBytes = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      chunks.push(value)
      receivedBytes += value.length

      // Send progress update
      if (totalBytes > 0) {
        const progress = Math.round((receivedBytes / totalBytes) * 100)
        port.postMessage({
          type: 'DOWNLOAD_PROGRESS',
          messageId,
          progress
        })
      }
    }

    // Create response and cache it
    const modelBlob = new Response(new Uint8Array(chunks.reduce((acc, chunk) => {
      const newArray = new Uint8Array(acc.length + chunk.length)
      newArray.set(acc)
      newArray.set(chunk, acc.length)
      return newArray
    }, new Uint8Array())))

    await modelCache.put(modelUrl, modelBlob.clone())

    // Download and cache WASM if not already cached
    if (wasmUrl) {
      const wasmResponse = await wasmCache.match(wasmUrl)
      if (!wasmResponse) {
        console.log('📥 Downloading Whisper WASM...')
        const wasmFetch = await fetch(wasmUrl)
        if (wasmFetch.ok) {
          await wasmCache.put(wasmUrl, wasmFetch)
        }
      }
    }

    port.postMessage({
      type: 'DOWNLOAD_COMPLETE',
      messageId,
      success: true
    })

    console.log(`✅ Model ${modelId} downloaded and cached`)

  } catch (error) {
    console.error('Download failed:', error)
    port.postMessage({
      type: 'DOWNLOAD_COMPLETE',
      messageId,
      success: false,
      error: error.message
    })
  }
}

/**
 * Initialize Whisper WASM module
 */
async function initializeWhisperWASM(message, port) {
  const { modelId, messageId } = message

  try {
    console.log(`🤖 Initializing Whisper WASM for ${modelId} (DEV)...`)

    // Initialize the real Whisper pipeline using Transformers.js
    whisperModule = await initializeWhisperPipeline(modelId)

    currentModel = whisperModule
    currentModelId = modelId

    port.postMessage({
      type: 'WASM_INIT_COMPLETE',
      messageId,
      success: true
    })

    console.log(`✅ Whisper WASM initialized (DEV) with ${modelId}`)

  } catch (error) {
    console.error('WASM initialization failed (DEV):', error)
    port.postMessage({
      type: 'WASM_INIT_COMPLETE',
      messageId,
      success: false,
      error: error.message
    })
  }
}

/**
 * Transcribe audio using Whisper
 */
async function transcribeAudio(message, port) {
  const { audioData, options, messageId } = message

  try {
    if (!currentModel) {
      throw new Error('Whisper model not initialized')
    }

    console.log(`🎯 Starting transcription with ${currentModelId} (DEV)...`)

    // Send progress update
    port.postMessage({
      type: 'TRANSCRIBE_PROGRESS',
      messageId,
      progress: { stage: 'processing', progress: 25 }
    })

    // Calculate duration properly for different audio data types
    let duration = 5.0; // Default fallback
    if (audioData && typeof audioData.length === 'number') {
      // Float32Array or similar
      duration = audioData.length / 16000;
    } else if (audioData && typeof audioData.size === 'number') {
      // Blob - estimate duration (not exact but reasonable)
      duration = audioData.size / (16000 * 2); // 16kHz * 2 bytes per sample
    } else if (audioData && audioData.byteLength) {
      // ArrayBuffer
      duration = audioData.byteLength / (16000 * 2);
    }

    console.log(`📊 Audio data type: ${typeof audioData}, size: ${audioData?.size || audioData?.length || audioData?.byteLength || 'unknown'}, estimated duration: ${duration.toFixed(1)}s`)

    // Send progress update
    port.postMessage({
      type: 'TRANSCRIBE_PROGRESS',
      messageId,
      progress: { stage: 'transcribing', progress: 50 }
    })

    // Perform real Whisper transcription using Transformers.js
    console.log('🤖 Starting real Whisper transcription (DEV)...')

    const transcriptionResult = await currentModel(audioData, {
      language: options.language || 'english',
      return_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5,
    })

    console.log('🎯 Real transcription result (DEV):', transcriptionResult)

    // Send progress update
    port.postMessage({
      type: 'TRANSCRIBE_PROGRESS',
      messageId,
      progress: { stage: 'finalizing', progress: 90 }
    })

    // Format the result according to our interface
    const result = {
      text: transcriptionResult.text || `No speech detected in ${duration.toFixed(1)}s audio`,
      segments: transcriptionResult.chunks ? transcriptionResult.chunks.map(chunk => ({
        text: chunk.text,
        start: Math.round(chunk.timestamp[0] * 1000), // Convert to milliseconds
        end: Math.round(chunk.timestamp[1] * 1000)
      })) : [
        {
          text: transcriptionResult.text || `No speech detected`,
          start: 0,
          end: Math.round(duration * 1000)
        }
      ],
      duration: duration,
      language: options.language || 'english',
      model: currentModelId
    }

    console.log('📤 Sending real transcription result (DEV):', {
      messageId,
      resultLength: result.text.length,
      segmentsCount: result.segments.length,
      text: result.text.substring(0, 100) + (result.text.length > 100 ? '...' : '')
    })

    port.postMessage({
      type: 'TRANSCRIBE_COMPLETE',
      messageId,
      success: true,
      result
    })

    console.log('✅ Real Whisper transcription completed (DEV)!')

  } catch (error) {
    console.error('Transcription failed (DEV):', error)
    port.postMessage({
      type: 'TRANSCRIBE_COMPLETE',
      messageId,
      success: false,
      error: error.message
    })
  }
}

/**
 * Get model URL for a given model ID
 */
function getModelUrl(modelId) {
  const urls = {
    'tiny': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin',
    'base': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin',
    'small': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin'
  }
  return urls[modelId] || urls['base']
}

/**
 * Clean up old caches
 */
async function cleanupOldCaches() {
  const cacheNames = await caches.keys()
  const oldCaches = cacheNames.filter(name =>
    name.startsWith('whisper-') &&
    !name.includes('-v1')
  )

  return Promise.all(
    oldCaches.map(cacheName => caches.delete(cacheName))
  )
}

/**
 * Enhanced fetch event handler
 * Handles both PWA caching and Whisper-specific requests
 */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Handle Whisper model requests with enhanced caching
  if (url.hostname === 'huggingface.co' && url.pathname.includes('whisper.cpp')) {
    event.respondWith(handleWhisperModelRequest(event.request))
    return
  }

  // Handle Whisper WASM requests
  if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('whisper')) {
    event.respondWith(handleWhisperWasmRequest(event.request))
    return
  }

  // For all other requests, use default fetch
})

/**
 * Handle Whisper model requests with caching
 */
async function handleWhisperModelRequest(request) {
  try {
    // Check cache first
    const cache = await caches.open(WHISPER_CACHE_NAME)
    const cachedResponse = await cache.match(request)

    if (cachedResponse) {
      console.log('📦 Serving Whisper model from cache')
      return cachedResponse
    }

    // Not in cache, fetch from network
    console.log('🌐 Fetching Whisper model from network')
    const networkResponse = await fetch(request)

    if (networkResponse.ok) {
      // Cache the response
      cache.put(request, networkResponse.clone())
    }

    return networkResponse
  } catch (error) {
    console.error('Error handling Whisper model request:', error)
    return new Response('Whisper model unavailable', { status: 503 })
  }
}

/**
 * Handle Whisper WASM requests with caching
 */
async function handleWhisperWasmRequest(request) {
  try {
    // Check cache first
    const cache = await caches.open(WHISPER_WASM_CACHE)
    const cachedResponse = await cache.match(request)

    if (cachedResponse) {
      console.log('📦 Serving Whisper WASM from cache')
      return cachedResponse
    }

    // Not in cache, fetch from network
    console.log('🌐 Fetching Whisper WASM from network')
    const networkResponse = await fetch(request)

    if (networkResponse.ok) {
      // Cache the response
      cache.put(request, networkResponse.clone())
    }

    return networkResponse
  } catch (error) {
    console.error('Error handling Whisper WASM request:', error)
    return new Response('Whisper WASM unavailable', { status: 503 })
  }
}