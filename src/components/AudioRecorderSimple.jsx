import React, { useState, useEffect, useRef } from 'react'
import { Mic, MicOff, Square, Volume2, Users, Loader2, AlertCircle } from 'lucide-react'
import assemblyAISpeakerService from '../services/assemblyAISpeakerService'
import StreamingAudioBuffer from '../utils/StreamingAudioBuffer'

/**
 * Simplified Audio Recorder - Microphone Only + Speaker Diarization
 *
 * Architecture:
 * 1. START: MediaRecorder captures audio (no WebSocket streaming)
 * 2. RECORDING: Audio chunks stored in memory + IndexedDB backup
 * 3. STOP: Audio blob uploaded to AssemblyAI for speaker diarization
 * 4. DONE: Transcript with speaker labels returned
 *
 * This eliminates all WebSocket complexity and race conditions.
 */
const AudioRecorderSimple = ({
  onTranscriptUpdate,
  onAutoSave,
  onProcessingStateChange,
  className = '',
  disabled = false
}) => {
  // Core recording state
  const [isRecording, setIsRecording] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [error, setError] = useState(null)
  const [permissions, setPermissions] = useState('unknown')

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingProgress, setProcessingProgress] = useState(0)
  const [processingStatus, setProcessingStatus] = useState('')

  // Transcript and speaker data
  const [transcript, setTranscript] = useState('')
  const [speakerData, setSpeakerData] = useState(null)

  // Speaker diarization settings
  const [expectedSpeakers, setExpectedSpeakers] = useState(null) // Auto-detect if null
  const [showSettings, setShowSettings] = useState(false)

  // Refs
  const mediaRecorderRef = useRef(null)
  const recordedChunksRef = useRef([])
  const audioStreamRef = useRef(null)
  const timerRef = useRef(null)
  const audioSessionIdRef = useRef(null)
  const chunkIndexRef = useRef(0)

  // Mobile wake lock
  const [wakeLock, setWakeLock] = useState(null)

  // Audio level visualization
  const [audioLevel, setAudioLevel] = useState(0)
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const animationFrameRef = useRef(null)

  // Check if AssemblyAI is configured on mount
  useEffect(() => {
    checkPermissions()

    // Cleanup orphaned sessions on mount
    StreamingAudioBuffer.cleanupOrphanedSessions().catch(err => {
      console.warn('Failed to cleanup orphaned sessions:', err)
    })

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
      stopAudioLevelMonitoring()
    }
  }, [])

  // Notify parent of processing state changes
  useEffect(() => {
    if (onProcessingStateChange) {
      onProcessingStateChange(isProcessing)
    }
  }, [isProcessing, onProcessingStateChange])

  // Check microphone permissions
  const checkPermissions = async () => {
    try {
      const result = await navigator.permissions.query({ name: 'microphone' })
      setPermissions(result.state)
      result.addEventListener('change', () => setPermissions(result.state))
    } catch (err) {
      console.warn('Permissions API not supported:', err)
      setPermissions('prompt') // Assume we can prompt
    }
  }

  // Wake lock for mobile (keeps screen on during recording)
  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        const lock = await navigator.wakeLock.request('screen')
        setWakeLock(lock)
        console.log('🔒 Wake lock acquired')
        lock.addEventListener('release', () => {
          console.log('🔓 Wake lock released')
          setWakeLock(null)
        })
      }
    } catch (err) {
      console.warn('Wake lock not available:', err)
    }
  }

  const releaseWakeLock = async () => {
    if (wakeLock) {
      try {
        await wakeLock.release()
        setWakeLock(null)
      } catch (err) {
        console.warn('Failed to release wake lock:', err)
      }
    }
  }

  // Audio level monitoring for visual feedback
  const startAudioLevelMonitoring = (stream) => {
    try {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
      analyserRef.current = audioContextRef.current.createAnalyser()
      const source = audioContextRef.current.createMediaStreamSource(stream)
      source.connect(analyserRef.current)
      analyserRef.current.fftSize = 256

      const updateLevel = () => {
        if (!analyserRef.current) return
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
        analyserRef.current.getByteFrequencyData(dataArray)
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
        setAudioLevel(average / 255)
        animationFrameRef.current = requestAnimationFrame(updateLevel)
      }
      updateLevel()
    } catch (err) {
      console.warn('Audio level monitoring not available:', err)
    }
  }

  const stopAudioLevelMonitoring = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }
    analyserRef.current = null
    setAudioLevel(0)
  }

  // Get supported MIME type (iOS Safari compatible)
  const getSupportedMimeType = () => {
    const types = [
      'audio/mp4',                  // iOS Safari
      'audio/webm;codecs=opus',     // Chrome/Firefox
      'audio/webm',                 // Fallback
    ]
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type
      }
    }
    return '' // Let browser choose
  }

  // START RECORDING
  const startRecording = async () => {
    try {
      setError(null)
      setTranscript('')
      setSpeakerData(null)
      setRecordingDuration(0)
      setProcessingProgress(0)
      setProcessingStatus('')
      recordedChunksRef.current = []
      chunkIndexRef.current = 0

      // Check permissions first
      if (permissions === 'denied') {
        setError('Microphone permission denied. Please allow access in browser settings.')
        return
      }

      // Request wake lock for mobile
      await requestWakeLock()

      // Get microphone stream
      console.log('🎤 Requesting microphone access...')
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000
        }
      })
      audioStreamRef.current = stream
      console.log('✅ Microphone access granted')

      // Start audio level monitoring for visual feedback
      startAudioLevelMonitoring(stream)

      // Determine MIME type
      const mimeType = getSupportedMimeType()
      console.log('📼 Using MIME type:', mimeType || 'browser default')

      // Start IndexedDB session for crash recovery
      audioSessionIdRef.current = await StreamingAudioBuffer.startSession({
        audioSource: 'microphone',
        mimeType: mimeType || 'audio/webm',
        sampleRate: 16000
      })

      // Create and configure MediaRecorder
      const options = mimeType ? { mimeType, audioBitsPerSecond: 128000 } : { audioBitsPerSecond: 128000 }
      mediaRecorderRef.current = new MediaRecorder(stream, options)

      // Handle audio data chunks
      mediaRecorderRef.current.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data)

          // Backup to IndexedDB for crash recovery
          if (audioSessionIdRef.current) {
            try {
              await StreamingAudioBuffer.storeChunk(
                audioSessionIdRef.current,
                event.data,
                chunkIndexRef.current++
              )
            } catch (err) {
              console.warn('Failed to backup chunk:', err)
            }
          }
        }
      }

      // Handle recording errors
      mediaRecorderRef.current.onerror = (event) => {
        console.error('MediaRecorder error:', event.error)
        setError(`Recording error: ${event.error?.message || 'Unknown error'}`)
        stopRecording()
      }

      // Start recording with 1-second chunks
      mediaRecorderRef.current.start(1000)
      setIsRecording(true)

      // Start duration timer
      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1)
      }, 1000)

      console.log('🎙️ Recording started')

    } catch (err) {
      console.error('Failed to start recording:', err)
      if (err.name === 'NotAllowedError') {
        setError('Microphone access denied. Please allow microphone permission.')
      } else if (err.name === 'NotFoundError') {
        setError('No microphone found. Please connect a microphone.')
      } else {
        setError(`Failed to start recording: ${err.message}`)
      }
      await releaseWakeLock()
    }
  }

  // STOP RECORDING
  const stopRecording = async () => {
    if (!isRecording || !mediaRecorderRef.current) {
      console.warn('Not recording, nothing to stop')
      return
    }

    console.log('🛑 Stopping recording...')

    // Stop the timer
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    // Stop audio level monitoring
    stopAudioLevelMonitoring()

    setIsRecording(false)
    setIsProcessing(true)
    setProcessingStatus('Preparing audio...')

    try {
      // Stop MediaRecorder and wait for final data
      await new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('MediaRecorder stop timeout'))
        }, 5000)

        mediaRecorderRef.current.onstop = () => {
          clearTimeout(timeoutId)
          resolve()
        }

        if (mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop()
        } else {
          clearTimeout(timeoutId)
          resolve()
        }
      })

      console.log(`📦 Recording stopped. ${recordedChunksRef.current.length} chunks collected.`)

      // Stop microphone stream
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(track => track.stop())
        audioStreamRef.current = null
      }

      // Release wake lock
      await releaseWakeLock()

      // Validate we have audio data
      if (recordedChunksRef.current.length === 0) {
        throw new Error('No audio data captured. Please try recording again.')
      }

      // Create audio blob
      const mimeType = getSupportedMimeType() || 'audio/webm'
      const audioBlob = new Blob(recordedChunksRef.current, { type: mimeType })
      console.log(`📼 Audio blob created: ${(audioBlob.size / 1024 / 1024).toFixed(2)} MB`)

      // Validate blob size (minimum 1KB)
      if (audioBlob.size < 1000) {
        throw new Error('Recording too short. Please record for at least 2 seconds.')
      }

      // Mark IndexedDB session as processing
      if (audioSessionIdRef.current) {
        await StreamingAudioBuffer.completeSession(audioSessionIdRef.current, {
          uploadStatus: 'uploading'
        })
      }

      // Process with speaker diarization
      setProcessingStatus('Uploading audio...')
      setProcessingProgress(10)

      const speakerResult = await assemblyAISpeakerService.transcribeWithSpeakers(
        audioBlob,
        {
          speakers_expected: expectedSpeakers,
          onProgress: (progress, status) => {
            setProcessingProgress(10 + (progress * 0.9)) // 10% upload, 90% processing
            setProcessingStatus(status || 'Processing...')
          }
        }
      )

      console.log('✅ Speaker diarization complete:', speakerResult)

      // Mark session as completed
      if (audioSessionIdRef.current && speakerResult.id) {
        await StreamingAudioBuffer.markUploaded(audioSessionIdRef.current, speakerResult.id)
      }

      // Extract transcript and speaker data
      let finalTranscript = ''
      let finalSpeakerData = null

      if (speakerResult.utterances && speakerResult.utterances.length > 0) {
        finalTranscript = speakerResult.utterances.map(u => u.text).join(' ')
        finalSpeakerData = {
          ...speakerResult,
          text: finalTranscript
        }
      } else if (speakerResult.text) {
        finalTranscript = speakerResult.text
        finalSpeakerData = speakerResult
      }

      // Update state
      setTranscript(finalTranscript)
      setSpeakerData(finalSpeakerData)
      setProcessingProgress(100)
      setProcessingStatus('Complete!')

      // Notify parent component
      if (onTranscriptUpdate) {
        onTranscriptUpdate(finalTranscript, finalSpeakerData)
      }

      // Auto-save
      if (onAutoSave && finalTranscript) {
        onAutoSave(finalTranscript, 'recording_complete')
      }

      console.log('✅ Recording processed successfully')

    } catch (err) {
      console.error('❌ Failed to process recording:', err)
      setError(`Processing failed: ${err.message}`)
      setProcessingStatus('Failed')

      // Mark session as failed
      if (audioSessionIdRef.current) {
        await StreamingAudioBuffer.markUploadFailed(audioSessionIdRef.current, err.message)
      }

      // Cleanup on error
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(track => track.stop())
        audioStreamRef.current = null
      }
      await releaseWakeLock()

    } finally {
      setIsProcessing(false)
      mediaRecorderRef.current = null
      recordedChunksRef.current = []
    }
  }

  // Clear transcript and start fresh
  const clearTranscript = () => {
    setTranscript('')
    setSpeakerData(null)
    setError(null)
    setProcessingProgress(0)
    setProcessingStatus('')
    if (onTranscriptUpdate) {
      onTranscriptUpdate('', null)
    }
  }

  // Format duration as MM:SS
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
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
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span className="text-xs text-red-600 font-medium">REC</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {transcript && !isRecording && !isProcessing && (
              <button
                onClick={clearTranscript}
                className="text-xs px-2 py-1 text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
              >
                Clear
              </button>
            )}
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="text-xs px-2 py-1 text-gray-600 hover:text-gray-700 hover:bg-gray-50 rounded transition-colors flex items-center gap-1"
            >
              <Users size={12} />
              Speakers
            </button>
          </div>
        </div>

        {/* Speaker Settings */}
        {showSettings && (
          <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
            <label className="text-sm font-medium text-blue-800 block mb-2">
              Expected number of speakers
            </label>
            <select
              value={expectedSpeakers || 'auto'}
              onChange={(e) => setExpectedSpeakers(e.target.value === 'auto' ? null : parseInt(e.target.value))}
              className="w-full p-2 border border-blue-200 rounded-md text-sm bg-white"
              disabled={isRecording || isProcessing}
            >
              <option value="auto">Auto-detect</option>
              <option value="2">2 speakers</option>
              <option value="3">3 speakers</option>
              <option value="4">4 speakers</option>
              <option value="5">5+ speakers</option>
            </select>
            <p className="text-xs text-blue-600 mt-1">
              Speaker identification helps attribute action items to specific participants
            </p>
          </div>
        )}

        {/* Audio Level Indicator (during recording) */}
        {isRecording && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
              <span>Audio Level</span>
              <span className="font-mono">{formatDuration(recordingDuration)}</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all duration-100"
                style={{ width: `${Math.min(audioLevel * 100, 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Processing Progress */}
        {isProcessing && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {processingStatus || 'Processing...'}
              </span>
              <span>{Math.round(processingProgress)}%</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${processingProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-red-700">{error}</p>
              <button
                onClick={() => setError(null)}
                className="text-xs text-red-600 hover:text-red-800 mt-1"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Record/Stop Button */}
        <div className="flex justify-center">
          {!isRecording ? (
            <button
              onClick={startRecording}
              disabled={disabled || isProcessing || permissions === 'denied'}
              className={`
                flex items-center gap-2 px-6 py-3 rounded-full font-medium transition-all
                ${disabled || isProcessing || permissions === 'denied'
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-red-500 hover:bg-red-600 text-white shadow-lg hover:shadow-xl'
                }
              `}
            >
              <Mic className="w-5 h-5" />
              {isProcessing ? 'Processing...' : 'Start Recording'}
            </button>
          ) : (
            <button
              onClick={stopRecording}
              className="flex items-center gap-2 px-6 py-3 rounded-full font-medium bg-gray-800 hover:bg-gray-900 text-white shadow-lg hover:shadow-xl transition-all"
            >
              <Square className="w-5 h-5" />
              Stop Recording ({formatDuration(recordingDuration)})
            </button>
          )}
        </div>

        {/* Permission denied message */}
        {permissions === 'denied' && (
          <p className="text-center text-sm text-red-600 mt-3">
            Microphone access denied. Please enable it in your browser settings.
          </p>
        )}
      </div>

      {/* Transcript Display */}
      {transcript && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
            <Users className="w-4 h-4" />
            Transcript {speakerData?.utterances?.length > 0 && '(with speakers)'}
          </h3>

          {speakerData?.utterances?.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {speakerData.utterances.map((utterance, idx) => (
                <div key={idx} className="text-sm">
                  <span className="font-medium text-blue-600">
                    Speaker {utterance.speaker}:
                  </span>{' '}
                  <span className="text-gray-700">{utterance.text}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-700 max-h-64 overflow-y-auto">
              {transcript}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default AudioRecorderSimple
