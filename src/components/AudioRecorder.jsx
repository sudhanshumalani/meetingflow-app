import React, { useState, useEffect, useRef } from 'react'
import { Mic, MicOff, Square, Volume2, Settings, ChevronDown, Users, Loader2 } from 'lucide-react'
import assemblyAIService from '../services/assemblyAIService'
import assemblyAISpeakerService from '../services/assemblyAISpeakerService'

const AudioRecorder = ({ onTranscriptUpdate, onAutoSave, className = '', disabled = false }) => {
  const [isInitialized, setIsInitialized] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [interimText, setInterimText] = useState('')
  const [error, setError] = useState(null)
  const [permissions, setPermissions] = useState('unknown')
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingProgress, setProcessingProgress] = useState(0)

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
  const mediaRecorderRef = useRef(null) // For speaker diarization recording
  const recordedChunksRef = useRef([]) // For speaker diarization audio chunks

  // Mobile lifecycle management
  const [wakeLock, setWakeLock] = useState(null)

  // Speaker diarization state
  const [enableSpeakerDiarization, setEnableSpeakerDiarization] = useState(false) // OFF by default for safety
  const [expectedSpeakers, setExpectedSpeakers] = useState(null) // Auto-detect if null
  const [isProcessingSpeakers, setIsProcessingSpeakers] = useState(false)
  const [speakerData, setSpeakerData] = useState(null)
  const accumulatedUtterancesRef = useRef([]) // Store all speaker utterances across sessions

  // Initialize service on mount
  useEffect(() => {
    const initService = async () => {
      try {
        if (!assemblyAIService.isConfigured()) {
          setError('AssemblyAI API key not configured. Please add VITE_ASSEMBLYAI_API_KEY to your .env file.')
          console.error('❌ AssemblyAI not configured')
          return
        }
        setIsInitialized(true)
        console.log('🎯 AssemblyAI transcription service ready')
      } catch (error) {
        console.error('Failed to initialize transcription:', error)
        setError('Failed to initialize audio transcription.')
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
      // Backward compatible: send both transcript and speaker data (if available)
      onTranscriptUpdate(currentTranscript, speakerData)
    }
  }, [transcript, speakerData, onTranscriptUpdate])

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

  // Mobile wake lock management
  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        const lock = await navigator.wakeLock.request('screen')
        setWakeLock(lock)
        console.log('🔒 Wake lock acquired - screen will stay on during recording')

        lock.addEventListener('release', () => {
          console.log('🔓 Wake lock released')
          setWakeLock(null)
        })
      }
    } catch (error) {
      console.warn('Wake lock request failed:', error)
    }
  }

  const releaseWakeLock = async () => {
    if (wakeLock) {
      try {
        await wakeLock.release()
        setWakeLock(null)
        console.log('🔓 Wake lock manually released')
      } catch (error) {
        console.warn('Wake lock release failed:', error)
      }
    }
  }

  // Handle app going to background on mobile
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && isRecording) {
        console.log('📱 App went to background during recording - auto-saving transcript')
        handleAutoSave('background')
      } else if (!document.hidden && isRecording) {
        console.log('📱 App returned to foreground during recording')
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [isRecording])

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

      // Request wake lock to prevent screen from turning off on mobile
      await requestWakeLock()

      // Handle different audio source modes
      if (selectedAudioSource === 'tabAudio') {
        // Tab Audio Only - Real-time streaming transcription (with optional speaker diarization)
        try {
          const displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: true, // Required by Chrome to get audio
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              sampleRate: 16000
            }
          })

          console.log('🖥️ Tab audio stream captured successfully')
          setTranscript(persistentTranscriptRef.current + '\n[Streaming tab audio - real-time transcription]\n')

          // Store the stream for cleanup
          window.currentTabStream = displayStream

          // If speaker diarization enabled, also record the audio
          if (enableSpeakerDiarization) {
            console.log('🎙️ Tab audio: Starting recording for speaker diarization')
            recordedChunksRef.current = []

            const audioTrack = displayStream.getAudioTracks()[0]
            if (audioTrack) {
              const audioStream = new MediaStream([audioTrack])
              const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : 'audio/webm'

              mediaRecorderRef.current = new MediaRecorder(audioStream, { mimeType, audioBitsPerSecond: 128000 })

              mediaRecorderRef.current.ondataavailable = (event) => {
                if (event.data.size > 0) {
                  recordedChunksRef.current.push(event.data)
                }
              }

              mediaRecorderRef.current.start(1000)
              console.log('✅ Tab audio recording started for speaker processing')
            }
          }

          // Start real-time streaming transcription for tab audio
          await assemblyAIService.startTabAudioStreaming(displayStream, {
            onTranscript: (text, isFinal) => {
              console.log('🖥️ Tab audio transcript:', {
                text: text?.substring(0, 50),
                isFinal,
                length: text?.length
              })

              if (isFinal && text.trim()) {
                if (enableSpeakerDiarization) {
                  // During speaker mode, just show the transcript without persisting
                  // The speaker processing will handle persistence after stop
                  const tempTranscript = persistentTranscriptRef.current + text + ' '
                  setTranscript(tempTranscript)
                } else {
                  // Normal mode: persist immediately
                  persistentTranscriptRef.current += text + ' '
                  setTranscript(persistentTranscriptRef.current)
                  console.log('📱 Final tab transcript added, total length:', persistentTranscriptRef.current.length)
                }
              } else if (text) {
                // Show interim text
                setInterimText(text)
                setTranscript(persistentTranscriptRef.current)
              }
            },
            onError: (error) => {
              console.error('❌ Tab audio streaming error:', error)
              setError(error.message)
              setIsRecording(false)

              // Stop the tab stream on error
              if (displayStream) {
                displayStream.getTracks().forEach(track => track.stop())
              }
            },
            onClose: () => {
              console.log('🔌 Tab audio streaming connection closed')
              setIsRecording(false)
              handleAutoSave('recording_ended')

              // Stop the tab stream when connection closes
              if (displayStream) {
                displayStream.getTracks().forEach(track => track.stop())
              }
            }
          })

          console.log('✅ Tab audio real-time streaming started')
        } catch (err) {
          console.error('Failed to capture tab audio:', err)
          setError('Failed to capture tab audio. Make sure you selected "Share audio" when prompted.')
          throw err
        }
      } else if (selectedAudioSource === 'mixed') {
        // Hybrid Mode - Both tab and microphone real-time streaming
        try {
          // First get tab audio
          const displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              sampleRate: 16000
            }
          })

          console.log('🎙️ Hybrid mode: Tab audio captured')
          window.currentTabStream = displayStream

          // If speaker diarization enabled, also record the tab audio
          if (enableSpeakerDiarization) {
            console.log('🎙️ Hybrid mode: Starting recording for speaker diarization')
            recordedChunksRef.current = []

            const audioTrack = displayStream.getAudioTracks()[0]
            if (audioTrack) {
              const audioStream = new MediaStream([audioTrack])
              const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : 'audio/webm'

              mediaRecorderRef.current = new MediaRecorder(audioStream, { mimeType, audioBitsPerSecond: 128000 })

              mediaRecorderRef.current.ondataavailable = (event) => {
                if (event.data.size > 0) {
                  recordedChunksRef.current.push(event.data)
                }
              }

              mediaRecorderRef.current.start(1000)
              console.log('✅ Hybrid mode recording started for speaker processing (tab audio)')
            }
          }

          // Start real-time tab audio streaming
          await assemblyAIService.startTabAudioStreaming(displayStream, {
            onTranscript: (text, isFinal) => {
              console.log('🖥️ [Hybrid] Tab transcript:', { text: text?.substring(0, 30), isFinal })

              if (isFinal && text.trim()) {
                if (enableSpeakerDiarization) {
                  // During speaker mode, just show without persisting
                  const tempTranscript = persistentTranscriptRef.current + `[Tab] ${text} `
                  setTranscript(tempTranscript)
                } else {
                  // Normal mode: persist with [Tab] prefix
                  persistentTranscriptRef.current += `[Tab] ${text} `
                  setTranscript(persistentTranscriptRef.current)
                }
              } else if (text) {
                setInterimText(`[Tab] ${text}`)
                setTranscript(persistentTranscriptRef.current)
              }
            },
            onError: (error) => {
              console.error('❌ Hybrid tab audio error:', error)
              setError(`Tab audio: ${error.message}`)
            },
            onClose: () => {
              console.log('🔌 Hybrid tab audio connection closed')
            }
          })

          // Then get microphone access and start real-time transcription
          const micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              sampleRate: 16000
            }
          })

          setTranscript(persistentTranscriptRef.current + '\n[Hybrid Mode: Streaming both tab + mic audio]\n')

          // Note: This creates a second WebSocket connection
          // Both tab and mic audio stream simultaneously to AssemblyAI
          await assemblyAIService.startRealtimeTranscription(micStream, {
            onTranscript: (text, isFinal) => {
              console.log('🎙️ [Hybrid] Mic transcript:', { text: text?.substring(0, 30), isFinal })

              if (isFinal && text.trim()) {
                if (enableSpeakerDiarization) {
                  // During speaker mode, just show without persisting
                  const tempTranscript = persistentTranscriptRef.current + `[Mic] ${text} `
                  setTranscript(tempTranscript)
                } else {
                  // Normal mode: persist with [Mic] prefix
                  persistentTranscriptRef.current += `[Mic] ${text} `
                  setTranscript(persistentTranscriptRef.current)
                }
              } else if (text) {
                setInterimText(`[Mic] ${text}`)
                setTranscript(persistentTranscriptRef.current)
              }
            },
            onError: (error) => {
              console.error('❌ Hybrid mode microphone error:', error)
              setError(`Microphone: ${error.message}`)
              setIsRecording(false)

              // Stop the mic stream on error
              if (micStream) {
                micStream.getTracks().forEach(track => track.stop())
              }
            },
            onClose: () => {
              console.log('🔌 Hybrid mode microphone connection closed')

              // Stop the mic stream when connection closes
              if (micStream) {
                micStream.getTracks().forEach(track => track.stop())
              }
            }
          })

          console.log('✅ Hybrid mode fully initialized: Tab streaming + Mic streaming')
        } catch (err) {
          console.error('Failed to start hybrid mode:', err)
          setError('Failed to start hybrid mode. Make sure you granted both screen sharing and microphone permissions.')
          throw err
        }
      } else {
        // Microphone Only - Choose between speaker mode or regular mode
        const micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 16000
          }
        })

        // Use hybrid mode with speaker diarization if enabled
        if (enableSpeakerDiarization) {
          console.log('🎙️ Starting with speaker diarization enabled')

          await assemblyAISpeakerService.startHybridTranscription(
            micStream,
            {
              speakers_expected: expectedSpeakers,
              enable_speaker_labels: true
            },
            {
              // Real-time transcript (no speakers, instant feedback)
              // Note: When speaker diarization is enabled, we show real-time preview
              // but don't persist it - speaker processing will provide the final transcript
              onRealtimeTranscript: (text, isFinal) => {
                if (isFinal && text.trim()) {
                  // During speaker mode, just show the transcript without persisting
                  // The speaker processing will handle persistence after stop
                  const tempTranscript = persistentTranscriptRef.current + text + ' '
                  setTranscript(tempTranscript)
                } else if (text) {
                  setInterimText(text)
                }
              },

              // Speaker diarization result (after recording stops)
              onSpeakerTranscript: (data) => {
                console.log('✅ Received speaker data:', data)

                // Accumulate speaker utterances across sessions
                if (data.utterances && data.utterances.length > 0) {
                  accumulatedUtterancesRef.current = [...accumulatedUtterancesRef.current, ...data.utterances]

                  // Create merged speaker data with all accumulated utterances
                  const mergedSpeakerData = {
                    ...data,
                    utterances: accumulatedUtterancesRef.current,
                    text: accumulatedUtterancesRef.current.map(u => u.text).join(' ')
                  }

                  console.log('📝 Accumulated utterances:', accumulatedUtterancesRef.current.length)
                  setSpeakerData(mergedSpeakerData)
                  setTranscript(mergedSpeakerData.text)
                  persistentTranscriptRef.current = mergedSpeakerData.text
                } else {
                  // Fallback if no utterances (shouldn't happen but be safe)
                  persistentTranscriptRef.current += ' ' + data.text
                  setTranscript(persistentTranscriptRef.current)
                  setSpeakerData(data)
                }

                setIsProcessingSpeakers(false)
              },

              onError: (error) => {
                console.error('❌ Speaker diarization error:', error)
                setError(error.message)
                setIsRecording(false)
                setIsProcessingSpeakers(false)

                if (micStream) {
                  micStream.getTracks().forEach(track => track.stop())
                }
              },

              onClose: () => {
                console.log('🔌 Speaker diarization connection closed')
              }
            }
          )
        } else {
          // Regular real-time transcription (no speakers)
          await assemblyAIService.startRealtimeTranscription(micStream, {
            onTranscript: (text, isFinal) => {
              console.log('🎤 AssemblyAI transcript:', {
                text: text?.substring(0, 50),
                isFinal,
                length: text?.length,
                persistentLength: persistentTranscriptRef.current.length
              })

              if (isFinal && text.trim()) {
                persistentTranscriptRef.current += text + ' '
                setTranscript(persistentTranscriptRef.current)
                console.log('📱 Final transcript added, total length:', persistentTranscriptRef.current.length)
              } else if (text) {
                // Show interim text alongside persistent content
                setInterimText(text)
                setTranscript(persistentTranscriptRef.current)
              }
            },
            onError: (error) => {
              console.error('❌ AssemblyAI error:', error)
              setError(error.message)
              setIsRecording(false)

              // Stop the mic stream on error
              if (micStream) {
                micStream.getTracks().forEach(track => track.stop())
              }
            },
            onClose: () => {
              console.log('🔌 AssemblyAI connection closed')
              setIsRecording(false)
              handleAutoSave('recording_ended')

              // Stop the mic stream when connection closes
              if (micStream) {
                micStream.getTracks().forEach(track => track.stop())
              }
            }
          })
        }
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

      // If speaker diarization is enabled, trigger processing
      if (enableSpeakerDiarization) {
        console.log('🛑 Stopping with speaker diarization processing...')
        setIsProcessingSpeakers(true)

        if (selectedAudioSource === 'microphone') {
          // Microphone mode uses hybrid service
          await assemblyAISpeakerService.stopHybridTranscription()
        } else {
          // Tab audio or hybrid mode - stop MediaRecorder and process
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop()

            // Wait a bit for onstop to process
            mediaRecorderRef.current.onstop = async () => {
              try {
                const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                  ? 'audio/webm;codecs=opus'
                  : 'audio/webm'
                const audioBlob = new Blob(recordedChunksRef.current, { type: mimeType })
                console.log(`📦 Recorded audio blob: ${(audioBlob.size / 1024 / 1024).toFixed(2)} MB`)

                // Process with speaker diarization
                const speakerData = await assemblyAISpeakerService.transcribeWithSpeakers(audioBlob, {
                  speakers_expected: expectedSpeakers
                })

                console.log('✅ Speaker diarization complete:', speakerData)

                // Accumulate speaker utterances across sessions
                if (speakerData.utterances && speakerData.utterances.length > 0) {
                  accumulatedUtterancesRef.current = [...accumulatedUtterancesRef.current, ...speakerData.utterances]

                  // Create merged speaker data with all accumulated utterances
                  const mergedSpeakerData = {
                    ...speakerData,
                    utterances: accumulatedUtterancesRef.current,
                    text: accumulatedUtterancesRef.current.map(u => u.text).join(' ')
                  }

                  console.log('📝 Accumulated utterances:', accumulatedUtterancesRef.current.length)
                  setSpeakerData(mergedSpeakerData)
                  setTranscript(mergedSpeakerData.text)
                  persistentTranscriptRef.current = mergedSpeakerData.text

                  // Update parent with accumulated data
                  if (onTranscriptUpdate) {
                    onTranscriptUpdate(mergedSpeakerData.text, mergedSpeakerData)
                  }
                } else {
                  // Fallback if no utterances
                  persistentTranscriptRef.current += ' ' + speakerData.text
                  setTranscript(persistentTranscriptRef.current)
                  setSpeakerData(speakerData)

                  if (onTranscriptUpdate) {
                    onTranscriptUpdate(persistentTranscriptRef.current, speakerData)
                  }
                }

                setIsProcessingSpeakers(false)
              } catch (error) {
                console.error('❌ Speaker diarization failed:', error)
                setError('Speaker identification failed. Showing plain transcript.')
                setIsProcessingSpeakers(false)
              }
            }
          }

          // Stop regular real-time transcription
          assemblyAIService.stopRealtimeTranscription()
        }
      } else {
        // No speaker diarization - just stop regular transcription
        assemblyAIService.stopRealtimeTranscription()
      }

      // Stop tab audio stream if it exists
      if (window.currentTabStream) {
        window.currentTabStream.getTracks().forEach(track => {
          track.stop()
          console.log('🖥️ Stopped tab audio track:', track.kind)
        })
        window.currentTabStream = null
      }

      // Ensure we have the best available transcript (unless speaker processing is happening)
      if (!isProcessingSpeakers) {
        const bestTranscript = persistentTranscriptRef.current || transcript || interimText
        setTranscript(bestTranscript)
      }

      setIsRecording(false)

      // Release wake lock
      await releaseWakeLock()

      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }

      // Clean up MediaRecorder if not processing speakers
      if (!enableSpeakerDiarization && mediaRecorderRef.current) {
        if (mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop()
        }
        mediaRecorderRef.current = null
        recordedChunksRef.current = []
      }

      console.log('🛑 Recording stopped - transcript preserved:', {
        length: transcript.length,
        words: transcript.split(' ').filter(w => w.trim()).length,
        preview: transcript.substring(0, 50) + '...',
        speakerMode: enableSpeakerDiarization
      })
    } catch (error) {
      console.error('Failed to stop recording:', error)
      setError(error.message)
      handleAutoSave('stop_error')
      setIsProcessingSpeakers(false)

      // Always try to release wake lock even on error
      await releaseWakeLock()

      // Clean up MediaRecorder
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
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
    accumulatedUtterancesRef.current = []
    setSpeakerData(null)

    console.log('🧹 All transcript storage cleared - starting fresh')

    if (onTranscriptUpdate) {
      onTranscriptUpdate('', null)
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
              <div className="text-blue-800 font-medium mb-2">📺 Tab Audio Real-Time Streaming</div>
              <div className="text-blue-700 space-y-1">
                <div>• Select a browser tab (YouTube, Zoom, Meet, etc.)</div>
                <div>• Real-time transcription (~300ms latency)</div>
                <div>• See transcripts as the meeting happens</div>
              </div>
            </div>
          )}

          {selectedAudioSource === 'mixed' && (
            <div className="mt-2 p-2 bg-purple-50 border border-purple-200 rounded text-xs text-purple-800">
              🎙️ <strong>Hybrid Mode:</strong> Real-time transcription for BOTH tab audio + microphone simultaneously. Transcripts labeled [Tab] and [Mic].
            </div>
          )}
        </div>

        {/* Speaker Diarization Settings (all audio modes) */}
        <div className="mb-4 p-3 bg-gradient-to-r from-green-50 to-blue-50 rounded-lg border border-green-200">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-green-600" />
                <label className="text-sm font-medium text-gray-900">
                  Speaker Identification
                </label>
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                  NEW
                </span>
              </div>
              <button
                onClick={() => setEnableSpeakerDiarization(!enableSpeakerDiarization)}
                disabled={isRecording}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  enableSpeakerDiarization ? 'bg-green-600' : 'bg-gray-300'
                } ${isRecording ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                title="Toggle speaker identification"
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    enableSpeakerDiarization ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {enableSpeakerDiarization && (
              <div className="space-y-2">
                <p className="text-xs text-gray-600 mb-2">
                  💡 Identifies who said what after recording. Processing takes 10-30 seconds.
                </p>

                <div>
                  <label className="text-xs text-gray-700 block mb-1">
                    Expected Number of Speakers (optional)
                  </label>
                  <select
                    value={expectedSpeakers || ''}
                    onChange={(e) => setExpectedSpeakers(e.target.value ? parseInt(e.target.value) : null)}
                    disabled={isRecording}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 disabled:opacity-50"
                  >
                    <option value="">Auto-detect</option>
                    <option value="2">2 speakers</option>
                    <option value="3">3 speakers</option>
                    <option value="4">4 speakers</option>
                    <option value="5">5 speakers</option>
                    <option value="6">6+ speakers</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Hint improves accuracy if you know the number
                  </p>
                </div>
              </div>
            )}

            {!enableSpeakerDiarization && (
              <p className="text-xs text-gray-600">
                Enable to identify different speakers in your recording
              </p>
            )}

            {/* Info for different modes */}
            {enableSpeakerDiarization && selectedAudioSource === 'tabAudio' && (
              <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
                💡 Perfect for Zoom/Teams calls! Records tab audio and identifies speakers after recording.
              </div>
            )}
            {enableSpeakerDiarization && selectedAudioSource === 'mixed' && (
              <div className="mt-2 p-2 bg-purple-50 border border-purple-200 rounded text-xs text-purple-700">
                💡 Hybrid mode with speakers! Records tab audio (Zoom/Teams) and identifies speakers. Your mic provides real-time feedback.
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

      {/* Processing Indicator */}
      {isProcessing && (
        <div className="bg-purple-50 rounded-lg border border-purple-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-purple-700 font-medium text-sm">
              🔄 Transcribing Tab Audio...
            </div>
            <span className="text-purple-600 text-xs font-mono">
              {Math.round(processingProgress)}%
            </span>
          </div>
          <div className="w-full bg-purple-200 rounded-full h-2 overflow-hidden">
            <div
              className="bg-purple-600 h-full transition-all duration-300 ease-out"
              style={{ width: `${processingProgress}%` }}
            />
          </div>
          <p className="text-xs text-purple-600 mt-2">
            Please wait while we process your recording...
          </p>
        </div>
      )}

      {/* Speaker Processing Indicator */}
      {isProcessingSpeakers && (
        <div className="bg-green-50 rounded-lg border border-green-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-green-700 font-medium text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Identifying Speakers...</span>
            </div>
          </div>
          <div className="w-full bg-green-200 rounded-full h-2 overflow-hidden">
            <div className="bg-green-600 h-full animate-pulse" style={{ width: '60%' }} />
          </div>
          <p className="text-xs text-green-700 mt-2">
            Processing speaker diarization. This takes 10-30 seconds...
          </p>
        </div>
      )}

      {/* Recording Status when no transcript */}
      {!transcript && isRecording && !isProcessing && (
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
          🎯 AssemblyAI Real-time • Persistent transcript accumulation • 📱 Mobile optimized
          {enableSpeakerDiarization && ' • 👥 Speaker identification enabled'}
        </p>
        <p className="text-xs text-gray-400">
          Transcripts accumulate across sessions - works reliably across all devices
        </p>
      </div>
    </div>
  )
}

export default AudioRecorder