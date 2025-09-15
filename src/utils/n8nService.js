/**
 * n8n API Service for MeetingFlow
 * Replaces direct Notion API calls with n8n workflow endpoints
 */

class N8nService {
  constructor() {
    // Detect environment
    const isLocalhost = typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    const isGitHubPages = typeof window !== 'undefined' &&
      window.location.hostname.includes('github.io')

    // Configure base URLs based on environment
    if (isLocalhost) {
      // Local development - use Vite proxy to avoid CORS
      this.baseUrls = [
        '/n8n-proxy'  // Use Vite proxy endpoint
      ]
    } else if (isGitHubPages) {
      // GitHub Pages deployment - need public n8n instance or tunneling
      this.baseUrls = [
        'http://localhost:5678',  // Will fail with CORS, but we'll provide helpful message
        // Add your deployed n8n URL here when available
        // 'https://your-n8n-instance.com'
      ]
    } else {
      // Other deployment
      this.baseUrls = ['http://localhost:5678']
    }

    this.baseUrl = this.baseUrls[0]
    this.endpoints = {
      categories: '/webhook/api/categories',
      stakeholders: '/webhook/api/stakeholders',
      exportMeeting: '/webhook/export-meeting-and-tasks'
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
          // Check if it's the expected n8n webhook 404 response
          try {
            const errorData = await response.json()
            console.log(`📋 Got 404 response data:`, errorData)
            if (errorData.message && errorData.message.includes('webhook') && errorData.message.includes('not registered')) {
              console.log(`✅ n8n server responding at: ${baseUrl} (webhook inactive - this is normal)`)
              this.baseUrl = baseUrl
              return true
            } else {
              console.log(`❌ 404 but not n8n webhook error. Message: "${errorData.message}"`)
            }
          } catch (e) {
            // If we can't parse JSON, treat as generic 404
            console.log(`❌ Generic 404 from ${baseUrl}, JSON parse error:`, e.message)
          }
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
        const errorText = await response.text()
        console.error(`❌ Categories API error: ${response.status} - ${errorText}`)

        if (response.status === 404 && errorText.includes('webhook') && errorText.includes('not registered')) {
          throw new Error(`Categories webhook not active. Please execute the Categories workflow in n8n first, then try again immediately.`)
        }

        throw new Error(`n8n categories API returned ${response.status}: ${response.statusText}`)
      }

      const responseText = await response.text()
      console.log(`📋 Raw response from n8n (length: ${responseText.length}):`, responseText.substring(0, 500) + (responseText.length > 500 ? '...' : ''))

      let categories
      try {
        categories = JSON.parse(responseText)
        console.log(`📋 Parsed JSON successfully. Type: ${typeof categories}, Keys: ${categories && typeof categories === 'object' ? Object.keys(categories) : 'N/A'}`)
      } catch (e) {
        console.error(`❌ Invalid JSON response:`, responseText)
        throw new Error(`n8n returned invalid JSON: ${responseText.substring(0, 100)}`)
      }

      // Handle different response formats
      if (!Array.isArray(categories)) {
        console.log(`📋 Response is not array (type: ${typeof categories}), checking if it contains data...`)
        console.log(`📋 Response object structure:`, JSON.stringify(categories, null, 2))

        // Check if it's wrapped in a success response object
        if (categories && categories.success && categories.categories && Array.isArray(categories.categories)) {
          console.log(`📋 Found categories in success response wrapper - extracting ${categories.categories.length} items`)
          categories = categories.categories
        } else if (categories && categories.data && Array.isArray(categories.data)) {
          console.log(`📋 Found categories in data wrapper - extracting ${categories.data.length} items`)
          categories = categories.data
        } else if (categories && Array.isArray(Object.values(categories)[0])) {
          const firstValue = Object.values(categories)[0]
          console.log(`📋 Found categories in first object value - extracting ${firstValue.length} items`)
          categories = firstValue
        } else {
          console.warn(`❌ Unexpected response format. Available keys:`, Object.keys(categories || {}))
          console.warn(`❌ Full response object:`, categories)
          categories = []
        }
      } else {
        console.log(`📋 Response is already an array with ${categories.length} items`)
      }

      console.log(`📊 Final categories array length: ${categories.length}`)
      if (categories.length > 0) {
        console.log(`📋 Sample category:`, categories[0])
      }

      const processedCategories = categories.map(category => ({
        ...category,
        source: 'n8n',
        lastSynced: new Date().toISOString()
      }))

      console.log(`✅ Returning ${processedCategories.length} processed categories`)
      return processedCategories
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
        const errorText = await response.text()
        console.error(`❌ Stakeholders API error: ${response.status} - ${errorText}`)

        if (response.status === 404 && errorText.includes('webhook') && errorText.includes('not registered')) {
          throw new Error(`Stakeholders webhook not active. Please execute the Stakeholders workflow in n8n first, then try again immediately.`)
        }

        throw new Error(`n8n stakeholders API returned ${response.status}: ${response.statusText}`)
      }

