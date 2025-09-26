/**
 * Whisper Error Boundary Component
 * Graceful error handling for ML model failures with progressive fallback
 */

import React from 'react';
import { AlertTriangle, RefreshCw, Mic, Settings } from 'lucide-react';

class WhisperErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorType: 'unknown',
      fallbackMode: null,
      retryCount: 0,
      showDetails: false
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error: error,
      errorType: WhisperErrorBoundary.categorizeError(error)
    };
  }

  componentDidCatch(error, errorInfo) {
    // Log error for debugging
    console.error('🚨 Whisper Error Boundary caught error:', error);
    console.error('📊 Error info:', errorInfo);

    this.setState({
      error,
      errorInfo,
      errorType: WhisperErrorBoundary.categorizeError(error)
    });

    // Determine fallback strategy
    this.determineFallbackStrategy(error);
  }

  static categorizeError(error) {
    const message = error?.message?.toLowerCase() || '';

    if (message.includes('service worker')) {
      return 'service_worker';
    } else if (message.includes('wasm') || message.includes('webassembly')) {
      return 'wasm';
    } else if (message.includes('model') || message.includes('cache')) {
      return 'model';
    } else if (message.includes('audio') || message.includes('microphone')) {
      return 'audio';
    } else if (message.includes('network') || message.includes('fetch')) {
      return 'network';
    } else {
      return 'unknown';
    }
  }

  determineFallbackStrategy = (error) => {
    const { errorType } = this.state;

    // Determine the best fallback mode based on error type
    let fallbackMode = 'web_speech';

    if (errorType === 'service_worker' || errorType === 'wasm') {
      fallbackMode = 'web_speech';
    } else if (errorType === 'model' || errorType === 'network') {
      fallbackMode = 'offline_mode';
    } else if (errorType === 'audio') {
      fallbackMode = 'manual_input';
    }

    this.setState({ fallbackMode });

    // Notify parent component about the fallback
    if (this.props.onFallback) {
      this.props.onFallback(fallbackMode, error);
    }
  };

  handleRetry = () => {
    if (this.state.retryCount < 3) {
      this.setState(prevState => ({
        hasError: false,
        error: null,
        errorInfo: null,
        errorType: 'unknown',
        retryCount: prevState.retryCount + 1
      }));

      // Notify parent to retry
      if (this.props.onRetry) {
        this.props.onRetry(this.state.retryCount + 1);
      }
    }
  };

  handleFallback = (mode) => {
    this.setState({ fallbackMode: mode });
    if (this.props.onFallback) {
      this.props.onFallback(mode, this.state.error);
    }
  };

  toggleDetails = () => {
    this.setState(prevState => ({
      showDetails: !prevState.showDetails
    }));
  };

  getErrorMessage() {
    const { errorType, error } = this.state;

    const messages = {
      service_worker: {
        title: 'Service Worker Issue',
        message: 'There was a problem with the background processing service. Your transcription will work using the built-in browser features instead.',
        icon: <Settings className="w-6 h-6 text-orange-500" />
      },
      wasm: {
        title: 'AI Processing Issue',
        message: 'The advanced AI transcription is temporarily unavailable. We\'ll use the browser\'s built-in speech recognition instead.',
        icon: <AlertTriangle className="w-6 h-6 text-yellow-500" />
      },
      model: {
        title: 'AI Model Loading Issue',
        message: 'Unable to load the AI transcription model. Falling back to browser speech recognition which works great for most needs.',
        icon: <AlertTriangle className="w-6 h-6 text-blue-500" />
      },
      audio: {
        title: 'Audio Processing Issue',
        message: 'There was a problem processing your audio. Please check your microphone permissions and try again.',
        icon: <Mic className="w-6 h-6 text-red-500" />
      },
      network: {
        title: 'Network Issue',
        message: 'Unable to download the AI model due to network issues. The app will work offline with basic transcription.',
        icon: <AlertTriangle className="w-6 h-6 text-gray-500" />
      },
      unknown: {
        title: 'Temporary Issue',
        message: 'Something went wrong with the advanced features. The basic transcription will work normally.',
        icon: <AlertTriangle className="w-6 h-6 text-gray-500" />
      }
    };

    return messages[errorType] || messages.unknown;
  }

  getFallbackOptions() {
    const { errorType } = this.state;

    const options = [
      {
        id: 'web_speech',
        label: 'Use Browser Speech Recognition',
        description: 'Fast, reliable transcription using your browser\'s built-in features',
        icon: <Mic className="w-5 h-5" />,
        recommended: errorType === 'wasm' || errorType === 'service_worker'
      },
      {
        id: 'offline_mode',
        label: 'Continue Offline',
        description: 'Record audio and transcribe later when the AI model is available',
        icon: <Settings className="w-5 h-5" />,
        recommended: errorType === 'network'
      }
    ];

    return options;
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const errorInfo = this.getErrorMessage();
    const fallbackOptions = this.getFallbackOptions();
    const canRetry = this.state.retryCount < 3;

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
          {/* Error Icon and Title */}
          <div className="flex items-center space-x-3 mb-4">
            {errorInfo.icon}
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {errorInfo.title}
              </h2>
              <p className="text-sm text-gray-500">
                Don't worry - everything still works!
              </p>
            </div>
          </div>

          {/* Error Message */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-800">
              {errorInfo.message}
            </p>
          </div>

          {/* Fallback Options */}
          <div className="space-y-3 mb-6">
            <h3 className="font-medium text-gray-900">Choose how to continue:</h3>
            {fallbackOptions.map((option) => (
              <button
                key={option.id}
                onClick={() => this.handleFallback(option.id)}
                className={`w-full p-3 rounded-lg border-2 text-left transition-all ${
                  option.recommended
                    ? 'border-blue-500 bg-blue-50 hover:bg-blue-100'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0 mt-0.5">
                    {option.icon}
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-medium text-gray-900">
                        {option.label}
                      </span>
                      {option.recommended && (
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">
                          Recommended
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      {option.description}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-3">
            {canRetry && (
              <button
                onClick={this.handleRetry}
                className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Try Again ({3 - this.state.retryCount} left)</span>
              </button>
            )}

            <button
              onClick={this.toggleDetails}
              className="px-4 py-2 text-gray-500 hover:text-gray-700 transition-colors"
            >
              {this.state.showDetails ? 'Hide' : 'Show'} Details
            </button>
          </div>

          {/* Error Details (Collapsible) */}
          {this.state.showDetails && (
            <div className="mt-4 p-3 bg-gray-100 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-2">Technical Details:</h4>
              <div className="text-xs text-gray-600 space-y-2">
                <div>
                  <strong>Error Type:</strong> {this.state.errorType}
                </div>
                <div>
                  <strong>Retry Count:</strong> {this.state.retryCount}/3
                </div>
                {this.state.error && (
                  <div>
                    <strong>Message:</strong> {this.state.error.message}
                  </div>
                )}
                {this.state.errorInfo && (
                  <details className="mt-2">
                    <summary className="cursor-pointer">Stack Trace</summary>
                    <pre className="mt-2 text-xs bg-white p-2 rounded border overflow-auto">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </details>
                )}
              </div>
            </div>
          )}

          {/* Help Text */}
          <div className="mt-6 text-center">
            <p className="text-xs text-gray-500">
              This is normal - advanced AI features sometimes need a moment to load.
              Your basic transcription features work perfectly!
            </p>
          </div>
        </div>
      </div>
    );
  }
}

export default WhisperErrorBoundary;