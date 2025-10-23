/**
 * transcriptRecovery.js
 *
 * 4-tier fallback recovery system for transcript data
 */

import StreamingTranscriptBuffer from './StreamingTranscriptBuffer'
import StreamingAudioBuffer from './StreamingAudioBuffer'

/**
 * Attempt to recover transcript data using 4-tier fallback
 * @param {string} sessionId - Session ID to recover
 * @param {Object} reactState - React state as fallback
 * @returns {Object} Recovery result
 */
export async function recoverTranscript(sessionId, reactState = {}) {
  const recovery = {
    success: false,
    tier: null,
    transcript: '',
    speakerData: null,
    audioSource: 'unknown',
    recordingMode: 'unknown',
    metadata: {},
    attemptedTiers: []
  }

  try {
    console.log('🔍 Starting transcript recovery for session:', sessionId)

    // Tier 1: Complete speaker data (AssemblyAI processed)
    console.log('🔍 Attempting Tier 1 Recovery: Complete speaker data...')
    const tier1Result = await attemptTier1Recovery(sessionId)
    recovery.attemptedTiers.push({ tier: 1, success: tier1Result.success })
    if (tier1Result.success) {
      console.log('✅ Tier 1 Recovery: Found complete speaker data')
      return { ...recovery, ...tier1Result, tier: 1 }
    }

    // Tier 2: Partial speaker + streaming merge
    console.log('🔍 Attempting Tier 2 Recovery: Partial speaker + streaming merge...')
    const tier2Result = await attemptTier2Recovery(sessionId)
    recovery.attemptedTiers.push({ tier: 2, success: tier2Result.success })
    if (tier2Result.success) {
      console.log('✅ Tier 2 Recovery: Merged partial speaker data with streaming transcript')
      return { ...recovery, ...tier2Result, tier: 2 }
    }

    // Tier 3: Streaming buffer only (IndexedDB turns)
    console.log('🔍 Attempting Tier 3 Recovery: Streaming buffer only...')
    const tier3Result = await attemptTier3Recovery(sessionId)
    recovery.attemptedTiers.push({ tier: 3, success: tier3Result.success })
    if (tier3Result.success) {
      console.log('✅ Tier 3 Recovery: Reconstructed from streaming buffer')
      return { ...recovery, ...tier3Result, tier: 3 }
    }

    // Tier 4: React state (last resort)
    console.log('🔍 Attempting Tier 4 Recovery: React state fallback...')
    const tier4Result = attemptTier4Recovery(reactState)
    recovery.attemptedTiers.push({ tier: 4, success: tier4Result.success })
    if (tier4Result.success) {
      console.log('✅ Tier 4 Recovery: Using React state')
      return { ...recovery, ...tier4Result, tier: 4 }
    }

    console.warn('❌ All recovery tiers failed:', recovery.attemptedTiers)
    return recovery

  } catch (error) {
    console.error('❌ Recovery failed with exception:', error)
    recovery.error = error.message
    return recovery
  }
}

/**
 * Tier 1: Complete speaker data from AssemblyAI processing
 * This is the best case - full speaker diarization completed successfully
 */
async function attemptTier1Recovery(sessionId) {
  try {
    const session = await StreamingTranscriptBuffer.getSession(sessionId)

    if (session && session.speakerProcessingStatus === 'completed') {
      // Check if we have stored speaker data (would be in localStorage backup)
      const backupData = localStorage.getItem('latest_transcript_backup')
      if (backupData) {
        const parsed = JSON.parse(backupData)
        return {
          success: true,
          transcript: parsed.text || '',
          speakerData: parsed,
          audioSource: session.audioSource,
          recordingMode: session.recordingMode,
          metadata: { source: 'speaker_processing_complete', sessionId }
        }
      }
    }

    return { success: false }
  } catch (error) {
    console.error('Tier 1 recovery failed:', error)
    return { success: false }
  }
}

