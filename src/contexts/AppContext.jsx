import { createContext, useContext, useReducer, useEffect, useRef, useCallback } from 'react'
import localforage from 'localforage'
import { v4 as uuidv4 } from 'uuid'
import n8nService from '../utils/n8nService'
import { STAKEHOLDER_CATEGORIES as DEFAULT_CATEGORIES } from '../utils/stakeholderManager'

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
      const newStakeholder = {
        id: uuidv4(),
        ...action.payload,
        createdAt: new Date().toISOString()
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
            ? { ...stakeholder, ...action.payload }
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
      const newCategory = {
        key: action.payload.key || (action.payload.label || '').toLowerCase().replace(/\s+/g, '-'),
        ...action.payload,
        id: uuidv4(),
        createdAt: new Date().toISOString()
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
        category.key === categoryToDelete || category.id === categoryToDelete
      )
      // Also update any stakeholders using this category to use a default category
      const updatedStakeholders = state.stakeholders.map(stakeholder =>
        stakeholder.category === categoryToDelete
          ? { ...stakeholder, category: 'external' } // fallback to external category
          : stakeholder
      )
      return {
        ...state,
        stakeholderCategories: state.stakeholderCategories.filter(category =>
          category.key !== categoryToDelete && category.id !== categoryToDelete
        ),
        stakeholders: updatedStakeholders,
        deletedItems: [
          ...state.deletedItems,
          {
            type: 'stakeholderCategory',
            id: categoryToDelete,
            deletedAt: new Date().toISOString(),
            deletedBy: `device_${navigator.userAgent.slice(0, 50)}`,
            originalItem: deletedCategory ? {
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

  useEffect(() => {
    loadData()
  }, [])


  // Save immediately when data changes (no debouncing to avoid issues)
  useEffect(() => {
    console.log('🔥 SAVE EFFECT: Triggered', {
      isLoading: state.isLoading,
      meetingsLength: state.meetings.length,
      shouldSave: !state.isLoading
    })

    if (!state.isLoading) {
      console.log('💾 AppContext: SYNCHRONOUS save triggered')
      console.log('💾 AppContext: Saving meetings count:', state.meetings.length)
      console.log('💾 AppContext: Meeting IDs being saved:', state.meetings.map(m => m.id))

      // Save to localStorage only - SyncService handles localforage separately
      localStorage.setItem('meetingflow_meetings', JSON.stringify(state.meetings))
      localStorage.setItem('meetingflow_stakeholders', JSON.stringify(state.stakeholders))
      localStorage.setItem('meetingflow_stakeholder_categories', JSON.stringify(state.stakeholderCategories))
      localStorage.setItem('meetingflow_deleted_items', JSON.stringify(state.deletedItems))

      const saved = JSON.parse(localStorage.getItem('meetingflow_meetings') || '[]')
      console.log('✅ AppContext: VERIFIED save - meetings in storage:', saved.length)
      console.log('✅ AppContext: VERIFIED IDs:', saved.map(m => m.id))
    }
  }, [state.meetings, state.stakeholders, state.stakeholderCategories, state.isLoading])

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
    try {
      dispatch({ type: 'SET_LOADING', payload: true })

      console.log('📂 LOAD: Starting data load from localStorage...')

      // Load from localStorage ONLY (synchronous, reliable)
      let meetings, localStakeholders, localCategories

      try {
        // Load from localStorage first (synchronous and immediate)
        meetings = JSON.parse(localStorage.getItem('meetingflow_meetings') || '[]')
        localStakeholders = JSON.parse(localStorage.getItem('meetingflow_stakeholders') || '[]')
        localCategories = JSON.parse(localStorage.getItem('meetingflow_stakeholder_categories') || '[]')
        const deletedItems = JSON.parse(localStorage.getItem('meetingflow_deleted_items') || '[]')

        // Only use defaults for true first-time setup (when no categories exist anywhere)
        if (!localCategories.length) {
          // Check if this is first-time setup by looking for any existing app data
          const hasExistingData = meetings.length > 0 || localStakeholders.length > 0
          if (!hasExistingData) {
            console.log('🔍 DEBUG: First-time setup detected, loading default categories')
            localCategories = Object.values(DEFAULT_CATEGORIES)
          } else {
            console.log('🔍 DEBUG: Existing app data found but no categories - this may be a sync issue, loading defaults temporarily')
            // Load defaults temporarily, sync will override if needed
            localCategories = Object.values(DEFAULT_CATEGORIES)
          }
        }

        console.log('🔍 DEBUG: Initial load from localStorage:', {
          meetings: meetings.length,
          stakeholders: localStakeholders.length,
          categories: localCategories.length,
          categoryNames: localCategories.map(c => c.name)
        })

        // Note: We removed the automatic background storage sync that was overriding
        // active sync operations. Storage consistency is now maintained by the save function
        // that writes to both localStorage and localforage simultaneously.

        console.log('📂 LOAD: Loaded from localStorage - meetings:', meetings.length)
        console.log('📂 LOAD: Meeting IDs loaded:', meetings.map(m => m.id))

      } catch (error) {
        console.warn('⚠️ localStorage failed, using defaults:', error)
        meetings = []
        localStakeholders = []
        localCategories = [] // Don't load defaults on error, let them be set properly
      }
      
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
        id: meeting.id || uuidv4()
      }
      console.log('📝 AppContext: Adding meeting with ID:', meetingWithId.id)
      console.log('📝 AppContext: Current meetings count before add:', state.meetings.length)
      dispatch({ type: 'ADD_MEETING', payload: meetingWithId })

      // Save will be triggered automatically by useEffect when state changes
    },
    updateMeeting: async (meeting) => {
      console.log('📝 AppContext: Updating meeting with ID:', meeting.id)
      dispatch({ type: 'UPDATE_MEETING', payload: meeting })

      // Save will be triggered automatically by useEffect when state changes
    },
    deleteMeeting: (meetingId) => dispatch({ type: 'DELETE_MEETING', payload: meetingId }),
    setCurrentMeeting: (meeting) => dispatch({ type: 'SET_CURRENT_MEETING', payload: meeting }),
    
    addStakeholder: (stakeholder) => dispatch({ type: 'ADD_STAKEHOLDER', payload: stakeholder }),
    updateStakeholder: (stakeholder) => dispatch({ type: 'UPDATE_STAKEHOLDER', payload: stakeholder }),
    deleteStakeholder: (stakeholderId) => dispatch({ type: 'DELETE_STAKEHOLDER', payload: stakeholderId }),

    addStakeholderCategory: (category) => dispatch({ type: 'ADD_STAKEHOLDER_CATEGORY', payload: category }),
    updateStakeholderCategory: (category) => dispatch({ type: 'UPDATE_STAKEHOLDER_CATEGORY', payload: category }),
    deleteStakeholderCategory: (categoryKey) => dispatch({ type: 'DELETE_STAKEHOLDER_CATEGORY', payload: categoryKey }),
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