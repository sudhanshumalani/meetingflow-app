/**
 * SyncProvider - Cross-device sync integration for AppContext
 * Wraps the app with sync capabilities and handles sync state management
 *
 * UPDATED: Google Drive sync now works alongside Firestore.
 * Both serve as backup systems for data safety.
 */

import { createContext, useContext, useEffect, useCallback, useRef } from 'react'
import { useApp } from './AppContext'
import useSync from '../hooks/useSync'

const SyncContext = createContext()

export function SyncProvider({ children }) {
  const app = useApp()
  const sync = useSync()
  const lastSyncRef = useRef(0)

  /**
   * Sync app data to Google Drive when data changes
   * FIXED: Now loads FULL content from Dexie (not just metadata from app.meetings)
   * Google Drive sync runs alongside Firestore for redundant backup
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

    // Debounce: Don't sync more than once per 5 seconds
    const now = Date.now()
    if (now - lastSyncRef.current < 5000) {
      return
    }
    lastSyncRef.current = now

    try {
      // FIXED: Use sync service's getLocalData() which reads FULL content from Dexie
      // Previously used app.meetings which only had metadata (no transcripts, notes, etc.)
      const syncService = (await import('../utils/syncService')).default
      const localData = await syncService.getLocalData()

      if (!localData || !localData.data) {
        console.log('⏸️ Auto-sync skipped - no data available')
        return
      }

      const { meetings, stakeholders, stakeholderCategories } = localData.data

      // Only sync if we have actual data
      if (meetings.length > 0 || stakeholders.length > 0 || stakeholderCategories.length > 0) {
        console.log('🔄 Auto-syncing FULL content to Google Drive...', {
          meetings: meetings.length,
          stakeholders: stakeholders.length,
          categories: stakeholderCategories.length,
          hasFullContent: meetings[0]?.audioTranscript ? 'YES' : 'NO'
        })

        const result = await sync.syncToCloud(localData.data)

        if (result.success) {
          console.log('✅ GOOGLE DRIVE AUTO-SYNC COMPLETED - Full content saved')
        } else if (result.queued) {
          console.log('📴 Sync queued - device is offline')
        }
      } else {
        console.log('⏸️ Auto-sync skipped - no data to sync')
      }
    } catch (error) {
      console.log('Auto-sync failed (will retry):', error.message)
    }
  }, [app.isLoading, sync.isConfigured, sync.canSync, sync.syncToCloud])

  /**
   * Auto-sync data when app state changes (debounced)
   * Triggers on any change to meetings, stakeholders, or categories
   */
  useEffect(() => {
    // Debounce sync operations to avoid excessive calls
    const timeoutId = setTimeout(() => {
      handleDataChange()
    }, 2000) // 2 second delay to batch rapid changes

    return () => clearTimeout(timeoutId)
  }, [handleDataChange, app.meetings?.length, app.stakeholders?.length, app.stakeholderCategories?.length])

  /**
   * PHASE 4: Deletion sync effect removed
   * Soft delete now uses deleted=true field synced via Firestore subscriptions
   * No need for immediate tombstone sync - deletions sync like any other field update
   */

  /**
   * PHASE 4: Emergency sync effect removed
   * Soft delete syncs via Firestore real-time subscriptions
   * No emergency tombstone sync needed
   */

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

    // Manual sync trigger (Google Drive) - loads FULL content from Dexie
    forceSyncToCloud: async () => {
      // FIXED: Use sync service's getLocalData() which reads FULL content from Dexie
      const syncService = (await import('../utils/syncService')).default
      const localData = await syncService.getLocalData()

      if (!localData || !localData.data) {
        console.log('❌ FORCE SYNC failed - no data available')
        return { success: false, error: 'No data available' }
      }

      const { meetings, stakeholders, stakeholderCategories } = localData.data

      console.log('🔄 FORCE SYNC TO CLOUD triggered with FULL content:', {
        meetings: meetings.length,
        stakeholders: stakeholders.length,
        categories: stakeholderCategories.length,
        hasFullContent: meetings[0]?.audioTranscript ? 'YES' : 'NO'
      })

      return await sync.syncToCloud(localData.data)
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