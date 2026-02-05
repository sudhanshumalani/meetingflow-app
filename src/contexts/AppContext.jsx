import { createContext, useContext, useReducer, useEffect, useRef, useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'

// Import Dexie database and services
// PHASE 4: Soft delete + Outbox pattern for reliable sync
import db from '../db/meetingFlowDB'
import {
  getAllMeetingMetadata,
  getAllStakeholders,
  getAllCategories,
  bulkSaveMeetings,
  bulkSaveStakeholders,
  bulkSaveCategories,
  getFullMeeting,
  saveMeeting as saveMeetingToDexie,
  softDeleteMeeting as softDeleteMeetingInDexie,
  softDeleteStakeholder as softDeleteStakeholderInDexie,
  softDeleteCategory as softDeleteCategoryInDexie
} from '../db/dexieService'

// ============================================
// SYNC LOCK - Prevents race conditions
// ============================================
let isSyncLocked = false
let syncLockTimestamp = 0
const SYNC_LOCK_TIMEOUT = 60000 // 60 second timeout to prevent deadlocks

function acquireSyncLock() {
  const now = Date.now()
  // Auto-release if lock is stale (prevents deadlocks)
  if (isSyncLocked && (now - syncLockTimestamp) > SYNC_LOCK_TIMEOUT) {
    console.warn('🔄 Sync lock was stale, releasing...')
    isSyncLocked = false
  }

  if (isSyncLocked) {
    return false
  }

  isSyncLocked = true
  syncLockTimestamp = now
  console.log('🔄 Sync lock acquired')
  return true
}

function releaseSyncLock() {
  isSyncLocked = false
  syncLockTimestamp = 0
  console.log('🔄 Sync lock released')
}

// Export for checking sync status from other components
export function isSyncInProgress() {
  const now = Date.now()
  if (isSyncLocked && (now - syncLockTimestamp) > SYNC_LOCK_TIMEOUT) {
    return false
  }
  return isSyncLocked
}

// ============================================
// USER INTERACTION LOCK - Prevents auto-refresh during delete/edit
// ============================================
let isUserInteracting = false
let interactionLockTimestamp = 0
const INTERACTION_LOCK_TIMEOUT = 10000 // 10 seconds max lock

function acquireInteractionLock(action = 'unknown') {
  const now = Date.now()
  // Auto-release if lock is stale
  if (isUserInteracting && (now - interactionLockTimestamp) > INTERACTION_LOCK_TIMEOUT) {
    console.warn('🔒 Interaction lock was stale, releasing...')
    isUserInteracting = false
  }

  isUserInteracting = true
  interactionLockTimestamp = now
  console.log(`🔒 Interaction lock acquired for: ${action}`)
  return true
}

function releaseInteractionLock() {
  isUserInteracting = false
  interactionLockTimestamp = 0
  console.log('🔓 Interaction lock released')
}

export function isUserInteractionInProgress() {
  const now = Date.now()
  if (isUserInteracting && (now - interactionLockTimestamp) > INTERACTION_LOCK_TIMEOUT) {
    return false
  }
  return isUserInteracting
}

// ============================================
// SYNC HELPER FUNCTIONS
// ============================================

// Helper to strip large fields from meetings to save storage space (for localStorage)
function stripLargeFields(meeting) {
  if (!meeting || typeof meeting !== 'object') return meeting

  const stripped = { ...meeting }
  // Remove large fields that can be regenerated or aren't critical
  delete stripped.audioBlob
  delete stripped.audioData
  delete stripped.audioUrl
  delete stripped.recordingBlob
  // Remove large base64 images
  if (stripped.images && Array.isArray(stripped.images)) {
    stripped.images = stripped.images.filter(img => {
      // Keep non-string images and small string images
      return typeof img !== 'string' || !img.startsWith('data:') || img.length <= 10000
    })
  }
  return stripped
}

// Configuration for Firestore blob handling
const MAX_FIRESTORE_IMAGE_SIZE = 100 * 1024 // 100KB

/**
 * Strip ONLY binary data before sending to Firestore.
 * Preserves ALL text content (transcript, AI analysis, notes).
 *
 * IMPORTANT: Only use this on the Firestore upload path!
 * Never use when writing to Dexie or passing to UI.
 *
 * Trade-off documented:
 * - Firestore receives: metadata + all text blobs (transcript, aiResult, notes, etc.)
 * - Firestore does NOT receive: audio blobs, large images (>100KB)
 * - This enables cross-device sync for all text content
 */
function stripBinaryOnly(meeting) {
  if (!meeting || typeof meeting !== 'object') return meeting

  const stripped = { ...meeting }

  // Remove ONLY binary audio data (never sync to Firestore)
  delete stripped.audioBlob
  delete stripped.audioData
  delete stripped.audioUrl
  delete stripped.recordingBlob

  // Filter large images (keep small ones for thumbnails)
  if (stripped.images && Array.isArray(stripped.images)) {
    stripped.images = stripped.images.filter(img =>
      typeof img !== 'string' ||
      !img.startsWith('data:') ||
      img.length <= MAX_FIRESTORE_IMAGE_SIZE
    )
  }

  // Trim speakerData words array (too large for Firestore, can be 5MB+)
  if (stripped.speakerData?.utterances) {
    stripped.speakerData = {
      ...stripped.speakerData,
      utterances: stripped.speakerData.utterances.map(u => ({
        ...u,
        words: undefined // Strip words array
      }))
    }
  }

  // PRESERVE all text content:
  // - audioTranscript (text, 10-500KB)
  // - aiResult (text/JSON, 10-100KB)
  // - digitalNotes (text, 5-50KB)
  // - notes (text, 1-20KB)
  // - originalInputs (text)

  return stripped
}

// Helper to get timestamp from an item (handles various field names and types)
// Supports: ISO strings, Date objects, Firestore Timestamp objects, milliseconds
function getTimestamp(item) {
  if (!item) return 0

  // Try various timestamp fields in priority order
  // updatedAt is preferred as it reflects the last modification
  const ts = item.updatedAt || item.lastModified || item.createdAt || item.timestamp || 0

  // Handle different timestamp types
  if (!ts) return 0

  // Firestore Timestamp object (has toDate method)
  if (ts && typeof ts === 'object' && typeof ts.toDate === 'function') {
    try {
      return ts.toDate().getTime()
    } catch (e) {
      console.warn('🔄 Failed to convert Firestore timestamp:', e)
      return 0
    }
  }

  // Firestore Timestamp from REST API (has seconds and nanoseconds)
  if (ts && typeof ts === 'object' && ts.seconds !== undefined) {
    return ts.seconds * 1000 + Math.floor((ts.nanoseconds || 0) / 1000000)
  }

  // JavaScript Date object
  if (ts instanceof Date) {
    return ts.getTime()
  }

  // ISO string or other parseable string
  if (typeof ts === 'string') {
    const parsed = new Date(ts).getTime()
    // Return 0 if parsing failed (NaN check)
    return isNaN(parsed) ? 0 : parsed
  }

  // Already a number (milliseconds)
  if (typeof ts === 'number') {
    return ts
  }

  return 0
}

// Helper function to merge arrays by ID with timestamp-based conflict resolution
// SYNC FIX: Now handles deleted=true properly - deletion ALWAYS wins
// Returns: { merged: [], toUpload: [], toDownload: [] }
function mergeByIdWithTracking(localItems, cloudItems) {
  const merged = new Map()
  const toUpload = [] // Local items newer than cloud
  const toDownload = [] // Cloud items newer than local

  // Create maps for quick lookup
  const localMap = new Map()
  const cloudMap = new Map()

  localItems.forEach(item => {
    if (item && item.id) localMap.set(item.id, item)
  })
  cloudItems.forEach(item => {
    if (item && item.id) cloudMap.set(item.id, item)
  })

  // Process all local items
  for (const [id, localItem] of localMap) {
    const cloudItem = cloudMap.get(id)

    if (!cloudItem) {
      // Only in local - needs to be uploaded
      merged.set(id, localItem)
      toUpload.push(localItem)
    } else {
      // Exists in both - check deleted status WITH timestamp protection
      const localTime = getTimestamp(localItem)
      const cloudTime = getTimestamp(cloudItem)

      // SAFETY FIX: If local is NOT deleted but cloud IS deleted,
      // check if local is significantly newer (restored data protection)
      // If local is newer by more than 1 minute, local wins (it was likely restored)
      const ONE_MINUTE = 60 * 1000

      if (cloudItem.deleted && !localItem.deleted && localTime > cloudTime + ONE_MINUTE) {
        // Local is newer and NOT deleted - protect restored data from cloud tombstones
        console.log('🛡️ SAFETY: Protecting restored item from cloud tombstone:', id)
        merged.set(id, localItem)
        toUpload.push(localItem) // Upload to clear the tombstone in cloud
      } else if (localItem.deleted && !cloudItem.deleted && cloudTime > localTime + ONE_MINUTE) {
        // Cloud is newer and NOT deleted - cloud wins
        merged.set(id, cloudItem)
        toDownload.push(cloudItem)
      } else if (cloudItem.deleted || localItem.deleted) {
        // Both deleted, or one deleted and not significantly newer - deleted wins
        const deletedItem = {
          ...(cloudItem.deleted ? cloudItem : localItem),
          deleted: true,
          deletedAt: cloudItem.deletedAt || localItem.deletedAt || new Date().toISOString()
        }
        merged.set(id, deletedItem)
        // Upload if local was the source of deletion, download otherwise
        if (localItem.deleted && !cloudItem.deleted) {
          toUpload.push(deletedItem)
        } else if (cloudItem.deleted && !localItem.deleted) {
          toDownload.push(deletedItem)
        }
      } else {
        // Neither is deleted - compare timestamps
        const localTime = getTimestamp(localItem)
        const cloudTime = getTimestamp(cloudItem)

        if (localTime > cloudTime) {
          // Local is newer - use local and upload it
          merged.set(id, localItem)
          toUpload.push(localItem)
        } else if (cloudTime > localTime) {
          // Cloud is newer - use cloud metadata BUT preserve local blob data
          // Cloud doesn't store large fields like aiResult, digitalNotes, transcript
          // So we merge cloud metadata with local blobs
          const mergedItem = {
            ...cloudItem,
            // Preserve blob data from local if cloud doesn't have it
            aiResult: cloudItem.aiResult || localItem.aiResult,
            digitalNotes: cloudItem.digitalNotes || localItem.digitalNotes,
            audioTranscript: cloudItem.audioTranscript || localItem.audioTranscript,
            transcript: cloudItem.transcript || localItem.transcript,
            notes: cloudItem.notes || localItem.notes,
            originalInputs: cloudItem.originalInputs || localItem.originalInputs,
            speakerData: cloudItem.speakerData || localItem.speakerData,
            images: cloudItem.images || localItem.images,
          }
          merged.set(id, mergedItem)
          toDownload.push(mergedItem)
        } else {
          // Same time - keep local (arbitrary choice)
          merged.set(id, localItem)
        }
      }
    }
  }

  // Process cloud items not in local
  for (const [id, cloudItem] of cloudMap) {
    if (!localMap.has(id)) {
      // Only in cloud - needs to be downloaded (including deleted items)
      merged.set(id, cloudItem)
      toDownload.push(cloudItem)
    }
  }

  return {
    merged: Array.from(merged.values()),
    toUpload,
    toDownload
  }
}

// Storage quota utilities
async function checkStorageQuota() {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate()
      const usage = estimate.usage || 0
      const quota = estimate.quota || 0
      const available = quota - usage
      const percentUsed = quota > 0 ? Math.round((usage / quota) * 100) : 0

      return {
        usage: Math.round(usage / 1024 / 1024), // MB
        quota: Math.round(quota / 1024 / 1024), // MB
        available: Math.round(available / 1024 / 1024), // MB
        percentUsed,
        isLow: available < 10 * 1024 * 1024, // Less than 10MB
        isCritical: available < 2 * 1024 * 1024 // Less than 2MB
      }
    }
  } catch (error) {
    console.warn('📦 Cannot check storage quota:', error)
  }
  return null
}

