/**
 * Device Detection Utilities for Progressive Enhancement
 * Determines optimal transcription method based on device capabilities
 */

/**
 * Check if running on desktop browser
 */
export function isDesktopBrowser() {
  const userAgent = navigator.userAgent.toLowerCase()
  const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent)
  return !isMobile && 'WebAssembly' in window
}

/**
 * Check if running on iOS (iPhone/iPad)
 */
export function isiOS() {
  const userAgent = navigator.userAgent.toLowerCase()
  return /iphone|ipad|ipod/i.test(userAgent)
}

/**
 * Check if running on Android
 */
export function isAndroid() {
  const userAgent = navigator.userAgent.toLowerCase()
  return /android/i.test(userAgent)
}

/**
 * Check if browser supports WebAssembly
 */
export function supportsWebAssembly() {
  try {
    return 'WebAssembly' in window &&
           typeof WebAssembly.instantiate === 'function'
  } catch (e) {
    return false
  }
}

/**
 * Check if browser supports SharedArrayBuffer (for better WASM performance)
 */
export function supportsSharedArrayBuffer() {
  return 'SharedArrayBuffer' in window
}

/**
 * Check available memory (estimate for model loading)
 */
export function getDeviceMemory() {
  if ('deviceMemory' in navigator) {
    return navigator.deviceMemory // Returns GB
  }

  // Fallback estimation based on device type
  if (isDesktopBrowser()) {
    return 4 // Assume at least 4GB on desktop
  } else if (isiOS()) {
    return 2 // Conservative estimate for iOS
  } else if (isAndroid()) {
    return 1 // Conservative estimate for Android
  }

  return 1 // Default conservative estimate
}

/**
 * Check if device has sufficient memory for Whisper models
 */
export function canLoadWhisperModel(modelSize = 'base') {
  const deviceMemory = getDeviceMemory()
  const modelSizes = {
    'tiny': 0.04,   // ~40MB
    'base': 0.15,   // ~150MB
    'small': 0.5,   // ~500MB
    'medium': 1.5,  // ~1.5GB
    'large': 3.0    // ~3GB
  }

  const requiredMemory = modelSizes[modelSize] || modelSizes.base
  return deviceMemory >= requiredMemory * 2 // 2x buffer for processing
}

/**
 * Check Web Audio API support
 */
export function supportsWebAudio() {
  return 'AudioContext' in window || 'webkitAudioContext' in window
}

/**
 * Check MediaRecorder API support
 */
export function supportsMediaRecorder() {
  return 'MediaRecorder' in window
}

/**
 * Check Web Speech API support
 */
export function supportsWebSpeech() {
  return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window
}

/**
 * Determine the best transcription method for current device
 */
export function getOptimalTranscriptionMethod() {
  // Desktop with WASM support - use Whisper.cpp WASM
  if (isDesktopBrowser() && supportsWebAssembly() && canLoadWhisperModel('base')) {
    return {
      method: 'whisper-wasm',
      priority: 1,
      description: 'Whisper.cpp WebAssembly (Desktop)',
      requirements: ['webassembly', 'webaudio', 'mediarecorder'],
      modelSize: canLoadWhisperModel('small') ? 'small' : 'base'
    }
  }

  // iOS - Try native Whisper or fallback to Web Speech
  if (isiOS()) {
    if (supportsWebSpeech()) {
      return {
        method: 'web-speech-ios',
        priority: 2,
        description: 'Web Speech API (iOS Safari)',
        requirements: ['webspeech', 'webaudio'],
        fallback: true
      }
    } else {
      return {
        method: 'manual-input',
        priority: 4,
        description: 'Manual text input (iOS fallback)',
        requirements: [],
        fallback: true
      }
    }
  }

  // Android - Try WASM (if powerful enough) or Web Speech
  if (isAndroid()) {
    if (supportsWebAssembly() && canLoadWhisperModel('base') && getDeviceMemory() >= 2) {
      return {
        method: 'whisper-wasm-android',
        priority: 2,
        description: 'Whisper.cpp WASM (Android)',
        requirements: ['webassembly', 'webaudio', 'mediarecorder'],
        modelSize: 'base'
      }
    } else if (supportsWebSpeech()) {
      return {
        method: 'web-speech-android',
        priority: 3,
        description: 'Web Speech API (Android Chrome)',
        requirements: ['webspeech', 'webaudio'],
        fallback: true
      }
    } else {
      return {
        method: 'manual-input',
        priority: 4,
        description: 'Manual text input (Android fallback)',
        requirements: [],
        fallback: true
      }
    }
  }

  // Unknown device - try Web Speech as safe fallback
  if (supportsWebSpeech()) {
    return {
      method: 'web-speech-fallback',
      priority: 3,
      description: 'Web Speech API (Fallback)',
      requirements: ['webspeech', 'webaudio'],
      fallback: true
    }
  }

  // Last resort - manual input
  return {
    method: 'manual-input',
    priority: 4,
    description: 'Manual text input (Universal fallback)',
    requirements: [],
    fallback: true
  }
}

/**
 * Check if all requirements are met for a transcription method
 */
export function checkRequirements(requirements) {
  const checks = {
    webassembly: supportsWebAssembly(),
    webaudio: supportsWebAudio(),
    mediarecorder: supportsMediaRecorder(),
    webspeech: supportsWebSpeech(),
    sharedarraybuffer: supportsSharedArrayBuffer()
  }

  return requirements.every(req => checks[req] === true)
}

/**
 * Get detailed device capabilities report
 */
export function getDeviceCapabilities() {
  const optimal = getOptimalTranscriptionMethod()

  return {
    device: {
      type: isDesktopBrowser() ? 'desktop' : (isiOS() ? 'ios' : (isAndroid() ? 'android' : 'unknown')),
      userAgent: navigator.userAgent,
      memory: getDeviceMemory()
    },
    capabilities: {
      webAssembly: supportsWebAssembly(),
      webAudio: supportsWebAudio(),
      mediaRecorder: supportsMediaRecorder(),
      webSpeech: supportsWebSpeech(),
      sharedArrayBuffer: supportsSharedArrayBuffer()
    },
    transcription: {
      optimal: optimal,
      canLoadWhisper: canLoadWhisperModel('base'),
      recommendedModel: optimal.modelSize || 'base',
      requirementsMet: checkRequirements(optimal.requirements || [])
    }
  }
}