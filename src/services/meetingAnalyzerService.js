/**
 * Meeting Analyzer Service
 *
 * AI-powered meeting intelligence using Claude API.
 * Provides Granola-style insights across meetings.
 *
 * Features:
 * - Cross-meeting pattern analysis
 * - Stakeholder relationship mapping
 * - Action item tracking and follow-up detection
 * - Meeting preparation briefs
 * - Trend analysis
 *
 * ROLLBACK: git checkout v1.0.37-pre-dexie
 */

import { getAllMeetingMetadata, getFullMeeting, getAllStakeholders } from '../db'

// Claude API configuration
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages'
const CLAUDE_MODEL = 'claude-3-haiku-20240307' // Fast and cost-effective for analysis

/**
 * Get Claude API key from localStorage
 */
function getClaudeApiKey() {
  return localStorage.getItem('claude_api_key') || ''
}

/**
 * Call Claude API
 */
async function callClaude(systemPrompt, userPrompt, options = {}) {
  const apiKey = getClaudeApiKey()
  if (!apiKey) {
    throw new Error('Claude API key not configured. Please add it in Settings.')
  }

  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: options.model || CLAUDE_MODEL,
      max_tokens: options.maxTokens || 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Claude API request failed')
  }

  const data = await response.json()
  return data.content[0].text
}

/**
 * Parse JSON from Claude response (handles markdown code blocks)
 */
function parseClaudeJSON(response) {
  // Remove markdown code blocks if present
  let cleaned = response.trim()
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7)
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3)
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3)
  }
  return JSON.parse(cleaned.trim())
}

// ============================================
// ANALYZER FUNCTIONS
// ============================================

/**
 * Prepare meeting brief for upcoming meeting
 * "What do I need to know before meeting with [stakeholder]?"
 */
export async function prepareMeetingBrief(stakeholderId) {
  const stakeholders = await getAllStakeholders()
  const stakeholder = stakeholders.find(s => s.id === stakeholderId)
  if (!stakeholder) {
    throw new Error('Stakeholder not found')
  }

  // Get all meetings with this stakeholder
  const allMeetings = await getAllMeetingMetadata()
  const relevantMeetings = allMeetings.filter(m =>
    m.stakeholderIds?.includes(stakeholderId) && !m.deleted
  ).slice(0, 10) // Last 10 meetings

  // Load full data for recent meetings
  const meetingDetails = await Promise.all(
    relevantMeetings.slice(0, 5).map(m => getFullMeeting(m.id))
  )

  const systemPrompt = `You are a meeting intelligence assistant. Prepare a concise briefing document for an upcoming meeting. Focus on actionable insights and context the user needs to be effective.`

  const userPrompt = `Prepare a meeting brief for my upcoming meeting with ${stakeholder.name || stakeholder.company}.

Stakeholder Information:
${JSON.stringify(stakeholder, null, 2)}

Previous Meeting History (${relevantMeetings.length} total meetings):
${meetingDetails.map(m => `
Meeting: ${m.title} (${m.date})
Summary: ${m.aiResult?.summary || m.summaryPreview || 'No summary'}
Key Points: ${JSON.stringify(m.aiResult?.keyPoints || [])}
Open Action Items: ${JSON.stringify((m.aiResult?.actionItems || []).filter(i => i.status !== 'completed'))}
`).join('\n---\n')}

Please provide a brief with:
1. **Context Summary** - Key background on this relationship
2. **Recent Discussion Topics** - What we've been talking about
3. **Open Action Items** - Outstanding tasks from previous meetings
4. **Suggested Talking Points** - What to discuss in the upcoming meeting
5. **Relationship Health** - Assessment of engagement level

Format as JSON with these fields: contextSummary, recentTopics[], openActionItems[], suggestedTalkingPoints[], relationshipHealth (high/medium/low), additionalNotes`

  const response = await callClaude(systemPrompt, userPrompt)
  return parseClaudeJSON(response)
}

/**
 * Analyze patterns across all meetings
 * "What are my meeting patterns?"
 */
