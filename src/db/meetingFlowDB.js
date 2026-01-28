/**
 * MeetingFlow Dexie Database
 *
 * Primary IndexedDB storage using Dexie for:
 * - Scalable meeting storage (100+ meetings)
 * - Tiered hot/warm/cold data management
 * - Reliable offline-first sync with outbox pattern
 * - Reactive queries for analyzer dashboards
 *
 * ROLLBACK: git checkout v1.0.37-pre-dexie
 */

import Dexie from 'dexie'

// Create the database
const db = new Dexie('MeetingFlowDB')

// Define schema
// Note: Only indexed fields are listed in the schema
// Dexie stores the full object, but only these fields are queryable
db.version(1).stores({
  // Meeting metadata - always synced, always local (~1-5 KB each)
  // Indexed: id (primary), date, projectId, lastAccessedAt, localState, version
  // Multi-entry index on stakeholderIds (allows querying meetings by stakeholder)
  meetings: 'id, date, projectId, lastAccessedAt, localState, version, *stakeholderIds',

  // Heavy content - lazy loaded, evictable (~50-200 KB each)
  // Compound index on [meetingId+type] for efficient lookups
  meetingBlobs: '[meetingId+type], meetingId, type',

  // Stakeholders - always local
  stakeholders: 'id, name, company, categoryId, lastContactDate',

  // Stakeholder categories
  stakeholderCategories: 'id, key, name',

  // Sync outbox - guaranteed delivery for offline operations
  // Auto-increment id, indexed by entityType and status
  outbox: '++id, entityType, entityId, operation, status, timestamp',

  // Analyzer index - precomputed for fast cross-meeting queries
  // Multi-entry indexes on keywords, actionItemIds, stakeholderIds
  analysisIndex: 'meetingId, *keywords, *topicTags, sentiment',

  // Sync metadata - tracks sync state
  syncMeta: 'key'
})

// ============================================
// TYPE DEFINITIONS (for reference)
// ============================================

/**
 * @typedef {Object} MeetingMetadata
 * @property {string} id - UUID
 * @property {string} title
 * @property {string} date - ISO date string (YYYY-MM-DD)
 * @property {string} [projectId]
 * @property {string[]} stakeholderIds - Array of stakeholder IDs
 * @property {number} [duration] - Duration in seconds
 * @property {boolean} hasTranscript
 * @property {boolean} hasAnalysis
 * @property {boolean} hasSpeakerData
 * @property {boolean} hasDigitalNotes
 * @property {string} [summaryPreview] - First 200 chars of summary
 * @property {number} actionItemCount
 * @property {number} openActionItemCount
 * @property {number} version - Monotonic version for conflict resolution
 * @property {string} lastAccessedAt - ISO timestamp
 * @property {'hot'|'warm'|'cold'} localState - Tiering state
 * @property {string} createdAt - ISO timestamp
 * @property {string} updatedAt - ISO timestamp
 * @property {boolean} [deleted] - Soft delete flag
 * @property {string} [deletedAt] - When deleted
 */

/**
 * @typedef {Object} MeetingBlob
 * @property {string} meetingId
 * @property {'transcript'|'analysis'|'speakerData'|'digitalNotes'|'notes'|'images'} type
 * @property {string|Object} data - The actual content
 * @property {Object[]} [chunks] - For large transcripts: [{index, text}]
 * @property {number} version
 * @property {number} sizeBytes - Approximate size for quota management
 */

/**
 * @typedef {Object} OutboxEntry
 * @property {number} [id] - Auto-generated
 * @property {'meeting'|'stakeholder'|'stakeholderCategory'} entityType
 * @property {string} entityId
 * @property {'CREATE'|'UPDATE'|'DELETE'} operation
 * @property {Object} changes - The changes to sync
 * @property {'pending'|'processing'|'failed'} status
 * @property {number} timestamp
 * @property {string} clientOpId - Idempotency key (UUID)
 * @property {number} retryCount
 * @property {string} [lastError]
 */

/**
 * @typedef {Object} AnalysisIndex
 * @property {string} meetingId
 * @property {string[]} keywords - Extracted keywords for search
 * @property {string[]} topicTags - Topic categories
 * @property {string[]} actionItemIds - References to action items
 * @property {string[]} stakeholderMentions - Stakeholders mentioned in content
 * @property {'positive'|'neutral'|'negative'|'mixed'} sentiment
 * @property {number} totalActionItems
 * @property {number} openActionItems
 * @property {number} completedActionItems
 */

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Generate a client operation ID for idempotency
 */
