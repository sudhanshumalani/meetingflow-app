import { useState, useEffect } from 'react'
import { 
  Bell, 
  X, 
  AlertTriangle, 
  Clock, 
  CheckCircle, 
  Info,
  Calendar,
  Users,
  Target,
  TrendingUp,
  ExternalLink
} from 'lucide-react'
import { format, isAfter, isBefore, addDays, subDays } from 'date-fns'

export default function NotificationCenter({ 
  meetings = [], 
  stakeholders = [], 
  isOpen, 
  onClose,
  onNavigate 
}) {
  const [notifications, setNotifications] = useState([])
  const [filter, setFilter] = useState('all') // 'all', 'urgent', 'meetings', 'tasks'
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    generateNotifications()
  }, [meetings, stakeholders])

  useEffect(() => {
    const urgentCount = notifications.filter(n => 
      (n.priority === 'high' || n.type === 'overdue') && !n.read
    ).length
    setUnreadCount(urgentCount)
  }, [notifications])

  const generateNotifications = () => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const tomorrow = addDays(today, 1)
    const nextWeek = addDays(today, 7)
    
    const newNotifications = []

    // Meeting-based notifications
    meetings.forEach(meeting => {
      const meetingDate = meeting.scheduledAt ? new Date(meeting.scheduledAt) : null
      
      // Upcoming meetings
      if (meetingDate && isAfter(meetingDate, now) && isBefore(meetingDate, tomorrow)) {
        newNotifications.push({
          id: `meeting-upcoming-${meeting.id}`,
          type: 'meeting',
          priority: 'high',
          title: 'Meeting Today',
          message: `${meeting.title || 'Untitled Meeting'} is scheduled for today`,
          timestamp: new Date(now.getTime() - Math.random() * 3600000).toISOString(),
          read: false,
          actionable: true,
          relatedId: meeting.id,
          relatedType: 'meeting'
        })
      }

      // Overdue meetings without notes
      if (meetingDate && isBefore(meetingDate, now) && 
          (!meeting.digitalNotes || Object.values(meeting.digitalNotes).every(note => !note))) {
        newNotifications.push({
          id: `meeting-overdue-${meeting.id}`,
          type: 'overdue',
          priority: 'high',
          title: 'Missing Meeting Notes',
          message: `${meeting.title || 'Untitled Meeting'} completed but no notes were taken`,
          timestamp: new Date(now.getTime() - Math.random() * 86400000).toISOString(),
          read: false,
          actionable: true,
          relatedId: meeting.id,
          relatedType: 'meeting'
        })
      }

      // Action items overdue
      if (meeting.actionItems) {
        meeting.actionItems.forEach(item => {
          const dueDate = item.dueDate ? new Date(item.dueDate) : null
          if (dueDate && isBefore(dueDate, now) && !item.completed) {
            newNotifications.push({
              id: `action-overdue-${item.id || Math.random()}`,
              type: 'overdue',
              priority: 'high',
              title: 'Overdue Action Item',
              message: `"${item.text}" was due ${format(dueDate, 'MMM d')}`,
              timestamp: new Date(dueDate.getTime() + 86400000).toISOString(),
              read: false,
              actionable: true,
              relatedId: meeting.id,
              relatedType: 'meeting'
            })
          }
        })
      }
    })

    // Stakeholder-based notifications
    stakeholders.forEach(stakeholder => {
      const lastContact = stakeholder.lastMeeting ? new Date(stakeholder.lastMeeting) : null
      
      // Stakeholders needing attention
      if (stakeholder.health === 'needs-attention') {
        newNotifications.push({
          id: `stakeholder-attention-${stakeholder.id}`,
          type: 'stakeholder',
          priority: 'medium',
          title: 'Stakeholder Needs Attention',
          message: `${stakeholder.name} relationship status requires attention`,
          timestamp: new Date(now.getTime() - Math.random() * 86400000).toISOString(),
          read: false,
          actionable: true,
          relatedId: stakeholder.id,
          relatedType: 'stakeholder'
        })
      }

      // Long time since last contact
      if (lastContact && isBefore(lastContact, subDays(now, 14))) {
        newNotifications.push({
          id: `stakeholder-contact-${stakeholder.id}`,
          type: 'reminder',
          priority: 'medium',
          title: 'Follow-up Reminder',
          message: `Last contact with ${stakeholder.name} was ${format(lastContact, 'MMM d')}`,
          timestamp: new Date(now.getTime() - Math.random() * 172800000).toISOString(),
          read: false,
          actionable: true,
          relatedId: stakeholder.id,
          relatedType: 'stakeholder'
        })
      }
    })

    // System notifications
    const weeklyStats = {
      meetingsThisWeek: meetings.filter(m => 
        m.scheduledAt && 
        new Date(m.scheduledAt) >= subDays(now, 7) && 
        new Date(m.scheduledAt) <= now
      ).length,
      completedActionItems: meetings.flatMap(m => m.actionItems || [])
        .filter(item => item.completed).length
    }

    if (weeklyStats.meetingsThisWeek > 5) {
      newNotifications.push({
        id: 'system-busy-week',
        type: 'insight',
        priority: 'low',
        title: 'Busy Week Detected',
        message: `You had ${weeklyStats.meetingsThisWeek} meetings this week. Consider blocking focus time.`,
        timestamp: new Date(now.getTime() - 3600000).toISOString(),
        read: false,
        actionable: false
      })
    }

    if (weeklyStats.completedActionItems >= 10) {
      newNotifications.push({
        id: 'system-productive-week',
        type: 'success',
        priority: 'low',
        title: 'Productive Week! 🎉',
        message: `You completed ${weeklyStats.completedActionItems} action items this week.`,
        timestamp: new Date(now.getTime() - 7200000).toISOString(),
        read: false,
        actionable: false
      })
    }

    // Sort by priority and timestamp
    const sortedNotifications = newNotifications.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 }
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[b.priority] - priorityOrder[a.priority]
      }
      return new Date(b.timestamp) - new Date(a.timestamp)
    })

    setNotifications(sortedNotifications)
  }

  const filteredNotifications = notifications.filter(notification => {
    if (filter === 'all') return true
    if (filter === 'urgent') return notification.priority === 'high' || notification.type === 'overdue'
    if (filter === 'meetings') return notification.type === 'meeting' || notification.relatedType === 'meeting'
    if (filter === 'tasks') return notification.type === 'overdue' && notification.message.includes('Action Item')
    return true
  })

  const markAsRead = (notificationId) => {
    setNotifications(prev => 
      prev.map(n => 
        n.id === notificationId ? { ...n, read: true } : n
      )
    )
  }

  const markAllAsRead = () => {
    setNotifications(prev => 
      prev.map(n => ({ ...n, read: true }))
    )
  }

  const handleNotificationClick = (notification) => {
    markAsRead(notification.id)
    
    if (notification.actionable && notification.relatedType && notification.relatedId) {
      if (notification.relatedType === 'meeting') {
        onNavigate(`/meeting/${notification.relatedId}`)
      } else if (notification.relatedType === 'stakeholder') {
        onNavigate(`/?stakeholder=${notification.relatedId}`)
      }
      onClose()
    }
  }

  const getNotificationIcon = (type, priority) => {
    if (type === 'overdue') return <AlertTriangle className="text-red-500" size={18} />
    if (type === 'meeting') return <Calendar className="text-blue-500" size={18} />
    if (type === 'stakeholder') return <Users className="text-purple-500" size={18} />
    if (type === 'reminder') return <Clock className="text-orange-500" size={18} />
    if (type === 'success') return <CheckCircle className="text-green-500" size={18} />
    if (type === 'insight') return <TrendingUp className="text-indigo-500" size={18} />
    return <Info className="text-gray-500" size={18} />
  }

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return 'border-l-red-500 bg-red-50'
      case 'medium': return 'border-l-yellow-500 bg-yellow-50'
      case 'low': return 'border-l-blue-500 bg-blue-50'
      default: return 'border-l-gray-500 bg-gray-50'
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-start justify-end pt-4 sm:pt-16 pr-2 sm:pr-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-sm sm:max-w-md max-h-[90vh] sm:max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-3 sm:p-4 border-b border-gray-200">
          <div className="flex items-center gap-2 sm:gap-3">
            <Bell size={18} className="sm:w-5 sm:h-5 text-gray-700" />
            <h2 className="text-base sm:text-lg font-semibold">Notifications</h2>
            {unreadCount > 0 && (
              <span className="bg-red-500 text-white text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full">
                {unreadCount}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <X size={16} className="sm:w-[18px] sm:h-[18px] text-gray-500" />
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="flex border-b border-gray-200 overflow-x-auto">
          {[
            { key: 'all', label: 'All' },
            { key: 'urgent', label: 'Urgent' },
            { key: 'meetings', label: 'Meetings' },
            { key: 'tasks', label: 'Tasks' }
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`flex-1 px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                filter === tab.key
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Actions Bar */}
        <div className="p-2 sm:p-3 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm text-gray-600">
              {filteredNotifications.length} notification{filteredNotifications.length !== 1 ? 's' : ''}
            </span>
            {notifications.some(n => !n.read) && (
              <button
                onClick={markAllAsRead}
                className="text-xs sm:text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                Mark all read
              </button>
            )}
          </div>
        </div>

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto">
          {filteredNotifications.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Bell size={48} className="mx-auto mb-4 text-gray-300" />
              <p>No notifications</p>
              <p className="text-sm mt-2">You're all caught up!</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {filteredNotifications.map((notification) => (
                <div
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`p-3 sm:p-4 border-l-4 transition-colors cursor-pointer hover:bg-gray-50 ${
                    getPriorityColor(notification.priority)
                  } ${notification.read ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-start gap-2 sm:gap-3">
                    <div className="w-[18px] h-[18px] flex items-center justify-center">
                      {getNotificationIcon(notification.type, notification.priority)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between">
                        <h3 className={`text-xs sm:text-sm font-medium ${
                          notification.read ? 'text-gray-600' : 'text-gray-900'
                        }`}>
                          {notification.title}
                        </h3>
                        {notification.actionable && (
                          <ExternalLink size={12} className="sm:w-[14px] sm:h-[14px] text-gray-400 ml-1 sm:ml-2 flex-shrink-0" />
                        )}
                      </div>
                      <p className={`text-xs sm:text-sm mt-1 ${
                        notification.read ? 'text-gray-500' : 'text-gray-700'
                      }`}>
                        {notification.message}
                      </p>
                      <div className="flex items-center justify-between mt-1 sm:mt-2">
                        <span className="text-xs text-gray-500 truncate">
                          {format(new Date(notification.timestamp), 'MMM d, h:mm a')}
                        </span>
                        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                          {!notification.read && (
                            <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-blue-600 rounded-full"></div>
                          )}
                          <span className={`text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full whitespace-nowrap ${
                            notification.priority === 'high' 
                              ? 'bg-red-100 text-red-800'
                              : notification.priority === 'medium'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {notification.priority}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-gray-200 bg-gray-50">
          <div className="text-xs text-gray-500 text-center">
            Notifications are generated based on meeting activity and stakeholder health
          </div>
        </div>
      </div>
    </div>
  )
}