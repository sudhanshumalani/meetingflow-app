import React, { useState, useRef, useCallback, useEffect } from 'react'
import Webcam from 'react-webcam'
import { 
  Camera, 
  X, 
  RotateCcw, 
  Download, 
  CheckCircle, 
  AlertTriangle,
  Zap,
  Settings
} from 'lucide-react'
import LoadingSpinner from './LoadingSpinner'
import { ErrorToast } from './ErrorBoundary'

export default function CameraCapture({ isOpen, onClose, onCapture }) {
  const webcamRef = useRef(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [capturedImage, setCapturedImage] = useState(null)
  const [deviceId, setDeviceId] = useState({})
  const [devices, setDevices] = useState([])
  const [facingMode, setFacingMode] = useState('environment') // 'user' for front camera
  const [isFlashEnabled, setIsFlashEnabled] = useState(false)
  const [cameraPermission, setCameraPermission] = useState('prompt')

  // Mobile-optimized video constraints
  const videoConstraints = {
    width: { ideal: 1280, max: 1920 },
    height: { ideal: 720, max: 1080 },
    facingMode: facingMode,
    deviceId: deviceId?.deviceId,
    // Mobile-specific optimizations
    aspectRatio: { ideal: 16/9 },
    frameRate: { ideal: 30, max: 60 }
  }

  // Get available devices
  const handleDevices = useCallback(
    mediaDevices => {
      const videoDevices = mediaDevices.filter(({ kind }) => kind === "videoinput")
      setDevices(videoDevices)
      if (videoDevices.length > 0 && !deviceId?.deviceId) {
        // Set default to back camera if available
        const backCamera = videoDevices.find(device => 
          device.label.toLowerCase().includes('back') || 
          device.label.toLowerCase().includes('rear')
        )
        setDeviceId(backCamera || videoDevices[0])
      }
    },
    [deviceId]
  )

  useEffect(() => {
    if (isOpen) {
      // Check if we're on mobile and set appropriate defaults
      const isMobile = /Mobi|Android/i.test(navigator.userAgent)
      if (isMobile) {
        // On mobile, default to back camera for better UX
        setFacingMode('environment')
      }

      // Check camera permission status
      navigator.permissions?.query({ name: 'camera' })
        .then(permission => {
          setCameraPermission(permission.state)
          permission.addEventListener('change', () => {
            setCameraPermission(permission.state)
          })
        })
        .catch(err => console.log('Permission API not supported'))

      // Check if MediaDevices API is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setError('Camera not supported in this browser. Please use a modern browser with HTTPS.')
        setIsLoading(false)
        return
      }

      // Get available devices
      navigator.mediaDevices.enumerateDevices()
        .then(handleDevices)
        .catch(err => {
          console.error('Error getting devices:', err)
          setError(isMobile
            ? 'Could not access camera. Please ensure camera permissions are enabled.'
            : 'Could not access camera devices'
          )
          setIsLoading(false)
        })
    }
  }, [handleDevices, isOpen])

  const capture = useCallback(() => {
    if (webcamRef.current) {
      try {
        const imageSrc = webcamRef.current.getScreenshot({
          width: 1280,
          height: 720,
          format: 'jpeg',
          quality: 0.9
        })
        setCapturedImage(imageSrc)
        
        // Add flash effect
        if (isFlashEnabled) {
          document.body.style.background = 'white'
          setTimeout(() => {
            document.body.style.background = ''
          }, 100)
        }
      } catch (err) {
        setError('Failed to capture image')
        console.error('Capture error:', err)
      }
    }
  }, [isFlashEnabled])

  const handleSave = () => {
    if (capturedImage) {
      onCapture(capturedImage)
      setCapturedImage(null)
      onClose()
    }
  }

  const handleRetake = () => {
    setCapturedImage(null)
  }

  const handleDownload = () => {
    if (capturedImage) {
      const link = document.createElement('a')
      link.download = `meeting-photo-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.jpg`
      link.href = capturedImage
      link.click()
    }
  }

  const switchCamera = () => {
    if (devices.length > 1) {
      const currentIndex = devices.findIndex(device => device.deviceId === deviceId?.deviceId)
      const nextIndex = (currentIndex + 1) % devices.length
      setDeviceId(devices[nextIndex])
    } else {
      // Toggle between front and back camera using facingMode
      setFacingMode(prev => prev === 'user' ? 'environment' : 'user')
    }
  }

  const handleUserMedia = () => {
    setIsLoading(false)
    setError(null)
  }

  const handleUserMediaError = (error) => {
    setIsLoading(false)
    console.error('Camera error:', error)

    let errorMessage = 'Camera access failed'
    const isMobile = /Mobi|Android/i.test(navigator.userAgent)

    if (error.name === 'NotAllowedError') {
      errorMessage = isMobile
        ? 'Camera permission denied. Please allow camera access and refresh the page.'
        : 'Camera permission denied. Please allow camera access in your browser settings.'
    } else if (error.name === 'NotFoundError') {
      errorMessage = 'No camera found on this device.'
    } else if (error.name === 'NotReadableError') {
      errorMessage = isMobile
        ? 'Camera is in use by another app. Please close other camera apps and try again.'
        : 'Camera is already in use by another application.'
    } else if (error.name === 'OverconstrainedError') {
      errorMessage = 'Camera settings not supported. Trying default settings...'
      // Try with simpler constraints
      setTimeout(() => {
        setFacingMode('user') // Try front camera
        setError(null)
        setIsLoading(true)
      }, 1000)
      return
    } else if (error.name === 'NotSupportedError') {
      errorMessage = isMobile
        ? 'Camera not supported. Please use a secure connection (HTTPS).'
        : 'Camera not supported in this browser.'
    }

    setError(errorMessage)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center modal-overlay">
      <div className="relative w-full h-full max-w-4xl max-h-screen bg-black rounded-lg overflow-hidden modal-content">
        {/* Header */}
        <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/50 to-transparent p-4">
          <div className="flex items-center justify-between text-white">
            <div className="flex items-center gap-3">
              <Camera size={24} />
              <span className="font-medium">Camera Capture</span>
              {isLoading && <LoadingSpinner size="small" variant="white" text="" />}
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-full transition-colors focus-ring"
              aria-label="Close camera"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Camera Controls - Mobile optimized */}
        <div className="absolute top-16 right-4 z-10 flex flex-col gap-3">
          {devices.length > 1 && (
            <button
              onClick={switchCamera}
              className="p-4 bg-black/60 text-white rounded-full hover:bg-black/80 transition-colors focus-ring touch-manipulation"
              aria-label="Switch camera"
            >
              <RotateCcw size={24} />
            </button>
          )}
          <button
            onClick={() => setIsFlashEnabled(!isFlashEnabled)}
            className={`p-4 rounded-full transition-colors focus-ring touch-manipulation ${
              isFlashEnabled
                ? 'bg-yellow-500 text-black hover:bg-yellow-400'
                : 'bg-black/60 text-white hover:bg-black/80'
            }`}
            aria-label={`${isFlashEnabled ? 'Disable' : 'Enable'} flash`}
          >
            <Zap size={24} />
          </button>
        </div>

        {/* Main Content */}
        <div className="relative w-full h-full flex items-center justify-center">
          {error ? (
            <div className="text-center text-white p-8 animate-fade-in">
              <AlertTriangle size={48} className="mx-auto mb-4 text-red-400" />
              <h3 className="text-xl font-semibold mb-2">Camera Error</h3>
              <p className="text-gray-300 mb-6 max-w-md">{error}</p>
              <div className="space-y-3">
                <button
                  onClick={() => {
                    setError(null)
                    setIsLoading(true)
                  }}
                  className="block mx-auto px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors button-press focus-ring"
                >
                  Try Again
                </button>
                <button
                  onClick={onClose}
                  className="block mx-auto text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : capturedImage ? (
            <div className="relative w-full h-full animate-fade-in">
              <img 
                src={capturedImage} 
                alt="Captured" 
                className="w-full h-full object-contain"
              />
              
              {/* Captured Image Controls - Mobile optimized */}
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-center gap-2 sm:gap-4 flex-wrap justify-center">
                <button
                  onClick={handleRetake}
                  className="flex items-center gap-2 px-4 sm:px-6 py-3 bg-gray-600 text-white rounded-full hover:bg-gray-700 transition-colors button-press focus-ring touch-manipulation"
                >
                  <Camera size={20} />
                  <span className="hidden xs:inline">Retake</span>
                </button>
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-2 px-4 sm:px-6 py-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors button-press focus-ring touch-manipulation"
                >
                  <Download size={20} />
                  <span className="hidden xs:inline">Download</span>
                </button>
                <button
                  onClick={handleSave}
                  className="flex items-center gap-2 px-4 sm:px-6 py-3 bg-green-600 text-white rounded-full hover:bg-green-700 transition-colors button-press focus-ring animate-bounce-subtle touch-manipulation"
                >
                  <CheckCircle size={20} />
                  <span className="hidden xs:inline">Use Photo</span>
                  <span className="xs:hidden">Use</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="relative w-full h-full">
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
                  <LoadingSpinner size="large" variant="white" text="Starting camera..." />
                </div>
              )}
              
              <Webcam
                audio={false}
                ref={webcamRef}
                screenshotFormat="image/jpeg"
                videoConstraints={videoConstraints}
                onUserMedia={handleUserMedia}
                onUserMediaError={handleUserMediaError}
                className="w-full h-full object-cover"
                mirrored={facingMode === 'user'}
              />

              {/* Camera UI Overlay */}
              {!isLoading && !error && (
                <>
                  {/* Focus indicator */}
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-16 h-16 border-2 border-white/50 rounded-lg"></div>
                  </div>
                  
                  {/* Capture Button - Mobile optimized */}
                  <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2">
                    <button
                      onClick={capture}
                      className="w-24 h-24 bg-white rounded-full border-4 border-gray-300 flex items-center justify-center hover:border-blue-400 transition-all duration-200 focus-ring transform hover:scale-105 button-press touch-manipulation"
                      aria-label="Capture photo"
                    >
                      <div className="w-20 h-20 bg-white rounded-full shadow-lg flex items-center justify-center">
                        <Camera size={28} className="text-gray-700" />
                      </div>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Permission Prompt */}
        {cameraPermission === 'denied' && (
          <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-20">
            <div className="bg-white rounded-lg p-6 max-w-md text-center animate-scale-in">
              <Settings size={48} className="mx-auto mb-4 text-gray-600" />
              <h3 className="text-lg font-semibold mb-2">Camera Permission Required</h3>
              <p className="text-gray-600 mb-4">
                Please enable camera access in your browser settings to capture photos.
              </p>
              <button
                onClick={onClose}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors button-press focus-ring"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Error Toast */}
      {error && (
        <ErrorToast
          message={error}
          onClose={() => setError(null)}
          actionLabel="Retry"
          onAction={() => {
            setError(null)
            setIsLoading(true)
          }}
        />
      )}
    </div>
  )
}