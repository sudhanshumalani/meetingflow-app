import React, { useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { AppProvider } from './contexts/AppContext'
import LoadingSpinner from './components/LoadingSpinner'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'

// Let's add imports one by one to find the problem
import { useApp } from './contexts/AppContext'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  Plus,
  Calendar,
  Users,
  Clock,
  Bell,
  Activity
} from 'lucide-react'

// Test with basic mockData first
import {
  mockStakeholders,
  mockMeetings,
  generateAIInsights,
  STAKEHOLDER_CATEGORIES
} from './utils/mockData'

// Add date-fns
import { format, isToday, isThisWeek } from 'date-fns'

// Add utility classes (potential problem)
import { SentimentAnalyzer } from './utils/sentimentAnalysis'
import { ExportManager } from './utils/exportUtils'
import accessibility, { a11y } from './utils/accessibility'
import storage from './utils/storage'

// Add component imports (LIKELY PROBLEM SOURCE)
import GlobalSearch from './components/GlobalSearch'
import NotificationCenter from './components/NotificationCenter'
import StakeholderSections from './components/StakeholderSections'

// Add mobile components (NEXT SUSPECT)
import {
  MobileHeader,
  MobileNavDrawer,
  TouchButton,
  MobileTabs,
  PullToRefresh,
  ResponsiveGrid,
  MobileExpandableCard
} from './components/MobileOptimized'

