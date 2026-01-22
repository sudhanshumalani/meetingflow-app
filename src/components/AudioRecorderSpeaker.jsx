import React, { useState, useEffect, useRef } from 'react'
import { Mic, Square, Users, Settings, CheckCircle, Loader2, Edit2, X } from 'lucide-react'
import assemblyAISpeakerService from '../services/assemblyAISpeakerService'

/**
 * Wake Lock utility to keep screen awake during recording/processing
 * Prevents iOS PWA from suspending during long operations
 */
const wakeLockManager = {
  wakeLock: null,

  async request() {
    try {
      if ('wakeLock' in navigator) {
        this.wakeLock = await navigator.wakeLock.request('screen')
        console.log('🔆 Wake Lock: Screen will stay awake')

        // Re-acquire if released (e.g., tab switch)
        this.wakeLock.addEventListener('release', () => {
          console.log('🔆 Wake Lock: Released')
        })
        return true
      } else {
        console.log('🔆 Wake Lock: Not supported on this device')
        return false
      }
    } catch (err) {
      console.warn('🔆 Wake Lock: Failed to acquire -', err.message)
      return false
    }
  },

  async release() {
    try {
      if (this.wakeLock) {
        await this.wakeLock.release()
        this.wakeLock = null
        console.log('🔆 Wake Lock: Released (manual)')
      }
    } catch (err) {
      console.warn('🔆 Wake Lock: Failed to release -', err.message)
    }
  }
}

/**
 * AudioRecorder with Speaker Diarization (PROTOTYPE)
 * Hybrid mode: Real-time streaming + post-processing with speaker labels
 */
