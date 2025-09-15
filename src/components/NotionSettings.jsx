import React, { useState } from 'react'
import { Cloud, Key, Database, TestTube, CheckCircle, AlertCircle, Loader2, Eye, EyeOff, ExternalLink, Info, Plus, X } from 'lucide-react'
import { useApp } from '../contexts/AppContext'
import NotionSyncStatus from './NotionSyncStatus'

export default function NotionSettings() {
  const { notion, configureNotion, testNotionConnection, syncFromNotion } = useApp()

  const [formData, setFormData] = useState({
    apiKey: '',
    stakeholderDbIds: [''], // Array to support multiple databases
    categoryDbId: '',
    meetingDbId: ''
  })

  const [showApiKey, setShowApiKey] = useState(false)
  const [isTestingConnection, setIsTestingConnection] = useState(false)
  const [connectionResult, setConnectionResult] = useState(null)
  const [isSaving, setIsSaving] = useState(false)

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    setConnectionResult(null) // Clear previous test results
  }

  const handleStakeholderDbChange = (index, value) => {
    setFormData(prev => ({
      ...prev,
      stakeholderDbIds: prev.stakeholderDbIds.map((id, i) => i === index ? value : id)
    }))
    setConnectionResult(null)
  }

  const addStakeholderDatabase = () => {
    setFormData(prev => ({
      ...prev,
      stakeholderDbIds: [...prev.stakeholderDbIds, '']
    }))
  }

  const removeStakeholderDatabase = (index) => {
    if (formData.stakeholderDbIds.length > 1) {
      setFormData(prev => ({
        ...prev,
        stakeholderDbIds: prev.stakeholderDbIds.filter((_, i) => i !== index)
      }))
    }
  }

  const handleTestConnection = async () => {
    if (!formData.apiKey.trim()) {
      setConnectionResult({
        success: false,
        error: 'API key is required for connection test'
      })
      return
    }

    setIsTestingConnection(true)
    setConnectionResult(null)

    try {
      // Configure temporarily for testing
      configureNotion({ apiKey: formData.apiKey })

      const result = await testNotionConnection()
      setConnectionResult({
        success: true,
        user: result.user
      })
    } catch (error) {
      setConnectionResult({
        success: false,
        error: error.message
      })
    } finally {
      setIsTestingConnection(false)
    }
  }

  const handleSaveConfiguration = async () => {
    setIsSaving(true)

    try {
      // Filter out empty stakeholder database IDs
      const cleanedStakeholderDbIds = formData.stakeholderDbIds.filter(id => id.trim())

      if (!formData.apiKey.trim()) {
        throw new Error('API key is required')
      }

      // Prepare configuration data
      const configData = {
        ...formData,
        stakeholderDbIds: cleanedStakeholderDbIds
      }

      // Save configuration
      configureNotion(configData)

      // Clear form
      setFormData({
        apiKey: '',
        stakeholderDbIds: [''],
        categoryDbId: '',
        meetingDbId: ''
      })

      // Test sync if databases are configured
      if (cleanedStakeholderDbIds.length > 0 || formData.categoryDbId) {
        try {
          await syncFromNotion()
        } catch (syncError) {
          console.warn('Initial sync failed:', syncError)
        }
      }

      setConnectionResult({
        success: true,
        message: `Configuration saved! ${cleanedStakeholderDbIds.length} stakeholder database(s) configured.`
      })
    } catch (error) {
      setConnectionResult({
        success: false,
        error: error.message
      })
    } finally {
      setIsSaving(false)
    }
  }

  const extractDbIdFromUrl = (url) => {
    if (!url) return ''

    // Extract database ID from various Notion URL formats
    const patterns = [
      /notion\.so\/([a-f0-9]{32})/,
      /notion\.so\/.*\/([a-f0-9]{32})/,
      /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/
    ]

    for (const pattern of patterns) {
      const match = url.match(pattern)
      if (match) {
        return match[1].replace(/-/g, '')
      }
    }

    return url
  }

  const handleDatabaseUrlPaste = (field) => (e) => {
    const pastedText = e.clipboardData.getData('text')
    const dbId = extractDbIdFromUrl(pastedText)
    if (dbId && dbId !== pastedText) {
      e.preventDefault()
      handleInputChange(field, dbId)
    }
  }

  return (
    <div className="space-y-8">
      {/* Status Overview */}
      <NotionSyncStatus onConfigureClick={() => {}} />

      {/* Configuration Form */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <div className="flex items-start gap-3 mb-6">
          <div className="p-2 bg-purple-100 rounded-lg">
            <Cloud className="w-5 h-5 text-purple-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Notion API Configuration</h3>
            <p className="text-sm text-gray-600 mb-4">
              Connect MeetingFlow to your Notion workspace to sync stakeholders and export meetings.
            </p>

            {/* Setup Instructions */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <h4 className="font-medium text-blue-900 mb-2">Setup Instructions</h4>
                  <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                    <li>
                      Get your Notion API key from{' '}
                      <a href="https://www.notion.so/my-integrations" target="_blank" rel="noopener noreferrer" className="underline font-medium inline-flex items-center gap-1">
                        Notion Integrations <ExternalLink className="w-3 h-3" />
                      </a>
                    </li>
                    <li>Create databases in Notion for stakeholders, categories, and meetings</li>
                    <li>Share each database with your integration</li>
                    <li>Copy the database URLs and paste them below (IDs will be extracted automatically)</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* API Key */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Key className="w-4 h-4 inline mr-1" />
              Notion API Key *
            </label>
            <div className="relative">
              <input
                type={showApiKey ? "text" : "password"}
                value={formData.apiKey}
                onChange={(e) => handleInputChange('apiKey', e.target.value)}
                placeholder="secret_..."
                className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Your API key is stored locally and never sent to our servers.
            </p>
          </div>

          {/* Test Connection */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleTestConnection}
              disabled={isTestingConnection || !formData.apiKey.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 transition-colors"
            >
              {isTestingConnection ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <TestTube className="w-4 h-4" />
              )}
              Test Connection
            </button>

            {connectionResult && (
              <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${
                connectionResult.success
                  ? 'bg-green-100 text-green-800'
                  : 'bg-red-100 text-red-800'
              }`}>
                {connectionResult.success ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  <AlertCircle className="w-4 h-4" />
                )}
                {connectionResult.success
                  ? connectionResult.user?.name
                    ? `Connected as ${connectionResult.user.name}`
                    : connectionResult.message || 'Connection successful'
                  : connectionResult.error
                }
              </div>
            )}
          </div>

          {/* Database IDs */}
          <div className="space-y-6">
            {/* Stakeholder Databases */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-gray-700">
                  <Database className="w-4 h-4 inline mr-1" />
                  Stakeholder Databases
                </label>
                <button
                  type="button"
                  onClick={addStakeholderDatabase}
                  className="flex items-center gap-1 px-2 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  Add Database
                </button>
              </div>

              <div className="space-y-3">
                {formData.stakeholderDbIds.map((dbId, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      value={dbId}
                      onChange={(e) => handleStakeholderDbChange(index, e.target.value)}
                      onPaste={(e) => {
                        const pastedText = e.clipboardData.getData('text')
                        const extractedId = extractDbIdFromUrl(pastedText)
                        if (extractedId && extractedId !== pastedText) {
                          e.preventDefault()
                          handleStakeholderDbChange(index, extractedId)
                        }
                      }}
                      placeholder={`Stakeholder database ${index + 1} URL or ID`}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    />
                    {formData.stakeholderDbIds.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeStakeholderDatabase(index)}
                        className="px-2 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Remove database"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Add multiple databases to sync stakeholders from different Notion workspaces or teams.
              </p>
            </div>

            {/* Other Databases */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Database className="w-4 h-4 inline mr-1" />
                Category Database ID
              </label>
              <input
                type="text"
                value={formData.categoryDbId}
                onChange={(e) => handleInputChange('categoryDbId', e.target.value)}
                onPaste={handleDatabaseUrlPaste('categoryDbId')}
                placeholder="Paste database URL or ID"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
              <p className="text-xs text-gray-500 mt-1">Optional: For syncing categories</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Database className="w-4 h-4 inline mr-1" />
                Meeting Database ID
              </label>
              <input
                type="text"
                value={formData.meetingDbId}
                onChange={(e) => handleInputChange('meetingDbId', e.target.value)}
                onPaste={handleDatabaseUrlPaste('meetingDbId')}
                placeholder="Paste database URL or ID"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
              <p className="text-xs text-gray-500 mt-1">Optional: For exporting meetings</p>
            </div>
            </div>
          </div>

          {/* Save Configuration */}
          <div className="flex justify-end pt-4 border-t border-gray-200">
            <button
              onClick={handleSaveConfiguration}
              disabled={isSaving || !formData.apiKey.trim()}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 transition-colors"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4" />
              )}
              Save Configuration
            </button>
          </div>
        </div>
      </div>

      {/* Database Schema Information */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Required Database Schema</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Stakeholder Database</h4>
            <div className="text-sm text-gray-600 space-y-1">
              <div><code className="bg-gray-100 px-1 rounded">Name</code> - Title</div>
              <div><code className="bg-gray-100 px-1 rounded">Category</code> - Select</div>
              <div><code className="bg-gray-100 px-1 rounded">Email</code> - Email</div>
              <div><code className="bg-gray-100 px-1 rounded">Organization</code> - Rich Text</div>
              <div><code className="bg-gray-100 px-1 rounded">Priority</code> - Select</div>
              <div><code className="bg-gray-100 px-1 rounded">Notes</code> - Rich Text</div>
              <div><code className="bg-gray-100 px-1 rounded">Status</code> - Select</div>
            </div>
          </div>

          <div>
            <h4 className="font-medium text-gray-900 mb-2">Category Database</h4>
            <div className="text-sm text-gray-600 space-y-1">
              <div><code className="bg-gray-100 px-1 rounded">Name</code> - Title</div>
              <div><code className="bg-gray-100 px-1 rounded">Key</code> - Rich Text</div>
              <div><code className="bg-gray-100 px-1 rounded">Description</code> - Rich Text</div>
              <div><code className="bg-gray-100 px-1 rounded">Color</code> - Select</div>
            </div>
          </div>

          <div>
            <h4 className="font-medium text-gray-900 mb-2">Meeting Database</h4>
            <div className="text-sm text-gray-600 space-y-1">
              <div><code className="bg-gray-100 px-1 rounded">Title</code> - Title</div>
              <div><code className="bg-gray-100 px-1 rounded">Date</code> - Date</div>
              <div><code className="bg-gray-100 px-1 rounded">Type</code> - Select</div>
              <div><code className="bg-gray-100 px-1 rounded">Stakeholder</code> - Rich Text</div>
              <div><code className="bg-gray-100 px-1 rounded">Sentiment</code> - Select</div>
              <div><code className="bg-gray-100 px-1 rounded">AI Confidence</code> - Number</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}