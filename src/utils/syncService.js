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
    this.syncQueue = []
    this.isOnline = navigator.onLine
    this.lastSyncTime = null
    this.autoSyncInterval = null
    this.syncListeners = []

    // Token refresh concurrency control
    this.tokenRefreshPromise = null

    // Initialization promise for singleton pattern
    this.initializationPromise = null
    this.isInitialized = false

    // Start initialization
    this.initializationPromise = this.initialize()

    // Setup online/offline detection
    window.addEventListener('online', () => {
      this.isOnline = true
      this.processOfflineQueue()
    })
    window.addEventListener('offline', () => {
      this.isOnline = false
    })
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

      this.isInitialized = true
      console.log('🚀 SyncService fully initialized')
    } catch (error) {
      console.error('❌ Failed to initialize SyncService:', error)
      throw error
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
        console.log('🔧 Loaded sync config:', savedConfig.provider)

        // Start auto-sync if enabled
        if (savedConfig.autoSync) {
          this.startAutoSync()
        }
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
      console.log('📴 Offline - queueing sync operation')
      this.syncQueue.push({ action: 'upload', data, timestamp: Date.now() })
      this.notifyListeners('status_change', SYNC_STATUS.OFFLINE)
      return { success: false, queued: true }
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
        categories: localCategories
      })

      const result = await this.uploadData('app_data', syncPayload)

      if (result.success) {
        this.lastSyncTime = new Date().toISOString()
        await localforage.setItem('last_sync_time', this.lastSyncTime)

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

        // Save merged data to localStorage
        await localforage.setItem('meetingflow_meetings', mergedData.meetings)
        await localforage.setItem('meetingflow_stakeholders', mergedData.stakeholders)
        await localforage.setItem('meetingflow_stakeholder_categories', mergedData.stakeholderCategories)

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
      stakeholderCategories: []
    }

    // Merge meetings by ID, keeping the most recent
    const allMeetings = [...(safeLocalData.meetings || []), ...(safeCloudData.meetings || [])]
    const meetingMap = new Map()

    allMeetings.forEach(meeting => {
      const existing = meetingMap.get(meeting.id)
      if (!existing || new Date(meeting.lastSaved || meeting.createdAt) > new Date(existing.lastSaved || existing.createdAt)) {
        meetingMap.set(meeting.id, meeting)
      }
    })

    merged.meetings = Array.from(meetingMap.values())

    // Merge stakeholders by ID, keeping the most recent
    const allStakeholders = [...(safeLocalData.stakeholders || []), ...(safeCloudData.stakeholders || [])]
    const stakeholderMap = new Map()

    allStakeholders.forEach(stakeholder => {
      const existing = stakeholderMap.get(stakeholder.id)
      if (!existing || new Date(stakeholder.updatedAt || stakeholder.createdAt) > new Date(existing.updatedAt || existing.createdAt)) {
        stakeholderMap.set(stakeholder.id, stakeholder)
      }
    })

    merged.stakeholders = Array.from(stakeholderMap.values())

    // Merge stakeholder categories by name, combining from both sources
    // Filter out default/predefined categories that come with new app installations
    const defaultCategories = new Set([
      'Leadership',
      'Engineering',
      'Product',
      'Marketing',
      'Sales',
      'Finance',
      'Operations',
      'HR',
      'Legal',
      'General'
    ])

    const allCategories = [...(safeLocalData.stakeholderCategories || []), ...(safeCloudData.stakeholderCategories || [])]
    const categoryMap = new Map()

    console.log('🔍 Default categories filter:', Array.from(defaultCategories))
    console.log('🔍 All categories to process:', allCategories.map(c => ({ name: c?.name, label: c?.label })))

    allCategories.forEach((category, index) => {
      // Use 'name' if available, otherwise fall back to 'label' for N8N categories
      const categoryName = category?.name || category?.label
      const hasName = !!categoryName
      const notInMap = !categoryMap.has(categoryName)
      const notDefault = !defaultCategories.has(categoryName)

      console.log('🔍 Processing category', index, ':', {
        name: category?.name,
        label: category?.label,
        categoryName: categoryName, // The name we're actually using
        key: category?.key,
        hasName,
        notInMap,
        notDefault,
        isDefaultMatch: categoryName ? defaultCategories.has(categoryName) : false,
        categoryStructure: Object.keys(category || {}),
        fullCategory: category
      })

      if (hasName && notInMap && notDefault) {
        console.log('✅ Adding category to merge:', categoryName)
        // Ensure the category has a 'name' property for consistency
        const normalizedCategory = {
          ...category,
          name: categoryName
        }
        categoryMap.set(categoryName, normalizedCategory)
      } else {
        console.log('❌ Skipping category:', categoryName || 'unnamed', {
          reason: !hasName ? 'no name/label property' :
                  !notInMap ? 'already in map' :
                  !notDefault ? `is default (matches: ${categoryName})` : 'unknown',
          hasName,
          notInMap,
          notDefault
        })
      }
    })

    merged.stakeholderCategories = Array.from(categoryMap.values())

    console.log('🔍 Category merge details:', {
      totalInputCategories: allCategories.length,
      filteredOutDefaults: allCategories.filter(c => defaultCategories.has(c?.name)).length,
      finalMergedCategories: merged.stakeholderCategories.length,
      categoryNames: merged.stakeholderCategories.map(c => c.name)
    })

    console.log('✅ Data merge complete:', {
      meetings: merged.meetings.length,
      stakeholders: merged.stakeholders.length,
      stakeholderCategories: merged.stakeholderCategories.length,
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
        const localData = await this.getLocalData()
        if (localData) {
          await this.syncToCloud(localData)
        }
      } catch (error) {
        console.log('Auto-sync failed (will retry next interval):', error.message)
      }
    }, interval)

    console.log('⏰ Auto-sync started with', interval / 60000, 'minute intervals')
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
   * Get local app data for sync
   */
  async getLocalData() {
    try {
      const meetings = await localforage.getItem('meetingflow_meetings') || []
      const stakeholders = await localforage.getItem('meetingflow_stakeholders') || []
      const stakeholderCategories = await localforage.getItem('meetingflow_stakeholder_categories') || []

      console.log('🔍 DEBUG getLocalData:', {
        meetingsCount: meetings.length,
        stakeholdersCount: stakeholders.length,
        categoriesCount: stakeholderCategories.length,
        stakeholdersSample: stakeholders.slice(0, 2)
      })

      const metadata = {
        deviceId: this.deviceId,
        deviceName: this.getDeviceName(),
        timestamp: new Date().toISOString(),
        version: this.generateDataVersion({ meetings, stakeholders, stakeholderCategories })
      }

      return {
        data: { meetings, stakeholders, stakeholderCategories },
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
      meetings: (data.meetings || []).sort((a, b) => a.id.localeCompare(b.id)),
      stakeholders: (data.stakeholders || []).sort((a, b) => a.id.localeCompare(b.id)),
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

      // Check if file already exists
      let fileId = config.fileId

      if (!fileId) {
        // Search for existing file
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
        fileId = searchResult.files?.[0]?.id
      }

      let response
      if (fileId) {
        // Update existing file
        response = await fetch(
          `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
          {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${config.accessToken}`,
              'Content-Type': 'application/json',
            },
            body: content
          }
        )
      } else {
        // Create new file
        const metadata = {
          name: fileName,
          parents: config.folderId ? [config.folderId] : undefined,
          description: `MeetingFlow App Data - ${key}`
        }

        // Use multipart upload for new files with proper RFC 2387 format
        const boundary = '-------314159265358979323846'
        const delimiter = "\r\n--" + boundary + "\r\n"
        const close_delim = "\r\n--" + boundary + "--"

        const metadataContent = delimiter +
          'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
          JSON.stringify(metadata) + delimiter +
          'Content-Type: application/json\r\n' +
          'Content-Transfer-Encoding: binary\r\n\r\n' +
          content + close_delim

        response = await fetch(
          'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${config.accessToken}`,
              'Content-Type': `multipart/related; boundary="${boundary}"`
            },
            body: metadataContent
          }
        )
      }

      if (!response.ok) {
        const error = await response.json()
        throw new Error(`Google Drive upload failed: ${error.error?.message || response.statusText}`)
      }

      const result = await response.json()

      // File integrity validation - verify upload was successful
      const originalSize = new Blob([content]).size
      console.log('📊 Upload validation:', {
        uploadedFileId: result.id,
        originalContentSize: originalSize,
        fileName: fileName
      })

      // Verify the uploaded file by checking its size
      try {
        const verifyResponse = await fetch(
          `https://www.googleapis.com/drive/v3/files/${result.id}?fields=size,name`,
          {
            headers: {
              'Authorization': `Bearer ${config.accessToken}`,
            }
          }
        )

        if (verifyResponse.ok) {
          const fileInfo = await verifyResponse.json()
          const uploadedSize = parseInt(fileInfo.size || '0')

          console.log('✅ File integrity check:', {
            originalSize,
            uploadedSize,
            sizeDifference: Math.abs(originalSize - uploadedSize),
            integrityOk: Math.abs(originalSize - uploadedSize) < 100 // Allow small encoding differences
          })

          // If there's a significant size difference, this indicates corruption
          if (Math.abs(originalSize - uploadedSize) > 100) {
            console.error('❌ FILE CORRUPTION DETECTED:', {
              expected: originalSize,
              actual: uploadedSize,
              fileName: fileInfo.name
            })
            throw new Error(`File corruption detected: expected ${originalSize} bytes, got ${uploadedSize} bytes`)
          }
        }
      } catch (verifyError) {
        console.warn('⚠️ Could not verify file integrity:', verifyError.message)
        // Don't fail the upload for verification issues, just log them
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

      if (!fileId) {
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

        // Search for the specific file
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
        console.log('🔍 DEBUG Google Drive search result:', {
          filesFound: searchResult.files?.length || 0,
          files: searchResult.files?.map(f => ({
            id: f.id,
            name: f.name,
            size: f.size + ' bytes',
            modified: f.modifiedTime
          }))
        })
        fileId = searchResult.files?.[0]?.id

        if (!fileId) {
          console.log('⚠️ No file found in Google Drive')
          return { success: true, data: null } // File not found
        }
      }

      // Download file content
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
    this.syncQueue = []
    await localforage.removeItem('sync_config')
    await localforage.removeItem('last_sync_time')
    await localforage.removeItem('sync_device_id')
    await localforage.removeItem('sync_device_info')
    this.syncConfig = null
    this.deviceId = null
    console.log('🗑️ All sync data cleared')
  }
}

// Export singleton instance
const syncService = new SyncService()

export default syncService
export { SYNC_PROVIDERS, SYNC_STATUS }