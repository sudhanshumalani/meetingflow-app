/**
 * Firestore Service for Meetingflow App
 * Handles all database operations - saving, loading, deleting meetings
 */

import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  writeBatch
} from 'firebase/firestore'
import { db } from '../config/firebase'

class FirestoreService {
  constructor() {
    // Check if Firestore is available
    this.isAvailable = !!db
    if (!this.isAvailable) {
      console.warn('⚠️ FirestoreService: Firestore not available, running in offline-only mode')
      this.userId = null
      this.listeners = []
      return
    }

    // Generate or retrieve a unique ID for this device/user
    this.userId = this.getOrCreateUserId()
    this.listeners = []
    console.log('FirestoreService initialized with userId:', this.userId)
  }

  /**
   * Get or create a unique user ID
   * This ID links all your data together across devices
   */
  getOrCreateUserId() {
    let userId = localStorage.getItem('meetingflow_firestore_user_id')
    if (!userId) {
      // Create a new unique ID
      userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      localStorage.setItem('meetingflow_firestore_user_id', userId)
      console.log('Created new Firestore user ID:', userId)
    }
    return userId
  }

  /**
   * Set a specific user ID (for linking devices)
   */
  setUserId(newUserId) {
    this.userId = newUserId
    localStorage.setItem('meetingflow_firestore_user_id', newUserId)
    console.log('Updated Firestore user ID to:', newUserId)
  }

  // ==================== MEETINGS ====================

  /**
   * Save a meeting to Firestore
   */
  async saveMeeting(meeting) {
    // Skip if Firestore not available
    if (!this.isAvailable) {
      console.log('⏭️ Firestore unavailable, skipping cloud save for meeting:', meeting.id)
      return { success: false, reason: 'firestore_unavailable' }
    }

    try {
      // Validate meeting has an ID
      if (!meeting.id) {
        console.warn('Skipping meeting without ID:', meeting)
        return { success: false, reason: 'no_id' }
      }

      const meetingRef = doc(db, 'meetings', meeting.id)
      const meetingData = {
        ...meeting,
        userId: this.userId,
        lastModified: serverTimestamp(),
        deleted: false
      }

      await setDoc(meetingRef, meetingData, { merge: true })
      console.log('Meeting saved to Firestore:', meeting.id)
      return { success: true }
    } catch (error) {
      console.error('Error saving meeting to Firestore:', error)
      throw error
    }
  }

  /**
   * Delete a meeting (soft delete - marks as deleted)
   */
  async deleteMeeting(meetingId) {
    try {
      const meetingRef = doc(db, 'meetings', meetingId)
      await setDoc(meetingRef, {
        deleted: true,
        deletedAt: serverTimestamp(),
        lastModified: serverTimestamp()
      }, { merge: true })

      console.log('Meeting deleted in Firestore:', meetingId)
      return { success: true }
    } catch (error) {
      console.error('Error deleting meeting in Firestore:', error)
      throw error
    }
  }

  /**
   * Get all meetings for current user
   */
  async getMeetings() {
    try {
      const q = query(
        collection(db, 'meetings'),
        where('userId', '==', this.userId),
        where('deleted', '==', false)
      )

      const querySnapshot = await getDocs(q)
      const meetings = []

      querySnapshot.forEach((doc) => {
        const data = doc.data()
        // Convert Firestore timestamps to regular dates
        meetings.push({
          id: doc.id,
          ...data,
          lastModified: data.lastModified?.toDate?.() || data.lastModified
        })
      })

      console.log('Fetched meetings from Firestore:', meetings.length)
      return meetings
    } catch (error) {
      console.error('Error getting meetings from Firestore:', error)
      throw error
    }
  }

  /**
   * Subscribe to real-time meeting updates
   * This is the magic - changes appear instantly on all devices!
   */
  subscribeMeetings(callback) {
    // Skip if Firestore not available
    if (!this.isAvailable) {
      console.log('⏭️ Firestore unavailable, skipping meeting subscription')
      return () => {} // Return no-op unsubscribe
    }

    try {
      const q = query(
        collection(db, 'meetings'),
        where('userId', '==', this.userId),
        where('deleted', '==', false)
      )

      const unsubscribe = onSnapshot(q,
        (querySnapshot) => {
          const meetings = []
          querySnapshot.forEach((doc) => {
            const data = doc.data()
            meetings.push({
              id: doc.id,
              ...data,
              lastModified: data.lastModified?.toDate?.() || data.lastModified
            })
          })

          console.log('Real-time update - meetings:', meetings.length)
          callback(meetings)
        },
        (error) => {
          console.error('Firestore subscription error:', error)
          // Don't throw - just log and continue, callback won't be called
        }
      )

      this.listeners.push(unsubscribe)
      return unsubscribe
    } catch (error) {
      console.error('Error setting up meeting subscription:', error)
      // Return a no-op function instead of throwing
      return () => {}
    }
  }

  // ==================== STAKEHOLDERS ====================

