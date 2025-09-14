import React from 'react'
import { AlertTriangle, RefreshCw, Home, Bug } from 'lucide-react'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { 
      hasError: false, 
      error: null, 
      errorInfo: null,
      retryCount: 0 
    }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    this.setState({
      error: error,
      errorInfo: errorInfo
    })
    
    // Log error to console for development
    console.error('Error caught by boundary:', error, errorInfo)
    
    // In production, you would send this to your error reporting service
    // trackError(error, errorInfo)
  }

  handleRetry = () => {
    this.setState(prevState => ({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: prevState.retryCount + 1
    }))
  }

  handleGoHome = () => {
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError) {
      const isDevelopment = process.env.NODE_ENV === 'development'
      
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6 animate-scale-in">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4">
                <AlertTriangle className="h-8 w-8 text-red-600" />
              </div>
              
              <h1 className="text-xl font-semibold text-gray-900 mb-2">
                Oops! Something went wrong
              </h1>
              
              <p className="text-gray-600 mb-6">
                We're sorry, but something unexpected happened. Please try again.
              </p>
              
              <div className="space-y-3">
                <button
                  onClick={this.handleRetry}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors button-press focus-ring"
                >
                  <RefreshCw size={16} />
                  Try Again ({this.state.retryCount}/3)
                </button>
                
                <button
                  onClick={this.handleGoHome}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors button-press focus-ring"
                >
                  <Home size={16} />
                  Go to Home
                </button>
              </div>
              
              {isDevelopment && this.state.error && (
                <details className="mt-6 text-left">
                  <summary className="flex items-center gap-2 cursor-pointer text-sm text-gray-500 hover:text-gray-700">
                    <Bug size={14} />
                    Developer Details
                  </summary>
                  <div className="mt-3 p-3 bg-gray-100 rounded text-xs font-mono text-red-600 overflow-auto max-h-32">
                    <div className="font-semibold mb-1">Error:</div>
                    <div className="mb-2">{this.state.error.toString()}</div>
                    <div className="font-semibold mb-1">Stack Trace:</div>
                    <pre>{this.state.errorInfo.componentStack}</pre>
                  </div>
                </details>
              )}
              
              <p className="mt-4 text-xs text-gray-500">
                If this problem persists, please contact support
              </p>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

// Error Toast Component
export function ErrorToast({ 
  message = 'Something went wrong', 
  onClose, 
  actionLabel,
  onAction,
  type = 'error'
}) {
  const typeStyles = {
    error: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800'
  }

  const icons = {
    error: <AlertTriangle size={16} className="text-red-500" />,
    warning: <AlertTriangle size={16} className="text-yellow-500" />,
    info: <AlertTriangle size={16} className="text-blue-500" />
  }

  return (
    <div className={`fixed top-4 right-4 z-50 max-w-sm w-full border rounded-lg p-4 shadow-lg animate-slide-in-right ${typeStyles[type]}`}>
      <div className="flex items-start gap-3">
        {icons[type]}
        <div className="flex-1">
          <p className="text-sm font-medium">{message}</p>
          {(actionLabel || onClose) && (
            <div className="mt-2 flex gap-2">
              {actionLabel && onAction && (
                <button
                  onClick={onAction}
                  className="text-xs underline hover:no-underline font-medium"
                >
                  {actionLabel}
                </button>
              )}
              {onClose && (
                <button
                  onClick={onClose}
                  className="text-xs underline hover:no-underline font-medium opacity-75"
                >
                  Dismiss
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Network Error Component
export function NetworkError({ onRetry, className = '' }) {
  return (
    <div className={`text-center py-8 ${className}`}>
      <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-gray-100 mb-4">
        <AlertTriangle className="h-6 w-6 text-gray-600" />
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-2">
        Connection Problem
      </h3>
      <p className="text-gray-600 mb-4">
        Please check your internet connection and try again.
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors button-press focus-ring"
        >
          <RefreshCw size={16} />
          Try Again
        </button>
      )}
    </div>
  )
}

// Empty State Component
export function EmptyState({ 
  icon: Icon = AlertTriangle, 
  title = 'No data available', 
  description = 'There\'s nothing to show here yet.',
  actionLabel,
  onAction,
  className = ''
}) {
  return (
    <div className={`text-center py-12 ${className}`}>
      <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-gray-100 mb-4">
        <Icon className="h-8 w-8 text-gray-600" />
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-600 mb-6 max-w-sm mx-auto">{description}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors button-press focus-ring"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}

export default ErrorBoundary