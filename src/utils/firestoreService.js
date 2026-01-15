/**
 * Firestore Service for Meetingflow App
 * Handles all database operations - saving, loading, deleting meetings
 *
 * CRITICAL: iOS Safari has severe bugs with Firestore that cause app crashes.
 * On iOS, this service is completely disabled and returns no-op functions.
 * The app uses localStorage only on iOS devices.
 *
 * References:
 * - https://github.com/firebase/firebase-js-sdk/issues/4076
 * - https://github.com/firebase/firebase-js-sdk/issues/2581
 */

import { IS_IOS, initializeFirebase } from '../config/firebase'

// Firestore module and db instance - loaded lazily on non-iOS only
let firestoreModule = null
let db = null
let isInitialized = false
let initPromise = null

/**
 * Lazy load Firestore - ONLY on non-iOS platforms
 */
async function ensureFirestoreLoaded() {
  if (IS_IOS) {
    console.log('📱 Firestore disabled on iOS')
    return false
  }

  if (isInitialized && db) {
    return true
  }

  if (initPromise) {
    return initPromise
  }

  initPromise = (async () => {
    try {
      console.log('🔥 Loading Firestore...')
      const firebase = await initializeFirebase()
      db = firebase.db

      if (!db) {
        console.warn('⚠️ Firebase db is null')
        return false
      }

      firestoreModule = await import('firebase/firestore')
      isInitialized = true
      console.log('✅ Firestore loaded successfully')
      return true
    } catch (error) {
      console.error('❌ Failed to load Firestore:', error)
      return false
    }
  })()

  return initPromise
}

class FirestoreService {
  constructor() {
    this.isAvailable = !IS_IOS
    this.listeners = []

    if (IS_IOS) {
      console.log('📱 FirestoreService: iOS detected - Firestore DISABLED')
      this.userId = null
    } else {
      this.userId = this.getOrCreateUserId()
      console.log('FirestoreService created with userId:', this.userId)
    }
  }

  getOrCreateUserId() {
    if (IS_IOS) return null
    let userId = localStorage.getItem('meetingflow_firestore_user_id')
    if (!userId) {
      userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      localStorage.setItem('meetingflow_firestore_user_id', userId)
      console.log('Created new Firestore user ID:', userId)
    }
    return userId
  }

  setUserId(newUserId) {
    if (IS_IOS) return
    this.userId = newUserId
    localStorage.setItem('meetingflow_firestore_user_id', newUserId)
    console.log('Updated Firestore user ID to:', newUserId)
  }

  getUserId() {
    return this.userId
  }

  // ==================== MEETINGS ====================

  async saveMeeting(meeting) {
    if (IS_IOS) return { success: false, reason: 'ios_disabled' }

    const ready = await ensureFirestoreLoaded()
    if (!ready) return { success: false, reason: 'firestore_unavailable' }

    try {
      if (!meeting?.id) {
        console.warn('Skipping meeting without ID')
        return { success: false, reason: 'no_id' }
      }

      const { doc, setDoc, serverTimestamp } = firestoreModule
      const meetingRef = doc(db, 'meetings', meeting.id)
      await setDoc(meetingRef, {
        ...meeting,
        userId: this.userId,
        lastModified: serverTimestamp(),
        deleted: false
      }, { merge: true })

      console.log('Meeting saved to Firestore:', meeting.id)
      return { success: true }
    } catch (error) {
      console.error('Error saving meeting:', error)
      return { success: false, reason: error.message }
    }
  }

  async deleteMeeting(meetingId) {
    if (IS_IOS) return { success: false, reason: 'ios_disabled' }

    const ready = await ensureFirestoreLoaded()
    if (!ready) return { success: false, reason: 'firestore_unavailable' }

    try {
      const { doc, setDoc, serverTimestamp } = firestoreModule
      const meetingRef = doc(db, 'meetings', meetingId)
      await setDoc(meetingRef, {
        deleted: true,
        deletedAt: serverTimestamp(),
        lastModified: serverTimestamp()
      }, { merge: true })

      console.log('Meeting deleted in Firestore:', meetingId)
      return { success: true }
    } catch (error) {
      console.error('Error deleting meeting:', error)
      return { success: false, reason: error.message }
    }
  }

  async getMeetings() {
    if (IS_IOS) return []

    const ready = await ensureFirestoreLoaded()
    if (!ready) return []

    try {
      const { collection, query, where, getDocs } = firestoreModule
      const q = query(
        collection(db, 'meetings'),
        where('userId', '==', this.userId),
        where('deleted', '==', false)
      )

      const querySnapshot = await getDocs(q)
      const meetings = []
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data()
        meetings.push({
          id: docSnap.id,
          ...data,
          lastModified: data.lastModified?.toDate?.() || data.lastModified
        })
      })

