import React, { useState, useEffect, useRef } from 'react'
import { Mic, MicOff, Square, Volume2, Monitor, Settings, ChevronDown } from 'lucide-react'
import audioTranscriptionService from '../services/audioTranscriptionService'

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
  const [availableAudioSources, setAvailableAudioSources] = useState([
    { id: 'microphone', name: 'Microphone Only', description: 'Record your voice', icon: '🎤', supported: true },
    { id: 'tabAudio', name: 'Tab Audio Capture', description: 'Record browser tab audio (YouTube, Zoom, etc.)', icon: '🖥️', supported: true },
    { id: 'mixed', name: 'Hybrid Mode', description: 'Your voice + tab audio simultaneously', icon: '🎙️', supported: true }
  ])
  const [selectedAudioSource, setSelectedAudioSource] = useState('microphone')
  const [showSourceSelector, setShowSourceSelector] = useState(false)
  const [audioLevels, setAudioLevels] = useState({ microphone: 0, tabAudio: 0 })

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
  const persistentTranscriptRef = useRef('') // Stores accumulated transcript across sessions
  const wakeLockVideoRef = useRef(null) // For video workaround

  // Initialize service on mount
  useEffect(() => {
    const initService = async () => {
      try {
        const result = await audioTranscriptionService.initialize()
        setIsInitialized(true)
        console.log('🎤 Web Speech API transcription service ready')
      } catch (error) {
        console.error('Failed to initialize transcription:', error)
        setError('Failed to initialize audio transcription. Your browser may not support speech recognition.')
      }
    }

    initService()

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  // Track the last transcript sent to parent to prevent loops
  const lastSentTranscriptRef = useRef('')

  // Update parent component when transcript changes
  useEffect(() => {
    const currentTranscript = transcript.trim()

    console.log('🎤 AudioRecorder: Transcript state changed:', {
      transcript: transcript?.substring(0, 50) + '...',
      hasTranscript: !!currentTranscript,
      hasCallback: !!onTranscriptUpdate,
      isDifferent: currentTranscript !== lastSentTranscriptRef.current
    })

    // Only update parent if transcript is different from last sent
    if (currentTranscript && onTranscriptUpdate && currentTranscript !== lastSentTranscriptRef.current) {
      console.log('🎤 AudioRecorder: Updating parent with transcript:', currentTranscript.substring(0, 100) + '...')
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
      setPermissions(result.state)

      result.addEventListener('change', () => {
        setPermissions(result.state)
      })
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

      await audioTranscriptionService.startLiveTranscription({
        onTranscript: (result) => {
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

      const finalTranscript = audioTranscriptionService.stopLiveTranscription()
      if (finalTranscript && finalTranscript.trim()) {
        persistentTranscriptRef.current += finalTranscript + ' '
      }
      setTranscript(persistentTranscriptRef.current || transcript)
      setIsRecording(false)

      // Release wake lock when recording stops
      await releaseWakeLock()

      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
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
        setWakeLock(lock)
        strategies.wakeLock = true
        console.log('✅ Wake Lock API activated')

        lock.addEventListener('release', () => {
          console.log('🔓 Wake Lock API released')
          setWakeLockStrategies(prev => ({ ...prev, wakeLock: false }))
          setWakeLock(null)
        })
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

  // Clear transcript
  const clearTranscript = () => {
    setTranscript('')
    setInterimText('')
    persistentTranscriptRef.current = ''
    lastSavedTranscriptRef.current = ''
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

      {/* Transcript Display */}
      {transcript && (
        <div className="bg-white rounded-lg border border-blue-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-blue-800 flex items-center gap-2">
              🎤 Live Transcription
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                {transcript.split(' ').filter(word => word.trim()).length} words
              </span>
            </h3>
            <button
              onClick={clearTranscript}
              className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded font-medium transition-colors"
            >
              Clear
            </button>
          </div>

          <div className="space-y-2 max-h-48 overflow-y-auto bg-gray-50 rounded p-3">
            <div className="text-sm text-gray-900 leading-relaxed">
              {transcript}
              {interimText && (
                <span className="text-gray-500 italic">{interimText}</span>
              )}
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
            <span>
              Total: {transcript.length} characters
            </span>
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