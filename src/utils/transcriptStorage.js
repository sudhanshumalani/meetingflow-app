/**
 * Transcript Storage Service
 *
 * iOS-safe storage for large meeting data (transcripts, speaker data, AI results).
 * Uses a hybrid approach: localStorage for metadata, IndexedDB for large data.
 *
 * Key features:
 * - Lazy initialization (avoids iOS Safari IndexedDB crash on load)
 * - Sequential writes (avoids iPad crash with parallel writes)
 * - Graceful fallback to localStorage if IndexedDB fails
 * - Storage quota checking before writes
 *
 * Based on research:
 * - https://dexie.org/docs/IndexedDB-on-Safari
 * - https://github.com/jakearchibald/safari-14-idb-fix
 * - https://github.com/localForage/localForage/issues/883
 */

import localforage from 'localforage'

// Lazy-loaded IndexedDB instance - only created when needed
let transcriptStoreInstance = null
let isInitializing = false
let initPromise = null

// Storage keys
const STORAGE_NAME = 'MeetingFlowTranscripts'
const STORE_NAME = 'transcripts'

/**
 * Get or create the IndexedDB store (lazy initialization)
 * This pattern avoids iOS Safari crash on module load
 */
async function getTranscriptStore() {
  // Return existing instance
  if (transcriptStoreInstance) {
    return transcriptStoreInstance
  }

  // Wait if already initializing (prevent parallel init)
  if (isInitializing && initPromise) {
    return initPromise
  }

  isInitializing = true

  initPromise = new Promise(async (resolve) => {
    try {
      console.log('📦 TranscriptStorage: Initializing IndexedDB store...')

      // Safari 14.x workaround: probe IndexedDB before using it
      // This helps Safari "wake up" its IndexedDB implementation
      if (typeof indexedDB !== 'undefined') {
        try {
          // Simple probe to wake up Safari's IndexedDB
          const testRequest = indexedDB.open('_safari_idb_test')
          testRequest.onsuccess = () => {
            testRequest.result.close()
            // Clean up test database
            indexedDB.deleteDatabase('_safari_idb_test')
          }
          testRequest.onerror = () => {
            console.warn('📦 TranscriptStorage: IndexedDB probe failed, may use fallback')
          }
          // Wait a moment for Safari to initialize
          await new Promise(r => setTimeout(r, 100))
        } catch (probeError) {
          console.warn('📦 TranscriptStorage: Safari probe error:', probeError)
        }
      }

      // Create localforage instance with specific config
      transcriptStoreInstance = localforage.createInstance({
        name: STORAGE_NAME,
        storeName: STORE_NAME,
        driver: [
          localforage.INDEXEDDB,
          localforage.WEBSQL,
          localforage.LOCALSTORAGE
        ],
        description: 'Storage for large meeting transcripts and speaker data'
      })

      // Test that the store works
      await transcriptStoreInstance.ready()
      console.log('✅ TranscriptStorage: IndexedDB store ready, driver:', transcriptStoreInstance.driver())

      resolve(transcriptStoreInstance)
    } catch (error) {
      console.error('❌ TranscriptStorage: Failed to initialize IndexedDB:', error)
      transcriptStoreInstance = null
      resolve(null)
    } finally {
      isInitializing = false
    }
  })

  return initPromise
}

/**
 * Check available storage space
 * Returns estimated available bytes, or -1 if unknown
 */
async function getAvailableStorage() {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate()
      const available = (estimate.quota || 0) - (estimate.usage || 0)
      console.log('📦 Storage estimate:', {
        quota: Math.round((estimate.quota || 0) / 1024 / 1024) + 'MB',
        usage: Math.round((estimate.usage || 0) / 1024 / 1024) + 'MB',
        available: Math.round(available / 1024 / 1024) + 'MB'
      })
      return available
    }
  } catch (error) {
    console.warn('📦 TranscriptStorage: Cannot estimate storage:', error)
  }
  return -1 // Unknown
}

/**
 * Request persistent storage (prevents iOS from auto-clearing)
 */
async function requestPersistentStorage() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      const isPersisted = await navigator.storage.persist()
      console.log('📦 TranscriptStorage: Persistent storage:', isPersisted ? 'granted' : 'denied')
      return isPersisted
    }
  } catch (error) {
    console.warn('📦 TranscriptStorage: Cannot request persistent storage:', error)
  }
  return false
}

