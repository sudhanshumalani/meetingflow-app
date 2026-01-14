/**
 * AssemblyAI Speaker Diarization Service (PROTOTYPE)
 * Extends the base AssemblyAI service with speaker identification capabilities
 * Hybrid approach: Real-time streaming + post-processing with speaker labels
 */

import assemblyAIService from './assemblyAIService'

class AssemblyAISpeakerService {
  constructor() {
    this.baseService = assemblyAIService
    this.recordedChunks = []
    this.mediaRecorder = null
    this.isRecording = false
    console.log('🎯 AssemblyAI Speaker Diarization Service (Prototype) initialized')
  }

  /**
   * Check if service is configured
   */
  isConfigured() {
    return this.baseService.isConfigured()
  }

  /**
   * HYBRID MODE: Start real-time transcription + record for post-processing
   * @param {MediaStream} audioStream - Audio stream from getUserMedia
   * @param {Object} options - Configuration options
   * @param {Object} callbacks - { onRealtimeTranscript, onSpeakerTranscript, onError, onClose }
   */
  async startHybridTranscription(audioStream, options = {}, callbacks = {}) {
    if (!this.isConfigured()) {
      const error = new Error('AssemblyAI API key not configured')
      if (callbacks.onError) callbacks.onError(error)
      throw error
    }

    const {
      speakers_expected = null, // Auto-detect if null
      enable_speaker_labels = true
    } = options

    const {
      onRealtimeTranscript,
      onSpeakerTranscript,
      onError,
      onClose
    } = callbacks

    try {
      console.log('🎙️ Starting HYBRID transcription mode...')
      console.log('  ✅ Real-time streaming for instant feedback')
      console.log('  ✅ Recording for speaker diarization')

      this.isRecording = true

      // Part 1: Start real-time streaming (for instant feedback, no speakers)
      await this.baseService.startRealtimeTranscription(audioStream, {
        onTranscript: (text, isFinal) => {
          if (onRealtimeTranscript) {
            onRealtimeTranscript(text, isFinal)
          }
        },
        onError: (error) => {
          console.error('❌ Real-time streaming error:', error)
          if (onError) onError(error)
        },
        onClose: () => {
          console.log('🔌 Real-time streaming closed')
        }
      })

      // Part 2: Simultaneously record audio for post-processing with speakers
      this.recordedChunks = []

      // Create MediaRecorder to capture audio
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'

      this.mediaRecorder = new MediaRecorder(audioStream, {
        mimeType,
        audioBitsPerSecond: 128000
      })

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.recordedChunks.push(event.data)
          console.log(`📦 Recorded chunk for speaker processing: ${(event.data.size / 1024).toFixed(2)} KB`)
        }
      }

      this.mediaRecorder.onstop = async () => {
        console.log('🛑 Recording stopped, processing with speaker diarization...')

        if (!enable_speaker_labels || this.recordedChunks.length === 0) {
          console.log('⏭️ Skipping speaker diarization')
          return
        }

        try {
          // Create blob from recorded chunks
          const audioBlob = new Blob(this.recordedChunks, { type: mimeType })
          console.log(`📦 Total recorded audio: ${(audioBlob.size / 1024 / 1024).toFixed(2)} MB`)

          // Process with speaker diarization
          const speakerData = await this.transcribeWithSpeakers(audioBlob, {
            speakers_expected,
            onProgress: (stage, progress) => {
              console.log(`🔄 Speaker processing: ${stage} - ${progress}%`)
            }
          })

          // Return speaker-labeled transcript
          if (onSpeakerTranscript) {
            onSpeakerTranscript(speakerData)
          }

          console.log('✅ Speaker diarization complete:', {
            speakers: speakerData.speakers_detected,
            utterances: speakerData.utterances?.length || 0
          })
        } catch (error) {
          console.error('❌ Speaker diarization failed:', error)
          if (onError) onError(error)
        }
      }

      this.mediaRecorder.onerror = (error) => {
        console.error('❌ MediaRecorder error:', error)
        if (onError) onError(error)
      }

