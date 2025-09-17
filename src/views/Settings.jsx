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
  Workflow
} from 'lucide-react'
import { setOCRApiKey, getOCRCapabilities } from '../utils/ocrService'
import { setClaudeApiKey as updateClaudeApiKey, getCapabilities } from '../utils/ocrServiceNew'
import N8nSettings from '../components/N8nSettings'

export default function Settings() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('n8n')

  // OCR configuration state
  const [ocrApiKey, setOcrApiKey] = useState(localStorage.getItem('ocrApiKey') || '')
  const [ocrCapabilities, setOcrCapabilities] = useState(getOCRCapabilities())
  const [ocrKeySaved, setOcrKeySaved] = useState(false)

  // Claude AI configuration state
  const [claudeApiKey, setClaudeApiKey] = useState(localStorage.getItem('claudeApiKey') || '')
  const [claudeKeySaved, setClaudeKeySaved] = useState(false)
  const [capabilities, setCapabilities] = useState(getCapabilities())

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


  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-100 rounded-lg">
              <SettingsIcon className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
              <p className="text-gray-600">Manage your application preferences and integrations</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-8">
          <nav className="flex space-x-8">
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

      </div>
    </div>
  )
}