/**
 * Save transcript data for a meeting
 * @param {string} meetingId - The meeting ID
 * @param {object} data - { audioTranscript, speakerData, aiResult }
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function saveTranscriptData(meetingId, data) {
  if (!meetingId) {
    return { success: false, error: 'No meeting ID provided' }
  }

  const dataToSave = {
    meetingId,
    audioTranscript: data.audioTranscript || null,
    speakerData: data.speakerData || null,
    aiResult: data.aiResult || null,
    savedAt: new Date().toISOString()
  }

  // Calculate data size
  const dataSize = JSON.stringify(dataToSave).length
  console.log('📦 TranscriptStorage: Saving data for meeting', meetingId, '- Size:', Math.round(dataSize / 1024), 'KB')

  // Check available storage
  const available = await getAvailableStorage()
  if (available > 0 && dataSize > available * 0.8) {
    console.warn('📦 TranscriptStorage: Low storage space!')
  }

  // Try IndexedDB first
  try {
    const store = await getTranscriptStore()
    if (store) {
      await store.setItem(`transcript_${meetingId}`, dataToSave)
      console.log('✅ TranscriptStorage: Saved to IndexedDB:', meetingId)
      return { success: true, storage: 'indexeddb' }
    }
  } catch (idbError) {
    console.error('❌ TranscriptStorage: IndexedDB save failed:', idbError)
    // Fall through to localStorage fallback
  }

  // Fallback: Try localStorage (will fail for very large data)
  try {
    // Only attempt localStorage for smaller data (< 500KB)
    if (dataSize < 500 * 1024) {
      localStorage.setItem(`meetingflow_transcript_${meetingId}`, JSON.stringify(dataToSave))
      console.log('✅ TranscriptStorage: Saved to localStorage (fallback):', meetingId)
      return { success: true, storage: 'localstorage' }
    } else {
      console.warn('📦 TranscriptStorage: Data too large for localStorage fallback')
      return { success: false, error: 'Data too large and IndexedDB unavailable' }
    }
  } catch (lsError) {
    console.error('❌ TranscriptStorage: localStorage fallback failed:', lsError)
    return { success: false, error: lsError.message }
  }
}

/**
 * Load transcript data for a meeting
 * @param {string} meetingId - The meeting ID
 * @returns {Promise<object|null>}
 */
async function loadTranscriptData(meetingId) {
  if (!meetingId) return null

  // Try IndexedDB first
  try {
    const store = await getTranscriptStore()
    if (store) {
      const data = await store.getItem(`transcript_${meetingId}`)
      if (data) {
        console.log('✅ TranscriptStorage: Loaded from IndexedDB:', meetingId)
        return data
      }
    }
  } catch (idbError) {
    console.warn('📦 TranscriptStorage: IndexedDB load failed:', idbError)
  }

  // Fallback: Try localStorage
  try {
    const lsData = localStorage.getItem(`meetingflow_transcript_${meetingId}`)
    if (lsData) {
      console.log('✅ TranscriptStorage: Loaded from localStorage:', meetingId)
      return JSON.parse(lsData)
    }
  } catch (lsError) {
    console.warn('📦 TranscriptStorage: localStorage load failed:', lsError)
  }

  return null
}

/**
 * Delete transcript data for a meeting
 * @param {string} meetingId - The meeting ID
 */
async function deleteTranscriptData(meetingId) {
  if (!meetingId) return

  // Delete from IndexedDB
  try {
    const store = await getTranscriptStore()
    if (store) {
      await store.removeItem(`transcript_${meetingId}`)
      console.log('✅ TranscriptStorage: Deleted from IndexedDB:', meetingId)
    }
  } catch (idbError) {
    console.warn('📦 TranscriptStorage: IndexedDB delete failed:', idbError)
  }

  // Delete from localStorage fallback
  try {
    localStorage.removeItem(`meetingflow_transcript_${meetingId}`)
  } catch (lsError) {
    // Ignore
  }
}

/**
 * Get all stored transcript IDs
 * @returns {Promise<string[]>}
 */
async function getAllTranscriptIds() {
  const ids = new Set()

  // Get from IndexedDB
  try {
    const store = await getTranscriptStore()
    if (store) {
      const keys = await store.keys()
      keys.forEach(key => {
        if (key.startsWith('transcript_')) {
          ids.add(key.replace('transcript_', ''))
        }
      })
    }
  } catch (error) {
    console.warn('📦 TranscriptStorage: Failed to get IndexedDB keys:', error)
  }

  // Get from localStorage
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('meetingflow_transcript_')) {
        ids.add(key.replace('meetingflow_transcript_', ''))
      }
    }
  } catch (error) {
    // Ignore
  }

  return Array.from(ids)
}

/**
 * Clean up orphaned transcripts (transcripts for deleted meetings)
 * @param {string[]} activeMeetingIds - IDs of meetings that still exist
 */
async function cleanupOrphanedTranscripts(activeMeetingIds) {
  const activeSet = new Set(activeMeetingIds)
  const storedIds = await getAllTranscriptIds()

  let cleanedCount = 0
  for (const id of storedIds) {
    if (!activeSet.has(id)) {
      await deleteTranscriptData(id)
      cleanedCount++
    }
  }

  if (cleanedCount > 0) {
    console.log('📦 TranscriptStorage: Cleaned up', cleanedCount, 'orphaned transcripts')
  }

  return cleanedCount
}

/**
 * Get storage statistics
 */
async function getStorageStats() {
  const stats = {
    indexedDBReady: false,
    driver: null,
    transcriptCount: 0,
    availableSpace: -1
  }

  try {
    const store = await getTranscriptStore()
    if (store) {
      stats.indexedDBReady = true
      stats.driver = store.driver()
      const keys = await store.keys()
      stats.transcriptCount = keys.filter(k => k.startsWith('transcript_')).length
    }
  } catch (error) {
    console.warn('📦 TranscriptStorage: Failed to get stats:', error)
  }

  stats.availableSpace = await getAvailableStorage()

  return stats
}

// Export the service
const TranscriptStorage = {
  save: saveTranscriptData,
  load: loadTranscriptData,
  delete: deleteTranscriptData,
  getAllIds: getAllTranscriptIds,
  cleanup: cleanupOrphanedTranscripts,
  getStats: getStorageStats,
  getAvailableStorage,
  requestPersistentStorage
}

export default TranscriptStorage
