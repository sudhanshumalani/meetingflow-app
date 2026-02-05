/**
 * Dexie Service
 *
 * Main service for interacting with the Dexie database.
 * Provides CRUD operations with automatic outbox queuing.
 *
 * This service is the bridge between AppContext and Dexie.
 * It handles:
 * - Reading/writing meetings with metadata/blob separation
 * - Hot/warm/cold tiering
 * - Automatic analysis index updates
 * - Outbox queuing for sync
 *
 * ROLLBACK: git checkout v1.0.37-pre-dexie
 */

import db, {
  extractMeetingMetadata,
  extractMeetingBlobs,
  reconstructMeeting,
  buildAnalysisIndex,
  getStorageEstimate,
  requestPersistentStorage
} from './meetingFlowDB'
import {
  queueMeetingChange,
  queueMeetingDeletion,
  queueStakeholderChange,
  queueStakeholderDeletion,
  queueCategoryChange
} from './outboxService'

// Storage thresholds (raised for desktop use - these were too conservative)
// 923 MB is only 0.32% of a typical 291 GB quota
const STORAGE_WARNING_MB = 500   // Warning at 500 MB
const STORAGE_CRITICAL_MB = 1000 // Critical at 1 GB

// Tiering thresholds
const HOT_THRESHOLD_DAYS = 7 // Meetings accessed in last 7 days
const WARM_THRESHOLD_DAYS = 30 // Meetings accessed in last 30 days

// ============================================
// INITIALIZATION
// ============================================

/**
 * Initialize Dexie service
 */
export async function initializeDexieService() {
  try {
    await db.open()
    console.log('✅ Dexie database opened')

    // Request persistent storage
    await requestPersistentStorage()

    // Check storage
    const storage = await getStorageEstimate()
    if (storage) {
      const usageMB = storage.usage / (1024 * 1024)
      console.log(`📊 Storage: ${usageMB.toFixed(2)} MB used (${storage.usagePercent}%)`)

      if (usageMB > STORAGE_CRITICAL_MB) {
        console.warn('⚠️ Storage critical! Consider evicting old data.')
      } else if (usageMB > STORAGE_WARNING_MB) {
        console.warn('⚠️ Storage warning: approaching limits')
      }
    }

    return { success: true }
  } catch (error) {
    console.error('❌ Failed to initialize Dexie:', error)
    return { success: false, error: error.message }
  }
}

// ============================================
// MEETING OPERATIONS
// ============================================

/**
 * Get all meeting metadata (for list views)
 * Fast - only loads lightweight metadata
 */
export async function getAllMeetingMetadata() {
  return db.meetings
    .orderBy('date')
    .reverse()
    .toArray()
}

/**
 * Get meeting metadata by ID
 */
export async function getMeetingMetadata(meetingId) {
  return db.meetings.get(meetingId)
}

/**
 * Get full meeting (metadata + blobs)
 * Slower - loads all blob data
 */
export async function getFullMeeting(meetingId) {
  const metadata = await db.meetings.get(meetingId)
  if (!metadata) return null

  const blobs = await db.meetingBlobs
    .where('meetingId')
    .equals(meetingId)
    .toArray()

  // Update last accessed time and state
  await db.meetings.update(meetingId, {
    lastAccessedAt: new Date().toISOString(),
    localState: 'hot'
  })

  return reconstructMeeting(metadata, blobs)
}

/**
 * Check if full meeting data is available locally
 */
export async function hasMeetingBlobs(meetingId) {
  const count = await db.meetingBlobs
    .where('meetingId')
    .equals(meetingId)
    .count()
  return count > 0
}

/**
 * Save a meeting (creates or updates)
 * Automatically splits into metadata and blobs
 *
 * ARCHITECTURE FIX: Uses LAST-WRITE-WINS logic based on timestamps
 * Delete is just another change - newer timestamp always wins
 */
