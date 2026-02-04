import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Mic, Square, CheckCircle, AlertCircle, Loader2, Upload, RefreshCw, Download } from 'lucide-react'
import StreamingAudioBuffer from '../utils/StreamingAudioBuffer'
import { uploadAndTranscribe, checkConnectivity } from '../utils/resilientUpload'

/**
 * SIMPLIFIED MOBILE RECORDER
 *
 * Design decisions for reliable iOS operation:
 * 1. NO real-time streaming (WebSocket) - just local recording
 * 2. Robust wake lock with visibility change re-acquisition
 * 3. Immediate upload after stop recording (before iOS suspends)
 * 4. Retry logic for network failures
 * 5. Save transcript ID to both localStorage AND callback for Firestore
 * 6. Persist audio to IndexedDB BEFORE upload (crash recovery)
 * 7. Upload with progress tracking and timeout (90s)
 * 8. "Save to Device" download button as fallback
 *
 * AssemblyAI Requirements:
 * - Max file size: 2.2GB
 * - Max duration: 10 hours
 * - Min duration: 160ms
 * - Supported formats: webm, mp4, wav, mp3, etc.
 */

// Wake Lock Manager with visibility change detection
const wakeLockManager = {
  wakeLock: null,
  isSupported: typeof navigator !== 'undefined' && 'wakeLock' in navigator,

  async request() {
    if (!this.isSupported) {
      console.log('Wake Lock: Not supported')
      return false
    }

    try {
      // Release existing lock first
      if (this.wakeLock) {
        await this.release()
      }

      this.wakeLock = await navigator.wakeLock.request('screen')
      console.log('Wake Lock: ACQUIRED - screen will stay awake')

      this.wakeLock.addEventListener('release', () => {
        console.log('Wake Lock: Released by system')
        this.wakeLock = null
      })

      return true
    } catch (err) {
      console.warn('Wake Lock: Failed to acquire -', err.message)
      return false
    }
  },

  async release() {
    try {
      if (this.wakeLock) {
        await this.wakeLock.release()
        this.wakeLock = null
        console.log('Wake Lock: Released manually')
      }
    } catch (err) {
      console.warn('Wake Lock: Release error -', err.message)
    }
  },

  isActive() {
    return this.wakeLock !== null && !this.wakeLock.released
  }
}

