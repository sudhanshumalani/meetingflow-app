/**
 * Google OAuth Callback Component
 * Handles the callback from Google OAuth and closes the popup
 */

import { useEffect } from 'react'
import { handleGoogleAuthCallback } from '../utils/googleDriveAuth'

export function GoogleAuthCallback() {
  useEffect(() => {
    // Handle the callback and close the window
    handleGoogleAuthCallback()
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Processing authentication...</p>
      </div>
    </div>
  )
}

export default GoogleAuthCallback