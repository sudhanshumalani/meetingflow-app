/**
 * Clean PWA Service Worker
 * Handles caching and offline functionality only
 */

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'

// Clean up outdated caches first
cleanupOutdatedCaches()

// Precache and route app assets (VitePWA will inject manifest here)
precacheAndRoute(self.__WB_MANIFEST)

console.log('🔧 PWA Service Worker installed')

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