import { format, differenceInDays, addDays } from 'date-fns'

// Simulated OCR Text Extraction Service
export class OCRService {
  constructor() {
    this.isProcessing = false
    this.confidence = 0.95 // Simulated confidence level
  }

  async extractTextFromImage(imageFile) {
    this.isProcessing = true
    
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // Simulate OCR results based on image characteristics
    const simulatedTexts = [
      "Meeting Notes - Q4 Planning\n• Increase user engagement by 25%\n• Launch mobile app by December\n• Hire 3 new engineers\n• Budget allocation: $250K",
      "Action Items:\n1. Sarah to review API specs by Friday\n2. Marcus to create user journey map\n3. David to implement authentication\n4. Elena to design onboarding flow",
      "Whiteboard Session Results:\n- User feedback: 4.2/5 rating\n- Performance improvements needed\n- Integration with Slack required\n- Security audit scheduled for next month",
      "Meeting Summary:\nAttendees: 8 people\nDuration: 45 minutes\nKey decisions made:\n• Proceed with mobile development\n• Postpone desktop app\n• Focus on core features first",
      "Project Timeline:\nPhase 1: Research (2 weeks)\nPhase 2: Design (3 weeks)\nPhase 3: Development (8 weeks)\nPhase 4: Testing (2 weeks)\nPhase 5: Launch (1 week)"
    ]
    
    const randomText = simulatedTexts[Math.floor(Math.random() * simulatedTexts.length)]
    
    this.isProcessing = false
    
    return {
      success: true,
      text: randomText,
      confidence: this.confidence,
      language: 'en',
      processingTime: 2000,
      wordCount: randomText.split(' ').length,
      extractedElements: {
        actionItems: this.extractActionItemsFromText(randomText),
        dates: this.extractDatesFromText(randomText),
        people: this.extractPeopleFromText(randomText),
        numbers: this.extractNumbersFromText(randomText)
      }
    }
  }

  extractActionItemsFromText(text) {
    const actionPatterns = [
      /\d+\.\s*(.+?)(?:\n|$)/g,
      /•\s*(.+?)(?:\n|$)/g,
      /-\s*(.+?)(?:\n|$)/g
    ]
    
    const actions = []
    actionPatterns.forEach(pattern => {
      let match
      while ((match = pattern.exec(text)) !== null) {
        actions.push(match[1].trim())
      }
    })
    
    return actions
  }

  extractDatesFromText(text) {
    const datePatterns = [
      /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}\b/gi,
      /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g
    ]
    
    const dates = []
    datePatterns.forEach(pattern => {
      const matches = text.match(pattern)
      if (matches) dates.push(...matches)
    })
    
    return dates
  }

  extractPeopleFromText(text) {
    const peoplePatterns = [
      /\b([A-Z][a-z]+)\s+to\s+/g,
      /\b([A-Z][a-z]+)\s+will\s+/g,
      /\b([A-Z][a-z]+)\s+should\s+/g
    ]
    
    const people = []
    peoplePatterns.forEach(pattern => {
      let match
      while ((match = pattern.exec(text)) !== null) {
        people.push(match[1])
      }
    })
    
    return [...new Set(people)] // Remove duplicates
  }

  extractNumbersFromText(text) {
    const numberPattern = /\$?(\d+(?:,\d{3})*(?:\.\d{2})?)[K%]?/g
    const numbers = []
    let match
    
    while ((match = numberPattern.exec(text)) !== null) {
      numbers.push(match[0])
    }
    
    return numbers
  }
}

// Enhanced Action Item Extraction Service
export class ActionItemExtractor {
  constructor() {
    this.patterns = {
      tasks: [
        /(?:need to|should|must|have to|will)\s+(.+?)(?:\.|$)/gi,
        /(?:action item|todo|task):\s*(.+?)(?:\n|$)/gi,
        /\b(\w+)\s+(?:needs to|should|will|must)\s+(.+?)(?:\.|$)/gi,
        /by\s+(\w+(?:\s+\w+)*?)(?:\s+on\s+|\s+by\s+)(.+?)(?:\.|$)/gi
      ],
      deadlines: [
        /by\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/gi,
        /by\s+(next week|this week|tomorrow|today)/gi,
        /by\s+(\d{1,2}\/\d{1,2}\/?\d{0,4})/gi,
        /deadline:?\s*(.+?)(?:\n|$)/gi
      ],
      assignees: [
        /(\w+(?:\s+\w+)?)\s+(?:will|should|needs to|must)\s+/gi,
        /assign(?:ed)?\s+to\s+(\w+(?:\s+\w+)?)/gi,
        /(\w+(?:\s+\w+)?)\s+is\s+responsible\s+for/gi
      ],
      priorities: [
        /(?:urgent|critical|high priority|asap)/gi,
        /(?:important|medium priority)/gi,
        /(?:low priority|when possible)/gi
      ]
    }
  }

  async extractFromMeetingContent(content) {
    await new Promise(resolve => setTimeout(resolve, 1500)) // Simulate AI processing
    
    const text = typeof content === 'string' ? content : this.combineContentSources(content)
    const actionItems = []
    
    // Extract action items using various patterns
    this.patterns.tasks.forEach(pattern => {
      let match
      pattern.lastIndex = 0 // Reset regex
      while ((match = pattern.exec(text)) !== null) {
        const task = this.cleanTaskText(match[1] || match[2])
        if (task && task.length > 5) {
          actionItems.push({
            id: this.generateId(),
            title: task,
            assignee: this.extractAssignee(match[0], text),
            priority: this.determinePriority(match[0]),
            dueDate: this.extractDueDate(match[0], text),
            source: 'ai-extracted',
            confidence: this.calculateConfidence(match[0]),
            context: match[0].slice(0, 100),
            completed: false,
            createdAt: new Date().toISOString()
          })
        }
      }
    })

    return {
      actionItems: this.deduplicateActionItems(actionItems),
      confidence: this.calculateOverallConfidence(actionItems),
      suggestions: this.generateSuggestions(actionItems),
      processingTime: 1500
    }
  }

