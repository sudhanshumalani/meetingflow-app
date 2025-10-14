/**
 * QUICK RECOVERY TOOL
 * Recover specific transcripts by ID and import them into the app
 */

import { v4 as uuidv4 } from 'uuid'

/**
 * Fetch transcript from Assembly AI
 */
async function fetchTranscript(transcriptId, apiKey) {
  console.log(`📥 Fetching transcript: ${transcriptId}`)

  const response = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
    headers: { authorization: apiKey }
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch transcript: ${response.statusText}`)
  }

  const transcript = await response.json()

  if (transcript.status === 'completed') {
    return transcript
  } else if (transcript.status === 'error') {
    throw new Error(`Transcript failed: ${transcript.error}`)
  } else {
    throw new Error(`Transcript status: ${transcript.status}`)
  }
}

/**
 * Convert Assembly AI transcript to meeting format
 */
function convertToMeeting(transcript, transcriptId) {
  const now = new Date().toISOString()

  // Count speakers
  const speakers = new Set()
  if (transcript.utterances) {
    transcript.utterances.forEach(u => speakers.add(u.speaker))
  }

  // Format speaker transcript
  let formattedTranscript = ''
  if (transcript.utterances && transcript.utterances.length > 0) {
    formattedTranscript = transcript.utterances.map(u =>
      `[Speaker ${u.speaker}]: ${u.text}`
    ).join('\n\n')
  } else {
    formattedTranscript = transcript.text || ''
  }

  // Create meeting object
  const meeting = {
    id: uuidv4(),
    title: `Recovered Meeting - ${new Date().toLocaleDateString()}`,
    description: `Recovered from Assembly AI (ID: ${transcriptId})`,
    date: new Date().toISOString().split('T')[0],
    audioTranscript: formattedTranscript, // Main field for audio transcript
    transcript: formattedTranscript, // Backup field
    duration: transcript.audio_duration ? Math.round(transcript.audio_duration) : null,
    wordCount: transcript.text ? transcript.text.split(' ').length : 0,
    speakerCount: speakers.size,
    confidence: transcript.confidence,
    createdAt: now,
    updatedAt: now,
    lastSaved: now,
    originalInputs: {
      audioTranscript: formattedTranscript, // CRITICAL: This is what Meeting view looks for!
      manualText: '',
      ocrText: ''
    },
    metadata: {
      recovered: true,
      recoveredAt: now,
      assemblyAIId: transcriptId,
      originalStatus: transcript.status,
      speakerLabels: transcript.utterances ?
        Array.from(speakers).map(s => `Speaker ${s}`) : []
    }
  }

  // Add speaker-specific data if available
  if (transcript.utterances) {
    meeting.utterances = transcript.utterances
    meeting.words = transcript.words
    meeting.speakerData = {
      utterances: transcript.utterances,
      speakers_detected: speakers.size
    }
  }

  return meeting
}

/**
 * Save meeting to localStorage
 */
function saveMeetingToStorage(meeting) {
  try {
    // Get existing meetings
    const existingMeetings = JSON.parse(localStorage.getItem('meetingflow_meetings') || '[]')

    // Check if already recovered
    const alreadyExists = existingMeetings.some(m =>
      m.metadata?.assemblyAIId === meeting.metadata.assemblyAIId
    )

    if (alreadyExists) {
      console.log('⚠️ Meeting already recovered, skipping duplicate')
      return false
    }

    // Add new meeting
    existingMeetings.unshift(meeting)

    // Save back to localStorage
    localStorage.setItem('meetingflow_meetings', JSON.stringify(existingMeetings))

    console.log('✅ Meeting saved to localStorage')
    return true
  } catch (error) {
    console.error('❌ Failed to save meeting:', error)
    throw error
  }
}

/**
 * Recover multiple transcripts and import them
 */
export async function recoverTranscripts(transcriptIds, apiKey) {
  console.log(`🚀 Starting recovery for ${transcriptIds.length} transcripts...`)

  const results = []

  for (const transcriptId of transcriptIds) {
    try {
      console.log(`\n📋 Processing: ${transcriptId}`)

      // Fetch transcript
      const transcript = await fetchTranscript(transcriptId, apiKey)

      console.log('✅ Transcript fetched:', {
        words: transcript.text?.split(' ').length || 0,
        speakers: new Set(transcript.utterances?.map(u => u.speaker) || []).size,
        duration: transcript.audio_duration
      })

      // Convert to meeting
      const meeting = convertToMeeting(transcript, transcriptId)

      // Save to storage
      const saved = saveMeetingToStorage(meeting)

      if (saved) {
        results.push({
          success: true,
          transcriptId,
          meetingId: meeting.id,
          meeting
        })
        console.log('✅ Successfully recovered and imported')
      } else {
        results.push({
          success: false,
          transcriptId,
          error: 'Already exists'
        })
      }

    } catch (error) {
      console.error(`❌ Failed to recover ${transcriptId}:`, error)
      results.push({
        success: false,
        transcriptId,
        error: error.message
      })
    }
  }

  // Trigger storage event to reload app
  window.dispatchEvent(new CustomEvent('meetingflow-storage-updated', {
    detail: {
      source: 'recovery',
      operation: 'importRecoveredMeetings'
    }
  }))

  console.log('\n📊 RECOVERY SUMMARY:', {
    total: transcriptIds.length,
    successful: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length
  })

  return results
}

/**
 * Quick recovery function for console use
 */
export async function quickRecover() {
  const transcriptIds = [
    '4f8c4e19-44b1-4c99-b9bb-8549d4faf3ad',
    '2cad96ef-4bf1-481f-9de9-2c0a22da0e27'
  ]

  const apiKey = import.meta.env.VITE_ASSEMBLYAI_API_KEY

  if (!apiKey || apiKey === 'your_api_key_here') {
    console.error('❌ Assembly AI API key not found in environment')
    console.log('Please provide API key:')
    console.log('quickRecover("your_api_key_here")')
    return
  }

  return await recoverTranscripts(transcriptIds, apiKey)
}

// Make available globally for console use
if (typeof window !== 'undefined') {
  window.quickRecover = quickRecover
  window.recoverTranscripts = recoverTranscripts
}

export default {
  recoverTranscripts,
  quickRecover
}