export async function saveMeeting(meeting, options = {}) {
  const {
    queueSync = true,
    operation = 'UPDATE'
  } = options

  if (!meeting || !meeting.id) {
    throw new Error('Meeting must have an id')
  }

  // Extract metadata and blobs
  const metadata = extractMeetingMetadata(meeting)
  const blobs = extractMeetingBlobs(meeting)

  // Check existing meeting for last-write-wins logic
  const existingMeta = await db.meetings.get(meeting.id)

  // LAST-WRITE-WINS: Compare timestamps to decide if we should overwrite
  if (existingMeta) {
    const existingTime = new Date(existingMeta.updatedAt || existingMeta.createdAt || 0).getTime()
    const incomingTime = new Date(meeting.updatedAt || meeting.createdAt || 0).getTime()

    // If existing is newer, skip this save (unless it's a new local change with no timestamp)
    if (existingTime > incomingTime && incomingTime > 0) {
      console.log(`⏱️ SAVE: Skipping older save for meeting ${meeting.id.slice(0, 8)}... (existing: ${new Date(existingTime).toISOString()}, incoming: ${new Date(incomingTime).toISOString()})`)
      return existingMeta
    }
  }

  // Preserve deleted status if incoming has it
  if (meeting.deleted) {
    metadata.deleted = true
    metadata.deletedAt = meeting.deletedAt || new Date().toISOString()
    console.log(`💾 SAVE: Saving meeting ${meeting.id.slice(0, 8)}... with deleted=${metadata.deleted}`)
  }

  // Update version
  metadata.version = (existingMeta?.version || 0) + 1
  metadata.localState = 'hot'
  metadata.lastAccessedAt = new Date().toISOString()
  metadata.updatedAt = meeting.updatedAt || new Date().toISOString()

  // Save in transaction
  await db.transaction('rw', [db.meetings, db.meetingBlobs, db.analysisIndex], async () => {
    // Save metadata
    await db.meetings.put(metadata)

    // Save blobs (replace existing)
    await db.meetingBlobs.where('meetingId').equals(meeting.id).delete()
    for (const blob of blobs) {
      await db.meetingBlobs.put(blob)
    }

    // Update analysis index
    const analysisIdx = buildAnalysisIndex(meeting)
    if (analysisIdx) {
      await db.analysisIndex.put(analysisIdx)
    }
  })

  // POST-SAVE VALIDATION: Read back and verify critical fields
  // This catches silent IndexedDB failures on iOS
  try {
    const verification = await db.meetings.get(meeting.id)
    const savedBlobs = await db.meetingBlobs.where('meetingId').equals(meeting.id).toArray()

    if (!verification) {
      console.error(`❌ POST-SAVE VALIDATION FAILED: Meeting ${meeting.id.slice(0, 8)} not found after save!`)
      throw new Error('Save verification failed: meeting not found after save')
    }

    if (verification.version !== metadata.version) {
      console.error(`❌ POST-SAVE VALIDATION FAILED: Version mismatch (expected ${metadata.version}, got ${verification.version})`)
      throw new Error('Save verification failed: version mismatch')
    }

    if (blobs.length > 0 && savedBlobs.length !== blobs.length) {
      console.warn(`⚠️ POST-SAVE WARNING: Blob count mismatch (expected ${blobs.length}, got ${savedBlobs.length})`)
    }

    console.log(`💾 Saved meeting ${meeting.id.slice(0, 8)}... (v${metadata.version}, ${savedBlobs.length} blobs, deleted=${metadata.deleted || false}) ✓ verified`)
  } catch (verifyErr) {
    if (verifyErr.message.includes('verification failed')) {
      throw verifyErr // Re-throw validation errors
    }
    console.error(`❌ POST-SAVE VALIDATION ERROR: ${verifyErr.message}`)
    // Don't throw for read errors - the write may have succeeded
  }

  // Queue for sync
  if (queueSync) {
    await queueMeetingChange(meeting, operation)
  }

  return metadata
}

/**
 * Delete a meeting
 */
