import { useState, useEffect, useCallback } from 'react'
import notionService from '../services/notionService'

export function useNotion() {
  const [syncStatus, setSyncStatus] = useState(notionService.getSyncStatus())
  const [stakeholders, setStakeholders] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  // Update sync status from service
  const updateSyncStatus = useCallback(() => {
    setSyncStatus(notionService.getSyncStatus())
  }, [])

  // Fetch stakeholders from Notion
  const fetchStakeholders = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    
    try {
      const result = await notionService.fetchStakeholders()
      
      if (result.success) {
        setStakeholders(result.data)
      } else {
        setError(result.error)
        // Fall back to empty array if Notion isn't configured
        setStakeholders([])
      }
    } catch (err) {
      setError(err.message)
      setStakeholders([])
    } finally {
      setIsLoading(false)
      updateSyncStatus()
    }
  }, [updateSyncStatus])

  // Export meeting to Notion
  const exportMeeting = useCallback(async (meetingData) => {
    setIsLoading(true)
    setError(null)
    
    try {
      const result = await notionService.exportMeetingToNotion(meetingData)
      updateSyncStatus()
      return result
    } catch (err) {
      setError(err.message)
      updateSyncStatus()
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [updateSyncStatus])

  // Update stakeholder last contact date
  const updateLastContact = useCallback(async (stakeholderNotionId, contactDate) => {
    try {
      const result = await notionService.updateStakeholderLastContact(stakeholderNotionId, contactDate)
      updateSyncStatus()
      return result
    } catch (err) {
      setError(err.message)
      updateSyncStatus()
      throw err
    }
  }, [updateSyncStatus])

  // Test Notion connection
  const testConnection = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    
    try {
      await notionService.testConnection()
      updateSyncStatus()
      return true
    } catch (err) {
      setError(err.message)
      updateSyncStatus()
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [updateSyncStatus])

  // Initialize and fetch data on mount
  useEffect(() => {
    updateSyncStatus()
    
    // Only fetch if Notion is configured
    if (notionService.isReady()) {
      fetchStakeholders()
    }
  }, [fetchStakeholders, updateSyncStatus])

  return {
    // Data
    stakeholders,
    syncStatus,
    isLoading,
    error,
    
    // Status checks
    isConfigured: notionService.isReady(),
    isConnected: syncStatus.isConnected,
    isSyncing: syncStatus.isSyncing || isLoading,
    
    // Actions
    fetchStakeholders,
    exportMeeting,
    updateLastContact,
    testConnection,
    refreshStatus: updateSyncStatus
  }
}

export function useNotionStakeholders() {
  const {
    stakeholders,
    isLoading,
    error,
    fetchStakeholders,
    isConfigured,
    isConnected
  } = useNotion()

  return {
    stakeholders,
    isLoading,
    error,
    refresh: fetchStakeholders,
    isConfigured,
    isConnected
  }
}