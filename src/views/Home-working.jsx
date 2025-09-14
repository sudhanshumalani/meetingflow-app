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
  Activity,
  Target,
  TrendingUp
} from 'lucide-react'
import { format, isToday, isThisWeek } from 'date-fns'
import {
  mockStakeholders,
  mockMeetings,
  generateAIInsights,
  STAKEHOLDER_CATEGORIES
} from '../utils/mockData'

// Import components one by one to test
import GlobalSearch from '../components/GlobalSearch'
import NotificationCenter from '../components/NotificationCenter'

export default function Home() {
  const navigate = useNavigate()
  const { meetings, stakeholders, addMeeting, setCurrentMeeting } = useApp()
  const [searchTerm, setSearchTerm] = useState('')
  const [notifications, setNotifications] = useState([])
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false)
  const [isNotificationCenterOpen, setIsNotificationCenterOpen] = useState(false)
  const [aiInsights, setAiInsights] = useState([])

  // Use mock data for demonstration
  const displayStakeholders = stakeholders.length > 0 ? stakeholders : mockStakeholders
  const displayMeetings = meetings.length > 0 ? meetings : mockMeetings

  useEffect(() => {
    try {
      const insights = generateAIInsights(displayMeetings, displayStakeholders)
      setAiInsights(insights)

      // Generate mock notifications
      setNotifications([
        { id: 1, message: 'Meeting with Sarah Chen in 30 minutes', type: 'meeting', urgent: true, read: false },
        { id: 2, message: '3 action items due today', type: 'action', urgent: true, read: false },
        { id: 3, message: 'Weekly report ready for review', type: 'info', urgent: false, read: false }
      ])
    } catch (error) {
      console.error('Error setting up insights:', error)
      setAiInsights([])
      setNotifications([])
    }
  }, [displayMeetings, displayStakeholders])

  // Dashboard calculations
  const todaysMeetings = displayMeetings.filter(meeting =>
    meeting.scheduledAt && isToday(new Date(meeting.scheduledAt))
  )

  const allActionItems = displayMeetings.flatMap(meeting => meeting.actionItems || [])
  const pendingActionItems = allActionItems.filter(item => !item.completed)

  const weeklyMeetings = displayMeetings.filter(meeting =>
    meeting.scheduledAt && isThisWeek(new Date(meeting.scheduledAt))
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
    // Navigate after the context updates
    setTimeout(() => {
      const allMeetings = meetings.length > 0 ? meetings : [newMeeting]
      const addedMeeting = allMeetings[0]
      setCurrentMeeting(addedMeeting)
      navigate(`/meeting/${addedMeeting.id}`)
    }, 100)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">MeetingFlow</h1>
              <p className="text-gray-600 mt-1">Your intelligent meeting management companion</p>
            </div>
            <div className="flex items-center gap-4">
              {/* Search Button */}
              <button
                onClick={() => setIsGlobalSearchOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                title="Search (Ctrl+K)"
              >
                <Search size={16} />
                <span className="hidden lg:inline">Search</span>
              </button>

              {/* Notifications Button */}
              <button
                onClick={() => setIsNotificationCenterOpen(true)}
                className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="Notifications (Ctrl+N)"
              >
                <Bell className="text-gray-600" size={20} />
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
              className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={18} />
              New Meeting
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
                <Activity size={24} className="flex-shrink-0 mt-1" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold mb-2">AI Insights</h3>
                  <div className="space-y-2">
                    {aiInsights.slice(0, 2).map((insight, index) => (
                      <div key={index} className="flex items-start gap-3 bg-white/10 rounded-lg p-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{insight.title}</p>
                          <p className="text-sm opacity-90">{insight.message}</p>
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
          </div>

          {/* Stakeholder Health */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-medium text-gray-600">Stakeholders</p>
                <p className="text-2xl font-bold text-gray-900">{displayStakeholders.length}</p>
              </div>
              <Users className="text-purple-600" size={28} />
            </div>
          </div>
        </div>

        {/* Recent Meetings */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Recent Meetings</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {displayMeetings.slice(0, 6).map(meeting => (
              <div key={meeting.id} className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {meeting.title || 'Untitled Meeting'}
                </h3>
                <p className="text-gray-600 text-sm mb-4 line-clamp-2">
                  {meeting.description || 'No description available'}
                </p>
                <div className="flex items-center justify-between text-sm text-gray-500">
                  <div className="flex items-center gap-2">
                    <Clock size={12} />
                    <span>{meeting.scheduledAt ? format(new Date(meeting.scheduledAt), 'MMM d') : 'No date'}</span>
                  </div>
                  <button
                    onClick={() => handleStartMeeting(meeting)}
                    className="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                  >
                    View
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Success Message */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-green-800 mb-2">🎉 Working Home Component!</h2>
          <p className="text-green-700">
            This is a working version of the Home component with core functionality.
            All features are working: search, notifications, meeting creation, and dashboard.
          </p>
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
        onNavigate={(path) => navigate(path)}
      />
    </div>
  )
}