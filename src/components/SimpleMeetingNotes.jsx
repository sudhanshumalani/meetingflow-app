import React, { useState } from 'react'
import { Edit3, Save, Camera, Upload, AlertCircle, CheckCircle, Loader2 } from 'lucide-react'
import { extractTextFromImage, processWithClaude, setOCRApiKey, setClaudeApiKey, getCapabilities } from '../utils/ocrServiceNew'

export default function SimpleMeetingNotes() {
  // Core state
  const [notes, setNotes] = useState({
    topLeft: '',
    topRight: '',
    bottomLeft: '',
    bottomRight: ''
  })

  const [extractedText, setExtractedText] = useState('')
  const [isEditingText, setIsEditingText] = useState(false)
  const [ocrProgress, setOcrProgress] = useState(0)
  const [ocrStatus, setOcrStatus] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [claudeResult, setClaudeResult] = useState(null)

  // Quadrant definitions
  const quadrants = [
    { key: 'topLeft', title: 'Key Discussion Points', icon: '💬', color: 'blue' },
    { key: 'topRight', title: 'Decisions Made', icon: '✅', color: 'green' },
    { key: 'bottomLeft', title: 'Challenges & Blockers', icon: '⚠️', color: 'yellow' },
    { key: 'bottomRight', title: 'Action Items', icon: '📋', color: 'purple' }
  ]

  // Handle quadrant editing
  const updateQuadrant = (quadrantKey, value) => {
    console.log('Updating quadrant:', quadrantKey, 'with value:', value.substring(0, 50) + '...')
    setNotes(prev => ({
      ...prev,
      [quadrantKey]: value
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

        // If it's real OCR text (not fallback), try to distribute it
        if (!result.isFallback && result.text.length > 20) {
          distributeTextToQuadrants(result.text)
        }

        // Process with Claude if available
        if (getCapabilities().claude) {
          processTextWithClaude(result.text)
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

  // Distribute text across quadrants
  const distributeTextToQuadrants = (text) => {
    console.log('Distributing text to quadrants:', text.length, 'characters')

    const lines = text.split('\n').filter(line => line.trim().length > 0)
    const quarterLength = Math.ceil(lines.length / 4)

    setNotes({
      topLeft: lines.slice(0, quarterLength).join('\n'),
      topRight: lines.slice(quarterLength, quarterLength * 2).join('\n'),
      bottomLeft: lines.slice(quarterLength * 2, quarterLength * 3).join('\n'),
      bottomRight: lines.slice(quarterLength * 3).join('\n')
    })

    console.log('Text distributed across quadrants')
  }

  // Process with Claude AI
  const processTextWithClaude = async (text) => {
    try {
      const result = await processWithClaude(text, { meetingType: 'general' })
      if (result) {
        setClaudeResult(result)

        // Optionally populate quadrants with AI-structured data
        if (result.keyPoints || result.decisions || result.actionItems || result.challenges) {
          setNotes({
            topLeft: result.keyPoints?.join('\n') || notes.topLeft,
            topRight: result.decisions?.join('\n') || notes.topRight,
            bottomLeft: result.challenges?.join('\n') || notes.bottomLeft,
            bottomRight: result.actionItems?.map(item => `${item.task} (${item.assignee})`).join('\n') || notes.bottomRight
          })
        }
      }
    } catch (error) {
      console.error('Claude processing failed:', error)
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

      {/* Claude AI Results */}
      {claudeResult && (
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Brain className="w-5 h-5 text-purple-600" />
            AI Analysis
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="font-medium text-gray-900 mb-2">Summary</h3>
              <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded">{claudeResult.summary}</p>
            </div>
            <div>
              <h3 className="font-medium text-gray-900 mb-2">Sentiment: {claudeResult.sentiment}</h3>
              <div className="space-y-1">
                {claudeResult.insights?.map((insight, index) => (
                  <div key={index} className="text-sm text-gray-700 bg-blue-50 p-2 rounded">
                    {insight}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quadrants */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900">Meeting Notes</h2>
          <button
            onClick={() => distributeTextToQuadrants(extractedText)}
            disabled={!extractedText}
            className="px-3 py-1 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Distribute Text
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-96">
          {quadrants.map(({ key, title, icon, color }) => (
            <div key={key} className={`border-2 border-gray-200 rounded-lg p-4 hover:border-${color}-300 transition-colors`}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">{icon}</span>
                <h3 className="font-semibold text-gray-900">{title}</h3>
                <Edit3 className="w-4 h-4 text-gray-400" />
              </div>

              <textarea
                value={notes[key]}
                onChange={(e) => updateQuadrant(key, e.target.value)}
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
        </div>
      </div>
    </div>
  )
}