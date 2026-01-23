// Simple, reliable OCR service with Claude AI integration
// Static import fix v2.0 - Force cache refresh
import { ClaudeProvider } from './aiProviders/ClaudeProvider.js'

export class SimpleOCRService {
  constructor() {
    this.apiKey = localStorage.getItem('ocrApiKey') || null
    this.claudeApiKey = localStorage.getItem('claudeApiKey') || null
    console.log('🔧 SimpleOCRService constructor:', {
      hasOcrKey: !!this.apiKey,
      hasClaudeKey: !!this.claudeApiKey,
      claudeKeyLength: this.claudeApiKey?.length || 0,
      claudeKeyPreview: this.claudeApiKey ? this.claudeApiKey.substring(0, 10) + '...' : 'none'
    })
  }

  setOCRApiKey(key) {
    this.apiKey = key?.trim() || null
    if (key) {
      localStorage.setItem('ocrApiKey', key)
    } else {
      localStorage.removeItem('ocrApiKey')
    }
  }

  setClaudeApiKey(key) {
    console.log('🔧 setClaudeApiKey called with:', {
      hasKey: !!key,
      keyLength: key?.length || 0,
      keyPreview: key ? key.substring(0, 10) + '...' : 'none'
    })
    this.claudeApiKey = key?.trim() || null
    if (key) {
      localStorage.setItem('claudeApiKey', key)
      console.log('✅ Claude API key saved to localStorage')
    } else {
      localStorage.removeItem('claudeApiKey')
      console.log('🗑️ Claude API key removed from localStorage')
    }
    console.log('🔧 After setClaudeApiKey - instance has key:', !!this.claudeApiKey)
  }

  async extractTextFromImage(imageFile, onProgress = () => {}) {
    console.log('Starting OCR extraction for:', imageFile.name)
    onProgress(10)

    try {
      // Try OCR.space API first
      if (this.apiKey) {
        console.log('Using OCR.space API')
        onProgress(30)
        const result = await this.callOCRSpaceAPI(imageFile, onProgress)
        if (result.success) {
          return result
        }
      }

      // Fallback to simple text placeholder
      console.log('Using fallback mode')
      return this.createFallbackResult(imageFile)

    } catch (error) {
      console.error('OCR extraction failed:', error)
      return this.createFallbackResult(imageFile, error.message)
    }
  }