      const responseText = await response.text()
      console.log(`📋 Raw stakeholders response from n8n:`, responseText)

      let stakeholders
      try {
        stakeholders = JSON.parse(responseText)
      } catch (e) {
        console.error(`❌ Invalid JSON response:`, responseText)
        throw new Error(`n8n returned invalid JSON: ${responseText.substring(0, 100)}`)
      }

      // Handle different response formats
      if (!Array.isArray(stakeholders)) {
        console.log(`📋 Stakeholders response is not array, checking if it contains data...`)

        // Check if it's wrapped in a success response object
        if (stakeholders && stakeholders.success && stakeholders.stakeholders && Array.isArray(stakeholders.stakeholders)) {
          console.log(`📋 Found stakeholders in success response wrapper`)
          stakeholders = stakeholders.stakeholders
        } else if (stakeholders && stakeholders.data && Array.isArray(stakeholders.data)) {
          stakeholders = stakeholders.data
        } else if (stakeholders && Array.isArray(Object.values(stakeholders)[0])) {
          stakeholders = Object.values(stakeholders)[0]
        } else {
          console.warn(`❌ Unexpected stakeholders response format:`, stakeholders)
          stakeholders = []
        }
      }

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
        console.log('🔄 Starting categories fetch in syncFromN8n...')
        console.log('📋 About to call this.fetchCategories()')

        results.categories = await this.fetchCategories()

        console.log(`📊 Categories fetch completed. Type: ${typeof results.categories}`)
        console.log(`📊 Is array: ${Array.isArray(results.categories)}`)
        console.log(`📊 Categories count: ${results.categories ? results.categories.length : 'null/undefined'}`)

        if (results.categories && results.categories.length > 0) {
          console.log(`📋 First category structure:`, JSON.stringify(results.categories[0], null, 2))
        } else {
          console.warn(`❌ No categories returned from fetchCategories`)
          console.warn(`❌ Result type: ${typeof results.categories}`)
          console.warn(`❌ Result value:`, results.categories)
        }

      } catch (error) {
        console.error('❌ Categories fetch error in syncFromN8n:', error)
        console.error('❌ Error stack:', error.stack)
        results.errors.push(`Categories: ${error.message}`)
        results.categories = [] // Ensure it's an array
      }

      // Fetch stakeholders
      try {
        console.log('🔄 Starting stakeholders fetch in syncFromN8n...')
        results.stakeholders = await this.fetchStakeholders()
        console.log(`📊 Stakeholders fetch result: ${results.stakeholders.length} items`)
      } catch (error) {
        console.error('❌ Stakeholders fetch error in syncFromN8n:', error)
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

      console.log('📊 Final sync results summary:')
      console.log(`   Categories: ${results.categories.length} items`)
      console.log(`   Stakeholders: ${results.stakeholders.length} items`)
      console.log(`   Errors: ${results.errors.length} items`)
      console.log(`   Last synced: ${results.lastSynced}`)

      if (results.errors.length > 0) {
        console.log(`   Errors details:`, results.errors)
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
    // Handle SSR and initial load scenarios
    if (typeof window === 'undefined' || !localStorage) {
      return {
        available: false,
        lastSynced: null,
        lastError: null,
        baseUrl: this.baseUrl,
        endpoints: this.endpoints
      }
    }

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
      console.log('🔄 Starting n8n connection test...')
      const isAvailable = await this.isAvailable()
      console.log(`📊 isAvailable result: ${isAvailable}`)

      if (!isAvailable) {
        const isGitHubPages = typeof window !== 'undefined' && window.location.hostname.includes('github.io')

        let suggestion = ''
        if (isGitHubPages) {
          suggestion = 'GitHub Pages cannot connect to localhost. Solutions:\n' +
            '1. Use ngrok to tunnel your local n8n: "ngrok http 5678"\n' +
            '2. Deploy n8n to a cloud service (Railway, Heroku, etc.)\n' +
            '3. For testing: access the app locally at https://localhost:5173'
        } else {
          suggestion = 'Make sure n8n is running on localhost:5678 and workflows are active.'
        }

        console.error(`❌ n8n not available. Current baseUrl: ${this.baseUrl}`)
        throw new Error(`n8n service is not responding. ${suggestion}`)
      }

      console.log(`✅ n8n connection successful at: ${this.baseUrl}`)
      return {
        success: true,
        message: `✅ Connected to n8n at ${this.baseUrl}. Webhooks are ready for activation.`,
        baseUrl: this.baseUrl
      }
    } catch (error) {
      console.error('❌ testConnection error:', error)
      throw new Error(`n8n connection failed: ${error.message}`)
    }
  }
}

// Create singleton instance
const n8nService = new N8nService()

export default n8nService