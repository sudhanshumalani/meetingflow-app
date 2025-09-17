/**
 * Sync Debugging Utilities
 * Comprehensive tools to debug and test sync functionality
 */

import localforage from 'localforage'

export class SyncDebugger {
  constructor() {
    this.results = []
  }

  /**
   * Test local data storage and retrieval
   */
  async testLocalStorage() {
    console.log('🧪 Testing local storage...')

    const result = {
      timestamp: new Date().toISOString(),
      test: 'localStorage',
      storage: {}
    }

    try {
      // Test localforage data
      const meetings = await localforage.getItem('meetingflow_meetings') || []
      const stakeholders = await localforage.getItem('meetingflow_stakeholders') || []
      const categories = await localforage.getItem('meetingflow_stakeholder_categories') || []
      const syncConfig = await localforage.getItem('sync_config')
      const lastSync = await localforage.getItem('last_sync_time')

      result.storage.localforage = {
        meetings: {
          exists: meetings.length > 0,
          count: meetings.length,
          sample: meetings.slice(0, 2).map(m => ({ id: m.id, title: m.title }))
        },
        stakeholders: {
          exists: stakeholders.length > 0,
          count: stakeholders.length,
          sample: stakeholders.slice(0, 3).map(s => ({ id: s.id, name: s.name }))
        },
        categories: {
          exists: categories.length > 0,
          count: categories.length,
          list: categories
        },
        syncConfig: {
          exists: !!syncConfig,
          enabled: syncConfig?.enabled || false,
          provider: syncConfig?.provider || 'none',
          hasToken: !!(syncConfig?.config?.accessToken),
          tokenExpiry: syncConfig?.config?.expiresAt ? new Date(syncConfig.config.expiresAt).toISOString() : 'not_set'
        },
        lastSync: lastSync || 'never'
      }

      // Test localStorage data
      const googleToken = localStorage.getItem('google_drive_token')
      result.storage.localStorage = {
        googleToken: {
          exists: !!googleToken,
          data: googleToken ? JSON.parse(googleToken) : null
        }
      }

      result.status = 'SUCCESS'
    } catch (error) {
      result.error = error.message
      result.status = 'ERROR'
    }

    this.results.push(result)
    return result
  }

  /**
   * Test sync service initialization and state
   */
  async testSyncService() {
    console.log('🧪 Testing sync service...')

    const result = {
      timestamp: new Date().toISOString(),
      test: 'syncService'
    }

    try {
      // Import sync service
      const { default: syncService } = await import('./syncService.js')

      // Wait for initialization
      await syncService.ensureInitialized()

      result.syncService = {
        initialized: syncService.isInitialized,
        deviceId: syncService.deviceId,
        isOnline: syncService.isOnline,
        syncConfig: {
          exists: !!syncService.syncConfig,
          enabled: syncService.syncConfig?.enabled || false,
          provider: syncService.syncConfig?.provider || 'none'
        }
      }

      // Test getting local data
      const localData = await syncService.getLocalData()
      result.localData = {
        success: !!localData,
        meetings: localData?.data?.meetings?.length || 0,
        stakeholders: localData?.data?.stakeholders?.length || 0,
        categories: localData?.data?.stakeholderCategories?.length || 0
      }

      result.status = 'SUCCESS'
    } catch (error) {
      result.error = error.message
      result.status = 'ERROR'
    }

    this.results.push(result)
    return result
  }

  /**
   * Test Google Drive API access
   */
  async testGoogleDriveAccess() {
    console.log('🧪 Testing Google Drive access...')

    const result = {
      timestamp: new Date().toISOString(),
      test: 'googleDriveAccess'
    }

    try {
      // Import Google Drive auth
      const { GoogleDriveAuth } = await import('./googleDriveAuth.js')
      const googleAuth = new GoogleDriveAuth()

      // Test token validity
      const token = await googleAuth.getValidToken()
      result.token = {
        exists: !!token,
        preview: token ? `${token.substring(0, 20)}...` : null
      }

      if (token) {
        // Test user info access
        try {
          const userInfo = await googleAuth.getUserInfo(token)
          result.userInfo = {
            success: true,
            email: userInfo.email,
            name: userInfo.name
          }
        } catch (userError) {
          result.userInfo = {
            success: false,
            error: userError.message
          }
        }

        // Test Drive access
        try {
          const driveTest = await googleAuth.testDriveAccess(token)
          result.driveAccess = driveTest
        } catch (driveError) {
          result.driveAccess = {
            success: false,
            error: driveError.message
          }
        }
      }

      result.status = 'SUCCESS'
    } catch (error) {
      result.error = error.message
      result.status = 'ERROR'
    }

    this.results.push(result)
    return result
  }

