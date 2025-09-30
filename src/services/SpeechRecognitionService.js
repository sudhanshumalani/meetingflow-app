/**
 * Clean Web Speech API Service
 * Provides live transcription using browser's native speech recognition
 */

class SpeechRecognitionService {
  constructor() {
    this.recognition = null;
    this.isListening = false;
    this.finalTranscript = '';
    this.interimTranscript = '';
    this.onResultCallback = null;
    this.onEndCallback = null;
    this.onErrorCallback = null;
    this.autoRestart = false; // Enable auto-restart on mobile abort errors

    console.log('🎤 SpeechRecognitionService initialized');
  }

  /**
   * Check if Web Speech API is supported
   */
  isSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  /**
   * Initialize speech recognition
   */
  initialize() {
    if (this.recognition) {
      return true; // Already initialized
    }

    if (!this.isSupported()) {
      throw new Error('Web Speech API is not supported in this browser');
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      throw new Error('SpeechRecognition constructor not available');
    }

    this.recognition = new SpeechRecognition();

    // Configure recognition settings
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';
    this.recognition.maxAlternatives = 1;

    // Set up event listeners
    this.recognition.onstart = () => {
      console.log('🎤 Speech recognition started');
      this.isListening = true;
    };

    this.recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = this.finalTranscript;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;

        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      this.finalTranscript = finalTranscript;
      this.interimTranscript = interimTranscript;

      // Call the result callback with both final and interim results
      if (this.onResultCallback) {
        this.onResultCallback({
          final: finalTranscript,
          interim: interimTranscript,
          combined: finalTranscript + interimTranscript
        });
      }
    };

    this.recognition.onerror = (event) => {
      console.error('🚨 Speech recognition error:', event.error);

      // Handle mobile-specific errors with recovery strategies
      if (event.error === 'aborted') {
        console.log('📱 Mobile speech recognition aborted - attempting recovery');
        // Don't call error callback for aborted errors on mobile, try to restart
        this.isListening = false;

        // Auto-restart after a short delay if this was an unexpected abort
        if (this.autoRestart) {
          setTimeout(() => {
            console.log('🔄 Auto-restarting speech recognition after abort');
            this.startListening();
          }, 1000);
        }
        return;
      }

      if (event.error === 'no-speech') {
        console.log('📱 No speech detected - this is normal, continuing...');
        // Don't treat no-speech as an error, just continue
        return;
      }

      if (event.error === 'audio-capture') {
        console.error('📱 Audio capture failed - check microphone permissions');
      }

      if (event.error === 'not-allowed') {
        console.error('📱 Microphone permission denied');
      }

      if (this.onErrorCallback) {
        this.onErrorCallback(event.error);
      }
    };

    this.recognition.onend = () => {
      console.log('🎤 Speech recognition ended');
      this.isListening = false;

      if (this.onEndCallback) {
        this.onEndCallback();
      }
    };

    console.log('✅ Speech recognition initialized');
    return true;
  }

  /**
   * Start listening
   */
  startListening() {
    if (!this.recognition) {
      this.initialize();
    }

    if (this.isListening) {
      console.log('⚠️ Speech recognition is already listening');
      return;
    }

    try {
      this.recognition.start();
      console.log('🎤 Started listening...');
    } catch (error) {
      console.error('❌ Failed to start speech recognition:', error);
      if (this.onErrorCallback) {
        this.onErrorCallback(error.message);
      }
    }
  }

  /**
   * Stop listening
   */
  stopListening() {
    if (!this.recognition || !this.isListening) {
      console.log('⚠️ Speech recognition is not listening');
      return this.finalTranscript;
    }

    try {
      this.recognition.stop();
      console.log('🛑 Stopped listening');
    } catch (error) {
      console.error('❌ Failed to stop speech recognition:', error);
    }

    return this.finalTranscript;
  }

  /**
   * Reset transcript
   */
  reset() {
    this.finalTranscript = '';
    this.interimTranscript = '';
    console.log('🔄 Transcript reset');
  }

  /**
   * Get current transcript
   */
  getTranscript() {
    return {
      final: this.finalTranscript,
      interim: this.interimTranscript,
      combined: this.finalTranscript + this.interimTranscript
    };
  }

  /**
   * Set result callback
   */
  onResult(callback) {
    this.onResultCallback = callback;
  }

  /**
   * Set end callback
   */
  onEnd(callback) {
    this.onEndCallback = callback;
  }

  /**
   * Set error callback
   */
  onError(callback) {
    this.onErrorCallback = callback;
  }

  /**
   * Check if currently listening
   */
  getIsListening() {
    return this.isListening;
  }
}

// Export singleton instance
const speechRecognitionService = new SpeechRecognitionService();
export default speechRecognitionService;