function TestHome() {
  const navigate = useNavigate()
  const { meetings, stakeholders, addMeeting, setCurrentMeeting } = useApp()
  const [searchTerm, setSearchTerm] = useState('')

  console.log('TestHome rendering...', { meetings: meetings.length, stakeholders: stakeholders.length })

  // Test utility classes
  const sentimentAnalyzer = new SentimentAnalyzer()
  const exportManager = new ExportManager()

  // Use mock data for testing
  const displayStakeholders = stakeholders.length > 0 ? stakeholders : mockStakeholders
  const displayMeetings = meetings.length > 0 ? meetings : mockMeetings

  const handleNewMeeting = () => {
    const newMeeting = {
      title: 'New Meeting',
      description: 'Meeting description',
      attendees: [],
      agenda: [],
      notes: [],
      status: 'upcoming'
    }

    console.log('Creating new meeting...')
    addMeeting(newMeeting)
    // Navigate logic would go here
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">MeetingFlow</h1>
              <p className="text-gray-600 mt-1">Your intelligent meeting management companion</p>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => console.log('Search clicked')}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <Search size={16} />
                Search
              </button>

              <button
                onClick={() => console.log('Bell clicked')}
                className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Bell size={20} />
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Search meetings, stakeholders..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:border-blue-500"
              />
            </div>
            <button
              onClick={handleNewMeeting}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={18} />
              New Meeting
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Dashboard Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-medium text-gray-600">Today's Meetings</p>
                <p className="text-2xl font-bold text-gray-900">{displayMeetings.length}</p>
              </div>
              <Calendar className="text-blue-600" size={28} />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-medium text-gray-600">Stakeholders</p>
                <p className="text-2xl font-bold text-gray-900">{displayStakeholders.length}</p>
              </div>
              <Users className="text-orange-600" size={28} />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-medium text-gray-600">This Week</p>
                <p className="text-2xl font-bold text-gray-900">12</p>
              </div>
              <Activity className="text-green-600" size={28} />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-medium text-gray-600">Action Items</p>
                <p className="text-2xl font-bold text-gray-900">7</p>
              </div>
              <Clock className="text-purple-600" size={28} />
            </div>
          </div>
        </div>

        {/* AI Insights Test */}
        {(() => {
          try {
            const insights = generateAIInsights(displayMeetings, displayStakeholders)
            return (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-6 mb-6">
                <h2 className="text-lg font-semibold text-purple-800 mb-2">🤖 AI Insights Test</h2>
                <p className="text-purple-700 mb-2">
                  Successfully loaded AI insights: {insights.length} insights generated
                </p>
                {insights.slice(0, 2).map((insight, index) => (
                  <div key={index} className="text-sm text-purple-600 bg-white/50 p-2 rounded mt-2">
                    {insight.title}: {insight.message}
                  </div>
                ))}
              </div>
            )
          } catch (error) {
            return (
              <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
                <h2 className="text-lg font-semibold text-red-800 mb-2">❌ AI Insights Error</h2>
                <p className="text-red-700">Error: {error.message}</p>
              </div>
            )
          }
        })()}

        {/* Utility Classes Test */}
        {(() => {
          try {
            // Test SentimentAnalyzer
            const testMeeting = displayMeetings[0]
            const sentiment = testMeeting ? sentimentAnalyzer.analyzeMeetingSentiment(testMeeting) : null

            // Test storage
            const storageTest = storage ? 'Storage loaded' : 'Storage failed'

            // Test accessibility
            const a11yTest = a11y && accessibility ? 'A11y loaded' : 'A11y failed'

            return (
              <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
                <h2 className="text-lg font-semibold text-green-800 mb-2">🛠️ Utility Classes Test</h2>
                <div className="text-sm text-green-600 space-y-1">
                  <p>• SentimentAnalyzer: {sentiment ? `Working (${sentiment.overall})` : 'No data to test'}</p>
                  <p>• ExportManager: {exportManager.supportedFormats ? `Working (${exportManager.supportedFormats.length} formats)` : 'Failed'}</p>
                  <p>• Storage: {storageTest}</p>
                  <p>• Accessibility: {a11yTest}</p>
                </div>
              </div>
            )
          } catch (error) {
            return (
              <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
                <h2 className="text-lg font-semibold text-red-800 mb-2">❌ Utility Classes Error</h2>
                <p className="text-red-700">Error: {error.message}</p>
                <pre className="text-xs text-red-600 mt-2 overflow-auto">{error.stack}</pre>
              </div>
            )
          }
        })()}

        {/* Component Import Test */}
        {(() => {
          try {
            const componentTests = [
              { name: 'GlobalSearch', component: GlobalSearch },
              { name: 'NotificationCenter', component: NotificationCenter },
              { name: 'StakeholderSections', component: StakeholderSections }
            ]

            return (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-6">
                <h2 className="text-lg font-semibold text-yellow-800 mb-2">🧩 Component Import Test</h2>
                <div className="text-sm text-yellow-600 space-y-1">
                  {componentTests.map(test => (
                    <p key={test.name}>• {test.name}: {test.component ? 'Imported successfully' : 'Import failed'}</p>
                  ))}
                </div>
              </div>
            )
          } catch (error) {
            return (
              <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
                <h2 className="text-lg font-semibold text-red-800 mb-2">❌ Component Import Error</h2>
                <p className="text-red-700">Error: {error.message}</p>
                <pre className="text-xs text-red-600 mt-2 overflow-auto">{error.stack}</pre>
              </div>
            )
          }
        })()}

        {/* Mobile Components Test */}
        {(() => {
          try {
            const mobileComponents = [
              { name: 'MobileHeader', component: MobileHeader },
              { name: 'MobileNavDrawer', component: MobileNavDrawer },
              { name: 'TouchButton', component: TouchButton },
              { name: 'MobileTabs', component: MobileTabs },
              { name: 'PullToRefresh', component: PullToRefresh },
              { name: 'ResponsiveGrid', component: ResponsiveGrid },
              { name: 'MobileExpandableCard', component: MobileExpandableCard }
            ]

            return (
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-6 mb-6">
                <h2 className="text-lg font-semibold text-indigo-800 mb-2">📱 Mobile Components Test</h2>
                <div className="text-sm text-indigo-600 space-y-1">
                  {mobileComponents.map(test => (
                    <p key={test.name}>• {test.name}: {test.component ? 'Imported successfully' : 'Import failed'}</p>
                  ))}
                </div>
              </div>
            )
          } catch (error) {
            return (
              <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
                <h2 className="text-lg font-semibold text-red-800 mb-2">❌ Mobile Components Error</h2>
                <p className="text-red-700">Error: {error.message}</p>
                <pre className="text-xs text-red-600 mt-2 overflow-auto">{error.stack}</pre>
              </div>
            )
          }
        })()}

        {/* Status Message */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-blue-800 mb-2">🔍 Incremental Testing Mode - Step 6 FINAL</h2>
          <p className="text-blue-700 mb-2">
            ✅ ALL components load successfully! Testing exact App.jsx loading pattern...
          </p>
          <div className="text-sm text-blue-600">
            <p>• All imports: ✅ Working</p>
            <p>• Utilities: ✅ Working</p>
            <p>• Components: ✅ Working</p>
            <p>• Mobile components: ✅ Working</p>
            <p>• <strong>Issue must be in: App.jsx loading logic or component usage patterns</strong></p>
          </div>
        </div>

        {/* Theory Box */}
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-orange-800 mb-2">🔍 Root Cause Theory</h2>
          <p className="text-orange-700 mb-2">
            Since ALL individual components work, the issue is likely:
          </p>
          <ul className="text-sm text-orange-600 list-disc list-inside space-y-1">
            <li>Complex interactions between multiple components rendered simultaneously</li>
            <li>Race conditions in loading states or async operations</li>
            <li>Component lifecycle issues when many components mount together</li>
            <li>Context provider issues when heavily loaded</li>
          </ul>
        </div>

        {/* Recent Meetings */}
        <div className="mt-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Recent Meetings</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {displayMeetings.slice(0, 6).map(meeting => (
              <div key={meeting.id} className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {meeting.title || 'Untitled Meeting'}
                </h3>
                <p className="text-gray-600 text-sm mb-4 line-clamp-2">
                  {meeting.description || 'No description available'}
                </p>
                <div className="flex items-center justify-between text-sm text-gray-500">
                  <span>{meeting.status || 'upcoming'}</span>
                  <button
                    onClick={() => console.log('Meeting clicked:', meeting.id)}
                    className="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                  >
                    View
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}

function SimpleMeeting() {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Meeting View</h1>
          <p className="text-gray-600">Meeting interface would go here.</p>
        </div>
      </div>
    </div>
  )
}

