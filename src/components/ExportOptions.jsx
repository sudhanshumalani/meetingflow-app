import React, { useState, useEffect } from 'react'
import {
  Download,
  Mail,
  Database,
  Cloud,
  Webhook,
  Settings,
  CheckCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Copy,
  TestTube,
  Zap,
  HardDrive,
  Send,
  X,
  Info
} from 'lucide-react'
import exportService from '../services/exportService'
import { useApp } from '../contexts/AppContext'

// Main Export Options Component
export function ExportOptionsButton({ meetingData, onSuccess, onError, className = '' }) {
  const [isOpen, setIsOpen] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [selectedMethod, setSelectedMethod] = useState(null)
  const [availableMethods, setAvailableMethods] = useState([])
  const [exportResult, setExportResult] = useState(null)

  useEffect(() => {
    setAvailableMethods(exportService.getAvailableMethods())
    const settings = exportService.getSettings()
    setSelectedMethod(settings.preferredMethod)
  }, [])

  const handleExport = async (method) => {
    if (!meetingData) {
      onError?.('No meeting data available for export')
      return
    }

    setIsExporting(true)
    setExportResult(null)

    try {
      const result = await exportService.exportByMethod(method, meetingData)
      setExportResult(result)
      
      if (result.success) {
        onSuccess?.(result)
      } else {
        onError?.(result.message || 'Export failed')
      }
    } catch (error) {
      const errorResult = {
        success: false,
        method,
        error: error.message,
        message: 'Export failed with error'
      }
      setExportResult(errorResult)
      onError?.(error.message)
    } finally {
      setIsExporting(false)
    }
  }

  const handleSmartExport = async () => {
    setIsExporting(true)
    try {
      const result = await exportService.smartExport(meetingData)
      setExportResult(result)
      
      if (result.success) {
        onSuccess?.(result)
      } else {
        onError?.(result.message || 'All export methods failed')
      }
    } catch (error) {
      onError?.(error.message)
    } finally {
      setIsExporting(false)
    }
  }

  const exportMethods = [
    {
      id: 'notion',
      name: 'Notion API',
      description: 'Real-time sync to Notion database',
      icon: <Database size={20} />,
      color: 'bg-gray-100 text-gray-800 border-gray-300',
      available: availableMethods.includes('notion')
    },
    {
      id: 'email',
      name: 'Email Export',
      description: 'Triggers N8N workflow via email',
      icon: <Mail size={20} />,
      color: 'bg-blue-100 text-blue-800 border-blue-300',
      available: availableMethods.includes('email')
    },
    {
      id: 'gdrive',
      name: 'Google Drive',
      description: 'Upload for N8N monitoring',
      icon: <HardDrive size={20} />,
      color: 'bg-green-100 text-green-800 border-green-300',
      available: availableMethods.includes('gdrive')
    },
    {
      id: 'webhook',
      name: 'JSON Webhook',
      description: 'Direct to N8N endpoint',
      icon: <Webhook size={20} />,
      color: 'bg-purple-100 text-purple-800 border-purple-300',
      available: availableMethods.includes('webhook')
    }
  ]

  if (availableMethods.length === 0) {
    return (
      <button
        disabled
        className={`flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-500 rounded-lg cursor-not-allowed ${className}`}
        title="No export methods configured"
      >
        <Download size={16} />
        Export (Not Configured)
      </button>
    )
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isExporting}
        className={`flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors ${className}`}
      >
        {isExporting ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Download size={16} />
        )}
        {isExporting ? 'Exporting...' : 'Export'}
        <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-80 bg-white rounded-lg shadow-lg border z-50">
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Export Options</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X size={16} />
              </button>
            </div>

            {/* Smart Export Button */}
            <button
              onClick={handleSmartExport}
              disabled={isExporting}
              className="w-full flex items-center gap-3 p-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 transition-all mb-4"
            >
              <Zap size={20} />
              <div className="text-left flex-1">
                <div className="font-medium">Smart Export</div>
                <div className="text-sm opacity-90">Uses best available method</div>
              </div>
            </button>

            {/* Individual Export Methods */}
            <div className="space-y-2">
              {exportMethods.map(method => (
                <button
                  key={method.id}
                  onClick={() => handleExport(method.id)}
                  disabled={!method.available || isExporting}
                  className={`w-full flex items-center gap-3 p-3 border rounded-lg text-left transition-colors ${
                    method.available 
                      ? `${method.color} hover:opacity-80` 
                      : 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed'
                  }`}
                >
                  {method.icon}
                  <div className="flex-1">
                    <div className="font-medium">{method.name}</div>
                    <div className="text-sm opacity-75">{method.description}</div>
                  </div>
                  {!method.available && (
                    <span className="text-xs bg-gray-200 px-2 py-1 rounded">Not configured</span>
                  )}
                </button>
              ))}
            </div>

            {/* Export Result */}
            {exportResult && (
              <div className={`mt-4 p-3 rounded-lg ${
                exportResult.success 
                  ? 'bg-green-50 text-green-800 border border-green-200' 
                  : 'bg-red-50 text-red-800 border border-red-200'
              }`}>
                <div className="flex items-center gap-2">
                  {exportResult.success ? (
                    <CheckCircle size={16} />
                  ) : (
                    <AlertCircle size={16} />
                  )}
                  <span className="font-medium">{exportResult.message}</span>
                </div>
                {exportResult.fallbackUsed && (
                  <div className="text-sm mt-1 opacity-75">
                    Fallback used: {exportResult.originalMethod} → {exportResult.method}
                  </div>
                )}
              </div>
            )}

            {/* Settings Link */}
            <div className="mt-4 pt-3 border-t">
              <ExportSettingsButton />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Export Settings Modal
