/**
 * Firestore REST API Service
 *
 * This service uses the Firestore REST API directly instead of the Firebase JS SDK.
 * The REST API uses standard fetch() which works perfectly on iOS Safari.
 *
 * Why this exists:
 * - Firebase JS SDK crashes on iOS Safari PWA
 * - REST API bypasses all SDK issues
 * - Works on ALL browsers including iOS Safari
 *
 * References:
 * - https://firebase.google.com/docs/firestore/use-rest-api
 * - https://cloud.google.com/firestore/docs/reference/rest
 */

// Firebase project configuration
const FIREBASE_PROJECT_ID = 'meetingflow-app-bcb76'
const FIREBASE_API_KEY = 'AIzaSyC_r2K8JIWFGEjmTbIuTgp7sgY5F4FuryI'

// Base URL for Firestore REST API
const FIRESTORE_BASE_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`

// Debug logging
const debugLogs = []

function debugLog(message, type = 'info') {
  const entry = { timestamp: new Date().toISOString(), message, type }
  debugLogs.push(entry)
  if (debugLogs.length > 100) debugLogs.shift()

  const prefix = '🌐 FirestoreREST:'
  if (type === 'error') console.error(`${prefix} ${message}`)
  else if (type === 'warn') console.warn(`${prefix} ${message}`)
  else console.log(`${prefix} ${message}`)
}

// Export debug logs
export function getFirestoreRestDebugLogs() {
  return [...debugLogs]
}

/**
 * Convert JavaScript object to Firestore document format
 */
function toFirestoreValue(value) {
  if (value === null || value === undefined) {
    return { nullValue: null }
  }
  if (typeof value === 'boolean') {
    return { booleanValue: value }
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return { integerValue: String(value) }
    }
    return { doubleValue: value }
  }
  if (typeof value === 'string') {
    return { stringValue: value }
  }
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map(toFirestoreValue)
      }
    }
  }
  if (value instanceof Date) {
    return { timestampValue: value.toISOString() }
  }
  if (typeof value === 'object') {
    const fields = {}
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) {
        fields[k] = toFirestoreValue(v)
      }
    }
    return { mapValue: { fields } }
  }
  return { stringValue: String(value) }
}

/**
 * Convert Firestore document format to JavaScript object
 */
function fromFirestoreValue(value) {
  if (value === null || value === undefined) return null

  if ('nullValue' in value) return null
  if ('booleanValue' in value) return value.booleanValue
  if ('integerValue' in value) return parseInt(value.integerValue, 10)
  if ('doubleValue' in value) return value.doubleValue
  if ('stringValue' in value) return value.stringValue
  if ('timestampValue' in value) return new Date(value.timestampValue)
  if ('arrayValue' in value) {
    return (value.arrayValue.values || []).map(fromFirestoreValue)
  }
  if ('mapValue' in value) {
    const result = {}
    const fields = value.mapValue.fields || {}
    for (const [k, v] of Object.entries(fields)) {
      result[k] = fromFirestoreValue(v)
    }
    return result
  }
  if ('geoPointValue' in value) {
    return { lat: value.geoPointValue.latitude, lng: value.geoPointValue.longitude }
  }
  if ('referenceValue' in value) {
    return value.referenceValue
  }

  return null
}

/**
 * Convert JavaScript object to Firestore document fields
 */
function toFirestoreFields(obj) {
  const fields = {}
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      fields[key] = toFirestoreValue(value)
    }
  }
  return fields
}

/**
 * Convert Firestore document to JavaScript object
 */
function fromFirestoreDocument(doc) {
  if (!doc || !doc.fields) return null

  const result = {}
  for (const [key, value] of Object.entries(doc.fields)) {
    result[key] = fromFirestoreValue(value)
  }

  // Extract document ID from name
  if (doc.name) {
    const parts = doc.name.split('/')
    result.id = parts[parts.length - 1]
  }

  return result
}

class FirestoreRestService {
  constructor() {
    this.userId = this.getOrCreateUserId()
    this.listeners = new Map() // For polling-based "subscriptions"
    this.pollingIntervals = new Map()

    debugLog(`Service initialized. UserId: ${this.userId}`)
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
    localStorage.setItem('meetingflow_firestore_user_id', newUserId)
    debugLog(`Updated user ID to: ${newUserId}`)
  }

  getUserId() {
    return this.userId
  }

  getStatus() {
    return {
      isAvailable: true,
      userId: this.userId,
      logsCount: debugLogs.length,
      activePolling: this.pollingIntervals.size
    }
  }

  getDebugLogs() {
    return [...debugLogs]
  }

  // ==================== CORE REST API METHODS ====================

  /**
   * Create or update a document
   */
  async saveDocument(collection, docId, data) {
    const url = `${FIRESTORE_BASE_URL}/${collection}/${docId}?key=${FIREBASE_API_KEY}`

    try {
      debugLog(`Saving ${collection}/${docId}...`)

      // Use server time for sync reliability
      const serverTime = new Date().toISOString()
      const fields = toFirestoreFields({
        ...data,
        userId: this.userId,
        // Set both updatedAt and lastModified for compatibility
        // updatedAt: used by AppContext for local tracking
        // lastModified: used by Firestore for sync ordering
        updatedAt: data.updatedAt || serverTime,
        lastModified: serverTime,
        deleted: false
      })

      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fields })
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`HTTP ${response.status}: ${errorText}`)
      }

      debugLog(`Saved ${collection}/${docId} successfully`)
      return { success: true }
    } catch (error) {
      debugLog(`Failed to save ${collection}/${docId}: ${error.message}`, 'error')
      return { success: false, reason: error.message }
    }
  }

  /**
   * Get a single document
   */
  async getDocument(collection, docId) {
    const url = `${FIRESTORE_BASE_URL}/${collection}/${docId}?key=${FIREBASE_API_KEY}`

    try {
      const response = await fetch(url)

      if (response.status === 404) {
        return null
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const doc = await response.json()
      return fromFirestoreDocument(doc)
    } catch (error) {
      debugLog(`Failed to get ${collection}/${docId}: ${error.message}`, 'error')
      return null
    }
  }

  /**
   * Delete a document (soft delete - marks as deleted)
   */
  async deleteDocument(collection, docId) {
    const url = `${FIRESTORE_BASE_URL}/${collection}/${docId}?key=${FIREBASE_API_KEY}`

    try {
      debugLog(`Deleting ${collection}/${docId}...`)

      const fields = toFirestoreFields({
        deleted: true,
        deletedAt: new Date().toISOString(),
        lastModified: new Date().toISOString()
      })

      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fields })
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      debugLog(`Deleted ${collection}/${docId} successfully`)
      return { success: true }
    } catch (error) {
      debugLog(`Failed to delete ${collection}/${docId}: ${error.message}`, 'error')
      return { success: false, reason: error.message }
    }
  }

  /**
   * Query documents in a collection
   * Note: Using simple userId filter only, deleted check done in JS
   * This avoids needing composite indexes in Firestore
   */
  async queryCollection(collection, filters = []) {
    // Build structured query - only filter by userId to avoid index requirements
    const query = {
      structuredQuery: {
        from: [{ collectionId: collection }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'userId' },
            op: 'EQUAL',
            value: { stringValue: this.userId }
          }
        }
      }
    }

    const url = `${FIRESTORE_BASE_URL}:runQuery?key=${FIREBASE_API_KEY}`

    try {
      debugLog(`Querying ${collection} for userId: ${this.userId}...`)

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(query)
      })

      if (!response.ok) {
        const errorText = await response.text()
        debugLog(`Query error response: ${errorText}`, 'error')

        // Parse error for better message
        try {
          const errorJson = JSON.parse(errorText)
          const errorMessage = errorJson?.error?.message || errorText
          throw new Error(errorMessage)
        } catch (parseErr) {
          throw new Error(`HTTP ${response.status}: ${errorText}`)
        }
      }

      const results = await response.json()
      const documents = []

      for (const result of results) {
        if (result.document) {
          const doc = fromFirestoreDocument(result.document)
          // Filter out deleted documents in JS (avoids needing composite index)
          if (doc && doc.deleted !== true) {
            documents.push(doc)
          }
        }
      }

      debugLog(`Query ${collection}: Found ${documents.length} documents (after filtering deleted)`)
      return documents
    } catch (error) {
      debugLog(`Query ${collection} failed: ${error.message}`, 'error')
      return []
    }
  }

  /**
   * Get IDs of deleted documents in a collection
   * Used by manual sync to know which local items to remove
   */
  async getDeletedIds(collection) {
    const query = {
      structuredQuery: {
        from: [{ collectionId: collection }],
        where: {
          compositeFilter: {
            op: 'AND',
            filters: [
              {
                fieldFilter: {
                  field: { fieldPath: 'userId' },
                  op: 'EQUAL',
                  value: { stringValue: this.userId }
                }
              },
              {
                fieldFilter: {
                  field: { fieldPath: 'deleted' },
                  op: 'EQUAL',
                  value: { booleanValue: true }
                }
              }
            ]
          }
        },
        select: {
          fields: [{ fieldPath: '__name__' }]
        }
      }
    }

    const url = `${FIRESTORE_BASE_URL}:runQuery?key=${FIREBASE_API_KEY}`

    try {
      debugLog(`Getting deleted IDs from ${collection}...`)

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(query)
      })

      if (!response.ok) {
        // If composite index not available, fall back to fetching all and filtering
        debugLog(`Composite query failed, falling back to full query`, 'warn')
        return this.getDeletedIdsFallback(collection)
      }

      const results = await response.json()
      const deletedIds = []

      for (const result of results) {
        if (result.document) {
          // Extract ID from document path
          const path = result.document.name
          const id = path.split('/').pop()
          deletedIds.push(id)
        }
      }

      debugLog(`Found ${deletedIds.length} deleted items in ${collection}`)
      return deletedIds
    } catch (error) {
      debugLog(`getDeletedIds ${collection} failed: ${error.message}`, 'error')
      return []
    }
  }

  /**
   * Fallback method if composite index is not available
   */
  async getDeletedIdsFallback(collection) {
    const query = {
      structuredQuery: {
        from: [{ collectionId: collection }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'userId' },
            op: 'EQUAL',
            value: { stringValue: this.userId }
          }
        }
      }
    }

    const url = `${FIRESTORE_BASE_URL}:runQuery?key=${FIREBASE_API_KEY}`

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(query)
      })

      if (!response.ok) {
        return []
      }

      const results = await response.json()
      const deletedIds = []

      for (const result of results) {
        if (result.document) {
          const doc = fromFirestoreDocument(result.document)
          if (doc && doc.deleted === true && doc.id) {
            deletedIds.push(doc.id)
          }
        }
      }

      debugLog(`Fallback: Found ${deletedIds.length} deleted items in ${collection}`)
      return deletedIds
    } catch (error) {
      debugLog(`getDeletedIdsFallback ${collection} failed: ${error.message}`, 'error')
      return []
    }
  }

  // ==================== MEETINGS ====================

  async saveMeeting(meeting) {
    if (!meeting?.id) {
      debugLog('saveMeeting: No meeting ID', 'warn')
      return { success: false, reason: 'no_id' }
    }
    return this.saveDocument('meetings', meeting.id, meeting)
  }

  async deleteMeeting(meetingId) {
    return this.deleteDocument('meetings', meetingId)
  }

  async getMeetings() {
    return this.queryCollection('meetings')
  }

  /**
   * Subscribe to meetings changes (polling-based)
   * Polls every 30 seconds for changes
   */
  subscribeMeetings(callback) {
    const pollId = 'meetings'

    // Initial fetch
    this.getMeetings().then(meetings => {
      callback(meetings)
    })

    // Set up polling
    const intervalId = setInterval(async () => {
      try {
        const meetings = await this.getMeetings()
        callback(meetings)
      } catch (err) {
        debugLog(`Polling error for meetings: ${err.message}`, 'error')
      }
    }, 30000) // Poll every 30 seconds

    this.pollingIntervals.set(pollId, intervalId)
    debugLog(`Started polling for ${pollId}`)

    // Return unsubscribe function
    return () => {
      const interval = this.pollingIntervals.get(pollId)
      if (interval) {
        clearInterval(interval)
        this.pollingIntervals.delete(pollId)
        debugLog(`Stopped polling for ${pollId}`)
      }
    }
  }

  // ==================== STAKEHOLDERS ====================

  async saveStakeholder(stakeholder) {
    if (!stakeholder?.id) {
      return { success: false, reason: 'no_id' }
    }
    return this.saveDocument('stakeholders', stakeholder.id, stakeholder)
  }

  async deleteStakeholder(stakeholderId) {
    return this.deleteDocument('stakeholders', stakeholderId)
  }

  async getStakeholders() {
    return this.queryCollection('stakeholders')
  }

  subscribeStakeholders(callback) {
    const pollId = 'stakeholders'

    this.getStakeholders().then(items => callback(items))

    const intervalId = setInterval(async () => {
      try {
        const items = await this.getStakeholders()
        callback(items)
      } catch (err) {
        debugLog(`Polling error for stakeholders: ${err.message}`, 'error')
      }
    }, 30000)

    this.pollingIntervals.set(pollId, intervalId)

    return () => {
      const interval = this.pollingIntervals.get(pollId)
      if (interval) {
        clearInterval(interval)
        this.pollingIntervals.delete(pollId)
      }
    }
  }

  // ==================== STAKEHOLDER CATEGORIES ====================

  async saveStakeholderCategory(category) {
    if (!category?.id) {
      return { success: false, reason: 'no_id' }
    }
    return this.saveDocument('stakeholderCategories', category.id, category)
  }

  async deleteStakeholderCategory(categoryId) {
    return this.deleteDocument('stakeholderCategories', categoryId)
  }

  async getStakeholderCategories() {
    return this.queryCollection('stakeholderCategories')
  }

  subscribeStakeholderCategories(callback) {
    const pollId = 'stakeholderCategories'

    this.getStakeholderCategories().then(items => callback(items))

    const intervalId = setInterval(async () => {
      try {
        const items = await this.getStakeholderCategories()
        callback(items)
      } catch (err) {
        debugLog(`Polling error for categories: ${err.message}`, 'error')
      }
    }, 30000)

    this.pollingIntervals.set(pollId, intervalId)

    return () => {
      const interval = this.pollingIntervals.get(pollId)
      if (interval) {
        clearInterval(interval)
        this.pollingIntervals.delete(pollId)
      }
    }
  }

  // ==================== BATCH IMPORT ====================

  async importAllData(meetings, stakeholders, categories) {
    debugLog(`Starting batch import: ${meetings.length} meetings, ${stakeholders.length} stakeholders, ${categories.length} categories`)

    let imported = 0
    const errors = []

    // Import meetings
    for (const meeting of meetings) {
      if (meeting.id) {
        const result = await this.saveMeeting(meeting)
        if (result.success) imported++
        else errors.push(`Meeting ${meeting.id}: ${result.reason}`)
      }
    }

    // Import stakeholders
    for (const stakeholder of stakeholders) {
      if (stakeholder.id) {
        const result = await this.saveStakeholder(stakeholder)
        if (result.success) imported++
        else errors.push(`Stakeholder ${stakeholder.id}: ${result.reason}`)
      }
    }

    // Import categories
    for (const category of categories) {
      if (category.id) {
        const result = await this.saveStakeholderCategory(category)
        if (result.success) imported++
        else errors.push(`Category ${category.id}: ${result.reason}`)
      }
    }

    debugLog(`Batch import complete: ${imported} items imported, ${errors.length} errors`)

    return {
      success: errors.length === 0,
      imported,
      errors: errors.length > 0 ? errors : undefined
    }
  }

  // ==================== UTILITIES ====================

  cleanup() {
    debugLog(`Cleaning up ${this.pollingIntervals.size} polling intervals`)
    for (const [pollId, intervalId] of this.pollingIntervals) {
      clearInterval(intervalId)
    }
    this.pollingIntervals.clear()
  }

  async checkConnection() {
    try {
      // Try to query a non-existent document to test connectivity
      const url = `${FIRESTORE_BASE_URL}/connectionTest/test?key=${FIREBASE_API_KEY}`
      const response = await fetch(url)

      // 404 is fine - it means we reached Firestore but document doesn't exist
      if (response.ok || response.status === 404) {
        debugLog('Connection check: SUCCESS')
        return { connected: true }
      }

      throw new Error(`HTTP ${response.status}`)
    } catch (error) {
      debugLog(`Connection check failed: ${error.message}`, 'error')
      return { connected: false, error: error.message }
    }
  }
}

// Create singleton instance
const firestoreRestService = new FirestoreRestService()
export default firestoreRestService
