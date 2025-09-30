/**
 * Audio Transcription Service - Clean Web Speech API Implementation
 * Provides live transcription using browser's native speech recognition
 */

import speechRecognitionService from './SpeechRecognitionService.js';

class AudioTranscriptionService {
  constructor() {
    this.isInitialized = false;
    this.currentTranscript = '';
    this.isRecording = false;

    console.log('🎤 AudioTranscriptionService initialized with Web Speech API');
  }

  /**
   * Initialize the transcription service
   */
  async initialize() {
    if (this.isInitialized) {
      return true;
    }

    try {
      if (!speechRecognitionService.isSupported()) {
        console.error('❌ Web Speech API not supported. User agent:', navigator.userAgent);
        throw new Error('Web Speech API is not supported in this browser. Please use Chrome, Edge, or Safari.');
      }

      const initialized = speechRecognitionService.initialize();
      if (!initialized) {
        throw new Error('Failed to initialize speech recognition');
      }

      this.isInitialized = true;

      console.log('✅ AudioTranscriptionService initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize AudioTranscriptionService:', error);
      throw error;
    }
  }

  /**
   * Start live transcription
   */
  async startLiveTranscription(callbacks = {}) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.isRecording) {
      console.log('⚠️ Transcription is already running');
      return;
    }

    const { onTranscript, onEnd, onError } = callbacks;

    // Detect mobile for enhanced error handling
    const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile) {
      console.log('📱 Mobile device detected - enabling enhanced error recovery');
      speechRecognitionService.autoRestart = true;
    }

    // Set up callbacks
    if (onTranscript) {
      speechRecognitionService.onResult((result) => {
        this.currentTranscript = result.combined;
        onTranscript({
          text: result.combined,
          isFinal: false,
          segments: [{
            text: result.combined,
            start: 0,
            end: 0
          }]
        });
      });
    }

    if (onEnd) {
      speechRecognitionService.onEnd(() => {
        this.isRecording = false;
        const finalTranscript = speechRecognitionService.getTranscript().final;

        onEnd({
          text: finalTranscript,
          success: true,
          segments: [{
            text: finalTranscript,
            start: 0,
            end: 0
          }]
        });
      });
    }

    if (onError) {
      speechRecognitionService.onError((error) => {
        // Enhanced mobile error handling
        if (isMobile && (error === 'aborted' || error === 'no-speech')) {
          console.log(`📱 Mobile: Ignoring harmless error: ${error}`);
          return; // Don't propagate harmless mobile errors
        }

        this.isRecording = false;

        // Provide user-friendly error messages for mobile
        let userMessage = `Speech recognition error: ${error}`;
        if (isMobile) {
          switch (error) {
            case 'not-allowed':
              userMessage = 'Microphone permission denied. Please enable microphone access in your browser settings.';
              break;
            case 'audio-capture':
              userMessage = 'Unable to access microphone. Please check your device settings and try again.';
              break;
            case 'network':
              userMessage = 'Network error. Please check your internet connection and try again.';
              break;
          }
        }

        onError(new Error(userMessage));
      });
    }

    // Start listening
    try {
      speechRecognitionService.reset();
      speechRecognitionService.startListening();
      this.isRecording = true;

      console.log('🎤 Live transcription started' + (isMobile ? ' (mobile optimized)' : ''));
    } catch (error) {
      console.error('❌ Failed to start live transcription:', error);
      throw error;
    }
  }

  /**
   * Stop live transcription
   */
  stopLiveTranscription() {
    if (!this.isRecording) {
      console.log('⚠️ Transcription is not running');
      return this.currentTranscript;
    }

    // Disable auto-restart before stopping to prevent unwanted restarts
    speechRecognitionService.autoRestart = false;

    const finalTranscript = speechRecognitionService.stopListening();
    this.isRecording = false;

    console.log('🛑 Live transcription stopped');
    return finalTranscript;
  }

  /**
   * Transcribe audio blob (fallback to live transcription)
   */
  async transcribeAudio(audioBlob, options = {}) {
    console.log('📝 Starting audio transcription with Web Speech API');

    return new Promise((resolve, reject) => {
      // For Web Speech API, we need to use live transcription
      // since it doesn't support direct audio blob transcription
      this.startLiveTranscription({
        onTranscript: (result) => {
          // Update with interim results
          console.log('📝 Interim transcript:', result.text);
        },
        onEnd: (result) => {
          resolve({
            success: true,
            text: result.text || 'No speech detected',
            segments: result.segments || [],
            duration: 0,
            language: 'en-US'
          });
        },
        onError: (error) => {
          reject(error);
        }
      });

      // Auto-stop after 30 seconds if no manual stop
      setTimeout(() => {
        if (this.isRecording) {
          const transcript = this.stopLiveTranscription();
          resolve({
            success: true,
            text: transcript || 'No speech detected',
            segments: [{
              text: transcript || 'No speech detected',
              start: 0,
              end: 30000
            }],
            duration: 30,
            language: 'en-US'
          });
        }
      }, 30000);
    });
  }

  /**
   * Get current transcript
   */
  getCurrentTranscript() {
    return this.currentTranscript;
  }

  /**
   * Check if currently recording
   */
  isCurrentlyRecording() {
    return this.isRecording;
  }

  /**
   * Reset transcript
   */
  reset() {
    this.currentTranscript = '';
    speechRecognitionService.reset();
    console.log('🔄 Transcription service reset');
  }

  /**
   * Check if the service is supported
   */
  isSupported() {
    try {
      return speechRecognitionService.isSupported();
    } catch (error) {
      console.warn('Error checking speech recognition support:', error);
      return false;
    }
  }

  /**
   * Get service info
   */
  getServiceInfo() {
    return {
      name: 'Web Speech API',
      version: '1.0',
      supported: this.isSupported(),
      initialized: this.isInitialized,
      recording: this.isRecording
    };
  }

  // Ensure service has required methods even if speechRecognitionService is undefined
  getStatus() {
    return {
      isSupported: this.isSupported(),
      isInitialized: this.isInitialized,
      isRecording: this.isRecording
    };
  }
}

// Export singleton instance
const audioTranscriptionService = new AudioTranscriptionService();
export default audioTranscriptionService;