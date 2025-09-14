import { Client } from '@notionhq/client'

class NotionService {
  constructor() {
    this.client = null
    this.isConfigured = false
    this.syncStatus = {
      isConnected: false,
      lastSync: null,
      isSyncing: false,
      error: null
    }
    
    this.init()
  }

  init() {
    try {
      const apiToken = import.meta.env.VITE_NOTION_API_TOKEN
      if (!apiToken || apiToken === 'secret_placeholder_token') {
        console.warn('Notion API token not configured. Add VITE_NOTION_API_TOKEN to your .env file.')
        return
      }

      this.client = new Client({
        auth: apiToken
      })
      
      this.isConfigured = true
      this.syncStatus.isConnected = true
      console.log('Notion API service initialized successfully')
    } catch (error) {
      console.error('Failed to initialize Notion service:', error)
      this.syncStatus.error = error.message
    }
  }

  // Check if service is properly configured
  isReady() {
    return this.isConfigured && this.client
  }

  // Get sync status for UI indicators
  getSyncStatus() {
    return { ...this.syncStatus }
  }

  // Test connection to Notion
  async testConnection() {
    if (!this.isReady()) {
      throw new Error('Notion service not configured')
    }

    try {
      await this.client.users.me()
      this.syncStatus.isConnected = true
      this.syncStatus.error = null
      return true
    } catch (error) {
      this.syncStatus.isConnected = false
      this.syncStatus.error = error.message
      throw error
    }
  }

  // Fetch stakeholders from Notion database
  async fetchStakeholders() {
    if (!this.isReady()) {
      console.warn('Notion service not configured, using mock data')
      return { success: false, data: [], error: 'Service not configured' }
    }

    const databaseId = import.meta.env.VITE_NOTION_STAKEHOLDERS_DATABASE_ID
    if (!databaseId || databaseId === 'placeholder_stakeholders_db_id') {
      return { success: false, data: [], error: 'Stakeholders database ID not configured' }
    }

    try {
      this.syncStatus.isSyncing = true
      
      const response = await this.client.databases.query({
        database_id: databaseId,
        sorts: [
          {
            property: 'Name',
            direction: 'ascending'
          }
        ]
      })

      const stakeholders = response.results.map(this.parseStakeholderFromNotion)
      
      this.syncStatus.lastSync = new Date().toISOString()
      this.syncStatus.isSyncing = false
      this.syncStatus.error = null
      
      console.log(`Fetched ${stakeholders.length} stakeholders from Notion`)
      return { success: true, data: stakeholders, error: null }
    } catch (error) {
      this.syncStatus.isSyncing = false
      this.syncStatus.error = error.message
      console.error('Failed to fetch stakeholders from Notion:', error)
      return { success: false, data: [], error: error.message }
    }
  }

  // Parse stakeholder data from Notion page
  parseStakeholderFromNotion(page) {
    const properties = page.properties
    
    return {
      id: page.id,
      notionId: page.id,
      name: this.getTextFromProperty(properties.Name) || 'Unknown',
      email: this.getEmailFromProperty(properties.Email) || '',
      role: this.getTextFromProperty(properties.Role) || '',
      company: this.getTextFromProperty(properties.Company) || '',
      department: this.getTextFromProperty(properties.Department) || '',
      phone: this.getPhoneFromProperty(properties.Phone) || '',
      category: this.getSelectFromProperty(properties.Category) || 'external',
      priority: this.getSelectFromProperty(properties.Priority) || 'medium',
      lastContact: this.getDateFromProperty(properties['Last Contact']),
      tags: this.getMultiSelectFromProperty(properties.Tags) || [],
      notes: this.getTextFromProperty(properties.Notes) || '',
      location: this.getTextFromProperty(properties.Location) || '',
      notionUrl: page.url,
      lastModified: page.last_edited_time,
      createdTime: page.created_time
    }
  }

