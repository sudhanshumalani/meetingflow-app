import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../contexts/AppContext'
import { 
  Search, 
  Plus,
  Settings, 
  Calendar, 
  Users, 
  Clock, 
  FileText, 
  Bell, 
  BellDot,
  Sparkles,
  AlertTriangle,
  Info,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Target,
  TrendingUp,
  Activity,
  Download,
  Filter,
  SortDesc,
  Heart,
  MessageCircle,
  Zap,
  FileDown,
  Menu,
  X,
  Send
} from 'lucide-react'
import { format, isToday, isThisWeek, startOfDay, endOfDay, differenceInDays } from 'date-fns'
import { 
  mockStakeholders, 
  mockMeetings,
  generateAIInsights,
  getCategoryDisplayName,
  getHealthColor,
  STAKEHOLDER_CATEGORIES
} from '../utils/mockData'
import GlobalSearch from '../components/GlobalSearch'
import NotificationCenter from '../components/NotificationCenter'
import StakeholderSections from '../components/StakeholderSections'
import { SentimentAnalyzer } from '../utils/sentimentAnalysis'
import { ExportManager } from '../utils/exportUtils'
import { 
  MobileHeader, 
  MobileNavDrawer, 
  TouchButton, 
  MobileTabs,
  PullToRefresh,
  ResponsiveGrid,
  MobileExpandableCard
} from '../components/MobileOptimized'
import { 
  NotionSyncStatus, 
  NotionStakeholderSync 
} from '../components/NotionIntegration'
import { BatchExportButton, ExportOptionsButton } from '../components/ExportOptions'

