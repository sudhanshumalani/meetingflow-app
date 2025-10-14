/**
 * EMERGENCY TRANSCRIPT RECOVERY PAGE
 * Standalone page for recovering lost transcripts from Assembly AI
 */

import { useState } from 'react'
import { AlertTriangle, Download, CheckCircle, FileText, Search } from 'lucide-react'
import { recoverTranscript, checkLocalBackup, formatRecoveredTranscript } from '../utils/transcriptRecovery'

export default function TranscriptRecovery() {
  const [transcriptId, setTranscriptId] = useState('')
  const [apiKey, setApiKey] = useState(import.meta.env.VITE_ASSEMBLYAI_API_KEY || '')
  const [isRecovering, setIsRecovering] = useState(false)
  const [recoveredData, setRecoveredData] = useState(null)
  const [error, setError] = useState(null)
  const [backup, setBackup] = useState(null)

  // Check for backup on mount
  useState(() => {
    const found = checkLocalBackup()
    if (found) {
      setBackup(found)
    }
  }, [])

  const handleRecover = async () => {
    if (!transcriptId.trim()) {
      setError('Please enter a transcript ID')
      return
    }

    setIsRecovering(true)
    setError(null)
    setRecoveredData(null)

    try {
      const data = await recoverTranscript(transcriptId.trim(), apiKey || null)
      setRecoveredData(data)
      console.log('✅ Recovery successful:', data)
    } catch (err) {
      setError(err.message)
      console.error('Recovery failed:', err)
    } finally {
      setIsRecovering(false)
    }
  }

  const downloadAsText = () => {
    if (!recoveredData) return

    const formatted = formatRecoveredTranscript(recoveredData)
    const blob = new Blob([formatted], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `recovered-transcript-${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const downloadAsJSON = () => {
    if (!recoveredData) return

    const blob = new Blob([JSON.stringify(recoveredData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `recovered-transcript-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-red-50 border-2 border-red-200 rounded-lg p-6 mb-6">
          <div className="flex items-center space-x-3 mb-3">
            <AlertTriangle className="w-8 h-8 text-red-600" />
            <h1 className="text-2xl font-bold text-red-900">Emergency Transcript Recovery</h1>
          </div>
          <p className="text-red-800 mb-2">
            This tool can recover your transcript from Assembly AI's servers if local data was lost.
          </p>
          <p className="text-red-700 text-sm">
            Transcripts are kept on Assembly AI's servers for a limited time. Act quickly!
          </p>
        </div>

        {/* Backup Found */}
        {backup && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <div className="flex items-center space-x-2 mb-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <h3 className="font-medium text-green-900">Backup Found!</h3>
            </div>
            <p className="text-sm text-green-800 mb-2">
              Found a backup transcript in localStorage from {new Date(backup.recoveredAt).toLocaleString()}
            </p>
            <div className="text-sm text-green-700">
              • {backup.text?.split(' ').length || 0} words
              • {backup.speakers_detected} speakers
              • {backup.utterances?.length || 0} utterances
            </div>
            <button
              onClick={() => setRecoveredData(backup)}
              className="mt-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
            >
              View Backup
            </button>
          </div>
        )}

        {/* Recovery Instructions */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center space-x-2">
            <Search className="w-5 h-5" />
            <span>Step 1: Find Your Transcript ID</span>
          </h2>
          <div className="space-y-3 text-sm text-gray-700">
            <p className="font-medium">🔍 Search Browser Console:</p>
            <ol className="list-decimal list-inside space-y-1 ml-4">
              <li>Open DevTools (F12)</li>
              <li>Go to Console tab</li>
              <li>Search (Ctrl+F) for: <code className="bg-gray-100 px-2 py-1 rounded">Speaker diarization job created</code></li>
              <li>Copy the ID that follows (example: <code className="bg-gray-100 px-2 py-1 rounded">abc123def456</code>)</li>
            </ol>

            <p className="font-medium mt-4">🌐 Alternative - Check Network Tab:</p>
            <ol className="list-decimal list-inside space-y-1 ml-4">
              <li>Open DevTools → Network tab</li>
              <li>Filter by: <code className="bg-gray-100 px-2 py-1 rounded">assemblyai.com</code></li>
              <li>Look for requests to <code className="bg-gray-100 px-2 py-1 rounded">/v2/transcript/</code></li>
              <li>The transcript ID is in the URL</li>
            </ol>
          </div>
        </div>

        {/* Recovery Form */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Step 2: Recover Transcript</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Transcript ID <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                value={transcriptId}
                onChange={(e) => setTranscriptId(e.target.value)}
                placeholder="Enter Assembly AI transcript ID"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Assembly AI API Key (optional if configured in .env)
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Leave blank if already configured"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <button
              onClick={handleRecover}
              disabled={isRecovering || !transcriptId.trim()}
              className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium transition-colors"
            >
              {isRecovering ? 'Recovering...' : 'Recover Transcript'}
            </button>
          </div>

          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
              ❌ {error}
            </div>
          )}
        </div>

        {/* Recovered Data */}
        {recoveredData && (
          <div className="bg-white rounded-lg border border-green-200 p-6 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <CheckCircle className="w-6 h-6 text-green-600" />
                <h2 className="text-lg font-semibold text-green-900">✅ Transcript Recovered!</h2>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={downloadAsText}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm flex items-center space-x-1"
                >
                  <Download className="w-4 h-4" />
                  <span>Download .txt</span>
                </button>
                <button
                  onClick={downloadAsJSON}
                  className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm flex items-center space-x-1"
                >
                  <FileText className="w-4 h-4" />
                  <span>Download .json</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4 mb-4 text-sm">
              <div className="bg-gray-50 p-3 rounded">
                <div className="text-gray-600">Words</div>
                <div className="text-xl font-bold">{recoveredData.text?.split(' ').length || 0}</div>
              </div>
              <div className="bg-gray-50 p-3 rounded">
                <div className="text-gray-600">Speakers</div>
                <div className="text-xl font-bold">{recoveredData.speakers_detected}</div>
              </div>
              <div className="bg-gray-50 p-3 rounded">
                <div className="text-gray-600">Utterances</div>
                <div className="text-xl font-bold">{recoveredData.utterances?.length || 0}</div>
              </div>
              <div className="bg-gray-50 p-3 rounded">
                <div className="text-gray-600">Duration</div>
                <div className="text-xl font-bold">{Math.round(recoveredData.audio_duration || 0)}s</div>
              </div>
            </div>

            <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-lg p-4 bg-gray-50">
              <h3 className="font-medium mb-3">Transcript with Speakers:</h3>
              <div className="space-y-3">
                {recoveredData.utterances?.map((utterance, idx) => (
                  <div key={idx} className="bg-white p-3 rounded border border-gray-200">
                    <div className="text-xs font-medium text-blue-600 mb-1">
                      Speaker {utterance.speaker}
                    </div>
                    <div className="text-sm text-gray-900">{utterance.text}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
