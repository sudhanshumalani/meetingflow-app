/**
 * Google Drive OAuth2 Authentication Helper
 * Handles the OAuth flow for Google Drive API access
 */

// Google OAuth2 configuration
const GOOGLE_CONFIG = {
  // For development/demo: Use environment variables or replace with actual credentials
  clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
  redirectUri: 'http://localhost', // Standard Desktop app redirect (works from any domain)
  scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
  responseType: 'code', // Authorization code flow for refresh tokens
  prompt: 'consent'
}

// PKCE helper functions
class PKCEHelper {
  static async generateCodeVerifier() {
    const array = new Uint8Array(32)
    crypto.getRandomValues(array)
    return this.base64URLEncode(array)
  }

  static async generateCodeChallenge(verifier) {
    const encoder = new TextEncoder()
    const data = encoder.encode(verifier)
    const digest = await crypto.subtle.digest('SHA-256', data)
    return this.base64URLEncode(new Uint8Array(digest))
  }

  static base64URLEncode(array) {
    return btoa(String.fromCharCode.apply(null, array))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')
  }
}

// Log for debugging (remove in production)
if (import.meta.env.DEV) {
  console.log('Google Client ID configured:', !!import.meta.env.VITE_GOOGLE_CLIENT_ID)
  console.log('Client ID length:', GOOGLE_CONFIG.clientId?.length)
}

// Advanced token storage manager with refresh token support
class TokenManager {
  constructor() {
    this.loadPersistedTokens()
    this.refreshTimer = null
    this.refreshInProgress = false
    this.listeners = new Set()

    // Set up cross-tab communication
    this.setupCrossTabSync()

    // Start background refresh monitoring
    this.startRefreshMonitoring()
  }

  loadPersistedTokens() {
    try {
      const stored = localStorage.getItem('google_drive_tokens')
      if (stored) {
        const tokens = JSON.parse(stored)

        // Validate token structure
        if (tokens.accessToken && tokens.expiresAt) {
          this.accessToken = tokens.accessToken
          this.refreshToken = tokens.refreshToken
          this.expiresAt = tokens.expiresAt
          this.tokenType = tokens.tokenType || 'Bearer'

          console.log('✅ Loaded persisted tokens:', {
            hasAccessToken: !!this.accessToken,
            hasRefreshToken: !!this.refreshToken,
            expiresAt: new Date(this.expiresAt).toISOString(),
            isExpired: this.isExpired()
          })

          // If expired but we have refresh token, try to refresh immediately
          if (this.isExpired() && this.refreshToken) {
            console.log('🔄 Token expired, will refresh on next getValidToken() call')
          }
        }
      }
    } catch (error) {
      console.error('❌ Failed to load persisted tokens:', error)
      this.clearTokens()
    }
  }

  setTokens(tokenData) {
    this.accessToken = tokenData.accessToken
    this.refreshToken = tokenData.refreshToken
    this.expiresAt = tokenData.expiresAt || (Date.now() + (tokenData.expiresIn * 1000))
    this.tokenType = tokenData.tokenType || 'Bearer'
    this.scope = tokenData.scope

    // Persist tokens securely
    this.persistTokens()

    // Notify listeners
    this.notifyListeners('tokens_updated', {
      hasAccessToken: !!this.accessToken,
      hasRefreshToken: !!this.refreshToken,
      expiresAt: this.expiresAt
    })

    console.log('✅ Tokens updated:', {
      accessTokenLength: this.accessToken?.length || 0,
      hasRefreshToken: !!this.refreshToken,
      expiresAt: new Date(this.expiresAt).toISOString(),
      scope: this.scope
    })
  }

  persistTokens() {
    try {
      const tokenData = {
        accessToken: this.accessToken,
        refreshToken: this.refreshToken,
        expiresAt: this.expiresAt,
        tokenType: this.tokenType,
        scope: this.scope,
        updatedAt: Date.now()
      }

      localStorage.setItem('google_drive_tokens', JSON.stringify(tokenData))

      // Broadcast to other tabs
      this.broadcastToTabs('tokens_updated', tokenData)

    } catch (error) {
      console.error('❌ Failed to persist tokens:', error)
    }
  }

