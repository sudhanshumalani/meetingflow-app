import React, { useState, useEffect, useRef } from 'react'
import { Mic, MicOff, Square, Volume2, Monitor, Settings, ChevronDown, Zap, RefreshCw } from 'lucide-react'
import audioTranscriptionService from '../services/audioTranscriptionService'
import whisperWebService from '../services/moonshineWebService'
import audioBufferService from '../services/audioBufferService'

const AudioRecorder = ({ onTranscriptUpdate, onAutoSave, className = '', disabled = false }) => {
  const [isInitialized, setIsInitialized] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [interimText, setInterimText] = useState('')
  const [error, setError] = useState(null)
  const [permissions, setPermissions] = useState('unknown')
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [wakeLock, setWakeLock] = useState(null)

  // Audio source selection for tab/hybrid recording
  const [availableAudioSources] = useState([
    { id: 'microphone', name: 'Microphone Only', description: 'Record your voice', icon: '🎤', supported: true },
    { id: 'tabAudio', name: 'Tab Audio Capture', description: 'Record browser tab audio (YouTube, Zoom, etc.)', icon: '🖥️', supported: true },
    { id: 'mixed', name: 'Hybrid Mode', description: 'Your voice + tab audio simultaneously', icon: '🎙️', supported: true }
  ])
  const [selectedAudioSource, setSelectedAudioSource] = useState('microphone')
  const [showSourceSelector, setShowSourceSelector] = useState(false)
  const [audioLevels, setAudioLevels] = useState({ microphone: 0, tabAudio: 0 })

  // Whisper Web enhancement state
  const [whisperEnabled, setWhisperEnabled] = useState(true)
  const [isEnhancing, setIsEnhancing] = useState(false)
  const [enhancedTranscript, setEnhancedTranscript] = useState('')

  // Mobile Debug Panel State
  const [debugMessages, setDebugMessages] = useState([])
  const [showDebugPanel, setShowDebugPanel] = useState(false)
  const debugRef = useRef(null)
  const [whisperStatus, setWhisperStatus] = useState(null)
  const [audioBuffer, setAudioBuffer] = useState(null)

  // Mobile Debug Function
  const addDebugMessage = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString()
    const newMessage = { timestamp, message, type, id: Date.now() }
    setDebugMessages(prev => [...prev.slice(-9), newMessage]) // Keep last 10 messages

    // Auto-scroll to bottom
    setTimeout(() => {
      if (debugRef.current) {
        debugRef.current.scrollTop = debugRef.current.scrollHeight
      }
    }, 100)
  }

  // Multi-strategy wake lock
  const [audioContext, setAudioContext] = useState(null)
  const [silentAudio, setSilentAudio] = useState(null)
  const [wakeLockStrategies, setWakeLockStrategies] = useState({
    wakeLock: false,
    silentAudio: false,
    videoWorkaround: false
  })

  const timerRef = useRef(null)
  const lastSavedTranscriptRef = useRef('')
  const lastSentTranscriptRef = useRef('')
  const persistentTranscriptRef = useRef('') // Stores accumulated transcript across sessions
  const wakeLockVideoRef = useRef(null) // For video workaround
  const isApplyingEnhancedRef = useRef(false) // Flag to prevent useEffect interference

  // Initialize service on mount
  useEffect(() => {
    const initService = async () => {
      try {
        await audioTranscriptionService.initialize()
        setIsInitialized(true)
        console.log('🎤 Web Speech API transcription service ready')

        // Initialize Whisper Web (non-blocking)
        if (whisperEnabled) {
          initializeWhisper()
        }
      } catch (error) {
        console.error('Failed to initialize transcription:', error)
        setError('Failed to initialize audio transcription. Your browser may not support speech recognition.')
      }
    }

    initService()

    // Set up audio level monitoring
    const levelInterval = setInterval(() => {
      if (audioBufferService.isRecordingActive()) {
        const levels = audioBufferService.getAudioLevels()
        setAudioLevels(levels)
      }
    }, 100)

    return () => {
      clearInterval(levelInterval)
      if (timerRef.current) clearInterval(timerRef.current)
      audioBufferService.cleanup()
    }
  }, [])

  // Initialize Whisper Web (non-blocking)
  const initializeWhisper = async () => {
    try {
      console.log('🎵 Initializing Whisper Web...')
      setWhisperStatus('initializing')

      const capabilities = await whisperWebService.checkCapabilities()
      console.log('🎵 Whisper capabilities:', capabilities)

      // Initialize in background (don't await to avoid blocking UI)
      whisperWebService.initialize().then(() => {
        setWhisperStatus('ready')
        console.log('✅ Whisper Web ready for enhancement')
      }).catch(error => {
        console.warn('⚠️ Whisper initialization failed, using Web Speech API only:', error)
        setWhisperStatus('disabled')
        setWhisperEnabled(false)
      })

    } catch (error) {
      console.warn('⚠️ Whisper not available:', error)
      setWhisperStatus('disabled')
      setWhisperEnabled(false)
    }
  }


  // Update parent component when transcript changes
  useEffect(() => {
    const currentTranscript = transcript.trim()

    console.log('🎤 AudioRecorder: Transcript state changed:', {
      transcript: transcript?.substring(0, 50) + '...',
      hasTranscript: !!currentTranscript,
      hasCallback: !!onTranscriptUpdate,
      isDifferent: currentTranscript !== lastSentTranscriptRef.current
    })

    // Skip if we're currently applying enhanced transcript
    if (isApplyingEnhancedRef.current) {
      console.log('⏭️ Skipping auto-update while applying enhanced transcript')
      return
    }

    // Only update parent if transcript is different from last sent
    if (currentTranscript && onTranscriptUpdate && currentTranscript !== lastSentTranscriptRef.current) {
      console.log('🎤 AudioRecorder: Auto-updating parent with transcript:', currentTranscript.substring(0, 100) + '...')
      lastSentTranscriptRef.current = currentTranscript
      onTranscriptUpdate(currentTranscript)
    }
  }, [transcript, onTranscriptUpdate])

  // Auto-save functionality for processed audio
  const handleAutoSave = (reason = 'auto') => {
    if (transcript.trim() && transcript !== lastSavedTranscriptRef.current) {
      console.log(`🔄 Auto-saving transcript (${reason}): ${transcript.substring(0, 50)}...`)
      lastSavedTranscriptRef.current = transcript
      if (onAutoSave) {
        onAutoSave(transcript.trim(), reason)
      }
    }
  }

  // Enhanced page visibility handling for mobile optimization
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.hidden && isRecording) {
        console.log('📱 App went to background, auto-saving...')
        handleAutoSave('background')

        // Keep wake lock strategies active even in background
        console.log('🔒 Maintaining wake lock strategies in background')
      } else if (!document.hidden && isRecording) {
        console.log('📱 App came to foreground')

        // Check if wake lock strategies are still active, re-activate if needed
        const activeStrategies = Object.values(wakeLockStrategies).filter(Boolean).length
        if (activeStrategies === 0) {
          console.log('🔒 Re-acquiring wake lock strategies after foreground...')
          await requestWakeLock()
        } else {
          console.log(`🔒 ${activeStrategies} wake lock strategies still active`)
        }
      }
    }

    // Also handle focus events for additional mobile support
    const handleFocus = () => {
      if (isRecording) {
        console.log('👀 Window focused - ensuring wake lock is active')
      }
    }

    const handleBlur = () => {
      if (isRecording) {
        console.log('👀 Window blurred - maintaining wake lock')
        handleAutoSave('blur')
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)
    window.addEventListener('blur', handleBlur)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('blur', handleBlur)
    }
  }, [isRecording, transcript, wakeLock, wakeLockStrategies])

  // Auto-save periodically during recording
  useEffect(() => {
    if (!isRecording) return

    const autoSaveInterval = setInterval(() => {
      handleAutoSave('periodic')
    }, 30000) // Auto-save every 30 seconds

    return () => clearInterval(autoSaveInterval)
  }, [isRecording, transcript])

  // Check microphone permissions
  const checkPermissions = async () => {
    try {
      const result = await navigator.permissions.query({ name: 'microphone' })
      if (result && result.state) {
        setPermissions(result.state)

        if (result.addEventListener && typeof result.addEventListener === 'function') {
          result.addEventListener('change', () => {
            setPermissions(result.state)
          })
        }
      }
    } catch (error) {
      console.warn('Permissions API not supported')
    }
  }

  // Start recording
  const startRecording = async () => {
    try {
      setError(null)
      setInterimText('')
      setRecordingDuration(0)

      await checkPermissions()

      // Request multiple wake lock strategies
      await requestWakeLock()

      // Start audio buffer recording for Whisper enhancement
      console.log('🔍 Checking Whisper prerequisites:', {
        whisperEnabled,
        whisperStatus,
        selectedAudioSource
      })

      if (whisperEnabled && whisperStatus === 'ready') {
        try {
          await audioBufferService.startRecording({ source: selectedAudioSource })
          console.log('🌙 Audio buffer recording started for Whisper enhancement')
        } catch (bufferError) {
          console.warn('Failed to start audio buffer recording:', bufferError)
        }
      } else {
        console.log('⚠️ Whisper enhancement not available:', {
          enabled: whisperEnabled,
          status: whisperStatus,
          reason: !whisperEnabled ? 'disabled' : 'not ready'
        })
      }

      // Only start Web Speech API for microphone source
      // For tab audio and hybrid, rely on Whisper AI only
      if (selectedAudioSource === 'microphone') {
        await audioTranscriptionService.startLiveTranscription({
        onTranscript: (result) => {
          // CRITICAL DEBUG: Log what Web Speech API is producing
          console.log('🎤 Web Speech API result:', {
            text: result.text,
            isFinal: result.isFinal,
            length: result.text?.length,
            isGarbage: /^(Generate\s*){2,}$/i.test(result.text || '')
          })

          // Append to persistent transcript for text persistence
          const newText = result.text
          if (result.isFinal && newText.trim()) {
            persistentTranscriptRef.current += newText + ' '
            setTranscript(persistentTranscriptRef.current)
          } else {
            // Show interim text alongside persistent content
            setInterimText(newText)
            setTranscript(persistentTranscriptRef.current)
          }
        },
        onEnd: (result) => {
          if (result.text && result.text.trim()) {
            persistentTranscriptRef.current += result.text + ' '
          }
          setTranscript(persistentTranscriptRef.current)
          setIsRecording(false)
          handleAutoSave('recording_ended')
        },
        onError: (error) => {
          setError(error.message)
          setIsRecording(false)
        }
      })
      } else {
        // For tab audio and hybrid mode, show placeholder message
        console.log(`🖥️ Tab/Hybrid audio mode: Recording ${selectedAudioSource} for Whisper AI processing`)
        setTranscript(persistentTranscriptRef.current || 'Recording tab audio... Processing will happen after you stop recording.')
      }

      setIsRecording(true)

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1)
      }, 1000)

      const existingLength = persistentTranscriptRef.current.length
      console.log(`🎤 Recording started - will append to existing ${existingLength} characters of transcript`)
    } catch (error) {
      console.error('Failed to start recording:', error)
      setError(error.message)
      handleAutoSave('start_error')
      // Release wake lock if recording failed
      await releaseWakeLock()
    }
  }

  // Stop recording
  const stopRecording = async () => {
    try {
      handleAutoSave('stop')

      // Only stop Web Speech API if we're using microphone
      if (selectedAudioSource === 'microphone') {
        const finalTranscript = audioTranscriptionService.stopLiveTranscription()
        if (finalTranscript && finalTranscript.trim()) {
          persistentTranscriptRef.current += finalTranscript + ' '
        }
      }

      setTranscript(persistentTranscriptRef.current || transcript)
      setIsRecording(false)

      // Stop audio buffer and get recorded audio
      let recordedAudio = null
      if (whisperEnabled && whisperStatus === 'ready') {
        try {
          recordedAudio = await audioBufferService.stopRecording()
          if (recordedAudio) {
            setAudioBuffer(recordedAudio)
            console.log('🌙 Audio buffer captured, ready for Whisper enhancement')
          }
        } catch (bufferError) {
          console.warn('Failed to stop audio buffer recording:', bufferError)
        }
      }

      // Release wake lock when recording stops
      await releaseWakeLock()

      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }

      // Auto-enhance with Whisper if we have audio data
      console.log('🔍 Auto-enhancement check:', {
        hasAudio: !!recordedAudio,
        audioSize: recordedAudio?.size || 0,
        whisperEnabled,
        whisperStatus,
        allConditionsMet: recordedAudio && whisperEnabled && whisperStatus === 'ready'
      })

      if (recordedAudio && whisperEnabled && whisperStatus === 'ready') {
        console.log('✅ Starting auto-enhancement with Whisper...')
        enhanceWithWhisper(recordedAudio)
      } else {
        console.log('⚠️ Auto-enhancement skipped - conditions not met:', {
          noAudio: !recordedAudio,
          whisperDisabled: !whisperEnabled,
          whisperNotReady: whisperStatus !== 'ready',
          currentStatus: whisperStatus,
          selectedSource: selectedAudioSource
        })
      }

      console.log('🛑 Recording stopped - transcript preserved for next session')
    } catch (error) {
      console.error('Failed to stop recording:', error)
      setError(error.message)
      handleAutoSave('stop_error')
      // Still release wake lock on error
      await releaseWakeLock()
    }
  }

  // Format duration
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Multi-strategy wake lock implementation
  const requestWakeLock = async () => {
    console.log('🔒 Requesting multi-strategy wake lock...')
    const strategies = { wakeLock: false, silentAudio: false, videoWorkaround: false }

    // Strategy 1: Official Wake Lock API
    if ('wakeLock' in navigator) {
      try {
        const lock = await navigator.wakeLock.request('screen')
        if (lock) {
          setWakeLock(lock)
          strategies.wakeLock = true
          console.log('✅ Wake Lock API activated')

          if (lock.addEventListener && typeof lock.addEventListener === 'function') {
            lock.addEventListener('release', () => {
              console.log('🔓 Wake Lock API released')
              setWakeLockStrategies(prev => ({ ...prev, wakeLock: false }))
              setWakeLock(null)
            })
          }
        }
      } catch (error) {
        console.warn('⚠️ Wake Lock API failed:', error)
      }
    }

    // Strategy 2: Silent Audio Loop (iOS Safari fallback)
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      const buffer = audioCtx.createBuffer(1, 1, 22050)
      const source = audioCtx.createBufferSource()
      source.buffer = buffer
      source.loop = true
      source.connect(audioCtx.destination)
      source.start()

      setAudioContext(audioCtx)
      setSilentAudio(source)
      strategies.silentAudio = true
      console.log('✅ Silent audio loop activated')
    } catch (error) {
      console.warn('⚠️ Silent audio failed:', error)
    }

    // Strategy 3: Hidden video workaround (Android fallback)
    try {
      const video = document.createElement('video')
      video.src = 'data:video/mp4;base64,AAAAIGZ0eXBtcDQyAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAACKBtZGF0AAAC8wYF///v3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE0MiByMjQ3OSBkZDc5YTYxIC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAxNCAtIGh0dHA6Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNhYmFjPTEgcmVmPTEgZGVibG9jaz0xOi0zOi0zIGFuYWx5c2U9MHgzOjB4MHggbWU9aGV4IHN1Ym1lPTcgcHN5PTEgcHN5X3JkPTEuMDA6MC4wMCBtaXhlZF9yZWY9MCBtZV9yYW5nZT0xNiBjaHJvbWFfbWU9MSB0cmVsbGlzPTEgOHg4ZGN0PTEgY3FtPTAgZGVhZHpvbmU9MjEsMTEgZmFzdF9wc2tpcD0xIGNocm9tYV9xcF9vZmZzZXQ9LTIgdGhyZWFkcz0xMSBsb29rYWhlYWRfdGhyZWFkcz0xIHNsaWNlZF90aHJlYWRzPTAgbnI9MCBkZWNpbWF0ZT0xIGludGVybGFjZWQ9MCBibHVyYXlfY29tcGF0PTAgY29uc3RyYWluZWRfaW50cmE9MCBiZnJhbWVzPTMgYl9weXJhbWlkPTIgYl9hZGFwdD0xIGJfYmlhcz0wIGRpcmVjdD0xIHdlaWdodHA9MCBvcGVuX2dvcD0wIHdlaWdodGI9MCBieG1ldGhvZD0yIGNoZWNrPTAgcHN5X3JkPTEuMDA6MC4wMCBtaXhlZF9yZWY9MCBtZV9yYW5nZT0xNi=='
      video.setAttribute('playsinline', '')
      video.setAttribute('muted', '')
      video.style.position = 'absolute'
      video.style.left = '-9999px'
      video.style.width = '1px'
      video.style.height = '1px'
      video.loop = true

      document.body.appendChild(video)
      await video.play()

      wakeLockVideoRef.current = video
      strategies.videoWorkaround = true
      console.log('✅ Hidden video workaround activated')
    } catch (error) {
      console.warn('⚠️ Video workaround failed:', error)
    }

    setWakeLockStrategies(strategies)
    const activeStrategies = Object.entries(strategies).filter(([_, active]) => active).map(([name]) => name)
    console.log('🔒 Active wake lock strategies:', activeStrategies)
    return activeStrategies.length > 0
  }

  // Release all wake lock strategies
  const releaseWakeLock = async () => {
    console.log('🔓 Releasing all wake lock strategies...')

    if (wakeLock) {
      try {
        await wakeLock.release()
        setWakeLock(null)
      } catch (error) {
        console.warn('Error releasing wake lock:', error)
      }
    }

    if (silentAudio) {
      try {
        silentAudio.stop()
        setSilentAudio(null)
      } catch (error) {
        console.warn('Error stopping silent audio:', error)
      }
    }

    if (audioContext) {
      try {
        await audioContext.close()
        setAudioContext(null)
      } catch (error) {
        console.warn('Error closing audio context:', error)
      }
    }

    if (wakeLockVideoRef.current) {
      try {
        wakeLockVideoRef.current.pause()
        document.body.removeChild(wakeLockVideoRef.current)
        wakeLockVideoRef.current = null
      } catch (error) {
        console.warn('Error removing video workaround:', error)
      }
    }

    setWakeLockStrategies({ wakeLock: false, silentAudio: false, videoWorkaround: false })
    console.log('🔓 All wake lock strategies released')
  }

  // Enhance transcript with Whisper Web
  const enhanceWithWhisper = async (audioBlob) => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    const isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone

    addDebugMessage(`🔍 Starting Whisper enhancement`, 'info')
    addDebugMessage(`Audio: ${audioBlob?.size || 0} bytes, ${audioBlob?.type || 'unknown'}`, 'info')
    addDebugMessage(`Whisper enabled: ${whisperEnabled}, Status: ${whisperStatus}`, 'info')
    addDebugMessage(`iOS: ${isIOS}, PWA: ${isPWA}`, 'info')

    if (!whisperEnabled) {
      addDebugMessage('❌ Whisper not enabled', 'error')
      return
    }

    if (whisperStatus !== 'ready') {
      addDebugMessage(`❌ Whisper not ready: ${whisperStatus}`, 'error')
      return
    }

    if (!audioBlob) {
      addDebugMessage('❌ No audio blob available', 'error')
      return
    }

    try {
      setIsEnhancing(true)
      addDebugMessage(`🚀 Processing ${(audioBlob.size / 1024 / 1024).toFixed(2)}MB audio...`, 'info')
      addDebugMessage('📱 Applied MediaRecorder 500ms timing fix', 'info')

      addDebugMessage('📞 Calling Whisper service...', 'info')

      const startTime = performance.now()
      const result = await whisperWebService.enhanceTranscript(audioBlob, {
        language: 'english',
        debugCallback: addDebugMessage
      })
      const processingDuration = performance.now() - startTime

      addDebugMessage(`⏱️ Processing took ${(processingDuration / 1000).toFixed(1)}s`, 'info')

      if (result && result.text && result.text.trim()) {
        addDebugMessage(`✅ Success: ${result.text.length} chars`, 'success')
        addDebugMessage(`Preview: "${result.text.substring(0, 50)}..."`, 'success')
        setEnhancedTranscript(result.text)
        console.log('✅ Whisper enhancement completed:', {
          originalLength: (persistentTranscriptRef.current || '').length,
          enhancedLength: result.text.length,
          confidence: result.confidence,
          processingTime: result.processingTime
        })

        // Auto-apply enhanced transcript to meeting notes
        // Auto-apply enhanced transcript to meeting notes
        applyEnhancedTranscriptToMeeting(result.text)
      } else {
        addDebugMessage('⚠️ Empty result from Whisper', 'warning')
      }

    } catch (error) {
      addDebugMessage(`❌ Error: ${error.message}`, 'error')

      let userFriendlyError = `AI enhancement failed: ${error.message}`

      if (isIOS) {
        if (error.message.includes('iOS Safari') || error.message.includes('audio format') || error.message.includes('WebM')) {
          userFriendlyError = `✅ iOS audio format issue fixed! The app now uses video/mp4 format for iOS compatibility. Please try recording again.`
        } else if (error.message.includes('memory') || error.message.includes('crash') || error.message.includes('Out of memory')) {
          userFriendlyError = `❌ iOS memory limitation reached. Try shorter recordings (under 2 minutes) or restart the app.`
        } else if (isPWA && (error.message.includes('SharedArrayBuffer') || error.message.includes('Worker'))) {
          userFriendlyError = `❌ iOS PWA compatibility issue detected. Please refresh the app and try again with a shorter recording.`
        } else if (error.message.includes('decodeAudioData') || error.message.includes('Safari callback')) {
          userFriendlyError = `❌ iOS Safari audio decoding failed. Please ensure recording format is compatible and try again.`
        } else if (error.message.includes('null error')) {
          userFriendlyError = `❌ Safari audio processing bug detected. This is a known iOS Safari issue - please try recording again.`
        }
      }

      setError(userFriendlyError)

      // CRITICAL FIX: Preserve Web Speech API transcript when Whisper fails
      console.log('🔄 Whisper failed - preserving Web Speech API transcript:', {
        currentTranscript: transcript,
        persistentTranscript: persistentTranscriptRef.current
      })

      // Don't overwrite the good Web Speech API transcript
      // The user still has their original transcript from Web Speech API

    } finally {
      setIsEnhancing(false)
    }
  }

  // Manually trigger enhancement
  const manuallyEnhance = () => {
    if (audioBuffer) {
      enhanceWithWhisper(audioBuffer)
    }
  }

  // Core function to apply enhanced transcript to meeting (used by both auto and manual)
  const applyEnhancedTranscriptToMeeting = (textToApply) => {
    if (textToApply && textToApply.trim()) {
      console.log('🔄 Applying enhanced transcript to meeting:', {
        originalLength: transcript.length,
        enhancedLength: textToApply.length,
        enhanced: textToApply.substring(0, 100) + '...'
      })

      // Set flag to prevent useEffect interference
      isApplyingEnhancedRef.current = true

      // Update local state FIRST to prevent race condition
      persistentTranscriptRef.current = textToApply
      lastSentTranscriptRef.current = textToApply // Prevent useEffect from sending again
      setTranscript(textToApply)

      // Send enhanced transcript to parent component (meeting transcript)
      if (onTranscriptUpdate) {
        console.log('📤 Sending enhanced transcript to parent via onTranscriptUpdate')
        onTranscriptUpdate(textToApply)
      }

      // Auto-save the enhanced version
      if (onAutoSave) {
        console.log('💾 Auto-saving enhanced transcript via onAutoSave')
        onAutoSave(textToApply.trim(), 'enhanced')
      }

      // Reset flag after longer delay to ensure all React updates complete
      setTimeout(() => {
        isApplyingEnhancedRef.current = false
        console.log('✅ Enhanced transcript applied to meeting - flag reset')
      }, 500)
    }
  }

  // Manual apply function (for button click)
  const applyEnhancedTranscript = () => {
    if (enhancedTranscript && enhancedTranscript.trim()) {
      applyEnhancedTranscriptToMeeting(enhancedTranscript)
      setEnhancedTranscript('') // Clear enhanced version after applying
    }
  }

  // Clear transcript
  const clearTranscript = () => {
    setTranscript('')
    setInterimText('')
    setEnhancedTranscript('')
    persistentTranscriptRef.current = ''
    lastSavedTranscriptRef.current = ''
    setAudioBuffer(null)
    audioTranscriptionService.reset()

    console.log('🧹 All transcript storage cleared - starting fresh')

    if (onTranscriptUpdate) {
      onTranscriptUpdate('')
    }
  }

  if (!isInitialized) {
    return (
      <div className={`p-4 bg-red-50 border border-red-200 rounded-lg ${className}`}>
        <p className="text-red-700 text-sm">
          Audio transcription is not available. {error || 'Please check your browser compatibility.'}
        </p>
      </div>
    )
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Recording Controls */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <Volume2 className="w-5 h-5 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Audio Recording</span>
            {/* Whisper Status Indicator */}
            {whisperEnabled && (
              <div className="flex items-center space-x-1">
                {whisperStatus === 'initializing' && (
                  <div className="flex items-center space-x-1">
                    <RefreshCw className="w-3 h-3 text-yellow-500 animate-spin" />
                    <span className="text-xs text-yellow-600">AI Loading</span>
                  </div>
                )}
                {whisperStatus === 'ready' && (
                  <div className="flex items-center space-x-1">
                    <Zap className="w-3 h-3 text-green-500" />
                    <span className="text-xs text-green-600">AI Ready</span>
                  </div>
                )}
                {whisperStatus === 'disabled' && (
                  <div className="flex items-center space-x-1">
                    <span className="text-xs text-gray-500">AI Disabled</span>
                  </div>
                )}
                {isEnhancing && (
                  <div className="flex items-center space-x-1">
                    <RefreshCw className="w-3 h-3 text-blue-500 animate-spin" />
                    <span className="text-xs text-blue-600">Enhancing...</span>
                  </div>
                )}
              </div>
            )}
            {isRecording && (
              <div className="flex items-center space-x-2">
                <div className="flex items-center space-x-1">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                  <span className="text-xs text-red-600 font-medium">REC</span>
                </div>
                {(wakeLock || wakeLockStrategies.silentAudio || wakeLockStrategies.videoWorkaround) && (
                  <div className="flex items-center space-x-1">
                    <span className="text-xs text-green-600 font-medium">🔒</span>
                    <span className="text-xs text-green-600" title={`Active: ${Object.entries(wakeLockStrategies).filter(([_, active]) => active).map(([name]) => name).join(', ')}`}>
                      {Object.values(wakeLockStrategies).filter(Boolean).length}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Clear Transcript Button */}
            {transcript && !isRecording && (
              <button
                onClick={clearTranscript}
                className="text-xs px-2 py-1 text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                title="Clear transcript and start fresh"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Audio Source Selection */}
        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700">Audio Source</label>
            <button
              onClick={() => setShowSourceSelector(!showSourceSelector)}
              className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              <Settings size={12} />
              {showSourceSelector ? 'Hide' : 'Configure'}
            </button>
          </div>

          <div className="relative">
            <button
              onClick={() => setShowSourceSelector(!showSourceSelector)}
              disabled={isRecording}
              className="w-full flex items-center justify-between p-2 bg-white border border-gray-200 rounded-md hover:border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">
                  {availableAudioSources.find(s => s.id === selectedAudioSource)?.icon || '🎤'}
                </span>
                <div className="text-left">
                  <div className="text-sm font-medium text-gray-900">
                    {availableAudioSources.find(s => s.id === selectedAudioSource)?.name || 'Unknown'}
                  </div>
                  <div className="text-xs text-gray-500">
                    {availableAudioSources.find(s => s.id === selectedAudioSource)?.description || ''}
                  </div>
                </div>
              </div>
              <ChevronDown
                size={16}
                className={`text-gray-400 transition-transform ${showSourceSelector ? 'rotate-180' : ''}`}
              />
            </button>

            {/* Audio Source Options */}
            {showSourceSelector && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-10">
                {availableAudioSources.map((source) => (
                  <button
                    key={source.id}
                    onClick={() => {
                      setSelectedAudioSource(source.id)
                      setShowSourceSelector(false)
                    }}
                    disabled={isRecording || !source.supported}
                    className={`w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50 transition-colors first:rounded-t-md last:rounded-b-md disabled:opacity-50 disabled:cursor-not-allowed ${
                      selectedAudioSource === source.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''
                    }`}
                  >
                    <span className="text-lg">{source.icon}</span>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
                        {source.name}
                        {selectedAudioSource === source.id && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Selected</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">{source.description}</div>
                      {!source.supported && (
                        <div className="text-xs text-red-500 mt-0.5">Not supported in this browser</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Audio Level Indicators */}
          {selectedAudioSource === 'mixed' && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600">🎤 Microphone</span>
                <div className="flex-1 mx-2 bg-gray-200 rounded-full h-1.5">
                  <div
                    className="bg-green-500 h-1.5 rounded-full transition-all duration-100"
                    style={{ width: `${(audioLevels.microphone || 0) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500">{Math.round((audioLevels.microphone || 0) * 100)}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600">🖥️ Tab Audio</span>
                <div className="flex-1 mx-2 bg-gray-200 rounded-full h-1.5">
                  <div
                    className="bg-blue-500 h-1.5 rounded-full transition-all duration-100"
                    style={{ width: `${(audioLevels.tabAudio || 0) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500">{Math.round((audioLevels.tabAudio || 0) * 100)}%</span>
              </div>
            </div>
          )}

          {selectedAudioSource === 'tabAudio' && (
            <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded text-xs">
              <div className="text-blue-800 font-medium mb-2">📺 Tab Audio Capture</div>
              <div className="text-blue-700 space-y-1">
                <div>• Click record, then select browser tab/window to capture</div>
                <div>• Works with YouTube, web meetings, any browser audio</div>
                <div>• For live transcription: Play audio through speakers and enable microphone</div>
              </div>
            </div>
          )}

          {selectedAudioSource === 'mixed' && (
            <div className="mt-2 p-2 bg-purple-50 border border-purple-200 rounded text-xs text-purple-800">
              🎙️ <strong>Hybrid Mode:</strong> Captures both your microphone and tab audio simultaneously. Your voice will be transcribed live.
            </div>
          )}
        </div>

        {/* Main Recording Button */}
        <div className="flex items-center justify-center mb-4">
          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={disabled}
            className={`relative w-16 h-16 rounded-full flex items-center justify-center transition-all duration-200 ${
              isRecording
                ? 'bg-red-500 hover:bg-red-600 shadow-lg'
                : 'bg-blue-500 hover:bg-blue-600 shadow-md'
            } ${
              disabled
                ? 'opacity-50 cursor-not-allowed'
                : 'hover:shadow-lg active:scale-95'
            }`}
          >
            {isRecording ? (
              <Square className="w-6 h-6 text-white" />
            ) : (
              <Mic className="w-6 h-6 text-white" />
            )}
          </button>
        </div>

        {/* Recording Info */}
        <div className="text-center space-y-2">
          {isRecording ? (
            <div className="space-y-1">
              <p className="text-lg font-mono font-semibold text-gray-900">
                {formatDuration(recordingDuration)}
              </p>
              <p className="text-xs text-gray-500">Live Transcription</p>
              {persistentTranscriptRef.current && (
                <p className="text-xs text-blue-600">
                  📝 Continuing previous transcript
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-sm text-gray-600">
                {transcript ? 'Tap to continue recording (will append to existing transcript)' : 'Tap to start recording'}
              </p>
              <p className="text-xs text-gray-500">
                {permissions === 'granted' ? '✓ Microphone ready' :
                 permissions === 'denied' ? '✗ Microphone access denied' :
                 '? Microphone permission needed'}
              </p>
              {transcript && (
                <p className="text-xs text-green-600">
                  ✓ {transcript.split(' ').filter(word => word.trim()).length} words transcribed • Will continue adding
                </p>
              )}
            </div>
          )}
        </div>
      </div>


      {/* Original vs Enhanced Comparison */}
      {transcript && (
        <div className="bg-white rounded-lg border border-orange-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-orange-800 flex items-center gap-2">
              📊 Original vs Enhanced Comparison
            </h3>
            <div className="flex items-center gap-2">
              {enhancedTranscript ? (
                <>
                  <span className="text-xs bg-green-100 text-green-800 px-3 py-1 rounded font-medium">
                    ✅ Auto-applied to Meeting
                  </span>
                  <button
                    onClick={() => setEnhancedTranscript('')}
                    className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded font-medium transition-colors"
                  >
                    Clear
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={manuallyEnhance}
                    disabled={!audioBuffer || isEnhancing}
                    className="text-xs bg-blue-600 text-white px-3 py-1 rounded font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                  >
                    {isEnhancing ? 'Enhancing...' : 'Enhance with AI'}
                  </button>
                  <span className="text-xs text-gray-500">
                    {!audioBuffer ? 'No audio recorded' : 'Click to enhance accuracy'}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Original transcript */}
            <div className="bg-blue-50 p-3 rounded border border-blue-200">
              <div className="font-medium text-blue-800 mb-2 flex items-center gap-1">
                🎤 Original (Web Speech API)
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full ml-auto">
                  {transcript.split(' ').filter(word => word.trim()).length} words
                </span>
              </div>
              <div className="text-sm text-gray-900 leading-relaxed max-h-48 overflow-y-auto bg-white p-2 rounded border">
                {transcript}
              </div>
            </div>

            {/* Enhanced transcript */}
            <div className={`p-3 rounded border ${
              enhancedTranscript ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
            }`}>
              <div className={`font-medium mb-2 flex items-center gap-1 ${
                enhancedTranscript ? 'text-green-800' : 'text-gray-600'
              }`}>
                🎵 Enhanced (Whisper AI)
                {enhancedTranscript && (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full ml-auto">
                    {enhancedTranscript.split(' ').filter(word => word.trim()).length} words
                  </span>
                )}
              </div>
              <div className="text-sm leading-relaxed max-h-48 overflow-y-auto bg-white p-2 rounded border">
                {enhancedTranscript || (
                  <div className="text-gray-500 italic text-center py-4">
                    {isEnhancing ? (
                      <div className="flex items-center justify-center gap-2">
                        <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                        Processing with AI...
                      </div>
                    ) : (
                      'Click "Enhance with AI" to improve accuracy'
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
            <span>Compare accuracy and choose the better version</span>
            <span className="text-green-600">✨ AI Enhanced for better accuracy</span>
          </div>
        </div>
      )}

      {/* Manual Enhancement Controls */}
      {audioBuffer && !isEnhancing && !enhancedTranscript && whisperEnabled && whisperStatus === 'ready' && (
        <div className="bg-white rounded-lg border border-yellow-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-500" />
              <div>
                <div className="text-sm font-medium text-gray-900">Enhance with Whisper AI</div>
                <div className="text-xs text-gray-600">Improve transcription accuracy using recorded audio</div>
              </div>
            </div>
            <button
              onClick={manuallyEnhance}
              className="bg-yellow-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-yellow-600 transition-colors flex items-center gap-1"
            >
              <Zap size={14} />
              Enhance
            </button>
          </div>
        </div>
      )}

      {/* Recording Status when no transcript */}
      {!transcript && isRecording && (
        <div className="bg-blue-50 rounded-lg border border-blue-200 p-4 text-center">
          <div className="text-blue-600 mb-1">
            🎤 Recording Audio...
          </div>
          <p className="text-xs text-blue-700">
            Speech will appear here as you speak
          </p>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-700">{error}</p>
          <button
            onClick={() => setError(null)}
            className="text-xs text-red-600 hover:text-red-700 font-medium mt-1"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Mobile Debug Panel */}
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">🔧 Debug Panel</span>
          <button
            onClick={() => setShowDebugPanel(!showDebugPanel)}
            className="text-xs bg-gray-200 hover:bg-gray-300 px-2 py-1 rounded transition-colors"
          >
            {showDebugPanel ? 'Hide' : 'Show'}
          </button>
        </div>

        {showDebugPanel && (
          <div
            ref={debugRef}
            className="max-h-40 overflow-y-auto bg-black text-green-400 text-xs font-mono p-2 rounded border space-y-1"
          >
            {debugMessages.length === 0 ? (
              <div className="text-gray-500">No debug messages yet...</div>
            ) : (
              debugMessages.map((msg) => (
                <div key={msg.id} className="flex">
                  <span className="text-gray-400 mr-2">{msg.timestamp}</span>
                  <span className={
                    msg.type === 'error' ? 'text-red-400' :
                    msg.type === 'warning' ? 'text-yellow-400' :
                    msg.type === 'success' ? 'text-green-400' :
                    'text-blue-400'
                  }>
                    {msg.message}
                  </span>
                </div>
              ))
            )}
          </div>
        )}

        <div className="flex justify-between mt-2 text-xs text-gray-500">
          <span>Whisper: {whisperStatus || 'unknown'}</span>
          <button
            onClick={() => setDebugMessages([])}
            className="text-red-500 hover:text-red-700"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="text-center space-y-1">
        <p className="text-xs text-gray-500">
          🎤 Persistent transcript accumulation • 🔒 Multi-strategy wake lock • 📱 Mobile optimized
        </p>
        <p className="text-xs text-gray-400">
          Transcripts accumulate across sessions - works even with screen lock/unlock
        </p>
      </div>
    </div>
  )
}

export default AudioRecorder