/**
 * Tier 2: Partial speaker data + streaming transcript merge
 * Use when speaker processing was interrupted but some data exists
 */
async function attemptTier2Recovery(sessionId) {
  try {
    const session = await StreamingTranscriptBuffer.getSession(sessionId)

    if (session && session.speakerProcessingStatus === 'processing') {
      // Get streaming transcript from buffer
      const streamingTranscript = await StreamingTranscriptBuffer.getSessionTranscript(sessionId)

      // Check for partial speaker data
      const backupData = localStorage.getItem('latest_transcript_backup')
      let partialSpeakerData = null

      if (backupData) {
        const parsed = JSON.parse(backupData)
        if (parsed.utterances && parsed.utterances.length > 0) {
          partialSpeakerData = parsed
        }
      }

      if (streamingTranscript || partialSpeakerData) {
        // Merge: prioritize partial speaker data, fill gaps with streaming
        const mergedTranscript = partialSpeakerData
          ? mergePartialSpeakerWithStreaming(partialSpeakerData, streamingTranscript)
          : streamingTranscript

        return {
          success: true,
          transcript: mergedTranscript,
          speakerData: partialSpeakerData,
          audioSource: session.audioSource,
          recordingMode: session.recordingMode,
          metadata: {
            source: 'partial_speaker_merge',
            sessionId,
            hasSpeakerData: !!partialSpeakerData,
            hasStreamingTranscript: !!streamingTranscript
          }
        }
      }
    }

    return { success: false }
  } catch (error) {
    console.error('Tier 2 recovery failed:', error)
    return { success: false }
  }
}

/**
 * Tier 3: Streaming buffer only (no speaker data)
 * Reconstruct plain transcript from Turn-based buffer
 */
async function attemptTier3Recovery(sessionId) {
  try {
    const streamingTranscript = await StreamingTranscriptBuffer.getSessionTranscript(sessionId)
    const session = await StreamingTranscriptBuffer.getSession(sessionId)

    if (streamingTranscript && streamingTranscript.trim()) {
      return {
        success: true,
        transcript: streamingTranscript,
        speakerData: null,
        audioSource: session?.audioSource || 'unknown',
        recordingMode: session?.recordingMode || 'streaming-only',
        metadata: { source: 'streaming_buffer_only', sessionId }
      }
    }

    return { success: false }
  } catch (error) {
    console.error('Tier 3 recovery failed:', error)
    return { success: false }
  }
}

/**
 * Tier 4: React state fallback (last resort)
 * Use current React state if all else fails
 */
function attemptTier4Recovery(reactState) {
  try {
    const { transcript, speakerData, audioSource } = reactState

    if (transcript && transcript.trim()) {
      return {
        success: true,
        transcript,
        speakerData: speakerData || null,
        audioSource: audioSource || 'unknown',
        recordingMode: speakerData ? 'hybrid-speaker' : 'streaming-only',
        metadata: { source: 'react_state_fallback' }
      }
    }

    return { success: false }
  } catch (error) {
    console.error('Tier 4 recovery failed:', error)
    return { success: false }
  }
}

/**
 * Merge partial speaker data with streaming transcript
 * Fill gaps in speaker timeline with streaming transcript
 */
function mergePartialSpeakerWithStreaming(speakerData, streamingTranscript) {
  if (!speakerData.utterances || speakerData.utterances.length === 0) {
    return streamingTranscript
  }

  // If speaker data seems complete, use it
  const speakerText = speakerData.utterances.map(u => u.text).join(' ')
  const speakerWordCount = speakerText.split(' ').filter(w => w.trim()).length
  const streamingWordCount = streamingTranscript.split(' ').filter(w => w.trim()).length

  // If speaker data has at least 70% of streaming words, use speaker data
  if (speakerWordCount >= streamingWordCount * 0.7) {
    console.log('📊 Speaker data is substantial, using it directly')
    return speakerText
  }

  // Otherwise, append streaming transcript to fill gaps
  console.log('📊 Speaker data incomplete, appending streaming transcript')
  return `${speakerText}\n\n[Additional transcript from streaming]:\n${streamingTranscript}`
}

