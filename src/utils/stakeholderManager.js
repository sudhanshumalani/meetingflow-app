import { format, differenceInDays, differenceInWeeks, differenceInMonths, isAfter, isBefore } from 'date-fns'

// Enhanced stakeholder priorities
export const STAKEHOLDER_PRIORITIES = {
  CRITICAL: 'critical',
  HIGH: 'high', 
  MEDIUM: 'medium',
  LOW: 'low',
  ARCHIVED: 'archived'
}

// Relationship health status
export const RELATIONSHIP_HEALTH = {
  EXCELLENT: 'excellent',
  GOOD: 'good',
  NEUTRAL: 'neutral',
  AT_RISK: 'at-risk',
  CRITICAL: 'critical',
  DORMANT: 'dormant'
}

// Stakeholder categories with enhanced metadata
export const STAKEHOLDER_CATEGORIES = {
  LEADERSHIP: {
    key: 'leadership',
    label: 'Leadership',
    description: 'C-Suite, VPs, and key decision makers',
    color: 'purple',
    defaultPriority: STAKEHOLDER_PRIORITIES.HIGH,
    expectedFrequency: 14 // days
  },
  ENGINEERING: {
    key: 'engineering',
    label: 'Engineering',
    description: 'Technical team members and architects',
    color: 'blue',
    defaultPriority: STAKEHOLDER_PRIORITIES.MEDIUM,
    expectedFrequency: 7
  },
  PRODUCT: {
    key: 'product',
    label: 'Product',
    description: 'Product managers and owners',
    color: 'green',
    defaultPriority: STAKEHOLDER_PRIORITIES.HIGH,
    expectedFrequency: 7
  },
  DESIGN: {
    key: 'design',
    label: 'Design',
    description: 'UX/UI designers and researchers',
    color: 'pink',
    defaultPriority: STAKEHOLDER_PRIORITIES.MEDIUM,
    expectedFrequency: 14
  },
  MARKETING: {
    key: 'marketing',
    label: 'Marketing',
    description: 'Marketing and growth team',
    color: 'orange',
    defaultPriority: STAKEHOLDER_PRIORITIES.MEDIUM,
    expectedFrequency: 21
  },
  SALES: {
    key: 'sales',
    label: 'Sales',
    description: 'Sales team and account managers',
    color: 'red',
    defaultPriority: STAKEHOLDER_PRIORITIES.HIGH,
    expectedFrequency: 10
  },
  OPERATIONS: {
    key: 'operations',
    label: 'Operations',
    description: 'Operations and administrative staff',
    color: 'gray',
    defaultPriority: STAKEHOLDER_PRIORITIES.MEDIUM,
    expectedFrequency: 30
  },
  EXTERNAL: {
    key: 'external',
    label: 'External',
    description: 'External partners and vendors',
    color: 'indigo',
    defaultPriority: STAKEHOLDER_PRIORITIES.MEDIUM,
    expectedFrequency: 30
  },
  CUSTOMER: {
    key: 'customer',
    label: 'Customer',
    description: 'Key customers and users',
    color: 'emerald',
    defaultPriority: STAKEHOLDER_PRIORITIES.HIGH,
    expectedFrequency: 21
  }
}

// Interaction types
export const INTERACTION_TYPES = {
  MEETING: 'meeting',
  EMAIL: 'email',
  CALL: 'call',
  SLACK: 'slack',
  INFORMAL: 'informal',
  PRESENTATION: 'presentation',
  WORKSHOP: 'workshop',
  FEEDBACK: 'feedback'
}

export class StakeholderManager {
  constructor() {
    this.stakeholders = new Map()
    this.interactions = new Map()
    this.relationships = new Map()
  }

