import React, { useState, useEffect, useRef } from 'react'
import { Mic, MicOff, Square, Volume2 } from 'lucide-react'
import audioTranscriptionService from '../services/audioTranscriptionService'

const AudioRecorder = ({ onTranscriptUpdate, onAutoSave, className = '', disabled = false }) => {
  const [isInitialized, setIsInitialized] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [interimText, setInterimText] = useState('')
  const [error, setError] = useState(null)
  const [permissions, setPermissions] = useState('unknown')
  const [recordingDuration, setRecordingDuration] = useState(0)

  const timerRef = useRef(null)
  const lastSavedTranscriptRef = useRef('')

  // Initialize service on mount
  useEffect(() => {
    const initService = async () => {
      try {
        const result = await audioTranscriptionService.initialize()
        setIsInitialized(true)
        console.log('🎤 Simple transcription service ready')
      } catch (error) {
        console.error('Failed to initialize transcription:', error)
        setError('Failed to initialize audio transcription. Your browser may not support speech recognition.')
      }
    }

    initService()

    // Set up event listeners
    const removeListener = audioTranscriptionService.addEventListener((event, data) => {
      switch (event) {
        case 'transcript':
          if (data.type === 'realtime') {
            if (data.final) {
              setTranscript(prev => prev + data.final + ' ')
              setInterimText('')
            } else {
              setInterimText(data.interim)
            }
          }
          break

        case 'status':
          console.log('🎤 Status:', data.type)
          break

        case 'error':
          setError(data.message || data.error)
          setIsRecording(false)
          // Auto-save on error
          handleAutoSave('error')
          break
      }
    })

    return () => {
      removeListener()
      if (timerRef.current) clearInterval(timerRef.current)
      audioTranscriptionService.cleanup()
    }
  }, [])


  // Update parent component when transcript changes
  useEffect(() => {
    const fullTranscript = transcript + interimText
    console.log('🎤 AudioRecorder: Transcript state changed:', {
      transcript: transcript?.substring(0, 50) + '...',
      interimText: interimText?.substring(0, 50) + '...',
      fullLength: fullTranscript.length,
      hasCallback: !!onTranscriptUpdate
    })
    if (fullTranscript.trim() && onTranscriptUpdate) {
      console.log('🎤 AudioRecorder: Updating parent with transcript:', fullTranscript.substring(0, 100) + '...')
      onTranscriptUpdate(fullTranscript.trim())
    }
  }, [transcript, interimText, onTranscriptUpdate])

  // Auto-save functionality
  const handleAutoSave = (reason = 'auto') => {
    const currentTranscript = transcript + interimText
    if (currentTranscript.trim() && currentTranscript !== lastSavedTranscriptRef.current) {
      console.log(`🔄 Auto-saving transcript (${reason}): ${currentTranscript.substring(0, 50)}...`)
      lastSavedTranscriptRef.current = currentTranscript
      if (onAutoSave) {
        onAutoSave(currentTranscript.trim(), reason)
      }
    }
  }

  // Handle page visibility changes (auto-save when app goes to background)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && isRecording) {
        console.log('📱 App went to background, auto-saving...')
        handleAutoSave('background')
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [isRecording, transcript, interimText])

  // Auto-save periodically during recording
  useEffect(() => {
    if (!isRecording) return

    const autoSaveInterval = setInterval(() => {
      handleAutoSave('periodic')
    }, 30000) // Auto-save every 30 seconds

    return () => clearInterval(autoSaveInterval)
  }, [isRecording, transcript, interimText])

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
      setTranscript('')
      setInterimText('')
      setRecordingDuration(0)
      lastSavedTranscriptRef.current = ''

      await checkPermissions()

      const result = await audioTranscriptionService.startRecording({
        continuous: true,
        language: 'en-US'
      })

      if (result.success) {
        setIsRecording(true)

        // Start timer
        timerRef.current = setInterval(() => {
          setRecordingDuration(prev => prev + 1)
        }, 1000)
      }
    } catch (error) {
      console.error('Failed to start recording:', error)
      setError(error.message)
      // Auto-save any partial transcript
      handleAutoSave('start_error')
    }
  }

  // Stop recording
  const stopRecording = async () => {
    try {
      // Auto-save before stopping
      handleAutoSave('stop')

      await audioTranscriptionService.stopRecording()
      setIsRecording(false)

      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    } catch (error) {
      console.error('Failed to stop recording:', error)
      setError(error.message)
      // Auto-save on stop error
      handleAutoSave('stop_error')
    }
  }

  // Format duration
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Note: AI analysis is handled by Meeting.jsx using the same processWithClaude system as OCR
  // This keeps the analysis standardized and avoids duplication

  // Clear transcript
  const clearTranscript = () => {
    setTranscript('')
    setInterimText('')
    lastSavedTranscriptRef.current = ''
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
                {wakeLock && (
                  <span className="text-xs text-green-600" title="Screen will stay awake">🔒</span>
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
              <p className="text-xs text-gray-500">Real-time Transcription</p>
              {transcript && (
                <p className="text-xs text-blue-600">
                  📝 Continuing previous transcript
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-sm text-gray-600">
                {transcript ? 'Tap to continue recording' : 'Tap to start recording'}
              </p>
              <p className="text-xs text-gray-500">
                {permissions === 'granted' ? '✓ Microphone ready' :
                 permissions === 'denied' ? '✗ Microphone access denied' :
                 '? Microphone permission needed'}
              </p>
              {transcript && (
                <p className="text-xs text-green-600">
                  ✓ {transcript.split(' ').length} words transcribed
                </p>
              )}
            </div>
          )}
        </div>

      </div>

      {/* Live Transcript Display */}
      {(transcript || interimText) && (
        <div className="bg-white rounded-lg border border-green-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-green-800 flex items-center gap-2">
              🎤 Live Transcript
              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                {(transcript + interimText).split(' ').filter(word => word.trim()).length} words
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
            {transcript && (
              <div className="text-sm text-gray-900 leading-relaxed">
                <strong className="text-green-700">Final:</strong> {transcript}
              </div>
            )}

            {interimText && (
              <div className="text-sm text-gray-600 italic leading-relaxed border-l-2 border-blue-200 pl-2">
                <strong className="text-blue-600">Interim:</strong> {interimText}
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
            <span>
              Total: {(transcript + interimText).length} characters
            </span>
          </div>
        </div>
      )}

      {/* Transcript Status Indicator when no transcript */}
      {!transcript && !interimText && isRecording && (
        <div className="bg-blue-50 rounded-lg border border-blue-200 p-4 text-center">
          <div className="text-blue-600 mb-1">
            🎤 Listening...
          </div>
          <p className="text-xs text-blue-700">
            Transcript will appear here as you speak
          </p>
        </div>
      )}

      {/* AI Analysis is handled by Meeting.jsx using the standardized processWithClaude system */}

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

      {/* Simple Info */}
      <div className="text-center">
        <p className="text-xs text-gray-500">
          🎤 Simple real-time speech recognition using your browser's built-in capabilities
        </p>
      </div>
    </div>
  )
}

export default AudioRecorder