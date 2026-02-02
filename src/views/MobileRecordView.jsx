import React, { useState, useEffect } from 'react'
import { Cloud, Smartphone, CheckCircle } from 'lucide-react'
import MobileRecorder from '../components/MobileRecorder'
import { saveMobileRecording } from '../utils/mobileFirestoreService'

/**
 * SIMPLIFIED MOBILE RECORDING VIEW
 *
 * This view is designed specifically for iOS mobile recording.
 * It provides a clean, focused interface for:
 * 1. Recording audio
 * 2. Uploading to AssemblyAI
 * 3. Saving minimal metadata to Firestore
 *
 * The full transcript will be fetched by the desktop app.
 */
const MobileRecordView = () => {
  const [recordingResult, setRecordingResult] = useState(null)
  const [saveStatus, setSaveStatus] = useState(null) // 'saving', 'saved', 'error'
  const [saveError, setSaveError] = useState(null)
  const [title, setTitle] = useState('')
  const [isEditingTitle, setIsEditingTitle] = useState(false)

  // Generate default meeting title
  useEffect(() => {
    const now = new Date()
    const defaultTitle = `Meeting ${now.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    })} ${now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })}`
    setTitle(defaultTitle)
  }, [])

  // Handle recording complete
  const handleRecordingComplete = async (result) => {
    console.log('📱 Recording complete:', result)
    setRecordingResult(result)

    // Auto-save to Firestore
    await saveToFirestore(result)
  }

  // Save minimal data to Firestore
  const saveToFirestore = async (result) => {
    try {
      setSaveStatus('saving')
      setSaveError(null)

      const meetingData = {
        title: title || `Meeting ${new Date().toLocaleDateString()}`,
        assemblyAITranscriptId: result.transcriptId,
        audioSize: result.audioSize,
        duration: result.duration,
        recordedAt: new Date().toISOString(),
        platform: 'mobile-ios',
        status: 'processing' // Will be updated when transcript is ready
      }

      const savedMeeting = await saveMobileRecording(meetingData)
      console.log('✅ Meeting saved to Firestore:', savedMeeting.id)

      setSaveStatus('saved')

      // Store locally for reference
      localStorage.setItem('latest_mobile_meeting', JSON.stringify({
        ...meetingData,
        id: savedMeeting.id
      }))

    } catch (error) {
      console.error('❌ Failed to save to Firestore:', error)
      setSaveStatus('error')
      setSaveError(error.message)
    }
  }

  // Handle error from recorder
  const handleError = (errorMessage) => {
    console.error('📱 Recording error:', errorMessage)
    // Error is already displayed in MobileRecorder component
  }

  // Start new recording
  const startNewRecording = () => {
    setRecordingResult(null)
    setSaveStatus(null)
    setSaveError(null)

    // Generate new title
    const now = new Date()
    const newTitle = `Meeting ${now.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    })} ${now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })}`
    setTitle(newTitle)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Simplified Header - No navigation */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200">
        <div className="max-w-lg mx-auto px-4 py-4">
          <div className="flex items-center justify-center">
            <Smartphone className="w-5 h-5 text-indigo-600 mr-2" />
            <span className="font-semibold text-gray-900">MeetingFlow</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Meeting Title */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Meeting Title
          </label>
          {isEditingTitle ? (
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => setIsEditingTitle(false)}
              onKeyDown={(e) => e.key === 'Enter' && setIsEditingTitle(false)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              autoFocus
            />
          ) : (
            <button
              onClick={() => setIsEditingTitle(true)}
              className="w-full text-left px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-md transition-colors"
            >
              <span className="text-gray-900">{title || 'Tap to add title'}</span>
            </button>
          )}
        </div>

        {/* Recorder Component */}
        <MobileRecorder
          onRecordingComplete={handleRecordingComplete}
          onError={handleError}
        />

        {/* Save Status */}
        {saveStatus && (
          <div className={`rounded-lg border p-4 ${
            saveStatus === 'saving'
              ? 'bg-blue-50 border-blue-200'
              : saveStatus === 'saved'
                ? 'bg-green-50 border-green-200'
                : 'bg-red-50 border-red-200'
          }`}>
            <div className="flex items-center gap-3">
              {saveStatus === 'saving' && (
                <>
                  <Cloud className="w-5 h-5 text-blue-600 animate-pulse" />
                  <span className="text-sm text-blue-700">Saving to cloud...</span>
                </>
              )}
              {saveStatus === 'saved' && (
                <>
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span className="text-sm text-green-700">Saved! Access from desktop.</span>
                </>
              )}
              {saveStatus === 'error' && (
                <div className="flex-1">
                  <p className="text-sm text-red-700 font-medium">Failed to save</p>
                  <p className="text-xs text-red-600 mt-1">{saveError}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Success State - Record another option */}
        {recordingResult && saveStatus === 'saved' && (
          <button
            onClick={startNewRecording}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors"
          >
            Record Another Meeting
          </button>
        )}

        {/* Debug info */}
        {import.meta.env.DEV && recordingResult && (
          <div className="text-xs text-gray-400 p-3 bg-gray-100 rounded-lg space-y-1">
            <p>Transcript ID: {recordingResult.transcriptId}</p>
            <p>Audio Size: {(recordingResult.audioSize / 1024 / 1024).toFixed(2)} MB</p>
            <p>Duration: {recordingResult.duration}s</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default MobileRecordView
