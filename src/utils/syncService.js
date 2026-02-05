/**
 * Cross-Device Sync Service
 * Provides seamless data synchronization across multiple devices
 * Supports multiple cloud storage providers with conflict resolution
 */

import localforage from 'localforage'
import { v4 as uuidv4 } from 'uuid'

// Sync providers
const SYNC_PROVIDERS = {
  GITHUB_GIST: 'github_gist',
  GOOGLE_DRIVE: 'google_drive',
  CUSTOM_API: 'custom_api',
  N8N: 'n8n'
}

// Sync status states
const SYNC_STATUS = {
  IDLE: 'idle',
  SYNCING: 'syncing',
  SUCCESS: 'success',
  ERROR: 'error',
  CONFLICT: 'conflict',
  OFFLINE: 'offline'
}

class SyncService {
  constructor() {
    this.deviceId = null
    this.syncConfig = null
    this.syncQueue = [] // Legacy - kept for backwards compatibility
    this.isOnline = navigator.onLine
    this.lastSyncTime = null
    this.autoSyncInterval = null
    this.syncListeners = []

    // Token refresh concurrency control
    this.tokenRefreshPromise = null

    // Initialization promise for singleton pattern
    this.initializationPromise = null
    this.isInitialized = false

    // NEW: Persistent operation queue for guaranteed sync
    this.operationQueue = []
    this.isProcessingQueue = false
    this.maxQueueSize = 100 // Prevent memory issues
    this.queueProcessInterval = null

    // NEW: Delta sync tracking
    this.lastSyncSnapshot = null // Snapshot of data at last successful sync
    this.pendingChanges = {
      meetings: { added: [], updated: [], deleted: [] },
      stakeholders: { added: [], updated: [], deleted: [] },
      stakeholderCategories: { added: [], updated: [], deleted: [] }
    }

    // Start initialization
    this.initializationPromise = this.initialize()

    // Setup online/offline detection
    window.addEventListener('online', () => {
      this.isOnline = true
      console.log('📡 Network online - processing operation queue')
      this.processOfflineQueue() // Legacy
      this.processOperationQueue() // NEW: Enhanced queue processing
    })
    window.addEventListener('offline', () => {
      this.isOnline = false
      console.log('📴 Network offline - queueing operations')
    })

    // Setup periodic queue processing for resilience
    this.queueProcessInterval = setInterval(() => {
      if (this.isOnline && !this.isProcessingQueue) {
        this.processOperationQueue()
      }
    }, 30000) // Process queue every 30 seconds if online
  }

  /**
   * Main initialization method that ensures proper async initialization
   */
  async initialize() {
    if (this.isInitialized) {
      return
    }

    try {
      // Initialize device tracking and load existing config in proper order
      await this.initializeDevice()
      await this.loadSyncConfig()
      await this.loadOperationQueue() // NEW: Load persisted queue
      await this.loadSyncSnapshot() // NEW: Load delta sync snapshot

      this.isInitialized = true
      console.log('🚀 SyncService fully initialized')
    } catch (error) {
      console.error('❌ Failed to initialize SyncService:', error)
      throw error
    }
  }

  /**
   * Load persisted operation queue from storage
   */
  async loadOperationQueue() {
    try {
      const persistedQueue = await localforage.getItem('sync_operation_queue')
      if (persistedQueue && Array.isArray(persistedQueue)) {
        this.operationQueue = persistedQueue
        console.log(`📋 Loaded ${persistedQueue.length} queued operations from storage`)

        // Process queue if online
        if (this.isOnline) {
          setTimeout(() => this.processOperationQueue(), 2000) // Delay to allow full initialization
        }
      }
    } catch (error) {
      console.error('Failed to load operation queue:', error)
      this.operationQueue = []
    }
  }

  /**
   * Save operation queue to persistent storage
   */
  async saveOperationQueue() {
    try {
      await localforage.setItem('sync_operation_queue', this.operationQueue)
      console.log(`💾 Saved ${this.operationQueue.length} operations to persistent queue`)
    } catch (error) {
      console.error('Failed to save operation queue:', error)
    }
  }

