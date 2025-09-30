import React, { useState, useEffect, useRef } from 'react'
import { Mic, MicOff, Square, Volume2, Settings, ChevronDown } from 'lucide-react'
import audioTranscriptionService from '../services/audioTranscriptionService'

const AudioRecorder = ({ onTranscriptUpdate, onAutoSave, className = '', disabled = false }) => {
  const [isInitialized, setIsInitialized] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [interimText, setInterimText] = useState('')
  const [error, setError] = useState(null)
  const [permissions, setPermissions] = useState('unknown')
  const [recordingDuration, setRecordingDuration] = useState(0)

  // Audio source selection for tab/hybrid recording
  const [availableAudioSources] = useState([
    { id: 'microphone', name: 'Microphone Only', description: 'Record your voice', icon: '🎤', supported: true },
    { id: 'tabAudio', name: 'Tab Audio Capture', description: 'Record browser tab audio (YouTube, Zoom, etc.)', icon: '🖥️', supported: true },
    { id: 'mixed', name: 'Hybrid Mode', description: 'Your voice + tab audio simultaneously', icon: '🎙️', supported: true }
  ])
  const [selectedAudioSource, setSelectedAudioSource] = useState('microphone')
  const [showSourceSelector, setShowSourceSelector] = useState(false)
  const [audioLevels, setAudioLevels] = useState({ microphone: 0, tabAudio: 0 })

  const timerRef = useRef(null)
  const lastSavedTranscriptRef = useRef('')
  const lastSentTranscriptRef = useRef('')
  const persistentTranscriptRef = useRef('') // Stores accumulated transcript across sessions

  // Initialize service on mount
  useEffect(() => {
    const initService = async () => {
      try {
        await audioTranscriptionService.initialize()
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

  // Update parent component when transcript changes
  useEffect(() => {
    const currentTranscript = transcript.trim()

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

      // Only start Web Speech API for microphone source
      if (selectedAudioSource === 'microphone') {
        await audioTranscriptionService.startLiveTranscription({
          onTranscript: (result) => {
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
        console.log(`🖥️ Tab/Hybrid audio mode: Recording ${selectedAudioSource} for processing`)
        setTranscript(persistentTranscriptRef.current || 'Recording tab audio... Please use microphone mode for live transcription.')
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

      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }

      console.log('🛑 Recording stopped - transcript preserved for next session')
    } catch (error) {
      console.error('Failed to stop recording:', error)
      setError(error.message)
      handleAutoSave('stop_error')
    }
  }

  // Format duration
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
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

          {selectedAudioSource === 'tabAudio' && (
            <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded text-xs">
              <div className="text-blue-800 font-medium mb-2">📺 Tab Audio Capture</div>
              <div className="text-blue-700 space-y-1">
                <div>• Use microphone mode for live transcription</div>
                <div>• Tab audio mode is for future enhancement</div>
              </div>
            </div>
          )}

          {selectedAudioSource === 'mixed' && (
            <div className="mt-2 p-2 bg-purple-50 border border-purple-200 rounded text-xs text-purple-800">
              🎙️ <strong>Hybrid Mode:</strong> Use microphone mode for live transcription. Full hybrid support coming soon.
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
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-800 flex items-center gap-2">
              📝 Live Transcript
            </h3>
            <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
              {transcript.split(' ').filter(word => word.trim()).length} words
            </span>
          </div>
          <div className="text-sm text-gray-900 leading-relaxed max-h-48 overflow-y-auto bg-gray-50 p-3 rounded border">
            {transcript}
            {interimText && (
              <span className="text-gray-500 italic"> {interimText}</span>
            )}
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
          🎤 Web Speech API • Persistent transcript accumulation • 📱 Mobile optimized
        </p>
        <p className="text-xs text-gray-400">
          Transcripts accumulate across sessions - works reliably across all devices
        </p>
      </div>
    </div>
  )
}

export default AudioRecorder