  combineContentSources(content) {
    let combined = ''
    if (content.notes) combined += content.notes.map(n => n.content).join(' ')
    if (content.agenda) combined += ' ' + content.agenda.join(' ')
    if (content.description) combined += ' ' + content.description
    if (content.title) combined += ' ' + content.title
    return combined
  }

  cleanTaskText(text) {
    return text
      .replace(/^(and|or|but|also|then)\s+/i, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[.!?]+$/, '')
  }

  extractAssignee(context, fullText) {
    const assigneePatterns = [
      /(\w+(?:\s+\w+)?)\s+(?:will|should|needs to|must)/i,
      /assign(?:ed)?\s+to\s+(\w+(?:\s+\w+)?)/i
    ]
    
    for (const pattern of assigneePatterns) {
      const match = context.match(pattern)
      if (match) return match[1]
    }
    
    // Look for common names in the broader context
    const commonNames = ['sarah', 'marcus', 'elena', 'david', 'amanda']
    for (const name of commonNames) {
      if (context.toLowerCase().includes(name)) {
        return name.charAt(0).toUpperCase() + name.slice(1)
      }
    }
    
    return null
  }

  determinePriority(context) {
    const priorityMap = {
      'urgent|critical|asap|immediately': 'high',
      'important|soon|priority': 'medium',
      'when possible|eventually|low': 'low'
    }
    
    for (const [patterns, priority] of Object.entries(priorityMap)) {
      if (new RegExp(patterns, 'i').test(context)) {
        return priority
      }
    }
    
    return 'medium' // Default priority
  }

  extractDueDate(context, fullText) {
    const datePatterns = [
      { pattern: /by\s+(monday|tuesday|wednesday|thursday|friday)/i, type: 'dayName' },
      { pattern: /by\s+(next week)/i, type: 'relative', days: 7 },
      { pattern: /by\s+(this week)/i, type: 'relative', days: 3 },
      { pattern: /by\s+(tomorrow)/i, type: 'relative', days: 1 },
      { pattern: /by\s+(today)/i, type: 'relative', days: 0 },
      { pattern: /by\s+(\d{1,2}\/\d{1,2})/i, type: 'date' }
    ]
    
    for (const { pattern, type, days } of datePatterns) {
      const match = context.match(pattern)
      if (match) {
        switch (type) {
          case 'relative':
            return addDays(new Date(), days).toISOString()
          case 'dayName':
            return this.getNextWeekday(match[1]).toISOString()
          case 'date':
            try {
              const [month, day] = match[1].split('/')
              const year = new Date().getFullYear()
              return new Date(year, month - 1, day).toISOString()
            } catch {
              return addDays(new Date(), 7).toISOString()
            }
          default:
            return addDays(new Date(), 7).toISOString()
        }
      }
    }
    
    return addDays(new Date(), 7).toISOString() // Default: 1 week from now
  }

  getNextWeekday(dayName) {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    const targetDay = days.indexOf(dayName.toLowerCase())
    const today = new Date()
    const currentDay = today.getDay()
    const daysUntilTarget = (targetDay - currentDay + 7) % 7 || 7
    return addDays(today, daysUntilTarget)
  }

  calculateConfidence(context) {
    let confidence = 0.7 // Base confidence
    
    // Increase confidence for clear indicators
    if (/\b(will|must|need to|should)\b/i.test(context)) confidence += 0.1
    if (/\b(by|deadline|due)\b/i.test(context)) confidence += 0.1
    if (/\b\w+\s+(will|should|needs to)\b/i.test(context)) confidence += 0.1
    
    return Math.min(confidence, 0.95)
  }

  calculateOverallConfidence(actionItems) {
    if (actionItems.length === 0) return 0
    const avgConfidence = actionItems.reduce((sum, item) => sum + item.confidence, 0) / actionItems.length
    return Math.round(avgConfidence * 100) / 100
  }

  deduplicateActionItems(actionItems) {
    const unique = []
    const seen = new Set()
    
    for (const item of actionItems) {
      const key = item.title.toLowerCase().replace(/\s+/g, ' ').trim()
      if (!seen.has(key)) {
        seen.add(key)
        unique.push(item)
      }
    }
    
    return unique
  }

  generateSuggestions(actionItems) {
    const suggestions = []
    
    if (actionItems.length === 0) {
      suggestions.push({
        type: 'info',
        message: 'No action items detected. Consider reviewing meeting notes for potential tasks.'
      })
    }
    
    const unassigned = actionItems.filter(item => !item.assignee)
    if (unassigned.length > 0) {
      suggestions.push({
        type: 'warning',
        message: `${unassigned.length} action items need assignees`,
        action: 'Assign responsibilities'
      })
    }
    
    const noDueDate = actionItems.filter(item => !item.dueDate)
    if (noDueDate.length > 0) {
      suggestions.push({
        type: 'info',
        message: `${noDueDate.length} action items could benefit from due dates`,
        action: 'Set deadlines'
      })
    }
    
    return suggestions
  }

  generateId() {
    return Math.random().toString(36).substr(2, 9)
  }
}

// Enhanced Sentiment Analysis Service
export class SentimentAnalyzer {
  constructor() {
    this.sentimentLexicon = {
      positive: [
        'excellent', 'great', 'good', 'positive', 'successful', 'productive', 'effective',
        'pleased', 'satisfied', 'happy', 'excited', 'optimistic', 'confident', 'agree',
        'progress', 'achievement', 'breakthrough', 'solution', 'improvement', 'win'
      ],
      negative: [
        'concern', 'worried', 'problem', 'issue', 'challenge', 'difficult', 'frustrated',
        'disappointed', 'upset', 'angry', 'disagree', 'conflict', 'delay', 'setback',
        'failure', 'risk', 'threat', 'obstacle', 'blocker', 'urgent', 'critical'
      ],
      neutral: [
        'discuss', 'review', 'consider', 'analyze', 'evaluate', 'assess', 'plan',
        'schedule', 'organize', 'coordinate', 'update', 'status', 'report', 'information'
      ]
    }
    
    this.emotionPatterns = {
      enthusiasm: /(?:excited|thrilled|enthusiastic|passionate|eager)/gi,
      concern: /(?:concerned|worried|anxious|nervous|hesitant)/gi,
      frustration: /(?:frustrated|annoyed|irritated|blocked|stuck)/gi,
      satisfaction: /(?:satisfied|pleased|happy|content|glad)/gi,
      confusion: /(?:confused|unclear|unsure|uncertain|lost)/gi,
      urgency: /(?:urgent|critical|asap|immediately|rush)/gi
    }
  }