export async function deleteMeeting(meetingId, options = {}) {
  const { queueSync = true } = options

  await db.transaction('rw', [db.meetings, db.meetingBlobs, db.analysisIndex], async () => {
    // Delete metadata
    await db.meetings.delete(meetingId)

    // Delete blobs
    await db.meetingBlobs.where('meetingId').equals(meetingId).delete()

    // Delete analysis index
    await db.analysisIndex.delete(meetingId)
  })

  console.log(`🗑️ Deleted meeting ${meetingId.slice(0, 8)}...`)

  // Queue for sync
  if (queueSync) {
    await queueMeetingDeletion(meetingId)
  }
}

/**
 * Soft delete a meeting (mark as deleted but keep data)
 */
export async function softDeleteMeeting(meetingId, options = {}) {
  const { queueSync = true } = options

  await db.meetings.update(meetingId, {
    deleted: true,
    deletedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  })

  console.log(`🗑️ Soft deleted meeting ${meetingId.slice(0, 8)}...`)

  if (queueSync) {
    await queueMeetingDeletion(meetingId)
  }
}

/**
 * Get meetings for a specific stakeholder
 */
export async function getMeetingsForStakeholder(stakeholderId) {
  return db.meetings
    .where('stakeholderIds')
    .equals(stakeholderId)
    .reverse()
    .sortBy('date')
}

/**
 * Get meetings in a date range
 */
export async function getMeetingsInRange(startDate, endDate) {
  return db.meetings
    .where('date')
    .between(startDate, endDate)
    .reverse()
    .toArray()
}

/**
 * Get recent meetings (last N days)
 */
export async function getRecentMeetings(days = 7) {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - days)
  const cutoff = cutoffDate.toISOString().split('T')[0]

  return db.meetings
    .where('date')
    .above(cutoff)
    .reverse()
    .toArray()
}

// ============================================
// STAKEHOLDER OPERATIONS
// ============================================

/**
 * Get all stakeholders
 */
export async function getAllStakeholders() {
  return db.stakeholders.toArray()
}

/**
 * Get stakeholder by ID
 */
export async function getStakeholder(stakeholderId) {
  return db.stakeholders.get(stakeholderId)
}

/**
 * Save a stakeholder
 * SYNC FIX: Implements delete-wins logic
 */
export async function saveStakeholder(stakeholder, options = {}) {
  const { queueSync = true, operation = 'UPDATE' } = options

  if (!stakeholder || !stakeholder.id) {
    throw new Error('Stakeholder must have an id')
  }

  const existing = await db.stakeholders.get(stakeholder.id)

  // SYNC FIX: DELETE-WINS LOGIC
  if (existing?.deleted && !stakeholder.deleted) {
    console.log(`🛡️ DELETE-WINS: Rejecting non-deleted save for deleted stakeholder ${stakeholder.id.slice(0, 8)}...`)
    return existing
  }

  const updatedStakeholder = {
    ...stakeholder,
    version: (existing?.version || 0) + 1,
    updatedAt: stakeholder.updatedAt || new Date().toISOString(),
    // Preserve deleted state if incoming is deleted
    deleted: stakeholder.deleted || false,
    deletedAt: stakeholder.deleted ? (stakeholder.deletedAt || new Date().toISOString()) : undefined
  }

  await db.stakeholders.put(updatedStakeholder)
  console.log(`💾 Saved stakeholder ${stakeholder.id.slice(0, 8)}... (deleted=${updatedStakeholder.deleted})`)

  if (queueSync) {
    await queueStakeholderChange(updatedStakeholder, operation)
  }

  return updatedStakeholder
}

/**
 * Delete a stakeholder
 */
export async function deleteStakeholder(stakeholderId, options = {}) {
  const { queueSync = true } = options

  await db.stakeholders.delete(stakeholderId)
  console.log(`🗑️ Deleted stakeholder ${stakeholderId.slice(0, 8)}...`)

  if (queueSync) {
    await queueStakeholderDeletion(stakeholderId)
  }
}

/**
 * Soft delete a stakeholder (set deleted=true)
 * PHASE 4: Soft delete pattern for sync consistency
 */