// Check localStorage usage specifically
function getLocalStorageUsage() {
  try {
    let total = 0
    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        total += localStorage[key].length * 2 // UTF-16 = 2 bytes per char
      }
    }
    return {
      bytes: total,
      kb: Math.round(total / 1024),
      mb: (total / 1024 / 1024).toFixed(2)
    }
  } catch (error) {
    return { bytes: 0, kb: 0, mb: '0' }
  }
}

import n8nService from '../utils/n8nService'

// IMPORTANT: Firestore services are loaded based on platform
// - iOS: Uses REST API service (firestoreRestService) - works on iOS Safari
// - Desktop: Uses Firebase SDK service (firestoreService) - has real-time sync
// See: https://github.com/firebase/firebase-js-sdk/issues/7780

// Detect iOS
const IS_IOS = typeof navigator !== 'undefined' && (
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 0) ||
  (typeof window !== 'undefined' && window.navigator?.standalone === true)
)

// Feature flag for Firestore
// On iOS: Disabled by default to prevent crashes - user must enable manually
// On Desktop: Enabled with real-time sync
const ENABLE_FIRESTORE = !IS_IOS  // Disable auto-start on iOS

if (IS_IOS) {
  console.log('📱 iOS detected - Firestore sync disabled by default (use Settings to enable)')
} else {
  console.log('💻 Desktop detected - Firestore sync enabled (real-time)')
}

// Lazy-loaded firestoreService reference
let firestoreServiceInstance = null

// Get firestoreService lazily - uses REST API on iOS, SDK on desktop
async function getFirestoreService() {
  if (firestoreServiceInstance) {
    return firestoreServiceInstance
  }

  // Extra safety: wrap everything in try-catch
  try {
    console.log('🔥 AppContext: Loading firestore service... iOS:', IS_IOS)

    if (IS_IOS) {
      // iOS: Use REST API service (no SDK crashes)
      try {
        const module = await import('../utils/firestoreRestService')
        if (module && module.default) {
          firestoreServiceInstance = module.default
          console.log('🔥 AppContext: firestoreRestService loaded (iOS REST API)')
        } else {
          console.error('🔥 AppContext: REST module loaded but no default export')
          return null
        }
      } catch (restErr) {
        console.error('🔥 AppContext: Failed to load REST service:', restErr)
        return null
      }
    } else {
      // Desktop: Use SDK service (real-time sync)
      try {
        const module = await import('../utils/firestoreService')
        if (module && module.default) {
          firestoreServiceInstance = module.default
          console.log('🔥 AppContext: firestoreService loaded (SDK)')
        } else {
          console.error('🔥 AppContext: SDK module loaded but no default export')
          return null
        }
      } catch (sdkErr) {
        console.error('🔥 AppContext: Failed to load SDK service:', sdkErr)
        return null
      }
    }
    return firestoreServiceInstance
  } catch (err) {
    console.error('🔥 AppContext: Unexpected error loading firestoreService:', err)
    return null
  }
}

const AppContext = createContext()

const initialState = {
  meetings: [],
  stakeholders: [],
  stakeholderCategories: [], // Start empty, will be loaded from storage or set by sync
  // PHASE 4: No deletedItems/tombstones - soft delete uses deleted field in Dexie
  currentMeeting: null,
  isLoading: false,
  error: null,
  n8n: {
    syncStatus: null, // Will be initialized in useEffect
    isAvailable: false,
    lastSync: null,
    isSyncing: false
  }
}

function appReducer(state, action) {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload }

    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false }

    case 'LOAD_DATA':
      // PHASE 4: No deletedItems - soft delete uses deleted field in Dexie
      console.log('🔍 LOAD_DATA: Loading data:', {
        meetings: action.payload.meetings?.length || 0,
        stakeholders: action.payload.stakeholders?.length || 0,
        stakeholderCategories: action.payload.stakeholderCategories?.length || 0
      })

      return {
        ...state,
        meetings: action.payload.meetings || [],
        stakeholders: action.payload.stakeholders || [],
        stakeholderCategories: action.payload.stakeholderCategories || [],
        isLoading: false
      }

    case 'ADD_MEETING':
      // UUID must be provided - never generate inside reducer to avoid duplicates
      if (!action.payload.id) {
        console.error('❌ ADD_MEETING: Missing required ID. UUID generation must happen before dispatch.')
        return state
      }

      const newMeeting = {
        ...action.payload,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      console.log('🔥 ADD_MEETING REDUCER: Adding meeting:', newMeeting.id)
      console.log('🔥 ADD_MEETING REDUCER: Current count:', state.meetings.length)

      // Check for duplicates - prevent adding same meeting twice
      const existingMeetingIndex = state.meetings.findIndex(m => m.id === newMeeting.id)
      if (existingMeetingIndex >= 0) {
        console.log('⚠️ ADD_MEETING: Meeting already exists, skipping duplicate:', newMeeting.id)
        return state // Meeting already exists, no need to add
      }

      const newState = {
        ...state,
        meetings: [newMeeting, ...state.meetings]
      }

      console.log('🔥 ADD_MEETING REDUCER: New count:', newState.meetings.length)
      return newState

    case 'UPDATE_MEETING':
      return {
        ...state,
        meetings: state.meetings.map(meeting =>
          meeting.id === action.payload.id
            ? { ...meeting, ...action.payload, updatedAt: new Date().toISOString() }
            : meeting
        ),
        currentMeeting: state.currentMeeting?.id === action.payload.id
          ? { ...state.currentMeeting, ...action.payload, updatedAt: new Date().toISOString() }
          : state.currentMeeting
      }

    case 'DELETE_MEETING':
      // PHASE 4: Soft delete - just remove from UI state
      // No tombstones needed - deleted field is synced via Dexie/Firestore
      return {
        ...state,
        meetings: state.meetings.filter(meeting => meeting.id !== action.payload),
        currentMeeting: state.currentMeeting?.id === action.payload ? null : state.currentMeeting
      }

    case 'SET_CURRENT_MEETING':
      return {
        ...state,
        currentMeeting: action.payload
      }

    case 'ADD_STAKEHOLDER':
      // Stakeholder should already have id, createdAt, updatedAt from the action creator
      // But handle legacy case where it might not
      const newStakeholderTs = new Date().toISOString()
      const newStakeholder = {
        id: action.payload.id || uuidv4(),
        ...action.payload,
        createdAt: action.payload.createdAt || newStakeholderTs,
        updatedAt: action.payload.updatedAt || newStakeholderTs
      }
      return {
        ...state,
        stakeholders: [newStakeholder, ...state.stakeholders]
      }

    case 'UPDATE_STAKEHOLDER':
      return {
        ...state,
        stakeholders: state.stakeholders.map(stakeholder =>
          stakeholder.id === action.payload.id
            ? { ...stakeholder, ...action.payload, updatedAt: new Date().toISOString() }
            : stakeholder
        )
      }

    case 'DELETE_STAKEHOLDER':
      // PHASE 4: Soft delete - just remove from UI state, no tombstones
      return {
        ...state,
        stakeholders: state.stakeholders.filter(stakeholder => stakeholder.id !== action.payload)
      }

    case 'ADD_STAKEHOLDER_CATEGORY':
      // Category should already have id, key, createdAt, updatedAt from the action creator
      // But handle legacy case where it might not
      const newCategoryTs = new Date().toISOString()
      const newCategory = {
        id: action.payload.id || uuidv4(),
        key: action.payload.key || (action.payload.label || '').toLowerCase().replace(/\s+/g, '-'),
        ...action.payload,
        createdAt: action.payload.createdAt || newCategoryTs,
        updatedAt: action.payload.updatedAt || newCategoryTs
      }
      return {
        ...state,
        stakeholderCategories: [...state.stakeholderCategories, newCategory]
      }

    case 'UPDATE_STAKEHOLDER_CATEGORY':
      return {
        ...state,
        stakeholderCategories: state.stakeholderCategories.map(category =>
          category.key === action.payload.key || category.id === action.payload.id
            ? { ...category, ...action.payload, updatedAt: new Date().toISOString() }
            : category
        )
      }

    case 'DELETE_STAKEHOLDER_CATEGORY':
      // PHASE 4: Soft delete - just remove from UI state, no tombstones
      const categoryToDelete = action.payload
      const deletedCategory = state.stakeholderCategories.find(category =>
        category.key === categoryToDelete || category.id === categoryToDelete || category.name === categoryToDelete
      )
      // Also update any stakeholders using this category to remove the category reference
      const updatedStakeholders = state.stakeholders.map(stakeholder => {
        const referencesCategory = stakeholder.category === categoryToDelete ||
                                   stakeholder.category === deletedCategory?.key ||
                                   stakeholder.category === deletedCategory?.id
        return referencesCategory
          ? { ...stakeholder, category: null, updatedAt: new Date().toISOString() }
          : stakeholder
      })
      return {
        ...state,
        stakeholderCategories: state.stakeholderCategories.filter(category =>
          category.key !== categoryToDelete && category.id !== categoryToDelete && category.name !== categoryToDelete
        ),
        stakeholders: updatedStakeholders
      }

    case 'SET_STAKEHOLDER_CATEGORIES':
      console.log('🔍 DEBUG: SET_STAKEHOLDER_CATEGORIES reducer called')
      console.log('🔍 DEBUG: Current categories in state:', {
        count: state.stakeholderCategories?.length || 0,
        categories: state.stakeholderCategories?.map(c => c.name) || []
      })
      console.log('🔍 DEBUG: New categories payload:', {
        count: action.payload?.length || 0,
        categories: action.payload?.map(c => c.name) || [],
        payload: action.payload
      })

      const updatedState = {
        ...state,
        stakeholderCategories: action.payload || []
      }

      console.log('🔍 DEBUG: New state after SET_STAKEHOLDER_CATEGORIES:', {
        count: updatedState.stakeholderCategories?.length || 0,
        categories: updatedState.stakeholderCategories?.map(c => c.name) || []
      })

      return updatedState

    case 'SET_MEETINGS':
      console.log('🔍 DEBUG: SET_MEETINGS reducer called with', action.payload?.length || 0, 'meetings')
      return {
        ...state,
        meetings: action.payload || []
      }

    case 'SET_STAKEHOLDERS':
      console.log('🔍 DEBUG: SET_STAKEHOLDERS reducer called with', action.payload?.length || 0, 'stakeholders')
      return {
        ...state,
        stakeholders: action.payload || []
      }

    case 'ADD_NOTE_TO_MEETING':
      const { meetingId, note } = action.payload
      const noteWithId = {
        id: uuidv4(),
        ...note,
        timestamp: new Date().toISOString()
      }

      return {
        ...state,
        meetings: state.meetings.map(meeting =>
          meeting.id === meetingId
            ? {
                ...meeting,
                notes: [...(meeting.notes || []), noteWithId],
                updatedAt: new Date().toISOString()
              }
            : meeting
        ),
        currentMeeting: state.currentMeeting?.id === meetingId
          ? {
              ...state.currentMeeting,
              notes: [...(state.currentMeeting.notes || []), noteWithId],
              updatedAt: new Date().toISOString()
            }
          : state.currentMeeting
      }

    case 'UPDATE_NOTE_IN_MEETING':
      const { meetingId: updateMeetingId, noteId, updatedNote } = action.payload

      return {
        ...state,
        meetings: state.meetings.map(meeting =>
          meeting.id === updateMeetingId
            ? {
                ...meeting,
                notes: meeting.notes?.map(note =>
                  note.id === noteId ? { ...note, ...updatedNote } : note
                ) || [],
                updatedAt: new Date().toISOString()
              }
            : meeting
        ),
        currentMeeting: state.currentMeeting?.id === updateMeetingId
          ? {
              ...state.currentMeeting,
              notes: state.currentMeeting.notes?.map(note =>
                note.id === noteId ? { ...note, ...updatedNote } : note
              ) || [],
              updatedAt: new Date().toISOString()
            }
          : state.currentMeeting
      }


    case 'SET_N8N_SYNCING':
      return {
        ...state,
        n8n: {
          ...state.n8n,
          isSyncing: action.payload
        }
      }

    case 'SYNC_N8N_DATA':
      return {
        ...state,
        stakeholders: action.payload.stakeholders,
        stakeholderCategories: action.payload.categories,
        n8n: {
          ...state.n8n,
          lastSync: new Date().toISOString(),
          syncStatus: n8nService.getSyncStatus(),
          isSyncing: false,
          isAvailable: true
        }
      }

    case 'SET_N8N_ERROR':
      return {
        ...state,
        n8n: {
          ...state.n8n,
          error: action.payload,
          isSyncing: false
        }
      }

    default:
      return state
  }
}