export default function Home() {
  const navigate = useNavigate()
  const { meetings, stakeholders, addMeeting, setCurrentMeeting } = useApp()
  const [searchTerm, setSearchTerm] = useState('')
  const [notifications, setNotifications] = useState([])
  const [activeTab, setActiveTab] = useState('all')
  const [collapsedGroups, setCollapsedGroups] = useState({})
  const [aiInsights, setAiInsights] = useState([])
  
  // Advanced feature states
  const [showGlobalSearch, setShowGlobalSearch] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false)
  const [isNotificationCenterOpen, setIsNotificationCenterOpen] = useState(false)
  const [meetingSentiments, setMeetingSentiments] = useState({})
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(null)
  const [sortBy, setSortBy] = useState('date') // 'date', 'priority', 'sentiment'
  const [filterPriority, setFilterPriority] = useState('all')
  const [stakeholderSortBy, setStakeholderSortBy] = useState('name') // 'name', 'priority', 'health', 'lastContact'
  
  // Mobile-specific states
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const [activeView, setActiveView] = useState('overview') // 'overview', 'stakeholders', 'meetings'

  // Initialize services
  const sentimentAnalyzer = new SentimentAnalyzer()
  const exportManager = new ExportManager()

  // Initialize with mock data if empty
  useEffect(() => {
    if (stakeholders.length === 0) {
      // In a real app, you'd initialize this through the context
      // For demo purposes, we'll use the mock data
    }
  }, [stakeholders])

  // Use mock data for demonstration
  const displayStakeholders = stakeholders.length > 0 ? stakeholders : mockStakeholders
  const displayMeetings = meetings.length > 0 ? meetings : mockMeetings

  useEffect(() => {
    const insights = generateAIInsights(displayMeetings, displayStakeholders)
    setAiInsights(insights)
    
    // Generate sentiment analysis for meetings
    const sentiments = {}
    displayMeetings.forEach(meeting => {
      sentiments[meeting.id] = sentimentAnalyzer.analyzeMeetingSentiment(meeting)
    })
    setMeetingSentiments(sentiments)
    
    // Generate mock notifications
    setNotifications([
      { id: 1, message: 'Meeting with Sarah Chen in 30 minutes', type: 'meeting', urgent: true },
      { id: 2, message: '3 action items due today', type: 'action', urgent: true },
      { id: 3, message: 'Weekly report ready for review', type: 'info', urgent: false }
    ])
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

  // Filter stakeholders by category
  const filteredStakeholders = activeTab === 'all' 
    ? displayStakeholders 
    : displayStakeholders.filter(stakeholder => stakeholder.category === activeTab)

  // Group stakeholders by category
  const stakeholderGroups = Object.values(STAKEHOLDER_CATEGORIES).reduce((groups, category) => {
    const categoryStakeholders = filteredStakeholders.filter(s => s.category === category)
    if (categoryStakeholders.length > 0) {
      groups[category] = categoryStakeholders
    }
    return groups
  }, {})

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
    const addedMeeting = meetings[0] // The newly added meeting will be first
    setCurrentMeeting(addedMeeting)
    navigate(`/meeting/${addedMeeting.id}`)
  }

  const toggleGroup = (category) => {
    setCollapsedGroups(prev => ({
      ...prev,
      [category]: !prev[category]
    }))
  }

  const getStakeholderMeetings = (stakeholderId) => {
    return displayMeetings.filter(meeting => 
      meeting.stakeholderIds?.includes(stakeholderId)
    )
  }

  // Advanced functionality
  const handleExportAllMeetings = async (format = 'xlsx') => {
    setIsExporting(true)
    setExportProgress({ status: 'processing', message: 'Preparing export...' })
    
    try {
      const result = await exportManager.exportMultipleMeetings(displayMeetings, format, {
        includeNotes: true,
        includeAISummary: true,
        includeActionItems: true
      })
      
      setExportProgress({ status: 'completed', message: 'Export ready for download!' })
      
      // Simulate download
      setTimeout(() => {
        exportManager.simulateDownload(result)
        setExportProgress(null)
        setIsExporting(false)
      }, 1000)
      
    } catch (error) {
      setExportProgress({ status: 'error', message: 'Export failed. Please try again.' })
      setTimeout(() => {
        setExportProgress(null)
        setIsExporting(false)
      }, 3000)
    }
  }

  const getStakeholderRelationshipStatus = (stakeholder) => {
    const lastContactDate = new Date(stakeholder.lastMeeting)
    const daysSinceContact = differenceInDays(new Date(), lastContactDate)
    
    if (daysSinceContact <= 7) return { status: 'recent', color: 'text-green-600', days: daysSinceContact }
    if (daysSinceContact <= 14) return { status: 'moderate', color: 'text-yellow-600', days: daysSinceContact }
    return { status: 'overdue', color: 'text-red-600', days: daysSinceContact }
  }

  // Sorting and filtering
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

  // Mobile-specific handlers
  const handleMobileRefresh = async () => {
    // Simulate refresh
    await new Promise(resolve => setTimeout(resolve, 1000))
    window.location.reload()
  }

  const mobileNavItems = [
    {
      label: 'Overview',
      icon: <Activity size={20} />,
      onClick: () => setActiveView('overview')
    },
    {
      label: 'Stakeholders',
      icon: <Users size={20} />,
      onClick: () => setActiveView('stakeholders')
    },
    {
      label: 'Meetings',
      icon: <Calendar size={20} />,
      onClick: () => setActiveView('meetings')
    },
    {
      label: 'Export Data',
      icon: <Download size={20} />,
      onClick: () => setShowExportMenu(true)
    },
    {
      label: 'Batch Export',
      icon: <Send size={20} />,
      onClick: () => {
        // This would open a mobile-friendly batch export dialog
        console.log('Batch export clicked')
      }
    },
    {
      label: 'Settings',
      icon: <Settings size={20} />,
      onClick: () => navigate('/settings')
    }
  ]

  const mobileTabs = [
    {
      id: 'overview',
      label: 'Overview',
      icon: <Activity size={16} />,
      badge: aiInsights.length
    },
    {
      id: 'stakeholders',
      label: 'Stakeholders',
      icon: <Users size={16} />,
      badge: displayStakeholders.length
    },
    {
      id: 'meetings',
      label: 'Meetings',
      icon: <Calendar size={16} />,
      badge: sortedMeetings.length
    }
  ]

  return (
    <div className="min-h-screen bg-gray-50 mobile-full-height">
      {/* Mobile Navigation Drawer */}
      <MobileNavDrawer
        isOpen={isMobileNavOpen}
        onClose={() => setIsMobileNavOpen(false)}
        navigation={mobileNavItems}
      />

      {/* Mobile-Optimized Header - Hidden on Desktop */}
      <div className="md:hidden">
        <MobileHeader
          title="MeetingFlow"
          subtitle="Your intelligent meeting companion"
          onMenuClick={() => setIsMobileNavOpen(true)}
          actions={
            <>
              {/* Search Button */}
              <button
                onClick={() => setIsGlobalSearchOpen(true)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors touch-target"
                title="Search (Ctrl+K)"
              >
                <Search size={20} />
              </button>

              {/* Notifications Button */}
              <button
                onClick={() => setIsNotificationCenterOpen(true)}
                className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors touch-target"
                title="Notifications (Ctrl+N)"
              >
                {notifications.some(n => n.priority === 'high' && !n.read) ? (
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
            </>
          }
        />
      </div>
      
      {/* Mobile Tabs */}
      <div className="bg-white border-b sticky top-16 z-20 md:hidden">
        <MobileTabs
          tabs={mobileTabs}
          activeTab={activeView}
          onTabChange={setActiveView}
        />
      </div>

      {/* Desktop Header - Hidden on Mobile */}
      <header className="bg-white shadow-sm border-b hidden md:block">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">MeetingFlow</h1>
              <p className="text-gray-600 mt-1">Your intelligent meeting management companion</p>
            </div>
            <div className="flex items-center gap-4">
              {/* Batch Export Button */}
              <BatchExportButton 
                meetings={displayMeetings}
                className="mr-3"
              />

              {/* Legacy Export Button */}
              <div className="relative">
                <button
                  onClick={() => setShowExportMenu(!showExportMenu)}
                  disabled={isExporting}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
                >
                  <FileDown size={18} />
                  Export (Legacy)
                </button>
                {showExportMenu && (
                  <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-lg shadow-lg border z-10">
                    <div className="p-2 space-y-1">
                      {exportManager.supportedFormats.map(format => (
                        <button
                          key={format}
                          onClick={() => handleExportAllMeetings(format)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded"
                        >
                          Export as {format.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Global Search Button */}
              <button
                onClick={() => setIsGlobalSearchOpen(true)}
                className="flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-sm sm:text-base"
                title="Search (Ctrl+K)"
              >
                <Search size={16} className="sm:w-[18px] sm:h-[18px]" />
                <span className="hidden lg:inline">Search</span>
              </button>

              {/* Settings Button */}
              <button
                onClick={() => navigate('/settings')}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                title="Settings"
              >
                <Settings size={18} />
                <span className="hidden lg:inline">Settings</span>
              </button>

              {/* Notion Sync Status */}
              <NotionSyncStatus className="hidden sm:flex" />

              {/* Notifications Button */}
              <button
                onClick={() => setIsNotificationCenterOpen(true)}
                className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="Notifications (Ctrl+N)"
              >
                {notifications.some(n => n.priority === 'high' && !n.read) ? (
                  <BellDot className="text-red-600 w-5 h-5 sm:w-6 sm:h-6" />
                ) : (
                  <Bell className="text-gray-600 w-5 h-5 sm:w-6 sm:h-6" />
                )}
                {notifications.filter(n => !n.read).length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center text-xs">
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
                className="w-full pl-10 pr-4 py-2 sm:py-3 text-sm sm:text-base border border-gray-300 rounded-lg focus:border-blue-500"
              />
            </div>
            <button
              onClick={handleNewMeeting}
              className="flex items-center justify-center gap-2 px-4 sm:px-6 py-2 sm:py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm sm:text-base whitespace-nowrap"
            >
              <Plus size={18} className="sm:w-5 sm:h-5" />
              New Meeting
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Content with Pull-to-Refresh */}
      <main className="max-w-7xl mx-auto">
        <PullToRefresh onRefresh={handleMobileRefresh}>
          <div className="px-4 py-4 md:py-8 space-y-6">
            {/* Mobile New Meeting Button */}
            <div className="md:hidden">
              <TouchButton
                onClick={handleNewMeeting}
                variant="primary"
                size="large"
                fullWidth
              >
                <Plus size={20} className="mr-2" />
                New Meeting
              </TouchButton>
            </div>

            {/* AI Insights Banner */}
            {aiInsights.length > 0 && (activeView === 'overview' || window.innerWidth >= 768) && (
              <div className="mb-6">
                <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-lg p-4 md:p-6 text-white">
                  <div className="flex items-start gap-3 md:gap-4">
                    <Sparkles size={20} className="md:w-6 md:h-6 flex-shrink-0 mt-1" />
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base md:text-lg font-semibold mb-2">AI Insights</h3>
                      <div className="space-y-2">
                        {aiInsights.slice(0, 2).map((insight, index) => (
                          <div key={index} className="flex items-start gap-2 md:gap-3 bg-white/10 rounded-lg p-2 md:p-3">
                            {insight.type === 'urgent' && <AlertTriangle size={14} className="md:w-4 md:h-4 mt-0.5 text-yellow-300" />}
                            {insight.type === 'warning' && <Info size={14} className="md:w-4 md:h-4 mt-0.5 text-blue-300" />}
                            {insight.type === 'info' && <CheckCircle size={14} className="md:w-4 md:h-4 mt-0.5 text-green-300" />}
                            <div className="min-w-0">
                              <p className="text-sm font-medium">{insight.title}</p>
                              <p className="text-xs md:text-sm opacity-90 line-clamp-2">{insight.message}</p>
                              <button className="text-xs underline mt-1 hover:no-underline touch-target">
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

            {/* Dashboard Cards - Overview Tab or Desktop */}
            {(activeView === 'overview' || window.innerWidth >= 768) && (
              <ResponsiveGrid minItemWidth="240px" className="mb-6">
                {[
                  {
                    title: "Today's Meetings",
                    value: todaysMeetings.length,
                    icon: <Calendar className="text-blue-600" size={24} />,
                    details: todaysMeetings.slice(0, 2).map(meeting => 
                      `${meeting.title || 'Untitled'} • ${format(new Date(meeting.scheduledAt), 'h:mm a')}`
                    ),
                    moreText: todaysMeetings.length > 2 ? `+${todaysMeetings.length - 2} more` : null
                  },
                  {
                    title: "Action Items",
                    value: pendingActionItems.length,
                    icon: <Target className="text-orange-600" size={24} />,
                    details: [
                      `Overdue: ${overdueActionItems.length}`,
                      `Due Soon: ${pendingActionItems.filter(item => {
                        const dueDate = new Date(item.dueDate)
                        const today = new Date()
                        const daysDiff = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24))
                        return daysDiff >= 0 && daysDiff <= 3
                      }).length}`
                    ]
                  },
                  {
                    title: "This Week",
                    value: weeklyMeetings.length,
                    icon: <TrendingUp className="text-green-600" size={24} />,
                    details: [
                      `Completed: ${weeklyMeetings.filter(m => m.status === 'completed').length}`,
                      `Upcoming: ${weeklyMeetings.filter(m => m.status === 'upcoming').length}`
                    ]
                  },
                  {
                    title: "Stakeholder Health",
                    value: displayStakeholders.length,
                    icon: <Activity className="text-purple-600" size={24} />,
                    details: [
                      `Excellent: ${stakeholderHealth.excellent}`,
                      `Good: ${stakeholderHealth.good}`,
                      `Needs Attention: ${stakeholderHealth.needsAttention}`
                    ]
                  }
                ].map((card, index) => (
                  <MobileExpandableCard
                    key={index}
                    title={card.title}
                    subtitle={
                      <div className="flex items-center gap-2 mt-2">
                        {card.icon}
                        <span className="text-2xl font-bold text-gray-900">{card.value}</span>
                      </div>
                    }
                    defaultExpanded={false}
                  >
                    <div className="pt-3 space-y-1">
                      {card.details.map((detail, i) => (
                        <div key={i} className="text-sm text-gray-600">
                          {detail}
                        </div>
                      ))}
                      {card.moreText && (
                        <p className="text-xs text-gray-500">{card.moreText}</p>
                      )}
                    </div>
                  </MobileExpandableCard>
                ))}
              </ResponsiveGrid>
            )}

            {/* Desktop Dashboard - Hidden on Mobile */}
            <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
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

        {/* Export Progress */}
        {exportProgress && (
          <div className="mb-6">
            <div className={`p-4 rounded-lg ${exportProgress.status === 'error' ? 'bg-red-50 text-red-800' : 'bg-blue-50 text-blue-800'}`}>
              <div className="flex items-center gap-3">
                {exportProgress.status === 'exporting' && (
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent"></div>
                )}
                <span className="font-medium">{exportProgress.message}</span>
              </div>
            </div>
          </div>
        )}

            {/* Sort and Filter Controls */}
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
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
              <div className="flex items-center gap-4">
                <label className="text-sm font-medium text-gray-700">Sort stakeholders by:</label>
                <select
                  value={stakeholderSortBy}
                  onChange={(e) => setStakeholderSortBy(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-blue-500"
                >
                  <option value="name">Name</option>
                  <option value="priority">Priority</option>
                  <option value="health">Relationship Health</option>
                  <option value="lastContact">Last Contact</option>
                </select>
              </div>
            </div>

            {/* Stakeholder Management - Conditional for Mobile */}
            {(activeView === 'stakeholders' || window.innerWidth >= 768) && (
              <div className="mb-6">
                {/* Mobile Sort Controls */}
                <div className="md:hidden mb-4">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-700">Sort:</label>
                    <select
                      value={stakeholderSortBy}
                      onChange={(e) => setStakeholderSortBy(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-blue-500 touch-target"
                    >
                      <option value="name">Name</option>
                      <option value="priority">Priority</option>
                      <option value="health">Relationship Health</option>
                      <option value="lastContact">Last Contact</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between mb-4 md:mb-6">
                  <h2 className="text-lg md:text-2xl font-semibold text-gray-900">Stakeholder Relationships</h2>
                  <div className="text-xs md:text-sm text-gray-500">
                    {displayStakeholders.length} stakeholder{displayStakeholders.length !== 1 ? 's' : ''} • 
                    {displayStakeholders.filter(s => s.relationshipHealth === 'at-risk' || s.relationshipHealth === 'critical').length} need attention
                  </div>
                </div>

                {/* Notion Stakeholder Sync Component */}
                <div className="mb-6">
                  <NotionStakeholderSync />
                </div>
                
                <StakeholderSections 
                  meetings={displayMeetings}
                  stakeholders={displayStakeholders}
                  searchTerm={searchTerm}
                  sortBy={stakeholderSortBy}
                />
              </div>
            )}

            {/* Desktop Sort Controls - Hidden on Mobile */}
            <div className="hidden md:flex md:flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
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
              <div className="flex items-center gap-4">
                <label className="text-sm font-medium text-gray-700">Sort stakeholders by:</label>
                <select
                  value={stakeholderSortBy}
                  onChange={(e) => setStakeholderSortBy(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-blue-500"
                >
                  <option value="name">Name</option>
                  <option value="priority">Priority</option>
                  <option value="health">Relationship Health</option>
                  <option value="lastContact">Last Contact</option>
                </select>
              </div>
            </div>

            {/* Recent Meetings Section - Conditional for Mobile */}
            {(activeView === 'meetings' || window.innerWidth >= 768) && sortedMeetings.length > 0 && (
              <div className="mb-6">
                {/* Mobile Sort Controls */}
                <div className="md:hidden mb-4">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-700">Sort:</label>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-blue-500 touch-target"
                    >
                      <option value="date">Date</option>
                      <option value="priority">Priority</option>
                      <option value="sentiment">Sentiment</option>
                    </select>
                  </div>
                </div>

                <h2 className="text-lg md:text-xl font-semibold text-gray-900 mb-4">Recent Meetings</h2>
                <ResponsiveGrid minItemWidth="280px">
                  {sortedMeetings.slice(0, window.innerWidth < 768 ? 4 : 6).map(meeting => {
                    const sentiment = meetingSentiments[meeting.id]
                    return (
                      <MobileExpandableCard
                        key={meeting.id}
                        title={meeting.title || 'Untitled Meeting'}
                        subtitle={
                          <div className="flex items-center justify-between mt-2">
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                              {meeting.scheduledAt && (
                                <>
                                  <Clock size={12} />
                                  {format(new Date(meeting.scheduledAt), 'MMM d, yyyy')}
                                </>
                              )}
                            </div>
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
                        }
                        actions={
                          <TouchButton
                            onClick={() => handleStartMeeting(meeting)}
                            variant="ghost"
                            size="small"
                          >
                            Open
                          </TouchButton>
                        }
                        defaultExpanded={false}
                      >
                        <div className="pt-3 space-y-3">
                          {meeting.description && (
                            <p className="text-sm text-gray-600 line-clamp-3">{meeting.description}</p>
                          )}
                          
                          {sentiment && sentiment.summary && (
                            <div className="p-3 bg-gray-50 rounded-lg">
                              <p className="text-xs text-gray-600 mb-1">AI Summary:</p>
                              <p className="text-sm text-gray-700 line-clamp-2">{sentiment.summary}</p>
                            </div>
                          )}
                          
                          <div className="flex items-center justify-between text-sm text-gray-500">
                            {meeting.attendees && meeting.attendees.length > 0 && (
                              <div className="flex items-center gap-1">
                                <Users size={12} />
                                <span>{meeting.attendees.length} attendees</span>
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              <ExportOptionsButton
                                meetingData={meeting}
                                onSuccess={(result) => {
                                  console.log('Meeting exported:', result)
                                }}
                                onError={(error) => {
                                  console.error('Export failed:', error)
                                }}
                                className="px-2 py-1 text-xs"
                              />
                              <TouchButton
                                onClick={() => handleStartMeeting(meeting)}
                                variant="primary"
                                size="small"
                              >
                                View Meeting
                              </TouchButton>
                            </div>
                          </div>
                        </div>
                      </MobileExpandableCard>
                    )
                  })}
                </ResponsiveGrid>
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
          </div>
        </PullToRefresh>
      </main>

      {/* Global Search Modal */}
      <GlobalSearch
        meetings={meetings}
        stakeholders={stakeholders}
        isOpen={isGlobalSearchOpen}
        onClose={() => setIsGlobalSearchOpen(false)}
      />

      {/* Notification Center Modal */}
      <NotificationCenter
        meetings={meetings}
        stakeholders={stakeholders}
        isOpen={isNotificationCenterOpen}
        onClose={() => setIsNotificationCenterOpen(false)}
        onNavigate={handleNavigate}
      />
    </div>
  )
}