  async analyzeMeetingSentiment(meeting) {
    await new Promise(resolve => setTimeout(resolve, 1000)) // Simulate processing
    
    const content = this.extractAnalyzableContent(meeting)
    const sentiment = this.performSentimentAnalysis(content)
    const emotions = this.detectEmotions(content)
    const engagement = this.calculateEngagement(meeting)
    const keyThemes = this.extractKeyThemes(content)
    
    return {
      overall: sentiment.overall,
      score: sentiment.score,
      confidence: sentiment.confidence,
      emotions,
      engagement,
      keyThemes,
      summary: this.generateSentimentSummary(sentiment, emotions, engagement),
      recommendations: this.generateRecommendations(sentiment, emotions, engagement),
      processingTime: 1000
    }
  }

  extractAnalyzableContent(meeting) {
    let content = ''
    
    if (meeting.title) content += meeting.title + ' '
    if (meeting.description) content += meeting.description + ' '
    if (meeting.notes) {
      content += meeting.notes.map(note => note.content).join(' ')
    }
    if (meeting.agenda) {
      content += meeting.agenda.join(' ')
    }
    
    return content.toLowerCase()
  }

  performSentimentAnalysis(content) {
    const words = content.split(/\s+/)
    let positiveScore = 0
    let negativeScore = 0
    let totalWords = 0
    
    words.forEach(word => {
      const cleanWord = word.replace(/[^\w]/g, '')
      if (cleanWord.length < 2) return
      
      totalWords++
      
      if (this.sentimentLexicon.positive.includes(cleanWord)) {
        positiveScore += 1
      } else if (this.sentimentLexicon.negative.includes(cleanWord)) {
        negativeScore += 1
      }
    })
    
    const sentimentScore = (positiveScore - negativeScore) / Math.max(totalWords, 1)
    let overall = 'neutral'
    
    if (sentimentScore > 0.05) overall = 'positive'
    else if (sentimentScore < -0.05) overall = 'negative'
    
    return {
      overall,
      score: sentimentScore,
      confidence: Math.min(0.9, Math.max(0.6, (positiveScore + negativeScore) / totalWords * 5)),
      positiveWords: positiveScore,
      negativeWords: negativeScore,
      totalWords
    }
  }

  detectEmotions(content) {
    const emotions = {}
    
    Object.entries(this.emotionPatterns).forEach(([emotion, pattern]) => {
      const matches = content.match(pattern) || []
      emotions[emotion] = {
        intensity: Math.min(1, matches.length / 10),
        count: matches.length,
        examples: matches.slice(0, 3)
      }
    })
    
    return emotions
  }

  calculateEngagement(meeting) {
    let engagementScore = 0.5 // Base score
    
    // Factor in number of notes
    const noteCount = meeting.notes?.length || 0
    engagementScore += Math.min(0.2, noteCount * 0.02)
    
    // Factor in action items
    const actionItemCount = meeting.actionItems?.length || 0
    engagementScore += Math.min(0.15, actionItemCount * 0.03)
    
    // Factor in meeting duration (assume longer = more engaged)
    const duration = meeting.duration || 30
    if (duration > 60) engagementScore += 0.1
    else if (duration < 15) engagementScore -= 0.1
    
    // Factor in number of attendees
    const attendeeCount = meeting.attendees?.length || 1
    if (attendeeCount > 5) engagementScore += 0.05
    
    return {
      score: Math.max(0, Math.min(1, engagementScore)),
      level: engagementScore > 0.7 ? 'high' : engagementScore > 0.4 ? 'medium' : 'low',
      factors: {
        noteCount,
        actionItemCount,
        duration,
        attendeeCount
      }
    }
  }

  extractKeyThemes(content) {
    const themePatterns = {
      planning: /(?:plan|strategy|roadmap|timeline|schedule|milestone)/gi,
      technical: /(?:api|code|development|implementation|technical|architecture)/gi,
      business: /(?:revenue|profit|business|market|customer|client|sales)/gi,
      team: /(?:team|collaboration|communication|meeting|sync|standup)/gi,
      product: /(?:feature|product|user|experience|design|interface)/gi,
      performance: /(?:performance|metrics|analytics|data|results|kpi)/gi
    }
    
    const themes = {}
    let totalMatches = 0
    
    Object.entries(themePatterns).forEach(([theme, pattern]) => {
      const matches = content.match(pattern) || []
      themes[theme] = matches.length
      totalMatches += matches.length
    })
    
    // Calculate percentages
    Object.keys(themes).forEach(theme => {
      themes[theme] = {
        count: themes[theme],
        percentage: totalMatches > 0 ? Math.round((themes[theme] / totalMatches) * 100) : 0
      }
    })
    
    return themes
  }

  generateSentimentSummary(sentiment, emotions, engagement) {
    const summaryParts = []
    
    // Overall sentiment
    summaryParts.push(`The meeting had a ${sentiment.overall} tone`)
    
    // Dominant emotions
    const dominantEmotion = Object.entries(emotions)
      .filter(([_, data]) => data.intensity > 0.3)
      .sort((a, b) => b[1].intensity - a[1].intensity)[0]
    
    if (dominantEmotion) {
      summaryParts.push(`with notable ${dominantEmotion[0]}`)
    }
    
    // Engagement
    summaryParts.push(`Engagement was ${engagement.level}`)
    
    return summaryParts.join('. ') + '.'
  }

