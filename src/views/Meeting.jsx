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
  Grid3X3,
  Target,
  Zap,
  Eye,
  Edit3
} from 'lucide-react'
import { format } from 'date-fns'
import { mockStakeholders, getCategoryDisplayName, STAKEHOLDER_CATEGORIES } from '../utils/mockData'
import { getTemplateForCategory, getColorClasses, PRIORITY_LEVELS } from '../utils/meetingTemplates'
import { processImageForMeeting, validateImageFile } from '../utils/ocrService'
import {
  OCRImageUpload,
  AIProcessingStatus,
  AIInsightsDisplay,
  PredictiveNotificationsDisplay,
  AIProcessingSummary
} from '../components/AIProcessing'
import { aiCoordinator } from '../utils/aiServices'
import { 
  MobileHeader,
  TouchButton,
  MobileCameraCapture,
  ResponsiveGrid,
  MobileExpandableCard,
  PullToRefresh
} from '../components/MobileOptimized'
import { 
  NotionSyncStatus, 
  NotionStakeholderDropdown 
} from '../components/NotionIntegration'
import { ExportOptionsButton } from '../components/ExportOptions'

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
  const [activeMode, setActiveMode] = useState('digital') // 'digital' or 'photo'
  
  // Digital notes state (4-quadrant)
  const [digitalNotes, setDigitalNotes] = useState({
    keyDiscussionPoints: '',
    actionItems: ''
  })
  
  // Photo/OCR state
  const [showCamera, setShowCamera] = useState(false)
  const [capturedImage, setCapturedImage] = useState(null)
  const [ocrResult, setOcrResult] = useState(null)
  const [isProcessingOCR, setIsProcessingOCR] = useState(false)
  const [ocrProgress, setOcrProgress] = useState(0)
  const [ocrStatus, setOcrStatus] = useState('')
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [extractedText, setExtractedText] = useState('')
  const [isEditingExtractedText, setIsEditingExtractedText] = useState(false)
  
  // AI processing state
  const [isSaving, setIsSaving] = useState(false)
  const [aiProcessingResult, setAiProcessingResult] = useState(null)
  const [isAIProcessing, setIsAIProcessing] = useState(false)
  const [aiProcessingStage, setAiProcessingStage] = useState('')
  const [aiInsights, setAiInsights] = useState(null)
  const [aiNotifications, setAiNotifications] = useState([])
  const [aiMode, setAiMode] = useState('auto') // 'auto', 'manual', 'off'
  

  // Use real stakeholders from app context, fallback to mock data for demo
  const displayStakeholders = stakeholders.length > 0 ? stakeholders : mockStakeholders

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


  // File upload
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif']
    },
    onDrop: async (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        const file = acceptedFiles[0]
        setUploadedFiles(prev => [...prev, file])
        await processImage(file)
      }
    }
  })

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
      const result = await processImageForMeeting(file, {
        meetingId: id,
        stakeholder: formData.selectedStakeholder,
        template: formData.template
      }, {
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
        setExtractedText(result.ocrResult.text)
        setOcrStatus('OCR completed successfully!')

        // Auto-populate digital notes with OCR results
        if (result.ocrResult && result.ocrResult.text && !result.debug?.isFallback) {
          console.log('OCR SUCCESS - Populating quadrants with OCR result:', result.ocrResult)
          console.log('OCR Debug info:', result.debug)
          console.log('OCR Text length:', result.ocrResult.text.length)

          const sections = result.ocrResult.extractedSections || {}
          const text = result.ocrResult.text

          // Smart 2-section population
          let newNotes = {
            keyDiscussionPoints: digitalNotes.keyDiscussionPoints,
            actionItems: digitalNotes.actionItems
          }

          // Try to populate with Claude AI analysis first
          if (sections.keyDiscussionPoints && sections.keyDiscussionPoints.length > 0) {
            newNotes.keyDiscussionPoints = sections.keyDiscussionPoints.join('\n')
          }

          if (sections.actionItems && sections.actionItems.length > 0) {
            // Format action items properly
            const formattedActionItems = sections.actionItems.map(item => {
              if (typeof item === 'string') {
                return `• ${item}`
              } else {
                let formatted = `• ${item.task}`
                if (item.assignee && item.assignee !== 'Unassigned') {
                  formatted += ` (${item.assignee})`
                }
                if (item.priority && item.priority !== 'medium') {
                  formatted += ` [${item.priority.toUpperCase()}]`
                }
                if (item.dueDate) {
                  formatted += ` - Due: ${item.dueDate}`
                }
                return formatted
              }
            })
            newNotes.actionItems = formattedActionItems.join('\n')
          }

          // If we have notes section or no specific sections were found, distribute text
          if (sections.notes && sections.notes.length > 0) {
            console.log('Distributing notes across 2 sections:', sections.notes.length, 'lines')
            const notes = sections.notes
            const halfLength = Math.ceil(notes.length / 2)

            // Only populate empty sections
            if (!newNotes.keyDiscussionPoints || newNotes.keyDiscussionPoints === digitalNotes.keyDiscussionPoints) {
              newNotes.keyDiscussionPoints = notes.slice(0, halfLength).join('\n')
              console.log('Populated keyDiscussionPoints with', halfLength, 'lines')
            }
            if (!newNotes.actionItems || newNotes.actionItems === digitalNotes.actionItems) {
              const actionLines = notes.slice(halfLength).map(line => `• ${line}`)
              newNotes.actionItems = actionLines.join('\n')
              console.log('Populated actionItems with', notes.length - halfLength, 'lines')
            }
          } else if (!sections.keyDiscussionPoints?.length && !sections.actionItems?.length) {
            // No sections found at all, distribute raw text lines across 2 sections
            console.log('No sections found, distributing raw text across 2 sections')
            const lines = text.split('\n').filter(line => line.trim().length > 0)
            const halfLength = Math.ceil(lines.length / 2)

            if (lines.length > 0) {
              newNotes.keyDiscussionPoints = lines.slice(0, halfLength).join('\n')
              const actionLines = lines.slice(halfLength).map(line => `• ${line}`)
              newNotes.actionItems = actionLines.join('\n')
              console.log('Distributed', lines.length, 'lines across 2 sections')
            }
          }

          console.log('Final 2-section assignment:', newNotes)
          setDigitalNotes(newNotes)
        } else if (result.debug?.isFallback) {
          console.log('OCR FALLBACK - Not populating quadrants, user needs to configure API key')
        } else {
          console.log('OCR result structure:', { hasOcrResult: !!result.ocrResult, hasText: !!result.ocrResult?.text, isFallback: result.debug?.isFallback })
        }

        // Handle fallback message display
        if (result.debug?.isFallback && result.ocrResult.extractedSections?.fallbackMessage) {
          setOcrStatus(result.ocrResult.extractedSections.fallbackMessage.substring(0, 150) + '...')
        } else {
          // Show success notification
          setTimeout(() => {
            setOcrStatus('')
            setOcrProgress(0)
          }, 2000)
        }

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
        ocrResult: {
          ...prev.ocrResult,
          text: newText
        }
      }))
    }
  }

  const toggleTextEditing = () => {
    setIsEditingExtractedText(!isEditingExtractedText)
  }

  // AI Processing functions
  const processImageWithAI = async (imageResult) => {
    if (aiMode === 'off') return
    
    setIsAIProcessing(true)
    setAiProcessingStage('ocr')
    
    try {
      // Process the OCR result with AI services
      const aiResult = await aiCoordinator.processImageWithAI(imageResult, {
        extractActionItems: true,
        analyzeSentiment: true
      })
      
      setAiProcessingResult(aiResult)
      
      // Auto-populate digital notes if enabled
      if (aiMode === 'auto' && aiResult.ocr?.text) {
        await populateNotesFromAI(aiResult.ocr.text)
      }
      
    } catch (error) {
      console.error('AI processing failed:', error)
    } finally {
      setIsAIProcessing(false)
      setAiProcessingStage('')
    }
  }
  
  const processMeetingWithAI = async (meetingData) => {
    if (aiMode === 'off') return
    
    setIsAIProcessing(true)
    const stages = ['extraction', 'sentiment', 'insights', 'notifications']
    
    try {
      for (const stage of stages) {
        setAiProcessingStage(stage)
        await new Promise(resolve => setTimeout(resolve, 800))
      }
      
      // Get current stakeholder info
      const currentStakeholder = displayStakeholders.find(s => s.id === formData.selectedStakeholder)
      
      // Process meeting with AI coordinator
      const aiResult = await aiCoordinator.processFullMeetingAI(meetingData, displayStakeholders)
      
      if (aiResult.success) {
        setAiProcessingResult(aiResult)
        
        // Generate stakeholder insights if we have a stakeholder
        if (currentStakeholder) {
          setAiProcessingStage('insights')
          const insights = await aiCoordinator.generateStakeholderInsights(
            currentStakeholder, 
            [meetingData], 
            stakeholders
          )
          setAiInsights(insights)
        }
        
        // Generate predictive notifications
        setAiProcessingStage('notifications')
        const notifications = await aiCoordinator.generatePredictiveNotifications(
          stakeholders, 
          [meetingData]
        )
        setAiNotifications(notifications.notifications || [])
      }
      
    } catch (error) {
      console.error('AI meeting processing failed:', error)
    } finally {
      setIsAIProcessing(false)
      setAiProcessingStage('')
    }
  }
  
  const populateNotesFromAI = async (text) => {
    setAiProcessingStage('extraction')
    
    // Use AI to extract different types of content
    const actionItemsResult = await aiCoordinator.actionItemExtractor.extractFromMeetingContent(text)
    
    // Smart population based on content analysis
    const lines = text.split('\n').filter(line => line.trim())
    const sections = {
      agenda: lines.filter(line => /^[\d•-]\s/.test(line.trim())),
      decisions: lines.filter(line => /decision|decided|agree|approved/i.test(line)),
      concerns: lines.filter(line => /concern|issue|problem|risk|blocker/i.test(line)),
      actions: actionItemsResult.actionItems?.map(item => item.title) || []
    }
    
    setDigitalNotes(prev => ({
      topLeft: prev.topLeft || sections.agenda.join('\n'),
      topRight: prev.topRight || sections.decisions.join('\n'),
      bottomLeft: prev.bottomLeft || sections.concerns.join('\n'),
      bottomRight: prev.bottomRight || sections.actions.join('\n')
    }))
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
        notes: Object.values(digitalNotes).map((content, index) => ({
          id: `note_${index}`,
          content,
          timestamp: new Date().toISOString(),
          type: 'digital'
        })).filter(note => note.content.trim()),
        ocrResults: ocrResult,
        uploadedFiles: uploadedFiles.map(f => f.name),
        lastSaved: new Date().toISOString(),
        status: 'completed'
      }
      
      // Process with AI if enabled
      if (aiMode !== 'off') {
        await processMeetingWithAI(meetingData)
      }
      
      // Update meeting with AI results
      const updatedMeeting = {
        ...meetingData,
        aiProcessingResult,
        aiInsights,
        aiNotifications
      }
      
      updateMeeting(updatedMeeting)
      
    } catch (error) {
      console.error('Save failed:', error)
    } finally {
      setIsSaving(false)
    }
  }
  
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

    if (isLeftSwipe && activeMode === 'digital') {
      setActiveMode('photo')
    }
    if (isRightSwipe && activeMode === 'photo') {
      setActiveMode('digital')
    }
  }

  // AI notification handlers
  const handleAIActionClick = (action, notification) => {
    console.log('AI Action clicked:', action, notification)
    // Implement specific actions based on action.action type
  }
  
  const handleAINotificationDismiss = (notificationId) => {
    setAiNotifications(prev => prev.filter(n => n.id !== notificationId))
  }
  
  const handleAIInsightAction = (insight) => {
    console.log('AI Insight action:', insight)
    // Implement insight-specific actions
  }

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
              window.location.href = '/meetingflow-app/'
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
                  window.location.href = '/meetingflow-app/'
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
              
              {/* Notion Sync Status */}
              <NotionSyncStatus className="hidden sm:flex" />

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
                  <NotionStakeholderDropdown
                    value={formData.selectedStakeholder}
                    onChange={(value) => handleInputChange('selectedStakeholder', value)}
                    placeholder="Select stakeholder..."
                    className="w-full"
                  />
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

            {/* Mode Toggle */}
            <div className="bg-white rounded-lg shadow-md p-4 md:p-6">
              <h3 className="text-lg font-semibold mb-4">Note Taking Mode</h3>
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-1 sm:rounded-lg sm:border sm:border-gray-200 sm:p-1">
                <TouchButton
                  onClick={() => setActiveMode('digital')}
                  variant={activeMode === 'digital' ? 'primary' : 'secondary'}
                  size="medium"
                  fullWidth
                  className="justify-center"
                >
                  <Grid3X3 size={16} />
                  Digital Notes
                </TouchButton>
                <TouchButton
                  onClick={() => setActiveMode('photo')}
                  variant={activeMode === 'photo' ? 'primary' : 'secondary'}
                  size="medium"
                  fullWidth
                  className="justify-center"
                >
                  <Camera size={16} />
                  Photo Capture
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
                    <Target size={24} />
                    4-Quadrant Notes
                  </h2>
                  {template && (
                    <div className={`px-3 py-1 rounded-full text-sm font-medium ${getColorClasses(template.color)}`}>
                      {template.name}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4 h-[600px]">
                  {template ? (
                    // Template-based quadrants
                    Object.entries(template.quadrants).map(([key, quadrant]) => (
                      <div key={key} className="border border-gray-200 rounded-lg p-4">
                        <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                          {quadrant.title}
                        </h3>
                        <textarea
                          value={digitalNotes[key]}
                          onChange={(e) => handleSectionChange(key, e.target.value)}
                          placeholder={quadrant.placeholder}
                          className="w-full h-full resize-none border-none focus:outline-none text-sm"
                        />
                      </div>
                    ))
                  ) : (
                    // Default sections
                    [
                      { key: 'keyDiscussionPoints', title: 'Key Discussion Points', icon: '💬' },
                      { key: 'actionItems', title: 'Action Items', icon: '📋' }
                    ].map(({ key, title, icon }) => (
                      <div key={key} className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors group">
                        <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                          <span>{icon}</span>
                          {title}
                          <Edit3 className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </h3>
                        <textarea
                          value={digitalNotes[key]}
                          onChange={(e) => handleSectionChange(key, e.target.value)}
                          placeholder={`Add ${title.toLowerCase()}...`}
                          className="w-full h-full resize-none border-none focus:outline-none text-sm hover:bg-gray-50 focus:bg-white transition-colors"
                        />
                      </div>
                    ))
                  )}
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

                {/* AI-Powered OCR Upload */}
                <div className="bg-white rounded-lg shadow-md p-6">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Eye size={20} />
                    AI OCR Text Extraction
                  </h3>

                  <OCRImageUpload
                    onImageProcessed={processImageWithAI}
                    onError={(error) => console.error('OCR Error:', error)}
                  />
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
                          ({Math.round(ocrResult.ocrResult.confidence * 100)}% confidence)
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
                            {(extractedText || ocrResult.ocrResult.text).length} characters • {(extractedText || ocrResult.ocrResult.text).split(/\s+/).length} words
                          </span>
                        </h4>

                        {isEditingExtractedText ? (
                          <div className="space-y-2">
                            <textarea
                              value={extractedText || ocrResult.ocrResult.text}
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
                              {extractedText || ocrResult.ocrResult.text}
                            </pre>
                            <div className="absolute top-2 right-2">
                              <button
                                onClick={() => {
                                  if (!extractedText) setExtractedText(ocrResult.ocrResult.text)
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
                      {uploadedFiles.map((file, index) => (
                        <div key={index} className="relative">
                          <div className="w-full h-32 bg-gray-100 rounded-lg flex items-center justify-center">
                            <div className="text-center">
                              <Image size={24} className="mx-auto text-gray-400 mb-1" />
                              <p className="text-xs text-gray-600">{file.name}</p>
                            </div>
                          </div>
                          <div className="absolute top-2 right-2 bg-blue-500 text-white px-2 py-1 rounded text-xs">
                            Uploaded
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* AI Processing Results */}
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
            )}
          </div>
        </ResponsiveGrid>
      </main>
      
        {/* AI Processing Status Overlay */}
        <AIProcessingStatus 
          isProcessing={isAIProcessing}
          stage={aiProcessingStage}
          progress={isAIProcessing ? 65 : 0}
        />
      </div>
    </PullToRefresh>
  )
}