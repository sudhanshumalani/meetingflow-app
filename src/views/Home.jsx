import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../contexts/AppContext'
import { useSyncContext } from '../contexts/SyncProvider'
import {
  Search,
  Plus,
  Settings,
  Calendar,
  Users,
  Clock,
  FileText,
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
  Send,
  Edit2,
  Trash2,
  MoreVertical,
  Save,
  XCircle,
  Eye,
  Brain,
  Gauge,
  BarChart3,
  Users2,
  Lightbulb,
  RefreshCw,
  AlertCircle,
  HardDrive
} from 'lucide-react'
import { format, isToday, isThisWeek, startOfDay, endOfDay, differenceInDays } from 'date-fns'
import {
  generateAIInsights,
  getCategoryDisplayName,
  getHealthColor,
  STAKEHOLDER_CATEGORIES
} from '../utils/mockData'
import GlobalSearch from '../components/GlobalSearch'
import SyncStatusIndicator from '../components/sync/SyncStatusIndicator'
import NotificationCenter from '../components/NotificationCenter'
// Stakeholder management simplified - complex relationships removed
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
import performanceMonitor, { usePerformanceMonitor } from '../utils/performanceMonitor'
import hapticFeedback from '../utils/hapticFeedback'
import { BatchExportButton, ExportOptionsButton } from '../components/ExportOptions'
import { processWithClaude } from '../utils/ocrServiceNew'
import { findOrphanedSessions, recoverOrphanedSession, deleteOrphanedSession } from '../utils/transcriptRecovery'
import StreamingAudioBuffer from '../utils/StreamingAudioBuffer'
import StreamingTranscriptBuffer from '../utils/StreamingTranscriptBuffer'

// Helper to parse meeting dates correctly (handles both UTC 'Z' format and local format)
// This ensures dates display correctly regardless of how they were stored
const parseMeetingDate = (dateString) => {
  if (!dateString) return null

  // If it ends with 'Z', it's UTC - we need to extract the DATE portion and treat as local
  // This fixes the timezone shift issue where "2026-01-22T00:00:00.000Z" (midnight UTC)
  // was showing as Jan 21 in Mountain Time because JS interprets Z as UTC
  if (dateString.endsWith('Z')) {
    // Extract just the date part (YYYY-MM-DD) and create local date at noon
    const datePart = dateString.split('T')[0]
    const [year, month, day] = datePart.split('-').map(Number)
    return new Date(year, month - 1, day, 12, 0, 0)
  }

  // If it's just a date (YYYY-MM-DD), treat as local date at noon
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    const [year, month, day] = dateString.split('-').map(Number)
    return new Date(year, month - 1, day, 12, 0, 0)
  }

  // If it's a datetime without Z, treat as local time
  // e.g., "2026-01-22T12:00:00"
  if (dateString.includes('T') && !dateString.endsWith('Z')) {
    const [datePart, timePart] = dateString.split('T')
    const [year, month, day] = datePart.split('-').map(Number)
    const [hour, minute, second] = (timePart || '12:00:00').split(':').map(Number)
    return new Date(year, month - 1, day, hour || 12, minute || 0, second || 0)
  }

  // Fallback: try to extract date portion and create local date
  const fallbackDate = new Date(dateString)
  if (!isNaN(fallbackDate.getTime())) {
    // If it parsed, extract year/month/day and create local date at noon
    return new Date(fallbackDate.getFullYear(), fallbackDate.getMonth(), fallbackDate.getDate(), 12, 0, 0)
  }

  return null
}

// Platform detection for firestore service loading
const IS_IOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent)

// Lazy-load firestoreService - uses REST API on iOS, SDK on desktop
let firestoreServiceInstance = null
async function getFirestoreService() {
  if (firestoreServiceInstance) return firestoreServiceInstance
  try {
    if (IS_IOS) {
      const module = await import('../utils/firestoreRestService')
      firestoreServiceInstance = module.default
      console.log('📱 Home: Using REST API service (iOS)')
    } else {
      const module = await import('../utils/firestoreService')
      firestoreServiceInstance = module.default
      console.log('💻 Home: Using SDK service (Desktop)')
    }
    return firestoreServiceInstance
  } catch (err) {
    console.error('Failed to load firestoreService:', err)
    return null
  }
}