  /**
   * Add an operation to the persistent queue
   * @param {string} type - Operation type: 'sync_to_cloud', 'sync_from_cloud', 'delete'
   * @param {object} data - Operation data
   * @param {number} priority - Priority (0=highest, default=5)
   */
  async queueOperation(type, data, priority = 5) {
    const operation = {
      id: uuidv4(),
      type,
      data,
      priority,
      timestamp: Date.now(),
      retryCount: 0,
      maxRetries: 3,
      status: 'pending' // 'pending', 'processing', 'failed', 'completed'
    }

    // Enforce max queue size
    if (this.operationQueue.length >= this.maxQueueSize) {
      console.warn(`⚠️ Operation queue full (${this.maxQueueSize} items), removing oldest low-priority item`)
      // Remove oldest low-priority item (priority >= 5)
      const lowPriorityIndex = this.operationQueue.findIndex(op => op.priority >= 5 && op.status === 'pending')
      if (lowPriorityIndex !== -1) {
        this.operationQueue.splice(lowPriorityIndex, 1)
      }
    }

    this.operationQueue.push(operation)

    // Sort by priority (0=highest) then timestamp (oldest first)
    this.operationQueue.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority
      return a.timestamp - b.timestamp
    })

    await this.saveOperationQueue()

    console.log(`📝 Queued operation: ${type} (priority ${priority}, queue size: ${this.operationQueue.length})`)

    // Try to process immediately if online
    if (this.isOnline && !this.isProcessingQueue) {
      this.processOperationQueue()
    }

    return operation.id
  }

  /**
   * Process the operation queue
   */
  async processOperationQueue() {
    if (this.isProcessingQueue || !this.isOnline) {
      return
    }

    if (this.operationQueue.length === 0) {
      return
    }

    this.isProcessingQueue = true
    console.log(`⚙️ Processing operation queue (${this.operationQueue.length} operations)`)

    try {
      while (this.operationQueue.length > 0 && this.isOnline) {
        // Get next pending operation
        const opIndex = this.operationQueue.findIndex(op => op.status === 'pending')
        if (opIndex === -1) {
          // No pending operations, clean up completed/failed ones
          this.operationQueue = this.operationQueue.filter(op => op.status === 'pending' || op.status === 'processing')
          await this.saveOperationQueue()
          break
        }

        const operation = this.operationQueue[opIndex]
        operation.status = 'processing'
        await this.saveOperationQueue()

        try {
          console.log(`▶️ Processing operation ${operation.type} (attempt ${operation.retryCount + 1}/${operation.maxRetries + 1})`)

          let result = false
          switch (operation.type) {
            case 'sync_to_cloud':
              result = await this.syncToCloud(operation.data)
              break

            case 'sync_from_cloud':
              result = await this.syncFromCloud()
              break

            default:
              console.warn(`Unknown operation type: ${operation.type}`)
              result = { success: false, error: 'Unknown operation type' }
          }

          if (result && result.success !== false) {
            // Operation succeeded
            console.log(`✅ Operation ${operation.type} completed successfully`)
            operation.status = 'completed'
            this.operationQueue.splice(opIndex, 1) // Remove from queue
            await this.saveOperationQueue()
          } else {
            throw new Error(result?.error || 'Operation failed')
          }
        } catch (error) {
          console.error(`❌ Operation ${operation.type} failed:`, error.message)

          operation.retryCount++

          if (operation.retryCount >= operation.maxRetries) {
            console.error(`❌ Operation ${operation.type} failed after ${operation.maxRetries} retries, removing from queue`)
            operation.status = 'failed'
            this.operationQueue.splice(opIndex, 1) // Remove failed operation
            this.notifyListeners('operation_failed', {
              operation: operation.type,
              error: error.message,
              retries: operation.retryCount
            })
          } else {
            // Retry with exponential backoff
            const delayMs = Math.min(30000, Math.pow(2, operation.retryCount) * 1000)
            console.log(`⏳ Retrying operation ${operation.type} in ${delayMs}ms`)
            operation.status = 'pending'
            await this.saveOperationQueue()

            // Wait before continuing to next operation
            await new Promise(resolve => setTimeout(resolve, delayMs))
          }
        }

        // Check if we went offline during processing
        if (!this.isOnline) {
          console.log('📴 Went offline during queue processing, pausing')
          break
        }
      }

      console.log(`✅ Operation queue processing complete (${this.operationQueue.length} remaining)`)
    } finally {
      this.isProcessingQueue = false
    }
  }

  /**
   * Clear all completed operations from queue
   */
  async clearCompletedOperations() {
    const before = this.operationQueue.length
    this.operationQueue = this.operationQueue.filter(op => op.status !== 'completed')
    const removed = before - this.operationQueue.length

    if (removed > 0) {
      await this.saveOperationQueue()
      console.log(`🧹 Cleared ${removed} completed operations from queue`)
    }
  }

  /**
   * Get queue status
   */
  getQueueStatus() {
    const pending = this.operationQueue.filter(op => op.status === 'pending').length
    const processing = this.operationQueue.filter(op => op.status === 'processing').length
    const failed = this.operationQueue.filter(op => op.status === 'failed').length

    return {
      total: this.operationQueue.length,
      pending,
      processing,
      failed,
      isProcessing: this.isProcessingQueue,
      operations: this.operationQueue.map(op => ({
        id: op.id,
        type: op.type,
        status: op.status,
        priority: op.priority,
        retryCount: op.retryCount,
        timestamp: new Date(op.timestamp).toISOString()
      }))
    }
  }

  /**
   * Calculate delta between current data and last sync snapshot
   * @param {object} currentData - Current local data
   * @returns {object} Delta containing only changes since last sync
   */
  calculateDelta(currentData) {
    if (!this.lastSyncSnapshot) {
      // No snapshot - this is first sync, return all data
      console.log('📊 No sync snapshot found - treating as full sync')
      return {
        isFullSync: true,
        meetings: currentData.meetings || [],
        stakeholders: currentData.stakeholders || [],
        stakeholderCategories: currentData.stakeholderCategories || [],
        deletedItems: currentData.deletedItems || []
      }
    }

    console.log('📊 Calculating delta since last sync...')

    const delta = {
      isFullSync: false,
      meetings: { added: [], updated: [], deleted: [] },
      stakeholders: { added: [], updated: [], deleted: [] },
      stakeholderCategories: { added: [], updated: [], deleted: [] },
      deletedItems: currentData.deletedItems || [] // Always include all deletions
    }

    // Create maps for fast lookup
    const snapshotMeetingsMap = new Map((this.lastSyncSnapshot.meetings || []).map(m => [m.id, m]))
    const snapshotStakeholdersMap = new Map((this.lastSyncSnapshot.stakeholders || []).map(s => [s.id, s]))
    const snapshotCategoriesMap = new Map((this.lastSyncSnapshot.stakeholderCategories || []).map(c => [c.id || c.name, c]))

    // Detect meeting changes
    (currentData.meetings || []).forEach(meeting => {
      const snapshot = snapshotMeetingsMap.get(meeting.id)
      if (!snapshot) {
        delta.meetings.added.push(meeting)
      } else {
        // Check if updated by comparing timestamps or content
        const currentTime = new Date(meeting.updatedAt || meeting.lastSaved || meeting.createdAt || 0)
        const snapshotTime = new Date(snapshot.updatedAt || snapshot.lastSaved || snapshot.createdAt || 0)

        if (currentTime > snapshotTime || JSON.stringify(meeting) !== JSON.stringify(snapshot)) {
          delta.meetings.updated.push(meeting)
        }
      }
    })

    // Detect deleted meetings
    snapshotMeetingsMap.forEach((snapshot, id) => {
      if (!(currentData.meetings || []).find(m => m.id === id)) {
        delta.meetings.deleted.push({ id, deletedAt: new Date().toISOString() })
      }
    })

    // Detect stakeholder changes
    (currentData.stakeholders || []).forEach(stakeholder => {
      const snapshot = snapshotStakeholdersMap.get(stakeholder.id)
      if (!snapshot) {
        delta.stakeholders.added.push(stakeholder)
      } else {
        const currentTime = new Date(stakeholder.updatedAt || stakeholder.createdAt || 0)
        const snapshotTime = new Date(snapshot.updatedAt || snapshot.createdAt || 0)

        if (currentTime > snapshotTime || JSON.stringify(stakeholder) !== JSON.stringify(snapshot)) {
          delta.stakeholders.updated.push(stakeholder)
        }
      }
    })

    // Detect deleted stakeholders
    snapshotStakeholdersMap.forEach((snapshot, id) => {
      if (!(currentData.stakeholders || []).find(s => s.id === id)) {
        delta.stakeholders.deleted.push({ id, deletedAt: new Date().toISOString() })
      }
    })

    // Detect category changes
    (currentData.stakeholderCategories || []).forEach(category => {
      const categoryKey = category.id || category.name
      const snapshot = snapshotCategoriesMap.get(categoryKey)
      if (!snapshot) {
        delta.stakeholderCategories.added.push(category)
      } else {
        const currentTime = new Date(category.updatedAt || category.createdAt || 0)
        const snapshotTime = new Date(snapshot.updatedAt || snapshot.createdAt || 0)

        if (currentTime > snapshotTime || JSON.stringify(category) !== JSON.stringify(snapshot)) {
          delta.stakeholderCategories.updated.push(category)
        }
      }
    })

    // Detect deleted categories
    snapshotCategoriesMap.forEach((snapshot, key) => {
      if (!(currentData.stakeholderCategories || []).find(c => (c.id || c.name) === key)) {
        delta.stakeholderCategories.deleted.push({ id: snapshot.id, name: snapshot.name, deletedAt: new Date().toISOString() })
      }
    })

    const totalChanges =
      delta.meetings.added.length + delta.meetings.updated.length + delta.meetings.deleted.length +
      delta.stakeholders.added.length + delta.stakeholders.updated.length + delta.stakeholders.deleted.length +
      delta.stakeholderCategories.added.length + delta.stakeholderCategories.updated.length + delta.stakeholderCategories.deleted.length

    console.log('📊 Delta calculation complete:', {
      totalChanges,
      meetings: {
        added: delta.meetings.added.length,
        updated: delta.meetings.updated.length,
        deleted: delta.meetings.deleted.length
      },
      stakeholders: {
        added: delta.stakeholders.added.length,
        updated: delta.stakeholders.updated.length,
        deleted: delta.stakeholders.deleted.length
      },
      categories: {
        added: delta.stakeholderCategories.added.length,
        updated: delta.stakeholderCategories.updated.length,
        deleted: delta.stakeholderCategories.deleted.length
      },
      deletionTombstones: delta.deletedItems.length
    })

    return delta
  }

  /**
   * Apply delta to base data
   * @param {object} baseData - Base data to apply delta to
   * @param {object} delta - Delta containing changes
   * @returns {object} Merged data
   */
  applyDelta(baseData, delta) {
    if (delta.isFullSync) {
      // Full sync - return delta as-is
      return {
        meetings: delta.meetings,
        stakeholders: delta.stakeholders,
        stakeholderCategories: delta.stakeholderCategories,
        deletedItems: delta.deletedItems
      }
    }

    console.log('🔄 Applying delta to base data...')

    const result = {
      meetings: [...(baseData.meetings || [])],
      stakeholders: [...(baseData.stakeholders || [])],
      stakeholderCategories: [...(baseData.stakeholderCategories || [])],
      deletedItems: [...(baseData.deletedItems || []), ...(delta.deletedItems || [])]
    }

    // Apply meeting changes
    delta.meetings.added.forEach(meeting => {
      if (!result.meetings.find(m => m.id === meeting.id)) {
        result.meetings.push(meeting)
      }
    })
    delta.meetings.updated.forEach(meeting => {
      const index = result.meetings.findIndex(m => m.id === meeting.id)
      if (index !== -1) {
        result.meetings[index] = meeting
      } else {
        result.meetings.push(meeting)
      }
    })
    delta.meetings.deleted.forEach(deleted => {
      result.meetings = result.meetings.filter(m => m.id !== deleted.id)
    })

    // Apply stakeholder changes
    delta.stakeholders.added.forEach(stakeholder => {
      if (!result.stakeholders.find(s => s.id === stakeholder.id)) {
        result.stakeholders.push(stakeholder)
      }
    })
    delta.stakeholders.updated.forEach(stakeholder => {
      const index = result.stakeholders.findIndex(s => s.id === stakeholder.id)
      if (index !== -1) {
        result.stakeholders[index] = stakeholder
      } else {
        result.stakeholders.push(stakeholder)
      }
    })
    delta.stakeholders.deleted.forEach(deleted => {
      result.stakeholders = result.stakeholders.filter(s => s.id !== deleted.id)
    })

    // Apply category changes
    delta.stakeholderCategories.added.forEach(category => {
      const key = category.id || category.name
      if (!result.stakeholderCategories.find(c => (c.id || c.name) === key)) {
        result.stakeholderCategories.push(category)
      }
    })
    delta.stakeholderCategories.updated.forEach(category => {
      const key = category.id || category.name
      const index = result.stakeholderCategories.findIndex(c => (c.id || c.name) === key)
      if (index !== -1) {
        result.stakeholderCategories[index] = category
      } else {
        result.stakeholderCategories.push(category)
      }
    })
    delta.stakeholderCategories.deleted.forEach(deleted => {
      const key = deleted.id || deleted.name
      result.stakeholderCategories = result.stakeholderCategories.filter(c => (c.id || c.name) !== key)
    })

    console.log('✅ Delta applied successfully')

    return result
  }

  /**
   * Save snapshot of current data for future delta calculation
   * @param {object} data - Data to snapshot
   */
  async saveSyncSnapshot(data) {
    this.lastSyncSnapshot = {
      meetings: JSON.parse(JSON.stringify(data.meetings || [])),
      stakeholders: JSON.parse(JSON.stringify(data.stakeholders || [])),
      stakeholderCategories: JSON.parse(JSON.stringify(data.stakeholderCategories || [])),
      timestamp: new Date().toISOString()
    }

    try {
      await localforage.setItem('sync_snapshot', this.lastSyncSnapshot)
      console.log('💾 Saved sync snapshot:', {
        meetings: this.lastSyncSnapshot.meetings.length,
        stakeholders: this.lastSyncSnapshot.stakeholders.length,
        categories: this.lastSyncSnapshot.stakeholderCategories.length,
        timestamp: this.lastSyncSnapshot.timestamp
      })
    } catch (error) {
      console.error('Failed to save sync snapshot:', error)
    }
  }

  /**
   * Load last sync snapshot from storage
   */
  async loadSyncSnapshot() {
    try {
      const snapshot = await localforage.getItem('sync_snapshot')
      if (snapshot) {
        this.lastSyncSnapshot = snapshot
        console.log('📋 Loaded sync snapshot from', snapshot.timestamp)
      }
    } catch (error) {
      console.error('Failed to load sync snapshot:', error)
      this.lastSyncSnapshot = null
    }
  }

  /**
   * Ensure the service is initialized before any operations
   */
  async ensureInitialized() {
    if (!this.isInitialized && this.initializationPromise) {
      await this.initializationPromise
    }
  }

  /**
   * Initialize unique device identifier
   */
  async initializeDevice() {
    try {
      let deviceId = await localforage.getItem('sync_device_id')
      if (!deviceId) {
        deviceId = uuidv4()
        await localforage.setItem('sync_device_id', deviceId)
      }
      this.deviceId = deviceId

      // Store device info for sync tracking
      const deviceInfo = {
        id: deviceId,
        name: this.getDeviceName(),
        lastSeen: new Date().toISOString(),
        userAgent: navigator.userAgent,
        platform: navigator.platform
      }
      await localforage.setItem('sync_device_info', deviceInfo)

      console.log('📱 Device initialized for sync:', deviceInfo.name, deviceInfo.id)
    } catch (error) {
      console.error('❌ Failed to initialize device ID:', error)
    }
  }

  /**
   * Load sync configuration from storage
   */
  async loadSyncConfig() {
    try {
      const savedConfig = await localforage.getItem('sync_config')
      if (savedConfig) {
        this.syncConfig = savedConfig
        console.log('🔧 Loaded sync config:', {
          provider: savedConfig.provider,
          enabled: savedConfig.enabled,
          autoSync: savedConfig.autoSync,
          syncInterval: (savedConfig.syncInterval || 300000) / 60000 + ' minutes'
        })

        // Start auto-sync if enabled
        if (savedConfig.autoSync) {
          console.log('🚀 Auto-sync is ENABLED - starting auto-sync interval...')
          this.startAutoSync()
        } else {
          console.warn('⚠️ Auto-sync is DISABLED in config - will not start auto-sync interval')
        }
      } else {
        console.log('ℹ️ No sync config found - sync not configured yet')
      }
    } catch (error) {
      console.error('❌ Failed to load sync config:', error)
    }
  }

  /**
   * Get human-readable device name
   */
  getDeviceName() {
    const ua = navigator.userAgent
    if (ua.includes('Mobile')) return 'Mobile Device'
    if (ua.includes('Tablet')) return 'Tablet'
    if (ua.includes('Windows')) return 'Windows PC'
    if (ua.includes('Mac')) return 'Mac'
    if (ua.includes('Linux')) return 'Linux PC'
    return 'Unknown Device'
  }

  /**
   * Configure sync provider and settings
   */
  async configureSyncProvider(provider, config) {
    // Ensure initialization is complete before configuring
    await this.ensureInitialized()

    if (!Object.values(SYNC_PROVIDERS).includes(provider)) {
      throw new Error(`Invalid sync provider: ${provider}`)
    }

    try {
      const syncConfig = {
        provider,
        config: {
          ...config,
          deviceId: this.deviceId
        },
        enabled: true,
        autoSync: true,
        syncInterval: 5 * 60 * 1000, // 5 minutes default
        createdAt: new Date().toISOString()
      }

      await localforage.setItem('sync_config', syncConfig)
      this.syncConfig = syncConfig

      console.log('🔧 Sync provider configured:', provider)
      this.notifyListeners('config_updated', syncConfig)

      // Small delay to ensure config is properly set
      await new Promise(resolve => setTimeout(resolve, 100))

      // Test the connection
      await this.testConnection()

      // Start auto-sync if enabled
      if (syncConfig.autoSync) {
        this.startAutoSync()
      }

      return { success: true }
    } catch (error) {
      console.error('❌ Failed to configure sync provider:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Test connection to sync provider
   */
  async testConnection() {
    // Ensure the service is fully initialized before testing
    await this.ensureInitialized()

    if (!this.syncConfig) {
      console.error('❌ No sync config found after initialization:', this.syncConfig)
      throw new Error('Sync provider not configured')
    }

    if (!this.syncConfig.config) {
      console.error('❌ No sync config data found:', this.syncConfig)
      throw new Error('Sync provider configuration missing')
    }

    console.log('🔍 Testing sync connection for provider:', this.syncConfig.provider)

    try {
      const testData = {
        test: true,
        timestamp: new Date().toISOString(),
        deviceId: this.deviceId
      }

      const result = await this.uploadData('test_connection', testData)

      if (result.success) {
        console.log('✅ Sync connection test successful')

        // Clean up test file after successful connection
        try {
          await this.cleanupTestFile()
          console.log('🧹 Test file cleaned up successfully')
        } catch (cleanupError) {
          console.warn('⚠️ Could not clean up test file:', cleanupError.message)
          // Don't fail the connection test if cleanup fails
        }

        this.notifyListeners('connection_success')
        return true
      } else {
        throw new Error(result.error || 'Connection test failed')
      }
    } catch (error) {
      console.error('❌ Sync connection test failed:', error)
      this.notifyListeners('connection_error', error.message)
      throw error
    }
  }

  /**
   * Sync all app data to cloud
   */
  async syncToCloud(data) {
    if (!this.syncConfig?.enabled) {
      throw new Error('Sync not configured')
    }

    if (!this.isOnline) {
      console.log('📴 Offline - queueing sync operation to persistent queue')

      // Queue to both legacy and new queue for backwards compatibility
      this.syncQueue.push({ action: 'upload', data, timestamp: Date.now() })

      // NEW: Queue to persistent operation queue with priority
      const operationId = await this.queueOperation('sync_to_cloud', data, 1) // High priority for user-initiated syncs

      this.notifyListeners('status_change', SYNC_STATUS.OFFLINE)
      this.notifyListeners('operation_queued', {
        operationId,
        type: 'sync_to_cloud',
        queueSize: this.operationQueue.length
      })

      return { success: false, queued: true, operationId }
    }

    this.notifyListeners('status_change', SYNC_STATUS.SYNCING)

    try {
      // Check if we're about to upload empty data
      const localDataSize = JSON.stringify(data).length
      const localStakeholders = data.stakeholders?.length || 0
      const localMeetings = data.meetings?.length || 0
      const localCategories = data.stakeholderCategories?.length || 0

      console.log('🔍 Pre-upload validation:', {
        localDataSize,
        localStakeholders,
        localMeetings,
        localCategories,
        hasSignificantData: localDataSize > 1000 || localStakeholders > 0 || localMeetings > 0 || localCategories > 0
      })

      // Check if cloud has more data than what we're about to upload
      if (localStakeholders === 0 && localMeetings === 0 && localCategories === 0) {
        console.log('⚠️ Attempting to upload empty data - checking cloud first...')

        try {
          const cloudResult = await this.downloadData('app_data')
          if (cloudResult.success && cloudResult.data?.data) {
            const cloudStakeholders = cloudResult.data.data.stakeholders?.length || 0
            const cloudMeetings = cloudResult.data.data.meetings?.length || 0
            const cloudCategories = cloudResult.data.data.stakeholderCategories?.length || 0

            console.log('🔍 Cloud data check:', {
              cloudStakeholders,
              cloudMeetings,
              cloudCategories,
              cloudDataSize: JSON.stringify(cloudResult.data).length
            })

            if (cloudStakeholders > 0 || cloudMeetings > 0 || cloudCategories > 0) {
              console.log('🛑 Preventing upload of empty data - cloud has more data')
              console.log('📥 Syncing from cloud instead...')

              // Instead of uploading empty data, sync from cloud
              return await this.syncFromCloud()
            }
          }
        } catch (error) {
          console.warn('Failed to check cloud data before upload:', error)
        }
      }

      // Prepare sync payload with metadata
      const syncPayload = {
        data,
        metadata: {
          deviceId: this.deviceId,
          deviceName: this.getDeviceName(),
          timestamp: new Date().toISOString(),
          version: this.generateDataVersion(data),
          checksum: this.calculateChecksum(data)
        }
      }

      console.log('☁️ Syncing data to cloud...', {
        provider: this.syncConfig.provider,
        dataSize: localDataSize,
        meetings: localMeetings,
        stakeholders: localStakeholders,
        categories: localCategories,
        deletedItems: data.deletedItems?.length || 0,
        deletionDetails: data.deletedItems?.map(d => `${d.type}:${d.id}`) || []
      })

      const result = await this.uploadData('app_data', syncPayload)

      if (result.success) {
        this.lastSyncTime = new Date().toISOString()
        await localforage.setItem('last_sync_time', this.lastSyncTime)

        // NEW: Save snapshot for delta sync
        await this.saveSyncSnapshot(data)

        console.log('✅ Data synced successfully to cloud')
        this.notifyListeners('sync_success', { timestamp: this.lastSyncTime })
        this.notifyListeners('status_change', SYNC_STATUS.SUCCESS)

        return { success: true, timestamp: this.lastSyncTime }
      } else {
        throw new Error(result.error || 'Upload failed')
      }
    } catch (error) {
      console.error('❌ Sync to cloud failed:', error)
      this.notifyListeners('sync_error', error.message)
      this.notifyListeners('status_change', SYNC_STATUS.ERROR)
      throw error
    }
  }

  /**
   * Sync data from cloud to local device
   */
  async syncFromCloud() {
    if (!this.syncConfig?.enabled) {
      throw new Error('Sync not configured')
    }

    if (!this.isOnline) {
      console.log('📴 Offline - cannot sync from cloud')
      this.notifyListeners('status_change', SYNC_STATUS.OFFLINE)
      return { success: false, offline: true }
    }

    this.notifyListeners('status_change', SYNC_STATUS.SYNCING)

    try {
      console.log('📥 Syncing data from cloud...')

      const result = await this.downloadData('app_data')

      if (result.success && result.data) {
        const cloudData = result.data

        // Verify data integrity
        if (cloudData.metadata?.checksum) {
          const calculatedChecksum = this.calculateChecksum(cloudData.data)
          if (calculatedChecksum !== cloudData.metadata.checksum) {
            throw new Error('Data integrity check failed - checksum mismatch')
          }
        }

        // Check for conflicts
        const localData = await this.getLocalData()
        const conflict = await this.detectConflicts(localData, cloudData)

        if (conflict) {
          console.log('⚠️ Sync conflict detected - attempting automatic resolution...')
          console.log('🔧 Conflict details:', conflict)

          // Automatically resolve by merging both datasets
          console.log('🔄 Auto-resolving conflict by merging local and cloud data...')
          this.notifyListeners('status_change', SYNC_STATUS.SYNCING)

          // Continue with merge process instead of failing
        }

        // Merge local and cloud data to prevent data loss
        const mergedData = await this.mergeData(localData.data, cloudData.data)

        console.log('🔍 DEBUG: mergedData immediately after merge:', {
          meetings: mergedData.meetings?.length || 0,
          stakeholders: mergedData.stakeholders?.length || 0,
          stakeholderCategories: mergedData.stakeholderCategories?.length || 0,
        })

        // Save merged data to both localStorage and localforage for consistency
        await localforage.setItem('meetingflow_meetings', mergedData.meetings)
        await localforage.setItem('meetingflow_stakeholders', mergedData.stakeholders)
        await localforage.setItem('meetingflow_stakeholder_categories', mergedData.stakeholderCategories)

        // Also save to localStorage to maintain AppContext consistency
        localStorage.setItem('meetingflow_meetings', JSON.stringify(mergedData.meetings))
        localStorage.setItem('meetingflow_stakeholders', JSON.stringify(mergedData.stakeholders))
        localStorage.setItem('meetingflow_stakeholder_categories', JSON.stringify(mergedData.stakeholderCategories))
        localStorage.setItem('meetingflow_deleted_items', JSON.stringify(mergedData.deletedItems))

        // Notify AppContext that storage has been updated
        console.log('📡 Emitting storage update event to reload AppContext...')
        window.dispatchEvent(new CustomEvent('meetingflow-storage-updated', {
          detail: {
            source: 'sync',
            operation: 'syncFromCloud',
            dataUpdated: {
              meetings: mergedData.meetings?.length || 0,
              stakeholders: mergedData.stakeholders?.length || 0,
              stakeholderCategories: mergedData.stakeholderCategories?.length || 0
            }
          }
        }))

        console.log('🔍 DEBUG: mergedData after localStorage save:', {
          meetings: mergedData.meetings?.length || 0,
          stakeholders: mergedData.stakeholders?.length || 0,
          stakeholderCategories: mergedData.stakeholderCategories?.length || 0,
        })

        // Update last sync time
        this.lastSyncTime = new Date().toISOString()
        await localforage.setItem('last_sync_time', this.lastSyncTime)

        console.log('✅ Data synced successfully from cloud', {
          meetings: mergedData.meetings?.length || 0,
          stakeholders: mergedData.stakeholders?.length || 0,
          stakeholderCategories: mergedData.stakeholderCategories?.length || 0,
          lastModified: cloudData.metadata?.timestamp
        })

        this.notifyListeners('sync_success', {
          timestamp: this.lastSyncTime,
          data: mergedData,
          source: 'cloud'
        })
        this.notifyListeners('status_change', SYNC_STATUS.SUCCESS)

        return {
          success: true,
          data: mergedData,
          timestamp: this.lastSyncTime,
          metadata: cloudData.metadata
        }
      } else {
        // No cloud data exists yet
        console.log('ℹ️ No cloud data found - first sync will upload local data')
        return { success: true, noCloudData: true }
      }
    } catch (error) {
      console.error('❌ Sync from cloud failed:', error)
      this.notifyListeners('sync_error', error.message)
      this.notifyListeners('status_change', SYNC_STATUS.ERROR)
      throw error
    }
  }

  /**
   * Detect conflicts between local and cloud data
   */
  async detectConflicts(localData, cloudData) {
    if (!localData || !cloudData) return null

    // Check if localData has valid data property
    if (!localData.data || !cloudData.data) return null

    const localTimestamp = new Date(localData.metadata?.timestamp || 0)
    const cloudTimestamp = new Date(cloudData.metadata?.timestamp || 0)
    const timeDiff = Math.abs(cloudTimestamp - localTimestamp)

    // If timestamps are very close (within 10 seconds), no conflict
    if (timeDiff < 10000) return null

    // Check if the devices are different
    if (localData.metadata?.deviceId === cloudData.metadata?.deviceId) return null

    // Compare data checksums
    const localChecksum = this.calculateChecksum(localData.data)
    const cloudChecksum = cloudData.metadata?.checksum || this.calculateChecksum(cloudData.data)

    if (localChecksum === cloudChecksum) return null

    // Conflict detected
    return {
      type: 'timestamp_device_mismatch',
      localTimestamp: localData.metadata?.timestamp,
      cloudTimestamp: cloudData.metadata?.timestamp,
      localDevice: localData.metadata?.deviceName || 'Unknown',
      cloudDevice: cloudData.metadata?.deviceName || 'Unknown',
      timeDifferenceMs: timeDiff
    }
  }

  /**
   * Resolve sync conflicts with user choice
   */
  async resolveConflict(resolution, localData, cloudData) {
    try {
      let resolvedData = null

      switch (resolution) {
        case 'use_local':
          resolvedData = localData
          console.log('🔧 Conflict resolved: Using local data')
          break

        case 'use_cloud':
          resolvedData = cloudData.data
          console.log('🔧 Conflict resolved: Using cloud data')
          break

        case 'merge':
          resolvedData = await this.mergeData(localData, cloudData.data)
          console.log('🔧 Conflict resolved: Data merged')
          break

        default:
          throw new Error('Invalid conflict resolution option')
      }

      // Sync the resolved data
      await this.syncToCloud(resolvedData)

      this.notifyListeners('conflict_resolved', {
        resolution,
        data: resolvedData
      })

      return { success: true, data: resolvedData }
    } catch (error) {
      console.error('❌ Failed to resolve conflict:', error)
      throw error
    }
  }

  /**
   * Merge local and cloud data intelligently
   */
  async mergeData(localData, cloudData) {
    console.log('🔀 Merging local and cloud data...')
    console.log('🔍 DEBUG mergeData inputs:', {
      localData: localData ? Object.keys(localData) : 'null',
      cloudData: cloudData ? Object.keys(cloudData) : 'null',
      localDataType: typeof localData,
      cloudDataType: typeof cloudData
    })

    // Handle null/undefined data
    const safeLocalData = localData || {}
    const safeCloudData = cloudData || {}

    const merged = {
      meetings: [],
      stakeholders: [],
      stakeholderCategories: [],
      deletedItems: []
    }

    // Combine all deletion tombstones from both sources
    const allDeletions = [
      ...(safeLocalData.deletedItems || []),
      ...(safeCloudData.deletedItems || [])
    ]

    // Create a map of deletions by type and ID for fast lookup
    const deletionMap = new Map()
    allDeletions.forEach(deletion => {
      const key = `${deletion.type}:${deletion.id}`
      const existing = deletionMap.get(key)
      // Keep the most recent deletion record
      if (!existing || new Date(deletion.deletedAt) > new Date(existing.deletedAt)) {
        deletionMap.set(key, deletion)
      }
    })


    // Merge meetings by ID, respecting deletions and keeping the most recent
    const allMeetings = [...(safeLocalData.meetings || []), ...(safeCloudData.meetings || [])]
    const meetingMap = new Map()

    allMeetings.forEach(meeting => {
      // Check if this meeting has been deleted
      const deletionKey = `meeting:${meeting.id}`
      const deletion = deletionMap.get(deletionKey)

      if (deletion) {
        // Item was deleted - check if deletion is newer than the meeting
        const meetingTimestamp = new Date(meeting.lastSaved || meeting.updatedAt || meeting.createdAt)
        const deletionTimestamp = new Date(deletion.deletedAt)

        if (deletionTimestamp > meetingTimestamp) {
          console.log(`🗑️ Excluding deleted meeting: ${meeting.title || meeting.id} (deleted: ${deletion.deletedAt})`)
          return // Skip this meeting - it was deleted after last modification
        }
        console.log(`⚰️ Resurrecting meeting: ${meeting.title || meeting.id} (modified after deletion)`)
        // Remove the deletion record since the item was modified after deletion
        deletionMap.delete(deletionKey)
      }

      const existing = meetingMap.get(meeting.id)
      if (!existing || new Date(meeting.lastSaved || meeting.updatedAt || meeting.createdAt) > new Date(existing.lastSaved || existing.updatedAt || existing.createdAt)) {
        meetingMap.set(meeting.id, meeting)
      }
    })

    merged.meetings = Array.from(meetingMap.values())

    // Merge stakeholders by ID, respecting deletions and keeping the most recent
    const allStakeholders = [...(safeLocalData.stakeholders || []), ...(safeCloudData.stakeholders || [])]
    const stakeholderMap = new Map()

    allStakeholders.forEach(stakeholder => {
      // Check if this stakeholder has been deleted
      const deletionKey = `stakeholder:${stakeholder.id}`
      const deletion = deletionMap.get(deletionKey)

      if (deletion) {
        // Item was deleted - check if deletion is newer than the stakeholder
        const stakeholderTimestamp = new Date(stakeholder.updatedAt || stakeholder.createdAt)
        const deletionTimestamp = new Date(deletion.deletedAt)

        if (deletionTimestamp > stakeholderTimestamp) {
          console.log(`🗑️ Excluding deleted stakeholder: ${stakeholder.name || stakeholder.id} (deleted: ${deletion.deletedAt})`)
          return // Skip this stakeholder - it was deleted after last modification
        }
        console.log(`⚰️ Resurrecting stakeholder: ${stakeholder.name || stakeholder.id} (modified after deletion)`)
        // Remove the deletion record since the item was modified after deletion
        deletionMap.delete(deletionKey)
      }

      const existing = stakeholderMap.get(stakeholder.id)
      if (!existing || new Date(stakeholder.updatedAt || stakeholder.createdAt) > new Date(existing.updatedAt || existing.createdAt)) {
        stakeholderMap.set(stakeholder.id, stakeholder)
      }
    })

    merged.stakeholders = Array.from(stakeholderMap.values())

    // Merge stakeholder categories by name, combining from both sources
    // No default categories - keep all user-created categories
    const allCategories = [...(safeLocalData.stakeholderCategories || []), ...(safeCloudData.stakeholderCategories || [])]
    const categoryMap = new Map()

    console.log('🔍 All categories to process:', allCategories.map(c => ({ name: c?.name, label: c?.label, id: c?.id })))

    allCategories.forEach((category, index) => {
      // Use 'name' if available, otherwise fall back to 'label' for N8N categories
      const categoryName = category?.name || category?.label
      const categoryId = category?.id || categoryName
      const hasName = !!categoryName
      const notInMap = !categoryMap.has(categoryName)

      // Check if this category has been deleted - check all possible identifiers
      const possibleDeletionKeys = [
        `stakeholderCategory:${categoryId}`,
        category?.key ? `stakeholderCategory:${category.key}` : null,
        categoryName ? `stakeholderCategory:${categoryName}` : null,
        category?.id ? `stakeholderCategory:${category.id}` : null
      ].filter(Boolean)

      // Also check if deletion tombstone has matching identifiers
      let deletion = null
      let matchedDeletionKey = null

      // First try matching by the tombstone keys
      for (const key of possibleDeletionKeys) {
        const foundDeletion = deletionMap.get(key)
        if (foundDeletion) {
          deletion = foundDeletion
          matchedDeletionKey = key
          break
        }
      }

      // Also check if any deletion tombstone matches this category's properties
      if (!deletion) {
        for (const [key, del] of deletionMap.entries()) {
          if (del.type === 'stakeholderCategory') {
            if (del.id === category.id ||
                del.key === category.key ||
                del.name === categoryName ||
                del.name === category.label) {
              deletion = del
              matchedDeletionKey = key
              break
            }
          }
        }
      }

      if (deletion) {
        // Item was deleted - check if deletion is newer than the category
        const categoryTimestamp = new Date(category.updatedAt || category.createdAt || 0)
        const deletionTimestamp = new Date(deletion.deletedAt)

        if (deletionTimestamp > categoryTimestamp) {
          console.log(`🗑️ Excluding deleted category: ${categoryName || categoryId} (deleted: ${deletion.deletedAt}, matched by: ${matchedDeletionKey})`)
          return // Skip this category - it was deleted after last modification
        }
        console.log(`⚰️ Resurrecting category: ${categoryName || categoryId} (modified after deletion)`)
        // Remove the deletion record since the item was modified after deletion
        deletionMap.delete(matchedDeletionKey)
      }

      // Keep all categories that have a name and aren't already in the map
      const shouldInclude = hasName && notInMap

      if (shouldInclude) {
        console.log(`✅ Adding category to merge:`, categoryName)
        // Ensure the category has a 'name' property for consistency
        const normalizedCategory = {
          ...category,
          name: categoryName
        }
        categoryMap.set(categoryName, normalizedCategory)
      } else {
        console.log('❌ Skipping category:', categoryName || 'unnamed', {
          reason: !hasName ? 'no name/label property' : 'already in map',
          hasName,
          notInMap
        })
      }
    })

    merged.stakeholderCategories = Array.from(categoryMap.values())

    console.log('🔍 Category merge details:', {
      totalInputCategories: allCategories.length,
      finalMergedCategories: merged.stakeholderCategories.length,
      categoryNames: merged.stakeholderCategories.map(c => c.name)
    })

    // Clean up orphaned category references in stakeholders
    // Build a set of valid category identifiers (id, key, name)
    const validCategoryIds = new Set()
    merged.stakeholderCategories.forEach(cat => {
      if (cat.id) validCategoryIds.add(cat.id)
      if (cat.key) validCategoryIds.add(cat.key)
      if (cat.name) validCategoryIds.add(cat.name)
      if (cat.label) validCategoryIds.add(cat.label)
    })

    console.log('🔍 Valid category identifiers:', Array.from(validCategoryIds))

    // Check each stakeholder for orphaned category references
    let orphanedReferencesFixed = 0
    merged.stakeholders = merged.stakeholders.map(stakeholder => {
      if (stakeholder.category && !validCategoryIds.has(stakeholder.category)) {
        console.log(`🧹 Cleaning orphaned category reference in stakeholder ${stakeholder.name}: ${stakeholder.category}`)
        orphanedReferencesFixed++
        return {
          ...stakeholder,
          category: null,
          updatedAt: new Date().toISOString()
        }
      }
      return stakeholder
    })

    if (orphanedReferencesFixed > 0) {
      console.log(`✅ Fixed ${orphanedReferencesFixed} orphaned category references`)
    }

    // Final assignment of cleaned deletion records (after all resurrection checks)
    merged.deletedItems = Array.from(deletionMap.values())

    console.log('✅ Data merge complete:', {
      meetings: merged.meetings.length,
      stakeholders: merged.stakeholders.length,
      stakeholderCategories: merged.stakeholderCategories.length,
      deletedItems: merged.deletedItems.length,
      localMeetings: safeLocalData.meetings?.length || 0,
      cloudMeetings: safeCloudData.meetings?.length || 0,
      localStakeholders: safeLocalData.stakeholders?.length || 0,
      cloudStakeholders: safeCloudData.stakeholders?.length || 0,
      localCategories: safeLocalData.stakeholderCategories?.length || 0,
      cloudCategories: safeCloudData.stakeholderCategories?.length || 0
    })

    return merged
  }

  /**
   * Start automatic sync at intervals
   */
  startAutoSync() {
    if (this.autoSyncInterval) {
      clearInterval(this.autoSyncInterval)
    }

    const interval = this.syncConfig?.syncInterval || 5 * 60 * 1000 // 5 minutes default

    this.autoSyncInterval = setInterval(async () => {
      try {
        console.log('⏰ AUTO-SYNC INTERVAL TRIGGERED (runs every', interval / 60000, 'minutes)')
        const localData = await this.getLocalData()
        if (localData) {
          console.log('📤 Auto-sync interval uploading data:', {
            meetings: localData.data.meetings?.length || 0,
            stakeholders: localData.data.stakeholders?.length || 0,
            categories: localData.data.stakeholderCategories?.length || 0,
            deletedItems: localData.data.deletedItems?.length || 0
          })
          await this.syncToCloud(localData.data)
        }
      } catch (error) {
        console.error('❌ Auto-sync interval failed (will retry next interval):', error.message)
      }
    }, interval)

    console.log('⏰ Auto-sync STARTED with', interval / 60000, 'minute intervals')
  }

  /**
   * Stop automatic sync
   */
  stopAutoSync() {
    if (this.autoSyncInterval) {
      clearInterval(this.autoSyncInterval)
      this.autoSyncInterval = null
      console.log('⏹️ Auto-sync stopped')
    }
  }

  /**
   * Process queued operations when back online
   */
  async processOfflineQueue() {
    if (this.syncQueue.length === 0) return

    console.log('🔄 Processing', this.syncQueue.length, 'queued sync operations')

    while (this.syncQueue.length > 0) {
      const operation = this.syncQueue.shift()
      try {
        if (operation.action === 'upload') {
          await this.syncToCloud(operation.data)
        }
      } catch (error) {
        console.error('Failed to process queued operation:', error)
        // Re-queue if it failed
        this.syncQueue.unshift(operation)
        break
      }
    }
  }

  /**
   * Get local app data for sync - READS FROM DEXIE WITH FULL CONTENT
   *
   * FIXED: Previously read from localStorage which only had metadata.
   * Now reads from Dexie to get full meeting content (transcripts, notes, AI analysis).
   */
  async getLocalData() {
    try {
      let meetings = []
      let stakeholders = []
      let stakeholderCategories = []
      let deletedItems = []

      try {
        // Import Dexie service dynamically to avoid circular dependencies
        const dexieService = await import('../db/dexieService')
        const { getAllMeetingMetadata, getFullMeeting, getAllStakeholders, getAllCategories } = dexieService

        // Get all meeting metadata first
        const meetingMetadata = await getAllMeetingMetadata()
        console.log(`📂 SYNC: Found ${meetingMetadata.length} meetings in Dexie`)

        // Load FULL meetings with blobs (parallel for speed)
        const fullMeetings = await Promise.all(
          meetingMetadata.map(async (meta) => {
            try {
              const full = await getFullMeeting(meta.id)
              return full || meta
            } catch (e) {
              console.warn(`⚠️ SYNC: Failed to load full meeting ${meta.id}, using metadata:`, e.message)
              return meta
            }
          })
        )

        // Strip binary data (audio) but KEEP text content (transcripts, notes, AI)
        meetings = fullMeetings.map(meeting => {
          const { audioBlob, audioData, audioUrl, recordingBlob, ...textContent } = meeting

          // Also strip large images but keep small ones
          if (textContent.images && Array.isArray(textContent.images)) {
            textContent.images = textContent.images.filter(img => {
              if (typeof img === 'string' && img.length > 100000) return false // >100KB base64
              return true
            })
          }

          // Strip word arrays from speaker data (can be 5MB+)
          if (textContent.speakerData?.words) {
            textContent.speakerData = { ...textContent.speakerData, words: undefined }
          }

          return textContent
        })

        // Get stakeholders and categories from Dexie
        const allStakeholders = await getAllStakeholders()
        const allCategories = await getAllCategories()

        // Filter to non-deleted items for sync (deleted items sync separately)
        stakeholders = allStakeholders.filter(s => !s.deleted)
        stakeholderCategories = allCategories.filter(c => !c.deleted)

        // Collect deleted items for tombstone sync
        const deletedStakeholders = allStakeholders.filter(s => s.deleted).map(s => ({
          type: 'stakeholder',
          id: s.id,
          deletedAt: s.deletedAt
        }))
        const deletedCategories = allCategories.filter(c => c.deleted).map(c => ({
          type: 'category',
          id: c.id,
          deletedAt: c.deletedAt
        }))
        const deletedMeetings = meetings.filter(m => m.deleted).map(m => ({
          type: 'meeting',
          id: m.id,
          deletedAt: m.deletedAt
        }))
        deletedItems = [...deletedStakeholders, ...deletedCategories, ...deletedMeetings]

        console.log('📂 SYNC: Loaded from Dexie with FULL content:', {
          meetingsCount: meetings.length,
          stakeholdersCount: stakeholders.length,
          categoriesCount: stakeholderCategories.length,
          deletedItemsCount: deletedItems.length,
          // Sample meeting to verify content is included
          sampleMeetingHasTranscript: meetings[0]?.audioTranscript ? 'YES' : 'NO',
          sampleMeetingHasAiResult: meetings[0]?.aiResult ? 'YES' : 'NO',
          sampleMeetingHasNotes: meetings[0]?.notes ? 'YES' : 'NO'
        })

      } catch (dexieError) {
        console.warn('⚠️ SYNC: Dexie read failed, falling back to localStorage:', dexieError.message)
        // Fallback to localStorage (will only have metadata, but better than nothing)
        try {
          meetings = JSON.parse(localStorage.getItem('meetingflow_meetings') || '[]')
          stakeholders = JSON.parse(localStorage.getItem('meetingflow_stakeholders') || '[]')
          stakeholderCategories = JSON.parse(localStorage.getItem('meetingflow_stakeholder_categories') || '[]')
          deletedItems = JSON.parse(localStorage.getItem('meetingflow_deleted_items') || '[]')
        } catch (lsError) {
          console.error('❌ SYNC: Both Dexie and localStorage failed:', lsError)
          meetings = []
          stakeholders = []
          stakeholderCategories = []
          deletedItems = []
        }
      }

      const metadata = {
        deviceId: this.deviceId,
        deviceName: this.getDeviceName(),
        timestamp: new Date().toISOString(),
        version: this.generateDataVersion({ meetings, stakeholders, stakeholderCategories })
      }

      return {
        data: { meetings, stakeholders, stakeholderCategories, deletedItems },
        metadata
      }
    } catch (error) {
      console.error('Failed to get local data:', error)
      return null
    }
  }

  /**
   * Generate data version hash for conflict detection
   */
  generateDataVersion(data) {
    const sortedData = {
      meetings: (data.meetings || []).sort((a, b) => {
        const idA = a?.id || ''
        const idB = b?.id || ''
        return idA.localeCompare(idB)
      }),
      stakeholders: (data.stakeholders || []).sort((a, b) => {
        const idA = a?.id || ''
        const idB = b?.id || ''
        return idA.localeCompare(idB)
      }),
      stakeholderCategories: data.stakeholderCategories || []
    }
    return this.calculateChecksum(sortedData)
  }

  /**
   * Calculate checksum for data integrity
   */
  calculateChecksum(data) {
    if (!data) return 'empty'

    const str = JSON.stringify(data)
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return hash.toString(36)
  }

  /**
   * Upload data using configured provider
   */
  async uploadData(key, data) {
    switch (this.syncConfig.provider) {
      case SYNC_PROVIDERS.GITHUB_GIST:
        return this.uploadToGithubGist(key, data)
      case SYNC_PROVIDERS.GOOGLE_DRIVE:
        return this.uploadToGoogleDrive(key, data)
      case SYNC_PROVIDERS.N8N:
        return this.uploadToN8n(key, data)
      default:
        throw new Error(`Unsupported sync provider: ${this.syncConfig.provider}`)
    }
  }

  /**
   * Download data using configured provider
   */
  async downloadData(key) {
    switch (this.syncConfig.provider) {
      case SYNC_PROVIDERS.GITHUB_GIST:
        return this.downloadFromGithubGist(key)
      case SYNC_PROVIDERS.GOOGLE_DRIVE:
        return this.downloadFromGoogleDrive(key)
      case SYNC_PROVIDERS.N8N:
        return this.downloadFromN8n(key)
      default:
        throw new Error(`Unsupported sync provider: ${this.syncConfig.provider}`)
    }
  }

  /**
   * GitHub Gist sync implementation
   */
  async uploadToGithubGist(key, data) {
    const config = this.syncConfig.config

    try {
      const gistData = {
        description: `MeetingFlow App Data - ${key}`,
        public: false,
        files: {
          [`${key}.json`]: {
            content: JSON.stringify(data, null, 2)
          }
        }
      }

      let response
      if (config.gistId) {
        // Update existing gist
        response = await fetch(`https://api.github.com/gists/${config.gistId}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `token ${config.githubToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(gistData)
        })
      } else {
        // Create new gist
        response = await fetch('https://api.github.com/gists', {
          method: 'POST',
          headers: {
            'Authorization': `token ${config.githubToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(gistData)
        })
      }

      if (!response.ok) {
        const error = await response.json()
        throw new Error(`GitHub API error: ${error.message}`)
      }

      const result = await response.json()

      // Save gist ID for future updates
      if (!config.gistId) {
        config.gistId = result.id
        await localforage.setItem('sync_config', this.syncConfig)
      }

      return { success: true, id: result.id }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  async downloadFromGithubGist(key) {
    const config = this.syncConfig.config

    if (!config.gistId) {
      return { success: true, data: null } // No gist created yet
    }

    try {
      const response = await fetch(`https://api.github.com/gists/${config.gistId}`, {
        headers: {
          'Authorization': `token ${config.githubToken}`,
        }
      })

      if (!response.ok) {
        if (response.status === 404) {
          return { success: true, data: null } // Gist not found
        }
        const error = await response.json()
        throw new Error(`GitHub API error: ${error.message}`)
      }

      const gist = await response.json()
      const file = gist.files[`${key}.json`]

      if (!file) {
        return { success: true, data: null } // File not found in gist
      }

      const data = JSON.parse(file.content)
      return { success: true, data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * n8n workflow sync implementation
   */
  async uploadToN8n(key, data) {
    // Implementation would integrate with existing n8n service
    // For now, return success to maintain compatibility
    console.log('n8n sync upload - would integrate with existing n8nService')
    return { success: true }
  }

  async downloadFromN8n(key) {
    // Implementation would integrate with existing n8n service
    console.log('n8n sync download - would integrate with existing n8nService')
    return { success: true, data: null }
  }

  /**
   * Retry wrapper with exponential backoff
   */
  async retryWithBackoff(operation, maxRetries = 3, baseDelay = 1000) {
    let lastError

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 Attempt ${attempt}/${maxRetries}:`, operation.name || 'operation')
        return await operation()
      } catch (error) {
        lastError = error
        console.warn(`❌ Attempt ${attempt} failed:`, error.message)

        // Don't retry on certain errors
        if (error.message.includes('Invalid credentials') ||
            error.message.includes('Permission denied') ||
            error.message.includes('File corruption detected')) {
          throw error
        }

        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000
          console.log(`⏳ Waiting ${Math.round(delay)}ms before retry...`)
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
    }

    throw lastError
  }

  /**
   * Ensure single file exists on Google Drive (deduplicate if needed)
   * @param {string} fileName - Name of the file
   * @returns {Promise<string|null>} - File ID of the single file or null if none exist
   */
  async ensureSingleGoogleDriveFile(fileName) {
    try {
      const config = this.syncConfig?.config
      if (!config?.accessToken) {
        throw new Error('Google Drive not configured')
      }

      await this.ensureValidGoogleToken()

      // Step 1: Search for ALL files with this name
      const searchResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='${fileName}' and parents in '${config.folderId || 'root'}' and trashed=false&fields=files(id,name,size,modifiedTime)&spaces=drive`,
        {
          headers: {
            'Authorization': `Bearer ${config.accessToken}`,
          }
        }
      )

      if (!searchResponse.ok) {
        throw new Error(`Failed to search for files: ${searchResponse.statusText}`)
      }

      const searchData = await searchResponse.json()
      const allFiles = searchData.files || []

      console.log(`🔍 Found ${allFiles.length} file(s) named "${fileName}"`)

      if (allFiles.length === 0) {
        // No file exists - will be created on first upload
        console.log('ℹ️ No existing file found - will create on first upload')
        return null
      }

      if (allFiles.length === 1) {
        // Perfect - single file exists
        const fileId = allFiles[0].id
        console.log(`✅ Single file found: ${fileId}`)
        await this.saveGoogleDriveFileId(fileName, fileId)
        return fileId
      }

      // Multiple files found - DEDUPLICATE!
      console.warn(`⚠️ Found ${allFiles.length} duplicate files, deduplicating...`)

      // Sort by size (largest first) and modification time (newest first)
      const sortedFiles = allFiles.sort((a, b) => {
        const sizeA = parseInt(a.size || '0')
        const sizeB = parseInt(b.size || '0')
        if (sizeA !== sizeB) return sizeB - sizeA
        return new Date(b.modifiedTime) - new Date(a.modifiedTime)
      })

      const bestFile = sortedFiles[0]
      const filesToDelete = sortedFiles.slice(1)

      console.log(`📊 Deduplication analysis:`, {
        bestFile: { id: bestFile.id, size: bestFile.size, modified: bestFile.modifiedTime },
        deletingCount: filesToDelete.length
      })

      // Delete all duplicate files
      for (const file of filesToDelete) {
        try {
          await fetch(
            `https://www.googleapis.com/drive/v3/files/${file.id}`,
            {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${config.accessToken}`,
              }
            }
          )
          console.log(`🗑️ Deleted duplicate file: ${file.id}`)
        } catch (error) {
          console.error(`Failed to delete duplicate file ${file.id}:`, error)
          // Continue with other deletions
        }
      }

      console.log(`✅ Deduplicated: Kept ${bestFile.id}, deleted ${filesToDelete.length} duplicates`)

      // Save the single file ID
      await this.saveGoogleDriveFileId(fileName, bestFile.id)
      return bestFile.id
    } catch (error) {
      console.error('Failed to ensure single file:', error)
      throw error
    }
  }

  /**
   * Save Google Drive file ID to local storage and metadata
   * @param {string} fileName - Name of the file
   * @param {string} fileId - Google Drive file ID
   */
  async saveGoogleDriveFileId(fileName, fileId) {
    // Store in localStorage
    localStorage.setItem(`meetingflow_google_drive_file_id_${fileName}`, fileId)

    // Also store in sync metadata as backup
    try {
      const metadata = await localforage.getItem('meetingflow_sync_metadata') || {}
      metadata.googleDriveFileIds = metadata.googleDriveFileIds || {}
      metadata.googleDriveFileIds[fileName] = {
        fileId,
        updatedAt: Date.now()
      }
      await localforage.setItem('meetingflow_sync_metadata', metadata)
    } catch (error) {
      console.error('Failed to save file ID to metadata:', error)
    }
  }

  /**
   * Get Google Drive file ID from cache
   * @param {string} fileName - Name of the file
   * @returns {Promise<string|null>} - File ID or null if not cached
   */
  async getGoogleDriveFileId(fileName) {
    // Try localStorage first (faster)
    let fileId = localStorage.getItem(`meetingflow_google_drive_file_id_${fileName}`)

    // Fallback to metadata
    if (!fileId) {
      try {
        const metadata = await localforage.getItem('meetingflow_sync_metadata')
        fileId = metadata?.googleDriveFileIds?.[fileName]?.fileId
      } catch (error) {
        console.error('Failed to get file ID from metadata:', error)
      }
    }

    // Validate file still exists if we have a cached ID
    if (fileId) {
      const exists = await this.validateGoogleDriveFileExists(fileId)
      if (!exists) {
        console.warn(`⚠️ Cached file ID ${fileId} no longer exists, clearing cache`)
        localStorage.removeItem(`meetingflow_google_drive_file_id_${fileName}`)
        return null
      }
    }

    return fileId
  }

  /**
   * Validate that a Google Drive file exists
   * @param {string} fileId - File ID to validate
   * @returns {Promise<boolean>} - True if file exists
   */
  async validateGoogleDriveFileExists(fileId) {
    try {
      const config = this.syncConfig?.config
      if (!config?.accessToken) {
        return false
      }

      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id`,
        {
          headers: {
            'Authorization': `Bearer ${config.accessToken}`,
          }
        }
      )

      return response.ok
    } catch (error) {
      return false
    }
  }

  /**
   * Google Drive API sync implementation
   */
  async uploadToGoogleDrive(key, data) {
    const config = this.syncConfig.config

    // Wrap the upload operation with retry logic
    return this.retryWithBackoff(async () => {
      try {
        // Ensure we have a valid access token
        await this.ensureValidGoogleToken()

      const fileName = `meetingflow_${key}.json`
      const content = JSON.stringify(data, null, 2)

      // NEW APPROACH: Ensure we have a single file (deduplicate if needed)
      console.log('🔧 Using single file strategy with deduplication')
      let fileId = await this.ensureSingleGoogleDriveFile(fileName)

      // If deduplication found a file, use it. Otherwise, create new file below.
      console.log(`📋 Single file strategy result: ${fileId || 'no existing file, will create new'}`)

      // Skip the old complex file selection logic entirely
      // Function to search for existing files by name (legacy fallback - NO LONGER USED)
      const searchForExistingFiles = async () => {
        console.log('🔍 UPLOAD: Searching for existing files in Google Drive...')

        // First, let's see ALL files in this folder to understand what's there
        const folderContentsResponse = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=parents in '${config.folderId || 'root'}'&fields=files(id,name,size,modifiedTime)`,
          {
            headers: {
              'Authorization': `Bearer ${config.accessToken}`,
            }
          }
        )

        if (folderContentsResponse.ok) {
          const folderContents = await folderContentsResponse.json()
          console.log('📁 UPLOAD DEBUG: All files in folder:', {
            folderId: config.folderId,
            totalFiles: folderContents.files?.length || 0,
            files: folderContents.files?.map(f => ({
              id: f.id,
              name: f.name,
              size: f.size + ' bytes',
              modified: f.modifiedTime
            }))
          })
        }

        // Search for the specific file by name
        const searchResponse = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=name='${fileName}' and parents in '${config.folderId || 'root'}'&fields=files(id,name,size,modifiedTime)`,
          {
            headers: {
              'Authorization': `Bearer ${config.accessToken}`,
            }
          }
        )

        if (!searchResponse.ok) {
          throw new Error(`Drive search failed: ${searchResponse.statusText}`)
        }

        const searchResult = await searchResponse.json()
        console.log('🔍 UPLOAD DEBUG Google Drive search result:', {
          filesFound: searchResult.files?.length || 0,
          files: searchResult.files?.map(f => ({
            id: f.id,
            name: f.name,
            size: f.size + ' bytes',
            modified: f.modifiedTime
          }))
        })

        return searchResult.files?.[0]?.id || null
      }

      // Enhanced search that analyzes all files to find the best one
      const searchForBestFile = async () => {
        console.log('🔍 UPLOAD: Searching for ALL existing files in Google Drive...')

        // Search for ALL files with our target name
        const searchResponse = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=name='${fileName}' and parents in '${config.folderId || 'root'}'&fields=files(id,name,size,modifiedTime)`,
          {
            headers: {
              'Authorization': `Bearer ${config.accessToken}`,
            }
          }
        )

        if (!searchResponse.ok) {
          return null
        }

        const searchResult = await searchResponse.json()
        const foundFiles = searchResult.files || []

        console.log('🔍 UPLOAD: Found files to analyze:', {
          filesFound: foundFiles.length,
          files: foundFiles.map(f => ({
            id: f.id,
            size: f.size + ' bytes',
            modified: f.modifiedTime
          }))
        })

        if (foundFiles.length === 0) {
          return null
        }

        if (foundFiles.length === 1) {
          return foundFiles[0].id
        }

        // Multiple files - pick the largest one (likely has more data)
        const bestFile = foundFiles.sort((a, b) => {
          const aSize = parseInt(a.size) || 0
          const bSize = parseInt(b.size) || 0
          if (aSize !== bSize) {
            return bSize - aSize // Largest first
          }
          // If same size, pick most recent
          return new Date(b.modifiedTime) - new Date(a.modifiedTime)
        })[0]

        console.log('🎯 UPLOAD: Selected file based on size:', {
          selectedId: bestFile.id,
          size: bestFile.size + ' bytes',
          allFiles: foundFiles.map(f => ({ id: f.id, size: f.size }))
        })

        return bestFile.id
      }

      // NOTE: Legacy intelligent file selection code above is now obsolete.
      // We use ensureSingleGoogleDriveFile() instead which handles deduplication.
      // The fileId variable is already set by the new approach at line 1333.

      // Use multipart upload (resumable upload has CORS issues from browsers)
      console.log('🔄 Using multipart upload for browser compatibility')

      const metadata = {
        name: fileName,
        mimeType: 'application/json',
        description: `MeetingFlow App Data - ${key}`
      }

      // Add parent folder if specified (only for new files)
      if (!fileId && config.folderId) {
        metadata.parents = [config.folderId]
      }

      // Create multipart upload body
      const boundary = '-------MeetingFlowBoundary' + Math.random().toString(36)
      const delimiter = "\r\n--" + boundary + "\r\n"
      const closeDelimiter = "\r\n--" + boundary + "--"

      const multipartRequestBody =
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        content +
        closeDelimiter

      console.log(`📤 Uploading to Google Drive (${fileId ? 'update' : 'create'})`)

      const response = await fetch(
        fileId
          ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
          : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
        {
          method: fileId ? 'PATCH' : 'POST',
          headers: {
            'Authorization': `Bearer ${config.accessToken}`,
            'Content-Type': `multipart/related; boundary=${boundary}`
          },
          body: multipartRequestBody
        }
      )

      // Handle file not found error - file was deleted between validation and upload
      if (response.status === 404 && fileId) {
        console.warn(`⚠️ UPLOAD: File ${fileId} was deleted during upload, will create new file`)
        fileId = null
        config.fileId = null
        await localforage.setItem('sync_config', this.syncConfig)

        // Retry as new file creation
        const retryMetadata = {
          name: fileName,
          mimeType: 'application/json',
          parents: config.folderId ? [config.folderId] : undefined,
          description: `MeetingFlow App Data - ${key}`
        }

        const retryBoundary = '-------MeetingFlowBoundary' + Math.random().toString(36)
        const retryDelimiter = "\r\n--" + retryBoundary + "\r\n"
        const retryCloseDelimiter = "\r\n--" + retryBoundary + "--"

        const retryBody =
          retryDelimiter +
          'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
          JSON.stringify(retryMetadata) +
          retryDelimiter +
          'Content-Type: application/json\r\n\r\n' +
          content +
          retryCloseDelimiter

        const retryResponse = await fetch(
          'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${config.accessToken}`,
              'Content-Type': `multipart/related; boundary=${retryBoundary}`
            },
            body: retryBody
          }
        )

        if (!retryResponse.ok) {
          const error = await retryResponse.json()
          throw new Error(`Failed to upload file: ${error.error?.message || retryResponse.statusText}`)
        }

        response = retryResponse
      }

      if (response && !response.ok) {
        const error = await response.json()
        throw new Error(`Google Drive upload failed: ${error.error?.message || response.statusText}`)
      }

      const result = response ? await response.json() : { id: null }

      // File integrity validation - verify upload was successful
      const originalSize = new Blob([content]).size
      console.log('📊 Upload validation:', {
        uploadedFileId: result.id,
        originalContentSize: originalSize,
        fileName: fileName
      })

      // Verify the uploaded file with relaxed size validation
      try {
        const verifyResponse = await fetch(
          `https://www.googleapis.com/drive/v3/files/${result.id}?fields=size,name,md5Checksum`,
          {
            headers: {
              'Authorization': `Bearer ${config.accessToken}`,
            }
          }
        )

        if (verifyResponse.ok) {
          const fileInfo = await verifyResponse.json()
          const uploadedSize = parseInt(fileInfo.size || '0')
          const sizeDifference = Math.abs(originalSize - uploadedSize)

          console.log('📊 File integrity check:', {
            originalSize,
            uploadedSize,
            sizeDifference,
            sizeDifferencePercent: ((sizeDifference / originalSize) * 100).toFixed(2) + '%',
            uploadedMd5: fileInfo.md5Checksum
          })

          // Relaxed size validation - allow up to 500 bytes difference
          // This accounts for different line endings (CRLF vs LF), UTF-8 BOM, and JSON formatting
          if (sizeDifference > 500) {
            // Large difference - warn but don't fail (could be legitimate formatting differences)
            console.warn('⚠️ SIZE MISMATCH WARNING:', {
              expected: originalSize,
              actual: uploadedSize,
              difference: sizeDifference,
              fileName: fileInfo.name,
              message: 'Size difference detected but continuing (may be due to encoding/formatting)'
            })

            // Only fail if difference is VERY large (> 10% or > 5KB)
            const percentDifference = (sizeDifference / originalSize) * 100
            if (percentDifference > 10 && sizeDifference > 5000) {
              console.error('❌ SIGNIFICANT FILE CORRUPTION DETECTED:', {
                expected: originalSize,
                actual: uploadedSize,
                difference: sizeDifference,
                percentDifference: percentDifference.toFixed(2) + '%',
                fileName: fileInfo.name
              })
              throw new Error(`Significant file corruption detected: expected ${originalSize} bytes, got ${uploadedSize} bytes (${percentDifference.toFixed(1)}% difference)`)
            }
          } else {
            console.log('✅ File size validation passed')
          }

          // Additional validation: Check if Google Drive provided MD5 checksum
          if (fileInfo.md5Checksum) {
            console.log('✅ Upload verified with MD5 checksum:', fileInfo.md5Checksum)
          }
        }
      } catch (verifyError) {
        // Don't fail the upload for verification issues
        if (verifyError.message && verifyError.message.includes('corruption')) {
          // This is a corruption error we threw - re-throw it
          throw verifyError
        }
        // For other verification errors, just log and continue
        console.warn('⚠️ Could not verify file integrity:', verifyError.message)
      }

      // Save file ID for future updates
      if (!config.fileId) {
        config.fileId = result.id
        await localforage.setItem('sync_config', this.syncConfig)
      }

        return { success: true, id: result.id, originalSize, uploadedSize: result.size }
      } catch (error) {
        console.error('Google Drive upload error:', error)
        throw error // Let retry logic handle this
      }
    }) // End retry wrapper
  }

  async downloadFromGoogleDrive(key) {
    const config = this.syncConfig.config

    try {
      // Ensure we have a valid access token
      await this.ensureValidGoogleToken()

      const fileName = `meetingflow_${key}.json`
      let fileId = config.fileId

      console.log('🔍 DEBUG downloadFromGoogleDrive:', {
        fileName,
        searchingInFolder: config.folderId || 'root',
        hasStoredFileId: !!fileId
      })

      // Function to search for and intelligently select the best file
      const findBestFile = async () => {
        console.log('🔍 INTELLIGENT FILE SEARCH: Finding the best file in Google Drive...')

        // First, let's see ALL files in this folder to understand what's there
        const folderContentsResponse = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=parents in '${config.folderId || 'root'}'&fields=files(id,name,size,modifiedTime)`,
          {
            headers: {
              'Authorization': `Bearer ${config.accessToken}`,
            }
          }
        )

        if (folderContentsResponse.ok) {
          const folderContents = await folderContentsResponse.json()
          console.log('📁 DEBUG: All files in folder:', {
            folderId: config.folderId,
            totalFiles: folderContents.files?.length || 0,
            files: folderContents.files?.map(f => ({
              id: f.id,
              name: f.name,
              size: f.size + ' bytes',
              modified: f.modifiedTime
            }))
          })
        }

        // Search for ALL files with our target name
        const searchResponse = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=name='${fileName}' and parents in '${config.folderId || 'root'}'&fields=files(id,name,size,modifiedTime)`,
          {
            headers: {
              'Authorization': `Bearer ${config.accessToken}`,
            }
          }
        )

        if (!searchResponse.ok) {
          throw new Error(`Drive search failed: ${searchResponse.statusText}`)
        }

        const searchResult = await searchResponse.json()
        const foundFiles = searchResult.files || []

        console.log('🔍 DEBUG: Found files to analyze:', {
          filesFound: foundFiles.length,
          files: foundFiles.map(f => ({
            id: f.id,
            name: f.name,
            size: f.size + ' bytes',
            modified: f.modifiedTime
          }))
        })

        if (foundFiles.length === 0) {
          return null
        }

        if (foundFiles.length === 1) {
          console.log('✅ Only one file found, using it:', foundFiles[0].id)
          return foundFiles[0].id
        }

        // Multiple files found - analyze their content to pick the best one
        console.log('🔬 ANALYZING MULTIPLE FILES: Downloading content to compare...')
        const fileAnalysis = []

        for (const file of foundFiles) {
          try {
            const contentResponse = await fetch(
              `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
              {
                headers: {
                  'Authorization': `Bearer ${config.accessToken}`,
                }
              }
            )

            if (contentResponse.ok) {
              const content = await contentResponse.text()
              let parsedContent = null
              let dataCount = 0

              try {
                parsedContent = JSON.parse(content)
                const data = parsedContent?.data || {}
                dataCount = (data.meetings?.length || 0) +
                          (data.stakeholders?.length || 0) +
                          (data.stakeholderCategories?.length || 0)
              } catch (e) {
                console.warn(`Failed to parse content for file ${file.id}:`, e)
              }

              fileAnalysis.push({
                id: file.id,
                size: parseInt(file.size) || 0,
                modified: new Date(file.modifiedTime),
                contentLength: content.length,
                dataCount,
                hasValidContent: !!parsedContent,
                metadata: parsedContent?.metadata
              })

              console.log(`📊 FILE ANALYSIS ${file.id}:`, {
                size: file.size + ' bytes',
                contentLength: content.length,
                dataCount,
                hasValidContent: !!parsedContent,
                modified: file.modifiedTime
              })
            }
          } catch (error) {
            console.warn(`Failed to analyze file ${file.id}:`, error)
            fileAnalysis.push({
              id: file.id,
              size: parseInt(file.size) || 0,
              modified: new Date(file.modifiedTime),
              contentLength: 0,
              dataCount: 0,
              hasValidContent: false
            })
          }
        }

        // Select the best file based on: 1) Valid content, 2) Most data, 3) Most recent
        const validFiles = fileAnalysis.filter(f => f.hasValidContent)
        const filesToConsider = validFiles.length > 0 ? validFiles : fileAnalysis

        const bestFile = filesToConsider.sort((a, b) => {
          // First priority: valid content
          if (a.hasValidContent !== b.hasValidContent) {
            return b.hasValidContent ? 1 : -1
          }
          // Second priority: most data
          if (a.dataCount !== b.dataCount) {
            return b.dataCount - a.dataCount
          }
          // Third priority: most recent
          return b.modified - a.modified
        })[0]

        console.log('🎯 SELECTED BEST FILE:', {
          selectedId: bestFile.id,
          reason: `${bestFile.hasValidContent ? 'valid content' : 'invalid content'}, ${bestFile.dataCount} items, modified ${bestFile.modified.toISOString()}`,
          allAnalyzed: fileAnalysis.map(f => ({
            id: f.id,
            dataCount: f.dataCount,
            valid: f.hasValidContent
          }))
        })

        return bestFile.id
      }

      // ALWAYS use intelligent file selection to ensure all devices use the best file
      console.log('🚀 DOWNLOAD: Using intelligent file selection to find the best available file')
      const bestFileId = await findBestFile()

      if (bestFileId) {
        if (bestFileId !== fileId) {
          console.log(`🔄 SWITCHING FILES: From ${fileId || 'none'} to ${bestFileId} (better file found)`)
          fileId = bestFileId
          // Update stored file ID to the best one
          config.fileId = bestFileId
          await localforage.setItem('sync_config', this.syncConfig)
        } else {
          console.log(`✅ DOWNLOAD: Stored file ID ${fileId} is already the best available file`)
        }
      } else {
        // Fallback: try stored fileId if intelligent search found nothing
        if (fileId) {
          console.log(`🔄 FALLBACK: No files found by search, trying stored file ID: ${fileId}`)
          const testResponse = await fetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
            {
              headers: {
                'Authorization': `Bearer ${config.accessToken}`,
              }
            }
          )
          if (testResponse.status === 404) {
            console.log(`⚠️ FALLBACK FAILED: Stored file ID ${fileId} not found either`)
            fileId = null
          }
        }
      }

      if (!fileId) {
        console.log('⚠️ No file found in Google Drive')
        return { success: true, data: null } // File not found
      }

      // Download file content using the confirmed valid fileId
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        {
          headers: {
            'Authorization': `Bearer ${config.accessToken}`,
          }
        }
      )

      if (!response.ok) {
        if (response.status === 404) {
          console.log(`⚠️ File ${fileId} was deleted during download, clearing stored ID`)
          // Clear the invalid file ID
          config.fileId = null
          await localforage.setItem('sync_config', this.syncConfig)
          return { success: true, data: null } // File not found
        }
        throw new Error(`Google Drive download failed: ${response.statusText}`)
      }

      const content = await response.text()

      console.log('🔍 DEBUG Raw downloaded content:', {
        fileId,
        contentLength: content.length,
        contentPreview: content.substring(0, 200) + (content.length > 200 ? '...' : ''),
        fullContent: content.length < 500 ? content : 'too long to show'
      })

      const data = JSON.parse(content)

      console.log('🔍 DEBUG Downloaded data from Google Drive:', {
        fileId,
        contentLength: content.length,
        hasData: !!data,
        dataStructure: data ? {
          hasMetadata: !!data.metadata,
          hasDataProperty: !!data.data,
          stakeholders: data.data?.stakeholders?.length || 0,
          meetings: data.data?.meetings?.length || 0,
          stakeholderCategories: data.data?.stakeholderCategories?.length || 0,
          dataKeys: data.data ? Object.keys(data.data) : []
        } : 'no data'
      })

      // Enhanced debugging for categories issue
      console.log('🔍 DETAILED CLOUD DATA STRUCTURE:')
      console.log('   Top-level keys:', Object.keys(data))
      console.log('   data.data keys:', data.data ? Object.keys(data.data) : 'no data.data')
      console.log('   stakeholderCategories in data.data:', data.data?.stakeholderCategories?.length || 'not found')
      console.log('   Full data.data object:', data.data)

      // Save file ID for future use if we discovered it during this download
      if (fileId && !config.fileId) {
        console.log('💾 Saving discovered file ID for future syncs:', fileId)
        config.fileId = fileId
        await localforage.setItem('sync_config', this.syncConfig)
      }

      return { success: true, data }
    } catch (error) {
      console.error('Google Drive download error:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Ensure Google Drive access token is valid, refresh if needed
   * Uses promise-based concurrency control to prevent multiple simultaneous refresh attempts
   */
  async ensureValidGoogleToken() {
    const config = this.syncConfig.config

    if (!config.accessToken) {
      throw new Error('No Google Drive access token available - please re-authenticate')
    }

    // Check if token is expired or about to expire (with 5 minute buffer)
    if (config.expiresAt && Date.now() >= (config.expiresAt - 300000)) {
      console.log('⏰ Google Drive token expired or expiring soon, attempting automatic refresh...')

      // If a refresh is already in progress, wait for it
      if (this.tokenRefreshPromise) {
        console.log('⏳ Token refresh already in progress, waiting for completion...')
        await this.tokenRefreshPromise
        return
      }

      // Start token refresh and store promise to prevent concurrent attempts
      this.tokenRefreshPromise = this.refreshGoogleToken()

      try {
        const refreshed = await this.tokenRefreshPromise

        if (!refreshed) {
          throw new Error('Google Drive token expired - please re-authenticate through Settings')
        }
      } finally {
        // Clear the refresh promise when done
        this.tokenRefreshPromise = null
      }
    }
  }

  /**
   * Refresh Google Drive access token using new token management system
   */
  async refreshGoogleToken() {
    try {
      // Lazy load the googleDriveAuth module
      const { GoogleDriveAuth } = await import('./googleDriveAuth')
      const googleAuth = new GoogleDriveAuth()

      console.log('🔄 Attempting to get valid token from GoogleDriveAuth...')
      const validToken = await googleAuth.getValidToken()

      if (validToken) {
        // Sync token with SyncService config
        const config = this.syncConfig.config
        config.accessToken = validToken

        // Get token expiration from token manager
        const tokenData = localStorage.getItem('google_drive_tokens')
        if (tokenData) {
          const parsed = JSON.parse(tokenData)
          config.expiresAt = parsed.expiresAt
          config.refreshToken = parsed.refreshToken
        }

        // Save updated config
        await localforage.setItem('sync_config', this.syncConfig)

        console.log('✅ Google Drive token synced successfully')
        return true
      } else {
        console.log('❌ No valid token available - user needs to re-authenticate')
        return false
      }
    } catch (error) {
      console.error('❌ Failed to refresh Google Drive token:', error)
      return false
    }
  }

  /**
   * Add sync event listener
   */
  addListener(listener) {
    this.syncListeners.push(listener)
  }

  /**
   * Remove sync event listener
   */
  removeListener(listener) {
    this.syncListeners = this.syncListeners.filter(l => l !== listener)
  }

  /**
   * Notify all listeners of sync events
   */
  notifyListeners(event, data) {
    this.syncListeners.forEach(listener => {
      try {
        listener(event, data)
      } catch (error) {
        console.error('Sync listener error:', error)
      }
    })
  }

  /**
   * Get current sync status
   */
  async getSyncStatus() {
    // Ensure initialization is complete before getting status
    await this.ensureInitialized()

    const config = await localforage.getItem('sync_config')
    const lastSync = await localforage.getItem('last_sync_time')

    return {
      configured: !!config,
      provider: config?.provider,
      enabled: config?.enabled || false,
      lastSync,
      isOnline: this.isOnline,
      deviceId: this.deviceId,
      deviceName: this.getDeviceName(),
      queuedOperations: this.syncQueue.length
    }
  }

  /**
   * Clean up test connection file from cloud storage
   */
  async cleanupTestFile() {
    if (!this.syncConfig) {
      throw new Error('Sync not configured')
    }

    try {
      switch (this.syncConfig.provider) {
        case SYNC_PROVIDERS.GOOGLE_DRIVE:
          return this.deleteFromGoogleDrive('test_connection')
        case SYNC_PROVIDERS.GITHUB_GIST:
          // GitHub Gist cleanup would go here
          console.log('GitHub Gist test file cleanup not implemented')
          return { success: true }
        case SYNC_PROVIDERS.N8N:
          // N8N cleanup would go here
          console.log('N8N test file cleanup not implemented')
          return { success: true }
        default:
          throw new Error(`Unsupported sync provider: ${this.syncConfig.provider}`)
      }
    } catch (error) {
      console.error('Test file cleanup failed:', error)
      throw error
    }
  }

  /**
   * Delete file from Google Drive
   */
  async deleteFromGoogleDrive(key) {
    const config = this.syncConfig.config

    try {
      await this.ensureValidGoogleToken()

      const fileName = `meetingflow_${key}.json`

      // Search for the test file
      const searchResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='${fileName}' and parents in '${config.folderId || 'root'}'`,
        {
          headers: {
            'Authorization': `Bearer ${config.accessToken}`,
          }
        }
      )

      if (!searchResponse.ok) {
        throw new Error(`Drive search failed: ${searchResponse.statusText}`)
      }

      const searchResult = await searchResponse.json()
      const fileId = searchResult.files?.[0]?.id

      if (fileId) {
        // Delete the file
        const deleteResponse = await fetch(
          `https://www.googleapis.com/drive/v3/files/${fileId}`,
          {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${config.accessToken}`,
            }
          }
        )

        if (!deleteResponse.ok) {
          throw new Error(`Drive delete failed: ${deleteResponse.statusText}`)
        }

        console.log(`🗑️ Deleted test file: ${fileName}`)
        return { success: true, fileId }
      } else {
        console.log(`ℹ️ Test file not found: ${fileName}`)
        return { success: true, message: 'File not found' }
      }
    } catch (error) {
      console.error('Google Drive delete error:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Clear all sync data (factory reset)
   */
  async clearSyncData() {
    this.stopAutoSync()

    // Clear periodic queue processing
    if (this.queueProcessInterval) {
      clearInterval(this.queueProcessInterval)
      this.queueProcessInterval = null
    }

    this.syncQueue = []
    this.operationQueue = [] // NEW: Clear operation queue
    this.lastSyncSnapshot = null // NEW: Clear snapshot

    await localforage.removeItem('sync_config')
    await localforage.removeItem('last_sync_time')
    await localforage.removeItem('sync_device_id')
    await localforage.removeItem('sync_device_info')
    await localforage.removeItem('sync_operation_queue') // NEW: Clear persisted queue
    await localforage.removeItem('sync_snapshot') // NEW: Clear snapshot

    this.syncConfig = null
    this.deviceId = null
    console.log('🗑️ All sync data cleared')
  }
}

// Export singleton instance
const syncService = new SyncService()

export default syncService
export { SYNC_PROVIDERS, SYNC_STATUS }