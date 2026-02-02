import React, { useEffect, useState, useMemo } from 'react'
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom'
import { handleGoogleAuthCallback } from './utils/googleDriveAuth'
import { AppProvider } from './contexts/AppContext'
import SyncProvider from './contexts/SyncProvider'
import Home from './views/Home'
import Meeting from './views/Meeting'
import Settings from './views/Settings'
import SimpleMeetingNotes from './components/SimpleMeetingNotes'
import GoogleAuthCallback from './components/GoogleAuthCallback'
import SpeakerDiarizationTest from './views/SpeakerDiarizationTest'
import MobileRecordView from './views/MobileRecordView'
import { AnalyzerDashboard } from './components/analyzer'
import ErrorBoundary, { ErrorToast } from './components/ErrorBoundary'
import LoadingSpinner from './components/LoadingSpinner'
import CrashRecoveryPrompt from './components/CrashRecoveryPrompt'
import accessibility, { a11y } from './utils/accessibility'
import storage from './utils/storage'
import { isMigrationNeeded, migrateToDexie, initializeDexieService, requestPersistentStorage } from './db'
import { IS_IOS } from './config/firebase'
import './index.css'

// Import debugging utilities (available in both dev and production for troubleshooting)
import('./utils/tokenTestUtils.js').then(() => {
  console.log('🧪 Token testing utilities loaded!')
})
import('./utils/syncDebugUtils.js').then(() => {
  console.log('🔧 Sync debugging utilities loaded!')
})

// Expose Dexie utilities for debugging
import('./db/index.js').then((dexieModule) => {
  window.dexieDB = dexieModule.db
  window.getDexieStats = dexieModule.getDatabaseStats
  window.migrateToDexie = dexieModule.migrateToDexie
  window.rollbackMigration = dexieModule.rollbackMigration
  window.verifyDataIntegrity = dexieModule.verifyDataIntegrity
  window.manageStorage = dexieModule.manageStorage
  window.getOutboxStats = dexieModule.getOutboxStats
  console.log('🗄️ Dexie debugging utilities loaded!')
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
console.log('🗄️ Dexie Database:')
console.log('  - getDexieStats(): Get database statistics')
console.log('  - verifyDataIntegrity(): Compare localStorage vs Dexie')
console.log('  - manageStorage(): Run storage eviction if needed')
console.log('  - getOutboxStats(): Check pending sync operations')
console.log('  - rollbackMigration(): Rollback to localStorage (emergency)')

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
  const [recoveredData, setRecoveredData] = useState(null)

  // Mobile PWA detection - show recording-only interface on mobile
  const isMobilePWA = useMemo(() => {
    if (typeof window === 'undefined') return false
    const isStandalone = window.navigator?.standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    const isMobileUA = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    return IS_IOS || (isStandalone && isTouchDevice && isMobileUA)
  }, [])

  useEffect(() => {
    // Load persisted data on app start
    const loadPersistedData = async () => {
      try {
        a11y.announceLoadingState(true, 'application data')

        // Initialize Dexie and run migration if needed
        try {
          console.log('🗄️ Initializing Dexie database...')
          await initializeDexieService()

          // Request persistent storage (important for iOS)
          await requestPersistentStorage()

          // Check if migration is needed
          const needsMigration = await isMigrationNeeded()
          if (needsMigration) {
            console.log('🔄 Migration needed - migrating data to Dexie...')
            const migrationResult = await migrateToDexie({
              onProgress: (progress) => {
                console.log(`📊 Migration: ${progress.phase} - ${progress.percent}%`)
              }
            })
            if (migrationResult.success) {
              console.log('✅ Migration complete:', migrationResult.stats)
            } else {
              console.error('❌ Migration failed:', migrationResult.error)
              // Don't block app - localStorage still works as backup
            }
          } else {
            console.log('✅ Dexie already initialized, no migration needed')
          }
        } catch (dexieError) {
          console.error('⚠️ Dexie initialization failed (non-fatal):', dexieError)
          // App can still work with localStorage fallback
        }

        // Load storage info for debugging
        const storageInfo = await storage.getStorageInfo()
        console.log('Storage info:', storageInfo)

        // Clean up old/empty transcript buffer sessions (run in background)
        try {
          const StreamingTranscriptBuffer = (await import('./utils/StreamingTranscriptBuffer')).default
          await StreamingTranscriptBuffer.cleanupOldSessions()
        } catch (cleanupError) {
          console.warn('⚠️ Session cleanup failed:', cleanupError)
        }

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

  // Mobile-only mode: Show only the recording interface
  if (isMobilePWA) {
    return (
      <main id="main-content">
        <MobileRecordView />
      </main>
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
            <Route path="/test-speaker-diarization" element={<SpeakerDiarizationTest />} />
            <Route path="/mobile-record" element={<MobileRecordView />} />
            <Route path="/analyzer" element={<AnalyzerDashboard />} />
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

      {/* Crash Recovery Prompt */}
      <CrashRecoveryPrompt
        onRecover={(data) => {
          console.log('🔄 Recovered data from crash:', data)
          setRecoveredData(data)
          // Show success message
          setError(`✅ Recovered ${data.transcript.split(' ').length} words from interrupted recording!`)
          setTimeout(() => setError(null), 5000)
        }}
        onDismiss={() => {
          console.log('ℹ️ User dismissed crash recovery prompt')
        }}
      />

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
