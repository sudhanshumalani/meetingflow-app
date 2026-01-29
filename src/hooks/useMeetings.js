/**
 * Dexie Query Hooks for Meetings, Stakeholders, and Categories
 *
 * These hooks provide reactive access to Dexie data using useLiveQuery.
 * When data changes in Dexie, components using these hooks automatically re-render.
 *
 * Phase 2: Replace AppContext meeting state with direct Dexie queries.
 */

import { useLiveQuery } from 'dexie-react-hooks'
import db, { reconstructMeeting } from '../db/meetingFlowDB'

// ============================================
// MEETING HOOKS
// ============================================

/**
 * Get all meetings (sorted by date, newest first)
 * Returns undefined while loading, then the array of meetings
 */
export function useMeetings() {
  return useLiveQuery(
    () => db.meetings
      .orderBy('date')
      .reverse()
      .filter(m => !m.deleted)
      .toArray(),
    [], // dependencies
    undefined // default value (undefined = loading)
  )
}

/**
 * Get meeting count (for badges, stats)
 */
export function useMeetingsCount() {
  return useLiveQuery(
    async () => {
      const count = await db.meetings
        .filter(m => !m.deleted)
        .count()
      return count
    },
    [],
    0
  )
}

/**
 * Get a single meeting by ID (metadata only, fast)
 */
export function useMeeting(meetingId) {
  return useLiveQuery(
    () => meetingId ? db.meetings.get(meetingId) : null,
    [meetingId],
    undefined
  )
}

/**
 * Get full meeting with blob data (for viewing/editing)
 * This is slower as it loads transcript, notes, etc.
 * Uses the same reconstructMeeting logic as dexieService.getFullMeeting()
 */
export function useFullMeeting(meetingId) {
  return useLiveQuery(
    async () => {
      if (!meetingId) return null

      const metadata = await db.meetings.get(meetingId)
      if (!metadata) return null

      // Get associated blobs
      const blobs = await db.meetingBlobs
        .where('meetingId')
        .equals(meetingId)
        .toArray()

      // Use the same reconstructMeeting function as dexieService
      // This properly handles blob.data, blob.chunks, etc.
      return reconstructMeeting(metadata, blobs)
    },
    [meetingId],
    undefined
  )
}

/**
 * Get meetings for a specific stakeholder
 */
export function useMeetingsForStakeholder(stakeholderId) {
  return useLiveQuery(
    async () => {
      if (!stakeholderId) return []

      // Get all meetings and filter by stakeholder
      const meetings = await db.meetings
        .filter(m => !m.deleted && m.stakeholderIds?.includes(stakeholderId))
        .toArray()

      // Sort by date descending
      return meetings.sort((a, b) => new Date(b.date) - new Date(a.date))
    },
    [stakeholderId],
    []
  )
}

/**
 * Get meetings in a date range
 */
export function useMeetingsInRange(startDate, endDate) {
  return useLiveQuery(
    () => db.meetings
      .where('date')
      .between(startDate, endDate)
      .filter(m => !m.deleted)
      .reverse()
      .toArray(),
    [startDate, endDate],
    []
  )
}

/**
 * Get recent meetings (last N days)
 */
export function useRecentMeetings(days = 7) {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - days)
  const cutoff = cutoffDate.toISOString().split('T')[0]

  return useLiveQuery(
    () => db.meetings
      .where('date')
      .above(cutoff)
      .filter(m => !m.deleted)
      .reverse()
      .toArray(),
    [cutoff],
    []
  )
}

// ============================================
// STAKEHOLDER HOOKS
// ============================================

/**
 * Get all stakeholders (excludes soft-deleted)
 */
export function useStakeholders() {
  return useLiveQuery(
    () => db.stakeholders.filter(s => !s.deleted).toArray(),
    [],
    undefined
  )
}

/**
 * Get stakeholder count (excludes soft-deleted)
 */
export function useStakeholdersCount() {
  return useLiveQuery(
    () => db.stakeholders.filter(s => !s.deleted).count(),
    [],
    0
  )
}

/**
 * Get a single stakeholder by ID
 */
export function useStakeholder(stakeholderId) {
  return useLiveQuery(
    () => stakeholderId ? db.stakeholders.get(stakeholderId) : null,
    [stakeholderId],
    undefined
  )
}

/**
 * Get stakeholders by category (excludes soft-deleted)
 */
export function useStakeholdersByCategory(categoryId) {
  return useLiveQuery(
    () => db.stakeholders
      .where('categoryId')
      .equals(categoryId)
      .filter(s => !s.deleted)
      .toArray(),
    [categoryId],
    []
  )
}

// ============================================
// CATEGORY HOOKS
// ============================================

/**
 * Get all stakeholder categories (excludes soft-deleted)
 */
export function useStakeholderCategories() {
  return useLiveQuery(
    () => db.stakeholderCategories.filter(c => !c.deleted).toArray(),
    [],
    undefined
  )
}

/**
 * Get a single category by ID
 */
export function useCategory(categoryId) {
  return useLiveQuery(
    () => categoryId ? db.stakeholderCategories.get(categoryId) : null,
    [categoryId],
    undefined
  )
}

// ============================================
// ANALYSIS INDEX HOOKS (for Analyzer Dashboard)
// ============================================

/**
 * Get all analysis indexes
 */
export function useAnalysisIndexes() {
  return useLiveQuery(
    () => db.analysisIndex.toArray(),
    [],
    []
  )
}

/**
 * Get analysis index for a specific meeting
 */
export function useAnalysisIndex(meetingId) {
  return useLiveQuery(
    () => meetingId ? db.analysisIndex.get(meetingId) : null,
    [meetingId],
    undefined
  )
}

// ============================================
// COMBINED STATS HOOKS
// ============================================

/**
 * Get dashboard stats (meetings count, stakeholders count, etc.)
 */
export function useDashboardStats() {
  return useLiveQuery(
    async () => {
      const meetingsCount = await db.meetings.filter(m => !m.deleted).count()
      const stakeholdersCount = await db.stakeholders.filter(s => !s.deleted).count()
      const categoriesCount = await db.stakeholderCategories.filter(c => !c.deleted).count()

      // Get meetings this week
      const weekAgo = new Date()
      weekAgo.setDate(weekAgo.getDate() - 7)
      const weekCutoff = weekAgo.toISOString().split('T')[0]

      const thisWeekMeetings = await db.meetings
        .where('date')
        .above(weekCutoff)
        .filter(m => !m.deleted)
        .count()

      return {
        meetingsCount,
        stakeholdersCount,
        categoriesCount,
        thisWeekMeetings
      }
    },
    [],
    {
      meetingsCount: 0,
      stakeholdersCount: 0,
      categoriesCount: 0,
      thisWeekMeetings: 0
    }
  )
}