  generateRecommendations(sentiment, emotions, engagement) {
    const recommendations = []
    
    if (sentiment.overall === 'negative') {
      recommendations.push({
        type: 'concern',
        message: 'Address concerns raised in this meeting',
        priority: 'high'
      })
    }
    
    if (emotions.frustration?.intensity > 0.5) {
      recommendations.push({
        type: 'action',
        message: 'Follow up on blockers causing frustration',
        priority: 'high'
      })
    }
    
    if (engagement.score < 0.4) {
      recommendations.push({
        type: 'improvement',
        message: 'Consider shorter, more focused meetings',
        priority: 'medium'
      })
    }
    
    if (emotions.enthusiasm?.intensity > 0.5) {
      recommendations.push({
        type: 'opportunity',
        message: 'Leverage team enthusiasm for upcoming initiatives',
        priority: 'medium'
      })
    }
    
    return recommendations
  }
}

// Relationship Insights Engine
export class RelationshipInsightsEngine {
  constructor() {
    this.insightTypes = {
      communication: 'communication_pattern',
      engagement: 'engagement_trend',
      satisfaction: 'satisfaction_analysis',
      collaboration: 'collaboration_effectiveness',
      influence: 'influence_mapping'
    }
  }

  async generateInsights(stakeholder, meetings, allStakeholders) {
    await new Promise(resolve => setTimeout(resolve, 1200)) // Simulate AI processing
    
    const insights = []
    
    // Communication pattern analysis
    const communicationInsight = this.analyzeCommunicationPatterns(stakeholder, meetings)
    if (communicationInsight) insights.push(communicationInsight)
    
    // Engagement trend analysis
    const engagementInsight = this.analyzeEngagementTrends(stakeholder, meetings)
    if (engagementInsight) insights.push(engagementInsight)
    
    // Satisfaction analysis
    const satisfactionInsight = this.analyzeSatisfactionTrends(stakeholder)
    if (satisfactionInsight) insights.push(satisfactionInsight)
    
    // Collaboration effectiveness
    const collaborationInsight = this.analyzeCollaborationEffectiveness(stakeholder, meetings, allStakeholders)
    if (collaborationInsight) insights.push(collaborationInsight)
    
    // Influence mapping
    const influenceInsight = this.analyzeInfluenceNetwork(stakeholder, allStakeholders)
    if (influenceInsight) insights.push(influenceInsight)
    
    return {
      insights,
      riskScore: this.calculateRelationshipRisk(stakeholder, meetings),
      recommendations: this.generateRelationshipRecommendations(insights, stakeholder),
      nextBestActions: this.suggestNextBestActions(stakeholder, insights),
      processingTime: 1200
    }
  }

  analyzeCommunicationPatterns(stakeholder, meetings) {
    const stakeholderMeetings = meetings.filter(m => 
      m.attendees?.includes(stakeholder.name) || 
      m.stakeholderIds?.includes(stakeholder.id)
    )
    
    if (stakeholderMeetings.length < 2) return null
    
    const avgFrequency = this.calculateAverageFrequency(stakeholderMeetings)
    const recentTrend = this.calculateRecentTrend(stakeholderMeetings)
    
    return {
      type: this.insightTypes.communication,
      title: 'Communication Pattern Analysis',
      severity: recentTrend < 0 ? 'warning' : 'info',
      data: {
        averageFrequency: avgFrequency,
        recentTrend: recentTrend,
        lastContact: stakeholder.lastContactDate,
        preferredMethod: stakeholder.preferredContactMethod
      },
      message: this.generateCommunicationMessage(avgFrequency, recentTrend, stakeholder),
      confidence: 0.85
    }
  }

  analyzeEngagementTrends(stakeholder, meetings) {
    const recentMeetings = meetings
      .filter(m => m.attendees?.includes(stakeholder.name))
      .slice(0, 5)
    
    if (recentMeetings.length < 2) return null
    
    const engagementScores = recentMeetings.map(meeting => {
      let score = 0.5
      
      // Factor in notes (proxy for engagement)
      if (meeting.notes?.length > 0) score += 0.2
      if (meeting.notes?.length > 3) score += 0.1
      
      // Factor in action items created
      if (meeting.actionItems?.length > 0) score += 0.15
      
      // Factor in meeting duration
      if (meeting.duration > 45) score += 0.1
      else if (meeting.duration < 20) score -= 0.1
      
      return Math.max(0, Math.min(1, score))
    })
    
    const trend = this.calculateTrend(engagementScores)
    const avgEngagement = engagementScores.reduce((a, b) => a + b, 0) / engagementScores.length
    
    return {
      type: this.insightTypes.engagement,
      title: 'Engagement Trend Analysis',
      severity: avgEngagement < 0.4 ? 'warning' : trend < -0.1 ? 'caution' : 'info',
      data: {
        averageEngagement: avgEngagement,
        trend: trend,
        recentScores: engagementScores,
        meetingCount: recentMeetings.length
      },
      message: this.generateEngagementMessage(avgEngagement, trend),
      confidence: 0.78
    }
  }

  analyzeSatisfactionTrends(stakeholder) {
    if (!stakeholder.satisfactionScore && !stakeholder.interactions?.length) return null
    
    const currentSatisfaction = stakeholder.satisfactionScore || 7
    const historicalScores = stakeholder.interactions
      ?.filter(i => i.quality)
      ?.map(i => i.quality)
      ?.slice(-5) || [currentSatisfaction]
    
    const trend = this.calculateTrend(historicalScores)
    const avgSatisfaction = historicalScores.reduce((a, b) => a + b, 0) / historicalScores.length
    
    return {
      type: this.insightTypes.satisfaction,
      title: 'Satisfaction Trend Analysis',
      severity: avgSatisfaction < 6 ? 'warning' : trend < -0.5 ? 'caution' : 'info',
      data: {
        currentScore: currentSatisfaction,
        averageScore: avgSatisfaction,
        trend: trend,
        historicalScores: historicalScores
      },
      message: this.generateSatisfactionMessage(currentSatisfaction, trend, avgSatisfaction),
      confidence: 0.82
    }
  }

