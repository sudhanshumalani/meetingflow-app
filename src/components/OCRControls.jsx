import React, { useState, useEffect } from 'react'
import { Eye, EyeOff, Loader2, AlertTriangle, CheckCircle } from 'lucide-react'
import { enableOCR, disableOCR, getOCRStatus } from '../utils/ocrService'

export function OCRControls() {
  const [status, setStatus] = useState(getOCRStatus())
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    // Update status periodically
    const interval = setInterval(() => {
      setStatus(getOCRStatus())
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  const handleToggleOCR = async () => {
    setLoading(true)
    setMessage('')

    try {
      if (status.ocrEnabled) {
        const result = await disableOCR()
        setMessage(result.message)
      } else {
        const result = await enableOCR()
        setMessage(result.message)

        if (!result.success) {
          setTimeout(() => setMessage(''), 5000) // Clear error message after 5 seconds
        }
      }
    } catch (error) {
      setMessage(`Error: ${error.message}`)
      setTimeout(() => setMessage(''), 5000)
    } finally {
      setLoading(false)
      setStatus(getOCRStatus())
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {status.ocrEnabled ? (
            <Eye size={20} className="text-green-600" />
          ) : (
            <EyeOff size={20} className="text-gray-400" />
          )}
          <h3 className="font-medium text-gray-900">
            OCR Text Extraction
          </h3>
          <div className={`px-2 py-1 rounded-full text-xs font-medium ${
            status.ocrEnabled
              ? 'bg-green-100 text-green-700'
              : 'bg-gray-100 text-gray-600'
          }`}>
            {status.ocrEnabled ? 'Enabled' : 'Disabled'}
          </div>
        </div>

        <button
          onClick={handleToggleOCR}
          disabled={loading}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            loading
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : status.ocrEnabled
                ? 'bg-red-100 text-red-700 hover:bg-red-200'
                : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
          }`}
        >
          {loading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : status.ocrEnabled ? (
            <EyeOff size={16} />
          ) : (
            <Eye size={16} />
          )}
          {loading ? 'Processing...' : status.ocrEnabled ? 'Disable OCR' : 'Enable OCR'}
        </button>
      </div>

      <div className="text-sm text-gray-600 mb-3">
        {status.ocrEnabled ? (
          <div className="flex items-start gap-2">
            <CheckCircle size={16} className="text-green-600 mt-0.5 flex-shrink-0" />
            <span>OCR is active. Images will be processed to extract text automatically.</span>
          </div>
        ) : (
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="text-yellow-600 mt-0.5 flex-shrink-0" />
            <span>OCR is disabled. Upload images for storage, but text extraction is unavailable. Enable OCR to extract text from images (may cause performance issues).</span>
          </div>
        )}
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm ${
          message.includes('successfully')
            ? 'bg-green-50 text-green-800 border border-green-200'
            : 'bg-yellow-50 text-yellow-800 border border-yellow-200'
        }`}>
          {message}
        </div>
      )}

      {!status.ocrEnabled && (
        <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <h4 className="text-sm font-medium text-blue-900 mb-2">
            Why is OCR disabled by default?
          </h4>
          <p className="text-sm text-blue-800">
            OCR (Optical Character Recognition) can sometimes cause the app to freeze or hang during initialization.
            To ensure a smooth experience, OCR starts disabled. You can enable it above if you want to try automatic text extraction from images.
          </p>
        </div>
      )}
    </div>
  )
}

export default OCRControls