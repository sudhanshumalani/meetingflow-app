/**
 * Firestore Service for Meetingflow App
 * Handles all database operations - saving, loading, deleting meetings
 *
 * iOS Safety:
 * - NO module-level Firebase imports
 * - All Firestore operations are wrapped in try-catch
 * - Debug logging for diagnosing iOS issues
 * - Graceful degradation if Firestore unavailable
 *
 * References:
 * - https://github.com/firebase/firebase-js-sdk/issues/7780
 * - https://github.com/firebase/firebase-js-sdk/issues/2581
 */

// Debug log storage
const debugLogs = []

function debugLog(message, type = 'info') {
  const entry = {
    timestamp: new Date().toISOString(),
    message,
    type
  }
  debugLogs.push(entry)

  if (debugLogs.length > 100) {
    debugLogs.shift()
  }

  const prefix = '🔥 Firestore:'
  if (type === 'error') {
    console.error(`${prefix} ${message}`)
  } else if (type === 'warn') {
    console.warn(`${prefix} ${message}`)
  } else {
    console.log(`${prefix} ${message}`)
  }
}

// Export debug logs for UI
export function getFirestoreDebugLogs() {
  return [...debugLogs]
}

// Lazy-loaded modules - NOT imported at module level for iOS safety
let firestoreModule = null
let db = null
let isInitialized = false
let initPromise = null
let lastError = null

// Detect iOS (simple check, full detection in firebase.js)
const IS_IOS = typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
   (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 0))

debugLog(`Service created. iOS: ${IS_IOS}`)

/**
 * Remove undefined values from an object (recursively)
 * Firestore throws error on undefined values, so we must clean them
 */
function removeUndefined(obj) {
  if (obj === null || obj === undefined) {
    return null
  }
  if (Array.isArray(obj)) {
    return obj.map(item => removeUndefined(item)).filter(item => item !== undefined)
  }
  if (typeof obj === 'object') {
    const cleaned = {}
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        cleaned[key] = removeUndefined(value)
      }
    }
    return cleaned
  }
  return obj
}

/**
 * Lazy load Firestore - SAFE for iOS
 */
async function ensureFirestoreLoaded() {
  if (isInitialized && db) {
    return true
  }

  if (initPromise) {
    return initPromise
  }

  initPromise = (async () => {
    try {
      debugLog('Loading Firestore lazily...')

      // Import firebase config lazily
      const firebaseConfig = await import('../config/firebase')
      const { initializeFirebase } = firebaseConfig

      debugLog('Calling initializeFirebase()...')
      const firebase = await initializeFirebase()

      if (!firebase.db) {
        debugLog('Firebase.db is null - Firestore unavailable', 'warn')
        lastError = new Error('Firebase.db is null')
        return false
      }

      db = firebase.db
      debugLog('Got db instance, importing firestore functions...')

      // Import Firestore functions
      try {
        firestoreModule = await import('firebase/firestore')
        debugLog('Firestore module imported successfully')
      } catch (importErr) {
        debugLog(`Failed to import firestore module: ${importErr.message}`, 'error')
        lastError = importErr
        return false
      }

      isInitialized = true
      debugLog('Firestore fully loaded and ready')
      return true

    } catch (error) {
      debugLog(`Failed to load Firestore: ${error.message}`, 'error')
      debugLog(`Stack: ${error.stack}`, 'error')
      lastError = error
      return false
    }
  })()

  return initPromise
}

/**
 * Sanitize document ID for Firestore
 * Firestore document IDs cannot contain forward slashes as they're path separators
 * This encodes problematic characters so IDs like "team/-board" work correctly
 */
