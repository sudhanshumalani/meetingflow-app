/**
 * Firebase Configuration for Meetingflow App
 *
 * iOS Safari Fix Strategy:
 * - FULLY lazy load everything - no imports at module level
 * - Use getFirestore() instead of initializeFirestore() for better iOS compatibility
 * - Add experimentalForceLongPolling for network reliability
 * - Wrap everything in try-catch to prevent crashes
 * - Added debug logging for diagnosing iOS issues
 *
 * References:
 * - https://github.com/firebase/firebase-js-sdk/issues/7780
 * - https://github.com/firebase/firebase-js-sdk/issues/8017
 * - https://github.com/firebase/firebase-js-sdk/issues/2581
 */

// Debug log storage for UI display
export const firebaseDebugLogs = []

function debugLog(message, type = 'info') {
  const entry = {
    timestamp: new Date().toISOString(),
    message,
    type
  }
  firebaseDebugLogs.push(entry)

  // Keep only last 50 logs
  if (firebaseDebugLogs.length > 50) {
    firebaseDebugLogs.shift()
  }

  // Also console log
  if (type === 'error') {
    console.error(`🔥 Firebase: ${message}`)
  } else if (type === 'warn') {
    console.warn(`🔥 Firebase: ${message}`)
  } else {
    console.log(`🔥 Firebase: ${message}`)
  }
}

// Detect iOS Safari/PWA
function detectIOS() {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false
  try {
    const ua = navigator.userAgent || ''
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream
    const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS/.test(ua)
    const isStandalone = window.navigator?.standalone === true
    const isIPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 0
    return isIOS || isStandalone || isIPadOS || (isSafari && isIPadOS)
  } catch (e) {
    debugLog(`iOS detection error: ${e.message}`, 'error')
    return false
  }
}

// Export IS_IOS for other modules
export const IS_IOS = detectIOS()

// These will be set during lazy initialization
let app = null
let db = null
let initPromise = null
let initAttempted = false
let lastError = null

// Log iOS status once
debugLog(`Platform detected: ${IS_IOS ? 'iOS' : 'Desktop/Android'}`)
debugLog(`User Agent: ${typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A'}`)

// Export app and db (will be null until initialized)
export { db, app }

// Export last error for debugging
export function getLastFirebaseError() {
  return lastError
}

// Export debug logs for UI
export function getFirebaseDebugLogs() {
  return [...firebaseDebugLogs]
}

// Export initialization status
export function getFirebaseStatus() {
  return {
    isInitialized: db !== null && app !== null,
    initAttempted,
    hasError: lastError !== null,
    lastError: lastError?.message || null,
    isIOS: IS_IOS,
    logsCount: firebaseDebugLogs.length
  }
}

/**
 * Lazy initialize Firebase - SAFE for iOS
 * Uses getFirestore() which is more compatible than initializeFirestore()
 */
export async function initializeFirebase() {
  debugLog('initializeFirebase() called')

  // Return cached result if already initialized
  if (db !== null && app !== null) {
    debugLog('Already initialized, returning cached instance')
    return { app, db }
  }

  // Return pending promise if initialization is in progress
  if (initPromise) {
    debugLog('Initialization in progress, waiting...')
    return initPromise
  }

  // Don't retry if we already failed
  if (initAttempted && !db) {
    debugLog('Previous initialization failed, not retrying', 'warn')
    return { app: null, db: null }
  }

  initPromise = (async () => {
    initAttempted = true
    lastError = null

    try {
      debugLog('Step 1: Importing firebase/app...')

      // Step 1: Import Firebase app
      let firebaseApp
      try {
        firebaseApp = await import('firebase/app')
        debugLog('Step 1 SUCCESS: firebase/app imported')
      } catch (appImportErr) {
        lastError = appImportErr
        debugLog(`Step 1 FAILED: ${appImportErr.message}`, 'error')
        throw appImportErr
      }

      const { initializeApp, getApps, getApp } = firebaseApp

      // Firebase configuration
      const firebaseConfig = {
        apiKey: "AIzaSyC_r2K8JIWFGEjmTbIuTgp7sgY5F4FuryI",
        authDomain: "meetingflow-app-bcb76.firebaseapp.com",
        projectId: "meetingflow-app-bcb76",
        storageBucket: "meetingflow-app-bcb76.firebasestorage.app",
        messagingSenderId: "498298688999",
        appId: "1:498298688999:web:2f4cdb09d0979102aed942",
        measurementId: "G-RYV2L2BJ8B"
      }

      debugLog('Step 2: Initializing Firebase App...')

      // Initialize or get existing app
      try {
        if (getApps().length === 0) {
          app = initializeApp(firebaseConfig)
          debugLog('Step 2 SUCCESS: Firebase App created')
        } else {
          app = getApp()
          debugLog('Step 2 SUCCESS: Firebase App reused')
        }
      } catch (appInitErr) {
        lastError = appInitErr
        debugLog(`Step 2 FAILED: ${appInitErr.message}`, 'error')
        throw appInitErr
      }

      debugLog('Step 3: Importing firebase/firestore...')

      // Step 3: Import Firestore - wrap in try-catch for iOS
      let firestoreModule
      try {
        firestoreModule = await import('firebase/firestore')
        debugLog('Step 3 SUCCESS: firebase/firestore imported')
      } catch (importErr) {
        lastError = importErr
        debugLog(`Step 3 FAILED: ${importErr.message}`, 'error')
        return { app, db: null }
      }

      debugLog('Step 4: Initializing Firestore...')

      // Step 4: Initialize Firestore with iOS-safe settings
      const { getFirestore, initializeFirestore } = firestoreModule

      // Try Method A: getFirestore (simpler, more iOS compatible)
      try {
        debugLog('Step 4A: Trying getFirestore()...')
        db = getFirestore(app)
        debugLog('Step 4A SUCCESS: getFirestore() worked')
      } catch (getErr) {
        debugLog(`Step 4A FAILED: ${getErr.message}`, 'warn')

        // Try Method B: initializeFirestore with long polling
        try {
          debugLog('Step 4B: Trying initializeFirestore with long polling...')
          db = initializeFirestore(app, {
            experimentalForceLongPolling: true,
            experimentalAutoDetectLongPolling: false
          })
          debugLog('Step 4B SUCCESS: initializeFirestore() worked')
        } catch (initErr) {
          lastError = initErr
          debugLog(`Step 4B FAILED: ${initErr.message}`, 'error')
          return { app, db: null }
        }
      }

      debugLog('Firebase initialization COMPLETE')
      return { app, db }

    } catch (error) {
      lastError = error
      debugLog(`FATAL ERROR: ${error.message}`, 'error')
      debugLog(`Error stack: ${error.stack}`, 'error')
      // Reset state
      app = null
      db = null
      return { app: null, db: null }
    }
  })()

  return initPromise
}