      console.log('Fetched meetings from Firestore:', meetings.length)
      return meetings
    } catch (error) {
      console.error('Error getting meetings:', error)
      return []
    }
  }

  subscribeMeetings(callback) {
    if (IS_IOS) {
      console.log('📱 Skipping Firestore subscription on iOS')
      return () => {}
    }

    // Use async initialization inside
    ensureFirestoreLoaded().then(ready => {
      if (!ready) {
        console.log('⏭️ Firestore not ready, skipping subscription')
        return
      }

      try {
        const { collection, query, where, onSnapshot } = firestoreModule
        const q = query(
          collection(db, 'meetings'),
          where('userId', '==', this.userId),
          where('deleted', '==', false)
        )

        const unsubscribe = onSnapshot(q,
          (querySnapshot) => {
            const meetings = []
            querySnapshot.forEach((docSnap) => {
              const data = docSnap.data()
              meetings.push({
                id: docSnap.id,
                ...data,
                lastModified: data.lastModified?.toDate?.() || data.lastModified
              })
            })
            console.log('Real-time update - meetings:', meetings.length)
            callback(meetings)
          },
          (error) => {
            console.error('Firestore subscription error:', error)
          }
        )

        this.listeners.push(unsubscribe)
      } catch (error) {
        console.error('Error setting up subscription:', error)
      }
    })

    return () => {} // Return immediate no-op, actual unsubscribe stored in listeners
  }

  // ==================== STAKEHOLDERS ====================

  async saveStakeholder(stakeholder) {
    if (IS_IOS) return { success: false, reason: 'ios_disabled' }

    const ready = await ensureFirestoreLoaded()
    if (!ready) return { success: false, reason: 'firestore_unavailable' }

    try {
      if (!stakeholder?.id) return { success: false, reason: 'no_id' }

      const { doc, setDoc, serverTimestamp } = firestoreModule
      const ref = doc(db, 'stakeholders', stakeholder.id)
      await setDoc(ref, {
        ...stakeholder,
        userId: this.userId,
        lastModified: serverTimestamp(),
        deleted: false
      }, { merge: true })

      return { success: true }
    } catch (error) {
      console.error('Error saving stakeholder:', error)
      return { success: false, reason: error.message }
    }
  }

  async deleteStakeholder(stakeholderId) {
    if (IS_IOS) return { success: false, reason: 'ios_disabled' }

    const ready = await ensureFirestoreLoaded()
    if (!ready) return { success: false, reason: 'firestore_unavailable' }

    try {
      const { doc, setDoc, serverTimestamp } = firestoreModule
      const ref = doc(db, 'stakeholders', stakeholderId)
      await setDoc(ref, {
        deleted: true,
        deletedAt: serverTimestamp(),
        lastModified: serverTimestamp()
      }, { merge: true })
      return { success: true }
    } catch (error) {
      return { success: false, reason: error.message }
    }
  }

  async getStakeholders() {
    if (IS_IOS) return []

    const ready = await ensureFirestoreLoaded()
    if (!ready) return []

    try {
      const { collection, query, where, getDocs } = firestoreModule
      const q = query(
        collection(db, 'stakeholders'),
        where('userId', '==', this.userId),
        where('deleted', '==', false)
      )
      const querySnapshot = await getDocs(q)
      const items = []
      querySnapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() })
      })
      return items
    } catch (error) {
      return []
    }
  }

  subscribeStakeholders(callback) {
    if (IS_IOS) return () => {}

    ensureFirestoreLoaded().then(ready => {
      if (!ready) return

      try {
        const { collection, query, where, onSnapshot } = firestoreModule
        const q = query(
          collection(db, 'stakeholders'),
          where('userId', '==', this.userId),
          where('deleted', '==', false)
        )
        const unsubscribe = onSnapshot(q, (snapshot) => {
          const items = []
          snapshot.forEach((docSnap) => {
            items.push({ id: docSnap.id, ...docSnap.data() })
          })
          callback(items)
        }, (error) => console.error('Stakeholder subscription error:', error))
        this.listeners.push(unsubscribe)
      } catch (error) {
        console.error('Error setting up stakeholder subscription:', error)
      }
    })

    return () => {}
  }

  // ==================== STAKEHOLDER CATEGORIES ====================

  async saveStakeholderCategory(category) {
    if (IS_IOS) return { success: false, reason: 'ios_disabled' }

    const ready = await ensureFirestoreLoaded()
    if (!ready) return { success: false, reason: 'firestore_unavailable' }

    try {
      if (!category?.id) return { success: false, reason: 'no_id' }

      const { doc, setDoc, serverTimestamp } = firestoreModule
      const ref = doc(db, 'stakeholderCategories', category.id)
      await setDoc(ref, {
        ...category,
        userId: this.userId,
        lastModified: serverTimestamp(),
        deleted: false
      }, { merge: true })
      return { success: true }
    } catch (error) {
      return { success: false, reason: error.message }
    }
  }

  async deleteStakeholderCategory(categoryId) {
    if (IS_IOS) return { success: false, reason: 'ios_disabled' }

    const ready = await ensureFirestoreLoaded()
    if (!ready) return { success: false, reason: 'firestore_unavailable' }

    try {
      const { doc, setDoc, serverTimestamp } = firestoreModule
      const ref = doc(db, 'stakeholderCategories', categoryId)
      await setDoc(ref, {
        deleted: true,
        deletedAt: serverTimestamp(),
        lastModified: serverTimestamp()
      }, { merge: true })
      return { success: true }
    } catch (error) {
      return { success: false, reason: error.message }
    }
  }

  async getStakeholderCategories() {
    if (IS_IOS) return []

    const ready = await ensureFirestoreLoaded()
    if (!ready) return []

    try {
      const { collection, query, where, getDocs } = firestoreModule
      const q = query(
        collection(db, 'stakeholderCategories'),
        where('userId', '==', this.userId),
        where('deleted', '==', false)
      )
      const snapshot = await getDocs(q)
      const items = []
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() })
      })
      return items
    } catch (error) {
      return []
    }
  }

  subscribeStakeholderCategories(callback) {
    if (IS_IOS) return () => {}

    ensureFirestoreLoaded().then(ready => {
      if (!ready) return

      try {
        const { collection, query, where, onSnapshot } = firestoreModule
        const q = query(
          collection(db, 'stakeholderCategories'),
          where('userId', '==', this.userId),
          where('deleted', '==', false)
        )
        const unsubscribe = onSnapshot(q, (snapshot) => {
          const items = []
          snapshot.forEach((docSnap) => {
            items.push({ id: docSnap.id, ...docSnap.data() })
          })
          callback(items)
        }, (error) => console.error('Category subscription error:', error))
        this.listeners.push(unsubscribe)
      } catch (error) {
        console.error('Error setting up category subscription:', error)
      }
    })

    return () => {}
  }

  // ==================== BATCH IMPORT ====================

  async importAllData(meetings, stakeholders, categories) {
    if (IS_IOS) return { success: false, reason: 'ios_disabled' }

    const ready = await ensureFirestoreLoaded()
    if (!ready) return { success: false, reason: 'firestore_unavailable' }

    try {
      const { doc, writeBatch, serverTimestamp } = firestoreModule
      const batch = writeBatch(db)
      let count = 0

      for (const meeting of meetings) {
        if (count >= 500 || !meeting.id) continue
        batch.set(doc(db, 'meetings', meeting.id), {
          ...meeting, userId: this.userId, lastModified: serverTimestamp(), deleted: false
        })
        count++
      }

      for (const stakeholder of stakeholders) {
        if (count >= 500 || !stakeholder.id) continue
        batch.set(doc(db, 'stakeholders', stakeholder.id), {
          ...stakeholder, userId: this.userId, lastModified: serverTimestamp(), deleted: false
        })
        count++
      }

      for (const category of categories) {
        if (count >= 500 || !category.id) continue
        batch.set(doc(db, 'stakeholderCategories', category.id), {
          ...category, userId: this.userId, lastModified: serverTimestamp(), deleted: false
        })
        count++
      }

      await batch.commit()
      console.log('Batch import completed! Total items:', count)
      return { success: true, imported: count }
    } catch (error) {
      console.error('Batch import failed:', error)
      return { success: false, reason: error.message }
    }
  }

  // ==================== UTILITIES ====================

  cleanup() {
    console.log('Cleaning up Firestore listeners:', this.listeners.length)
    this.listeners.forEach(unsubscribe => {
      try { unsubscribe() } catch (e) { /* ignore */ }
    })
    this.listeners = []
  }

  async checkConnection() {
    if (IS_IOS) return { connected: false, reason: 'ios_disabled' }

    const ready = await ensureFirestoreLoaded()
    if (!ready) return { connected: false, reason: 'firestore_unavailable' }

    try {
      const { doc, getDoc } = firestoreModule
      await getDoc(doc(db, 'connectionTest', 'test'))
      return { connected: true }
    } catch (error) {
      return { connected: false, error: error.message }
    }
  }
}

// Create singleton instance
const firestoreService = new FirestoreService()
export default firestoreService