  /**
   * Test upload to Google Drive
   */
  async testUploadToCloud() {
    console.log('🧪 Testing upload to cloud...')

    const result = {
      timestamp: new Date().toISOString(),
      test: 'uploadToCloud'
    }

    try {
      // Import sync service
      const { default: syncService } = await import('./syncService.js')
      await syncService.ensureInitialized()

      // Get local data
      const localData = await syncService.getLocalData()

      if (!localData) {
        throw new Error('No local data available')
      }

      // Test upload
      console.log('📤 Uploading data to cloud...', {
        meetings: localData.data.meetings?.length || 0,
        stakeholders: localData.data.stakeholders?.length || 0
      })

      const uploadResult = await syncService.syncToCloud(localData.data)

      result.upload = {
        success: uploadResult.success,
        timestamp: uploadResult.timestamp,
        data: {
          meetings: localData.data.meetings?.length || 0,
          stakeholders: localData.data.stakeholders?.length || 0,
          categories: localData.data.stakeholderCategories?.length || 0
        }
      }

      result.status = uploadResult.success ? 'SUCCESS' : 'FAILED'
    } catch (error) {
      result.error = error.message
      result.status = 'ERROR'
    }

    this.results.push(result)
    return result
  }

  /**
   * Test download from Google Drive
   */
  async testDownloadFromCloud() {
    console.log('🧪 Testing download from cloud...')

    const result = {
      timestamp: new Date().toISOString(),
      test: 'downloadFromCloud'
    }

    try {
      // Import sync service
      const { default: syncService } = await import('./syncService.js')
      await syncService.ensureInitialized()

      // Test download
      console.log('📥 Downloading data from cloud...')
      const downloadResult = await syncService.syncFromCloud()

      result.download = {
        success: downloadResult.success,
        timestamp: downloadResult.timestamp,
        data: downloadResult.data ? {
          meetings: downloadResult.data.meetings?.length || 0,
          stakeholders: downloadResult.data.stakeholders?.length || 0,
          categories: downloadResult.data.stakeholderCategories?.length || 0
        } : null
      }

      result.status = downloadResult.success ? 'SUCCESS' : 'FAILED'
    } catch (error) {
      result.error = error.message
      result.status = 'ERROR'
    }

    this.results.push(result)
    return result
  }

  /**
   * Test full round-trip sync
   */
  async testFullSync() {
    console.log('🧪 Testing full round-trip sync...')

    const result = {
      timestamp: new Date().toISOString(),
      test: 'fullSync',
      steps: []
    }

    try {
      // Step 1: Check initial state
      const initialState = await this.testLocalStorage()
      result.steps.push({ step: 'initial_state', result: initialState })

      // Step 2: Upload to cloud
      const uploadResult = await this.testUploadToCloud()
      result.steps.push({ step: 'upload', result: uploadResult })

      if (uploadResult.status !== 'SUCCESS') {
        throw new Error(`Upload failed: ${uploadResult.error}`)
      }

      // Step 3: Clear local data (simulate fresh device)
      console.log('🧹 Clearing local stakeholders to simulate fresh device...')
      await localforage.setItem('meetingflow_stakeholders', [])

      const clearedState = await this.testLocalStorage()
      result.steps.push({ step: 'after_clear', result: clearedState })

      // Step 4: Download from cloud
      const downloadResult = await this.testDownloadFromCloud()
      result.steps.push({ step: 'download', result: downloadResult })

      // Step 5: Check final state
      const finalState = await this.testLocalStorage()
      result.steps.push({ step: 'final_state', result: finalState })

      // Compare results
      const initialStakeholders = initialState.storage.localforage.stakeholders.count
      const finalStakeholders = finalState.storage.localforage.stakeholders.count

      result.comparison = {
        initialStakeholders,
        finalStakeholders,
        stakeholdersRestored: finalStakeholders > 0,
        dataIntact: finalStakeholders >= initialStakeholders * 0.9 // Allow 10% variance
      }

      result.status = result.comparison.stakeholdersRestored ? 'SUCCESS' : 'FAILED'
    } catch (error) {
      result.error = error.message
      result.status = 'ERROR'
    }

    this.results.push(result)
    return result
  }