  async saveStakeholder(stakeholder) {
    try {
      // Validate stakeholder has an ID
      if (!stakeholder.id) {
        console.warn('Skipping stakeholder without ID:', stakeholder)
        return { success: false, reason: 'no_id' }
      }

      const stakeholderRef = doc(db, 'stakeholders', stakeholder.id)
      const stakeholderData = {
        ...stakeholder,
        userId: this.userId,
        lastModified: serverTimestamp(),
        deleted: false
      }

      await setDoc(stakeholderRef, stakeholderData, { merge: true })
      console.log('Stakeholder saved to Firestore:', stakeholder.id)
      return { success: true }
    } catch (error) {
      console.error('Error saving stakeholder to Firestore:', error)
      throw error
    }
  }

  async deleteStakeholder(stakeholderId) {
    try {
      const stakeholderRef = doc(db, 'stakeholders', stakeholderId)
      await setDoc(stakeholderRef, {
        deleted: true,
        deletedAt: serverTimestamp(),
        lastModified: serverTimestamp()
      }, { merge: true })

      console.log('Stakeholder deleted in Firestore:', stakeholderId)
      return { success: true }
    } catch (error) {
      console.error('Error deleting stakeholder in Firestore:', error)
      throw error
    }
  }

  async getStakeholders() {
    try {
      const q = query(
        collection(db, 'stakeholders'),
        where('userId', '==', this.userId),
        where('deleted', '==', false)
      )

      const querySnapshot = await getDocs(q)
      const stakeholders = []

      querySnapshot.forEach((doc) => {
        const data = doc.data()
        stakeholders.push({
          id: doc.id,
          ...data,
          lastModified: data.lastModified?.toDate?.() || data.lastModified
        })
      })

      console.log('Fetched stakeholders from Firestore:', stakeholders.length)
      return stakeholders
    } catch (error) {
      console.error('Error getting stakeholders from Firestore:', error)
      throw error
    }
  }

  subscribeStakeholders(callback) {
    // Skip if Firestore not available
    if (!this.isAvailable) {
      console.log('⏭️ Firestore unavailable, skipping stakeholder subscription')
      return () => {}
    }

    try {
      const q = query(
        collection(db, 'stakeholders'),
        where('userId', '==', this.userId),
        where('deleted', '==', false)
      )

      const unsubscribe = onSnapshot(q,
        (querySnapshot) => {
          const stakeholders = []
          querySnapshot.forEach((doc) => {
            const data = doc.data()
            stakeholders.push({
              id: doc.id,
              ...data,
              lastModified: data.lastModified?.toDate?.() || data.lastModified
            })
          })

          console.log('Real-time update - stakeholders:', stakeholders.length)
          callback(stakeholders)
        },
        (error) => {
          console.error('Firestore stakeholder subscription error:', error)
        }
      )

      this.listeners.push(unsubscribe)
      return unsubscribe
    } catch (error) {
      console.error('Error setting up stakeholder subscription:', error)
      return () => {}
    }
  }

  // ==================== STAKEHOLDER CATEGORIES ====================

  async saveStakeholderCategory(category) {
    try {
      // Validate category has an ID - skip if undefined
      if (!category.id) {
        console.warn('Skipping category without ID:', category)
        return { success: false, reason: 'no_id' }
      }

      const categoryRef = doc(db, 'stakeholderCategories', category.id)
      const categoryData = {
        ...category,
        userId: this.userId,
        lastModified: serverTimestamp(),
        deleted: false
      }

      await setDoc(categoryRef, categoryData, { merge: true })
      console.log('Category saved to Firestore:', category.id)
      return { success: true }
    } catch (error) {
      console.error('Error saving category to Firestore:', error)
      throw error
    }
  }

  async deleteStakeholderCategory(categoryId) {
    try {
      const categoryRef = doc(db, 'stakeholderCategories', categoryId)
      await setDoc(categoryRef, {
        deleted: true,
        deletedAt: serverTimestamp(),
        lastModified: serverTimestamp()
      }, { merge: true })

      console.log('Category deleted in Firestore:', categoryId)
      return { success: true }
    } catch (error) {
      console.error('Error deleting category in Firestore:', error)
      throw error
    }
  }

  async getStakeholderCategories() {
    try {
      const q = query(
        collection(db, 'stakeholderCategories'),
        where('userId', '==', this.userId),
        where('deleted', '==', false)
      )

      const querySnapshot = await getDocs(q)
      const categories = []

      querySnapshot.forEach((doc) => {
        const data = doc.data()
        categories.push({
          id: doc.id,
          ...data,
          lastModified: data.lastModified?.toDate?.() || data.lastModified
        })
      })

      console.log('Fetched categories from Firestore:', categories.length)
      return categories
    } catch (error) {
      console.error('Error getting categories from Firestore:', error)
      throw error
    }
  }