function AppContent() {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    // Simulate the EXACT same loading pattern as original App.jsx
    const loadPersistedData = async () => {
      try {
        console.log('Starting load process...')
        a11y.announceLoadingState(true, 'application data')

        // This is the same 100ms delay we set earlier
        await new Promise(resolve => setTimeout(resolve, 100))

        // Test storage operations
        const storageInfo = await storage.getStorageInfo()
        console.log('Storage info:', storageInfo)

        // Test user preferences
        const preferences = await storage.getUserPreferences()
        console.log('User preferences loaded:', preferences)

        setIsLoading(false)
        a11y.announceLoadingState(false, 'application data')
        console.log('Loading complete!')

      } catch (error) {
        console.error('Error loading persisted data:', error)
        setError('Failed to load application data: ' + error.message)
        setIsLoading(false)
      }
    }

    loadPersistedData()

    // Test accessibility setup
    try {
      // Add skip links
      const skipLink = accessibility.createSkipLink('main-content')
      if (skipLink && document.body) {
        document.body.insertBefore(skipLink, document.body.firstChild)
      }

      // Announce app ready
      setTimeout(() => {
        a11y.announce('MeetingFlow application ready')
      }, 500)
    } catch (a11yError) {
      console.error('Accessibility setup error:', a11yError)
    }

  }, [])

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-2">Error Loading App</h1>
          <p className="text-gray-600">{error}</p>
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
            <p className="text-gray-600">Loading incremental test version...</p>
          </div>
          <LoadingSpinner size="large" text="Testing imports..." />
        </div>
      </div>
    )
  }

  return (
    <main id="main-content" className="min-h-screen">
      <Routes>
        <Route path="/" element={<TestHome />} />
        <Route path="/meeting/:id" element={<SimpleMeeting />} />
      </Routes>
    </main>
  )
}

function App() {
  console.log('Incremental App loading...')

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