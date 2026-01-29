/**
 * MINIMAL FIRESTORE SERVICE FOR MOBILE RECORDINGS
 *
 * This service handles ONLY the minimal data needed for mobile->desktop sync:
 * - Meeting ID
 * - AssemblyAI Transcript ID
 * - Title
 * - Recording metadata (duration, size, date)
 *
 * The full transcript is retrieved from AssemblyAI by the desktop app.
 * This approach avoids all the complex sync issues with large data.
 */

import { v4 as uuidv4 } from 'uuid'
import { IS_IOS } from '../config/firebase'

// Use the existing 'meetings' collection with a flag to identify mobile recordings
// This avoids needing to configure new Firestore security rules
const COLLECTION = 'meetings'

// Firestore REST API endpoint (same config as firestoreRestService.js)
const FIRESTORE_PROJECT = 'meetingflow-app-bcb76'
const FIREBASE_API_KEY = 'AIzaSyC_r2K8JIWFGEjmTbIuTgp7sgY5F4FuryI'
const FIRESTORE_REST_BASE = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents`

/**
 * Debug logging
 */
function debugLog(message, data = null) {
  const timestamp = new Date().toISOString().slice(11, 23)
  if (data) {
    console.log(`📱 [${timestamp}] MobileFirestore: ${message}`, data)
  } else {
    console.log(`📱 [${timestamp}] MobileFirestore: ${message}`)
  }
}

/**
 * Convert JS value to Firestore REST format
 */
function toFirestoreValue(value) {
  if (value === null || value === undefined) {
    return { nullValue: null }
  }
  if (typeof value === 'string') {
    return { stringValue: value }
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return { integerValue: value.toString() }
    }
    return { doubleValue: value }
  }
  if (typeof value === 'boolean') {
    return { booleanValue: value }
  }
  if (value instanceof Date) {
    return { timestampValue: value.toISOString() }
  }
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map(toFirestoreValue)
      }
    }
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
 * Convert Firestore REST format to JS value
 */
function fromFirestoreValue(field) {
  if (!field) return null

  if ('stringValue' in field) return field.stringValue
  if ('integerValue' in field) return parseInt(field.integerValue, 10)
  if ('doubleValue' in field) return field.doubleValue
  if ('booleanValue' in field) return field.booleanValue
  if ('nullValue' in field) return null
  if ('timestampValue' in field) return new Date(field.timestampValue)
  if ('arrayValue' in field) {
    return (field.arrayValue.values || []).map(fromFirestoreValue)
  }
  if ('mapValue' in field) {
    const obj = {}
    for (const [k, v] of Object.entries(field.mapValue.fields || {})) {
      obj[k] = fromFirestoreValue(v)
    }
    return obj
  }
  return null
}

/**
 * Save a mobile recording to Firestore
 * Uses REST API for iOS compatibility
 *
 * @param {Object} recordingData - {
 *   title: string,
 *   assemblyAITranscriptId: string,
 *   audioSize: number (bytes),
 *   duration: number (seconds),
 *   recordedAt: string (ISO date),
 *   platform: string,
 *   status: string ('processing' | 'completed' | 'error')
 * }
 * @returns {Promise<{id: string, ...recordingData}>}
 */
export async function saveMobileRecording(recordingData) {
  const id = uuidv4()

  const document = {
    id,
    ...recordingData,
    source: 'mobile-recording', // Flag to identify mobile recordings
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1
  }

  debugLog('Saving mobile recording', { id, title: document.title })

  // Convert to Firestore format
  const firestoreFields = {}
  for (const [key, value] of Object.entries(document)) {
    firestoreFields[key] = toFirestoreValue(value)
  }

  try {
    const response = await fetch(
      `${FIRESTORE_REST_BASE}/${COLLECTION}?documentId=${id}&key=${FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fields: firestoreFields
        })
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Firestore save failed: ${response.status} - ${errorText}`)
    }

    const result = await response.json()
    debugLog('Recording saved successfully', { id })

    // Also save to localStorage as backup
    try {
      const localRecordings = JSON.parse(localStorage.getItem('mobile_recordings') || '[]')
      localRecordings.push(document)
      localStorage.setItem('mobile_recordings', JSON.stringify(localRecordings))
      debugLog('Backup saved to localStorage')
    } catch (e) {
      console.warn('Failed to backup to localStorage:', e)
    }

    return document

  } catch (error) {
    debugLog('Firestore save failed, saving to localStorage only', error.message)

    // Save to localStorage as fallback
    const localRecordings = JSON.parse(localStorage.getItem('mobile_recordings') || '[]')
    document.pendingSync = true
    localRecordings.push(document)
    localStorage.setItem('mobile_recordings', JSON.stringify(localRecordings))

    // Return the document but mark it as pending
    return { ...document, pendingSync: true }
  }
}

/**
 * Get all mobile recordings from Firestore
 * Used by desktop app to list recordings made on mobile
 * Uses a structured query to filter by source='mobile-recording'
 *
 * @returns {Promise<Array>}
 */
export async function getMobileRecordings() {
  debugLog('Fetching mobile recordings from Firestore')

  try {
    // Use runQuery to filter by source='mobile-recording'
    // Note: No orderBy to avoid requiring a composite index
    const queryUrl = `${FIRESTORE_REST_BASE}:runQuery?key=${FIREBASE_API_KEY}`

    const queryBody = {
      structuredQuery: {
        from: [{ collectionId: COLLECTION }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'source' },
            op: 'EQUAL',
            value: { stringValue: 'mobile-recording' }
          }
        },
        limit: 100
      }
    }

    const response = await fetch(queryUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(queryBody)
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Firestore query failed: ${response.status} - ${errorText}`)
    }

    const results = await response.json()

    // Convert Firestore format to JS objects
    const recordings = []
    for (const result of results) {
      if (result.document && result.document.fields) {
        const data = {}
        for (const [key, value] of Object.entries(result.document.fields)) {
          data[key] = fromFirestoreValue(value)
        }
        recordings.push(data)
      }
    }

    // Sort by createdAt descending (newest first) - done client-side to avoid index requirement
    recordings.sort((a, b) => {
      const dateA = new Date(a.createdAt || a.recordedAt || 0)
      const dateB = new Date(b.createdAt || b.recordedAt || 0)
      return dateB - dateA
    })

    debugLog(`Fetched ${recordings.length} mobile recordings`)
    return recordings

  } catch (error) {
    debugLog('Failed to fetch from Firestore, using localStorage', error.message)

    // Fallback to localStorage
    const localRecordings = JSON.parse(localStorage.getItem('mobile_recordings') || '[]')
    return localRecordings
  }
}

