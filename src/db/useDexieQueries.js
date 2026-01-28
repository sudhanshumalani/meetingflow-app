/**
 * Dexie React Hooks
 *
 * Reactive queries using Dexie's useLiveQuery hook.
 * These hooks automatically re-render when data changes.
 *
 * ROLLBACK: git checkout v1.0.37-pre-dexie
 */

import { useLiveQuery } from 'dexie-react-hooks'
import db, { reconstructMeeting } from './meetingFlowDB'

// ============================================
// MEETING HOOKS
// ============================================

/**
 * Get all meeting metadata (for list views)
 * Reactive - updates when any meeting changes
 */
export function useMeetingList() {
  return useLiveQuery(
    () => db.meetings
      .orderBy('date')
      .reverse()
      .filter(m => !m.deleted)
      .toArray(),
    []
  )
}

/**
 * Get meeting metadata by ID
 */
export function useMeetingMetadata(meetingId) {
  return useLiveQuery(
    () => meetingId ? db.meetings.get(meetingId) : null,
    [meetingId]
  )
}

/**
 * Get full meeting with blobs
 * Slower - use only when viewing a single meeting
 */
export function useFullMeeting(meetingId) {
  return useLiveQuery(
    async () => {
      if (!meetingId) return null

      const metadata = await db.meetings.get(meetingId)
      if (!metadata) return null

      const blobs = await db.meetingBlobs
        .where('meetingId')
        .equals(meetingId)
        .toArray()

      return reconstructMeeting(metadata, blobs)
    },
    [meetingId]
  )
}

/**
 * Get recent meetings (last N days)
 */
export function useRecentMeetings(days = 7) {
  return useLiveQuery(
    () => {
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - days)
      const cutoff = cutoffDate.toISOString().split('T')[0]

      return db.meetings
        .where('date')
        .above(cutoff)
        .filter(m => !m.deleted)
        .reverse()
        .toArray()
    },
    [days]
  )
}

/**
 * Get meetings for a stakeholder
 */
export function useMeetingsForStakeholder(stakeholderId) {
  return useLiveQuery(
    async () => {
      if (!stakeholderId) return []

      return db.meetings
        .where('stakeholderIds')
        .equals(stakeholderId)
        .filter(m => !m.deleted)
        .toArray()
        .then(meetings => meetings.sort((a, b) =>
          new Date(b.date).getTime() - new Date(a.date).getTime()
        ))
    },
    [stakeholderId]
  )
}

/**
 * Check if meeting has local blobs
 */
export function useMeetingHasBlobs(meetingId) {
  return useLiveQuery(
    async () => {
      if (!meetingId) return false
      const count = await db.meetingBlobs
        .where('meetingId')
        .equals(meetingId)
        .count()
      return count > 0
    },
    [meetingId]
  )
}

// ============================================
// STAKEHOLDER HOOKS
// ============================================

/**
 * Get all stakeholders
 */
export function useStakeholders() {
  return useLiveQuery(
    () => db.stakeholders.toArray(),
    []
  )
}

/**
 * Get stakeholder by ID
 */
export function useStakeholder(stakeholderId) {
  return useLiveQuery(
    () => stakeholderId ? db.stakeholders.get(stakeholderId) : null,
    [stakeholderId]
  )
}

/**
 * Get stakeholders by category
 */
export function useStakeholdersByCategory(categoryId) {
  return useLiveQuery(
    () => categoryId
      ? db.stakeholders.where('categoryId').equals(categoryId).toArray()
      : [],
    [categoryId]
  )
}

// ============================================
// CATEGORY HOOKS
// ============================================

/**
 * Get all categories
 */
export function useCategories() {
  return useLiveQuery(
    () => db.stakeholderCategories.toArray(),
    []
  )
}

// ============================================
// ANALYZER HOOKS
// ============================================

/**
 * Get action item dashboard data
 * Aggregates action items across all meetings
 */
export function useActionItemDashboard() {
  return useLiveQuery(
    async () => {
      // Get all meetings with analysis
      const meetings = await db.meetings
        .filter(m => m.hasAnalysis && !m.deleted)
        .toArray()

      // Get analysis blobs for these meetings
      const blobs = await db.meetingBlobs
        .where('meetingId')
        .anyOf(meetings.map(m => m.id))
        .filter(b => b.type === 'analysis')
        .toArray()

      // Aggregate action items
      const allItems = []
      const blobMap = new Map(blobs.map(b => [b.meetingId, b]))

      for (const meeting of meetings) {
        const blob = blobMap.get(meeting.id)
        const actionItems = blob?.data?.actionItems || []

        for (const item of actionItems) {
          allItems.push({
            ...item,
            meetingId: meeting.id,
            meetingTitle: meeting.title,
            meetingDate: meeting.date
          })
        }
      }

      // Group by status
      const open = allItems.filter(i => i.status !== 'completed')
      const completed = allItems.filter(i => i.status === 'completed')
      const overdue = open.filter(i => {
        if (!i.dueDate) return false
        return new Date(i.dueDate) < new Date()
      })

      // Group by assignee
      const byAssignee = {}
      for (const item of allItems) {
        const assignee = item.assignee || item.owner || 'Unassigned'
        if (!byAssignee[assignee]) {
          byAssignee[assignee] = { open: 0, completed: 0, items: [] }
        }
        byAssignee[assignee].items.push(item)
        if (item.status === 'completed') {
          byAssignee[assignee].completed++
        } else {
          byAssignee[assignee].open++
        }
      }

      return {
        total: allItems.length,
        open: open.length,
        completed: completed.length,
        overdue: overdue.length,
        openItems: open,
        overdueItems: overdue,
        completedItems: completed,
        byAssignee,
        meetingsWithActions: meetings.filter(m =>
          blobMap.get(m.id)?.data?.actionItems?.length > 0
        ).length
      }
    },
    []
  )
}

