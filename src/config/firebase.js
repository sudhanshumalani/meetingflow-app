/**
 * Firebase Configuration for Meetingflow App
 * This file connects your app to Firebase/Firestore
 */

import { initializeApp } from 'firebase/app'
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore'

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
const app = initializeApp(firebaseConfig)

// Initialize Firestore (the database)
const db = getFirestore(app)

// Enable offline support - your app works even without internet!
enableIndexedDbPersistence(db)
  .then(() => {
    console.log('Firestore offline persistence enabled')
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

export { db, app }
