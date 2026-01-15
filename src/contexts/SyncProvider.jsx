/**
 * SyncProvider - Cross-device sync integration for AppContext
 * Wraps the app with sync capabilities and handles sync state management
 *
 * NOTE: When ENABLE_FIRESTORE is true, Google Drive sync is disabled
 * to prevent conflicts. Use the Firestore Sync tab in Settings instead.
 */

import { createContext, useContext, useEffect, useCallback } from 'react'
import { useApp } from './AppContext'
import useSync from '../hooks/useSync'

// Feature flag - when Firestore is enabled, disable Google Drive sync
const ENABLE_FIRESTORE = true

const SyncContext = createContext()

export function SyncProvider({ children }) {
  const app = useApp()
  const sync = useSync()

  /**
   * Sync app data to cloud when data changes
   */
  const handleDataChange = useCallback(async () => {
    // Skip Google Drive sync when Firestore is enabled
    if (ENABLE_FIRESTORE) {
      return
    }

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
        stakeholderCategories: app.stakeholderCategories,
        deletedItems: app.deletedItems
      }

      // Only sync if we have actual data or deletions
      if (appData.meetings.length > 0 || appData.stakeholders.length > 0 || appData.stakeholderCategories.length > 0 || appData.deletedItems.length > 0) {
        console.log('🔄 Auto-syncing app data to cloud...', {
          meetings: appData.meetings.length,
          stakeholders: appData.stakeholders.length,
          categories: appData.stakeholderCategories.length,
          deletedItems: appData.deletedItems.length,
          deletionDetails: appData.deletedItems.map(d => `${d.type}:${d.id}`)
        })

        const result = await sync.syncToCloud(appData)

        // Validate sync success, especially for deletions
        if (result.success) {
          console.log('✅ AUTO-SYNC COMPLETED SUCCESSFULLY')
          if (appData.deletedItems.length > 0) {
            console.log('✅ DELETION SYNC CONFIRMED IN AUTO-SYNC:',
              appData.deletedItems.map(d => `${d.type}:${d.id}`)
            )
          }
        } else if (result.queued) {
          console.log('📴 Sync queued - device is offline')
        }
      } else {
        console.log('⏸️ Auto-sync skipped - no data to sync')
      }
    } catch (error) {
      console.log('Auto-sync failed (will retry):', error.message)
    }
  }, [app.meetings, app.stakeholders, app.stakeholderCategories, app.deletedItems, app.isLoading, sync.isConfigured, sync.canSync, sync.syncToCloud])

  /**
   * Auto-sync data when app state changes (debounced)
   */
  useEffect(() => {
    // Debounce sync operations to avoid excessive calls
    const timeoutId = setTimeout(() => {
      handleDataChange()
    }, 500) // 500ms delay (reduced from 2000ms for faster sync)

    return () => clearTimeout(timeoutId)
  }, [handleDataChange])

  /**
   * IMMEDIATE sync for deletions (no debounce)
   * Critical: Ensures deletions are synced immediately without waiting
   */
  useEffect(() => {
    // Skip Google Drive sync when Firestore is enabled
    if (ENABLE_FIRESTORE) {
      return
    }

    // Skip if not configured or offline
    if (!sync.isConfigured || !sync.canSync) {
      console.log('⏸️ Deletion sync skipped - sync not configured or offline')
      return
    }

    // Skip during initial load
    if (app.isLoading) {
      return
    }

    // Only trigger if we have deletions
    if (app.deletedItems.length > 0) {
      console.log('🚨 IMMEDIATE DELETION SYNC TRIGGERED:', {
        deletedItemsCount: app.deletedItems.length,
        deletedItems: app.deletedItems.map(d => `${d.type}:${d.id}`)
      })

      const appData = {
        meetings: app.meetings,
        stakeholders: app.stakeholders,
        stakeholderCategories: app.stakeholderCategories,
        deletedItems: app.deletedItems
      }

      sync.syncToCloud(appData)
        .then(result => {
          if (result.success) {
            console.log('✅ DELETION SYNC CONFIRMED - deletions uploaded to cloud')
          }
        })
        .catch(err => {
          console.error('❌ IMMEDIATE DELETION SYNC FAILED:', err)
        })
    }
  }, [app.deletedItems.length, sync.isConfigured, sync.canSync, app.isLoading])

  /**
   * Emergency sync before app closes (safety net)
   * Ensures pending deletions are synced before user closes the app
   */
  useEffect(() => {
    // Skip Google Drive sync when Firestore is enabled
    if (ENABLE_FIRESTORE) {
      return
    }

    const handleBeforeUnload = async (e) => {
      if (app.deletedItems.length > 0 && sync.canSync) {
        console.log('⚠️ APP CLOSING WITH PENDING DELETIONS - forcing emergency sync')

        const appData = {
          meetings: app.meetings,
          stakeholders: app.stakeholders,
          stakeholderCategories: app.stakeholderCategories,
          deletedItems: app.deletedItems
        }

        // Attempt synchronous sync before close
        try {
          await sync.syncToCloud(appData)
          console.log('✅ Emergency sync completed')
        } catch (error) {
          console.error('❌ Emergency sync failed:', error)
        }
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [app.deletedItems, app.meetings, app.stakeholders, app.stakeholderCategories, sync])

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

        // Debug: Check AppContext state after sync
        setTimeout(() => {
          console.log('🔍 POST-SYNC DEBUG: AppContext state after sync:', {
            meetings: app.meetings?.length || 0,
            stakeholders: app.stakeholders?.length || 0,
            categories: app.stakeholderCategories?.length || 0,
            isLoading: app.isLoading
          })
          console.log('🔍 POST-SYNC DEBUG: localStorage verification:', {
            meetings: JSON.parse(localStorage.getItem('meetingflow_meetings') || '[]').length,
            stakeholders: JSON.parse(localStorage.getItem('meetingflow_stakeholders') || '[]').length,
            categories: JSON.parse(localStorage.getItem('meetingflow_stakeholder_categories') || '[]').length
          })
        }, 1000)

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
        stakeholderCategories: app.stakeholderCategories,
        deletedItems: app.deletedItems
      }

      console.log('🔄 FORCE SYNC TO CLOUD triggered:', {
        meetings: appData.meetings.length,
        stakeholders: appData.stakeholders.length,
        categories: appData.stakeholderCategories.length,
        deletedItems: appData.deletedItems.length,
        deletionDetails: appData.deletedItems.map(d => `${d.type}:${d.id}`)
      })

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