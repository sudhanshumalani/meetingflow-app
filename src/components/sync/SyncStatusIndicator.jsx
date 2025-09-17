/**
 * SyncStatusIndicator Component
 * Shows current sync status with visual indicators
 */

import {
  Cloud,
  CloudOff,
  Loader2,
  CheckCircle,
  AlertCircle,
  Wifi,
  WifiOff,
  Clock,
  Zap
} from 'lucide-react'
import { SYNC_STATUS } from '../../hooks/useSync'

export function SyncStatusIndicator({
  syncStatus,
  isOnline,
  lastSyncTime,
  hasError,
  hasConflict,
  queuedOperations = 0,
  className = '',
  showText = true,
  size = 16,
  onClick
}) {

  const getStatusInfo = () => {
    // Offline status takes priority
    if (!isOnline) {
      return {
        icon: WifiOff,
        color: 'text-gray-400',
        bgColor: 'bg-gray-100',
        text: 'Offline',
        description: queuedOperations > 0
          ? `${queuedOperations} operations queued`
          : 'No internet connection'
      }
    }

    // Conflict status
    if (hasConflict) {
      return {
        icon: AlertCircle,
        color: 'text-orange-600',
        bgColor: 'bg-orange-100',
        text: 'Conflict',
        description: 'Sync conflict needs resolution',
        pulse: true
      }
    }

    // Error status
    if (hasError) {
      return {
        icon: AlertCircle,
        color: 'text-red-600',
        bgColor: 'bg-red-100',
        text: 'Error',
        description: 'Sync error occurred',
        pulse: true
      }
    }

    // Active sync status
    switch (syncStatus) {
      case SYNC_STATUS.SYNCING:
        return {
          icon: Loader2,
          color: 'text-blue-600',
          bgColor: 'bg-blue-100',
          text: 'Syncing',
          description: 'Syncing data...',
          spin: true
        }

      case SYNC_STATUS.SUCCESS:
        return {
          icon: CheckCircle,
          color: 'text-green-600',
          bgColor: 'bg-green-100',
          text: 'Synced',
          description: lastSyncTime
            ? `Last sync: ${formatSyncTime(lastSyncTime)}`
            : 'Successfully synced'
        }

      case SYNC_STATUS.IDLE:
      default:
        return {
          icon: Cloud,
          color: 'text-gray-600',
          bgColor: 'bg-gray-100',
          text: 'Ready',
          description: 'Ready to sync'
        }
    }
  }

  const formatSyncTime = (timestamp) => {
    const now = new Date()
    const syncTime = new Date(timestamp)
    const diffMs = now - syncTime
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return syncTime.toLocaleDateString()
  }

  const statusInfo = getStatusInfo()
  const IconComponent = statusInfo.icon

  return (
    <div
      className={`
        flex items-center gap-2
        ${onClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}
        ${className}
      `}
      onClick={onClick}
      title={statusInfo.description}
    >
      <div className={`
        p-1.5 rounded-full
        ${statusInfo.bgColor}
        ${statusInfo.pulse ? 'animate-pulse' : ''}
      `}>
        <IconComponent
          size={size}
          className={`
            ${statusInfo.color}
            ${statusInfo.spin ? 'animate-spin' : ''}
          `}
        />
      </div>

      {showText && (
        <div className="flex flex-col min-w-0">
          <span className={`text-sm font-medium ${statusInfo.color}`}>
            {statusInfo.text}
          </span>
          {statusInfo.description && (
            <span className="text-xs text-gray-500 truncate">
              {statusInfo.description}
            </span>
          )}
        </div>
      )}

      {queuedOperations > 0 && isOnline && (
        <div className="flex items-center gap-1 px-2 py-0.5 bg-blue-100 rounded-full">
          <Clock size={12} className="text-blue-600" />
          <span className="text-xs text-blue-600 font-medium">
            {queuedOperations}
          </span>
        </div>
      )}
    </div>
  )
}

export default SyncStatusIndicator