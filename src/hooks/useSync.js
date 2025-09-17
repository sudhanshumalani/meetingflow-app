/**
 * useSync Hook - React hook for cross-device synchronization
 * Provides sync state management and operations for the MeetingFlow app
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import syncService, { SYNC_PROVIDERS, SYNC_STATUS } from '../utils/syncService'

export function useSync() {
  // Sync state
  const [syncStatus, setSyncStatus] = useState(SYNC_STATUS.IDLE)
  const [syncConfig, setSyncConfig] = useState(null)
  const [lastSyncTime, setLastSyncTime] = useState(null)
  const [syncError, setSyncError] = useState(null)
  const [conflictData, setConflictData] = useState(null)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [deviceInfo, setDeviceInfo] = useState(null)
  const [queuedOperations, setQueuedOperations] = useState(0)

  // Loading states for different operations
  const [isConfiguring, setIsConfiguring] = useState(false)
  const [isSyncingToCloud, setIsSyncingToCloud] = useState(false)
  const [isSyncingFromCloud, setIsSyncingFromCloud] = useState(false)
  const [isResolvingConflict, setIsResolvingConflict] = useState(false)

  // Refs for cleanup
  const syncListenerRef = useRef(null)

  /**
   * Initialize sync hook
   */
  useEffect(() => {
    initializeSync()

    // Online/offline detection
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      if (syncListenerRef.current) {
        syncService.removeListener(syncListenerRef.current)
      }
    }
  }, [])

  /**
   * Initialize sync status and listeners
   */
  const initializeSync = useCallback(async () => {
    try {
      // Get initial sync status
      const status = await syncService.getSyncStatus()
      setSyncConfig(status.configured ? {
        provider: status.provider,
        enabled: status.enabled
      } : null)
      setLastSyncTime(status.lastSync)
      setDeviceInfo({
        id: status.deviceId,
        name: status.deviceName
      })
      setQueuedOperations(status.queuedOperations)

      // Setup sync event listener
      syncListenerRef.current = (event, data) => {
        switch (event) {
          case 'status_change':
            setSyncStatus(data)
            if (data === SYNC_STATUS.SUCCESS || data === SYNC_STATUS.IDLE) {
              setSyncError(null)
              setConflictData(null)
            }
            break

          case 'sync_success':
            setLastSyncTime(data.timestamp)
            setIsSyncingToCloud(false)
            setIsSyncingFromCloud(false)
            break

          case 'sync_error':
            setSyncError(data)
            setIsSyncingToCloud(false)
            setIsSyncingFromCloud(false)
            break

          case 'sync_conflict':
            setConflictData(data)
            setSyncStatus(SYNC_STATUS.CONFLICT)
            break

          case 'conflict_resolved':
            setConflictData(null)
            setIsResolvingConflict(false)
            setSyncStatus(SYNC_STATUS.SUCCESS)
            break

          case 'connection_success':
            console.log('✅ Sync connection established')
            break

          case 'connection_error':
            setSyncError(`Connection failed: ${data}`)
            break

          case 'config_updated':
            setSyncConfig({
              provider: data.provider,
              enabled: data.enabled
            })
            break

          default:
            break
        }
      }

      syncService.addListener(syncListenerRef.current)

    } catch (error) {
      console.error('Failed to initialize sync:', error)
      setSyncError(error.message)
    }
  }, [])

  /**
   * Configure sync provider
   */
  const configureSyncProvider = useCallback(async (provider, config) => {
    setIsConfiguring(true)
    setSyncError(null)

    try {
      const result = await syncService.configureSyncProvider(provider, config)

      if (result.success) {
        console.log('✅ Sync provider configured successfully')
        return { success: true }
      } else {
        throw new Error(result.error || 'Configuration failed')
      }
    } catch (error) {
      console.error('❌ Failed to configure sync provider:', error)
      setSyncError(error.message)
      return { success: false, error: error.message }
    } finally {
      setIsConfiguring(false)
    }
  }, [])

  /**
   * Sync data to cloud
   */
  const syncToCloud = useCallback(async (data) => {
    if (!syncConfig?.enabled) {
      throw new Error('Sync not configured or disabled')
    }

    setIsSyncingToCloud(true)
    setSyncError(null)

    try {
      const result = await syncService.syncToCloud(data)

      if (result.success) {
        console.log('✅ Successfully synced to cloud')
        return { success: true, timestamp: result.timestamp }
      } else if (result.queued) {
        console.log('📴 Sync queued for when online')
        return { success: false, queued: true }
      } else {
        throw new Error(result.error || 'Sync failed')
      }
    } catch (error) {
      console.error('❌ Failed to sync to cloud:', error)
      setSyncError(error.message)
      throw error
    } finally {
      setIsSyncingToCloud(false)
    }
  }, [syncConfig])

  /**
   * Sync data from cloud
   */
  const syncFromCloud = useCallback(async () => {
    if (!syncConfig?.enabled) {
      throw new Error('Sync not configured or disabled')
    }

    setIsSyncingFromCloud(true)
    setSyncError(null)

    try {
      const result = await syncService.syncFromCloud()

      if (result.success) {
        if (result.noCloudData) {
          console.log('ℹ️ No cloud data found')
          return { success: true, noCloudData: true }
        }

        if (result.conflict) {
          console.log('⚠️ Sync conflict detected')
          return { success: false, conflict: true, conflictData: result.conflictData }
        }

        console.log('✅ Successfully synced from cloud')
        return {
          success: true,
          data: result.data,
          timestamp: result.timestamp,
          metadata: result.metadata
        }
      } else if (result.offline) {
        console.log('📴 Cannot sync from cloud - offline')
        return { success: false, offline: true }
      } else {
        throw new Error(result.error || 'Sync failed')
      }
    } catch (error) {
      console.error('❌ Failed to sync from cloud:', error)
      setSyncError(error.message)
      throw error
    } finally {
      setIsSyncingFromCloud(false)
    }
  }, [syncConfig])

  /**
   * Resolve sync conflict
   */
  const resolveConflict = useCallback(async (resolution, onDataUpdate) => {
    if (!conflictData) {
      throw new Error('No conflict to resolve')
    }

    setIsResolvingConflict(true)
    setSyncError(null)

    try {
      const result = await syncService.resolveConflict(
        resolution,
        conflictData.local,
        conflictData.cloud
      )

      if (result.success) {
        console.log('✅ Conflict resolved successfully')

        // Update app data with resolved data
        if (onDataUpdate && typeof onDataUpdate === 'function') {
          onDataUpdate(result.data)
        }

        return { success: true, data: result.data }
      } else {
        throw new Error(result.error || 'Failed to resolve conflict')
      }
    } catch (error) {
      console.error('❌ Failed to resolve conflict:', error)
      setSyncError(error.message)
      throw error
    } finally {
      setIsResolvingConflict(false)
    }
  }, [conflictData])

  /**
   * Test sync connection
   */
  const testConnection = useCallback(async () => {
    if (!syncConfig?.enabled) {
      throw new Error('Sync not configured or disabled')
    }

    setSyncError(null)

    try {
      await syncService.testConnection()
      return { success: true }
    } catch (error) {
      console.error('❌ Connection test failed:', error)
      setSyncError(error.message)
      return { success: false, error: error.message }
    }
  }, [syncConfig])

  /**
   * Enable/disable auto sync
   */
  const toggleAutoSync = useCallback((enabled) => {
    if (enabled) {
      syncService.startAutoSync()
    } else {
      syncService.stopAutoSync()
    }

    // Update local config
    if (syncConfig) {
      setSyncConfig(prev => ({ ...prev, autoSync: enabled }))
    }
  }, [syncConfig])

  /**
   * Clear all sync data (factory reset)
   */
  const clearSyncData = useCallback(async () => {
    try {
      await syncService.clearSyncData()

      // Reset all state
      setSyncConfig(null)
      setLastSyncTime(null)
      setSyncError(null)
      setConflictData(null)
      setSyncStatus(SYNC_STATUS.IDLE)
      setQueuedOperations(0)

      console.log('🗑️ Sync data cleared')
      return { success: true }
    } catch (error) {
      console.error('❌ Failed to clear sync data:', error)
      setSyncError(error.message)
      return { success: false, error: error.message }
    }
  }, [])

  /**
   * Get detailed sync status
   */
  const getDetailedStatus = useCallback(() => {
    return {
      configured: !!syncConfig,
      provider: syncConfig?.provider,
      enabled: syncConfig?.enabled || false,
      status: syncStatus,
      lastSync: lastSyncTime,
      error: syncError,
      hasConflict: !!conflictData,
      isOnline,
      deviceInfo,
      queuedOperations,
      isLoading: {
        configuring: isConfiguring,
        syncingToCloud: isSyncingToCloud,
        syncingFromCloud: isSyncingFromCloud,
        resolvingConflict: isResolvingConflict
      }
    }
  }, [
    syncConfig, syncStatus, lastSyncTime, syncError, conflictData,
    isOnline, deviceInfo, queuedOperations,
    isConfiguring, isSyncingToCloud, isSyncingFromCloud, isResolvingConflict
  ])

  // Return hook interface
  return {
    // State
    syncStatus,
    syncConfig,
    lastSyncTime,
    syncError,
    conflictData,
    isOnline,
    deviceInfo,
    queuedOperations,

    // Loading states
    isConfiguring,
    isSyncingToCloud,
    isSyncingFromCloud,
    isResolvingConflict,

    // Operations
    configureSyncProvider,
    syncToCloud,
    syncFromCloud,
    resolveConflict,
    testConnection,
    toggleAutoSync,
    clearSyncData,
    getDetailedStatus,

    // Computed values
    isConfigured: !!syncConfig,
    canSync: !!syncConfig?.enabled && isOnline,
    hasError: !!syncError,
    hasConflict: !!conflictData,
    isIdle: syncStatus === SYNC_STATUS.IDLE,
    isSuccess: syncStatus === SYNC_STATUS.SUCCESS,
    isSyncing: syncStatus === SYNC_STATUS.SYNCING
  }
}

export { SYNC_PROVIDERS, SYNC_STATUS }
export default useSync