export async function softDeleteStakeholder(stakeholderId, options = {}) {
  const { queueSync = true } = options

  await db.stakeholders.update(stakeholderId, {
    deleted: true,
    deletedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  })

  console.log(`🗑️ Soft deleted stakeholder ${stakeholderId.slice(0, 8)}...`)

  if (queueSync) {
    await queueStakeholderDeletion(stakeholderId)
  }
}

/**
 * Get stakeholders by category
 */
export async function getStakeholdersByCategory(categoryId) {
  return db.stakeholders
    .where('categoryId')
    .equals(categoryId)
    .toArray()
}

// ============================================
// STAKEHOLDER CATEGORY OPERATIONS
// ============================================

/**
 * Get all stakeholder categories
 */
export async function getAllCategories() {
  return db.stakeholderCategories.toArray()
}

/**
 * Save a category
 * SYNC FIX: Implements delete-wins logic
 */
export async function saveCategory(category, options = {}) {
  const { queueSync = true, operation = 'UPDATE' } = options

  const id = category.id || category.key
  if (!id) {
    throw new Error('Category must have an id or key')
  }

  const existing = await db.stakeholderCategories.get(id)

  // SYNC FIX: DELETE-WINS LOGIC
  if (existing?.deleted && !category.deleted) {
    console.log(`🛡️ DELETE-WINS: Rejecting non-deleted save for deleted category ${id}`)
    return existing
  }

  const categoryWithId = {
    ...category,
    id,
    updatedAt: category.updatedAt || new Date().toISOString(),
    deleted: category.deleted || false,
    deletedAt: category.deleted ? (category.deletedAt || new Date().toISOString()) : undefined
  }

  await db.stakeholderCategories.put(categoryWithId)
  console.log(`💾 Saved category ${id} (deleted=${categoryWithId.deleted})`)

  if (queueSync) {
    await queueCategoryChange(categoryWithId, operation)
  }

  return categoryWithId
}

/**
 * Delete a category
 */
export async function deleteCategory(categoryId, options = {}) {
  const { queueSync = true } = options

  await db.stakeholderCategories.delete(categoryId)
  console.log(`🗑️ Deleted category ${categoryId}`)

  if (queueSync) {
    await queueCategoryChange({ id: categoryId }, 'DELETE')
  }
}

/**
 * Soft delete a category (set deleted=true)
 * PHASE 4: Soft delete pattern for sync consistency
 */
export async function softDeleteCategory(categoryId, options = {}) {
  const { queueSync = true } = options

  await db.stakeholderCategories.update(categoryId, {
    deleted: true,
    deletedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  })

  console.log(`🗑️ Soft deleted category ${categoryId}`)

  if (queueSync) {
    await queueCategoryChange({ id: categoryId }, 'DELETE')
  }
}

// ============================================
// TIERING OPERATIONS
// ============================================

/**
 * Update meeting tiers based on access patterns
 */
export async function updateMeetingTiers() {
  const now = Date.now()
  const hotCutoff = now - (HOT_THRESHOLD_DAYS * 24 * 60 * 60 * 1000)
  const warmCutoff = now - (WARM_THRESHOLD_DAYS * 24 * 60 * 60 * 1000)

  const meetings = await db.meetings.toArray()
  let updated = 0

  for (const meeting of meetings) {
    const lastAccessed = new Date(meeting.lastAccessedAt).getTime()
    let newState = meeting.localState

    if (lastAccessed > hotCutoff) {
      newState = 'hot'
    } else if (lastAccessed > warmCutoff) {
      newState = 'warm'
    } else {
      newState = 'cold'
    }

    if (newState !== meeting.localState) {
      await db.meetings.update(meeting.id, { localState: newState })
      updated++
    }
  }

  console.log(`📊 Updated tiers for ${updated} meetings`)
  return { updated }
}

/**
 * Evict cold meeting blobs to free space
 * Keeps metadata, removes heavy content
 */
