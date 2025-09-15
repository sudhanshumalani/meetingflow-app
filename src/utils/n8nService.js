/**
 * n8n API Service for MeetingFlow
 * Replaces direct Notion API calls with n8n workflow endpoints
 */

class N8nService {
  constructor() {
    // Detect if we're on HTTPS and adjust n8n URL accordingly
    const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:'

    // For development: try HTTPS first if the page is HTTPS, fallback to HTTP
    this.baseUrls = isHttps ? [
      'https://localhost:5678',  // Try HTTPS first (if n8n supports it)
      'http://localhost:5678'    // Fallback to HTTP (will cause mixed content warning)
    ] : [
      'http://localhost:5678'
    ]

    this.baseUrl = this.baseUrls[0]
    this.endpoints = {
      categories: '/webhook-test/api/categories',
      stakeholders: '/webhook-test/api/stakeholders',
      exportMeeting: '/webhook-test/export-meeting-and-tasks'
    }
  }

  /**
   * Check if n8n service is available
   */
  async isAvailable() {
    // Try each URL until one works
    for (const baseUrl of this.baseUrls) {
      try {
        console.log(`🔍 Testing n8n connection to: ${baseUrl}`)
        const response = await fetch(`${baseUrl}${this.endpoints.categories}`, {
          method: 'GET',
          mode: 'cors'
        })

        if (response.status === 404) {
          // 404 means server is running but webhook not active - that's fine for availability check
          console.log(`✅ n8n server responding at: ${baseUrl} (webhook not active but server reachable)`)
          this.baseUrl = baseUrl
          return true
        } else if (response.ok) {
          console.log(`✅ n8n fully available at: ${baseUrl}`)
          this.baseUrl = baseUrl
          return true
        }
      } catch (error) {
        console.warn(`❌ n8n connection failed for ${baseUrl}:`, error.message)
        if (error.message.includes('Mixed Content')) {
          console.warn('💡 Mixed Content Error: HTTPS page cannot connect to HTTP n8n. Try accessing the app via http://localhost:5173 instead.')
        }
      }
    }

    console.error('❌ All n8n connection attempts failed')
    return false
  }

  /**
   * Fetch categories from n8n workflow
   */
  async fetchCategories() {
    try {
      console.log('🔄 Fetching categories from n8n workflow...')

      const response = await fetch(`${this.baseUrl}${this.endpoints.categories}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`n8n categories API returned ${response.status}: ${response.statusText}`)
      }

      const categories = await response.json()
      console.log(`✅ Fetched ${categories.length} categories from n8n`)

      return categories.map(category => ({
        ...category,
        source: 'n8n',
        lastSynced: new Date().toISOString()
      }))
    } catch (error) {
      console.error('❌ Error fetching categories from n8n:', error)
      throw new Error(`Failed to fetch categories: ${error.message}`)
    }
  }

  /**
   * Fetch stakeholders from n8n workflow
   */
  async fetchStakeholders() {
    try {
      console.log('🔄 Fetching stakeholders from n8n workflow...')

      const response = await fetch(`${this.baseUrl}${this.endpoints.stakeholders}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`n8n stakeholders API returned ${response.status}: ${response.statusText}`)
      }

      const stakeholders = await response.json()
      console.log(`✅ Fetched ${stakeholders.length} stakeholders from n8n`)

      return stakeholders.map(stakeholder => ({
        ...stakeholder,
        source: 'n8n',
        lastSynced: new Date().toISOString()
      }))
    } catch (error) {
      console.error('❌ Error fetching stakeholders from n8n:', error)
      throw new Error(`Failed to fetch stakeholders: ${error.message}`)
    }
  }

  /**
   * Export meeting and tasks via n8n workflow
   */
  async exportMeeting(meeting, analysisResults = null) {
    try {
      console.log('🔄 Exporting meeting via n8n workflow...', {
        title: meeting.title,
        hasAnalysis: !!analysisResults
      })

      // Build the payload for n8n workflow
      const payload = {
        title: meeting.title || `Meeting - ${new Date(meeting.date).toLocaleDateString()}`,
        summary: analysisResults?.summary || meeting.notes?.substring(0, 500) || '',
        keyDiscussionPoints: analysisResults?.keyDiscussionPoints || [],
        actionItems: analysisResults?.actionItems || [],
        sentiment: analysisResults?.sentiment || 'neutral',
        meetingType: meeting.type || 'general',
        stakeholder: meeting.stakeholder || null,
        date: meeting.date || new Date().toISOString().split('T')[0]
      }

      const response = await fetch(`${this.baseUrl}${this.endpoints.exportMeeting}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`n8n export API returned ${response.status}: ${errorText}`)
      }

      const result = await response.json()
      console.log('✅ Meeting exported successfully via n8n')

      return {
        success: true,
        message: result.message || 'Meeting and tasks exported successfully',
        exportedAt: result.timestamp || new Date().toISOString(),
        provider: 'n8n'
      }
    } catch (error) {
      console.error('❌ Error exporting meeting via n8n:', error)
      throw new Error(`Failed to export meeting: ${error.message}`)
    }
  }

  /**
   * Sync all data from n8n workflows
   */
  async syncFromN8n() {
    const results = {
      stakeholders: [],
      categories: [],
      errors: []
    }

    try {
      // Check if n8n is available
      const isAvailable = await this.isAvailable()
      if (!isAvailable) {
        throw new Error('n8n service is not available. Make sure n8n is running and workflows are active.')
      }

      // Fetch categories
      try {
        results.categories = await this.fetchCategories()
      } catch (error) {
        results.errors.push(`Categories: ${error.message}`)
      }

      // Fetch stakeholders
      try {
        results.stakeholders = await this.fetchStakeholders()
      } catch (error) {
        results.errors.push(`Stakeholders: ${error.message}`)
      }

      results.lastSynced = new Date().toISOString()

      // Store sync status
      localStorage.setItem('n8nLastSynced', results.lastSynced)
      if (results.errors.length === 0) {
        localStorage.removeItem('n8nLastError')
      } else {
        localStorage.setItem('n8nLastError', results.errors.join('; '))
      }

      return results
    } catch (error) {
      const errorMsg = `Connection: ${error.message}`
      results.errors.push(errorMsg)
      localStorage.setItem('n8nLastError', errorMsg)
      throw error
    }
  }

  /**
   * Get sync status
   */
  getSyncStatus() {
    const lastSynced = localStorage.getItem('n8nLastSynced')
    const lastError = localStorage.getItem('n8nLastError')

    return {
      available: true, // Assume available since we have n8n workflows
      lastSynced: lastSynced ? new Date(lastSynced) : null,
      lastError: lastError || null,
      baseUrl: this.baseUrl,
      endpoints: this.endpoints
    }
  }

  /**
   * Test connection to n8n service
   */
  async testConnection() {
    try {
      const isAvailable = await this.isAvailable()

      if (!isAvailable) {
        const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:'
        const suggestion = isHttps
          ? 'Try accessing MeetingFlow via http://localhost:5173 instead of https://, or configure n8n to support HTTPS.'
          : 'Make sure n8n is running on localhost:5678 and workflows are active.'

        throw new Error(`n8n service is not responding. ${suggestion}`)
      }

      return {
        success: true,
        message: `Successfully connected to n8n service at ${this.baseUrl}`,
        baseUrl: this.baseUrl
      }
    } catch (error) {
      throw new Error(`n8n connection failed: ${error.message}`)
    }
  }
}

// Create singleton instance
const n8nService = new N8nService()

export default n8nService