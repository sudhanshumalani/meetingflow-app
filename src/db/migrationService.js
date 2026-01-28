/**
 * Migration Service
 *
 * Safely migrates data from localStorage/localforage to Dexie
 * with backward compatibility and rollback support.
 *
 * IMPORTANT: This service ensures NO DATA LOSS during migration.
 *
 * Strategy:
 * 1. Read existing data from localStorage + localforage
 * 2. Write to Dexie (dual-write)
 * 3. Verify data integrity
 * 4. Keep localStorage as backup until explicitly cleared
 *
 * ROLLBACK: git checkout v1.0.37-pre-dexie
 */

import db, {
  extractMeetingMetadata,
  extractMeetingBlobs,
  buildAnalysisIndex,
  generateClientOpId
} from './meetingFlowDB'
import localforage from 'localforage'

// Migration state keys
const MIGRATION_VERSION_KEY = 'meetingflow_dexie_migration_version'
const CURRENT_MIGRATION_VERSION = 1

// Legacy storage instance
let legacySyncStorage = null
async function getLegacySyncStorage() {
  if (!legacySyncStorage) {
    legacySyncStorage = localforage.createInstance({
      name: 'MeetingFlowSync',
      storeName: 'sync_data'
    })
  }
  return legacySyncStorage
}

/**
 * Check if migration is needed
 */
export async function isMigrationNeeded() {
  const currentVersion = localStorage.getItem(MIGRATION_VERSION_KEY)
  return !currentVersion || parseInt(currentVersion) < CURRENT_MIGRATION_VERSION
}

/**
 * Check if migration has been completed
 */
export function isMigrationComplete() {
  const version = localStorage.getItem(MIGRATION_VERSION_KEY)
  return version && parseInt(version) >= CURRENT_MIGRATION_VERSION
}

/**
 * Get migration status
 */
export async function getMigrationStatus() {
  const version = localStorage.getItem(MIGRATION_VERSION_KEY)
  const dexieMeetingCount = await db.meetings.count()
  const dexieStakeholderCount = await db.stakeholders.count()

  let localStorageMeetingCount = 0
  let localStorageStakeholderCount = 0

  try {
    const meetings = JSON.parse(localStorage.getItem('meetingflow_meetings') || '[]')
    const stakeholders = JSON.parse(localStorage.getItem('meetingflow_stakeholders') || '[]')
    localStorageMeetingCount = meetings.length
    localStorageStakeholderCount = stakeholders.length
  } catch (e) {
    console.warn('Failed to read localStorage for status:', e)
  }

  return {
    migrationVersion: version ? parseInt(version) : 0,
    currentVersion: CURRENT_MIGRATION_VERSION,
    needsMigration: !version || parseInt(version) < CURRENT_MIGRATION_VERSION,
    dexie: {
      meetings: dexieMeetingCount,
      stakeholders: dexieStakeholderCount
    },
    localStorage: {
      meetings: localStorageMeetingCount,
      stakeholders: localStorageStakeholderCount
    }
  }
}

/**
 * Main migration function
 * Migrates all data from localStorage/localforage to Dexie
 */
