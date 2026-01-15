import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Settings as SettingsIcon,
  Eye,
  Key,
  Info,
  Sparkles,
  Cloud,
  Check,
  Workflow,
  RefreshCw
} from 'lucide-react'
import { setOCRApiKey, getOCRCapabilities } from '../utils/ocrService'
import { setClaudeApiKey as updateClaudeApiKey, getCapabilities } from '../utils/ocrServiceNew'
import N8nSettings from '../components/N8nSettings'
import { useSyncContext } from '../contexts/SyncProvider'
import SyncSetup from '../components/sync/SyncSetup'
import SyncStatusIndicator from '../components/sync/SyncStatusIndicator'
import SyncConflictResolver from '../components/sync/SyncConflictResolver'
// IMPORTANT: Firestore service is loaded based on platform
// - iOS: Uses REST API service (works on iOS Safari)
// - Desktop: Uses Firebase SDK service
import { Database, Upload, CheckCircle, Bug } from 'lucide-react'
import FirebaseDebugPanel from '../components/FirebaseDebugPanel'

// Detect iOS
const IS_IOS = typeof navigator !== 'undefined' && (
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 0) ||
  (typeof window !== 'undefined' && window.navigator?.standalone === true)
)

// Lazy-load firestoreService - uses REST API on iOS, SDK on desktop
let firestoreServiceInstance = null
async function getFirestoreService() {
  if (firestoreServiceInstance) return firestoreServiceInstance
  try {
    if (IS_IOS) {
      const module = await import('../utils/firestoreRestService')
      firestoreServiceInstance = module.default
      console.log('📱 Settings: Using REST API service (iOS)')
    } else {
      const module = await import('../utils/firestoreService')
      firestoreServiceInstance = module.default
      console.log('💻 Settings: Using SDK service (Desktop)')
    }
    return firestoreServiceInstance
  } catch (err) {
    console.error('Failed to load firestoreService:', err)
    return null
  }
}

