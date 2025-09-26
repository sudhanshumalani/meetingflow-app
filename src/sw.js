/**
 * Enhanced Service Worker with PWA + Whisper.cpp WASM Integration
 * Combines VitePWA functionality with ML model caching and execution
 */

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'

// Web Worker is created by main thread, Service Worker communicates through main thread

// Clean up outdated caches first
cleanupOutdatedCaches()

// Precache and route app assets (VitePWA will inject manifest here)
precacheAndRoute(self.__WB_MANIFEST)

// Whisper-specific caches
const WHISPER_CACHE_NAME = 'whisper-models-v1'
const WHISPER_WASM_CACHE = 'whisper-wasm-v1'

// Web Worker handles all Whisper processing

// Message ports for communication
const clientPorts = new Set()

console.log('🔧 Enhanced Service Worker (PWA + Whisper) installed')

// All Web Worker communication now handled by main thread

// Whisper pipeline initialization now handled by main thread

/**
 * Service Worker Installation
 */
self.addEventListener('install', (event) => {
  console.log('🔧 Installing Enhanced Service Worker (PWA + Whisper)')

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
      console.log('✅ Enhanced Service Worker installed')
    })
  )
})

/**
 * Service Worker Activation
 */
self.addEventListener('activate', (event) => {
  console.log('🚀 Activating Enhanced Service Worker (PWA + Whisper)')

  event.waitUntil(
    Promise.all([
      // Clean up old caches
      cleanupOldCaches(),
      // Take control of all clients
      self.clients.claim()
    ]).then(() => {
      console.log('✅ Enhanced Service Worker activated')
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

  // Handle other VitePWA messages
  if (data && data.type === 'SKIP_WAITING') {
    self.skipWaiting()
    return
  }
})

/**
 * Handle Whisper-specific messages - inform main thread to handle
 */
async function handleWhisperMessage(message, port) {
  const { type, messageId } = message

  console.log('🎯 Service Worker handling Whisper message:', type, 'messageId:', messageId)

  try {
    switch (type) {
      case 'CHECK_MODEL_CACHE':
        // This can stay in Service Worker as it's just cache checking
        const isCached = await isModelCached(message.modelId)
        port.postMessage({
          type: 'CACHE_CHECK_RESULT',
          messageId,
          isCached
        })
        break

      case 'DOWNLOAD_MODEL':
        // Respond that main thread should handle this
        port.postMessage({
          type: 'DELEGATE_TO_MAIN_THREAD',
          messageId,
          originalMessage: message
        })
        break

      case 'INIT_WHISPER_WASM':
        // Respond that main thread should handle this
        port.postMessage({
          type: 'DELEGATE_TO_MAIN_THREAD',
          messageId,
          originalMessage: message
        })
        break

      case 'TRANSCRIBE_AUDIO':
        // Respond that main thread should handle this
        port.postMessage({
          type: 'DELEGATE_TO_MAIN_THREAD',
          messageId,
          originalMessage: message
        })
        break

      default:
        console.warn('Unknown Whisper message type:', type)
        port.postMessage({
          type: 'ERROR',
          messageId,
          error: `Unknown message type: ${type}`
        })
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
// Model downloading is now handled by Web Worker + browser cache

// Whisper initialization is now handled by Web Worker

// Whisper transcription is now handled by Web Worker

/**
 * Device detection for mobile optimization
 */
function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
}

/**
 * Get optimal model for device capabilities
 */
function getOptimalModelForDevice() {
  const isMobile = isMobileDevice()
  const hasSlowConnection = typeof navigator !== 'undefined' && navigator.connection &&
    (navigator.connection.effectiveType === 'slow-2g' || navigator.connection.effectiveType === '2g')

  if (isMobile || hasSlowConnection) {
    console.log('📱 Mobile device or slow connection detected - using tiny model')
    return 'tiny'
  } else {
    console.log('💻 Desktop device detected - using base model')
    return 'base'
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

  // For all other requests, let Workbox handle them
  // (Workbox will handle precached assets and runtime caching)
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