import localforage from 'localforage'

class StorageManager {
  constructor() {
    // Configure localforage for better performance
    localforage.config({
      driver: [localforage.INDEXEDDB, localforage.WEBSQL, localforage.LOCALSTORAGE],
      name: 'MeetingFlow',
      version: 1.0,
      size: 4980736, // Size in bytes
      storeName: 'meetingflow_data',
      description: 'MeetingFlow application data storage'
    })

    this.keys = {
      MEETINGS: 'meetings',
      STAKEHOLDERS: 'stakeholders', 
      USER_PREFERENCES: 'userPreferences',
      SEARCH_HISTORY: 'searchHistory',
      EXPORT_HISTORY: 'exportHistory',
      CAMERA_SETTINGS: 'cameraSettings',
      NOTIFICATIONS: 'notifications',
      APP_STATE: 'appState',
      CACHED_DATA: 'cachedData'
    }

    this.syncQueue = []
    this.isOnline = navigator.onLine
    this.setupEventListeners()
  }

  setupEventListeners() {
    // Monitor online/offline status
    window.addEventListener('online', () => {
      this.isOnline = true
      this.processSyncQueue()
    })
    
    window.addEventListener('offline', () => {
      this.isOnline = false
    })

    // Automatically save data periodically
    setInterval(() => {
      this.performBackgroundSync()
    }, 30000) // Every 30 seconds

    // Save data before page unload
    window.addEventListener('beforeunload', () => {
      this.performEmergencySync()
    })
  }

  async get(key, defaultValue = null) {
    try {
      const value = await localforage.getItem(key)
      return value !== null ? value : defaultValue
    } catch (error) {
      console.error('Storage get error:', error)
      return defaultValue
    }
  }

  async set(key, value, options = {}) {
    try {
      const timestamp = new Date().toISOString()
      const dataToStore = {
        value,
        timestamp,
        version: options.version || 1,
        metadata: options.metadata || {}
      }

      await localforage.setItem(key, dataToStore)
      
      if (options.sync && !this.isOnline) {
        this.addToSyncQueue(key, value, 'update')
      }

      return true
    } catch (error) {
      console.error('Storage set error:', error)
      
      // Handle quota exceeded error
      if (error.name === 'QuotaExceededError') {
        await this.handleStorageQuotaExceeded()
        // Retry after cleanup
        return this.set(key, value, options)
      }
      
      return false
    }
  }

  async remove(key) {
    try {
      await localforage.removeItem(key)
      return true
    } catch (error) {
      console.error('Storage remove error:', error)
      return false
    }
  }

  async clear() {
    try {
      await localforage.clear()
      return true
    } catch (error) {
      console.error('Storage clear error:', error)
      return false
    }
  }

  async keys() {
    try {
      return await localforage.keys()
    } catch (error) {
      console.error('Storage keys error:', error)
      return []
    }
  }

  async length() {
    try {
      return await localforage.length()
    } catch (error) {
      console.error('Storage length error:', error)
      return 0
    }
  }

  // Meeting-specific methods
  async getMeetings() {
    const data = await this.get(this.keys.MEETINGS, [])
    return data.value || data // Handle both new and legacy formats
  }

  async saveMeetings(meetings) {
    return await this.set(this.keys.MEETINGS, meetings, { 
      sync: true,
      metadata: { type: 'meetings', count: meetings.length }
    })
  }

  async addMeeting(meeting) {
    const meetings = await this.getMeetings()
    const updatedMeetings = [...meetings, { 
      ...meeting, 
      id: meeting.id || this.generateId(),
      createdAt: meeting.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }]
    return await this.saveMeetings(updatedMeetings)
  }

  async updateMeeting(meetingId, updates) {
    const meetings = await this.getMeetings()
    const updatedMeetings = meetings.map(meeting => 
      meeting.id === meetingId 
        ? { ...meeting, ...updates, updatedAt: new Date().toISOString() }
        : meeting
    )
    return await this.saveMeetings(updatedMeetings)
  }