  /**
   * Generate comprehensive sync report
   */
  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      totalTests: this.results.length,
      results: this.results,
      summary: {
        issues: [],
        recommendations: []
      }
    }

    // Analyze results for issues
    this.results.forEach(result => {
      if (result.status === 'ERROR') {
        report.summary.issues.push(`${result.test} failed: ${result.error}`)
      }

      if (result.test === 'localStorage' && result.storage) {
        if (!result.storage.localforage.syncConfig.exists) {
          report.summary.issues.push('No sync configuration found')
        }
        if (!result.storage.localforage.syncConfig.hasToken) {
          report.summary.issues.push('No Google Drive token configured')
        }
        if (result.storage.localforage.stakeholders.count === 0) {
          report.summary.issues.push('No stakeholders in local storage')
        }
      }

      if (result.test === 'googleDriveAccess') {
        if (!result.token?.exists) {
          report.summary.issues.push('No valid Google Drive token')
        }
        if (result.driveAccess && !result.driveAccess.success) {
          report.summary.issues.push('Google Drive access failed')
        }
      }

      if (result.test === 'fullSync' && result.comparison) {
        if (!result.comparison.stakeholdersRestored) {
          report.summary.issues.push('Stakeholders not restored after sync')
        }
      }
    })

    // Generate recommendations
    if (report.summary.issues.includes('No sync configuration found')) {
      report.summary.recommendations.push('Configure Google Drive sync in Settings')
    }
    if (report.summary.issues.includes('No valid Google Drive token')) {
      report.summary.recommendations.push('Re-authenticate with Google Drive')
    }
    if (report.summary.issues.includes('Stakeholders not restored after sync')) {
      report.summary.recommendations.push('Check data merge logic in syncFromCloud()')
    }

    return report
  }

  /**
   * Run all sync tests
   */
  async runAllTests() {
    console.log('🧪 Starting comprehensive sync testing...')

    console.log('\n1️⃣ Testing local storage...')
    const storageTest = await this.testLocalStorage()
    console.table(storageTest.storage.localforage)

    console.log('\n2️⃣ Testing sync service...')
    const syncTest = await this.testSyncService()
    console.log('Sync service:', syncTest)

    console.log('\n3️⃣ Testing Google Drive access...')
    const driveTest = await this.testGoogleDriveAccess()
    console.log('Google Drive:', driveTest)

    console.log('\n4️⃣ Testing upload to cloud...')
    const uploadTest = await this.testUploadToCloud()
    console.log('Upload result:', uploadTest)

    console.log('\n5️⃣ Testing download from cloud...')
    const downloadTest = await this.testDownloadFromCloud()
    console.log('Download result:', downloadTest)

    console.log('\n6️⃣ Testing full round-trip sync...')
    const fullSyncTest = await this.testFullSync()
    console.log('Full sync result:', fullSyncTest)

    console.log('\n📊 Generating final report...')
    const report = this.generateReport()

    console.log('\n❌ Issues found:')
    report.summary.issues.forEach(issue => console.log(`  - ${issue}`))

    console.log('\n💡 Recommendations:')
    report.summary.recommendations.forEach(rec => console.log(`  - ${rec}`))

    return report
  }
}

// Global debugging functions
window.syncDebugger = new SyncDebugger()
window.debugSync = () => window.syncDebugger.runAllTests()
window.testLocalStorage = () => window.syncDebugger.testLocalStorage()
window.testSyncService = () => window.syncDebugger.testSyncService()
window.testGoogleDrive = () => window.syncDebugger.testGoogleDriveAccess()
window.testUpload = () => window.syncDebugger.testUploadToCloud()
window.testDownload = () => window.syncDebugger.testDownloadFromCloud()
window.testFullSync = () => window.syncDebugger.testFullSync()

export default SyncDebugger