      // Start recording (collect data every second)
      this.mediaRecorder.start(1000)
      console.log('🎙️ Hybrid mode active: Streaming + Recording')

    } catch (error) {
      console.error('❌ Failed to start hybrid transcription:', error)
      this.isRecording = false
      if (onError) onError(error)
      throw error
    }
  }

  /**
   * Stop hybrid transcription
   * This will stop real-time streaming and trigger speaker processing
   */
  async stopHybridTranscription() {
    console.log('🛑 Stopping hybrid transcription...')

    // Stop real-time streaming
    this.baseService.stopRealtimeTranscription()

    // Stop recording (this will trigger speaker processing in onstop event)
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop()
    }

    this.isRecording = false
    console.log('✅ Hybrid transcription stopped')
  }

  /**
   * Transcribe pre-recorded audio with speaker diarization
   * This is the PRIMARY method for batch transcription (no WebSocket)
   * @param {Blob} audioBlob - Audio blob to transcribe
   * @param {Object} options - { speakers_expected, onProgress }
   * @returns {Promise<Object>} - Speaker diarization result with utterances
   */
  async transcribeWithSpeakers(audioBlob, options = {}) {
    const { speakers_expected = null, onProgress = null } = options

    // Helper to safely call progress callback
    const reportProgress = (progress, status) => {
      if (onProgress) {
        try {
          onProgress(progress, status)
        } catch (e) {
          console.warn('Progress callback error:', e)
        }
      }
    }

    if (!this.baseService.isConfigured()) {
      throw new Error('AssemblyAI API key not configured')
    }

    try {
      console.log('📤 Uploading audio for speaker diarization...', {
        size: `${(audioBlob.size / 1024 / 1024).toFixed(2)} MB`,
        type: audioBlob.type,
        speakers_expected
      })

      reportProgress(0, 'Uploading audio...')

      // Get API key (needed for file upload)
      const apiKey = this.baseService.apiKey
      if (!apiKey || apiKey === 'your_api_key_here') {
        throw new Error('API key required for speaker diarization. Please add VITE_ASSEMBLYAI_API_KEY to your .env file')
      }

      // Validate audio blob before upload
      if (!audioBlob || audioBlob.size === 0) {
        throw new Error('No audio data to upload')
      }

      // AssemblyAI minimum duration is 160ms - estimate based on size
      // A very rough check: 16kHz mono audio at ~32kbps = ~4KB/second
      // 160ms would be ~0.64KB minimum
      if (audioBlob.size < 500) {
        throw new Error('Audio too short (minimum ~160ms required)')
      }

      console.log('📤 Audio blob details:', {
        size: audioBlob.size,
        type: audioBlob.type,
        sizeKB: (audioBlob.size / 1024).toFixed(2) + ' KB'
      })

      // Step 1: Upload audio file
      // CRITICAL: Must include Content-Type: application/octet-stream
      const uploadResponse = await fetch('https://api.assemblyai.com/v2/upload', {
        method: 'POST',
        headers: {
          'authorization': apiKey,
          'Content-Type': 'application/octet-stream'
        },
        body: audioBlob
      })

      // Parse error response body for better error messages
      if (!uploadResponse.ok) {
        let errorMessage = `Upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`
        try {
          const errorBody = await uploadResponse.json()
          if (errorBody.error) {
            errorMessage = `Upload failed: ${errorBody.error}`
          }
        } catch (e) {
          // Response wasn't JSON, use status text
        }
        console.error('❌ Upload error:', errorMessage)
        throw new Error(errorMessage)
      }

      const uploadResult = await uploadResponse.json()
      const upload_url = uploadResult.upload_url

      if (!upload_url) {
        throw new Error('Upload succeeded but no URL returned')
      }

      console.log('✅ Audio uploaded:', upload_url)

      reportProgress(20, 'Audio uploaded, starting transcription...')

      // Step 2: Request transcription with speaker labels
      console.log('🎯 Requesting transcription with speaker labels...')

      const transcriptConfig = {
        audio_url: upload_url,
        speaker_labels: true, // ← Enable speaker diarization
        language_code: 'en'
      }

      // Add speaker count hint if provided
      if (speakers_expected !== null && speakers_expected > 0) {
        transcriptConfig.speakers_expected = speakers_expected
        console.log(`💡 Hint: Expecting ${speakers_expected} speakers`)
      }

      const transcriptResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
        method: 'POST',
        headers: {
          'authorization': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(transcriptConfig)
      })

      // Parse error response body for better error messages
      if (!transcriptResponse.ok) {
        let errorMessage = `Transcription request failed: ${transcriptResponse.status} ${transcriptResponse.statusText}`
        try {
          const errorBody = await transcriptResponse.json()
          if (errorBody.error) {
            errorMessage = `Transcription failed: ${errorBody.error}`
          }
        } catch (e) {
          // Response wasn't JSON
        }
        console.error('❌ Transcription request error:', errorMessage)
        throw new Error(errorMessage)
      }

      const transcriptResult = await transcriptResponse.json()
      const id = transcriptResult.id

      if (!id) {
        throw new Error('Transcription request succeeded but no job ID returned')
      }
      console.log('✅ Speaker diarization job created:', id)

      // CRITICAL: Save transcript ID to localStorage for recovery
      try {
        const transcriptRecord = {
          id,
          createdAt: new Date().toISOString(),
          audioSize: audioBlob.size,
          status: 'processing'
        }
        localStorage.setItem('latest_assemblyai_transcript_id', id)
        localStorage.setItem(`assemblyai_transcript_${id}`, JSON.stringify(transcriptRecord))
        console.log('💾 TRANSCRIPT ID SAVED FOR RECOVERY:', id)
      } catch (saveError) {
        console.error('Failed to save transcript ID:', saveError)
      }

      reportProgress(30, 'Processing audio with speaker identification...')

      // Step 3: Poll for result
      const result = await this.pollTranscriptWithSpeakers(id, apiKey, (progress, status) => {
        // Map polling progress (0-100) to overall progress (30-95)
        const overallProgress = 30 + (progress * 0.65)
        reportProgress(overallProgress, status || 'Identifying speakers...')
      })

      console.log('✅ Speaker diarization completed:', {
        speakers: result.speakers_detected,
        utterances: result.utterances?.length || 0,
        words: result.words?.length || 0,
        textLength: result.text?.length || 0
      })

      reportProgress(100, 'Complete!')

      // Add the transcript ID to the result for reference
      result.id = id

      return result

    } catch (error) {
      console.error('❌ Speaker diarization failed:', error)
      reportProgress(0, 'Failed')
      throw error
    }
  }

  /**
   * Poll for transcription result with speaker labels
   */
  async pollTranscriptWithSpeakers(id, apiKey, onProgress = null) {
    const maxAttempts = 180 // 3 minutes max (speaker diarization can take longer)
    let attempts = 0
    let consecutiveErrors = 0
    const maxConsecutiveErrors = 3

    console.log(`🔄 Starting to poll for transcript ${id}...`)

    while (attempts < maxAttempts) {
      attempts++

      try {
        const response = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
          headers: { 'authorization': apiKey }
        })

        if (!response.ok) {
          consecutiveErrors++
          console.warn(`⚠️ Poll attempt ${attempts} failed: ${response.status} (${consecutiveErrors}/${maxConsecutiveErrors})`)

          if (consecutiveErrors >= maxConsecutiveErrors) {
            throw new Error(`Failed to fetch transcript after ${maxConsecutiveErrors} attempts: ${response.status} ${response.statusText}`)
          }

          // Wait and retry
          await new Promise(resolve => setTimeout(resolve, 2000))
          continue
        }

        // Reset consecutive error counter on success
        consecutiveErrors = 0

        const transcript = await response.json()
        console.log(`📊 Poll ${attempts}: status=${transcript.status}`)

        if (transcript.status === 'completed') {
          console.log('✅ Transcription completed!')
          // Extract speaker diarization data
          return {
            text: transcript.text,
            utterances: transcript.utterances || [], // Array of {speaker, text, start, end, confidence}
            words: transcript.words || [], // Each word has speaker label
            speakers_detected: this.countSpeakers(transcript.utterances),
            confidence: transcript.confidence,
            audio_duration: transcript.audio_duration
          }
        } else if (transcript.status === 'error') {
          console.error('❌ Transcription error:', transcript.error)
          throw new Error(transcript.error || 'Transcription failed with unknown error')
        }

        // Update progress (0% to 100% within polling phase)
        if (onProgress && transcript.status === 'processing') {
          const progress = Math.min(95, attempts * 1.0) // Gradual progress
          onProgress(progress, `Analyzing audio (${attempts}s)...`)
        } else if (onProgress && transcript.status === 'queued') {
          onProgress(5, 'Queued for processing...')
        }

      } catch (fetchError) {
        // Network error during poll
        consecutiveErrors++
        console.warn(`⚠️ Poll network error: ${fetchError.message} (${consecutiveErrors}/${maxConsecutiveErrors})`)

        if (consecutiveErrors >= maxConsecutiveErrors) {
          throw new Error(`Network error during polling: ${fetchError.message}`)
        }
      }

      // Wait 1 second before next poll
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    throw new Error('Speaker diarization timed out')
  }

  /**
   * Count unique speakers from utterances
   */
  countSpeakers(utterances) {
    if (!utterances || utterances.length === 0) return 0
    const speakers = new Set(utterances.map(u => u.speaker))
    return speakers.size
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      configured: this.isConfigured(),
      recording: this.isRecording,
      baseServiceStreaming: this.baseService.isStreaming
    }
  }

  /**
   * Format speaker data for display
   * Converts utterances into a readable format
   */
  formatSpeakerTranscript(speakerData, speakerLabels = {}) {
    if (!speakerData.utterances || speakerData.utterances.length === 0) {
      return speakerData.text || ''
    }

    return speakerData.utterances.map(utterance => {
      const speakerName = speakerLabels[utterance.speaker] || `Speaker ${utterance.speaker}`
      return `[${speakerName}]: ${utterance.text}`
    }).join('\n\n')
  }
}

// Export singleton instance
const assemblyAISpeakerService = new AssemblyAISpeakerService()
export default assemblyAISpeakerService