export default function Settings() {
  const navigate = useNavigate()

  // Check URL params for tab
  const urlParams = new URLSearchParams(window.location.search)
  const tabFromUrl = urlParams.get('tab')
  const [activeTab, setActiveTab] = useState(tabFromUrl || 'n8n')

  // Sync context
  const sync = useSyncContext()

  // OCR configuration state
  const [ocrApiKey, setOcrApiKey] = useState(localStorage.getItem('ocrApiKey') || '')
  const [ocrCapabilities, setOcrCapabilities] = useState(getOCRCapabilities())
  const [ocrKeySaved, setOcrKeySaved] = useState(false)

  // Claude AI configuration state
  const [claudeApiKey, setClaudeApiKey] = useState(localStorage.getItem('claudeApiKey') || '')
  const [claudeKeySaved, setClaudeKeySaved] = useState(false)
  const [capabilities, setCapabilities] = useState(getCapabilities())

  // Firestore import state
  const [firestoreImporting, setFirestoreImporting] = useState(false)
  const [firestoreImportResult, setFirestoreImportResult] = useState(null)
  const [firestoreUserId, setFirestoreUserId] = useState('')
  const [manualSyncing, setManualSyncing] = useState(false)
  const [manualSyncResult, setManualSyncResult] = useState(null)

  // Load userId from localStorage directly (no Firestore service needed)
  useEffect(() => {
    // Get userId from localStorage directly - don't load Firestore service
    const userId = localStorage.getItem('meetingflow_firestore_user_id')
    if (userId) {
      setFirestoreUserId(userId)
    } else {
      // Generate a new one if not exists
      const newId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      localStorage.setItem('meetingflow_firestore_user_id', newId)
      setFirestoreUserId(newId)
    }
  }, [])

  // Initialize OCR API key on component mount
  useEffect(() => {
    const savedKey = localStorage.getItem('ocrApiKey')
    if (savedKey && !ocrCapabilities.ocrSpace) {
      setOCRApiKey(savedKey)
      setOcrCapabilities(getOCRCapabilities())
    }

    // Initialize capabilities
    setCapabilities(getCapabilities())
  }, [])

  // OCR configuration functions
  const handleSaveOcrKey = () => {
    localStorage.setItem('ocrApiKey', ocrApiKey)
    setOCRApiKey(ocrApiKey)
    setOcrCapabilities(getOCRCapabilities())
    setOcrKeySaved(true)
    setTimeout(() => setOcrKeySaved(false), 3000)
  }

  const handleClearOcrKey = () => {
    setOcrApiKey('')
    localStorage.removeItem('ocrApiKey')
    setOCRApiKey('')
    setOcrCapabilities(getOCRCapabilities())
  }

  const handleSaveClaudeKey = () => {
    console.log('🚨🚨🚨 SETTINGS: handleSaveClaudeKey CALLED 🚨🚨🚨')
    console.log('🔧 SETTINGS: Saving Claude API key:', {
      hasKey: !!claudeApiKey,
      keyLength: claudeApiKey?.length || 0,
      keyPreview: claudeApiKey ? claudeApiKey.substring(0, 10) + '...' : 'none'
    })

    localStorage.setItem('claudeApiKey', claudeApiKey)
    console.log('✅ SETTINGS: Saved to localStorage')

    updateClaudeApiKey(claudeApiKey)
    console.log('✅ SETTINGS: Called updateClaudeApiKey service')

    setCapabilities(getCapabilities())
    console.log('✅ SETTINGS: Updated capabilities')

    setClaudeKeySaved(true)
    setTimeout(() => setClaudeKeySaved(false), 3000)
    console.log('✅ SETTINGS: handleSaveClaudeKey COMPLETE')
  }

  const handleClearClaudeKey = () => {
    setClaudeApiKey('')
    localStorage.removeItem('claudeApiKey')
    updateClaudeApiKey('')
    setCapabilities(getCapabilities())
  }

  // Firestore import function
  const handleFirestoreImport = async () => {
    setFirestoreImporting(true)
    setFirestoreImportResult(null)

    try {
      // Get data from localStorage
      const meetings = JSON.parse(localStorage.getItem('meetingflow_meetings') || '[]')
      const stakeholders = JSON.parse(localStorage.getItem('meetingflow_stakeholders') || '[]')
      const categories = JSON.parse(localStorage.getItem('meetingflow_stakeholder_categories') || '[]')

      console.log('🔥 Starting Firestore import:', {
        meetings: meetings.length,
        stakeholders: stakeholders.length,
        categories: categories.length
      })

      if (meetings.length === 0 && stakeholders.length === 0 && categories.length === 0) {
        setFirestoreImportResult({
          success: false,
          message: 'No data to import. Your local storage is empty.'
        })
        return
      }

      // Get firestoreService dynamically
      const firestoreService = await getFirestoreService()
      if (!firestoreService) {
        setFirestoreImportResult({
          success: false,
          message: 'Firestore service not available'
        })
        return
      }

      // Import to Firestore
      const result = await firestoreService.importAllData(meetings, stakeholders, categories)

      setFirestoreImportResult({
        success: true,
        message: `Successfully imported ${result.imported || 0} items to Firestore!`
      })

      console.log('✅ Firestore import complete:', result)
    } catch (error) {
      console.error('❌ Firestore import failed:', error)
      setFirestoreImportResult({
        success: false,
        message: `Import failed: ${error.message}`
      })
    } finally {
      setFirestoreImporting(false)
    }
  }

  // Update userId when linking devices
  const handleLinkDevice = async (newUserId) => {
    if (newUserId && newUserId.trim()) {
      try {
        // Save to localStorage directly (no Firestore needed)
        localStorage.setItem('meetingflow_firestore_user_id', newUserId.trim())
        setFirestoreUserId(newUserId.trim())

        // Show success message
        alert('Device ID saved! Click "Manual Sync" to fetch data from the cloud.')
      } catch (err) {
        console.error('Failed to link device:', err)
        alert('Failed to save device ID: ' + err.message)
      }
    }
  }

  // Helper to strip large fields from meetings to save storage space
  function stripLargeFields(meeting) {
    if (!meeting || typeof meeting !== 'object') return meeting

    const stripped = { ...meeting }
    // Remove large fields that can be regenerated or aren't critical
    delete stripped.audioBlob
    delete stripped.audioData
    delete stripped.audioUrl
    delete stripped.recordingBlob
    // Remove large base64 images
    if (stripped.images && Array.isArray(stripped.images)) {
      stripped.images = stripped.images.filter(img => {
        // Keep non-string images and small string images
        return typeof img !== 'string' || !img.startsWith('data:') || img.length <= 10000
      })
    }
    return stripped
  }

  // Manual sync - fetches data from Firestore on demand (iOS safe)
  const handleManualSync = async () => {
    setManualSyncing(true)
    setManualSyncResult(null)

    try {
      console.log('🔄 Manual sync starting...')
      console.log('🔄 Current userId:', localStorage.getItem('meetingflow_firestore_user_id'))

      // Dynamically load the appropriate firestore service
      const firestoreService = await getFirestoreService()
      if (!firestoreService) {
        throw new Error('Failed to load Firestore service')
      }

      console.log('🔄 Firestore service loaded, fetching data...')

      // Fetch all data from Firestore - catch individual errors
      let meetings = [], stakeholders = [], categories = []

      try {
        meetings = await firestoreService.getMeetings()
        console.log('🔄 Meetings fetched:', meetings.length)
      } catch (e) {
        console.error('🔄 Failed to fetch meetings:', e)
        throw new Error(`Failed to fetch meetings: ${e.message}`)
      }

      try {
        stakeholders = await firestoreService.getStakeholders()
        console.log('🔄 Stakeholders fetched:', stakeholders.length)
      } catch (e) {
        console.error('🔄 Failed to fetch stakeholders:', e)
        throw new Error(`Failed to fetch stakeholders: ${e.message}`)
      }

      try {
        categories = await firestoreService.getStakeholderCategories()
        console.log('🔄 Categories fetched:', categories.length)
      } catch (e) {
        console.error('🔄 Failed to fetch categories:', e)
        throw new Error(`Failed to fetch categories: ${e.message}`)
      }

      console.log('🔄 Fetched from Firestore:', {
        meetings: meetings.length,
        stakeholders: stakeholders.length,
        categories: categories.length
      })

      // Merge with local data
      console.log('🔄 Reading local data...')
      const localMeetings = JSON.parse(localStorage.getItem('meetingflow_meetings') || '[]')
      const localStakeholders = JSON.parse(localStorage.getItem('meetingflow_stakeholders') || '[]')
      const localCategories = JSON.parse(localStorage.getItem('meetingflow_stakeholder_categories') || '[]')

      console.log('🔄 Local data:', {
        meetings: localMeetings.length,
        stakeholders: localStakeholders.length,
        categories: localCategories.length
      })

      // Simple merge: combine by ID, keeping newer versions
      console.log('🔄 Merging data...')
      const mergedMeetings = mergeById(localMeetings, meetings)
      const mergedStakeholders = mergeById(localStakeholders, stakeholders)
      const mergedCategories = mergeById(localCategories, categories)

      console.log('🔄 Merged data:', {
        meetings: mergedMeetings.length,
        stakeholders: mergedStakeholders.length,
        categories: mergedCategories.length
      })

      // Strip large fields to save space (especially on iOS with limited quota)
      console.log('🔄 Stripping large fields...')
      const strippedMeetings = mergedMeetings.map(m => {
        try {
          return stripLargeFields(m)
        } catch (e) {
          console.error('Error stripping meeting:', m?.id, e)
          return m // Return original if stripping fails
        }
      })

      // Try to save
      console.log('🔄 Saving to localStorage...')
      try {
        localStorage.setItem('meetingflow_meetings', JSON.stringify(strippedMeetings))
        localStorage.setItem('meetingflow_stakeholders', JSON.stringify(mergedStakeholders))
        localStorage.setItem('meetingflow_stakeholder_categories', JSON.stringify(mergedCategories))
        console.log('🔄 Saved successfully!')
      } catch (storageError) {
        console.error('🔄 Storage error:', storageError)
        // Check if it's a quota error
        if (storageError.name === 'QuotaExceededError' ||
            (storageError.message && storageError.message.includes('quota'))) {
          throw new Error('Storage quota exceeded. Try deleting some old meetings.')
        } else {
          throw storageError
        }
      }

      // Trigger app reload to reflect changes
      window.dispatchEvent(new Event('meetingflow-storage-updated'))

      setManualSyncResult({
        success: true,
        message: `Synced! Found ${meetings.length} meetings, ${stakeholders.length} stakeholders, ${categories.length} categories.`
      })

      console.log('✅ Manual sync complete')
    } catch (error) {
      console.error('❌ Manual sync failed:', error)
      setManualSyncResult({
        success: false,
        message: `Sync failed: ${error.message}`
      })
    } finally {
      setManualSyncing(false)
    }
  }

  // Helper function to merge arrays by ID
  function mergeById(localItems, cloudItems) {
    const merged = new Map()

    // Add local items first
    localItems.forEach(item => {
      if (item.id) merged.set(item.id, item)
    })

    // Merge cloud items, keeping newer
    cloudItems.forEach(cloudItem => {
      if (!cloudItem.id) return
      const existing = merged.get(cloudItem.id)
      if (!existing) {
        merged.set(cloudItem.id, cloudItem)
      } else {
        const existingTime = new Date(existing.updatedAt || existing.createdAt || 0).getTime()
        const cloudTime = new Date(cloudItem.updatedAt || cloudItem.createdAt || cloudItem.lastModified || 0).getTime()
        if (cloudTime > existingTime) {
          merged.set(cloudItem.id, cloudItem)
        }
      }
    })

    return Array.from(merged.values())
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <SettingsIcon className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
                <p className="text-gray-600 hidden sm:block">Manage your application preferences and integrations</p>
              </div>
            </div>
            {/* Back/Home button */}
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              aria-label="Back to Home"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
              <span>Home</span>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-8 -mx-4 px-4 overflow-x-auto">
          <nav className="flex space-x-4 sm:space-x-8 min-w-max">
            <button
              onClick={() => setActiveTab('n8n')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'n8n'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <Workflow className="w-4 h-4" />
                Data Integration
              </div>
            </button>
            <button
              onClick={() => setActiveTab('ocr')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'ocr'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4" />
                OCR Configuration
              </div>
            </button>
            <button
              onClick={() => setActiveTab('claude')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'claude'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                Claude AI
              </div>
            </button>
            <button
              onClick={() => setActiveTab('sync')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'sync'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <Cloud className="w-4 h-4" />
                Cross-Device Sync
                {sync.isConfigured && (
                  <SyncStatusIndicator
                    syncStatus={sync.syncStatus}
                    isOnline={sync.isOnline}
                    hasError={sync.hasError}
                    hasConflict={sync.hasConflict}
                    showText={false}
                    size={12}
                  />
                )}
              </div>
            </button>
            <button
              onClick={() => setActiveTab('firestore')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'firestore'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4" />
                Firestore Sync
              </div>
            </button>
          </nav>
        </div>

        {/* Data Integration Tab */}
        {activeTab === 'n8n' && (
          <N8nSettings />
        )}


        {/* OCR Configuration Tab */}
        {activeTab === 'ocr' && (
          <div className="space-y-8">
            {/* OCR Status Overview */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">OCR Text Extraction</h3>
                  <p className="text-sm text-gray-600">Configure optical character recognition for better text extraction from images</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${ocrCapabilities.ocrSpace ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  <span className="text-sm font-medium text-gray-700">
                    {ocrCapabilities.ocrSpace ? 'OCR.space Connected' : 'Configure API Key'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className={`p-4 rounded-lg border-2 ${ocrCapabilities.ocrSpace ? 'border-green-200 bg-green-50' : 'border-yellow-200 bg-yellow-50'}`}>
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`w-2 h-2 rounded-full ${ocrCapabilities.ocrSpace ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
                    <h4 className="font-medium text-gray-900">OCR.space API</h4>
                  </div>
                  <p className="text-sm text-gray-600">
                    {ocrCapabilities.ocrSpace ? 'Connected - Professional OCR (85-90% accuracy)' : 'API key required for automatic text extraction'}
                  </p>
                </div>

                <div className="p-4 rounded-lg border-2 border-blue-200 bg-blue-50">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                    <h4 className="font-medium text-gray-900">Manual Entry</h4>
                  </div>
                  <p className="text-sm text-gray-600">
                    Always available - Type or paste text directly into meeting notes
                  </p>
                </div>
              </div>
            </div>

            {/* OCR.space API Configuration */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">OCR.space API Configuration</h3>

              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <h4 className="font-medium text-blue-900 mb-1">Get Your Free OCR.space API Key</h4>
                    <p className="text-sm text-blue-800 mb-2">
                      OCR.space provides high-quality text extraction with 25,000 free requests per month.
                      Get your free API key at <a href="https://ocr.space/ocrapi" target="_blank" rel="noopener noreferrer" className="underline font-medium">ocr.space/ocrapi</a>
                    </p>
                    <ul className="text-xs text-blue-700 space-y-1">
                      <li>• 99% accuracy, similar to Apple Photos</li>
                      <li>• 25,000 requests/month free tier</li>
                      <li>• Multiple OCR engines for best results</li>
                      <li>• Support for 24+ languages</li>
                    </ul>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="block text-sm font-medium text-gray-700">
                    OCR.space API Key
                  </label>
                  <div className="flex gap-3">
                    <div className="flex-1 relative">
                      <Key className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        value={ocrApiKey}
                        onChange={(e) => setOcrApiKey(e.target.value)}
                        placeholder="Enter your OCR.space API key"
                        className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <button
                      onClick={handleSaveOcrKey}
                      disabled={!ocrApiKey.trim()}
                      className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                        ocrKeySaved
                          ? 'bg-green-600 text-white'
                          : ocrApiKey.trim()
                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      {ocrKeySaved ? (
                        <div className="flex items-center gap-2">
                          <Check className="w-4 h-4" />
                          Saved
                        </div>
                      ) : (
                        'Save Key'
                      )}
                    </button>
                    {ocrCapabilities.ocrSpace && (
                      <button
                        onClick={handleClearOcrKey}
                        className="px-4 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">
                    Your API key is stored locally in your browser and never sent to our servers.
                  </p>
                </div>
              </div>
            </div>

            {/* OCR Processing Methods */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">How OCR Works</h3>
              <p className="text-sm text-gray-600 mb-4">
                MeetingFlow uses a simple, reliable approach for text extraction:
              </p>

              <div className="space-y-3">
                <div className="flex items-center gap-4 p-3 rounded-lg bg-blue-50 border border-blue-200">
                  <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-medium">1</div>
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900">OCR.space API</h4>
                    <p className="text-sm text-gray-600">Professional cloud OCR with 85-90% accuracy (similar to Apple Photos)</p>
                  </div>
                  <div className={`px-2 py-1 rounded text-xs font-medium ${
                    ocrCapabilities.ocrSpace ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {ocrCapabilities.ocrSpace ? 'Active' : 'Configure API key'}
                  </div>
                </div>

                <div className="flex items-center gap-4 p-3 rounded-lg bg-gray-50 border border-gray-200">
                  <div className="w-8 h-8 rounded-full bg-gray-600 text-white flex items-center justify-center text-sm font-medium">2</div>
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900">Manual Entry</h4>
                    <p className="text-sm text-gray-600">Type or paste text directly when OCR is unavailable</p>
                  </div>
                  <div className="px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
                    Always available
                  </div>
                </div>
              </div>

              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-gray-600">
                  <strong>Simple & Reliable:</strong> Configure your OCR.space API key below for automatic text extraction, or manually enter text anytime. The system automatically handles errors and provides clear feedback.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Claude AI Configuration Tab */}
        {activeTab === 'claude' && (
          <div className="space-y-8">
            {/* Claude AI Status Overview */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Claude AI Integration</h3>
                  <p className="text-sm text-gray-600">Configure Claude AI for intelligent meeting processing and insights</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${capabilities.claude ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  <span className="text-sm font-medium text-gray-700">
                    {capabilities.claude ? 'Connected' : 'Not configured'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className={`p-4 rounded-lg border-2 ${capabilities.claude ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`w-2 h-2 rounded-full ${capabilities.claude ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                    <h4 className="font-medium text-gray-900">AI Analysis</h4>
                  </div>
                  <p className="text-sm text-gray-600">
                    {capabilities.claude ? 'Active - AI insights available' : 'Configure API key to enable'}
                  </p>
                </div>

                <div className={`p-4 rounded-lg border-2 ${capabilities.claude ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`w-2 h-2 rounded-full ${capabilities.claude ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                    <h4 className="font-medium text-gray-900">Smart Summaries</h4>
                  </div>
                  <p className="text-sm text-gray-600">
                    {capabilities.claude ? 'Generating intelligent summaries' : 'API key required'}
                  </p>
                </div>

                <div className={`p-4 rounded-lg border-2 ${capabilities.claude ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`w-2 h-2 rounded-full ${capabilities.claude ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                    <h4 className="font-medium text-gray-900">Sentiment Analysis</h4>
                  </div>
                  <p className="text-sm text-gray-600">
                    {capabilities.claude ? 'Analyzing meeting sentiment' : 'Configure to enable'}
                  </p>
                </div>
              </div>
            </div>

            {/* Claude API Configuration */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Claude API Configuration</h3>

              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                  <Info className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <h4 className="font-medium text-purple-900 mb-1">Get Your Claude API Key</h4>
                    <p className="text-sm text-purple-800 mb-2">
                      Get your Claude API key from Anthropic Console at <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">console.anthropic.com</a>
                    </p>
                    <ul className="text-xs text-purple-700 space-y-1">
                      <li>• Intelligent meeting analysis and insights</li>
                      <li>• Automatic action item extraction</li>
                      <li>• Sentiment analysis and relationship tracking</li>
                      <li>• Smart meeting summaries</li>
                    </ul>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="block text-sm font-medium text-gray-700">
                    Claude API Key
                  </label>
                  <div className="flex gap-3">
                    <div className="flex-1 relative">
                      <Key className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                      <input
                        type="password"
                        value={claudeApiKey}
                        onChange={(e) => setClaudeApiKey(e.target.value)}
                        placeholder="Enter your Claude API key"
                        className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <button
                      onClick={handleSaveClaudeKey}
                      disabled={!claudeApiKey.trim()}
                      className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                        claudeKeySaved
                          ? 'bg-green-600 text-white'
                          : claudeApiKey.trim()
                            ? 'bg-purple-600 text-white hover:bg-purple-700'
                            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      {claudeKeySaved ? (
                        <div className="flex items-center gap-2">
                          <Check className="w-4 h-4" />
                          Saved
                        </div>
                      ) : (
                        'Save Key'
                      )}
                    </button>
                    {capabilities.claude && (
                      <button
                        onClick={handleClearClaudeKey}
                        className="px-4 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">
                    Your API key is stored locally in your browser and never sent to our servers.
                  </p>
                </div>
              </div>
            </div>

            {/* AI Features Overview */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">AI-Powered Features</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="font-medium text-gray-900">Meeting Analysis</h4>
                  <ul className="text-sm text-gray-600 space-y-2">
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-600" />
                      Automatic action item extraction
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-600" />
                      Intelligent meeting summaries
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-600" />
                      Key decision identification
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-600" />
                      Challenge and blocker detection
                    </li>
                  </ul>
                </div>
                <div className="space-y-4">
                  <h4 className="font-medium text-gray-900">Advanced Insights</h4>
                  <ul className="text-sm text-gray-600 space-y-2">
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-600" />
                      Sentiment analysis
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-600" />
                      Relationship tracking
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-600" />
                      Pattern recognition
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-600" />
                      Strategic recommendations
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Test Component Link */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Test New Features</h3>
              <p className="text-sm text-gray-600 mb-4">
                Try the new simplified meeting notes interface with enhanced editing and Claude AI integration.
              </p>
              <button
                onClick={() => navigate('/test-notes')}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Sparkles className="w-4 h-4" />
                Test New Meeting Notes
              </button>
            </div>
          </div>
        )}

        {/* Cross-Device Sync Tab */}
        {activeTab === 'sync' && (
          <div className="space-y-6">
            {/* Sync Conflict Resolution (if there's a conflict) */}
            {sync.hasConflict && sync.conflictData && (
              <SyncConflictResolver
                conflictData={sync.conflictData}
                onResolve={sync.resolveConflict}
                isResolving={sync.isResolvingConflict}
              />
            )}

            {/* Sync Setup (if not configured) */}
            {!sync.isConfigured && (
              <SyncSetup
                onSetupComplete={sync.configureSyncProvider}
                isConfiguring={sync.isConfiguring}
                syncError={sync.syncError}
              />
            )}

            {/* Sync Management (if configured) */}
            {sync.isConfigured && !sync.hasConflict && (
              <div className="space-y-6">
                {/* Sync Status Overview */}
                <div className="bg-white rounded-xl shadow-sm border p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">Cross-Device Sync</h3>
                      <p className="text-sm text-gray-600">Keep your meetings synchronized across all devices</p>
                    </div>
                    <SyncStatusIndicator
                      syncStatus={sync.syncStatus}
                      isOnline={sync.isOnline}
                      lastSyncTime={sync.lastSyncTime}
                      hasError={sync.hasError}
                      hasConflict={sync.hasConflict}
                      queuedOperations={sync.queuedOperations}
                    />
                  </div>

                  {/* Sync Stats */}
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
                    {(() => {
                      const stats = sync.getSyncStats()
                      return (
                        <>
                          <div className="p-4 bg-blue-50 rounded-lg">
                            <div className="text-2xl font-bold text-blue-600">{stats.meetings}</div>
                            <div className="text-sm text-gray-600">Meetings</div>
                          </div>
                          <div className="p-4 bg-green-50 rounded-lg">
                            <div className="text-2xl font-bold text-green-600">{stats.stakeholders}</div>
                            <div className="text-sm text-gray-600">Stakeholders</div>
                          </div>
                          <div className="p-4 bg-yellow-50 rounded-lg">
                            <div className="text-2xl font-bold text-yellow-600">{stats.categories}</div>
                            <div className="text-sm text-gray-600">Categories</div>
                          </div>
                          <div className="p-4 bg-purple-50 rounded-lg">
                            <div className="text-2xl font-bold text-purple-600">
                              {(stats.dataSize / 1024).toFixed(1)}KB
                            </div>
                            <div className="text-sm text-gray-600">Data Size</div>
                          </div>
                          <div className="p-4 bg-gray-50 rounded-lg">
                            <div className="text-2xl font-bold text-gray-600">
                              {stats.deviceInfo?.name?.split(' ')[0] || 'Device'}
                            </div>
                            <div className="text-sm text-gray-600">This Device</div>
                          </div>
                        </>
                      )
                    })()}
                  </div>

                  {/* Sync Actions */}
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={sync.forceSyncToCloud}
                      disabled={sync.isSyncingToCloud || !sync.canSync}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {sync.isSyncingToCloud ? (
                        <>
                          <RefreshCw size={16} className="animate-spin" />
                          Syncing...
                        </>
                      ) : (
                        <>
                          <Cloud size={16} />
                          Sync to Cloud
                        </>
                      )}
                    </button>

                    <button
                      onClick={sync.syncFromCloud}
                      disabled={sync.isSyncingFromCloud || !sync.canSync}
                      className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {sync.isSyncingFromCloud ? (
                        <>
                          <RefreshCw size={16} className="animate-spin" />
                          Syncing...
                        </>
                      ) : (
                        <>
                          <RefreshCw size={16} />
                          Sync from Cloud
                        </>
                      )}
                    </button>

                    <button
                      onClick={sync.testConnection}
                      className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <Check size={16} />
                      Test Connection
                    </button>
                  </div>

                  {/* Emergency Export Button - Works on Mobile PWA */}
                  <div className="mt-6 p-4 bg-red-50 border-2 border-red-200 rounded-lg">
                    <h4 className="font-semibold text-red-900 mb-2 flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      Emergency Data Export
                    </h4>
                    <p className="text-sm text-red-800 mb-3">
                      Export all your data as a downloadable file. Use this if sync isn't working or to create a manual backup.
                    </p>
                    <button
                      onClick={() => {
                        try {
                          // Get all data from localStorage
                          const meetings = JSON.parse(localStorage.getItem('meetingflow_meetings') || '[]')
                          const stakeholders = JSON.parse(localStorage.getItem('meetingflow_stakeholders') || '[]')
                          const categories = JSON.parse(localStorage.getItem('meetingflow_stakeholder_categories') || '[]')

                          if (meetings.length === 0) {
                            alert('⚠️ No meetings found to export')
                            return
                          }

                          // Create backup object
                          const backup = {
                            meetings: meetings,
                            stakeholders: stakeholders,
                            categories: categories,
                            exportedAt: new Date().toISOString(),
                            exportedFrom: 'emergency-export',
                            deviceInfo: {
                              userAgent: navigator.userAgent,
                              platform: navigator.platform,
                              language: navigator.language
                            }
                          }

                          // Create and download file
                          const jsonString = JSON.stringify(backup, null, 2)
                          const blob = new Blob([jsonString], { type: 'application/json' })
                          const url = URL.createObjectURL(blob)
                          const a = document.createElement('a')
                          a.href = url
                          a.download = `meetingflow-emergency-backup-${Date.now()}.json`
                          a.style.display = 'none'
                          document.body.appendChild(a)
                          a.click()

                          // Cleanup
                          setTimeout(() => {
                            document.body.removeChild(a)
                            URL.revokeObjectURL(url)
                          }, 100)

                          alert(`✅ EXPORTED ${meetings.length} MEETINGS!\n\n📧 File downloaded. Email it to yourself immediately!\n\n⚠️ DO NOT close this app until you've confirmed the file is saved!`)

                        } catch (error) {
                          console.error('Export error:', error)
                          alert('❌ Export failed: ' + error.message)
                        }
                      }}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download Emergency Backup
                    </button>
                  </div>

                  {/* Last Sync Info */}
                  {sync.lastSyncTime && (
                    <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                      <div className="text-sm text-gray-600">
                        Last synced: {new Date(sync.lastSyncTime).toLocaleString()}
                      </div>
                    </div>
                  )}
                </div>

                {/* Sync Provider Info */}
                <div className="bg-white rounded-xl shadow-sm border p-6">
                  <h4 className="font-semibold text-gray-900 mb-4">Sync Provider</h4>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-gray-900">
                        {sync.syncConfig?.provider === 'github_gist' ? 'GitHub Gist' : sync.syncConfig?.provider}
                      </div>
                      <div className="text-sm text-gray-600">
                        Device: {sync.deviceInfo?.name} ({sync.deviceInfo?.id?.substring(0, 8)}...)
                      </div>
                    </div>
                    <button
                      onClick={sync.clearSyncData}
                      className="px-3 py-1 text-sm text-red-600 hover:text-red-800 transition-colors"
                    >
                      Disconnect
                    </button>
                  </div>
                </div>

                {/* Sync Help */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-medium text-blue-900 mb-2">How Sync Works</h4>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li>• Data is automatically synced when you make changes</li>
                    <li>• Conflicts are detected and can be resolved manually</li>
                    <li>• Data is encrypted and stored securely in your chosen provider</li>
                    <li>• You can disable sync at any time without losing local data</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Firestore Sync Tab */}
        {activeTab === 'firestore' && (
          <div className="space-y-6">
            {/* Firestore Status Overview */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Firestore Cloud Sync</h3>
                  <p className="text-sm text-gray-600">Real-time sync across all your devices using Google Firestore</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <span className="text-sm font-medium text-gray-700">Connected</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg border-2 border-green-200 bg-green-50">
                  <div className="flex items-center gap-3 mb-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <h4 className="font-medium text-gray-900">Real-Time Sync</h4>
                  </div>
                  <p className="text-sm text-gray-600">
                    Changes sync instantly across all devices
                  </p>
                </div>

                <div className="p-4 rounded-lg border-2 border-green-200 bg-green-50">
                  <div className="flex items-center gap-3 mb-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <h4 className="font-medium text-gray-900">Offline Support</h4>
                  </div>
                  <p className="text-sm text-gray-600">
                    Works offline, syncs when back online
                  </p>
                </div>
              </div>
            </div>

            {/* Your Device ID */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Your Device ID</h3>
              <p className="text-sm text-gray-600 mb-4">
                This ID links all your data together. Copy it to use on another device.
              </p>

              <div className="flex gap-3 items-center">
                <div className="flex-1 p-3 bg-gray-100 rounded-lg font-mono text-sm break-all">
                  {firestoreUserId}
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(firestoreUserId)
                    alert('Device ID copied to clipboard!')
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Copy
                </button>
              </div>

              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>To sync another device:</strong> Copy this ID, then paste it on your other device in the "Link Device" section below.
                </p>
              </div>
            </div>

            {/* iOS Notice */}
            {IS_IOS && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <h4 className="font-medium text-yellow-900 mb-2">iOS Device Detected</h4>
                <p className="text-sm text-yellow-800">
                  Firestore sync is available but works differently on iOS.
                  Use "Manual Sync" below to sync your data. Changes sync every 30 seconds when enabled.
                </p>
              </div>
            )}

            {/* Link Another Device */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Link Another Device</h3>
              <p className="text-sm text-gray-600 mb-4">
                If you have a Device ID from another device, paste it here to sync with that device's data.
                {IS_IOS && " After linking, use the Manual Sync button to fetch data."}
              </p>

              <div className="flex gap-3">
                <input
                  type="text"
                  placeholder="Paste Device ID from another device"
                  className="flex-1 p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  id="link-device-input"
                />
                <button
                  onClick={() => {
                    const input = document.getElementById('link-device-input')
                    if (input.value.trim()) {
                      if (confirm('This will set your Device ID to sync with another device. Continue?')) {
                        handleLinkDevice(input.value)
                      }
                    }
                  }}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                  Link Device
                </button>
              </div>
            </div>

            {/* Manual Sync - Fetch from Firestore */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Manual Sync</h3>
              <p className="text-sm text-gray-600 mb-4">
                Click to fetch the latest data from Firestore.
                {IS_IOS ? " On iOS, use this after linking a device to get your data." : " Use this if automatic sync isn't working."}
              </p>

              {/* Sync Result Message */}
              {manualSyncResult && (
                <div className={`mb-4 p-4 rounded-lg ${manualSyncResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  <div className="flex items-center gap-2">
                    {manualSyncResult.success ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : (
                      <Info className="w-5 h-5 text-red-600" />
                    )}
                    <p className={`text-sm ${manualSyncResult.success ? 'text-green-800' : 'text-red-800'}`}>
                      {manualSyncResult.message}
                    </p>
                  </div>
                </div>
              )}

              <button
                onClick={handleManualSync}
                disabled={manualSyncing}
                className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors ${
                  manualSyncing
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {manualSyncing ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-5 h-5" />
                    Sync Now
                  </>
                )}
              </button>
            </div>

            {/* Import Existing Data */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Import Local Data to Firestore</h3>
              <p className="text-sm text-gray-600 mb-4">
                If you have existing meetings saved locally, click the button below to upload them to Firestore.
                This is a one-time migration to move your data to the cloud.
              </p>

              {/* Import Result Message */}
              {firestoreImportResult && (
                <div className={`mb-4 p-4 rounded-lg ${firestoreImportResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  <div className="flex items-center gap-2">
                    {firestoreImportResult.success ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : (
                      <Info className="w-5 h-5 text-red-600" />
                    )}
                    <p className={`text-sm ${firestoreImportResult.success ? 'text-green-800' : 'text-red-800'}`}>
                      {firestoreImportResult.message}
                    </p>
                  </div>
                </div>
              )}

              <button
                onClick={handleFirestoreImport}
                disabled={firestoreImporting}
                className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors ${
                  firestoreImporting
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-orange-600 hover:bg-orange-700 text-white'
                }`}
              >
                {firestoreImporting ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5" />
                    Import Local Data to Firestore
                  </>
                )}
              </button>

              <p className="mt-3 text-xs text-gray-500">
                Note: This will upload all your local meetings, stakeholders, and categories to Firestore.
                Existing data in Firestore will be merged with your local data.
              </p>
            </div>

            {/* How Firestore Sync Works */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 mb-2">How Firestore Sync Works</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Data syncs automatically in real-time - no manual sync needed</li>
                <li>• Works offline - changes sync when you're back online</li>
                <li>• All devices with the same Device ID share the same data</li>
                <li>• Deletions sync across devices too</li>
              </ul>
            </div>

            {/* Firebase Debug Panel */}
            <FirebaseDebugPanel />
          </div>
        )}

      </div>
    </div>
  )
}

