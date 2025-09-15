import React, { useState, useEffect } from 'react'
import { Cloud, Settings, TestTube, CheckCircle, AlertCircle, Loader2, ExternalLink, Info, RefreshCw } from 'lucide-react'
import n8nService from '../utils/n8nService'

export default function N8nSettings() {
  const [isTestingConnection, setIsTestingConnection] = useState(false)
  const [connectionResult, setConnectionResult] = useState(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState(null)
  const [syncStatus, setSyncStatus] = useState(null)

  useEffect(() => {
    // Load sync status on component mount
    setSyncStatus(n8nService.getSyncStatus())
  }, [])

  const handleTestConnection = async () => {
    setIsTestingConnection(true)
    setConnectionResult(null)

    try {
      const result = await n8nService.testConnection()
      setConnectionResult({
        success: true,
        message: result.message,
        baseUrl: result.baseUrl
      })
    } catch (error) {
      setConnectionResult({
        success: false,
        message: error.message
      })
    } finally {
      setIsTestingConnection(false)
    }
  }

  const handleSync = async () => {
    setIsSyncing(true)
    setSyncResult(null)

    try {
      const result = await n8nService.syncFromN8n()
      setSyncResult({
        success: true,
        stakeholdersCount: result.stakeholders.length,
        categoriesCount: result.categories.length,
        errors: result.errors,
        lastSynced: result.lastSynced
      })

      // Update sync status
      setSyncStatus(n8nService.getSyncStatus())

      // Store data in localStorage for the app to use
      localStorage.setItem('cachedStakeholders', JSON.stringify(result.stakeholders))
      localStorage.setItem('cachedCategories', JSON.stringify(result.categories))

      // Dispatch custom event to notify other components
      window.dispatchEvent(new CustomEvent('n8nDataUpdated', {
        detail: {
          stakeholders: result.stakeholders,
          categories: result.categories
        }
      }))

    } catch (error) {
      setSyncResult({
        success: false,
        message: error.message
      })
      setSyncStatus(n8nService.getSyncStatus())
    } finally {
      setIsSyncing(false)
    }
  }

  const getStatusColor = (success) => {
    return success ? 'text-green-600' : 'text-red-600'
  }

  const getStatusIcon = (success) => {
    return success ? CheckCircle : AlertCircle
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-purple-100 rounded-lg">
          <Cloud className="w-5 h-5 text-purple-600" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">n8n Integration</h3>
          <p className="text-sm text-gray-600">
            Sync stakeholders and categories from Notion via n8n workflows
          </p>
        </div>
      </div>

      {/* Connection Status */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-medium text-gray-700">Connection Status</h4>
          <button
            onClick={handleTestConnection}
            disabled={isTestingConnection}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-purple-600 bg-purple-50 border border-purple-200 rounded-md hover:bg-purple-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isTestingConnection ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <TestTube className="w-4 h-4" />
            )}
            Test Connection
          </button>
        </div>

        {connectionResult && (
          <div className={`flex items-start gap-2 p-3 rounded-md ${
            connectionResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
          }`}>
            {React.createElement(getStatusIcon(connectionResult.success), {
              className: `w-4 h-4 mt-0.5 flex-shrink-0 ${getStatusColor(connectionResult.success)}`
            })}
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium ${getStatusColor(connectionResult.success)}`}>
                {connectionResult.success ? 'Connection Successful' : 'Connection Failed'}
              </p>
              <p className="text-sm text-gray-600 mt-1">{connectionResult.message}</p>
              {connectionResult.baseUrl && (
                <p className="text-xs text-gray-500 mt-1">
                  Base URL: {connectionResult.baseUrl}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Sync Section */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-medium text-gray-700">Data Sync</h4>
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSyncing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Sync Data
          </button>
        </div>

        {/* Sync Status */}
        {syncStatus && (
          <div className="bg-gray-50 rounded-md p-3 mb-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Last Synced:</span>
              <span className="font-medium text-gray-900">
                {syncStatus.lastSynced
                  ? new Date(syncStatus.lastSynced).toLocaleString()
                  : 'Never'
                }
              </span>
            </div>
            {syncStatus.lastError && (
              <div className="mt-2 text-sm text-red-600">
                <strong>Last Error:</strong> {syncStatus.lastError}
              </div>
            )}
          </div>
        )}

        {/* Sync Result */}
        {syncResult && (
          <div className={`flex items-start gap-2 p-3 rounded-md ${
            syncResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
          }`}>
            {React.createElement(getStatusIcon(syncResult.success), {
              className: `w-4 h-4 mt-0.5 flex-shrink-0 ${getStatusColor(syncResult.success)}`
            })}
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium ${getStatusColor(syncResult.success)}`}>
                {syncResult.success ? 'Sync Successful' : 'Sync Failed'}
              </p>
              {syncResult.success ? (
                <div className="text-sm text-gray-600 mt-1">
                  <p>✅ Fetched {syncResult.stakeholdersCount} stakeholders</p>
                  <p>✅ Fetched {syncResult.categoriesCount} categories</p>
                  {syncResult.errors.length > 0 && (
                    <div className="mt-2">
                      <p className="text-yellow-600 font-medium">Warnings:</p>
                      {syncResult.errors.map((error, index) => (
                        <p key={index} className="text-yellow-600 text-xs">• {error}</p>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-600 mt-1">{syncResult.message}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Information */}
      <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">n8n Workflow Integration</p>
            <p>This integration uses n8n workflows to sync data from your Notion databases:</p>
            <ul className="mt-1 ml-4 list-disc">
              <li>Categories from your Projects database</li>
              <li>Stakeholders from multiple databases</li>
              <li>Export meetings and create tasks automatically</li>
            </ul>
            <p className="mt-2">
              Make sure your n8n workflows are running and accessible at:
              <code className="ml-1 text-xs bg-blue-100 px-1 rounded">{n8nService.baseUrl}</code>
            </p>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mt-6 flex gap-3">
        <a
          href="http://localhost:5678"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
        >
          <ExternalLink className="w-4 h-4" />
          Open n8n Editor
        </a>
        <a
          href="https://docs.n8n.io/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
        >
          <ExternalLink className="w-4 h-4" />
          n8n Documentation
        </a>
      </div>
    </div>
  )
}