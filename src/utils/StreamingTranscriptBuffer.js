/**
 * StreamingTranscriptBuffer.js
 *
 * IndexedDB-based buffer for streaming transcripts with Turn-based persistence.
 * Provides crash recovery and prevents data loss during speaker processing.
 */

import localforage from 'localforage'

class StreamingTranscriptBuffer {
  constructor() {
    // Create separate IndexedDB instance for transcript buffering
    this.db = localforage.createInstance({
      name: 'MeetingFlow',
      storeName: 'streaming_transcripts',
      driver: [localforage.INDEXEDDB]
    })

    // Session-level metadata store
    this.sessionDb = localforage.createInstance({
      name: 'MeetingFlow',
      storeName: 'transcript_sessions',
      driver: [localforage.INDEXEDDB]
    })

    this.currentSessionId = null
    this.pendingBatch = []
    this.batchSize = 5 // Buffer 5 turns before writing
    this.lastWriteTime = 0
    this.writeInterval = 3000 // Force write every 3 seconds
  }

  /**
   * Initialize a new recording session
   * @param {Object} options - Session configuration
   * @returns {string} sessionId
   */
  async startSession(options = {}) {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const sessionMetadata = {
      sessionId,
      startTime: Date.now(),
      audioSource: options.audioSource || 'unknown', // microphone/tabAudio/mic/tab
      recordingMode: options.recordingMode || 'streaming-only', // streaming-only | hybrid-speaker
      speakerProcessingStatus: options.recordingMode === 'hybrid-speaker' ? 'pending' : 'not-applicable',
      turnCount: 0,
      totalCharacters: 0,
      lastUpdateTime: Date.now(),
      isActive: true
    }

    await this.sessionDb.setItem(sessionId, sessionMetadata)
    this.currentSessionId = sessionId

    console.log(`📝 Started transcript buffer session: ${sessionId}`)
    return sessionId
  }

  /**
   * Buffer a transcript Turn (batched writes for performance)
   * @param {string} sessionId
   * @param {Object} turnData - Turn data from AssemblyAI
   */
  async bufferTurn(sessionId, turnData) {
    if (!sessionId) {
      console.warn('⚠️ Cannot buffer turn without sessionId')
      return
    }

    const turn = {
      sessionId,
      turnId: turnData.turnId || `turn_${Date.now()}`,
      text: turnData.text || '',
      timestamp: Date.now(),
      isFinal: turnData.isFinal || false,
      endOfTurn: turnData.endOfTurn || false,
      audioSource: turnData.audioSource || 'unknown',
      recordingMode: turnData.recordingMode || 'streaming-only'
    }

    this.pendingBatch.push(turn)

    // Write batch if size threshold reached OR time threshold reached
    const timeSinceLastWrite = Date.now() - this.lastWriteTime
    if (this.pendingBatch.length >= this.batchSize || timeSinceLastWrite >= this.writeInterval) {
      await this.flushBatch()
    }
  }

  /**
   * Flush pending batch to IndexedDB
   */
  async flushBatch() {
    if (this.pendingBatch.length === 0) return

    try {
      // Write all pending turns
      const writePromises = this.pendingBatch.map(turn =>
        this.db.setItem(`${turn.sessionId}_${turn.turnId}`, turn)
      )
      await Promise.all(writePromises)

      // Update session metadata
      if (this.currentSessionId) {
        const session = await this.sessionDb.getItem(this.currentSessionId)
        if (session) {
          session.turnCount += this.pendingBatch.length
          session.totalCharacters += this.pendingBatch.reduce((sum, t) => sum + t.text.length, 0)
          session.lastUpdateTime = Date.now()
          await this.sessionDb.setItem(this.currentSessionId, session)
        }
      }

      console.log(`💾 Flushed ${this.pendingBatch.length} turns to IndexedDB buffer`)
      this.pendingBatch = []
      this.lastWriteTime = Date.now()
    } catch (error) {
      console.error('❌ Failed to flush transcript batch:', error)
      // Keep batch in memory for retry
    }
  }