  analyzeCollaborationEffectiveness(stakeholder, meetings, allStakeholders) {
    const collaborativeMeetings = meetings.filter(m => 
      m.attendees?.includes(stakeholder.name) && m.attendees?.length > 2
    )
    
    if (collaborativeMeetings.length < 2) return null
    
    const collaborators = new Set()
    collaborativeMeetings.forEach(meeting => {
      meeting.attendees?.forEach(attendee => {
        if (attendee !== stakeholder.name) collaborators.add(attendee)
      })
    })
    
    const networkSize = collaborators.size
    const meetingOutcomes = collaborativeMeetings.map(m => ({
      actionItems: m.actionItems?.length || 0,
      notesTaken: m.notes?.length || 0,
      duration: m.duration || 30
    }))
    
    const avgActionItems = meetingOutcomes.reduce((sum, m) => sum + m.actionItems, 0) / meetingOutcomes.length
    const productivity = avgActionItems > 2 ? 'high' : avgActionItems > 1 ? 'medium' : 'low'
    
    return {
      type: this.insightTypes.collaboration,
      title: 'Collaboration Effectiveness',
      severity: productivity === 'low' ? 'caution' : 'info',
      data: {
        networkSize,
        collaborativeMeetings: collaborativeMeetings.length,
        averageActionItems: avgActionItems,
        productivity,
        frequentCollaborators: Array.from(collaborators).slice(0, 5)
      },
      message: this.generateCollaborationMessage(networkSize, productivity, avgActionItems),
      confidence: 0.75
    }
  }

  analyzeInfluenceNetwork(stakeholder, allStakeholders) {
    const influenceFactors = {
      hierarchical: this.getHierarchicalInfluence(stakeholder),
      network: this.getNetworkInfluence(stakeholder, allStakeholders),
      expertise: this.getExpertiseInfluence(stakeholder)
    }
    
    const overallInfluence = Object.values(influenceFactors).reduce((sum, val) => sum + val, 0) / 3
    const influenceLevel = overallInfluence > 0.7 ? 'high' : overallInfluence > 0.4 ? 'medium' : 'low'
    
    return {
      type: this.insightTypes.influence,
      title: 'Influence Network Analysis',
      severity: 'info',
      data: {
        overallInfluence,
        influenceLevel,
        factors: influenceFactors,
        category: stakeholder.category,
        role: stakeholder.role
      },
      message: this.generateInfluenceMessage(influenceLevel, influenceFactors),
      confidence: 0.70
    }
  }

  calculateRelationshipRisk(stakeholder, meetings) {
    let riskScore = 0
    
    // Time since last contact
    const daysSinceContact = stakeholder.lastContactDate 
      ? differenceInDays(new Date(), new Date(stakeholder.lastContactDate))
      : 999
    
    if (daysSinceContact > 30) riskScore += 0.3
    else if (daysSinceContact > 14) riskScore += 0.1
    
    // Satisfaction score
    const satisfaction = stakeholder.satisfactionScore || 7
    if (satisfaction < 6) riskScore += 0.3
    else if (satisfaction < 7) riskScore += 0.1
    
    // Engagement level
    if (stakeholder.relationshipHealth === 'critical') riskScore += 0.4
    else if (stakeholder.relationshipHealth === 'at-risk') riskScore += 0.2
    
    return Math.min(1, riskScore)
  }

  generateRelationshipRecommendations(insights, stakeholder) {
    const recommendations = []
    
    insights.forEach(insight => {
      if (insight.severity === 'warning') {
        recommendations.push({
          priority: 'high',
          action: `Address ${insight.title.toLowerCase()}`,
          reason: insight.message,
          timeline: 'within 1 week'
        })
      } else if (insight.severity === 'caution') {
        recommendations.push({
          priority: 'medium',
          action: `Monitor ${insight.title.toLowerCase()}`,
          reason: insight.message,
          timeline: 'within 2 weeks'
        })
      }
    })
    
    return recommendations
  }

  suggestNextBestActions(stakeholder, insights) {
    const actions = []
    
    // Based on communication patterns
    const commInsight = insights.find(i => i.type === this.insightTypes.communication)
    if (commInsight && commInsight.data.recentTrend < 0) {
      actions.push({
        action: 'Schedule check-in meeting',
        priority: 'high',
        estimated_impact: 'medium',
        effort: 'low'
      })
    }
    
    // Based on satisfaction
    const satInsight = insights.find(i => i.type === this.insightTypes.satisfaction)
    if (satInsight && satInsight.data.currentScore < 7) {
      actions.push({
        action: 'Conduct satisfaction survey',
        priority: 'medium',
        estimated_impact: 'high',
        effort: 'medium'
      })
    }
    
    return actions
  }

  // Helper methods for calculations
  calculateAverageFrequency(meetings) {
    if (meetings.length < 2) return 0
    
    const dates = meetings.map(m => new Date(m.scheduledAt || m.createdAt)).sort()
    const intervals = []
    
    for (let i = 1; i < dates.length; i++) {
      intervals.push(differenceInDays(dates[i], dates[i-1]))
    }
    
    return intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length
  }

  calculateRecentTrend(meetings) {
    if (meetings.length < 3) return 0
    
    const recent = meetings.slice(-3)
    const dates = recent.map(m => new Date(m.scheduledAt || m.createdAt)).sort()
    
    const intervals = []
    for (let i = 1; i < dates.length; i++) {
      intervals.push(differenceInDays(dates[i], dates[i-1]))
    }
    
    // Negative trend means meetings are becoming less frequent
    return intervals.length > 1 ? intervals[0] - intervals[intervals.length - 1] : 0
  }

  calculateTrend(values) {
    if (values.length < 2) return 0
    
    const n = values.length
    const sumX = values.reduce((sum, _, i) => sum + i, 0)
    const sumY = values.reduce((sum, val) => sum + val, 0)
    const sumXY = values.reduce((sum, val, i) => sum + (i * val), 0)
    const sumXX = values.reduce((sum, _, i) => sum + (i * i), 0)
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
    return slope || 0
  }

  getHierarchicalInfluence(stakeholder) {
    const roleInfluence = {
      'vp': 0.9, 'director': 0.8, 'manager': 0.6, 'senior': 0.5, 'lead': 0.5
    }
    
    const role = stakeholder.role?.toLowerCase() || ''
    for (const [key, value] of Object.entries(roleInfluence)) {
      if (role.includes(key)) return value
    }
    
    return 0.3 // Default for individual contributors
  }

