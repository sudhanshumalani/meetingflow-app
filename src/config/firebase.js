/**
 * Firebase Configuration for Meetingflow App
 * This file connects your app to Firebase/Firestore
 *
 * CRITICAL: iOS Safari has severe bugs with Firestore that cause crashes.
 * Even getFirestore() can trigger IndexedDB errors on iOS Safari/PWA.
 * We COMPLETELY SKIP Firestore initialization on iOS to avoid crashes.
 * The app will work with localStorage only on iOS devices.
 *
 * References:
 * - https://github.com/firebase/firebase-js-sdk/issues/4076
 * - https://github.com/firebase/firebase-js-sdk/issues/6806
 * - https://github.com/firebase/firebase-js-sdk/issues/1670
 * - https://github.com/firebase/firebase-js-sdk/issues/2581
 */

// Detect iOS Safari/PWA - known to have severe Firestore bugs
// Must be defined BEFORE any Firebase imports to allow conditional loading
const isIOSSafari = () => {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false
  const ua = navigator.userAgent || ''
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream
  const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS/.test(ua)
  // Also check for iOS PWA (standalone mode) - this is critical!
  const isStandalone = window.navigator?.standalone === true
  // Check for iPad pretending to be Mac
  const isIPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 0
  return isIOS || isStandalone || isIPadOS || (isSafari && isIPadOS)
}

// Check iOS status BEFORE importing Firebase
const IS_IOS = isIOSSafari()

let app = null
let db = null

if (IS_IOS) {
  console.log('📱 iOS detected - Firestore DISABLED to prevent crashes')
  console.log('📱 App will use localStorage only (still works, just no cloud sync on iOS)')
}

export { db, app, IS_IOS }

// Lazy initialization function - call this from AppContext after checking IS_IOS
export async function initializeFirebase() {
  if (IS_IOS) {
    console.log('📱 Skipping Firebase initialization on iOS')
    return { app: null, db: null }
  }

  if (db !== null) {
    // Already initialized
    return { app, db }
  }

  try {
    const { initializeApp } = await import('firebase/app')
    const { getFirestore, enableIndexedDbPersistence } = await import('firebase/firestore')

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

    // Initialize Firestore (the database)
    db = getFirestore(app)

    // Enable offline support
    try {
      await enableIndexedDbPersistence(db)
      console.log('✅ Firestore offline persistence enabled')
    } catch (err) {
      if (err.code === 'failed-precondition') {
        console.warn('Firestore persistence unavailable - multiple tabs open')
      } else if (err.code === 'unimplemented') {
        console.warn('Firestore persistence not supported in this browser')
      } else {
        console.error('Firestore persistence error:', err)
      }
    }

    console.log('✅ Firebase initialized successfully')
    return { app, db }
  } catch (error) {
    console.error('❌ Firebase initialization failed:', error)
    return { app: null, db: null }
  }
}
