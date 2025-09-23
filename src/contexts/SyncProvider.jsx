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
        console.log('🔍 DEBUG: Sync completed successfully, data will be reloaded automatically via storage event')
        console.log('🔍 DEBUG: Synced data summary:', {
          meetings: result.data.meetings?.length || 0,
          stakeholders: result.data.stakeholders?.length || 0,
          categories: result.data.stakeholderCategories?.length || 0
        })

        // Note: No manual data manipulation needed here anymore.
        // The SyncService will emit a 'meetingflow-storage-updated' event that triggers
        // AppContext to reload all data from localStorage automatically.
        // This ensures atomic updates and prevents race conditions.

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
   * Initialize sync on app startup - DISABLED to prevent data loss
   * Users should manually sync when they want to pull cloud data
   */
  useEffect(() => {
    // Automatic startup sync disabled to prevent overwriting local data
    // Users can manually sync via the Settings page when needed
    console.log('🔄 Sync initialization complete - automatic startup sync disabled for data safety')
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