const AudioRecorderSpeaker = ({ onTranscriptUpdate, className = '', disabled = false }) => {
  const [isInitialized, setIsInitialized] = useState(false)
  const [isRecording, setIsRecording] = useState(false)

  // Real-time transcript (no speakers)
  const [realtimeTranscript, setRealtimeTranscript] = useState('')
  const [interimText, setInterimText] = useState('')

  // Speaker diarization results
  const [speakerData, setSpeakerData] = useState(null)
  const [isProcessingSpeakers, setIsProcessingSpeakers] = useState(false)
  const [processingStage, setProcessingStage] = useState('')
  const [processingProgress, setProcessingProgress] = useState(0)

  // Speaker customization
  const [speakerLabels, setSpeakerLabels] = useState({}) // { "A": "John Doe", "B": "Jane Smith" }
  const [editingSpeaker, setEditingSpeaker] = useState(null)
  const [speakerNameInput, setSpeakerNameInput] = useState('')

  // Settings
  const [enableSpeakerDiarization, setEnableSpeakerDiarization] = useState(true)
  const [expectedSpeakers, setExpectedSpeakers] = useState(null) // Auto-detect if null
  const [showSettings, setShowSettings] = useState(false)

  // Other state
  const [error, setError] = useState(null)
  const [recordingDuration, setRecordingDuration] = useState(0)

  const timerRef = useRef(null)
  const realtimeTranscriptRef = useRef('')

  // Speaker colors for visual distinction
  const SPEAKER_COLORS = {
    'A': { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' },
    'B': { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300' },
    'C': { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-300' },
    'D': { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300' },
    'E': { bg: 'bg-pink-100', text: 'text-pink-800', border: 'border-pink-300' },
    'F': { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300' },
    'G': { bg: 'bg-indigo-100', text: 'text-indigo-800', border: 'border-indigo-300' },
    'H': { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' }
  }

  // Initialize service
  useEffect(() => {
    const initService = async () => {
      try {
        if (!assemblyAISpeakerService.isConfigured()) {
          setError('AssemblyAI API key not configured. Please add VITE_ASSEMBLYAI_API_KEY to your .env file.')
          return
        }
        setIsInitialized(true)
        console.log('🎯 Speaker Diarization Service ready (PROTOTYPE)')
      } catch (error) {
        console.error('Failed to initialize:', error)
        setError('Failed to initialize speaker diarization service.')
      }
    }

    initService()

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      // Release wake lock on unmount
      wakeLockManager.release()
    }
  }, [])

  // Start recording with hybrid mode
  const startRecording = async () => {
    try {
      setError(null)
      setRealtimeTranscript('')
      setInterimText('')
      setSpeakerData(null)
      setRecordingDuration(0)
      realtimeTranscriptRef.current = ''

      // Request wake lock to prevent screen from going dark during recording/processing
      await wakeLockManager.request()

      // Get microphone access
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000
        }
      })

      console.log('🎙️ Starting hybrid transcription...')

      // Start hybrid mode: real-time + recording for speakers
      await assemblyAISpeakerService.startHybridTranscription(
        micStream,
        {
          speakers_expected: expectedSpeakers,
          enable_speaker_labels: enableSpeakerDiarization
        },
        {
          // Real-time transcript callback (no speakers, instant feedback)
          onRealtimeTranscript: (text, isFinal) => {
            if (isFinal && text.trim()) {
              realtimeTranscriptRef.current += text + ' '
              setRealtimeTranscript(realtimeTranscriptRef.current)
            } else if (text) {
              setInterimText(text)
            }
          },

          // Speaker diarization callback (after recording stops)
          onSpeakerTranscript: (data) => {
            console.log('✅ Received speaker data:', data)
            setSpeakerData(data)
            setIsProcessingSpeakers(false)

            // Release wake lock - processing is complete
            wakeLockManager.release()

            // CRITICAL: Save transcript immediately to localStorage to prevent data loss
            try {
              const backupData = {
                ...data,
                backedUpAt: new Date().toISOString(),
                wordCount: data.text?.split(' ').length || 0
              }
              localStorage.setItem('latest_transcript_backup', JSON.stringify(backupData))
              console.log('💾 TRANSCRIPT BACKED UP TO LOCALSTORAGE (fail-safe)', {
                words: backupData.wordCount,
                speakers: data.speakers_detected,
                utterances: data.utterances?.length || 0
              })
            } catch (backupError) {
              console.error('❌ Failed to backup transcript:', backupError)
            }

            // Update parent component if needed
            if (onTranscriptUpdate && data.text) {
              onTranscriptUpdate(data.text)
            }
          },

          onError: (error) => {
            console.error('❌ Hybrid transcription error:', error)
            setError(error.message)
            setIsRecording(false)
            setIsProcessingSpeakers(false)
            // Release wake lock on error
            wakeLockManager.release()
          },

          onClose: () => {
            console.log('🔌 Hybrid transcription closed')
          }
        }
      )

      setIsRecording(true)

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1)
      }, 1000)

      console.log('✅ Hybrid recording started')
    } catch (error) {
      console.error('Failed to start recording:', error)
      setError(error.message)
      // Release wake lock if recording failed to start
      wakeLockManager.release()
    }
  }

  // Stop recording
  const stopRecording = async () => {
    try {
      console.log('🛑 Stopping recording...')

      if (enableSpeakerDiarization) {
        setIsProcessingSpeakers(true)
        setProcessingStage('Processing speaker identification...')
        setProcessingProgress(0)
      }

      // Stop hybrid transcription (will trigger speaker processing)
      await assemblyAISpeakerService.stopHybridTranscription()

      setIsRecording(false)

      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }

      console.log('✅ Recording stopped')
    } catch (error) {
      console.error('Failed to stop recording:', error)
      setError(error.message)
      setIsProcessingSpeakers(false)
    }
  }

  // Format duration
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Get speaker color classes
  const getSpeakerColor = (speaker) => {
    return SPEAKER_COLORS[speaker] || { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-300' }
  }

  // Start editing speaker name
  const startEditingSpeaker = (speaker) => {
    setEditingSpeaker(speaker)
    setSpeakerNameInput(speakerLabels[speaker] || '')
  }

  // Save speaker name
  const saveSpeakerName = () => {
    if (editingSpeaker && speakerNameInput.trim()) {
      setSpeakerLabels(prev => ({
        ...prev,
        [editingSpeaker]: speakerNameInput.trim()
      }))
    }
    setEditingSpeaker(null)
    setSpeakerNameInput('')
  }

  // Cancel editing
  const cancelEditingSpeaker = () => {
    setEditingSpeaker(null)
    setSpeakerNameInput('')
  }

  if (!isInitialized) {
    return (
      <div className={`p-4 bg-red-50 border border-red-200 rounded-lg ${className}`}>
        <p className="text-red-700 text-sm">
          Speaker diarization is not available. {error || 'Please check your configuration.'}
        </p>
      </div>
    )
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-200 p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <Users className="w-5 h-5 text-blue-600" />
            <span className="text-sm font-semibold text-gray-900">Speaker Diarization (PROTOTYPE)</span>
          </div>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-1 hover:bg-white rounded transition-colors"
            title="Settings"
          >
            <Settings className="w-4 h-4 text-gray-600" />
          </button>
        </div>
        <p className="text-xs text-gray-600">
          Hybrid mode: Real-time preview + speaker identification
        </p>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
          <h3 className="text-sm font-medium text-gray-900">Settings</h3>

          {/* Enable Speaker Diarization */}
          <div className="flex items-center justify-between">
            <label className="text-sm text-gray-700">Enable Speaker Identification</label>
            <button
              onClick={() => setEnableSpeakerDiarization(!enableSpeakerDiarization)}
              disabled={isRecording}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                enableSpeakerDiarization ? 'bg-blue-600' : 'bg-gray-300'
              } ${isRecording ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  enableSpeakerDiarization ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Expected Speakers */}
          {enableSpeakerDiarization && (
            <div>
              <label className="text-sm text-gray-700 block mb-1">
                Expected Number of Speakers (optional)
              </label>
              <select
                value={expectedSpeakers || ''}
                onChange={(e) => setExpectedSpeakers(e.target.value ? parseInt(e.target.value) : null)}
                disabled={isRecording}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
              >
                <option value="">Auto-detect</option>
                <option value="2">2 speakers</option>
                <option value="3">3 speakers</option>
                <option value="4">4 speakers</option>
                <option value="5">5 speakers</option>
                <option value="6">6+ speakers</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                💡 Hint: Helps improve accuracy if you know the number
              </p>
            </div>
          )}
        </div>
      )}

      {/* Recording Controls */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
        <div className="flex items-center justify-center mb-4">
          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={disabled || isProcessingSpeakers}
            className={`relative w-16 h-16 rounded-full flex items-center justify-center transition-all duration-200 ${
              isRecording
                ? 'bg-red-500 hover:bg-red-600 shadow-lg'
                : 'bg-blue-500 hover:bg-blue-600 shadow-md'
            } ${
              disabled || isProcessingSpeakers
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

        {/* Recording Status */}
        <div className="text-center space-y-2">
          {isRecording ? (
            <>
              <p className="text-lg font-mono font-semibold text-gray-900">
                {formatDuration(recordingDuration)}
              </p>
              <div className="flex items-center justify-center space-x-2">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                <p className="text-xs text-red-600 font-medium">RECORDING</p>
              </div>
              <p className="text-xs text-gray-500">
                {enableSpeakerDiarization
                  ? '🎙️ Real-time preview + recording for speaker ID'
                  : '🎙️ Real-time transcription only'}
              </p>
            </>
          ) : isProcessingSpeakers ? (
            <>
              <div className="flex items-center justify-center space-x-2">
                <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                <p className="text-sm text-blue-600 font-medium">Processing Speakers...</p>
              </div>
              <p className="text-xs text-gray-500">{processingStage}</p>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600">
                Tap to start recording
              </p>
              {enableSpeakerDiarization && (
                <p className="text-xs text-blue-600">
                  ✓ Speaker identification enabled
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Real-time Transcript (during recording) */}
      {isRecording && realtimeTranscript && (
        <div className="bg-blue-50 rounded-lg border border-blue-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-blue-900">
              📝 Real-time Preview (no speakers yet)
            </h3>
            <span className="text-xs text-blue-700">
              {realtimeTranscript.split(' ').filter(w => w.trim()).length} words
            </span>
          </div>
          <div className="text-sm text-gray-900 leading-relaxed max-h-32 overflow-y-auto bg-white p-3 rounded border border-blue-100">
            {realtimeTranscript}
            {interimText && (
              <span className="text-gray-500 italic"> {interimText}</span>
            )}
          </div>
        </div>
      )}

      {/* Speaker Diarization Results */}
      {speakerData && speakerData.utterances && speakerData.utterances.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <Users className="w-5 h-5 text-green-600" />
              <h3 className="text-sm font-medium text-gray-900">
                Speaker-Identified Transcript
              </h3>
              <CheckCircle className="w-4 h-4 text-green-600" />
            </div>
            <div className="text-xs text-gray-600">
              {speakerData.speakers_detected} speaker{speakerData.speakers_detected !== 1 ? 's' : ''} detected
            </div>
          </div>

          {/* Speaker Summary */}
          <div className="mb-3 flex flex-wrap gap-2">
            {Array.from(new Set(speakerData.utterances.map(u => u.speaker))).map(speaker => {
              const color = getSpeakerColor(speaker)
              const utteranceCount = speakerData.utterances.filter(u => u.speaker === speaker).length

              return (
                <button
                  key={speaker}
                  onClick={() => startEditingSpeaker(speaker)}
                  className={`flex items-center space-x-1 px-2 py-1 rounded-full border ${color.bg} ${color.text} ${color.border} hover:opacity-80 transition-opacity`}
                >
                  <span className="text-xs font-medium">
                    {speakerLabels[speaker] || `Speaker ${speaker}`}
                  </span>
                  <span className="text-xs opacity-70">({utteranceCount})</span>
                  <Edit2 className="w-3 h-3 opacity-50" />
                </button>
              )
            })}
          </div>

          {/* Utterances */}
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {speakerData.utterances.map((utterance, idx) => {
              const color = getSpeakerColor(utterance.speaker)
              const speakerName = speakerLabels[utterance.speaker] || `Speaker ${utterance.speaker}`

              return (
                <div key={idx} className="flex gap-3">
                  <div className={`flex-shrink-0 px-2 py-1 rounded-full border ${color.bg} ${color.text} ${color.border} h-fit`}>
                    <span className="text-xs font-medium">{speakerName}</span>
                  </div>
                  <div className="flex-1 bg-gray-50 rounded-lg p-3 border border-gray-200">
                    <p className="text-sm text-gray-900 leading-relaxed">{utterance.text}</p>
                    {utterance.confidence && (
                      <p className="text-xs text-gray-500 mt-1">
                        Confidence: {(utterance.confidence * 100).toFixed(1)}%
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Speaker Name Editor Modal */}
      {editingSpeaker && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Rename Speaker {editingSpeaker}
            </h3>
            <input
              type="text"
              value={speakerNameInput}
              onChange={(e) => setSpeakerNameInput(e.target.value)}
              placeholder={`e.g., John Doe`}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveSpeakerName()
                if (e.key === 'Escape') cancelEditingSpeaker()
              }}
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={saveSpeakerName}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
              >
                Save
              </button>
              <button
                onClick={cancelEditingSpeaker}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
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

      {/* Info */}
      <div className="text-center">
        <p className="text-xs text-blue-600 font-medium">
          🧪 PROTOTYPE: Speaker Diarization Testing
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Real-time preview while recording • Speaker labels after processing
        </p>
      </div>
    </div>
  )
}

export default AudioRecorderSpeaker
