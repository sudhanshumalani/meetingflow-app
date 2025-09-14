import React, { useState } from 'react'
import { 
  Cloud, 
  CloudOff, 
  Loader2, 
  CheckCircle, 
  AlertCircle, 
  RefreshCw,
  ExternalLink,
  Upload,
  Database,
  RefreshCcw,
  Users
} from 'lucide-react'
import { useApp } from '../contexts/AppContext'

// Notion Sync Status Indicator
export function NotionSyncStatus({ className = '' }) {
  const { notion, refreshNotionStatus } = useApp()
  const { syncStatus, isConfigured } = notion

  if (!isConfigured) {
    return (
      <div className={`flex items-center gap-2 text-gray-500 ${className}`}>
        <CloudOff size={16} />
        <span className="text-sm">Notion not configured</span>
      </div>
    )
  }

  const getStatusIcon = () => {
    if (syncStatus.isSyncing) {
      return <Loader2 size={16} className="animate-spin text-blue-500" />
    }
    
    if (syncStatus.error) {
      return <AlertCircle size={16} className="text-red-500" />
    }
    
    if (syncStatus.isConnected) {
      return <CheckCircle size={16} className="text-green-500" />
    }
    
    return <CloudOff size={16} className="text-gray-500" />
  }

  const getStatusText = () => {
    if (syncStatus.isSyncing) return 'Syncing...'
    if (syncStatus.error) return 'Sync error'
    if (syncStatus.isConnected) return 'Connected'
    return 'Disconnected'
  }

  const getStatusColor = () => {
    if (syncStatus.isSyncing) return 'text-blue-600'
    if (syncStatus.error) return 'text-red-600'
    if (syncStatus.isConnected) return 'text-green-600'
    return 'text-gray-500'
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {getStatusIcon()}
      <span className={`text-sm ${getStatusColor()}`}>
        {getStatusText()}
      </span>
      {syncStatus.lastSync && (
        <span className="text-xs text-gray-500">
          Last: {new Date(syncStatus.lastSync).toLocaleTimeString()}
        </span>
      )}
      <button
        onClick={refreshNotionStatus}
        className="p-1 hover:bg-gray-100 rounded"
        title="Refresh status"
      >
        <RefreshCw size={12} />
      </button>
    </div>
  )
}