  // Enhanced stakeholder creation
  createStakeholder(data) {
    const stakeholder = {
      id: data.id || this.generateId(),
      name: data.name,
      email: data.email || '',
      role: data.role || '',
      department: data.department || '',
      category: data.category || STAKEHOLDER_CATEGORIES.EXTERNAL.key,
      priority: data.priority || this.getDefaultPriority(data.category),
      
      // Contact information
      phone: data.phone || '',
      location: data.location || '',
      timezone: data.timezone || 'UTC',
      
      // Relationship data
      relationshipHealth: data.relationshipHealth || RELATIONSHIP_HEALTH.NEUTRAL,
      lastContactDate: data.lastContactDate || null,
      nextPlannedContact: data.nextPlannedContact || null,
      expectedFrequency: data.expectedFrequency || this.getExpectedFrequency(data.category),
      
      // Professional info
      yearsInRole: data.yearsInRole || 0,
      decisionMakingLevel: data.decisionMakingLevel || 'contributor', // contributor, manager, director, executive
      influence: data.influence || 'medium', // low, medium, high
      
      // Preferences and notes
      communicationPreference: data.communicationPreference || 'email', // email, call, slack, in-person
      bestContactTime: data.bestContactTime || 'business-hours',
      notes: data.notes || '',
      tags: data.tags || [],
      
      // Metrics
      totalInteractions: 0,
      totalMeetings: 0,
      averageResponseTime: 0,
      satisfactionScore: data.satisfactionScore || 5,
      
      // Metadata
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isActive: data.isActive !== false,
      
      // Custom fields
      customFields: data.customFields || {}
    }

    this.stakeholders.set(stakeholder.id, stakeholder)
    this.calculateRelationshipHealth(stakeholder.id)
    return stakeholder
  }

  // Get default priority based on category
  getDefaultPriority(category) {
    const categoryInfo = Object.values(STAKEHOLDER_CATEGORIES).find(cat => cat.key === category)
    return categoryInfo?.defaultPriority || STAKEHOLDER_PRIORITIES.MEDIUM
  }

  // Get expected contact frequency based on category
  getExpectedFrequency(category) {
    const categoryInfo = Object.values(STAKEHOLDER_CATEGORIES).find(cat => cat.key === category)
    return categoryInfo?.expectedFrequency || 30
  }

  // Calculate relationship health based on multiple factors
  calculateRelationshipHealth(stakeholderId) {
    const stakeholder = this.stakeholders.get(stakeholderId)
    if (!stakeholder) return RELATIONSHIP_HEALTH.NEUTRAL

    const now = new Date()
    const factors = []

    // Factor 1: Last contact recency
    if (stakeholder.lastContactDate) {
      const daysSinceContact = differenceInDays(now, new Date(stakeholder.lastContactDate))
      const expectedFreq = stakeholder.expectedFrequency

      if (daysSinceContact <= expectedFreq * 0.5) {
        factors.push({ weight: 0.3, score: 5 }) // Excellent
      } else if (daysSinceContact <= expectedFreq) {
        factors.push({ weight: 0.3, score: 4 }) // Good
      } else if (daysSinceContact <= expectedFreq * 1.5) {
        factors.push({ weight: 0.3, score: 3 }) // Neutral
      } else if (daysSinceContact <= expectedFreq * 2) {
        factors.push({ weight: 0.3, score: 2 }) // At risk
      } else if (daysSinceContact <= expectedFreq * 3) {
        factors.push({ weight: 0.3, score: 1 }) // Critical
      } else {
        factors.push({ weight: 0.3, score: 0 }) // Dormant
      }
    } else {
      factors.push({ weight: 0.3, score: 2 }) // No contact data
    }

    // Factor 2: Interaction frequency
    const interactions = this.getStakeholderInteractions(stakeholderId)
    const recentInteractions = interactions.filter(i => 
      differenceInDays(now, new Date(i.date)) <= 30
    ).length

    if (recentInteractions >= 8) factors.push({ weight: 0.2, score: 5 })
    else if (recentInteractions >= 5) factors.push({ weight: 0.2, score: 4 })
    else if (recentInteractions >= 3) factors.push({ weight: 0.2, score: 3 })
    else if (recentInteractions >= 1) factors.push({ weight: 0.2, score: 2 })
    else factors.push({ weight: 0.2, score: 1 })

    // Factor 3: Response and engagement quality
    const responseScore = stakeholder.averageResponseTime > 0 ? 
      Math.max(1, 5 - Math.floor(stakeholder.averageResponseTime / 24)) : 3
    factors.push({ weight: 0.2, score: responseScore })

    // Factor 4: Satisfaction score
    factors.push({ weight: 0.15, score: stakeholder.satisfactionScore })

    // Factor 5: Priority and influence
    const priorityScore = {
      [STAKEHOLDER_PRIORITIES.CRITICAL]: 5,
      [STAKEHOLDER_PRIORITIES.HIGH]: 4,
      [STAKEHOLDER_PRIORITIES.MEDIUM]: 3,
      [STAKEHOLDER_PRIORITIES.LOW]: 2,
      [STAKEHOLDER_PRIORITIES.ARCHIVED]: 1
    }[stakeholder.priority] || 3

    factors.push({ weight: 0.15, score: priorityScore })

    // Calculate weighted average
    const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0)
    const weightedScore = factors.reduce((sum, f) => sum + (f.score * f.weight), 0) / totalWeight

