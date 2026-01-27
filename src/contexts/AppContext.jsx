import { createContext, useContext, useReducer, useEffect, useRef, useCallback } from 'react'
import localforage from 'localforage'
import { v4 as uuidv4 } from 'uuid'

// Lazy-loaded IndexedDB instance - only created when needed to avoid iOS crashes
let syncStorageInstance = null
async function getSyncStorage() {
  if (!syncStorageInstance) {
    syncStorageInstance = localforage.createInstance({
      name: 'MeetingFlowSync',
      storeName: 'sync_data'
    })
  }
  return syncStorageInstance
}

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
// SYNC HELPER FUNCTIONS
// ============================================

// Helper to strip large fields from meetings to save storage space
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
      // Exists in both - compare timestamps
      const localTime = getTimestamp(localItem)
      const cloudTime = getTimestamp(cloudItem)

      if (localTime > cloudTime) {
        // Local is newer - use local and upload it
        merged.set(id, localItem)
        toUpload.push(localItem)
      } else if (cloudTime > localTime) {
        // Cloud is newer - use cloud
        merged.set(id, cloudItem)
        toDownload.push(cloudItem)
      } else {
        // Same time - keep local (arbitrary choice)
        merged.set(id, localItem)
      }
    }
  }

  // Process cloud items not in local
  for (const [id, cloudItem] of cloudMap) {
    if (!localMap.has(id)) {
      // Only in cloud - needs to be downloaded
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
  deletedItems: [], // Tombstone records for deleted items to prevent resurrection
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
      console.log('🔍 LOAD_DATA REDUCER: Processing data load...')
      console.log('🔍 LOAD_DATA REDUCER: Payload:', {
        meetings: action.payload.meetings?.length || 0,
        stakeholders: action.payload.stakeholders?.length || 0,
        stakeholderCategories: action.payload.stakeholderCategories?.length || 0,
        deletedItems: action.payload.deletedItems?.length || 0
      })

      const loadedState = {
        ...state,
        meetings: action.payload.meetings || [],
        stakeholders: action.payload.stakeholders || [],
        stakeholderCategories: action.payload.stakeholderCategories || [],
        deletedItems: action.payload.deletedItems || [],
        isLoading: false
      }

      console.log('🔍 LOAD_DATA REDUCER: New state:', {
        meetings: loadedState.meetings?.length || 0,
        stakeholders: loadedState.stakeholders?.length || 0,
        stakeholderCategories: loadedState.stakeholderCategories?.length || 0
      })

      return loadedState

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
      const deletedMeeting = state.meetings.find(meeting => meeting.id === action.payload)
      return {
        ...state,
        meetings: state.meetings.filter(meeting => meeting.id !== action.payload),
        deletedItems: [
          ...state.deletedItems,
          {
            type: 'meeting',
            id: action.payload,
            deletedAt: new Date().toISOString(),
            deletedBy: `device_${navigator.userAgent.slice(0, 50)}`, // Basic device identification
            originalItem: deletedMeeting ? {
              title: deletedMeeting.title,
              date: deletedMeeting.date
            } : null
          }
        ],
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
      const deletedStakeholder = state.stakeholders.find(stakeholder => stakeholder.id === action.payload)
      return {
        ...state,
        stakeholders: state.stakeholders.filter(stakeholder => stakeholder.id !== action.payload),
        deletedItems: [
          ...state.deletedItems,
          {
            type: 'stakeholder',
            id: action.payload,
            deletedAt: new Date().toISOString(),
            deletedBy: `device_${navigator.userAgent.slice(0, 50)}`,
            originalItem: deletedStakeholder ? {
              name: deletedStakeholder.name,
              role: deletedStakeholder.role
            } : null
          }
        ]
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
      const categoryToDelete = action.payload
      const deletedCategory = state.stakeholderCategories.find(category =>
        category.key === categoryToDelete || category.id === categoryToDelete || category.name === categoryToDelete
      )
      // Also update any stakeholders using this category to remove the category reference
      const updatedStakeholders = state.stakeholders.map(stakeholder => {
        // Check if stakeholder references this category by any identifier
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
        stakeholders: updatedStakeholders,
        deletedItems: [
          ...state.deletedItems,
          {
            type: 'stakeholderCategory',
            // Store ALL possible identifiers for robust deletion matching
            id: deletedCategory?.id || categoryToDelete,
            key: deletedCategory?.key || null,
            name: deletedCategory?.name || deletedCategory?.label || null,
            deletedAt: new Date().toISOString(),
            deletedBy: `device_${navigator.userAgent.slice(0, 50)}`,
            originalItem: deletedCategory ? {
              id: deletedCategory.id,
              name: deletedCategory.name || deletedCategory.label,
              key: deletedCategory.key
            } : null
          }
        ]
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

  useEffect(() => {
    console.log('🚀 AppContext: Initial mount, checking localStorage before load:', {
      hasData: localStorage?.getItem('meetingflow_meetings') !== null,
      meetingsCount: JSON.parse(localStorage?.getItem('meetingflow_meetings') || '[]').length,
      stakeholdersCount: JSON.parse(localStorage?.getItem('meetingflow_stakeholders') || '[]').length
    })
    loadData()
  }, [])


  // Save immediately when data changes (no debouncing to avoid issues)
  // CRITICAL: Wrapped in try-catch to prevent crashes from QuotaExceededError
  useEffect(() => {
    console.log('🔥 SAVE EFFECT: Triggered', {
      isLoading: state.isLoading,
      meetingsLength: state.meetings.length,
      shouldSave: !state.isLoading
    })

    if (!state.isLoading) {
      console.log('💾 AppContext: SYNCHRONOUS save triggered')
      console.log('💾 AppContext: Saving meetings count:', state.meetings.length)

      try {
        // Calculate approximate data size before saving
        const meetingsJson = JSON.stringify(state.meetings)
        const stakeholdersJson = JSON.stringify(state.stakeholders)
        const categoriesJson = JSON.stringify(state.stakeholderCategories)
        const deletedJson = JSON.stringify(state.deletedItems)

        const totalSize = meetingsJson.length + stakeholdersJson.length + categoriesJson.length + deletedJson.length
        console.log('💾 AppContext: Total data size:', Math.round(totalSize / 1024), 'KB')

        // Warn if data is getting large (approaching 5MB localStorage limit)
        if (totalSize > 3 * 1024 * 1024) {
          console.warn('⚠️ AppContext: Data size exceeds 3MB, approaching localStorage limit!')
        }

        // Save to localStorage
        localStorage.setItem('meetingflow_meetings', meetingsJson)
        localStorage.setItem('meetingflow_stakeholders', stakeholdersJson)
        localStorage.setItem('meetingflow_stakeholder_categories', categoriesJson)
        localStorage.setItem('meetingflow_deleted_items', deletedJson)

        console.log('✅ AppContext: Save effect completed successfully')
      } catch (saveError) {
        // CRITICAL: Catch QuotaExceededError and other storage errors
        // This prevents the app from crashing when localStorage is full
        console.error('❌ AppContext: Save effect FAILED:', saveError.name, saveError.message)

        if (saveError.name === 'QuotaExceededError' || saveError.message?.includes('quota')) {
          console.error('❌ AppContext: localStorage quota exceeded! Data may not be persisted.')
          console.error('❌ AppContext: Consider deleting old meetings to free up space.')
          // Dispatch an error event that UI can listen to
          window.dispatchEvent(new CustomEvent('meetingflow-storage-error', {
            detail: {
              type: 'quota_exceeded',
              message: 'Storage is full. Some data may not be saved. Please delete old meetings.',
              size: Math.round((JSON.stringify(state.meetings).length) / 1024)
            }
          }))
        }
        // Don't re-throw - we don't want to crash the app
      }

      // NOTE: Firestore sync is handled via real-time subscriptions
      // We do NOT re-save to Firestore here to avoid infinite loops
    }
  }, [state.meetings, state.stakeholders, state.stakeholderCategories, state.deletedItems, state.isLoading])

  // Listen for n8n data updates
  useEffect(() => {
    const handleN8nDataUpdate = (event) => {
      console.log('📊 AppContext received n8nDataUpdated event:', event.detail)

      if (event.detail && (event.detail.categories || event.detail.stakeholders)) {
        const mergedStakeholders = event.detail.stakeholders || []
        const mergedCategories = event.detail.categories || []

        console.log('📊 Updating AppContext with n8n data:', {
          stakeholders: mergedStakeholders.length,
          categories: mergedCategories.length
        })

        dispatch({
          type: 'SYNC_N8N_DATA',
          payload: {
            stakeholders: mergedStakeholders,
            categories: mergedCategories,
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

  const loadData = useCallback(() => {
    // Prevent concurrent loads
    if (isLoadingRef.current) {
      console.log('📂 LOAD: Already loading, skipping concurrent call')
      return
    }

    try {
      isLoadingRef.current = true
      dispatch({ type: 'SET_LOADING', payload: true })

      console.log('📂 LOAD: Starting data load from localStorage...')

      // Check storage quota on load
      const lsUsage = getLocalStorageUsage()
      console.log('📦 LocalStorage usage:', lsUsage.mb, 'MB')

      // Async check for overall storage
      checkStorageQuota().then(quota => {
        if (quota) {
          console.log('📦 Storage quota:', quota)
          if (quota.isCritical) {
            console.error('🚨 CRITICAL: Storage space is very low! Please delete old meetings.')
            window.dispatchEvent(new CustomEvent('meetingflow-storage-warning', {
              detail: { type: 'critical', ...quota }
            }))
          } else if (quota.isLow) {
            console.warn('⚠️ Storage space is running low.')
            window.dispatchEvent(new CustomEvent('meetingflow-storage-warning', {
              detail: { type: 'low', ...quota }
            }))
          }
        }
      })

      console.log('🔍 DEBUG: localStorage before load:', {
        hasLocalStorage: typeof localStorage !== 'undefined',
        localStorageLength: localStorage?.length,
        keys: localStorage ? Object.keys(localStorage).filter(k => k.startsWith('meetingflow_')) : [],
        meetingsRaw: localStorage?.getItem('meetingflow_meetings')?.substring(0, 100) + '...'
      })

      // Load from localStorage ONLY (synchronous, reliable)
      let meetings, localStakeholders, localCategories, deletedItems

      try {
        // Load from localStorage first (synchronous and immediate)
        meetings = JSON.parse(localStorage.getItem('meetingflow_meetings') || '[]')
        localStakeholders = JSON.parse(localStorage.getItem('meetingflow_stakeholders') || '[]')
        localCategories = JSON.parse(localStorage.getItem('meetingflow_stakeholder_categories') || '[]')
        deletedItems = JSON.parse(localStorage.getItem('meetingflow_deleted_items') || '[]')

        console.log('🔍 DEBUG: Initial load from localStorage:', {
          meetings: meetings.length,
          stakeholders: localStakeholders.length,
          categories: localCategories.length
        })

        // ALWAYS check IndexedDB for more complete data (iOS sync saves there when localStorage quota is full)
        // This fixes the issue where manual sync downloads 28 meetings but only 2 show (from localStorage)
        console.log('📂 LOAD: Checking IndexedDB for synced data...')
        // Use async IIFE to load from IndexedDB - lazy init to avoid iOS crashes
        ;(async () => {
          try {
            const syncStorage = await getSyncStorage()
            const idbMeetings = await syncStorage.getItem('meetings')
            const idbStakeholders = await syncStorage.getItem('stakeholders')
            const idbCategories = await syncStorage.getItem('categories')

            console.log('📂 LOAD: IndexedDB data:', {
              meetings: idbMeetings?.length || 0,
              stakeholders: idbStakeholders?.length || 0,
              categories: idbCategories?.length || 0
            })

            // Use IndexedDB data if it has MORE items than localStorage
            // This handles the case where localStorage save failed due to quota but IndexedDB succeeded
            const idbHasMoreData = (idbMeetings?.length || 0) > meetings.length ||
                                   (idbStakeholders?.length || 0) > localStakeholders.length ||
                                   (idbCategories?.length || 0) > localCategories.length

            if (idbMeetings && idbHasMoreData) {
              console.log('📂 LOAD: IndexedDB has more data than localStorage, using IndexedDB!', {
                localStorage: { meetings: meetings.length, stakeholders: localStakeholders.length, categories: localCategories.length },
                indexedDB: { meetings: idbMeetings?.length || 0, stakeholders: idbStakeholders?.length || 0, categories: idbCategories?.length || 0 }
              })
              dispatch({
                type: 'LOAD_DATA',
                payload: {
                  meetings: deduplicateMeetings(idbMeetings || []),
                  stakeholders: idbStakeholders || localStakeholders || [],
                  stakeholderCategories: idbCategories || localCategories || [],
                  deletedItems: deletedItems || []
                }
              })
              dispatch({ type: 'SET_LOADING', payload: false })
            }
          } catch (idbError) {
            console.warn('📂 LOAD: IndexedDB check failed:', idbError)
          }
        })()

        console.log('📂 LOAD: Loaded from localStorage - meetings:', meetings.length)

      } catch (error) {
        console.error('❌ localStorage failed, using defaults:', error)
        console.error('❌ Error stack:', error.stack)
        meetings = []
        localStakeholders = []
        localCategories = []
        deletedItems = []
      }

      console.log('📂 LOAD: After localStorage section, about to process meetings...')

      // Deduplicate meetings before loading
      console.log('📂 LOAD: Raw meetings from storage:', meetings?.length || 0)
      const deduplicatedMeetings = deduplicateMeetings(meetings || [])
      console.log('📂 LOAD: Deduplicated meetings:', deduplicatedMeetings.length)

      // Load local data immediately
      console.log('🔍 DISPATCH: About to dispatch LOAD_DATA with:', {
        meetings: deduplicatedMeetings?.length || 0,
        stakeholders: localStakeholders?.length || 0,
        stakeholderCategories: localCategories?.length || 0,
        deletedItems: deletedItems?.length || 0
      })

      dispatch({
        type: 'LOAD_DATA',
        payload: {
          meetings: deduplicatedMeetings,
          stakeholders: localStakeholders || [],
          stakeholderCategories: localCategories || [],
          deletedItems: deletedItems || []
        }
      })

      // Skip n8n cache for now to avoid interference with core functionality
      console.log('🔄 LOAD: Skipping n8n cache to focus on core persistence')
    } catch (error) {
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

        // Subscribe to meetings - MERGE with local, don't replace
        const unsubMeetings = firestoreService.subscribeMeetings((firestoreMeetings) => {
          try {
            console.log('🔥 Firestore: Received', firestoreMeetings.length, 'meetings from cloud')

            // Get current local meetings
            const localMeetings = JSON.parse(localStorage.getItem('meetingflow_meetings') || '[]')
            console.log('🔥 Firestore: Local meetings count:', localMeetings.length)

            // MERGE: Combine local and Firestore data, keeping newer versions
            const mergedMeetings = mergeMeetingsData(localMeetings, firestoreMeetings)
            console.log('🔥 Firestore: Merged meetings count:', mergedMeetings.length)

            // Only update if we have data (never overwrite with empty)
            if (mergedMeetings.length > 0) {
              dispatch({ type: 'SET_MEETINGS', payload: mergedMeetings })
              localStorage.setItem('meetingflow_meetings', JSON.stringify(mergedMeetings))
            }
          } catch (callbackErr) {
            console.error('🔥 Firestore: Error processing meetings callback:', callbackErr)
          }
        })

        // Subscribe to stakeholders - MERGE with local
        const unsubStakeholders = firestoreService.subscribeStakeholders((firestoreStakeholders) => {
          try {
            console.log('🔥 Firestore: Received', firestoreStakeholders.length, 'stakeholders from cloud')

            const localStakeholders = JSON.parse(localStorage.getItem('meetingflow_stakeholders') || '[]')
            const mergedStakeholders = mergeByIdKeepNewer(localStakeholders, firestoreStakeholders)

            if (mergedStakeholders.length > 0) {
              dispatch({ type: 'SET_STAKEHOLDERS', payload: mergedStakeholders })
              localStorage.setItem('meetingflow_stakeholders', JSON.stringify(mergedStakeholders))
            }
          } catch (callbackErr) {
            console.error('🔥 Firestore: Error processing stakeholders callback:', callbackErr)
          }
        })

        // Subscribe to categories - MERGE with local
        const unsubCategories = firestoreService.subscribeStakeholderCategories((firestoreCategories) => {
          try {
            console.log('🔥 Firestore: Received', firestoreCategories.length, 'categories from cloud')

            const localCategories = JSON.parse(localStorage.getItem('meetingflow_stakeholder_categories') || '[]')
            const mergedCategories = mergeByIdKeepNewer(localCategories, firestoreCategories)

            if (mergedCategories.length > 0) {
              dispatch({ type: 'SET_STAKEHOLDER_CATEGORIES', payload: mergedCategories })
              localStorage.setItem('meetingflow_stakeholder_categories', JSON.stringify(mergedCategories))
            }
          } catch (callbackErr) {
            console.error('🔥 Firestore: Error processing categories callback:', callbackErr)
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
  function mergeMeetingsData(localMeetings, cloudMeetings) {
    const merged = new Map()

    // Add all local meetings first
    localMeetings.forEach(meeting => {
      if (meeting.id) {
        merged.set(meeting.id, meeting)
      }
    })

    // Merge cloud meetings, keeping newer version
    cloudMeetings.forEach(cloudMeeting => {
      if (!cloudMeeting.id) return

      const existing = merged.get(cloudMeeting.id)
      if (!existing) {
        merged.set(cloudMeeting.id, cloudMeeting)
      } else {
        // Keep the one with newer updatedAt
        const existingTime = new Date(existing.updatedAt || existing.createdAt || 0).getTime()
        const cloudTime = new Date(cloudMeeting.updatedAt || cloudMeeting.createdAt || 0).getTime()
        if (cloudTime > existingTime) {
          merged.set(cloudMeeting.id, cloudMeeting)
        }
      }
    })

    return Array.from(merged.values())
  }

  // Helper: Generic merge by ID, keeping newer versions
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
        const existingTime = new Date(existing.updatedAt || existing.createdAt || existing.lastModified || 0).getTime()
        const cloudTime = new Date(cloudItem.updatedAt || cloudItem.createdAt || cloudItem.lastModified || 0).getTime()
        if (cloudTime > existingTime) {
          merged.set(cloudItem.id, cloudItem)
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

      // Track if localStorage save succeeded
      let localStorageSaveSuccess = false
      let localStorageError = null

      // 1. First dispatch to update React state
      dispatch({ type: 'ADD_MEETING', payload: meetingWithId })

      // 2. Immediately save to localStorage (sync, guaranteed)
      try {
        const currentMeetings = JSON.parse(localStorage.getItem('meetingflow_meetings') || '[]')
        // Add to front, avoid duplicates
        const updatedMeetings = [meetingWithId, ...currentMeetings.filter(m => m.id !== meetingWithId.id)]

        // Check size before saving
        const dataSize = JSON.stringify(updatedMeetings).length
        console.log('📝 AppContext: Meeting data size:', Math.round(dataSize / 1024), 'KB')

        localStorage.setItem('meetingflow_meetings', JSON.stringify(updatedMeetings))
        console.log('✅ AppContext: Meeting saved to localStorage:', meetingWithId.id)
        localStorageSaveSuccess = true
      } catch (localErr) {
        console.error('❌ AppContext: Failed to save to localStorage:', localErr.name, localErr.message)
        localStorageError = localErr

        // Check if it's a quota error
        if (localErr.name === 'QuotaExceededError' || localErr.message?.includes('quota')) {
          console.error('❌ AppContext: localStorage QUOTA EXCEEDED - meeting may not persist!')
          // Dispatch error event for UI
          window.dispatchEvent(new CustomEvent('meetingflow-storage-error', {
            detail: {
              type: 'quota_exceeded',
              message: 'Storage is full. Please delete old meetings to save new ones.',
              meetingId: meetingWithId.id
            }
          }))
          // Return failure so UI can show error
          return {
            success: false,
            error: 'Storage quota exceeded. Please delete old meetings to free up space.',
            meeting: meetingWithId
          }
        }
      }

      // 3. Save to Firestore for cloud sync (await to ensure it completes)
      if (ENABLE_FIRESTORE) {
        try {
          const firestoreService = await getFirestoreService()
          if (firestoreService) {
            await firestoreService.saveMeeting(meetingWithId)
            console.log('✅ AppContext: Meeting saved to Firestore:', meetingWithId.id)
          }
          return { success: true, meeting: meetingWithId, localStorageSaved: localStorageSaveSuccess }
        } catch (err) {
          console.error('❌ AppContext: Failed to save to Firestore:', meetingWithId.id, err.message)
          // Return success only if localStorage worked
          return {
            success: localStorageSaveSuccess,
            meeting: meetingWithId,
            firestoreError: err.message,
            localStorageError: localStorageError?.message
          }
        }
      }

      return { success: localStorageSaveSuccess, meeting: meetingWithId, localStorageError: localStorageError?.message }
    },

    updateMeeting: async (meeting) => {
      console.log('📝 AppContext: Updating meeting with ID:', meeting.id)

      const updatedMeeting = {
        ...meeting,
        updatedAt: new Date().toISOString()
      }

      // Track if localStorage save succeeded
      let localStorageSaveSuccess = false
      let localStorageError = null

      // 1. Dispatch to update React state
      dispatch({ type: 'UPDATE_MEETING', payload: updatedMeeting })

      // 2. Immediately save to localStorage
      try {
        const currentMeetings = JSON.parse(localStorage.getItem('meetingflow_meetings') || '[]')
        const updatedMeetings = currentMeetings.map(m =>
          m.id === updatedMeeting.id ? updatedMeeting : m
        )

        // Check size before saving
        const dataSize = JSON.stringify(updatedMeetings).length
        console.log('📝 AppContext: Updated meeting data size:', Math.round(dataSize / 1024), 'KB')

        localStorage.setItem('meetingflow_meetings', JSON.stringify(updatedMeetings))
        console.log('✅ AppContext: Meeting updated in localStorage:', updatedMeeting.id)
        localStorageSaveSuccess = true
      } catch (localErr) {
        console.error('❌ AppContext: Failed to update localStorage:', localErr.name, localErr.message)
        localStorageError = localErr

        // Check if it's a quota error
        if (localErr.name === 'QuotaExceededError' || localErr.message?.includes('quota')) {
          console.error('❌ AppContext: localStorage QUOTA EXCEEDED on update!')
          window.dispatchEvent(new CustomEvent('meetingflow-storage-error', {
            detail: {
              type: 'quota_exceeded',
              message: 'Storage is full. Please delete old meetings to save changes.',
              meetingId: updatedMeeting.id
            }
          }))
          return {
            success: false,
            error: 'Storage quota exceeded. Please delete old meetings to free up space.',
            meeting: updatedMeeting
          }
        }
      }

      // 3. Save to Firestore for cloud sync
      if (ENABLE_FIRESTORE) {
        try {
          const firestoreService = await getFirestoreService()
          if (firestoreService) {
            await firestoreService.saveMeeting(updatedMeeting)
            console.log('✅ AppContext: Meeting updated in Firestore:', updatedMeeting.id)
          }
          return { success: true, meeting: updatedMeeting, localStorageSaved: localStorageSaveSuccess }
        } catch (err) {
          console.error('❌ AppContext: Failed to update Firestore:', updatedMeeting.id, err.message)
          return {
            success: localStorageSaveSuccess,
            meeting: updatedMeeting,
            firestoreError: err.message,
            localStorageError: localStorageError?.message
          }
        }
      }

      return { success: localStorageSaveSuccess, meeting: updatedMeeting, localStorageError: localStorageError?.message }
    },
    deleteMeeting: async (meetingId) => {
      dispatch({ type: 'DELETE_MEETING', payload: meetingId })
      // Also delete from Firestore
      if (ENABLE_FIRESTORE) {
        try {
          const firestoreService = await getFirestoreService()
          if (firestoreService) {
            await firestoreService.deleteMeeting(meetingId)
          }
        } catch (err) {
          console.warn('🔥 Firestore: Failed to delete meeting:', meetingId, err.message)
        }
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
      dispatch({ type: 'DELETE_STAKEHOLDER', payload: stakeholderId })
      // Also delete from Firestore
      if (ENABLE_FIRESTORE) {
        try {
          const firestoreService = await getFirestoreService()
          if (firestoreService) {
            await firestoreService.deleteStakeholder(stakeholderId)
          }
        } catch (err) {
          console.warn('🔥 Firestore: Failed to delete stakeholder:', stakeholderId, err.message)
        }
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
      dispatch({ type: 'DELETE_STAKEHOLDER_CATEGORY', payload: categoryKey })
      // Also delete from Firestore
      if (ENABLE_FIRESTORE) {
        try {
          const firestoreService = await getFirestoreService()
          if (firestoreService) {
            await firestoreService.deleteStakeholderCategory(categoryKey)
          }
        } catch (err) {
          console.warn('🔥 Firestore: Failed to delete category:', categoryKey, err.message)
        }
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

        // Read local data
        console.log('🔄 Reading local data...')
        let localMeetings = []
        let localStakeholders = []
        let localCategories = []
        let localDeletedItems = []

        try {
          localMeetings = JSON.parse(localStorage.getItem('meetingflow_meetings') || '[]')
          localStakeholders = JSON.parse(localStorage.getItem('meetingflow_stakeholders') || '[]')
          localCategories = JSON.parse(localStorage.getItem('meetingflow_stakeholder_categories') || '[]')
          localDeletedItems = JSON.parse(localStorage.getItem('meetingflow_deleted_items') || '[]')
        } catch (e) {
          console.warn('🔄 Failed to read from localStorage:', e)
        }

        console.log('🔄 Local data:', {
          meetings: localMeetings.length,
          stakeholders: localStakeholders.length,
          categories: localCategories.length,
          deletedItems: localDeletedItems.length
        })

        // Sync deletions to Firestore
        const syncedDeletions = []
        const failedDeletions = []

        if (localDeletedItems.length > 0) {
          console.log('🔄 Syncing', localDeletedItems.length, 'deletions to Firestore...')
          for (const deletion of localDeletedItems) {
            try {
              let result = { success: false }
              if (deletion.type === 'meeting' && deletion.id) {
                result = await firestoreService.deleteMeeting(deletion.id)
                if (result.success) {
                  console.log('🔄 Synced deletion of meeting:', deletion.id)
                  syncedDeletions.push(deletion)
                } else {
                  throw new Error(result.reason || 'Unknown error')
                }
              } else if (deletion.type === 'stakeholder' && deletion.id) {
                result = await firestoreService.deleteStakeholder(deletion.id)
                if (result.success) {
                  console.log('🔄 Synced deletion of stakeholder:', deletion.id)
                  syncedDeletions.push(deletion)
                } else {
                  throw new Error(result.reason || 'Unknown error')
                }
              } else if (deletion.type === 'stakeholderCategory' && deletion.id) {
                result = await firestoreService.deleteStakeholderCategory(deletion.id)
                if (result.success) {
                  console.log('🔄 Synced deletion of category:', deletion.id)
                  syncedDeletions.push(deletion)
                } else {
                  throw new Error(result.reason || 'Unknown error')
                }
              } else {
                // Invalid deletion record, mark as synced to remove it
                syncedDeletions.push(deletion)
              }
            } catch (e) {
              console.warn('🔄 Failed to sync deletion:', deletion, e.message)
              failedDeletions.push(deletion)
            }
          }

          // Only keep failed deletions in localStorage
          if (failedDeletions.length > 0) {
            localStorage.setItem('meetingflow_deleted_items', JSON.stringify(failedDeletions))
          } else {
            localStorage.setItem('meetingflow_deleted_items', '[]')
          }
          console.log('🔄 Deletion sync complete:', syncedDeletions.length, 'synced,', failedDeletions.length, 'failed')
        }

        // Fetch deleted IDs from Firestore to remove from local data
        console.log('🔄 Fetching deleted item IDs from Firestore...')
        let deletedMeetingIds = []
        let deletedStakeholderIds = []
        let deletedCategoryIds = []

        try {
          deletedMeetingIds = await firestoreService.getDeletedIds('meetings')
          deletedStakeholderIds = await firestoreService.getDeletedIds('stakeholders')
          deletedCategoryIds = await firestoreService.getDeletedIds('stakeholderCategories')
          console.log('🔄 Deleted IDs from Firestore:', {
            meetings: deletedMeetingIds.length,
            stakeholders: deletedStakeholderIds.length,
            categories: deletedCategoryIds.length
          })
        } catch (e) {
          console.warn('🔄 Failed to fetch deleted IDs:', e.message)
        }

        // Filter out items that were deleted on other devices
        const deletedMeetingSet = new Set(deletedMeetingIds)
        const deletedStakeholderSet = new Set(deletedStakeholderIds)
        const deletedCategorySet = new Set(deletedCategoryIds)

        const filteredLocalMeetings = localMeetings.filter(m => !deletedMeetingSet.has(m.id))
        const filteredLocalStakeholders = localStakeholders.filter(s => !deletedStakeholderSet.has(s.id))
        const filteredLocalCategories = localCategories.filter(c => !deletedCategorySet.has(c.id))

        console.log('🔄 After filtering deleted items:', {
          meetings: `${localMeetings.length} -> ${filteredLocalMeetings.length}`,
          stakeholders: `${localStakeholders.length} -> ${filteredLocalStakeholders.length}`,
          categories: `${localCategories.length} -> ${filteredLocalCategories.length}`
        })

        // Merge with timestamp-based conflict resolution
        console.log('🔄 Merging data with timestamp comparison...')
        const meetingsMerge = mergeByIdWithTracking(filteredLocalMeetings, cloudMeetings)
        const stakeholdersMerge = mergeByIdWithTracking(filteredLocalStakeholders, cloudStakeholders)
        const categoriesMerge = mergeByIdWithTracking(filteredLocalCategories, cloudCategories)

        console.log('🔄 Merge results:', {
          meetings: { total: meetingsMerge.merged.length, toUpload: meetingsMerge.toUpload.length, toDownload: meetingsMerge.toDownload.length },
          stakeholders: { total: stakeholdersMerge.merged.length, toUpload: stakeholdersMerge.toUpload.length, toDownload: stakeholdersMerge.toDownload.length },
          categories: { total: categoriesMerge.merged.length, toUpload: categoriesMerge.toUpload.length, toDownload: categoriesMerge.toDownload.length }
        })

        // Safety checks
        if (meetingsMerge.merged.length < filteredLocalMeetings.length && meetingsMerge.merged.length < cloudMeetings.length) {
          console.error('🚨 MERGE ERROR: Would lose meetings data!')
        }
        if (stakeholdersMerge.merged.length < filteredLocalStakeholders.length && stakeholdersMerge.merged.length < cloudStakeholders.length) {
          console.error('🚨 MERGE ERROR: Would lose stakeholders data!')
        }
        if (categoriesMerge.merged.length < filteredLocalCategories.length && categoriesMerge.merged.length < cloudCategories.length) {
          console.error('🚨 MERGE ERROR: Would lose categories data!')
        }

        // Upload local changes to Firestore
        let uploadedCount = 0
        const uploadErrors = []

        console.log('🔄 Uploading newer local meetings...')
        for (const meeting of meetingsMerge.toUpload) {
          try {
            const result = await firestoreService.saveMeeting(meeting)
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
          // Save to IndexedDB
          console.log('🔄 Saving to IndexedDB...')
          const syncStorage = await getSyncStorage()
          await syncStorage.setItem('meetings', strippedMeetings)
          await syncStorage.setItem('stakeholders', stakeholdersMerge.merged)
          await syncStorage.setItem('categories', categoriesMerge.merged)

          // Also save to localStorage for AppContext compatibility
          console.log('🔄 Saving to localStorage...')
          try {
            localStorage.setItem('meetingflow_meetings', meetingsJson)
            localStorage.setItem('meetingflow_stakeholders', stakeholdersJson)
            localStorage.setItem('meetingflow_stakeholder_categories', categoriesJson)
            console.log('🔄 Saved to localStorage!')
          } catch (lsError) {
            console.warn('🔄 localStorage save failed (quota), but IndexedDB has the data:', lsError.message)
          }

          console.log('🔄 All data saved successfully!')
        } catch (storageError) {
          console.error('🔄 Storage error:', storageError)
          throw new Error(`Failed to save data: ${storageError.message}`)
        }

        // Reload data into React state
        console.log('🔄 Reloading data into React state...')
        loadData()

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
