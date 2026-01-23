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
    return `You are an expert meeting notes assistant that creates comprehensive, thematically-organized notes. Your goal is to capture ALL important information discussed, not just highlights.

**Meeting Content:**
"""
${text}
"""

**Instructions:** Analyze this meeting thoroughly and return a JSON object with these fields:

{
  "summary": "3-4 sentence executive summary covering: (1) Meeting purpose, (2) Key outcomes/conclusions, (3) Most important decision or insight, (4) Critical next step",

  "themes": [
    {
      "topic": "Descriptive topic name (e.g., 'Q4 Budget Planning', 'Customer Onboarding Issues')",
      "keyPoints": [
        "Detailed point with specific context - include WHO said it, WHAT exactly was discussed, and WHY it matters",
        "Include actual quotes when impactful (e.g., 'John noted: we need to ship by March or we lose the contract')",
        "Include specific numbers, metrics, dates, percentages mentioned (e.g., 'Revenue down 15% vs Q3')",
        "Capture concerns raised and the reasoning behind them",
        "Note any disagreements or alternative viewpoints expressed"
      ],
      "context": "Brief background on why this topic was discussed or what led to it"
    }
  ],

  "decisions": [
    {
      "decision": "Clear statement of what was decided",
      "madeBy": "Who made or approved this decision",
      "rationale": "Why this decision was made (if discussed)",
      "implications": "What this means going forward"
    }
  ],

  "actionItems": [
    {
      "task": "Specific, actionable task with enough detail to execute",
      "owner": "Person's name (or 'TBD')",
      "deadline": "Specific date or timeframe (or 'TBD')",
      "priority": "high/medium/low",
      "context": "Why this task matters or what it's blocking"
    }
  ],

  "openItems": [
    {
      "item": "Question, concern, or topic needing follow-up",
      "type": "question/blocker/risk/parking-lot",
      "owner": "Who needs to address this (if known)",
      "urgency": "How soon this needs resolution"
    }
  ],

  "nextSteps": "2-3 sentences on immediate next actions, when the team will reconnect, and what needs to happen before then"
}

**CRITICAL INSTRUCTIONS FOR KEY POINTS:**

1. **CAPTURE EVERYTHING IMPORTANT** - Do not summarize excessively. If 10 important things were discussed, include all 10. Err on the side of more detail.

2. **THEMATIC GROUPING** - Group related discussion points under clear topic headers. A 30-minute meeting might have 3-5 themes; an hour meeting might have 5-8.

3. **PRESERVE SPECIFICS** - Include:
   - Actual names of people, companies, products mentioned
   - Exact numbers, percentages, dates, deadlines discussed
   - Direct quotes when someone said something important
   - Technical terms and jargon exactly as used

4. **CAPTURE THE "WHY"** - Don't just say what was discussed, explain:
   - Why this topic came up
   - What problem it's trying to solve
   - What concerns or risks were raised
   - What alternatives were considered

5. **NOTE DISAGREEMENTS** - If people had different opinions, capture both sides

6. **INCLUDE CONTEXT** - For each theme, briefly note what led to discussing it

**Output Quality Check:**
Before returning, verify:
- Did I capture ALL major topics discussed?
- Did I include specific names, numbers, and dates?
- Would someone who missed this meeting understand what happened?
- Are my key points detailed enough to be useful, not just one-line summaries?

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
    // Extract flat keyPoints from themes for backward compatibility
    const flatKeyPoints = result.themes
      ? result.themes.flatMap(theme => theme.keyPoints || [])
      : (result.keyPoints || result.keyDiscussionPoints || [])

    // Normalize decisions (can be objects or strings)
    const normalizedDecisions = (result.decisions || result.decisionsMade || []).map(d =>
      typeof d === 'object' ? d : { decision: d, madeBy: 'TBD', rationale: '', implications: '' }
    )

    // Normalize openItems/followUps
    const normalizedOpenItems = (result.openItems || result.followUps || result.openQuestions || []).map(item =>
      typeof item === 'object' ? item : { item: item, type: 'question', owner: 'TBD', urgency: '' }
    )

    return {
      summary: result.summary || '',
      // New thematic format
      themes: result.themes || null,
      // New format fields
      decisions: normalizedDecisions,
      openItems: normalizedOpenItems,
      nextSteps: result.nextSteps || '',
      // Old format fields (for backward compatibility with display code)
      keyPoints: flatKeyPoints,
      keyDiscussionPoints: flatKeyPoints,
      decisionsMade: normalizedDecisions.map(d => typeof d === 'object' ? d.decision : d),
      followUps: normalizedOpenItems.map(item => typeof item === 'object' ? item.item : item),
      openQuestions: normalizedOpenItems.map(item => typeof item === 'object' ? item.item : item),
      // Action items (normalize field names within)
      actionItems: (result.actionItems || []).map(item => ({
        task: item.task || '',
        owner: item.owner || item.assignee || 'TBD',
        assignee: item.owner || item.assignee || 'TBD', // backward compat
        deadline: item.deadline || item.dueDate || 'TBD',
        dueDate: item.deadline || item.dueDate || 'TBD', // backward compat
        priority: item.priority || 'medium',
        context: item.context || ''
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