  /**
   * Complete a session (force flush and mark as complete)
   * @param {string} sessionId
   * @param {Object} finalStatus - Final status info
   */
  async completeSession(sessionId, finalStatus = {}) {
    // Flush any remaining turns
    await this.flushBatch()

    // Update session metadata
    const session = await this.sessionDb.getItem(sessionId)
    if (session) {
      session.isActive = false
      session.completedTime = Date.now()
      session.speakerProcessingStatus = finalStatus.speakerProcessingStatus || session.speakerProcessingStatus
      session.finalTranscriptLength = finalStatus.finalTranscriptLength || session.totalCharacters
      await this.sessionDb.setItem(sessionId, session)
      console.log(`✅ Completed transcript buffer session: ${sessionId}`)
    }

    if (this.currentSessionId === sessionId) {
      this.currentSessionId = null
    }
  }

  /**
   * Retrieve all turns for a session
   * @param {string} sessionId
   * @returns {Array} Array of turn objects, sorted by timestamp
   */
  async getSessionTurns(sessionId) {
    const turns = []

    try {
      await this.db.iterate((value, key) => {
        if (key.startsWith(sessionId)) {
          turns.push(value)
        }
      })

      // Sort by timestamp
      turns.sort((a, b) => a.timestamp - b.timestamp)

      console.log(`📖 Retrieved ${turns.length} turns for session ${sessionId}`)
      return turns
    } catch (error) {
      console.error('❌ Failed to retrieve session turns:', error)
      return []
    }
  }

  /**
   * Get complete transcript text from buffered turns
   * @param {string} sessionId
   * @returns {string} Complete transcript text
   */
  async getSessionTranscript(sessionId) {
    const turns = await this.getSessionTurns(sessionId)
    return turns.map(turn => turn.text).filter(text => text.trim()).join(' ')
  }

  /**
   * Get session metadata
   * @param {string} sessionId
   * @returns {Object} Session metadata
   */
  async getSession(sessionId) {
    return await this.sessionDb.getItem(sessionId)
  }

  /**
   * Find all active (incomplete) sessions - for crash recovery
   * @returns {Array} Array of active session metadata
   */
  async getActiveSessions() {
    const activeSessions = []

    await this.sessionDb.iterate((value, key) => {
      if (value.isActive) {
        activeSessions.push(value)
      }
    })

    // Sort by start time (newest first)
    activeSessions.sort((a, b) => b.startTime - a.startTime)

    console.log(`🔍 Found ${activeSessions.length} active sessions`)
    return activeSessions
  }

  /**
   * Delete a session and all its turns
   * @param {string} sessionId
   */
  async deleteSession(sessionId) {
    try {
      // Delete all turns
      const keysToDelete = []
      await this.db.iterate((value, key) => {
        if (key.startsWith(sessionId)) {
          keysToDelete.push(key)
        }
      })

      await Promise.all(keysToDelete.map(key => this.db.removeItem(key)))

      // Delete session metadata
      await this.sessionDb.removeItem(sessionId)

      console.log(`🗑️ Deleted session ${sessionId} and ${keysToDelete.length} turns`)
    } catch (error) {
      console.error('❌ Failed to delete session:', error)
    }
  }

  /**
   * Cleanup old completed sessions (older than 7 days)
   */
  async cleanupOldSessions() {
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000)
    const sessionsToDelete = []

    await this.sessionDb.iterate((value, key) => {
      if (!value.isActive && value.completedTime && value.completedTime < sevenDaysAgo) {
        sessionsToDelete.push(value.sessionId)
      }
    })

    console.log(`🧹 Cleaning up ${sessionsToDelete.length} old sessions`)
    await Promise.all(sessionsToDelete.map(id => this.deleteSession(id)))
  }

  /**
   * Update speaker processing status for a session
   * @param {string} sessionId
   * @param {string} status - 'pending' | 'processing' | 'completed' | 'failed'
   */
  async updateSpeakerStatus(sessionId, status) {
    const session = await this.sessionDb.getItem(sessionId)
    if (session) {
      session.speakerProcessingStatus = status
      session.lastUpdateTime = Date.now()
      await this.sessionDb.setItem(sessionId, session)
      console.log(`🔄 Updated speaker status for ${sessionId}: ${status}`)
    }
  }

  /**
   * Get storage statistics
   * @returns {Object} Storage stats
   */
  async getStats() {
    let totalTurns = 0
    let totalSessions = 0
    let activeSessions = 0

    await this.db.iterate(() => totalTurns++)
    await this.sessionDb.iterate((value) => {
      totalSessions++
      if (value.isActive) activeSessions++
    })

    return {
      totalTurns,
      totalSessions,
      activeSessions,
      pendingBatchSize: this.pendingBatch.length
    }
  }
}

// Export singleton instance
export default new StreamingTranscriptBuffer()
