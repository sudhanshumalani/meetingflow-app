import { v4 as uuidv4 } from 'uuid'
import { subDays, addDays, format } from 'date-fns'

// Stakeholder categories
export const STAKEHOLDER_CATEGORIES = {
  EXECUTIVES: 'executives',
  MANAGERS: 'managers',
  PEERS: 'peers',
  REPORTS: 'reports',
  EXTERNAL: 'external',
  VENDORS: 'vendors',
  CLIENTS: 'clients'
}

// Action item priorities
export const ACTION_PRIORITIES = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low'
}

// Meeting statuses
export const MEETING_STATUSES = {
  UPCOMING: 'upcoming',
  IN_PROGRESS: 'in-progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
}

// Mock stakeholders data with enhanced fields
export const mockStakeholders = [
  {
    id: uuidv4(),
    name: 'Sarah Chen',
    role: 'VP Engineering',
    category: STAKEHOLDER_CATEGORIES.EXECUTIVES,
    email: 'sarah.chen@company.com',
    phone: '+1 (555) 123-4567',
    company: 'TechCorp Inc.',
    department: 'Engineering',
    location: 'San Francisco, CA',
    timezone: 'America/Los_Angeles',
    avatar: null,
    priority: 'critical',
    relationshipHealth: 'excellent',
    satisfactionScore: 9,
    influenceLevel: 'high',
    communicationStyle: 'direct',
    preferredContactMethod: 'email',
    expectedFrequency: 7, // days
    lastContactDate: subDays(new Date(), 2).toISOString(),
    nextScheduledContact: addDays(new Date(), 3).toISOString(),
    notes: 'Very supportive of engineering initiatives. Prefers data-driven discussions.',
    tags: ['executive', 'technical', 'decision-maker'],
    interactions: [
      {
        id: uuidv4(),
        type: 'meeting',
        date: subDays(new Date(), 2).toISOString(),
        duration: 60,
        quality: 9,
        summary: 'Productive discussion about Q4 engineering goals'
      },
      {
        id: uuidv4(),
        type: 'email',
        date: subDays(new Date(), 5).toISOString(),
        quality: 8,
        summary: 'Quick response about budget approval'
      }
    ],
    customFields: {
      managementStyle: 'collaborative',
      technicalBackground: 'strong'
    },
    createdAt: subDays(new Date(), 30).toISOString(),
    updatedAt: subDays(new Date(), 2).toISOString()
  },
  {
    id: uuidv4(),
    name: 'Marcus Johnson',
    role: 'Senior Product Manager',
    category: STAKEHOLDER_CATEGORIES.MANAGERS,
    email: 'marcus.johnson@company.com',
    phone: '+1 (555) 234-5678',
    company: 'TechCorp Inc.',
    department: 'Product',
    location: 'Austin, TX',
    timezone: 'America/Chicago',
    avatar: null,
    priority: 'high',
    relationshipHealth: 'good',
    satisfactionScore: 8,
    influenceLevel: 'medium',
    communicationStyle: 'collaborative',
    preferredContactMethod: 'slack',
    expectedFrequency: 3,
    lastContactDate: subDays(new Date(), 1).toISOString(),
    nextScheduledContact: new Date().toISOString(),
    notes: 'Great at translating business requirements. Sometimes needs more technical context.',
    tags: ['product', 'strategy', 'user-focused'],
    interactions: [
      {
        id: uuidv4(),
        type: 'meeting',
        date: subDays(new Date(), 1).toISOString(),
        duration: 45,
        quality: 8,
        summary: 'Aligned on user story priorities'
      }
    ],
    customFields: {
      productArea: 'user-experience',
      stakeholderGroup: 'core-team'
    },
    createdAt: subDays(new Date(), 45).toISOString(),
    updatedAt: subDays(new Date(), 1).toISOString()
  },
  {
    id: uuidv4(),
    name: 'Elena Rodriguez',
    role: 'Lead Designer',
    category: STAKEHOLDER_CATEGORIES.PEERS,
    email: 'elena.rodriguez@company.com',
    phone: '+1 (555) 345-6789',
    company: 'TechCorp Inc.',
    department: 'Design',
    location: 'New York, NY',
    timezone: 'America/New_York',
    avatar: null,
    priority: 'high',
    relationshipHealth: 'excellent',
    satisfactionScore: 9,
    influenceLevel: 'medium',
    communicationStyle: 'visual',
    preferredContactMethod: 'video-call',
    expectedFrequency: 5,
    lastContactDate: subDays(new Date(), 7).toISOString(),
    nextScheduledContact: addDays(new Date(), 1).toISOString(),
    notes: 'Exceptional design eye. Advocates strongly for user experience.',
    tags: ['design', 'user-experience', 'creative'],
    interactions: [
      {
        id: uuidv4(),
        type: 'meeting',
        date: subDays(new Date(), 7).toISOString(),
        duration: 30,
        quality: 9,
        summary: 'Great design review session'
      },
      {
        id: uuidv4(),
        type: 'slack',
        date: subDays(new Date(), 3).toISOString(),
        quality: 7,
        summary: 'Quick feedback on wireframes'
      }
    ],
    customFields: {
      designSpecialty: 'interaction-design',
      toolPreference: 'figma'
    },
    createdAt: subDays(new Date(), 20).toISOString(),
    updatedAt: subDays(new Date(), 3).toISOString()
  },
  {
    id: uuidv4(),
    name: 'David Kim',
    role: 'Frontend Engineer',
    category: STAKEHOLDER_CATEGORIES.REPORTS,
    email: 'david.kim@company.com',
    phone: '+1 (555) 456-7890',
    company: 'TechCorp Inc.',
    department: 'Engineering',
    location: 'Seattle, WA',
    timezone: 'America/Los_Angeles',
    avatar: null,
    priority: 'medium',
    relationshipHealth: 'at-risk',
    satisfactionScore: 6,
    influenceLevel: 'low',
    communicationStyle: 'technical',
    preferredContactMethod: 'email',
    expectedFrequency: 7,
    lastContactDate: subDays(new Date(), 14).toISOString(),
    nextScheduledContact: addDays(new Date(), 2).toISOString(),
    notes: 'Talented engineer but seems overloaded. May need more support.',
    tags: ['frontend', 'react', 'needs-support'],
    interactions: [
      {
        id: uuidv4(),
        type: 'meeting',
        date: subDays(new Date(), 14).toISOString(),
        duration: 30,
        quality: 6,
        summary: 'Seemed stressed about deadlines'
      }
    ],
    customFields: {
      techStack: 'react-typescript',
      experienceLevel: 'senior'
    },
    createdAt: subDays(new Date(), 60).toISOString(),
    updatedAt: subDays(new Date(), 14).toISOString()
  },
  {
    id: uuidv4(),
    name: 'Amanda Foster',
    role: 'Marketing Director',
    category: STAKEHOLDER_CATEGORIES.MANAGERS,
    email: 'amanda.foster@company.com',
    phone: '+1 (555) 567-8901',
    company: 'TechCorp Inc.',
    department: 'Marketing',
    location: 'Los Angeles, CA',
    timezone: 'America/Los_Angeles',
    avatar: null,
    priority: 'medium',
    relationshipHealth: 'good',
    satisfactionScore: 8,
    influenceLevel: 'medium',
    communicationStyle: 'enthusiastic',
    preferredContactMethod: 'phone',
    expectedFrequency: 14,
    lastContactDate: subDays(new Date(), 3).toISOString(),
    nextScheduledContact: addDays(new Date(), 5).toISOString(),
    notes: 'Great at messaging and positioning. Always brings creative ideas.',
    tags: ['marketing', 'creative', 'strategic'],
    interactions: [
      {
        id: uuidv4(),
        type: 'meeting',
        date: subDays(new Date(), 3).toISOString(),
        duration: 45,
        quality: 8,
        summary: 'Productive campaign planning session'
      }
    ],
    customFields: {
      campaignFocus: 'digital-marketing',
      brandAlignment: 'high'
    },
    createdAt: subDays(new Date(), 25).toISOString(),
    updatedAt: subDays(new Date(), 3).toISOString()
  },
  {
    id: uuidv4(),
    name: 'ABC Corporation',
    role: 'Key Client',
    category: STAKEHOLDER_CATEGORIES.CLIENTS,
    email: 'contact@abccorp.com',
    phone: '+1 (555) 678-9012',
    company: 'ABC Corporation',
    department: 'Technology',
    location: 'Chicago, IL',
    timezone: 'America/Chicago',
    avatar: null,
    priority: 'critical',
    relationshipHealth: 'excellent',
    satisfactionScore: 9,
    influenceLevel: 'high',
    communicationStyle: 'formal',
    preferredContactMethod: 'email',
    expectedFrequency: 30,
    lastContactDate: subDays(new Date(), 5).toISOString(),
    nextScheduledContact: addDays(new Date(), 7).toISOString(),
    notes: 'Major client with significant revenue impact. Very satisfied with current service.',
    tags: ['enterprise', 'high-value', 'technology'],
    interactions: [
      {
        id: uuidv4(),
        type: 'meeting',
        date: subDays(new Date(), 5).toISOString(),
        duration: 90,
        quality: 9,
        summary: 'Quarterly business review - very positive feedback'
      },
      {
        id: uuidv4(),
        type: 'email',
        date: subDays(new Date(), 15).toISOString(),
        quality: 8,
        summary: 'Contract renewal discussion'
      }
    ],
    customFields: {
      contractValue: 'high',
      renewalDate: '2024-12-31'
    },
    createdAt: subDays(new Date(), 90).toISOString(),
    updatedAt: subDays(new Date(), 5).toISOString()
  }
]