export function generateClientOpId() {
  return crypto.randomUUID ? crypto.randomUUID() :
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0
      const v = c === 'x' ? r : (r & 0x3 | 0x8)
      return v.toString(16)
    })
}

/**
 * Calculate approximate size of an object in bytes
 */
export function calculateSize(obj) {
  try {
    return new Blob([JSON.stringify(obj)]).size
  } catch {
    return JSON.stringify(obj).length * 2 // Rough estimate
  }
}

/**
 * Extract metadata from a full meeting object
 * Separates heavy blobs from lightweight metadata
 */
export function extractMeetingMetadata(meeting) {
  if (!meeting) return null

  const metadata = {
    id: meeting.id,
    title: meeting.title || 'Untitled Meeting',
    date: meeting.date || new Date().toISOString().split('T')[0],
    projectId: meeting.projectId || null,
    stakeholderIds: meeting.stakeholderIds ||
                    (meeting.selectedStakeholder ? [meeting.selectedStakeholder] : []),
    duration: meeting.duration || 0,
    hasTranscript: !!(meeting.audioTranscript || meeting.transcript),
    hasAnalysis: !!meeting.aiResult,
    hasSpeakerData: !!meeting.speakerData,
    hasDigitalNotes: !!meeting.digitalNotes,
    summaryPreview: (meeting.aiResult?.summary || meeting.digitalNotes?.summary || '')
      .slice(0, 200),
    actionItemCount: meeting.aiResult?.actionItems?.length || 0,
    openActionItemCount: (meeting.aiResult?.actionItems || [])
      .filter(item => item.status !== 'completed').length,
    version: meeting.version || 1,
    lastAccessedAt: meeting.lastAccessedAt || new Date().toISOString(),
    localState: meeting.localState || 'hot',
    createdAt: meeting.createdAt || new Date().toISOString(),
    updatedAt: meeting.updatedAt || new Date().toISOString(),
    deleted: meeting.deleted || false,
    deletedAt: meeting.deletedAt || null,
    // Keep some display fields in metadata for list views
    scheduledAt: meeting.scheduledAt,
    selectedStakeholder: meeting.selectedStakeholder
  }

  return metadata
}

/**
 * Extract blobs from a full meeting object
 * Returns array of blob entries to store separately
 */
export function extractMeetingBlobs(meeting) {
  if (!meeting) return []

  const blobs = []
  const meetingId = meeting.id
  const version = meeting.version || 1

  // Transcript blob
  const transcript = meeting.audioTranscript || meeting.transcript
  if (transcript) {
    const transcriptData = typeof transcript === 'string' ? transcript : JSON.stringify(transcript)
    const size = calculateSize(transcriptData)

    // Chunk large transcripts (>50KB)
    if (size > 50000) {
      const chunkSize = 40000 // ~40KB per chunk
      const chunks = []
      for (let i = 0; i < transcriptData.length; i += chunkSize) {
        chunks.push({
          index: chunks.length,
          text: transcriptData.slice(i, i + chunkSize)
        })
      }
      blobs.push({
        meetingId,
        type: 'transcript',
        data: null,
        chunks,
        version,
        sizeBytes: size
      })
    } else {
      blobs.push({
        meetingId,
        type: 'transcript',
        data: transcriptData,
        chunks: null,
        version,
        sizeBytes: size
      })
    }
  }

  // AI Analysis blob
  if (meeting.aiResult) {
    blobs.push({
      meetingId,
      type: 'analysis',
      data: meeting.aiResult,
      version,
      sizeBytes: calculateSize(meeting.aiResult)
    })
  }

  // Speaker data blob (stripped of words array which is huge)
  if (meeting.speakerData) {
    const cleanedSpeakerData = {
      ...meeting.speakerData,
      words: undefined // Remove the huge words array
    }
    blobs.push({
      meetingId,
      type: 'speakerData',
      data: cleanedSpeakerData,
      version,
      sizeBytes: calculateSize(cleanedSpeakerData)
    })
  }

  // Digital notes blob
  if (meeting.digitalNotes) {
    blobs.push({
      meetingId,
      type: 'digitalNotes',
      data: meeting.digitalNotes,
      version,
      sizeBytes: calculateSize(meeting.digitalNotes)
    })
  }

  // User notes blob
  if (meeting.notes && meeting.notes.length > 0) {
    blobs.push({
      meetingId,
      type: 'notes',
      data: meeting.notes,
      version,
      sizeBytes: calculateSize(meeting.notes)
    })
  }

  // Images blob (filter out large base64 images)
  if (meeting.images && meeting.images.length > 0) {
    const smallImages = meeting.images.filter(img => {
      if (typeof img !== 'string') return true
      if (!img.startsWith('data:')) return true
      return img.length <= 10000 // Keep only small images
    })
    if (smallImages.length > 0) {
      blobs.push({
        meetingId,
        type: 'images',
        data: smallImages,
        version,
        sizeBytes: calculateSize(smallImages)
      })
    }
  }

  return blobs
}

