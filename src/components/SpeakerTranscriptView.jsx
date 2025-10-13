import React, { useState } from 'react'
import { Users, Edit2, X, CheckCircle, Copy, Download } from 'lucide-react'

/**
 * Speaker Transcript View Component
 * Displays transcript with speaker labels, allows renaming, and export
 */
const SpeakerTranscriptView = ({ speakerData, onUpdateSpeakers, className = '' }) => {
  const [editingSpeaker, setEditingSpeaker] = useState(null)
  const [speakerNameInput, setSpeakerNameInput] = useState('')
  const [copySuccess, setCopySuccess] = useState(false)

  // Speaker colors for visual distinction
  const SPEAKER_COLORS = {
    'A': { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' },
    'B': { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300' },
    'C': { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-300' },
    'D': { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300' },
    'E': { bg: 'bg-pink-100', text: 'text-pink-800', border: 'border-pink-300' },
    'F': { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300' },
    'G': { bg: 'bg-indigo-100', text: 'text-indigo-800', border: 'border-indigo-300' },
    'H': { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' }
  }

  if (!speakerData || !speakerData.utterances || speakerData.utterances.length === 0) {
    return null
  }

  const { utterances, speakers_detected, speakerLabels = {} } = speakerData

  // Get speaker color classes
  const getSpeakerColor = (speaker) => {
    return SPEAKER_COLORS[speaker] || { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-300' }
  }

  // Start editing speaker name
  const startEditingSpeaker = (speaker) => {
    setEditingSpeaker(speaker)
    setSpeakerNameInput(speakerLabels[speaker] || '')
  }

  // Save speaker name
  const saveSpeakerName = () => {
    if (editingSpeaker && speakerNameInput.trim()) {
      const updatedLabels = {
        ...speakerLabels,
        [editingSpeaker]: speakerNameInput.trim()
      }

      if (onUpdateSpeakers) {
        onUpdateSpeakers({
          ...speakerData,
          speakerLabels: updatedLabels
        })
      }
    }
    setEditingSpeaker(null)
    setSpeakerNameInput('')
  }

  // Cancel editing
  const cancelEditingSpeaker = () => {
    setEditingSpeaker(null)
    setSpeakerNameInput('')
  }

  // Copy transcript with speaker labels
  const copyToClipboard = () => {
    const formattedText = utterances.map(u => {
      const name = speakerLabels[u.speaker] || `Speaker ${u.speaker}`
      return `[${name}]: ${u.text}`
    }).join('\n\n')

    navigator.clipboard.writeText(formattedText)
    setCopySuccess(true)
    setTimeout(() => setCopySuccess(false), 2000)
  }

  // Get unique speakers
  const uniqueSpeakers = Array.from(new Set(utterances.map(u => u.speaker)))

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header with Speaker Summary */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <Users className="w-5 h-5 text-green-600" />
            <h3 className="text-sm font-medium text-gray-900">
              Speaker-Identified Transcript
            </h3>
            <CheckCircle className="w-4 h-4 text-green-600" />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={copyToClipboard}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors"
              title="Copy transcript"
            >
              {copySuccess ? (
                <>
                  <CheckCircle className="w-3 h-3 text-green-600" />
                  <span className="text-green-600">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>Copy</span>
                </>
              )}
            </button>
            <div className="text-xs text-gray-600">
              {speakers_detected} speaker{speakers_detected !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        {/* Speaker Badges */}
        <div className="flex flex-wrap gap-2">
          {uniqueSpeakers.map(speaker => {
            const color = getSpeakerColor(speaker)
            const utteranceCount = utterances.filter(u => u.speaker === speaker).length

            return (
              <button
                key={speaker}
                onClick={() => startEditingSpeaker(speaker)}
                className={`flex items-center space-x-1 px-2 py-1 rounded-full border ${color.bg} ${color.text} ${color.border} hover:opacity-80 transition-opacity`}
                title="Click to rename"
              >
                <span className="text-xs font-medium">
                  {speakerLabels[speaker] || `Speaker ${speaker}`}
                </span>
                <span className="text-xs opacity-70">({utteranceCount})</span>
                <Edit2 className="w-3 h-3 opacity-50" />
              </button>
            )
          })}
        </div>
      </div>

      {/* Utterances */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {utterances.map((utterance, idx) => {
            const color = getSpeakerColor(utterance.speaker)
            const speakerName = speakerLabels[utterance.speaker] || `Speaker ${utterance.speaker}`

            return (
              <div key={idx} className="flex gap-3">
                <div className={`flex-shrink-0 px-2 py-1 rounded-full border ${color.bg} ${color.text} ${color.border} h-fit`}>
                  <span className="text-xs font-medium">{speakerName}</span>
                </div>
                <div className="flex-1 bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <p className="text-sm text-gray-900 leading-relaxed">{utterance.text}</p>
                  {utterance.confidence && (
                    <p className="text-xs text-gray-500 mt-1">
                      Confidence: {(utterance.confidence * 100).toFixed(1)}%
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Speaker Name Editor Modal */}
      {editingSpeaker && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Rename Speaker {editingSpeaker}
            </h3>
            <input
              type="text"
              value={speakerNameInput}
              onChange={(e) => setSpeakerNameInput(e.target.value)}
              placeholder={`e.g., John Doe`}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveSpeakerName()
                if (e.key === 'Escape') cancelEditingSpeaker()
              }}
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={saveSpeakerName}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
              >
                Save
              </button>
              <button
                onClick={cancelEditingSpeaker}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SpeakerTranscriptView
