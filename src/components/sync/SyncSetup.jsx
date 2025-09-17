/**
 * SyncSetup Component
 * Configure sync providers and manage sync settings
 */

import { useState } from 'react'
import {
  Cloud,
  Github,
  Settings,
  Key,
  TestTube,
  CheckCircle,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  ExternalLink,
  HelpCircle,
  Zap,
  Database
} from 'lucide-react'
import { SYNC_PROVIDERS } from '../../hooks/useSync'
import GoogleDriveAuth from '../../utils/googleDriveAuth'

export function SyncSetup({
  onSetupComplete,
  isConfiguring = false,
  syncError = null,
  className = ''
}) {
  const [selectedProvider, setSelectedProvider] = useState(null)
  const [showSetup, setShowSetup] = useState(false)
  const [githubToken, setGithubToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [isTestingConnection, setIsTestingConnection] = useState(false)
  const [connectionTest, setConnectionTest] = useState(null)
  const [googleAuth, setGoogleAuth] = useState(null)
  const [isAuthenticating, setIsAuthenticating] = useState(false)

  const syncProviders = [
    {
      id: SYNC_PROVIDERS.GOOGLE_DRIVE,
      name: 'Google Drive',
      description: 'Secure sync with your Google Drive (setup required)',
      icon: Database,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
      features: ['15GB free storage', 'Secure OAuth', 'Easy setup', 'Cross-device'],
      setup: 'google',
      requiresSetup: true
    },
    {
      id: SYNC_PROVIDERS.GITHUB_GIST,
      name: 'GitHub Gist',
      description: 'Store data in private GitHub Gist (recommended for development)',
      icon: Github,
      color: 'text-gray-900',
      bgColor: 'bg-gray-100',
      features: ['Private storage', 'Free', 'Reliable', 'Version history'],
      setup: 'github'
    },
    {
      id: SYNC_PROVIDERS.N8N,
      name: 'n8n Workflow',
      description: 'Use existing n8n automation workflow',
      icon: Zap,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
      features: ['Custom workflow', 'Advanced automation', 'Flexible'],
      setup: 'n8n',
      disabled: true, // For now
      comingSoon: true
    }
  ]

  const handleProviderSelect = (provider) => {
    setSelectedProvider(provider)
    setShowSetup(true)
    setConnectionTest(null)

    // Initialize Google Auth instance for Google Drive
    if (provider.id === SYNC_PROVIDERS.GOOGLE_DRIVE && !googleAuth) {
      setGoogleAuth(new GoogleDriveAuth())
    }
  }

  const handleGithubSetup = async () => {
    if (!githubToken.trim()) {
      setConnectionTest({ success: false, error: 'GitHub token is required' })
      return
    }

    setIsTestingConnection(true)
    setConnectionTest(null)

    try {
      // Test the token first
      const response = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      })

      if (!response.ok) {
        throw new Error('Invalid GitHub token or insufficient permissions')
      }

      const user = await response.json()

      // Configure the sync provider
      const config = {
        githubToken: githubToken.trim(),
        username: user.login
      }

      const result = await onSetupComplete(SYNC_PROVIDERS.GITHUB_GIST, config)

      if (result.success) {
        setConnectionTest({
          success: true,
          message: `Connected as ${user.login}`,
          user
        })
        setShowSetup(false)
        setGithubToken('')
      } else {
        setConnectionTest({
          success: false,
          error: result.error || 'Setup failed'
        })
      }
    } catch (error) {
      console.error('GitHub setup failed:', error)
      setConnectionTest({
        success: false,
        error: error.message || 'Connection failed'
      })
    } finally {
      setIsTestingConnection(false)
    }
  }

  const handleGoogleDriveSetup = async () => {
    if (!googleAuth) {
      setConnectionTest({ success: false, error: 'Google Auth not initialized' })
      return
    }

    setIsAuthenticating(true)
    setConnectionTest(null)

    try {
      // Start Google OAuth flow
      const tokens = await googleAuth.authenticate()

      // Get user info
      const userInfo = await googleAuth.getUserInfo(tokens.accessToken)

      // Test Drive access
      const driveTest = await googleAuth.testDriveAccess(tokens.accessToken)

      if (!driveTest.success) {
        throw new Error(driveTest.error || 'Failed to access Google Drive')
      }

      // Create MeetingFlow folder
      const folderId = await googleAuth.createMeetingFlowFolder(tokens.accessToken)

      // Configure the sync provider
      const config = {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        userEmail: userInfo.email,
        userName: userInfo.name,
        folderId: folderId
      }

      const result = await onSetupComplete(SYNC_PROVIDERS.GOOGLE_DRIVE, config)

      if (result.success) {
        setConnectionTest({
          success: true,
          message: `Connected as ${userInfo.name} (${userInfo.email})`,
          user: userInfo
        })
        setShowSetup(false)
      } else {
        setConnectionTest({
          success: false,
          error: result.error || 'Setup failed'
        })
      }
    } catch (error) {
      console.error('Google Drive setup failed:', error)
      setConnectionTest({
        success: false,
        error: error.message || 'Authentication failed'
      })
    } finally {
      setIsAuthenticating(false)
    }
  }

  const renderGitHubSetup = () => (
    <div className="space-y-4">
      <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
        <h4 className="font-medium text-blue-900 mb-2 flex items-center gap-2">
          <HelpCircle size={16} />
          How to get a GitHub Token
        </h4>
        <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
          <li>Go to GitHub Settings → Developer settings → Personal access tokens</li>
          <li>Click "Generate new token (classic)"</li>
          <li>Select "gist" scope for private gist access</li>
          <li>Copy the generated token</li>
        </ol>
        <a
          href="https://github.com/settings/tokens/new?scopes=gist&description=MeetingFlow%20App%20Sync"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 mt-3 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <ExternalLink size={14} />
          Create GitHub Token
        </a>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          GitHub Personal Access Token
        </label>
        <div className="relative">
          <input
            type={showToken ? 'text' : 'password'}
            value={githubToken}
            onChange={(e) => setGithubToken(e.target.value)}
            placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-10"
          />
          <button
            type="button"
            onClick={() => setShowToken(!showToken)}
            className="absolute inset-y-0 right-0 pr-3 flex items-center"
          >
            {showToken ? (
              <EyeOff size={16} className="text-gray-400" />
            ) : (
              <Eye size={16} className="text-gray-400" />
            )}
          </button>
        </div>
      </div>

      {connectionTest && (
        <div className={`p-3 rounded-lg border ${
          connectionTest.success
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          <div className="flex items-center gap-2">
            {connectionTest.success ? (
              <CheckCircle size={16} />
            ) : (
              <AlertCircle size={16} />
            )}
            <span className="text-sm font-medium">
              {connectionTest.success ? 'Success!' : 'Error'}
            </span>
          </div>
          <p className="text-sm mt-1">
            {connectionTest.message || connectionTest.error}
          </p>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => setShowSetup(false)}
          className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleGithubSetup}
          disabled={!githubToken.trim() || isTestingConnection}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isTestingConnection ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Testing Connection...
            </>
          ) : (
            <>
              <TestTube size={16} />
              Test & Setup
            </>
          )}
        </button>
      </div>
    </div>
  )

  const renderGoogleDriveSetup = () => {
    // Check if Google OAuth is properly configured
    const isConfigured = googleAuth?.isValidConfig()

    // Show client ID status (helpful for debugging)
    const clientIdStatus = {
      hasClientId: !!import.meta.env.VITE_GOOGLE_CLIENT_ID,
      clientIdLength: import.meta.env.VITE_GOOGLE_CLIENT_ID?.length || 0,
      isConfigured: isConfigured
    }

    return (
      <div className="space-y-4">
        {/* Show client ID status for debugging */}
        {clientIdStatus.hasClientId && (
          <div className="p-2 bg-gray-100 rounded text-xs text-gray-600">
            Client ID detected (length: {clientIdStatus.clientIdLength} chars)
            {clientIdStatus.isConfigured ? ' ✅ Valid' : ' ⚠️ Invalid format'}
          </div>
        )}
        {!isConfigured ? (
          <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
            <h4 className="font-medium text-amber-900 mb-2 flex items-center gap-2">
              <AlertCircle size={16} />
              Google OAuth Setup Required
            </h4>
            <div className="text-sm text-amber-800 space-y-2">
              <p>To use Google Drive sync, you need to set up Google API credentials:</p>
              <ol className="list-decimal list-inside space-y-1 ml-2">
                <li>Go to <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Google Cloud Console</a></li>
                <li>Create a new project or select existing one</li>
                <li>Enable the Google Drive API</li>
                <li>Create OAuth 2.0 credentials (Web application)</li>
                <li>Add <code className="bg-amber-100 px-1 rounded">{window.location.origin}/meetingflow-app/auth/google/callback</code> as authorized redirect URI</li>
                <li>Set <code className="bg-amber-100 px-1 rounded">VITE_GOOGLE_CLIENT_ID</code> environment variable with your client ID</li>
              </ol>
              <p className="mt-2 text-xs">For development testing, you can use the GitHub Gist sync option instead.</p>
            </div>
          </div>
        ) : (
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h4 className="font-medium text-blue-900 mb-2 flex items-center gap-2">
              <HelpCircle size={16} />
              About Google Drive Sync
            </h4>
            <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
              <li>Secure OAuth2 authentication - no passwords stored</li>
              <li>Data is stored in a dedicated "MeetingFlow Data" folder</li>
              <li>Your data remains private and encrypted</li>
              <li>15GB of free storage included with your Google account</li>
            </ul>
          </div>
        )}

      {connectionTest && (
        <div className={`p-3 rounded-lg border ${
          connectionTest.success
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          <div className="flex items-center gap-2">
            {connectionTest.success ? (
              <CheckCircle size={16} />
            ) : (
              <AlertCircle size={16} />
            )}
            <span className="text-sm font-medium">
              {connectionTest.success ? 'Success!' : 'Error'}
            </span>
          </div>
          <p className="text-sm mt-1">
            {connectionTest.message || connectionTest.error}
          </p>
        </div>
      )}

        <div className="flex gap-3">
          <button
            onClick={() => setShowSetup(false)}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleGoogleDriveSetup}
            disabled={isAuthenticating || !isConfigured}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isAuthenticating ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Authenticating...
              </>
            ) : !isConfigured ? (
              <>
                <AlertCircle size={16} />
                Setup Required
              </>
            ) : (
              <>
                <Key size={16} />
                Connect with Google
              </>
            )}
          </button>
        </div>
      </div>
    )
  }

  if (showSetup && selectedProvider?.id === SYNC_PROVIDERS.GOOGLE_DRIVE) {
    return (
      <div className={`bg-white rounded-lg border shadow-sm p-6 ${className}`}>
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Database size={20} className="text-blue-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Setup Google Drive Sync</h3>
            <p className="text-sm text-gray-600">Connect your Google account for secure data sync</p>
          </div>
        </div>

        {renderGoogleDriveSetup()}
      </div>
    )
  }

  if (showSetup && selectedProvider?.id === SYNC_PROVIDERS.GITHUB_GIST) {
    return (
      <div className={`bg-white rounded-lg border shadow-sm p-6 ${className}`}>
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-gray-100 rounded-lg">
            <Github size={20} />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Setup GitHub Gist Sync</h3>
            <p className="text-sm text-gray-600">Connect your GitHub account for secure data sync</p>
          </div>
        </div>

        {renderGitHubSetup()}
      </div>
    )
  }

  return (
    <div className={`space-y-6 ${className}`}>
      <div className="text-center">
        <Cloud size={48} className="text-blue-500 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-gray-900 mb-2">
          Setup Cross-Device Sync
        </h3>
        <p className="text-gray-600 max-w-md mx-auto">
          Keep your meetings synchronized across all your devices. Choose a sync provider to get started.
        </p>
      </div>

      <div className="grid gap-4">
        {syncProviders.map((provider) => (
          <div
            key={provider.id}
            className={`
              relative p-4 border rounded-lg transition-all cursor-pointer
              ${provider.disabled
                ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
                : 'border-gray-200 hover:border-blue-300 hover:shadow-md'
              }
            `}
            onClick={() => !provider.disabled && handleProviderSelect(provider)}
          >
            {provider.comingSoon && (
              <div className="absolute top-2 right-2 px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-full font-medium">
                Coming Soon
              </div>
            )}

            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-lg ${provider.bgColor}`}>
                <provider.icon size={24} className={provider.color} />
              </div>

              <div className="flex-1">
                <h4 className="font-semibold text-gray-900">{provider.name}</h4>
                <p className="text-sm text-gray-600 mb-3">{provider.description}</p>

                <div className="flex flex-wrap gap-2">
                  {provider.features.map((feature, index) => (
                    <span
                      key={index}
                      className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full"
                    >
                      {feature}
                    </span>
                  ))}
                </div>
              </div>

              {!provider.disabled && (
                <div className="text-blue-500">
                  <Settings size={20} />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {syncError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center gap-2 text-red-800">
            <AlertCircle size={16} />
            <span className="font-medium">Setup Error</span>
          </div>
          <p className="text-sm text-red-700 mt-1">{syncError}</p>
        </div>
      )}

      <div className="text-center text-sm text-gray-500">
        <p>Your data is encrypted and stored securely in your chosen provider.</p>
        <p>You can change or disable sync at any time in Settings.</p>
      </div>
    </div>
  )
}

export default SyncSetup