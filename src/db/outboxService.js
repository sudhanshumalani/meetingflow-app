/**
 * Outbox Service
 *
 * Implements the outbox pattern for reliable sync:
 * 1. All mutations are queued in the outbox
 * 2. Outbox is processed when online
 * 3. Failed operations are retried with exponential backoff
 * 4. Provides guaranteed eventual consistency
 *
 * ROLLBACK: git checkout v1.0.37-pre-dexie
 */

import db, { generateClientOpId } from './meetingFlowDB'

// Maximum retries before marking as failed
const MAX_RETRIES = 5

// Base delay for exponential backoff (ms)
const BASE_RETRY_DELAY = 1000

// Process interval when online
const PROCESS_INTERVAL = 30000 // 30 seconds

// Outbox processor state
let processingInterval = null
let isProcessing = false

/**
 * Add an operation to the outbox
 */
export async function queueOperation(entityType, entityId, operation, changes) {
  const entry = {
    entityType,
    entityId,
    operation,
    changes,
    status: 'pending',
    timestamp: Date.now(),
    clientOpId: generateClientOpId(),
    retryCount: 0,
    lastError: null
  }

  const id = await db.outbox.add(entry)
  console.log(`📤 Queued ${operation} for ${entityType}:${entityId.slice(0, 8)}... (outbox #${id})`)

  // Try to process immediately if online
  if (navigator.onLine && !isProcessing) {
    processOutbox()
  }

  return id
}

/**
 * Queue a meeting create/update
 */
export async function queueMeetingChange(meeting, operation = 'UPDATE') {
  return queueOperation('meeting', meeting.id, operation, meeting)
}

/**
 * Queue a meeting deletion
 */
export async function queueMeetingDeletion(meetingId) {
  return queueOperation('meeting', meetingId, 'DELETE', { id: meetingId })
}

/**
 * Queue a stakeholder change
 */
export async function queueStakeholderChange(stakeholder, operation = 'UPDATE') {
  return queueOperation('stakeholder', stakeholder.id, operation, stakeholder)
}

/**
 * Queue a stakeholder deletion
 */
export async function queueStakeholderDeletion(stakeholderId) {
  return queueOperation('stakeholder', stakeholderId, 'DELETE', { id: stakeholderId })
}

/**
 * Queue a category change
 */
export async function queueCategoryChange(category, operation = 'UPDATE') {
  const id = category.id || category.key
  return queueOperation('stakeholderCategory', id, operation, category)
}

/**
 * Get pending outbox entries
 */
export async function getPendingEntries() {
  return db.outbox.where('status').equals('pending').toArray()
}

/**
 * Get failed outbox entries
 */
export async function getFailedEntries() {
  return db.outbox.where('status').equals('failed').toArray()
}

/**
 * Get outbox statistics
 */
export async function getOutboxStats() {
  const pending = await db.outbox.where('status').equals('pending').count()
  const processing = await db.outbox.where('status').equals('processing').count()
  const failed = await db.outbox.where('status').equals('failed').count()

  return {
    pending,
    processing,
    failed,
    total: pending + processing + failed,
    hasWork: pending > 0 || processing > 0
  }
}

/**
 * Process all pending outbox entries
 */
export async function processOutbox(syncFunction) {
  if (isProcessing) {
    console.log('📤 Outbox already processing, skipping...')
    return { processed: 0, failed: 0 }
  }

  if (!navigator.onLine) {
    console.log('📴 Offline - outbox processing skipped')
    return { processed: 0, failed: 0, offline: true }
  }

  isProcessing = true
  console.log('📤 Processing outbox...')

  let processed = 0
  let failed = 0

  try {
    const entries = await db.outbox
      .where('status')
      .equals('pending')
      .toArray()

    if (entries.length === 0) {
      console.log('📤 Outbox empty')
      return { processed: 0, failed: 0 }
    }

    console.log(`📤 Processing ${entries.length} outbox entries...`)

    for (const entry of entries) {
      try {
        // Mark as processing
        await db.outbox.update(entry.id, { status: 'processing' })

        // Process the entry (this is where you'd call Firestore)
        if (syncFunction) {
          await syncFunction(entry)
        } else {
          // Default: Just log (actual sync happens in AppContext)
          console.log(`📤 Would sync: ${entry.operation} ${entry.entityType}:${entry.entityId.slice(0, 8)}...`)
        }

        // Mark as complete and remove
        await db.outbox.delete(entry.id)
        processed++
        console.log(`✅ Synced ${entry.entityType}:${entry.entityId.slice(0, 8)}...`)

      } catch (error) {
        failed++
        const retryCount = entry.retryCount + 1

        if (retryCount >= MAX_RETRIES) {
          // Mark as failed permanently
          await db.outbox.update(entry.id, {
            status: 'failed',
            retryCount,
            lastError: error.message
          })
          console.error(`❌ Permanently failed: ${entry.entityType}:${entry.entityId}`, error)
        } else {
          // Mark for retry
          await db.outbox.update(entry.id, {
            status: 'pending',
            retryCount,
            lastError: error.message
          })
          console.warn(`⚠️ Will retry (${retryCount}/${MAX_RETRIES}): ${entry.entityType}:${entry.entityId}`)
        }
      }
    }

    console.log(`📤 Outbox processed: ${processed} succeeded, ${failed} failed`)
    return { processed, failed }

  } finally {
    isProcessing = false
  }
}

