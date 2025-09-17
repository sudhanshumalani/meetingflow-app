/**
 * Google Drive OAuth2 Authentication Helper
 * Handles the OAuth flow for Google Drive API access
 */

// Google OAuth2 configuration
const GOOGLE_CONFIG = {
  // For development/demo: Use environment variables or replace with actual credentials
  clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
  redirectUri: window.location.origin + '/meetingflow-app/auth/google/callback',
  scope: 'https://www.googleapis.com/auth/drive.file',
  responseType: 'code'
}

// Log for debugging (remove in production)
if (import.meta.env.DEV) {
  console.log('Google Client ID configured:', !!import.meta.env.VITE_GOOGLE_CLIENT_ID)
  console.log('Client ID length:', GOOGLE_CONFIG.clientId?.length)
}

export class GoogleDriveAuth {
  constructor() {
    this.authWindow = null
    this.authPromise = null
  }

  /**
   * Check if Google OAuth configuration is valid
   */
  isValidConfig() {
    // Check if we have a valid client ID (not empty and looks like a real Google client ID)
    return GOOGLE_CONFIG.clientId &&
           GOOGLE_CONFIG.clientId.length > 20 &&
           GOOGLE_CONFIG.clientId.includes('.apps.googleusercontent.com')
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

          try {
            const tokens = await this.exchangeCodeForTokens(event.data.code)
            resolve(tokens)
          } catch (error) {
            reject(error)
          }
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
   * Build Google OAuth2 authorization URL
   */
  buildAuthUrl() {
    const params = new URLSearchParams({
      client_id: GOOGLE_CONFIG.clientId,
      redirect_uri: GOOGLE_CONFIG.redirectUri,
      scope: GOOGLE_CONFIG.scope,
      response_type: GOOGLE_CONFIG.responseType,
      access_type: 'offline',
      prompt: 'consent'
    })

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
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
        throw new Error(`Failed to get user info: ${response.statusText}`)
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
   * Create a dedicated folder for MeetingFlow data
   */
  async createMeetingFlowFolder(accessToken) {
    try {
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
}

// Auth callback handler - this should be included in your routing
export function handleGoogleAuthCallback() {
  const urlParams = new URLSearchParams(window.location.search)
  const code = urlParams.get('code')
  const error = urlParams.get('error')

  if (error) {
    // Send error to parent window
    if (window.opener) {
      window.opener.postMessage({
        type: 'google-auth-error',
        error: error
      }, window.location.origin)
    }
  } else if (code) {
    // Send success to parent window
    if (window.opener) {
      window.opener.postMessage({
        type: 'google-auth-success',
        code: code
      }, window.location.origin)
    }
  }

  // Close the popup window
  window.close()
}

export default GoogleDriveAuth