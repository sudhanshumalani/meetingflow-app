/**
 * resilientUpload.js
 *
 * Shared upload utility with timeout, progress tracking, and offline detection.
 * Used by both MobileRecorder (mobile) and assemblyAISpeakerService (desktop).
 */

/**
 * Check if the device appears to be online.
 * @returns {boolean}
 */
export function checkConnectivity() {
  return typeof navigator !== 'undefined' ? navigator.onLine : true
}

/**
 * Wrap a fetch call with an AbortController timeout.
 * @param {string} url
 * @param {RequestInit} options
 * @param {number} timeoutMs - milliseconds before aborting (default 30s)
 * @returns {Promise<Response>}
 */
export async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    })
    return response
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`)
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Upload a blob using XMLHttpRequest for upload progress tracking.
 * Falls back to fetch if XHR is not available.
 *
 * @param {string} url - Upload endpoint
 * @param {Blob} blob - Data to upload
 * @param {string} apiKey - Authorization header value
 * @param {number} timeoutMs - Timeout in milliseconds (default 90s)
 * @param {Function} onProgress - Called with { loaded, total, percent }
 * @returns {Promise<Object>} Parsed JSON response
 */
export function uploadWithProgress(url, blob, apiKey, timeoutMs = 90000, onProgress = null) {
  return new Promise((resolve, reject) => {
    // Use XMLHttpRequest for upload progress events
    if (typeof XMLHttpRequest !== 'undefined') {
      const xhr = new XMLHttpRequest()
      let timedOut = false

      const timeoutId = setTimeout(() => {
        timedOut = true
        xhr.abort()
        reject(new Error(`Upload timed out after ${Math.round(timeoutMs / 1000)}s`))
      }, timeoutMs)

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && onProgress) {
          onProgress({
            loaded: event.loaded,
            total: event.total,
            percent: Math.round((event.loaded / event.total) * 100)
          })
        }
      })

      xhr.addEventListener('load', () => {
        clearTimeout(timeoutId)
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText))
          } catch (e) {
            reject(new Error('Failed to parse upload response'))
          }
        } else {
          let errorMsg = `Upload failed: ${xhr.status}`
          try {
            const body = JSON.parse(xhr.responseText)
            if (body.error) errorMsg = body.error
          } catch (e) { /* ignore parse error */ }
          reject(new Error(errorMsg))
        }
      })

      xhr.addEventListener('error', () => {
        clearTimeout(timeoutId)
        if (!timedOut) {
          reject(new Error('Upload network error'))
        }
      })

      xhr.addEventListener('abort', () => {
        clearTimeout(timeoutId)
        if (!timedOut) {
          reject(new Error('Upload aborted'))
        }
      })

      xhr.open('POST', url)
      xhr.setRequestHeader('authorization', apiKey)
      xhr.setRequestHeader('Content-Type', 'application/octet-stream')
      xhr.send(blob)
    } else {
      // Fallback: use fetchWithTimeout (no progress)
      fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          'authorization': apiKey,
          'Content-Type': 'application/octet-stream'
        },
        body: blob
      }, timeoutMs)
        .then(res => {
          if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
          return res.json()
        })
        .then(resolve)
        .catch(reject)
    }
  })
}

/**
 * Full upload-and-transcribe flow with resilience.
 * Checks connectivity, uploads with progress, creates transcript job.
 *
 * @param {Blob} blob - Audio blob
 * @param {string} apiKey - AssemblyAI API key
 * @param {Object} options
 * @param {number} options.uploadTimeoutMs - Upload timeout (default 90s)
 * @param {number} options.transcriptTimeoutMs - Transcript request timeout (default 30s)
 * @param {Function} options.onUploadProgress - Called with { loaded, total, percent }
 * @param {boolean} options.speakerLabels - Enable speaker diarization (default true)
 * @param {number|null} options.speakersExpected - Expected speaker count (null = auto)
 * @returns {Promise<{ uploadUrl: string, transcriptId: string }>}
 */
export async function uploadAndTranscribe(blob, apiKey, options = {}) {
  const {
    uploadTimeoutMs = 90000,
    transcriptTimeoutMs = 30000,
    onUploadProgress = null,
    speakerLabels = true,
    speakersExpected = null
  } = options

  // Step 0: Connectivity check
  if (!checkConnectivity()) {
    throw new Error('No internet connection. Please check your network and try again.')
  }

  // Step 1: Upload with progress
  const uploadResult = await uploadWithProgress(
    'https://api.assemblyai.com/v2/upload',
    blob,
    apiKey,
    uploadTimeoutMs,
    onUploadProgress
  )

  const uploadUrl = uploadResult.upload_url
  if (!uploadUrl) {
    throw new Error('Upload succeeded but no URL returned')
  }

  // Step 2: Create transcript job
  const transcriptConfig = {
    audio_url: uploadUrl,
    speaker_labels: speakerLabels,
    language_code: 'en'
  }

  if (speakersExpected !== null && speakersExpected > 0) {
    transcriptConfig.speakers_expected = speakersExpected
  }

  const transcriptResponse = await fetchWithTimeout(
    'https://api.assemblyai.com/v2/transcript',
    {
      method: 'POST',
      headers: {
        'authorization': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(transcriptConfig)
    },
    transcriptTimeoutMs
  )

  if (!transcriptResponse.ok) {
    let errorMsg = `Transcription request failed: ${transcriptResponse.status}`
    try {
      const errorBody = await transcriptResponse.json()
      if (errorBody.error) errorMsg = errorBody.error
    } catch (e) { /* ignore */ }
    throw new Error(errorMsg)
  }

  const transcriptResult = await transcriptResponse.json()
  const transcriptId = transcriptResult.id

  if (!transcriptId) {
    throw new Error('Transcription request succeeded but no job ID returned')
  }

  return { uploadUrl, transcriptId }
}