// Helper functions for merging n8n data with local data
function mergeN8nStakeholders(localStakeholders, n8nStakeholders) {
  const merged = [...localStakeholders]

  n8nStakeholders.forEach(n8nStakeholder => {
    // Check if stakeholder already exists locally (by name or databaseId)
    const existingIndex = merged.findIndex(local =>
      local.databaseId === n8nStakeholder.databaseId ||
      (local.name.toLowerCase() === n8nStakeholder.name.toLowerCase() && local.source !== 'notion')
    )

    if (existingIndex >= 0) {
      // Update existing stakeholder with n8n data
      merged[existingIndex] = {
        ...merged[existingIndex],
        ...n8nStakeholder,
        // Preserve local ID if it exists
        id: merged[existingIndex].id,
        // Mark as synced
        lastSynced: new Date().toISOString()
      }
    } else {
      // Add new stakeholder from n8n
      merged.push({
        ...n8nStakeholder,
        id: n8nStakeholder.id || uuidv4() // Ensure unique ID
      })
    }
  })

  return merged
}

function mergeN8nCategories(localCategories, n8nCategories) {
  const merged = [...localCategories]

  n8nCategories.forEach(n8nCategory => {
    // Check if category already exists locally
    const existingIndex = merged.findIndex(local =>
      local.key === n8nCategory.key || local.label?.toLowerCase() === n8nCategory.label?.toLowerCase()
    )

    if (existingIndex >= 0) {
      // Update existing category with n8n data if it's from notion source
      if (merged[existingIndex].source === 'notion') {
        merged[existingIndex] = {
          ...merged[existingIndex],
          ...n8nCategory,
          lastSynced: new Date().toISOString()
        }
      }
      // Don't overwrite local categories
    } else {
      // Add new category from n8n
      merged.push({
        ...n8nCategory,
        id: n8nCategory.id || uuidv4() // Ensure unique ID
      })
    }
  })

  return merged
}

