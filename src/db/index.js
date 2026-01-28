/**
 * Dexie Database Module
 *
 * Central export for all Dexie-related functionality.
 *
 * ROLLBACK: git checkout v1.0.37-pre-dexie
 */

// Database instance and helpers
export {
  default as db,
  generateClientOpId,
  calculateSize,
  extractMeetingMetadata,
  extractMeetingBlobs,
  reconstructMeeting,
  buildAnalysisIndex,
  isDatabaseReady,
  getStorageEstimate,
  requestPersistentStorage,
  clearAllData
} from './meetingFlowDB'

// Migration service
export {
  isMigrationNeeded,
  isMigrationComplete,
  getMigrationStatus,
  migrateToDexie,
  rollbackMigration,
  verifyDataIntegrity
} from './migrationService'

// Outbox service
export {
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
} from './outboxService'

// Dexie service (main CRUD operations)
export {
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
  getStakeholdersByCategory,
  // Categories
  getAllCategories,
  saveCategory,
  deleteCategory,
  // Tiering
  updateMeetingTiers,
  evictColdMeetingBlobs,
  manageStorage,
  // Bulk
  bulkSaveMeetings,
  bulkSaveStakeholders,
  bulkSaveCategories,
  // Stats
  getDatabaseStats
} from './dexieService'

// React hooks for reactive queries
export {
  // Meetings
  useMeetingList,
  useMeetingMetadata,
  useFullMeeting,
  useRecentMeetings,
  useMeetingsForStakeholder,
  useMeetingHasBlobs,
  // Stakeholders
  useStakeholders,
  useStakeholder,
  useStakeholdersByCategory,
  // Categories
  useCategories,
  // Analyzer
  useActionItemDashboard,
  useStakeholderEngagement,
  useAllStakeholderEngagement,
  useStalledProjects,
  useMeetingStats,
  useMeetingSearch,
  // Status
  useOutboxStatus,
  useDatabaseStats
} from './useDexieQueries'
