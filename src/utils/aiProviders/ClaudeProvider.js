// World-class Claude API integration with CORS support
export class ClaudeProvider {
  constructor(apiKey = null) {
    this.apiKey = apiKey || localStorage.getItem('claudeApiKey')
    this.baseUrl = 'https://api.anthropic.com/v1'
    this.model = 'claude-3-haiku-20240307' // Fast, cost-effective for meeting notes
    this.maxTokens = 2048
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

    return `You are an expert meeting notes analyst. Transform the following meeting transcript into comprehensive, structured meeting notes.

**Meeting Context:**
- Type: ${meetingType}
- Date: ${date || 'Not specified'}
- Primary Stakeholder: ${stakeholder || 'Not specified'}

**Raw Meeting Notes/Transcript:**
"""
${text}
"""

**ANALYSIS REQUIREMENTS:**

1. **IDENTIFY PEOPLE & CONTEXT**
   - Extract each person's background, current role, and relevant experience
   - Include specific details, timelines, and quantifiable information

2. **ORGANIZE BY LOGICAL THEMES**
   - Group related topics under clear, descriptive headers
   - Use bullet points and sub-bullets for hierarchical information
   - Bold key terms and proper nouns for easy scanning

3. **CAPTURE STRATEGIC INSIGHTS**
   - Extract lessons learned, challenges identified, and solutions proposed
   - Include specific methodologies, frameworks, and best practices mentioned
   - Note any data points, metrics, or measurable outcomes

4. **HIGHLIGHT ACTIONABLE INFORMATION**
   - Identify collaboration opportunities and potential partnerships
   - Extract concrete next steps with responsible parties
   - Note key contacts, referrals, and recommended resources

5. **MAINTAIN PROFESSIONAL ACCURACY**
   - Use precise terminology and proper names
   - Include relevant context that adds meaning
   - Preserve nuanced distinctions and qualifications

**Response Format (JSON):**
{
  "summary": "Brief overview capturing strategic context and main outcomes",
  "peopleAndContext": [
    {
      "name": "Person Name",
      "background": "Current role, experience, relevant details with specifics",
      "relevance": "Why they matter to the discussion"
    }
  ],
  "thematicSections": [
    {
      "sectionTitle": "Clear, descriptive header that captures essence",
      "content": [
        "Specific detail with context and quantifiable information",
        "Key insight or methodology mentioned",
        "Strategic consideration or challenge identified"
      ]
    }
  ],
  "strategicInsights": [
    "Lesson learned with specific context",
    "Best practice or framework mentioned",
    "Challenge identified with proposed solution"
  ],
  "actionItems": [
    {
      "task": "Specific action with responsible party named",
      "assignee": "Name or 'Unassigned'",
      "priority": "high|medium|low",
      "dueDate": "Date mentioned or null",
      "type": "next_step|collaboration|follow_up|research",
      "confidence": 0.9
    }
  ],
  "keyContacts": [
    {
      "name": "Contact name",
      "role": "Their position/relevance",
      "connection": "How they relate to discussed opportunities"
    }
  ],
  "sentiment": "positive|neutral|negative",
  "confidence": 0.95,
  "processingNotes": "Analysis notes about structure and strategic value"
}

Generate meeting notes that capture both strategic insights and tactical details, making them immediately useful for follow-up actions and future reference. Return only valid JSON without any markdown formatting.`
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
      peopleAndContext: [],
      thematicSections: [],
      strategicInsights: [],
      actionItems: [],
      keyContacts: [],
      sentiment: 'neutral',
      confidence: 0.7
    }

    const lines = text.split('\n').filter(line => line.trim())
    let currentSection = null

    for (const line of lines) {
      const lowerLine = line.toLowerCase().trim()

      if (lowerLine.includes('summary') || lowerLine.includes('overview')) {
        currentSection = 'summary'
        continue
      } else if (lowerLine.includes('discussion') || lowerLine.includes('key points')) {
        currentSection = 'discussion'
        continue
      } else if (lowerLine.includes('action') || lowerLine.includes('task')) {
        currentSection = 'actions'
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
      } else if (currentSection === 'actions') {
        const cleanLine = line.replace(/^[-•*]\s*/, '').trim()
        if (cleanLine.length > 10) {
          result.actionItems.push({
            task: cleanLine,
            assignee: this.extractAssignee(cleanLine) || 'Unassigned',
            priority: this.determinePriority(cleanLine),
            dueDate: this.extractDueDate(cleanLine),
            confidence: 0.7
          })
        }
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