// Helper function to deduplicate meetings
function deduplicateMeetings(meetings) {
  const seen = new Map()
  const deduplicated = []

  meetings.forEach(meeting => {
    if (!seen.has(meeting.id)) {
      seen.set(meeting.id, meeting)
      deduplicated.push(meeting)
    } else {
      // Keep the more recent version
      const existing = seen.get(meeting.id)
      const existingTime = new Date(existing.updatedAt || existing.createdAt || 0).getTime()
      const currentTime = new Date(meeting.updatedAt || meeting.createdAt || 0).getTime()

      if (currentTime > existingTime) {
        // Replace with newer version
        const index = deduplicated.findIndex(m => m.id === meeting.id)
        if (index !== -1) {
          deduplicated[index] = meeting
          seen.set(meeting.id, meeting)
        }
      }
    }
  })

  console.log('🧹 Deduplication:', {
    original: meetings.length,
    deduplicated: deduplicated.length,
    removed: meetings.length - deduplicated.length
  })

  return deduplicated
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, initialState)
  const saveTimeoutRef = useRef(null)
  const isLoadingRef = useRef(false)
  const firestoreSetupRef = useRef(false)

  // Refs to track current local data for subscription callbacks
  // PHASE 3: Used instead of localStorage for subscription merges
  const currentMeetingsRef = useRef([])
  const currentStakeholdersRef = useRef([])
  const currentCategoriesRef = useRef([])

  // Keep refs in sync with state
  useEffect(() => {
    currentMeetingsRef.current = state.meetings
    currentStakeholdersRef.current = state.stakeholders
    currentCategoriesRef.current = state.stakeholderCategories
  }, [state.meetings, state.stakeholders, state.stakeholderCategories])

  useEffect(() => {
    console.log('🚀 AppContext: Initial mount - loading data from Dexie')
    loadData()
  }, [])


  // PHASE 4: No tombstone save effect needed
  // Soft delete uses the deleted field in Dexie, which syncs to Firestore
  // No localStorage is used for deletion tracking anymore

  // Listen for n8n data updates
  // SAFETY: This handler has guards to prevent overwriting existing data with empty arrays
  useEffect(() => {
    const handleN8nDataUpdate = (event) => {
      console.log('📊 AppContext received n8nDataUpdated event:', event.detail)

      if (event.detail && (event.detail.categories || event.detail.stakeholders)) {
        const n8nStakeholders = event.detail.stakeholders || []
        const n8nCategories = event.detail.categories || []

        // SAFETY GUARD: Don't overwrite existing data with empty arrays
        // This prevents data loss when N8N fails or returns empty
        const currentStakeholders = currentStakeholdersRef.current || []
        const currentCategories = currentCategoriesRef.current || []

        if (n8nStakeholders.length === 0 && currentStakeholders.length > 0) {
          console.warn('⚠️ SAFETY: N8N returned 0 stakeholders but we have', currentStakeholders.length, '- NOT overwriting')
          return
        }
        if (n8nCategories.length === 0 && currentCategories.length > 0) {
          console.warn('⚠️ SAFETY: N8N returned 0 categories but we have', currentCategories.length, '- NOT overwriting')
          return
        }

        console.log('📊 Updating AppContext with n8n data:', {
          stakeholders: n8nStakeholders.length,
          categories: n8nCategories.length
        })

        dispatch({
          type: 'SYNC_N8N_DATA',
          payload: {
            stakeholders: n8nStakeholders,
            categories: n8nCategories,
            syncResult: { success: true }
          }
        })
      }
    }

    window.addEventListener('n8nDataUpdated', handleN8nDataUpdate)

    return () => {
      window.removeEventListener('n8nDataUpdated', handleN8nDataUpdate)
    }
  }, [])

  const loadData = useCallback(async () => {
    // Prevent concurrent loads
    if (isLoadingRef.current) {
      console.log('📂 LOAD: Already loading, skipping concurrent call')
      return
    }

    try {
      isLoadingRef.current = true
      dispatch({ type: 'SET_LOADING', payload: true })

      console.log('📂 LOAD: Starting data load - DEXIE FIRST strategy...')

      // Check storage quota in background
      checkStorageQuota().then(quota => {
        if (quota) {
          console.log('📦 Storage quota:', quota)
          if (quota.isCritical) {
            console.error('🚨 CRITICAL: Storage space is very low!')
            window.dispatchEvent(new CustomEvent('meetingflow-storage-warning', {
              detail: { type: 'critical', ...quota }
            }))
          }
        }
      })

      // PHASE 4: No tombstones - soft delete uses deleted field in Dexie

      // ============================================
      // DEXIE-FIRST LOADING STRATEGY
      // ============================================
      let finalMeetings = []
      let finalStakeholders = []
      let finalCategories = []
      let dataSource = 'none'

      // STEP 1: Try Dexie first (most reliable on iOS)
      try {
        console.log('📂 LOAD: Attempting to load from Dexie (primary)...')
        await db.open()

        const dexieMeetings = await db.meetings.orderBy('date').reverse().toArray()
        const dexieStakeholders = await db.stakeholders.toArray()
        const dexieCategories = await db.stakeholderCategories.toArray()

        console.log('📂 LOAD: Dexie data:', {
          meetings: dexieMeetings.length,
          stakeholders: dexieStakeholders.length,
          categories: dexieCategories.length
        })

        if (dexieMeetings.length > 0) {
          // PHASE 4: Filter by deleted field (soft delete)
          finalMeetings = dexieMeetings.filter(m => !m.deleted)
          finalStakeholders = dexieStakeholders.filter(s => !s.deleted)
          finalCategories = dexieCategories.filter(c => !c.deleted)
          dataSource = 'dexie'
          console.log('✅ LOAD: Using Dexie as primary source -', finalMeetings.length, 'meetings')
        }
      } catch (dexieError) {
        console.warn('📂 LOAD: Dexie read failed:', dexieError)
      }

      // PHASE 3: Dexie is the ONLY local storage
      // Legacy sources (localforage, localStorage) are no longer used for data
      // If Dexie is empty, we rely on Firestore sync to populate it

      // STEP 4: If all sources are empty, check if we should auto-sync from cloud
      if (finalMeetings.length === 0) {
        const userId = localStorage.getItem('meetingflow_firestore_user_id')
        if (userId) {
          console.log('⚠️ LOAD: All local sources empty but user is logged in - will auto-sync from cloud')
          dataSource = 'empty-will-sync'

          // Trigger auto-sync in background after a short delay
          // This allows the UI to render first, then sync happens
          setTimeout(() => {
            console.log('🔄 AUTO-SYNC: Triggering background sync due to empty local storage...')
            window.dispatchEvent(new CustomEvent('meetingflow-auto-sync-needed'))
          }, 500)
        } else {
          console.log('⚠️ LOAD: All local sources empty. User should configure sync in Settings.')
          dataSource = 'empty'
        }
      }

      // Deduplicate meetings
      const deduplicatedMeetings = deduplicateMeetings(finalMeetings)

      console.log('🔍 DISPATCH: Loading data from', dataSource, ':', {
        meetings: deduplicatedMeetings.length,
        stakeholders: finalStakeholders.length,
        categories: finalCategories.length
      })

      dispatch({
        type: 'LOAD_DATA',
        payload: {
          meetings: deduplicatedMeetings,
          stakeholders: finalStakeholders,
          stakeholderCategories: finalCategories
        }
      })

      console.log('✅ LOAD: Data load complete from', dataSource)

    } catch (error) {
      console.error('❌ LOAD: Critical error:', error)
      dispatch({ type: 'SET_ERROR', payload: 'Failed to load data from storage' })
    } finally {
      isLoadingRef.current = false
    }
  }, [])

  // Listen for storage updates from sync operations
  useEffect(() => {
    const handleStorageUpdate = () => {
      console.log('📡 Storage update detected, reloading data...')
      loadData()
    }

    // Listen for custom storage update events from sync operations
    window.addEventListener('meetingflow-storage-updated', handleStorageUpdate)

    // Also listen for cross-tab storage changes
    window.addEventListener('storage', (e) => {
      if (e.key && e.key.startsWith('meetingflow_')) {
        console.log('📡 Cross-tab storage change detected:', e.key)
        handleStorageUpdate()
      }
    })

    return () => {
      window.removeEventListener('meetingflow-storage-updated', handleStorageUpdate)
      window.removeEventListener('storage', handleStorageUpdate)
    }
  }, [loadData])

  // ==================== FIRESTORE REAL-TIME SYNC ====================
  // This subscribes to Firestore and MERGES data with local state
  // CRITICAL: We must NOT overwrite local data with empty Firestore results
  // IMPORTANT: Firestore is loaded DYNAMICALLY to prevent iOS crashes
  useEffect(() => {
    if (!ENABLE_FIRESTORE) {
      console.log('🔥 Firestore: Disabled by feature flag')
      return
    }

    // Prevent multiple setups
    if (firestoreSetupRef.current) {
      console.log('🔥 Firestore: Already setting up, skipping')
      return
    }
    firestoreSetupRef.current = true

    // Wait a bit for initial localStorage load to complete before setting up subscriptions
    // This prevents race conditions where Firestore overwrites local data
    const setupDelay = setTimeout(async () => {
      console.log('🔥 Firestore: Setting up real-time subscriptions (after initial load)...')

      try {
        // DYNAMIC IMPORT - Critical for iOS compatibility
        const firestoreService = await getFirestoreService()

        if (!firestoreService) {
          console.log('🔥 Firestore: Service not available, skipping subscriptions')
          return
        }

        // PHASE 4: Soft delete - no tombstones, use deleted field

        // Subscribe to meetings - trust cloud data with deleted field
        // SYNC FIX: NEVER skip subscription callbacks - we must always capture tombstones
        const unsubMeetings = firestoreService.subscribeMeetings((firestoreMeetings) => {
          try {
            // DEBUG: Log deleted status of all meetings
            const deletedFromCloud = firestoreMeetings.filter(m => m.deleted)
            const activeFromCloud = firestoreMeetings.filter(m => !m.deleted)
            console.log(`🔥 Subscription: Received ${firestoreMeetings.length} meetings (${deletedFromCloud.length} deleted, ${activeFromCloud.length} active)`)

            // DEBUG: Log specific details for recently modified meetings
            if (deletedFromCloud.length > 0) {
              console.log('🔥 DEBUG: Deleted meetings from Firestore:', deletedFromCloud.map(m => ({
                id: m.id?.slice(0, 20),
                deleted: m.deleted,
                deletedAt: m.deletedAt,
                updatedAt: m.updatedAt
              })))
            }

            // SYNC FIX: Always save ALL data to Dexie FIRST (including deleted=true tombstones)
            // This ensures delete propagation even during locks
            try {
              bulkSaveMeetings(firestoreMeetings, { queueSync: false })
                .then(result => {
                  console.log('🔥 Subscription: Saved', result.saved, 'meetings to Dexie (including deleted)')
                })
                .catch(err => {
                  console.warn('🔥 Subscription: Dexie save failed:', err.message)
                })
            } catch (dexieErr) {
              console.warn('🔥 Subscription: Dexie error:', dexieErr.message)
            }

            // Skip UI updates during sync/interaction to prevent race conditions
            // But Dexie save above ensures tombstones are captured
            if (isSyncInProgress() || isUserInteractionInProgress()) {
              console.log('🔥 Subscription: Dexie saved, skipping UI update - sync or interaction in progress')
              return
            }

            // PHASE 4: Filter by deleted field (soft delete)
            const activeMeetings = firestoreMeetings.filter(m => !m.deleted)
            const deletedMeetings = firestoreMeetings.filter(m => m.deleted)

            if (deletedMeetings.length > 0) {
              console.log('🗑️ Found', deletedMeetings.length, 'soft-deleted meetings in cloud')
            }

            // Get current local meetings
            const localMeetings = currentMeetingsRef.current || []

            // SYNC FIX: Pass ALL meetings to merge (including deleted), let merge handle it
            const mergedMeetings = mergeMeetingsData(localMeetings, firestoreMeetings)

            // Filter for UI - only show active meetings
            const activeMerged = mergedMeetings.filter(m => !m.deleted)
            console.log('🔥 Subscription: Merge complete -', activeMerged.length, 'active meetings')

            // Update React state with active meetings only
            dispatch({ type: 'SET_MEETINGS', payload: activeMerged })
          } catch (callbackErr) {
            console.error('🔥 Subscription: Error processing meetings:', callbackErr)
          }
        })

        // Subscribe to stakeholders - PHASE 4: soft delete
        // SYNC FIX: NEVER skip - always save to Dexie for tombstone propagation
        const unsubStakeholders = firestoreService.subscribeStakeholders(async (firestoreStakeholders) => {
          try {
            console.log('🔥 Subscription: Received', firestoreStakeholders.length, 'stakeholders from cloud')

            // SYNC FIX: Always save ALL data to Dexie FIRST (including deleted=true)
            try {
              const result = await bulkSaveStakeholders(firestoreStakeholders, { queueSync: false })
              console.log('🔥 Subscription: Saved', result.saved, 'stakeholders to Dexie')
            } catch (err) {
              console.warn('🔥 Subscription: Dexie stakeholders error:', err.message)
            }

            // Skip UI updates during sync, but Dexie save ensures tombstones captured
            if (isSyncInProgress()) {
              console.log('🔥 Subscription: Dexie saved, skipping UI update - sync in progress')
              return
            }

            // Create a set of Firestore IDs for quick lookup
            const firestoreIds = new Set(firestoreStakeholders.map(s => s.id))

            // Read from Dexie to get local stakeholders with deleted flags
            let localStakeholders = []
            try {
              localStakeholders = await getAllStakeholders() || []
              console.log('🔥 Subscription: Read', localStakeholders.length, 'stakeholders from Dexie')
            } catch (e) {
              console.warn('🔥 Subscription: Failed to read Dexie, using React ref:', e.message)
              localStakeholders = currentStakeholdersRef.current || []
            }

            // ORPHAN CLEANUP: Mark local stakeholders that don't exist in Firestore as deleted
            // SAFETY GUARD: Skip orphan cleanup if Firestore returned empty/suspicious data
            // This prevents mass deletion when Firestore has connection issues
            const activeLocalStakeholders = localStakeholders.filter(s => !s.deleted)
            const potentialOrphans = activeLocalStakeholders.filter(s => !firestoreIds.has(s.id))

            let cleanedLocalStakeholders = localStakeholders

            if (firestoreStakeholders.length === 0 && activeLocalStakeholders.length > 0) {
              // Firestore returned empty but we have local data - DON'T delete anything
              console.warn('⚠️ SAFETY: Firestore returned 0 stakeholders but local has', activeLocalStakeholders.length, '- skipping orphan cleanup')
            } else if (potentialOrphans.length > activeLocalStakeholders.length * 0.5 && potentialOrphans.length > 2) {
              // Would delete more than 50% of local items - that's suspicious
              console.warn('⚠️ SAFETY: Orphan cleanup would delete', potentialOrphans.length, 'of', activeLocalStakeholders.length, 'stakeholders (>50%) - skipping')
            } else {
              // Safe to run orphan cleanup
              cleanedLocalStakeholders = localStakeholders.map(localStk => {
                if (!firestoreIds.has(localStk.id) && !localStk.deleted) {
                  console.log('🧹 Marking orphaned stakeholder as deleted:', localStk.id, localStk.name || localStk.company)
                  return { ...localStk, deleted: true, deletedAt: new Date().toISOString() }
                }
                return localStk
              })

              // Save the orphan deletions back to Dexie
              const orphansToDelete = cleanedLocalStakeholders.filter(s =>
                s.deleted && !localStakeholders.find(ls => ls.id === s.id)?.deleted
              )
              if (orphansToDelete.length > 0) {
                console.log('🧹 Saving', orphansToDelete.length, 'orphan deletions to Dexie')
                await bulkSaveStakeholders(orphansToDelete, { queueSync: false })
              }
            }

            const mergedStakeholders = mergeByIdKeepNewer(cleanedLocalStakeholders, firestoreStakeholders)

            // Filter for UI - only show active stakeholders
            const activeStakeholders = mergedStakeholders.filter(s => !s.deleted)
            console.log('🔥 Subscription: Merged stakeholders:', mergedStakeholders.length, '-> Active:', activeStakeholders.length)
            dispatch({ type: 'SET_STAKEHOLDERS', payload: activeStakeholders })
          } catch (callbackErr) {
            console.error('🔥 Subscription: Error processing stakeholders:', callbackErr)
          }
        })

        // Subscribe to categories - PHASE 4: soft delete
        // SYNC FIX: NEVER skip - always save to Dexie for tombstone propagation
        const unsubCategories = firestoreService.subscribeStakeholderCategories(async (firestoreCategories) => {
          try {
            console.log('🔥 Subscription: Received', firestoreCategories.length, 'categories from cloud')

            // SYNC FIX: Always save ALL data to Dexie FIRST (including deleted=true)
            try {
              const result = await bulkSaveCategories(firestoreCategories, { queueSync: false })
              console.log('🔥 Subscription: Saved', result.saved, 'categories to Dexie')
            } catch (err) {
              console.warn('🔥 Subscription: Dexie categories error:', err.message)
            }

            // Skip UI updates during sync, but Dexie save ensures tombstones captured
            if (isSyncInProgress()) {
              console.log('🔥 Subscription: Dexie saved, skipping UI update - sync in progress')
              return
            }

            // Create a set of Firestore IDs for quick lookup
            const firestoreIds = new Set(firestoreCategories.map(c => c.id))

            // Read from Dexie to get local categories with deleted flags
            let localCategories = []
            try {
              localCategories = await getAllCategories() || []
              console.log('🔥 Subscription: Read', localCategories.length, 'categories from Dexie')
            } catch (e) {
              console.warn('🔥 Subscription: Failed to read Dexie, using React ref:', e.message)
              localCategories = currentCategoriesRef.current || []
            }

            // ORPHAN CLEANUP: Mark local categories that don't exist in Firestore as deleted
            // SAFETY GUARD: Skip orphan cleanup if Firestore returned empty/suspicious data
            // This prevents mass deletion when Firestore has connection issues
            const activeLocalCategories = localCategories.filter(c => !c.deleted)
            const potentialOrphanCats = activeLocalCategories.filter(c => !firestoreIds.has(c.id))

            let cleanedLocalCategories = localCategories

            if (firestoreCategories.length === 0 && activeLocalCategories.length > 0) {
              // Firestore returned empty but we have local data - DON'T delete anything
              console.warn('⚠️ SAFETY: Firestore returned 0 categories but local has', activeLocalCategories.length, '- skipping orphan cleanup')
            } else if (potentialOrphanCats.length > activeLocalCategories.length * 0.5 && potentialOrphanCats.length > 2) {
              // Would delete more than 50% of local items - that's suspicious
              console.warn('⚠️ SAFETY: Orphan cleanup would delete', potentialOrphanCats.length, 'of', activeLocalCategories.length, 'categories (>50%) - skipping')
            } else {
              // Safe to run orphan cleanup
              cleanedLocalCategories = localCategories.map(localCat => {
                if (!firestoreIds.has(localCat.id) && !localCat.deleted) {
                  console.log('🧹 Marking orphaned category as deleted:', localCat.id, localCat.label || localCat.key)
                  return { ...localCat, deleted: true, deletedAt: new Date().toISOString() }
                }
                return localCat
              })

              // Save the orphan deletions back to Dexie
              const orphansToDelete = cleanedLocalCategories.filter(c =>
                c.deleted && !localCategories.find(lc => lc.id === c.id)?.deleted
              )
              if (orphansToDelete.length > 0) {
                console.log('🧹 Saving', orphansToDelete.length, 'orphan deletions to Dexie')
                await bulkSaveCategories(orphansToDelete, { queueSync: false })
              }
            }

            const mergedCategories = mergeByIdKeepNewer(cleanedLocalCategories, firestoreCategories)

            // Filter for UI - only show active categories
            const activeCategories = mergedCategories.filter(c => !c.deleted)
            console.log('🔥 Subscription: Merged categories:', mergedCategories.length, '-> Active:', activeCategories.length)
            dispatch({ type: 'SET_STAKEHOLDER_CATEGORIES', payload: activeCategories })
          } catch (callbackErr) {
            console.error('🔥 Subscription: Error processing categories:', callbackErr)
          }
        })

        // Store unsubscribe functions for cleanup
        window._firestoreUnsubscribe = () => {
          console.log('🔥 Firestore: Cleaning up subscriptions')
          unsubMeetings?.()
          unsubStakeholders?.()
          unsubCategories?.()
        }
      } catch (setupErr) {
        console.error('🔥 Firestore: Failed to setup subscriptions (app will continue without real-time sync):', setupErr)
        // App continues to work with localStorage only
      }
    }, 1000) // Wait 1 second for localStorage to load first

    // Cleanup subscriptions when component unmounts
    return () => {
      clearTimeout(setupDelay)
      if (window._firestoreUnsubscribe) {
        window._firestoreUnsubscribe()
      }
    }
  }, []) // Empty deps - only run once on mount

  // Helper: Merge meetings, keeping newer versions and avoiding duplicates
  // SYNC FIX: Now handles deleted=true properly - deletion ALWAYS wins
  //
  // Key principles:
  // - If EITHER side has deleted=true, the merged result is deleted=true
  // - Timestamp comparison only applies to non-delete fields
  // - Binary data (audio, large images) is always preserved from local since Firestore never stores it
  // - New local meetings (created < 5 min ago) are preserved to allow time to sync
  function mergeMeetingsData(localMeetings, cloudMeetings) {
    const merged = new Map()
    const cloudIds = new Set(cloudMeetings.map(m => m.id).filter(Boolean))
    const now = Date.now()
    const NEW_MEETING_GRACE_PERIOD = 5 * 60 * 1000 // 5 minutes

    // Create a map of local meetings for lookup
    const localMeetingsMap = new Map()
    localMeetings.forEach(meeting => {
      if (meeting.id) {
        localMeetingsMap.set(meeting.id, meeting)
      }
    })

    // Process all cloud meetings
    cloudMeetings.forEach(cloudMeeting => {
      if (!cloudMeeting.id) return

      const localMeeting = localMeetingsMap.get(cloudMeeting.id)
      if (localMeeting) {
        // Exists in both - merge with delete-wins logic
        const localTime = new Date(localMeeting.updatedAt || localMeeting.createdAt || 0).getTime()
        const cloudTime = new Date(cloudMeeting.updatedAt || cloudMeeting.createdAt || 0).getTime()

        // SYNC FIX: deleted=true ALWAYS wins, regardless of timestamp
        const isDeleted = cloudMeeting.deleted || localMeeting.deleted

        if (isDeleted) {
          // If either is deleted, result is deleted (use the deleted one's data)
          const deletedSource = cloudMeeting.deleted ? cloudMeeting : localMeeting
          merged.set(cloudMeeting.id, {
            ...deletedSource,
            deleted: true,
            deletedAt: deletedSource.deletedAt || new Date().toISOString(),
            // Preserve local binary data
            audioBlob: localMeeting.audioBlob,
            audioData: localMeeting.audioData,
            audioUrl: localMeeting.audioUrl,
            recordingBlob: localMeeting.recordingBlob,
          })
          console.log(`🗑️ Merge: Meeting ${cloudMeeting.id?.slice(0,8)} marked as deleted (delete-wins)`)
        } else if (cloudTime >= localTime) {
          // Cloud is newer or equal - use cloud values, preserve local binary data
          merged.set(cloudMeeting.id, {
            ...cloudMeeting,
            // Binary data is local-only, always preserve from local
            audioBlob: localMeeting.audioBlob,
            audioData: localMeeting.audioData,
            audioUrl: localMeeting.audioUrl,
            recordingBlob: localMeeting.recordingBlob,
          })
        } else {
          // Local is newer - keep local (user made changes not yet synced)
          merged.set(cloudMeeting.id, localMeeting)
        }
      } else {
        // Only in cloud - add it (including if deleted)
        merged.set(cloudMeeting.id, cloudMeeting)
      }
    })

    // Add local-only meetings that are NEW (not yet synced)
    localMeetings.forEach(localMeeting => {
      if (!localMeeting.id) return
      if (cloudIds.has(localMeeting.id)) return // Already handled above

      // If locally deleted, still include for sync propagation
      if (localMeeting.deleted) {
        merged.set(localMeeting.id, localMeeting)
        console.log(`🗑️ Keeping locally deleted meeting for sync:`, localMeeting.id?.slice(0,8))
        return
      }

      // Check if this is a recently created meeting (grace period)
      const createdAt = new Date(localMeeting.createdAt || 0).getTime()
      const age = now - createdAt

      if (age < NEW_MEETING_GRACE_PERIOD) {
        // New meeting, give it time to sync
        console.log(`🔄 Keeping new local meeting (age: ${Math.round(age/1000)}s):`, localMeeting.id?.slice(0,8))
        merged.set(localMeeting.id, localMeeting)
      } else {
        // Old meeting not in cloud = was deleted from another device
        // Mark it as deleted rather than removing (for consistency)
        console.log(`🗑️ Old local meeting not in cloud, marking deleted:`, localMeeting.id?.slice(0,8))
        merged.set(localMeeting.id, {
          ...localMeeting,
          deleted: true,
          deletedAt: new Date().toISOString()
        })
      }
    })

    return Array.from(merged.values())
  }

  // Helper: Generic merge by ID, keeping newer versions
  // SYNC FIX: Now handles deleted=true properly - deletion ALWAYS wins
  function mergeByIdKeepNewer(localItems, cloudItems) {
    const merged = new Map()

    localItems.forEach(item => {
      if (item.id) merged.set(item.id, item)
    })

    cloudItems.forEach(cloudItem => {
      if (!cloudItem.id) return
      const existing = merged.get(cloudItem.id)
      if (!existing) {
        merged.set(cloudItem.id, cloudItem)
      } else {
        // SYNC FIX: deleted=true ALWAYS wins, regardless of timestamp
        const isDeleted = cloudItem.deleted || existing.deleted

        if (isDeleted) {
          // Either side is deleted - result is deleted
          const deletedItem = {
            ...(cloudItem.deleted ? cloudItem : existing),
            deleted: true,
            deletedAt: cloudItem.deletedAt || existing.deletedAt || new Date().toISOString()
          }
          merged.set(cloudItem.id, deletedItem)
        } else {
          // Neither is deleted - compare timestamps
          const existingTime = new Date(existing.updatedAt || existing.createdAt || existing.lastModified || 0).getTime()
          const cloudTime = new Date(cloudItem.updatedAt || cloudItem.createdAt || cloudItem.lastModified || 0).getTime()
          if (cloudTime > existingTime) {
            merged.set(cloudItem.id, cloudItem)
          }
        }
      }
    })

    return Array.from(merged.values())
  }

  // saveData is now inline in debouncedSave to prevent stale closure issues

  // Helper function to merge stakeholders and avoid duplicates
  const mergeDuplicateStakeholders = (localStakeholders, n8nStakeholders) => {
    const merged = [...localStakeholders]

    n8nStakeholders.forEach(n8nStakeholder => {
      // Check if stakeholder already exists (by email or database ID)
      const existingIndex = merged.findIndex(local =>
        local.email === n8nStakeholder.email ||
        local.databaseId === n8nStakeholder.databaseId
      )

      if (existingIndex >= 0) {
        // Update existing stakeholder with n8n data (n8n is source of truth)
        merged[existingIndex] = {
          ...merged[existingIndex],
          ...n8nStakeholder,
          id: merged[existingIndex].id // Keep local ID for consistency
        }
      } else {
        // Add new stakeholder from n8n
        merged.push({
          ...n8nStakeholder,
          id: n8nStakeholder.id || uuidv4() // Ensure unique ID
        })
      }
    })

    return merged
  }

  // n8n-specific actions
  const syncStakeholdersFromN8n = async () => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true })

      const result = await n8nService.syncFromN8n()

      if (result.stakeholders && result.stakeholders.length > 0) {
        const mergedStakeholders = mergeDuplicateStakeholders(
          state.stakeholders,
          result.stakeholders
        )

        const mergedCategories = mergeN8nCategories(
          state.stakeholderCategories,
          result.categories || []
        )

        dispatch({
          type: 'SYNC_N8N_DATA',
          payload: {
            stakeholders: mergedStakeholders,
            categories: mergedCategories,
            syncResult: result
          }
        })
      }

      return result
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: error.message })
      throw error
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false })
    }
  }

  const exportMeetingToN8n = async (meetingData) => {
    try {
      // Find stakeholder database ID if available
      if (meetingData.selectedStakeholder) {
        const stakeholder = state.stakeholders.find(s => s.id === meetingData.selectedStakeholder)
        if (stakeholder?.databaseId) {
          meetingData.stakeholderDatabaseId = stakeholder.databaseId
        }
      }

      const result = await n8nService.exportMeeting(meetingData)

      // Update stakeholder last contact date if successful
      if (result.success && meetingData.selectedStakeholder) {
        dispatch({
          type: 'UPDATE_STAKEHOLDER',
          payload: {
            id: meetingData.selectedStakeholder,
            lastContact: meetingData.date || new Date().toISOString().split('T')[0]
          }
        })
      }

      return result
    } catch (error) {
      dispatch({ type: 'SET_N8N_ERROR', payload: error.message })
      throw error
    }
  }

  const actions = {
    addMeeting: async (meeting) => {
      // Always generate UUID before dispatch to prevent duplicates
      const meetingWithId = {
        ...meeting,
        id: meeting.id || uuidv4(),
        createdAt: meeting.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      console.log('📝 AppContext: Adding meeting with ID:', meetingWithId.id)
      console.log('📝 AppContext: Current meetings count before add:', state.meetings.length)

      // Track save status
      let dexieSaveSuccess = false
      let firestoreSaveSuccess = false
      let errors = []

      // 1. First dispatch to update React state (immediate UI update)
      dispatch({ type: 'ADD_MEETING', payload: meetingWithId })

      // 2. DEXIE FIRST - Primary local storage (has full blob data)
      try {
        await saveMeetingToDexie(meetingWithId, { queueSync: false })
        console.log('✅ AppContext: Meeting saved to Dexie (PRIMARY):', meetingWithId.id)
        dexieSaveSuccess = true
      } catch (dexieErr) {
        console.error('❌ AppContext: Failed to save to Dexie:', dexieErr.message)
        errors.push(`Dexie: ${dexieErr.message}`)
      }

      // 3. Firestore - Cloud sync (with text blobs, no binary)
      if (ENABLE_FIRESTORE) {
        try {
          const firestoreService = await getFirestoreService()
          if (firestoreService) {
            // Use stripBinaryOnly to preserve text blobs but remove audio data
            await firestoreService.saveMeeting(stripBinaryOnly(meetingWithId))
            console.log('✅ AppContext: Meeting saved to Firestore (with text blobs):', meetingWithId.id)
            firestoreSaveSuccess = true
          }
        } catch (err) {
          console.error('❌ AppContext: Failed to save to Firestore:', meetingWithId.id, err.message)
          errors.push(`Firestore: ${err.message}`)
        }
      }

      // PHASE 3: localStorage removed - Dexie is the only local storage

      // Success if Dexie worked (primary storage)
      const success = dexieSaveSuccess
      return {
        success,
        meeting: meetingWithId,
        dexieSaved: dexieSaveSuccess,
        firestoreSaved: firestoreSaveSuccess,
        errors: errors.length > 0 ? errors : undefined
      }
    },

    updateMeeting: async (meeting) => {
      console.log('📝 AppContext: Updating meeting with ID:', meeting.id)

      const updatedMeeting = {
        ...meeting,
        updatedAt: new Date().toISOString()
      }

      // Track save status
      let dexieSaveSuccess = false
      let firestoreSaveSuccess = false
      let errors = []

      // 1. Dispatch to update React state (immediate UI update)
      dispatch({ type: 'UPDATE_MEETING', payload: updatedMeeting })

      // 2. DEXIE FIRST - Primary local storage (has full blob data)
      try {
        await saveMeetingToDexie(updatedMeeting, { queueSync: false })
        console.log('✅ AppContext: Meeting updated in Dexie (PRIMARY):', updatedMeeting.id)
        dexieSaveSuccess = true
      } catch (dexieErr) {
        console.error('❌ AppContext: Failed to update Dexie:', dexieErr.message)
        errors.push(`Dexie: ${dexieErr.message}`)
      }

      // 3. Firestore - Cloud sync (with text blobs, no binary)
      if (ENABLE_FIRESTORE) {
        try {
          const firestoreService = await getFirestoreService()
          if (firestoreService) {
            // Use stripBinaryOnly to preserve text blobs but remove audio data
            await firestoreService.saveMeeting(stripBinaryOnly(updatedMeeting))
            console.log('✅ AppContext: Meeting updated in Firestore (with text blobs):', updatedMeeting.id)
            firestoreSaveSuccess = true
          }
        } catch (err) {
          console.error('❌ AppContext: Failed to update Firestore:', updatedMeeting.id, err.message)
          errors.push(`Firestore: ${err.message}`)
        }
      }

      // PHASE 3: localStorage removed - Dexie is the only local storage

      // Success if Dexie worked (primary storage)
      const success = dexieSaveSuccess
      return {
        success,
        meeting: updatedMeeting,
        dexieSaved: dexieSaveSuccess,
        firestoreSaved: firestoreSaveSuccess,
        errors: errors.length > 0 ? errors : undefined
      }
    },
    deleteMeeting: async (meetingId) => {
      // PHASE 4: Soft delete - set deleted=true instead of removing
      // The deleted field syncs to Firestore like any other field
      acquireInteractionLock('deleteMeeting')
      console.log('🗑️ [DELETE] ========== SOFT DELETE STARTING ==========')
      console.log('🗑️ [DELETE] Meeting ID:', meetingId)
      console.log('🗑️ [DELETE] Timestamp:', new Date().toISOString())

      try {
        // 1. Update React state to hide the meeting
        dispatch({ type: 'DELETE_MEETING', payload: meetingId })
        console.log('🗑️ [DELETE] Step 1: React state updated (meeting hidden from UI)')

        // 2. Soft delete in Dexie (sets deleted=true, updatedAt=now)
        try {
          await softDeleteMeetingInDexie(meetingId, { queueSync: false })
          console.log('🗑️ [DELETE] Step 2: Dexie soft delete completed')

          // DEBUG: Verify Dexie has deleted=true
          const dexieCheck = await getFullMeeting(meetingId)
          console.log('🗑️ [DELETE] Step 2 VERIFY: Dexie meeting after soft delete:', {
            id: dexieCheck?.id?.slice(0, 20),
            deleted: dexieCheck?.deleted,
            deletedAt: dexieCheck?.deletedAt
          })
        } catch (dexieErr) {
          console.error('🗑️ [DELETE] Step 2 FAILED:', dexieErr.message)
        }

        // 3. Sync deleted=true to Firestore (not a delete, just an update)
        if (ENABLE_FIRESTORE) {
          try {
            const firestoreService = await getFirestoreService()
            if (firestoreService) {
              // Get the meeting from Dexie to sync with deleted=true
              const deletedMeeting = await getFullMeeting(meetingId)
              if (deletedMeeting) {
                const dataToSync = stripBinaryOnly({
                  ...deletedMeeting,
                  deleted: true,
                  deletedAt: deletedMeeting.deletedAt || new Date().toISOString(),
                  updatedAt: new Date().toISOString()
                })
                console.log('🗑️ [DELETE] Step 3: Syncing to Firestore:', {
                  id: dataToSync.id?.slice(0, 20),
                  deleted: dataToSync.deleted,
                  deletedAt: dataToSync.deletedAt
                })
                // Save the meeting with deleted=true to Firestore
                await firestoreService.saveMeeting(dataToSync)
                console.log('🗑️ [DELETE] Step 3: Firestore sync COMPLETED')
              } else {
                console.error('🗑️ [DELETE] Step 3 FAILED: Could not retrieve meeting from Dexie')
              }
            }
          } catch (err) {
            console.error('🗑️ [DELETE] Step 3 FAILED:', err.message)
            // The outbox will retry this later
          }
        }
        console.log('🗑️ [DELETE] ========== SOFT DELETE COMPLETE ==========')
      } finally {
        // Release lock after a short delay to ensure state has settled
        setTimeout(() => {
          console.log('🗑️ [DELETE] Releasing interaction lock')
          releaseInteractionLock()
        }, 1000) // 1 second grace period
      }
    },
    setCurrentMeeting: (meeting) => dispatch({ type: 'SET_CURRENT_MEETING', payload: meeting }),

    addStakeholder: async (stakeholder) => {
      // Generate ID before dispatch so we can save to Firestore with the same ID
      const timestamp = new Date().toISOString()
      const stakeholderWithId = {
        id: uuidv4(),
        ...stakeholder,
        createdAt: timestamp,
        updatedAt: timestamp
      }
      dispatch({ type: 'ADD_STAKEHOLDER', payload: stakeholderWithId })
      // Save to Firestore for cloud sync
      if (ENABLE_FIRESTORE) {
        try {
          const firestoreService = await getFirestoreService()
          if (firestoreService) {
            await firestoreService.saveStakeholder(stakeholderWithId)
            console.log('🔥 Firestore: Saved new stakeholder:', stakeholderWithId.id)
          }
        } catch (err) {
          console.warn('🔥 Firestore: Failed to save stakeholder:', stakeholderWithId.id, err.message)
        }
      }
    },
    updateStakeholder: async (stakeholder) => {
      dispatch({ type: 'UPDATE_STAKEHOLDER', payload: stakeholder })
      // Save to Firestore for cloud sync
      if (ENABLE_FIRESTORE && stakeholder.id) {
        try {
          const firestoreService = await getFirestoreService()
          if (firestoreService) {
            await firestoreService.saveStakeholder(stakeholder)
          }
        } catch (err) {
          console.warn('🔥 Firestore: Failed to update stakeholder:', stakeholder.id, err.message)
        }
      }
    },
    deleteStakeholder: async (stakeholderId) => {
      // PHASE 4: Soft delete - set deleted=true instead of removing
      acquireInteractionLock('deleteStakeholder')
      console.log('🗑️ [SOFT DELETE] Starting soft delete for stakeholder:', stakeholderId)

      try {
        // 1. Update React state to hide the stakeholder
        dispatch({ type: 'DELETE_STAKEHOLDER', payload: stakeholderId })

        // 2. Soft delete in Dexie (sets deleted=true, updatedAt=now)
        try {
          await softDeleteStakeholderInDexie(stakeholderId, { queueSync: false })
          console.log('🗑️ [SOFT DELETE] Dexie soft delete completed:', stakeholderId)
        } catch (dexieErr) {
          console.error('🗑️ [SOFT DELETE] Dexie soft delete FAILED:', dexieErr.message)
        }

        // 3. Sync deleted=true to Firestore (not a delete, just an update)
        if (ENABLE_FIRESTORE) {
          try {
            const firestoreService = await getFirestoreService()
            if (firestoreService) {
              await firestoreService.saveStakeholder({
                id: stakeholderId,
                deleted: true,
                updatedAt: new Date().toISOString()
              })
              console.log('🗑️ [SOFT DELETE] Firestore sync completed (deleted=true):', stakeholderId)
            }
          } catch (err) {
            console.error('🗑️ [SOFT DELETE] Firestore sync FAILED:', err.message)
          }
        }
      } finally {
        setTimeout(() => {
          releaseInteractionLock()
        }, 1000)
      }
    },

    addStakeholderCategory: async (category) => {
      // Generate ID before dispatch so we can save to Firestore with the same ID
      const timestamp = new Date().toISOString()
      const categoryWithId = {
        id: uuidv4(),
        key: category.key || (category.label || '').toLowerCase().replace(/\s+/g, '-'),
        ...category,
        createdAt: timestamp,
        updatedAt: timestamp
      }
      dispatch({ type: 'ADD_STAKEHOLDER_CATEGORY', payload: categoryWithId })
      // Save to Firestore for cloud sync
      if (ENABLE_FIRESTORE) {
        try {
          const firestoreService = await getFirestoreService()
          if (firestoreService) {
            await firestoreService.saveStakeholderCategory(categoryWithId)
            console.log('🔥 Firestore: Saved new category:', categoryWithId.id)
          }
        } catch (err) {
          console.warn('🔥 Firestore: Failed to save category:', categoryWithId.id, err.message)
        }
      }
    },
    updateStakeholderCategory: async (category) => {
      dispatch({ type: 'UPDATE_STAKEHOLDER_CATEGORY', payload: category })
      // Save to Firestore for cloud sync
      if (ENABLE_FIRESTORE && category.id) {
        try {
          const firestoreService = await getFirestoreService()
          if (firestoreService) {
            await firestoreService.saveStakeholderCategory(category)
          }
        } catch (err) {
          console.warn('🔥 Firestore: Failed to update category:', category.id, err.message)
        }
      }
    },
    deleteStakeholderCategory: async (categoryKey) => {
      // PHASE 4: Soft delete - set deleted=true instead of removing
      acquireInteractionLock('deleteStakeholderCategory')
      console.log('🗑️ [SOFT DELETE] Starting soft delete for category:', categoryKey)

      try {
        // 1. Update React state to hide the category
        dispatch({ type: 'DELETE_STAKEHOLDER_CATEGORY', payload: categoryKey })

        // 2. Soft delete in Dexie (sets deleted=true, updatedAt=now)
        try {
          await softDeleteCategoryInDexie(categoryKey, { queueSync: false })
          console.log('🗑️ [SOFT DELETE] Dexie soft delete completed:', categoryKey)
        } catch (dexieErr) {
          console.error('🗑️ [SOFT DELETE] Dexie soft delete FAILED:', dexieErr.message)
        }

        // 3. Sync deleted=true to Firestore (not a delete, just an update)
        if (ENABLE_FIRESTORE) {
          try {
            const firestoreService = await getFirestoreService()
            if (firestoreService) {
              await firestoreService.saveStakeholderCategory({
                id: categoryKey,
                deleted: true,
                updatedAt: new Date().toISOString()
              })
              console.log('🗑️ [SOFT DELETE] Firestore sync completed (deleted=true):', categoryKey)
            }
          } catch (err) {
            console.error('🗑️ [SOFT DELETE] Firestore sync FAILED:', err.message)
          }
        }
      } finally {
        setTimeout(() => {
          releaseInteractionLock()
        }, 1000)
      }
    },
    setStakeholderCategories: (categories) => dispatch({ type: 'SET_STAKEHOLDER_CATEGORIES', payload: categories }),

    addNoteToMeeting: (meetingId, note) => dispatch({ type: 'ADD_NOTE_TO_MEETING', payload: { meetingId, note } }),
    updateNoteInMeeting: (meetingId, noteId, updatedNote) =>
      dispatch({ type: 'UPDATE_NOTE_IN_MEETING', payload: { meetingId, noteId, updatedNote } }),

    clearError: () => dispatch({ type: 'SET_ERROR', payload: null }),

    // Storage management
    reloadFromStorage: () => {
      console.log('🔄 Manual reload from storage requested')
      loadData()
    },

    // ============================================
    // FULL SYNC - Comprehensive Firestore sync
    // ============================================
    performFullSync: async () => {
      const userId = localStorage.getItem('meetingflow_firestore_user_id')

      if (!userId) {
        return {
          success: false,
          message: 'Firestore not configured. Go to Settings > Firestore Sync to set up.'
        }
      }

      // Acquire sync lock to prevent race conditions
      if (!acquireSyncLock()) {
        return {
          success: false,
          message: 'A sync is already in progress. Please wait and try again.'
        }
      }

      try {
        console.log('🔄 Full sync starting...')
        console.log('🔄 User ID:', userId)

        // Load firestore service
        const firestoreService = await getFirestoreService()
        if (!firestoreService) {
          throw new Error('Failed to load Firestore service')
        }

        console.log('🔄 Firestore service loaded, fetching data...')

        // Fetch all data from Firestore with individual error handling
        let cloudMeetings = [], cloudStakeholders = [], cloudCategories = []

        try {
          cloudMeetings = await firestoreService.getMeetings()
          console.log('🔄 Meetings fetched:', cloudMeetings.length)
        } catch (e) {
          console.error('🔄 Failed to fetch meetings:', e)
          throw new Error(`Failed to fetch meetings: ${e.message}`)
        }

        try {
          cloudStakeholders = await firestoreService.getStakeholders()
          console.log('🔄 Stakeholders fetched:', cloudStakeholders.length)
        } catch (e) {
          console.error('🔄 Failed to fetch stakeholders:', e)
          throw new Error(`Failed to fetch stakeholders: ${e.message}`)
        }

        try {
          cloudCategories = await firestoreService.getStakeholderCategories()
          console.log('🔄 Categories fetched:', cloudCategories.length)
        } catch (e) {
          console.error('🔄 Failed to fetch categories:', e)
          throw new Error(`Failed to fetch categories: ${e.message}`)
        }

        // Strip large fields from cloud meetings BEFORE merging
        console.log('🔄 Stripping large fields from cloud data...')
        cloudMeetings = cloudMeetings.map(m => stripLargeFields(m))

        // Read local data - DEXIE FIRST (has full blob data)
        console.log('🔄 Reading local data from Dexie (primary source)...')
        let localMeetings = []
        let localStakeholders = []
        let localCategories = []

        try {
          // Import dynamically to avoid circular deps
          const dexieService = await import('../db/dexieService')
          const { getAllMeetingMetadata, getFullMeeting, getAllStakeholders, getAllCategories } = dexieService

          // Get meeting metadata first
          const meetingMetadata = await getAllMeetingMetadata()
          console.log(`🔄 Found ${meetingMetadata.length} meetings in Dexie metadata`)

          // Load full meetings with blobs (parallel for speed)
          localMeetings = await Promise.all(
            meetingMetadata.map(async (meta) => {
              try {
                const full = await getFullMeeting(meta.id)
                return full || meta // Fall back to metadata if blob load fails
              } catch (e) {
                console.warn(`⚠️ Failed to load full meeting ${meta.id}, using metadata:`, e.message)
                return meta
              }
            })
          )
          console.log(`🔄 Loaded ${localMeetings.length} full meetings from Dexie`)

          // Load stakeholders and categories from Dexie
          localStakeholders = await getAllStakeholders() || []
          localCategories = await getAllCategories() || []

        } catch (dexieErr) {
          console.error('❌ Failed to read from Dexie:', dexieErr)
        }

        console.log('🔄 Local data:', {
          meetings: localMeetings.length,
          stakeholders: localStakeholders.length,
          categories: localCategories.length
        })

        // SYNC FIX: Do NOT filter deleted items before merge!
        // The merge functions now handle deleted=true with "delete-wins" logic
        // Filtering before merge would LOSE the tombstones and break delete sync
        const localDeletedMeetings = localMeetings.filter(m => m.deleted).length
        const cloudDeletedMeetings = cloudMeetings.filter(m => m.deleted).length
        const localDeletedStakeholders = localStakeholders.filter(s => s.deleted).length
        const cloudDeletedStakeholders = cloudStakeholders.filter(s => s.deleted).length

        console.log('🔄 Delete status (included in merge for proper sync):', {
          localDeletedMeetings,
          cloudDeletedMeetings,
          localDeletedStakeholders,
          cloudDeletedStakeholders
        })

        // Merge with timestamp-based conflict resolution AND delete-wins logic
        // SYNC FIX: Pass ALL data (including deleted) to merge functions
        console.log('🔄 Merging data with timestamp comparison and delete-wins logic...')
        const meetingsMerge = mergeByIdWithTracking(localMeetings, cloudMeetings)
        const stakeholdersMerge = mergeByIdWithTracking(localStakeholders, cloudStakeholders)
        const categoriesMerge = mergeByIdWithTracking(localCategories, cloudCategories)

        // Count active (non-deleted) items in merged results
        const activeMergedMeetings = meetingsMerge.merged.filter(m => !m.deleted).length
        const activeMergedStakeholders = stakeholdersMerge.merged.filter(s => !s.deleted).length
        const activeMergedCategories = categoriesMerge.merged.filter(c => !c.deleted).length

        console.log('🔄 Merge results:', {
          meetings: { total: meetingsMerge.merged.length, active: activeMergedMeetings, toUpload: meetingsMerge.toUpload.length, toDownload: meetingsMerge.toDownload.length },
          stakeholders: { total: stakeholdersMerge.merged.length, active: activeMergedStakeholders, toUpload: stakeholdersMerge.toUpload.length, toDownload: stakeholdersMerge.toDownload.length },
          categories: { total: categoriesMerge.merged.length, active: activeMergedCategories, toUpload: categoriesMerge.toUpload.length, toDownload: categoriesMerge.toDownload.length }
        })

        // Safety checks - compare total counts (including deleted)
        if (meetingsMerge.merged.length < localMeetings.length && meetingsMerge.merged.length < cloudMeetings.length) {
          console.error('🚨 MERGE ERROR: Would lose meetings data!')
        }
        if (stakeholdersMerge.merged.length < localStakeholders.length && stakeholdersMerge.merged.length < cloudStakeholders.length) {
          console.error('🚨 MERGE ERROR: Would lose stakeholders data!')
        }
        if (categoriesMerge.merged.length < localCategories.length && categoriesMerge.merged.length < cloudCategories.length) {
          console.error('🚨 MERGE ERROR: Would lose categories data!')
        }

        // Upload local changes to Firestore
        let uploadedCount = 0
        const uploadErrors = []

        console.log('🔄 Uploading newer local meetings (with text blobs, no binary)...')
        for (const meeting of meetingsMerge.toUpload) {
          try {
            // Use stripBinaryOnly to preserve text blobs but remove audio data
            const result = await firestoreService.saveMeeting(stripBinaryOnly(meeting))
            if (result.success) uploadedCount++
            else uploadErrors.push(`Meeting ${meeting.id}: ${result.reason}`)
          } catch (e) {
            uploadErrors.push(`Meeting ${meeting.id}: ${e.message}`)
          }
        }

        console.log('🔄 Uploading newer local stakeholders...')
        for (const stakeholder of stakeholdersMerge.toUpload) {
          try {
            const result = await firestoreService.saveStakeholder(stakeholder)
            if (result.success) uploadedCount++
            else uploadErrors.push(`Stakeholder ${stakeholder.id}: ${result.reason}`)
          } catch (e) {
            uploadErrors.push(`Stakeholder ${stakeholder.id}: ${e.message}`)
          }
        }

        console.log('🔄 Uploading newer local categories...')
        for (const category of categoriesMerge.toUpload) {
          try {
            const result = await firestoreService.saveStakeholderCategory(category)
            if (result.success) uploadedCount++
            else uploadErrors.push(`Category ${category.id}: ${result.reason}`)
          } catch (e) {
            uploadErrors.push(`Category ${category.id}: ${e.message}`)
          }
        }

        console.log('🔄 Upload complete:', { uploadedCount, errors: uploadErrors.length })

        // Strip large fields before saving locally
        console.log('🔄 Stripping large fields...')
        const strippedMeetings = meetingsMerge.merged.map(m => {
          try {
            return stripLargeFields(m)
          } catch (e) {
            console.error('Error stripping meeting:', m?.id, e)
            return m
          }
        })

        // Save merged data
        console.log('🔄 Saving data...')
        const meetingsJson = JSON.stringify(strippedMeetings)
        const stakeholdersJson = JSON.stringify(stakeholdersMerge.merged)
        const categoriesJson = JSON.stringify(categoriesMerge.merged)

        try {
          // ============================================
          // DEXIE: PRIMARY STORAGE (most reliable on iOS)
          // Save FULL meetings with blob data (not stripped)
          // ============================================
          console.log('🔄 Saving to Dexie (primary) with FULL meeting data...')
          try {
            await db.open()
            // CRITICAL: Save FULL meetings to Dexie, not stripped ones
            // This ensures blob data (aiResult, digitalNotes, transcript) is preserved
            const dexieSaveResult = await bulkSaveMeetings(meetingsMerge.merged, { queueSync: false })
            const dexieStakeholderResult = await bulkSaveStakeholders(stakeholdersMerge.merged, { queueSync: false })
            const dexieCategoryResult = await bulkSaveCategories(categoriesMerge.merged, { queueSync: false })
            console.log('✅ Saved to Dexie (FULL data):', {
              meetings: dexieSaveResult.saved,
              stakeholders: dexieStakeholderResult.saved,
              categories: dexieCategoryResult.saved
            })
          } catch (dexieError) {
            console.error('❌ Dexie save failed:', dexieError)
            throw new Error(`Dexie save failed: ${dexieError.message}`)
          }

          // PHASE 3: localforage and localStorage removed - Dexie is the only local storage
          console.log('✅ All data saved to Dexie!')
        } catch (storageError) {
          console.error('🔄 Storage error:', storageError)
          throw new Error(`Failed to save data: ${storageError.message}`)
        }

        // Reload data into React state
        console.log('🔄 Reloading data into React state...')
        loadData()

        // PHASE 4: No tombstone management needed - soft delete uses deleted field in Dexie/Firestore

        // Build result message
        const downloaded = meetingsMerge.toDownload.length + stakeholdersMerge.toDownload.length + categoriesMerge.toDownload.length
        const uploaded = uploadedCount

        console.log('✅ Full sync complete')

        return {
          success: true,
          message: `Synced! ↓${downloaded} downloaded, ↑${uploaded} uploaded. Total: ${meetingsMerge.merged.length} meetings, ${stakeholdersMerge.merged.length} stakeholders, ${categoriesMerge.merged.length} categories.`,
          stats: {
            meetings: meetingsMerge.merged.length,
            stakeholders: stakeholdersMerge.merged.length,
            categories: categoriesMerge.merged.length,
            downloaded,
            uploaded
          }
        }
      } catch (error) {
        console.error('❌ Full sync failed:', error)
        return {
          success: false,
          message: `Sync failed: ${error.message}`
        }
      } finally {
        releaseSyncLock()
      }
    },

    // n8n integration actions
    syncStakeholdersFromN8n,

    syncFromN8n: async () => {
      try {
        dispatch({ type: 'SET_N8N_SYNCING', payload: true })
        const syncResult = await n8nService.syncFromN8n()

        const mergedStakeholders = mergeN8nStakeholders(
          state.stakeholders,
          syncResult.stakeholders
        )

        const mergedCategories = mergeN8nCategories(
          state.stakeholderCategories,
          syncResult.categories
        )

        dispatch({
          type: 'SYNC_N8N_DATA',
          payload: {
            stakeholders: mergedStakeholders,
            categories: mergedCategories,
            syncResult
          }
        })

        return syncResult
      } catch (error) {
        dispatch({ type: 'SET_N8N_ERROR', payload: error.message })
        throw error
      }
    },
    exportMeetingToN8n,
    testN8nConnection: async () => {
      try {
        return await n8nService.testConnection()
      } catch (error) {
        dispatch({ type: 'SET_N8N_ERROR', payload: error.message })
        throw error
      }
    }
  }

  return (
    <AppContext.Provider value={{ ...state, ...actions }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const context = useContext(AppContext)
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider')
  }
  return context
}