// Notion Stakeholder Sync Component
export function NotionStakeholderSync() {
  const { 
    notion, 
    syncStakeholdersFromNotion, 
    isLoading,
    stakeholders 
  } = useApp()
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastSyncResult, setLastSyncResult] = useState(null)

  const handleSync = async () => {
    setIsSyncing(true)
    setLastSyncResult(null)
    
    try {
      const result = await syncStakeholdersFromNotion()
      setLastSyncResult(result)
    } catch (error) {
      setLastSyncResult({ success: false, error: error.message })
    } finally {
      setIsSyncing(false)
    }
  }

  if (!notion.isConfigured) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle size={20} className="text-yellow-600 mt-0.5" />
          <div>
            <h3 className="font-medium text-yellow-900">Notion Not Configured</h3>
            <p className="text-sm text-yellow-700 mt-1">
              To sync stakeholders from Notion, add your API token and database IDs to the .env file.
            </p>
            <div className="mt-2 text-xs text-yellow-600">
              <p>Required environment variables:</p>
              <ul className="list-disc list-inside mt-1 space-y-1">
                <li>VITE_NOTION_API_TOKEN</li>
                <li>VITE_NOTION_STAKEHOLDERS_DATABASE_ID</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const notionStakeholderCount = stakeholders.filter(s => s.notionId).length
  const localOnlyCount = stakeholders.filter(s => !s.notionId).length

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Database size={20} className="text-blue-600" />
          <h3 className="font-medium text-gray-900">Notion Stakeholder Sync</h3>
        </div>
        <NotionSyncStatus />
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-blue-50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <Users size={16} className="text-blue-600" />
            <span className="text-sm font-medium text-blue-900">From Notion</span>
          </div>
          <div className="text-2xl font-bold text-blue-600">{notionStakeholderCount}</div>
        </div>
        
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <Users size={16} className="text-gray-600" />
            <span className="text-sm font-medium text-gray-700">Local Only</span>
          </div>
          <div className="text-2xl font-bold text-gray-600">{localOnlyCount}</div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSync}
          disabled={isSyncing || isLoading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSyncing ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <RefreshCcw size={16} />
          )}
          {isSyncing ? 'Syncing...' : 'Sync from Notion'}
        </button>

        {notion.lastStakeholderSync && (
          <span className="text-sm text-gray-600">
            Last sync: {new Date(notion.lastStakeholderSync).toLocaleString()}
          </span>
        )}
      </div>

      {lastSyncResult && (
        <div className={`mt-3 p-3 rounded-lg ${
          lastSyncResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          <div className="flex items-center gap-2">
            {lastSyncResult.success ? (
              <CheckCircle size={16} />
            ) : (
              <AlertCircle size={16} />
            )}
            <span className="text-sm font-medium">
              {lastSyncResult.success 
                ? `Successfully synced ${lastSyncResult.data?.length || 0} stakeholders`
                : `Sync failed: ${lastSyncResult.error}`
              }
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// Export to Notion Button Component
export function ExportToNotionButton({ meetingData, onSuccess, onError, className = '' }) {
  const { exportMeetingToNotion, notion } = useApp()
  const [isExporting, setIsExporting] = useState(false)

  const handleExport = async () => {
    if (!notion.isConfigured) {
      onError?.('Notion is not configured')
      return
    }

    setIsExporting(true)
    
    try {
      const result = await exportMeetingToNotion(meetingData)
      onSuccess?.(result)
    } catch (error) {
      onError?.(error.message)
    } finally {
      setIsExporting(false)
    }
  }

  if (!notion.isConfigured) {
    return (
      <button
        disabled
        className={`flex items-center gap-2 px-4 py-2 bg-gray-300 text-gray-500 rounded-lg cursor-not-allowed ${className}`}
        title="Notion not configured"
      >
        <CloudOff size={16} />
        Export to Notion
      </button>
    )
  }

  return (
    <button
      onClick={handleExport}
      disabled={isExporting}
      className={`flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${className}`}
    >
      {isExporting ? (
        <Loader2 size={16} className="animate-spin" />
      ) : (
        <Upload size={16} />
      )}
      {isExporting ? 'Exporting...' : 'Export to Notion'}
    </button>
  )
}

// Notion Stakeholder Dropdown (live data)
export function NotionStakeholderDropdown({ 
  value, 
  onChange, 
  placeholder = "Select stakeholder...",
  className = ''
}) {
  const { stakeholders, notion, syncStakeholdersFromNotion } = useApp()
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleRefresh = async () => {
    if (!notion.isConfigured) return
    
    setIsRefreshing(true)
    try {
      await syncStakeholdersFromNotion()
    } catch (error) {
      console.error('Failed to refresh stakeholders:', error)
    } finally {
      setIsRefreshing(false)
    }
  }

  // Group stakeholders by source
  const notionStakeholders = stakeholders.filter(s => s.notionId)
  const localStakeholders = stakeholders.filter(s => !s.notionId)

  return (
    <div className={`relative ${className}`}>
      <div className="flex items-center gap-2">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-500"
        >
          <option value="">{placeholder}</option>
          
          {notionStakeholders.length > 0 && (
            <optgroup label="📊 From Notion">
              {notionStakeholders.map(stakeholder => (
                <option key={stakeholder.id} value={stakeholder.id}>
                  {stakeholder.name} - {stakeholder.role || stakeholder.company}
                </option>
              ))}
            </optgroup>
          )}
          
          {localStakeholders.length > 0 && (
            <optgroup label="💾 Local Only">
              {localStakeholders.map(stakeholder => (
                <option key={stakeholder.id} value={stakeholder.id}>
                  {stakeholder.name} - {stakeholder.role || stakeholder.company}
                </option>
              ))}
            </optgroup>
          )}
        </select>

        {notion.isConfigured && (
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            title="Refresh from Notion"
          >
            <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
          </button>
        )}
      </div>

      {/* Status indicator */}
      <div className="flex items-center justify-between mt-1">
        <NotionSyncStatus className="text-xs" />
        
        {notion.isConfigured && (
          <span className="text-xs text-gray-500">
            {notionStakeholders.length} from Notion, {localStakeholders.length} local
          </span>
        )}
      </div>
    </div>
  )
}