import React from 'react'
import { Cloud, CloudOff, Loader2, CheckCircle, AlertCircle, RefreshCw, Settings } from 'lucide-react'
import { useApp } from '../contexts/AppContext'
import { format } from 'date-fns'

export default function NotionSyncStatus({ showDetails = true, onConfigureClick = null }) {
  const { notion, syncFromNotion, testNotionConnection } = useApp()

  const getSyncStatusDisplay = () => {
    if (!notion.isConfigured) {
      return {
        icon: <CloudOff className="w-4 h-4" />,
        color: 'text-gray-500',
        bgColor: 'bg-gray-100',
        text: 'Not configured',
        description: 'Notion integration not set up'
      }
    }

    if (notion.isSyncing) {
      return {
        icon: <Loader2 className="w-4 h-4 animate-spin" />,
        color: 'text-blue-600',
        bgColor: 'bg-blue-100',
        text: 'Syncing...',
        description: 'Fetching data from Notion'
      }
    }

    if (notion.error) {
      return {
        icon: <AlertCircle className="w-4 h-4" />,
        color: 'text-red-600',
        bgColor: 'bg-red-100',
        text: 'Sync failed',
        description: notion.error
      }
    }

    if (notion.lastSync) {
      return {
        icon: <CheckCircle className="w-4 h-4" />,
        color: 'text-green-600',
        bgColor: 'bg-green-100',
        text: 'Synced',
        description: `Last synced ${format(new Date(notion.lastSync), 'MMM d, h:mm a')}`
      }
    }

    return {
      icon: <Cloud className="w-4 h-4" />,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-100',
      text: 'Ready',
      description: 'Ready to sync with Notion'
    }
  }

  const handleSync = async () => {
    try {
      await syncFromNotion()
    } catch (error) {
      console.error('Sync failed:', error)
    }
  }

  const handleTestConnection = async () => {
    try {
      await testNotionConnection()
    } catch (error) {
      console.error('Connection test failed:', error)
    }
  }

  const status = getSyncStatusDisplay()

  if (!showDetails) {
    return (
      <div className={`inline-flex items-center gap-2 px-2 py-1 rounded-full ${status.bgColor}`}>
        <span className={status.color}>{status.icon}</span>
        <span className={`text-xs font-medium ${status.color}`}>
          {status.text}
        </span>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-full ${status.bgColor}`}>
            <span className={status.color}>{status.icon}</span>
          </div>
          <div>
            <h3 className="font-medium text-gray-900">Notion Integration</h3>
            <p className="text-sm text-gray-600">{status.description}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {notion.isConfigured && !notion.isSyncing && (
            <button
              onClick={handleSync}
              className="flex items-center gap-1 px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              title="Sync now"
            >
              <RefreshCw className="w-4 h-4" />
              Sync
            </button>
          )}

          {onConfigureClick && (
            <button
              onClick={onConfigureClick}
              className="flex items-center gap-1 px-3 py-1 text-sm text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
              title="Configure Notion"
            >
              <Settings className="w-4 h-4" />
              {notion.isConfigured ? 'Settings' : 'Configure'}
            </button>
          )}
        </div>
      </div>

      {notion.isConfigured && (
        <div className="grid grid-cols-3 gap-4 pt-3 border-t border-gray-100">
          <div className="text-center">
            <div className="text-lg font-semibold text-gray-900">
              {notion.syncStatus.stakeholderDbId ? '✓' : '—'}
            </div>
            <div className="text-xs text-gray-600">Stakeholders</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-gray-900">
              {notion.syncStatus.categoryDbId ? '✓' : '—'}
            </div>
            <div className="text-xs text-gray-600">Categories</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-gray-900">
              {notion.syncStatus.meetingDbId ? '✓' : '—'}
            </div>
            <div className="text-xs text-gray-600">Export</div>
          </div>
        </div>
      )}
    </div>
  )
}

// Compact version for headers/navigation
export function NotionSyncBadge() {
  const { notion } = useApp()

  if (!notion.isConfigured) return null

  const getSyncIcon = () => {
    if (notion.isSyncing) {
      return <Loader2 className="w-3 h-3 animate-spin text-blue-600" />
    }
    if (notion.error) {
      return <AlertCircle className="w-3 h-3 text-red-600" />
    }
    if (notion.lastSync) {
      return <CheckCircle className="w-3 h-3 text-green-600" />
    }
    return <Cloud className="w-3 h-3 text-gray-600" />
  }

  return (
    <div className="flex items-center gap-1" title={`Notion: ${notion.isSyncing ? 'Syncing...' : notion.error ? 'Error' : 'Connected'}`}>
      {getSyncIcon()}
      <span className="text-xs text-gray-600 hidden sm:inline">Notion</span>
    </div>
  )
}