import React, { useState, useEffect, useRef } from 'react'
import { Mic, MicOff, Square, Play, Pause, Volume2, Settings } from 'lucide-react'
import audioTranscriptionService from '../services/audioTranscriptionService'
import { processWithClaude } from '../utils/ocrServiceNew'

const AudioRecorder = ({ onTranscriptUpdate, className = '', disabled = false }) => {
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
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisResult, setAnalysisResult] = useState(null)

  const timerRef = useRef(null)
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const animationRef = useRef(null)

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

  // Start recording
  const startRecording = async () => {
    try {
      setError(null)
      setTranscript('')
      setInterimText('')
      setRecordingDuration(0)

      await checkPermissions()

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
    }
  }

  // Stop recording
  const stopRecording = async () => {
    try {
      await audioTranscriptionService.stopRecording()
      setIsRecording(false)

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
    }
  }

  // Format duration
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Analyze transcript with AI
  const analyzeTranscript = async () => {
    if (!transcript || transcript.length < 100) {
      setError('Transcript too short for analysis (minimum 100 characters)')
      return
    }

    try {
      setIsAnalyzing(true)
      setError(null)

      const result = await processWithClaude(transcript, {
        source: 'audio_recording',
        timestamp: new Date().toISOString(),
        mode: mode
      })

      setAnalysisResult(result)
      console.log('✅ AI analysis complete:', result)

      // Call the parent callback if analysis results should be passed up
      if (onTranscriptUpdate && typeof onTranscriptUpdate === 'function') {
        onTranscriptUpdate(transcript, result)
      }

    } catch (error) {
      console.error('❌ AI analysis failed:', error)
      setError(`AI analysis failed: ${error.message}`)
    } finally {
      setIsAnalyzing(false)
    }
  }

  // Auto-analyze when recording stops and transcript is sufficient
  useEffect(() => {
    if (!isRecording && transcript && transcript.length >= 200 && !isAnalyzing && !analysisResult) {
      // Auto-analyze after a short delay
      const autoAnalyzeTimer = setTimeout(() => {
        console.log('🤖 Auto-analyzing transcript...')
        analyzeTranscript()
      }, 2000)

      return () => clearTimeout(autoAnalyzeTimer)
    }
  }, [isRecording, transcript, isAnalyzing, analysisResult])

  // Clear transcript
  const clearTranscript = () => {
    setTranscript('')
    setInterimText('')
    setAnalysisResult(null)
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
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                <span className="text-xs text-red-600 font-medium">REC</span>
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

          {(isProcessing || isAnalyzing) && (
            <div className="mt-2 flex items-center space-x-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              <span className="text-xs text-gray-500">
                {isAnalyzing ? 'Analyzing with AI...' : 'Processing with AI...'}
              </span>
            </div>
          )}
        </div>
      )}

      {/* AI Analysis Results */}
      {analysisResult && (
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-blue-900 flex items-center gap-2">
              <span className="text-lg">🧠</span>
              AI Analysis Results
            </h3>
            <div className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded">
              {analysisResult.provider || 'AI Analysis'}
            </div>
          </div>

          <div className="space-y-4">
            {/* Summary */}
            {analysisResult.summary && (
              <div>
                <h4 className="font-medium text-gray-900 mb-2">📝 Summary</h4>
                <p className="text-sm text-gray-700 leading-relaxed">
                  {analysisResult.summary}
                </p>
              </div>
            )}

            {/* Key Discussion Points */}
            {analysisResult.keyDiscussionPoints && analysisResult.keyDiscussionPoints.length > 0 && (
              <div>
                <h4 className="font-medium text-gray-900 mb-2">💡 Key Discussion Points</h4>
                <ul className="space-y-1">
                  {analysisResult.keyDiscussionPoints.slice(0, 5).map((point, index) => (
                    <li key={index} className="text-sm text-gray-700 flex items-start gap-2">
                      <span className="text-blue-500 font-bold">•</span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Action Items */}
            {analysisResult.actionItems && analysisResult.actionItems.length > 0 && (
              <div>
                <h4 className="font-medium text-gray-900 mb-2">✅ Action Items</h4>
                <div className="space-y-2">
                  {analysisResult.actionItems.slice(0, 5).map((item, index) => (
                    <div key={index} className="bg-white rounded p-3 border border-gray-200">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm text-gray-900 flex-1">
                          {typeof item === 'string' ? item : item.task}
                        </p>
                        {typeof item === 'object' && (
                          <div className="flex gap-2">
                            {item.assignee && item.assignee !== 'Unassigned' && (
                              <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
                                {item.assignee}
                              </span>
                            )}
                            {item.priority && (
                              <span className={`text-xs px-2 py-1 rounded ${
                                item.priority === 'high' ? 'bg-red-100 text-red-700' :
                                item.priority === 'low' ? 'bg-gray-100 text-gray-700' :
                                'bg-yellow-100 text-yellow-700'
                              }`}>
                                {item.priority}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sentiment & Confidence */}
            <div className="flex items-center justify-between text-xs text-gray-600">
              <div className="flex items-center gap-3">
                {analysisResult.sentiment && (
                  <span className="flex items-center gap-1">
                    <span>
                      {analysisResult.sentiment === 'positive' ? '😊' :
                       analysisResult.sentiment === 'negative' ? '😟' : '😐'}
                    </span>
                    <span className="capitalize">{analysisResult.sentiment}</span>
                  </span>
                )}
                {analysisResult.confidence && (
                  <span>
                    Confidence: {Math.round(analysisResult.confidence * 100)}%
                  </span>
                )}
              </div>
              <span>
                {new Date(analysisResult.analyzedAt).toLocaleTimeString()}
              </span>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setAnalysisResult(null)}
              className="text-xs text-gray-600 hover:text-gray-800"
            >
              Clear Analysis
            </button>
            <button
              onClick={analyzeTranscript}
              disabled={isAnalyzing}
              className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
            >
              Re-analyze
            </button>
          </div>
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