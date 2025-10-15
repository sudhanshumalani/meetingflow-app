/**
 * Enhanced PWA Service Worker
 * Handles caching, offline functionality, and background sync for audio uploads
 */

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkOnly, NetworkFirst } from 'workbox-strategies'
import { BackgroundSyncPlugin } from 'workbox-background-sync'

// Clean up outdated caches first
cleanupOutdatedCaches()

// Precache and route app assets (VitePWA will inject manifest here)
precacheAndRoute(self.__WB_MANIFEST)

console.log('🔧 PWA Service Worker installed')

/**
 * Background Sync Queue for Audio Uploads
 * Retries failed AssemblyAI audio uploads automatically
 */
const audioUploadQueue = new BackgroundSyncPlugin('audio-upload-queue', {
  maxRetentionTime: 24 * 60 // Retry for up to 24 hours (in minutes)
})

/**
 * Route: AssemblyAI Audio Upload
 * Use NetworkOnly strategy with background sync for retries
 */
registerRoute(
  ({ url }) => url.hostname === 'api.assemblyai.com' && url.pathname.includes('/v2/upload'),
  new NetworkOnly({
    plugins: [audioUploadQueue]
  }),
  'POST'
)

/**
 * Route: AssemblyAI Transcript Polling
 * Use NetworkFirst strategy (cache with network fallback)
 */
registerRoute(
  ({ url }) => url.hostname === 'api.assemblyai.com' && url.pathname.includes('/v2/transcript'),
  new NetworkFirst({
    cacheName: 'assemblyai-transcripts',
    plugins: [
      {
        cacheWillUpdate: async ({ response }) => {
          // Only cache completed transcripts
          if (response.status === 200) {
            const clone = response.clone()
            const data = await clone.json()
            if (data.status === 'completed' || data.status === 'error') {
              return response
            }
          }
          return null
        }
      }
    ]
  })
)

/**
 * Service Worker Installation
 */
self.addEventListener('install', (event) => {
  console.log('🔧 Installing PWA Service Worker')
  event.waitUntil(
    self.skipWaiting()
  )
})

/**
 * Service Worker Activation
 */
self.addEventListener('activate', (event) => {
  console.log('🚀 Activating PWA Service Worker')
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      cleanupOldCaches(),
      // Take control of all clients
      self.clients.claim()
    ])
  )
})

/**
 * Clean up old caches
 */
async function cleanupOldCaches() {
  const cacheNames = await caches.keys()
  const oldCaches = cacheNames.filter(name =>
    name.startsWith('whisper-') || // Remove old whisper caches
    name.includes('whisper') ||
    name.includes('wasm')
  )

  await Promise.all(
    oldCaches.map(cacheName => caches.delete(cacheName))
  )

  if (oldCaches.length > 0) {
    console.log('🧹 Cleaned up old caches:', oldCaches)
  }
}

/**
 * Handle VitePWA messages
 */
self.addEventListener('message', (event) => {
  const { data } = event

  if (data && data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})