export async function evictColdMeetingBlobs() {
  const coldMeetings = await db.meetings
    .where('localState')
    .equals('cold')
    .toArray()

  let evicted = 0
  let freedBytes = 0

  for (const meeting of coldMeetings) {
    const blobs = await db.meetingBlobs
      .where('meetingId')
      .equals(meeting.id)
      .toArray()

    if (blobs.length > 0) {
      for (const blob of blobs) {
        freedBytes += blob.sizeBytes || 0
      }

      await db.meetingBlobs.where('meetingId').equals(meeting.id).delete()
      evicted++

      console.log(`🧹 Evicted blobs for cold meeting ${meeting.id.slice(0, 8)}...`)
    }
  }

  console.log(`🧹 Evicted ${evicted} cold meetings, freed ~${(freedBytes / 1024 / 1024).toFixed(2)} MB`)
  return { evicted, freedBytes }
}

/**
 * Smart eviction based on storage pressure
 */
export async function manageStorage() {
  const storage = await getStorageEstimate()
  if (!storage) return { action: 'none', reason: 'Could not estimate storage' }

  const usageMB = storage.usage / (1024 * 1024)

  if (usageMB < STORAGE_WARNING_MB) {
    return { action: 'none', usageMB }
  }

  // First, update tiers
  await updateMeetingTiers()

  // Then evict cold blobs
  const evictionResult = await evictColdMeetingBlobs()

  // If still over critical, evict warm blobs too
  const newStorage = await getStorageEstimate()
  const newUsageMB = newStorage.usage / (1024 * 1024)

  if (newUsageMB > STORAGE_CRITICAL_MB) {
    console.warn('⚠️ Still over critical storage, evicting warm meeting blobs...')

    const warmMeetings = await db.meetings
      .where('localState')
      .equals('warm')
      .toArray()

    // Sort by lastAccessedAt and evict oldest first
    warmMeetings.sort((a, b) =>
      new Date(a.lastAccessedAt).getTime() - new Date(b.lastAccessedAt).getTime()
    )

    for (const meeting of warmMeetings.slice(0, 10)) { // Evict oldest 10
      await db.meetingBlobs.where('meetingId').equals(meeting.id).delete()
      await db.meetings.update(meeting.id, { localState: 'cold' })
    }
  }

  return {
    action: 'evicted',
    usageMB,
    newUsageMB,
    ...evictionResult
  }
}

// ============================================
// BULK OPERATIONS
// ============================================

/**
 * Bulk save meetings (for sync)
 */
export async function bulkSaveMeetings(meetings, options = {}) {
  const { queueSync = false } = options

  let saved = 0
  for (const meeting of meetings) {
    try {
      await saveMeeting(meeting, { queueSync, operation: 'UPDATE' })
      saved++
    } catch (e) {
      console.error(`Failed to save meeting ${meeting.id}:`, e)
    }
  }

  return { saved, total: meetings.length }
}

/**
 * Bulk save stakeholders (for sync)
 */
export async function bulkSaveStakeholders(stakeholders, options = {}) {
  const { queueSync = false } = options

  let saved = 0
  for (const stakeholder of stakeholders) {
    try {
      await saveStakeholder(stakeholder, { queueSync, operation: 'UPDATE' })
      saved++
    } catch (e) {
      console.error(`Failed to save stakeholder ${stakeholder.id}:`, e)
    }
  }

  return { saved, total: stakeholders.length }
}

/**
 * Bulk save categories (for sync)
 */
export async function bulkSaveCategories(categories, options = {}) {
  const { queueSync = false } = options

  let saved = 0
  for (const category of categories) {
    try {
      await saveCategory(category, { queueSync, operation: 'UPDATE' })
      saved++
    } catch (e) {
      console.error(`Failed to save category:`, e)
    }
  }

  return { saved, total: categories.length }
}

// ============================================
// STATISTICS
// ============================================

/**
 * Get database statistics
 */
