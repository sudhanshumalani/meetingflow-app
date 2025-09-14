import React, { useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom'
import { AppProvider } from './contexts/AppContext'
import Home from './views/Home'
import Meeting from './views/Meeting'
import ErrorBoundary, { ErrorToast } from './components/ErrorBoundary'
import LoadingSpinner from './components/LoadingSpinner'
import accessibility, { a11y } from './utils/accessibility'
import storage from './utils/storage'
import './index.css'

// Page transition component - SIMPLIFIED
function PageTransition({ children }) {
  const location = useLocation()
  const [displayLocation, setDisplayLocation] = useState(location)

  useEffect(() => {
    if (location !== displayLocation) {
      setDisplayLocation(location)
    }
  }, [location, displayLocation])

  return (
    <div className="transition-all duration-200 opacity-100">
      {children}
    </div>
  )
}

function AppContent() {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    // SIMPLIFIED loading process - remove complex async operations
    const loadApp = async () => {
      try {
        console.log('Loading app...')

        // Very minimal delay
        await new Promise(resolve => setTimeout(resolve, 50))

        // Test storage access without complex operations
        try {
          const hasStorage = typeof Storage !== 'undefined'
          console.log('Storage available:', hasStorage)
        } catch (storageError) {
          console.warn('Storage check failed:', storageError)
        }

        // Test accessibility without complex setup
        try {
          if (a11y && a11y.announce) {
            setTimeout(() => a11y.announce('App ready'), 100)
          }
        } catch (a11yError) {
          console.warn('Accessibility setup failed:', a11yError)
        }

        setIsLoading(false)
        console.log('App loaded successfully')

      } catch (error) {
        console.error('App loading error:', error)
        setError('Failed to load application: ' + error.message)
        setIsLoading(false)
      }
    }

    loadApp()
  }, [])

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center bg-white p-8 rounded-lg shadow-lg">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Application Error</h1>
          <p className="text-gray-700 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Reload App
          </button>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center animate-fade-in">
          <div className="mb-8">
            <div className="text-4xl font-bold text-blue-600 mb-2">📅</div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">MeetingFlow</h1>
            <p className="text-gray-600">Loading your intelligent meeting companion...</p>
          </div>
          <LoadingSpinner
            size="large"
            text="Starting app..."
          />
        </div>
      </div>
    )
  }

  return (
    <main id="main-content" className="min-h-screen">
      <PageTransition>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/meeting/:id" element={<Meeting />} />
        </Routes>
      </PageTransition>
    </main>
  )
}

function App() {
  console.log('App component mounting...')

  return (
    <ErrorBoundary>
      <AppProvider>
        <Router>
          <div className="App">
            <AppContent />
          </div>
        </Router>
      </AppProvider>
    </ErrorBoundary>
  )
}

export default App