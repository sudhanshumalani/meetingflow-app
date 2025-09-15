/**
 * Enhanced Notion API Service for MeetingFlow
 * Handles all Notion API interactions including stakeholder sync and meeting export
 * Works with both direct API calls and @notionhq/client when available
 */

class NotionService {
  constructor() {
    this.baseUrl = 'https://api.notion.com/v1'
    // Use CORS proxy for browser environments
    this.corsProxy = 'https://api.allorigins.win/raw?url='
    this.version = '2022-06-28'
    this.apiKey = null
    this.stakeholderDbIds = [] // Support multiple stakeholder databases
    this.categoryDbId = null
    this.meetingDbId = null
    this.client = null // For @notionhq/client when available
  }

  /**
   * Initialize Notion service with API key and database IDs
   */
  initialize(config) {
    this.apiKey = config.apiKey || localStorage.getItem('notionApiKey')

    // Handle multiple stakeholder databases
    if (config.stakeholderDbIds) {
      this.stakeholderDbIds = Array.isArray(config.stakeholderDbIds) ? config.stakeholderDbIds : [config.stakeholderDbIds]
    } else if (config.stakeholderDbId) {
      // Backward compatibility - convert single ID to array
      this.stakeholderDbIds = [config.stakeholderDbId]
    } else {
      // Load from localStorage
      const stored = localStorage.getItem('notionStakeholderDbIds')
      if (stored) {
        try {
          this.stakeholderDbIds = JSON.parse(stored)
        } catch (e) {
          // Fallback to old single database format
          const oldId = localStorage.getItem('notionStakeholderDbId')
          this.stakeholderDbIds = oldId ? [oldId] : []
        }
      } else {
        // Check for old format
        const oldId = localStorage.getItem('notionStakeholderDbId')
        this.stakeholderDbIds = oldId ? [oldId] : []
      }
    }

    this.categoryDbId = config.categoryDbId || localStorage.getItem('notionCategoryDbId')
    this.meetingDbId = config.meetingDbId || localStorage.getItem('notionMeetingDbId')

    // Store in localStorage for persistence
    if (config.apiKey) localStorage.setItem('notionApiKey', config.apiKey)
    if (this.stakeholderDbIds.length > 0) {
      localStorage.setItem('notionStakeholderDbIds', JSON.stringify(this.stakeholderDbIds))
      // Remove old single database storage
      localStorage.removeItem('notionStakeholderDbId')
    }
    if (config.categoryDbId) localStorage.setItem('notionCategoryDbId', config.categoryDbId)
    if (config.meetingDbId) localStorage.setItem('notionMeetingDbId', config.meetingDbId)
  }

  /**
   * Check if Notion is configured and available
   */
  isConfigured() {
    return !!(this.apiKey && (this.stakeholderDbIds.length > 0 || this.categoryDbId || this.meetingDbId))
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
   * Get API URL with CORS proxy if needed
   */
  getApiUrl(endpoint) {
    const url = `${this.baseUrl}${endpoint}`
    // For GitHub Pages, we'll try direct connection first and handle CORS errors
    return url
  }

  /**
   * Check if we're in a CORS-restricted environment
   */
  isGitHubPages() {
    return typeof window !== 'undefined' && window.location.hostname.includes('github.io')
  }

  /**
   * Test Notion API connection
   */
  async testConnection() {
    if (!this.apiKey) {
      throw new Error('Notion API key not configured')
    }

    try {
      const response = await fetch(this.getApiUrl('/users/me'), {
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

      // Check if this is a CORS error in GitHub Pages deployment
      if (this.isGitHubPages() && error.message.includes('CORS')) {
        throw new Error(`CORS Error: Notion API access is blocked from GitHub Pages. Please use the local development server (npm run dev) to test Notion integration. In production, consider using a backend server or CORS proxy.`)
      }

      throw error
    }
  }

  /**
   * Fetch stakeholders from all configured Notion databases
   */
  async fetchStakeholders() {
    if (this.stakeholderDbIds.length === 0) {
      console.warn('No stakeholder database IDs configured')
      return []
    }

    try {
      const allStakeholders = []
      const fetchPromises = this.stakeholderDbIds.map(async (dbId, index) => {
        try {
          console.log(`Fetching stakeholders from database ${index + 1}/${this.stakeholderDbIds.length}: ${dbId}`)

          const response = await fetch(this.getApiUrl(`/databases/${dbId}/query`), {
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
            console.warn(`Failed to fetch from database ${dbId}:`, error.message)
            return { dbId, stakeholders: [], error: error.message }
          }

          const data = await response.json()
          const stakeholders = this.parseStakeholders(data.results, dbId)

          console.log(`Successfully fetched ${stakeholders.length} stakeholders from database ${dbId}`)
          return { dbId, stakeholders, error: null }
        } catch (error) {
          console.warn(`Error fetching from database ${dbId}:`, error.message)
          return { dbId, stakeholders: [], error: error.message }
        }
      })

      const results = await Promise.all(fetchPromises)

      // Combine all stakeholders and track source databases
      results.forEach(result => {
        if (result.stakeholders.length > 0) {
          allStakeholders.push(...result.stakeholders)
        }
      })

      // Report results
      const successCount = results.filter(r => !r.error).length
      const totalDatabases = this.stakeholderDbIds.length
      console.log(`Fetched ${allStakeholders.length} total stakeholders from ${successCount}/${totalDatabases} databases`)

      if (successCount === 0) {
        throw new Error('Failed to fetch stakeholders from any configured databases')
      }

      return allStakeholders
    } catch (error) {
      console.error('Error fetching stakeholders from Notion:', error)
      throw error
    }
  }

  /**
   * Parse Notion pages into stakeholder objects
   */
  parseStakeholders(pages, sourceDbId = null) {
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
        sourceDbId: sourceDbId, // Track which database this came from
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
      const response = await fetch(this.getApiUrl(`/databases/${this.categoryDbId}/query`), {
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

      const response = await fetch(this.getApiUrl('/pages'), {
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
      if (this.stakeholderDbIds.length > 0) {
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
      stakeholderDbIds: this.stakeholderDbIds,
      stakeholderDbCount: this.stakeholderDbIds.length,
      categoryDbId: !!this.categoryDbId,
      meetingDbId: !!this.meetingDbId
    }
  }

  /**
   * Clear all Notion configuration
   */
  clearConfiguration() {
    this.apiKey = null
    this.stakeholderDbIds = []
    this.categoryDbId = null
    this.meetingDbId = null

    localStorage.removeItem('notionApiKey')
    localStorage.removeItem('notionStakeholderDbIds')
    localStorage.removeItem('notionStakeholderDbId') // Remove old format too
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