/**
 * Reconstruct a full meeting object from metadata + blobs
 */
export function reconstructMeeting(metadata, blobs = []) {
  if (!metadata) return null

  const meeting = { ...metadata }

  for (const blob of blobs) {
    switch (blob.type) {
      case 'transcript':
        // Reconstruct from chunks if chunked
        if (blob.chunks && blob.chunks.length > 0) {
          meeting.audioTranscript = blob.chunks
            .sort((a, b) => a.index - b.index)
            .map(c => c.text)
            .join('')
        } else {
          meeting.audioTranscript = blob.data
        }
        break
      case 'analysis':
        meeting.aiResult = blob.data
        break
      case 'speakerData':
        meeting.speakerData = blob.data
        break
      case 'digitalNotes':
        meeting.digitalNotes = blob.data
        break
      case 'notes':
        meeting.notes = blob.data
        break
      case 'images':
        meeting.images = blob.data
        break
    }
  }

  return meeting
}

/**
 * Build analysis index from a meeting
 */
export function buildAnalysisIndex(meeting) {
  if (!meeting) return null

  const actionItems = meeting.aiResult?.actionItems || []

  // Extract keywords from various sources
  const keywords = new Set()

  // From AI result
  if (meeting.aiResult?.keyPoints) {
    const keyPointsText = Array.isArray(meeting.aiResult.keyPoints)
      ? meeting.aiResult.keyPoints.join(' ')
      : meeting.aiResult.keyPoints
    extractKeywords(keyPointsText).forEach(k => keywords.add(k))
  }

  // From title
  if (meeting.title) {
    extractKeywords(meeting.title).forEach(k => keywords.add(k))
  }

  // Topic tags from AI analysis
  const topicTags = meeting.aiResult?.topics || []

  return {
    meetingId: meeting.id,
    keywords: Array.from(keywords).slice(0, 50), // Limit to 50 keywords
    topicTags: Array.isArray(topicTags) ? topicTags : [],
    actionItemIds: actionItems.map((item, idx) => `${meeting.id}-action-${idx}`),
    stakeholderMentions: meeting.stakeholderIds || [],
    sentiment: meeting.aiResult?.sentiment?.overall || 'neutral',
    totalActionItems: actionItems.length,
    openActionItems: actionItems.filter(i => i.status !== 'completed').length,
    completedActionItems: actionItems.filter(i => i.status === 'completed').length
  }
}

/**
 * Simple keyword extraction
 */
function extractKeywords(text) {
  if (!text || typeof text !== 'string') return []

  // Common stop words to filter out
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
    'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought',
    'used', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it',
    'we', 'they', 'what', 'which', 'who', 'whom', 'where', 'when', 'why', 'how'
  ])

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3 && !stopWords.has(word))
    .slice(0, 20)
}

// ============================================
// DATABASE OPERATIONS
// ============================================

/**
 * Check if database is ready
 */
export async function isDatabaseReady() {
  try {
    await db.open()
    return true
  } catch (error) {
    console.error('Database not ready:', error)
    return false
  }
}

/**
 * Get storage estimate
 */
export async function getStorageEstimate() {
  try {
    if (navigator.storage?.estimate) {
      const { usage, quota } = await navigator.storage.estimate()
      return {
        usage,
        quota,
        usagePercent: ((usage / quota) * 100).toFixed(2),
        available: quota - usage
      }
    }
    return null
  } catch (error) {
    console.error('Failed to get storage estimate:', error)
    return null
  }
}

/**
 * Request persistent storage
 */
export async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist) {
      const persisted = await navigator.storage.persist()
      console.log(persisted
        ? '✅ Storage is now persistent'
        : '⚠️ Storage persistence not granted')
      return persisted
    }
    return false
  } catch (error) {
    console.error('Failed to request persistent storage:', error)
    return false
  }
}

/**
 * Clear all data (use with caution!)
 */
export async function clearAllData() {
  await db.meetings.clear()
  await db.meetingBlobs.clear()
  await db.stakeholders.clear()
  await db.stakeholderCategories.clear()
  await db.outbox.clear()
  await db.analysisIndex.clear()
  await db.syncMeta.clear()
  console.log('🗑️ All Dexie data cleared')
}

// Export the database instance
export { db }
export default db
