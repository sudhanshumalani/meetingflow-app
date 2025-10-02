import DeviceDetector from './DeviceDetector';

class TranscriptionStreamService {
  constructor(backendUrl) {
    // Default to environment variable or localhost
    this.backendUrl = backendUrl ||
                      import.meta.env.VITE_TRANSCRIPTION_WS ||
                      'ws://localhost:8080';
    this.ws = null;
    this.mediaRecorder = null;
    this.isRecording = false;
    this.stream = null;
    this.silentAudio = null; // For iOS background workaround
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.transcriptCallback = null;
    this.errorCallback = null;
    this.statusCallback = null;
  }

  /**
   * iOS Background Support Workaround
   *
   * CRITICAL: iOS suspends PWAs when screen locks or app is backgrounded.
   * Playing silent audio in a loop keeps the app alive and recording active.
   *
   * This MUST be triggered by user interaction (button click).
   */
  async initializeiOSBackgroundSupport() {
    if (!DeviceDetector.isiOS()) {
      return;
    }

    try {
      this.silentAudio = new Audio();

      // 1 second of silence in WAV format (data URL)
      const silentAudioData = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
      this.silentAudio.src = silentAudioData;
      this.silentAudio.loop = true;

      // Must be triggered by user interaction
      await this.silentAudio.play();
      console.log('✓ iOS background audio enabled - Recording will continue when screen locks');

      this.notifyStatus('iOS background mode enabled');
    } catch (error) {
      console.warn('iOS background audio failed:', error);
      this.notifyStatus('Warning: iOS background mode may not work');
    }
  }

  /**
   * Connect to backend WebSocket server
   */
  connect() {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.backendUrl);

        this.ws.onopen = () => {
          console.log('✓ Connected to transcription service');
          this.reconnectAttempts = 0;
          this.notifyStatus('Connected to transcription service');
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          this.notifyError('Connection error: ' + error.message);
          reject(error);
        };

