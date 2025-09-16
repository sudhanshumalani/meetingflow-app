import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import { useApp } from '../contexts/AppContext'
import {
  ArrowLeft,
  Save,
  Plus,
  Users,
  Calendar,
  FileText,
  Camera,
  Upload,
  BookOpen,
  Image,
  Loader2,
  CheckCircle,
  AlertCircle,
  ChevronDown,
  Sparkles,
  Cloud,
  Grid3X3,
  Target,
  Zap,
  Eye,
  Edit3
} from 'lucide-react'
import { format } from 'date-fns'
import { mockStakeholders, getCategoryDisplayName, STAKEHOLDER_CATEGORIES } from '../utils/mockData'
import { getTemplateForCategory, getColorClasses, PRIORITY_LEVELS } from '../utils/meetingTemplates'
import { extractTextFromImage, setOCRApiKey, setClaudeApiKey, getCapabilities } from '../utils/ocrServiceNew'
// Removed: Old AI Processing components - now using Claude AI analysis display
// import {
//   AIProcessingStatus,
//   AIInsightsDisplay,
//   PredictiveNotificationsDisplay,
//   AIProcessingSummary
// } from '../components/AIProcessing'
import { 
  MobileHeader,
  TouchButton,
  MobileCameraCapture,
  ResponsiveGrid,
  MobileExpandableCard,
  PullToRefresh
} from '../components/MobileOptimized'
// Note: Data integration now available via n8n in Settings
import { useAIAnalysis } from '../hooks/useAIAnalysis'
import { ExportOptionsButton } from '../components/ExportOptions'
import AudioRecorder from '../components/AudioRecorder'