/**
 * Update mobile recording status
 * Called when transcript processing completes
 *
 * @param {string} id - Recording ID
 * @param {Object} updates - Fields to update
 */
export async function updateMobileRecording(id, updates) {
  debugLog('Updating mobile recording', { id, updates })

  const updateData = {
    ...updates,
    updatedAt: new Date().toISOString()
  }

  // Convert to Firestore format
  const firestoreFields = {}
  for (const [key, value] of Object.entries(updateData)) {
    firestoreFields[key] = toFirestoreValue(value)
  }

  // Build update mask
  const updateMask = Object.keys(updateData).map(k => `updateMask.fieldPaths=${k}`).join('&')

  try {
    const response = await fetch(
      `${FIRESTORE_REST_BASE}/${COLLECTION}/${id}?${updateMask}&key=${FIREBASE_API_KEY}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fields: firestoreFields
        })
      }
    )

    if (!response.ok) {
      throw new Error(`Firestore update failed: ${response.status}`)
    }

    debugLog('Recording updated successfully', { id })
    return true

  } catch (error) {
    debugLog('Failed to update Firestore', error.message)

    // Update localStorage version
    try {
      const localRecordings = JSON.parse(localStorage.getItem('mobile_recordings') || '[]')
      const index = localRecordings.findIndex(r => r.id === id)
      if (index !== -1) {
        localRecordings[index] = { ...localRecordings[index], ...updateData }
        localStorage.setItem('mobile_recordings', JSON.stringify(localRecordings))
      }
    } catch (e) {
      console.warn('Failed to update localStorage:', e)
    }

    return false
  }
}

/**
 * Sync pending recordings from localStorage to Firestore
 * Called when coming back online
 */
export async function syncPendingRecordings() {
  debugLog('Syncing pending recordings')

  try {
    const localRecordings = JSON.parse(localStorage.getItem('mobile_recordings') || '[]')
    const pending = localRecordings.filter(r => r.pendingSync)

    if (pending.length === 0) {
      debugLog('No pending recordings to sync')
      return { synced: 0, failed: 0 }
    }

    let synced = 0
    let failed = 0

    for (const recording of pending) {
      try {
        // Remove pendingSync flag before saving
        const { pendingSync, ...data } = recording

        const firestoreFields = {}
        for (const [key, value] of Object.entries(data)) {
          firestoreFields[key] = toFirestoreValue(value)
        }

        const response = await fetch(
          `${FIRESTORE_REST_BASE}/${COLLECTION}?documentId=${data.id}&key=${FIREBASE_API_KEY}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              fields: firestoreFields
            })
          }
        )

        if (response.ok) {
          synced++
          // Remove pendingSync flag in localStorage
          const index = localRecordings.findIndex(r => r.id === data.id)
          if (index !== -1) {
            delete localRecordings[index].pendingSync
          }
        } else {
          failed++
        }
      } catch (e) {
        failed++
      }
    }

    // Update localStorage
    localStorage.setItem('mobile_recordings', JSON.stringify(localRecordings))

    debugLog(`Sync complete: ${synced} synced, ${failed} failed`)
    return { synced, failed }

  } catch (error) {
    debugLog('Sync failed', error.message)
    return { synced: 0, failed: 0, error: error.message }
  }
}

export default {
  saveMobileRecording,
  getMobileRecordings,
  updateMobileRecording,
  syncPendingRecordings
}
