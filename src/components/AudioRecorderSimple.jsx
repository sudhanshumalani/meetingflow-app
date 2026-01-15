import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Mic, MicOff, Square, Volume2, Users, Loader2, AlertCircle, ChevronDown, ChevronUp, Bug, Trash2 } from 'lucide-react'
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
 * iOS Safari Fixes Applied:
 * - Use stream.clone() to fix Safari MP4 encoding issues (causes "few words only" transcription)
 * - Simplified audio constraints (iOS ignores sampleRate, echoCancellation, etc.)
 * - Safe AudioContext initialization with state checking
 * - Graceful fallback when audio visualization fails
 *
 * References:
 * - https://community.openai.com/t/whisper-problem-with-audio-mp4-blobs-from-safari/322252
 * - https://webkit.org/blog/11353/mediarecorder-api/
 */

// Detect iOS Safari
const isIOSSafari = () => {
  const ua = navigator.userAgent
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream
  const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS/.test(ua)
  return isIOS || (isSafari && /Macintosh/.test(ua) && navigator.maxTouchPoints > 0)
}
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
  const recordingStreamRef = useRef(null) // Cloned stream for MediaRecorder (iOS fix)
  const timerRef = useRef(null)
  const audioSessionIdRef = useRef(null)
  const chunkIndexRef = useRef(0)
  const operationLockRef = useRef(false) // Prevents rapid start/stop race conditions

  // Mobile wake lock
  const [wakeLock, setWakeLock] = useState(null)

  // Audio level visualization
  const [audioLevel, setAudioLevel] = useState(0)
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const animationFrameRef = useRef(null)

  // Debug panel state
  const [showDebug, setShowDebug] = useState(false)
  const [debugLogs, setDebugLogs] = useState([])
  const maxDebugLogs = 50 // Keep last 50 logs

  // Debug logging function - logs to both console and UI
  const debugLog = useCallback((type, message, data = null) => {
    const timestamp = new Date().toLocaleTimeString()
    const logEntry = {
      id: Date.now(),
      timestamp,
      type, // 'info', 'success', 'warning', 'error'
      message,
      data: data ? JSON.stringify(data, null, 2) : null
    }

    // Log to console
    const consoleMsg = `[${timestamp}] ${message}`
    if (type === 'error') {
      console.error(consoleMsg, data || '')
    } else if (type === 'warning') {
      console.warn(consoleMsg, data || '')
    } else {
      console.log(consoleMsg, data || '')
    }

    // Add to UI debug logs
    setDebugLogs(prev => {
      const newLogs = [...prev, logEntry]
      // Keep only the last maxDebugLogs entries
      return newLogs.slice(-maxDebugLogs)
    })
  }, [])

  // Clear debug logs
  const clearDebugLogs = useCallback(() => {
    setDebugLogs([])
  }, [])

  // Check if AssemblyAI is configured on mount
  useEffect(() => {
    // Wrap all initialization in try-catch to prevent crashes
    const initializeComponent = async () => {
      // Log device info for debugging
      const isiOS = isIOSSafari()
      debugLog('info', 'Component initialized', {
        userAgent: navigator.userAgent.substring(0, 100),
        isIOSSafari: isiOS,
        mediaDevices: !!navigator.mediaDevices,
        getUserMedia: !!(navigator.mediaDevices?.getUserMedia),
        MediaRecorder: !!window.MediaRecorder,
        AudioContext: !!(window.AudioContext || window.webkitAudioContext)
      })

      // Check AssemblyAI configuration
      const isConfigured = assemblyAISpeakerService.isConfigured()
      debugLog(isConfigured ? 'success' : 'warning',
        `AssemblyAI ${isConfigured ? 'configured' : 'NOT configured'}`)

      try {
        await checkPermissions()
        debugLog('info', `Microphone permission: ${permissions}`)
      } catch (err) {
        debugLog('warning', 'Failed to check permissions', { error: err.message })
      }

      // Cleanup orphaned sessions on mount (non-blocking, fire-and-forget)
      try {
        const result = await StreamingAudioBuffer.cleanupOrphanedSessions()
        debugLog('info', 'IndexedDB cleanup complete', result)
      } catch (err) {
        debugLog('warning', 'IndexedDB cleanup failed (non-fatal)', { error: err.message })
      }
    }

    initializeComponent()

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
  // NOTE: This is optional - recording works without it
  const startAudioLevelMonitoring = (stream) => {
    // Skip audio visualization on iOS Safari - it can cause issues and isn't critical
    if (isIOSSafari()) {
      console.log('📱 iOS Safari detected - skipping audio level visualization')
      return
    }

    try {
      // Check if AudioContext is available
      const AudioContextClass = window.AudioContext || window.webkitAudioContext
      if (!AudioContextClass) {
        console.warn('AudioContext not available')
        return
      }

      audioContextRef.current = new AudioContextClass()

      // iOS Safari requires resume after user gesture
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().catch(err => {
          console.warn('Failed to resume AudioContext:', err)
        })
      }

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
      // Non-fatal - recording still works without visualization
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
    debugLog('info', 'START RECORDING clicked')

    // CRITICAL: Prevent rapid start/stop race conditions
    if (operationLockRef.current) {
      debugLog('warning', 'Operation in progress, please wait...')
      return
    }
    operationLockRef.current = true

    try {
      setError(null)
      // DON'T clear transcript/speakerData - we want to APPEND to existing
      // setTranscript('')
      // setSpeakerData(null)
      setRecordingDuration(0)
      setProcessingProgress(0)
      setProcessingStatus('')
      recordedChunksRef.current = []
      chunkIndexRef.current = 0

      // Cleanup any previous recording state that might be lingering
      debugLog('info', 'Cleaning up previous state...')
      try {
        // Stop any existing recording stream (cloned)
        if (recordingStreamRef.current) {
          recordingStreamRef.current.getTracks().forEach(track => track.stop())
          recordingStreamRef.current = null
        }
        // Stop any existing audio stream (original)
        if (audioStreamRef.current) {
          audioStreamRef.current.getTracks().forEach(track => track.stop())
          audioStreamRef.current = null
        }
        // Stop any existing MediaRecorder
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop()
          mediaRecorderRef.current = null
        }
        // Stop audio level monitoring
        stopAudioLevelMonitoring()
        // Small delay to ensure cleanup completes
        await new Promise(resolve => setTimeout(resolve, 200))
        debugLog('success', 'Cleanup complete')
      } catch (cleanupErr) {
        debugLog('warning', 'Cleanup warning (non-fatal)', { error: cleanupErr.message })
      }

      // Check permissions first
      if (permissions === 'denied') {
        debugLog('error', 'Microphone permission denied')
        setError('Microphone permission denied. Please allow access in browser settings.')
        return
      }

      // Request wake lock for mobile
      await requestWakeLock()
      debugLog('info', 'Wake lock requested')

      // Get microphone stream
      // NOTE: iOS Safari ignores most audio constraints - keep it simple
      const isiOS = isIOSSafari()
      debugLog('info', `Requesting microphone... (iOS: ${isiOS})`)

      // Use simpler constraints for iOS Safari (it ignores most of them anyway)
      const audioConstraints = isiOS
        ? { audio: true }  // iOS Safari: just request audio, let it use defaults
        : {
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
              // NOTE: sampleRate is often ignored - AssemblyAI will resample anyway
            }
          }

      const stream = await navigator.mediaDevices.getUserMedia(audioConstraints)
      audioStreamRef.current = stream
      debugLog('success', 'Microphone access granted')

      // Log actual audio track settings for debugging
      const audioTrack = stream.getAudioTracks()[0]
      if (audioTrack) {
        const settings = audioTrack.getSettings()
        debugLog('info', 'Audio track settings', {
          sampleRate: settings.sampleRate,
          channelCount: settings.channelCount,
          label: audioTrack.label?.substring(0, 30)
        })
      }

      // Determine MIME type
      const mimeType = getSupportedMimeType()
      debugLog('info', `MIME type: ${mimeType || 'browser default'}`)

      // Start IndexedDB session for crash recovery (non-blocking)
      try {
        audioSessionIdRef.current = await StreamingAudioBuffer.startSession({
          audioSource: 'microphone',
          mimeType: mimeType || 'audio/webm',
          sampleRate: 16000
        })
        debugLog('info', 'IndexedDB session started')
      } catch (err) {
        debugLog('warning', 'IndexedDB session failed (non-fatal)', { error: err.message })
        audioSessionIdRef.current = null
      }

      // CRITICAL FIX: Use stream.clone() for MediaRecorder
      // This fixes Safari's MP4 encoding issues that cause "only a few words" transcription
      // Reference: https://community.openai.com/t/whisper-problem-with-audio-mp4-blobs-from-safari/322252
      recordingStreamRef.current = stream.clone()
      debugLog('info', 'Stream cloned for MediaRecorder (iOS fix)')

      // Create and configure MediaRecorder
      const options = mimeType ? { mimeType, audioBitsPerSecond: 128000 } : { audioBitsPerSecond: 128000 }
      mediaRecorderRef.current = new MediaRecorder(recordingStreamRef.current, options)
      debugLog('success', 'MediaRecorder created', { mimeType: mediaRecorderRef.current.mimeType })

      // Start audio level monitoring for visual feedback (after MediaRecorder is set up)
      startAudioLevelMonitoring(stream)

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
        debugLog('error', 'MediaRecorder error', { error: event.error?.message })
        setError(`Recording error: ${event.error?.message || 'Unknown error'}`)
        stopRecording()
      }

      // Start recording with 1-second chunks
      mediaRecorderRef.current.start(1000)
      setIsRecording(true)
      debugLog('success', 'RECORDING STARTED - capturing 1s chunks')

      // Start duration timer
      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1)
      }, 1000)

      // Release lock after successful start
      operationLockRef.current = false

    } catch (err) {
      debugLog('error', 'Failed to start recording', {
        name: err.name,
        message: err.message,
        stack: err.stack?.substring(0, 200)
      })
      if (err.name === 'NotAllowedError') {
        setError('Microphone access denied. Please allow microphone permission.')
      } else if (err.name === 'NotFoundError') {
        setError('No microphone found. Please connect a microphone.')
      } else {
        setError(`Failed to start recording: ${err.message}`)
      }
      await releaseWakeLock()
      // Release lock on error too
      operationLockRef.current = false
    }
  }

  // STOP RECORDING
  const stopRecording = async () => {
    debugLog('info', 'STOP RECORDING clicked')

    // CRITICAL: Prevent rapid start/stop race conditions
    if (operationLockRef.current) {
      debugLog('warning', 'Operation in progress, please wait...')
      return
    }

    if (!isRecording || !mediaRecorderRef.current) {
      debugLog('warning', 'Not recording, nothing to stop')
      return
    }

    operationLockRef.current = true

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

      debugLog('info', `Recording stopped. ${recordedChunksRef.current.length} chunks collected`)

      // Stop both streams (original and cloned)
      if (recordingStreamRef.current) {
        recordingStreamRef.current.getTracks().forEach(track => track.stop())
        recordingStreamRef.current = null
      }
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(track => track.stop())
        audioStreamRef.current = null
      }

      // Release wake lock
      await releaseWakeLock()

      // Validate we have audio data
      if (recordedChunksRef.current.length === 0) {
        debugLog('error', 'No audio chunks captured!')
        throw new Error('No audio data captured. Please try recording again.')
      }

      // Create audio blob
      const mimeType = getSupportedMimeType() || 'audio/webm'
      const audioBlob = new Blob(recordedChunksRef.current, { type: mimeType })
      const blobSizeMB = (audioBlob.size / 1024 / 1024).toFixed(2)
      const blobSizeKB = (audioBlob.size / 1024).toFixed(2)
      debugLog('info', `Audio blob created: ${blobSizeKB} KB (${blobSizeMB} MB)`, {
        type: audioBlob.type,
        chunks: recordedChunksRef.current.length
      })

      // Validate blob size (minimum 1KB)
      if (audioBlob.size < 1000) {
        debugLog('error', `Recording too short: ${audioBlob.size} bytes`)
        throw new Error('Recording too short. Please record for at least 2 seconds.')
      }

      // Mark IndexedDB session as processing
      if (audioSessionIdRef.current) {
        await StreamingAudioBuffer.completeSession(audioSessionIdRef.current, {
          uploadStatus: 'uploading'
        })
      }

      // Process with speaker diarization
      debugLog('info', 'Uploading to AssemblyAI...')
      setProcessingStatus('Uploading audio...')
      setProcessingProgress(10)

      const speakerResult = await assemblyAISpeakerService.transcribeWithSpeakers(
        audioBlob,
        {
          speakers_expected: expectedSpeakers,
          onProgress: (progress, status) => {
            setProcessingProgress(10 + (progress * 0.9)) // 10% upload, 90% processing
            setProcessingStatus(status || 'Processing...')
            // Log progress updates
            if (progress % 20 === 0) {
              debugLog('info', `AssemblyAI progress: ${progress}% - ${status}`)
            }
          }
        }
      )

      debugLog('success', 'AssemblyAI transcription complete', {
        hasText: !!speakerResult.text,
        textLength: speakerResult.text?.length || 0,
        utterances: speakerResult.utterances?.length || 0,
        speakers: speakerResult.speakers_detected || 0
      })

      // Mark session as completed
      if (audioSessionIdRef.current && speakerResult.id) {
        await StreamingAudioBuffer.markUploaded(audioSessionIdRef.current, speakerResult.id)
      }

      // Extract transcript and speaker data from this recording
      let newTranscript = ''
      let newSpeakerData = null

      if (speakerResult.utterances && speakerResult.utterances.length > 0) {
        newTranscript = speakerResult.utterances.map(u => u.text).join(' ')
        newSpeakerData = {
          ...speakerResult,
          text: newTranscript
        }
      } else if (speakerResult.text) {
        newTranscript = speakerResult.text
        newSpeakerData = speakerResult
      }

      // APPEND to existing transcript (don't replace)
      const combinedTranscript = transcript
        ? `${transcript}\n\n--- Recording ${new Date().toLocaleTimeString()} ---\n\n${newTranscript}`
        : newTranscript

      // Combine speaker data (merge utterances)
      let combinedSpeakerData = newSpeakerData
      if (speakerData && speakerData.utterances && newSpeakerData && newSpeakerData.utterances) {
        combinedSpeakerData = {
          ...newSpeakerData,
          utterances: [...speakerData.utterances, ...newSpeakerData.utterances],
          text: combinedTranscript
        }
      }

      // Update state with combined data
      setTranscript(combinedTranscript)
      setSpeakerData(combinedSpeakerData)
      setProcessingProgress(100)
      setProcessingStatus('Complete!')

      // Notify parent component with COMBINED data
      if (onTranscriptUpdate) {
        onTranscriptUpdate(combinedTranscript, combinedSpeakerData)
      }

      // Auto-save with combined transcript
      if (onAutoSave && combinedTranscript) {
        onAutoSave(combinedTranscript, 'recording_complete')
      }

      debugLog('success', 'Recording processed successfully!')

    } catch (err) {
      debugLog('error', 'PROCESSING FAILED', {
        name: err.name,
        message: err.message,
        stack: err.stack?.substring(0, 300)
      })
      setError(`Processing failed: ${err.message}`)
      setProcessingStatus('Failed')

      // Mark session as failed
      if (audioSessionIdRef.current) {
        await StreamingAudioBuffer.markUploadFailed(audioSessionIdRef.current, err.message)
      }

      // Cleanup on error
      if (recordingStreamRef.current) {
        recordingStreamRef.current.getTracks().forEach(track => track.stop())
        recordingStreamRef.current = null
      }
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(track => track.stop())
        audioStreamRef.current = null
      }
      await releaseWakeLock()

    } finally {
      setIsProcessing(false)
      mediaRecorderRef.current = null
      recordedChunksRef.current = []
      recordingStreamRef.current = null
      // CRITICAL: Always release the lock
      operationLockRef.current = false
      debugLog('info', 'Operation lock released')
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

      {/* DEBUG PANEL - Toggle button always visible */}
      <div className="mt-4">
        <button
          onClick={() => setShowDebug(!showDebug)}
          className="flex items-center gap-2 text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors w-full justify-between"
        >
          <span className="flex items-center gap-2">
            <Bug className="w-4 h-4" />
            Debug Panel ({debugLogs.length} logs)
          </span>
          {showDebug ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showDebug && (
          <div className="mt-2 bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
            {/* Debug Panel Header */}
            <div className="flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700">
              <span className="text-xs font-medium text-gray-300">Debug Logs</span>
              <button
                onClick={clearDebugLogs}
                className="flex items-center gap-1 text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                Clear
              </button>
            </div>

            {/* Debug Logs */}
            <div className="max-h-64 overflow-y-auto p-2 space-y-1 text-xs font-mono">
              {debugLogs.length === 0 ? (
                <p className="text-gray-500 text-center py-4">No logs yet</p>
              ) : (
                debugLogs.map((log) => (
                  <div
                    key={log.id}
                    className={`p-1.5 rounded ${
                      log.type === 'error' ? 'bg-red-900/50 text-red-300' :
                      log.type === 'warning' ? 'bg-yellow-900/50 text-yellow-300' :
                      log.type === 'success' ? 'bg-green-900/50 text-green-300' :
                      'bg-gray-800 text-gray-300'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-gray-500 flex-shrink-0">{log.timestamp}</span>
                      <span className={`flex-shrink-0 px-1 rounded text-[10px] uppercase ${
                        log.type === 'error' ? 'bg-red-700 text-red-100' :
                        log.type === 'warning' ? 'bg-yellow-700 text-yellow-100' :
                        log.type === 'success' ? 'bg-green-700 text-green-100' :
                        'bg-gray-700 text-gray-100'
                      }`}>
                        {log.type}
                      </span>
                      <span className="break-all">{log.message}</span>
                    </div>
                    {log.data && (
                      <pre className="mt-1 ml-16 text-[10px] text-gray-400 overflow-x-auto whitespace-pre-wrap">
                        {log.data}
                      </pre>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Device Info Footer */}
            <div className="px-3 py-2 bg-gray-800 border-t border-gray-700 text-[10px] text-gray-500">
              <div>iOS: {isIOSSafari() ? 'Yes' : 'No'} | MediaRecorder: {window.MediaRecorder ? 'Yes' : 'No'}</div>
              <div className="truncate">UA: {navigator.userAgent.substring(0, 80)}...</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default AudioRecorderSimple