/**
 * Get stakeholder engagement data
 */
export function useStakeholderEngagement(stakeholderId) {
  return useLiveQuery(
    async () => {
      if (!stakeholderId) return null

      const stakeholder = await db.stakeholders.get(stakeholderId)
      if (!stakeholder) return null

      // Get all meetings with this stakeholder
      const meetings = await db.meetings
        .where('stakeholderIds')
        .equals(stakeholderId)
        .filter(m => !m.deleted)
        .toArray()

      // Sort by date
      meetings.sort((a, b) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
      )

      const lastMeeting = meetings[0]
      const daysSinceContact = lastMeeting
        ? Math.floor((Date.now() - new Date(lastMeeting.date).getTime()) / (1000 * 60 * 60 * 24))
        : null

      // Calculate meeting frequency
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      const recentMeetings = meetings.filter(m =>
        new Date(m.date) > thirtyDaysAgo
      )

      // Get total action items for this stakeholder
      let totalActionItems = 0
      let openActionItems = 0
      for (const meeting of meetings) {
        totalActionItems += meeting.actionItemCount || 0
        openActionItems += meeting.openActionItemCount || 0
      }

      return {
        stakeholder,
        meetings,
        meetingCount: meetings.length,
        lastMeetingDate: lastMeeting?.date || null,
        daysSinceContact,
        recentMeetingCount: recentMeetings.length,
        meetingFrequency: recentMeetings.length > 0
          ? `${recentMeetings.length} in last 30 days`
          : 'No recent meetings',
        totalActionItems,
        openActionItems,
        engagement: daysSinceContact === null
          ? 'never'
          : daysSinceContact <= 7
            ? 'high'
            : daysSinceContact <= 30
              ? 'medium'
              : 'low'
      }
    },
    [stakeholderId]
  )
}

/**
 * Get all stakeholder engagement summary
 */
export function useAllStakeholderEngagement() {
  return useLiveQuery(
    async () => {
      const stakeholders = await db.stakeholders.toArray()
      const meetings = await db.meetings.filter(m => !m.deleted).toArray()

      const engagement = []

      for (const stakeholder of stakeholders) {
        const stakeholderMeetings = meetings.filter(m =>
          m.stakeholderIds?.includes(stakeholder.id)
        )

        stakeholderMeetings.sort((a, b) =>
          new Date(b.date).getTime() - new Date(a.date).getTime()
        )

        const lastMeeting = stakeholderMeetings[0]
        const daysSince = lastMeeting
          ? Math.floor((Date.now() - new Date(lastMeeting.date).getTime()) / (1000 * 60 * 60 * 24))
          : Infinity

        engagement.push({
          stakeholder,
          meetingCount: stakeholderMeetings.length,
          lastMeetingDate: lastMeeting?.date || null,
          daysSinceContact: daysSince === Infinity ? null : daysSince,
          status: daysSince <= 7 ? 'active' : daysSince <= 30 ? 'recent' : 'inactive'
        })
      }

      // Sort by days since contact (most inactive first)
      engagement.sort((a, b) => {
        const aDays = a.daysSinceContact ?? Infinity
        const bDays = b.daysSinceContact ?? Infinity
        return bDays - aDays
      })

      return {
        stakeholders: engagement,
        active: engagement.filter(e => e.status === 'active').length,
        recent: engagement.filter(e => e.status === 'recent').length,
        inactive: engagement.filter(e => e.status === 'inactive').length,
        needsAttention: engagement.filter(e =>
          e.daysSinceContact && e.daysSinceContact > 14
        )
      }
    },
    []
  )
}

/**
 * Get stalled projects (no meetings in 30+ days)
 */