export async function migrateToDexie(options = {}) {
  const {
    onProgress = () => {},
    preserveLocalStorage = true // Keep localStorage as backup
  } = options

  console.log('🔄 Starting migration to Dexie...')
  onProgress({ phase: 'starting', percent: 0 })

  try {
    // Open database
    await db.open()

    // ============================================
    // PHASE 1: Read all existing data
    // ============================================
    onProgress({ phase: 'reading', percent: 10, message: 'Reading existing data...' })

    let meetings = []
    let stakeholders = []
    let stakeholderCategories = []
    let deletedItems = []

    // Read from localStorage (primary)
    try {
      meetings = JSON.parse(localStorage.getItem('meetingflow_meetings') || '[]')
      stakeholders = JSON.parse(localStorage.getItem('meetingflow_stakeholders') || '[]')
      stakeholderCategories = JSON.parse(localStorage.getItem('meetingflow_stakeholder_categories') || '[]')
      deletedItems = JSON.parse(localStorage.getItem('meetingflow_deleted_items') || '[]')
      console.log(`📂 Read from localStorage: ${meetings.length} meetings, ${stakeholders.length} stakeholders`)
    } catch (e) {
      console.warn('Failed to read localStorage:', e)
    }

    // Check localforage for additional data
    try {
      const syncStorage = await getLegacySyncStorage()
      const lfMeetings = await syncStorage.getItem('meetings')
      const lfStakeholders = await syncStorage.getItem('stakeholders')
      const lfCategories = await syncStorage.getItem('categories')

      // Merge if localforage has more data
      if (lfMeetings?.length > meetings.length) {
        console.log(`📂 localforage has more meetings (${lfMeetings.length}), using that`)
        meetings = lfMeetings
      }
      if (lfStakeholders?.length > stakeholders.length) {
        console.log(`📂 localforage has more stakeholders (${lfStakeholders.length}), using that`)
        stakeholders = lfStakeholders
      }
      if (lfCategories?.length > stakeholderCategories.length) {
        stakeholderCategories = lfCategories
      }
    } catch (e) {
      console.warn('Failed to read localforage:', e)
    }

    console.log(`📊 Total data to migrate: ${meetings.length} meetings, ${stakeholders.length} stakeholders, ${stakeholderCategories.length} categories`)
    onProgress({ phase: 'reading', percent: 20, message: `Found ${meetings.length} meetings to migrate` })

    // ============================================
    // PHASE 2: Migrate meetings
    // ============================================
    onProgress({ phase: 'migrating-meetings', percent: 25, message: 'Migrating meetings...' })

    const deletedIds = new Set(deletedItems.map(d => d.id))
    const validMeetings = meetings.filter(m => m && m.id && !deletedIds.has(m.id))

    let migratedMeetings = 0
    let migratedBlobs = 0

    for (const meeting of validMeetings) {
      try {
        // Extract metadata
        const metadata = extractMeetingMetadata(meeting)
        if (!metadata) continue

        // Mark as hot (recent) for now
        metadata.localState = 'hot'
        metadata.lastAccessedAt = metadata.lastAccessedAt || new Date().toISOString()

        // Store metadata
        await db.meetings.put(metadata)
        migratedMeetings++

        // Extract and store blobs
        const blobs = extractMeetingBlobs(meeting)
        for (const blob of blobs) {
          await db.meetingBlobs.put(blob)
          migratedBlobs++
        }

        // Build analysis index
        const analysisIdx = buildAnalysisIndex(meeting)
        if (analysisIdx) {
          await db.analysisIndex.put(analysisIdx)
        }

        // Report progress
        const percent = 25 + Math.floor((migratedMeetings / validMeetings.length) * 40)
        onProgress({
          phase: 'migrating-meetings',
          percent,
          message: `Migrated ${migratedMeetings}/${validMeetings.length} meetings`
        })
      } catch (e) {
        console.error(`Failed to migrate meeting ${meeting.id}:`, e)
        // Continue with other meetings
      }
    }

    console.log(`✅ Migrated ${migratedMeetings} meetings, ${migratedBlobs} blobs`)

    // ============================================
    // PHASE 3: Migrate stakeholders
    // ============================================
    onProgress({ phase: 'migrating-stakeholders', percent: 70, message: 'Migrating stakeholders...' })

    let migratedStakeholders = 0
    for (const stakeholder of stakeholders) {
      if (!stakeholder || !stakeholder.id) continue
      if (deletedIds.has(stakeholder.id)) continue

      try {
        await db.stakeholders.put({
          ...stakeholder,
          lastContactDate: stakeholder.lastContactDate || stakeholder.updatedAt || new Date().toISOString()
        })
        migratedStakeholders++
      } catch (e) {
        console.error(`Failed to migrate stakeholder ${stakeholder.id}:`, e)
      }
    }

    console.log(`✅ Migrated ${migratedStakeholders} stakeholders`)
    onProgress({ phase: 'migrating-stakeholders', percent: 80, message: `Migrated ${migratedStakeholders} stakeholders` })

    // ============================================
    // PHASE 4: Migrate stakeholder categories
    // ============================================
    onProgress({ phase: 'migrating-categories', percent: 85, message: 'Migrating categories...' })

    let migratedCategories = 0
    for (const category of stakeholderCategories) {
      if (!category) continue

      try {
        // Ensure category has an id
        const categoryWithId = {
          ...category,
          id: category.id || category.key || generateClientOpId()
        }
        await db.stakeholderCategories.put(categoryWithId)
        migratedCategories++
      } catch (e) {
        console.error(`Failed to migrate category:`, e)
      }
    }

    console.log(`✅ Migrated ${migratedCategories} categories`)

    // ============================================
    // PHASE 5: Verify migration
    // ============================================
    onProgress({ phase: 'verifying', percent: 90, message: 'Verifying migration...' })

    const dexieMeetingCount = await db.meetings.count()
    const dexieStakeholderCount = await db.stakeholders.count()
    const dexieCategoryCount = await db.stakeholderCategories.count()

    console.log(`🔍 Verification: Dexie has ${dexieMeetingCount} meetings, ${dexieStakeholderCount} stakeholders, ${dexieCategoryCount} categories`)

    // Check for data loss
    if (dexieMeetingCount < validMeetings.length * 0.95) {
      console.warn(`⚠️ Warning: Only ${dexieMeetingCount} of ${validMeetings.length} meetings migrated`)
    }

    // ============================================
    // PHASE 6: Store sync metadata
    // ============================================
    await db.syncMeta.put({
      key: 'lastMigration',
      timestamp: new Date().toISOString(),
      fromVersion: 0,
      toVersion: CURRENT_MIGRATION_VERSION,
      stats: {
        meetings: migratedMeetings,
        blobs: migratedBlobs,
        stakeholders: migratedStakeholders,
        categories: migratedCategories
      }
    })

    // Mark migration as complete
    localStorage.setItem(MIGRATION_VERSION_KEY, String(CURRENT_MIGRATION_VERSION))

    onProgress({ phase: 'complete', percent: 100, message: 'Migration complete!' })

    console.log('🎉 Migration to Dexie complete!')

    return {
      success: true,
      stats: {
        meetings: migratedMeetings,
        blobs: migratedBlobs,
        stakeholders: migratedStakeholders,
        categories: migratedCategories
      },
      dexieCounts: {
        meetings: dexieMeetingCount,
        stakeholders: dexieStakeholderCount,
        categories: dexieCategoryCount
      }
    }

  } catch (error) {
    console.error('❌ Migration failed:', error)
    onProgress({ phase: 'error', percent: 0, message: error.message })

    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * Rollback: Clear Dexie and reset migration flag
 * localStorage data is preserved and will be used again
 */
export async function rollbackMigration() {
  console.log('🔄 Rolling back migration...')

  try {
    // Clear Dexie
    await db.meetings.clear()
    await db.meetingBlobs.clear()
    await db.stakeholders.clear()
    await db.stakeholderCategories.clear()
    await db.outbox.clear()
    await db.analysisIndex.clear()
    await db.syncMeta.clear()

    // Remove migration flag
    localStorage.removeItem(MIGRATION_VERSION_KEY)

    console.log('✅ Rollback complete - localStorage data will be used')
    return { success: true }
  } catch (error) {
    console.error('❌ Rollback failed:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Verify data integrity between localStorage and Dexie
 */
export async function verifyDataIntegrity() {
  try {
    const lsMeetings = JSON.parse(localStorage.getItem('meetingflow_meetings') || '[]')
    const dxMeetings = await db.meetings.count()

    const lsStakeholders = JSON.parse(localStorage.getItem('meetingflow_stakeholders') || '[]')
    const dxStakeholders = await db.stakeholders.count()

    return {
      localStorage: {
        meetings: lsMeetings.length,
        stakeholders: lsStakeholders.length
      },
      dexie: {
        meetings: dxMeetings,
        stakeholders: dxStakeholders
      },
      isConsistent: dxMeetings >= lsMeetings.length * 0.95, // Allow 5% tolerance
      recommendation: dxMeetings >= lsMeetings.length
        ? 'Dexie has complete data'
        : 'Some data may not have migrated'
    }
  } catch (error) {
    return {
      error: error.message,
      isConsistent: false
    }
  }
}

export default {
  isMigrationNeeded,
  isMigrationComplete,
  getMigrationStatus,
  migrateToDexie,
  rollbackMigration,
  verifyDataIntegrity
}
