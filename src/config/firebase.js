/**
 * Firebase Configuration for Meetingflow App
 * This file connects your app to Firebase/Firestore
 *
 * IMPORTANT: iOS Safari has known issues with enableIndexedDbPersistence
 * that can cause the app to crash or hang. We disable persistence on iOS
 * to avoid these issues. The app will still work, just without offline cache.
 *
 * References:
 * - https://github.com/firebase/firebase-js-sdk/issues/4076
 * - https://github.com/firebase/firebase-js-sdk/issues/6806
 * - https://github.com/firebase/firebase-js-sdk/issues/1670
 */

import { initializeApp } from 'firebase/app'
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore'

// Detect iOS Safari - known to have Firestore IndexedDB issues
const isIOSSafari = () => {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream
  const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS/.test(ua)
  // Also check for iOS PWA (standalone mode)
  const isStandalone = window.navigator.standalone === true
  return isIOS || (isSafari && /Macintosh/.test(ua) && navigator.maxTouchPoints > 0) || isStandalone
}

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

let app = null
let db = null

try {
  // Initialize Firebase
  app = initializeApp(firebaseConfig)

  // Initialize Firestore (the database)
  db = getFirestore(app)

  // Check if we should enable persistence
  // SKIP on iOS Safari due to known IndexedDB bugs that cause crashes
  const isiOS = isIOSSafari()

  if (isiOS) {
    console.log('📱 iOS Safari detected - skipping Firestore persistence (known IndexedDB issues)')
    console.log('📱 Firestore will work without offline cache')
  } else {
    // Enable offline support on non-iOS browsers
    enableIndexedDbPersistence(db)
      .then(() => {
        console.log('✅ Firestore offline persistence enabled')
      })
      .catch((err) => {
        if (err.code === 'failed-precondition') {
          // Multiple tabs open - only one can have persistence
          console.warn('Firestore persistence unavailable - multiple tabs open')
        } else if (err.code === 'unimplemented') {
          // Browser doesn't support persistence
          console.warn('Firestore persistence not supported in this browser')
        } else {
          console.error('Firestore persistence error:', err)
        }
      })
  }
} catch (error) {
  console.error('❌ Firebase initialization failed:', error)
  // App will continue without Firestore - localStorage will still work
}

export { db, app }