export default function Home() {
  const navigate = useNavigate()
  const { meetings, stakeholders, stakeholderCategories, addMeeting, setCurrentMeeting, updateMeeting, deleteMeeting, addStakeholder, updateStakeholder, deleteStakeholder, addStakeholderCategory, updateStakeholderCategory, deleteStakeholderCategory, reloadFromStorage } = useApp()
  const sync = useSyncContext()
  const { measureInteraction } = usePerformanceMonitor('Home')
  const [searchTerm, setSearchTerm] = useState('')
  const [notifications, setNotifications] = useState([])
  const [activeTab, setActiveTab] = useState('all')
  const [collapsedGroups, setCollapsedGroups] = useState({})
  const [aiInsights, setAiInsights] = useState([])

  // Bulk re-analysis states
  
  // Advanced feature states
  const [showGlobalSearch, setShowGlobalSearch] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false)
  const [isNotificationCenterOpen, setIsNotificationCenterOpen] = useState(false)
  const [meetingSentiments, setMeetingSentiments] = useState({})
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(null)
  // Meeting organization state - replaces sortBy
  // 'date' = latest first (default), 'year', 'month', 'week', 'stakeholder'
  const [filterPriority, setFilterPriority] = useState('all')
  
  // Mobile-specific states
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const [activeView, setActiveView] = useState('meetings') // Default to meetings view

  // Meeting management states
  const [editingMeeting, setEditingMeeting] = useState(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null)
  const [showMeetingManagement, setShowMeetingManagement] = useState(false)

  // Stakeholder management states
  const [editingStakeholder, setEditingStakeholder] = useState(null)
  const [showDeleteStakeholderConfirm, setShowDeleteStakeholderConfirm] = useState(null)
  const [showStakeholderManagement, setShowStakeholderManagement] = useState(false)
  const [newStakeholder, setNewStakeholder] = useState(null)
  const [showAddCategoryForm, setShowAddCategoryForm] = useState(false)
  const [editingCategory, setEditingCategory] = useState(null)
  const [newCategory, setNewCategory] = useState({ label: '', description: '', color: 'blue' })

  // Lost recording recovery states
  const [showRecoveryModal, setShowRecoveryModal] = useState(false)
  const [isCheckingRecovery, setIsCheckingRecovery] = useState(false)
  const [lostSessions, setLostSessions] = useState([])
  const [recoveryResult, setRecoveryResult] = useState(null)
  const [activeStakeholderTab, setActiveStakeholderTab] = useState('stakeholders')

  // Filter states
  const [selectedStakeholder, setSelectedStakeholder] = useState('')
  const [stakeholderSearchTerm, setStakeholderSearchTerm] = useState('')
  const [showStakeholderDropdown, setShowStakeholderDropdown] = useState(false)

  // Bulk selection states
  const [selectedMeetings, setSelectedMeetings] = useState(new Set())
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)

  // Bulk stakeholder selection states
  const [selectedStakeholders, setSelectedStakeholders] = useState(new Set())
  const [showBulkStakeholderActions, setShowBulkStakeholderActions] = useState(false)
  const [bulkCategoryAssignment, setBulkCategoryAssignment] = useState('')
  const [showBulkStakeholderDeleteConfirm, setShowBulkStakeholderDeleteConfirm] = useState(false)

  // Sync states
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState(null)

  // Meeting organization state
  const [organizeBy, setOrganizeBy] = useState('date') // 'date', 'year', 'month', 'week', 'stakeholder'

  // Initialize services
  const sentimentAnalyzer = new SentimentAnalyzer()
  const exportManager = new ExportManager()

  // Use real data directly - AppContext handles deduplication
  const displayStakeholders = stakeholders
  const displayMeetings = meetings // Trust AppContext deduplication

  // Generate AI insights and sentiment analysis

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

  // Close stakeholder dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showStakeholderDropdown && !event.target.closest('.relative')) {
        setShowStakeholderDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showStakeholderDropdown])

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

  // AI-Powered Dashboard Metrics
  const calculateMeetingProductivityScore = () => {
    if (displayMeetings.length === 0) return 0

    const completedMeetings = displayMeetings.filter(m => m.status === 'completed')
    const meetingsWithOutcomes = completedMeetings.filter(m =>
      (m.actionItems && m.actionItems.length > 0) ||
      (m.summary && m.summary.length > 50)
    )
    const avgActionItems = completedMeetings.reduce((acc, m) => acc + (m.actionItems?.length || 0), 0) / Math.max(completedMeetings.length, 1)

    const productivityScore = Math.round(
      (meetingsWithOutcomes.length / Math.max(completedMeetings.length, 1)) * 0.6 * 100 +
      Math.min(avgActionItems * 10, 40)
    )

    return Math.min(productivityScore, 100)
  }

  const calculateActionItemsPerformance = () => {
    const completedItems = allActionItems.filter(item => item.completed).length
    const totalItems = allActionItems.length
    const completionRate = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0

    const onTimeItems = allActionItems.filter(item =>
      item.completed && item.dueDate && new Date(item.completedAt || Date.now()) <= new Date(item.dueDate)
    ).length

    const onTimeRate = completedItems > 0 ? Math.round((onTimeItems / completedItems) * 100) : 0

    return { completionRate, onTimeRate, totalItems, completedItems, overdueItems: overdueActionItems.length }
  }

  const calculateCommunicationHealth = () => {
    const recentMeetings = displayMeetings.filter(m => {
      const meetingDate = new Date(m.createdAt || m.scheduledAt)
      const daysDiff = differenceInDays(new Date(), meetingDate)
      return daysDiff <= 30
    })

    const meetingsWithGoodEngagement = recentMeetings.filter(m =>
      (m.attendees && m.attendees.length >= 2) &&
      (m.summary && m.summary.length > 100)
    ).length

    const healthScore = recentMeetings.length > 0 ?
      Math.round((meetingsWithGoodEngagement / recentMeetings.length) * 100) : 0

    const avgMeetingLength = recentMeetings.reduce((acc, m) => {
      const duration = m.duration || 60 // Default 60 minutes
      return acc + duration
    }, 0) / Math.max(recentMeetings.length, 1)

    return {
      healthScore,
      avgMeetingLength: Math.round(avgMeetingLength),
      recentMeetings: recentMeetings.length,
      engagedMeetings: meetingsWithGoodEngagement
    }
  }

  const generateSmartRecommendations = () => {
    const recommendations = []

    if (overdueActionItems.length > 3) {
      recommendations.push({
        type: 'action',
        title: 'Review Overdue Tasks',
        description: `You have ${overdueActionItems.length} overdue action items that need attention.`,
        priority: 'high'
      })
    }

    if (todaysMeetings.length > 4) {
      recommendations.push({
        type: 'schedule',
        title: 'Heavy Meeting Day',
        description: 'Consider rescheduling some meetings to avoid burnout.',
        priority: 'medium'
      })
    }

    if (stakeholderHealth.needsAttention > 0) {
      recommendations.push({
        type: 'relationship',
        title: 'Stakeholder Follow-up',
        description: `${stakeholderHealth.needsAttention} stakeholders need attention.`,
        priority: 'medium'
      })
    }

    const unscheduledMeetings = displayMeetings.filter(m => !m.scheduledAt).length
    if (unscheduledMeetings > 0) {
      recommendations.push({
        type: 'planning',
        title: 'Schedule Meetings',
        description: `${unscheduledMeetings} meetings need to be scheduled.`,
        priority: 'low'
      })
    }

    return recommendations.slice(0, 3) // Return top 3 recommendations
  }

  // Calculate AI metrics
  const productivityScore = calculateMeetingProductivityScore()
  const actionItemsPerformance = calculateActionItemsPerformance()
  const communicationHealth = calculateCommunicationHealth()
  const smartRecommendations = generateSmartRecommendations()

  // Filter meetings by search term and stakeholder
  const filteredMeetings = displayMeetings.filter(meeting => {
    const matchesSearch = meeting.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      meeting.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      meeting.attendees?.some(attendee =>
        attendee.toLowerCase().includes(searchTerm.toLowerCase())
      )

    const matchesStakeholder = !selectedStakeholder ||
      meeting.selectedStakeholder === selectedStakeholder ||
      meeting.stakeholderIds?.includes(selectedStakeholder) ||
      meeting.attendees?.some(attendee =>
        displayStakeholders.find(s => s.id === selectedStakeholder)?.name === attendee
      )

    return matchesSearch && matchesStakeholder
  })

  // Filter stakeholders for dropdown
  const filteredStakeholdersForDropdown = displayStakeholders.filter(stakeholder =>
    stakeholder.name.toLowerCase().includes(stakeholderSearchTerm.toLowerCase())
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
    console.log('🚀 Starting meeting:', meeting.id, meeting.title)
    // Don't set currentMeeting here - let Meeting component handle it based on URL
    navigate(`/meeting/${meeting.id}`)
  }

  const handleNewMeeting = () => {
    return measureInteraction('new-meeting', () => {
      hapticFeedback.medium()
      // Use a UUID-like ID to ensure uniqueness
      const meetingId = `meeting_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      const newMeeting = {
        id: meetingId, // Pre-assign the ID so we can navigate to it
        title: '',
        description: '',
        attendees: [],
        agenda: [],
        notes: [],
        attachments: [],
        status: 'upcoming'
      }

      addMeeting(newMeeting)
      // Navigate using the pre-assigned ID
      navigate(`/meeting/${meetingId}`)
    })
  }

  const handleEditMeeting = (meeting) => {
    setEditingMeeting({ ...meeting })
  }

  const handleSaveEdit = () => {
    if (editingMeeting) {
      updateMeeting(editingMeeting)
      setEditingMeeting(null)
    }
  }

  const handleCancelEdit = () => {
    setEditingMeeting(null)
  }

  const handleDeleteMeeting = (meetingId) => {
    setShowDeleteConfirm(meetingId)
  }

  // Bulk selection handlers
  const handleSelectMeeting = (meetingId, checked) => {
    const newSelectedMeetings = new Set(selectedMeetings)
    if (checked) {
      newSelectedMeetings.add(meetingId)
    } else {
      newSelectedMeetings.delete(meetingId)
    }
    setSelectedMeetings(newSelectedMeetings)
  }

  const handleSelectAllMeetings = (checked) => {
    if (checked) {
      setSelectedMeetings(new Set(sortedMeetings.map(m => m.id)))
    } else {
      setSelectedMeetings(new Set())
    }
  }

  const handleBulkDelete = () => {
    setShowBulkDeleteConfirm(true)
  }

  const confirmBulkDelete = () => {
    selectedMeetings.forEach(meetingId => {
      deleteMeeting(meetingId)
    })
    setSelectedMeetings(new Set())
    setShowBulkDeleteConfirm(false)
  }

  const cancelBulkDelete = () => {
    setShowBulkDeleteConfirm(false)
  }

  // Quick Sync handler - syncs data with Firestore
  const handleQuickSync = async () => {
    const userId = localStorage.getItem('meetingflow_firestore_user_id')

    if (!userId) {
      setSyncResult({
        success: false,
        message: 'Firestore not configured. Go to Settings > Firestore Sync to set up.'
      })
      setTimeout(() => setSyncResult(null), 5000)
      return
    }

    setIsSyncing(true)
    setSyncResult(null)

    try {
      console.log('🔄 Quick sync starting...')
      console.log('🔄 User ID:', userId)

      // Load firestore service (uses REST on iOS, SDK on desktop)
      const firestoreService = await getFirestoreService()

      if (!firestoreService) {
        throw new Error('Failed to load Firestore service')
      }

      console.log('🔄 Firestore service loaded, fetching data...')

      // Fetch all data from Firestore with individual error handling
      let cloudMeetings = [], cloudStakeholders = [], cloudCategories = []

      try {
        cloudMeetings = await firestoreService.getMeetings()
        console.log('🔄 Meetings fetched:', cloudMeetings.length)
      } catch (e) {
        console.error('🔄 Failed to fetch meetings:', e)
        throw new Error(`Failed to fetch meetings: ${e.message}`)
      }

      try {
        cloudStakeholders = await firestoreService.getStakeholders()
        console.log('🔄 Stakeholders fetched:', cloudStakeholders.length)
      } catch (e) {
        console.error('🔄 Failed to fetch stakeholders:', e)
        throw new Error(`Failed to fetch stakeholders: ${e.message}`)
      }

      try {
        cloudCategories = await firestoreService.getStakeholderCategories()
        console.log('🔄 Categories fetched:', cloudCategories.length)
      } catch (e) {
        console.error('🔄 Failed to fetch categories:', e)
        throw new Error(`Failed to fetch categories: ${e.message}`)
      }

      // Get local data
      const localMeetings = JSON.parse(localStorage.getItem('meetingflow_meetings') || '[]')
      const localStakeholders = JSON.parse(localStorage.getItem('meetingflow_stakeholders') || '[]')
      const localCategories = JSON.parse(localStorage.getItem('meetingflow_stakeholder_categories') || '[]')

      console.log('🔄 Local data:', {
        meetings: localMeetings.length,
        stakeholders: localStakeholders.length,
        categories: localCategories.length
      })

      // Simple merge: use cloud data, add any local-only items
      const cloudMeetingIds = new Set(cloudMeetings.map(m => m.id))
      const localOnlyMeetings = localMeetings.filter(m => !cloudMeetingIds.has(m.id))

      // Upload local-only meetings to cloud
      let uploadedCount = 0
      for (const meeting of localOnlyMeetings) {
        try {
          await firestoreService.saveMeeting(meeting)
          console.log('📤 Uploaded local meeting:', meeting.title)
          uploadedCount++
        } catch (e) {
          console.warn('Failed to upload meeting:', e)
        }
      }

      // Similarly for stakeholders
      const cloudStakeholderIds = new Set(cloudStakeholders.map(s => s.id))
      const localOnlyStakeholders = localStakeholders.filter(s => !cloudStakeholderIds.has(s.id))

      for (const stakeholder of localOnlyStakeholders) {
        try {
          await firestoreService.saveStakeholder(stakeholder)
          console.log('📤 Uploaded local stakeholder:', stakeholder.name)
        } catch (e) {
          console.warn('Failed to upload stakeholder:', e)
        }
      }

      // Merge and save to localStorage
      const mergedMeetings = [...cloudMeetings, ...localOnlyMeetings]
      localStorage.setItem('meetingflow_meetings', JSON.stringify(mergedMeetings))

      const mergedStakeholders = [...cloudStakeholders, ...localOnlyStakeholders]
      localStorage.setItem('meetingflow_stakeholders', JSON.stringify(mergedStakeholders))

      const finalCategories = cloudCategories.length > 0 ? cloudCategories : localCategories
      localStorage.setItem('meetingflow_stakeholder_categories', JSON.stringify(finalCategories))

      console.log('🔄 Saved to localStorage:', {
        meetings: mergedMeetings.length,
        stakeholders: mergedStakeholders.length,
        categories: finalCategories.length
      })

      // Build detailed sync message
      const syncDetails = []
      syncDetails.push(`${mergedMeetings.length} Meeting${mergedMeetings.length !== 1 ? 's' : ''}`)
      syncDetails.push(`${mergedStakeholders.length} Stakeholder${mergedStakeholders.length !== 1 ? 's' : ''}`)
      syncDetails.push(`${finalCategories.length} Categor${finalCategories.length !== 1 ? 'ies' : 'y'}`)

      const uploadedInfo = uploadedCount > 0 ? ` (${uploadedCount} uploaded)` : ''

      setSyncResult({
        success: true,
        message: `Synced: ${syncDetails.join(', ')}${uploadedInfo}`
      })

      // Reload data from localStorage into React state (no page reload needed)
      console.log('🔄 Reloading data into React state...')
      if (reloadFromStorage) {
        reloadFromStorage()
      }

      console.log('✅ Quick sync complete')

    } catch (error) {
      console.error('❌ Quick sync failed:', error)
      setSyncResult({
        success: false,
        message: `Sync failed: ${error.message}`
      })
    } finally {
      setIsSyncing(false)
      setTimeout(() => setSyncResult(null), 5000)
    }
  }

  // Check for lost recordings (orphaned sessions in IndexedDB)
  const handleCheckLostRecordings = async () => {
    setIsCheckingRecovery(true)
    setLostSessions([])
    setRecoveryResult(null)

    try {
      console.log('🔍 Checking for lost recordings...')

      // Check for orphaned transcript sessions
      const orphanedTranscripts = await findOrphanedSessions()

      // Check for orphaned audio sessions
      const audioSessions = await StreamingAudioBuffer.getAllSessions()
      const orphanedAudio = audioSessions.filter(s =>
        s.isActive || s.uploadStatus === 'pending' || s.uploadStatus === 'failed'
      )

      // Combine and format results
      const allLostSessions = []

      // Add transcript sessions
      for (const session of orphanedTranscripts) {
        allLostSessions.push({
          type: 'transcript',
          sessionId: session.sessionId,
          startTime: session.startTime,
          wordCount: session.wordCount || 0,
          preview: session.previewText || '',
          ageMinutes: session.ageMinutes || Math.round((Date.now() - session.startTime) / 60000)
        })
      }

      // Add audio sessions
      for (const session of orphanedAudio) {
        // Skip if already have transcript for this session
        if (!allLostSessions.some(s => s.sessionId === session.sessionId)) {
          allLostSessions.push({
            type: 'audio',
            sessionId: session.sessionId,
            startTime: session.startTime,
            totalBytes: session.totalBytes || 0,
            chunkCount: session.chunkCount || 0,
            uploadStatus: session.uploadStatus,
            ageMinutes: Math.round((Date.now() - session.startTime) / 60000)
          })
        }
      }

      // Sort by most recent first
      allLostSessions.sort((a, b) => b.startTime - a.startTime)

      setLostSessions(allLostSessions)
      setShowRecoveryModal(true)

      if (allLostSessions.length === 0) {
        setRecoveryResult({
          success: true,
          message: 'No lost recordings found. All data is intact!'
        })
      } else {
        setRecoveryResult({
          success: true,
          message: `Found ${allLostSessions.length} recoverable session(s)`
        })
      }

    } catch (error) {
      console.error('❌ Failed to check for lost recordings:', error)
      setRecoveryResult({
        success: false,
        message: `Error checking: ${error.message}`
      })
      setShowRecoveryModal(true)
    } finally {
      setIsCheckingRecovery(false)
    }
  }

  // Recover a specific lost session
  const handleRecoverSession = async (session) => {
    try {
      setRecoveryResult({ success: true, message: 'Recovering...' })

      if (session.type === 'transcript') {
        const result = await recoverOrphanedSession(session.sessionId)

        if (result.success && result.transcript) {
          // Create a new meeting with the recovered transcript
          const recoveredMeeting = {
            id: `recovered_${Date.now()}`,
            title: `Recovered Recording (${format(new Date(session.startTime), 'MMM d, h:mm a')})`,
            scheduledAt: new Date(session.startTime).toISOString(),
            audioTranscript: result.transcript,
            speakerData: result.speakerData,
            digitalNotes: {
              summary: 'This meeting was recovered from a lost recording session.',
              keyPoints: [],
              actionItems: []
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isRecovered: true
          }

          // Save the recovered meeting
          addMeeting(recoveredMeeting)

          // Delete the orphaned session
          await deleteOrphanedSession(session.sessionId)

          // Remove from list
          setLostSessions(prev => prev.filter(s => s.sessionId !== session.sessionId))

          setRecoveryResult({
            success: true,
            message: `Recovered! ${result.transcript.split(' ').length} words saved as new meeting.`
          })
        } else {
          setRecoveryResult({
            success: false,
            message: 'Could not recover transcript data. The session may be corrupted.'
          })
        }
      } else if (session.type === 'audio') {
        // Try to reconstruct audio and provide download
        const audioBlob = await StreamingAudioBuffer.reconstructAudio(session.sessionId)

        if (audioBlob && audioBlob.size > 0) {
          // Create download link
          const url = URL.createObjectURL(audioBlob)
          const a = document.createElement('a')
          a.href = url
          a.download = `recovered-audio-${format(new Date(session.startTime), 'yyyy-MM-dd-HHmm')}.webm`
          a.click()
          URL.revokeObjectURL(url)

          setRecoveryResult({
            success: true,
            message: `Audio file downloaded (${(audioBlob.size / 1024 / 1024).toFixed(2)} MB). You can transcribe it manually.`
          })
        } else {
          setRecoveryResult({
            success: false,
            message: 'Audio chunks could not be reconstructed.'
          })
        }
      }
    } catch (error) {
      console.error('Recovery failed:', error)
      setRecoveryResult({
        success: false,
        message: `Recovery failed: ${error.message}`
      })
    }
  }

  // Delete a lost session (user doesn't want to recover)
  const handleDeleteLostSession = async (session) => {
    try {
      if (session.type === 'transcript') {
        await deleteOrphanedSession(session.sessionId)
      } else if (session.type === 'audio') {
        await StreamingAudioBuffer.deleteSession(session.sessionId)
      }

      setLostSessions(prev => prev.filter(s => s.sessionId !== session.sessionId))
      setRecoveryResult({
        success: true,
        message: 'Session deleted.'
      })
    } catch (error) {
      setRecoveryResult({
        success: false,
        message: `Delete failed: ${error.message}`
      })
    }
  }

  // Bulk stakeholder selection handlers
  const handleSelectStakeholder = (stakeholderId, checked) => {
    const newSelectedStakeholders = new Set(selectedStakeholders)
    if (checked) {
      newSelectedStakeholders.add(stakeholderId)
    } else {
      newSelectedStakeholders.delete(stakeholderId)
    }
    setSelectedStakeholders(newSelectedStakeholders)
  }

  const handleSelectAllStakeholders = (checked) => {
    if (checked) {
      setSelectedStakeholders(new Set(stakeholders.map(s => s.id)))
    } else {
      setSelectedStakeholders(new Set())
    }
  }

  const handleBulkAssignCategory = () => {
    if (bulkCategoryAssignment && selectedStakeholders.size > 0) {
      selectedStakeholders.forEach(stakeholderId => {
        const stakeholder = stakeholders.find(s => s.id === stakeholderId)
        if (stakeholder) {
          updateStakeholder({
            ...stakeholder,
            category: bulkCategoryAssignment
          })
        }
      })
      setSelectedStakeholders(new Set())
      setBulkCategoryAssignment('')
      setShowBulkStakeholderActions(false)
    }
  }

  const handleBulkDeleteStakeholders = () => {
    setShowBulkStakeholderDeleteConfirm(true)
  }

  const confirmBulkDeleteStakeholders = () => {
    selectedStakeholders.forEach(stakeholderId => {
      deleteStakeholder(stakeholderId)
    })
    setSelectedStakeholders(new Set())
    setShowBulkStakeholderDeleteConfirm(false)
  }

  const cancelBulkDeleteStakeholders = () => {
    setShowBulkStakeholderDeleteConfirm(false)
  }

  const confirmDeleteMeeting = () => {
    if (showDeleteConfirm) {
      deleteMeeting(showDeleteConfirm)
      setShowDeleteConfirm(null)
    }
  }

  const cancelDeleteMeeting = () => {
    setShowDeleteConfirm(null)
  }

  // Stakeholder management handlers
  const handleEditStakeholder = (stakeholder) => {
    setEditingStakeholder({ ...stakeholder })
  }

  const handleSaveStakeholderEdit = () => {
    if (editingStakeholder) {
      updateStakeholder(editingStakeholder)
      setEditingStakeholder(null)
    }
  }

  const handleCancelStakeholderEdit = () => {
    setEditingStakeholder(null)
  }

  const handleDeleteStakeholder = (stakeholderId) => {
    setShowDeleteStakeholderConfirm(stakeholderId)
  }

  const confirmDeleteStakeholder = () => {
    if (showDeleteStakeholderConfirm) {
      deleteStakeholder(showDeleteStakeholderConfirm)
      setShowDeleteStakeholderConfirm(null)
    }
  }

  const cancelDeleteStakeholder = () => {
    setShowDeleteStakeholderConfirm(null)
  }

  const handleCreateStakeholder = () => {
    setNewStakeholder({
      name: '',
      title: '',
      organization: '',
      email: '',
      phone: '',
      category: 'investors',
      priority: 'medium',
      relationship_health: 'good',
      notes: ''
    })
  }

  const handleSaveNewStakeholder = () => {
    if (newStakeholder && newStakeholder.name.trim()) {
      addStakeholder(newStakeholder)
      setNewStakeholder(null)
    }
  }

  const handleCancelNewStakeholder = () => {
    setNewStakeholder(null)
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

  // Sorting - always latest first
  const sortedMeetings = [...filteredMeetings].sort((a, b) => {
    const dateA = parseMeetingDate(a.scheduledAt) || new Date(a.updatedAt || a.createdAt)
    const dateB = parseMeetingDate(b.scheduledAt) || new Date(b.updatedAt || b.createdAt)
    return dateB - dateA // Latest first
  })

  // Group meetings based on organizeBy setting
  const groupedMeetings = useMemo(() => {
    if (organizeBy === 'date') {
      return { 'All Meetings': sortedMeetings }
    }

    const groups = {}

    sortedMeetings.forEach(meeting => {
      const meetingDate = parseMeetingDate(meeting.scheduledAt) || new Date(meeting.updatedAt || meeting.createdAt)
      let groupKey = ''

      switch (organizeBy) {
        case 'year':
          groupKey = meetingDate.getFullYear().toString()
          break
        case 'month':
          // Format: "Jan 2026"
          groupKey = format(meetingDate, 'MMM yyyy')
          break
        case 'week':
          // Get week start date and format as "Week of Jan 20, 2026"
          const weekStart = new Date(meetingDate)
          weekStart.setDate(meetingDate.getDate() - meetingDate.getDay())
          groupKey = `Week of ${format(weekStart, 'MMM d, yyyy')}`
          break
        case 'stakeholder':
          // Group by stakeholder name (alphabetically)
          const stakeholder = displayStakeholders.find(s => s.id === meeting.selectedStakeholder)
          groupKey = stakeholder?.name || meeting.selectedStakeholder || 'No Stakeholder'
          break
        default:
          groupKey = 'All Meetings'
      }

      if (!groups[groupKey]) {
        groups[groupKey] = []
      }
      groups[groupKey].push(meeting)
    })

    // Sort groups appropriately
    const sortedGroups = {}
    let sortedKeys = Object.keys(groups)

    if (organizeBy === 'stakeholder') {
      // Alphabetical order for stakeholders
      sortedKeys.sort((a, b) => {
        if (a === 'No Stakeholder') return 1
        if (b === 'No Stakeholder') return -1
        return a.localeCompare(b)
      })
    } else {
      // Reverse chronological for time-based groupings (newest first)
      sortedKeys.sort((a, b) => {
        if (organizeBy === 'year') {
          return parseInt(b) - parseInt(a)
        }
        // For month/week, parse dates to compare
        const parseGroupDate = (key) => {
          if (key.startsWith('Week of ')) {
            return new Date(key.replace('Week of ', ''))
          }
          return new Date(key)
        }
        return parseGroupDate(b) - parseGroupDate(a)
      })
    }

    sortedKeys.forEach(key => {
      sortedGroups[key] = groups[key]
    })

    return sortedGroups
  }, [sortedMeetings, organizeBy, displayStakeholders])

  const handleNavigate = (path) => {
    navigate(path)
  }

  // Mobile-specific handlers
  const handleMobileRefresh = async () => {
    return measureInteraction('pull-to-refresh', async () => {
      hapticFeedback.light()
      // Simulate refresh with better UX
      await new Promise(resolve => setTimeout(resolve, 800))
      hapticFeedback.success()
      window.location.reload()
    })
  }

  const mobileNavItems = [
    {
      label: 'New Meeting',
      icon: <Plus size={20} />,
      onClick: () => {
        const newMeetingId = Math.random().toString(36).substr(2, 9)
        navigate(`/meeting/${newMeetingId}`)
      }
    },
    {
      label: 'Manage Stakeholders',
      icon: <Users size={20} />,
      onClick: () => setShowStakeholderManagement(true)
    },
    {
      label: 'Settings',
      icon: <Settings size={20} />,
      onClick: () => navigate('/settings')
    }
  ]

  const mobileTabs = [
    {
      id: 'meetings',
      label: 'Meetings',
      icon: <Calendar size={16} />,
      badge: sortedMeetings.length
    }
  ]

  return (
    <div className="w-full">
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

              {/* Sync Button */}
              <button
                onClick={handleQuickSync}
                disabled={isSyncing}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors touch-target disabled:opacity-50"
                title="Sync with Firestore"
              >
                <RefreshCw size={20} className={isSyncing ? 'animate-spin text-green-600' : ''} />
              </button>

              {/* Recovery Button */}
              <button
                onClick={handleCheckLostRecordings}
                disabled={isCheckingRecovery}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors touch-target disabled:opacity-50"
                title="Check for lost recordings"
              >
                <HardDrive size={20} className={isCheckingRecovery ? 'animate-pulse text-orange-600' : ''} />
              </button>
            </>
          }
        />
      </div>
      

      {/* Modern Desktop Header */}
      <header className="bg-white shadow-sm border-b hidden md:block">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            {/* Logo Section */}
            <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => navigate('/')}>
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
                <span className="text-white text-xl font-bold">M</span>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">MeetingFlow</h1>
                <p className="text-sm text-gray-500">Your intelligent meeting companion</p>
              </div>
            </div>

            {/* Center - Universal Search */}
            <div className="flex-1 max-w-md mx-8">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  placeholder="Search meetings, notes, people... ⌘K"
                  onClick={() => setIsGlobalSearchOpen(true)}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 hover:bg-gray-100 focus:bg-white border border-gray-200 rounded-xl transition-all focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer"
                  readOnly
                />
              </div>
            </div>

            {/* Right Section */}
            <div className="flex items-center gap-3">
              {/* HIDDEN: Sync Status Indicator - no auto-sync, manual sync via Settings only
              {sync.isConfigured && (
                <SyncStatusIndicator
                  syncStatus={sync.syncStatus}
                  isOnline={sync.isOnline}
                  lastSyncTime={sync.lastSyncTime}
                  hasError={sync.hasError}
                  hasConflict={sync.hasConflict}
                  queuedOperations={sync.queuedOperations}
                  onClick={() => navigate('/settings?tab=sync')}
                />
              )}
              */}

              {/* New Meeting CTA */}
              <button
                onClick={() => navigate('/meeting/new')}
                className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-xl font-medium transition-all transform hover:scale-105 shadow-lg"
              >
                <Plus size={18} />
                New Meeting
              </button>

              {/* Quick Sync Button */}
              <button
                onClick={handleQuickSync}
                disabled={isSyncing}
                className="flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-medium shadow-sm hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                title="Sync with Firestore"
              >
                <RefreshCw size={18} className={isSyncing ? 'animate-spin' : ''} />
                {isSyncing ? 'Syncing...' : 'Sync'}
              </button>

              {/* User Menu */}
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-2 p-2.5 hover:bg-gray-100 rounded-xl transition-colors"
                  title="Menu"
                >
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                    <span className="text-white text-sm font-semibold">U</span>
                  </div>
                  <ChevronDown size={16} className="text-gray-500" />
                </button>

                {/* User Menu Dropdown */}
                {showUserMenu && (
                  <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-200 z-20 py-2">
                    <div className="px-4 py-3 border-b border-gray-100">
                      <p className="text-sm font-medium text-gray-900">Menu</p>
                      <p className="text-xs text-gray-500">Manage your meetings and data</p>
                    </div>

                    <div className="py-1">
                      <button
                        onClick={() => {
                          setShowMeetingManagement(true)
                          setShowUserMenu(false)
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        <Edit2 size={16} />
                        Manage Meetings
                      </button>

                      <button
                        onClick={() => {
                          setShowStakeholderManagement(true)
                          setShowUserMenu(false)
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        <Users size={16} />
                        Manage Stakeholders
                      </button>

                      <div className="relative">
                        <BatchExportButton
                          meetings={displayMeetings}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                          variant="menu"
                        />
                      </div>

                      <div className="border-t border-gray-100 my-1"></div>

                      <button
                        onClick={() => {
                          navigate('/settings')
                          setShowUserMenu(false)
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        <Settings size={16} />
                        Settings
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Content with Pull-to-Refresh */}
      <main className="w-full bg-gray-50">
        <div className="max-w-7xl mx-auto">
        <PullToRefresh onRefresh={handleMobileRefresh}>
          {/* Mobile Tabs - Only show on mobile */}
          <div className="md:hidden">
            <MobileTabs
              tabs={mobileTabs}
              activeTab={activeView}
              onTabChange={setActiveView}
            />
          </div>

          <div className="px-4 py-4 md:py-8 space-y-6 min-h-screen">
            {/* Mobile New Meeting Button */}
            <div className="md:hidden">
              <TouchButton
                onClick={handleNewMeeting}
                variant="primary"
                size="large"
                fullWidth
                hapticType="medium"
                ariaLabel="Create new meeting"
              >
                <Plus size={20} className="mr-2" />
                New Meeting
              </TouchButton>
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

        {/* Stakeholder Filter Section */}
        {(activeView === 'meetings' || window.innerWidth >= 768) && (
          <div className="mb-6 bg-white rounded-lg shadow-sm border p-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Filter Meetings</h3>
            <div className="flex flex-col md:flex-row gap-4">
              {/* Stakeholder Filter */}
              <div className="flex-1 relative">
                <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Stakeholder</label>
                <div className="relative">
                  <div
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer bg-white flex items-center justify-between"
                    onClick={() => setShowStakeholderDropdown(!showStakeholderDropdown)}
                  >
                    <span className="flex items-center gap-2">
                      <Users size={16} className="text-gray-400" />
                      {selectedStakeholder ? (
                        displayStakeholders.find(s => s.id === selectedStakeholder)?.name || 'Unknown Stakeholder'
                      ) : (
                        'All Stakeholders'
                      )}
                    </span>
                    <ChevronDown size={16} className={`text-gray-400 transition-transform ${
                      showStakeholderDropdown ? 'rotate-180' : ''
                    }`} />
                  </div>

                  {showStakeholderDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-10 max-h-64 overflow-hidden">
                      {/* Search Input */}
                      <div className="p-3 border-b border-gray-200">
                        <div className="relative">
                          <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                          <input
                            type="text"
                            placeholder="Search stakeholders..."
                            value={stakeholderSearchTerm}
                            onChange={(e) => setStakeholderSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      </div>

                      {/* Dropdown Options */}
                      <div className="max-h-48 overflow-y-auto">
                        {/* All Stakeholders Option */}
                        <div
                          className={`px-3 py-2 cursor-pointer hover:bg-gray-50 flex items-center gap-2 ${
                            !selectedStakeholder ? 'bg-blue-50 text-blue-600' : 'text-gray-700'
                          }`}
                          onClick={() => {
                            setSelectedStakeholder('')
                            setShowStakeholderDropdown(false)
                            setStakeholderSearchTerm('')
                          }}
                        >
                          <Users size={16} />
                          <span className="font-medium">All Stakeholders</span>
                          {!selectedStakeholder && (
                            <CheckCircle size={16} className="ml-auto text-blue-600" />
                          )}
                        </div>

                        {filteredStakeholdersForDropdown.length > 0 ? (
                          filteredStakeholdersForDropdown.map(stakeholder => {
                            const categoryInfo = stakeholderCategories.find(cat => cat.key === stakeholder.category)
                            return (
                              <div
                                key={stakeholder.id}
                                className={`px-3 py-2 cursor-pointer hover:bg-gray-50 flex items-center gap-2 ${
                                  selectedStakeholder === stakeholder.id ? 'bg-blue-50 text-blue-600' : 'text-gray-700'
                                }`}
                                onClick={() => {
                                  setSelectedStakeholder(stakeholder.id)
                                  setShowStakeholderDropdown(false)
                                  setStakeholderSearchTerm('')
                                }}
                              >
                                <div className={`w-3 h-3 rounded-full bg-${categoryInfo?.color || 'gray'}-500`}></div>
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium truncate">{stakeholder.name}</div>
                                  <div className="text-xs text-gray-500">
                                    {categoryInfo?.label || stakeholder.category || 'Uncategorized'}
                                  </div>
                                </div>
                                {selectedStakeholder === stakeholder.id && (
                                  <CheckCircle size={16} className="text-blue-600" />
                                )}
                              </div>
                            )
                          })
                        ) : (
                          <div className="px-3 py-4 text-center text-gray-500 text-sm">
                            No stakeholders found
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Clear Filters */}
              {selectedStakeholder && (
                <div className="flex items-end">
                  <button
                    onClick={() => {
                      setSelectedStakeholder('')
                      setStakeholderSearchTerm('')
                    }}
                    className="px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-2"
                  >
                    <XCircle size={16} />
                    Clear Filter
                  </button>
                </div>
              )}
            </div>

            {/* Filter Results Summary */}
            <div className="mt-3 text-sm text-gray-600">
              {selectedStakeholder ? (
                <span>
                  Showing {filteredMeetings.length} meeting{filteredMeetings.length !== 1 ? 's' : ''} for{' '}
                  <strong>{displayStakeholders.find(s => s.id === selectedStakeholder)?.name}</strong>
                </span>
              ) : (
                <span>Showing all {filteredMeetings.length} meeting{filteredMeetings.length !== 1 ? 's' : ''}</span>
              )}
            </div>
          </div>
        )}



            {/* Desktop Organize Controls - Hidden on Mobile */}
            <div className="hidden md:flex md:items-center gap-4 mb-6">
              <div className="flex items-center gap-4">
                <label className="text-sm font-medium text-gray-700">Organize by:</label>
                <select
                  value={organizeBy}
                  onChange={(e) => setOrganizeBy(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-blue-500"
                >
                  <option value="date">Latest First</option>
                  <option value="year">Year</option>
                  <option value="month">Month</option>
                  <option value="week">Week</option>
                  <option value="stakeholder">Stakeholder</option>
                </select>
              </div>
            </div>

            {/* Recent Meetings Section - Conditional for Mobile */}
            {(activeView === 'meetings' || window.innerWidth >= 768) && sortedMeetings.length > 0 && (
              <div className="mb-6">
                {/* Mobile Organize Controls */}
                <div className="md:hidden mb-4">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-700">Organize:</label>
                    <select
                      value={organizeBy}
                      onChange={(e) => setOrganizeBy(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-blue-500 touch-target"
                    >
                      <option value="date">Latest First</option>
                      <option value="year">Year</option>
                      <option value="month">Month</option>
                      <option value="week">Week</option>
                      <option value="stakeholder">Stakeholder</option>
                    </select>
                  </div>
                </div>

                {/* Header with Bulk Actions */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <h2 className="text-lg md:text-xl font-semibold text-gray-900">
                      {organizeBy === 'date' ? 'All Meetings' : `Meetings by ${organizeBy.charAt(0).toUpperCase() + organizeBy.slice(1)}`}
                    </h2>
                    {sortedMeetings.length > 0 && (
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedMeetings.size === sortedMeetings.length && sortedMeetings.length > 0}
                          onChange={(e) => handleSelectAllMeetings(e.target.checked)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <label className="text-sm text-gray-600">
                          Select all ({sortedMeetings.length})
                        </label>
                      </div>
                    )}
                  </div>

                  {selectedMeetings.size > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">
                        {selectedMeetings.size} selected
                      </span>
                      <button
                        onClick={handleBulkDelete}
                        className="flex items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 size={16} />
                        Delete Selected
                      </button>
                    </div>
                  )}
                </div>

                {/* Grouped Meetings Display */}
                {Object.entries(groupedMeetings).map(([groupName, groupMeetings]) => (
                  <div key={groupName} className="mb-6">
                    {/* Group Header - only show when organizing by something other than date */}
                    {organizeBy !== 'date' && (
                      <div className="flex items-center gap-3 mb-3 pb-2 border-b border-gray-200">
                        <h3 className="text-md font-medium text-gray-700">{groupName}</h3>
                        <span className="text-sm text-gray-500">({groupMeetings.length} meeting{groupMeetings.length !== 1 ? 's' : ''})</span>
                      </div>
                    )}
                    <ResponsiveGrid minItemWidth="280px">
                      {groupMeetings.map((meeting, index) => {
                        const isSelected = selectedMeetings.has(meeting.id)
                        return (
                          <div
                            key={`${meeting.id}-${index}`}
                            onClick={(e) => {
                              // Don't navigate if clicking on checkbox or its label
                              if (e.target.type === 'checkbox' || e.target.closest('input[type="checkbox"]')) {
                                e.stopPropagation()
                                return
                              }
                              handleStartMeeting(meeting)
                            }}
                            className={`cursor-pointer hover:shadow-lg transition-shadow ${isSelected ? 'ring-2 ring-blue-500 bg-blue-50' : ''}`}
                          >
                            <MobileExpandableCard
                              title={
                                <div className="flex items-center gap-3">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={(e) => {
                                      e.stopPropagation()
                                      handleSelectMeeting(meeting.id, e.target.checked)
                                    }}
                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                  />
                                  <span>{meeting.title || 'Untitled Meeting'}</span>
                                </div>
                              }
                              subtitle={
                                <div className="flex items-center justify-between mt-2">
                                  <div className="flex items-center gap-2 text-xs text-gray-500">
                                    {meeting.scheduledAt && (
                                      <>
                                        <Clock size={12} />
                                        {format(parseMeetingDate(meeting.scheduledAt), 'MMM d, yyyy')}
                                      </>
                                    )}
                                    {meeting.selectedStakeholder && organizeBy !== 'stakeholder' && (
                                      <span className="ml-2 text-blue-600">
                                        {displayStakeholders.find(s => s.id === meeting.selectedStakeholder)?.name || meeting.selectedStakeholder}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              }
                              defaultExpanded={false}
                            >
                              <div className="pt-3 space-y-3">
                                {meeting.description && (
                                  <p className="text-sm text-gray-600 line-clamp-3">{meeting.description}</p>
                                )}

                                <div className="flex items-center justify-between text-sm text-gray-500">
                                  {meeting.attendees && meeting.attendees.length > 0 && (
                                    <div className="flex items-center gap-1">
                                      <Users size={12} />
                                      <span>{meeting.attendees.length} attendees</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </MobileExpandableCard>
                          </div>
                        )
                      })}
                    </ResponsiveGrid>
                  </div>
                ))}
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
        </div>
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

      {/* Meeting Management Modal */}
      {showMeetingManagement && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-semibold text-gray-900">Manage Meetings</h2>
              <button
                onClick={() => setShowMeetingManagement(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X size={24} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
              {displayMeetings.length === 0 ? (
                <div className="text-center py-12">
                  <Calendar className="mx-auto text-gray-400 mb-4" size={48} />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No meetings found</h3>
                  <p className="text-gray-600">Create your first meeting to get started.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {[...displayMeetings].sort((a, b) => {
                    // Sort by latest first (using scheduledAt, updatedAt, or createdAt)
                    const dateA = parseMeetingDate(a.scheduledAt) || new Date(a.updatedAt || a.createdAt || 0)
                    const dateB = parseMeetingDate(b.scheduledAt) || new Date(b.updatedAt || b.createdAt || 0)
                    return dateB - dateA
                  }).map(meeting => (
                    <div key={meeting.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                      {editingMeeting && editingMeeting.id === meeting.id ? (
                        /* Edit Mode */
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
                              <input
                                type="text"
                                value={editingMeeting.title || ''}
                                onChange={(e) => setEditingMeeting(prev => ({ ...prev, title: e.target.value }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                placeholder="Meeting title"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                              <select
                                value={editingMeeting.status || 'upcoming'}
                                onChange={(e) => setEditingMeeting(prev => ({ ...prev, status: e.target.value }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              >
                                <option value="upcoming">Upcoming</option>
                                <option value="in-progress">In Progress</option>
                                <option value="completed">Completed</option>
                                <option value="cancelled">Cancelled</option>
                              </select>
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                            <textarea
                              value={editingMeeting.description || ''}
                              onChange={(e) => setEditingMeeting(prev => ({ ...prev, description: e.target.value }))}
                              rows={3}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              placeholder="Meeting description"
                            />
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
                              <select
                                value={editingMeeting.priority || 'medium'}
                                onChange={(e) => setEditingMeeting(prev => ({ ...prev, priority: e.target.value }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              >
                                <option value="low">Low</option>
                                <option value="medium">Medium</option>
                                <option value="high">High</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">Scheduled Date</label>
                              <input
                                type="datetime-local"
                                value={editingMeeting.scheduledAt ? new Date(editingMeeting.scheduledAt).toISOString().slice(0, 16) : ''}
                                onChange={(e) => setEditingMeeting(prev => ({
                                  ...prev,
                                  scheduledAt: e.target.value ? new Date(e.target.value).toISOString() : null
                                }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              />
                            </div>
                          </div>
                          <div className="flex justify-end gap-3 pt-4 border-t">
                            <button
                              onClick={handleCancelEdit}
                              className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                            >
                              <XCircle size={16} />
                              Cancel
                            </button>
                            <button
                              onClick={handleSaveEdit}
                              className="flex items-center gap-2 px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                            >
                              <Save size={16} />
                              Save Changes
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* View Mode */
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h3 className="text-lg font-medium text-gray-900">
                                {meeting.title || 'Untitled Meeting'}
                              </h3>
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                meeting.status === 'completed' ? 'bg-green-100 text-green-800' :
                                meeting.status === 'in-progress' ? 'bg-blue-100 text-blue-800' :
                                meeting.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {meeting.status || 'upcoming'}
                              </span>
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                meeting.priority === 'high' ? 'bg-red-100 text-red-800' :
                                meeting.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-green-100 text-green-800'
                              }`}>
                                {meeting.priority || 'low'} priority
                              </span>
                            </div>
                            {meeting.description && (
                              <p className="text-gray-600 mb-3 line-clamp-2">{meeting.description}</p>
                            )}
                            <div className="flex items-center gap-4 text-sm text-gray-500">
                              {meeting.scheduledAt && (
                                <div className="flex items-center gap-1">
                                  <Calendar size={14} />
                                  {format(parseMeetingDate(meeting.scheduledAt), 'MMM d, yyyy h:mm a')}
                                </div>
                              )}
                              {meeting.attendees && meeting.attendees.length > 0 && (
                                <div className="flex items-center gap-1">
                                  <Users size={14} />
                                  {meeting.attendees.length} attendees
                                </div>
                              )}
                              <div className="flex items-center gap-1">
                                <Clock size={14} />
                                {meeting.updatedAt ? format(new Date(meeting.updatedAt), 'MMM d, yyyy') : 'Never updated'}
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 ml-4 sm:ml-4 mt-2 sm:mt-0">
                            <button
                              onClick={() => handleStartMeeting(meeting)}
                              className="flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors text-sm"
                              title="Open Meeting"
                            >
                              <Eye size={14} />
                              <span className="sm:hidden md:inline">Open</span>
                            </button>
                            <button
                              onClick={() => handleEditMeeting(meeting)}
                              className="flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-2 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors text-sm"
                              title="Edit Meeting"
                            >
                              <Edit2 size={14} />
                              <span className="sm:hidden md:inline">Edit</span>
                            </button>
                            <button
                              onClick={() => handleDeleteMeeting(meeting.id)}
                              className="flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm"
                              title="Delete Meeting"
                            >
                              <Trash2 size={14} />
                              <span className="sm:hidden md:inline">Delete</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Stakeholder Management Modal */}
      {showStakeholderManagement && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 p-4 pt-6 pb-6 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[calc(100vh-3rem)] overflow-hidden flex flex-col my-6">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b flex-shrink-0">
              <h2 className="text-xl font-semibold text-gray-900">Manage Stakeholders</h2>
              <button
                onClick={() => setShowStakeholderManagement(false)}
                className="p-3 text-gray-700 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border-2 border-gray-300 hover:border-red-300 bg-white shadow-sm"
                title="Close Modal"
              >
                <X size={24} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b flex-shrink-0 bg-gray-50">
              <button
                onClick={() => setActiveStakeholderTab('stakeholders')}
                className={`px-6 py-3 font-medium transition-colors ${
                  activeStakeholderTab === 'stakeholders'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Stakeholders
              </button>
              <button
                onClick={() => setActiveStakeholderTab('categories')}
                className={`px-6 py-3 font-medium transition-colors ${
                  activeStakeholderTab === 'categories'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Categories
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto flex-1">
              {activeStakeholderTab === 'stakeholders' && (
                <>
                  {/* Add New Stakeholder Button */}
                  <div className="mb-6">
                    <button
                      onClick={handleCreateStakeholder}
                      className="flex items-center gap-2 px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                    >
                      <Plus size={16} />
                      Add Stakeholder
                    </button>
                  </div>

                  {/* New Stakeholder Form */}
                  {newStakeholder && (
                    <div className="mb-6 p-4 border-2 border-blue-200 rounded-lg bg-blue-50">
                      <h3 className="text-lg font-medium text-gray-900 mb-4">Add New Stakeholder</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Name *</label>
                          <input
                            type="text"
                            value={newStakeholder.name || ''}
                            onChange={(e) => setNewStakeholder(prev => ({ ...prev, name: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            placeholder="Stakeholder name"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Category *</label>
                          <select
                            value={newStakeholder.category || ''}
                            onChange={(e) => setNewStakeholder(prev => ({ ...prev, category: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            required
                          >
                            <option value="">Select Category</option>
                            {stakeholderCategories.map(cat => (
                              <option key={cat.key} value={cat.key}>{cat.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="flex justify-end gap-3 mt-4">
                        <button
                          onClick={handleCancelNewStakeholder}
                          className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                        >
                          <XCircle size={16} />
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveNewStakeholder}
                          className="flex items-center gap-2 px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                        >
                          <Save size={16} />
                          Add Stakeholder
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {activeStakeholderTab === 'categories' && (
                <>
                  {/* Add New Category Button */}
                  <div className="mb-6">
                    <button
                      onClick={() => setShowAddCategoryForm(true)}
                      className="flex items-center gap-2 px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                    >
                      <Plus size={16} />
                      Add Category
                    </button>
                  </div>

                  {/* New Category Form */}
                  {showAddCategoryForm && (
                    <div className="mb-6 p-4 border-2 border-blue-200 rounded-lg bg-blue-50">
                      <h3 className="text-lg font-medium text-gray-900 mb-4">Add New Category</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Name *</label>
                          <input
                            type="text"
                            value={newCategory.label}
                            onChange={(e) => setNewCategory(prev => ({ ...prev, label: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            placeholder="Category name"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
                          <select
                            value={newCategory.color}
                            onChange={(e) => setNewCategory(prev => ({ ...prev, color: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value="blue">Blue</option>
                            <option value="green">Green</option>
                            <option value="purple">Purple</option>
                            <option value="red">Red</option>
                            <option value="orange">Orange</option>
                            <option value="yellow">Yellow</option>
                            <option value="gray">Gray</option>
                          </select>
                        </div>
                      </div>
                      <div className="mt-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                        <textarea
                          value={newCategory.description}
                          onChange={(e) => setNewCategory(prev => ({ ...prev, description: e.target.value }))}
                          rows={2}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="Brief description of this category"
                        />
                      </div>
                      <div className="flex justify-end gap-3 mt-4">
                        <button
                          onClick={() => {
                            setShowAddCategoryForm(false)
                            setNewCategory({ label: '', description: '', color: 'blue' })
                          }}
                          className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                        >
                          <XCircle size={16} />
                          Cancel
                        </button>
                        <button
                          onClick={() => {
                            if (newCategory.label.trim()) {
                              addStakeholderCategory({
                                ...newCategory,
                                key: (newCategory.label || '').toLowerCase().replace(/\s+/g, '-'),
                                createdAt: new Date().toISOString()
                              })
                              setShowAddCategoryForm(false)
                              setNewCategory({ label: '', description: '', color: 'blue' })
                            }
                          }}
                          disabled={!newCategory.label.trim()}
                          className="flex items-center gap-2 px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 rounded-lg transition-colors"
                        >
                          <Save size={16} />
                          Add Category
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {activeStakeholderTab === 'stakeholders' && (
                stakeholders.length === 0 ? (
                  <div className="text-center py-12">
                    <Users className="mx-auto text-gray-400 mb-4" size={48} />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No stakeholders found</h3>
                    <p className="text-gray-600">Add your first stakeholder to get started.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Bulk Selection Controls */}
                    <div className="flex items-center justify-between bg-gray-50 p-4 rounded-lg border">
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedStakeholders.size === stakeholders.length && stakeholders.length > 0}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedStakeholders(new Set(stakeholders.map(s => s.id)))
                              } else {
                                setSelectedStakeholders(new Set())
                              }
                            }}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <span className="text-sm font-medium text-gray-700">
                            Select All ({selectedStakeholders.size} of {stakeholders.length} selected)
                          </span>
                        </label>
                      </div>

                      {selectedStakeholders.size > 0 && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setShowBulkStakeholderActions(true)}
                            className="flex items-center gap-2 px-3 py-2 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                          >
                            <Edit2 size={16} />
                            Assign Category
                          </button>
                          <button
                            onClick={handleBulkDeleteStakeholders}
                            className="flex items-center gap-2 px-3 py-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                          >
                            <Trash2 size={16} />
                            Delete Selected
                          </button>
                        </div>
                      )}
                    </div>
                    {stakeholders.map(stakeholder => {
                      const categoryInfo = stakeholderCategories.find(cat => cat.key === stakeholder.category)
                      return (
                        <div key={stakeholder.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                          {editingStakeholder && editingStakeholder.id === stakeholder.id ? (
                            /* Edit Mode */
                            <div className="space-y-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-2">Name</label>
                                  <input
                                    type="text"
                                    value={editingStakeholder.name || ''}
                                    onChange={(e) => setEditingStakeholder(prev => ({ ...prev, name: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                  />
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                                  <select
                                    value={editingStakeholder.category || ''}
                                    onChange={(e) => setEditingStakeholder(prev => ({ ...prev, category: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                  >
                                    {stakeholderCategories.map(cat => (
                                      <option key={cat.key} value={cat.key}>{cat.label}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                              <div className="flex justify-end gap-3 pt-4 border-t">
                                <button
                                  onClick={handleCancelStakeholderEdit}
                                  className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                                >
                                  <XCircle size={16} />
                                  Cancel
                                </button>
                                <button
                                  onClick={handleSaveStakeholderEdit}
                                  className="flex items-center gap-2 px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                                >
                                  <Save size={16} />
                                  Save Changes
                                </button>
                              </div>
                            </div>
                          ) : (
                            /* View Mode */
                            <div className="flex items-start gap-4">
                              {/* Checkbox for bulk selection */}
                              <div className="flex items-center pt-1">
                                <input
                                  type="checkbox"
                                  checked={selectedStakeholders.has(stakeholder.id)}
                                  onChange={(e) => {
                                    const newSelection = new Set(selectedStakeholders)
                                    if (e.target.checked) {
                                      newSelection.add(stakeholder.id)
                                    } else {
                                      newSelection.delete(stakeholder.id)
                                    }
                                    setSelectedStakeholders(newSelection)
                                  }}
                                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                />
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 mb-2">
                                  <h3 className="text-lg font-medium text-gray-900">
                                    {stakeholder.name}
                                  </h3>
                                  <span className={`px-2 py-1 rounded-full text-xs font-medium bg-${categoryInfo?.color || 'gray'}-100 text-${categoryInfo?.color || 'gray'}-800`}>
                                    {categoryInfo?.label || stakeholder.category || 'Uncategorized'}
                                  </span>
                                </div>
                                <div className="text-xs text-gray-500">
                                  Added: {stakeholder.createdAt ? format(new Date(stakeholder.createdAt), 'MMM d, yyyy') : 'Unknown'}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 ml-4">
                                <button
                                  onClick={() => handleEditStakeholder(stakeholder)}
                                  className="flex items-center gap-1 px-3 py-2 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                                  title="Edit Stakeholder"
                                >
                                  <Edit2 size={16} />
                                  <span className="hidden sm:inline">Edit</span>
                                </button>
                                <button
                                  onClick={() => handleDeleteStakeholder(stakeholder.id)}
                                  className="flex items-center gap-1 px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Delete Stakeholder"
                                >
                                  <Trash2 size={16} />
                                  <span className="hidden sm:inline">Delete</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              )}

              {activeStakeholderTab === 'categories' && (
                stakeholderCategories.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="text-6xl mb-4">🏷️</div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No categories found</h3>
                    <p className="text-gray-600">Add your first category to get started.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {stakeholderCategories.map(category => {
                      const stakeholderCount = stakeholders.filter(s => s.category === category.key).length
                      return (
                        <div key={category.key} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                          {editingCategory && editingCategory.key === category.key ? (
                            /* Edit Mode */
                            <div className="space-y-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-2">Name</label>
                                  <input
                                    type="text"
                                    value={editingCategory.label || ''}
                                    onChange={(e) => setEditingCategory(prev => ({ ...prev, label: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                  />
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
                                  <select
                                    value={editingCategory.color || 'blue'}
                                    onChange={(e) => setEditingCategory(prev => ({ ...prev, color: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                  >
                                    <option value="blue">Blue</option>
                                    <option value="green">Green</option>
                                    <option value="purple">Purple</option>
                                    <option value="red">Red</option>
                                    <option value="orange">Orange</option>
                                    <option value="yellow">Yellow</option>
                                    <option value="gray">Gray</option>
                                  </select>
                                </div>
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                                <textarea
                                  value={editingCategory.description || ''}
                                  onChange={(e) => setEditingCategory(prev => ({ ...prev, description: e.target.value }))}
                                  rows={2}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                              </div>
                              <div className="flex justify-end gap-3 pt-4 border-t">
                                <button
                                  onClick={() => setEditingCategory(null)}
                                  className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                                >
                                  <XCircle size={16} />
                                  Cancel
                                </button>
                                <button
                                  onClick={() => {
                                    updateStakeholderCategory(editingCategory)
                                    setEditingCategory(null)
                                  }}
                                  className="flex items-center gap-2 px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                                >
                                  <Save size={16} />
                                  Save Changes
                                </button>
                              </div>
                            </div>
                          ) : (
                            /* View Mode */
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  <div className={`w-4 h-4 rounded-full bg-${category.color || 'gray'}-500`}></div>
                                  <h3 className="text-lg font-medium text-gray-900">
                                    {category.label}
                                  </h3>
                                  <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                    {stakeholderCount} stakeholder{stakeholderCount !== 1 ? 's' : ''}
                                  </span>
                                </div>
                                {category.description && (
                                  <p className="text-sm text-gray-600 mb-2">{category.description}</p>
                                )}
                                <div className="text-xs text-gray-500">
                                  Created: {category.createdAt ? format(new Date(category.createdAt), 'MMM d, yyyy') : 'Unknown'}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 ml-4">
                                <button
                                  onClick={() => setEditingCategory(category)}
                                  className="flex items-center gap-1 px-3 py-2 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                                  title="Edit Category"
                                >
                                  <Edit2 size={16} />
                                  <span className="hidden sm:inline">Edit</span>
                                </button>
                                <button
                                  onClick={() => {
                                    if (window.confirm(`Are you sure you want to delete this category? ${stakeholderCount} stakeholder${stakeholderCount !== 1 ? 's' : ''} will be affected.`)) {
                                      deleteStakeholderCategory(category.key)
                                    }
                                  }}
                                  className="flex items-center gap-1 px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Delete Category"
                                >
                                  <Trash2 size={16} />
                                  <span className="hidden sm:inline">Delete</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Stakeholder Confirmation Modal */}
      {showDeleteStakeholderConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md" style={{ margin: 'auto' }}>
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                  <Users className="text-red-600" size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-900">Delete Stakeholder</h3>
                  <p className="text-sm text-gray-600">Are you sure you want to delete this stakeholder? This action cannot be undone.</p>
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={cancelDeleteStakeholder}
                  className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeleteStakeholder}
                  className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                >
                  Delete Stakeholder
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md" style={{ margin: 'auto' }}>
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                  <Trash2 className="text-red-600" size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-900">Delete Meeting</h3>
                  <p className="text-sm text-gray-600">Are you sure you want to delete this meeting? This action cannot be undone.</p>
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={cancelDeleteMeeting}
                  className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeleteMeeting}
                  className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                >
                  Delete Meeting
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md" style={{ margin: 'auto' }}>
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                  <Trash2 className="text-red-600" size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-900">Delete Multiple Meetings</h3>
                  <p className="text-sm text-gray-600">
                    Are you sure you want to delete {selectedMeetings.size} meeting{selectedMeetings.size !== 1 ? 's' : ''}? This action cannot be undone.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={cancelBulkDelete}
                  className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmBulkDelete}
                  className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                >
                  Delete {selectedMeetings.size} Meeting{selectedMeetings.size !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Stakeholder Category Assignment Modal */}
      {showBulkStakeholderActions && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <Edit2 className="text-blue-600" size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-900">Assign Category</h3>
                  <p className="text-sm text-gray-600">
                    Select a category to assign to {selectedStakeholders.size} stakeholder{selectedStakeholders.size !== 1 ? 's' : ''}.
                  </p>
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                <select
                  value={bulkCategoryAssignment}
                  onChange={(e) => setBulkCategoryAssignment(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select a category</option>
                  {stakeholderCategories.map(cat => (
                    <option key={cat.key} value={cat.key}>{cat.label}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowBulkStakeholderActions(false)
                    setBulkCategoryAssignment('')
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkAssignCategory}
                  disabled={!bulkCategoryAssignment}
                  className="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 rounded-lg transition-colors"
                >
                  Assign Category
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Stakeholder Delete Confirmation Modal */}
      {showBulkStakeholderDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md" style={{ margin: 'auto' }}>
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                  <Trash2 className="text-red-600" size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-900">Delete Multiple Stakeholders</h3>
                  <p className="text-sm text-gray-600">
                    Are you sure you want to delete {selectedStakeholders.size} stakeholder{selectedStakeholders.size !== 1 ? 's' : ''}? This action cannot be undone.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowBulkStakeholderDeleteConfirm(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmBulkDeleteStakeholders}
                  className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                >
                  Delete {selectedStakeholders.size} Stakeholder{selectedStakeholders.size !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lost Recording Recovery Modal */}
      {showRecoveryModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[80vh] overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 border-b flex items-center justify-between bg-orange-50">
              <div className="flex items-center gap-3">
                <HardDrive className="text-orange-600" size={24} />
                <div>
                  <h3 className="font-semibold text-gray-900">Lost Recording Recovery</h3>
                  <p className="text-sm text-gray-600">Check for recoverable sessions</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowRecoveryModal(false)
                  setRecoveryResult(null)
                }}
                className="p-2 hover:bg-orange-100 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {/* Status Message */}
              {recoveryResult && (
                <div className={`mb-4 p-3 rounded-lg ${recoveryResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  <div className="flex items-center gap-2">
                    {recoveryResult.success ? (
                      <CheckCircle className="text-green-600" size={18} />
                    ) : (
                      <AlertCircle className="text-red-600" size={18} />
                    )}
                    <p className={`text-sm ${recoveryResult.success ? 'text-green-700' : 'text-red-700'}`}>
                      {recoveryResult.message}
                    </p>
                  </div>
                </div>
              )}

              {/* Loading State */}
              {isCheckingRecovery && (
                <div className="text-center py-8">
                  <RefreshCw className="animate-spin text-orange-600 mx-auto mb-3" size={32} />
                  <p className="text-gray-600">Scanning for lost recordings...</p>
                </div>
              )}

              {/* Lost Sessions List */}
              {!isCheckingRecovery && lostSessions.length > 0 && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600 mb-3">
                    Found {lostSessions.length} recoverable session{lostSessions.length !== 1 ? 's' : ''}:
                  </p>
                  {lostSessions.map((session) => (
                    <div
                      key={session.sessionId}
                      className="border border-gray-200 rounded-lg p-3 bg-gray-50"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="flex items-center gap-2">
                            {session.type === 'transcript' ? (
                              <FileText className="text-blue-600" size={16} />
                            ) : (
                              <HardDrive className="text-orange-600" size={16} />
                            )}
                            <span className="font-medium text-sm">
                              {session.type === 'transcript' ? 'Transcript' : 'Audio'} Session
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            {format(new Date(session.startTime), 'MMM d, yyyy h:mm a')}
                            {' · '}
                            {session.ageMinutes < 60
                              ? `${session.ageMinutes} min ago`
                              : session.ageMinutes < 1440
                              ? `${Math.round(session.ageMinutes / 60)} hours ago`
                              : `${Math.round(session.ageMinutes / 1440)} days ago`}
                          </p>
                        </div>
                      </div>

                      {/* Session Details */}
                      <div className="text-xs text-gray-600 mb-3">
                        {session.type === 'transcript' && (
                          <>
                            <span>{session.wordCount} words</span>
                            {session.preview && (
                              <p className="mt-1 italic truncate">"{session.preview}"</p>
                            )}
                          </>
                        )}
                        {session.type === 'audio' && (
                          <span>
                            {(session.totalBytes / 1024 / 1024).toFixed(2)} MB
                            {' · '}
                            {session.chunkCount} chunks
                          </span>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleRecoverSession(session)}
                          className="flex-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition-colors flex items-center justify-center gap-1"
                        >
                          <Download size={14} />
                          Recover
                        </button>
                        <button
                          onClick={() => handleDeleteLostSession(session)}
                          className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm rounded-lg transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* No Sessions Found */}
              {!isCheckingRecovery && lostSessions.length === 0 && recoveryResult && (
                <div className="text-center py-8">
                  <CheckCircle className="text-green-600 mx-auto mb-3" size={48} />
                  <p className="text-gray-900 font-medium">All Clear!</p>
                  <p className="text-gray-600 text-sm mt-1">No lost recordings found.</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t bg-gray-50">
              <button
                onClick={() => {
                  setShowRecoveryModal(false)
                  setRecoveryResult(null)
                }}
                className="w-full px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sync Result Toast */}
      {syncResult && (
        <div className="fixed bottom-4 right-4 z-50 animate-slide-up">
          <div className={`${syncResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'} border rounded-lg shadow-lg p-4 max-w-md`}>
            <div className="flex items-start gap-3">
              {syncResult.success ? (
                <CheckCircle className="text-green-600 flex-shrink-0" size={20} />
              ) : (
                <AlertTriangle className="text-red-600 flex-shrink-0" size={20} />
              )}
              <div className="flex-1">
                <p className={`text-sm font-medium ${syncResult.success ? 'text-green-900' : 'text-red-900'}`}>
                  {syncResult.success ? 'Sync Complete' : 'Sync Failed'}
                </p>
                <p className={`text-sm mt-1 ${syncResult.success ? 'text-green-700' : 'text-red-700'}`}>
                  {syncResult.message}
                </p>
              </div>
              <button
                onClick={() => setSyncResult(null)}
                className={syncResult.success ? 'text-green-400 hover:text-green-600' : 'text-red-400 hover:text-red-600'}
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}