        this.ws.onclose = () => {
          console.log('WebSocket closed');
          this.notifyStatus('Disconnected from transcription service');
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  handleMessage(data) {
    try {
      const message = JSON.parse(data);

      switch (message.type) {
        case 'ready':
          console.log('✓ Transcription service ready');
          this.notifyStatus('Ready to transcribe');
          break;

        case 'transcript':
          if (this.transcriptCallback) {
            this.transcriptCallback(message.text, message.final || false);
          }
          break;

        case 'complete':
          console.log('✓ Recording session completed');
          this.notifyStatus('Recording completed');
          break;

        case 'error':
          console.error('Server error:', message.message);
          this.notifyError(message.message);
          break;

        case 'pong':
          // Keep-alive response
          break;

        default:
          console.warn('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  }

  /**
   * Capture system audio (DESKTOP ONLY - for Zoom meetings)
   *
   * Only works on Chrome/Edge desktop.
   * Allows capturing audio from Zoom, Meet, Teams, etc.
   */
  async captureSystemAudio() {
    if (!DeviceDetector.supportsSystemAudio()) {
      throw new Error('System audio only available on desktop Chrome/Edge/Firefox');
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: false,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000
        }
      });

      console.log('✓ System audio captured (Zoom/Meet audio)');
      this.notifyStatus('Capturing system audio');

      return stream;
    } catch (error) {
      throw new Error('System audio capture failed: ' + error.message);
    }
  }

  /**
   * Capture microphone (ALL PLATFORMS - for in-person meetings)
   *
   * Works on desktop and mobile.
   * Perfect for in-person meetings.
   */
  async captureMicrophone() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000
        }
      });

      console.log('✓ Microphone captured');
      this.notifyStatus('Capturing microphone');

      return stream;
    } catch (error) {
      throw new Error('Microphone access failed: ' + error.message);
    }
  }

  /**
   * Start recording audio
   *
   * @param {string} mode - 'auto', 'system-audio', or 'microphone'
   */
  async startRecording(mode = 'auto') {
    if (this.isRecording) {
      throw new Error('Already recording');
    }

    try {
      // Auto-detect best mode based on device capabilities
      if (mode === 'auto') {
        mode = DeviceDetector.getRecommendedMode();
      }

      console.log(`Starting recording in ${mode} mode...`);

      // Connect to backend
      await this.connect();

      // Enable iOS background support (must be called BEFORE media capture)
      await this.initializeiOSBackgroundSupport();

      // Capture audio based on mode
      if (mode === 'system-audio') {
        this.stream = await this.captureSystemAudio();
      } else {
        this.stream = await this.captureMicrophone();
      }

      // Create MediaRecorder with best available codec
      const mimeType = this.getBestMimeType();
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType,
        audioBitsPerSecond: 128000
      });

      // Collect chunks for proper WebM assembly
      this.audioChunks = [];

      // Collect audio chunks in array
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      // Send complete audio blob when recording completes each interval
      this.mediaRecorder.onstop = () => {
        if (this.audioChunks.length > 0 && this.ws && this.ws.readyState === WebSocket.OPEN) {
          // Create complete valid Blob from all chunks
          const audioBlob = new Blob(this.audioChunks, { type: mimeType });

          // Convert to base64 and send
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64Audio = reader.result.split(',')[1];
            this.ws.send(JSON.stringify({
              type: 'audio',
              data: base64Audio
            }));
          };
          reader.readAsDataURL(audioBlob);

          this.audioChunks = []; // Clear for next interval
        }

        // Restart recording if still active (for continuous transcription)
        if (this.isRecording && this.stream && this.stream.active) {
          this.mediaRecorder.start();
          // Schedule next stop in 5 seconds for interval transcription
          setTimeout(() => {
            if (this.isRecording && this.mediaRecorder.state === 'recording') {
              this.mediaRecorder.stop();
            }
          }, 5000);
        }
      };

      this.mediaRecorder.onerror = (error) => {
        console.error('MediaRecorder error:', error);
        this.notifyError('Recording error: ' + error.message);
        this.stopRecording();
      };

      // Start recording - will auto-stop after 5 seconds
      this.mediaRecorder.start();
      setTimeout(() => {
        if (this.isRecording && this.mediaRecorder.state === 'recording') {
          this.mediaRecorder.stop(); // Triggers onstop which restarts
        }
      }, 5000);

      this.isRecording = true;

      console.log(`✓ Recording started: ${mode}`);
      this.notifyStatus(`Recording (${mode})`);

      // Keep-alive ping every 30 seconds
      this.keepAliveInterval = setInterval(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30000);

    } catch (error) {
      console.error('Recording error:', error);
      this.cleanup();
      throw error;
    }
  }

  /**
   * Get best available MIME type for MediaRecorder
   */
  getBestMimeType() {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4'
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    return ''; // Use default
  }

  /**
   * Register callback for transcript updates
   */
  onTranscript(callback) {
    this.transcriptCallback = callback;
  }

  /**
   * Register callback for errors
   */
  onError(callback) {
    this.errorCallback = callback;
  }

  /**
   * Register callback for status updates
   */
  onStatus(callback) {
    this.statusCallback = callback;
  }

  /**
   * Stop recording
   */
  stopRecording() {
    if (!this.isRecording) {
      return;
    }

    console.log('Stopping recording...');

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }

    // Send stop signal to process remaining buffered audio
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'stop' }));
    }

    this.isRecording = false;
    this.notifyStatus('Waiting for transcription...');

    // CRITICAL: Whisper takes 6-14 seconds to process!
    // Keep connection open longer to receive transcripts
    setTimeout(() => {
      this.notifyStatus('Processing complete');
      this.cleanup();
    }, 20000); // Wait 20 seconds for Whisper to complete
  }

  /**
   * Cleanup all resources
   */
  cleanup() {
    // Clear keep-alive interval
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }

    // Stop audio tracks
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    // Stop silent audio (iOS workaround)
    if (this.silentAudio) {
      this.silentAudio.pause();
      this.silentAudio = null;
    }

    // Close WebSocket
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    console.log('✓ Cleanup complete');
  }

  /**
   * Notify transcript callback
   */
  notifyTranscript(text, isFinal) {
    if (this.transcriptCallback) {
      this.transcriptCallback(text, isFinal);
    }
  }

  /**
   * Notify error callback
   */
  notifyError(message) {
    if (this.errorCallback) {
      this.errorCallback(message);
    }
  }

  /**
   * Notify status callback
   */
  notifyStatus(message) {
    if (this.statusCallback) {
      this.statusCallback(message);
    }
  }

  /**
   * Check if service is recording
   */
  isActive() {
    return this.isRecording;
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      isRecording: this.isRecording,
      isConnected: this.ws && this.ws.readyState === WebSocket.OPEN,
      platform: DeviceDetector.getPlatformName(),
      capabilities: DeviceDetector.getCapabilities()
    };
  }
}

export default TranscriptionStreamService;