  async callOCRSpaceAPI(imageFile, onProgress) {
    const formData = new FormData()
    formData.append('apikey', this.apiKey)
    formData.append('language', 'eng')
    formData.append('isOverlayRequired', 'false')
    formData.append('detectOrientation', 'true')
    formData.append('scale', 'true')
    formData.append('OCREngine', '2')
    formData.append('file', imageFile)

    onProgress(50)

    const response = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      body: formData
    })

    if (!response.ok) {
      throw new Error(`OCR API failed: ${response.status}`)
    }

    const data = await response.json()
    onProgress(80)

    if (data.IsErroredOnProcessing) {
      throw new Error(data.ErrorMessage || 'OCR processing failed')
    }

    if (!data.ParsedResults || data.ParsedResults.length === 0) {
      throw new Error('No text found in image')
    }

    const extractedText = data.ParsedResults[0].ParsedText?.trim()
    if (!extractedText || extractedText.length < 3) {
      throw new Error('No meaningful text extracted')
    }

    onProgress(100)
    console.log('OCR successful, extracted:', extractedText.length, 'characters')

    return {
      success: true,
      text: extractedText,
      confidence: 90,
      method: 'OCR.space API',
      timestamp: new Date().toISOString()
    }
  }

  createFallbackResult(imageFile, error = null) {
    const fallbackText = error ?
      `OCR Error: ${error}\n\nImage: ${imageFile.name}\nPlease configure OCR.space API key in Settings or manually enter the text.` :
      `Image uploaded: ${imageFile.name}\n\nPlease configure OCR.space API key in Settings for automatic text extraction, or manually enter the text below.`

    return {
      success: true,
      text: fallbackText,
      confidence: 0,
      method: 'Manual Entry',
      isFallback: true,
      timestamp: new Date().toISOString()
    }
  }

  // Claude AI integration for processing extracted text
  async processWithClaude(text, meetingContext = {}) {
    console.log('🚨🚨🚨 MODIFIED PROCESSWITCHLAUDE FUNCTION CALLED 🚨🚨🚨')
    console.log('🎯 === PROCESSING WITH CLAUDE DEBUG ===')
    console.log('Text length:', text.length)
    console.log('Meeting context:', meetingContext)

    // ALWAYS check localStorage for the latest API key first
    const latestClaudeApiKey = localStorage.getItem('claudeApiKey')
    console.log('localStorage claudeApiKey:', latestClaudeApiKey ? 'EXISTS' : 'MISSING')
    console.log('Instance claudeApiKey:', this.claudeApiKey ? 'EXISTS' : 'MISSING')

    // Update instance if localStorage has a different key
    if (latestClaudeApiKey !== this.claudeApiKey) {
      console.log('🔄 Updating instance with latest API key from localStorage')
      this.claudeApiKey = latestClaudeApiKey
    }

    console.log('Final API key check - has key:', !!this.claudeApiKey)
    console.log('Final API key length:', this.claudeApiKey?.length || 0)
    console.log('Final API key preview:', this.claudeApiKey ? this.claudeApiKey.substring(0, 10) + '...' : 'none')

    // Try direct Claude API first (seamless experience)
    if (this.claudeApiKey) {
      try {
        console.log('🧠 Using direct Claude API...')
        const claudeProvider = new ClaudeProvider(this.claudeApiKey)

        console.log('✅ API key exists, attempting direct analysis (skipping availability check)...')
        const result = await claudeProvider.analyze(text, meetingContext)
        console.log('✅ Claude API analysis complete:', result)
        console.log('🎉 SUCCESS! Returning Claude API result without popup!')
        return result
      } catch (error) {
        console.error('❌❌❌ CLAUDE API FAILED - THIS IS WHY POPUP APPEARS ❌❌❌')
        console.error('❌ Claude API error details:', error)
        console.error('❌ Error name:', error.name)
        console.error('❌ Error message:', error.message)
        console.error('❌ Error stack:', error.stack)
        console.warn('⚠️ Claude API failed, falling back to copy-paste workflow:', error.message)
      }
    } else {
      console.log('❌❌❌ NO API KEY - THIS IS WHY POPUP APPEARS ❌❌❌')
    }

    // Fallback to copy-paste workflow if no API key or API fails
    console.log('🚨🚨🚨 SHOWING POPUP BECAUSE API KEY MISSING OR API FAILED 🚨🚨🚨')
    console.log('🤖 Offering Claude Web Interface workflow...')
    try {
      const useClaudeWebInterface = await this.offerClaudeWebWorkflow(text, meetingContext)
      if (useClaudeWebInterface) {
        console.log('✅ User used Claude web interface - got high-quality results!')
        return useClaudeWebInterface
      }
    } catch (error) {
      console.warn('⚠️ Claude web workflow failed or cancelled:', error)
    }

    console.log('📝 Using enhanced local AI simulation...')
    // Final fallback to enhanced local simulation
    return this.enhancedClaudeSimulation(text, meetingContext)
  }

  // Copy-Paste workflow with Claude web interface
  async offerClaudeWebWorkflow(text, meetingContext = {}) {
    return new Promise((resolve) => {
      // Create a modal overlay
      const modal = document.createElement('div')
      modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.8); z-index: 10000; display: flex;
        align-items: center; justify-content: center; font-family: system-ui;
      `

      const content = document.createElement('div')
      content.style.cssText = `
        background: white; padding: 30px; border-radius: 12px; max-width: 600px;
        max-height: 80vh; overflow-y: auto; box-shadow: 0 20px 40px rgba(0,0,0,0.3);
      `

      const prompt = `You are an expert meeting notes assistant. Create comprehensive, thematically-organized notes capturing ALL important information.

**Meeting Content:**
"""
${text}
"""

**Instructions:** Return a JSON object with these fields:

{
  "summary": "3-4 sentences: (1) Meeting purpose, (2) Key outcomes, (3) Most important decision/insight, (4) Critical next step",

  "themes": [
    {
      "topic": "Descriptive topic name",
      "keyPoints": [
        "Detailed point - WHO said it, WHAT was discussed, WHY it matters",
        "Include quotes, numbers, dates, percentages when mentioned",
        "Capture concerns and reasoning behind them"
      ],
      "context": "Why this topic was discussed"
    }
  ],

  "decisions": [
    {"decision": "What was decided", "madeBy": "Who decided", "rationale": "Why", "implications": "What it means"}
  ],

  "actionItems": [
    {"task": "Specific task", "owner": "Name or TBD", "deadline": "Date or TBD", "priority": "high/medium/low", "context": "Why it matters"}
  ],

  "openItems": [
    {"item": "Question or concern", "type": "question/blocker/risk", "owner": "Who addresses it", "urgency": "How soon"}
  ],

  "nextSteps": "2-3 sentences on immediate actions and when team reconnects"
}

**Critical:** Capture EVERYTHING important. Include specific names, numbers, quotes. Group by themes. Don't over-summarize.

Return ONLY valid JSON, no markdown code blocks.`

      content.innerHTML = `
        <h2 style="margin-top: 0; color: #333; text-align: center;">🧠 Get Professional AI Analysis</h2>
        <div style="background: #f0f9ff; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #0ea5e9;">
          <p style="color: #0c4a6e; margin: 0; font-weight: 500;">
            ✨ Want Claude-quality meeting analysis like your example? Use this workflow to get professional summaries, organized discussion points, and detailed action items!
          </p>
        </div>

        <div style="margin: 20px 0;">
          <label style="display: block; font-weight: bold; margin-bottom: 8px;">
            Step 1: Copy this prompt to Claude.ai
          </label>
          <textarea readonly style="width: 100%; height: 200px; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-family: monospace; font-size: 12px;">${prompt}</textarea>
          <button id="copyPrompt" style="margin-top: 8px; padding: 8px 16px; background: #6366f1; color: white; border: none; border-radius: 6px; cursor: pointer;">
            📋 Copy Prompt
          </button>
        </div>

        <div style="margin: 20px 0;">
          <p style="color: #666; margin: 10px 0;">
            <strong>Step 2:</strong> Go to <a href="https://claude.ai" target="_blank" style="color: #6366f1;">claude.ai</a> and paste the prompt
          </p>
          <p style="color: #666; margin: 10px 0;">
            <strong>Step 3:</strong> Copy Claude's response and paste it below:
          </p>
          <textarea id="claudeResponse" placeholder="Paste Claude's response here..." style="width: 100%; height: 150px; padding: 10px; border: 1px solid #ddd; border-radius: 6px;"></textarea>
        </div>

        <div style="display: flex; justify-content: space-between; margin-top: 20px;">
          <button id="skip" style="padding: 10px 20px; background: #f59e0b; color: white; border: none; border-radius: 6px; cursor: pointer;">
            🚀 Skip - Use Enhanced Local Analysis
          </button>
          <div>
            <button id="cancel" style="padding: 10px 20px; margin-right: 10px; background: #6b7280; color: white; border: none; border-radius: 6px; cursor: pointer;">
              Cancel
            </button>
            <button id="process" style="padding: 10px 20px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer;">
              ✨ Process Claude Response
            </button>
          </div>
        </div>
      `

      modal.appendChild(content)
      document.body.appendChild(modal)

      // Copy prompt button
      content.querySelector('#copyPrompt').addEventListener('click', () => {
        navigator.clipboard.writeText(prompt).then(() => {
          const btn = content.querySelector('#copyPrompt')
          btn.innerHTML = '✅ Copied!'
          btn.style.background = '#10b981'
          setTimeout(() => {
            btn.innerHTML = '📋 Copy Prompt'
            btn.style.background = '#6366f1'
          }, 2000)
        })
      })

      // Skip button - use enhanced local analysis
      content.querySelector('#skip').addEventListener('click', () => {
        document.body.removeChild(modal)
        resolve(null) // This will trigger enhanced local simulation
      })

      // Cancel button
      content.querySelector('#cancel').addEventListener('click', () => {
        document.body.removeChild(modal)
        resolve(null)
      })

      // Process button
      content.querySelector('#process').addEventListener('click', () => {
        const response = content.querySelector('#claudeResponse').value.trim()
        if (response) {
          document.body.removeChild(modal)
          const parsed = this.parseClaudeResponse(response)
          resolve(parsed)
        } else {
          alert('Please paste Claude\'s response first!')
        }
      })

      // Close on overlay click
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          document.body.removeChild(modal)
          resolve(null)
        }
      })
    })
  }

  // Parse Claude's response (handles both JSON and text formats)
  parseClaudeResponse(response) {
    console.log('📋 Parsing Claude response...')

    // Try to parse as JSON first
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        // Check for new thematic format, keyPoints format, or legacy keyDiscussionPoints
        if (parsed.summary && (parsed.themes || parsed.keyPoints || parsed.keyDiscussionPoints || parsed.actionItems)) {
          console.log('✅ Successfully parsed Claude JSON response')
          // Normalize to support both old and new field names
          return this.normalizeResponse(parsed)
        }
      }
    } catch (e) {
      console.log('📄 JSON parsing failed, trying text parsing...')
    }

    // Parse as structured text
    return this.parseStructuredText(response)
  }

  // Normalize response to include both old and new field names for backward compatibility
  normalizeResponse(parsed) {
    // Extract flat keyPoints from themes for backward compatibility
    const flatKeyPoints = parsed.themes
      ? parsed.themes.flatMap(theme => theme.keyPoints || [])
      : (parsed.keyPoints || parsed.keyDiscussionPoints || [])

    // Normalize decisions (can be objects or strings)
    const normalizedDecisions = (parsed.decisions || parsed.decisionsMade || []).map(d =>
      typeof d === 'object' ? d : { decision: d, madeBy: 'TBD', rationale: '', implications: '' }
    )

    // Normalize openItems/followUps
    const normalizedOpenItems = (parsed.openItems || parsed.followUps || parsed.openQuestions || []).map(item =>
      typeof item === 'object' ? item : { item: item, type: 'question', owner: 'TBD', urgency: '' }
    )

    return {
      summary: parsed.summary || '',
      // New thematic format
      themes: parsed.themes || null,
      // New format fields
      decisions: normalizedDecisions,
      openItems: normalizedOpenItems,
      nextSteps: parsed.nextSteps || '',
      // Old format fields (for backward compatibility with display code)
      keyPoints: flatKeyPoints,
      keyDiscussionPoints: flatKeyPoints,
      decisionsMade: normalizedDecisions.map(d => typeof d === 'object' ? d.decision : d),
      followUps: normalizedOpenItems.map(item => typeof item === 'object' ? item.item : item),
      openQuestions: normalizedOpenItems.map(item => typeof item === 'object' ? item.item : item),
      // Action items (normalize field names within)
      actionItems: (parsed.actionItems || []).map(item => ({
        task: item.task || '',
        owner: item.owner || item.assignee || 'TBD',
        assignee: item.owner || item.assignee || 'TBD', // backward compat
        deadline: item.deadline || item.dueDate || 'TBD',
        dueDate: item.deadline || item.dueDate || 'TBD', // backward compat
        priority: item.priority || 'medium',
        context: item.context || ''
      })),
      // Metadata
      sentiment: parsed.sentiment || 'neutral',
      confidence: parsed.confidence || 0.9
    }
  }

  // Parse structured text response from Claude
  parseStructuredText(text) {
    const result = {
      summary: '',
      keyPoints: [],
      decisions: [],
      actionItems: [],
      followUps: [],
      nextSteps: '',
      // Backward compatibility
      keyDiscussionPoints: [],
      decisionsMade: [],
      openQuestions: [],
      sentiment: 'neutral',
      confidence: 0.8
    }

    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0)
    let currentSection = null

    for (const line of lines) {
      const lowerLine = line.toLowerCase()

      // Identify sections (check for both old and new naming)
      if (lowerLine.includes('summary')) {
        currentSection = 'summary'
        continue
      } else if (lowerLine.includes('key point') || lowerLine.includes('key discussion') || lowerLine.includes('discussion points')) {
        currentSection = 'keyPoints'
        continue
      } else if (lowerLine.includes('decision')) {
        currentSection = 'decisions'
        continue
      } else if (lowerLine.includes('action item') || lowerLine.includes('action items')) {
        currentSection = 'actionItems'
        continue
      } else if (lowerLine.includes('follow') || lowerLine.includes('open question')) {
        currentSection = 'followUps'
        continue
      } else if (lowerLine.includes('next step')) {
        currentSection = 'nextSteps'
        continue
      }

      // Skip headers and empty lines
      if (line.startsWith('#') || line.startsWith('**') || line.length < 3) {
        continue
      }

      // Add content to appropriate section
      if (currentSection === 'summary') {
        result.summary += (result.summary ? ' ' : '') + line
      } else if (currentSection === 'keyPoints') {
        const cleanLine = line.replace(/^[-•*]\s*/, '').replace(/^\d+\.\s*/, '')
        if (cleanLine.length > 3) {
          result.keyPoints.push(cleanLine)
          result.keyDiscussionPoints.push(cleanLine) // backward compat
        }
      } else if (currentSection === 'decisions') {
        const cleanLine = line.replace(/^[-•*]\s*/, '').replace(/^\d+\.\s*/, '')
        if (cleanLine.length > 3) {
          result.decisions.push(cleanLine)
          result.decisionsMade.push(cleanLine) // backward compat
        }
      } else if (currentSection === 'actionItems') {
        const cleanLine = line.replace(/^[-•*]\s*/, '').replace(/^\d+\.\s*/, '')
        if (cleanLine.length > 3) {
          // Try to extract assignee and deadline from the action item
          const actionItem = {
            task: cleanLine,
            owner: this.extractAssignee(cleanLine) || 'TBD',
            assignee: this.extractAssignee(cleanLine) || 'TBD', // backward compat
            priority: this.determinePriority(cleanLine.toLowerCase()),
            deadline: this.extractDueDate(cleanLine) || 'TBD',
            dueDate: this.extractDueDate(cleanLine) // backward compat
          }
          result.actionItems.push(actionItem)
        }
      } else if (currentSection === 'followUps') {
        const cleanLine = line.replace(/^[-•*]\s*/, '').replace(/^\d+\.\s*/, '')
        if (cleanLine.length > 3) {
          result.followUps.push(cleanLine)
          result.openQuestions.push(cleanLine) // backward compat
        }
      } else if (currentSection === 'nextSteps') {
        result.nextSteps += (result.nextSteps ? ' ' : '') + line.replace(/^[-•*]\s*/, '')
      }
    }

    // Analyze sentiment from summary
    if (result.summary) {
      result.sentiment = this.analyzeSentiment(result.summary)
    }

    console.log('✅ Successfully parsed Claude text response:', result)
    return result
  }

  // Enhanced Claude AI simulation with much better analysis
  enhancedClaudeSimulation(text, meetingContext = {}) {
    console.log('🧠 Running ENHANCED AI simulation with advanced NLP...')
    console.log('📝 Input text:', text)

    const lines = text.split('\n').filter(line => line.trim().length > 0)
    console.log('📄 Processing', lines.length, 'lines')

    const result = {
      summary: '',
      keyPoints: [],
      keyDiscussionPoints: [], // backward compat
      decisions: [],
      decisionsMade: [], // backward compat
      actionItems: [],
      followUps: [],
      openQuestions: [], // backward compat
      nextSteps: '',
      sentiment: 'neutral',
      confidence: 0.75
    }

    // Advanced analysis
    this.enhancedTextAnalysis(lines, result)

    // Generate professional summary
    result.summary = this.generateProfessionalSummary(lines, result)

    // Analyze sentiment
    result.sentiment = this.analyzeSentiment(text)

    // Generate next steps from action items
    if (result.actionItems.length > 0) {
      result.nextSteps = `Complete ${result.actionItems.length} action items. Priority tasks should be addressed first.`
    }

    console.log('✅ Enhanced AI analysis complete:', result)
    return result
  }

  // Advanced text analysis with better categorization
  enhancedTextAnalysis(lines, result) {
    const topics = new Map()
    const decisions = []
    const concerns = []

    lines.forEach((line, index) => {
      const lowerLine = line.toLowerCase()
      console.log(`🔍 Enhanced analysis line ${index + 1}: "${line}"`)

      // Enhanced action item detection
      if (this.isEnhancedActionItem(lowerLine, line)) {
        const actionItem = {
          task: line.trim(),
          owner: this.extractAssignee(line) || 'TBD',
          assignee: this.extractAssignee(line) || 'TBD', // backward compat
          priority: this.determinePriority(lowerLine),
          deadline: this.extractDueDate(line) || 'TBD',
          dueDate: this.extractDueDate(line) || null // backward compat
        }
        result.actionItems.push(actionItem)
        console.log('✅ ENHANCED ACTION ITEM:', actionItem)
      }
      // Decision detection
      else if (this.isDecisionPoint(lowerLine)) {
        const decision = `[DECISION]: ${line.trim()}`
        decisions.push(decision)
        result.decisions.push(decision)
        result.decisionsMade.push(decision) // backward compat
        console.log('🎯 DECISION DETECTED:', line.trim())
      }
      // Concern/challenge detection (treat as follow-ups)
      else if (this.isConcernPoint(lowerLine)) {
        concerns.push(line.trim())
        result.followUps.push(`Follow up on: ${line.trim()}`)
        result.openQuestions.push(`Follow up on: ${line.trim()}`) // backward compat
        console.log('⚠️ CONCERN DETECTED:', line.trim())
      }
      // Topic extraction
      else if (line.trim().length > 10) {
        const topic = this.extractTopicFromLine(line)
        if (topic) {
          topics.set(topic, (topics.get(topic) || 0) + 1)
          result.keyPoints.push(line.trim())
          result.keyDiscussionPoints.push(line.trim()) // backward compat
          console.log('💬 DISCUSSION POINT:', line.trim())
        }
      }
    })

    // Remove duplicates and sort by importance
    result.keyPoints = [...new Set(result.keyPoints)]
      .sort((a, b) => b.length - a.length)
      .slice(0, 10)
    result.keyDiscussionPoints = [...result.keyPoints] // sync backward compat
  }

  // Enhanced action item detection
  isEnhancedActionItem(lowerText, originalText) {
    const strongActionIndicators = [
      'will ', 'should ', 'must ', 'need to ', 'has to ', 'responsible for',
      'assigned to', 'follow up', 'next step', 'action item', 'todo',
      'deliverable', 'deadline', 'by ', 'due ', 'complete', 'finish',
      'send ', 'email ', 'call ', 'contact ', 'schedule ', 'book ',
      'prepare ', 'draft ', 'review ', 'update ', 'create ', 'implement'
    ]

    const actionPatterns = [
      /^\s*[\d•*-]\s+.*(?:will|should|must|need)/i,
      /(?:will|should|must)\s+(?:be\s+)?(?:responsible|assigned|tasked)/i,
      /(?:by|due)\s+(?:monday|tuesday|wednesday|thursday|friday)/i,
      /(?:action|task|todo|deliverable):/i
    ]

    const hasStrongIndicator = strongActionIndicators.some(indicator =>
      lowerText.includes(indicator)
    )

    const hasActionPattern = actionPatterns.some(pattern =>
      pattern.test(originalText)
    )

    const hasPersonAssignment = /\b[A-Z][a-z]+\s+(?:will|should|to)\b/.test(originalText)

    return hasStrongIndicator || hasActionPattern || hasPersonAssignment
  }

  // Detect decision points
  isDecisionPoint(text) {
    const decisionKeywords = [
      'decided', 'agreed', 'approved', 'resolved', 'conclusion',
      'final decision', 'determined', 'move forward', 'go with',
      'selected', 'chosen', 'confirmed'
    ]
    return decisionKeywords.some(keyword => text.includes(keyword))
  }

  // Detect concerns/challenges
  isConcernPoint(text) {
    const concernKeywords = [
      'concern', 'issue', 'problem', 'challenge', 'blocker', 'risk',
      'difficulty', 'obstacle', 'worry', 'hesitation', 'question about'
    ]
    return concernKeywords.some(keyword => text.includes(keyword))
  }

  // Extract main topic from a line
  extractTopicFromLine(line) {
    // Remove common filler words and get key phrases
    const words = line.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3)
      .filter(word => !['this', 'that', 'with', 'they', 'were', 'been', 'have', 'will', 'from', 'about'].includes(word))

    return words.slice(0, 3).join(' ')
  }

  // Extract main topics from text content
  extractMainTopics(text) {
    if (!text || typeof text !== 'string') return ['general discussion']

    // Split into sentences and find important phrases
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10)
    const topics = new Set()

    // Business/meeting keywords that indicate topics
    const topicKeywords = [
      'budget', 'project', 'timeline', 'deadline', 'revenue', 'strategy', 'planning',
      'development', 'marketing', 'sales', 'product', 'team', 'resources', 'goals',
      'objectives', 'performance', 'review', 'analysis', 'implementation', 'launch',
      'quarterly', 'annual', 'meeting', 'discussion', 'decision', 'proposal'
    ]

    sentences.forEach(sentence => {
      const words = sentence.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 3)

      // Find topic keywords and extract context
      words.forEach((word, index) => {
        if (topicKeywords.includes(word)) {
          // Get surrounding context (2 words before and after)
          const start = Math.max(0, index - 2)
          const end = Math.min(words.length, index + 3)
          const topic = words.slice(start, end).join(' ')
          if (topic.length > 5 && topic.length < 50) {
            topics.add(topic)
          }
        }
      })
    })

    // If no specific topics found, extract general phrases
    if (topics.size === 0) {
      const words = text.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 4)
        .filter(word => !['this', 'that', 'with', 'they', 'were', 'been', 'have', 'will', 'from', 'about', 'there', 'where', 'would', 'could', 'should'].includes(word))

      // Group words into meaningful phrases
      for (let i = 0; i < Math.min(words.length - 1, 10); i += 2) {
        const phrase = words.slice(i, i + 2).join(' ')
        if (phrase.length > 6) {
          topics.add(phrase)
        }
      }
    }

    return Array.from(topics).slice(0, 5) // Return top 5 topics
  }

  // Generate professional summary
  generateProfessionalSummary(lines, result) {
    const totalLines = lines.length
    const actionCount = result.actionItems.length
    const discussionCount = result.keyDiscussionPoints.length

    const topics = this.extractMainTopics(lines.join(' '))
    const mainTopic = topics[0] || 'general business'

    const summaryTemplates = [
      `This meeting focused on ${mainTopic} with ${totalLines} key points discussed. The team covered ${discussionCount} main topics and identified ${actionCount} action items for follow-up. The discussion included both strategic planning and operational considerations to move forward effectively.`,

      `The meeting addressed ${mainTopic} through comprehensive discussion of ${discussionCount} key areas. Participants reviewed current status, identified challenges, and established ${actionCount} specific action items with clear ownership. The session concluded with defined next steps and timelines.`,

      `This session centered on ${mainTopic} with detailed analysis of ${discussionCount} critical discussion points. The team made progress on key decisions and outlined ${actionCount} follow-up actions. The meeting effectively balanced strategic thinking with practical implementation planning.`
    ]

    // Select template based on content characteristics
    let selectedTemplate = summaryTemplates[0]
    if (actionCount > 3) selectedTemplate = summaryTemplates[1]
    if (discussionCount > 5) selectedTemplate = summaryTemplates[2]

    return selectedTemplate
  }

  // Simulate Claude AI processing with intelligent text analysis
  simulateClaudeProcessing(text, meetingContext = {}) {
    console.log('🧠 Running intelligent text analysis simulation...')
    console.log('📝 Input text:', text)

    const lines = text.split('\n').filter(line => line.trim().length > 0)
    console.log('📄 Processing', lines.length, 'lines:', lines)

    const result = {
      keyDiscussionPoints: [],
      actionItems: [],
      summary: '',
      sentiment: 'neutral'
    }

    // Generate summary
    result.summary = `AI Analysis: Found ${lines.length} text segments categorized into discussion points and action items.`

    // Intelligent categorization - simplified to 2 categories
    lines.forEach((line, index) => {
      const lowerLine = line.toLowerCase()
      console.log(`\n🔍 Analyzing line ${index + 1}: "${line}"`)

      // Action items detection (enhanced patterns)
      if (this.isActionItem(lowerLine)) {
        const actionItem = {
          task: line.trim(),
          assignee: this.extractAssignee(line) || 'Unassigned',
          priority: this.determinePriority(lowerLine),
          dueDate: this.extractDueDate(line) || null
        }
        result.actionItems.push(actionItem)
        console.log('✅ Categorized as ACTION ITEM:', actionItem)
      }
      // Everything else goes to key discussion points
      else if (line.trim().length > 5) {
        result.keyDiscussionPoints.push(line.trim())
        console.log('💬 Categorized as DISCUSSION POINT:', line.trim())
      } else {
        console.log('⏭️ Skipped (too short):', line.trim())
      }
    })

    console.log('\n📊 Final AI Analysis Results:')
    console.log('- Key Discussion Points:', result.keyDiscussionPoints.length)
    console.log('- Action Items:', result.actionItems.length)

    // Sentiment analysis
    result.sentiment = this.analyzeSentiment(text)

    // Generate insights with error handling
    try {
      result.insights = this.generateInsights(result)
    } catch (error) {
      console.error('Error generating insights:', error)
      result.insights = ['Analysis completed successfully']
    }

    console.log('Intelligent analysis complete:', result)
    return result
  }

  // Helper methods for intelligent text analysis
  isActionItem(text) {
    // Enhanced action keywords for better detection
    const actionKeywords = [
      'todo', 'action', 'task', 'need to', 'should', 'must', 'will', 'follow up',
      'next step', 'next action', 'assign', 'responsible for', 'take care of',
      'complete', 'finish', 'deliver', 'send', 'email', 'call', 'contact',
      'schedule', 'book', 'arrange', 'organize', 'prepare', 'draft', 'review',
      'update', 'create', 'implement', 'fix', 'resolve', 'investigate',
      'research', 'coordinate', 'confirm', 'check', 'verify', 'monitor'
    ]

    // Action patterns (bullets, numbers, dashes)
    const actionPatterns = [/^\s*\d+[\.)]\s/, /^\s*[•*-]\s/, /^\s*\[\s*\]\s/]

    // Verb patterns at start of sentence
    const verbPatterns = [
      /^(will|should|must|need to|have to|going to)\s/,
      /^(send|email|call|contact|schedule|book|arrange)\s/,
      /^(prepare|draft|review|update|create|implement)\s/,
      /^(fix|resolve|investigate|research|coordinate)\s/
    ]

    const hasKeyword = actionKeywords.some(keyword => text.includes(keyword))
    const hasPattern = actionPatterns.some(pattern => pattern.test(text))
    const hasVerb = verbPatterns.some(pattern => pattern.test(text))

    console.log(`Testing action item for "${text.substring(0, 50)}": keyword=${hasKeyword}, pattern=${hasPattern}, verb=${hasVerb}`)
    return hasKeyword || hasPattern || hasVerb
  }

  extractDueDate(text) {
    // Enhanced due date patterns
    const datePatterns = [
      /by\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
      /by\s+(tomorrow|next week|end of week|eow)/i,
      /by\s+(\d{1,2}\/\d{1,2}\/?\d{0,4})/,
      /due\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
      /deadline\s+(\d{1,2}\/\d{1,2}\/?\d{0,4})/,
      /(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+deadline/i
    ]

    for (const pattern of datePatterns) {
      const match = text.match(pattern)
      if (match) {
        console.log(`Found due date "${match[1]}" in "${text.substring(0, 50)}"`)
        return match[1]
      }
    }
    return null
  }

  extractAssignee(text) {
    const assigneePatterns = [
      /by\s+([A-Za-z]+)/i,
      /([A-Za-z]+)\s+will/i,
      /assigned\s+to\s+([A-Za-z]+)/i
    ]

    for (const pattern of assigneePatterns) {
      const match = text.match(pattern)
      if (match) {
        console.log(`Found assignee "${match[1]}" in "${text.substring(0, 50)}"`)
        return match[1]
      }
    }
    return null
  }

  determinePriority(text) {
    if (text.includes('urgent') || text.includes('critical') || text.includes('asap')) return 'high'
    if (text.includes('later') || text.includes('when possible') || text.includes('eventually')) return 'low'
    return 'medium'
  }

  getMainTopics(text) {
    const words = text.toLowerCase().split(/\s+/)
    const commonWords = new Set(['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'must', 'shall', 'a', 'an', 'this', 'that', 'these', 'those'])

    const wordFreq = {}
    words.forEach(word => {
      const cleaned = word.replace(/[^a-z]/g, '')
      if (cleaned.length > 3 && !commonWords.has(cleaned)) {
        wordFreq[cleaned] = (wordFreq[cleaned] || 0) + 1
      }
    })

    return Object.entries(wordFreq)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([word]) => word)
  }

  analyzeSentiment(text) {
    const positiveWords = ['good', 'great', 'excellent', 'positive', 'success', 'achieve', 'progress', 'solution']
    const negativeWords = ['bad', 'problem', 'issue', 'fail', 'difficult', 'challenge', 'concern', 'risk']

    const words = text.toLowerCase().split(/\s+/)
    let positiveCount = 0
    let negativeCount = 0

    words.forEach(word => {
      if (positiveWords.some(pos => word.includes(pos))) positiveCount++
      if (negativeWords.some(neg => word.includes(neg))) negativeCount++
    })

    if (positiveCount > negativeCount) return 'positive'
    if (negativeCount > positiveCount) return 'negative'
    return 'neutral'
  }

  generateInsights(result) {
    const insights = []

    // Defensive checks to prevent undefined errors
    const actionItems = result.actionItems || []
    const keyDiscussionPoints = result.keyDiscussionPoints || []

    console.log('Generating insights for result:', {
      actionItemsLength: actionItems.length,
      keyDiscussionPointsLength: keyDiscussionPoints.length,
      sentiment: result.sentiment
    })

    if (actionItems.length > 3) {
      insights.push('High number of action items - consider prioritization')
    }

    if (keyDiscussionPoints.length > 5) {
      insights.push('Extensive discussion topics - may need follow-up meeting')
    }

    if (result.sentiment === 'negative') {
      insights.push('Meeting tone suggests concerns that may need attention')
    }

    if (actionItems.length === 0) {
      insights.push('No action items identified - consider defining next steps')
    }

    console.log('Generated insights:', insights)
    return insights
  }

  // Legacy Claude API function - no longer needed with GitHub Pages approach
  async callClaudeAPI(text, meetingContext = {}) {
    // This method is deprecated for GitHub Pages deployment
    throw new Error('Direct Claude API calls not supported on GitHub Pages')
  }
}

// Create singleton instance
const ocrService = new SimpleOCRService()

// Main export functions
export const extractTextFromImage = async (imageFile, options = {}) => {
  return await ocrService.extractTextFromImage(imageFile, options.onProgress)
}

export const processWithClaude = async (text, meetingContext) => {
  return await ocrService.processWithClaude(text, meetingContext)
}

export const setOCRApiKey = (key) => {
  ocrService.setOCRApiKey(key)
}

export const setClaudeApiKey = (key) => {
  ocrService.setClaudeApiKey(key)
}

export const getCapabilities = () => {
  return {
    ocrSpace: !!ocrService.apiKey,
    claude: true, // Always enable Claude workflow (API + copy-paste + enhanced local analysis)
    claudeAPI: !!ocrService.claudeApiKey, // Direct API access available
    manual: true
  }
}