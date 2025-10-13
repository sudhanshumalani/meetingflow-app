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
   * @param {Blob} audioBlob - Audio blob to transcribe
   * @param {Object} options - { speakers_expected, onProgress }
   * @returns {Promise<Object>} - Speaker diarization result
   */
  async transcribeWithSpeakers(audioBlob, options = {}) {
    const { speakers_expected = null, onProgress = null } = options

    if (!this.baseService.isConfigured()) {
      throw new Error('AssemblyAI API key not configured')
    }

    try {
      console.log('📤 Uploading audio for speaker diarization...', {
        size: `${(audioBlob.size / 1024 / 1024).toFixed(2)} MB`,
        type: audioBlob.type,
        speakers_expected
      })

      if (onProgress) onProgress('uploading', 0)

      // Get API key (needed for file upload)
      const apiKey = this.baseService.apiKey
      if (!apiKey || apiKey === 'your_api_key_here') {
        throw new Error('API key required for speaker diarization. Please add VITE_ASSEMBLYAI_API_KEY to your .env file')
      }

      // Step 1: Upload audio file
      const uploadResponse = await fetch('https://api.assemblyai.com/v2/upload', {
        method: 'POST',
        headers: {
          authorization: apiKey
        },
        body: audioBlob
      })

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed: ${uploadResponse.statusText}`)
      }

      const { upload_url } = await uploadResponse.json()
      console.log('✅ Audio uploaded:', upload_url)

      if (onProgress) onProgress('uploaded', 25)

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
          authorization: apiKey,
          'content-type': 'application/json'
        },
        body: JSON.stringify(transcriptConfig)
      })

      if (!transcriptResponse.ok) {
        throw new Error(`Transcription request failed: ${transcriptResponse.statusText}`)
      }

      const { id } = await transcriptResponse.json()
      console.log('✅ Speaker diarization job created:', id)

      if (onProgress) onProgress('processing', 40)

      // Step 3: Poll for result
      const result = await this.pollTranscriptWithSpeakers(id, apiKey, onProgress)

      console.log('✅ Speaker diarization completed:', {
        speakers: result.speakers_detected,
        utterances: result.utterances?.length || 0,
        words: result.words?.length || 0,
        textLength: result.text?.length || 0
      })

      if (onProgress) onProgress('completed', 100)

      return result

    } catch (error) {
      console.error('❌ Speaker diarization failed:', error)
      if (onProgress) onProgress('error', 0)
      throw error
    }
  }

  /**
   * Poll for transcription result with speaker labels
   */
  async pollTranscriptWithSpeakers(id, apiKey, onProgress = null) {
    const maxAttempts = 120 // 2 minutes max
    let attempts = 0

    while (attempts < maxAttempts) {
      attempts++

      const response = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
        headers: { authorization: apiKey }
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch transcript: ${response.statusText}`)
      }

      const transcript = await response.json()

      if (transcript.status === 'completed') {
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
        throw new Error(transcript.error || 'Transcription failed')
      }

      // Update progress (40% to 95%)
      if (onProgress && transcript.status === 'processing') {
        const progress = 40 + Math.min(55, attempts * 0.5)
        onProgress('processing', progress)
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