export async function analyzeMeetingPatterns() {
  const meetings = await getAllMeetingMetadata()
  const activeMeetings = meetings.filter(m => !m.deleted)

  // Get meeting distribution data
  const byMonth = {}
  const byDayOfWeek = {}
  const byStakeholder = {}

  for (const meeting of activeMeetings) {
    const date = new Date(meeting.date)
    const month = date.toLocaleString('default', { month: 'short', year: 'numeric' })
    const dayOfWeek = date.toLocaleString('default', { weekday: 'long' })

    byMonth[month] = (byMonth[month] || 0) + 1
    byDayOfWeek[dayOfWeek] = (byDayOfWeek[dayOfWeek] || 0) + 1

    for (const stakeholderId of (meeting.stakeholderIds || [])) {
      byStakeholder[stakeholderId] = (byStakeholder[stakeholderId] || 0) + 1
    }
  }

  const systemPrompt = `You are a meeting analytics assistant. Analyze meeting patterns and provide actionable insights.`

  const userPrompt = `Analyze my meeting patterns based on this data:

Total Meetings: ${activeMeetings.length}
Meetings by Month: ${JSON.stringify(byMonth)}
Meetings by Day of Week: ${JSON.stringify(byDayOfWeek)}
Meetings per Stakeholder (top 10): ${JSON.stringify(
    Object.entries(byStakeholder)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
  )}

Average Action Items per Meeting: ${(activeMeetings.reduce((sum, m) => sum + (m.actionItemCount || 0), 0) / activeMeetings.length).toFixed(1)}

Recent Meetings (last 5):
${activeMeetings.slice(0, 5).map(m => `- ${m.title} (${m.date}) - ${m.actionItemCount || 0} action items`).join('\n')}

Provide analysis as JSON with:
- busiestDay: string
- busiestMonth: string
- meetingFrequency: string (e.g., "4 meetings/week")
- topStakeholders: string[] (stakeholder IDs)
- actionItemTrend: string (increasing/stable/decreasing)
- insights: string[] (3-5 actionable insights)
- recommendations: string[] (2-3 recommendations)`

  const response = await callClaude(systemPrompt, userPrompt)
  return parseClaudeJSON(response)
}

/**
 * Find follow-up opportunities
 * "What meetings need follow-up?"
 */
export async function findFollowUpOpportunities() {
  const meetings = await getAllMeetingMetadata()
  const activeMeetings = meetings.filter(m => !m.deleted)

  // Get meetings from last 30 days with open action items
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const recentMeetingsWithActions = activeMeetings.filter(m =>
    new Date(m.date) > thirtyDaysAgo && (m.openActionItemCount || 0) > 0
  )

  // Load full details for analysis
  const meetingDetails = await Promise.all(
    recentMeetingsWithActions.slice(0, 10).map(m => getFullMeeting(m.id))
  )

  const systemPrompt = `You are a meeting follow-up assistant. Identify meetings that need follow-up based on action items, commitments, and conversation context.`

  const userPrompt = `Analyze these recent meetings and identify follow-up needs:

${meetingDetails.map(m => `
Meeting: ${m.title} (${m.date})
Summary: ${m.aiResult?.summary || 'No summary'}
Open Action Items: ${JSON.stringify((m.aiResult?.actionItems || []).filter(i => i.status !== 'completed'))}
Key Decisions: ${JSON.stringify(m.aiResult?.keyPoints || [])}
`).join('\n---\n')}

For each meeting that needs follow-up, provide:
- meetingId
- meetingTitle
- urgency (high/medium/low)
- reason (why follow-up is needed)
- suggestedAction (what to do)
- daysOld (days since meeting)

Return as JSON array: { followUps: [...] }`

  const response = await callClaude(systemPrompt, userPrompt)
  return parseClaudeJSON(response)
}

/**
 * Identify stalled relationships
 * "Which relationships need attention?"
 */