    // Convert to health status
    let health
    if (weightedScore >= 4.5) health = RELATIONSHIP_HEALTH.EXCELLENT
    else if (weightedScore >= 3.5) health = RELATIONSHIP_HEALTH.GOOD
    else if (weightedScore >= 2.5) health = RELATIONSHIP_HEALTH.NEUTRAL
    else if (weightedScore >= 1.5) health = RELATIONSHIP_HEALTH.AT_RISK
    else if (weightedScore >= 0.5) health = RELATIONSHIP_HEALTH.CRITICAL
    else health = RELATIONSHIP_HEALTH.DORMANT

    // Update stakeholder
    stakeholder.relationshipHealth = health
    stakeholder.healthScore = weightedScore
    stakeholder.updatedAt = new Date().toISOString()

    return health
  }

  // Add interaction record
  addInteraction(stakeholderId, interaction) {
    const interactionRecord = {
      id: this.generateId(),
      stakeholderId,
      type: interaction.type || INTERACTION_TYPES.MEETING,
      date: interaction.date || new Date().toISOString(),
      duration: interaction.duration || 0, // minutes
      quality: interaction.quality || 3, // 1-5 scale
      notes: interaction.notes || '',
      sentiment: interaction.sentiment || 'neutral',
      followUpRequired: interaction.followUpRequired || false,
      tags: interaction.tags || [],
      metadata: interaction.metadata || {}
    }

    if (!this.interactions.has(stakeholderId)) {
      this.interactions.set(stakeholderId, [])
    }
    this.interactions.get(stakeholderId).push(interactionRecord)

    // Update stakeholder metrics
    this.updateStakeholderMetrics(stakeholderId)
    this.calculateRelationshipHealth(stakeholderId)

    return interactionRecord
  }

  // Update stakeholder metrics
  updateStakeholderMetrics(stakeholderId) {
    const stakeholder = this.stakeholders.get(stakeholderId)
    const interactions = this.getStakeholderInteractions(stakeholderId)

    if (stakeholder && interactions.length > 0) {
      stakeholder.totalInteractions = interactions.length
      stakeholder.totalMeetings = interactions.filter(i => i.type === INTERACTION_TYPES.MEETING).length
      
      // Update last contact date
      const sortedInteractions = interactions.sort((a, b) => new Date(b.date) - new Date(a.date))
      stakeholder.lastContactDate = sortedInteractions[0].date

      // Calculate average quality
      const avgQuality = interactions.reduce((sum, i) => sum + i.quality, 0) / interactions.length
      stakeholder.satisfactionScore = Math.round(avgQuality * 10) / 10

      stakeholder.updatedAt = new Date().toISOString()
    }
  }

  // Get stakeholder interactions
  getStakeholderInteractions(stakeholderId) {
    return this.interactions.get(stakeholderId) || []
  }

  // Get stakeholders by category
  getStakeholdersByCategory(category) {
    return Array.from(this.stakeholders.values())
      .filter(s => s.category === category && s.isActive)
      .sort((a, b) => this.getStakeholderScore(b) - this.getStakeholderScore(a))
  }

  // Get stakeholder priority score for sorting
  getStakeholderScore(stakeholder) {
    const priorityScores = {
      [STAKEHOLDER_PRIORITIES.CRITICAL]: 100,
      [STAKEHOLDER_PRIORITIES.HIGH]: 80,
      [STAKEHOLDER_PRIORITIES.MEDIUM]: 60,
      [STAKEHOLDER_PRIORITIES.LOW]: 40,
      [STAKEHOLDER_PRIORITIES.ARCHIVED]: 20
    }

    const healthScores = {
      [RELATIONSHIP_HEALTH.CRITICAL]: 20,
      [RELATIONSHIP_HEALTH.AT_RISK]: 15,
      [RELATIONSHIP_HEALTH.DORMANT]: 10,
      [RELATIONSHIP_HEALTH.NEUTRAL]: 5,
      [RELATIONSHIP_HEALTH.GOOD]: 0,
      [RELATIONSHIP_HEALTH.EXCELLENT]: -5
    }

    return priorityScores[stakeholder.priority] + healthScores[stakeholder.relationshipHealth]
  }

  // Get stakeholders needing attention
  getStakeholdersNeedingAttention() {
    const now = new Date()
    return Array.from(this.stakeholders.values())
      .filter(s => s.isActive)
      .filter(s => {
        if (!s.lastContactDate) return true
        
        const daysSinceContact = differenceInDays(now, new Date(s.lastContactDate))
        return daysSinceContact > s.expectedFrequency ||
               s.relationshipHealth === RELATIONSHIP_HEALTH.AT_RISK ||
               s.relationshipHealth === RELATIONSHIP_HEALTH.CRITICAL
      })
      .sort((a, b) => this.getStakeholderScore(b) - this.getStakeholderScore(a))
  }

  // Get relationship timeline
  getRelationshipTimeline(stakeholderId) {
    const interactions = this.getStakeholderInteractions(stakeholderId)
    return interactions
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .map(interaction => ({
        ...interaction,
        formattedDate: format(new Date(interaction.date), 'MMM d, yyyy'),
        relativeDate: this.getRelativeDate(interaction.date)
      }))
  }

  // Get relative date string
  getRelativeDate(date) {
    const now = new Date()
    const targetDate = new Date(date)
    const days = differenceInDays(now, targetDate)

    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days} days ago`
    
    const weeks = differenceInWeeks(now, targetDate)
    if (weeks === 1) return '1 week ago'
    if (weeks < 4) return `${weeks} weeks ago`
    
    const months = differenceInMonths(now, targetDate)
    if (months === 1) return '1 month ago'
    if (months < 12) return `${months} months ago`
    
    return format(targetDate, 'MMM yyyy')
  }

  // Generate unique ID
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2)
  }

  // Get all stakeholders grouped by category
  getStakeholdersGroupedByCategory() {
    const groups = {}
    
    Object.values(STAKEHOLDER_CATEGORIES).forEach(category => {
      groups[category.key] = {
        category: category,
        stakeholders: this.getStakeholdersByCategory(category.key),
        metrics: this.getCategoryMetrics(category.key)
      }
    })

    return groups
  }

  // Get category metrics
  getCategoryMetrics(categoryKey) {
    const stakeholders = this.getStakeholdersByCategory(categoryKey)
    
    return {
      total: stakeholders.length,
      byHealth: stakeholders.reduce((acc, s) => {
        acc[s.relationshipHealth] = (acc[s.relationshipHealth] || 0) + 1
        return acc
      }, {}),
      byPriority: stakeholders.reduce((acc, s) => {
        acc[s.priority] = (acc[s.priority] || 0) + 1
        return acc
      }, {}),
      needingAttention: stakeholders.filter(s => 
        s.relationshipHealth === RELATIONSHIP_HEALTH.AT_RISK ||
        s.relationshipHealth === RELATIONSHIP_HEALTH.CRITICAL
      ).length,
      avgSatisfaction: stakeholders.length > 0 
        ? stakeholders.reduce((sum, s) => sum + s.satisfactionScore, 0) / stakeholders.length
        : 0
    }
  }

  // Search stakeholders
  searchStakeholders(query, filters = {}) {
    const searchTerm = query.toLowerCase()
    let results = Array.from(this.stakeholders.values())
      .filter(s => s.isActive)

    // Text search
    if (searchTerm) {
      results = results.filter(s =>
        s.name.toLowerCase().includes(searchTerm) ||
        s.role.toLowerCase().includes(searchTerm) ||
        s.email.toLowerCase().includes(searchTerm) ||
        s.department.toLowerCase().includes(searchTerm) ||
        s.tags.some(tag => tag.toLowerCase().includes(searchTerm))
      )
    }

    // Apply filters
    if (filters.category) {
      results = results.filter(s => s.category === filters.category)
    }
    
    if (filters.priority) {
      results = results.filter(s => s.priority === filters.priority)
    }
    
    if (filters.health) {
      results = results.filter(s => s.relationshipHealth === filters.health)
    }

    if (filters.needsAttention) {
      const now = new Date()
      results = results.filter(s => {
        if (!s.lastContactDate) return true
        const daysSinceContact = differenceInDays(now, new Date(s.lastContactDate))
        return daysSinceContact > s.expectedFrequency
      })
    }

    return results.sort((a, b) => this.getStakeholderScore(b) - this.getStakeholderScore(a))
  }
}

// Utility functions for UI
export const getHealthColor = (health) => {
  const colors = {
    [RELATIONSHIP_HEALTH.EXCELLENT]: 'bg-green-100 text-green-800 border-green-200',
    [RELATIONSHIP_HEALTH.GOOD]: 'bg-blue-100 text-blue-800 border-blue-200',
    [RELATIONSHIP_HEALTH.NEUTRAL]: 'bg-gray-100 text-gray-800 border-gray-200',
    [RELATIONSHIP_HEALTH.AT_RISK]: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    [RELATIONSHIP_HEALTH.CRITICAL]: 'bg-red-100 text-red-800 border-red-200',
    [RELATIONSHIP_HEALTH.DORMANT]: 'bg-purple-100 text-purple-800 border-purple-200'
  }
  return colors[health] || colors[RELATIONSHIP_HEALTH.NEUTRAL]
}

export const getPriorityColor = (priority) => {
  const colors = {
    [STAKEHOLDER_PRIORITIES.CRITICAL]: 'bg-red-100 text-red-800 border-red-200',
    [STAKEHOLDER_PRIORITIES.HIGH]: 'bg-orange-100 text-orange-800 border-orange-200',
    [STAKEHOLDER_PRIORITIES.MEDIUM]: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    [STAKEHOLDER_PRIORITIES.LOW]: 'bg-green-100 text-green-800 border-green-200',
    [STAKEHOLDER_PRIORITIES.ARCHIVED]: 'bg-gray-100 text-gray-800 border-gray-200'
  }
  return colors[priority] || colors[STAKEHOLDER_PRIORITIES.MEDIUM]
}

export const getCategoryColor = (categoryKey) => {
  const category = Object.values(STAKEHOLDER_CATEGORIES).find(cat => cat.key === categoryKey)
  return category?.color || 'gray'
}

// Create singleton instance
const stakeholderManager = new StakeholderManager()
export default stakeholderManager