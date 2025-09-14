import React from 'react'
import { STAKEHOLDER_PRIORITIES, RELATIONSHIP_HEALTH } from '../utils/stakeholderManager'

export function PriorityIndicator({ priority, size = 'sm' }) {
  const getPriorityConfig = (priority) => {
    switch (priority) {
      case STAKEHOLDER_PRIORITIES.CRITICAL:
        return {
          color: 'bg-red-500',
          textColor: 'text-red-700',
          bgColor: 'bg-red-50',
          label: 'Critical',
          icon: '🔴'
        }
      case STAKEHOLDER_PRIORITIES.HIGH:
        return {
          color: 'bg-orange-500',
          textColor: 'text-orange-700',
          bgColor: 'bg-orange-50',
          label: 'High',
          icon: '🟠'
        }
      case STAKEHOLDER_PRIORITIES.MEDIUM:
        return {
          color: 'bg-yellow-500',
          textColor: 'text-yellow-700',
          bgColor: 'bg-yellow-50',
          label: 'Medium',
          icon: '🟡'
        }
      case STAKEHOLDER_PRIORITIES.LOW:
        return {
          color: 'bg-green-500',
          textColor: 'text-green-700',
          bgColor: 'bg-green-50',
          label: 'Low',
          icon: '🟢'
        }
      case STAKEHOLDER_PRIORITIES.ARCHIVED:
        return {
          color: 'bg-gray-500',
          textColor: 'text-gray-700',
          bgColor: 'bg-gray-50',
          label: 'Archived',
          icon: '⚪'
        }
      default:
        return {
          color: 'bg-gray-400',
          textColor: 'text-gray-600',
          bgColor: 'bg-gray-50',
          label: 'Unknown',
          icon: '❓'
        }
    }
  }

  const config = getPriorityConfig(priority)
  const sizeClasses = {
    xs: 'w-2 h-2',
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-6 h-6'
  }

  return (
    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full ${config.bgColor} ${config.textColor}`}>
      <div className={`${config.color} ${sizeClasses[size]} rounded-full flex-shrink-0`}></div>
      <span className="text-xs font-medium">{config.label}</span>
    </div>
  )
}

export function HealthIndicator({ health, showLabel = true, size = 'sm' }) {
  const getHealthConfig = (health) => {
    switch (health) {
      case RELATIONSHIP_HEALTH.EXCELLENT:
        return {
          color: 'text-green-500',
          bgColor: 'bg-green-50',
          textColor: 'text-green-700',
          label: 'Excellent',
          icon: '💚',
          pulse: false
        }
      case RELATIONSHIP_HEALTH.GOOD:
        return {
          color: 'text-blue-500',
          bgColor: 'bg-blue-50',
          textColor: 'text-blue-700',
          label: 'Good',
          icon: '💙',
          pulse: false
        }
      case RELATIONSHIP_HEALTH.NEUTRAL:
        return {
          color: 'text-yellow-500',
          bgColor: 'bg-yellow-50',
          textColor: 'text-yellow-700',
          label: 'Neutral',
          icon: '💛',
          pulse: false
        }
      case RELATIONSHIP_HEALTH.AT_RISK:
        return {
          color: 'text-orange-500',
          bgColor: 'bg-orange-50',
          textColor: 'text-orange-700',
          label: 'At Risk',
          icon: '🧡',
          pulse: true
        }
      case RELATIONSHIP_HEALTH.CRITICAL:
        return {
          color: 'text-red-500',
          bgColor: 'bg-red-50',
          textColor: 'text-red-700',
          label: 'Critical',
          icon: '❤️',
          pulse: true
        }
      case RELATIONSHIP_HEALTH.DORMANT:
        return {
          color: 'text-gray-500',
          bgColor: 'bg-gray-50',
          textColor: 'text-gray-700',
          label: 'Dormant',
          icon: '🤍',
          pulse: false
        }
      default:
        return {
          color: 'text-gray-400',
          bgColor: 'bg-gray-50',
          textColor: 'text-gray-600',
          label: 'Unknown',
          icon: '❓',
          pulse: false
        }
    }
  }

  const config = getHealthConfig(health)
  const sizeClasses = {
    xs: 'text-xs',
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg'
  }

  return (
    <div className={`inline-flex items-center gap-1 ${showLabel ? `px-2 py-1 rounded-full ${config.bgColor} ${config.textColor}` : ''}`}>
      <span 
        className={`${sizeClasses[size]} ${config.color} ${config.pulse ? 'animate-pulse' : ''}`}
        title={config.label}
      >
        {config.icon}
      </span>
      {showLabel && <span className="text-xs font-medium">{config.label}</span>}
    </div>
  )
}

export function StakeholderMetrics({ stakeholder, compact = false }) {
  if (!stakeholder) return null

  const daysSinceLastContact = stakeholder.lastContactDate 
    ? Math.floor((new Date() - new Date(stakeholder.lastContactDate)) / (1000 * 60 * 60 * 24))
    : null

  const totalInteractions = stakeholder.interactions?.length || 0
  const recentInteractions = stakeholder.interactions?.filter(
    interaction => new Date(interaction.date) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  ).length || 0

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <PriorityIndicator priority={stakeholder.priority} size="xs" />
        <HealthIndicator health={stakeholder.relationshipHealth} showLabel={false} size="sm" />
        {daysSinceLastContact !== null && (
          <span className="text-xs text-gray-500">
            {daysSinceLastContact}d ago
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <PriorityIndicator priority={stakeholder.priority} />
        <HealthIndicator health={stakeholder.relationshipHealth} />
      </div>
      
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-gray-500">Last Contact</span>
          <p className="font-medium">
            {stakeholder.lastContactDate 
              ? `${daysSinceLastContact} days ago`
              : 'Never'
            }
          </p>
        </div>
        
        <div>
          <span className="text-gray-500">Interactions</span>
          <p className="font-medium">
            {totalInteractions} total ({recentInteractions} recent)
          </p>
        </div>
        
        <div>
          <span className="text-gray-500">Category</span>
          <p className="font-medium capitalize">{stakeholder.category}</p>
        </div>
        
        <div>
          <span className="text-gray-500">Satisfaction</span>
          <p className="font-medium">
            {stakeholder.satisfactionScore ? `${stakeholder.satisfactionScore}/10` : 'N/A'}
          </p>
        </div>
      </div>
      
      {stakeholder.notes && (
        <div>
          <span className="text-gray-500 text-sm">Notes</span>
          <p className="text-sm mt-1 text-gray-700">{stakeholder.notes}</p>
        </div>
      )}
    </div>
  )
}

export function HealthTrend({ stakeholder }) {
  if (!stakeholder?.interactions?.length) {
    return (
      <div className="text-xs text-gray-500 flex items-center gap-1">
        <span>📊</span>
        <span>No trend data</span>
      </div>
    )
  }

  // Calculate trend based on recent interactions
  const recentInteractions = stakeholder.interactions
    .filter(interaction => new Date(interaction.date) > new Date(Date.now() - 90 * 24 * 60 * 60 * 1000))
    .sort((a, b) => new Date(b.date) - new Date(a.date))

  if (recentInteractions.length < 2) {
    return (
      <div className="text-xs text-gray-500 flex items-center gap-1">
        <span>📊</span>
        <span>Insufficient data</span>
      </div>
    )
  }

  const avgQuality = recentInteractions.reduce((sum, interaction) => 
    sum + (interaction.quality || 5), 0) / recentInteractions.length

  const trend = avgQuality >= 7 ? 'improving' : avgQuality >= 4 ? 'stable' : 'declining'
  const trendConfig = {
    improving: { icon: '📈', color: 'text-green-600', label: 'Improving' },
    stable: { icon: '📊', color: 'text-blue-600', label: 'Stable' },
    declining: { icon: '📉', color: 'text-red-600', label: 'Declining' }
  }

  const config = trendConfig[trend]

  return (
    <div className={`text-xs flex items-center gap-1 ${config.color}`}>
      <span>{config.icon}</span>
      <span>{config.label}</span>
    </div>
  )
}