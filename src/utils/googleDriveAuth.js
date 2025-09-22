/**
 * Google Drive OAuth2 Authentication Helper
 * Handles the OAuth flow for Google Drive API access
 */

// Google OAuth2 configuration
const GOOGLE_CONFIG = {
  // For development/demo: Use environment variables or replace with actual credentials
  clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
  redirectUri: window.location.origin + '/meetingflow-app/auth/google/callback',
  scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
  responseType: 'token', // Changed from 'code' to 'token' for implicit flow
  prompt: 'consent'
}

// Log for debugging (remove in production)
if (import.meta.env.DEV) {
  console.log('Google Client ID configured:', !!import.meta.env.VITE_GOOGLE_CLIENT_ID)
  console.log('Client ID length:', GOOGLE_CONFIG.clientId?.length)
}

// Token storage manager for automatic re-authentication
class TokenManager {
  constructor() {
    // Load persisted token from localStorage
    this.loadPersistedToken()
    this.refreshCallback = null
    this.refreshTimer = null
  }

  loadPersistedToken() {
    try {
      const stored = localStorage.getItem('google_drive_token')
      if (stored) {
        const { token, expiresAt } = JSON.parse(stored)
        // Only load if not expired
        if (expiresAt && Date.now() < expiresAt) {
          this.token = token
          this.expiresAt = expiresAt
          console.log('Loaded persisted token, valid until:', new Date(expiresAt).toISOString())

          // Set up refresh timer for loaded token
          this.scheduleRefresh()
        }
      }
    } catch (error) {
      console.error('Failed to load persisted token:', error)
    }
  }

  setToken(accessToken, expiresIn) {
    this.token = accessToken
    this.expiresAt = Date.now() + (expiresIn * 1000)

    // Persist token to localStorage
    try {
      localStorage.setItem('google_drive_token', JSON.stringify({
        token: this.token,
        expiresAt: this.expiresAt
      }))
      console.log('Token persisted, expires at:', new Date(this.expiresAt).toISOString())
    } catch (error) {
      console.error('Failed to persist token:', error)
    }

    // Schedule automatic refresh
    this.scheduleRefresh()
  }

  scheduleRefresh() {
    // Clear existing timer
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
    }

    // Set up automatic refresh 5 minutes before expiry
    const timeUntilExpiry = this.expiresAt - Date.now()
    const refreshIn = Math.max(0, timeUntilExpiry - (5 * 60 * 1000)) // 5 minutes before expiry

    if (refreshIn > 0 && this.refreshCallback) {
      this.refreshTimer = setTimeout(() => {
        console.log('Token expiring soon, triggering re-authentication...')
        this.refreshCallback()
      }, refreshIn)
    }
  }

  getToken() {
    // Check if token is still valid (with 1 minute buffer)
    if (this.token && this.expiresAt && Date.now() < (this.expiresAt - 60000)) {
      return this.token
    }
    return null
  }

  isExpired() {
    return !this.token || !this.expiresAt || Date.now() >= this.expiresAt
  }

  clear() {
    this.token = null
    this.expiresAt = null

    // Clear from localStorage
    try {
      localStorage.removeItem('google_drive_token')
    } catch (error) {
      console.error('Failed to clear persisted token:', error)
    }

    // Clear refresh timer
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
      this.refreshTimer = null
    }
  }

  setRefreshCallback(callback) {
    this.refreshCallback = callback
    // If token exists, schedule refresh
    if (this.token && this.expiresAt) {
      this.scheduleRefresh()
    }
  }
}

export class GoogleDriveAuth {
  constructor() {
    this.authWindow = null
    this.authPromise = null
    this.tokenManager = new TokenManager()
    this.silentAuthFrame = null

    // Set up automatic re-authentication
    this.tokenManager.setRefreshCallback(() => {
      this.silentReauthenticate()
    })
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
   * Initiate Google OAuth2 flow
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

    this.authPromise = new Promise((resolve, reject) => {
      const authUrl = this.buildAuthUrl()

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

      // Listen for the redirect
      const checkClosed = setInterval(() => {
        if (this.authWindow.closed) {
          clearInterval(checkClosed)
          this.authPromise = null
          reject(new Error('Authentication window was closed'))
        }
      }, 1000)

      // Listen for messages from the auth window
      const messageHandler = async (event) => {
        if (event.origin !== window.location.origin) {
          return
        }

        if (event.data.type === 'google-auth-success') {
          clearInterval(checkClosed)
          window.removeEventListener('message', messageHandler)
          this.authWindow.close()
          this.authPromise = null

          // With implicit flow, we get the token directly
          // Store in token manager
          this.tokenManager.setToken(event.data.accessToken, event.data.expiresIn || 3600)

          resolve({
            accessToken: event.data.accessToken,
            expiresAt: Date.now() + (event.data.expiresIn * 1000),
            scope: event.data.scope,
            tokenType: event.data.tokenType
          })
        } else if (event.data.type === 'google-auth-error') {
          clearInterval(checkClosed)
          window.removeEventListener('message', messageHandler)
          this.authWindow.close()
          this.authPromise = null
          reject(new Error(event.data.error || 'Authentication failed'))
        }
      }

      window.addEventListener('message', messageHandler)
    })

    return this.authPromise
  }