export async function identifyStakeholderGaps() {
  const stakeholders = await getAllStakeholders()
  const meetings = await getAllMeetingMetadata()
  const activeMeetings = meetings.filter(m => !m.deleted)

  // Calculate last contact for each stakeholder
  const stakeholderAnalysis = stakeholders.map(stakeholder => {
    const stakeholderMeetings = activeMeetings.filter(m =>
      m.stakeholderIds?.includes(stakeholder.id)
    )

    const sortedMeetings = stakeholderMeetings.sort((a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    )

    const lastMeeting = sortedMeetings[0]
    const daysSinceContact = lastMeeting
      ? Math.floor((Date.now() - new Date(lastMeeting.date).getTime()) / (1000 * 60 * 60 * 24))
      : null

    return {
      stakeholder: {
        id: stakeholder.id,
        name: stakeholder.name,
        company: stakeholder.company,
        category: stakeholder.category
      },
      meetingCount: stakeholderMeetings.length,
      lastMeetingDate: lastMeeting?.date || null,
      daysSinceContact,
      openActionItems: stakeholderMeetings.reduce((sum, m) => sum + (m.openActionItemCount || 0), 0)
    }
  })

  // Sort by days since contact (most neglected first)
  stakeholderAnalysis.sort((a, b) => {
    const aDays = a.daysSinceContact ?? Infinity
    const bDays = b.daysSinceContact ?? Infinity
    return bDays - aDays
  })

  const systemPrompt = `You are a relationship management assistant. Analyze stakeholder engagement and identify gaps that need attention.`

  const userPrompt = `Analyze these stakeholder relationships and identify gaps:

${JSON.stringify(stakeholderAnalysis.slice(0, 20), null, 2)}

Provide analysis as JSON with:
- criticalGaps: [] (stakeholders needing immediate attention, with reasons)
- warningGaps: [] (stakeholders trending toward inactivity)
- healthyRelationships: [] (well-maintained stakeholders)
- recommendations: [] (specific actions to improve engagement)
- overallHealth: string (assessment of relationship portfolio)`

  const response = await callClaude(systemPrompt, userPrompt)
  return parseClaudeJSON(response)
}

/**
 * Generate weekly/monthly summary
 * "What happened this week/month?"
 */
export async function generatePeriodSummary(period = 'week') {
  const meetings = await getAllMeetingMetadata()
  const activeMeetings = meetings.filter(m => !m.deleted)

  const cutoffDays = period === 'week' ? 7 : 30
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - cutoffDays)

  const periodMeetings = activeMeetings.filter(m =>
    new Date(m.date) > cutoffDate
  )

  // Load full details
  const meetingDetails = await Promise.all(
    periodMeetings.slice(0, 15).map(m => getFullMeeting(m.id))
  )

  const systemPrompt = `You are an executive assistant. Create a concise but comprehensive summary of meeting activity for the specified period.`

  const userPrompt = `Generate a ${period}ly summary for my meetings:

Period: Last ${cutoffDays} days
Total Meetings: ${periodMeetings.length}

Meetings:
${meetingDetails.map(m => `
Title: ${m.title} (${m.date})
With: ${m.stakeholderIds?.length || 0} stakeholders
Summary: ${m.aiResult?.summary || m.summaryPreview || 'No summary'}
Key Decisions: ${JSON.stringify(m.aiResult?.keyPoints || [])}
Action Items: ${m.actionItemCount || 0} total, ${m.openActionItemCount || 0} open
`).join('\n---\n')}

Provide a ${period}ly summary as JSON with:
- executiveSummary: string (2-3 sentences)
- meetingCount: number
- keyHighlights: string[] (top 3-5 accomplishments or decisions)
- actionItemsSummary: { total, completed, open, overdue }
- stakeholdersMet: number
- topTopics: string[] (recurring themes)
- lookingAhead: string[] (upcoming priorities based on meetings)
- concerns: string[] (any issues or blockers identified)`

  const response = await callClaude(systemPrompt, userPrompt)
  return parseClaudeJSON(response)
}

/**
 * Ask a natural language question about meetings
 * "Which meetings discussed budget this quarter?"
 */
export async function askMeetingQuestion(question) {
  const meetings = await getAllMeetingMetadata()
  const activeMeetings = meetings.filter(m => !m.deleted).slice(0, 50)

  // Get summaries for context
  const meetingSummaries = activeMeetings.map(m => ({
    id: m.id,
    title: m.title,
    date: m.date,
    summary: m.summaryPreview,
    stakeholders: m.stakeholderIds?.length || 0,
    actionItems: m.actionItemCount || 0,
    hasTranscript: m.hasTranscript,
    hasAnalysis: m.hasAnalysis
  }))

  const systemPrompt = `You are a meeting search assistant. Answer questions about meetings based on the provided meeting data. Be specific and cite meeting titles/dates when relevant.`

  const userPrompt = `Question: ${question}

Available Meeting Data (${activeMeetings.length} meetings):
${JSON.stringify(meetingSummaries, null, 2)}

Provide a helpful answer. If the question requires looking at specific meeting content that isn't in the summaries, mention which meetings might be relevant.

Format as JSON:
{
  "answer": "your detailed answer",
  "relevantMeetings": ["meeting ids"],
  "confidence": "high/medium/low",
  "suggestion": "optional follow-up suggestion"
}`

  const response = await callClaude(systemPrompt, userPrompt)
  return parseClaudeJSON(response)
}

// ============================================
// EXPORT
// ============================================

export default {
  prepareMeetingBrief,
  analyzeMeetingPatterns,
  findFollowUpOpportunities,
  identifyStakeholderGaps,
  generatePeriodSummary,
  askMeetingQuestion
}