// Mock meetings data
export const mockMeetings = [
  {
    id: uuidv4(),
    title: 'Sprint Planning Q4',
    description: 'Planning meeting for Q4 sprint goals and deliverables',
    status: MEETING_STATUSES.COMPLETED,
    attendees: ['Sarah Chen', 'Marcus Johnson', 'David Kim'],
    stakeholderIds: [mockStakeholders[0].id, mockStakeholders[1].id, mockStakeholders[3].id],
    scheduledAt: subDays(new Date(), 2).toISOString(),
    duration: 90,
    notes: [
      {
        id: uuidv4(),
        content: 'Discussed feature priorities for Q4',
        timestamp: subDays(new Date(), 2).toISOString(),
        author: 'current-user',
        type: 'text'
      }
    ],
    actionItems: [
      {
        id: uuidv4(),
        title: 'Finalize API specifications',
        assignee: 'David Kim',
        priority: ACTION_PRIORITIES.HIGH,
        dueDate: addDays(new Date(), 3).toISOString(),
        completed: false,
        createdAt: subDays(new Date(), 2).toISOString()
      },
      {
        id: uuidv4(),
        title: 'Create user journey mockups',
        assignee: 'Elena Rodriguez',
        priority: ACTION_PRIORITIES.MEDIUM,
        dueDate: addDays(new Date(), 7).toISOString(),
        completed: true,
        createdAt: subDays(new Date(), 2).toISOString()
      }
    ],
    createdAt: subDays(new Date(), 2).toISOString(),
    updatedAt: subDays(new Date(), 2).toISOString()
  },
  {
    id: uuidv4(),
    title: 'Product Sync',
    description: 'Weekly sync with product team',
    status: MEETING_STATUSES.UPCOMING,
    attendees: ['Marcus Johnson', 'Elena Rodriguez'],
    stakeholderIds: [mockStakeholders[1].id, mockStakeholders[2].id],
    scheduledAt: new Date().toISOString(),
    duration: 60,
    notes: [],
    actionItems: [],
    createdAt: subDays(new Date(), 1).toISOString(),
    updatedAt: subDays(new Date(), 1).toISOString()
  },
  {
    id: uuidv4(),
    title: 'Client Check-in - ABC Corp',
    description: 'Monthly check-in with ABC Corp stakeholders',
    status: MEETING_STATUSES.UPCOMING,
    attendees: ['Client ABC Corp', 'Amanda Foster'],
    stakeholderIds: [mockStakeholders[5].id, mockStakeholders[4].id],
    scheduledAt: addDays(new Date(), 1).toISOString(),
    duration: 45,
    notes: [],
    actionItems: [
      {
        id: uuidv4(),
        title: 'Prepare quarterly business review',
        assignee: 'Amanda Foster',
        priority: ACTION_PRIORITIES.HIGH,
        dueDate: addDays(new Date(), 5).toISOString(),
        completed: false,
        createdAt: subDays(new Date(), 1).toISOString()
      }
    ],
    createdAt: subDays(new Date(), 1).toISOString(),
    updatedAt: subDays(new Date(), 1).toISOString()
  }
]

