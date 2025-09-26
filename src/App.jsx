import React, { useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom'
import { handleGoogleAuthCallback } from './utils/googleDriveAuth'
import { AppProvider } from './contexts/AppContext'
import SyncProvider from './contexts/SyncProvider'
import Home from './views/Home'
import Meeting from './views/Meeting'
import Settings from './views/Settings'
import SimpleMeetingNotes from './components/SimpleMeetingNotes'
import GoogleAuthCallback from './components/GoogleAuthCallback'
import ErrorBoundary, { ErrorToast } from './components/ErrorBoundary'
import LoadingSpinner from './components/LoadingSpinner'
import accessibility, { a11y } from './utils/accessibility'
import storage from './utils/storage'
import './index.css'

// Import debugging utilities (available in both dev and production for troubleshooting)
import('./utils/tokenTestUtils.js').then(() => {
  console.log('🧪 Token testing utilities loaded!')
})
import('./utils/syncDebugUtils.js').then(() => {
  console.log('🔧 Sync debugging utilities loaded!')
})

console.log('🛠️ Debug Commands Available:')
console.log('📊 Token Testing:')
console.log('  - testTokens(): Run all token tests')
console.log('  - checkTokenStatus(): Check current token status')
console.log('  - testSilentAuth(): Test silent authentication')
console.log('  - simulateExpiration(): Simulate token expiration')
console.log('🔄 Sync Testing:')
console.log('  - debugSync(): Run comprehensive sync tests')
console.log('  - testLocalStorage(): Check local data storage')
console.log('  - testGoogleDrive(): Test Google Drive access')
console.log('  - testUpload(): Test upload to cloud')
console.log('  - testDownload(): Test download from cloud')
console.log('  - testFullSync(): Test complete round-trip sync')

// Page transition component
function PageTransition({ children }) {
  const location = useLocation()
  const [displayLocation, setDisplayLocation] = useState(location)
  const [transitionStage, setTransitionStage] = useState('fadeIn')

  useEffect(() => {
    if (location !== displayLocation) {
      setTransitionStage('fadeOut')
    }
  }, [location, displayLocation])

  return (
    <div
      className={`transition-all duration-300 ${
        transitionStage === 'fadeOut' ? 'opacity-0 transform scale-95' : 'opacity-100 transform scale-100'
      }`}
      onTransitionEnd={() => {
        if (transitionStage === 'fadeOut') {
          setDisplayLocation(location)
          setTransitionStage('fadeIn')
          
          // Announce page change for screen readers
          const pageName = location.pathname === '/' ? 'Home' : 
                          location.pathname.includes('/meeting') ? 'Meeting' : 'Page'
          a11y.announcePageChange(pageName)
        }
      }}
    >
      {children}
    </div>
  )
}

function AppContent() {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showShortcuts, setShowShortcuts] = useState(false)

  useEffect(() => {
    // Load persisted data on app start
    const loadPersistedData = async () => {
      try {
        a11y.announceLoadingState(true, 'application data')
        
        // Simulate loading time for better UX
        await new Promise(resolve => setTimeout(resolve, 100))
        
        // Load storage info for debugging
        const storageInfo = await storage.getStorageInfo()
        console.log('Storage info:', storageInfo)
        
        // Load user preferences
        const preferences = await storage.getUserPreferences()
        console.log('User preferences loaded:', preferences)
        
        setIsLoading(false)
        a11y.announceLoadingState(false, 'application data')
        
      } catch (error) {
        console.error('Error loading persisted data:', error)
        setError('Failed to load application data')
        setIsLoading(false)
      }
    }

    loadPersistedData()

    // Set up global event listeners for accessibility
    const handleOpenSearch = () => {
      const event = new CustomEvent('app:open-search')
      window.dispatchEvent(event)
    }

    const handleOpenNotifications = () => {
      const event = new CustomEvent('app:open-notifications') 
      window.dispatchEvent(event)
    }

    const handleShowShortcuts = () => {
      setShowShortcuts(true)
    }

    document.addEventListener('app:open-search', handleOpenSearch)
    document.addEventListener('app:open-notifications', handleOpenNotifications)
    document.addEventListener('app:show-shortcuts', handleShowShortcuts)

    // Add skip links
    const skipLink = accessibility.createSkipLink('main-content')
    document.body.insertBefore(skipLink, document.body.firstChild)

    // Register service worker for development mode
    if ('serviceWorker' in navigator && import.meta.env.DEV) {
      const swPath = import.meta.env.BASE_URL + 'sw-dev.js'
      navigator.serviceWorker.register(swPath, {
        scope: import.meta.env.BASE_URL
      })
        .then((registration) => {
          console.log('🔧 Enhanced Service Worker registered:', registration)
        })
        .catch((error) => {
          console.error('🚨 Service Worker registration failed:', error)
        })
    }

    // Announce app ready
    setTimeout(() => {
      a11y.announce('MeetingFlow application ready')
    }, 2000)

    return () => {
      document.removeEventListener('app:open-search', handleOpenSearch)
      document.removeEventListener('app:open-notifications', handleOpenNotifications)
      document.removeEventListener('app:show-shortcuts', handleShowShortcuts)
      
      if (skipLink && skipLink.parentNode) {
        skipLink.parentNode.removeChild(skipLink)
      }
    }
  }, [])

  // Handle online/offline status
  useEffect(() => {
    const handleOnline = () => {
      a11y.announce('Connection restored', 'assertive')
    }
    
    const handleOffline = () => {
      a11y.announce('Connection lost. Working offline.', 'assertive')
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

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
          <div className="mt-8 space-y-2">
            <div className="skeleton h-4 bg-gray-200 rounded w-64 mx-auto"></div>
            <div className="skeleton h-4 bg-gray-200 rounded w-48 mx-auto"></div>
            <div className="skeleton h-4 bg-gray-200 rounded w-56 mx-auto"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <main id="main-content">
        <PageTransition>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/meeting/:id" element={<Meeting />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/test-notes" element={<SimpleMeetingNotes />} />
            <Route path="/auth/google/callback" element={<GoogleAuthCallback />} />
            {/* Catch-all route for any unmatched paths - redirect to home */}
            <Route path="*" element={<Home />} />
          </Routes>
        </PageTransition>
      </main>

      {/* Error Toast */}
      {error && (
        <ErrorToast
          message={error}
          onClose={() => setError(null)}
          actionLabel="Reload"
          onAction={() => window.location.reload()}
        />
      )}

      {/* Keyboard Shortcuts Modal */}
      {showShortcuts && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center modal-overlay">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full mx-4 p-6 modal-content animate-scale-in">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Keyboard Shortcuts</h2>
              <button 
                onClick={() => setShowShortcuts(false)}
                className="p-1 hover:bg-gray-100 rounded focus-ring"
                aria-label="Close shortcuts"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <kbd className="px-2 py-1 bg-gray-100 rounded text-sm font-mono">Ctrl+K</kbd>
                <span className="text-sm text-gray-600 ml-4">Open global search</span>
              </div>
              <div className="flex justify-between items-center">
                <kbd className="px-2 py-1 bg-gray-100 rounded text-sm font-mono">Ctrl+N</kbd>
                <span className="text-sm text-gray-600 ml-4">Open notifications</span>
              </div>
              <div className="flex justify-between items-center">
                <kbd className="px-2 py-1 bg-gray-100 rounded text-sm font-mono">Esc</kbd>
                <span className="text-sm text-gray-600 ml-4">Close modals</span>
              </div>
              <div className="flex justify-between items-center">
                <kbd className="px-2 py-1 bg-gray-100 rounded text-sm font-mono">Tab</kbd>
                <span className="text-sm text-gray-600 ml-4">Navigate elements</span>
              </div>
              <div className="flex justify-between items-center">
                <kbd className="px-2 py-1 bg-gray-100 rounded text-sm font-mono">?</kbd>
                <span className="text-sm text-gray-600 ml-4">Show this help</span>
              </div>
            </div>
            <div className="mt-6 text-center">
              <button 
                onClick={() => setShowShortcuts(false)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors button-press focus-ring"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Accessibility Status Indicator (dev only) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="fixed bottom-4 left-4 z-40">
          <div className="bg-black text-white px-3 py-1 rounded-full text-xs opacity-50 hover:opacity-100 transition-opacity">
            A11y: {navigator.onLine ? '🟢' : '🔴'} Online
          </div>
        </div>
      )}
    </>
  )
}

function App() {
  // Detect if we're running as iOS standalone app
  const isStandalone = window.navigator.standalone ||
                      window.matchMedia('(display-mode: standalone)').matches ||
                      new URLSearchParams(window.location.search).has('standalone')

  // For GitHub Pages, we need to handle routing differently for standalone vs browser
  // In standalone mode, GitHub Pages serves from the start_url which includes the repo path
  // but the router expects the basename to be correct
  const basename = import.meta.env.PROD ? '/meetingflow-app' : ''

  // Log for debugging (dev only)
  if (import.meta.env.DEV) {
    console.log('App routing info:', {
      isStandalone,
      isProd: import.meta.env.PROD,
      basename,
      userAgent: navigator.userAgent,
      displayMode: window.matchMedia('(display-mode: standalone)').matches,
      hasStandaloneParam: new URLSearchParams(window.location.search).has('standalone'),
      currentURL: window.location.href,
      pathname: window.location.pathname
    })
  }

  // Handle initial redirect for iOS standalone if needed
  React.useEffect(() => {
    if (isStandalone && import.meta.env.PROD) {
      // Clean up the URL by removing the standalone parameter
      const url = new URL(window.location.href)
      if (url.searchParams.has('standalone')) {
        url.searchParams.delete('standalone')
        window.history.replaceState({}, document.title, url.pathname + url.hash)
      }
    }
  }, [isStandalone])

  return (
    <ErrorBoundary>
      <AppProvider>
        <SyncProvider>
          <Router basename={basename}>
            <div className="App">
              <AppContent />
            </div>
          </Router>
        </SyncProvider>
      </AppProvider>
    </ErrorBoundary>
  )
}

export default App