export function ExportSettingsButton() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 text-gray-600 hover:text-gray-800 text-sm"
      >
        <Settings size={14} />
        Configure Export Methods
      </button>

      {isOpen && (
        <ExportSettingsModal 
          isOpen={isOpen} 
          onClose={() => setIsOpen(false)} 
        />
      )}
    </>
  )
}

// Export Settings Modal Component
export function ExportSettingsModal({ isOpen, onClose }) {
  const [settings, setSettings] = useState(exportService.getSettings())
  const [activeTab, setActiveTab] = useState('general')
  const [testResults, setTestResults] = useState({})
  const [isTesting, setIsTesting] = useState(false)

  const handleSave = () => {
    exportService.saveSettings(settings)
    onClose()
  }

  const handleTest = async (method) => {
    setIsTesting(true)
    try {
      const result = await exportService.testConnection(method)
      setTestResults(prev => ({ ...prev, [method]: result }))
    } catch (error) {
      setTestResults(prev => ({ 
        ...prev, 
        [method]: { success: false, error: error.message } 
      }))
    } finally {
      setIsTesting(false)
    }
  }

  const handleTestAll = async () => {
    setIsTesting(true)
    try {
      const results = await exportService.testConnections()
      setTestResults(results)
    } catch (error) {
      console.error('Test all failed:', error)
    } finally {
      setIsTesting(false)
    }
  }

  const updateSettings = (section, field, value) => {
    setSettings(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value
      }
    }))
  }

  if (!isOpen) return null

  const tabs = [
    { id: 'general', name: 'General', icon: <Settings size={16} /> },
    { id: 'notion', name: 'Notion', icon: <Database size={16} /> },
    { id: 'email', name: 'Email/N8N', icon: <Mail size={16} /> },
    { id: 'gdrive', name: 'Google Drive', icon: <HardDrive size={16} /> },
    { id: 'webhook', name: 'Webhook', icon: <Webhook size={16} /> }
  ]

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold">Export Settings</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={handleTestAll}
              disabled={isTesting}
              className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {isTesting ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <TestTube size={16} />
              )}
              Test All
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex">
          {/* Sidebar */}
          <div className="w-48 border-r bg-gray-50">
            <nav className="p-4 space-y-1">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-left rounded-lg transition-colors ${
                    activeTab === tab.id
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {tab.icon}
                  {tab.name}
                </button>
              ))}
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1 p-6 max-h-[calc(90vh-8rem)] overflow-y-auto">
            {activeTab === 'general' && (
              <GeneralSettings 
                settings={settings} 
                updateSettings={updateSettings} 
                testResults={testResults}
              />
            )}
            {activeTab === 'notion' && (
              <NotionSettings 
                settings={settings} 
                updateSettings={updateSettings}
                onTest={() => handleTest('notion')}
                testResult={testResults.notion}
                isTesting={isTesting}
              />
            )}
            {activeTab === 'email' && (
              <EmailSettings 
                settings={settings} 
                updateSettings={updateSettings}
                onTest={() => handleTest('email')}
                testResult={testResults.email}
                isTesting={isTesting}
              />
            )}
            {activeTab === 'gdrive' && (
              <GoogleDriveSettings 
                settings={settings} 
                updateSettings={updateSettings}
                onTest={() => handleTest('gdrive')}
                testResult={testResults.gdrive}
                isTesting={isTesting}
              />
            )}
            {activeTab === 'webhook' && (
              <WebhookSettings 
                settings={settings} 
                updateSettings={updateSettings}
                onTest={() => handleTest('webhook')}
                testResult={testResults.webhook}
                isTesting={isTesting}
              />
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  )
}

