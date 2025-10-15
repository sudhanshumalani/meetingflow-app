/**
 * StreamingAudioBuffer.js
 *
 * IndexedDB-based buffer for audio chunks during recording.
 * Enables crash recovery and retry of failed AssemblyAI uploads.
 */

import localforage from 'localforage'

class StreamingAudioBuffer {
  constructor() {
    // Create separate IndexedDB instance for audio chunks
    this.db = localforage.createInstance({
      name: 'MeetingFlow',
      storeName: 'audio_chunks',
      driver: [localforage.INDEXEDDB]
    })

    // Session-level audio metadata
    this.sessionDb = localforage.createInstance({
      name: 'MeetingFlow',
      storeName: 'audio_sessions',
      driver: [localforage.INDEXEDDB]
    })

    this.currentSessionId = null
    this.chunkBuffer = []
    this.bufferSize = 3 // Buffer 3 chunks before writing (reduces IndexedDB operations)
    this.totalBytesBuffered = 0
  }

  /**
   * Initialize a new audio recording session
   * @param {Object} options - Session configuration
   * @returns {string} sessionId
   */
  async startSession(options = {}) {
    const sessionId = `audio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const sessionMetadata = {
      sessionId,
      startTime: Date.now(),
      audioSource: options.audioSource || 'unknown',
      mimeType: options.mimeType || 'audio/webm',
      sampleRate: options.sampleRate || 16000,
      chunkCount: 0,
      totalBytes: 0,
      lastUpdateTime: Date.now(),
      isActive: true,
      uploadStatus: 'pending', // pending | uploading | completed | failed
      assemblyAITranscriptId: null
    }

    await this.sessionDb.setItem(sessionId, sessionMetadata)
    this.currentSessionId = sessionId
    this.totalBytesBuffered = 0

    console.log(`🎙️ Started audio buffer session: ${sessionId}`)
    return sessionId
  }

  /**
   * Store an audio chunk incrementally
   * @param {string} sessionId
   * @param {Blob} chunkBlob - Audio chunk from MediaRecorder
   * @param {number} chunkIndex - Sequential chunk index
   */
  async storeChunk(sessionId, chunkBlob, chunkIndex) {
    if (!sessionId) {
      console.warn('⚠️ Cannot store chunk without sessionId')
      return
    }

    const chunk = {
      sessionId,
      chunkIndex,
      blob: chunkBlob,
      size: chunkBlob.size,
      timestamp: Date.now(),
      mimeType: chunkBlob.type
    }

    this.chunkBuffer.push(chunk)
    this.totalBytesBuffered += chunkBlob.size

    // Flush buffer if size threshold reached
    if (this.chunkBuffer.length >= this.bufferSize) {
      await this.flushChunkBuffer()
    }
  }

  /**
   * Flush chunk buffer to IndexedDB
   */
  async flushChunkBuffer() {
    if (this.chunkBuffer.length === 0) return

    try {
      // Write all buffered chunks
      const writePromises = this.chunkBuffer.map(chunk =>
        this.db.setItem(`${chunk.sessionId}_chunk_${chunk.chunkIndex}`, chunk)
      )
      await Promise.all(writePromises)

      // Update session metadata
      if (this.currentSessionId) {
        const session = await this.sessionDb.getItem(this.currentSessionId)
        if (session) {
          session.chunkCount += this.chunkBuffer.length
          session.totalBytes += this.chunkBuffer.reduce((sum, c) => sum + c.size, 0)
          session.lastUpdateTime = Date.now()
          await this.sessionDb.setItem(this.currentSessionId, session)
        }
      }

      console.log(`💾 Flushed ${this.chunkBuffer.length} audio chunks (${(this.totalBytesBuffered / 1024).toFixed(2)} KB) to IndexedDB`)
      this.chunkBuffer = []
      this.totalBytesBuffered = 0
    } catch (error) {
      console.error('❌ Failed to flush audio chunk buffer:', error)
      // Keep buffer in memory for retry
    }
  }

  /**
   * Complete a session (force flush)
   * @param {string} sessionId
   * @param {Object} finalStatus - Final status info
   */
  async completeSession(sessionId, finalStatus = {}) {
    // Flush any remaining chunks
    await this.flushChunkBuffer()

    // Update session metadata
    const session = await this.sessionDb.getItem(sessionId)
    if (session) {
      session.isActive = false
      session.completedTime = Date.now()
      session.uploadStatus = finalStatus.uploadStatus || session.uploadStatus
      session.assemblyAITranscriptId = finalStatus.assemblyAITranscriptId || session.assemblyAITranscriptId
      await this.sessionDb.setItem(sessionId, session)
      console.log(`✅ Completed audio buffer session: ${sessionId}`)
    }

    if (this.currentSessionId === sessionId) {
      this.currentSessionId = null
    }
  }

  /**
   * Reconstruct complete audio blob from stored chunks
   * @param {string} sessionId
   * @returns {Blob|null} Complete audio blob
   */
  async reconstructAudio(sessionId) {
    try {
      const chunks = []

      // Retrieve all chunks for this session
      await this.db.iterate((value, key) => {
        if (key.startsWith(`${sessionId}_chunk_`)) {
          chunks.push(value)
        }
      })

      if (chunks.length === 0) {
        console.warn(`⚠️ No audio chunks found for session ${sessionId}`)
        return null
      }

      // Sort by chunk index
      chunks.sort((a, b) => a.chunkIndex - b.chunkIndex)

      // Reconstruct blob
      const blobs = chunks.map(c => c.blob)
      const mimeType = chunks[0].mimeType || 'audio/webm'
      const completeBlob = new Blob(blobs, { type: mimeType })

      console.log(`🔧 Reconstructed audio: ${chunks.length} chunks, ${(completeBlob.size / 1024).toFixed(2)} KB`)
      return completeBlob
    } catch (error) {
      console.error('❌ Failed to reconstruct audio:', error)
      return null
    }
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
   * Find all sessions pending upload (for background sync)
   * @returns {Array} Array of pending session metadata
   */
  async getPendingUploadSessions() {
    const pendingSessions = []

    await this.sessionDb.iterate((value, key) => {
      if (value.uploadStatus === 'pending' || value.uploadStatus === 'failed') {
        pendingSessions.push(value)
      }
    })

    // Sort by start time (oldest first for retry)
    pendingSessions.sort((a, b) => a.startTime - b.startTime)

    console.log(`📤 Found ${pendingSessions.length} sessions pending upload`)
    return pendingSessions
  }

  /**
   * Mark session as uploaded successfully
   * @param {string} sessionId
   * @param {string} transcriptId - AssemblyAI transcript ID
   */
  async markUploaded(sessionId, transcriptId) {
    const session = await this.sessionDb.getItem(sessionId)
    if (session) {
      session.uploadStatus = 'completed'
      session.assemblyAITranscriptId = transcriptId
      session.uploadCompletedTime = Date.now()
      await this.sessionDb.setItem(sessionId, session)
      console.log(`✅ Marked session ${sessionId} as uploaded (transcript: ${transcriptId})`)
    }
  }

  /**
   * Mark session upload as failed
   * @param {string} sessionId
   * @param {string} errorMessage - Error description
   */
  async markUploadFailed(sessionId, errorMessage) {
    const session = await this.sessionDb.getItem(sessionId)
    if (session) {
      session.uploadStatus = 'failed'
      session.uploadError = errorMessage
      session.lastUploadAttempt = Date.now()
      session.uploadRetryCount = (session.uploadRetryCount || 0) + 1
      await this.sessionDb.setItem(sessionId, session)
      console.error(`❌ Marked session ${sessionId} upload as failed: ${errorMessage}`)
    }
  }

  /**
   * Delete a session and all its chunks
   * @param {string} sessionId
   */
  async deleteSession(sessionId) {
    try {
      // Delete all chunks
      const keysToDelete = []
      await this.db.iterate((value, key) => {
        if (key.startsWith(`${sessionId}_chunk_`)) {
          keysToDelete.push(key)
        }
      })

      await Promise.all(keysToDelete.map(key => this.db.removeItem(key)))

      // Delete session metadata
      await this.sessionDb.removeItem(sessionId)

      console.log(`🗑️ Deleted audio session ${sessionId} and ${keysToDelete.length} chunks`)
    } catch (error) {
      console.error('❌ Failed to delete audio session:', error)
    }
  }

  /**
   * Cleanup old completed sessions (older than 7 days)
   */
  async cleanupOldSessions() {
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000)
    const sessionsToDelete = []

    await this.sessionDb.iterate((value, key) => {
      const isOldCompleted = !value.isActive &&
        value.uploadStatus === 'completed' &&
        value.uploadCompletedTime &&
        value.uploadCompletedTime < sevenDaysAgo

      if (isOldCompleted) {
        sessionsToDelete.push(value.sessionId)
      }
    })

    console.log(`🧹 Cleaning up ${sessionsToDelete.length} old audio sessions`)
    await Promise.all(sessionsToDelete.map(id => this.deleteSession(id)))
  }

  /**
   * Get storage statistics
   * @returns {Object} Storage stats
   */
  async getStats() {
    let totalChunks = 0
    let totalSessions = 0
    let pendingUploadSessions = 0
    let totalBytes = 0

    await this.db.iterate(() => totalChunks++)
    await this.sessionDb.iterate((value) => {
      totalSessions++
      totalBytes += value.totalBytes || 0
      if (value.uploadStatus === 'pending' || value.uploadStatus === 'failed') {
        pendingUploadSessions++
      }
    })

    return {
      totalChunks,
      totalSessions,
      pendingUploadSessions,
      totalBytes,
      totalMB: (totalBytes / (1024 * 1024)).toFixed(2),
      bufferSize: this.chunkBuffer.length
    }
  }
}

// Export singleton instance
export default new StreamingAudioBuffer()
