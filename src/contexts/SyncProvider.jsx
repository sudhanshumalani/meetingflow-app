/**
 * SyncProvider - Cross-device sync integration for AppContext
 * Wraps the app with sync capabilities and handles sync state management
 */

import { createContext, useContext, useEffect, useCallback } from 'react'
import { useApp } from './AppContext'
import useSync from '../hooks/useSync'

const SyncContext = createContext()

export function SyncProvider({ children }) {
  const app = useApp()
  const sync = useSync()

  /**
   * Sync app data to cloud when data changes
   */
  const handleDataChange = useCallback(async () => {
    // Only sync if sync is configured and we have data
    if (!sync.isConfigured || !sync.canSync) {
      return
    }

    // Avoid syncing during initial load
    if (app.isLoading) {
      return
    }

    try {
      const appData = {
        meetings: app.meetings,
        stakeholders: app.stakeholders,
        stakeholderCategories: app.stakeholderCategories
      }

      // Only sync if we have actual data
      if (appData.meetings.length > 0 || appData.stakeholders.length > 0) {
        console.log('🔄 Auto-syncing app data to cloud...', {
          meetings: appData.meetings.length,
          stakeholders: appData.stakeholders.length
        })

        await sync.syncToCloud(appData)
      }
    } catch (error) {
      console.log('Auto-sync failed (will retry):', error.message)
    }
  }, [app.meetings, app.stakeholders, app.stakeholderCategories, app.isLoading, sync.isConfigured, sync.canSync, sync.syncToCloud])

  /**
   * Auto-sync data when app state changes
   */
  useEffect(() => {
    // Debounce sync operations to avoid excessive calls
    const timeoutId = setTimeout(() => {
      handleDataChange()
    }, 2000) // 2 second delay

    return () => clearTimeout(timeoutId)
  }, [handleDataChange])

  /**
   * Handle sync from cloud with app data update
   */
  const syncFromCloudWithUpdate = useCallback(async () => {
    try {
      console.log('🔍 DEBUG: syncFromCloudWithUpdate starting...')
      console.log('🔍 DEBUG: Current app categories before sync:', {
        count: app.stakeholderCategories?.length || 0,
        categories: app.stakeholderCategories?.map(c => c.name) || []
      })

      const result = await sync.syncFromCloud()

      console.log('🔍 DEBUG: syncFromCloud result:', {
        success: result.success,
        hasData: !!result.data,
        dataKeys: result.data ? Object.keys(result.data) : 'no data'
      })

      if (result.success && result.data) {
        console.log('🔍 DEBUG: Categories in result.data:', {
          count: result.data.stakeholderCategories?.length || 0,
          categories: result.data.stakeholderCategories?.map(c => c.name) || []
        })

        // Update app context with synced data
        console.log('🔄 Updating app with synced data from cloud...', {
          meetings: result.data.meetings?.length || 0,
          stakeholders: result.data.stakeholders?.length || 0,
          categories: result.data.stakeholderCategories?.length || 0
        })

        // Clear current data and load synced data
        if (result.data.meetings?.length > 0) {
          // Replace meetings
          app.meetings.forEach(meeting => {
            app.deleteMeeting(meeting.id)
          })

          result.data.meetings.forEach(meeting => {
            app.addMeeting(meeting)
          })
        }

        if (result.data.stakeholders?.length > 0) {
          // Replace stakeholders
          app.stakeholders.forEach(stakeholder => {
            app.deleteStakeholder(stakeholder.id)
          })

          result.data.stakeholders.forEach(stakeholder => {
            app.addStakeholder(stakeholder)
          })
        }

        // Update stakeholder categories
        console.log('🔍 DEBUG: About to update categories with:', {
          categoriesArray: result.data.stakeholderCategories,
          arrayLength: result.data.stakeholderCategories?.length,
          arrayType: typeof result.data.stakeholderCategories,
          isArray: Array.isArray(result.data.stakeholderCategories)
        })

        if (result.data.stakeholderCategories !== undefined) {
          console.log('📂 Updating stakeholder categories:', result.data.stakeholderCategories.length)
          console.log('📂 Category names being set:', result.data.stakeholderCategories.map(c => c.name))

          // Call the AppContext method
          app.setStakeholderCategories(result.data.stakeholderCategories)

          // Verify the update happened
          setTimeout(() => {
            console.log('🔍 DEBUG: Categories after setStakeholderCategories call:', {
              count: app.stakeholderCategories?.length || 0,
              categories: app.stakeholderCategories?.map(c => c.name) || []
            })
          }, 100)
        } else {
          console.log('⚠️ DEBUG: No stakeholderCategories in result.data')
        }

        return result
      }

      return result
    } catch (error) {
      console.error('Failed to sync from cloud:', error)
      throw error
    }
  }, [sync.syncFromCloud, app])

  /**
   * Handle conflict resolution with app data update
   */
  const resolveConflictWithUpdate = useCallback(async (resolution) => {
    if (!sync.conflictData) {
      throw new Error('No conflict to resolve')
    }

    try {
      const result = await sync.resolveConflict(resolution, (resolvedData) => {
        // Update app context with resolved data
        console.log('🔄 Updating app with conflict-resolved data...', {
          meetings: resolvedData.meetings?.length || 0,
          stakeholders: resolvedData.stakeholders?.length || 0
        })

        // Clear current data and load resolved data
        if (resolvedData.meetings?.length > 0) {
          app.meetings.forEach(meeting => {
            app.deleteMeeting(meeting.id)
          })

          resolvedData.meetings.forEach(meeting => {
            app.addMeeting(meeting)
          })
        }

        if (resolvedData.stakeholders?.length > 0) {
          app.stakeholders.forEach(stakeholder => {
            app.deleteStakeholder(stakeholder.id)
          })

          resolvedData.stakeholders.forEach(stakeholder => {
            app.addStakeholder(stakeholder)
          })
        }
      })

      return result
    } catch (error) {
      console.error('Failed to resolve conflict:', error)
      throw error
    }
  }, [sync.resolveConflict, sync.conflictData, app])

  /**
   * Initialize sync on app startup
   */
  useEffect(() => {
    const initializeSync = async () => {
      if (sync.isConfigured && app.meetings.length > 0) {
        try {
          console.log('🔄 Checking for cloud updates on app startup...')
          await syncFromCloudWithUpdate()
        } catch (error) {
          console.log('Startup sync check failed:', error.message)
        }
      }
    }

    // Only run after initial app data load is complete
    if (!app.isLoading) {
      initializeSync()
    }
  }, [app.isLoading, sync.isConfigured])

  // Enhanced sync actions that integrate with app context
  const syncActions = {
    ...sync,

    // Override sync methods to integrate with app context
    syncFromCloud: syncFromCloudWithUpdate,
    resolveConflict: resolveConflictWithUpdate,

    // Helper methods
    getAppData: () => ({
      meetings: app.meetings,
      stakeholders: app.stakeholders,
      stakeholderCategories: app.stakeholderCategories
    }),

    // Manual sync trigger
    forceSyncToCloud: async () => {
      const appData = {
        meetings: app.meetings,
        stakeholders: app.stakeholders,
        stakeholderCategories: app.stakeholderCategories
      }

      return await sync.syncToCloud(appData)
    },

    // Get sync statistics
    getSyncStats: () => {
      const appData = {
        meetings: app.meetings,
        stakeholders: app.stakeholders,
        stakeholderCategories: app.stakeholderCategories
      }

      return {
        dataSize: JSON.stringify(appData).length,
        meetings: appData.meetings.length,
        stakeholders: appData.stakeholders.length,
        categories: appData.stakeholderCategories.length,
        lastSync: sync.lastSyncTime,
        deviceInfo: sync.deviceInfo
      }
    }
  }

  return (
    <SyncContext.Provider value={syncActions}>
      {children}
    </SyncContext.Provider>
  )
}

export function useSyncContext() {
  const context = useContext(SyncContext)
  if (context === undefined) {
    throw new Error('useSyncContext must be used within a SyncProvider')
  }
  return context
}

export default SyncProvider