// Settings Tab Components
function GeneralSettings({ settings, updateSettings, testResults }) {
  const exportMethods = [
    { id: 'notion', name: 'Notion API (Real-time)', description: 'Direct integration with Notion' },
    { id: 'email', name: 'Email Export (N8N)', description: 'Email trigger for N8N workflow' },
    { id: 'gdrive', name: 'Google Drive (N8N)', description: 'File upload for N8N monitoring' },
    { id: 'webhook', name: 'JSON Webhook (N8N)', description: 'Direct webhook to N8N' }
  ]

  const availableMethods = exportService.getAvailableMethods()

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Preferred Export Method</h3>
        <div className="space-y-3">
          {exportMethods.map(method => (
            <label key={method.id} className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                name="preferredMethod"
                value={method.id}
                checked={settings.preferredMethod === method.id}
                onChange={(e) => updateSettings('', 'preferredMethod', e.target.value)}
                className="w-4 h-4 text-indigo-600"
              />
              <div className="flex-1">
                <div className="font-medium">{method.name}</div>
                <div className="text-sm text-gray-600">{method.description}</div>
              </div>
              <div className="flex items-center gap-2">
                {availableMethods.includes(method.id) ? (
                  <span className="text-green-600 text-sm">✓ Available</span>
                ) : (
                  <span className="text-gray-400 text-sm">Not configured</span>
                )}
                {testResults[method.id] && (
                  <div className={`w-3 h-3 rounded-full ${
                    testResults[method.id].success ? 'bg-green-500' : 'bg-red-500'
                  }`} />
                )}
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Info size={20} className="text-blue-600 mt-0.5" />
          <div>
            <h4 className="font-medium text-blue-900">Smart Export</h4>
            <p className="text-sm text-blue-700 mt-1">
              When using Smart Export, the system will try your preferred method first, 
              then fall back to other available methods if it fails.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function NotionSettings({ settings, updateSettings, onTest, testResult, isTesting }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Notion Integration</h3>
        <button
          onClick={onTest}
          disabled={isTesting}
          className="flex items-center gap-2 px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
        >
          {isTesting ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <TestTube size={16} />
          )}
          Test Connection
        </button>
      </div>

      {testResult && (
        <div className={`p-3 rounded-lg ${
          testResult.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
        }`}>
          {testResult.success ? '✓ Connection successful' : `✗ ${testResult.error}`}
        </div>
      )}

      <div className="space-y-4">
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={settings.notionSettings.enabled}
            onChange={(e) => updateSettings('notionSettings', 'enabled', e.target.checked)}
            className="w-4 h-4 text-indigo-600"
          />
          <span className="font-medium">Enable Notion export</span>
        </label>

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={settings.notionSettings.autoSync}
            onChange={(e) => updateSettings('notionSettings', 'autoSync', e.target.checked)}
            className="w-4 h-4 text-indigo-600"
          />
          <span className="font-medium">Auto-sync on save</span>
        </label>

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={settings.notionSettings.updateStakeholderContact}
            onChange={(e) => updateSettings('notionSettings', 'updateStakeholderContact', e.target.checked)}
            className="w-4 h-4 text-indigo-600"
          />
          <span className="font-medium">Update stakeholder last contact date</span>
        </label>
      </div>

      <div className="bg-gray-50 border rounded-lg p-4">
        <h4 className="font-medium mb-2">Configuration</h4>
        <div className="text-sm text-gray-600 space-y-1">
          <p>• API Token: {import.meta.env.VITE_NOTION_API_TOKEN ? '✓ Configured' : '✗ Missing'}</p>
          <p>• Meetings DB: {import.meta.env.VITE_NOTION_MEETINGS_DATABASE_ID ? '✓ Configured' : '✗ Missing'}</p>
          <p>• Stakeholders DB: {import.meta.env.VITE_NOTION_STAKEHOLDERS_DATABASE_ID ? '✓ Configured' : '✗ Missing'}</p>
        </div>
      </div>
    </div>
  )
}

function EmailSettings({ settings, updateSettings, onTest, testResult, isTesting }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Email Export (N8N)</h3>
        <button
          onClick={onTest}
          disabled={isTesting}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {isTesting ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <TestTube size={16} />
          )}
          Test
        </button>
      </div>

      {testResult && (
        <div className={`p-3 rounded-lg ${
          testResult.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
        }`}>
          {testResult.success ? '✓ Configuration valid' : `✗ ${testResult.error}`}
        </div>
      )}

      <div className="space-y-4">
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={settings.emailSettings.enabled}
            onChange={(e) => updateSettings('emailSettings', 'enabled', e.target.checked)}
            className="w-4 h-4 text-indigo-600"
          />
          <span className="font-medium">Enable email export</span>
        </label>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Recipient Email
          </label>
          <input
            type="email"
            value={settings.emailSettings.recipientEmail}
            onChange={(e) => updateSettings('emailSettings', 'recipientEmail', e.target.value)}
            placeholder="workflow@yourcompany.com"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            N8N Email Webhook URL
          </label>
          <input
            type="url"
            value={settings.emailSettings.n8nWebhookUrl}
            onChange={(e) => updateSettings('emailSettings', 'n8nWebhookUrl', e.target.value)}
            placeholder="https://your-n8n.com/webhook/email-trigger"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Email Subject
          </label>
          <input
            type="text"
            value={settings.emailSettings.subject}
            onChange={(e) => updateSettings('emailSettings', 'subject', e.target.value)}
            placeholder="Meeting Export from MeetingFlow"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-indigo-500"
          />
        </div>

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={settings.emailSettings.includeAttachments}
            onChange={(e) => updateSettings('emailSettings', 'includeAttachments', e.target.checked)}
            className="w-4 h-4 text-indigo-600"
          />
          <span className="font-medium">Include attachments</span>
        </label>
      </div>
    </div>
  )
}