  // Export meeting notes to Notion
  async exportMeetingToNotion(meetingData) {
    if (!this.isReady()) {
      throw new Error('Notion service not configured')
    }

    const databaseId = import.meta.env.VITE_NOTION_MEETINGS_DATABASE_ID
    if (!databaseId || databaseId === 'placeholder_meetings_db_id') {
      throw new Error('Meetings database ID not configured')
    }

    try {
      this.syncStatus.isSyncing = true

      // Prepare meeting properties for Notion
      const properties = {
        Title: {
          title: [
            {
              text: {
                content: meetingData.title || `Meeting - ${new Date().toLocaleDateString()}`
              }
            }
          ]
        },
        Date: {
          date: {
            start: meetingData.date || new Date().toISOString().split('T')[0]
          }
        },
        Priority: {
          select: {
            name: meetingData.priority || 'medium'
          }
        }
      }

      // Add stakeholder relation if available
      if (meetingData.stakeholderNotionId) {
        properties.Stakeholder = {
          relation: [
            {
              id: meetingData.stakeholderNotionId
            }
          ]
        }
      }

      // Create the meeting page
      const response = await this.client.pages.create({
        parent: {
          database_id: databaseId
        },
        properties,
        children: this.buildMeetingContent(meetingData)
      })

      this.syncStatus.isSyncing = false
      this.syncStatus.lastSync = new Date().toISOString()
      
      console.log('Meeting exported to Notion:', response.id)
      return { success: true, notionId: response.id, url: response.url }
    } catch (error) {
      this.syncStatus.isSyncing = false
      this.syncStatus.error = error.message
      console.error('Failed to export meeting to Notion:', error)
      throw error
    }
  }

  // Build meeting content blocks for Notion page
  buildMeetingContent(meetingData) {
    const blocks = []

    // Add meeting summary
    if (meetingData.summary) {
      blocks.push({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [
            {
              type: 'text',
              text: {
                content: meetingData.summary
              }
            }
          ]
        }
      })
    }

    // Add digital notes if available
    if (meetingData.digitalNotes) {
      Object.entries(meetingData.digitalNotes).forEach(([section, content]) => {
        if (content && content.trim()) {
          // Add section header
          blocks.push({
            object: 'block',
            type: 'heading_3',
            heading_3: {
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content: this.getSectionTitle(section)
                  }
                }
              ]
            }
          })

          // Add section content
          blocks.push({
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content: content
                  }
                }
              ]
            }
          })
        }
      })
    }

    // Add action items
    if (meetingData.actionItems && meetingData.actionItems.length > 0) {
      blocks.push({
        object: 'block',
        type: 'heading_3',
        heading_3: {
          rich_text: [
            {
              type: 'text',
              text: {
                content: 'Action Items'
              }
            }
          ]
        }
      })

      meetingData.actionItems.forEach(item => {
        blocks.push({
          object: 'block',
          type: 'to_do',
          to_do: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: item.text || item.title || item
                }
              }
            ],
            checked: item.completed || false
          }
        })
      })
    }

    return blocks
  }

  // Update stakeholder's last contact date
  async updateStakeholderLastContact(stakeholderNotionId, contactDate = new Date()) {
    if (!this.isReady()) {
      console.warn('Notion service not configured, skipping contact date update')
      return { success: false, error: 'Service not configured' }
    }

    try {
      await this.client.pages.update({
        page_id: stakeholderNotionId,
        properties: {
          'Last Contact': {
            date: {
              start: contactDate.toISOString().split('T')[0]
            }
          }
        }
      })

      console.log('Updated stakeholder last contact date in Notion')
      return { success: true }
    } catch (error) {
      console.error('Failed to update stakeholder last contact:', error)
      return { success: false, error: error.message }
    }
  }

  // Helper methods for parsing Notion properties
  getTextFromProperty(property) {
    if (!property) return ''
    
    switch (property.type) {
      case 'title':
        return property.title?.map(t => t.plain_text).join('') || ''
      case 'rich_text':
        return property.rich_text?.map(t => t.plain_text).join('') || ''
      case 'plain_text':
        return property.plain_text || ''
      default:
        return ''
    }
  }

  getEmailFromProperty(property) {
    if (!property) return ''
    return property.email || this.getTextFromProperty(property)
  }

  getPhoneFromProperty(property) {
    if (!property) return ''
    return property.phone_number || this.getTextFromProperty(property)
  }

  getSelectFromProperty(property) {
    if (!property) return ''
    return property.select?.name || ''
  }

  getMultiSelectFromProperty(property) {
    if (!property) return []
    return property.multi_select?.map(item => item.name) || []
  }

  getDateFromProperty(property) {
    if (!property) return null
    return property.date?.start || null
  }

  getSectionTitle(sectionKey) {
    const titleMap = {
      topLeft: 'Key Discussion Points',
      topRight: 'Decisions Made',
      bottomLeft: 'Challenges & Blockers',
      bottomRight: 'Action Items'
    }
    return titleMap[sectionKey] || sectionKey
  }
}

// Create singleton instance
const notionService = new NotionService()
export default notionService