  subscribeStakeholderCategories(callback) {
    // Skip if Firestore not available
    if (!this.isAvailable) {
      console.log('⏭️ Firestore unavailable, skipping category subscription')
      return () => {}
    }

    try {
      const q = query(
        collection(db, 'stakeholderCategories'),
        where('userId', '==', this.userId),
        where('deleted', '==', false)
      )

      const unsubscribe = onSnapshot(q,
        (querySnapshot) => {
          const categories = []
          querySnapshot.forEach((doc) => {
            const data = doc.data()
            categories.push({
              id: doc.id,
              ...data,
              lastModified: data.lastModified?.toDate?.() || data.lastModified
            })
          })

          console.log('Real-time update - categories:', categories.length)
          callback(categories)
        },
        (error) => {
          console.error('Firestore category subscription error:', error)
        }
      )

      this.listeners.push(unsubscribe)
      return unsubscribe
    } catch (error) {
      console.error('Error setting up category subscription:', error)
      return () => {}
    }
  }

  // ==================== BATCH IMPORT ====================

  /**
   * Import all existing data to Firestore
   * Use this once to migrate from old sync system
   */
  async importAllData(meetings, stakeholders, categories) {
    try {
      console.log('Starting batch import to Firestore...')
      console.log('- Meetings:', meetings.length)
      console.log('- Stakeholders:', stakeholders.length)
      console.log('- Categories:', categories.length)

      const batch = writeBatch(db)
      let count = 0

      // Import meetings (skip any without IDs)
      for (const meeting of meetings) {
        if (count >= 500) break // Firestore batch limit
        if (!meeting.id) {
          console.warn('Skipping meeting without ID during import')
          continue
        }
        const meetingRef = doc(db, 'meetings', meeting.id)
        batch.set(meetingRef, {
          ...meeting,
          userId: this.userId,
          lastModified: serverTimestamp(),
          deleted: false,
          importedAt: serverTimestamp()
        })
        count++
      }

      // Import stakeholders (skip any without IDs)
      for (const stakeholder of stakeholders) {
        if (count >= 500) break
        if (!stakeholder.id) {
          console.warn('Skipping stakeholder without ID during import')
          continue
        }
        const stakeholderRef = doc(db, 'stakeholders', stakeholder.id)
        batch.set(stakeholderRef, {
          ...stakeholder,
          userId: this.userId,
          lastModified: serverTimestamp(),
          deleted: false,
          importedAt: serverTimestamp()
        })
        count++
      }

      // Import categories (skip any without IDs)
      for (const category of categories) {
        if (count >= 500) break
        if (!category.id) {
          console.warn('Skipping category without ID during import')
          continue
        }
        const categoryRef = doc(db, 'stakeholderCategories', category.id)
        batch.set(categoryRef, {
          ...category,
          userId: this.userId,
          lastModified: serverTimestamp(),
          deleted: false,
          importedAt: serverTimestamp()
        })
        count++
      }

      await batch.commit()
      console.log('Batch import completed! Total items:', count)

      return {
        success: true,
        imported: count,
        meetings: meetings.length,
        stakeholders: stakeholders.length,
        categories: categories.length
      }
    } catch (error) {
      console.error('Batch import failed:', error)
      throw error
    }
  }

  // ==================== UTILITIES ====================

  /**
   * Clean up all subscriptions (call when app closes)
   */
  cleanup() {
    console.log('Cleaning up Firestore listeners:', this.listeners.length)
    this.listeners.forEach(unsubscribe => unsubscribe())
    this.listeners = []
  }

  /**
   * Check if Firestore connection is working
   */
  async checkConnection() {
    try {
      // Try to read a document to test connection
      const testRef = doc(db, 'connectionTest', 'test')
      await getDoc(testRef)
      return { connected: true }
    } catch (error) {
      console.error('Firestore connection check failed:', error)
      return { connected: false, error: error.message }
    }
  }

  /**
   * Get the current user ID (for linking devices)
   */
  getUserId() {
    return this.userId
  }
}

// Create a single instance to use throughout the app
// Wrapped in try-catch to prevent app crashes on initialization
let firestoreService
try {
  firestoreService = new FirestoreService()
} catch (error) {
  console.error('❌ Failed to create FirestoreService:', error)
  // Create a dummy service that does nothing
  firestoreService = {
    isAvailable: false,
    userId: null,
    listeners: [],
    saveMeeting: async () => ({ success: false, reason: 'service_unavailable' }),
    deleteMeeting: async () => ({ success: false }),
    getMeetings: async () => [],
    subscribeMeetings: () => () => {},
    saveStakeholder: async () => ({ success: false }),
    deleteStakeholder: async () => ({ success: false }),
    getStakeholders: async () => [],
    subscribeStakeholders: () => () => {},
    saveStakeholderCategory: async () => ({ success: false }),
    deleteStakeholderCategory: async () => ({ success: false }),
    getStakeholderCategories: async () => [],
    subscribeStakeholderCategories: () => () => {},
    importAllData: async () => ({ success: false }),
    cleanup: () => {},
    checkConnection: async () => ({ connected: false }),
    getUserId: () => null,
    setUserId: () => {},
    getOrCreateUserId: () => null
  }
}
export default firestoreService