const MobileRecorder = ({
  onRecordingComplete,  // Called with { transcriptId, audioSize, duration }
  onError,              // Called with error message
  className = ''
}) => {
  // Recording state
  const [isRecording, setIsRecording] = useState(false)
  const [duration, setDuration] = useState(0)
  const [audioBlob, setAudioBlob] = useState(null)

  // Upload state
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [uploadError, setUploadError] = useState(null)
  const [transcriptId, setTranscriptId] = useState(null)

  // Wake lock state
  const [wakeLockActive, setWakeLockActive] = useState(false)

  // Refs
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const streamRef = useRef(null)
  const timerRef = useRef(null)
  const startTimeRef = useRef(null)
  const audioSessionIdRef = useRef(null)

  // Get AssemblyAI API key
  const apiKey = import.meta.env.VITE_ASSEMBLYAI_API_KEY

  // Re-acquire wake lock on visibility change (iOS specific)
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && isRecording) {
        console.log('App became visible while recording - re-acquiring wake lock')
        const success = await wakeLockManager.request()
        setWakeLockActive(success)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [isRecording])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      wakeLockManager.release()
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
    }
  }, [])

  // Format duration as MM:SS
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Get file extension from MIME type
  const getFileExtension = (mimeType) => {
    if (mimeType && mimeType.includes('mp4')) return '.mp4'
    return '.webm'
  }

  // Start recording
  const startRecording = async () => {
    try {
      setUploadError(null)
      setTranscriptId(null)
      setAudioBlob(null)
      chunksRef.current = []
      setDuration(0)
      audioSessionIdRef.current = null

      // Step 1: Acquire wake lock FIRST
      console.log('Step 1: Acquiring wake lock...')
      const wakeLockSuccess = await wakeLockManager.request()
      setWakeLockActive(wakeLockSuccess)

      if (!wakeLockSuccess) {
        console.warn('Wake lock not available - screen may turn off during recording')
      }

      // Step 2: Get microphone access
      console.log('Step 2: Getting microphone access...')
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000
        }
      })
      streamRef.current = stream

      // Step 3: Create MediaRecorder
      console.log('Step 3: Creating MediaRecorder...')
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4' // Fallback for iOS Safari

      console.log(`Using MIME type: ${mimeType}`)

      const recorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 128000
      })
      mediaRecorderRef.current = recorder

      // Collect audio chunks
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
          const totalSize = chunksRef.current.reduce((acc, chunk) => acc + chunk.size, 0)
          console.log(`Chunk: ${(event.data.size / 1024).toFixed(1)} KB (Total: ${(totalSize / 1024 / 1024).toFixed(2)} MB)`)
        }
      }

      // Handle recording stop
      recorder.onstop = async () => {
        console.log('MediaRecorder stopped')
        const blob = new Blob(chunksRef.current, { type: mimeType })
        console.log(`Final audio: ${(blob.size / 1024 / 1024).toFixed(2)} MB`)
        setAudioBlob(blob)

        // PERSIST to IndexedDB BEFORE uploading (crash recovery)
        try {
          const sessionId = await StreamingAudioBuffer.startSession({
            audioSource: 'mobile-microphone',
            mimeType: mimeType,
            sampleRate: 16000
          })
          audioSessionIdRef.current = sessionId
          await StreamingAudioBuffer.saveCompleteBlob(sessionId, blob)
          console.log('Audio persisted to IndexedDB:', sessionId)
        } catch (err) {
          console.warn('Failed to persist audio to IndexedDB (non-fatal):', err)
        }

        // Immediately start upload (before iOS can suspend)
        uploadAudio(blob)
      }

      recorder.onerror = (event) => {
        console.error('MediaRecorder error:', event.error)
        handleError('Recording error: ' + event.error?.message)
      }

      // Start recording - collect data every second
      recorder.start(1000)
      setIsRecording(true)
      startTimeRef.current = Date.now()

      // Start duration timer
      timerRef.current = setInterval(() => {
        setDuration(prev => prev + 1)
      }, 1000)

      console.log('Recording started!')

    } catch (error) {
      console.error('Failed to start recording:', error)
      handleError('Failed to start recording: ' + error.message)
      wakeLockManager.release()
      setWakeLockActive(false)
    }
  }

  // Stop recording
  const stopRecording = useCallback(() => {
    console.log('Stopping recording...')

    // Stop timer
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    // Stop MediaRecorder (this triggers ondataavailable and onstop)
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }

    // Stop audio stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }

    setIsRecording(false)
    // Keep wake lock active during upload - release after upload completes
  }, [])

  // Upload audio to AssemblyAI with resilient upload
  const uploadAudio = async (blob, retryCount = 0) => {
    const MAX_RETRIES = 3

    if (!apiKey || apiKey === 'your_api_key_here') {
      handleError('AssemblyAI API key not configured')
      return
    }

    // Validate blob
    if (!blob || blob.size === 0) {
      handleError('No audio data to upload')
      return
    }

    // Check minimum duration (160ms ~ 500 bytes at minimum)
    if (blob.size < 500) {
      handleError('Recording too short (minimum ~160ms required)')
      return
    }

    // Check maximum file size (2.2GB)
    const MAX_SIZE = 2.2 * 1024 * 1024 * 1024
    if (blob.size > MAX_SIZE) {
      handleError(`File too large (${(blob.size / 1024 / 1024 / 1024).toFixed(2)} GB). Maximum is 2.2 GB`)
      return
    }

    // Connectivity check
    if (!checkConnectivity()) {
      handleError('No internet connection. Please check your network and try again.')
      return
    }

    try {
      setIsUploading(true)
      setUploadError(null)
      setUploadProgress('Uploading audio...')

      console.log(`Uploading audio (attempt ${retryCount + 1}/${MAX_RETRIES + 1}):`, {
        size: `${(blob.size / 1024 / 1024).toFixed(2)} MB`,
        type: blob.type
      })

      // Use resilient upload with progress tracking and timeout
      const { transcriptId: id } = await uploadAndTranscribe(blob, apiKey, {
        uploadTimeoutMs: 90000,
        transcriptTimeoutMs: 30000,
        onUploadProgress: (progress) => {
          const loadedMB = (progress.loaded / 1024 / 1024).toFixed(1)
          const totalMB = (progress.total / 1024 / 1024).toFixed(1)
          setUploadProgress(`Uploading: ${loadedMB} / ${totalMB} MB (${progress.percent}%)`)
        },
        speakerLabels: true,
        speakersExpected: null
      })

      console.log('Transcription job created:', id)

      // Save transcript ID to localStorage for recovery
      const recordData = {
        id,
        createdAt: new Date().toISOString(),
        audioSize: blob.size,
        duration: duration,
        status: 'processing'
      }
      localStorage.setItem('latest_assemblyai_transcript_id', id)
      localStorage.setItem(`assemblyai_transcript_${id}`, JSON.stringify(recordData))
      console.log('TRANSCRIPT ID SAVED:', id)

      // Mark IndexedDB session as uploaded
      if (audioSessionIdRef.current) {
        await StreamingAudioBuffer.markUploaded(audioSessionIdRef.current, id)
      }

      setTranscriptId(id)
      setUploadProgress('Processing... (this may take a few minutes)')
      setIsUploading(false)

      // Notify parent component
      if (onRecordingComplete) {
        onRecordingComplete({
          transcriptId: id,
          audioSize: blob.size,
          duration: duration
        })
      }

    } catch (error) {
      console.error(`Upload failed (attempt ${retryCount + 1}):`, error)

      if (retryCount < MAX_RETRIES) {
        console.log(`Retrying upload in 2 seconds...`)
        setUploadProgress(`Upload failed, retrying (${retryCount + 1}/${MAX_RETRIES})...`)
        await new Promise(resolve => setTimeout(resolve, 2000))
        return uploadAudio(blob, retryCount + 1)
      }

      // Mark IndexedDB session as failed
      if (audioSessionIdRef.current) {
        await StreamingAudioBuffer.markUploadFailed(audioSessionIdRef.current, error.message)
      }

      setIsUploading(false)
      setUploadError(error.message)
      wakeLockManager.release()
      setWakeLockActive(false)

      if (onError) {
        onError(error.message)
      }
    }
  }

  // Handle errors
  const handleError = (message) => {
    console.error('MobileRecorder error:', message)
    setUploadError(message)
    setIsRecording(false)
    setIsUploading(false)
    wakeLockManager.release()
    setWakeLockActive(false)

    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    if (onError) {
      onError(message)
    }
  }

  // Retry upload - recover from IndexedDB if audioBlob is null (page was refreshed)
  const retryUpload = async () => {
    let blob = audioBlob

    if (!blob && audioSessionIdRef.current) {
      try {
        blob = await StreamingAudioBuffer.reconstructAudio(audioSessionIdRef.current)
        if (blob) {
          setAudioBlob(blob)
          console.log('Recovered audio from IndexedDB for retry')
        }
      } catch (err) {
        console.error('Failed to recover audio from IndexedDB:', err)
      }
    }

    if (blob) {
      uploadAudio(blob)
    } else {
      handleError('No audio data available for retry. The recording may have been lost.')
    }
  }

  // Download audio to device
  const downloadAudio = () => {
    if (!audioBlob) return

    try {
      const url = URL.createObjectURL(audioBlob)
      const a = document.createElement('a')
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const ext = getFileExtension(audioBlob.type)
      a.href = url
      a.download = `recording-${timestamp}${ext}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      console.log('Audio downloaded to device')
    } catch (err) {
      console.error('Failed to download audio:', err)
      handleError('Failed to save audio to device: ' + err.message)
    }
  }

  // Check if API key is configured
  if (!apiKey || apiKey === 'your_api_key_here') {
    return (
      <div className={`bg-red-50 border border-red-200 rounded-lg p-4 ${className}`}>
        <div className="flex items-center gap-2 text-red-700">
          <AlertCircle className="w-5 h-5" />
          <span className="font-medium">AssemblyAI API key not configured</span>
        </div>
        <p className="text-sm text-red-600 mt-2">
          Add VITE_ASSEMBLYAI_API_KEY to your .env file
        </p>
      </div>
    )
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Wake Lock Status - More prominent during upload */}
      {wakeLockActive && (isUploading || transcriptId) && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-sm text-green-700 font-medium">Screen will stay awake</span>
          </div>
          <p className="text-xs text-green-600 mt-1 ml-4">
            {isUploading ? 'Keep this screen open until upload completes' : 'Processing your recording...'}
          </p>
        </div>
      )}

      {/* Recording Controls */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
        <div className="flex flex-col items-center">
          {/* Main Button */}
          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isUploading}
            className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-200 ${
              isRecording
                ? 'bg-red-500 hover:bg-red-600 shadow-lg animate-pulse'
                : isUploading
                  ? 'bg-gray-300 cursor-not-allowed'
                  : 'bg-indigo-500 hover:bg-indigo-600 shadow-md'
            }`}
          >
            {isUploading ? (
              <Loader2 className="w-8 h-8 text-white animate-spin" />
            ) : isRecording ? (
              <Square className="w-8 h-8 text-white" />
            ) : (
              <Mic className="w-8 h-8 text-white" />
            )}
          </button>

          {/* Status */}
          <div className="mt-4 text-center">
            {isRecording ? (
              <>
                <p className="text-2xl font-mono font-bold text-gray-900">
                  {formatDuration(duration)}
                </p>
                <div className="flex items-center justify-center gap-2 mt-2">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                  <p className="text-sm text-red-600 font-medium">RECORDING</p>
                </div>
              </>
            ) : isUploading ? (
              <>
                <div className="flex items-center justify-center gap-2">
                  <Upload className="w-4 h-4 text-indigo-600" />
                  <p className="text-sm text-indigo-600 font-medium">Uploading...</p>
                </div>
                <p className="text-xs text-gray-500 mt-1">{uploadProgress}</p>
              </>
            ) : transcriptId ? (
              <>
                <div className="flex items-center justify-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <p className="text-sm text-green-600 font-medium">Upload Complete!</p>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Transcript ID: {transcriptId.slice(0, 12)}...
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-600">Tap to start recording</p>
            )}
          </div>
        </div>
      </div>

      {/* Save to Device Button - visible when audio exists and not recording */}
      {audioBlob && !isRecording && (
        <div className="flex justify-center">
          <button
            onClick={downloadAudio}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-700 transition-colors"
          >
            <Download className="w-4 h-4" />
            Save to Device ({(audioBlob.size / 1024 / 1024).toFixed(1)} MB)
          </button>
        </div>
      )}

      {/* Error Display */}
      {uploadError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-red-700 font-medium">Upload Failed</p>
              <p className="text-xs text-red-600 mt-1">{uploadError}</p>
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={retryUpload}
                  className="flex items-center gap-1 px-3 py-1 bg-red-100 hover:bg-red-200 rounded text-sm text-red-700 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  Retry Upload
                </button>
                {audioBlob && (
                  <button
                    onClick={downloadAudio}
                    className="flex items-center gap-1 px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded text-sm text-gray-700 transition-colors"
                  >
                    <Download className="w-3 h-3" />
                    Save Audio
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Instructions */}
      {!isRecording && !isUploading && !transcriptId && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-900 mb-2">How it works:</h4>
          <ol className="text-xs text-gray-600 space-y-1 list-decimal list-inside">
            <li>Tap the microphone to start recording</li>
            <li>Keep the app open during recording</li>
            <li>Tap stop when done - upload starts automatically</li>
            <li>Transcript will be available on your desktop</li>
          </ol>
        </div>
      )}

      {/* Debug Info (only in development) */}
      {import.meta.env.DEV && (
        <div className="text-xs text-gray-400 p-2 bg-gray-50 rounded">
          <p>Wake Lock: {wakeLockManager.isSupported ? 'Supported' : 'Not supported'}</p>
          <p>Active: {wakeLockActive ? 'Yes' : 'No'}</p>
          {audioBlob && <p>Audio: {(audioBlob.size / 1024 / 1024).toFixed(2)} MB</p>}
          {audioSessionIdRef.current && <p>Session: {audioSessionIdRef.current}</p>}
        </div>
      )}
    </div>
  )
}

export default MobileRecorder