  getNetworkInfluence(stakeholder, allStakeholders) {
    // Simulate network influence based on category and interactions
    const categoryInfluence = {
      'executives': 0.9,
      'managers': 0.7,
      'peers': 0.5,
      'reports': 0.3,
      'external': 0.6,
      'clients': 0.8
    }
    
    return categoryInfluence[stakeholder.category] || 0.4
  }

  getExpertiseInfluence(stakeholder) {
    // Simulate expertise influence based on role and department
    const expertiseAreas = ['technical', 'product', 'design', 'business', 'operations']
    const role = stakeholder.role?.toLowerCase() || ''
    
    let expertiseScore = 0.4 // Base score
    
    if (role.includes('senior') || role.includes('lead')) expertiseScore += 0.2
    if (role.includes('architect') || role.includes('specialist')) expertiseScore += 0.3
    
    return Math.min(0.9, expertiseScore)
  }

  // Message generation methods
  generateCommunicationMessage(avgFrequency, recentTrend, stakeholder) {
    if (recentTrend < -5) {
      return `Communication frequency has decreased significantly. Consider scheduling a check-in.`
    } else if (avgFrequency > 14) {
      return `Infrequent communication pattern detected. Regular touchpoints may strengthen this relationship.`
    } else {
      return `Communication pattern is healthy with regular touchpoints every ${Math.round(avgFrequency)} days.`
    }
  }

  generateEngagementMessage(avgEngagement, trend) {
    if (avgEngagement < 0.4) {
      return `Low engagement levels detected. Consider more interactive meeting formats.`
    } else if (trend < -0.1) {
      return `Engagement appears to be declining. Recent meetings may benefit from better preparation.`
    } else {
      return `Engagement levels are healthy with good participation in meetings.`
    }
  }

  generateSatisfactionMessage(current, trend, average) {
    if (current < 6) {
      return `Current satisfaction is below optimal levels. Immediate attention recommended.`
    } else if (trend < -0.5) {
      return `Satisfaction trend is declining. Consider addressing recent concerns.`
    } else {
      return `Satisfaction levels are positive with an average score of ${average.toFixed(1)}/10.`
    }
  }

  generateCollaborationMessage(networkSize, productivity, avgActionItems) {
    if (productivity === 'low') {
      return `Collaborative meetings could be more productive. Current average of ${avgActionItems.toFixed(1)} action items per meeting.`
    } else {
      return `Strong collaboration network with ${networkSize} regular collaborators and ${productivity} productivity.`
    }
  }

  generateInfluenceMessage(level, factors) {
    return `${level.charAt(0).toUpperCase() + level.slice(1)} influence level detected. ` +
           `Strongest in ${Object.entries(factors).sort((a, b) => b[1] - a[1])[0][0]} areas.`
  }
}

// Predictive Notifications System
export class PredictiveNotificationEngine {
  constructor() {
    this.notificationTypes = {
      relationship_risk: 'relationship_risk',
      meeting_prep: 'meeting_preparation',
      follow_up: 'follow_up_reminder',
      opportunity: 'relationship_opportunity',
      pattern_alert: 'pattern_alert'
    }
  }

  async generatePredictiveNotifications(stakeholders, meetings) {
    await new Promise(resolve => setTimeout(resolve, 800)) // Simulate processing
    
    const notifications = []
    
    // Relationship risk notifications
    const riskNotifications = this.generateRiskNotifications(stakeholders)
    notifications.push(...riskNotifications)
    
    // Meeting preparation notifications
    const prepNotifications = this.generateMeetingPrepNotifications(meetings, stakeholders)
    notifications.push(...prepNotifications)
    
    // Follow-up reminders
    const followUpNotifications = this.generateFollowUpNotifications(meetings)
    notifications.push(...followUpNotifications)
    
    // Opportunity notifications
    const opportunityNotifications = this.generateOpportunityNotifications(stakeholders, meetings)
    notifications.push(...opportunityNotifications)
    
    // Pattern alerts
    const patternNotifications = this.generatePatternAlerts(stakeholders, meetings)
    notifications.push(...patternNotifications)
    
    return {
      notifications: notifications.sort((a, b) => b.priority - a.priority),
      riskAlerts: notifications.filter(n => n.type === this.notificationTypes.relationship_risk),
      opportunities: notifications.filter(n => n.type === this.notificationTypes.opportunity),
      processingTime: 800
    }
  }

  generateRiskNotifications(stakeholders) {
    const notifications = []
    const now = new Date()
    
    stakeholders.forEach(stakeholder => {
      const daysSinceContact = stakeholder.lastContactDate 
        ? differenceInDays(now, new Date(stakeholder.lastContactDate))
        : 999
      
      const expectedFreq = stakeholder.expectedFrequency || 14
      
      if (daysSinceContact > expectedFreq * 1.5) {
        notifications.push({
          id: `risk_${stakeholder.id}`,
          type: this.notificationTypes.relationship_risk,
          priority: stakeholder.priority === 'critical' ? 9 : 7,
          severity: 'high',
          stakeholder: stakeholder.name,
          title: 'Relationship At Risk',
          message: `${stakeholder.name} hasn't been contacted in ${daysSinceContact} days (expected: every ${expectedFreq} days)`,
          actions: [
            { label: 'Schedule Meeting', action: 'schedule_meeting', stakeholderId: stakeholder.id },
            { label: 'Send Message', action: 'send_message', stakeholderId: stakeholder.id }
          ],
          predictedImpact: 'relationship_degradation',
          confidence: 0.85,
          createdAt: now.toISOString()
        })
      }
      
      if (stakeholder.satisfactionScore && stakeholder.satisfactionScore < 6) {
        notifications.push({
          id: `satisfaction_${stakeholder.id}`,
          type: this.notificationTypes.relationship_risk,
          priority: 8,
          severity: 'medium',
          stakeholder: stakeholder.name,
          title: 'Low Satisfaction Alert',
          message: `${stakeholder.name} satisfaction score is ${stakeholder.satisfactionScore}/10`,
          actions: [
            { label: 'Address Concerns', action: 'satisfaction_survey', stakeholderId: stakeholder.id },
            { label: 'Schedule 1:1', action: 'schedule_meeting', stakeholderId: stakeholder.id }
          ],
          predictedImpact: 'satisfaction_decline',
          confidence: 0.78,
          createdAt: now.toISOString()
        })
      }
    })
    
    return notifications
  }