function GoogleDriveSettings({ settings, updateSettings, onTest, testResult, isTesting }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Google Drive Export</h3>
        <button
          onClick={onTest}
          disabled={isTesting}
          className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
        >
          {isTesting ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <TestTube size={16} />
          )}
          Test
        </button>
      </div>

      {testResult && (
        <div className={`p-3 rounded-lg ${
          testResult.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
        }`}>
          {testResult.success ? '✓ Configuration valid' : `✗ ${testResult.error}`}
        </div>
      )}

      <div className="space-y-4">
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={settings.gdriveSettings.enabled}
            onChange={(e) => updateSettings('gdriveSettings', 'enabled', e.target.checked)}
            className="w-4 h-4 text-indigo-600"
          />
          <span className="font-medium">Enable Google Drive export</span>
        </label>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Google Drive Folder ID
          </label>
          <input
            type="text"
            value={settings.gdriveSettings.folderId}
            onChange={(e) => updateSettings('gdriveSettings', 'folderId', e.target.value)}
            placeholder="1234567890abcdefghijklmnop"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-indigo-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            The folder ID from the Google Drive URL where files will be uploaded
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            File Format
          </label>
          <select
            value={settings.gdriveSettings.fileFormat}
            onChange={(e) => updateSettings('gdriveSettings', 'fileFormat', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-indigo-500"
          >
            <option value="json">JSON</option>
            <option value="markdown">Markdown</option>
            <option value="csv">CSV</option>
          </select>
        </div>

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={settings.gdriveSettings.includeAttachments}
            onChange={(e) => updateSettings('gdriveSettings', 'includeAttachments', e.target.checked)}
            className="w-4 h-4 text-indigo-600"
          />
          <span className="font-medium">Include attachments</span>
        </label>
      </div>
    </div>
  )
}

