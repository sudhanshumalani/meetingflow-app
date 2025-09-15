import React, { useState } from 'react'
import { Edit3, Save, Camera, Upload, AlertCircle, CheckCircle, Loader2, Sparkles, Zap, Clock, Download } from 'lucide-react'
import { extractTextFromImage, setOCRApiKey, setClaudeApiKey, getCapabilities } from '../utils/ocrServiceNew'
import { useAIAnalysis } from '../hooks/useAIAnalysis'

export default function SimpleMeetingNotes() {
  // Core state
  const [notes, setNotes] = useState({
    keyDiscussionPoints: '',
    actionItems: ''
  })

  const [extractedText, setExtractedText] = useState('')
  const [isEditingText, setIsEditingText] = useState(false)
  const [ocrProgress, setOcrProgress] = useState(0)
  const [ocrStatus, setOcrStatus] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

  // Enhanced AI Analysis Hook
  const {
    result: aiResult,
    isAnalyzing,
    error: aiError,
    progress: aiProgress,
    analyze,
    cancel: cancelAnalysis,
    clear: clearAnalysis,
    exportResults,
    hasResult,
    isStreaming,
    capabilities
  } = useAIAnalysis()

  // Section definitions
  const sections = [
    { key: 'keyDiscussionPoints', title: 'Key Discussion Points', icon: '💬', color: 'blue' },
    { key: 'actionItems', title: 'Action Items', icon: '📋', color: 'purple' }
  ]

  // Handle section editing
  const updateSection = (sectionKey, value) => {
    console.log('Updating section:', sectionKey, 'with value:', value.substring(0, 50) + '...')
    setNotes(prev => ({
      ...prev,
      [sectionKey]: value
    }))
  }

  // Handle extracted text editing
  const updateExtractedText = (value) => {
    console.log('Updating extracted text:', value.substring(0, 50) + '...')
    setExtractedText(value)
  }

  // Handle image upload
  const handleImageUpload = async (file) => {
    console.log('Processing image:', file.name)
    setIsProcessing(true)
    setOcrProgress(0)
    setOcrStatus('Processing image...')

    try {
      const result = await extractTextFromImage(file, {
        onProgress: (progress) => {
          setOcrProgress(progress)
          if (progress < 30) setOcrStatus('Uploading image...')
          else if (progress < 70) setOcrStatus('Extracting text...')
          else setOcrStatus('Processing results...')
        }
      })

      console.log('OCR result:', result)

      if (result.success && result.text) {
        setExtractedText(result.text)
        setOcrStatus('Text extracted successfully!')

        // If it's real OCR text (not fallback), process with AI first
        if (!result.isFallback && result.text.length > 20) {
          // Try Claude AI first for smart categorization
          if (capabilities.claude) {
            console.log('Processing with Claude AI for smart categorization...')
            await handleAIAnalysis(result.text)
          } else {
            console.log('No Claude AI available, using simple distribution')
            distributeTextToSections(result.text)
          }
        }
      } else {
        setOcrStatus('OCR failed - please enter text manually')
      }
    } catch (error) {
      console.error('Image processing error:', error)
      setOcrStatus('Error processing image')
    } finally {
      setIsProcessing(false)
      setTimeout(() => {
        setOcrProgress(0)
        setOcrStatus('')
      }, 3000)
    }
  }

  // Distribute text across sections
  const distributeTextToSections = (text) => {
    console.log('Distributing text to sections:', text.length, 'characters')

    const lines = text.split('\n').filter(line => line.trim().length > 0)
    const halfLength = Math.ceil(lines.length / 2)

    setNotes({
      keyDiscussionPoints: lines.slice(0, halfLength).join('\n'),
      actionItems: lines.slice(halfLength).map(line => `• ${line}`).join('\n')
    })

    console.log('Text distributed across 2 sections')
  }

  // Enhanced AI Processing with seamless UX
  const handleAIAnalysis = async (text) => {
    if (!text?.trim()) {
      setOcrStatus('No text to analyze')
      return
    }

    console.log('🚀 Starting enhanced Claude AI analysis...')
    setOcrStatus('Analyzing with Claude AI...')

    try {
      // Use the enhanced AI analysis hook
      const result = await analyze(text, {
        meetingType: 'general',
        timestamp: new Date().toISOString()
      })

      if (result) {
        setOcrStatus('AI analysis complete!')

        // Populate sections with AI-structured data
        const newNotes = {
          keyDiscussionPoints: '',
          actionItems: ''
        }

        // Handle key discussion points
        if (Array.isArray(result.keyDiscussionPoints)) {
          newNotes.keyDiscussionPoints = result.keyDiscussionPoints.join('\n\n')
        } else if (typeof result.keyDiscussionPoints === 'string') {
          newNotes.keyDiscussionPoints = result.keyDiscussionPoints
        }

        // Handle action items with enhanced formatting
        if (Array.isArray(result.actionItems)) {
          newNotes.actionItems = result.actionItems.map(item => {
            if (typeof item === 'object' && item.task) {
              const priority = item.priority ? `[${item.priority.toUpperCase()}]` : ''
              const assignee = item.assignee && item.assignee !== 'Unassigned' ? `@${item.assignee}` : ''
              const dueDate = item.dueDate ? `(Due: ${item.dueDate})` : ''
              const confidence = item.confidence ? `(${Math.round(item.confidence * 100)}% confidence)` : ''
              return `• ${item.task} ${assignee} ${priority} ${dueDate} ${confidence}`.trim()
            }
            return `• ${item}`
          }).join('\n\n')
        } else if (typeof result.actionItems === 'string') {
          newNotes.actionItems = result.actionItems
        }

        // If no specific AI categorization, fall back to simple distribution
        if (!newNotes.keyDiscussionPoints && !newNotes.actionItems) {
          console.log('No AI categorization available, using simple distribution')
          distributeTextToSections(text)
        } else {
          console.log('✅ Using AI-categorized content for sections')
          setNotes(newNotes)
        }
      } else {
        console.log('No AI result, falling back to simple distribution')
        distributeTextToSections(text)
      }
    } catch (error) {
      console.error('❌ Claude AI processing error:', error)
      setOcrStatus(`AI processing failed: ${error.message || 'Unknown error'}`)
      // Fallback to simple distribution
      distributeTextToSections(text)
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Meeting Notes - Simple Test</h1>

        {/* Image Upload */}
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files[0]
              if (file) handleImageUpload(file)
            }}
            className="hidden"
            id="imageUpload"
          />
          <label htmlFor="imageUpload" className="cursor-pointer">
            <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-gray-600">Click to upload an image for OCR processing</p>
          </label>
        </div>

        {/* OCR Progress */}
        {isProcessing && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm text-gray-600">{ocrStatus}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${ocrProgress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Manual Text Input for Testing */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Manual Text Input (For Testing)</h2>
        <div className="space-y-3">
          <textarea
            value={extractedText}
            onChange={(e) => setExtractedText(e.target.value)}
            placeholder="Paste or type meeting text here to test AI categorization...\n\nExample:\nWe decided to move forward with the new project\nJohn will handle the backend development\nThere are some concerns about the timeline\nNext action: Schedule follow-up meeting"
            className="w-full h-32 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
          />
          <div className="flex gap-2">
            <button
              onClick={() => handleAIAnalysis(extractedText)}
              disabled={!extractedText.trim() || isAnalyzing}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyzing...
                </>
              ) : capabilities.claudeAPI ? (
                <>
                  <Zap className="w-4 h-4" />
                  Claude API Analysis
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Claude Workflow
                </>
              )}
            </button>
            <button
              onClick={() => distributeTextToSections(extractedText)}
              disabled={!extractedText.trim()}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              📋 Simple Distribution
            </button>
          </div>
        </div>
      </div>

      {/* Extracted Text Section */}
      {extractedText && (
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Extracted Text</h2>
            <button
              onClick={() => setIsEditingText(!isEditingText)}
              className="flex items-center gap-2 px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              {isEditingText ? <Save className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
              {isEditingText ? 'Save' : 'Edit'}
            </button>
          </div>

          {isEditingText ? (
            <textarea
              value={extractedText}
              onChange={(e) => updateExtractedText(e.target.value)}
              className="w-full h-32 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Edit the extracted text here..."
            />
          ) : (
            <div className="bg-gray-50 p-3 rounded-lg">
              <pre className="text-sm text-gray-700 whitespace-pre-wrap">{extractedText}</pre>
            </div>
          )}

          {extractedText && (
            <div className="mt-2 text-xs text-gray-500">
              {extractedText.length} characters • {extractedText.split(/\s+/).length} words
            </div>
          )}
        </div>
      )}

      {/* Enhanced AI Results */}
      {(aiResult || isAnalyzing) && (
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-5 h-5 text-purple-600 animate-spin" />
                  Analyzing with Claude...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 text-purple-600" />
                  AI Analysis Results
                </>
              )}
            </h2>
            {hasResult && !isStreaming && (
              <div className="flex items-center gap-2">
                <button
                  onClick={exportResults}
                  className="flex items-center gap-1 px-3 py-1 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                >
                  <Download className="w-3 h-3" />
                  Export
                </button>
                <button
                  onClick={clearAnalysis}
                  className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          {isAnalyzing && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${aiProgress}%` }}
                  />
                </div>
                <span className="text-sm text-gray-600">{aiProgress}%</span>
              </div>
              <div className="text-sm text-gray-600">
                {capabilities.claudeAPI ?
                  '🚀 Using direct Claude API for instant analysis...' :
                  '🧠 Processing with Claude workflow...'
                }
              </div>
            </div>
          )}

          {aiResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h3 className="font-medium text-gray-900 mb-2">Summary</h3>
                  <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded leading-relaxed">
                    {aiResult.summary}
                  </p>
                </div>
                <div>
                  <h3 className="font-medium text-gray-900 mb-2">Analysis Details</h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Sentiment:</span>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        aiResult.sentiment === 'positive' ? 'bg-green-100 text-green-800' :
                        aiResult.sentiment === 'negative' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {aiResult.sentiment}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Provider:</span>
                      <span className="text-purple-600 font-medium">{aiResult.provider}</span>
                    </div>
                    {aiResult.processingTime && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Processing Time:</span>
                        <span className="text-gray-800">{aiResult.processingTime}ms</span>
                      </div>
                    )}
                    {aiResult.cost && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Cost:</span>
                        <span className="text-green-600">${aiResult.cost.toFixed(6)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {aiResult.insights && aiResult.insights.length > 0 && (
                <div>
                  <h3 className="font-medium text-gray-900 mb-2">AI Insights</h3>
                  <div className="space-y-1">
                    {aiResult.insights.map((insight, index) => (
                      <div key={index} className="text-sm text-gray-700 bg-blue-50 p-2 rounded">
                        💡 {insight}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {aiError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-red-800">
                <AlertCircle className="w-4 h-4" />
                <span className="font-medium">Analysis Error</span>
              </div>
              <p className="text-sm text-red-700 mt-1">{aiError}</p>
            </div>
          )}
        </div>
      )}

      {/* Quadrants */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900">Meeting Notes</h2>
          <div className="flex gap-2">
            <button
              onClick={() => distributeTextToSections(extractedText)}
              disabled={!extractedText}
              className="px-3 py-1 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Simple Distribution
            </button>
            <button
              onClick={() => handleAIAnalysis(extractedText)}
              disabled={!extractedText || isAnalyzing}
              className="flex items-center gap-1 px-3 py-1 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="w-3 h-3" />
                  AI Analysis
                </>
              )}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-96">
          {sections.map(({ key, title, icon, color }) => (
            <div key={key} className={`border-2 border-gray-200 rounded-lg p-4 hover:border-${color}-300 transition-colors`}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">{icon}</span>
                <h3 className="font-semibold text-gray-900">{title}</h3>
                <Edit3 className="w-4 h-4 text-gray-400" />
              </div>

              <textarea
                value={notes[key]}
                onChange={(e) => updateSection(key, e.target.value)}
                placeholder={`Add ${title.toLowerCase()}...`}
                className="w-full h-full resize-none border-none focus:outline-none focus:ring-2 focus:ring-blue-500 p-2 rounded text-sm"
                style={{ minHeight: '200px' }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Debug Info */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="font-medium text-gray-900 mb-2">Debug Info</h3>
        <div className="text-xs text-gray-600 space-y-1">
          <div>Capabilities: {JSON.stringify(getCapabilities())}</div>
          <div>Notes state: {Object.keys(notes).map(key => `${key}: ${notes[key].length} chars`).join(', ')}</div>
          <div>Extracted text: {extractedText.length} characters</div>
          <div>AI Analysis: {hasResult ? 'Complete' : isAnalyzing ? 'Processing...' : 'None'}</div>
          <div>Capabilities: {JSON.stringify(capabilities)}</div>
          {aiResult && (
            <div className="mt-2 p-2 bg-white rounded border">
              <div>AI Analysis Summary: {aiResult.summary}</div>
              <div>Key Discussion Points: {aiResult.keyDiscussionPoints?.length || 0}</div>
              <div>Action Items: {aiResult.actionItems?.length || 0}</div>
              <div>Sentiment: {aiResult.sentiment}</div>
              <div>Provider: {aiResult.provider}</div>
              <div>Processing Time: {aiResult.processingTime}ms</div>
              {aiResult.cost && <div>Cost: ${aiResult.cost.toFixed(6)}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}