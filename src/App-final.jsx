import React, { useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { AppProvider } from './contexts/AppContext'
import Home from './views/Home-working'
import Meeting from './views/Meeting'
import ErrorBoundary, { ErrorToast } from './components/ErrorBoundary'
import LoadingSpinner from './components/LoadingSpinner'
import './index.css'

function AppContent() {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    // Simple loading process
    const timer = setTimeout(() => {
      console.log('App loaded successfully!')
      setIsLoading(false)
    }, 100)

    return () => clearTimeout(timer)
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
          <ErrorToast
            message={error}
            onClose={() => setError(null)}
          />
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
            <p className="text-gray-600">Your intelligent meeting companion</p>
          </div>
          <LoadingSpinner
            size="large"
            text="Loading your data..."
            className="animate-bounce-subtle"
          />
        </div>
      </div>
    )
  }

  return (
    <main id="main-content" className="min-h-screen">
      <div className="transition-all duration-300 opacity-100 transform scale-100">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/meeting/:id" element={<Meeting />} />
        </Routes>
      </div>
    </main>
  )
}

function App() {
  console.log('Final App loading...')

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