export async function getDatabaseStats() {
  const meetingCount = await db.meetings.count()
  const blobCount = await db.meetingBlobs.count()
  const stakeholderCount = await db.stakeholders.count()
  const categoryCount = await db.stakeholderCategories.count()
  const analysisIndexCount = await db.analysisIndex.count()

  const hotCount = await db.meetings.where('localState').equals('hot').count()
  const warmCount = await db.meetings.where('localState').equals('warm').count()
  const coldCount = await db.meetings.where('localState').equals('cold').count()

  const storage = await getStorageEstimate()

  return {
    meetings: {
      total: meetingCount,
      hot: hotCount,
      warm: warmCount,
      cold: coldCount
    },
    blobs: blobCount,
    stakeholders: stakeholderCount,
    categories: categoryCount,
    analysisIndex: analysisIndexCount,
    storage
  }
}

// ============================================
// RECOVERY FUNCTIONS (60-day trash)
// ============================================

const TRASH_RETENTION_DAYS = 60

/**
 * Get all deleted items within the retention period (60 days)
 * Returns meetings, stakeholders, and categories that can be recovered
 */
export async function getRecoverableDeletedItems() {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - TRASH_RETENTION_DAYS)
  const cutoffTime = cutoffDate.getTime()

  // Get deleted meetings
  const allMeetings = await db.meetings.toArray()
  const deletedMeetings = allMeetings.filter(m => {
    if (!m.deleted) return false
    const deletedAt = new Date(m.deletedAt || 0).getTime()
    return deletedAt > cutoffTime
  })

  // Get deleted stakeholders
  const allStakeholders = await db.stakeholders.toArray()
  const deletedStakeholders = allStakeholders.filter(s => {
    if (!s.deleted) return false
    const deletedAt = new Date(s.deletedAt || 0).getTime()
    return deletedAt > cutoffTime
  })

  // Get deleted categories
  const allCategories = await db.stakeholderCategories.toArray()
  const deletedCategories = allCategories.filter(c => {
    if (!c.deleted) return false
    const deletedAt = new Date(c.deletedAt || 0).getTime()
    return deletedAt > cutoffTime
  })

  return {
    meetings: deletedMeetings.map(m => ({
      id: m.id,
      title: m.title,
      date: m.date,
      deletedAt: m.deletedAt,
      daysRemaining: Math.ceil((new Date(m.deletedAt).getTime() + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000 - Date.now()) / (24 * 60 * 60 * 1000))
    })),
    stakeholders: deletedStakeholders.map(s => ({
      id: s.id,
      name: s.name,
      company: s.company,
      deletedAt: s.deletedAt,
      daysRemaining: Math.ceil((new Date(s.deletedAt).getTime() + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000 - Date.now()) / (24 * 60 * 60 * 1000))
    })),
    categories: deletedCategories.map(c => ({
      id: c.id,
      name: c.name,
      key: c.key,
      deletedAt: c.deletedAt,
      daysRemaining: Math.ceil((new Date(c.deletedAt).getTime() + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000 - Date.now()) / (24 * 60 * 60 * 1000))
    })),
    retentionDays: TRASH_RETENTION_DAYS
  }
}

/**
 * Restore a deleted meeting
 */
export async function restoreMeeting(meetingId) {
  const meeting = await db.meetings.get(meetingId)
  if (!meeting) {
    throw new Error(`Meeting ${meetingId} not found`)
  }
  if (!meeting.deleted) {
    throw new Error(`Meeting ${meetingId} is not deleted`)
  }

  await db.meetings.update(meetingId, {
    deleted: false,
    deletedAt: null,
    updatedAt: new Date().toISOString()
  })

  console.log(`✅ Restored meeting: ${meetingId}`)
  return await db.meetings.get(meetingId)
}

/**
 * Restore a deleted stakeholder
 */
export async function restoreStakeholder(stakeholderId) {
  const stakeholder = await db.stakeholders.get(stakeholderId)
  if (!stakeholder) {
    throw new Error(`Stakeholder ${stakeholderId} not found`)
  }
  if (!stakeholder.deleted) {
    throw new Error(`Stakeholder ${stakeholderId} is not deleted`)
  }

  await db.stakeholders.update(stakeholderId, {
    deleted: false,
    deletedAt: null,
    updatedAt: new Date().toISOString()
  })

  console.log(`✅ Restored stakeholder: ${stakeholderId}`)
  return await db.stakeholders.get(stakeholderId)
}

