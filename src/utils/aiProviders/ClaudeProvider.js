// World-class Claude API integration with CORS support
// Cache-busting update: Fixed static import issue - v2.0
export class ClaudeProvider {
  constructor(apiKey = null) {
    this.apiKey = apiKey || localStorage.getItem('claudeApiKey')
    this.baseUrl = 'https://api.anthropic.com/v1'
    this.model = 'claude-3-haiku-20240307' // Fast, cost-effective for meeting notes
    this.maxTokens = 4096 // Maximum allowed for Claude Haiku (increased from 2048 for more detailed notes)
  }

  async isAvailable() {
    console.log('🔍 ClaudeProvider.isAvailable() called')
    console.log('🔍 API Key exists:', !!this.apiKey)
    console.log('🔍 API Key length:', this.apiKey?.length || 0)
    console.log('🔍 API Key preview:', this.apiKey ? this.apiKey.substring(0, 10) + '...' : 'none')

    if (!this.apiKey) {
      console.log('❌ No API key provided to ClaudeProvider')
      return false
    }

    try {
      console.log('🔍 Making availability check request to:', `${this.baseUrl}/messages`)
      console.log('🔍 Headers:', this.getHeaders())

      // Quick availability check
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: this.model,
          max_tokens: 100,
          messages: [{ role: 'user', content: 'Hi' }]
        })
      })

      console.log('🔍 Response status:', response.status)
      console.log('🔍 Response ok:', response.ok)

      if (!response.ok) {
        const errorText = await response.text()
        console.log('🔍 Error response:', errorText)
      }

      return response.ok
    } catch (error) {
      console.error('❌ Claude availability check failed with error:', error)
      return false
    }
  }

  getHeaders() {
    return {
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true' // Enable CORS
    }
  }

  buildMeetingPrompt(text, context = {}) {
    const { meetingType = 'general', stakeholder = null, date = null } = context

    return `You are a professional meeting notes assistant that generates comprehensive, well-structured meeting documentation similar to leading AI note-taking tools like Fireflies, Otter, and Granola.

When provided with a meeting transcript or recording, generate meeting notes with the following structure:

## MEETING HEADER
- **Meeting Title:** [Extract or generate descriptive title]
- **Date & Time:** ${date || '[Meeting date and duration]'}
- **Attendees:** [List all participants with their roles if mentioned]
- **Meeting Type:** ${meetingType || '[Identify: Team Sync, Sales Call, 1-on-1, Interview, Project Review, etc.]'}

## EXECUTIVE SUMMARY
Write a 2-3 sentence overview capturing the meeting's purpose and main outcome. This should give someone who wasn't present a quick understanding of what was accomplished.

## KEY DISCUSSION POINTS
Organize the main topics discussed into clearly themed sections with descriptive headers. Capture ALL significant topics that were discussed - don't limit yourself to a fixed number. Be thorough and comprehensive.

Under each topic header, provide detailed bullet points covering:
- What was discussed in detail
- Important context, background information, or rationale provided
- Any data, metrics, numbers, or specific examples mentioned
- Different perspectives or viewpoints expressed
- Clarifications or elaborations made during the discussion
- Relevant details that provide complete understanding

Format as:
### [Descriptive Topic Header 1]
- Detailed discussion point with full context
- Supporting information and background
- Specific examples, metrics, or data mentioned
- Additional relevant details
- Any conclusions or insights reached
- [Continue with as many bullets as needed to capture the full discussion]

### [Descriptive Topic Header 2]
- Comprehensive coverage of what was discussed
- Important details and nuances
- Specific information shared
- Context and implications
- [Add all relevant points - be thorough]

[Continue with additional topic sections as needed to cover the entire meeting]

## DECISIONS MADE
List ALL concrete decisions reached during the meeting with full context:
- [Decision 1]: [What was decided, who made/approved it, rationale provided, and any conditions]
- [Decision 2]: [Complete description including background, implications, and next steps]
- [Decision 3]: [Full details including dependencies, timeline, and expected outcomes]
- [Continue listing all decisions - be comprehensive and include all relevant context]

## ACTION ITEMS
Identify and list ALL action items mentioned or implied in the meeting. Format each with owner, deadline, and clear description:

| Action Item | Owner | Due Date | Priority | Notes |
|------------|-------|----------|----------|--------|
| [Specific, measurable task with full details] | @[Name] | [Date or timeframe] | High/Medium/Low | [Dependencies, context, expected outcome] |
| [Clear deliverable with complete description] | @[Name] | [Specific date] | High/Medium/Low | [Additional important details] |
| [Continue listing ALL action items - don't limit the number] | @[Name] | [Timeframe] | [Priority] | [Full context] |

## OPEN QUESTIONS & FOLLOW-UPS
List ALL unresolved questions, topics requiring further discussion, or information needs:
- [ ] [Unresolved question with context about why it needs further discussion]
- [ ] [Topic to revisit in next meeting with relevant background]
- [ ] [Information needed from external source with explanation of why it's needed]
- [ ] [Continue listing all open items - be comprehensive]

## NEXT STEPS
Provide a detailed summary of immediate next steps, including timeline, responsibilities, and when the team will reconvene or check in on progress. Include any important context about the path forward.

### FORMATTING GUIDELINES:
1. **BE THOROUGH AND COMPREHENSIVE** - Capture all important information, don't summarize excessively
2. Use clear, professional language - preserve technical terms and industry-specific jargon as used
3. Bullet points should be detailed and informative - provide complete context
4. Bold important names, dates, metrics, and key decisions for easy scanning
5. Ensure action items are SMART (Specific, Measurable, Assignable, Relevant, Time-bound)
6. Use active voice and present tense for current states, past tense for decisions made
7. Organize information hierarchically - most important first
8. Include speaker attribution when it adds important context or shows who drove decisions
9. If working from a transcript with timestamps, reference them for key moments: [00:15:30]
10. **PRIORITIZE COMPLETENESS OVER BREVITY** - detailed notes are more valuable than short summaries

### STYLE NOTES:
- Write in third person for main content
- Be objective and factual - avoid interpretive language unless quoting
- Preserve technical terminology and product names exactly as spoken
- Flag any unclear audio or ambiguous decisions with [unclear] or [to be confirmed]
- If the meeting type is identified (sales, interview, standup), adjust the template emphasis accordingly:
  - Sales calls: Focus on customer needs, objections, next steps
  - Interviews: Highlight candidate responses, technical assessments, culture fit
  - Standups: Emphasize blockers, progress updates, dependencies
  - 1-on-1s: Career development, feedback, personal goals

**Meeting Context:**
- Stakeholder: ${stakeholder || 'Not specified'}

**Raw Meeting Notes/Transcript:**
"""
${text}
"""

**IMPORTANT:** Return your response as valid JSON with this structure:
{
  "summary": "2-3 sentence executive summary",
  "keyDiscussionPoints": ["Array of strings with ### headers and bullet points in markdown format"],
  "decisionsMade": ["Array of decision strings"],
  "actionItems": [
    {
      "task": "Specific action item",
      "assignee": "Name or Unassigned",
      "dueDate": "Date or timeframe or null",
      "priority": "high|medium|low",
      "notes": "Dependencies or context"
    }
  ],
  "openQuestions": ["Array of unresolved questions"],
  "nextSteps": "Brief summary of immediate next steps",
  "sentiment": "positive|neutral|negative",
  "confidence": 0.95
}

Generate the notes in clean format that can be easily copied to Notion, Confluence, or shared via email. The notes should be scannable, with the most critical information immediately visible. Return only valid JSON without any markdown code blocks.`
  }

  async analyze(text, context = {}) {
    if (!this.apiKey) {
      throw new Error('Claude API key required. Please add it in Settings.')
    }

    console.log('🧠 Analyzing with Claude Haiku...', {
      textLength: text.length,
      context
    })

    const startTime = Date.now()

    try {
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: this.model,
          max_tokens: this.maxTokens,
          messages: [{
            role: 'user',
            content: this.buildMeetingPrompt(text, context)
          }],
          temperature: 0.1 // Low temperature for consistent, factual analysis
        })
      })

      if (!response.ok) {
        const errorData = await response.text()
        throw new Error(`Claude API error (${response.status}): ${errorData}`)
      }

      const data = await response.json()
      const processingTime = Date.now() - startTime

      // Parse Claude's response
      const aiResponse = data.content[0].text.trim()

      // Try to parse as JSON, fallback to text parsing
      let result
      try {
        result = JSON.parse(aiResponse)
      } catch (parseError) {
        console.warn('JSON parsing failed, using text parser:', parseError)
        result = this.parseTextResponse(aiResponse)
      }

      // Add metadata
      return {
        ...result,
        provider: 'Claude Haiku',
        processingTime,
        tokenUsage: data.usage || {},
        cost: this.estimateCost(data.usage),
        timestamp: new Date().toISOString()
      }

    } catch (error) {
      console.error('Claude analysis failed:', error)
      throw new Error(`Claude analysis failed: ${error.message}`)
    }
  }

  parseTextResponse(text) {
    // Fallback text parser for non-JSON responses
    const result = {
      summary: '',
      keyDiscussionPoints: [],
      decisionsMade: [],
      actionItems: [],
      openQuestions: [],
      nextSteps: '',
      sentiment: 'neutral',
      confidence: 0.7
    }

    const lines = text.split('\n').filter(line => line.trim())
    let currentSection = null

    for (const line of lines) {
      const lowerLine = line.toLowerCase().trim()

      if (lowerLine.includes('summary') || lowerLine.includes('executive summary')) {
        currentSection = 'summary'
        continue
      } else if (lowerLine.includes('discussion') || lowerLine.includes('key points')) {
        currentSection = 'discussion'
        continue
      } else if (lowerLine.includes('decisions made') || lowerLine.includes('decision')) {
        currentSection = 'decisions'
        continue
      } else if (lowerLine.includes('action') || lowerLine.includes('task')) {
        currentSection = 'actions'
        continue
      } else if (lowerLine.includes('open questions') || lowerLine.includes('follow-up')) {
        currentSection = 'questions'
        continue
      } else if (lowerLine.includes('next steps')) {
        currentSection = 'nextSteps'
        continue
      }

      // Skip headers and format markers
      if (line.startsWith('#') || line.startsWith('**') || line.length < 5) {
        continue
      }

      // Add content to appropriate section
      if (currentSection === 'summary' && !result.summary) {
        result.summary = line.replace(/^[-•*]\s*/, '').trim()
      } else if (currentSection === 'discussion') {
        const cleanLine = line.replace(/^[-•*]\s*/, '').trim()
        if (cleanLine.length > 10) {
          result.keyDiscussionPoints.push(cleanLine)
        }
      } else if (currentSection === 'decisions') {
        const cleanLine = line.replace(/^[-•*]\s*/, '').trim()
        if (cleanLine.length > 10) {
          result.decisionsMade.push(cleanLine)
        }
      } else if (currentSection === 'actions') {
        const cleanLine = line.replace(/^[-•*]\s*/, '').trim()
        if (cleanLine.length > 10) {
          result.actionItems.push({
            task: cleanLine,
            assignee: this.extractAssignee(cleanLine) || 'Unassigned',
            priority: this.determinePriority(cleanLine),
            dueDate: this.extractDueDate(cleanLine),
            notes: '',
            confidence: 0.7
          })
        }
      } else if (currentSection === 'questions') {
        const cleanLine = line.replace(/^[-•*\[\]\s]*/, '').trim()
        if (cleanLine.length > 10) {
          result.openQuestions.push(cleanLine)
        }
      } else if (currentSection === 'nextSteps') {
        result.nextSteps += (result.nextSteps ? ' ' : '') + line.replace(/^[-•*]\s*/, '').trim()
      }
    }

    return result
  }

  extractAssignee(text) {
    const patterns = [
      /(?:assign(?:ed)?\s+to|by|responsible:?)\s+([A-Za-z]+)/i,
      /([A-Za-z]+)\s+(?:will|should|needs to|to)/i
    ]

    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (match) return match[1]
    }
    return null
  }

  determinePriority(text) {
    const lowerText = text.toLowerCase()
    if (lowerText.includes('urgent') || lowerText.includes('critical') || lowerText.includes('asap')) {
      return 'high'
    }
    if (lowerText.includes('later') || lowerText.includes('when possible') || lowerText.includes('low priority')) {
      return 'low'
    }
    return 'medium'
  }

  extractDueDate(text) {
    const patterns = [
      /(?:by|due|deadline)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
      /(?:by|due|deadline)\s+(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/,
      /(?:by|due|deadline)\s+(tomorrow|next\s+week|end\s+of\s+week)/i
    ]

    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (match) return match[1]
    }
    return null
  }

  estimateCost(usage) {
    if (!usage) return 0

    // Claude Haiku pricing (approximate)
    const inputCostPer1k = 0.00025  // $0.25 per 1M input tokens
    const outputCostPer1k = 0.00125 // $1.25 per 1M output tokens

    const inputCost = (usage.input_tokens || 0) * inputCostPer1k / 1000
    const outputCost = (usage.output_tokens || 0) * outputCostPer1k / 1000

    return Number((inputCost + outputCost).toFixed(6))
  }

  getCost() {
    return 0.001 // Estimated cost per request
  }

  // Streaming analysis for real-time updates
  async analyzeStream(text, context = {}, onUpdate = () => {}) {
    // Note: Claude doesn't support streaming in browser yet
    // This provides optimistic updates during analysis

    onUpdate({
      summary: 'Analyzing meeting content...',
      keyDiscussionPoints: ['🔍 Extracting discussion points...'],
      actionItems: [{ task: '📋 Identifying action items...', assignee: 'Claude', priority: 'medium' }],
      isStreaming: true
    })

    const result = await this.analyze(text, context)

    onUpdate(result)
    return result
  }
}

// Export singleton instance
export const claudeProvider = new ClaudeProvider()

// Utility functions for React components
export const initializeClaudeProvider = (apiKey) => {
  claudeProvider.apiKey = apiKey
  localStorage.setItem('claudeApiKey', apiKey)
}

export const isClaudeAvailable = () => claudeProvider.isAvailable()