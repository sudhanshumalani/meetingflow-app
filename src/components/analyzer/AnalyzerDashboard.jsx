/**
 * Analyzer Dashboard
 *
 * Meeting intelligence dashboard powered by Dexie reactive queries.
 * Provides Granola-style insights across all meetings.
 *
 * ROLLBACK: git checkout v1.0.37-pre-dexie
 */

import React, { useState } from 'react'
import {
  useActionItemDashboard,
  useAllStakeholderEngagement,
  useStalledProjects,
  useMeetingStats,
  useMeetingSearch,
  useDatabaseStats,
  useStakeholders
} from '../../db'
import {
  CheckCircle,
  Circle,
  AlertTriangle,
  Clock,
  Users,
  Calendar,
  TrendingUp,
  Search,
  Database,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  BarChart3,
  Target,
  UserCheck,
  AlertCircle,
  Brain,
  MessageSquare,
  Send,
  Sparkles,
  FileText
} from 'lucide-react'
import analyzerService from '../../services/meetingAnalyzerService'

// ============================================
// SUB-COMPONENTS
// ============================================

function StatCard({ icon: Icon, label, value, subValue, color = 'blue', onClick }) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600 border-blue-200',
    green: 'bg-green-50 text-green-600 border-green-200',
    yellow: 'bg-yellow-50 text-yellow-600 border-yellow-200',
    red: 'bg-red-50 text-red-600 border-red-200',
    purple: 'bg-purple-50 text-purple-600 border-purple-200',
    gray: 'bg-gray-50 text-gray-600 border-gray-200'
  }

  return (
    <div
      className={`p-2 sm:p-4 rounded-lg border ${colorClasses[color]} ${onClick ? 'cursor-pointer hover:opacity-80' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-2 sm:gap-3">
        <Icon className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
        <div className="min-w-0">
          <div className="text-lg sm:text-2xl font-bold truncate">{value}</div>
          <div className="text-xs sm:text-sm opacity-80 truncate">{label}</div>
          {subValue && <div className="text-xs opacity-60 truncate">{subValue}</div>}
        </div>
      </div>
    </div>
  )
}

function ActionItemCard({ item }) {
  const priorityColors = {
    high: 'border-l-red-500 bg-red-50',
    medium: 'border-l-yellow-500 bg-yellow-50',
    low: 'border-l-green-500 bg-green-50'
  }

  const priority = item.priority || 'medium'
  const isOverdue = item.dueDate && new Date(item.dueDate) < new Date()

  return (
    <div className={`p-2 sm:p-3 border-l-4 rounded-r-lg ${priorityColors[priority]} mb-2`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm sm:text-base font-medium text-gray-900 break-words">{item.text || item.task || item.description}</div>
          <div className="text-xs sm:text-sm text-gray-600 mt-1 truncate">
            {item.meetingTitle}
          </div>
          <div className="flex items-center flex-wrap gap-2 sm:gap-3 mt-1 sm:mt-2 text-xs text-gray-500">
            {item.assignee && (
              <span className="flex items-center gap-1">
                <UserCheck className="w-3 h-3" />
                {item.assignee}
              </span>
            )}
            {item.dueDate && (
              <span className={`flex items-center gap-1 ${isOverdue ? 'text-red-600 font-medium' : ''}`}>
                <Clock className="w-3 h-3" />
                {new Date(item.dueDate).toLocaleDateString()}
                {isOverdue && ' !'}
              </span>
            )}
          </div>
        </div>
        {item.status === 'completed' ? (
          <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-600 flex-shrink-0" />
        ) : (
          <Circle className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 flex-shrink-0" />
        )}
      </div>
    </div>
  )
}

function StakeholderEngagementCard({ engagement }) {
  const statusColors = {
    active: 'text-green-600 bg-green-50',
    recent: 'text-yellow-600 bg-yellow-50',
    inactive: 'text-red-600 bg-red-50'
  }

  return (
    <div className="p-2 sm:p-3 bg-white rounded-lg border border-gray-200 mb-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm sm:text-base font-medium text-gray-900 truncate">
            {engagement.stakeholder.name || engagement.stakeholder.company}
          </div>
          {engagement.stakeholder.company && engagement.stakeholder.name && (
            <div className="text-xs sm:text-sm text-gray-600 truncate">{engagement.stakeholder.company}</div>
          )}
        </div>
        <span className={`text-xs px-2 py-0.5 sm:py-1 rounded-full flex-shrink-0 ${statusColors[engagement.status]}`}>
          {engagement.status}
        </span>
      </div>
      <div className="flex items-center flex-wrap gap-2 sm:gap-4 mt-1 sm:mt-2 text-xs sm:text-sm text-gray-500">
        <span>{engagement.meetingCount} mtgs</span>
        {engagement.daysSinceContact !== null && (
          <span>{engagement.daysSinceContact}d ago</span>
        )}
      </div>
    </div>
  )
}

function StalledProjectCard({ project }) {
  return (
    <div className="p-2 sm:p-3 bg-yellow-50 rounded-lg border border-yellow-200 mb-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm sm:text-base font-medium text-gray-900 truncate">{project.projectId}</div>
          <div className="text-xs sm:text-sm text-gray-600 mt-1 truncate">
            {project.lastMeetingTitle}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {project.daysSinceActivity}d inactive
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-xs sm:text-sm font-medium text-yellow-700">
            {project.openActionItems} open
          </div>
          <div className="text-xs text-gray-500">
            {project.totalMeetings} mtgs
          </div>
        </div>
      </div>
    </div>
  )
}

function SearchResults({ query }) {
  const results = useMeetingSearch(query)

  if (!query || query.length < 2) {
    return (
      <div className="text-gray-500 text-center py-6 sm:py-8 text-sm sm:text-base">
        Enter at least 2 characters to search
      </div>
    )
  }

  if (!results) {
    return (
      <div className="flex items-center justify-center py-6 sm:py-8">
        <RefreshCw className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    )
  }

  if (results.length === 0) {
    return (
      <div className="text-gray-500 text-center py-6 sm:py-8 text-sm sm:text-base">
        No meetings found for "{query}"
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {results.map(meeting => (
        <div key={meeting.id} className="p-2 sm:p-3 bg-white rounded-lg border border-gray-200">
          <div className="text-sm sm:text-base font-medium text-gray-900">{meeting.title}</div>
          <div className="text-xs sm:text-sm text-gray-600">{meeting.date}</div>
          {meeting.summaryPreview && (
            <div className="text-xs sm:text-sm text-gray-500 mt-1 line-clamp-2">
              {meeting.summaryPreview}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function AnalyzerDashboard() {
  const [activeTab, setActiveTab] = useState('overview')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedSection, setExpandedSection] = useState(null)

  // AI state
  const [aiQuestion, setAiQuestion] = useState('')
  const [aiResponse, setAiResponse] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState(null)
  const [selectedAnalysis, setSelectedAnalysis] = useState(null)
  const [selectedStakeholderForBrief, setSelectedStakeholderForBrief] = useState('')

  // Reactive queries - auto-update when data changes
  const actionItems = useActionItemDashboard()
  const stakeholderEngagement = useAllStakeholderEngagement()
  const stalledProjects = useStalledProjects()
  const meetingStats = useMeetingStats()
  const dbStats = useDatabaseStats()
  const stakeholders = useStakeholders()

  // AI Analysis handlers
  const runAIAnalysis = async (analysisType, params = {}) => {
    setAiLoading(true)
    setAiError(null)
    setAiResponse(null)
    setSelectedAnalysis(analysisType)

    try {
      let result
      switch (analysisType) {
        case 'patterns':
          result = await analyzerService.analyzeMeetingPatterns()
          break
        case 'followups':
          result = await analyzerService.findFollowUpOpportunities()
          break
        case 'stakeholderGaps':
          result = await analyzerService.identifyStakeholderGaps()
          break
        case 'weekSummary':
          result = await analyzerService.generatePeriodSummary('week')
          break
        case 'monthSummary':
          result = await analyzerService.generatePeriodSummary('month')
          break
        case 'meetingBrief':
          if (!params.stakeholderId) throw new Error('Select a stakeholder')
          result = await analyzerService.prepareMeetingBrief(params.stakeholderId)
          break
        case 'question':
          if (!params.question) throw new Error('Enter a question')
          result = await analyzerService.askMeetingQuestion(params.question)
          break
        default:
          throw new Error('Unknown analysis type')
      }
      setAiResponse(result)
    } catch (error) {
      setAiError(error.message)
    } finally {
      setAiLoading(false)
    }
  }

  const isLoading = !actionItems || !stakeholderEngagement || !stalledProjects || !meetingStats

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <div className="text-gray-600">Loading analyzer data...</div>
        </div>
      </div>
    )
  }

  const tabs = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'actions', label: 'Action Items', icon: Target },
    { id: 'stakeholders', label: 'Stakeholders', icon: Users },
    { id: 'ai', label: 'AI Insights', icon: Brain },
    { id: 'search', label: 'Search', icon: Search }
  ]

  return (
    <div className="max-w-6xl mx-auto px-3 py-4 sm:p-4">
      {/* Header */}
      <div className="mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
          <BarChart3 className="w-6 h-6 sm:w-7 sm:h-7 text-blue-600" />
          Meeting Analyzer
        </h1>
        <p className="text-sm sm:text-base text-gray-600 mt-1">
          Intelligence across {meetingStats.total} meetings
        </p>
      </div>

      {/* Tabs - Mobile: scrollable pills, Desktop: tabs */}
      <div className="flex gap-1 sm:gap-2 mb-4 sm:mb-6 border-b border-gray-200 pb-2 overflow-x-auto scrollbar-hide -mx-3 px-3 sm:mx-0 sm:px-0">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-t-lg text-sm sm:text-base transition-colors whitespace-nowrap flex-shrink-0 ${
              activeTab === tab.id
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 sm:bg-transparent text-gray-600 hover:bg-gray-200 sm:hover:bg-gray-100'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            <span className="hidden xs:inline sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-4 sm:space-y-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-2 sm:gap-4 md:grid-cols-4">
            <StatCard
              icon={Calendar}
              label="Total Meetings"
              value={meetingStats.total}
              subValue={`${meetingStats.thisWeek} this week`}
              color="blue"
            />
            <StatCard
              icon={Target}
              label="Open Action Items"
              value={actionItems.open}
              subValue={`${actionItems.overdue} overdue`}
              color={actionItems.overdue > 0 ? 'red' : 'green'}
            />
            <StatCard
              icon={Users}
              label="Active Stakeholders"
              value={stakeholderEngagement.active}
              subValue={`${stakeholderEngagement.inactive} need attention`}
              color={stakeholderEngagement.inactive > 5 ? 'yellow' : 'green'}
            />
            <StatCard
              icon={TrendingUp}
              label="Completion Rate"
              value={`${actionItems.total > 0 ? Math.round((actionItems.completed / actionItems.total) * 100) : 0}%`}
              subValue={`${actionItems.completed}/${actionItems.total} completed`}
              color="purple"
            />
          </div>

          {/* Alerts Section */}
          {(actionItems.overdue > 0 || stalledProjects.length > 0 || stakeholderEngagement.inactive > 3) && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 sm:p-4">
              <h3 className="text-sm sm:text-base font-medium text-yellow-800 flex items-center gap-2 mb-2 sm:mb-3">
                <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5" />
                Needs Attention
              </h3>
              <div className="space-y-1 sm:space-y-2 text-xs sm:text-sm">
                {actionItems.overdue > 0 && (
                  <div className="flex items-center gap-2 text-yellow-800">
                    <AlertCircle className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                    {actionItems.overdue} overdue items
                  </div>
                )}
                {stalledProjects.length > 0 && (
                  <div className="flex items-center gap-2 text-yellow-800">
                    <Clock className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                    {stalledProjects.length} stalled projects
                  </div>
                )}
                {stakeholderEngagement.inactive > 3 && (
                  <div className="flex items-center gap-2 text-yellow-800">
                    <Users className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                    {stakeholderEngagement.inactive} inactive stakeholders
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Overdue Action Items */}
          {actionItems.overdueItems.length > 0 && (
            <div>
              <h3 className="text-sm sm:text-base font-medium text-gray-900 mb-2 sm:mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-red-600" />
                Overdue Items
              </h3>
              <div className="space-y-2">
                {actionItems.overdueItems.slice(0, 5).map((item, idx) => (
                  <ActionItemCard key={idx} item={item} />
                ))}
                {actionItems.overdueItems.length > 5 && (
                  <button
                    onClick={() => setActiveTab('actions')}
                    className="text-blue-600 text-xs sm:text-sm hover:underline"
                  >
                    View all {actionItems.overdueItems.length} overdue items
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Stakeholders Needing Attention */}
          {stakeholderEngagement.needsAttention.length > 0 && (
            <div>
              <h3 className="text-sm sm:text-base font-medium text-gray-900 mb-2 sm:mb-3 flex items-center gap-2">
                <Users className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-600" />
                Follow-up Needed
              </h3>
              <div className="space-y-2">
                {stakeholderEngagement.needsAttention.slice(0, 5).map((engagement, idx) => (
                  <StakeholderEngagementCard key={idx} engagement={engagement} />
                ))}
                {stakeholderEngagement.needsAttention.length > 5 && (
                  <button
                    onClick={() => setActiveTab('stakeholders')}
                    className="text-blue-600 text-xs sm:text-sm hover:underline"
                  >
                    View all {stakeholderEngagement.needsAttention.length} stakeholders
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Storage Info */}
          {dbStats && (
            <div className="bg-gray-50 rounded-lg p-3 sm:p-4 border border-gray-200">
              <h3 className="text-sm sm:text-base font-medium text-gray-900 flex items-center gap-2 mb-2 sm:mb-3">
                <Database className="w-4 h-4 sm:w-5 sm:h-5" />
                Storage Status
              </h3>
              <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4 text-xs sm:text-sm">
                <div>
                  <div className="text-gray-500">Hot</div>
                  <div className="font-medium">{dbStats.meetings.hot}</div>
                </div>
                <div>
                  <div className="text-gray-500">Warm</div>
                  <div className="font-medium">{dbStats.meetings.warm}</div>
                </div>
                <div>
                  <div className="text-gray-500">Cold</div>
                  <div className="font-medium">{dbStats.meetings.cold}</div>
                </div>
                {dbStats.storage && (
                  <div>
                    <div className="text-gray-500">Used</div>
                    <div className="font-medium">{dbStats.storage.usageMB} MB</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Action Items Tab */}
      {activeTab === 'actions' && (
        <div className="space-y-4 sm:space-y-6">
          <div className="grid grid-cols-2 gap-2 sm:gap-4 md:grid-cols-4">
            <StatCard icon={Target} label="Open" value={actionItems.open} color="blue" />
            <StatCard icon={AlertTriangle} label="Overdue" value={actionItems.overdue} color="red" />
            <StatCard icon={CheckCircle} label="Completed" value={actionItems.completed} color="green" />
            <StatCard icon={Calendar} label="Total" value={actionItems.total} color="gray" />
          </div>

          {/* By Assignee */}
          <div>
            <h3 className="font-medium text-gray-900 mb-3">By Assignee</h3>
            <div className="space-y-2">
              {Object.entries(actionItems.byAssignee).map(([assignee, data]) => (
                <div
                  key={assignee}
                  className="p-3 bg-white rounded-lg border border-gray-200"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium text-gray-900">{assignee}</div>
                    <div className="text-sm text-gray-500">
                      {data.open} open, {data.completed} completed
                    </div>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-green-600 h-2 rounded-full"
                      style={{
                        width: `${(data.completed / (data.open + data.completed)) * 100}%`
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Open Items List */}
          <div>
            <h3 className="font-medium text-gray-900 mb-3">Open Action Items</h3>
            <div className="space-y-2">
              {actionItems.openItems.map((item, idx) => (
                <ActionItemCard key={idx} item={item} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Stakeholders Tab */}
      {activeTab === 'stakeholders' && (
        <div className="space-y-4 sm:space-y-6">
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            <StatCard icon={UserCheck} label="Active" value={stakeholderEngagement.active} color="green" />
            <StatCard icon={Clock} label="Recent" value={stakeholderEngagement.recent} color="yellow" />
            <StatCard icon={AlertCircle} label="Inactive" value={stakeholderEngagement.inactive} color="red" />
          </div>

          <div>
            <h3 className="font-medium text-gray-900 mb-3">All Stakeholders</h3>
            <div className="space-y-2">
              {stakeholderEngagement.stakeholders.map((engagement, idx) => (
                <StakeholderEngagementCard key={idx} engagement={engagement} />
              ))}
            </div>
          </div>

          {stalledProjects.length > 0 && (
            <div>
              <h3 className="font-medium text-gray-900 mb-3">Stalled Projects</h3>
              <div className="space-y-2">
                {stalledProjects.map((project, idx) => (
                  <StalledProjectCard key={idx} project={project} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* AI Insights Tab */}
      {activeTab === 'ai' && (
        <div className="space-y-4 sm:space-y-6">
          {/* Quick Analysis Buttons */}
          <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3">
            <button
              onClick={() => runAIAnalysis('patterns')}
              disabled={aiLoading}
              className="p-3 sm:p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-left"
            >
              <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 mb-1 sm:mb-2" />
              <div className="text-sm sm:text-base font-medium text-gray-900">Patterns</div>
              <div className="text-xs sm:text-sm text-gray-500 hidden sm:block">Analyze your meeting habits</div>
            </button>

            <button
              onClick={() => runAIAnalysis('followups')}
              disabled={aiLoading}
              className="p-3 sm:p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-left"
            >
              <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-600 mb-1 sm:mb-2" />
              <div className="text-sm sm:text-base font-medium text-gray-900">Follow-ups</div>
              <div className="text-xs sm:text-sm text-gray-500 hidden sm:block">Meetings needing follow-up</div>
            </button>

            <button
              onClick={() => runAIAnalysis('stakeholderGaps')}
              disabled={aiLoading}
              className="p-3 sm:p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-left"
            >
              <Users className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600 mb-1 sm:mb-2" />
              <div className="text-sm sm:text-base font-medium text-gray-900">Gaps</div>
              <div className="text-xs sm:text-sm text-gray-500 hidden sm:block">Stakeholders needing attention</div>
            </button>

            <button
              onClick={() => runAIAnalysis('weekSummary')}
              disabled={aiLoading}
              className="p-3 sm:p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-left"
            >
              <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-green-600 mb-1 sm:mb-2" />
              <div className="text-sm sm:text-base font-medium text-gray-900">Weekly</div>
              <div className="text-xs sm:text-sm text-gray-500 hidden sm:block">This week's highlights</div>
            </button>

            <button
              onClick={() => runAIAnalysis('monthSummary')}
              disabled={aiLoading}
              className="p-3 sm:p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-left"
            >
              <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600 mb-1 sm:mb-2" />
              <div className="text-sm sm:text-base font-medium text-gray-900">Monthly</div>
              <div className="text-xs sm:text-sm text-gray-500 hidden sm:block">This month's overview</div>
            </button>
          </div>

          {/* Meeting Brief */}
          <div className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4">
            <h3 className="text-sm sm:text-base font-medium text-gray-900 mb-2 sm:mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-500" />
              Meeting Brief
            </h3>
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={selectedStakeholderForBrief}
                onChange={(e) => setSelectedStakeholderForBrief(e.target.value)}
                className="flex-1 px-3 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select stakeholder...</option>
                {stakeholders?.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name || s.company}
                  </option>
                ))}
              </select>
              <button
                onClick={() => runAIAnalysis('meetingBrief', { stakeholderId: selectedStakeholderForBrief })}
                disabled={aiLoading || !selectedStakeholderForBrief}
                className="px-4 py-2 text-sm sm:text-base bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Generate
              </button>
            </div>
          </div>

          {/* Ask a Question */}
          <div className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4">
            <h3 className="text-sm sm:text-base font-medium text-gray-900 mb-2 sm:mb-3 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500" />
              Ask About Meetings
            </h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={aiQuestion}
                onChange={(e) => setAiQuestion(e.target.value)}
                placeholder="e.g., Which meetings discussed budget?"
                className="flex-1 px-3 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                onKeyDown={(e) => e.key === 'Enter' && aiQuestion && runAIAnalysis('question', { question: aiQuestion })}
              />
              <button
                onClick={() => runAIAnalysis('question', { question: aiQuestion })}
                disabled={aiLoading || !aiQuestion}
                className="px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* AI Response */}
          {aiLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <RefreshCw className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
                <div className="text-gray-600">Analyzing with Claude AI...</div>
              </div>
            </div>
          )}

          {aiError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-red-800">
                <AlertCircle className="w-5 h-5" />
                <span className="font-medium">Error</span>
              </div>
              <p className="text-red-700 mt-1">{aiError}</p>
              {aiError.includes('API key') && (
                <p className="text-sm text-red-600 mt-2">
                  Add your Claude API key in Settings to enable AI features.
                </p>
              )}
            </div>
          )}

          {aiResponse && !aiLoading && (
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-3 sm:p-4">
              <h3 className="text-sm sm:text-base font-medium text-gray-900 mb-2 sm:mb-3 flex items-center gap-2 flex-wrap">
                <Brain className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" />
                AI Results
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                  {selectedAnalysis}
                </span>
              </h3>
              <div className="bg-white rounded-lg p-2 sm:p-4 max-h-[300px] sm:max-h-[400px] overflow-y-auto">
                <pre className="text-xs sm:text-sm text-gray-700 whitespace-pre-wrap font-sans break-words">
                  {JSON.stringify(aiResponse, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {/* No API Key Notice */}
          {!localStorage.getItem('claude_api_key') && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 sm:p-4">
              <div className="flex items-center gap-2 text-yellow-800 mb-1 sm:mb-2">
                <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                <span className="text-sm sm:text-base font-medium">API Key Required</span>
              </div>
              <p className="text-yellow-700 text-xs sm:text-sm">
                Add your Claude API key in Settings.
                <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="underline ml-1">Get a key</a>
              </p>
            </div>
          )}
        </div>
      )}

      {/* Search Tab */}
      {activeTab === 'search' && (
        <div className="space-y-3 sm:space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 sm:w-5 sm:h-5" />
            <input
              type="text"
              placeholder="Search meetings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 sm:pl-10 pr-4 py-2 sm:py-3 text-sm sm:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <SearchResults query={searchQuery} />
        </div>
      )}
    </div>
  )
}