  /**
   * Silently re-authenticate using an iframe (no user interaction required)
   */
  async silentReauthenticate() {
    console.log('Attempting silent re-authentication...')

    return new Promise((resolve, reject) => {
      // Create hidden iframe for silent auth
      const iframe = document.createElement('iframe')
      iframe.style.display = 'none'
      iframe.src = this.buildAuthUrl(true) // true for silent mode

      const timeout = setTimeout(() => {
        document.body.removeChild(iframe)
        reject(new Error('Silent authentication timeout'))
      }, 10000) // 10 second timeout

      const messageHandler = (event) => {
        if (event.origin !== window.location.origin) return

        if (event.data.type === 'google-auth-success') {
          clearTimeout(timeout)
          window.removeEventListener('message', messageHandler)
          document.body.removeChild(iframe)

          // Update token manager
          this.tokenManager.setToken(event.data.accessToken, event.data.expiresIn || 3600)

          resolve({
            accessToken: event.data.accessToken,
            expiresAt: Date.now() + (event.data.expiresIn * 1000)
          })
        } else if (event.data.type === 'google-auth-error') {
          clearTimeout(timeout)
          window.removeEventListener('message', messageHandler)
          document.body.removeChild(iframe)

          // If silent auth fails, trigger interactive re-authentication
          console.log('Silent auth failed, triggering interactive authentication...')
          this.authenticate().then(resolve).catch(reject)
        }
      }

      window.addEventListener('message', messageHandler)
      document.body.appendChild(iframe)
    })
  }

  /**
   * Build Google OAuth2 authorization URL
   */
  buildAuthUrl(silent = false) {
    const params = new URLSearchParams({
      client_id: GOOGLE_CONFIG.clientId,
      redirect_uri: GOOGLE_CONFIG.redirectUri,
      scope: GOOGLE_CONFIG.scope,
      response_type: GOOGLE_CONFIG.responseType,
      prompt: silent ? 'none' : GOOGLE_CONFIG.prompt // Use 'none' for silent auth
    })

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  }

  /**
   * Get current access token (automatically re-authenticates if expired)
   */
  async getValidToken() {
    const token = this.tokenManager.getToken()

    if (token) {
      return token
    }

    // Token expired or not available, re-authenticate
    console.log('Token expired, re-authenticating...')
    try {
      const result = await this.silentReauthenticate()
      return result.accessToken
    } catch (error) {
      console.error('Re-authentication failed:', error)
      // Fall back to interactive authentication
      const result = await this.authenticate()
      return result.accessToken
    }
  }

  /**
   * Exchange authorization code for access and refresh tokens
   */
  async exchangeCodeForTokens(code) {
    try {
      // Note: In a production app, this should be done on your backend server
      // for security reasons. For this demo, we'll use a proxy or CORS-enabled endpoint.

      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: GOOGLE_CONFIG.clientId,
          client_secret: 'YOUR_CLIENT_SECRET', // In production, this should be on backend
          code: code,
          grant_type: 'authorization_code',
          redirect_uri: GOOGLE_CONFIG.redirectUri
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(`Token exchange failed: ${error.error_description || error.error}`)
      }

      const tokenData = await response.json()

      return {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: Date.now() + (tokenData.expires_in * 1000),
        scope: tokenData.scope
      }
    } catch (error) {
      console.error('Token exchange error:', error)
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
  // For implicit flow, tokens come in the URL hash fragment
  const hashParams = new URLSearchParams(window.location.hash.substring(1))
  const accessToken = hashParams.get('access_token')
  const error = hashParams.get('error')
  const expiresIn = hashParams.get('expires_in')
  const scope = hashParams.get('scope')
  const tokenType = hashParams.get('token_type')

  if (error) {
    // Send error to parent window
    if (window.opener) {
      window.opener.postMessage({
        type: 'google-auth-error',
        error: error
      }, window.location.origin)
    }
  } else if (accessToken) {
    // Send success to parent window with token info
    if (window.opener) {
      window.opener.postMessage({
        type: 'google-auth-success',
        accessToken: accessToken,
        expiresIn: parseInt(expiresIn) || 3600,
        scope: scope,
        tokenType: tokenType || 'Bearer'
      }, window.location.origin)
    }
  }

  // Close the popup window
  window.close()
}

export default GoogleDriveAuth