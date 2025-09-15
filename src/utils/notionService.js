/**
 * Enhanced Notion API Service for MeetingFlow
 * Handles all Notion API interactions including stakeholder sync and meeting export
 * Works with both direct API calls and @notionhq/client when available
 */

class NotionService {
  constructor() {
    this.baseUrl = 'https://api.notion.com/v1'
    this.version = '2022-06-28'
    this.apiKey = null
    this.stakeholderDbId = null
    this.categoryDbId = null
    this.meetingDbId = null
    this.client = null // For @notionhq/client when available
  }

  /**
   * Initialize Notion service with API key and database IDs
   */
  initialize(config) {
    this.apiKey = config.apiKey || localStorage.getItem('notionApiKey')
    this.stakeholderDbId = config.stakeholderDbId || localStorage.getItem('notionStakeholderDbId')
    this.categoryDbId = config.categoryDbId || localStorage.getItem('notionCategoryDbId')
    this.meetingDbId = config.meetingDbId || localStorage.getItem('notionMeetingDbId')

    // Store in localStorage for persistence
    if (config.apiKey) localStorage.setItem('notionApiKey', config.apiKey)
    if (config.stakeholderDbId) localStorage.setItem('notionStakeholderDbId', config.stakeholderDbId)
    if (config.categoryDbId) localStorage.setItem('notionCategoryDbId', config.categoryDbId)
    if (config.meetingDbId) localStorage.setItem('notionMeetingDbId', config.meetingDbId)
  }

  /**
   * Check if Notion is configured and available
   */
  isConfigured() {
    return !!(this.apiKey && (this.stakeholderDbId || this.categoryDbId || this.meetingDbId))
  }