  async deleteMeeting(meetingId) {
    const meetings = await this.getMeetings()
    const filteredMeetings = meetings.filter(meeting => meeting.id !== meetingId)
    return await this.saveMeetings(filteredMeetings)
  }

  // Stakeholder-specific methods
  async getStakeholders() {
    const data = await this.get(this.keys.STAKEHOLDERS, [])
    return data.value || data
  }

  async saveStakeholders(stakeholders) {
    return await this.set(this.keys.STAKEHOLDERS, stakeholders, {
      sync: true,
      metadata: { type: 'stakeholders', count: stakeholders.length }
    })
  }

  // User preferences
  async getUserPreferences() {
    const defaultPrefs = {
      theme: 'light',
      notifications: true,
      autoSave: true,
      cameraPreferences: {
        facingMode: 'environment',
        flash: false,
        resolution: 'high'
      },
      exportPreferences: {
        defaultFormat: 'pdf',
        includeNotes: true,
        includeAttachments: false
      },
      searchPreferences: {
        maxRecentSearches: 10,
        includeStakeholders: true,
        includeMeetings: true
      }
    }
    
    const data = await this.get(this.keys.USER_PREFERENCES, defaultPrefs)
    return { ...defaultPrefs, ...(data.value || data) }
  }

  async saveUserPreferences(preferences) {
    return await this.set(this.keys.USER_PREFERENCES, preferences, {
      metadata: { type: 'preferences' }
    })
  }

  // Search history
  async getSearchHistory() {
    const data = await this.get(this.keys.SEARCH_HISTORY, [])
    return data.value || data
  }

  async addSearchTerm(term) {
    const history = await this.getSearchHistory()
    const preferences = await this.getUserPreferences()
    const maxHistory = preferences.searchPreferences.maxRecentSearches
    
    // Remove duplicate and add to front
    const filteredHistory = history.filter(item => item.term !== term)
    const newHistory = [
      { term, timestamp: new Date().toISOString(), count: 1 },
      ...filteredHistory
    ].slice(0, maxHistory)
    
    return await this.set(this.keys.SEARCH_HISTORY, newHistory)
  }

  // Export history
  async getExportHistory() {
    const data = await this.get(this.keys.EXPORT_HISTORY, [])
    return data.value || data
  }

  async addExportRecord(exportRecord) {
    const history = await this.getExportHistory()
    const newHistory = [
      { ...exportRecord, timestamp: new Date().toISOString() },
      ...history
    ].slice(0, 50) // Keep last 50 exports
    
    return await this.set(this.keys.EXPORT_HISTORY, newHistory)
  }

  // Sync queue management
  addToSyncQueue(key, value, operation) {
    this.syncQueue.push({
      key,
      value,
      operation,
      timestamp: new Date().toISOString(),
      retries: 0
    })
  }

  async processSyncQueue() {
    if (!this.isOnline || this.syncQueue.length === 0) return

    const maxRetries = 3
    const itemsToProcess = [...this.syncQueue]
    this.syncQueue = []

    for (const item of itemsToProcess) {
      try {
        // Simulate sync to cloud/server
        await this.syncToCloud(item.key, item.value, item.operation)
        console.log('Synced:', item.key)
      } catch (error) {
        console.error('Sync failed:', error)
        
        if (item.retries < maxRetries) {
          this.syncQueue.push({ ...item, retries: item.retries + 1 })
        }
      }
    }
  }

  async syncToCloud(key, value, operation) {
    // Simulate cloud sync API call
    await new Promise(resolve => setTimeout(resolve, 100))
    
    if (Math.random() < 0.1) { // 10% failure rate for testing
      throw new Error('Sync failed')
    }
    
    return { success: true, key, operation }
  }

  async performBackgroundSync() {
    try {
      await this.processSyncQueue()
      
      // Perform data validation and cleanup
      await this.validateData()
      await this.cleanupOldData()
    } catch (error) {
      console.error('Background sync error:', error)
    }
  }

