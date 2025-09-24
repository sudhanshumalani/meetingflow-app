import React, { useState, useEffect, useRef } from 'react'
import { Mic, MicOff, Square, Play, Pause, Volume2, Settings } from 'lucide-react'
import audioTranscriptionService from '../services/audioTranscriptionService'
import { processWithClaude } from '../utils/ocrServiceNew'

const AudioRecorder = ({ onTranscriptUpdate, onAutoSave, className = '', disabled = false }) => {
  const [isInitialized, setIsInitialized] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [interimText, setInterimText] = useState('')
  const [mode, setMode] = useState('hybrid')
  const [error, setError] = useState(null)
  const [permissions, setPermissions] = useState('unknown')
  const [audioLevel, setAudioLevel] = useState(0)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [wakeLock, setWakeLock] = useState(null)

  const timerRef = useRef(null)
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const animationRef = useRef(null)
  const lastSavedTranscriptRef = useRef('')

  // Initialize service on mount
  useEffect(() => {
    const initService = async () => {
      try {
        setIsProcessing(true)
        const result = await audioTranscriptionService.initialize()
        setIsInitialized(true)

        // Set mode based on capabilities
        if (result.realtimeSupported && result.whisperSupported) {
          setMode('hybrid')
        } else if (result.realtimeSupported) {
          setMode('realtime')
        } else {
          setMode('whisper')
        }
      } catch (error) {
        console.error('Failed to initialize transcription:', error)
        setError('Failed to initialize audio transcription')
      } finally {
        setIsProcessing(false)
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
          } else if (data.type === 'whisper') {
            setTranscript(prev => prev + data.text + ' ')
          }
          break

        case 'status':
          if (data.type === 'whisper_loading') {
            setIsProcessing(true)
          } else if (data.type === 'whisper_ready' || data.type === 'whisper_processing') {
            setIsProcessing(data.type === 'whisper_processing')
          }
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
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
      audioTranscriptionService.cleanup()
    }
  }, [])

  // Update parent component when transcript changes
  useEffect(() => {
    const fullTranscript = transcript + interimText
    if (fullTranscript.trim() && onTranscriptUpdate) {
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

  // Start audio level monitoring
  const startAudioLevelMonitoring = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
      analyserRef.current = audioContextRef.current.createAnalyser()

      const source = audioContextRef.current.createMediaStreamSource(stream)
      source.connect(analyserRef.current)

      analyserRef.current.fftSize = 256
      const bufferLength = analyserRef.current.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)

      const updateLevel = () => {
        if (isRecording) {
          analyserRef.current.getByteFrequencyData(dataArray)
          const average = dataArray.reduce((sum, value) => sum + value, 0) / bufferLength
          setAudioLevel(average / 255)
          animationRef.current = requestAnimationFrame(updateLevel)
        }
      }

      updateLevel()
    } catch (error) {
      console.error('Failed to start audio monitoring:', error)
    }
  }

  // Request wake lock to prevent screen from sleeping
  const requestWakeLock = async () => {
    if ('wakeLock' in navigator) {
      try {
        const lock = await navigator.wakeLock.request('screen')
        setWakeLock(lock)
        console.log('🔒 Wake lock acquired')

        // Re-acquire wake lock if page becomes visible again
        lock.addEventListener('release', () => {
          console.log('🔓 Wake lock released')
        })
      } catch (error) {
        console.warn('Failed to acquire wake lock:', error)
      }
    } else {
      console.warn('Wake Lock API not supported')
    }
  }

  // Release wake lock
  const releaseWakeLock = async () => {
    if (wakeLock) {
      try {
        await wakeLock.release()
        setWakeLock(null)
      } catch (error) {
        console.warn('Failed to release wake lock:', error)
      }
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

      // Request wake lock to prevent screen sleep on iOS
      await requestWakeLock()

      const result = await audioTranscriptionService.startRecording({
        mode,
        continuous: true,
        language: 'en-US'
      })

      if (result.success) {
        setIsRecording(true)
        startAudioLevelMonitoring()

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

      // Release wake lock
      await releaseWakeLock()

      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }

      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }

      if (audioContextRef.current) {
        audioContextRef.current.close()
        audioContextRef.current = null
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
    if (onTranscriptUpdate) {
      onTranscriptUpdate('')
    }
  }

  if (!isInitialized && isProcessing) {
    return (
      <div className={`flex items-center justify-center p-6 ${className}`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <p className="text-sm text-gray-600">Initializing audio transcription...</p>
        </div>
      </div>
    )
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

          {/* Mode Selector */}
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            disabled={isRecording}
            className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="hybrid">Hybrid (Best)</option>
            <option value="realtime">Real-time</option>
            <option value="whisper">High Accuracy</option>
          </select>
        </div>

        {/* Main Recording Button */}
        <div className="flex items-center justify-center mb-4">
          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={disabled || isProcessing}
            className={`relative w-16 h-16 rounded-full flex items-center justify-center transition-all duration-200 ${
              isRecording
                ? 'bg-red-500 hover:bg-red-600 shadow-lg'
                : 'bg-blue-500 hover:bg-blue-600 shadow-md'
            } ${
              disabled || isProcessing
                ? 'opacity-50 cursor-not-allowed'
                : 'hover:shadow-lg active:scale-95'
            }`}
            style={{
              transform: isRecording && audioLevel > 0.1 ? `scale(${1 + audioLevel * 0.3})` : 'scale(1)'
            }}
          >
            {isProcessing ? (
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
            ) : isRecording ? (
              <Square className="w-6 h-6 text-white" />
            ) : (
              <Mic className="w-6 h-6 text-white" />
            )}

            {/* Audio level ring */}
            {isRecording && (
              <div
                className="absolute inset-0 rounded-full border-2 border-white opacity-60"
                style={{
                  transform: `scale(${1 + audioLevel * 0.5})`,
                  transition: 'transform 0.1s ease-out'
                }}
              />
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
              <p className="text-xs text-gray-500">
                {mode === 'hybrid' ? 'Real-time + AI Processing' :
                 mode === 'realtime' ? 'Real-time Transcription' :
                 'AI Processing'}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-sm text-gray-600">
                Tap to start recording
              </p>
              <p className="text-xs text-gray-500">
                {permissions === 'granted' ? '✓ Microphone ready' :
                 permissions === 'denied' ? '✗ Microphone access denied' :
                 '? Microphone permission needed'}
              </p>
            </div>
          )}
        </div>

        {/* Audio Level Visualization */}
        {isRecording && (
          <div className="mt-4">
            <div className="flex items-center justify-center space-x-1">
              {[...Array(10)].map((_, i) => (
                <div
                  key={i}
                  className={`w-1 bg-blue-500 rounded-full transition-all duration-100 ${
                    audioLevel * 10 > i ? 'opacity-100' : 'opacity-30'
                  }`}
                  style={{
                    height: `${Math.max(4, Math.min(24, audioLevel * 10 > i ? (4 + i * 2) : 4))}px`
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Transcript Display */}
      {(transcript || interimText) && (
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-700">Live Transcript</h3>
            <button
              onClick={clearTranscript}
              className="text-xs text-red-600 hover:text-red-700 font-medium"
            >
              Clear
            </button>
          </div>

          <div className="space-y-2">
            {transcript && (
              <p className="text-sm text-gray-900 leading-relaxed">
                {transcript}
              </p>
            )}

            {interimText && (
              <p className="text-sm text-gray-500 italic leading-relaxed">
                {interimText}
              </p>
            )}
          </div>

          {isProcessing && (
            <div className="mt-2 flex items-center space-x-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              <span className="text-xs text-gray-500">
                Processing audio...
              </span>
            </div>
          )}
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

      {/* Quick Actions */}
      <div className="flex justify-center space-x-2">
        <button
          onClick={() => setMode(mode === 'hybrid' ? 'realtime' : 'hybrid')}
          disabled={isRecording}
          className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-700 font-medium transition-colors"
        >
          {mode === 'hybrid' ? 'Switch to Fast' : 'Switch to Accurate'}
        </button>
      </div>
    </div>
  )
}

export default AudioRecorder