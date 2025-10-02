import React, { useState, useEffect, useRef } from 'react';
import TranscriptionStreamService from '../services/TranscriptionStreamService';
import DeviceDetector from '../services/DeviceDetector';

const WhisperTranscription = ({ onTranscriptUpdate, enabled = false }) => {
  const [service] = useState(() => new TranscriptionStreamService());
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [status, setStatus] = useState('Ready');
  const [error, setError] = useState(null);
  const [capabilities, setCapabilities] = useState(null);
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    // Detect device capabilities
    const caps = DeviceDetector.getCapabilities();
    setCapabilities(caps);

    // Set up event listeners
    service.onTranscript((text, isFinal) => {
      setTranscript(prev => {
        const newTranscript = isFinal ? prev + '\n' + text : prev + ' ' + text;
        if (onTranscriptUpdate) {
          onTranscriptUpdate(newTranscript);
        }
        return newTranscript;
      });
    });

    service.onStatus((message) => {
      setStatus(message);
    });

    service.onError((message) => {
      setError(message);
      setStatus('Error');
    });

    return () => {
      if (service.isActive()) {
        service.stopRecording();
      }
      service.cleanup();
    };
  }, [service, onTranscriptUpdate]);

  const startRecording = async () => {
    try {
      setError(null);
      setStatus('Starting...');
      // DON'T clear transcript - it should accumulate across multiple recordings!
      // If user wants to clear, they can use the Clear button
      // Force microphone mode for web deployment (system-audio requires desktop app)
      await service.startRecording('microphone');
      setIsRecording(true);
    } catch (err) {
      setError(err.message);
      setStatus('Failed to start');
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    service.stopRecording();
    setIsRecording(false);
    setStatus('Stopped');
  };

  const clearTranscript = () => {
    setTranscript('');
    if (onTranscriptUpdate) {
      onTranscriptUpdate('');
    }
  };

  if (!enabled) {
    return null;
  }

  if (!capabilities) {
    return <div className="p-4 text-center">Loading...</div>;
  }

  return (
    <div className="whisper-transcription bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 space-y-4">
      {/* Platform Info */}
      <div className="platform-info bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-700 dark:to-gray-600 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
              {capabilities.platform} - {capabilities.browser}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              {DeviceDetector.getUseCaseMessage()}
            </p>
          </div>
          <button
            onClick={() => setShowInstructions(!showInstructions)}
            className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            {showInstructions ? '✕' : 'ℹ️ Help'}
          </button>
        </div>

        {/* iOS Background Notice */}
        {capabilities.isiOS && (
          <div className="mt-3 p-3 bg-blue-100 dark:bg-blue-900 rounded text-sm text-blue-800 dark:text-blue-200">
            <strong>📱 iOS Background Recording:</strong> Recording will continue even when your screen is locked or you switch apps.
          </div>
        )}

        {/* Instructions */}
        {showInstructions && (
          <div className="mt-4 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600">
            {capabilities.supportsSystemAudio ? (
              // Desktop Instructions
              <div>
                <h4 className="font-semibold mb-2 text-gray-800 dark:text-white">
                  📋 For Zoom Meetings:
                </h4>
                <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700 dark:text-gray-300">
                  <li>Click "Start Recording" button below</li>
                  <li>Select "Entire Screen" or "Window" (choose your Zoom window)</li>
                  <li>
                    <strong className="text-red-600">✅ CHECK "Share audio" checkbox</strong>
                  </li>
                  <li>Click "Share" to start capturing</li>
                  <li>Transcription will appear below in real-time</li>
                </ol>
              </div>
            ) : (
              // Mobile Instructions
              <div>
                <h4 className="font-semibold mb-2 text-gray-800 dark:text-white">
                  📋 For In-Person Meetings:
                </h4>
                <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700 dark:text-gray-300">
                  <li>Click "Start Recording" button below</li>
                  <li>Allow microphone access when prompted</li>
                  <li>Place your device near the speakers</li>
                  {capabilities.isiOS && (
                    <li className="text-blue-600 dark:text-blue-400">
                      <strong>You can lock your screen - recording continues!</strong>
                    </li>
                  )}
                  <li>Transcription will appear below in real-time</li>
                </ol>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className="status-bar flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
        <div className="flex items-center space-x-2">
          <div className={`w-3 h-3 rounded-full ${
            isRecording ? 'bg-red-500 animate-pulse' :
            error ? 'bg-yellow-500' : 'bg-green-500'
          }`} />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {status}
          </span>
        </div>
        {isRecording && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Recording mode: {capabilities.recommendedMode}
          </span>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="error-message p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-700 dark:text-red-300">
            <strong>Error:</strong> {error}
          </p>
        </div>
      )}

      {/* Controls */}
      <div className="controls flex gap-3">
        <button
          onClick={startRecording}
          disabled={isRecording}
          className={`flex-1 py-3 px-6 rounded-lg font-semibold transition-all ${
            isRecording
              ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white shadow-lg hover:shadow-xl'
          }`}
        >
          {isRecording ? '⏺️ Recording...' : '▶️ Start Recording'}
        </button>

        <button
          onClick={stopRecording}
          disabled={!isRecording}
          className={`flex-1 py-3 px-6 rounded-lg font-semibold transition-all ${
            !isRecording
              ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white shadow-lg hover:shadow-xl'
          }`}
        >
          ⏹️ Stop
        </button>

        <button
          onClick={clearTranscript}
          disabled={!transcript || isRecording}
          className={`py-3 px-6 rounded-lg font-semibold transition-all ${
            !transcript || isRecording
              ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
              : 'bg-gray-500 hover:bg-gray-600 text-white'
          }`}
        >
          🗑️
        </button>
      </div>

      {/* Transcript Display */}
      <div className="transcript-container">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-semibold text-gray-800 dark:text-white">
            Live Transcript:
          </h4>
          {transcript && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {transcript.length} characters
            </span>
          )}
        </div>

        <div className="transcript-display min-h-[200px] max-h-[400px] overflow-y-auto p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
          {transcript ? (
            <pre className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200 font-mono">
              {transcript}
            </pre>
          ) : (
            <p className="text-gray-400 dark:text-gray-500 text-center italic">
              Transcript will appear here...
            </p>
          )}
        </div>
      </div>

      {/* Backend Connection Info */}
      <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
        Backend: {service.backendUrl}
      </div>
    </div>
  );
};

export default WhisperTranscription;
