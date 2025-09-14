import React, { useState, useEffect } from 'react'
import {
  Settings as SettingsIcon,
  Users,
  Plus,
  Search,
  Filter,
  Download,
  Upload,
  Edit3,
  Trash2,
  Save,
  X,
  Check,
  AlertCircle,
  User,
  Mail,
  Phone,
  MapPin,
  Building,
  Tag,
  Calendar,
  Star,
  Activity,
  Eye,
  Key,
  Info
} from 'lucide-react'
import { useApp } from '../contexts/AppContext'
import {
  STAKEHOLDER_CATEGORIES,
  STAKEHOLDER_PRIORITIES,
  RELATIONSHIP_HEALTH,
  getHealthColor,
  getPriorityColor,
  getCategoryColor
} from '../utils/stakeholderManager'
import { setOCRApiKey, getOCRCapabilities } from '../utils/ocrService'
import { setClaudeApiKey, getCapabilities } from '../utils/ocrServiceNew'

export default function Settings() {
  const {
    stakeholders,
    stakeholderCategories,
    addStakeholder,
    updateStakeholder,
    deleteStakeholder,
    addStakeholderCategory,
    updateStakeholderCategory,
    deleteStakeholderCategory
  } = useApp()
  const [activeTab, setActiveTab] = useState('stakeholders')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedPriority, setSelectedPriority] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingStakeholder, setEditingStakeholder] = useState(null)
  const [importData, setImportData] = useState('')

  // Category management state
  const [showAddCategoryForm, setShowAddCategoryForm] = useState(false)
  const [editingCategory, setEditingCategory] = useState(null)

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
    localStorage.setItem('claudeApiKey', claudeApiKey)
    setClaudeApiKey(claudeApiKey)
    setCapabilities(getCapabilities())
    setClaudeKeySaved(true)
    setTimeout(() => setClaudeKeySaved(false), 3000)
  }

  const handleClearClaudeKey = () => {
    setClaudeApiKey('')
    localStorage.removeItem('claudeApiKey')
    setClaudeApiKey('')
    setCapabilities(getCapabilities())
  }

  // Filter stakeholders based on search and filters
  const filteredStakeholders = stakeholders.filter(stakeholder => {
    const matchesSearch = !searchQuery ||
      stakeholder.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      stakeholder.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      stakeholder.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
      stakeholder.department.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesCategory = !selectedCategory || stakeholder.category === selectedCategory
    const matchesPriority = !selectedPriority || stakeholder.priority === selectedPriority

    return matchesSearch && matchesCategory && matchesPriority
  })

  const exportStakeholders = () => {
    const exportData = {
      stakeholders: stakeholders,
      exportedAt: new Date().toISOString(),
      version: '1.0'
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json'
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `meetingflow-stakeholders-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const importStakeholders = () => {
    try {
      const data = JSON.parse(importData)
      if (data.stakeholders && Array.isArray(data.stakeholders)) {
        data.stakeholders.forEach(stakeholder => {
          addStakeholder({
            ...stakeholder,
            id: undefined, // Let the system generate new IDs
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          })
        })
        setImportData('')
        alert(`Successfully imported ${data.stakeholders.length} stakeholders`)
      } else {
        throw new Error('Invalid data format')
      }
    } catch (error) {
      alert('Error importing data. Please check the format.')
    }
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
              <p className="text-gray-600">Manage your stakeholders and application preferences</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-8">
          <nav className="flex space-x-8">
            <button
              onClick={() => setActiveTab('stakeholders')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'stakeholders'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                Stakeholder Management
              </div>
            </button>
            <button
              onClick={() => setActiveTab('categories')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'categories'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4" />
                Category Management
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
          </nav>
        </div>

        {/* Stakeholder Management Tab */}
        {activeTab === 'stakeholders' && (
          <div className="space-y-8">
            {/* Controls */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
                <div className="flex flex-col sm:flex-row gap-4 flex-1">
                  {/* Search */}
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                      type="text"
                      placeholder="Search stakeholders..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 pr-4 py-2 w-full border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  {/* Filters */}
                  <div className="flex gap-2">
                    <select
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                      className="px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">All Categories</option>
                      {stakeholderCategories.map(category => (
                        <option key={category.key} value={category.key}>
                          {category.label}
                        </option>
                      ))}
                    </select>

                    <select
                      value={selectedPriority}
                      onChange={(e) => setSelectedPriority(e.target.value)}
                      className="px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">All Priorities</option>
                      {Object.values(STAKEHOLDER_PRIORITIES).map(priority => (
                        <option key={priority} value={priority}>
                          {priority.charAt(0).toUpperCase() + priority.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowAddForm(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add Stakeholder
                  </button>

                  <button
                    onClick={exportStakeholders}
                    className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Export
                  </button>
                </div>
              </div>

              {/* Import Section */}
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <textarea
                      placeholder="Paste JSON data to import stakeholders..."
                      value={importData}
                      onChange={(e) => setImportData(e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <button
                    onClick={importStakeholders}
                    disabled={!importData.trim()}
                    className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Upload className="w-4 h-4" />
                    Import
                  </button>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white rounded-xl shadow-sm border p-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Users className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{stakeholders.length}</p>
                    <p className="text-sm text-gray-600">Total Stakeholders</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border p-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-100 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-red-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">
                      {stakeholders.filter(s => s.priority === STAKEHOLDER_PRIORITIES.CRITICAL).length}
                    </p>
                    <p className="text-sm text-gray-600">Critical Priority</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border p-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-100 rounded-lg">
                    <Star className="w-5 h-5 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">
                      {stakeholders.filter(s => s.priority === STAKEHOLDER_PRIORITIES.HIGH).length}
                    </p>
                    <p className="text-sm text-gray-600">High Priority</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border p-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <Activity className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">
                      {filteredStakeholders.length}
                    </p>
                    <p className="text-sm text-gray-600">Filtered Results</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Stakeholder List */}
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Stakeholders</h3>
              </div>

              <div className="divide-y divide-gray-200">
                {filteredStakeholders.length === 0 ? (
                  <div className="p-8 text-center">
                    <Users className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No stakeholders found</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      {stakeholders.length === 0
                        ? "Get started by adding your first stakeholder."
                        : "Try adjusting your search or filters."
                      }
                    </p>
                  </div>
                ) : (
                  filteredStakeholders.map((stakeholder) => (
                    <StakeholderRow
                      key={stakeholder.id}
                      stakeholder={stakeholder}
                      onEdit={setEditingStakeholder}
                      onDelete={(id) => {
                        if (window.confirm('Are you sure you want to delete this stakeholder?')) {
                          deleteStakeholder(id)
                        }
                      }}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Category Management Tab */}
        {activeTab === 'categories' && (
          <div className="space-y-8">
            {/* Category Controls */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Stakeholder Categories</h3>
                  <p className="text-sm text-gray-600">Manage the categories used to organize your stakeholders</p>
                </div>
                <button
                  onClick={() => setShowAddCategoryForm(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Category
                </button>
              </div>
            </div>

            {/* Category List */}
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Categories</h3>
              </div>

              <div className="divide-y divide-gray-200">
                {stakeholderCategories.length === 0 ? (
                  <div className="p-8 text-center">
                    <Tag className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No categories found</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Get started by adding your first category.
                    </p>
                  </div>
                ) : (
                  stakeholderCategories.map((category) => (
                    <CategoryRow
                      key={category.key}
                      category={category}
                      stakeholders={stakeholders}
                      onEdit={setEditingCategory}
                      onDelete={(categoryKey) => {
                        if (window.confirm('Are you sure you want to delete this category? All stakeholders using this category will be moved to the default category.')) {
                          deleteStakeholderCategory(categoryKey)
                        }
                      }}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
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
                  <div className={`w-3 h-3 rounded-full ${ocrCapabilities.ocrSpace ? 'bg-green-500' : ocrCapabilities.tesseract ? 'bg-yellow-500' : 'bg-red-500'}`}></div>
                  <span className="text-sm font-medium text-gray-700">
                    {ocrCapabilities.ocrSpace ? 'High Quality' : ocrCapabilities.tesseract ? 'Basic Quality' : 'Manual Only'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className={`p-4 rounded-lg border-2 ${ocrCapabilities.textDetector ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`w-2 h-2 rounded-full ${ocrCapabilities.textDetector ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                    <h4 className="font-medium text-gray-900">Browser TextDetector</h4>
                  </div>
                  <p className="text-sm text-gray-600">
                    {ocrCapabilities.textDetector ? 'Available (Experimental)' : 'Not supported in this browser'}
                  </p>
                </div>

                <div className={`p-4 rounded-lg border-2 ${ocrCapabilities.ocrSpace ? 'border-green-200 bg-green-50' : 'border-yellow-200 bg-yellow-50'}`}>
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`w-2 h-2 rounded-full ${ocrCapabilities.ocrSpace ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
                    <h4 className="font-medium text-gray-900">OCR.space API</h4>
                  </div>
                  <p className="text-sm text-gray-600">
                    {ocrCapabilities.ocrSpace ? 'Configured (Best Quality)' : 'API key required'}
                  </p>
                </div>

                <div className={`p-4 rounded-lg border-2 ${ocrCapabilities.tesseract ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-gray-50'}`}>
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`w-2 h-2 rounded-full ${ocrCapabilities.tesseract ? 'bg-blue-500' : 'bg-gray-400'}`}></div>
                    <h4 className="font-medium text-gray-900">Tesseract.js</h4>
                  </div>
                  <p className="text-sm text-gray-600">
                    {ocrCapabilities.tesseract ? 'Ready (Fallback)' : 'Initializing...'}
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

            {/* OCR Processing Hierarchy */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">OCR Processing Order</h3>
              <p className="text-sm text-gray-600 mb-4">
                MeetingFlow uses multiple OCR methods in this priority order for best results:
              </p>

              <div className="space-y-3">
                <div className="flex items-center gap-4 p-3 rounded-lg bg-green-50 border border-green-200">
                  <div className="w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center text-sm font-medium">1</div>
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900">TextDetector API</h4>
                    <p className="text-sm text-gray-600">Browser-native OCR (Chrome experimental feature)</p>
                  </div>
                  <div className={`px-2 py-1 rounded text-xs font-medium ${
                    ocrCapabilities.textDetector ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {ocrCapabilities.textDetector ? 'Available' : 'Not supported'}
                  </div>
                </div>

                <div className="flex items-center gap-4 p-3 rounded-lg bg-blue-50 border border-blue-200">
                  <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-medium">2</div>
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900">OCR.space API</h4>
                    <p className="text-sm text-gray-600">Professional cloud OCR with 85-90% accuracy</p>
                  </div>
                  <div className={`px-2 py-1 rounded text-xs font-medium ${
                    ocrCapabilities.ocrSpace ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {ocrCapabilities.ocrSpace ? 'Configured' : 'API key needed'}
                  </div>
                </div>

                <div className="flex items-center gap-4 p-3 rounded-lg bg-yellow-50 border border-yellow-200">
                  <div className="w-8 h-8 rounded-full bg-yellow-600 text-white flex items-center justify-center text-sm font-medium">3</div>
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900">Tesseract.js</h4>
                    <p className="text-sm text-gray-600">Local browser OCR fallback (basic quality)</p>
                  </div>
                  <div className={`px-2 py-1 rounded text-xs font-medium ${
                    ocrCapabilities.tesseract ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {ocrCapabilities.tesseract ? 'Ready' : 'Initializing'}
                  </div>
                </div>

                <div className="flex items-center gap-4 p-3 rounded-lg bg-gray-50 border border-gray-200">
                  <div className="w-8 h-8 rounded-full bg-gray-600 text-white flex items-center justify-center text-sm font-medium">4</div>
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900">Manual Entry</h4>
                    <p className="text-sm text-gray-600">Fallback when OCR is unavailable</p>
                  </div>
                  <div className="px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
                    Always available
                  </div>
                </div>
              </div>

              <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <p className="text-sm text-gray-600">
                  <strong>Tip:</strong> Configure an OCR.space API key for the best text extraction quality.
                  The system will automatically use the best available method for each image.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Add/Edit Stakeholder Modal */}
        {(showAddForm || editingStakeholder) && (
          <StakeholderModal
            stakeholder={editingStakeholder}
            onSave={(stakeholderData) => {
              if (editingStakeholder) {
                updateStakeholder({ ...editingStakeholder, ...stakeholderData })
                setEditingStakeholder(null)
              } else {
                addStakeholder(stakeholderData)
                setShowAddForm(false)
              }
            }}
            onCancel={() => {
              setEditingStakeholder(null)
              setShowAddForm(false)
            }}
          />
        )}

        {/* Add/Edit Category Modal */}
        {(showAddCategoryForm || editingCategory) && (
          <CategoryModal
            category={editingCategory}
            onSave={(categoryData) => {
              if (editingCategory) {
                updateStakeholderCategory({ ...editingCategory, ...categoryData })
                setEditingCategory(null)
              } else {
                addStakeholderCategory(categoryData)
                setShowAddCategoryForm(false)
              }
            }}
            onCancel={() => {
              setEditingCategory(null)
              setShowAddCategoryForm(false)
            }}
          />
        )}
      </div>
    </div>
  )
}

// Stakeholder Row Component
function StakeholderRow({ stakeholder, onEdit, onDelete }) {
  const { stakeholderCategories } = useApp()
  const categoryInfo = stakeholderCategories.find(cat => cat.key === stakeholder.category)

  return (
    <div className="p-6 hover:bg-gray-50 transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4 flex-1">
          {/* Avatar */}
          <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
            <User className="w-5 h-5 text-gray-600" />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h4 className="text-sm font-medium text-gray-900 truncate">{stakeholder.name}</h4>

              {/* Priority Badge */}
              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${getPriorityColor(stakeholder.priority)}`}>
                {stakeholder.priority.charAt(0).toUpperCase() + stakeholder.priority.slice(1)}
              </span>

              {/* Category Badge */}
              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-${categoryInfo?.color || 'gray'}-100 text-${categoryInfo?.color || 'gray'}-800 border border-${categoryInfo?.color || 'gray'}-200`}>
                {categoryInfo?.label || stakeholder.category}
              </span>
            </div>

            <div className="flex items-center gap-4 text-sm text-gray-600">
              <span>{stakeholder.role}</span>
              {stakeholder.department && <span>• {stakeholder.department}</span>}
              {stakeholder.email && <span>• {stakeholder.email}</span>}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onEdit(stakeholder)}
            className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
            title="Edit stakeholder"
          >
            <Edit3 className="w-4 h-4" />
          </button>

          <button
            onClick={() => onDelete(stakeholder.id)}
            className="p-1 text-gray-400 hover:text-red-600 transition-colors"
            title="Delete stakeholder"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

// Stakeholder Modal Component
function StakeholderModal({ stakeholder, onSave, onCancel }) {
  const { stakeholderCategories } = useApp()
  const [formData, setFormData] = useState({
    name: stakeholder?.name || '',
    email: stakeholder?.email || '',
    role: stakeholder?.role || '',
    department: stakeholder?.department || '',
    category: stakeholder?.category || STAKEHOLDER_CATEGORIES.EXTERNAL.key,
    priority: stakeholder?.priority || STAKEHOLDER_PRIORITIES.MEDIUM,
    phone: stakeholder?.phone || '',
    location: stakeholder?.location || '',
    notes: stakeholder?.notes || '',
    tags: stakeholder?.tags?.join(', ') || '',
    relationshipHealth: stakeholder?.relationshipHealth || RELATIONSHIP_HEALTH.NEUTRAL,
    communicationPreference: stakeholder?.communicationPreference || 'email',
    decisionMakingLevel: stakeholder?.decisionMakingLevel || 'contributor',
    influence: stakeholder?.influence || 'medium'
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave({
      ...formData,
      tags: formData.tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0)
    })
  }

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">
              {stakeholder ? 'Edit Stakeholder' : 'Add New Stakeholder'}
            </h2>
            <button
              onClick={onCancel}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Basic Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900">Basic Information</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role
                </label>
                <input
                  type="text"
                  value={formData.role}
                  onChange={(e) => handleChange('role', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Department
                </label>
                <input
                  type="text"
                  value={formData.department}
                  onChange={(e) => handleChange('department', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category *
                </label>
                <select
                  required
                  value={formData.category}
                  onChange={(e) => handleChange('category', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {stakeholderCategories.map(category => (
                    <option key={category.key} value={category.key}>
                      {category.label} - {category.description}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Priority *
                </label>
                <select
                  required
                  value={formData.priority}
                  onChange={(e) => handleChange('priority', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {Object.values(STAKEHOLDER_PRIORITIES).map(priority => (
                    <option key={priority} value={priority}>
                      {priority.charAt(0).toUpperCase() + priority.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Contact Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900">Contact Information</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Location
                </label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => handleChange('location', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Communication Preference
                </label>
                <select
                  value={formData.communicationPreference}
                  onChange={(e) => handleChange('communicationPreference', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="email">Email</option>
                  <option value="phone">Phone</option>
                  <option value="slack">Slack</option>
                  <option value="in-person">In Person</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Decision Making Level
                </label>
                <select
                  value={formData.decisionMakingLevel}
                  onChange={(e) => handleChange('decisionMakingLevel', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="contributor">Contributor</option>
                  <option value="manager">Manager</option>
                  <option value="director">Director</option>
                  <option value="executive">Executive</option>
                </select>
              </div>
            </div>
          </div>

          {/* Additional Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900">Additional Information</h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tags (comma-separated)
              </label>
              <input
                type="text"
                value={formData.tags}
                onChange={(e) => handleChange('tags', e.target.value)}
                placeholder="e.g., key decision maker, technical expert, budget owner"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => handleChange('notes', e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Any additional notes or context about this stakeholder..."
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {stakeholder ? 'Update' : 'Add'} Stakeholder
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Category Row Component
function CategoryRow({ category, stakeholders, onEdit, onDelete }) {
  const stakeholderCount = stakeholders.filter(s => s.category === category.key).length

  return (
    <div className="p-6 hover:bg-gray-50 transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4 flex-1">
          {/* Category Color */}
          <div className={`w-10 h-10 rounded-full flex items-center justify-center bg-${category.color || 'gray'}-100`}>
            <Tag className={`w-5 h-5 text-${category.color || 'gray'}-600`} />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h4 className="text-sm font-medium text-gray-900">{category.label}</h4>
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                {stakeholderCount} stakeholder{stakeholderCount !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="text-sm text-gray-600">
              <span>{category.description}</span>
              {category.defaultPriority && (
                <span className="ml-2">• Default priority: {category.defaultPriority}</span>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onEdit(category)}
            className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
            title="Edit category"
          >
            <Edit3 className="w-4 h-4" />
          </button>

          <button
            onClick={() => onDelete(category.key)}
            className="p-1 text-gray-400 hover:text-red-600 transition-colors"
            title="Delete category"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

// Category Modal Component
function CategoryModal({ category, onSave, onCancel }) {
  const [formData, setFormData] = useState({
    label: category?.label || '',
    description: category?.description || '',
    color: category?.color || 'blue',
    defaultPriority: category?.defaultPriority || 'medium'
  })

  const availableColors = [
    'blue', 'green', 'purple', 'red', 'yellow', 'indigo', 'pink', 'gray'
  ]

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave({
      ...formData,
      key: category?.key || formData.label.toLowerCase().replace(/\s+/g, '-')
    })
  }

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 rounded-t-xl">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">
              {category ? 'Edit Category' : 'Add New Category'}
            </h2>
            <button
              onClick={onCancel}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Basic Information */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Category Name *
              </label>
              <input
                type="text"
                required
                value={formData.label}
                onChange={(e) => handleChange('label', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., External Partners"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => handleChange('description', e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Brief description of this category..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Color Theme
              </label>
              <div className="grid grid-cols-4 gap-2">
                {availableColors.map(color => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => handleChange('color', color)}
                    className={`w-10 h-10 rounded-lg bg-${color}-100 border-2 transition-colors ${
                      formData.color === color ? `border-${color}-500` : 'border-transparent'
                    }`}
                  >
                    <div className={`w-4 h-4 bg-${color}-500 rounded-full mx-auto`}></div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Default Priority
              </label>
              <select
                value={formData.defaultPriority}
                onChange={(e) => handleChange('defaultPriority', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {category ? 'Update' : 'Add'} Category
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}