  async performEmergencySync() {
    try {
      // Quick sync of critical data before page unload
      const appState = {
        timestamp: new Date().toISOString(),
        url: window.location.href,
        userAgent: navigator.userAgent
      }
      
      await this.set(this.keys.APP_STATE, appState)
    } catch (error) {
      console.error('Emergency sync error:', error)
    }
  }

  async validateData() {
    try {
      const meetings = await this.getMeetings()
      const stakeholders = await this.getStakeholders()
      
      // Validate meetings structure
      const validMeetings = meetings.filter(meeting => 
        meeting && typeof meeting === 'object' && meeting.id
      )
      
      if (validMeetings.length !== meetings.length) {
        await this.saveMeetings(validMeetings)
        console.log('Cleaned up invalid meetings')
      }
      
      // Validate stakeholders structure
      const validStakeholders = stakeholders.filter(stakeholder => 
        stakeholder && typeof stakeholder === 'object' && stakeholder.id
      )
      
      if (validStakeholders.length !== stakeholders.length) {
        await this.saveStakeholders(validStakeholders)
        console.log('Cleaned up invalid stakeholders')
      }
      
    } catch (error) {
      console.error('Data validation error:', error)
    }
  }

  async cleanupOldData() {
    try {
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      
      // Clean up old search history
      const searchHistory = await this.getSearchHistory()
      const recentSearches = searchHistory.filter(item => 
        new Date(item.timestamp) > thirtyDaysAgo
      )
      
      if (recentSearches.length !== searchHistory.length) {
        await this.set(this.keys.SEARCH_HISTORY, recentSearches)
      }
      
      // Clean up old export history
      const exportHistory = await this.getExportHistory()
      const recentExports = exportHistory.slice(0, 20) // Keep last 20
      
      if (recentExports.length !== exportHistory.length) {
        await this.set(this.keys.EXPORT_HISTORY, recentExports)
      }
      
    } catch (error) {
      console.error('Data cleanup error:', error)
    }
  }

  async handleStorageQuotaExceeded() {
    try {
      console.warn('Storage quota exceeded, performing cleanup...')
      
      // Remove old cached data first
      await this.remove(this.keys.CACHED_DATA)
      
      // Clean up old export history
      await this.set(this.keys.EXPORT_HISTORY, [])
      
      // Clean up old search history
      const searchHistory = await this.getSearchHistory()
      const recentSearches = searchHistory.slice(0, 5)
      await this.set(this.keys.SEARCH_HISTORY, recentSearches)
      
      console.log('Storage cleanup completed')
      
    } catch (error) {
      console.error('Storage cleanup error:', error)
    }
  }

  async getStorageInfo() {
    try {
      const keys = await localforage.keys()
      const length = await this.length()
      
      // Estimate storage usage
      let estimatedSize = 0
      for (const key of keys) {
        const item = await localforage.getItem(key)
        estimatedSize += new Blob([JSON.stringify(item)]).size
      }
      
      return {
        keys: keys.length,
        items: length,
        estimatedSize: this.formatBytes(estimatedSize),
        driver: localforage.driver(),
        isOnline: this.isOnline,
        syncQueueLength: this.syncQueue.length
      }
    } catch (error) {
      console.error('Storage info error:', error)
      return null
    }
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2)
  }

  // Import/Export methods for data migration
  async exportAllData() {
    try {
      const data = {}
      const keys = await localforage.keys()
      
      for (const key of keys) {
        data[key] = await localforage.getItem(key)
      }
      
      return {
        version: 1,
        timestamp: new Date().toISOString(),
        data
      }
    } catch (error) {
      console.error('Export all data error:', error)
      return null
    }
  }

  async importAllData(importData) {
    try {
      if (!importData || !importData.data) {
        throw new Error('Invalid import data')
      }
      
      // Clear existing data
      await this.clear()
      
      // Import new data
      for (const [key, value] of Object.entries(importData.data)) {
        await localforage.setItem(key, value)
      }
      
      return true
    } catch (error) {
      console.error('Import all data error:', error)
      return false
    }
  }
}

// Create singleton instance
const storage = new StorageManager()

export default storage