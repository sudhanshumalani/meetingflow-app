import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import { useApp } from '../contexts/AppContext'
import { useFullMeeting, useStakeholders } from '../hooks/useMeetings'
import { v4 as uuidv4 } from 'uuid'
import TranscriptStorage from '../utils/transcriptStorage'
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
  Edit3,
  Search,
  XCircle,
  Download
} from 'lucide-react'
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
import AudioRecorderSimple from '../components/AudioRecorderSimple'
import SpeakerTranscriptView from '../components/SpeakerTranscriptView'

// Constants for better maintainability
const CHAR_LIMITS = {
  TITLE_WARNING: 20,
  TITLE_MAX: 50,
  NOTES_WARNING: 100
}

const SAVE_CONFIRMATION_TIMEOUT = 3000

export default function Meeting() {
  const { id } = useParams()
  const navigate = useNavigate()

  // Read from Dexie (primary) with AppContext fallback
  const dexieMeeting = useFullMeeting(id !== 'new' ? id : null)
  const dexieStakeholders = useStakeholders()

  // Keep action functions and fallback data from AppContext
  const {
    meetings: appContextMeetings,
    stakeholders: appContextStakeholders,
    currentMeeting,
    addMeeting,
    updateMeeting,
    setCurrentMeeting
  } = useApp()

  // Use Dexie data if available, fallback to AppContext for transition period
  const stakeholders = (dexieStakeholders && dexieStakeholders.length > 0) ? dexieStakeholders : (appContextStakeholders ?? [])

  // Ref to track which meeting ID has been initialized (prevents infinite loop)
  const loadedMeetingIdRef = useRef(null)

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
  const [speakerData, setSpeakerData] = useState(null) // Speaker diarization data
  const [isProcessingSpeakers, setIsProcessingSpeakers] = useState(false) // Track speaker processing state

  // Debug: Monitor audioTranscript state changes
  useEffect(() => {
    console.log('📝 Meeting: audioTranscript state changed:', {
      length: audioTranscript?.length || 0,
      preview: audioTranscript?.substring(0, 100) + '...',
      hasContent: !!audioTranscript?.trim()
    })
  }, [audioTranscript])

  // AI processing state
  const [isSaving, setIsSaving] = useState(false)
  // Removed complex ID caching - will generate fresh IDs based on URL

  // Stakeholder dropdown states
  const [stakeholderSearchTerm, setStakeholderSearchTerm] = useState('')
  const [showStakeholderDropdown, setShowStakeholderDropdown] = useState(false)

  // Save confirmation state
  const [showSaveConfirmation, setShowSaveConfirmation] = useState(false)
  const [saveError, setSaveError] = useState(null) // Error state for save operations
  // AI processing state (uses Claude AI analysis hook)
  const [isAIProcessing, setIsAIProcessing] = useState(false)
  const [aiMode, setAiMode] = useState('auto') // 'auto', 'manual', 'off'

  // Track if we're currently restoring a meeting to prevent unwanted AI analysis
  const [isRestoringMeeting, setIsRestoringMeeting] = useState(false)

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
    setResult: setAiResult,
    hasResult,
    isStreaming,
    capabilities
  } = useAIAnalysis()
  

  // Use real stakeholders from app context, fallback to mock data for demo
  const displayStakeholders = stakeholders.length > 0 ? stakeholders : mockStakeholders

  // Filter stakeholders for dropdown
  // Memoized stakeholder filtering for performance
  const filteredStakeholdersForDropdown = useMemo(() =>
    displayStakeholders.filter(stakeholder =>
      stakeholder.name.toLowerCase().includes(stakeholderSearchTerm.toLowerCase())
    ), [displayStakeholders, stakeholderSearchTerm]
  )

  // Cleanup object URLs when component unmounts
  useEffect(() => {
    return () => {
      uploadedImageUrls.forEach(imageData => {
        URL.revokeObjectURL(imageData.url)
      })
    }
  }, [uploadedImageUrls])

  // FIX #6: Auto-clear save error when speaker processing completes
  // This prevents users from being stuck with a stale error message
  useEffect(() => {
    if (!isProcessingSpeakers && saveError?.message?.includes('speaker identification')) {
      console.log('✅ Speaker processing complete - clearing save error')
      setSaveError(null)
    }
  }, [isProcessingSpeakers, saveError])

  useEffect(() => {
    // Only run this effect when ID changes
    if (!id || id === 'new') {
      loadedMeetingIdRef.current = null
      console.log('📝 New meeting mode - no restoration needed')
      return
    }

    // Prevent infinite loop by checking if we already loaded this meeting
    if (loadedMeetingIdRef.current === id) {
      console.log('📝 Meeting already loaded for ID:', id, '- skipping re-initialization')
      return
    }

    // Wait for Dexie to finish loading (undefined = still loading)
    if (dexieMeeting === undefined) {
      console.log('📝 Waiting for Dexie to load meeting...')
      return
    }

    console.log('🔄 Loading meeting data for ID:', id)

    // Use Dexie data if available, fallback to AppContext
    let meetingData = dexieMeeting
    if (!meetingData || !meetingData.aiResult) {
      // Dexie doesn't have full data, try AppContext
      console.log('📝 Dexie data incomplete, checking AppContext...')
      meetingData = (currentMeeting && currentMeeting.id === id)
        ? currentMeeting
        : appContextMeetings?.find(m => m.id === id) || dexieMeeting || null
    }
    console.log('📝 Found meeting:', meetingData ? { id: meetingData.id, title: meetingData.title, hasAiResult: !!meetingData.aiResult } : 'NOT FOUND')

    if (meetingData) {
      // Mark this meeting as loaded to prevent re-initialization
      loadedMeetingIdRef.current = id
      console.log('🔍 DEBUG: Loading meeting data:', {
        digitalNotes: meetingData.digitalNotes,
        aiResult: meetingData.aiResult,
        notes: meetingData.notes,
        originalInputs: meetingData.originalInputs,
        audioTranscript: meetingData.audioTranscript
      })

      setCurrentMeeting(meetingData)

      // Set form data
      console.log('🔍 DEBUG: Loading meeting data:', {
        id: meetingData.id,
        selectedStakeholder: meetingData.selectedStakeholder,
        stakeholderIds: meetingData.stakeholderIds,
        formDataBeingSaved: meetingData
      })

      setFormData({
        title: meetingData.title || '',
        selectedStakeholder: meetingData.selectedStakeholder || meetingData.stakeholderIds?.[0] || '',
        date: meetingData.scheduledAt ? meetingData.scheduledAt.split('T')[0] : new Date().toISOString().split('T')[0],
        priority: meetingData.priority || 'medium',
        template: meetingData.template || null
      })

      // Load existing notes if any
      if (meetingData.digitalNotes && Object.values(meetingData.digitalNotes).some(v => v)) {
        console.log('🔄 LOADING: Restoring digital notes:', meetingData.digitalNotes)
        setDigitalNotes(meetingData.digitalNotes)
      }

      // Load existing AI result if any
      if (meetingData.aiResult) {
        console.log('🔄 LOADING: Restoring AI result:', meetingData.aiResult)
        setAiResult(meetingData.aiResult)
      }

      // Load original input sources if any - this is the critical part
      if (meetingData.originalInputs) {
        console.log('🔄 LOADING: Restoring original inputs:', meetingData.originalInputs)

        // Set restoration flag to prevent unwanted AI analysis during restoration
        setIsRestoringMeeting(true)

        // Use setTimeout to ensure state updates are batched properly
        setTimeout(() => {
          let restoredContentType = null
          let hasManualText = false
          let hasOcrResults = false
          let hasAudioTranscript = false

          // Restore all content types first

          // Restore manual text (copy-pasted notes)
          if (meetingData.originalInputs.manualText) {
            console.log('📝 RESTORING manual text:', meetingData.originalInputs.manualText.substring(0, 100) + '...')
            setManualText(meetingData.originalInputs.manualText)
            setShowManualInput(true) // Show the manual input section
            hasManualText = true
            console.log('✅ Manual text restored and section shown')
          }

          // Restore OCR results and extracted text
          if (meetingData.originalInputs.ocrResults) {
            console.log('📝 RESTORING OCR results:', meetingData.originalInputs.ocrResults)
            setOcrResult(meetingData.originalInputs.ocrResults)
            if (meetingData.originalInputs.extractedText) {
              console.log('📝 RESTORING extracted text:', meetingData.originalInputs.extractedText.substring(0, 100) + '...')
              setExtractedText(meetingData.originalInputs.extractedText)
            }
            hasOcrResults = true
            console.log('✅ OCR data restored')
          }

          // Restore audio transcript from originalInputs (this takes precedence)
          if (meetingData.originalInputs.audioTranscript) {
            console.log('📝 RESTORING audio transcript from originalInputs:', meetingData.originalInputs.audioTranscript.substring(0, 100) + '...')
            setAudioTranscript(meetingData.originalInputs.audioTranscript)
            hasAudioTranscript = true
            console.log('✅ Audio transcript restored from originalInputs')
          } else if (meetingData.audioTranscript) {
            // Fallback to top-level audioTranscript
            console.log('📝 RESTORING audio transcript from meetingData:', meetingData.audioTranscript.substring(0, 100) + '...')
            setAudioTranscript(meetingData.audioTranscript)
            hasAudioTranscript = true
            console.log('✅ Audio transcript restored from meetingData')
          }

          // Restore speaker data
          if (meetingData.originalInputs.speakerData) {
            console.log('👥 RESTORING speaker data from originalInputs:', meetingData.originalInputs.speakerData.speakers_detected, 'speakers')
            setSpeakerData(meetingData.originalInputs.speakerData)
            console.log('✅ Speaker data restored from originalInputs')
          } else if (meetingData.speakerData) {
            console.log('👥 RESTORING speaker data from meetingData:', meetingData.speakerData.speakers_detected, 'speakers')
            setSpeakerData(meetingData.speakerData)
            console.log('✅ Speaker data restored from meetingData')
          }

          // Determine which mode to switch to (priority: manual text > OCR > audio)
          if (hasManualText) {
            restoredContentType = 'digital'
            console.log('🎯 PRIORITY: Manual text found - switching to digital mode')
          } else if (hasOcrResults) {
            restoredContentType = 'photo'
            console.log('🎯 PRIORITY: OCR results found - switching to photo mode')
          } else if (hasAudioTranscript) {
            restoredContentType = 'audio'
            console.log('🎯 PRIORITY: Audio transcript found - switching to audio mode')
          }

          // Auto-switch to the appropriate mode to show the restored content
          if (restoredContentType) {
            console.log('🔄 AUTO-SWITCHING to mode:', restoredContentType, 'to show restored content')
            setActiveMode(restoredContentType)
          }

          // Clear restoration flag after restoration is complete
          setTimeout(() => {
            console.log('🏁 Restoration complete - clearing restoration flag')
            setIsRestoringMeeting(false)
          }, 200)
        }, 0)

      } else {
        // Clear all input states when loading a meeting without original inputs
        setManualText('')
        setShowManualInput(false)
        setOcrResult(null)
        setExtractedText('')

        // Still check for top-level audioTranscript if no originalInputs
        if (meetingData.audioTranscript) {
          console.log('🔄 LOADING: Restoring audio transcript (no originalInputs):', meetingData.audioTranscript.substring(0, 100) + '...')
          setAudioTranscript(meetingData.audioTranscript)
        } else {
          setAudioTranscript('')
        }

        setUploadedFiles([])
        setUploadedImageUrls([])
      }

      console.log('✅ Meeting loaded successfully:', meetingData.title)
    } else {
      console.log('📝 No meeting found - this is a new meeting')
    }
  }, [id, dexieMeeting, appContextMeetings, currentMeeting, setCurrentMeeting]) // eslint-disable-line react-hooks/exhaustive-deps
  // Note: We use loadedMeetingIdRef to prevent infinite loops

  // Debug: Check state after restoration (with delay to account for setTimeout)
  useEffect(() => {
    const timer = setTimeout(() => {
      console.log('🔍 STATE CHECK - detailed debug:', {
        ocrResult: ocrResult ? 'HAS DATA' : 'NULL',
        extractedText: extractedText ? extractedText.substring(0, 50) + '...' : 'NULL',
        manualText: manualText ? manualText.substring(0, 50) + '...' : 'NULL',
        audioTranscript: audioTranscript ? audioTranscript.substring(0, 50) + '...' : 'NULL',
        showManualInput,
        activeMode,
        manualTextLength: manualText?.length || 0,
        shouldShowManualTextSection: !!manualText,
        isRestoringMeeting
      })
    }, 100) // Check after setTimeout in restoration has had time to execute

    return () => clearTimeout(timer)
  }, [ocrResult, extractedText, manualText, audioTranscript, showManualInput, activeMode, isRestoringMeeting])

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

  // Close stakeholder dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showStakeholderDropdown && !event.target.closest('.stakeholder-dropdown-container')) {
        setShowStakeholderDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showStakeholderDropdown])

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
  const handleAIAnalysis = async (text, options = {}) => {
    console.log('🚀 handleAIAnalysis CALLED with:', {
      hasText: !!text,
      textLength: text?.length,
      textPreview: text?.substring(0, 50) + '...',
      isRestoration: options.isRestoration,
      isRestoringMeetingFlag: isRestoringMeeting,
      callStack: new Error().stack.split('\n')[2]?.trim()
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

        // Always preserve manual text - don't clear it after Claude analysis
        // The original input should remain visible for reference
        console.log('💾 Preserving manual input (after Claude analysis)')
        // Note: We no longer clear setManualText('') or setShowManualInput(false)
        // This ensures the original input remains visible in the "Your Original Notes" section

        setErrorMessage('')

        console.log('✅ Meeting notes populated from Claude AI successfully!')
        console.log('📝 Final digitalNotes state should be:', newNotes)

        // AUTO-SAVE: Save the meeting with AI results to Firestore
        // This ensures AI analysis done on desktop syncs back to mobile
        if (!isCreatingNew && id) {
          console.log('💾 Auto-saving meeting with AI results...')
          try {
            // Build meeting data with the new AI result
            const meetingDataForSave = {
              id,
              ...formData,
              digitalNotes: newNotes,
              audioTranscript,
              speakerData,
              aiResult: result, // Use the result directly since state may not have updated yet
              updatedAt: new Date().toISOString(),
              lastSaved: new Date().toISOString()
            }

            // Save to context (which saves to localStorage and Firestore)
            const saveResult = await updateMeeting(meetingDataForSave)
            if (saveResult?.success) {
              console.log('✅ Auto-save after AI analysis successful')
            } else {
              console.warn('⚠️ Auto-save after AI analysis had issues:', saveResult)
            }
          } catch (saveError) {
            console.error('❌ Auto-save after AI analysis failed:', saveError)
            // Don't show error to user - the AI analysis itself succeeded
          }
        }
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

          // Process with Claude AI for intelligent analysis (but NOT during restoration)
          if (text.length > 20 && !isRestoringMeeting) {
            console.log('🧠 TRIGGERING Claude AI analysis...')
            console.log('🔧 About to call handleAIAnalysis with text:', text.substring(0, 50) + '...')

            try {
              await handleAIAnalysis(text)
              console.log('✅ handleAIAnalysis completed successfully!')
            } catch (error) {
              console.error('❌ handleAIAnalysis failed:', error)
              setErrorMessage(`Claude AI failed: ${error.message}`)
            }
          } else if (isRestoringMeeting) {
            console.log('⏸️ SKIPPING Claude AI analysis - restoration mode active')
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

  
  


  // Helper: Clean speakerData to remove large unnecessary arrays
  // This dramatically reduces storage size (from ~1MB to ~50KB for long recordings)
  const cleanSpeakerData = (data) => {
    if (!data) return null

    // Strip the 'words' array - it contains every word with timestamps (huge!)
    // Keep only the essential data: utterances (who said what) and metadata
    const cleaned = {
      // Keep speaker utterances but limit to reasonable size
      utterances: data.utterances?.slice(0, 500)?.map(u => ({
        speaker: u.speaker,
        text: u.text,
        start: u.start,
        end: u.end
        // Note: 'words' field intentionally omitted (Firestore rejects undefined)
      })) || [],
      // Keep metadata
      speakers_detected: data.speakers_detected,
      confidence: data.confidence,
      audio_duration: data.audio_duration,
      text: data.text,
      // Explicitly exclude 'words' array (can be 500KB-2MB for long recordings)
      // words: undefined - not included
    }

    console.log('📦 Cleaned speakerData:', {
      originalSize: JSON.stringify(data).length,
      cleanedSize: JSON.stringify(cleaned).length,
      reduction: Math.round((1 - JSON.stringify(cleaned).length / JSON.stringify(data).length) * 100) + '%'
    })

    return cleaned
  }

  // Build meeting data object
  // OPTIMIZED: Removes data duplication and strips large arrays
  const buildMeetingData = (meetingId) => {
    try {
      // Clean speakerData to remove words[] array (saves 500KB-2MB)
      const cleanedSpeakerData = cleanSpeakerData(speakerData)

      // Calculate and log data sizes for debugging
      const dataSizes = {
        audioTranscript: audioTranscript?.length || 0,
        speakerDataOriginal: speakerData ? JSON.stringify(speakerData).length : 0,
        speakerDataCleaned: cleanedSpeakerData ? JSON.stringify(cleanedSpeakerData).length : 0,
        aiResult: aiResult ? JSON.stringify(aiResult).length : 0
      }
      console.log('📦 Meeting data sizes (bytes):', dataSizes)

      // Ensure scheduledAt is set from formData.date, but preserve original date if not changed
      const meetingDate = formData.date

      return {
        id: meetingId,
        ...formData,
        // Convert date to scheduledAt format for consistent storage
        // Store as local time (no Z suffix) to avoid timezone shifts
        scheduledAt: meetingDate ? `${meetingDate}T12:00:00` : undefined,
        digitalNotes,
        // Store transcript once (not duplicated)
        audioTranscript,
        // Store cleaned speaker data (without words[] array)
        speakerData: cleanedSpeakerData,
        aiResult,
        // Simplified originalInputs - NO duplication of transcript/speakerData
        originalInputs: {
          manualText: manualText || null,
          uploadedImages: uploadedFiles.map(file => ({
            name: file.name,
            size: file.size,
            type: file.type,
            lastModified: file.lastModified
          })),
          ocrResults: ocrResult,
          extractedText: extractedText || null
          // REMOVED: audioTranscript duplication (already stored at root level)
          // REMOVED: speakerData duplication (already stored at root level)
        },
        // Notes array - digital notes only, transcript stored separately
        notes: Object.values(digitalNotes).map((content, index) => ({
          id: `note_${index}`,
          content,
          timestamp: new Date().toISOString(),
          type: 'digital'
        })).filter(note => note.content.trim()),
        // REMOVED: audioTranscript duplication in notes array
        // The transcript is already accessible via meeting.audioTranscript
        uploadedFiles: uploadedFiles.map(f => f.name),
        lastSaved: new Date().toISOString(),
        status: 'completed'
      }
    } catch (error) {
      console.error('❌ Error building meeting data:', error)
      throw new Error(`Failed to build meeting data: ${error.message}`)
    }
  }

  // Helper: Provide context-specific suggestions for save errors
  const getSaveSuggestion = (error) => {
    const errorMsg = error?.message || ''

    if (errorMsg.includes('quota') || errorMsg.includes('storage') || errorMsg.includes('Storage')) {
      return 'Storage is full. Try deleting old meetings or clearing browser cache.'
    }
    if (errorMsg.includes('speaker') || errorMsg.includes('Speaker')) {
      return 'Wait for speaker identification to finish, then try saving again.'
    }
    if (errorMsg.includes('Invalid') || errorMsg.includes('required')) {
      return 'Some required fields are missing. Please check your meeting details.'
    }
    if (errorMsg.includes('network') || errorMsg.includes('Network')) {
      return 'Check your internet connection and try again.'
    }
    return 'Please try again. If the problem persists, use the Export Backup button to save your notes.'
  }

  // Validation function to check meeting data before saving
  const validateMeetingData = () => {
    const errors = []

    if (!formData.title?.trim()) {
      errors.push('Meeting title is required')
    }

    // Check if we have any content at all
    const hasDigitalNotes = Object.values(digitalNotes).some(note => note?.trim())
    const hasAudioContent = audioTranscript?.trim()
    const hasOCRContent = extractedText?.trim()
    const hasManualContent = manualText?.trim()
    const hasUploadedImages = uploadedFiles?.length > 0

    const hasContent = hasDigitalNotes || hasAudioContent || hasOCRContent || hasManualContent || hasUploadedImages

    if (!hasContent) {
      errors.push('Meeting must have some content (notes, transcript, or images)')
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  // Save functionality
  // OPTIMIZED: Uses hybrid storage (localStorage for metadata, IndexedDB for large data)
  const handleSave = async () => {
    // Prevent save during speaker processing
    if (isProcessingSpeakers) {
      console.warn('⚠️ Save blocked: Speaker processing is still running')
      setSaveError({
        message: 'Cannot save while speaker identification is in progress',
        timestamp: new Date().toISOString(),
        canRetry: true,
        suggestion: 'Please wait for speaker processing to complete (usually 10-30 seconds), then try saving again.'
      })
      return
    }

    // Clear previous errors
    setSaveError(null)

    // Save operation starting
    setIsSaving(true)

    try {
      // Validate meeting data BEFORE attempting save
      const validation = validateMeetingData()
      if (!validation.valid) {
        throw new Error(`Invalid meeting data: ${validation.errors.join(', ')}`)
      }

      // SIMPLE ARCHITECTURE: URL determines the operation
      const isCreatingNew = (id === 'new')
      const meetingId = isCreatingNew ? uuidv4() : id

      // HYBRID STORAGE STRATEGY:
      // 1. Save large data (transcript, speakerData, aiResult) to IndexedDB
      // 2. Save lightweight meeting metadata to localStorage/Firestore
      // This prevents localStorage quota issues with long recordings

      // Check if we have large data to store separately
      const hasLargeData = audioTranscript || speakerData || aiResult
      const meetingData = buildMeetingData(meetingId)

      // Calculate total meeting data size
      const meetingDataSize = JSON.stringify(meetingData).length
      console.log('📦 Total meeting data size:', Math.round(meetingDataSize / 1024), 'KB')

      // If meeting data is large (> 100KB), store transcript data separately in IndexedDB
      if (meetingDataSize > 100 * 1024 && hasLargeData) {
        console.log('📦 Large meeting detected, using hybrid storage...')

        // Save large data to IndexedDB (async, iOS-safe)
        const transcriptSaveResult = await TranscriptStorage.save(meetingId, {
          audioTranscript: meetingData.audioTranscript,
          speakerData: meetingData.speakerData,
          aiResult: meetingData.aiResult
        })

        if (transcriptSaveResult.success) {
          console.log('✅ Large data saved to IndexedDB:', transcriptSaveResult.storage)

          // Create lightweight version for localStorage
          // Keep only metadata + flag that data is in IndexedDB
          meetingData._transcriptInIndexedDB = true
          meetingData._transcriptStorageType = transcriptSaveResult.storage

          // Keep a short preview for display, but remove full data
          if (meetingData.audioTranscript && meetingData.audioTranscript.length > 500) {
            meetingData._audioTranscriptPreview = meetingData.audioTranscript.substring(0, 500) + '...'
            // Don't delete audioTranscript entirely - keep it for now for compatibility
            // In future optimization, we could remove it entirely and load from IndexedDB
          }
        } else {
          console.warn('⚠️ IndexedDB save failed, keeping data in localStorage:', transcriptSaveResult.error)
          // Continue with full data in localStorage (may fail if too large)
        }
      }

      if (isCreatingNew) {
        // CREATE NEW MEETING
        console.log('🔍 DEBUG: Saving new meeting data:', {
          id: meetingData.id,
          size: Math.round(JSON.stringify(meetingData).length / 1024) + 'KB',
          hasIndexedDBData: meetingData._transcriptInIndexedDB || false
        })

        // Add to context with error handling
        const saveResult = await addMeeting(meetingData)
        if (saveResult && !saveResult.success) {
          throw new Error(saveResult.error || 'Failed to save meeting')
        }

        setCurrentMeeting(meetingData)
        navigate(`/meeting/${meetingId}`, { replace: true })
      } else {
        // UPDATE EXISTING MEETING
        console.log('🔍 DEBUG: Updating existing meeting data:', {
          id: meetingData.id,
          size: Math.round(JSON.stringify(meetingData).length / 1024) + 'KB',
          hasIndexedDBData: meetingData._transcriptInIndexedDB || false
        })

        // Update in context with error handling
        const saveResult = await updateMeeting(meetingData)
        if (saveResult && !saveResult.success) {
          throw new Error(saveResult.error || 'Failed to update meeting')
        }

        setCurrentMeeting(meetingData)
      }

      // Only show success if we get here without errors
      setShowSaveConfirmation(true)
      setTimeout(() => setShowSaveConfirmation(false), SAVE_CONFIRMATION_TIMEOUT)

    } catch (error) {
      console.error('❌ SAVE FAILED:', error)

      // Show user-friendly error with recovery options
      setSaveError({
        message: error.message || 'An unexpected error occurred while saving',
        timestamp: new Date().toISOString(),
        canRetry: true,
        suggestion: getSaveSuggestion(error)
      })

      // Don't clear the error automatically - user must acknowledge
    } finally {
      setIsSaving(false)
    }
  }

  // Export functionality now handled via n8n integration
  // See ExportOptionsButton component for export options

  // Helper function to format transcript with speaker labels
  const formatTranscriptForAI = () => {
    // If we have speaker data, format with speaker labels
    if (speakerData && speakerData.utterances && speakerData.utterances.length > 0) {
      const speakerLabels = speakerData.speakerLabels || {}
      return speakerData.utterances.map(utterance => {
        const speakerName = speakerLabels[utterance.speaker] || `Speaker ${utterance.speaker}`
        return `[${speakerName}]: ${utterance.text}`
      }).join('\n\n')
    }
    // Otherwise return plain transcript
    return audioTranscript
  }

  // Enhanced function to copy content to digital notes
  const handleCopyToDigitalNotes = () => {
    let contentToCopy = ''
    let sourceType = ''

    // Priority: Manual text > OCR extracted text > Audio transcript
    if (manualText && manualText.trim()) {
      contentToCopy = manualText
      sourceType = 'manual text'
    } else if (extractedText && extractedText.trim()) {
      contentToCopy = extractedText
      sourceType = 'OCR extracted text'
    } else if (audioTranscript && audioTranscript.trim()) {
      contentToCopy = audioTranscript
      sourceType = 'audio transcript'
    }

    if (contentToCopy) {
      console.log(`📝 Copying ${sourceType} to digital notes:`, contentToCopy.substring(0, 100) + '...')

      setDigitalNotes(prev => ({
        ...prev,
        summary: contentToCopy
      }))

      setActiveMode('digital')

      // Show a brief confirmation
      console.log(`✅ Copied ${sourceType} to digital notes and switched to edit mode`)
    } else {
      console.log('⚠️ No content available to copy to digital notes')
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
    // Reset loaded ref to allow re-initialization
    loadedMeetingIdRef.current = null
    // The useEffect will pick up the change and reload
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
                  disabled={isSaving || isAIProcessing || isProcessingSpeakers}
                  variant="primary"
                  size="small"
                  className="px-3 py-1"
                >
                  <Save size={14} />
                  {isSaving ? 'Saving...' : isProcessingSpeakers ? 'Processing...' : 'Save'}
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
                  disabled={isSaving || isAIProcessing || isProcessingSpeakers}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  <Save size={16} />
                  {isSaving ? 'Saving...' : isProcessingSpeakers ? 'Processing Speakers...' : 'Save Meeting'}
                </button>

              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-2 md:py-8 safe-bottom">
        {/* Speaker Processing Warning */}
        {isProcessingSpeakers && (
          <div className="mb-4 p-4 bg-yellow-50 border-2 border-yellow-200 rounded-lg shadow-sm animate-pulse">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-yellow-900 mb-1">
                  Speaker Identification in Progress
                </h3>
                <p className="text-sm text-yellow-700 mb-2">
                  Please wait for speaker processing to complete before saving. This ensures all speaker labels are properly included in your meeting notes.
                </p>
                <div className="flex items-center gap-2 text-xs text-yellow-600">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processing... This usually takes 10-30 seconds</span>
                </div>
              </div>
            </div>
          </div>
        )}

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

                {/* Searchable Stakeholder Dropdown */}
                <div className="stakeholder-dropdown-container">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Primary Stakeholder
                  </label>
                  <div className="relative">
                    <div
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer bg-white flex items-center justify-between"
                      onClick={() => setShowStakeholderDropdown(!showStakeholderDropdown)}
                    >
                      <span className="flex items-center gap-2">
                        <Users size={16} className="text-gray-400" />
                        {formData.selectedStakeholder ? (
                          displayStakeholders.find(s => s.id === formData.selectedStakeholder)?.name || 'Unknown Stakeholder'
                        ) : (
                          'Select stakeholder...'
                        )}
                      </span>
                      <ChevronDown size={16} className={`text-gray-400 transition-transform ${
                        showStakeholderDropdown ? 'rotate-180' : ''
                      }`} />
                    </div>

                    {showStakeholderDropdown && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-20 max-h-64 overflow-hidden">
                        {/* Search Input */}
                        <div className="p-3 border-b border-gray-200">
                          <div className="relative">
                            <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                            <input
                              type="text"
                              placeholder="Search stakeholders..."
                              value={stakeholderSearchTerm}
                              onChange={(e) => setStakeholderSearchTerm(e.target.value)}
                              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                        </div>

                        {/* Dropdown Options */}
                        <div className="max-h-48 overflow-y-auto">
                          {/* No Selection Option */}
                          <div
                            className={`px-3 py-2 cursor-pointer hover:bg-gray-50 flex items-center gap-2 ${
                              !formData.selectedStakeholder ? 'bg-blue-50 text-blue-600' : 'text-gray-700'
                            }`}
                            onClick={() => {
                              handleInputChange('selectedStakeholder', '')
                              setShowStakeholderDropdown(false)
                              setStakeholderSearchTerm('')
                            }}
                          >
                            <XCircle size={16} />
                            <span className="font-medium">No Stakeholder</span>
                            {!formData.selectedStakeholder && (
                              <CheckCircle size={16} className="ml-auto text-blue-600" />
                            )}
                          </div>

                          {filteredStakeholdersForDropdown.length > 0 ? (
                            filteredStakeholdersForDropdown.map(stakeholder => {
                              return (
                                <div
                                  key={stakeholder.id}
                                  className={`px-3 py-2 cursor-pointer hover:bg-gray-50 flex items-center gap-2 ${
                                    formData.selectedStakeholder === stakeholder.id ? 'bg-blue-50 text-blue-600' : 'text-gray-700'
                                  }`}
                                  onClick={() => {
                                    handleInputChange('selectedStakeholder', stakeholder.id)
                                    setShowStakeholderDropdown(false)
                                    setStakeholderSearchTerm('')
                                  }}
                                >
                                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium truncate">{stakeholder.name}</div>
                                    <div className="text-xs text-gray-500">
                                      {getCategoryDisplayName(stakeholder.category)}
                                    </div>
                                  </div>
                                  {formData.selectedStakeholder === stakeholder.id && (
                                    <CheckCircle size={16} className="text-blue-600" />
                                  )}
                                </div>
                              )
                            })
                          ) : (
                            <div className="px-3 py-4 text-center text-gray-500 text-sm">
                              No stakeholders found
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
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
                {/* HIDDEN: OCR from Image - not currently used
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
                */}
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
                          className="flex items-center gap-1 px-3 py-1 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isAnalyzing ? (
                            <>
                              <Loader2 size={14} className="animate-spin" />
                              Processing...
                            </>
                          ) : (
                            <>
                              <Sparkles size={14} />
                              AI Analysis
                            </>
                          )}
                        </button>
                        <button
                          onClick={handleCopyToDigitalNotes}
                          disabled={!manualText.trim()}
                          className="flex items-center gap-1 px-3 py-1 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Edit3 size={14} />
                          Edit Notes
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


                {/* Digital Notes Editing Section */}
                {digitalNotes.summary && (
                  <div className="mb-6 p-6 bg-green-50 rounded-lg border border-green-200">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-medium text-green-900 flex items-center gap-2">
                        📝 Meeting Notes
                      </h3>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            // Re-analyze with current digital notes content
                            if (digitalNotes.summary?.trim() && digitalNotes.summary.length > 50) {
                              handleAIAnalysis(digitalNotes.summary)
                            }
                          }}
                          disabled={isAnalyzing || !digitalNotes.summary?.trim()}
                          className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
                        >
                          <Sparkles className="w-3 h-3" />
                          {isAnalyzing ? 'Processing...' : 'Re-analyze'}
                        </button>
                        <button
                          onClick={() => {
                            setDigitalNotes({ summary: '', keyDiscussionPoints: '', actionItems: '' })
                          }}
                          className="px-3 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700 flex items-center gap-1"
                        >
                          🗑️ Clear
                        </button>
                      </div>
                    </div>

                    <div>
                      <textarea
                        value={digitalNotes.summary}
                        onChange={(e) => handleSectionChange('summary', e.target.value)}
                        placeholder="Your meeting notes will appear here when you use 'Edit Notes'. You can edit them directly and click 'Re-analyze' to update AI insights..."
                        className="w-full h-40 p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm resize-y"
                      />
                    </div>

                    <div className="mt-3 text-xs text-green-600">
                      💡 Edit your notes above, then click "Re-analyze" to update AI insights. Changes are automatically saved.
                    </div>
                  </div>
                )}

                {/* Original Input Text Display */}
                {manualText && (
                  <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <h3 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                      📝 Your Original Notes
                    </h3>
                    <div className="text-sm text-gray-700 whitespace-pre-wrap bg-white rounded p-3 border">
                      {manualText}
                    </div>
                  </div>
                )}
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
                          onClick={() => {
                            // Process OCR text with AI using standardized method
                            const textToAnalyze = extractedText || ocrResult.text
                            if (textToAnalyze && textToAnalyze.length > 100) {
                              handleAIAnalysis(textToAnalyze)
                            }
                          }}
                          disabled={isAnalyzing || (!extractedText && !ocrResult.text) || (extractedText || ocrResult.text || '').length < 100}
                          className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                        >
                          <Sparkles size={14} />
                          {isAnalyzing ? 'Processing...' : 'AI Analysis'}
                        </button>
                        <button
                          onClick={handleCopyToDigitalNotes}
                          className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-1"
                        >
                          <Edit3 size={14} />
                          Edit Notes
                        </button>
                        <button
                          onClick={toggleTextEditing}
                          className="flex items-center gap-1 px-3 py-1 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          <Edit3 size={12} />
                          {isEditingExtractedText ? 'Save' : 'Edit Text'}
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

                  <AudioRecorderSimple
                    onTranscriptUpdate={(transcript, speakers = null) => {
                      // WRAPPED IN TRY-CATCH to prevent crashes from bubbling to ErrorBoundary
                      try {
                        console.log('📝 Meeting: Received transcript:', transcript?.substring(0, 100) + '...')
                        console.log('👥 Meeting: Received speaker data:', speakers ? `${speakers.speakers_detected} speakers` : 'none')
                        setAudioTranscript(transcript)
                        if (speakers) {
                          setSpeakerData(speakers)
                        }
                        // Automatically populate digital notes when we have transcript
                        if (transcript && transcript.length > 50) {
                          setDigitalNotes(prev => ({
                            ...prev,
                            summary: transcript
                          }))
                        }
                      } catch (err) {
                        console.error('❌ Error in onTranscriptUpdate:', err)
                        // Don't rethrow - let recording continue
                      }
                    }}
                    onAutoSave={async (transcript, reason) => {
                      // CRITICAL FIX: Properly handle async operation with try-catch
                      // This was causing crashes when stop→start recording rapidly
                      if (id !== 'new') {
                        try {
                          // Capture state synchronously BEFORE any async operations
                          const meetingDataSnapshot = {
                            ...buildMeetingData(id),
                            audioTranscript: transcript,
                            lastAutoSaved: new Date().toISOString()
                          }
                          // Await the update and catch any errors
                          await updateMeeting(meetingDataSnapshot)
                          console.log(`✅ Auto-saved transcript (${reason})`)
                        } catch (err) {
                          // CRITICAL: Don't throw - this would crash the app
                          console.error(`❌ Auto-save failed (${reason}):`, err?.message || err)
                          // User can still continue recording/using the app
                        }
                      }
                    }}
                    onProcessingStateChange={(isProcessing) => {
                      // WRAPPED IN TRY-CATCH for safety
                      try {
                        setIsProcessingSpeakers(isProcessing)
                      } catch (err) {
                        console.error('❌ Error in onProcessingStateChange:', err)
                      }
                    }}
                    className="w-full"
                  />

                  {/* Transcript Display and Actions */}
                  {audioTranscript && audioTranscript.trim() && (
                    speakerData ? (
                      // Display speaker-identified transcript
                      <div className="mt-6">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="font-medium text-gray-900 flex items-center gap-2">
                            📝 Meeting Transcript
                          </h3>
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                // Process transcript with AI - use formatted version with speakers if available
                                const transcriptToAnalyze = formatTranscriptForAI()
                                if (transcriptToAnalyze && transcriptToAnalyze.length > 100) {
                                  handleAIAnalysis(transcriptToAnalyze)
                                }
                              }}
                              disabled={isAnalyzing}
                              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-md transition-colors disabled:opacity-50"
                            >
                              <Sparkles className="w-4 h-4" />
                              <span>{isAnalyzing ? 'Analyzing...' : 'AI Analyze'}</span>
                            </button>
                            <button
                              onClick={() => handleCopyToDigitalNotes()}
                              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                            >
                              <Edit3 className="w-4 h-4" />
                              <span>Edit Notes</span>
                            </button>
                          </div>
                        </div>
                        <SpeakerTranscriptView
                          speakerData={speakerData}
                          onUpdateSpeakers={setSpeakerData}
                        />
                      </div>
                    ) : (
                      // Display plain transcript (legacy mode)
                      <div className="mt-6">
                        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="font-medium text-gray-900 flex items-center gap-2">
                              📝 Meeting Transcript
                              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                                {audioTranscript.split(' ').filter(word => word.trim()).length} words
                              </span>
                            </h3>
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
                                onClick={handleCopyToDigitalNotes}
                                className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-1"
                              >
                                <Edit3 className="w-3 h-3" />
                                Edit Notes
                              </button>
                            </div>
                          </div>

                          <div className="max-h-60 overflow-y-auto text-sm text-gray-700 leading-relaxed bg-white rounded p-3 border">
                            <pre className="whitespace-pre-wrap font-sans">
                              {audioTranscript}
                            </pre>
                          </div>

                          <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                            <span>
                              Word count: {audioTranscript.split(' ').filter(word => word.trim()).length} |
                              Characters: {audioTranscript.length}
                            </span>
                            <span>
                              💡 Click "AI Analysis" to organize this transcript
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  )}

                  {/* Transcript Placeholder - Show when no transcript available */}
                  {(!audioTranscript || !audioTranscript.trim()) && (
                    <div className="mt-6 p-6 bg-blue-50 rounded-lg border border-blue-200 text-center">
                      <div className="text-blue-600 mb-2">
                        🎤 No transcript available yet
                      </div>
                      <p className="text-sm text-blue-700">
                        Start recording to generate a live transcript of your meeting.
                        The transcript will appear here as you speak.
                      </p>
                    </div>
                  )}

                  {/* Audio Recording Tips */}
                  <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                    <h4 className="font-medium text-blue-900 mb-2">📱 Mobile Recording Tips</h4>
                    <ul className="text-sm text-blue-700 space-y-1">
                      <li>• Position device 2-3 feet from speakers</li>
                      <li>• Minimize background noise when possible</li>
                      <li>• Speak clearly and at normal pace</li>
                      <li>• Recording works offline on your device</li>
                    </ul>
                  </div>
                </div>

              </div>
            )}


            {/* Claude AI Analysis Results Display */}
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

                  {/* People & Context */}
                  {aiResult.peopleAndContext && aiResult.peopleAndContext.length > 0 && (
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                        👥 People & Context
                      </h4>
                      <div className="bg-white rounded p-3 border border-gray-200">
                        <ul className="space-y-3">
                          {aiResult.peopleAndContext.map((person, index) => (
                            <li key={index} className="text-sm text-gray-700">
                              <div className="font-medium text-gray-900">{person.name}</div>
                              <div className="text-gray-600 mt-1">{person.background}</div>
                              {person.relevance && (
                                <div className="text-blue-600 text-xs mt-1 italic">{person.relevance}</div>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}

                  {/* Thematic Sections */}
                  {aiResult.thematicSections && aiResult.thematicSections.length > 0 && (
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                        📚 Key Topics
                      </h4>
                      <div className="bg-white rounded p-3 border border-gray-200 space-y-3">
                        {aiResult.thematicSections.map((section, index) => (
                          <div key={index}>
                            <h5 className="font-medium text-gray-800 mb-1">{section.sectionTitle}</h5>
                            <ul className="space-y-1 ml-3">
                              {section.content.map((item, itemIndex) => (
                                <li key={itemIndex} className="text-sm text-gray-700 flex items-start gap-2">
                                  <span className="text-blue-500 font-medium min-w-0">•</span>
                                  <span className="leading-relaxed">{item}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Strategic Insights */}
                  {aiResult.strategicInsights && aiResult.strategicInsights.length > 0 && (
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                        💡 Strategic Insights
                      </h4>
                      <div className="bg-white rounded p-3 border border-gray-200">
                        <ul className="space-y-2">
                          {aiResult.strategicInsights.map((insight, index) => (
                            <li key={index} className="text-sm text-gray-700 flex items-start gap-2">
                              <span className="text-purple-500 font-medium min-w-0">•</span>
                              <span className="leading-relaxed">{insight}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}

                  {/* Key Contacts */}
                  {aiResult.keyContacts && aiResult.keyContacts.length > 0 && (
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                        🤝 Key Contacts
                      </h4>
                      <div className="bg-white rounded p-3 border border-gray-200 space-y-3">
                        {aiResult.keyContacts.map((contact, index) => (
                          <div key={index} className="border-l-4 border-green-200 pl-3">
                            <div className="font-medium text-gray-800">{contact.name}</div>
                            <div className="text-sm text-gray-600 mb-1">{contact.role}</div>
                            <div className="text-sm text-gray-700">{contact.connection}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Themes (new thematic format) */}
                  {aiResult.themes && aiResult.themes.length > 0 && (
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                        📚 Discussion Topics
                      </h4>
                      <div className="space-y-3">
                        {aiResult.themes.map((theme, themeIndex) => (
                          <div key={themeIndex} className="bg-white rounded p-3 border border-gray-200">
                            <h5 className="font-medium text-gray-800 mb-2 flex items-center gap-2">
                              <span className="text-blue-500">▸</span>
                              {theme.topic}
                            </h5>
                            {theme.context && (
                              <p className="text-xs text-gray-500 italic mb-2 pl-4">{theme.context}</p>
                            )}
                            <ul className="space-y-1.5 pl-4">
                              {theme.keyPoints && theme.keyPoints.map((point, pointIndex) => (
                                <li key={pointIndex} className="text-sm text-gray-700 flex items-start gap-2">
                                  <span className="text-blue-400 font-medium min-w-0">•</span>
                                  <span className="leading-relaxed">{point}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Key Points - Legacy flat format (backward compatibility) */}
                  {!aiResult.themes && ((aiResult.keyPoints && aiResult.keyPoints.length > 0) ||
                    (aiResult.keyDiscussionPoints && aiResult.keyDiscussionPoints.length > 0)) && (
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                        💬 Key Points
                      </h4>
                      <div className="bg-white rounded p-3 border border-gray-200">
                        <ul className="space-y-2">
                          {(aiResult.keyPoints || aiResult.keyDiscussionPoints).slice(0, 15).map((point, index) => (
                            <li key={index} className="text-sm text-gray-700 flex items-start gap-2">
                              <span className="text-blue-500 font-medium min-w-0">•</span>
                              <span className="leading-relaxed">{point}</span>
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
                        📋 Action Items
                      </h4>
                      <div className="bg-white rounded p-3 border border-gray-200">
                        <ul className="space-y-3">
                          {aiResult.actionItems.slice(0, 15).map((item, index) => (
                            <li key={index} className="text-sm text-gray-700">
                              {typeof item === 'object' ? (
                                <div className="border-l-2 border-green-300 pl-3">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-medium text-gray-900">{item.task}</span>
                                    {item.priority && (
                                      <span className={`px-1.5 py-0.5 text-xs rounded font-medium ${
                                        item.priority === 'high' ? 'bg-red-100 text-red-700' :
                                        item.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                                        'bg-green-100 text-green-700'
                                      }`}>
                                        {item.priority}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap gap-3 mt-1 text-xs">
                                    {/* Support both old 'assignee' and new 'owner' field names */}
                                    {(item.owner || item.assignee) &&
                                     (item.owner || item.assignee) !== 'Unassigned' &&
                                     (item.owner || item.assignee) !== 'TBD' && (
                                      <span className="text-blue-600">👤 {item.owner || item.assignee}</span>
                                    )}
                                    {/* Support both old 'dueDate' and new 'deadline' field names */}
                                    {(item.deadline || item.dueDate) &&
                                     (item.deadline || item.dueDate) !== 'TBD' && (
                                      <span className="text-gray-500">📅 {item.deadline || item.dueDate}</span>
                                    )}
                                  </div>
                                  {item.context && (
                                    <div className="text-xs text-gray-500 mt-1 italic">{item.context}</div>
                                  )}
                                </div>
                              ) : (
                                <div className="flex items-start gap-2">
                                  <span className="text-green-500 font-medium min-w-0">•</span>
                                  <span className="leading-relaxed">{item}</span>
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}

                  {/* Decisions (new format) / Decisions Made (legacy format) */}
                  {((aiResult.decisions && aiResult.decisions.length > 0) ||
                    (aiResult.decisionsMade && aiResult.decisionsMade.length > 0)) && (
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                        ✅ Decisions
                      </h4>
                      <div className="bg-white rounded p-3 border border-gray-200">
                        <ul className="space-y-3">
                          {(aiResult.decisions || aiResult.decisionsMade).map((decision, index) => (
                            <li key={index} className="text-sm text-gray-700">
                              {typeof decision === 'object' ? (
                                <div className="border-l-2 border-purple-300 pl-3">
                                  <div className="font-medium text-gray-900">{decision.decision}</div>
                                  {decision.madeBy && decision.madeBy !== 'TBD' && (
                                    <div className="text-xs text-purple-600 mt-1">Made by: {decision.madeBy}</div>
                                  )}
                                  {decision.rationale && (
                                    <div className="text-xs text-gray-500 mt-1 italic">Why: {decision.rationale}</div>
                                  )}
                                  {decision.implications && (
                                    <div className="text-xs text-gray-600 mt-1">Impact: {decision.implications}</div>
                                  )}
                                </div>
                              ) : (
                                <div className="flex items-start gap-2">
                                  <span className="text-purple-500 font-medium min-w-0">•</span>
                                  <span className="leading-relaxed">{decision}</span>
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}

                  {/* Open Items (new format) / Follow-ups / Open Questions (legacy formats) */}
                  {((aiResult.openItems && aiResult.openItems.length > 0) ||
                    (aiResult.followUps && aiResult.followUps.length > 0) ||
                    (aiResult.openQuestions && aiResult.openQuestions.length > 0)) && (
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                        ❓ Open Items & Follow-ups
                      </h4>
                      <div className="bg-white rounded p-3 border border-gray-200">
                        <ul className="space-y-2">
                          {/* New openItems format */}
                          {aiResult.openItems && aiResult.openItems.map((item, index) => (
                            <li key={`open-${index}`} className="text-sm text-gray-700">
                              {typeof item === 'object' ? (
                                <div className="flex items-start gap-2">
                                  <span className={`font-medium min-w-0 ${
                                    item.type === 'blocker' ? 'text-red-500' :
                                    item.type === 'risk' ? 'text-orange-500' :
                                    item.type === 'question' ? 'text-blue-500' :
                                    'text-gray-500'
                                  }`}>
                                    {item.type === 'blocker' ? '🚫' :
                                     item.type === 'risk' ? '⚠️' :
                                     item.type === 'question' ? '❓' : '📌'}
                                  </span>
                                  <div>
                                    <span className="leading-relaxed">{item.item}</span>
                                    {(item.owner || item.urgency) && (
                                      <div className="text-xs text-gray-500 mt-0.5">
                                        {item.owner && item.owner !== 'TBD' && <span>Owner: {item.owner}</span>}
                                        {item.owner && item.urgency && ' • '}
                                        {item.urgency && <span>Urgency: {item.urgency}</span>}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-start gap-2">
                                  <span className="text-orange-500 font-medium min-w-0">•</span>
                                  <span className="leading-relaxed">{item}</span>
                                </div>
                              )}
                            </li>
                          ))}
                          {/* Legacy followUps/openQuestions format */}
                          {!aiResult.openItems && (aiResult.followUps || aiResult.openQuestions || []).map((question, index) => (
                            <li key={`legacy-${index}`} className="text-sm text-gray-700 flex items-start gap-2">
                              <span className="text-orange-500 font-medium min-w-0">•</span>
                              <span className="leading-relaxed">{typeof question === 'object' ? question.item : question}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}

                  {/* Next Steps */}
                  {aiResult.nextSteps && aiResult.nextSteps.trim() && (
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                        🚀 Next Steps
                      </h4>
                      <p className="text-sm text-gray-700 leading-relaxed bg-white rounded p-3 border border-gray-200">
                        {aiResult.nextSteps}
                      </p>
                    </div>
                  )}

                  {/* Analysis Metadata */}
                  <div className="flex items-center justify-between pt-3 border-t border-blue-200">
                    <div className="flex items-center gap-4 text-xs text-blue-600">
                      {/* REMOVED: Sentiment display - no longer tracking sentiment
                      {aiResult.sentiment && (
                        <div className="flex items-center gap-1">
                          <span>
                            {aiResult.sentiment === 'positive' ? '😊' :
                             aiResult.sentiment === 'negative' ? '😟' : '😐'}
                          </span>
                          <span className="capitalize font-medium">{aiResult.sentiment} tone</span>
                        </div>
                      )}
                      */}
                      {aiResult.confidence && (
                        <div className="flex items-center gap-1">
                          <span>🎯</span>
                          <span className="font-medium">Confidence: {Math.round(aiResult.confidence * 100)}%</span>
                        </div>
                      )}
                    </div>
                    {aiResult.analyzedAt && (
                      <div className="text-xs text-blue-500">
                        Analyzed: {new Date(aiResult.analyzedAt).toLocaleTimeString()}
                      </div>
                    )}
                  </div>

                  {/* Export Button */}
                  <div className="flex gap-3 pt-3 border-t border-blue-200">
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
              </div>
            )}
          </div>

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
            */}
        </ResponsiveGrid>
      </main>
      </div>

      {/* Save Confirmation Toast */}
      {showSaveConfirmation && (
        <div className="fixed top-4 right-4 z-50 animate-fade-in">
          <div className="bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-3">
            <CheckCircle size={20} />
            <div>
              <p className="font-semibold">Meeting Saved!</p>
              <p className="text-sm opacity-90">Your meeting has been successfully saved.</p>
            </div>
          </div>
        </div>
      )}

      {/* Save Error Modal */}
      {saveError && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 animate-scale-in">
            <div className="flex items-start gap-3 mb-4">
              <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Failed to Save Meeting
                </h3>
                <p className="text-sm text-gray-700 mb-3">
                  {saveError.message}
                </p>
                <div className="text-sm text-blue-700 bg-blue-50 p-3 rounded">
                  💡 <strong>Suggestion:</strong> {saveError.suggestion}
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 justify-end mt-6">
              <button
                onClick={() => setSaveError(null)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  // Emergency export to JSON
                  const dataToSave = buildMeetingData(id || uuidv4())
                  const blob = new Blob([JSON.stringify(dataToSave, null, 2)],
                    { type: 'application/json' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `meeting-backup-${Date.now()}.json`
                  a.click()
                  URL.revokeObjectURL(url)

                  // Show a toast that export succeeded
                  setSaveError(null)
                  alert('Backup exported successfully! Your meeting data has been saved to a JSON file.')
                }}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors flex items-center gap-2 justify-center"
              >
                <Download className="w-4 h-4" />
                Export Backup
              </button>
              {saveError.canRetry && (
                <button
                  onClick={() => {
                    setSaveError(null)
                    handleSave()
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                >
                  Try Again
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </PullToRefresh>
  )
}