  async getValidToken() {
    // If no access token, return null
    if (!this.accessToken) {
      console.log('📭 No access token available')
      return null
    }

    // If token is still valid (with 2 minute buffer), return it
    if (!this.isExpired(120000)) { // 2 minutes buffer
      return this.accessToken
    }

    // Token is expired or expiring soon, try to refresh
    console.log('🔄 Access token expired or expiring, attempting refresh...')

    if (!this.refreshToken) {
      console.log('❌ No refresh token available, need re-authentication')
      return null
    }

    // Prevent concurrent refresh attempts
    if (this.refreshInProgress) {
      console.log('⏳ Refresh already in progress, waiting...')
      return new Promise((resolve) => {
        const checkRefresh = () => {
          if (!this.refreshInProgress) {
            resolve(this.accessToken)
          } else {
            setTimeout(checkRefresh, 100)
          }
        }
        checkRefresh()
      })
    }

    try {
      const refreshed = await this.refreshAccessToken()
      return refreshed ? this.accessToken : null
    } catch (error) {
      console.error('❌ Token refresh failed:', error)
      return null
    }
  }

  async refreshAccessToken() {
    if (this.refreshInProgress) return false

    // Check if we have a refresh token
    if (!this.refreshToken) {
      console.log('⚠️ No refresh token available (using implicit flow) - user will need to re-authenticate')
      this.notifyListeners('token_refresh_failed', {
        error: 'No refresh token available - re-authentication required'
      })
      return false
    }

    this.refreshInProgress = true

    try {
      console.log('🔄 Refreshing access token using refresh token...')

      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: GOOGLE_CONFIG.clientId,
          refresh_token: this.refreshToken,
          grant_type: 'refresh_token'
        })
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Token refresh failed: ${response.status} ${error}`)
      }

      const tokenData = await response.json()

      // Update tokens (keep existing refresh token if not provided)
      this.setTokens({
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || this.refreshToken,
        expiresIn: tokenData.expires_in,
        tokenType: tokenData.token_type,
        scope: tokenData.scope
      })

      console.log('✅ Access token refreshed successfully')
      this.notifyListeners('token_refreshed', { success: true })

      return true
    } catch (error) {
      console.error('❌ Failed to refresh access token:', error)
      this.notifyListeners('token_refresh_failed', { error: error.message })

      // If refresh token is invalid, clear all tokens
      if (error.message.includes('invalid_grant')) {
        console.log('🗑️ Refresh token invalid, clearing all tokens')
        this.clearTokens()
      }

      return false
    } finally {
      this.refreshInProgress = false
    }
  }

  isExpired(bufferMs = 60000) { // 1 minute buffer by default
    if (!this.accessToken || !this.expiresAt) return true
    return Date.now() >= (this.expiresAt - bufferMs)
  }

  startRefreshMonitoring() {
    // Check every 5 minutes for tokens that need refreshing
    setInterval(() => {
      if (this.accessToken && this.refreshToken && this.isExpired(300000)) { // 5 minutes buffer
        console.log('🔄 Proactive token refresh triggered')
        this.refreshAccessToken()
      }
    }, 5 * 60 * 1000) // Every 5 minutes
  }

  setupCrossTabSync() {
    // Listen for storage changes from other tabs
    window.addEventListener('storage', (event) => {
      if (event.key === 'google_drive_tokens' && event.newValue) {
        try {
          const tokens = JSON.parse(event.newValue)
          if (tokens.updatedAt > (this.lastUpdateTime || 0)) {
            console.log('🔄 Syncing tokens from another tab')
            this.loadPersistedTokens()
          }
        } catch (error) {
          console.error('Failed to sync tokens from other tab:', error)
        }
      }
    })

    // Use BroadcastChannel for real-time updates
    if ('BroadcastChannel' in window) {
      this.broadcastChannel = new BroadcastChannel('meetingflow-auth')
      this.broadcastChannel.addEventListener('message', (event) => {
        if (event.data.type === 'tokens_updated') {
          console.log('📡 Received token update from another tab')
          this.loadPersistedTokens()
        }
      })
    }
  }

  broadcastToTabs(type, data) {
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage({ type, data })
    }
  }

  clearTokens() {
    this.accessToken = null
    this.refreshToken = null
    this.expiresAt = null
    this.tokenType = null
    this.scope = null

    try {
      localStorage.removeItem('google_drive_tokens')
      // Also clear old token storage for cleanup
      localStorage.removeItem('google_drive_token')
    } catch (error) {
      console.error('Failed to clear persisted tokens:', error)
    }

    this.broadcastToTabs('tokens_cleared', {})
    this.notifyListeners('tokens_cleared', {})

    console.log('🗑️ All tokens cleared')
  }

  addListener(callback) {
    this.listeners.add(callback)
  }

  removeListener(callback) {
    this.listeners.delete(callback)
  }

  notifyListeners(event, data) {
    this.listeners.forEach(callback => {
      try {
        callback(event, data)
      } catch (error) {
        console.error('Error in token listener:', error)
      }
    })
  }
}

export class GoogleDriveAuth {
  constructor() {
    this.authWindow = null
    this.authPromise = null
    this.tokenManager = new TokenManager()
    this.pendingPKCE = null

    // Listen for token manager events
    this.tokenManager.addListener((event, data) => {
      this.handleTokenEvent(event, data)
    })
  }

  handleTokenEvent(event, data) {
    switch (event) {
      case 'token_refreshed':
        console.log('🔄 Token refreshed automatically')
        break
      case 'token_refresh_failed':
        console.warn('⚠️ Automatic token refresh failed:', data.error)
        break
      case 'tokens_cleared':
        console.log('🗑️ Tokens cleared, user will need to re-authenticate')
        break
    }
  }

  /**
   * Check if Google OAuth configuration is valid
   */
  isValidConfig() {
    // Check if we have a valid client ID (not empty and looks like a real Google client ID)
    const hasClientId = !!GOOGLE_CONFIG.clientId
    const hasValidLength = GOOGLE_CONFIG.clientId && GOOGLE_CONFIG.clientId.length > 20
    const hasValidFormat = GOOGLE_CONFIG.clientId && GOOGLE_CONFIG.clientId.includes('.apps.googleusercontent.com')

    console.log('🔍 DEBUG: Google Client ID validation:', {
      clientId: GOOGLE_CONFIG.clientId,
      clientIdLength: GOOGLE_CONFIG.clientId?.length || 0,
      hasClientId,
      hasValidLength,
      hasValidFormat,
      isValid: hasClientId && hasValidLength && hasValidFormat
    })

    return hasClientId && hasValidLength && hasValidFormat
  }

  /**
   * Get the current client ID (for debugging)
   */
  getClientId() {
    return GOOGLE_CONFIG.clientId
  }

  /**
   * Initiate Google OAuth2 flow (adaptive: uses implicit flow for now, PKCE when ready)
   */
  async authenticate() {
    // Check if authentication is already in progress
    if (this.authPromise) {
      return this.authPromise
    }

    // Check if we have valid Google OAuth configuration
    if (!this.isValidConfig()) {
      throw new Error('Google OAuth not properly configured. Please set up valid Google API credentials.')
    }

    this.authPromise = new Promise(async (resolve, reject) => {
      try {
        // Generate PKCE parameters
        const codeVerifier = await PKCEHelper.generateCodeVerifier()
        const codeChallenge = await PKCEHelper.generateCodeChallenge(codeVerifier)

        // Store PKCE data for later use in token exchange
        this.pendingPKCE = {
          codeVerifier,
          codeChallenge,
          state: this.generateState()
        }

        const authUrl = this.buildAuthUrl(codeChallenge, this.pendingPKCE.state)

        console.log('🔐 Starting OAuth 2.0 Authorization Code flow with PKCE for Desktop application')

        // Open authentication window
        this.authWindow = window.open(
          authUrl,
          'google-auth',
          'width=500,height=600,scrollbars=yes,resizable=yes'
        )

        if (!this.authWindow) {
          reject(new Error('Failed to open authentication window. Please allow popups for this site.'))
          return
        }

        // For Desktop OAuth, we need to handle the popup differently
        // due to security restrictions
        let hasShownPrompt = false

        const checkAuthStatus = setInterval(() => {
          try {
            // Check if window is closed
            if (this.authWindow.closed) {
              clearInterval(checkAuthStatus)
              this.authPromise = null
              this.pendingPKCE = null

              if (!hasShownPrompt) {
                reject(new Error('Authentication window was closed'))
              }
              return
            }

            // Try to access window URL - this will throw on cross-origin
            const currentUrl = this.authWindow.location.href

            // If we can access the URL and it contains our code, extract it
            if (currentUrl.includes('code=')) {
              const urlParams = new URLSearchParams(new URL(currentUrl).search)
              const code = urlParams.get('code')
              const state = urlParams.get('state')
              const error = urlParams.get('error')

              clearInterval(checkAuthStatus)
              this.authWindow.close()
              this.authPromise = null

              if (error) {
                this.pendingPKCE = null
                reject(new Error(error))
                return
              }

              if (code) {
                this.handleAuthCode(code, state, resolve, reject)
              }
            }
          } catch (crossOriginError) {
            // Expected - means we're on Google's domain or localhost
            // Check if enough time has passed to show the prompt
            if (!hasShownPrompt && Date.now() - authStartTime > 5000) {
              hasShownPrompt = true

              // Show prompt to user
              setTimeout(() => {
                if (!this.authWindow.closed) {
                  const code = prompt(`Desktop OAuth Flow:\n\nAfter completing authorization in the popup window, Google will show you an authorization code.\n\nPlease copy that code and paste it here:`)

                  clearInterval(checkAuthStatus)
                  this.authWindow.close()
                  this.authPromise = null

                  if (code && code.trim()) {
                    this.handleAuthCode(code.trim(), this.pendingPKCE.state, resolve, reject)
                  } else {
                    this.pendingPKCE = null
                    reject(new Error('No authorization code provided'))
                  }
                }
              }, 1000)
            }
          }
        }, 1000)

        const authStartTime = Date.now()
      } catch (error) {
        this.authPromise = null
        this.pendingPKCE = null
        reject(error)
      }
    })

    return this.authPromise
  }

  async handleAuthCode(code, state, resolve, reject) {
    try {
      // Exchange authorization code for tokens
      const tokens = await this.exchangeCodeForTokens(code, state)

      // Store tokens in token manager
      this.tokenManager.setTokens(tokens)

      resolve({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        scope: tokens.scope,
        tokenType: tokens.tokenType
      })
    } catch (error) {
      console.error('❌ Token exchange failed:', error)
      reject(new Error(`Token exchange failed: ${error.message}`))
    }
  }

  generateState() {
    const array = new Uint8Array(16)
    crypto.getRandomValues(array)
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
  }

  /**
   * Clear all stored tokens and reset authentication state
   */
  clearTokens() {
    this.tokenManager.clearTokens()
    this.pendingPKCE = null
    console.log('🗑️ Authentication state cleared')
  }

  /**
   * Check if user is currently authenticated (has valid tokens)
   */
  async isAuthenticated() {
    const token = await this.getValidToken()
    return !!token
  }

  /**
   * Build Google OAuth2 authorization URL with PKCE for Desktop application
   */
  buildAuthUrl(codeChallenge, state) {
    const params = new URLSearchParams({
      client_id: GOOGLE_CONFIG.clientId,
      redirect_uri: GOOGLE_CONFIG.redirectUri,
      scope: GOOGLE_CONFIG.scope,
      response_type: GOOGLE_CONFIG.responseType,
      prompt: GOOGLE_CONFIG.prompt,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state: state,
      access_type: 'offline' // Required for refresh tokens
    })

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  }

  /**
   * Get current access token (automatically refreshes if needed)
   */
  async getValidToken() {
    return await this.tokenManager.getValidToken()
  }

  /**
   * Exchange authorization code for access and refresh tokens using PKCE (Desktop app - no client secret)
   */
  async exchangeCodeForTokens(code, state) {
    try {
      // Verify state parameter to prevent CSRF attacks
      if (state !== this.pendingPKCE?.state) {
        throw new Error('Invalid state parameter - possible CSRF attack')
      }

      console.log('🔄 Exchanging authorization code for tokens (Desktop app)...')

      const requestBody = new URLSearchParams({
        client_id: GOOGLE_CONFIG.clientId,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: GOOGLE_CONFIG.redirectUri,
        code_verifier: this.pendingPKCE.codeVerifier
        // Note: No client_secret for Desktop applications
      })

      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: requestBody
      })

      // Clear PKCE data after use
      this.pendingPKCE = null

      if (!response.ok) {
        const errorData = await response.text()
        let errorMessage
        try {
          const parsedError = JSON.parse(errorData)
          errorMessage = parsedError.error_description || parsedError.error
        } catch {
          errorMessage = errorData
        }
        throw new Error(`Token exchange failed: ${response.status} ${errorMessage}`)
      }

      const tokenData = await response.json()

      console.log('✅ Token exchange successful (Desktop app):', {
        hasAccessToken: !!tokenData.access_token,
        hasRefreshToken: !!tokenData.refresh_token,
        expiresIn: tokenData.expires_in,
        scope: tokenData.scope
      })

      return {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: Date.now() + (tokenData.expires_in * 1000),
        expiresIn: tokenData.expires_in,
        scope: tokenData.scope,
        tokenType: tokenData.token_type || 'Bearer'
      }
    } catch (error) {
      console.error('❌ Token exchange error:', error)
      this.pendingPKCE = null
      throw error
    }
  }

  /**
   * Get user info from Google API
   */
  async getUserInfo(accessToken) {
    try {
      const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => '')
        throw new Error(`Failed to get user info: ${response.status} ${response.statusText || errorText || 'Unknown error'}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Get user info error:', error)
      throw error
    }
  }

  /**
   * Test Google Drive API access
   */
  async testDriveAccess(accessToken) {
    try {
      const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      })

      if (!response.ok) {
        throw new Error(`Drive access test failed: ${response.statusText}`)
      }

      const data = await response.json()
      return {
        success: true,
        user: data.user
      }
    } catch (error) {
      console.error('Drive access test error:', error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * Find or create a dedicated folder for MeetingFlow data
   */
  async findOrCreateMeetingFlowFolder(accessToken) {
    try {
      console.log('🔍 Searching for existing MeetingFlow folders...')

      // First, search for existing MeetingFlow folders
      const searchResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='MeetingFlow Data' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      )

      console.log('🔍 Search response status:', searchResponse.status)

      if (!searchResponse.ok) {
        throw new Error(`Failed to search folders: ${searchResponse.statusText}`)
      }

      const searchResult = await searchResponse.json()
      console.log('🔍 Search result:', searchResult)

      // If folders exist, find the one with the most data
      if (searchResult.files && searchResult.files.length > 0) {
        console.log(`📂 Found ${searchResult.files.length} existing MeetingFlow folder(s):`)
        searchResult.files.forEach((folder, index) => {
          console.log(`  ${index + 1}. ${folder.name} (${folder.id})`)
        })

        // Check each folder for data files and choose the one with the most data
        const folderWithMostData = await this.findFolderWithMostData(accessToken, searchResult.files)

        if (folderWithMostData) {
          console.log(`📂 Using folder with most data: ${folderWithMostData.name} (${folderWithMostData.id}) - ${folderWithMostData.dataSize} bytes`)
          return folderWithMostData.id
        }

        // Fallback to first folder if data detection fails
        const folder = searchResult.files[0]
        console.log(`📂 Using first folder as fallback: ${folder.name} (${folder.id})`)
        return folder.id
      }

      // No existing folder found, create a new one
      console.log('📂 No existing MeetingFlow folder found, creating new one...')

      const folderMetadata = {
        name: 'MeetingFlow Data',
        mimeType: 'application/vnd.google-apps.folder',
        description: 'Synchronized data from MeetingFlow application'
      }

      const response = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(folderMetadata)
      })

      if (!response.ok) {
        throw new Error(`Failed to create folder: ${response.statusText}`)
      }

      const folder = await response.json()
      return folder.id
    } catch (error) {
      console.error('Create folder error:', error)
      throw error
    }
  }

  /**
   * Find the folder with the most data by checking file sizes in each folder
   */
  async findFolderWithMostData(accessToken, folders) {
    try {
      console.log('🔍 Checking folders for data files...')

      let bestFolder = null
      let maxDataSize = 0

      for (const folder of folders) {
        try {
          // Search for app_data file in this folder
          const fileSearchResponse = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=name='meetingflow_app_data.json' and parents in '${folder.id}'&fields=files(id,name,size)`,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`
              }
            }
          )

          if (fileSearchResponse.ok) {
            const fileResult = await fileSearchResponse.json()

            if (fileResult.files && fileResult.files.length > 0) {
              const file = fileResult.files[0]
              const fileSize = parseInt(file.size) || 0

              console.log(`📁 Folder ${folder.id}: Found file ${file.name} (${fileSize} bytes)`)

              if (fileSize > maxDataSize) {
                maxDataSize = fileSize
                bestFolder = {
                  ...folder,
                  dataSize: fileSize,
                  fileId: file.id
                }
              }
            } else {
              console.log(`📁 Folder ${folder.id}: No data file found`)
            }
          }
        } catch (error) {
          console.error(`Error checking folder ${folder.id}:`, error)
        }
      }

      if (bestFolder) {
        console.log(`✅ Best folder found: ${bestFolder.id} with ${bestFolder.dataSize} bytes of data`)
      } else {
        console.log('⚠️ No folders with data files found')
      }

      return bestFolder
    } catch (error) {
      console.error('Error finding folder with most data:', error)
      return null
    }
  }
}

// Auth callback handler - this should be included in your routing
export function handleGoogleAuthCallback() {
  // For authorization code flow, code comes in URL search params
  const urlParams = new URLSearchParams(window.location.search)
  const code = urlParams.get('code')
  const error = urlParams.get('error')
  const state = urlParams.get('state')
  const errorDescription = urlParams.get('error_description')

  console.log('🔐 Google Auth Callback received (authorization code flow):', {
    hasCode: !!code,
    hasError: !!error,
    hasState: !!state,
    error: error,
    errorDescription: errorDescription
  })

  if (error) {
    // Send error to parent window
    if (window.opener) {
      window.opener.postMessage({
        type: 'google-auth-error',
        error: errorDescription || error
      }, window.location.origin)
    }
  } else if (code) {
    // Send success to parent window with authorization code
    if (window.opener) {
      window.opener.postMessage({
        type: 'google-auth-success',
        code: code,
        state: state
      }, window.location.origin)
    }
  } else {
    // No code or error - something went wrong
    if (window.opener) {
      window.opener.postMessage({
        type: 'google-auth-error',
        error: 'No authorization code received'
      }, window.location.origin)
    }
  }

  // Close the popup window
  window.close()
}

export default GoogleDriveAuth