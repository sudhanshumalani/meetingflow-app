/**
 * SyncConflictResolver Component
 * Handle sync conflicts between local and cloud data
 */

import { useState } from 'react'
import {
  AlertTriangle,
  Smartphone,
  Cloud,
  Clock,
  Users,
  FileText,
  ArrowRight,
  Merge,
  Download,
  Upload,
  Loader2,
  CheckCircle
} from 'lucide-react'

export function SyncConflictResolver({
  conflictData,
  onResolve,
  isResolving = false,
  className = ''
}) {
  const [selectedResolution, setSelectedResolution] = useState(null)

  if (!conflictData) return null

  const { local, cloud, conflict } = conflictData

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleString()
  }

  const getDataSummary = (data) => {
    const meetings = data?.meetings || []
    const stakeholders = data?.stakeholders || []

    return {
      meetings: meetings.length,
      stakeholders: stakeholders.length,
      lastMeeting: meetings[0]?.title || 'None',
      totalData: JSON.stringify(data).length
    }
  }

  const localSummary = getDataSummary(local?.data || local)
  const cloudSummary = getDataSummary(cloud?.data || cloud)

  const resolutionOptions = [
    {
      id: 'use_local',
      title: 'Use Local Data',
      description: 'Keep the data from this device and overwrite cloud data',
      icon: Smartphone,
      color: 'blue',
      risk: 'low',
      action: 'This will upload your local data to the cloud'
    },
    {
      id: 'use_cloud',
      title: 'Use Cloud Data',
      description: 'Download cloud data and replace local data',
      icon: Cloud,
      color: 'green',
      risk: 'medium',
      action: 'This will replace all local data with cloud data'
    },
    {
      id: 'merge',
      title: 'Smart Merge',
      description: 'Intelligently combine local and cloud data',
      icon: Merge,
      color: 'purple',
      risk: 'low',
      action: 'This will merge both datasets, keeping the most recent entries'
    }
  ]

  const handleResolve = async () => {
    if (selectedResolution && onResolve) {
      await onResolve(selectedResolution)
    }
  }

  const getRiskColor = (risk) => {
    switch (risk) {
      case 'low': return 'text-green-600 bg-green-100'
      case 'medium': return 'text-yellow-600 bg-yellow-100'
      case 'high': return 'text-red-600 bg-red-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  const getOptionColor = (color, selected = false) => {
    const colors = {
      blue: selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300',
      green: selected ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-green-300',
      purple: selected ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:border-purple-300'
    }
    return colors[color] || colors.blue
  }

  return (
    <div className={`bg-white rounded-lg border shadow-lg p-6 ${className}`}>
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-orange-100 rounded-lg">
          <AlertTriangle size={24} className="text-orange-600" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Sync Conflict Detected</h3>
          <p className="text-sm text-gray-600">
            Your data has been modified on multiple devices. Choose how to resolve this conflict.
          </p>
        </div>
      </div>

      {/* Conflict Details */}
      <div className="grid md:grid-cols-2 gap-4 mb-6">
        {/* Local Data */}
        <div className="p-4 border border-blue-200 rounded-lg bg-blue-50">
          <div className="flex items-center gap-2 mb-3">
            <Smartphone size={16} className="text-blue-600" />
            <span className="font-medium text-blue-900">Local Data (This Device)</span>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Meetings:</span>
              <span className="font-medium">{localSummary.meetings}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Stakeholders:</span>
              <span className="font-medium">{localSummary.stakeholders}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Last Modified:</span>
              <span className="font-medium text-xs">
                {formatTimestamp(local?.metadata?.timestamp || conflict?.localTimestamp)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Device:</span>
              <span className="font-medium">{conflict?.localDevice || 'This Device'}</span>
            </div>
          </div>
        </div>

        {/* Cloud Data */}
        <div className="p-4 border border-green-200 rounded-lg bg-green-50">
          <div className="flex items-center gap-2 mb-3">
            <Cloud size={16} className="text-green-600" />
            <span className="font-medium text-green-900">Cloud Data</span>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Meetings:</span>
              <span className="font-medium">{cloudSummary.meetings}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Stakeholders:</span>
              <span className="font-medium">{cloudSummary.stakeholders}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Last Modified:</span>
              <span className="font-medium text-xs">
                {formatTimestamp(cloud?.metadata?.timestamp || conflict?.cloudTimestamp)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Device:</span>
              <span className="font-medium">{conflict?.cloudDevice || 'Unknown'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Resolution Options */}
      <div className="space-y-4 mb-6">
        <h4 className="font-semibold text-gray-900">Choose Resolution Method:</h4>

        {resolutionOptions.map((option) => {
          const IconComponent = option.icon
          const isSelected = selectedResolution === option.id

          return (
            <div
              key={option.id}
              className={`
                p-4 border rounded-lg cursor-pointer transition-all
                ${getOptionColor(option.color, isSelected)}
              `}
              onClick={() => setSelectedResolution(option.id)}
            >
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg bg-${option.color}-100 mt-1`}>
                  <IconComponent size={16} className={`text-${option.color}-600`} />
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium">{option.title}</span>
                    <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${getRiskColor(option.risk)}`}>
                      {option.risk} risk
                    </span>
                  </div>

                  <p className="text-sm text-gray-600 mb-2">{option.description}</p>

                  <p className="text-xs text-gray-500">{option.action}</p>
                </div>

                {isSelected && (
                  <CheckCircle size={20} className="text-blue-600 mt-1" />
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end gap-3 pt-4 border-t">
        <button
          onClick={() => setSelectedResolution(null)}
          className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
          disabled={isResolving}
        >
          Cancel
        </button>

        <button
          onClick={handleResolve}
          disabled={!selectedResolution || isResolving}
          className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isResolving ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Resolving...
            </>
          ) : (
            <>
              <ArrowRight size={16} />
              Resolve Conflict
            </>
          )}
        </button>
      </div>

      {/* Warning */}
      <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
        <p className="text-sm text-yellow-800">
          <strong>Important:</strong> This action cannot be undone. Make sure you have backups of important data before proceeding.
        </p>
      </div>
    </div>
  )
}

export default SyncConflictResolver