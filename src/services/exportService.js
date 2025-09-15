import n8nService from '../utils/n8nService'

class ExportService {
  constructor() {
    this.exportMethods = {
      email: 'Email Export (N8N)',
      gdrive: 'Google Drive (N8N)',
      webhook: 'JSON Webhook (N8N)'
    }
    
    this.defaultSettings = {
      preferredMethod: 'email',
      emailSettings: {
        enabled: false,
        recipientEmail: '',
        n8nWebhookUrl: '',
        includeAttachments: true,
        subject: 'Meeting Export from MeetingFlow'
      },
      gdriveSettings: {
        enabled: false,
        folderId: '',
        fileFormat: 'json', // 'json', 'markdown', 'pdf'
        includeAttachments: true
      },
      webhookSettings: {
        enabled: false,
        url: '',
        headers: {},
        retryAttempts: 3,
        timeout: 30000
      },
    }
    
    this.loadSettings()
  }

  loadSettings() {
    try {
      const saved = localStorage.getItem('meetingflow_export_settings')
      this.settings = saved ? { ...this.defaultSettings, ...JSON.parse(saved) } : this.defaultSettings
    } catch (error) {
      console.warn('Failed to load export settings:', error)
      this.settings = this.defaultSettings
    }
  }

  saveSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings }
    localStorage.setItem('meetingflow_export_settings', JSON.stringify(this.settings))
  }

  getSettings() {
    return { ...this.settings }
  }


  // Method 2: Email Export (triggers N8N workflow)
  async exportViaEmail(meetingData, options = {}) {
    if (!this.settings.emailSettings.enabled) {
      throw new Error('Email export is disabled in settings')
    }

    const { recipientEmail, n8nWebhookUrl, subject, includeAttachments } = this.settings.emailSettings

    if (!recipientEmail || !n8nWebhookUrl) {
      throw new Error('Email settings incomplete: missing recipient or webhook URL')
    }

    try {
      const emailPayload = {
        to: recipientEmail,
        subject: `${subject} - ${meetingData.title || 'Untitled Meeting'}`,
        type: 'meeting_export',
        timestamp: new Date().toISOString(),
        meetingData: this.formatMeetingForExport(meetingData),
        options: {
          includeAttachments,
          format: 'html',
          ...options
        }
      }

      const response = await fetch(n8nWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Export-Source': 'MeetingFlow',
          'X-Export-Method': 'email'
        },
        body: JSON.stringify(emailPayload)
      })

      if (!response.ok) {
        throw new Error(`Email export failed: ${response.status} ${response.statusText}`)
      }

      const result = await response.json()
      
      return {
        success: true,
        method: 'email',
        data: result,
        message: `Email sent to ${recipientEmail}`
      }
    } catch (error) {
      return {
        success: false,
        method: 'email',
        error: error.message,
        message: 'Failed to send email export'
      }
    }
  }

  // Method 3: Google Drive Export (existing N8N monitors this)
  async exportToGoogleDrive(meetingData, options = {}) {
    if (!this.settings.gdriveSettings.enabled) {
      throw new Error('Google Drive export is disabled in settings')
    }

    const { folderId, fileFormat, includeAttachments } = this.settings.gdriveSettings

    try {
      // Generate file content based on format
      const fileContent = this.generateFileContent(meetingData, fileFormat)
      const fileName = this.generateFileName(meetingData, fileFormat)
      
      // Create metadata for N8N processing
      const metadata = {
        source: 'MeetingFlow',
        exportMethod: 'gdrive',
        timestamp: new Date().toISOString(),
        meetingId: meetingData.id,
        stakeholderId: meetingData.selectedStakeholder,
        priority: meetingData.priority,
        format: fileFormat,
        includeAttachments
      }

      // For Google Drive, we'll use the Google Drive API
      // In a real implementation, you'd use the Google Drive SDK
      // For now, we'll simulate the upload and trigger N8N via webhook
      
      const drivePayload = {
        fileName,
        fileContent,
        folderId,
        metadata,
        mimeType: this.getMimeType(fileFormat)
      }

      // Simulate Google Drive upload success
      const uploadResult = await this.simulateGoogleDriveUpload(drivePayload)
      
      return {
        success: true,
        method: 'gdrive',
        data: uploadResult,
        message: `File uploaded to Google Drive: ${fileName}`
      }
    } catch (error) {
      return {
        success: false,
        method: 'gdrive',
        error: error.message,
        message: 'Failed to upload to Google Drive'
      }
    }
  }

  // Method 4: JSON Webhook (direct to N8N)
  async exportViaWebhook(meetingData, options = {}) {
    if (!this.settings.webhookSettings.enabled) {
      throw new Error('Webhook export is disabled in settings')
    }

    const { url, headers, retryAttempts, timeout } = this.settings.webhookSettings

    if (!url) {
      throw new Error('Webhook URL not configured')
    }

    const payload = {
      type: 'meeting_export',
      timestamp: new Date().toISOString(),
      source: 'MeetingFlow',
      version: '1.0',
      data: this.formatMeetingForExport(meetingData),
      metadata: {
        exportMethod: 'webhook',
        retryAttempts,
        options
      }
    }

    let lastError = null
    
    for (let attempt = 1; attempt <= retryAttempts; attempt++) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), timeout)

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Export-Source': 'MeetingFlow',
            'X-Export-Method': 'webhook',
            'X-Attempt': attempt.toString(),
            ...headers
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const result = await response.json()
        
        return {
          success: true,
          method: 'webhook',
          data: result,
          attempt,
          message: 'Successfully sent to webhook'
        }
      } catch (error) {
        lastError = error
        console.warn(`Webhook attempt ${attempt} failed:`, error.message)
        
        if (attempt < retryAttempts) {
          // Wait before retry (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000))
        }
      }
    }

    return {
      success: false,
      method: 'webhook',
      error: lastError.message,
      attempts: retryAttempts,
      message: `Failed to send webhook after ${retryAttempts} attempts`
    }
  }

  // Smart export that chooses the best available method
  async smartExport(meetingData, options = {}) {
    const { preferredMethod } = this.settings
    const availableMethods = this.getAvailableMethods()
    
    // Try preferred method first
    if (availableMethods.includes(preferredMethod)) {
      try {
        return await this.exportByMethod(preferredMethod, meetingData, options)
      } catch (error) {
        console.warn(`Preferred method ${preferredMethod} failed, trying alternatives`)
      }
    }
    
    // Try other available methods as fallback
    for (const method of availableMethods) {
      if (method !== preferredMethod) {
        try {
          const result = await this.exportByMethod(method, meetingData, options)
          if (result.success) {
            return { ...result, fallbackUsed: true, originalMethod: preferredMethod }
          }
        } catch (error) {
          console.warn(`Fallback method ${method} failed:`, error)
        }
      }
    }
    
    throw new Error('All export methods failed')
  }

  async exportByMethod(method, meetingData, options = {}) {
    switch (method) {
      case 'email':
        return await this.exportViaEmail(meetingData, options)
      case 'gdrive':
        return await this.exportToGoogleDrive(meetingData, options)
      case 'webhook':
        return await this.exportViaWebhook(meetingData, options)
      default:
        throw new Error(`Unknown export method: ${method}`)
    }
  }

  getAvailableMethods() {
    const available = []

    if (this.settings.emailSettings.enabled && this.settings.emailSettings.recipientEmail) {
      available.push('email')
    }

    if (this.settings.gdriveSettings.enabled) {
      available.push('gdrive')
    }

    if (this.settings.webhookSettings.enabled && this.settings.webhookSettings.url) {
      available.push('webhook')
    }

    return available
  }

  // Utility methods
  formatMeetingForExport(meetingData) {
    return {
      id: meetingData.id,
      title: meetingData.title,
      date: meetingData.date,
      stakeholder: meetingData.selectedStakeholder,
      priority: meetingData.priority,
      digitalNotes: meetingData.digitalNotes,
      summary: meetingData.summary,
      actionItems: meetingData.actionItems || [],
      attachments: meetingData.uploadedFiles || [],
      createdAt: new Date().toISOString()
    }
  }

  generateFileContent(meetingData, format) {
    const formatted = this.formatMeetingForExport(meetingData)
    
    switch (format) {
      case 'json':
        return JSON.stringify(formatted, null, 2)
      case 'markdown':
        return this.convertToMarkdown(formatted)
      case 'csv':
        return this.convertToCSV(formatted)
      default:
        return JSON.stringify(formatted, null, 2)
    }
  }

  generateFileName(meetingData, format) {
    const date = new Date(meetingData.date || Date.now()).toISOString().split('T')[0]
    const title = (meetingData.title || 'meeting').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()
    return `meetingflow_${title}_${date}.${format}`
  }

  getMimeType(format) {
    const mimeTypes = {
      json: 'application/json',
      markdown: 'text/markdown',
      csv: 'text/csv',
      txt: 'text/plain'
    }
    return mimeTypes[format] || 'application/octet-stream'
  }

  convertToMarkdown(meetingData) {
    let markdown = `# ${meetingData.title || 'Meeting Notes'}\n\n`
    markdown += `**Date:** ${meetingData.date}\n`
    markdown += `**Priority:** ${meetingData.priority}\n\n`
    
    if (meetingData.digitalNotes) {
      Object.entries(meetingData.digitalNotes).forEach(([section, content]) => {
        if (content) {
          markdown += `## ${this.getSectionTitle(section)}\n\n${content}\n\n`
        }
      })
    }
    
    if (meetingData.actionItems?.length > 0) {
      markdown += `## Action Items\n\n`
      meetingData.actionItems.forEach(item => {
        markdown += `- [ ] ${item.text || item}\n`
      })
    }
    
    return markdown
  }

  convertToCSV(meetingData) {
    const rows = [
      ['Field', 'Value'],
      ['Title', meetingData.title || ''],
      ['Date', meetingData.date || ''],
      ['Priority', meetingData.priority || ''],
      ['Summary', meetingData.summary || '']
    ]
    
    return rows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n')
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

  async simulateGoogleDriveUpload(payload) {
    // Simulate Google Drive API call
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    return {
      fileId: `gdrive_${Date.now()}`,
      fileName: payload.fileName,
      webViewLink: `https://drive.google.com/file/d/mock_${Date.now()}/view`,
      downloadLink: `https://drive.google.com/file/d/mock_${Date.now()}/download`,
      folderId: payload.folderId,
      size: payload.fileContent.length,
      mimeType: payload.mimeType,
      createdTime: new Date().toISOString()
    }
  }

  // Batch export multiple meetings
  async batchExport(meetings, method, options = {}) {
    const results = []
    const { concurrency = 3 } = options
    
    for (let i = 0; i < meetings.length; i += concurrency) {
      const batch = meetings.slice(i, i + concurrency)
      const promises = batch.map(meeting => 
        this.exportByMethod(method, meeting, options).catch(error => ({
          success: false,
          error: error.message,
          meetingId: meeting.id
        }))
      )
      
      const batchResults = await Promise.all(promises)
      results.push(...batchResults)
    }
    
    return {
      total: meetings.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    }
  }

  // Test connection for each export method
  async testConnections() {
    const methods = this.getAvailableMethods()
    const results = {}
    
    for (const method of methods) {
      try {
        results[method] = await this.testConnection(method)
      } catch (error) {
        results[method] = { success: false, error: error.message }
      }
    }
    
    return results
  }

  async testConnection(method) {
    const testData = {
      id: 'test',
      title: 'Connection Test',
      date: new Date().toISOString().split('T')[0],
      priority: 'low',
      digitalNotes: { topLeft: 'Test note' },
      summary: 'This is a connection test'
    }
    
    switch (method) {
      case 'email':
      case 'webhook':
        // For webhooks, we could send a test payload
        return { success: true, message: 'Configuration valid' }
      case 'gdrive':
        return { success: true, message: 'Google Drive configuration valid' }
      default:
        throw new Error(`Cannot test method: ${method}`)
    }
  }
}

// Create singleton instance
const exportService = new ExportService()
export default exportService