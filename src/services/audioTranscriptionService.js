/**
 * Enhanced Audio Transcription Service for MeetingFlow
 * Web Speech API + Whisper.cpp with CDN model loading
 */

import hybridWhisperService from './whisper/HybridWhisperService.js';
import { WHISPER_MODELS, getRecommendedModel } from '../config/modelConfig.js';

class AudioTranscriptionService {
  constructor() {
    this.isInitialized = false
    this.recognition = null
    this.isRecording = false
    this.listeners = new Set()

    // Audio sources
    this.audioSources = {
      microphone: null,
      tabAudio: null,
      mixed: null
    }
    this.activeSource = 'microphone'

    // Web Audio API for tab audio processing
    this.audioContext = null
    this.mediaRecorder = null
    this.analyserNode = null

    // Settings
    this.realtimeEnabled = this.checkWebSpeechSupport()
    this.tabAudioEnabled = this.checkTabAudioSupport()
    this.whisperEnabled = true

    // Transcription modes
    this.transcriptionMode = 'whisper' // 'whisper' or 'realtime'
    this.recordingBlobs = []

    // Error recovery
    this.autoReconnectAttempts = 0
    this.maxReconnectAttempts = 3
  }

  /**
   * Check if Web Speech API is supported
   */
  checkWebSpeechSupport() {
    return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window
  }

  /**
   * Check if tab audio capture is supported
   */
  checkTabAudioSupport() {
    return 'getDisplayMedia' in navigator.mediaDevices
  }

  /**
   * Get available audio sources
   */
  getAvailableAudioSources() {
    const sources = []

    if (this.realtimeEnabled) {
      sources.push({
        id: 'microphone',
        name: 'Microphone',
        description: 'Capture your voice for transcription',
        icon: '🎤',
        supported: true
      })
    }

    if (this.tabAudioEnabled) {
      sources.push({
        id: 'tabAudio',
        name: 'Tab/Screen Audio',
        description: 'Capture audio from browser tabs or shared applications',
        icon: '🖥️',
        supported: true
      })

      if (this.realtimeEnabled) {
        sources.push({
          id: 'mixed',
          name: 'Microphone + Tab Audio',
          description: 'Capture both your voice and tab/screen audio simultaneously',
          icon: '🎙️',
          supported: true
        })
      }
    }

    return sources
  }

  /**
   * Initialize the transcription service
   */
  async initialize() {
    try {
      console.log('🎤 Initializing Audio Transcription Service...')

      if (!this.realtimeEnabled) {
        throw new Error('Web Speech API is not supported in this browser')
      }

      // Initialize Web Speech API
      await this.initializeWebSpeech()

      this.isInitialized = true
      console.log('✅ Audio Transcription Service initialized')

      return {
        success: true,
        realtimeSupported: this.realtimeEnabled,
        tabAudioSupported: this.tabAudioEnabled,
        availableSources: this.getAvailableAudioSources()
      }
    } catch (error) {
      console.error('❌ Failed to initialize transcription service:', error)
      throw new Error(`Transcription service initialization failed: ${error.message}`)
    }
  }

  /**
   * Initialize Web Speech API for real-time transcription
   */
  async initializeWebSpeech() {
    if (!this.realtimeEnabled) return

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    this.recognition = new SpeechRecognition()

    // Configure recognition for best results
    this.recognition.continuous = true
    this.recognition.interimResults = true
    this.recognition.lang = 'en-US'
    this.recognition.maxAlternatives = 1

    // Set up event handlers
    this.recognition.onstart = () => {
      console.log('🎤 Real-time transcription started')
      this.notifyListeners('status', { type: 'realtime_started' })
    }

    this.recognition.onresult = (event) => {
      let interimTranscript = ''
      let finalTranscript = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript

        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' '
        } else {
          interimTranscript += transcript
        }
      }

