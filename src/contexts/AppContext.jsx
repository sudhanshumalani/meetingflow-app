import { createContext, useContext, useReducer, useEffect } from 'react'
import localforage from 'localforage'
import { v4 as uuidv4 } from 'uuid'
import notionService from '../services/notionService'
import { STAKEHOLDER_CATEGORIES as DEFAULT_CATEGORIES } from '../utils/stakeholderManager'

const AppContext = createContext()

const initialState = {
  meetings: [],
  stakeholders: [],
  stakeholderCategories: Object.values(DEFAULT_CATEGORIES),
  currentMeeting: null,
  isLoading: false,
  error: null,
  notion: {
    syncStatus: notionService.getSyncStatus(),
    isConfigured: notionService.isReady(),
    lastStakeholderSync: null
  }
}

function appReducer(state, action) {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload }
    
    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false }
    
    case 'LOAD_DATA':
      return {
        ...state,
        meetings: action.payload.meetings || [],
        stakeholders: action.payload.stakeholders || [],
        stakeholderCategories: action.payload.stakeholderCategories || Object.values(DEFAULT_CATEGORIES),
        isLoading: false
      }
    
    case 'ADD_MEETING':
      const newMeeting = {
        id: uuidv4(),
        ...action.payload,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      return {
        ...state,
        meetings: [newMeeting, ...state.meetings]
      }
    
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
      return {
        ...state,
        stakeholders: state.stakeholders.filter(stakeholder => stakeholder.id !== action.payload)
      }

    case 'ADD_STAKEHOLDER_CATEGORY':
      const newCategory = {
        key: action.payload.key || action.payload.label.toLowerCase().replace(/\s+/g, '-'),
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
        stakeholders: updatedStakeholders
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
    
    case 'SET_NOTION_SYNC_STATUS':
      return {
        ...state,
        notion: {
          ...state.notion,
          syncStatus: action.payload
        }
      }
    
    case 'SET_NOTION_STAKEHOLDERS':
      return {
        ...state,
        stakeholders: action.payload.merge 
          ? [...state.stakeholders, ...action.payload.stakeholders]
          : action.payload.stakeholders,
        notion: {
          ...state.notion,
          lastStakeholderSync: new Date().toISOString()
        }
      }
    
    case 'SYNC_STAKEHOLDER_WITH_NOTION':
      return {
        ...state,
        stakeholders: state.stakeholders.map(stakeholder =>
          stakeholder.id === action.payload.id
            ? { ...stakeholder, ...action.payload.updates }
            : stakeholder
        )
      }
    
    default:
      return state
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, initialState)

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (!state.isLoading) {
      saveData()
    }
  }, [state.meetings, state.stakeholders, state.stakeholderCategories, state.isLoading])

  const loadData = async () => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true })
      
      // Load local data first
      const [meetings, localStakeholders, localCategories] = await Promise.all([
        localforage.getItem('meetingflow_meetings'),
        localforage.getItem('meetingflow_stakeholders'),
        localforage.getItem('meetingflow_stakeholder_categories')
      ])
      
      // Load local data immediately
      dispatch({
        type: 'LOAD_DATA',
        payload: {
          meetings: meetings || [],
          stakeholders: localStakeholders || [],
          stakeholderCategories: localCategories || Object.values(DEFAULT_CATEGORIES)
        }
      })
      
      // Try to fetch stakeholders from Notion if configured
      if (notionService.isReady()) {
        try {
          const notionResult = await notionService.fetchStakeholders()
          
          if (notionResult.success && notionResult.data.length > 0) {
            // Merge Notion stakeholders with local ones
            const mergedStakeholders = mergeDuplicateStakeholders(
              localStakeholders || [], 
              notionResult.data
            )
            
            dispatch({
              type: 'SET_NOTION_STAKEHOLDERS',
              payload: {
                stakeholders: mergedStakeholders,
                merge: false
              }
            })
            
            console.log(`Synced ${notionResult.data.length} stakeholders from Notion`)
          }
          
          // Update sync status
          dispatch({
            type: 'SET_NOTION_SYNC_STATUS',
            payload: notionService.getSyncStatus()
          })
        } catch (notionError) {
          console.warn('Failed to sync with Notion:', notionError.message)
          dispatch({
            type: 'SET_NOTION_SYNC_STATUS',
            payload: notionService.getSyncStatus()
          })
        }
      }
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: 'Failed to load data from storage' })
    }
  }

  const saveData = async () => {
    try {
      await Promise.all([
        localforage.setItem('meetingflow_meetings', state.meetings),
        localforage.setItem('meetingflow_stakeholders', state.stakeholders),
        localforage.setItem('meetingflow_stakeholder_categories', state.stakeholderCategories)
      ])
    } catch (error) {
      console.error('Failed to save data:', error)
    }
  }

  // Helper function to merge stakeholders and avoid duplicates
  const mergeDuplicateStakeholders = (localStakeholders, notionStakeholders) => {
    const merged = [...localStakeholders]
    
    notionStakeholders.forEach(notionStakeholder => {
      // Check if stakeholder already exists (by email or Notion ID)
      const existingIndex = merged.findIndex(local => 
        local.email === notionStakeholder.email || 
        local.notionId === notionStakeholder.notionId
      )
      
      if (existingIndex >= 0) {
        // Update existing stakeholder with Notion data (Notion is source of truth)
        merged[existingIndex] = {
          ...merged[existingIndex],
          ...notionStakeholder,
          id: merged[existingIndex].id // Keep local ID for consistency
        }
      } else {
        // Add new stakeholder from Notion
        merged.push({
          ...notionStakeholder,
          id: notionStakeholder.notionId // Use Notion ID as primary ID
        })
      }
    })
    
    return merged
  }

  // Notion-specific actions
  const syncStakeholdersFromNotion = async () => {
    if (!notionService.isReady()) {
      throw new Error('Notion service not configured')
    }
    
    try {
      dispatch({ type: 'SET_LOADING', payload: true })
      
      const result = await notionService.fetchStakeholders()
      
      if (result.success) {
        const mergedStakeholders = mergeDuplicateStakeholders(
          state.stakeholders,
          result.data
        )
        
        dispatch({
          type: 'SET_NOTION_STAKEHOLDERS',
          payload: {
            stakeholders: mergedStakeholders,
            merge: false
          }
        })
      }
      
      dispatch({
        type: 'SET_NOTION_SYNC_STATUS',
        payload: notionService.getSyncStatus()
      })
      
      return result
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: error.message })
      throw error
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false })
    }
  }

  const exportMeetingToNotion = async (meetingData) => {
    if (!notionService.isReady()) {
      throw new Error('Notion service not configured')
    }
    
    try {
      // Find stakeholder Notion ID if available
      if (meetingData.selectedStakeholder) {
        const stakeholder = state.stakeholders.find(s => s.id === meetingData.selectedStakeholder)
        if (stakeholder?.notionId) {
          meetingData.stakeholderNotionId = stakeholder.notionId
        }
      }
      
      const result = await notionService.exportMeetingToNotion(meetingData)
      
      // Update stakeholder last contact date if successful
      if (result.success && meetingData.stakeholderNotionId) {
        await notionService.updateStakeholderLastContact(
          meetingData.stakeholderNotionId,
          new Date(meetingData.date || Date.now())
        )
        
        // Update local stakeholder data
        dispatch({
          type: 'SYNC_STAKEHOLDER_WITH_NOTION',
          payload: {
            id: meetingData.selectedStakeholder,
            updates: {
              lastContact: meetingData.date || new Date().toISOString().split('T')[0]
            }
          }
        })
      }
      
      dispatch({
        type: 'SET_NOTION_SYNC_STATUS',
        payload: notionService.getSyncStatus()
      })
      
      return result
    } catch (error) {
      dispatch({
        type: 'SET_NOTION_SYNC_STATUS',
        payload: notionService.getSyncStatus()
      })
      throw error
    }
  }

  const actions = {
    addMeeting: (meeting) => dispatch({ type: 'ADD_MEETING', payload: meeting }),
    updateMeeting: (meeting) => dispatch({ type: 'UPDATE_MEETING', payload: meeting }),
    deleteMeeting: (meetingId) => dispatch({ type: 'DELETE_MEETING', payload: meetingId }),
    setCurrentMeeting: (meeting) => dispatch({ type: 'SET_CURRENT_MEETING', payload: meeting }),
    
    addStakeholder: (stakeholder) => dispatch({ type: 'ADD_STAKEHOLDER', payload: stakeholder }),
    updateStakeholder: (stakeholder) => dispatch({ type: 'UPDATE_STAKEHOLDER', payload: stakeholder }),
    deleteStakeholder: (stakeholderId) => dispatch({ type: 'DELETE_STAKEHOLDER', payload: stakeholderId }),

    addStakeholderCategory: (category) => dispatch({ type: 'ADD_STAKEHOLDER_CATEGORY', payload: category }),
    updateStakeholderCategory: (category) => dispatch({ type: 'UPDATE_STAKEHOLDER_CATEGORY', payload: category }),
    deleteStakeholderCategory: (categoryKey) => dispatch({ type: 'DELETE_STAKEHOLDER_CATEGORY', payload: categoryKey }),

    addNoteToMeeting: (meetingId, note) => dispatch({ type: 'ADD_NOTE_TO_MEETING', payload: { meetingId, note } }),
    updateNoteInMeeting: (meetingId, noteId, updatedNote) => 
      dispatch({ type: 'UPDATE_NOTE_IN_MEETING', payload: { meetingId, noteId, updatedNote } }),
    
    clearError: () => dispatch({ type: 'SET_ERROR', payload: null }),
    
    // Notion integration actions
    syncStakeholdersFromNotion,
    exportMeetingToNotion,
    refreshNotionStatus: () => dispatch({
      type: 'SET_NOTION_SYNC_STATUS',
      payload: notionService.getSyncStatus()
    })
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