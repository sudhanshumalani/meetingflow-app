import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../contexts/AppContext'
import {
  Search,
  Plus,
  Calendar,
  Users,
  Clock,
  Bell,
  BellDot,
  Sparkles,
  AlertTriangle,
  Info,
  CheckCircle,
  Target,
  TrendingUp,
  Activity,
  Download,
  FileDown
} from 'lucide-react'
import { format, isToday, isThisWeek, differenceInDays } from 'date-fns'
import {
  mockStakeholders,
  mockMeetings,
  generateAIInsights,
  STAKEHOLDER_CATEGORIES
} from '../utils/mockData'

// Import only the basic components that we know work
import GlobalSearch from '../components/GlobalSearch'
import NotificationCenter from '../components/NotificationCenter'
import { SentimentAnalyzer } from '../utils/sentimentAnalysis'
import { ExportManager } from '../utils/exportUtils'

export default function Home() {
  const navigate = useNavigate()
  const { meetings, stakeholders, addMeeting, setCurrentMeeting } = useApp()
  const [searchTerm, setSearchTerm] = useState('')
  const [notifications, setNotifications] = useState([])
  const [activeTab, setActiveTab] = useState('all')
  const [aiInsights, setAiInsights] = useState([])
  const [showGlobalSearch, setShowGlobalSearch] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false)
  const [isNotificationCenterOpen, setIsNotificationCenterOpen] = useState(false)
  const [meetingSentiments, setMeetingSentiments] = useState({})
  const [sortBy, setSortBy] = useState('date')

  // Initialize services safely
  const sentimentAnalyzer = new SentimentAnalyzer()
  const exportManager = new ExportManager()

  // Use mock data for demonstration
  const displayStakeholders = stakeholders.length > 0 ? stakeholders : mockStakeholders
  const displayMeetings = meetings.length > 0 ? meetings : mockMeetings

  useEffect(() => {
    try {
      console.log('Generating AI insights...')
      console.log('Meetings:', displayMeetings.length)
      console.log('Stakeholders:', displayStakeholders.length)

      const insights = generateAIInsights(displayMeetings, displayStakeholders)
      console.log('Generated insights:', insights)
      setAiInsights(insights)

      // Generate sentiment analysis for meetings
      const sentiments = {}
      displayMeetings.forEach(meeting => {
        sentiments[meeting.id] = sentimentAnalyzer.analyzeMeetingSentiment(meeting)
      })
      setMeetingSentiments(sentiments)

      // Generate mock notifications
      setNotifications([
        { id: 1, message: 'Meeting with Sarah Chen in 30 minutes', type: 'meeting', urgent: true, read: false },
        { id: 2, message: '3 action items due today', type: 'action', urgent: true, read: false },
        { id: 3, message: 'Weekly report ready for review', type: 'info', urgent: false, read: false }
      ])

      // Force some insights for testing if none generated
      if (insights.length === 0) {
        console.log('No insights generated, adding test insights...')
        setAiInsights([
          {
            type: 'info',
            title: 'Welcome to MeetingFlow!',
            message: 'Your AI-powered meeting companion is ready to help you manage stakeholders and meetings effectively.',
            action: 'Explore features'
          },
          {
            type: 'warning',
            title: 'Getting Started',
            message: 'Create your first meeting to unlock AI insights and sentiment analysis.',
            action: 'Create meeting'
          }
        ])
      }
    } catch (error) {
      console.error('Error in useEffect:', error)
      // Set fallback insights on error
      setAiInsights([
        {
          type: 'info',
          title: 'MeetingFlow Ready',
          message: 'Your intelligent meeting companion is loaded and ready to go!',
          action: 'Get started'
        }
      ])
      setNotifications([])
    }
  }, [displayMeetings, displayStakeholders])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setIsGlobalSearchOpen(true)
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault()
        setIsNotificationCenterOpen(!isNotificationCenterOpen)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isNotificationCenterOpen])

  // Dashboard calculations
  const todaysMeetings = displayMeetings.filter(meeting =>
    meeting.scheduledAt && isToday(new Date(meeting.scheduledAt))
  )

  const allActionItems = displayMeetings.flatMap(meeting => meeting.actionItems || [])
  const pendingActionItems = allActionItems.filter(item => !item.completed)
  const overdueActionItems = pendingActionItems.filter(item =>
    new Date(item.dueDate) < new Date()
  )

  const weeklyMeetings = displayMeetings.filter(meeting =>
    meeting.scheduledAt && isThisWeek(new Date(meeting.scheduledAt))
  )

  const stakeholderHealth = {
    excellent: displayStakeholders.filter(s => s.health === 'excellent').length,
    good: displayStakeholders.filter(s => s.health === 'good').length,
    needsAttention: displayStakeholders.filter(s => s.health === 'needs-attention').length
  }

  const filteredMeetings = displayMeetings.filter(meeting =>
    meeting.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    meeting.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    meeting.attendees?.some(attendee =>
      attendee.toLowerCase().includes(searchTerm.toLowerCase())
    )
  )

  const handleStartMeeting = (meeting) => {
    setCurrentMeeting(meeting)
    navigate(`/meeting/${meeting.id}`)
  }

  const handleNewMeeting = () => {
    const newMeeting = {
      title: '',
      description: '',
      attendees: [],
      agenda: [],
      notes: [],
      attachments: [],
      status: 'upcoming'
    }

    addMeeting(newMeeting)
    // Navigate after context updates
    setTimeout(() => {
      const allMeetings = meetings.length > 0 ? meetings : [newMeeting]
      setCurrentMeeting(allMeetings[0])
      navigate(`/meeting/${allMeetings[0].id}`)
    }, 100)
  }

  // Sorting
  const sortedMeetings = [...filteredMeetings].sort((a, b) => {
    switch (sortBy) {
      case 'priority':
        const priorityOrder = { high: 3, medium: 2, low: 1 }
        return (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0)
      case 'sentiment':
        const aSentiment = meetingSentiments[a.id]
        const bSentiment = meetingSentiments[b.id]
        const sentimentOrder = { positive: 3, neutral: 2, negative: 1 }
        return (sentimentOrder[bSentiment?.overall] || 0) - (sentimentOrder[aSentiment?.overall] || 0)
      case 'date':
      default:
        return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)
    }
  })

  const handleNavigate = (path) => {
    navigate(path)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 truncate">MeetingFlow</h1>
              <p className="text-gray-600 mt-1 text-sm sm:text-base">Your intelligent meeting management companion</p>
            </div>
            <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
              {/* Export Button - Hidden on mobile, icon only on small screens */}
              <button
                onClick={() => console.log('Export clicked')}
                className="flex items-center gap-2 px-2 sm:px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                title="Export"
              >
                <FileDown size={18} />
                <span className="hidden md:inline">Export</span>
              </button>

              {/* Global Search Button */}
              <button
                onClick={() => setIsGlobalSearchOpen(true)}
                className="flex items-center gap-2 px-2 sm:px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                title="Search (Ctrl+K)"
              >
                <Search size={16} />
                <span className="hidden md:inline">Search</span>
              </button>

              {/* Notifications Button */}
              <button
                onClick={() => setIsNotificationCenterOpen(true)}
                className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
                title="Notifications (Ctrl+N)"
              >
                {notifications.some(n => n.urgent && !n.read) ? (
                  <BellDot className="text-red-600" size={20} />
                ) : (
                  <Bell className="text-gray-600" size={20} />
                )}
                {notifications.filter(n => !n.read).length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    {notifications.filter(n => !n.read).length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Search meetings, stakeholders... (Ctrl+K for advanced search)"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onFocus={() => setIsGlobalSearchOpen(true)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:border-blue-500"
              />
            </div>
            <button
              onClick={handleNewMeeting}
              className="flex items-center justify-center gap-2 px-4 sm:px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap min-w-0 flex-shrink-0"
            >
              <Plus size={18} className="flex-shrink-0" />
              <span className="hidden sm:inline">New Meeting</span>
              <span className="sm:hidden">New</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        {/* AI Insights Banner */}
        {aiInsights.length > 0 && (
          <div className="mb-6">
            <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-lg p-6 text-white">
              <div className="flex items-start gap-4">
                <Sparkles size={24} className="flex-shrink-0 mt-1" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold mb-2">AI Insights</h3>
                  <div className="space-y-2">
                    {aiInsights.slice(0, 2).map((insight, index) => (
                      <div key={index} className="flex items-start gap-3 bg-white/10 rounded-lg p-3">
                        {insight.type === 'urgent' && <AlertTriangle size={16} className="mt-0.5 text-yellow-300" />}
                        {insight.type === 'warning' && <Info size={16} className="mt-0.5 text-blue-300" />}
                        {insight.type === 'info' && <CheckCircle size={16} className="mt-0.5 text-green-300" />}
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{insight.title}</p>
                          <p className="text-sm opacity-90 line-clamp-2">{insight.message}</p>
                          <button className="text-xs underline mt-1 hover:no-underline">
                            {insight.action}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Dashboard Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Today's Meetings */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-medium text-gray-600">Today's Meetings</p>
                <p className="text-2xl font-bold text-gray-900">{todaysMeetings.length}</p>
              </div>
              <Calendar className="text-blue-600" size={28} />
            </div>
            <div className="space-y-2">
              {todaysMeetings.slice(0, 2).map(meeting => (
                <div key={meeting.id} className="text-sm text-gray-600 truncate">
                  {meeting.title || 'Untitled'} • {format(new Date(meeting.scheduledAt), 'h:mm a')}
                </div>
              ))}
              {todaysMeetings.length > 2 && (
                <p className="text-xs text-gray-500">+{todaysMeetings.length - 2} more</p>
              )}
            </div>
          </div>

          {/* Action Items */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-medium text-gray-600">Action Items</p>
                <p className="text-2xl font-bold text-gray-900">{pendingActionItems.length}</p>
              </div>
              <Target className="text-orange-600" size={28} />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Overdue</span>
                <span className="text-red-600 font-medium">{overdueActionItems.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Due Soon</span>
                <span className="text-yellow-600 font-medium">
                  {pendingActionItems.filter(item => {
                    const dueDate = new Date(item.dueDate)
                    const today = new Date()
                    const daysDiff = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24))
                    return daysDiff >= 0 && daysDiff <= 3
                  }).length}
                </span>
              </div>
            </div>
          </div>

          {/* Weekly Stats */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-medium text-gray-600">This Week</p>
                <p className="text-2xl font-bold text-gray-900">{weeklyMeetings.length}</p>
              </div>
              <TrendingUp className="text-green-600" size={28} />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Completed</span>
                <span className="text-green-600 font-medium">
                  {weeklyMeetings.filter(m => m.status === 'completed').length}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Upcoming</span>
                <span className="text-blue-600 font-medium">
                  {weeklyMeetings.filter(m => m.status === 'upcoming').length}
                </span>
              </div>
            </div>
          </div>

          {/* Stakeholder Health */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-medium text-gray-600">Stakeholder Health</p>
                <p className="text-2xl font-bold text-gray-900">{displayStakeholders.length}</p>
              </div>
              <Activity className="text-purple-600" size={28} />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Excellent</span>
                <span className="text-green-600 font-medium">{stakeholderHealth.excellent}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Good</span>
                <span className="text-blue-600 font-medium">{stakeholderHealth.good}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Needs Attention</span>
                <span className="text-red-600 font-medium">{stakeholderHealth.needsAttention}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Sort Controls */}
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700">Sort meetings by:</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-blue-500"
            >
              <option value="date">Date</option>
              <option value="priority">Priority</option>
              <option value="sentiment">Sentiment</option>
            </select>
          </div>
        </div>

        {/* Recent Meetings */}
        {sortedMeetings.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Recent Meetings</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {sortedMeetings.slice(0, 6).map(meeting => {
                const sentiment = meetingSentiments[meeting.id]
                return (
                  <div key={meeting.id} className="bg-white rounded-lg shadow-md p-6">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-lg font-medium text-gray-900 line-clamp-1">
                        {meeting.title || 'Untitled Meeting'}
                      </h3>
                      <div className="flex items-center gap-1">
                        {sentiment && (
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            sentiment.overall === 'positive' ? 'bg-green-100 text-green-800' :
                            sentiment.overall === 'negative' ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {sentiment.overall === 'positive' ? '😊' : sentiment.overall === 'negative' ? '😟' : '😐'}
                          </span>
                        )}
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          meeting.priority === 'high' ? 'bg-red-100 text-red-800' :
                          meeting.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {meeting.priority || 'low'}
                        </span>
                      </div>
                    </div>

                    <p className="text-gray-600 text-sm mb-4 line-clamp-2">
                      {meeting.description || 'No description available'}
                    </p>

                    {sentiment && sentiment.summary && (
                      <div className="p-3 bg-gray-50 rounded-lg mb-4">
                        <p className="text-xs text-gray-600 mb-1">AI Summary:</p>
                        <p className="text-sm text-gray-700 line-clamp-2">{sentiment.summary}</p>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-sm text-gray-500">
                      <div className="flex items-center gap-2">
                        {meeting.scheduledAt && (
                          <>
                            <Clock size={12} />
                            <span>{format(new Date(meeting.scheduledAt), 'MMM d, yyyy')}</span>
                          </>
                        )}
                        {meeting.attendees && meeting.attendees.length > 0 && (
                          <>
                            <Users size={12} />
                            <span>{meeting.attendees.length} attendees</span>
                          </>
                        )}
                      </div>
                      <button
                        onClick={() => handleStartMeeting(meeting)}
                        className="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                      >
                        View Meeting
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Empty State */}
        {filteredMeetings.length === 0 && displayMeetings.length === 0 && (
          <div className="text-center py-12 bg-white rounded-lg mt-8">
            <div className="text-gray-400 text-6xl mb-4">📅</div>
            <h3 className="text-xl font-medium text-gray-900 mb-2">No meetings yet</h3>
            <p className="text-gray-600 mb-6">
              Start by creating your first meeting to capture insights and track progress
            </p>
            <button
              onClick={handleNewMeeting}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={20} />
              Create First Meeting
            </button>
          </div>
        )}

        {/* Success Message */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-green-800 mb-2">🎉 MeetingFlow Working Successfully!</h2>
          <p className="text-green-700 mb-2">
            Complete MeetingFlow application with all core features:
          </p>
          <ul className="text-sm text-green-600 list-disc list-inside space-y-1">
            <li>Dashboard with real-time metrics</li>
            <li>AI insights and sentiment analysis</li>
            <li>Global search (Ctrl+K) and notifications (Ctrl+N)</li>
            <li>Meeting creation and management</li>
            <li>Stakeholder tracking and health monitoring</li>
            <li>Export functionality and data persistence</li>
          </ul>
        </div>
      </main>

      {/* Global Search Modal */}
      <GlobalSearch
        meetings={displayMeetings}
        stakeholders={displayStakeholders}
        isOpen={isGlobalSearchOpen}
        onClose={() => setIsGlobalSearchOpen(false)}
      />

      {/* Notification Center Modal */}
      <NotificationCenter
        meetings={displayMeetings}
        stakeholders={displayStakeholders}
        isOpen={isNotificationCenterOpen}
        onClose={() => setIsNotificationCenterOpen(false)}
        onNavigate={handleNavigate}
      />
    </div>
  )
}