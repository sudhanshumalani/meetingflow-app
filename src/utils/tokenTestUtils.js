/**
 * Token Testing Utilities
 * Provides tools to test and debug token expiration and refresh
 */

import { GoogleDriveAuth } from './googleDriveAuth.js'
import localforage from 'localforage'

export class TokenTester {
  constructor() {
    this.googleAuth = new GoogleDriveAuth()
    this.testResults = []
  }

  /**
   * Test current token status across all storage locations
   */
  async testCurrentTokenStatus() {
    const result = {
      timestamp: new Date().toISOString(),
      tests: {}
    }

    // Test 1: Check GoogleDriveAuth token storage
    try {
      const googleToken = localStorage.getItem('google_drive_token')
      if (googleToken) {
        const parsed = JSON.parse(googleToken)
        const isExpired = Date.now() >= parsed.expiresAt
        const timeUntilExpiry = parsed.expiresAt - Date.now()

        result.tests.googleDriveAuth = {
          exists: true,
          token: parsed.token ? `${parsed.token.substring(0, 20)}...` : null,
          expiresAt: new Date(parsed.expiresAt).toISOString(),
          isExpired,
          timeUntilExpiry: Math.round(timeUntilExpiry / 1000 / 60), // minutes
          status: isExpired ? 'EXPIRED' : timeUntilExpiry < 300000 ? 'EXPIRING_SOON' : 'VALID'
        }
      } else {
        result.tests.googleDriveAuth = { exists: false, status: 'NO_TOKEN' }
      }
    } catch (error) {
      result.tests.googleDriveAuth = { error: error.message, status: 'ERROR' }
    }

    // Test 2: Check SyncService token storage
    try {
      const syncConfig = await localforage.getItem('sync_config')
      if (syncConfig?.config?.accessToken) {
        const config = syncConfig.config
        const isExpired = config.expiresAt && Date.now() >= config.expiresAt
        const timeUntilExpiry = config.expiresAt ? config.expiresAt - Date.now() : 0

        result.tests.syncService = {
          exists: true,
          token: config.accessToken ? `${config.accessToken.substring(0, 20)}...` : null,
          expiresAt: config.expiresAt ? new Date(config.expiresAt).toISOString() : 'NOT_SET',
          isExpired,
          timeUntilExpiry: Math.round(timeUntilExpiry / 1000 / 60), // minutes
          status: isExpired ? 'EXPIRED' : timeUntilExpiry < 300000 ? 'EXPIRING_SOON' : 'VALID'
        }
      } else {
        result.tests.syncService = { exists: false, status: 'NO_TOKEN' }
      }
    } catch (error) {
      result.tests.syncService = { error: error.message, status: 'ERROR' }
    }

    // Test 3: Check if tokens match
    if (result.tests.googleDriveAuth.exists && result.tests.syncService.exists) {
      result.tests.tokensMatch = {
        match: result.tests.googleDriveAuth.token === result.tests.syncService.token,
        googleToken: result.tests.googleDriveAuth.token,
        syncToken: result.tests.syncService.token
      }
    }

    // Test 4: Test getValidToken method
    try {
      const validToken = await this.googleAuth.getValidToken()
      result.tests.getValidToken = {
        success: !!validToken,
        tokenPreview: validToken ? `${validToken.substring(0, 20)}...` : null,
        status: validToken ? 'VALID' : 'INVALID'
      }
    } catch (error) {
      result.tests.getValidToken = { error: error.message, status: 'ERROR' }
    }

    this.testResults.push(result)
    return result
  }

  /**
   * Test silent re-authentication
   */
  async testSilentReauth() {
    const result = {
      timestamp: new Date().toISOString(),
      test: 'silentReauth'
    }

    try {
      console.log('🧪 Testing silent re-authentication...')
      const tokens = await this.googleAuth.silentReauthenticate()

      result.success = true
      result.tokens = {
        accessToken: tokens.accessToken ? `${tokens.accessToken.substring(0, 20)}...` : null,
        expiresAt: new Date(tokens.expiresAt).toISOString()
      }
      result.status = 'SUCCESS'
    } catch (error) {
      result.success = false
      result.error = error.message
      result.status = 'FAILED'
    }

    this.testResults.push(result)
    return result
  }

  /**
   * Simulate token expiration for testing
   */
  async simulateTokenExpiration() {
    console.log('🧪 Simulating token expiration...')

    // Expire GoogleDriveAuth token
    const googleToken = localStorage.getItem('google_drive_token')
    if (googleToken) {
      const parsed = JSON.parse(googleToken)
      parsed.expiresAt = Date.now() - 1000 // 1 second ago
      localStorage.setItem('google_drive_token', JSON.stringify(parsed))
    }

    // Expire SyncService token
    const syncConfig = await localforage.getItem('sync_config')
    if (syncConfig?.config) {
      syncConfig.config.expiresAt = Date.now() - 1000 // 1 second ago
      await localforage.setItem('sync_config', syncConfig)
    }

    console.log('✅ Token expiration simulated')
    return await this.testCurrentTokenStatus()
  }