function sanitizeDocId(id) {
  if (!id) return id
  // Encode forward slashes which are interpreted as path separators
  // Also encode other problematic characters
  return id
    .replace(/\//g, '__SLASH__')
    .replace(/\./g, '__DOT__')
}

/**
 * Decode sanitized document ID back to original
 */
function desanitizeDocId(id) {
  if (!id) return id
  return id
    .replace(/__SLASH__/g, '/')
    .replace(/__DOT__/g, '.')
}

class FirestoreService {
  constructor() {
    this.isAvailable = true // Will be updated after first load attempt
    this.listeners = []
    this.userId = this.getOrCreateUserId()

    debugLog(`FirestoreService instance created. UserId: ${this.userId}`)
  }

  getOrCreateUserId() {
    try {
      let userId = localStorage.getItem('meetingflow_firestore_user_id')
      if (!userId) {
        userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        localStorage.setItem('meetingflow_firestore_user_id', userId)
        debugLog(`Created new user ID: ${userId}`)
      }
      return userId
    } catch (e) {
      debugLog(`Error getting userId: ${e.message}`, 'error')
      return `user_fallback_${Date.now()}`
    }
  }

  setUserId(newUserId) {
    this.userId = newUserId
    try {
      localStorage.setItem('meetingflow_firestore_user_id', newUserId)
    } catch (e) {
      debugLog(`Error setting userId: ${e.message}`, 'error')
    }
    debugLog(`Updated user ID to: ${newUserId}`)
  }

  getUserId() {
    return this.userId
  }

  // Get service status for debugging
  getStatus() {
    return {
      isAvailable: this.isAvailable,
      isInitialized,
      hasError: lastError !== null,
      lastError: lastError?.message || null,
      listenersCount: this.listeners.length,
      userId: this.userId,
      logsCount: debugLogs.length
    }
  }

  // Get debug logs
  getDebugLogs() {
    return [...debugLogs]
  }

  // ==================== MEETINGS ====================

  async saveMeeting(meeting) {
    debugLog(`saveMeeting called: ${meeting?.id}`)

    const ready = await ensureFirestoreLoaded()
    if (!ready) {
      debugLog('saveMeeting: Firestore not ready', 'warn')
      this.isAvailable = false
      return { success: false, reason: 'firestore_unavailable' }
    }

    try {
      if (!meeting?.id) {
        debugLog('saveMeeting: No meeting ID', 'warn')
        return { success: false, reason: 'no_id' }
      }

      // Clean meeting data - remove undefined values (Firestore rejects them)
      const cleanedMeeting = removeUndefined(meeting)

      const { doc, setDoc, serverTimestamp } = firestoreModule
      const meetingRef = doc(db, 'meetings', meeting.id)
      await setDoc(meetingRef, {
        ...cleanedMeeting,
        userId: this.userId,
        // Preserve updatedAt from the meeting data, use serverTimestamp for lastModified
        // This ensures timestamp comparison works correctly across devices
        updatedAt: meeting.updatedAt || new Date().toISOString(),
        lastModified: serverTimestamp(),
        // BUGFIX: Respect deleted flag from incoming data instead of hardcoding false
        deleted: meeting.deleted ?? false
      }, { merge: true })

      debugLog(`Meeting saved: ${meeting.id} (deleted: ${meeting.deleted ?? false})`)
      return { success: true }
    } catch (error) {
      debugLog(`saveMeeting error: ${error.message}`, 'error')
      return { success: false, reason: error.message }
    }
  }

  async deleteMeeting(meetingId) {
    debugLog(`deleteMeeting called: ${meetingId}`)

    const ready = await ensureFirestoreLoaded()
    if (!ready) {
      return { success: false, reason: 'firestore_unavailable' }
    }

    try {
      const { doc, setDoc, serverTimestamp } = firestoreModule
      const meetingRef = doc(db, 'meetings', meetingId)
      await setDoc(meetingRef, {
        deleted: true,
        deletedAt: serverTimestamp(),
        lastModified: serverTimestamp()
      }, { merge: true })

      debugLog(`Meeting deleted: ${meetingId}`)
      return { success: true }
    } catch (error) {
      debugLog(`deleteMeeting error: ${error.message}`, 'error')
      return { success: false, reason: error.message }
    }
  }

  async getMeetings() {
    debugLog('getMeetings called')

    const ready = await ensureFirestoreLoaded()
    if (!ready) {
      debugLog('getMeetings: Firestore not ready', 'warn')
      return []
    }

    try {
      const { collection, query, where, getDocs } = firestoreModule
      // SYNC FIX: Include ALL meetings (including deleted=true)
      // Manual sync needs to see tombstones to propagate deletes
      const q = query(
        collection(db, 'meetings'),
        where('userId', '==', this.userId)
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

      debugLog(`getMeetings: Fetched ${meetings.length} meetings (includes deleted)`)
      return meetings
    } catch (error) {
      debugLog(`getMeetings error: ${error.message}`, 'error')
      return []
    }
  }

  /**
   * Get IDs of deleted documents in a collection
   * Used by manual sync to know which local items to remove
   */
  async getDeletedIds(collectionName) {
    debugLog(`getDeletedIds called for ${collectionName}`)

    const ready = await ensureFirestoreLoaded()
    if (!ready) {
      debugLog('getDeletedIds: Firestore not ready', 'warn')
      return []
    }

    try {
      const { collection, query, where, getDocs } = firestoreModule
      const q = query(
        collection(db, collectionName),
        where('userId', '==', this.userId),
        where('deleted', '==', true)
      )

      const querySnapshot = await getDocs(q)
      const deletedIds = []
      querySnapshot.forEach((docSnap) => {
        deletedIds.push(docSnap.id)
      })

      debugLog(`getDeletedIds: Found ${deletedIds.length} deleted items in ${collectionName}`)
      return deletedIds
    } catch (error) {
      debugLog(`getDeletedIds error: ${error.message}`, 'error')
      return []
    }
  }

  subscribeMeetings(callback) {
    debugLog('subscribeMeetings called')

    // Use async initialization inside
    ensureFirestoreLoaded().then(ready => {
      if (!ready) {
        debugLog('subscribeMeetings: Firestore not ready, skipping', 'warn')
        return
      }

      try {
        const { collection, query, where, onSnapshot } = firestoreModule
        // SYNC FIX: Include ALL meetings (including deleted=true)
        // Tombstones must propagate to other devices for delete sync to work
        // UI layer filters by !deleted, not the query
        const q = query(
          collection(db, 'meetings'),
          where('userId', '==', this.userId)
        )

        debugLog('Setting up meetings onSnapshot listener (includes deleted)...')

        const unsubscribe = onSnapshot(q,
          (querySnapshot) => {
            try {
              const meetings = []
              querySnapshot.forEach((docSnap) => {
                const data = docSnap.data()
                meetings.push({
                  id: docSnap.id,
                  ...data,
                  lastModified: data.lastModified?.toDate?.() || data.lastModified
                })
              })

              // DEBUG: Log deleted status breakdown
              const deletedMeetings = meetings.filter(m => m.deleted)
              const activeMeetings = meetings.filter(m => !m.deleted)
              debugLog(`onSnapshot: Received ${meetings.length} meetings (${deletedMeetings.length} deleted, ${activeMeetings.length} active)`)

              // DEBUG: Log details of deleted meetings
              if (deletedMeetings.length > 0) {
                debugLog(`onSnapshot DELETED meetings: ${deletedMeetings.map(m => m.id?.slice(0,20) + '(deleted=' + m.deleted + ')').join(', ')}`)
              }

              callback(meetings)
            } catch (callbackErr) {
              debugLog(`onSnapshot callback error: ${callbackErr.message}`, 'error')
            }
          },
          (error) => {
            debugLog(`onSnapshot error: ${error.message}`, 'error')
          }
        )

        this.listeners.push(unsubscribe)
        debugLog('Meetings subscription active')
      } catch (error) {
        debugLog(`subscribeMeetings setup error: ${error.message}`, 'error')
      }
    }).catch(err => {
      debugLog(`subscribeMeetings promise error: ${err.message}`, 'error')
    })

    return () => {} // Return no-op, actual unsubscribe stored in listeners
  }

  // ==================== STAKEHOLDERS ====================

  async saveStakeholder(stakeholder) {
    const ready = await ensureFirestoreLoaded()
    if (!ready) return { success: false, reason: 'firestore_unavailable' }

    try {
      if (!stakeholder?.id) return { success: false, reason: 'no_id' }

      // Clean data - remove undefined values (Firestore rejects them)
      const cleanedStakeholder = removeUndefined(stakeholder)

      const { doc, setDoc, serverTimestamp } = firestoreModule
      const ref = doc(db, 'stakeholders', stakeholder.id)
      await setDoc(ref, {
        ...cleanedStakeholder,
        userId: this.userId,
        // Preserve updatedAt from the data, use serverTimestamp for lastModified
        updatedAt: stakeholder.updatedAt || new Date().toISOString(),
        lastModified: serverTimestamp(),
        // BUGFIX: Respect deleted flag from incoming data instead of hardcoding false
        // This was causing deleted stakeholders to resurrect on sync
        deleted: stakeholder.deleted ?? false
      }, { merge: true })

      debugLog(`Stakeholder saved: ${stakeholder.id} (deleted: ${stakeholder.deleted ?? false})`)
      return { success: true }
    } catch (error) {
      debugLog(`saveStakeholder error: ${error.message}`, 'error')
      return { success: false, reason: error.message }
    }
  }

  async deleteStakeholder(stakeholderId) {
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
      debugLog(`Stakeholder deleted: ${stakeholderId}`)
      return { success: true }
    } catch (error) {
      debugLog(`deleteStakeholder error: ${error.message}`, 'error')
      return { success: false, reason: error.message }
    }
  }

  async getStakeholders() {
    const ready = await ensureFirestoreLoaded()
    if (!ready) return []

    try {
      const { collection, query, where, getDocs } = firestoreModule
      // SYNC FIX: Include ALL stakeholders (including deleted=true)
      const q = query(
        collection(db, 'stakeholders'),
        where('userId', '==', this.userId)
      )
      const querySnapshot = await getDocs(q)
      const items = []
      querySnapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() })
      })
      debugLog(`getStakeholders: Fetched ${items.length} (includes deleted)`)
      return items
    } catch (error) {
      debugLog(`getStakeholders error: ${error.message}`, 'error')
      return []
    }
  }

  subscribeStakeholders(callback) {
    ensureFirestoreLoaded().then(ready => {
      if (!ready) return

      try {
        const { collection, query, where, onSnapshot } = firestoreModule
        // SYNC FIX: Include ALL stakeholders (including deleted=true)
        const q = query(
          collection(db, 'stakeholders'),
          where('userId', '==', this.userId)
        )
        const unsubscribe = onSnapshot(q, (snapshot) => {
          try {
            const items = []
            snapshot.forEach((docSnap) => {
              items.push({ id: docSnap.id, ...docSnap.data() })
            })
            debugLog(`Stakeholders onSnapshot: ${items.length}`)
            callback(items)
          } catch (err) {
            debugLog(`Stakeholders callback error: ${err.message}`, 'error')
          }
        }, (error) => {
          debugLog(`Stakeholders subscription error: ${error.message}`, 'error')
        })
        this.listeners.push(unsubscribe)
      } catch (error) {
        debugLog(`subscribeStakeholders setup error: ${error.message}`, 'error')
      }
    }).catch(err => {
      debugLog(`subscribeStakeholders promise error: ${err.message}`, 'error')
    })

    return () => {}
  }

  // ==================== STAKEHOLDER CATEGORIES ====================

  async saveStakeholderCategory(category) {
    const ready = await ensureFirestoreLoaded()
    if (!ready) return { success: false, reason: 'firestore_unavailable' }

    try {
      if (!category?.id) return { success: false, reason: 'no_id' }

      // Clean data - remove undefined values (Firestore rejects them)
      const cleanedCategory = removeUndefined(category)

      // Sanitize document ID to handle slashes and other problematic characters
      const safeDocId = sanitizeDocId(category.id)

      const { doc, setDoc, serverTimestamp } = firestoreModule
      const ref = doc(db, 'stakeholderCategories', safeDocId)
      await setDoc(ref, {
        ...cleanedCategory,
        // Store original ID in the document for reference
        originalId: category.id,
        userId: this.userId,
        // Preserve updatedAt from the data, use serverTimestamp for lastModified
        updatedAt: category.updatedAt || new Date().toISOString(),
        lastModified: serverTimestamp(),
        // BUGFIX: Respect deleted flag from incoming data instead of hardcoding false
        // This was causing deleted categories to resurrect on sync
        deleted: category.deleted ?? false
      }, { merge: true })
      debugLog(`Category saved: ${category.id} -> ${safeDocId} (deleted: ${category.deleted ?? false})`)
      return { success: true }
    } catch (error) {
      debugLog(`saveStakeholderCategory error: ${error.message}`, 'error')
      return { success: false, reason: error.message }
    }
  }

  async deleteStakeholderCategory(categoryId) {
    const ready = await ensureFirestoreLoaded()
    if (!ready) return { success: false, reason: 'firestore_unavailable' }

    try {
      // Sanitize document ID to handle slashes and other problematic characters
      const safeDocId = sanitizeDocId(categoryId)

      const { doc, setDoc, serverTimestamp } = firestoreModule
      const ref = doc(db, 'stakeholderCategories', safeDocId)
      await setDoc(ref, {
        deleted: true,
        deletedAt: serverTimestamp(),
        lastModified: serverTimestamp()
      }, { merge: true })
      debugLog(`Category deleted: ${categoryId} -> ${safeDocId}`)
      return { success: true }
    } catch (error) {
      debugLog(`deleteStakeholderCategory error: ${error.message}`, 'error')
      return { success: false, reason: error.message }
    }
  }

  async getStakeholderCategories() {
    const ready = await ensureFirestoreLoaded()
    if (!ready) return []

    try {
      const { collection, query, where, getDocs } = firestoreModule
      // SYNC FIX: Include ALL categories (including deleted=true)
      const q = query(
        collection(db, 'stakeholderCategories'),
        where('userId', '==', this.userId)
      )
      const snapshot = await getDocs(q)
      const items = []
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() })
      })
      debugLog(`getStakeholderCategories: Fetched ${items.length} (includes deleted)`)
      return items
    } catch (error) {
      debugLog(`getStakeholderCategories error: ${error.message}`, 'error')
      return []
    }
  }

  subscribeStakeholderCategories(callback) {
    ensureFirestoreLoaded().then(ready => {
      if (!ready) return

      try {
        const { collection, query, where, onSnapshot } = firestoreModule
        // SYNC FIX: Include ALL categories (including deleted=true)
        const q = query(
          collection(db, 'stakeholderCategories'),
          where('userId', '==', this.userId)
        )
        const unsubscribe = onSnapshot(q, (snapshot) => {
          try {
            const items = []
            snapshot.forEach((docSnap) => {
              items.push({ id: docSnap.id, ...docSnap.data() })
            })
            debugLog(`Categories onSnapshot: ${items.length}`)
            callback(items)
          } catch (err) {
            debugLog(`Categories callback error: ${err.message}`, 'error')
          }
        }, (error) => {
          debugLog(`Categories subscription error: ${error.message}`, 'error')
        })
        this.listeners.push(unsubscribe)
      } catch (error) {
        debugLog(`subscribeStakeholderCategories setup error: ${error.message}`, 'error')
      }
    }).catch(err => {
      debugLog(`subscribeStakeholderCategories promise error: ${err.message}`, 'error')
    })

    return () => {}
  }

  // ==================== BATCH IMPORT ====================

  async importAllData(meetings, stakeholders, categories) {
    const ready = await ensureFirestoreLoaded()
    if (!ready) return { success: false, reason: 'firestore_unavailable' }

    try {
      const { doc, writeBatch, serverTimestamp } = firestoreModule
      const batch = writeBatch(db)
      let count = 0

      for (const meeting of meetings) {
        if (count >= 500 || !meeting.id) continue
        batch.set(doc(db, 'meetings', meeting.id), {
          ...meeting, userId: this.userId, lastModified: serverTimestamp(), deleted: meeting.deleted ?? false
        })
        count++
      }

      for (const stakeholder of stakeholders) {
        if (count >= 500 || !stakeholder.id) continue
        batch.set(doc(db, 'stakeholders', stakeholder.id), {
          ...stakeholder, userId: this.userId, lastModified: serverTimestamp(), deleted: stakeholder.deleted ?? false
        })
        count++
      }

      for (const category of categories) {
        if (count >= 500 || !category.id) continue
        batch.set(doc(db, 'stakeholderCategories', category.id), {
          ...category, userId: this.userId, lastModified: serverTimestamp(), deleted: category.deleted ?? false
        })
        count++
      }

      await batch.commit()
      debugLog(`Batch import completed: ${count} items`)
      return { success: true, imported: count }
    } catch (error) {
      debugLog(`importAllData error: ${error.message}`, 'error')
      return { success: false, reason: error.message }
    }
  }

  // ==================== UTILITIES ====================

  cleanup() {
    debugLog(`Cleaning up ${this.listeners.length} listeners`)
    this.listeners.forEach(unsubscribe => {
      try { unsubscribe() } catch (e) { /* ignore */ }
    })
    this.listeners = []
  }

  async checkConnection() {
    const ready = await ensureFirestoreLoaded()
    if (!ready) return { connected: false, reason: 'firestore_unavailable' }

    try {
      const { doc, getDoc } = firestoreModule
      await getDoc(doc(db, 'connectionTest', 'test'))
      debugLog('Connection check: SUCCESS')
      return { connected: true }
    } catch (error) {
      debugLog(`Connection check failed: ${error.message}`, 'error')
      return { connected: false, error: error.message }
    }
  }

  // ==================== CLEANUP UTILITIES ====================

  /**
   * Get ALL items from a collection (including deleted ones)
   * Used for cleanup and debugging
   */
  async getAllFromCollection(collection) {
    const ready = await ensureFirestoreLoaded()
    if (!ready) return []

    try {
      const { collection: col, query, where, getDocs } = firestoreModule
      const q = query(col(db, collection), where('userId', '==', this.userId))
      const snapshot = await getDocs(q)

      const items = []
      snapshot.forEach(doc => {
        items.push({ id: doc.id, ...doc.data() })
      })

      debugLog(`getAllFromCollection(${collection}): Found ${items.length} items`)
      return items
    } catch (error) {
      debugLog(`getAllFromCollection error: ${error.message}`, 'error')
      return []
    }
  }

  /**
   * HARD DELETE an item from Firestore (permanently remove, not soft-delete)
   */
  async hardDeleteDocument(collection, docId) {
    const ready = await ensureFirestoreLoaded()
    if (!ready) return { success: false, reason: 'firestore_unavailable' }

    try {
      // Sanitize document ID to handle slashes and other problematic characters
      const safeDocId = sanitizeDocId(docId)

      const { doc, deleteDoc } = firestoreModule
      await deleteDoc(doc(db, collection, safeDocId))
      debugLog(`HARD DELETED ${collection}/${docId} -> ${safeDocId}`)
      return { success: true }
    } catch (error) {
      debugLog(`hardDeleteDocument error: ${error.message}`, 'error')
      return { success: false, reason: error.message }
    }
  }

  /**
   * Get cleanup report - shows all items and their deleted status
   */
  async getCleanupReport() {
    const ready = await ensureFirestoreLoaded()
    if (!ready) return { error: 'Firestore unavailable' }

    try {
      const stakeholders = await this.getAllFromCollection('stakeholders')
      const categories = await this.getAllFromCollection('stakeholderCategories')
      const meetings = await this.getAllFromCollection('meetings')

      const report = {
        stakeholders: {
          total: stakeholders.length,
          active: stakeholders.filter(s => !s.deleted).length,
          deleted: stakeholders.filter(s => s.deleted).length,
          items: stakeholders.map(s => ({
            id: s.id,
            name: s.name || s.company || 'Unknown',
            deleted: !!s.deleted,
            deletedAt: s.deletedAt,
            updatedAt: s.updatedAt
          }))
        },
        categories: {
          total: categories.length,
          active: categories.filter(c => !c.deleted).length,
          deleted: categories.filter(c => c.deleted).length,
          items: categories.map(c => ({
            id: c.id,
            label: c.label || c.key || 'Unknown',
            deleted: !!c.deleted,
            deletedAt: c.deletedAt,
            updatedAt: c.updatedAt
          }))
        },
        meetings: {
          total: meetings.length,
          active: meetings.filter(m => !m.deleted).length,
          deleted: meetings.filter(m => m.deleted).length
        }
      }

      debugLog(`Cleanup report: ${report.stakeholders.deleted} deleted stakeholders, ${report.categories.deleted} deleted categories`)
      return report
    } catch (error) {
      debugLog(`getCleanupReport error: ${error.message}`, 'error')
      return { error: error.message }
    }
  }

  /**
   * Purge all soft-deleted items from Firestore (hard delete them)
   */
  async purgeDeletedItems() {
    const ready = await ensureFirestoreLoaded()
    if (!ready) return { success: false, reason: 'firestore_unavailable' }

    const results = {
      stakeholders: { purged: 0, failed: 0 },
      categories: { purged: 0, failed: 0 },
      meetings: { purged: 0, failed: 0 }
    }

    try {
      // Purge deleted stakeholders
      const stakeholders = await this.getAllFromCollection('stakeholders')
      for (const s of stakeholders.filter(s => s.deleted)) {
        const result = await this.hardDeleteDocument('stakeholders', s.id)
        if (result.success) results.stakeholders.purged++
        else results.stakeholders.failed++
      }

      // Purge deleted categories
      const categories = await this.getAllFromCollection('stakeholderCategories')
      for (const c of categories.filter(c => c.deleted)) {
        const result = await this.hardDeleteDocument('stakeholderCategories', c.id)
        if (result.success) results.categories.purged++
        else results.categories.failed++
      }

      // Purge deleted meetings
      const meetings = await this.getAllFromCollection('meetings')
      for (const m of meetings.filter(m => m.deleted)) {
        const result = await this.hardDeleteDocument('meetings', m.id)
        if (result.success) results.meetings.purged++
        else results.meetings.failed++
      }

      debugLog(`Purge complete: ${results.stakeholders.purged} stakeholders, ${results.categories.purged} categories, ${results.meetings.purged} meetings`)
      return { success: true, results }
    } catch (error) {
      debugLog(`purgeDeletedItems error: ${error.message}`, 'error')
      return { success: false, reason: error.message, results }
    }
  }

  /**
   * Hard delete specific items by ID
   */
  async hardDeleteItems(itemsToDelete) {
    const results = {
      stakeholders: { deleted: 0, failed: 0 },
      categories: { deleted: 0, failed: 0 },
      meetings: { deleted: 0, failed: 0 }
    }

    for (const id of (itemsToDelete.stakeholders || [])) {
      const result = await this.hardDeleteDocument('stakeholders', id)
      if (result.success) results.stakeholders.deleted++
      else results.stakeholders.failed++
    }

    for (const id of (itemsToDelete.categories || [])) {
      const result = await this.hardDeleteDocument('stakeholderCategories', id)
      if (result.success) results.categories.deleted++
      else results.categories.failed++
    }

    for (const id of (itemsToDelete.meetings || [])) {
      const result = await this.hardDeleteDocument('meetings', id)
      if (result.success) results.meetings.deleted++
      else results.meetings.failed++
    }

    return { success: true, results }
  }
}

// Create singleton instance
const firestoreService = new FirestoreService()
export default firestoreService