// AI Insights generator
export const generateAIInsights = (meetings, stakeholders) => {
  const insights = []
  
  // Check for stakeholders needing attention
  const needsAttention = stakeholders.filter(s => s.health === 'needs-attention')
  if (needsAttention.length > 0) {
    insights.push({
      type: 'warning',
      title: 'Stakeholder Health Alert',
      message: `${needsAttention.length} stakeholder${needsAttention.length > 1 ? 's' : ''} need attention`,
      action: 'Schedule check-ins'
    })
  }
  
  // Check for overdue action items
  const overdueItems = meetings.flatMap(m => 
    (m.actionItems || []).filter(item => 
      !item.completed && new Date(item.dueDate) < new Date()
    )
  )
  if (overdueItems.length > 0) {
    insights.push({
      type: 'urgent',
      title: 'Overdue Action Items',
      message: `${overdueItems.length} action item${overdueItems.length > 1 ? 's' : ''} overdue`,
      action: 'Review and reassign'
    })
  }
  
  // Check meeting frequency
  const recentMeetings = meetings.filter(m => 
    new Date(m.createdAt) > subDays(new Date(), 7)
  ).length
  
  if (recentMeetings > 10) {
    insights.push({
      type: 'info',
      title: 'High Meeting Volume',
      message: `${recentMeetings} meetings this week`,
      action: 'Consider consolidating'
    })
  }
  
  return insights
}