  generateMeetingPrepNotifications(meetings, stakeholders) {
    const notifications = []
    const now = new Date()
    
    const upcomingMeetings = meetings.filter(meeting => {
      const meetingDate = new Date(meeting.scheduledAt || meeting.createdAt)
      const hoursUntil = (meetingDate - now) / (1000 * 60 * 60)
      return hoursUntil > 0 && hoursUntil <= 24
    })
    
    upcomingMeetings.forEach(meeting => {
      const meetingDate = new Date(meeting.scheduledAt)
      const hoursUntil = Math.round((meetingDate - now) / (1000 * 60 * 60))
      
      // Check if preparation might be needed
      const needsPrep = !meeting.agenda || meeting.agenda.length === 0 || 
                       !meeting.notes || meeting.notes.length === 0
      
      if (needsPrep && hoursUntil <= 4) {
        notifications.push({
          id: `prep_${meeting.id}`,
          type: this.notificationTypes.meeting_prep,
          priority: 6,
          severity: 'medium',
          meeting: meeting.title || 'Untitled Meeting',
          title: 'Meeting Preparation Reminder',
          message: `Meeting "${meeting.title}" in ${hoursUntil} hours may need preparation`,
          actions: [
            { label: 'Add Agenda', action: 'edit_agenda', meetingId: meeting.id },
            { label: 'Review Notes', action: 'review_notes', meetingId: meeting.id },
            { label: 'Research Attendees', action: 'research_attendees', meetingId: meeting.id }
          ],
          predictedImpact: 'meeting_effectiveness',
          confidence: 0.72,
          createdAt: now.toISOString()
        })
      }
    })
    
    return notifications
  }

  generateFollowUpNotifications(meetings) {
    const notifications = []
    const now = new Date()
    
    const recentMeetings = meetings.filter(meeting => {
      const meetingDate = new Date(meeting.scheduledAt || meeting.createdAt)
      const daysSince = differenceInDays(now, meetingDate)
      return daysSince >= 1 && daysSince <= 3 && meeting.status === 'completed'
    })
    
    recentMeetings.forEach(meeting => {
      const daysSince = differenceInDays(now, new Date(meeting.scheduledAt || meeting.createdAt))
      const hasActionItems = meeting.actionItems && meeting.actionItems.length > 0
      const hasFollowUp = meeting.notes?.some(note => 
        note.content.toLowerCase().includes('follow up') || 
        note.content.toLowerCase().includes('next steps')
      )
      
      if (hasActionItems && !hasFollowUp && daysSince >= 2) {
        notifications.push({
          id: `followup_${meeting.id}`,
          type: this.notificationTypes.follow_up,
          priority: 5,
          severity: 'low',
          meeting: meeting.title || 'Recent Meeting',
          title: 'Follow-up Reminder',
          message: `Meeting "${meeting.title}" from ${daysSince} days ago has ${meeting.actionItems.length} action items that may need follow-up`,
          actions: [
            { label: 'Check Progress', action: 'check_progress', meetingId: meeting.id },
            { label: 'Send Reminder', action: 'send_reminder', meetingId: meeting.id },
            { label: 'Schedule Review', action: 'schedule_review', meetingId: meeting.id }
          ],
          predictedImpact: 'action_item_completion',
          confidence: 0.68,
          createdAt: now.toISOString()
        })
      }
    })
    
    return notifications
  }

  generateOpportunityNotifications(stakeholders, meetings) {
    const notifications = []
    const now = new Date()
    
    stakeholders.forEach(stakeholder => {
      // Look for positive engagement opportunities
      if (stakeholder.relationshipHealth === 'excellent' && stakeholder.influenceLevel === 'high') {
        const recentPositiveMeetings = meetings
          .filter(m => m.attendees?.includes(stakeholder.name))
          .filter(m => {
            const daysSince = differenceInDays(now, new Date(m.scheduledAt || m.createdAt))
            return daysSince <= 7
          })
        
        if (recentPositiveMeetings.length > 0) {
          notifications.push({
            id: `opportunity_${stakeholder.id}`,
            type: this.notificationTypes.opportunity,
            priority: 4,
            severity: 'low',
            stakeholder: stakeholder.name,
            title: 'Relationship Opportunity',
            message: `${stakeholder.name} is highly engaged and influential - consider leveraging for strategic initiatives`,
            actions: [
              { label: 'Propose Collaboration', action: 'propose_collaboration', stakeholderId: stakeholder.id },
              { label: 'Request Introduction', action: 'request_intro', stakeholderId: stakeholder.id },
              { label: 'Discuss Opportunities', action: 'schedule_strategy', stakeholderId: stakeholder.id }
            ],
            predictedImpact: 'strategic_advancement',
            confidence: 0.71,
            createdAt: now.toISOString()
          })
        }
      }
      
      // Look for re-engagement opportunities
      if (stakeholder.relationshipHealth === 'dormant') {
        const daysSinceContact = stakeholder.lastContactDate 
          ? differenceInDays(now, new Date(stakeholder.lastContactDate))
          : 999
        
        if (daysSinceContact > 60 && stakeholder.priority !== 'archived') {
          notifications.push({
            id: `reengagement_${stakeholder.id}`,
            type: this.notificationTypes.opportunity,
            priority: 3,
            severity: 'low',
            stakeholder: stakeholder.name,
            title: 'Re-engagement Opportunity',
            message: `${stakeholder.name} has been dormant for ${daysSinceContact} days - consider reaching out`,
            actions: [
              { label: 'Send Check-in', action: 'send_checkin', stakeholderId: stakeholder.id },
              { label: 'Share Update', action: 'share_update', stakeholderId: stakeholder.id },
              { label: 'Archive Contact', action: 'archive_contact', stakeholderId: stakeholder.id }
            ],
            predictedImpact: 'relationship_revival',
            confidence: 0.59,
            createdAt: now.toISOString()
          })
        }
      }
    })
    
    return notifications
  }

