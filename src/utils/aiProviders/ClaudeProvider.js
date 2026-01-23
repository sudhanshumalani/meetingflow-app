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

    return `You are an expert meeting notes assistant. Transform meeting content into clear, actionable notes.

**Context:**
- Date: ${date || 'Not specified'}
- Meeting Type: ${meetingType || 'General'}
- Stakeholder: ${stakeholder || 'Not specified'}

**Meeting Content:**
"""
${text}
"""

**Instructions:** Analyze this meeting and return a JSON object with exactly these 6 fields:

{
  "summary": "A concise 2-3 sentence summary answering: What was this meeting about? What was accomplished? What's the main outcome?",

  "keyPoints": [
    "Each item should be a complete, standalone insight",
    "Include specific details: names, numbers, dates, metrics mentioned",
    "Capture the 'so what' - why does this point matter?",
    "Group related items together logically",
    "Aim for 5-10 key points depending on meeting length"
  ],

  "decisions": [
    "Format: '[DECISION]: What was decided + who approved it'",
    "Include rationale if discussed",
    "Only include actual decisions, not suggestions or ideas"
  ],

  "actionItems": [
    {
      "task": "Specific, actionable task description",
      "owner": "Person's name (or 'TBD' if not assigned)",
      "deadline": "Due date/timeframe (or 'TBD' if not specified)",
      "priority": "high/medium/low based on urgency discussed"
    }
  ],

  "followUps": [
    "Open questions that need answers",
    "Topics to discuss in next meeting",
    "Information to gather before proceeding"
  ],

  "nextSteps": "1-2 sentence summary of immediate next actions and when the team will reconnect"
}

**Quality Guidelines:**
1. Be SPECIFIC - include actual names, numbers, dates, and details mentioned
2. Be ACTIONABLE - every action item should be clear enough to execute
3. Be CONCISE - bullet points, not paragraphs
4. PRESERVE important terminology and jargon exactly as used
5. If something is unclear in the transcript, note it as [unclear] rather than guessing

**Meeting Type Adjustments:**
- Sales/Client calls: Emphasize customer needs, objections, proposed solutions, next steps
- Team standups: Focus on blockers, progress, and dependencies
- 1-on-1s: Highlight feedback, career topics, and personal action items
- Project reviews: Emphasize status, risks, decisions, and milestones

Return ONLY valid JSON. No markdown code blocks. No explanation text.`
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

      // Normalize result to include both new and old field names for backward compatibility
      const normalizedResult = this.normalizeResult(result)

      // Add metadata
      return {
        ...normalizedResult,
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

  // Normalize result to include both new and old field names for backward compatibility
  normalizeResult(result) {
    return {
      summary: result.summary || '',
      // New format fields
      keyPoints: result.keyPoints || result.keyDiscussionPoints || [],
      decisions: result.decisions || result.decisionsMade || [],
      followUps: result.followUps || result.openQuestions || [],
      nextSteps: result.nextSteps || '',
      // Old format fields (for backward compatibility with display code)
      keyDiscussionPoints: result.keyPoints || result.keyDiscussionPoints || [],
      decisionsMade: result.decisions || result.decisionsMade || [],
      openQuestions: result.followUps || result.openQuestions || [],
      // Action items (normalize field names within)
      actionItems: (result.actionItems || []).map(item => ({
        task: item.task || '',
        owner: item.owner || item.assignee || 'TBD',
        assignee: item.owner || item.assignee || 'TBD', // backward compat
        deadline: item.deadline || item.dueDate || 'TBD',
        dueDate: item.deadline || item.dueDate || 'TBD', // backward compat
        priority: item.priority || 'medium'
      })),
      // Metadata
      sentiment: result.sentiment || 'neutral',
      confidence: result.confidence || 0.9
    }
  }

  parseTextResponse(text) {
    // Fallback text parser for non-JSON responses
    const result = {
      summary: '',
      keyPoints: [],
      decisions: [],
      actionItems: [],
      followUps: [],
      nextSteps: ''
    }

    const lines = text.split('\n').filter(line => line.trim())
    let currentSection = null

    for (const line of lines) {
      const lowerLine = line.toLowerCase().trim()

      if (lowerLine.includes('summary')) {
        currentSection = 'summary'
        continue
      } else if (lowerLine.includes('key point') || lowerLine.includes('discussion')) {
        currentSection = 'keyPoints'
        continue
      } else if (lowerLine.includes('decision')) {
        currentSection = 'decisions'
        continue
      } else if (lowerLine.includes('action') || lowerLine.includes('task')) {
        currentSection = 'actions'
        continue
      } else if (lowerLine.includes('follow') || lowerLine.includes('question')) {
        currentSection = 'followUps'
        continue
      } else if (lowerLine.includes('next step')) {
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
      } else if (currentSection === 'keyPoints') {
        const cleanLine = line.replace(/^[-•*]\s*/, '').trim()
        if (cleanLine.length > 10) {
          result.keyPoints.push(cleanLine)
        }
      } else if (currentSection === 'decisions') {
        const cleanLine = line.replace(/^[-•*]\s*/, '').trim()
        if (cleanLine.length > 10) {
          result.decisions.push(cleanLine)
        }
      } else if (currentSection === 'actions') {
        const cleanLine = line.replace(/^[-•*]\s*/, '').trim()
        if (cleanLine.length > 10) {
          result.actionItems.push({
            task: cleanLine,
            owner: this.extractAssignee(cleanLine) || 'TBD',
            priority: this.determinePriority(cleanLine),
            deadline: this.extractDueDate(cleanLine) || 'TBD'
          })
        }
      } else if (currentSection === 'followUps') {
        const cleanLine = line.replace(/^[-•*\[\]\s]*/, '').trim()
        if (cleanLine.length > 10) {
          result.followUps.push(cleanLine)
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