  /**
   * Test token refresh flow
   */
  async testTokenRefresh() {
    console.log('🧪 Testing token refresh flow...')

    const result = {
      timestamp: new Date().toISOString(),
      test: 'tokenRefresh',
      steps: []
    }

    // Step 1: Check initial state
    const initialState = await this.testCurrentTokenStatus()
    result.steps.push({ step: 'initial_state', result: initialState })

    // Step 2: Simulate expiration
    await this.simulateTokenExpiration()
    const expiredState = await this.testCurrentTokenStatus()
    result.steps.push({ step: 'after_expiration', result: expiredState })

    // Step 3: Test refresh
    try {
      const refreshResult = await this.testSilentReauth()
      result.steps.push({ step: 'refresh_attempt', result: refreshResult })

      // Step 4: Check final state
      const finalState = await this.testCurrentTokenStatus()
      result.steps.push({ step: 'final_state', result: finalState })

      result.success = refreshResult.success
      result.status = refreshResult.success ? 'SUCCESS' : 'FAILED'
    } catch (error) {
      result.steps.push({ step: 'refresh_error', error: error.message })
      result.success = false
      result.status = 'ERROR'
    }

    this.testResults.push(result)
    return result
  }

  /**
   * Generate comprehensive test report
   */
  generateReport() {
    return {
      timestamp: new Date().toISOString(),
      totalTests: this.testResults.length,
      results: this.testResults,
      summary: {
        issues: this.identifyIssues(),
        recommendations: this.getRecommendations()
      }
    }
  }

  /**
   * Identify issues from test results
   */
  identifyIssues() {
    const issues = []
    const latestStatus = this.testResults.find(r => r.tests)

    if (latestStatus) {
      if (!latestStatus.tests.googleDriveAuth.exists) {
        issues.push('GoogleDriveAuth has no stored token')
      }
      if (!latestStatus.tests.syncService.exists) {
        issues.push('SyncService has no stored token')
      }
      if (latestStatus.tests.tokensMatch && !latestStatus.tests.tokensMatch.match) {
        issues.push('GoogleDriveAuth and SyncService tokens do not match')
      }
      if (latestStatus.tests.getValidToken.status === 'INVALID') {
        issues.push('getValidToken() returns invalid token')
      }
    }

    const silentAuthTests = this.testResults.filter(r => r.test === 'silentReauth')
    if (silentAuthTests.length > 0 && silentAuthTests.every(t => !t.success)) {
      issues.push('Silent re-authentication consistently fails')
    }

    return issues
  }

  /**
   * Get recommendations based on test results
   */
  getRecommendations() {
    const issues = this.identifyIssues()
    const recommendations = []

    if (issues.includes('GoogleDriveAuth and SyncService tokens do not match')) {
      recommendations.push('Implement token synchronization between GoogleDriveAuth and SyncService')
    }
    if (issues.includes('Silent re-authentication consistently fails')) {
      recommendations.push('Implement callback page for silent authentication iframe')
      recommendations.push('Consider switching to authorization code flow with PKCE')
    }
    if (issues.includes('getValidToken() returns invalid token')) {
      recommendations.push('Fix token validation logic in getValidToken method')
    }

    return recommendations
  }

  /**
   * Console-friendly test runner
   */
  async runAllTests() {
    console.log('🧪 Starting comprehensive token testing...')

    console.log('\n1️⃣ Testing current token status...')
    const statusTest = await this.testCurrentTokenStatus()
    console.table(statusTest.tests)

    console.log('\n2️⃣ Testing silent re-authentication...')
    const silentTest = await this.testSilentReauth()
    console.log('Silent auth result:', silentTest)

    console.log('\n3️⃣ Testing full refresh flow...')
    const refreshTest = await this.testTokenRefresh()
    console.log('Refresh test result:', refreshTest)

    console.log('\n📊 Generating final report...')
    const report = this.generateReport()

    console.log('\n❌ Issues found:')
    report.summary.issues.forEach(issue => console.log(`  - ${issue}`))

    console.log('\n💡 Recommendations:')
    report.summary.recommendations.forEach(rec => console.log(`  - ${rec}`))

    return report
  }
}

// Global testing functions for console use
window.tokenTester = new TokenTester()
window.testTokens = () => window.tokenTester.runAllTests()
window.checkTokenStatus = () => window.tokenTester.testCurrentTokenStatus()
window.testSilentAuth = () => window.tokenTester.testSilentReauth()
window.simulateExpiration = () => window.tokenTester.simulateTokenExpiration()

export default TokenTester