/**
 * Restore a deleted category
 */
export async function restoreCategory(categoryId) {
  const category = await db.stakeholderCategories.get(categoryId)
  if (!category) {
    throw new Error(`Category ${categoryId} not found`)
  }
  if (!category.deleted) {
    throw new Error(`Category ${categoryId} is not deleted`)
  }

  await db.stakeholderCategories.update(categoryId, {
    deleted: false,
    deletedAt: null,
    updatedAt: new Date().toISOString()
  })

  console.log(`✅ Restored category: ${categoryId}`)
  return await db.stakeholderCategories.get(categoryId)
}

/**
 * Permanently purge items deleted more than 60 days ago
 * This frees up storage space
 */
export async function purgeExpiredDeletedItems() {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - TRASH_RETENTION_DAYS)
  const cutoffTime = cutoffDate.getTime()

  let purgedMeetings = 0
  let purgedStakeholders = 0
  let purgedCategories = 0

  // Purge expired meetings
  const allMeetings = await db.meetings.toArray()
  for (const meeting of allMeetings) {
    if (meeting.deleted) {
      const deletedAt = new Date(meeting.deletedAt || 0).getTime()
      if (deletedAt < cutoffTime) {
        // Hard delete - remove from database
        await db.meetings.delete(meeting.id)
        await db.meetingBlobs.where('meetingId').equals(meeting.id).delete()
        await db.analysisIndex.where('meetingId').equals(meeting.id).delete()
        purgedMeetings++
      }
    }
  }

  // Purge expired stakeholders
  const allStakeholders = await db.stakeholders.toArray()
  for (const stakeholder of allStakeholders) {
    if (stakeholder.deleted) {
      const deletedAt = new Date(stakeholder.deletedAt || 0).getTime()
      if (deletedAt < cutoffTime) {
        await db.stakeholders.delete(stakeholder.id)
        purgedStakeholders++
      }
    }
  }

  // Purge expired categories
  const allCategories = await db.stakeholderCategories.toArray()
  for (const category of allCategories) {
    if (category.deleted) {
      const deletedAt = new Date(category.deletedAt || 0).getTime()
      if (deletedAt < cutoffTime) {
        await db.stakeholderCategories.delete(category.id)
        purgedCategories++
      }
    }
  }

  console.log(`🗑️ Purged expired items: ${purgedMeetings} meetings, ${purgedStakeholders} stakeholders, ${purgedCategories} categories`)

  return {
    purgedMeetings,
    purgedStakeholders,
    purgedCategories,
    total: purgedMeetings + purgedStakeholders + purgedCategories
  }
}

export default {
  initializeDexieService,
  // Meetings
  getAllMeetingMetadata,
  getMeetingMetadata,
  getFullMeeting,
  hasMeetingBlobs,
  saveMeeting,
  deleteMeeting,
  softDeleteMeeting,
  getMeetingsForStakeholder,
  getMeetingsInRange,
  getRecentMeetings,
  // Stakeholders
  getAllStakeholders,
  getStakeholder,
  saveStakeholder,
  deleteStakeholder,
  softDeleteStakeholder,
  getStakeholdersByCategory,
  // Categories
  getAllCategories,
  saveCategory,
  deleteCategory,
  softDeleteCategory,
  // Tiering
  updateMeetingTiers,
  evictColdMeetingBlobs,
  manageStorage,
  // Bulk
  bulkSaveMeetings,
  bulkSaveStakeholders,
  bulkSaveCategories,
  // Stats
  getDatabaseStats,
  // Recovery (60-day trash)
  getRecoverableDeletedItems,
  restoreMeeting,
  restoreStakeholder,
  restoreCategory,
  purgeExpiredDeletedItems
}
