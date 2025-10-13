import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Info, CheckCircle, AlertCircle, Download, Copy } from 'lucide-react'
import AudioRecorderSpeaker from '../components/AudioRecorderSpeaker'

/**
 * Test Page for Speaker Diarization Prototype
 * Safe testing environment without affecting the main app
 */
export default function SpeakerDiarizationTest() {
  const navigate = useNavigate()
  const [transcript, setTranscript] = useState('')
  const [copySuccess, setCopySuccess] = useState(false)

  const handleTranscriptUpdate = (newTranscript) => {
    setTranscript(newTranscript)
    console.log('📝 Transcript updated:', newTranscript.substring(0, 100) + '...')
  }

  const copyToClipboard = () => {
    if (transcript) {
      navigator.clipboard.writeText(transcript)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    }
  }

  const exportTranscript = () => {
    if (!transcript) return

    const blob = new Blob([transcript], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `speaker-transcript-${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate('/')}
              className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="text-sm font-medium">Back to Home</span>
            </button>
            <div className="flex items-center space-x-2">
              <div className="px-3 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">
                🧪 PROTOTYPE
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Title */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Speaker Diarization Test
          </h1>
          <p className="text-gray-600">
            Test speaker identification without affecting your main app
          </p>
        </div>

        {/* Info Banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex gap-3">
            <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-blue-900 mb-1">
                How it works (Hybrid Mode)
              </h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• <strong>During recording:</strong> See real-time transcript without speaker labels</li>
                <li>• <strong>After stopping:</strong> Audio is processed with speaker diarization (10-30 seconds)</li>
                <li>• <strong>Result:</strong> Transcript with speaker labels (A, B, C, etc.)</li>
                <li>• <strong>Customize:</strong> Click on speaker badges to rename them</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Status Indicators */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center space-x-2 mb-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-xs font-medium text-gray-700">Real-time Streaming</span>
            </div>
            <p className="text-xs text-gray-600">Instant transcript preview while recording</p>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center space-x-2 mb-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              <span className="text-xs font-medium text-gray-700">Speaker Detection</span>
            </div>
            <p className="text-xs text-gray-600">Identifies who said what after recording</p>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center space-x-2 mb-2">
              <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
              <span className="text-xs font-medium text-gray-700">Auto-save Safe</span>
            </div>
            <p className="text-xs text-gray-600">Test mode - won't save to meetings</p>
          </div>
        </div>

        {/* Audio Recorder Component */}
        <div className="mb-6">
          <AudioRecorderSpeaker
            onTranscriptUpdate={handleTranscriptUpdate}
            className="w-full"
          />
        </div>

        {/* Transcript Actions */}
        {transcript && (
          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-900">Transcript Actions</h3>
              <div className="flex gap-2">
                <button
                  onClick={copyToClipboard}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors"
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
                <button
                  onClick={exportTranscript}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                >
                  <Download className="w-3 h-3" />
                  <span>Export</span>
                </button>
              </div>
            </div>
            <div className="bg-gray-50 rounded-md p-3 max-h-40 overflow-y-auto">
              <p className="text-sm text-gray-900 whitespace-pre-wrap">{transcript}</p>
            </div>
          </div>
        )}

        {/* Testing Tips */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-yellow-900 mb-2">
                Testing Tips for Best Results
              </h3>
              <ul className="text-sm text-yellow-800 space-y-1">
                <li>• <strong>Speaker duration:</strong> Each person should speak for at least 30 seconds</li>
                <li>• <strong>Clear turns:</strong> Avoid overlapping speech for better accuracy</li>
                <li>• <strong>Audio quality:</strong> Use a good microphone in a quiet environment</li>
                <li>• <strong>Expected speakers:</strong> Set the number in settings if you know it (improves accuracy)</li>
                <li>• <strong>Processing time:</strong> Speaker diarization takes 10-30 seconds after recording stops</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Feature Checklist */}
        <div className="mt-8 bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">
            ✨ Features to Test
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex items-start space-x-2">
              <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-gray-900">Real-time Preview</p>
                <p className="text-xs text-gray-600">See transcript as you speak</p>
              </div>
            </div>
            <div className="flex items-start space-x-2">
              <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-gray-900">Speaker Labels</p>
                <p className="text-xs text-gray-600">A, B, C labels after processing</p>
              </div>
            </div>
            <div className="flex items-start space-x-2">
              <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-gray-900">Speaker Renaming</p>
                <p className="text-xs text-gray-600">Click badges to customize names</p>
              </div>
            </div>
            <div className="flex items-start space-x-2">
              <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-gray-900">Color Coding</p>
                <p className="text-xs text-gray-600">Visual distinction per speaker</p>
              </div>
            </div>
            <div className="flex items-start space-x-2">
              <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-gray-900">Auto-detect Speakers</p>
                <p className="text-xs text-gray-600">Or set expected count</p>
              </div>
            </div>
            <div className="flex items-start space-x-2">
              <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-gray-900">Export Options</p>
                <p className="text-xs text-gray-600">Copy or download transcript</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Note */}
        <div className="mt-8 text-center">
          <p className="text-xs text-gray-500">
            This is a prototype testing environment. Once validated, we'll integrate it into the main app.
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Your existing recordings and meetings are not affected.
          </p>
        </div>
      </div>
    </div>
  )
}