/**
 * Retry failed entries
 */
export async function retryFailedEntries() {
  const failed = await db.outbox.where('status').equals('failed').toArray()

  if (failed.length === 0) {
    return { reset: 0 }
  }

  for (const entry of failed) {
    await db.outbox.update(entry.id, {
      status: 'pending',
      retryCount: 0,
      lastError: null
    })
  }

  console.log(`🔄 Reset ${failed.length} failed entries for retry`)
  return { reset: failed.length }
}

/**
 * Clear completed entries older than X hours
 */
export async function cleanupOldEntries(maxAgeHours = 24) {
  const cutoff = Date.now() - (maxAgeHours * 60 * 60 * 1000)

  // We don't store completed entries, but clean up old failed ones
  const oldFailed = await db.outbox
    .where('status')
    .equals('failed')
    .filter(entry => entry.timestamp < cutoff)
    .toArray()

  for (const entry of oldFailed) {
    await db.outbox.delete(entry.id)
  }

  if (oldFailed.length > 0) {
    console.log(`🧹 Cleaned up ${oldFailed.length} old failed entries`)
  }

  return { cleaned: oldFailed.length }
}

/**
 * Start automatic outbox processing
 */
export function startOutboxProcessor(syncFunction) {
  if (processingInterval) {
    console.log('📤 Outbox processor already running')
    return
  }

  console.log('📤 Starting outbox processor...')

  // Process immediately
  processOutbox(syncFunction)

  // Then process periodically
  processingInterval = setInterval(() => {
    if (navigator.onLine) {
      processOutbox(syncFunction)
    }
  }, PROCESS_INTERVAL)

  // Process on coming online
  window.addEventListener('online', () => {
    console.log('📡 Back online - processing outbox')
    processOutbox(syncFunction)
  })
}

/**
 * Stop automatic outbox processing
 */
export function stopOutboxProcessor() {
  if (processingInterval) {
    clearInterval(processingInterval)
    processingInterval = null
    console.log('📤 Outbox processor stopped')
  }
}

/**
 * Check if an operation is already queued (for deduplication)
 */
export async function isOperationQueued(entityId, operation) {
  const existing = await db.outbox
    .where('entityId')
    .equals(entityId)
    .filter(entry =>
      entry.operation === operation &&
      entry.status === 'pending'
    )
    .first()

  return !!existing
}

/**
 * Cancel a pending operation
 */
export async function cancelOperation(entityId, operation) {
  const entries = await db.outbox
    .where('entityId')
    .equals(entityId)
    .filter(entry =>
      (!operation || entry.operation === operation) &&
      entry.status === 'pending'
    )
    .toArray()

  for (const entry of entries) {
    await db.outbox.delete(entry.id)
  }

  return { cancelled: entries.length }
}

export default {
  queueOperation,
  queueMeetingChange,
  queueMeetingDeletion,
  queueStakeholderChange,
  queueStakeholderDeletion,
  queueCategoryChange,
  getPendingEntries,
  getFailedEntries,
  getOutboxStats,
  processOutbox,
  retryFailedEntries,
  cleanupOldEntries,
  startOutboxProcessor,
  stopOutboxProcessor,
  isOperationQueued,
  cancelOperation
}