/**
 * Find all orphaned sessions (active sessions not properly closed)
 * Used for crash recovery prompts
 */
export async function findOrphanedSessions() {
  try {
    const activeSessions = await StreamingTranscriptBuffer.getActiveSessions()

    console.log(`🔍 Checking ${activeSessions.length} active sessions for orphaned data`)

    // Filter sessions that are truly orphaned:
    // 1. Session is still marked as active (isActive = true)
    // 2. Session is older than 2 minutes (enough time for a session to complete)
    // 3. Session has actual transcript data (wordCount > 0)
    const twoMinutesAgo = Date.now() - (2 * 60 * 1000)

    // Enrich with transcript data first to filter effectively
    const enrichedSessions = await Promise.all(
      activeSessions.map(async (session) => {
        const transcript = await StreamingTranscriptBuffer.getSessionTranscript(session.sessionId)
        const wordCount = transcript.split(' ').filter(w => w.trim()).length

        return {
          ...session,
          previewText: transcript.substring(0, 100),
          wordCount,
          ageMinutes: Math.round((Date.now() - session.startTime) / 60000),
          ageSeconds: Math.round((Date.now() - session.startTime) / 1000)
        }
      })
    )

    // Filter for truly orphaned sessions
    const orphanedSessions = enrichedSessions.filter(session => {
      // Must be older than 2 minutes
      if (session.startTime >= twoMinutesAgo) {
        console.log(`⏭️ Skipping recent session (${session.ageSeconds}s old):`, session.sessionId)
        return false
      }

      // Must have actual content
      if (session.wordCount === 0) {
        console.log(`⏭️ Skipping empty session:`, session.sessionId)
        return false
      }

      console.log(`✅ Found orphaned session (${session.ageMinutes}min old, ${session.wordCount} words):`, session.sessionId)
      return true
    })

    console.log(`🔍 Found ${orphanedSessions.length} truly orphaned sessions out of ${activeSessions.length} active`)

    return orphanedSessions
  } catch (error) {
    console.error('Failed to find orphaned sessions:', error)
    return []
  }
}

/**
 * Delete an orphaned session (user declined recovery)
 */
export async function deleteOrphanedSession(sessionId) {
  try {
    await StreamingTranscriptBuffer.deleteSession(sessionId)
    console.log(`🗑️ Deleted orphaned session: ${sessionId}`)
  } catch (error) {
    console.error('Failed to delete orphaned session:', error)
  }
}

/**
 * Recover orphaned session and return transcript
 */
export async function recoverOrphanedSession(sessionId) {
  try {
    console.log('🔄 Starting recovery for session:', sessionId)
    const result = await recoverTranscript(sessionId)

    // Enhanced error logging for debugging
    if (!result.success) {
      console.error('❌ Recovery failed for session:', sessionId, 'Result:', result)

      // Try to get session metadata for debugging
      const session = await StreamingTranscriptBuffer.getSession(sessionId)
      console.error('📊 Session metadata:', session)

      // Try to get raw turns
      const turns = await StreamingTranscriptBuffer.getSessionTurns(sessionId)
      console.error('📊 Session turns count:', turns.length)

      // Return enhanced error information
      return {
        success: false,
        error: 'No recoverable data found',
        details: {
          sessionExists: !!session,
          turnsCount: turns.length,
          sessionMetadata: session
        }
      }
    }

    console.log('✅ Recovery successful for session:', sessionId, 'Tier:', result.tier)
    return result
  } catch (error) {
    console.error('❌ Recovery error for session:', sessionId, error)
    return {
      success: false,
      error: error.message,
      details: { exception: error }
    }
  }
}
