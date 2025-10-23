/**
 * CrashRecoveryPrompt.jsx
 *
 * Non-intrusive UI component for recovering orphaned transcription sessions
 * Detects sessions that were interrupted by crashes or unexpected app closure
 */

import React, { useState, useEffect } from 'react'
import { AlertTriangle, Download, X, Trash2, CheckCircle } from 'lucide-react'
import { findOrphanedSessions, recoverOrphanedSession, deleteOrphanedSession } from '../utils/transcriptRecovery'

const CrashRecoveryPrompt = ({ onRecover, onDismiss }) => {
  const [orphanedSessions, setOrphanedSessions] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRecovering, setIsRecovering] = useState(false)
  const [recoveryStatus, setRecoveryStatus] = useState({}) // { sessionId: 'recovering' | 'success' | 'failed' }
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // Check for orphaned sessions on mount
    checkForOrphanedSessions()
  }, [])

  const checkForOrphanedSessions = async () => {
    try {
      setIsLoading(true)
      const sessions = await findOrphanedSessions()
      setOrphanedSessions(sessions)
      console.log('🔍 Crash Recovery: Found', sessions.length, 'orphaned sessions')
    } catch (error) {
      console.error('Failed to check for orphaned sessions:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleRecoverSession = async (session) => {
    try {
      setRecoveryStatus(prev => ({ ...prev, [session.sessionId]: 'recovering' }))
      console.log('🔄 Recovering session:', session.sessionId)

      const result = await recoverOrphanedSession(session.sessionId)

      if (result.success) {
        setRecoveryStatus(prev => ({ ...prev, [session.sessionId]: 'success' }))
        console.log('✅ Session recovered successfully:', result)

        // Notify parent component with recovered data
        if (onRecover) {
          onRecover({
            transcript: result.transcript,
            speakerData: result.speakerData,
            metadata: {
              ...result.metadata,
              recoveryTier: result.tier,
              originalSession: session
            }
          })
        }

        // Remove from list after successful recovery
        setTimeout(() => {
          setOrphanedSessions(prev => prev.filter(s => s.sessionId !== session.sessionId))
        }, 2000)
      } else {
        setRecoveryStatus(prev => ({
          ...prev,
          [session.sessionId]: {
            status: 'failed',
            error: result.error || 'Unknown error',
            details: result.details
          }
        }))
        console.error('❌ Recovery failed for session:', session.sessionId, result)

        // Show more helpful error message to user
        const errorMsg = result.error || 'Recovery failed - no data found'
        alert(`Recovery Failed\n\n${errorMsg}\n\nThe recording data may have been lost. Please check the browser console for details.`)
      }
    } catch (error) {
      setRecoveryStatus(prev => ({
        ...prev,
        [session.sessionId]: {
          status: 'failed',
          error: error.message,
          details: { exception: error.toString() }
        }
      }))
      console.error('❌ Recovery error:', error)

      alert(`Recovery Error\n\n${error.message}\n\nPlease check the browser console for details.`)
    }
  }

  const handleDeleteSession = async (session) => {
    try {
      console.log('🗑️ Deleting orphaned session:', session.sessionId)
      await deleteOrphanedSession(session.sessionId)
      setOrphanedSessions(prev => prev.filter(s => s.sessionId !== session.sessionId))
    } catch (error) {
      console.error('Failed to delete session:', error)
    }
  }

  const handleRecoverAll = async () => {
    setIsRecovering(true)
    for (const session of orphanedSessions) {
      await handleRecoverSession(session)
    }
    setIsRecovering(false)
  }

  const handleDismiss = () => {
    setDismissed(true)
    if (onDismiss) {
      onDismiss()
    }
  }

  // Don't show if no sessions, still loading, or dismissed
  if (isLoading || orphanedSessions.length === 0 || dismissed) {
    return null
  }

  return (
    <div className="fixed bottom-4 right-4 max-w-md z-50 animate-slide-up">
      <div className="bg-white rounded-lg shadow-2xl border-2 border-orange-200 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-50 to-yellow-50 px-4 py-3 border-b border-orange-200">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0" />
              <div>
                <h3 className="text-sm font-semibold text-gray-900">
                  Unsaved Recordings Found
                </h3>
                <p className="text-xs text-gray-600 mt-0.5">
                  {orphanedSessions.length} recording{orphanedSessions.length > 1 ? 's' : ''} interrupted unexpectedly
                </p>
              </div>
            </div>
            <button
              onClick={handleDismiss}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              title="Dismiss (data will remain in storage)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Session List */}
        <div className="max-h-64 overflow-y-auto bg-white">
          {orphanedSessions.map((session) => {
            const status = recoveryStatus[session.sessionId]

            return (
              <div
                key={session.sessionId}
                className="px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-gray-700">
                        {session.audioSource === 'microphone' ? '🎤 Microphone' :
                         session.audioSource === 'tabAudio' ? '🖥️ Tab Audio' :
                         session.audioSource === 'mixed' ? '🎙️ Hybrid' :
                         '📝 Recording'}
                      </span>
                      {session.recordingMode === 'hybrid-speaker' && (
                        <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                          With Speakers
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-gray-600 mb-1 truncate">
                      {session.previewText}...
                    </p>

                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span>{session.wordCount} words</span>
                      <span>•</span>
                      <span>{session.ageMinutes} min ago</span>
                    </div>

                    {/* Status Messages */}
                    {status === 'success' && (
                      <div className="flex items-center gap-1 mt-2 text-xs text-green-700">
                        <CheckCircle className="w-3 h-3" />
                        <span>Recovered successfully!</span>
                      </div>
                    )}
                    {status?.status === 'failed' && (
                      <div className="flex items-col gap-1 mt-2 text-xs text-red-700">
                        <div className="flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          <span>Recovery failed</span>
                        </div>
                        {status.error && (
                          <div className="text-xs text-red-600 mt-0.5">{status.error}</div>
                        )}
                      </div>
                    )}
                    {status === 'failed' && typeof status !== 'object' && (
                      <div className="flex items-center gap-1 mt-2 text-xs text-red-700">
                        <AlertTriangle className="w-3 h-3" />
                        <span>Recovery failed</span>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {status === 'recovering' ? (
                      <div className="px-3 py-1.5 text-xs text-blue-600">
                        <div className="animate-spin w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full" />
                      </div>
                    ) : status === 'success' ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : (
                      <>
                        <button
                          onClick={() => handleRecoverSession(session)}
                          disabled={isRecovering}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:opacity-50"
                          title="Recover this recording"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteSession(session)}
                          disabled={isRecovering}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                          title="Delete this recording"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer Actions */}
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-gray-600">
              💾 Data is safely stored in IndexedDB
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDismiss}
                className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-800 transition-colors"
              >
                Dismiss
              </button>
              {orphanedSessions.some(s => !recoveryStatus[s.sessionId]) && (
                <button
                  onClick={handleRecoverAll}
                  disabled={isRecovering}
                  className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  <Download className="w-3 h-3" />
                  Recover All
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CrashRecoveryPrompt