function WebhookSettings({ settings, updateSettings, onTest, testResult, isTesting }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">JSON Webhook (N8N)</h3>
        <button
          onClick={onTest}
          disabled={isTesting}
          className="flex items-center gap-2 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
        >
          {isTesting ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <TestTube size={16} />
          )}
          Test
        </button>
      </div>

      {testResult && (
        <div className={`p-3 rounded-lg ${
          testResult.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
        }`}>
          {testResult.success ? '✓ Configuration valid' : `✗ ${testResult.error}`}
        </div>
      )}

      <div className="space-y-4">
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={settings.webhookSettings.enabled}
            onChange={(e) => updateSettings('webhookSettings', 'enabled', e.target.checked)}
            className="w-4 h-4 text-indigo-600"
          />
          <span className="font-medium">Enable webhook export</span>
        </label>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Webhook URL
          </label>
          <input
            type="url"
            value={settings.webhookSettings.url}
            onChange={(e) => updateSettings('webhookSettings', 'url', e.target.value)}
            placeholder="https://your-n8n.com/webhook/meeting-data"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Retry Attempts
          </label>
          <input
            type="number"
            min="1"
            max="10"
            value={settings.webhookSettings.retryAttempts}
            onChange={(e) => updateSettings('webhookSettings', 'retryAttempts', parseInt(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Timeout (milliseconds)
          </label>
          <input
            type="number"
            min="5000"
            max="60000"
            step="1000"
            value={settings.webhookSettings.timeout}
            onChange={(e) => updateSettings('webhookSettings', 'timeout', parseInt(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-indigo-500"
          />
        </div>
      </div>
    </div>
  )
}

// Batch Export Component
export function BatchExportButton({ meetings, className = '' }) {
  const [isOpen, setIsOpen] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [selectedMethod, setSelectedMethod] = useState('notion')
  const [batchResult, setBatchResult] = useState(null)

  const handleBatchExport = async () => {
    if (!meetings || meetings.length === 0) {
      return
    }

    setIsExporting(true)
    setBatchResult(null)

    try {
      const result = await exportService.batchExport(meetings, selectedMethod, {
        concurrency: 3
      })
      setBatchResult(result)
    } catch (error) {
      setBatchResult({
        success: false,
        error: error.message,
        total: meetings.length,
        successful: 0,
        failed: meetings.length
      })
    } finally {
      setIsExporting(false)
    }
  }

  const availableMethods = exportService.getAvailableMethods()

  if (availableMethods.length === 0) {
    return null
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isExporting || !meetings || meetings.length === 0}
        className={`flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 transition-colors ${className}`}
      >
        {isExporting ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Send size={16} />
        )}
        {isExporting ? 'Exporting...' : `Batch Export (${meetings?.length || 0})`}
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-72 bg-white rounded-lg shadow-lg border z-50">
          <div className="p-4">
            <h3 className="font-semibold text-gray-900 mb-4">Batch Export Settings</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Export Method
                </label>
                <select
                  value={selectedMethod}
                  onChange={(e) => setSelectedMethod(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-indigo-500"
                >
                  {availableMethods.map(method => (
                    <option key={method} value={method}>
                      {exportService.exportMethods[method]}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleBatchExport}
                disabled={isExporting}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
              >
                {isExporting ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Send size={16} />
                )}
                Export {meetings?.length || 0} Meetings
              </button>

              {batchResult && (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                  <div className="text-sm space-y-1">
                    <div>Total: {batchResult.total}</div>
                    <div className="text-green-600">Successful: {batchResult.successful}</div>
                    <div className="text-red-600">Failed: {batchResult.failed}</div>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => setIsOpen(false)}
              className="mt-4 w-full px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}