/**
 * Firebase Configuration for Meetingflow App
 * This file connects your app to Firebase/Firestore
 *
 * iOS Safari Strategy:
 * - iOS has bugs with IndexedDB persistence (enableIndexedDbPersistence)
 * - But Firestore WORKS on iOS using memory cache (no persistence)
 * - Real-time sync (onSnapshot) works perfectly with memory cache
 * - We just skip persistence on iOS, not Firestore entirely
 *
 * References:
 * - https://github.com/firebase/firebase-js-sdk/issues/4076
 * - https://firebase.google.com/docs/firestore/manage-data/enable-offline
 */

// Detect iOS Safari/PWA - needs special handling for persistence
const isIOSSafari = () => {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false
  const ua = navigator.userAgent || ''
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream
  const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS/.test(ua)
  // Also check for iOS PWA (standalone mode)
  const isStandalone = window.navigator?.standalone === true
  // Check for iPad pretending to be Mac
  const isIPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 0
  return isIOS || isStandalone || isIPadOS || (isSafari && isIPadOS)
}

// Check iOS status
const IS_IOS = isIOSSafari()

let app = null
let db = null

if (IS_IOS) {
  console.log('📱 iOS detected - Firestore will use memory cache (no IndexedDB persistence)')
  console.log('📱 Real-time sync will work, but data won\'t persist offline')
}

export { db, app, IS_IOS }

// Lazy initialization function
export async function initializeFirebase() {
  if (db !== null) {
    // Already initialized
    return { app, db }
  }

  try {
    const { initializeApp } = await import('firebase/app')
    const { initializeFirestore, memoryLocalCache, persistentLocalCache, CACHE_SIZE_UNLIMITED } = await import('firebase/firestore')

    // Your Firebase configuration (from Firebase Console)
    const firebaseConfig = {
      apiKey: "AIzaSyC_r2K8JIWFGEjmTbIuTgp7sgY5F4FuryI",
      authDomain: "meetingflow-app-bcb76.firebaseapp.com",
      projectId: "meetingflow-app-bcb76",
      storageBucket: "meetingflow-app-bcb76.firebasestorage.app",
      messagingSenderId: "498298688999",
      appId: "1:498298688999:web:2f4cdb09d0979102aed942",
      measurementId: "G-RYV2L2BJ8B"
    }

    // Initialize Firebase
    app = initializeApp(firebaseConfig)

    // Initialize Firestore with appropriate cache strategy
    if (IS_IOS) {
      // iOS: Use memory cache to avoid IndexedDB bugs
      // Real-time sync still works! Just no offline persistence
      console.log('📱 Initializing Firestore with memory cache for iOS...')
      db = initializeFirestore(app, {
        localCache: memoryLocalCache()
      })
      console.log('✅ Firestore initialized with memory cache (iOS)')
    } else {
      // Desktop/Android: Use persistent cache for full offline support
      console.log('💻 Initializing Firestore with persistent cache...')
      try {
        db = initializeFirestore(app, {
          localCache: persistentLocalCache({
            cacheSizeBytes: CACHE_SIZE_UNLIMITED
          })
        })
        console.log('✅ Firestore initialized with persistent cache')
      } catch (persistErr) {
        // Fallback to memory cache if persistence fails
        console.warn('⚠️ Persistent cache failed, falling back to memory cache:', persistErr)
        db = initializeFirestore(app, {
          localCache: memoryLocalCache()
        })
      }
    }

    console.log('✅ Firebase initialized successfully')
    return { app, db }
  } catch (error) {
    console.error('❌ Firebase initialization failed:', error)
    return { app: null, db: null }
  }
}
