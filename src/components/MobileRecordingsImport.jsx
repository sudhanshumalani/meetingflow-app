import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Smartphone,
  RefreshCw,
  Download,
  CheckCircle,
  Clock,
  AlertCircle,
  Loader2,
  FileText,
  Calendar,
  Timer,
  ChevronDown,
  ChevronUp,
  ExternalLink
} from 'lucide-react'
import { getMobileRecordings, updateMobileRecording } from '../utils/mobileFirestoreService'
import assemblyAISpeakerService from '../services/assemblyAISpeakerService'
import { useApp } from '../contexts/AppContext'
import { v4 as uuidv4 } from 'uuid'

/**
 * MOBILE RECORDINGS IMPORT (Desktop Component)
 *
 * This component allows desktop users to:
 * 1. View recordings made on mobile devices
 * 2. Check transcript processing status
 * 3. Import completed transcripts as meetings
 */
const MobileRecordingsImport = ({ onClose }) => {
  const navigate = useNavigate()
  const { addMeeting } = useApp()

  const [recordings, setRecordings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [importingId, setImportingId] = useState(null)
  const [transcriptCache, setTranscriptCache] = useState({})

  // Load recordings on mount
  useEffect(() => {
    loadRecordings()
  }, [])

  // Load mobile recordings from Firestore
  const loadRecordings = async () => {
    try {
      setLoading(true)
      setError(null)

      const data = await getMobileRecordings()
      setRecordings(data)

      // Check transcript status for processing recordings
      await checkTranscriptStatuses(data)

    } catch (err) {
      console.error('Failed to load mobile recordings:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Refresh recordings
  const handleRefresh = async () => {
    setRefreshing(true)
    await loadRecordings()
    setRefreshing(false)
  }

  // Check transcript status for all recordings
  const checkTranscriptStatuses = async (recordingsList) => {
    const cache = { ...transcriptCache }

    for (const recording of recordingsList) {
      if (recording.assemblyAITranscriptId && recording.status !== 'imported') {
        try {
          const transcript = await assemblyAISpeakerService.fetchTranscriptById(
            recording.assemblyAITranscriptId
          )

          if (transcript) {
            cache[recording.assemblyAITranscriptId] = transcript

            // Update Firestore if status changed
            if (transcript.status === 'completed' && recording.status === 'processing') {
              await updateMobileRecording(recording.id, { status: 'completed' })
            }
          }
        } catch (err) {
          console.warn(`Failed to check transcript ${recording.assemblyAITranscriptId}:`, err)
        }
      }
    }

    setTranscriptCache(cache)
  }

  // Fetch full transcript for a recording
  const fetchTranscript = async (recording) => {
    if (!recording.assemblyAITranscriptId) return null

    // Check cache first
    if (transcriptCache[recording.assemblyAITranscriptId]?.text) {
      return transcriptCache[recording.assemblyAITranscriptId]
    }

    try {
      const transcript = await assemblyAISpeakerService.fetchTranscriptById(
        recording.assemblyAITranscriptId
      )

      if (transcript) {
        setTranscriptCache(prev => ({
          ...prev,
          [recording.assemblyAITranscriptId]: transcript
        }))
      }

      return transcript
    } catch (err) {
      console.error('Failed to fetch transcript:', err)
      return null
    }
  }

  // Import recording as a meeting
  const handleImport = async (recording) => {
    try {
      setImportingId(recording.id)

      // Fetch the transcript
      const transcript = await fetchTranscript(recording)

      if (!transcript || transcript.status !== 'completed') {
        throw new Error('Transcript not ready yet. Please wait for processing to complete.')
      }

      // Create meeting object
      const meetingId = uuidv4()
      const newMeeting = {
        id: meetingId,
        title: recording.title || `Mobile Recording ${new Date(recording.recordedAt).toLocaleDateString()}`,
        date: recording.recordedAt?.split('T')[0] || new Date().toISOString().split('T')[0],
        time: recording.recordedAt?.split('T')[1]?.slice(0, 5) || '00:00',
        participants: [],
        stakeholderId: null,
        transcript: transcript.text || '',
        notes: '',
        digitalNotes: '',
        aiResult: null, // Will be generated when meeting is opened
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
        source: 'mobile-import',
        assemblyAITranscriptId: recording.assemblyAITranscriptId,
        speakerData: transcript.utterances?.length > 0 ? {
          utterances: transcript.utterances,
          speakers_detected: transcript.speakers_detected
        } : null,
        metadata: {
          audioSize: recording.audioSize,
          audioDuration: recording.duration || transcript.audio_duration,
          importedAt: new Date().toISOString(),
          mobileRecordingId: recording.id
        }
      }

      // Add meeting to app
      await addMeeting(newMeeting)

      // Update mobile recording status
      await updateMobileRecording(recording.id, {
        status: 'imported',
        importedMeetingId: meetingId,
        importedAt: new Date().toISOString()
      })

      // Update local state
      setRecordings(prev => prev.map(r =>
        r.id === recording.id
          ? { ...r, status: 'imported', importedMeetingId: meetingId }
          : r
      ))

      console.log('✅ Meeting imported:', meetingId)

      // Navigate to the new meeting
      navigate(`/meeting/${meetingId}`)

    } catch (err) {
      console.error('Failed to import recording:', err)
      setError(err.message)
    } finally {
      setImportingId(null)
    }
  }

  // Get status icon and color
  const getStatusDisplay = (recording) => {
    const transcriptStatus = transcriptCache[recording.assemblyAITranscriptId]?.status

    if (recording.status === 'imported') {
      return {
        icon: <CheckCircle className="w-4 h-4" />,
        color: 'text-green-600',
        bgColor: 'bg-green-100',
        label: 'Imported'
      }
    }

    if (transcriptStatus === 'completed' || recording.status === 'completed') {
      return {
        icon: <FileText className="w-4 h-4" />,
        color: 'text-blue-600',
        bgColor: 'bg-blue-100',
        label: 'Ready to Import'
      }
    }

    if (transcriptStatus === 'error') {
      return {
        icon: <AlertCircle className="w-4 h-4" />,
        color: 'text-red-600',
        bgColor: 'bg-red-100',
        label: 'Error'
      }
    }

    return {
      icon: <Clock className="w-4 h-4" />,
      color: 'text-amber-600',
      bgColor: 'bg-amber-100',
      label: 'Processing'
    }
  }

  // Format duration
  const formatDuration = (seconds) => {
    if (!seconds) return 'Unknown'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Format file size
  const formatSize = (bytes) => {
    if (!bytes) return 'Unknown'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`
  }

  // Format date
  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown'
    try {
      return new Date(dateString).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      })
    } catch {
      return dateString
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          <span className="ml-3 text-gray-600">Loading mobile recordings...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Smartphone className="w-6 h-6 text-white" />
            <div>
              <h2 className="text-lg font-semibold text-white">Mobile Recordings</h2>
              <p className="text-sm text-indigo-200">
                Import recordings made on your mobile device
              </p>
            </div>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 text-white hover:bg-white/20 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="m-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center gap-2 text-red-700">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Recordings List */}
      <div className="max-h-[60vh] overflow-y-auto">
        {recordings.length === 0 ? (
          <div className="p-12 text-center">
            <Smartphone className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Mobile Recordings</h3>
            <p className="text-gray-500">
              Recordings made on your mobile device will appear here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {recordings.map((recording) => {
              const status = getStatusDisplay(recording)
              const isExpanded = expandedId === recording.id
              const transcript = transcriptCache[recording.assemblyAITranscriptId]

              return (
                <div key={recording.id} className="p-4 hover:bg-gray-50">
                  {/* Recording Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-gray-900">
                          {recording.title || 'Untitled Recording'}
                        </h4>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${status.bgColor} ${status.color}`}>
                          {status.icon}
                          {status.label}
                        </span>
                      </div>

                      <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(recording.recordedAt)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Timer className="w-3 h-3" />
                          {formatDuration(recording.duration || transcript?.audio_duration)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Import Button */}
                      {(transcript?.status === 'completed' || recording.status === 'completed') &&
                       recording.status !== 'imported' && (
                        <button
                          onClick={() => handleImport(recording)}
                          disabled={importingId === recording.id}
                          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                        >
                          {importingId === recording.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Download className="w-4 h-4" />
                          )}
                          Import
                        </button>
                      )}

                      {/* View Imported Meeting */}
                      {recording.status === 'imported' && recording.importedMeetingId && (
                        <button
                          onClick={() => navigate(`/meeting/${recording.importedMeetingId}`)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
                        >
                          <ExternalLink className="w-4 h-4" />
                          View Meeting
                        </button>
                      )}

                      {/* Expand/Collapse */}
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : recording.id)}
                        className="p-1.5 hover:bg-gray-200 rounded transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-gray-500" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-gray-500" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-500">Audio Size:</span>
                          <span className="ml-2 text-gray-900">{formatSize(recording.audioSize)}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Platform:</span>
                          <span className="ml-2 text-gray-900">{recording.platform || 'mobile'}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Transcript ID:</span>
                          <span className="ml-2 text-gray-900 font-mono text-xs">
                            {recording.assemblyAITranscriptId?.slice(0, 16)}...
                          </span>
                        </div>
                        {transcript?.speakers_detected > 0 && (
                          <div>
                            <span className="text-gray-500">Speakers:</span>
                            <span className="ml-2 text-gray-900">{transcript.speakers_detected}</span>
                          </div>
                        )}
                      </div>

                      {/* Transcript Preview */}
                      {transcript?.text && (
                        <div className="mt-4">
                          <span className="text-sm text-gray-500">Transcript Preview:</span>
                          <p className="mt-1 text-sm text-gray-700 bg-gray-50 p-3 rounded-lg line-clamp-3">
                            {transcript.text.slice(0, 500)}
                            {transcript.text.length > 500 && '...'}
                          </p>
                        </div>
                      )}

                      {/* Error Message */}
                      {transcript?.error && (
                        <div className="mt-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg">
                          Error: {transcript.error}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {recordings.length} recording{recordings.length !== 1 ? 's' : ''} found
          </p>
          {onClose && (
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default MobileRecordingsImport