export default function Meeting() {
  const { id } = useParams()
  const navigate = useNavigate()
  const {
    meetings,
    stakeholders,
    currentMeeting,
    updateMeeting,
    setCurrentMeeting
  } = useApp()

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    selectedStakeholder: '',
    date: new Date().toISOString().split('T')[0],
    priority: 'medium',
    template: null
  })
  
  // Mode state
  const [activeMode, setActiveMode] = useState('digital') // 'digital', 'photo', or 'audio'
  
  // Digital notes state (3-section with Claude summary)
  const [digitalNotes, setDigitalNotes] = useState({
    summary: '',
    keyDiscussionPoints: '',
    actionItems: ''
  })

  // Manual text input for Claude processing
  const [manualText, setManualText] = useState('')
  const [showManualInput, setShowManualInput] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  
  // Photo/OCR state
  const [showCamera, setShowCamera] = useState(false)
  const [capturedImage, setCapturedImage] = useState(null)
  const [ocrResult, setOcrResult] = useState(null)
  const [isProcessingOCR, setIsProcessingOCR] = useState(false)
  const [ocrProgress, setOcrProgress] = useState(0)
  const [ocrStatus, setOcrStatus] = useState('')
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [uploadedImageUrls, setUploadedImageUrls] = useState([]) // URLs for displaying images
  const [extractedText, setExtractedText] = useState('')
  const [isEditingExtractedText, setIsEditingExtractedText] = useState(false)
  
  // Audio transcription state
  const [audioTranscript, setAudioTranscript] = useState('')
  const [isRecordingMode, setIsRecordingMode] = useState(false)

  // AI processing state
  const [isSaving, setIsSaving] = useState(false)
  // Removed: Old AI processing state - now using Claude AI analysis display
  // const [aiProcessingResult, setAiProcessingResult] = useState(null)

  // Export functionality moved to n8n integration
  const [isAIProcessing, setIsAIProcessing] = useState(false)
  // const [aiProcessingStage, setAiProcessingStage] = useState('')
  // const [aiInsights, setAiInsights] = useState(null)
  // const [aiNotifications, setAiNotifications] = useState([])
  const [aiMode, setAiMode] = useState('auto') // 'auto', 'manual', 'off'

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
  

  // Use real stakeholders from app context, fallback to mock data for demo
  const displayStakeholders = stakeholders.length > 0 ? stakeholders : mockStakeholders

  // Cleanup object URLs when component unmounts
  useEffect(() => {
    return () => {
      uploadedImageUrls.forEach(imageData => {
        URL.revokeObjectURL(imageData.url)
      })
    }
  }, [uploadedImageUrls])

  useEffect(() => {
    const meeting = meetings.find(m => m.id === id)
    if (meeting) {
      setCurrentMeeting(meeting)
      // Only set initial values if not already set
      setFormData(prev => {
        // If title is already set (user typed something), don't overwrite
        if (prev.title && prev.title !== '') {
          return prev
        }
        return {
          title: meeting.title || '',
          selectedStakeholder: meeting.stakeholderIds?.[0] || '',
          date: meeting.scheduledAt ? meeting.scheduledAt.split('T')[0] : new Date().toISOString().split('T')[0],
          priority: meeting.priority || 'medium',
          template: meeting.template || null
        }
      })

      // Load existing notes if any
      if (meeting.digitalNotes && Object.values(meeting.digitalNotes).some(v => v)) {
        setDigitalNotes(meeting.digitalNotes)
      }

      // Load existing audio transcript if any
      if (meeting.audioTranscript) {
        setAudioTranscript(meeting.audioTranscript)
      }
    }
  }, [id, meetings, setCurrentMeeting])

  // Update template when stakeholder changes
  useEffect(() => {
    if (formData.selectedStakeholder) {
      const stakeholder = displayStakeholders.find(s => s.id === formData.selectedStakeholder)
      if (stakeholder) {
        const template = getTemplateForCategory(stakeholder.category)
        setFormData(prev => ({ ...prev, template }))
      }
    }
  }, [formData.selectedStakeholder, displayStakeholders])

  const handleInputChange = (field, value) => {
    console.log('Input change:', field, value)
    setFormData(prev => {
      const newData = { ...prev, [field]: value }
      console.log('Updated formData:', newData)
      return newData
    })
  }

  const handleSectionChange = (section, value) => {
    setDigitalNotes(prev => ({ ...prev, [section]: value }))
  }

  // Enhanced Claude AI processing function
  const handleAIAnalysis = async (text) => {
    console.log('🚀 handleAIAnalysis CALLED with:', {
      hasText: !!text,
      textLength: text?.length,
      textPreview: text?.substring(0, 50) + '...'
    })

    if (!text?.trim()) {
      console.log('❌ No text provided to handleAIAnalysis')
      setErrorMessage('No text to analyze')
      return
    }

    console.log('🔧 handleAIAnalysis: Starting Claude AI analysis for meeting...', {
      textLength: text.length,
      meetingContext: formData,
      analyzeFunction: typeof analyze,
      capabilities: capabilities
    })

    try {
      console.log('🔧 handleAIAnalysis: About to call analyze() hook...')

      // Use the enhanced AI analysis hook with meeting context
      const result = await analyze(text, {
        meetingType: formData.selectedStakeholder ? 'stakeholder' : 'general',
        stakeholder: formData.selectedStakeholder,
        date: formData.date,
        title: formData.title,
        timestamp: new Date().toISOString()
      })

      console.log('🔧 handleAIAnalysis: analyze() hook returned:', {
        hasResult: !!result,
        resultKeys: result ? Object.keys(result) : null,
        summary: result?.summary,
        keyDiscussionPointsType: typeof result?.keyDiscussionPoints,
        actionItemsType: typeof result?.actionItems
      })

      if (result) {
        console.log('✅ Claude AI analysis complete:', result)

        // Update digital notes with AI-structured data
        const newNotes = {
          summary: result.summary || '',
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
              return `• ${item.task} ${assignee} ${priority} ${dueDate}`.trim()
            }
            return `• ${item}`
          }).join('\n\n')
        } else if (typeof result.actionItems === 'string') {
          newNotes.actionItems = result.actionItems
        }

        console.log('🔧 handleAIAnalysis: Updating digitalNotes with:', newNotes)
        setDigitalNotes(newNotes)
        setManualText('') // Clear manual input
        setShowManualInput(false) // Hide manual input
        setErrorMessage('')

        console.log('✅ Meeting notes populated from Claude AI successfully!')
        console.log('📝 Final digitalNotes state should be:', newNotes)
      } else {
        console.log('⚠️ analyze() hook returned null or undefined result')
      }
    } catch (error) {
      console.error('❌ Claude AI processing error in handleAIAnalysis:', error)
      setErrorMessage(`AI processing failed: ${error.message || 'Unknown error'}`)
    }
  }


  // File upload
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif']
    },
    onDrop: async (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        const file = acceptedFiles[0]
        setUploadedFiles(prev => [...prev, file])

        // Create image URL for display
        const imageUrl = URL.createObjectURL(file)
        setUploadedImageUrls(prev => [...prev, { url: imageUrl, name: file.name }])

        await processImage(file)
      }
    }
  })

  // Simple image validation
  const validateImageFile = (file) => {
    const maxSize = 10 * 1024 * 1024 // 10MB
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif']

    if (!allowedTypes.includes(file.type)) {
      return { valid: false, error: 'Only JPEG, PNG, and GIF files are supported' }
    }

    if (file.size > maxSize) {
      return { valid: false, error: 'File size must be less than 10MB' }
    }

    return { valid: true }
  }

  // OCR Processing
  const processImage = async (file) => {
    // Validate image file first
    const validation = validateImageFile(file)
    if (!validation.valid) {
      alert(validation.error)
      return
    }

    setIsProcessingOCR(true)
    setOcrProgress(0)
    setOcrStatus('Initializing OCR...')
    setExtractedText('')

    try {
      const result = await extractTextFromImage(file, {
        onProgress: (progress) => {
          setOcrProgress(progress)
          if (progress < 30) {
            setOcrStatus('Loading OCR engine...')
          } else if (progress < 60) {
            setOcrStatus('Analyzing image...')
          } else if (progress < 90) {
            setOcrStatus('Extracting text...')
          } else {
            setOcrStatus('Processing results...')
          }
        }
      })

      if (result.success) {
        setOcrResult(result)
        setExtractedText(result.text)
        setOcrStatus('OCR completed successfully!')

        // Auto-populate digital notes with OCR results
        console.log('📋 DEBUG: OCR Result Analysis:', {
          hasText: !!result.text,
          textLength: result.text?.length,
          isFallback: result.isFallback,
          fullResult: result
        })

        if (result.text && !result.isFallback) {
          console.log('✅ OCR SUCCESS - Text extracted, processing with Claude AI:', {
            text: result.text.substring(0, 100) + '...',
            textLength: result.text.length
          })

          const text = result.text

          // Process with Claude AI for intelligent analysis
          if (text.length > 20) {
            console.log('🧠 TRIGGERING Claude AI analysis...')
            console.log('🔧 About to call handleAIAnalysis with text:', text.substring(0, 50) + '...')

            try {
              await handleAIAnalysis(text)
              console.log('✅ handleAIAnalysis completed successfully!')
            } catch (error) {
              console.error('❌ handleAIAnalysis failed:', error)
              setErrorMessage(`Claude AI failed: ${error.message}`)
            }
          } else {
            console.log('⚠️ Text too short for AI analysis:', text.length, 'characters')
          }
        } else if (result.isFallback) {
          console.log('⚠️ OCR FALLBACK - Not processing with Claude AI, user needs to configure API key')
        } else {
          console.log('❌ No valid text found in OCR result')
        }

        // Show success notification
        setTimeout(() => {
          setOcrStatus('')
          setOcrProgress(0)
        }, 2000)

      } else {
        console.error('OCR processing failed:', result.error)
        setOcrStatus(`Error: ${result.error}`)
        alert(`OCR failed: ${result.error}`)

        setTimeout(() => {
          setOcrStatus('')
          setOcrProgress(0)
        }, 3000)
      }
    } catch (error) {
      console.error('Error processing image:', error)
      setOcrStatus('OCR processing failed')
      alert('Failed to process image. Please try again.')

      setTimeout(() => {
        setOcrStatus('')
        setOcrProgress(0)
      }, 3000)
    } finally {
      setIsProcessingOCR(false)
    }
  }

  const handleTextEdit = (newText) => {
    setExtractedText(newText)
    // Update the OCR result with the edited text
    if (ocrResult) {
      setOcrResult(prev => ({
        ...prev,
        text: newText
      }))
    }
  }

  const toggleTextEditing = () => {
    setIsEditingExtractedText(!isEditingExtractedText)
  }

  
  

  // AI Processing simulation (keeping for backward compatibility)
  const simulateAIProcessing = async () => {
    const processingSteps = [
      { step: 'Analyzing meeting content...', delay: 1000 },
      { step: 'Extracting key insights...', delay: 1500 },
      { step: 'Generating action items...', delay: 1200 },
      { step: 'Creating summary...', delay: 800 },
      { step: 'Updating meeting records...', delay: 500 }
    ]

    for (const { step, delay } of processingSteps) {
      setAiProcessingResult({ status: 'processing', message: step })
      await new Promise(resolve => setTimeout(resolve, delay))
    }

    // Generate AI insights
    const insights = {
      keyTopics: ['Budget planning', 'Resource allocation', 'Timeline adjustments'],
      actionItems: [
        { text: 'Finalize Q4 budget proposal', assignee: 'Sarah Chen', priority: 'high' },
        { text: 'Schedule team planning meeting', assignee: 'Marcus Johnson', priority: 'medium' },
        { text: 'Update project timeline', assignee: 'Elena Rodriguez', priority: 'medium' }
      ],
      sentiment: 'positive',
      nextMeetingRecommendation: 'Follow-up in 1 week to review action item progress'
    }

    setAiProcessingResult({ 
      status: 'completed', 
      insights,
      message: 'Meeting processed successfully!' 
    })
  }

  // Save functionality
  const handleSave = async () => {
    setIsSaving(true)
    
    try {
      // Prepare meeting data
      const meetingData = {
        id: currentMeeting?.id || id,
        ...formData,
        digitalNotes,
        audioTranscript,
        notes: Object.values(digitalNotes).map((content, index) => ({
          id: `note_${index}`,
          content,
          timestamp: new Date().toISOString(),
          type: 'digital'
        })).filter(note => note.content.trim()).concat(
          audioTranscript ? [{
            id: 'audio_transcript',
            content: audioTranscript,
            timestamp: new Date().toISOString(),
            type: 'audio'
          }] : []
        ),
        ocrResults: ocrResult,
        uploadedFiles: uploadedFiles.map(f => f.name),
        lastSaved: new Date().toISOString(),
        status: 'completed'
      }
      
      updateMeeting(meetingData)
      
    } catch (error) {
      console.error('Save failed:', error)
    } finally {
      setIsSaving(false)
    }
  }

  // Export functionality now handled via n8n integration
  // See ExportOptionsButton component for export options

  // Mobile swipe handling
  const [touchStart, setTouchStart] = useState(null)
  const [touchEnd, setTouchEnd] = useState(null)

  const minSwipeDistance = 50

  const onTouchStart = (e) => {
    setTouchEnd(null)
    setTouchStart(e.targetTouches[0].clientX)
  }

  const onTouchMove = (e) => {
    setTouchEnd(e.targetTouches[0].clientX)
  }

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return
    const distance = touchStart - touchEnd
    const isLeftSwipe = distance > minSwipeDistance
    const isRightSwipe = distance < -minSwipeDistance

    if (isLeftSwipe) {
      if (activeMode === 'digital') {
        setActiveMode('photo')
      } else if (activeMode === 'photo') {
        setActiveMode('audio')
      }
    }
    if (isRightSwipe) {
      if (activeMode === 'audio') {
        setActiveMode('photo')
      } else if (activeMode === 'photo') {
        setActiveMode('digital')
      }
    }
  }

  // Removed: Old AI notification handlers - now using Claude AI analysis display
  // const handleAIActionClick = (action, notification) => {
  //   console.log('AI Action clicked:', action, notification)
  //   // Implement specific actions based on action.action type
  // }

  // const handleAINotificationDismiss = (notificationId) => {
  //   setAiNotifications(prev => prev.filter(n => n.id !== notificationId))
  // }

  // const handleAIInsightAction = (insight) => {
  //   console.log('AI Insight action:', insight)
  //   // Implement insight-specific actions
  // }

  if (!currentMeeting && !id) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Meeting not found</h2>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Back to Home
          </button>
        </div>
      </div>
    )
  }

  const selectedStakeholder = displayStakeholders.find(s => s.id === formData.selectedStakeholder)
  const template = formData.template

  const handleRefresh = async () => {
    // Refresh meeting data
    const meeting = meetings.find(m => m.id === id)
    if (meeting) {
      setCurrentMeeting(meeting)
      setFormData({
        title: meeting.title || '',
        selectedStakeholder: meeting.stakeholderIds?.[0] || '',
        date: meeting.scheduledAt ? meeting.scheduledAt.split('T')[0] : new Date().toISOString().split('T')[0],
        priority: meeting.priority || 'medium',
        template: meeting.template || null
      })
      
      if (meeting.digitalNotes) {
        setDigitalNotes(meeting.digitalNotes)
      }
    }
  }

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="min-h-screen bg-gray-50 mobile-full-height">
        {/* Mobile Header */}
        <div className="md:hidden">
          <MobileHeader
            title="Meeting Notes"
            subtitle="Capture and organize insights"
            onBack={() => {
              console.log('Mobile back button clicked')
              // Use navigate(-1) for reliable back navigation or explicit path
              navigate(-1) || navigate('/')
            }}
            rightContent={
              <div className="flex items-center gap-2">
                <ExportOptionsButton
                  meetingData={{
                    ...formData,
                    digitalNotes,
                    summary: Object.values(digitalNotes).join('\n\n'),
                    actionItems: ocrResult?.actionItems || []
                  }}
                  onSuccess={(result) => {
                    console.log('Meeting exported successfully:', result)
                  }}
                  onError={(error) => {
                    console.error('Export failed:', error)
                  }}
                  className="px-2 py-1 text-sm"
                />
                
                <TouchButton
                  onClick={handleSave}
                  disabled={isSaving || isAIProcessing}
                  variant="primary"
                  size="small"
                  className="px-3 py-1"
                >
                  <Save size={14} />
                  {isSaving ? 'Saving...' : 'Save'}
                </TouchButton>
              </div>
            }
          />
        </div>

      {/* Desktop Header */}
      <header className="hidden md:block bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  console.log('Desktop back button clicked')
                  // Use navigate(-1) for reliable back navigation or explicit path
                  navigate(-1) || navigate('/')
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Meeting Notes</h1>
                <p className="text-sm text-gray-500">Capture and organize meeting insights</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {/* AI Mode Toggle */}
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">AI:</label>
                <select
                  value={aiMode}
                  onChange={(e) => setAiMode(e.target.value)}
                  className="text-sm border border-gray-300 rounded px-2 py-1"
                >
                  <option value="auto">Auto</option>
                  <option value="manual">Manual</option>
                  <option value="off">Off</option>
                </select>
              </div>
              
              {/* Export and data integration available via n8n (see Settings) */}

              {/* AI Processing Status */}
              {isAIProcessing && (
                <div className="flex items-center gap-2 text-purple-600">
                  <Sparkles size={16} className="animate-pulse" />
                  <span className="text-sm">AI Processing...</span>
                </div>
              )}
              
              {/* Saving Status */}
              {isSaving && (
                <div className="flex items-center gap-2 text-blue-600">
                  <Loader2 size={16} className="animate-spin" />
                  <span className="text-sm">Saving...</span>
                </div>
              )}
              
              <div className="flex items-center gap-3">
                <ExportOptionsButton
                  meetingData={{
                    ...formData,
                    digitalNotes,
                    summary: Object.values(digitalNotes).join('\n\n'),
                    actionItems: ocrResult?.actionItems || []
                  }}
                  onSuccess={(result) => {
                    console.log('Meeting exported successfully:', result)
                    // Optionally show success notification
                  }}
                  onError={(error) => {
                    console.error('Export failed:', error)
                    // Optionally show error notification
                  }}
                  className="px-3 py-2"
                />
                
                <button
                  onClick={handleSave}
                  disabled={isSaving || isAIProcessing}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  <Save size={16} />
                  Save Meeting
                </button>

              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-2 md:py-8 safe-bottom">
        <ResponsiveGrid
          mobileColumns={1}
          tabletColumns={1}
          desktopColumns={4}
          gap="large"
          className="min-h-0"
        >
          {/* Left Sidebar - Meeting Header Form */}
          <div className="lg:col-span-1 space-y-4 md:space-y-6">
            {/* Meeting Info Form */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <FileText size={20} />
                Meeting Details
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Meeting Title
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => handleInputChange('title', e.target.value)}
                    placeholder="Enter meeting title..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Primary Stakeholder
                  </label>
                  <select
                    value={formData.selectedStakeholder}
                    onChange={(e) => handleInputChange('selectedStakeholder', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select stakeholder...</option>
                    {stakeholders.map((stakeholder) => (
                      <option key={stakeholder.id} value={stakeholder.id}>
                        {stakeholder.name} {stakeholder.category && `(${stakeholder.category})`}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Meeting Date
                  </label>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={(e) => handleInputChange('date', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Priority Level
                  </label>
                  <select
                    value={formData.priority}
                    onChange={(e) => handleInputChange('priority', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-500"
                  >
                    {Object.entries(PRIORITY_LEVELS).map(([key, priority]) => (
                      <option key={key} value={key}>
                        {priority.icon} {priority.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Template Selection */}
            {template && (
              <div className={`bg-white rounded-lg shadow-md p-6 border-l-4 ${getColorClasses(template.color)}`}>
                <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                  <BookOpen size={20} />
                  {template.name}
                </h3>
                <p className="text-sm text-gray-600 mb-4">{template.description}</p>
                <div className="text-xs text-gray-500">
                  Template automatically selected based on stakeholder category
                </div>
              </div>
            )}

            {/* Input Method Selection */}
            <div className="bg-white rounded-lg shadow-md p-4 md:p-6">
              <h3 className="text-lg font-semibold mb-2">Choose Input Method</h3>
              <p className="text-sm text-gray-600 mb-4">Select how you want to capture your meeting notes. All methods use Claude AI to create organized summaries.</p>
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-1 sm:rounded-lg sm:border sm:border-gray-200 sm:p-1">
                <TouchButton
                  onClick={() => setActiveMode('photo')}
                  variant={activeMode === 'photo' ? 'primary' : 'secondary'}
                  size="medium"
                  fullWidth
                  className="justify-center"
                >
                  <Camera size={16} />
                  OCR from Image
                </TouchButton>
                <TouchButton
                  onClick={() => setActiveMode('audio')}
                  variant={activeMode === 'audio' ? 'primary' : 'secondary'}
                  size="medium"
                  fullWidth
                  className="justify-center"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
                    <path d="M19 10v1a7 7 0 0 1-14 0v-1"/>
                    <line x1="12" y1="19" x2="12" y2="23"/>
                    <line x1="8" y1="23" x2="16" y2="23"/>
                  </svg>
                  Audio Recording
                </TouchButton>
                <TouchButton
                  onClick={() => setActiveMode('digital')}
                  variant={activeMode === 'digital' ? 'primary' : 'secondary'}
                  size="medium"
                  fullWidth
                  className="justify-center"
                >
                  <Edit3 size={16} />
                  Copy-Paste Notes
                </TouchButton>
              </div>
              
              {/* Mobile Swipe Hint */}
              <div className="md:hidden mt-3 text-center">
                <p className="text-xs text-gray-500">
                  💡 Swipe left/right to switch modes
                </p>
              </div>
            </div>
          </div>

          {/* Main Content Area */}
          <div 
            className="lg:col-span-3"
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            {activeMode === 'digital' && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-semibold flex items-center gap-2">
                    <Edit3 size={24} />
                    Copy-Paste Notes
                  </h2>
                  <div className="flex items-center gap-2">
                    {template && (
                      <div className={`px-3 py-1 rounded-full text-sm font-medium ${getColorClasses(template.color)}`}>
                        {template.name}
                      </div>
                    )}
                    <button
                      onClick={() => setShowManualInput(!showManualInput)}
                      className="flex items-center gap-1 px-3 py-1 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                    >
                      <Edit3 size={14} />
                      Paste Your Notes
                    </button>
                  </div>
                </div>

                {/* Manual Text Input for Claude Processing */}
                {showManualInput && (
                  <div className="mb-6 p-4 bg-purple-50 rounded-lg border border-purple-200">
                    <h3 className="font-medium text-purple-900 mb-2 flex items-center gap-2">
                      <Zap size={16} />
                      Paste Your Rough Meeting Notes
                    </h3>
                    <textarea
                      value={manualText}
                      onChange={(e) => setManualText(e.target.value)}
                      placeholder="Copy and paste your rough meeting notes here. Claude AI will organize them into a structured summary with key discussion points and action items.

Example notes you might paste:
• Discussed Q4 goals and priorities
• John will lead the backend development
• Sarah raised concerns about timeline - need to address
• Marketing wants to launch by December
• Action: Follow-up meeting scheduled for Friday
• Budget approved for additional resources"
                      className="w-full h-32 p-3 border border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-sm resize-none"
                    />
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-sm text-purple-600">
                        {capabilities.claudeAPI ? '🚀 Direct Claude API' : '🧠 Claude Workflow'} • {manualText.length} characters
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setManualText('')
                            setShowManualInput(false)
                          }}
                          className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleAIAnalysis(manualText)}
                          disabled={!manualText.trim() || isAnalyzing}
                          className="flex items-center gap-1 px-3 py-1 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isAnalyzing ? (
                            <>
                              <Loader2 size={14} className="animate-spin" />
                              Analyzing...
                            </>
                          ) : (
                            <>
                              <Sparkles size={14} />
                              Process with Claude
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* AI Analysis Status */}
                {isAnalyzing && (
                  <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex items-center gap-3 mb-2">
                      <Loader2 size={16} className="animate-spin text-blue-600" />
                      <span className="font-medium text-blue-900">
                        {capabilities.claudeAPI ? 'Processing with Claude API...' : 'Processing with Claude Workflow...'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 bg-blue-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${aiProgress}%` }}
                        />
                      </div>
                      <span className="text-sm text-blue-600">{aiProgress}%</span>
                    </div>
                  </div>
                )}

                {/* Error Display */}
                {(errorMessage || aiError) && (
                  <div className="mb-6 p-4 bg-red-50 rounded-lg border border-red-200">
                    <div className="flex items-center gap-2 text-red-800">
                      <AlertCircle size={16} />
                      <span className="font-medium">Analysis Error</span>
                    </div>
                    <p className="text-sm text-red-700 mt-1">{errorMessage || aiError}</p>
                  </div>
                )}


                {/* 3-Section Layout: Summary (full width), Discussion Points & Action Items (side by side) */}
                <div className="space-y-4">
                  {/* Summary Section (Claude AI Generated) */}
                  <div className="border border-gray-200 rounded-lg p-4 bg-gradient-to-r from-purple-50 to-blue-50">
                    <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-purple-600" />
                      Meeting Summary
                      <span className="text-xs text-purple-600 bg-purple-100 px-2 py-1 rounded-full ml-auto">
                        Generated by Claude AI
                      </span>
                    </h3>
                    <textarea
                      value={digitalNotes.summary}
                      onChange={(e) => handleSectionChange('summary', e.target.value)}
                      placeholder="Meeting summary will appear here after Claude AI analysis... You can also type directly."
                      className="w-full h-24 resize-none border-none focus:outline-none text-sm bg-transparent placeholder-purple-400"
                    />
                  </div>

                  {/* Discussion Points & Action Items (Side by Side) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-[500px]">
                    {/* Key Discussion Points */}
                    <div className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors group">
                      <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                        <span>💬</span>
                        Key Discussion Points
                        <Edit3 className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </h3>
                      <textarea
                        value={digitalNotes.keyDiscussionPoints}
                        onChange={(e) => handleSectionChange('keyDiscussionPoints', e.target.value)}
                        placeholder="Key topics and discussion points will appear here after AI analysis..."
                        className="w-full h-full resize-none border-none focus:outline-none text-sm hover:bg-gray-50 focus:bg-white transition-colors"
                      />
                    </div>

                    {/* Action Items */}
                    <div className="border border-gray-200 rounded-lg p-4 hover:border-green-300 transition-colors group">
                      <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                        <span>📋</span>
                        Action Items
                        <Edit3 className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </h3>
                      <textarea
                        value={digitalNotes.actionItems}
                        onChange={(e) => handleSectionChange('actionItems', e.target.value)}
                        placeholder="Action items with assignees, priorities, and deadlines will appear here after AI analysis..."
                        className="w-full h-full resize-none border-none focus:outline-none text-sm hover:bg-gray-50 focus:bg-white transition-colors"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeMode === 'photo' && (
              <div className="space-y-6">
                {/* Mobile Camera Section */}
                <div className="bg-white rounded-lg shadow-md p-6">
                  <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                    <Camera size={24} />
                    Photo Capture
                  </h2>
                  
                  <div className="space-y-4">
                    {!showCamera ? (
                      <div className="text-center">
                        <TouchButton
                          onClick={() => setShowCamera(true)}
                          variant="primary"
                          size="large"
                          fullWidth={false}
                          className="mx-auto"
                        >
                          <Camera size={20} />
                          Open Camera
                        </TouchButton>
                      </div>
                    ) : (
                      <MobileCameraCapture
                        onCapture={(imageSrc) => {
                          setCapturedImage(imageSrc)
                          setShowCamera(false)
                          // Convert to file for processing
                          fetch(imageSrc)
                            .then(res => res.blob())
                            .then(blob => {
                              const file = new File([blob], 'captured-image.jpg', { type: 'image/jpeg' })
                              processImage(file)
                            })
                        }}
                        onClose={() => setShowCamera(false)}
                        facingMode="environment"
                      />
                    )}
                  </div>
                </div>

                {/* File Upload for OCR */}
                <div className="bg-white rounded-lg shadow-md p-6">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Eye size={20} />
                    Upload Image for OCR Analysis
                  </h3>

                  <div {...getRootProps()} className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                    isDragActive ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
                  }`}>
                    <input {...getInputProps()} />
                    <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-600">
                      {isDragActive ? 'Drop the image here...' : 'Drag & drop an image here, or click to select'}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">PNG, JPG, GIF up to 10MB</p>
                  </div>
                </div>

                {/* OCR Processing Results */}
                {isProcessingOCR && (
                  <div className="bg-white rounded-lg shadow-md p-6">
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <Loader2 size={20} className="animate-spin text-blue-600" />
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900">Processing Image with OCR</h3>
                          <p className="text-sm text-gray-600">{ocrStatus || 'Extracting text from your image...'}</p>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full">
                        <div className="flex justify-between text-xs text-gray-600 mb-1">
                          <span>Progress</span>
                          <span>{ocrProgress}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out"
                            style={{ width: `${ocrProgress}%` }}
                          ></div>
                        </div>
                      </div>

                      <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
                        <p><strong>Pro Tip:</strong> For best results, ensure your image has good lighting and clear text.</p>
                      </div>
                    </div>
                  </div>
                )}

                {ocrResult && (
                  <div className="bg-white rounded-lg shadow-md p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold flex items-center gap-2">
                        <Sparkles size={20} className="text-blue-600" />
                        OCR Results
                        <span className="text-sm font-normal text-green-600">
                          ({Math.round(ocrResult.confidence || 90)}% confidence)
                        </span>
                      </h3>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={toggleTextEditing}
                          className="flex items-center gap-1 px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          <Edit3 size={14} />
                          {isEditingExtractedText ? 'Save' : 'Edit'}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="bg-gray-50 rounded-lg p-4">
                        <h4 className="font-medium mb-2 flex items-center justify-between">
                          <span>Extracted Text:</span>
                          <span className="text-xs text-gray-500">
                            {(extractedText || ocrResult.text).length} characters • {(extractedText || ocrResult.text).split(/\s+/).length} words
                          </span>
                        </h4>

                        {isEditingExtractedText ? (
                          <div className="space-y-2">
                            <textarea
                              value={extractedText || ocrResult.text}
                              onChange={(e) => handleTextEdit(e.target.value)}
                              className="w-full h-48 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
                              placeholder="Edit the extracted text here..."
                            />
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => setIsEditingExtractedText(false)}
                                className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={toggleTextEditing}
                                className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                              >
                                Save Changes
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="relative">
                            <pre className="text-sm text-gray-700 whitespace-pre-wrap bg-white border border-gray-200 rounded p-3 max-h-64 overflow-y-auto">
                              {extractedText || ocrResult.text}
                            </pre>
                            <div className="absolute top-2 right-2">
                              <button
                                onClick={() => {
                                  if (!extractedText) setExtractedText(ocrResult.text)
                                  setIsEditingExtractedText(true)
                                }}
                                className="p-1 text-gray-400 hover:text-gray-600 bg-white rounded shadow-sm"
                                title="Click to edit text"
                              >
                                <Edit3 size={14} />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {ocrResult.actionItems && ocrResult.actionItems.length > 0 && (
                        <div className="bg-blue-50 rounded-lg p-4">
                          <h4 className="font-medium mb-2 text-blue-900 flex items-center gap-2">
                            <Target size={16} />
                            Auto-detected Action Items:
                          </h4>
                          <ul className="space-y-2">
                            {ocrResult.actionItems.map((item, index) => (
                              <li key={index} className="text-sm bg-white rounded p-2 border border-blue-200">
                                <div className="flex items-start gap-2">
                                  <CheckCircle size={14} className="mt-0.5 flex-shrink-0 text-blue-600" />
                                  <div className="flex-1">
                                    <span className="text-gray-800">{item.text}</span>
                                    <div className="flex items-center gap-2 mt-1">
                                      {item.assignee !== 'Unassigned' && (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-800">
                                          {item.assignee}
                                        </span>
                                      )}
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${
                                        item.priority === 'high' ? 'bg-red-100 text-red-800' :
                                        item.priority === 'low' ? 'bg-gray-100 text-gray-800' :
                                        'bg-yellow-100 text-yellow-800'
                                      }`}>
                                        {item.priority} priority
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* OCR Metadata */}
                      <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3 space-y-1">
                        <div className="flex justify-between">
                          <span>Processing time:</span>
                          <span>{ocrResult.processedAt ? new Date(ocrResult.processedAt).toLocaleTimeString() : 'Unknown'}</span>
                        </div>
                        {ocrResult.words && (
                          <div className="flex justify-between">
                            <span>Words detected:</span>
                            <span>{ocrResult.words}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span>File:</span>
                          <span>{ocrResult.fileName} ({(ocrResult.fileSize / 1024).toFixed(1)} KB)</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Captured/Uploaded Images */}
                {(capturedImage || uploadedFiles.length > 0) && (
                  <div className="bg-white rounded-lg shadow-md p-6">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <Image size={20} />
                      Captured Images
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {capturedImage && (
                        <div className="relative">
                          <img
                            src={capturedImage}
                            alt="Captured"
                            className="w-full h-32 object-cover rounded-lg"
                          />
                          <div className="absolute top-2 right-2 bg-green-500 text-white px-2 py-1 rounded text-xs">
                            Captured
                          </div>
                        </div>
                      )}
                      {uploadedImageUrls.map((imageData, index) => (
                        <div key={index} className="relative">
                          <img
                            src={imageData.url}
                            alt={imageData.name}
                            className="w-full h-32 object-cover rounded-lg"
                          />
                          <div className="absolute top-2 right-2 bg-blue-500 text-white px-2 py-1 rounded text-xs">
                            Uploaded
                          </div>
                          <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-xs">
                            {imageData.name}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeMode === 'audio' && (
              <div className="space-y-6">
                {/* Audio Recording Section */}
                <div className="bg-white rounded-lg shadow-md p-6">
                  <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
                      <path d="M19 10v1a7 7 0 0 1-14 0v-1"/>
                      <line x1="12" y1="19" x2="12" y2="23"/>
                      <line x1="8" y1="23" x2="16" y2="23"/>
                    </svg>
                    Audio Recording & Transcription
                  </h2>

                  <AudioRecorder
                    onTranscriptUpdate={(transcript) => {
                      setAudioTranscript(transcript)
                      // Automatically populate digital notes when we have transcript
                      if (transcript && transcript.length > 50) {
                        setDigitalNotes(prev => ({
                          ...prev,
                          summary: transcript
                        }))
                      }
                    }}
                    className="mb-4"
                  />

                  {/* Transcript Display and Actions */}
                  {audioTranscript && (
                    <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-medium text-gray-900">Meeting Transcript</h3>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              // Process transcript with AI using standardized method
                              if (audioTranscript.length > 100) {
                                handleAIAnalysis(audioTranscript)
                              }
                            }}
                            disabled={isAnalyzing || audioTranscript.length < 100}
                            className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                          >
                            <Sparkles className="w-3 h-3" />
                            {isAnalyzing ? 'Processing...' : 'AI Analysis'}
                          </button>
                          <button
                            onClick={() => {
                              // Copy transcript to summary section
                              setDigitalNotes(prev => ({
                                ...prev,
                                summary: audioTranscript
                              }))
                              setActiveMode('digital')
                            }}
                            className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-1"
                          >
                            <FileText className="w-3 h-3" />
                            Use as Notes
                          </button>
                        </div>
                      </div>

                      <div className="max-h-60 overflow-y-auto text-sm text-gray-700 leading-relaxed">
                        {audioTranscript}
                      </div>

                      <div className="mt-3 text-xs text-gray-500">
                        Word count: {audioTranscript.split(' ').length} |
                        Characters: {audioTranscript.length}
                      </div>
                    </div>
                  )}

                  {/* Audio Recording Tips */}
                  <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                    <h4 className="font-medium text-blue-900 mb-2">📱 Mobile Recording Tips</h4>
                    <ul className="text-sm text-blue-700 space-y-1">
                      <li>• Position device 2-3 feet from speakers</li>
                      <li>• Minimize background noise when possible</li>
                      <li>• Speak clearly and at normal pace</li>
                      <li>• Use "Hybrid" mode for best accuracy</li>
                      <li>• Recording works offline on your device</li>
                    </ul>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="bg-white rounded-lg shadow-md p-6">
                  <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <TouchButton
                      onClick={() => {
                        if (audioTranscript) {
                          setDigitalNotes(prev => ({
                            ...prev,
                            summary: audioTranscript
                          }))
                          setActiveMode('digital')
                        }
                      }}
                      variant="secondary"
                      size="medium"
                      disabled={!audioTranscript}
                      className="justify-center"
                    >
                      <Grid3X3 size={16} />
                      Edit Notes
                    </TouchButton>

                    <TouchButton
                      onClick={() => {
                        if (audioTranscript && audioTranscript.length > 100) {
                          handleAIAnalysis(audioTranscript)
                        }
                      }}
                      variant="secondary"
                      size="medium"
                      disabled={!audioTranscript || audioTranscript.length < 100 || isAnalyzing}
                      className="justify-center"
                    >
                      <Sparkles size={16} />
                      {isAnalyzing ? 'Processing...' : 'AI Insights'}
                    </TouchButton>
                  </div>
                </div>
              </div>
            )}

            {/* AI Analysis Results from useAIAnalysis Hook */}
            {aiResult && (
              <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-200 p-6 mt-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-blue-900 flex items-center gap-2">
                    <span className="text-xl">🧠</span>
                    Claude AI Analysis Results
                  </h3>
                  <div className="flex gap-2">
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                      {aiResult.provider || 'Claude Analysis'}
                    </span>
                    {isAnalyzing && (
                      <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded animate-pulse">
                        Processing...
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  {/* Summary */}
                  {aiResult.summary && (
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                        📝 Summary
                      </h4>
                      <p className="text-sm text-gray-700 leading-relaxed bg-white rounded p-3 border border-gray-200">
                        {aiResult.summary}
                      </p>
                    </div>
                  )}

                  {/* Key Discussion Points */}
                  {aiResult.keyDiscussionPoints && aiResult.keyDiscussionPoints.length > 0 && (
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                        💡 Key Discussion Points
                      </h4>
                      <div className="bg-white rounded p-3 border border-gray-200">
                        <ul className="space-y-2">
                          {aiResult.keyDiscussionPoints.slice(0, 10).map((point, index) => (
                            <li key={index} className="text-sm text-gray-700 flex items-start gap-2">
                              <span className="text-blue-500 font-bold mt-1">•</span>
                              <span className="flex-1">{point}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}

                  {/* Action Items */}
                  {aiResult.actionItems && aiResult.actionItems.length > 0 && (
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                        ✅ Action Items
                      </h4>
                      <div className="bg-white rounded p-3 border border-gray-200">
                        <div className="space-y-3">
                          {aiResult.actionItems.slice(0, 10).map((item, index) => (
                            <div key={index} className="p-3 bg-gray-50 rounded border-l-4 border-blue-400">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-sm text-gray-900 flex-1 font-medium">
                                  {typeof item === 'string' ? item : item.task}
                                </p>
                                {typeof item === 'object' && (
                                  <div className="flex gap-2 flex-wrap">
                                    {item.assignee && item.assignee !== 'Unassigned' && (
                                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded font-medium">
                                        👤 {item.assignee}
                                      </span>
                                    )}
                                    {item.priority && (
                                      <span className={`text-xs px-2 py-1 rounded font-medium ${
                                        item.priority === 'high' ? 'bg-red-100 text-red-700' :
                                        item.priority === 'low' ? 'bg-gray-100 text-gray-700' :
                                        'bg-yellow-100 text-yellow-700'
                                      }`}>
                                        🎯 {item.priority}
                                      </span>
                                    )}
                                    {item.dueDate && (
                                      <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded font-medium">
                                        📅 {item.dueDate}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Sentiment & Confidence */}
                  <div className="flex items-center justify-between text-sm text-gray-600 bg-white rounded p-3 border border-gray-200">
                    <div className="flex items-center gap-4">
                      {aiResult.sentiment && (
                        <span className="flex items-center gap-2">
                          <span className="text-lg">
                            {aiResult.sentiment === 'positive' ? '😊' :
                             aiResult.sentiment === 'negative' ? '😟' : '😐'}
                          </span>
                          <span className="capitalize font-medium">{aiResult.sentiment} tone</span>
                        </span>
                      )}
                      {aiResult.confidence && (
                        <span className="flex items-center gap-1">
                          <span>🎯</span>
                          <span className="font-medium">Confidence: {Math.round(aiResult.confidence * 100)}%</span>
                        </span>
                      )}
                    </div>
                    {aiResult.analyzedAt && (
                      <span className="text-xs text-gray-500">
                        Analyzed: {new Date(aiResult.analyzedAt).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-4 flex gap-2 flex-wrap">
                  <button
                    onClick={clearAnalysis}
                    className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 hover:bg-white rounded border border-gray-300 transition-colors"
                  >
                    Clear Analysis
                  </button>
                  <button
                    onClick={() => {
                      if (audioTranscript && audioTranscript.length > 100) {
                        handleAIAnalysis(audioTranscript)
                      }
                    }}
                    disabled={isAnalyzing || !audioTranscript || audioTranscript.length < 100}
                    className="px-3 py-1 text-sm text-blue-600 hover:text-blue-800 hover:bg-white rounded border border-blue-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isAnalyzing ? 'Re-analyzing...' : 'Re-analyze'}
                  </button>
                  <button
                    onClick={() => {
                      // Properly map Claude analysis results to correct digital notes fields
                      const keyDiscussionPointsText = aiResult.keyDiscussionPoints && aiResult.keyDiscussionPoints.length > 0
                        ? aiResult.keyDiscussionPoints.map((point, index) => `${index + 1}. ${point}`).join('\n\n')
                        : ''

                      const actionItemsText = aiResult.actionItems && aiResult.actionItems.length > 0
                        ? aiResult.actionItems.map((item, index) => {
                            if (typeof item === 'string') {
                              return `${index + 1}. ${item}`
                            } else {
                              let itemText = `${index + 1}. ${item.task}`
                              if (item.assignee && item.assignee !== 'Unassigned') {
                                itemText += ` (Assigned: ${item.assignee})`
                              }
                              if (item.priority && item.priority !== 'medium') {
                                itemText += ` [Priority: ${item.priority}]`
                              }
                              if (item.dueDate) {
                                itemText += ` [Due: ${item.dueDate}]`
                              }
                              return itemText
                            }
                          }).join('\n\n')
                        : ''

                      setDigitalNotes(prev => ({
                        ...prev,
                        summary: aiResult.summary || '',
                        keyDiscussionPoints: keyDiscussionPointsText,
                        actionItems: actionItemsText
                      }))
                      setActiveMode('digital')
                    }}
                    className="px-3 py-1 text-sm text-green-600 hover:text-green-800 hover:bg-white rounded border border-green-300 transition-colors"
                  >
                    📝 Use as Notes
                  </button>
                  {exportResults && (
                    <button
                      onClick={exportResults}
                      className="px-3 py-1 text-sm text-purple-600 hover:text-purple-800 hover:bg-white rounded border border-purple-300 transition-colors"
                    >
                      📄 Export Analysis
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* REMOVED: Old AI Processing Results - Now using Claude AI analysis display
            {aiProcessingResult && (
              <div className="bg-white rounded-lg shadow-md p-6 mt-6">
                <div className="flex items-center gap-3 mb-4">
                  {aiProcessingResult.status === 'processing' ? (
                    <>
                      <Loader2 size={24} className="animate-spin text-purple-600" />
                      <div>
                        <h3 className="font-semibold text-purple-900">AI Processing</h3>
                        <p className="text-sm text-purple-700">{aiProcessingResult.message}</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <CheckCircle size={24} className="text-green-600" />
                      <div>
                        <h3 className="font-semibold text-green-900">Processing Complete</h3>
                        <p className="text-sm text-green-700">{aiProcessingResult.message}</p>
                      </div>
                    </>
                  )}
                </div>

                {aiProcessingResult.insights && (
                  <div className="space-y-4">
                    <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-4">
                      <h4 className="font-medium text-purple-900 mb-2">Key Topics Identified:</h4>
                      <div className="flex flex-wrap gap-2">
                        {aiProcessingResult.insights.keyTopics.map((topic, index) => (
                          <span key={index} className="px-3 py-1 bg-purple-200 text-purple-800 rounded-full text-sm">
                            {topic}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="bg-orange-50 rounded-lg p-4">
                      <h4 className="font-medium text-orange-900 mb-2">Generated Action Items:</h4>
                      <ul className="space-y-2">
                        {aiProcessingResult.insights.actionItems.map((item, index) => (
                          <li key={index} className="flex items-start gap-2">
                            <Target size={14} className="mt-1 text-orange-600 flex-shrink-0" />
                            <div className="flex-1">
                              <span className="text-orange-800">{item.text}</span>
                              <div className="text-xs text-orange-600 mt-1">
                                Assigned to: {item.assignee} • Priority: {item.priority}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="bg-blue-50 rounded-lg p-4">
                      <h4 className="font-medium text-blue-900 mb-2">AI Recommendations:</h4>
                      <p className="text-sm text-blue-800">{aiProcessingResult.insights.nextMeetingRecommendation}</p>
                    </div>
                  </div>
                )}
                
                {/* AI Insights */}
                {aiInsights && aiInsights.insights && (
                  <div className="bg-white rounded-lg shadow-md p-6">
                    <AIInsightsDisplay 
                      insights={aiInsights.insights}
                      onActionClick={handleAIInsightAction}
                    />
                  </div>
                )}
                
                {/* AI Notifications */}
                {aiNotifications.length > 0 && (
                  <div className="bg-white rounded-lg shadow-md p-6">
                    <PredictiveNotificationsDisplay
                      notifications={aiNotifications}
                      onActionClick={handleAIActionClick}
                      onDismiss={handleAINotificationDismiss}
                    />
                  </div>
                )}
                
                {/* AI Processing Summary */}
                {aiProcessingResult && (
                  <div className="bg-white rounded-lg shadow-md p-6">
                    <AIProcessingSummary
                      results={aiProcessingResult}
                      onExport={() => console.log('Export AI results')}
                    />
                  </div>
                )}

              </div>
            )} */}
        </ResponsiveGrid>
      </main>

      {/* REMOVED: AI Processing Status Overlay - Now using Claude AI analysis display
      <AIProcessingStatus
        isProcessing={isAIProcessing}
        stage={aiProcessingStage}
        progress={isAIProcessing ? 65 : 0}
      /> */}
      </div>
    </PullToRefresh>
  )
}