// Category display names
export const getCategoryDisplayName = (category) => {
  const names = {
    [STAKEHOLDER_CATEGORIES.EXECUTIVES]: 'Executives & Leadership',
    [STAKEHOLDER_CATEGORIES.MANAGERS]: 'Managers & Directors',
    [STAKEHOLDER_CATEGORIES.PEERS]: 'Peers & Colleagues',
    [STAKEHOLDER_CATEGORIES.REPORTS]: 'Direct Reports',
    [STAKEHOLDER_CATEGORIES.EXTERNAL]: 'External Stakeholders',
    [STAKEHOLDER_CATEGORIES.VENDORS]: 'Vendors & Partners',
    [STAKEHOLDER_CATEGORIES.CLIENTS]: 'Clients & Customers'
  }
  return names[category] || category
}

// Health status colors
export const getHealthColor = (health) => {
  const colors = {
    'excellent': 'text-green-600 bg-green-100',
    'good': 'text-blue-600 bg-blue-100',
    'neutral': 'text-yellow-600 bg-yellow-100',
    'at-risk': 'text-orange-600 bg-orange-100',
    'critical': 'text-red-600 bg-red-100',
    'dormant': 'text-gray-600 bg-gray-100',
    'needs-attention': 'text-red-600 bg-red-100'
  }
  return colors[health] || 'text-gray-600 bg-gray-100'
}