export function useStalledProjects() {
  return useLiveQuery(
    async () => {
      const meetings = await db.meetings.filter(m => !m.deleted).toArray()

      // Group by project
      const byProject = {}
      for (const meeting of meetings) {
        if (!meeting.projectId) continue
        if (!byProject[meeting.projectId]) {
          byProject[meeting.projectId] = []
        }
        byProject[meeting.projectId].push(meeting)
      }

      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      const stalled = []
      for (const [projectId, projectMeetings] of Object.entries(byProject)) {
        projectMeetings.sort((a, b) =>
          new Date(b.date).getTime() - new Date(a.date).getTime()
        )

        const lastMeeting = projectMeetings[0]
        if (new Date(lastMeeting.date) < thirtyDaysAgo) {
          const openActionItems = projectMeetings.reduce(
            (sum, m) => sum + (m.openActionItemCount || 0),
            0
          )

          stalled.push({
            projectId,
            lastMeetingDate: lastMeeting.date,
            lastMeetingTitle: lastMeeting.title,
            totalMeetings: projectMeetings.length,
            openActionItems,
            daysSinceActivity: Math.floor(
              (Date.now() - new Date(lastMeeting.date).getTime()) / (1000 * 60 * 60 * 24)
            )
          })
        }
      }

      // Sort by days since activity
      stalled.sort((a, b) => b.daysSinceActivity - a.daysSinceActivity)

      return stalled
    },
    []
  )
}

/**
 * Get meeting statistics
 */
export function useMeetingStats() {
  return useLiveQuery(
    async () => {
      const meetings = await db.meetings.filter(m => !m.deleted).toArray()

      // Time-based stats
      const now = new Date()
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

      const thisWeek = meetings.filter(m => new Date(m.date) > weekAgo)
      const thisMonth = meetings.filter(m => new Date(m.date) > monthAgo)

      // Aggregate stats
      const totalActionItems = meetings.reduce((sum, m) => sum + (m.actionItemCount || 0), 0)
      const openActionItems = meetings.reduce((sum, m) => sum + (m.openActionItemCount || 0), 0)
      const withTranscript = meetings.filter(m => m.hasTranscript).length
      const withAnalysis = meetings.filter(m => m.hasAnalysis).length

      // Storage stats
      const hot = meetings.filter(m => m.localState === 'hot').length
      const warm = meetings.filter(m => m.localState === 'warm').length
      const cold = meetings.filter(m => m.localState === 'cold').length

      return {
        total: meetings.length,
        thisWeek: thisWeek.length,
        thisMonth: thisMonth.length,
        withTranscript,
        withAnalysis,
        totalActionItems,
        openActionItems,
        completedActionItems: totalActionItems - openActionItems,
        storage: { hot, warm, cold }
      }
    },
    []
  )
}

/**
 * Search meetings by keyword
 */
export function useMeetingSearch(query) {
  return useLiveQuery(
    async () => {
      if (!query || query.length < 2) return []

      const lowerQuery = query.toLowerCase()

      // Search in meeting metadata
      const meetings = await db.meetings
        .filter(m =>
          !m.deleted && (
            m.title?.toLowerCase().includes(lowerQuery) ||
            m.summaryPreview?.toLowerCase().includes(lowerQuery)
          )
        )
        .toArray()

      // Also search in analysis index keywords
      const indexMatches = await db.analysisIndex
        .where('keywords')
        .startsWithIgnoreCase(lowerQuery)
        .toArray()

      // Merge results
      const meetingIds = new Set(meetings.map(m => m.id))
      for (const idx of indexMatches) {
        if (!meetingIds.has(idx.meetingId)) {
          const meeting = await db.meetings.get(idx.meetingId)
          if (meeting && !meeting.deleted) {
            meetings.push(meeting)
            meetingIds.add(meeting.id)
          }
        }
      }

      // Sort by date
      meetings.sort((a, b) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
      )

      return meetings
    },
    [query]
  )
}

/**
 * Get outbox status
 */
export function useOutboxStatus() {
  return useLiveQuery(
    async () => {
      const pending = await db.outbox.where('status').equals('pending').count()
      const failed = await db.outbox.where('status').equals('failed').count()

      return {
        pending,
        failed,
        hasWork: pending > 0,
        hasErrors: failed > 0
      }
    },
    []
  )
}

/**
 * Get database statistics
 */
export function useDatabaseStats() {
  return useLiveQuery(
    async () => {
      const meetingCount = await db.meetings.count()
      const blobCount = await db.meetingBlobs.count()
      const stakeholderCount = await db.stakeholders.count()
      const categoryCount = await db.stakeholderCategories.count()

      const hot = await db.meetings.where('localState').equals('hot').count()
      const warm = await db.meetings.where('localState').equals('warm').count()
      const cold = await db.meetings.where('localState').equals('cold').count()

      let storage = null
      if (navigator.storage?.estimate) {
        const { usage, quota } = await navigator.storage.estimate()
        storage = {
          usage,
          quota,
          usagePercent: ((usage / quota) * 100).toFixed(2),
          usageMB: (usage / (1024 * 1024)).toFixed(2)
        }
      }

      return {
        meetings: { total: meetingCount, hot, warm, cold },
        blobs: blobCount,
        stakeholders: stakeholderCount,
        categories: categoryCount,
        storage
      }
    },
    []
  )
}

export default {
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
}
