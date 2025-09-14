import React, { useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { AppProvider } from './contexts/AppContext'
import Home from './views/Home-fixed'
import Meeting from './views/Meeting-working'
import ErrorBoundary from './components/ErrorBoundary'
import LoadingSpinner from './components/LoadingSpinner'
import './index.css'

function AppContent() {
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      console.log('App loaded with simple components!')
      setIsLoading(false)
    }, 50)

    return () => clearTimeout(timer)
  }, [])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center animate-fade-in">
          <div className="mb-8">
            <div className="text-4xl font-bold text-blue-600 mb-2">📅</div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">MeetingFlow</h1>
            <p className="text-gray-600">Testing final structure...</p>
          </div>
          <LoadingSpinner size="large" text="Finalizing..." />
        </div>
      </div>
    )
  }

  return (
    <main id="main-content" className="min-h-screen">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/meeting/:id" element={<Meeting />} />
      </Routes>
    </main>
  )
}

function App() {
  console.log('Final working app structure loading...')

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