      this.notifyListeners('transcript', {
        type: 'realtime',
        final: finalTranscript.trim(),
        interim: interimTranscript.trim(),
        timestamp: new Date().toISOString()
      })
    }

    this.recognition.onerror = (event) => {
      console.error('🎤 Speech recognition error:', event.error)

      // Handle network errors with auto-reconnect
      if (event.error === 'network' && this.autoReconnectAttempts < this.maxReconnectAttempts) {
        console.log(`🔄 Network error, attempting reconnect ${this.autoReconnectAttempts + 1}/${this.maxReconnectAttempts}`)
        this.autoReconnectAttempts++

        setTimeout(() => {
          if (this.isRecording) {
            this.recognition.start()
          }
        }, 1000)
        return
      }

      this.notifyListeners('error', {
        type: 'realtime_error',
        error: event.error,
        message: this.getErrorMessage(event.error)
      })
    }

    this.recognition.onend = () => {
      console.log('🎤 Real-time transcription ended')
      this.notifyListeners('status', { type: 'realtime_ended' })

      // Auto-restart if we're still supposed to be recording
      if (this.isRecording) {
        console.log('🔄 Auto-restarting transcription')
        setTimeout(() => {
          if (this.isRecording) {
            this.recognition.start()
          }
        }, 100)
      }
    }
  }

  /**
   * Start recording and transcription with specified audio source
   */
  async startRecording(options = {}) {
    try {
      const {
        continuous = true,
        language = 'en-US',
        source = 'microphone'
      } = options

      if (this.isRecording) {
        throw new Error('Recording is already in progress')
      }

      console.log(`🎤 Starting recording with source: ${source}`)
      this.activeSource = source
      this.isRecording = true

      // Reset reconnect attempts
      this.autoReconnectAttempts = 0

      switch (source) {
        case 'microphone':
          await this.startMicrophoneTranscription({ continuous, language })
          break
        case 'tabAudio':
          await this.startTabAudioTranscription({ continuous, language })
          break
        case 'mixed':
          await this.startMixedTranscription({ continuous, language })
          break
        default:
          throw new Error(`Unsupported audio source: ${source}`)
      }

      console.log('✅ Recording started successfully')
      return { success: true, source }

    } catch (error) {
      this.isRecording = false
      console.error('❌ Failed to start recording:', error)
      throw error
    }
  }

  /**
   * Start microphone transcription (now uses Whisper mode by default)
   */
  async startMicrophoneTranscription(options = {}) {
    if (this.transcriptionMode === 'whisper') {
      // Use MediaRecorder for Whisper mode
      await this.startRecordingForWhisper(options)
    } else {
      // Fallback to real-time Web Speech API
      if (!this.realtimeEnabled) {
        throw new Error('Real-time transcription not supported')
      }

      // Request microphone permission
      await navigator.mediaDevices.getUserMedia({ audio: true })

      // Configure and start recognition
      this.recognition.continuous = options.continuous
      this.recognition.lang = options.language
      this.recognition.start()
    }
  }

  /**
   * Start recording for Whisper batch processing
   */
  async startRecordingForWhisper(options = {}) {
    try {
      console.log('🎯 Starting Whisper recording mode...')

      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      })

      // Set up audio context for processing
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)()
      const source = this.audioContext.createMediaStreamSource(stream)

      // Create analyser for audio visualization
      this.analyserNode = this.audioContext.createAnalyser()
      this.analyserNode.fftSize = 256
      source.connect(this.analyserNode)

      // Set up MediaRecorder to capture audio for Whisper
      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm'
      })

      this.recordingBlobs = []

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.recordingBlobs.push(event.data)
          console.log(`🎵 Audio chunk recorded: ${event.data.size} bytes`)
        }
      }

      this.mediaRecorder.onstop = () => {
        // When recording stops, create the complete audio blob
        const audioBlob = new Blob(this.recordingBlobs, { type: 'audio/webm' })
        console.log(`🎵 Recording complete: ${audioBlob.size} bytes total`)

        // Process with Whisper
        this._transcribeWithWhisper(audioBlob)
      }

      // Start recording
      this.mediaRecorder.start(1000) // 1-second chunks
      console.log('✅ Whisper recording started')

      // Notify UI
      this.notifyListeners('status', {
        type: 'whisper_recording_started',
        message: 'Recording audio for Whisper transcription...'
      })

    } catch (error) {
      console.error('❌ Failed to start Whisper recording:', error)
      throw error
    }
  }

  /**
   * Start tab audio transcription (capture only, no live transcription)
   */
  async startTabAudioTranscription() {
    try {
      // Request screen/tab audio capture
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: false,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      })

      // Set up audio context for processing
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)()
      const source = this.audioContext.createMediaStreamSource(stream)

      // Create analyser for audio visualization
      this.analyserNode = this.audioContext.createAnalyser()
      this.analyserNode.fftSize = 256
      source.connect(this.analyserNode)

      // Set up MediaRecorder to capture audio
      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm'
      })

      let audioBlobs = []
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioBlobs.push(event.data)

          // Emit audio chunk for monitoring
          this.notifyListeners('tabAudioChunk', {
            source: 'tabAudio',
            audioData: event.data,
            timestamp: new Date().toISOString(),
            size: event.data.size
          })
        }
      }

      this.mediaRecorder.onstop = () => {
        // When recording stops, we have the complete audio
        const audioBlob = new Blob(audioBlobs, { type: 'audio/webm' })
        const audioUrl = URL.createObjectURL(audioBlob)

        console.log('🎵 Tab audio recording complete, size:', audioBlob.size, 'bytes')

        // Emit final message with audio data
        this.notifyListeners('transcript', {
          type: 'tabAudio',
          source: 'tabAudio',
          final: `Tab audio captured successfully (${Math.round(audioBlob.size / 1024)}KB). Audio saved for transcription.`,
          interim: '',
          timestamp: new Date().toISOString(),
          audioBlob: audioBlob,
          audioUrl: audioUrl,
          isComplete: true
        })

        audioBlobs = []

        // If using Whisper mode, transcribe the audio
        if (this.transcriptionMode === 'whisper') {
          this._transcribeWithWhisper(audioBlob);
        }
      }

      // Start recording in small chunks
      this.mediaRecorder.start(2000) // 2-second chunks

      console.log('✅ Tab audio capture started')

      // Show immediate guidance
      this.notifyListeners('transcript', {
        type: 'tabAudio',
        source: 'tabAudio',
        final: '',
        interim: '🎵 Capturing tab audio... Audio will be saved for transcription.',
        timestamp: new Date().toISOString(),
        isGuidance: true
      })

    } catch (error) {
      console.error('❌ Failed to start tab audio transcription:', error)
      throw error
    }
  }

  /**
   * Start mixed transcription (microphone + tab audio)
   */
  async startMixedTranscription(options = {}) {
    // For now, fallback to microphone only
    console.log('⚠️ Mixed transcription not fully implemented, using microphone')
    return this.startMicrophoneTranscription(options)
  }

  /**
   * Stop recording and transcription
   */
  async stopRecording() {
    if (!this.isRecording) {
      throw new Error('No recording in progress')
    }

    console.log('🛑 Stopping recording...')
    this.isRecording = false

    if (this.transcriptionMode === 'whisper') {
      // Stop MediaRecorder for Whisper mode
      if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
        console.log('🛑 Stopping Whisper MediaRecorder...')
        this.mediaRecorder.stop()

        // The transcription will be handled in the onstop event
        this.notifyListeners('status', {
          type: 'processing_started',
          message: 'Processing audio with Whisper AI...'
        })
      }
    } else {
      // Stop Web Speech recognition
      if (this.recognition) {
        this.recognition.stop()
      }
    }

    // Clean up audio context
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(console.warn)
      this.audioContext = null
    }

    this.analyserNode = null

    console.log('✅ Recording stopped')
    return { success: true }
  }

  /**
   * Get error message for speech recognition errors
   */
  getErrorMessage(error) {
    const messages = {
      'network': 'Network connection issue. Check your internet connection.',
      'not-allowed': 'Microphone permission denied. Please allow microphone access.',
      'no-speech': 'No speech detected. Please try speaking more clearly.',
      'aborted': 'Speech recognition was aborted.',
      'audio-capture': 'Audio capture failed. Please check your microphone.',
      'bad-grammar': 'Speech recognition grammar error.',
      'language-not-supported': 'Selected language is not supported.',
      'service-not-allowed': 'Speech recognition service not allowed.'
    }
    return messages[error] || `Speech recognition error: ${error}`
  }

  /**
   * Add event listener
   */
  addEventListener(callback) {
    this.listeners.add(callback)
  }

  /**
   * Remove event listener
   */
  removeEventListener(callback) {
    this.listeners.delete(callback)
  }

  /**
   * Notify all listeners
   */
  notifyListeners(event, data) {
    this.listeners.forEach(callback => {
      try {
        callback(event, data)
      } catch (error) {
        console.error('Error in transcription listener:', error)
      }
    })
  }

  /**
   * Get service status
   */
  getStatus() {
    const whisperStatus = hybridWhisperService.getStatus();

    return {
      isInitialized: this.isInitialized,
      isRecording: this.isRecording,
      realtimeSupported: this.realtimeEnabled,
      tabAudioSupported: this.tabAudioEnabled,
      whisperSupported: this.whisperEnabled,
      transcriptionMode: this.transcriptionMode,
      activeSource: this.activeSource,
      availableSources: this.getAvailableAudioSources(),
      whisper: {
        isInitialized: whisperStatus.isInitialized,
        isLoading: whisperStatus.isLoading,
        currentModel: whisperStatus.currentModel,
        ready: whisperStatus.ready
      }
    }
  }

  /**
   * Clean up resources
   */
  destroy() {
    this.stopRecording().catch(console.warn)

    if (this.recognition) {
      this.recognition.abort()
      this.recognition = null
    }

    this.listeners.clear()
    this.audioSources = { microphone: null, tabAudio: null, mixed: null }
    this.isInitialized = false

    console.log('🧹 Audio Transcription Service destroyed')
  }

  /**
   * Initialize Whisper if not already done
   */
  async _ensureWhisperInitialized(progressCallback = null) {
    if (hybridWhisperService.getStatus().isInitialized) {
      return true;
    }

    console.log('🤖 Initializing Whisper for first-time use...');

    // Show model selection UI (for now, auto-select recommended model)
    const recommendedModel = getRecommendedModel();

    try {
      await hybridWhisperService.initialize({
        modelId: recommendedModel.id,
        progressCallback: (progress) => {
          console.log(`Whisper init: ${progress.stage} (${progress.progress}%)`);
          if (progressCallback) {
            progressCallback({
              type: 'whisper_init',
              stage: progress.stage,
              progress: progress.progress,
              message: progress.message
            });
          }
        }
      });

      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Whisper:', error);
      return false;
    }
  }

  /**
   * Transcribe audio with Whisper
   */
  async _transcribeWithWhisper(audioBlob) {
    try {
      console.log('🎯 Starting Whisper transcription for recorded audio...');

      // Ensure Whisper is initialized
      const initialized = await this._ensureWhisperInitialized((progress) => {
        this.notifyListeners('status', {
          type: 'whisper_initialization',
          stage: progress.stage,
          progress: progress.progress,
          message: progress.message
        });
      });

      if (!initialized) {
        throw new Error('Failed to initialize Whisper');
      }

      // Show transcription progress
      this.notifyListeners('status', {
        type: 'transcription_started',
        message: 'Starting Whisper transcription...'
      });

      // Transcribe with Whisper
      const result = await hybridWhisperService.transcribe(audioBlob, {
        language: 'en',
        progressCallback: (progress) => {
          this.notifyListeners('status', {
            type: 'transcription_progress',
            stage: progress.stage,
            progress: progress.progress,
            message: progress.message
          });
        }
      });

      if (result.success) {
        // Send Whisper transcription result
        this.notifyListeners('transcript', {
          type: 'whisper',
          source: this.activeSource,
          final: result.text,
          interim: '',
          timestamp: result.timestamp,
          model: result.model,
          segments: result.segments,
          isWhisperResult: true
        });

        console.log('✅ Whisper transcription completed:', result.text.substring(0, 100) + '...');
      } else {
        throw new Error(result.error || 'Whisper transcription failed');
      }

    } catch (error) {
      console.error('❌ Whisper transcription failed:', error);

      this.notifyListeners('transcript', {
        type: 'error',
        source: this.activeSource,
        final: `Whisper transcription failed: ${error.message}`,
        interim: '',
        timestamp: new Date().toISOString(),
        isError: true
      });
    }
  }

  /**
   * Set transcription mode
   */
  setTranscriptionMode(mode) {
    if (!['whisper', 'realtime'].includes(mode)) {
      throw new Error('Invalid transcription mode. Use "whisper" or "realtime"');
    }

    this.transcriptionMode = mode;
    console.log(`🔧 Transcription mode set to: ${mode}`);
  }

  /**
   * Get Whisper model cache status
   */
  async getWhisperCacheStatus() {
    try {
      const stats = await modelCacheService.getCacheStats();
      const storage = await modelCacheService.checkStorageQuota();

      return {
        ...stats,
        storage,
        availableModels: Object.values(WHISPER_MODELS),
        recommendedModel: getRecommendedModel()
      };
    } catch (error) {
      console.error('Failed to get cache status:', error);
      return null;
    }
  }

  /**
   * Download specific Whisper model
   */
  async downloadWhisperModel(modelId, progressCallback = null) {
    try {
      console.log(`📥 Downloading Whisper model: ${modelId}`);

      await modelCacheService.getModel(modelId, (progress) => {
        console.log(`Download progress: ${progress.progress}%`);
        if (progressCallback) {
          progressCallback(progress);
        }
      });

      console.log(`✅ Model ${modelId} downloaded successfully`);
      return true;

    } catch (error) {
      console.error(`❌ Failed to download model ${modelId}:`, error);
      throw error;
    }
  }

  /**
   * Switch Whisper model
   */
  async switchWhisperModel(modelId, progressCallback = null) {
    try {
      await hybridWhisperService.switchTier(modelId === 'base' ? 'tier3' : 'tier2', progressCallback);
      console.log(`✅ Switched to Whisper model: ${modelId}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to switch to model ${modelId}:`, error);
      throw error;
    }
  }
}

// Create singleton instance
const audioTranscriptionService = new AudioTranscriptionService()

export default audioTranscriptionService