  generatePatternAlerts(stakeholders, meetings) {
    const notifications = []
    const now = new Date()
    
    // Detect unusual patterns in meeting frequency
    const weeklyMeetingCounts = this.getWeeklyMeetingCounts(meetings)
    const avgWeeklyMeetings = weeklyMeetingCounts.reduce((a, b) => a + b, 0) / weeklyMeetingCounts.length
    const thisWeekCount = weeklyMeetingCounts[weeklyMeetingCounts.length - 1] || 0
    
    if (thisWeekCount > avgWeeklyMeetings * 1.5 && avgWeeklyMeetings > 5) {
      notifications.push({
        id: 'pattern_high_meeting_volume',
        type: this.notificationTypes.pattern_alert,
        priority: 4,
        severity: 'medium',
        title: 'High Meeting Volume Detected',
        message: `This week has ${thisWeekCount} meetings vs. average of ${Math.round(avgWeeklyMeetings)}. Consider consolidating.`,
        actions: [
          { label: 'Review Schedule', action: 'review_schedule' },
          { label: 'Suggest Consolidation', action: 'suggest_consolidation' },
          { label: 'Block Focus Time', action: 'block_focus_time' }
        ],
        predictedImpact: 'productivity_optimization',
        confidence: 0.82,
        createdAt: now.toISOString()
      })
    }
    
    // Detect stakeholders becoming less responsive
    const lesserEngagedStakeholders = stakeholders.filter(s => {
      const interactions = s.interactions || []
      if (interactions.length < 3) return false
      
      const recentQuality = interactions.slice(-2).reduce((sum, i) => sum + (i.quality || 5), 0) / 2
      const olderQuality = interactions.slice(-5, -2).reduce((sum, i) => sum + (i.quality || 5), 0) / 3
      
      return recentQuality < olderQuality - 1
    })
    
    if (lesserEngagedStakeholders.length > 0) {
      notifications.push({
        id: 'pattern_engagement_decline',
        type: this.notificationTypes.pattern_alert,
        priority: 5,
        severity: 'medium',
        title: 'Engagement Decline Pattern',
        message: `${lesserEngagedStakeholders.length} stakeholders showing decreased engagement patterns`,
        actions: [
          { label: 'Review Engagement', action: 'review_engagement' },
          { label: 'Schedule Check-ins', action: 'schedule_checkins' },
          { label: 'Analyze Patterns', action: 'analyze_patterns' }
        ],
        predictedImpact: 'relationship_maintenance',
        confidence: 0.75,
        createdAt: now.toISOString()
      })
    }
    
    return notifications
  }

  getWeeklyMeetingCounts(meetings) {
    const weeks = []
    const now = new Date()
    
    // Get last 8 weeks of meeting counts
    for (let i = 7; i >= 0; i--) {
      const weekStart = addDays(now, -7 * i)
      const weekEnd = addDays(weekStart, 6)
      
      const weekMeetings = meetings.filter(meeting => {
        const meetingDate = new Date(meeting.scheduledAt || meeting.createdAt)
        return meetingDate >= weekStart && meetingDate <= weekEnd
      })
      
      weeks.push(weekMeetings.length)
    }
    
    return weeks
  }
}

// Main AI Service Coordinator
export class AIServiceCoordinator {
  constructor() {
    this.ocrService = new OCRService()
    this.actionItemExtractor = new ActionItemExtractor()
    this.sentimentAnalyzer = new SentimentAnalyzer()
    this.relationshipEngine = new RelationshipInsightsEngine()
    this.notificationEngine = new PredictiveNotificationEngine()
    
    this.isProcessing = false
    this.processingQueue = []
  }

  async processImageWithAI(imageFile, options = {}) {
    const startTime = Date.now()
    
    try {
      // Extract text from image
      const ocrResult = await this.ocrService.extractTextFromImage(imageFile)
      
      if (!ocrResult.success) {
        throw new Error('OCR processing failed')
      }
      
      let result = {
        ocr: ocrResult,
        processingTime: Date.now() - startTime
      }
      
      // Optionally extract action items from OCR text
      if (options.extractActionItems) {
        const actionItems = await this.actionItemExtractor.extractFromMeetingContent(ocrResult.text)
        result.actionItems = actionItems
      }
      
      // Optionally analyze sentiment
      if (options.analyzeSentiment) {
        const sentiment = await this.sentimentAnalyzer.performSentimentAnalysis(ocrResult.text)
        result.sentiment = sentiment
      }
      
      return result
      
    } catch (error) {
      return {
        success: false,
        error: error.message,
        processingTime: Date.now() - startTime
      }
    }
  }

  async processFullMeetingAI(meeting, stakeholders = []) {
    const startTime = Date.now()
    
    try {
      const results = await Promise.all([
        this.actionItemExtractor.extractFromMeetingContent(meeting),
        this.sentimentAnalyzer.analyzeMeetingSentiment(meeting),
        stakeholders.length > 0 ? 
          this.notificationEngine.generatePredictiveNotifications(stakeholders, [meeting]) : 
          Promise.resolve({ notifications: [] })
      ])
      
      return {
        actionItems: results[0],
        sentiment: results[1],
        notifications: results[2],
        processingTime: Date.now() - startTime,
        success: true
      }
      
    } catch (error) {
      return {
        success: false,
        error: error.message,
        processingTime: Date.now() - startTime
      }
    }
  }

  async generateStakeholderInsights(stakeholder, meetings, allStakeholders) {
    return await this.relationshipEngine.generateInsights(stakeholder, meetings, allStakeholders)
  }

  async generatePredictiveNotifications(stakeholders, meetings) {
    return await this.notificationEngine.generatePredictiveNotifications(stakeholders, meetings)
  }

  getServiceStatus() {
    return {
      ocrService: { status: 'ready', confidence: this.ocrService.confidence },
      actionItemExtractor: { status: 'ready' },
      sentimentAnalyzer: { status: 'ready' },
      relationshipEngine: { status: 'ready' },
      notificationEngine: { status: 'ready' },
      isProcessing: this.isProcessing,
      queueLength: this.processingQueue.length
    }
  }
}

// Export singleton instance
export const aiCoordinator = new AIServiceCoordinator()