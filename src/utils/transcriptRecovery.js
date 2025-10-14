/**
 * EMERGENCY TRANSCRIPT RECOVERY TOOL
 * Recovers transcripts from Assembly AI when local data is lost
 */

/**
 * Search browser console logs for Assembly AI transcript ID
 * Look for patterns like: "Speaker diarization job created: [ID]"
 */
export function searchConsoleForTranscriptId() {
  console.warn('🔍 TRANSCRIPT RECOVERY: Searching for Assembly AI transcript ID...')
  console.warn('📋 Please check your browser console history for messages like:')
  console.warn('   "✅ Speaker diarization job created: [TRANSCRIPT_ID]"')
  console.warn('   "✅ Audio uploaded: [UPLOAD_URL]"')
  console.warn('')
  console.warn('⚠️ If you find a transcript ID, use: recoverTranscript("TRANSCRIPT_ID")')
}

/**
 * Recover transcript from Assembly AI using transcript ID
 * @param {string} transcriptId - Assembly AI transcript ID
 * @param {string} apiKey - Assembly AI API key (from env)
 * @returns {Promise<Object>} - Recovered transcript data
 */
export async function recoverTranscript(transcriptId, apiKey = null) {
  // Get API key from environment or parameter
  const key = apiKey || import.meta.env.VITE_ASSEMBLYAI_API_KEY

  if (!key || key === 'your_api_key_here') {
    throw new Error('❌ Assembly AI API key required. Please provide it as parameter or set VITE_ASSEMBLYAI_API_KEY')
  }

  console.log('🔄 Attempting to recover transcript:', transcriptId)

  try {
    const response = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
      headers: { authorization: key }
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch transcript: ${response.statusText}`)
    }

    const transcript = await response.json()

    if (transcript.status === 'completed') {
      console.log('✅ TRANSCRIPT RECOVERED!', {
        speakers: countSpeakers(transcript.utterances),
        utterances: transcript.utterances?.length || 0,
        words: transcript.words?.length || 0,
        textLength: transcript.text?.length || 0,
        text: transcript.text
      })

      // Format the data
      const recoveredData = {
        text: transcript.text,
        utterances: transcript.utterances || [],
        words: transcript.words || [],
        speakers_detected: countSpeakers(transcript.utterances),
        confidence: transcript.confidence,
        audio_duration: transcript.audio_duration,
        recovered: true,
        recoveredAt: new Date().toISOString()
      }

      // Save to localStorage as backup
      localStorage.setItem('recovered_transcript_backup', JSON.stringify(recoveredData))
      console.log('💾 Transcript saved to localStorage as backup')

      return recoveredData
    } else if (transcript.status === 'error') {
      throw new Error(`Transcript processing failed: ${transcript.error}`)
    } else {
      throw new Error(`Transcript status: ${transcript.status} (not completed yet)`)
    }
  } catch (error) {
    console.error('❌ Recovery failed:', error)
    throw error
  }
}

/**
 * Count unique speakers from utterances
 */
function countSpeakers(utterances) {
  if (!utterances || utterances.length === 0) return 0
  const speakers = new Set(utterances.map(u => u.speaker))
  return speakers.size
}

/**
 * Format recovered transcript for display
 */
export function formatRecoveredTranscript(speakerData, speakerLabels = {}) {
  if (!speakerData.utterances || speakerData.utterances.length === 0) {
    return speakerData.text || ''
  }

  return speakerData.utterances.map(utterance => {
    const speakerName = speakerLabels[utterance.speaker] || `Speaker ${utterance.speaker}`
    return `[${speakerName}]: ${utterance.text}`
  }).join('\n\n')
}

/**
 * Check localStorage for any backup transcript
 */
export function checkLocalBackup() {
  console.log('🔍 Checking localStorage for backup transcripts...')

  const backup = localStorage.getItem('recovered_transcript_backup')
  if (backup) {
    try {
      const data = JSON.parse(backup)
      console.log('✅ FOUND BACKUP TRANSCRIPT:', {
        words: data.text?.split(' ').length || 0,
        speakers: data.speakers_detected,
        recoveredAt: data.recoveredAt
      })
      return data
    } catch (e) {
      console.error('Failed to parse backup:', e)
    }
  }

  console.log('⚠️ No backup found in localStorage')
  return null
}

/**
 * List all recent transcripts (requires API key)
 * Note: Assembly AI doesn't have a "list" endpoint, so this is manual
 */
export function listRecentTranscriptIds() {
  console.warn('📋 RECOVERY GUIDE:')
  console.warn('')
  console.warn('1. Open browser DevTools Console (F12 → Console tab)')
  console.warn('2. Search for "Speaker diarization job created:" in the logs')
  console.warn('3. Copy the transcript ID that appears after that message')
  console.warn('4. Run: await recoverTranscript("YOUR_TRANSCRIPT_ID")')
  console.warn('')
  console.warn('If console logs are cleared, check:')
  console.warn('- Browser history (the transcript might be cached)')
  console.warn('- Network tab for requests to api.assemblyai.com/v2/transcript')
  console.warn('- The transcript ID is in the URL of those requests')
}

// Global exports for console use
if (typeof window !== 'undefined') {
  window.recoverTranscript = recoverTranscript
  window.searchConsoleForTranscriptId = searchConsoleForTranscriptId
  window.checkLocalBackup = checkLocalBackup
  window.formatRecoveredTranscript = formatRecoveredTranscript
  window.listRecentTranscriptIds = listRecentTranscriptIds
}

export default {
  recoverTranscript,
  searchConsoleForTranscriptId,
  checkLocalBackup,
  formatRecoveredTranscript,
  listRecentTranscriptIds
}