  /**
   * Get headers for Notion API requests
   */
  getHeaders() {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'Notion-Version': this.version
    }
  }

  /**
   * Test Notion API connection
   */
  async testConnection() {
    if (!this.apiKey) {
      throw new Error('Notion API key not configured')
    }

    try {
      const response = await fetch(`${this.baseUrl}/users/me`, {
        headers: this.getHeaders()
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(`Notion API Error: ${error.message || response.statusText}`)
      }

      const user = await response.json()
      return {
        success: true,
        user: {
          name: user.name,
          email: user.person?.email || 'Unknown',
          id: user.id
        }
      }
    } catch (error) {
      console.error('Notion connection test failed:', error)
      throw error
    }
  }

  /**
   * Fetch stakeholders from Notion database
   */
  async fetchStakeholders() {
    if (!this.stakeholderDbId) {
      console.warn('Stakeholder database ID not configured')
      return []
    }

    try {
      const response = await fetch(`${this.baseUrl}/databases/${this.stakeholderDbId}/query`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          page_size: 100,
          filter: {
            property: 'Status',
            select: {
              does_not_equal: 'Archived'
            }
          }
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(`Failed to fetch stakeholders: ${error.message}`)
      }

      const data = await response.json()
      return this.parseStakeholders(data.results)
    } catch (error) {
      console.error('Error fetching stakeholders from Notion:', error)
      throw error
    }
  }

  /**
   * Parse Notion pages into stakeholder objects
   */
  parseStakeholders(pages) {
    return pages.map(page => {
      const properties = page.properties

      return {
        id: `notion-${page.id}`,
        notionId: page.id,
        name: this.extractText(properties.Name) || 'Unnamed Stakeholder',
        category: this.extractSelect(properties.Category) || 'general',
        email: this.extractEmail(properties.Email),
        organization: this.extractText(properties.Organization),
        priority: this.extractSelect(properties.Priority) || 'medium',
        notes: this.extractText(properties.Notes),
        source: 'notion',
        lastSynced: new Date().toISOString(),
        createdAt: page.created_time,
        updatedAt: page.last_edited_time
      }
    })
  }

  /**
   * Fetch categories from Notion database
   */
  async fetchCategories() {
    if (!this.categoryDbId) {
      console.warn('Category database ID not configured')
      return []
    }

    try {
      const response = await fetch(`${this.baseUrl}/databases/${this.categoryDbId}/query`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          page_size: 100
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(`Failed to fetch categories: ${error.message}`)
      }

      const data = await response.json()
      return this.parseCategories(data.results)
    } catch (error) {
      console.error('Error fetching categories from Notion:', error)
      throw error
    }
  }

  /**
   * Parse Notion pages into category objects
   */
  parseCategories(pages) {
    return pages.map(page => {
      const properties = page.properties

      return {
        key: this.extractText(properties.Key) || this.generateKey(this.extractText(properties.Name)),
        label: this.extractText(properties.Name) || 'Unnamed Category',
        description: this.extractText(properties.Description),
        color: this.extractSelect(properties.Color) || 'blue',
        source: 'notion',
        lastSynced: new Date().toISOString(),
        createdAt: page.created_time,
        updatedAt: page.last_edited_time
      }
    })
  }

  /**
   * Export meeting to Notion
   */
  async exportMeeting(meeting, analysisResults = null) {
    if (!this.meetingDbId) {
      throw new Error('Meeting database ID not configured')
    }

    try {
      const pageProperties = this.buildMeetingProperties(meeting, analysisResults)

      const response = await fetch(`${this.baseUrl}/pages`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          parent: {
            database_id: this.meetingDbId
          },
          properties: pageProperties,
          children: this.buildMeetingContent(meeting, analysisResults)
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(`Failed to export meeting: ${error.message}`)
      }

      const result = await response.json()
      return {
        success: true,
        notionPageId: result.id,
        url: result.url,
        exportedAt: new Date().toISOString()
      }
    } catch (error) {
      console.error('Error exporting meeting to Notion:', error)
      throw error
    }
  }

  /**
   * Build Notion page properties for meeting
   */
  buildMeetingProperties(meeting, analysisResults) {
    const properties = {
      'Title': {
        title: [
          {
            text: {
              content: meeting.title || `Meeting - ${new Date(meeting.date).toLocaleDateString()}`
            }
          }
        ]
      },
      'Date': {
        date: {
          start: meeting.date
        }
      },
      'Type': {
        select: {
          name: meeting.type || 'General'
        }
      }
    }

    // Add stakeholder if available
    if (meeting.stakeholder) {
      properties['Stakeholder'] = {
        rich_text: [
          {
            text: {
              content: meeting.stakeholder
            }
          }
        ]
      }
    }

    // Add sentiment if analysis is available
    if (analysisResults?.sentiment) {
      properties['Sentiment'] = {
        select: {
          name: analysisResults.sentiment.charAt(0).toUpperCase() + analysisResults.sentiment.slice(1)
        }
      }
    }

    // Add confidence score if available
    if (analysisResults?.confidence) {
      properties['AI Confidence'] = {
        number: Math.round(analysisResults.confidence * 100)
      }
    }

    return properties
  }

  /**
   * Build Notion page content blocks for meeting
   */
  buildMeetingContent(meeting, analysisResults) {
    const blocks = []

    // Add summary if available
    if (analysisResults?.summary) {
      blocks.push({
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: [{ text: { content: 'Summary' } }]
        }
      })
      blocks.push({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ text: { content: analysisResults.summary } }]
        }
      })
    }

    // Add key discussion points
    if (analysisResults?.keyDiscussionPoints?.length > 0) {
      blocks.push({
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: [{ text: { content: 'Key Discussion Points' } }]
        }
      })

      analysisResults.keyDiscussionPoints.forEach(point => {
        blocks.push({
          object: 'block',
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [{ text: { content: point } }]
          }
        })
      })
    }

    // Add action items
    if (analysisResults?.actionItems?.length > 0) {
      blocks.push({
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: [{ text: { content: 'Action Items' } }]
        }
      })

      analysisResults.actionItems.forEach(item => {
        const itemText = typeof item === 'string' ? item :
          `${item.task}${item.assignee ? ` (${item.assignee})` : ''}${item.dueDate ? ` - Due: ${item.dueDate}` : ''}`

        blocks.push({
          object: 'block',
          type: 'to_do',
          to_do: {
            rich_text: [{ text: { content: itemText } }],
            checked: false
          }
        })
      })
    }

    // Add raw notes
    if (meeting.notes) {
      blocks.push({
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: [{ text: { content: 'Raw Notes' } }]
        }
      })

      // Split notes into paragraphs
      const paragraphs = meeting.notes.split('\n\n').filter(p => p.trim())
      paragraphs.forEach(paragraph => {
        blocks.push({
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ text: { content: paragraph.trim() } }]
          }
        })
      })
    }

    // Add metadata
    blocks.push({
      object: 'block',
      type: 'divider',
      divider: {}
    })
    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [
          {
            text: {
              content: `Exported from MeetingFlow on ${new Date().toLocaleString()}`,
              annotations: { italic: true, color: 'gray' }
            }
          }
        ]
      }
    })

    return blocks
  }

  /**
   * Sync all data from Notion
   */
  async syncFromNotion() {
    const results = {
      stakeholders: [],
      categories: [],
      errors: []
    }

    try {
      // Test connection first
      await this.testConnection()

      // Fetch stakeholders
      if (this.stakeholderDbId) {
        try {
          results.stakeholders = await this.fetchStakeholders()
        } catch (error) {
          results.errors.push(`Stakeholders: ${error.message}`)
        }
      }

      // Fetch categories
      if (this.categoryDbId) {
        try {
          results.categories = await this.fetchCategories()
        } catch (error) {
          results.errors.push(`Categories: ${error.message}`)
        }
      }

      results.lastSynced = new Date().toISOString()
      return results
    } catch (error) {
      results.errors.push(`Connection: ${error.message}`)
      throw error
    }
  }

  /**
   * Helper methods for parsing Notion properties
   */
  extractText(property) {
    if (!property) return null

    if (property.type === 'title' && property.title?.length > 0) {
      return property.title[0].text.content
    }
    if (property.type === 'rich_text' && property.rich_text?.length > 0) {
      return property.rich_text.map(t => t.text.content).join('')
    }
    return null
  }

  extractSelect(property) {
    if (!property || property.type !== 'select') return null
    return property.select?.name || null
  }

  extractEmail(property) {
    if (!property || property.type !== 'email') return null
    return property.email || null
  }

  generateKey(name) {
    if (!name) return 'general'
    return name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  }

  /**
   * Get sync status
   */
  getSyncStatus() {
    const lastSynced = localStorage.getItem('notionLastSynced')
    const lastError = localStorage.getItem('notionLastError')

    return {
      configured: this.isConfigured(),
      lastSynced: lastSynced ? new Date(lastSynced) : null,
      lastError: lastError || null,
      stakeholderDbId: !!this.stakeholderDbId,
      categoryDbId: !!this.categoryDbId,
      meetingDbId: !!this.meetingDbId
    }
  }

  /**
   * Clear all Notion configuration
   */
  clearConfiguration() {
    this.apiKey = null
    this.stakeholderDbId = null
    this.categoryDbId = null
    this.meetingDbId = null

    localStorage.removeItem('notionApiKey')
    localStorage.removeItem('notionStakeholderDbId')
    localStorage.removeItem('notionCategoryDbId')
    localStorage.removeItem('notionMeetingDbId')
    localStorage.removeItem('notionLastSynced')
    localStorage.removeItem('notionLastError')
  }
}

// Create singleton instance
const notionService = new NotionService()

// Initialize from localStorage on import
notionService.initialize({})

export default notionService