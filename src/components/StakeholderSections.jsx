import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronRight, Calendar, Clock, TrendingUp, MessageCircle, Target, Mail, Phone, MapPin, Building, User, ExternalLink } from 'lucide-react'
import { format, differenceInDays } from 'date-fns'
import { STAKEHOLDER_CATEGORIES } from '../utils/stakeholderManager'
import { PriorityIndicator, HealthIndicator, StakeholderMetrics, HealthTrend } from './StakeholderIndicators'

export default function StakeholderSections({ meetings = [], stakeholders = [], searchTerm = '', sortBy = 'name' }) {
  const navigate = useNavigate()
  const [collapsedSections, setCollapsedSections] = useState({})
  const [expandedStakeholders, setExpandedStakeholders] = useState({})
  const [managedStakeholders, setManagedStakeholders] = useState([])

  useEffect(() => {
    // Use stakeholders directly - no need for stakeholderManager in this context
    setManagedStakeholders(stakeholders)
  }, [stakeholders])

  const filteredStakeholders = managedStakeholders.filter(stakeholder =>
    stakeholder.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    stakeholder.role?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    stakeholder.company?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    stakeholder.department?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const sortedStakeholders = [...filteredStakeholders].sort((a, b) => {
    switch (sortBy) {
      case 'priority':
        const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1, archived: 0 }
        return (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0)
      case 'health':
        const healthOrder = { excellent: 6, good: 5, neutral: 4, 'at-risk': 3, critical: 2, dormant: 1 }
        return (healthOrder[b.relationshipHealth] || 0) - (healthOrder[a.relationshipHealth] || 0)
      case 'lastContact':
        return new Date(b.lastContactDate || 0) - new Date(a.lastContactDate || 0)
      case 'name':
      default:
        return a.name.localeCompare(b.name)
    }
  })

  const groupedStakeholders = Object.values(STAKEHOLDER_CATEGORIES).reduce((groups, category) => {
    const categoryStakeholders = sortedStakeholders.filter(s => s.category === category)
    if (categoryStakeholders.length > 0) {
      groups[category] = categoryStakeholders
    }
    return groups
  }, {})

  const getStakeholderMeetings = (stakeholderId) => {
    return meetings.filter(meeting => 
      meeting.attendees?.includes(stakeholderId) || 
      meeting.stakeholderIds?.includes(stakeholderId)
    ).sort((a, b) => new Date(b.scheduledAt || b.createdAt) - new Date(a.scheduledAt || a.createdAt))
  }

  const toggleSection = (category) => {
    setCollapsedSections(prev => ({
      ...prev,
      [category]: !prev[category]
    }))
  }

  const toggleStakeholder = (stakeholderId) => {
    setExpandedStakeholders(prev => ({
      ...prev,
      [stakeholderId]: !prev[stakeholderId]
    }))
  }

  const handleMeetingClick = (meeting) => {
    navigate(`/meeting/${meeting.id}`)
  }

  const getCategoryIcon = (category) => {
    switch (category) {
      case 'executives': return '👔'
      case 'managers': return '📊'
      case 'peers': return '🤝'
      case 'reports': return '📈'
      case 'external': return '🌐'
      case 'vendors': return '🏪'
      case 'clients': return '💼'
      default: return '👤'
    }
  }

  const getCategoryDisplayName = (category) => {
    const names = {
      executives: 'Executives & Leadership',
      managers: 'Managers & Directors',
      peers: 'Peers & Colleagues',
      reports: 'Direct Reports',
      external: 'External Stakeholders',
      vendors: 'Vendors & Partners',
      clients: 'Clients & Customers'
    }
    return names[category] || category
  }

  const getContactMethod = (stakeholder) => {
    if (stakeholder.email) return { type: 'email', value: stakeholder.email, icon: Mail }
    if (stakeholder.phone) return { type: 'phone', value: stakeholder.phone, icon: Phone }
    return null
  }

  return (
    <div className="space-y-6">
      {Object.entries(groupedStakeholders).map(([category, stakeholders]) => (
        <div key={category} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {/* Section Header */}
          <button
            onClick={() => toggleSection(category)}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              {collapsedSections[category] ? (
                <ChevronRight size={20} className="text-gray-400" />
              ) : (
                <ChevronDown size={20} className="text-gray-400" />
              )}
              <span className="text-2xl">{getCategoryIcon(category)}</span>
              <div className="text-left">
                <h3 className="text-lg font-semibold text-gray-900">
                  {getCategoryDisplayName(category)}
                </h3>
                <p className="text-sm text-gray-500">
                  {stakeholders.length} stakeholder{stakeholders.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            
            {/* Section Summary */}
            <div className="flex items-center gap-4">
              <div className="flex gap-1">
                {['excellent', 'good', 'neutral', 'at-risk', 'critical'].map(health => {
                  const count = stakeholders.filter(s => s.relationshipHealth === health).length
                  if (count === 0) return null
                  return (
                    <div key={health} className="flex items-center gap-1">
                      <HealthIndicator health={health} showLabel={false} size="xs" />
                      <span className="text-xs text-gray-500">{count}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </button>

          {/* Section Content */}
          {!collapsedSections[category] && (
            <div className="px-6 pb-6">
              <div className="space-y-4">
                {stakeholders.map(stakeholder => {
                  const stakeholderMeetings = getStakeholderMeetings(stakeholder.id)
                  const upcomingMeetings = stakeholderMeetings.filter(m => 
                    m.status === 'upcoming' || 
                    (m.scheduledAt && new Date(m.scheduledAt) > new Date())
                  )
                  const completedMeetings = stakeholderMeetings.filter(m => 
                    m.status === 'completed' ||
                    (m.scheduledAt && new Date(m.scheduledAt) <= new Date())
                  )
                  const contactMethod = getContactMethod(stakeholder)
                  const isExpanded = expandedStakeholders[stakeholder.id]

                  return (
                    <div key={stakeholder.id} className="border border-gray-200 rounded-lg overflow-hidden">
                      {/* Stakeholder Header */}
                      <button
                        onClick={() => toggleStakeholder(stakeholder.id)}
                        className="w-full px-4 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center gap-4 flex-1">
                          {/* Avatar */}
                          <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold text-lg">
                            {stakeholder.name?.charAt(0) || '?'}
                          </div>
                          
                          {/* Basic Info */}
                          <div className="flex-1 text-left">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-semibold text-gray-900">{stakeholder.name}</h4>
                              <PriorityIndicator priority={stakeholder.priority} size="xs" />
                            </div>
                            <div className="flex items-center gap-3 text-sm text-gray-600">
                              <span>{stakeholder.role}</span>
                              {stakeholder.company && (
                                <>
                                  <span>•</span>
                                  <span className="flex items-center gap-1">
                                    <Building size={12} />
                                    {stakeholder.company}
                                  </span>
                                </>
                              )}
                              {stakeholder.location && (
                                <>
                                  <span>•</span>
                                  <span className="flex items-center gap-1">
                                    <MapPin size={12} />
                                    {stakeholder.location}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Quick Metrics */}
                          <div className="flex items-center gap-4">
                            <HealthIndicator health={stakeholder.relationshipHealth} showLabel={false} />
                            <HealthTrend stakeholder={stakeholder} />
                            <div className="text-right">
                              <div className="text-sm font-medium text-gray-900">
                                {stakeholderMeetings.length}
                              </div>
                              <div className="text-xs text-gray-500">meetings</div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-medium text-gray-900">
                                {upcomingMeetings.length}
                              </div>
                              <div className="text-xs text-gray-500">upcoming</div>
                            </div>
                          </div>

                          <ChevronDown 
                            size={20} 
                            className={`text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
                          />
                        </div>
                      </button>

                      {/* Expanded Content */}
                      {isExpanded && (
                        <div className="px-4 pb-4 border-t border-gray-100 bg-gray-50">
                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 py-4">
                            {/* Stakeholder Details */}
                            <div className="space-y-4">
                              <h5 className="font-medium text-gray-900">Contact Information</h5>
                              <div className="space-y-2">
                                {stakeholder.email && (
                                  <div className="flex items-center gap-2 text-sm">
                                    <Mail size={14} className="text-gray-400" />
                                    <a href={`mailto:${stakeholder.email}`} className="text-blue-600 hover:text-blue-800">
                                      {stakeholder.email}
                                    </a>
                                  </div>
                                )}
                                {stakeholder.phone && (
                                  <div className="flex items-center gap-2 text-sm">
                                    <Phone size={14} className="text-gray-400" />
                                    <a href={`tel:${stakeholder.phone}`} className="text-blue-600 hover:text-blue-800">
                                      {stakeholder.phone}
                                    </a>
                                  </div>
                                )}
                                {stakeholder.department && (
                                  <div className="flex items-center gap-2 text-sm">
                                    <Building size={14} className="text-gray-400" />
                                    <span className="text-gray-700">{stakeholder.department}</span>
                                  </div>
                                )}
                              </div>

                              <StakeholderMetrics stakeholder={stakeholder} compact={false} />
                            </div>

                            {/* Upcoming Meetings */}
                            <div className="space-y-4">
                              <h5 className="font-medium text-gray-900">Upcoming Meetings ({upcomingMeetings.length})</h5>
                              {upcomingMeetings.length > 0 ? (
                                <div className="space-y-2">
                                  {upcomingMeetings.slice(0, 3).map(meeting => (
                                    <div
                                      key={meeting.id}
                                      onClick={() => handleMeetingClick(meeting)}
                                      className="p-3 bg-white rounded-lg border border-gray-200 cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all"
                                    >
                                      <div className="flex items-center justify-between mb-2">
                                        <h6 className="font-medium text-sm text-gray-900 truncate">
                                          {meeting.title || 'Untitled Meeting'}
                                        </h6>
                                        <ExternalLink size={12} className="text-gray-400" />
                                      </div>
                                      <div className="flex items-center gap-2 text-xs text-gray-500">
                                        <Calendar size={10} />
                                        {meeting.scheduledAt ? format(new Date(meeting.scheduledAt), 'MMM d, h:mm a') : 'Not scheduled'}
                                      </div>
                                    </div>
                                  ))}
                                  {upcomingMeetings.length > 3 && (
                                    <p className="text-xs text-gray-500 text-center">
                                      +{upcomingMeetings.length - 3} more upcoming
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <div className="text-center py-4">
                                  <Calendar size={24} className="text-gray-300 mx-auto mb-2" />
                                  <p className="text-sm text-gray-500">No upcoming meetings</p>
                                </div>
                              )}
                            </div>

                            {/* Recent Meetings */}
                            <div className="space-y-4">
                              <h5 className="font-medium text-gray-900">Recent Meetings ({completedMeetings.length})</h5>
                              {completedMeetings.length > 0 ? (
                                <div className="space-y-2">
                                  {completedMeetings.slice(0, 3).map(meeting => (
                                    <div
                                      key={meeting.id}
                                      onClick={() => handleMeetingClick(meeting)}
                                      className="p-3 bg-white rounded-lg border border-gray-200 cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all"
                                    >
                                      <div className="flex items-center justify-between mb-2">
                                        <h6 className="font-medium text-sm text-gray-900 truncate">
                                          {meeting.title || 'Untitled Meeting'}
                                        </h6>
                                        <ExternalLink size={12} className="text-gray-400" />
                                      </div>
                                      <div className="flex items-center gap-2 text-xs text-gray-500">
                                        <Clock size={10} />
                                        {meeting.scheduledAt ? format(new Date(meeting.scheduledAt), 'MMM d') : 'Date unknown'}
                                      </div>
                                      {meeting.summary && (
                                        <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                                          {meeting.summary}
                                        </p>
                                      )}
                                    </div>
                                  ))}
                                  {completedMeetings.length > 3 && (
                                    <p className="text-xs text-gray-500 text-center">
                                      +{completedMeetings.length - 3} more meetings
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <div className="text-center py-4">
                                  <MessageCircle size={24} className="text-gray-300 mx-auto mb-2" />
                                  <p className="text-sm text-gray-500">No recent meetings</p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Empty State */}
      {Object.keys(groupedStakeholders).length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <div className="text-gray-400 text-6xl mb-4">👥</div>
          <h3 className="text-xl font-medium text-gray-900 mb-2">No stakeholders found</h3>
          <p className="text-gray-600">
            {searchTerm ? `No stakeholders match "${searchTerm}"` : 'Start adding stakeholders to track relationships'}
          </p>
        </div>
      )}
    </div>
  )
}