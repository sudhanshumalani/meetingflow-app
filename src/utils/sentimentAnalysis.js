// AI-powered sentiment analysis and meeting insights

export class SentimentAnalyzer {
  constructor() {
    this.positiveWords = [
      'excellent', 'great', 'good', 'positive', 'successful', 'achieved', 'completed',
      'progress', 'improved', 'effective', 'productive', 'satisfied', 'happy',
      'breakthrough', 'milestone', 'accomplished', 'outstanding', 'exceptional'
    ]
    
    this.negativeWords = [
      'delayed', 'blocked', 'issue', 'problem', 'concern', 'risk', 'challenge',
      'difficult', 'stuck', 'failed', 'behind', 'overdue', 'urgent', 'critical',
      'bottleneck', 'obstacle', 'setback', 'disappointed', 'frustrated'
    ]
    
    this.neutralWords = [
      'discussed', 'reviewed', 'planned', 'scheduled', 'updated', 'noted',
      'presented', 'analyzed', 'considered', 'evaluated', 'assessed'
    ]
  }

  analyzeMeetingSentiment(meetingData) {
    const text = this.extractMeetingText(meetingData)
    const words = text.toLowerCase().split(/\s+/)
    
    let positiveScore = 0
    let negativeScore = 0
    let neutralScore = 0
    
    const foundSentiments = {
      positive: [],
      negative: [],
      neutral: []
    }

    words.forEach(word => {
      const cleanWord = word.replace(/[^\w]/g, '')
      
      if (this.positiveWords.includes(cleanWord)) {
        positiveScore++
        foundSentiments.positive.push(cleanWord)
      } else if (this.negativeWords.includes(cleanWord)) {
        negativeScore++
        foundSentiments.negative.push(cleanWord)
      } else if (this.neutralWords.includes(cleanWord)) {
        neutralScore++
        foundSentiments.neutral.push(cleanWord)
      }
    })

    const totalScore = positiveScore + negativeScore + neutralScore
    const sentiment = this.calculateOverallSentiment(positiveScore, negativeScore, totalScore)
    
    return {
      overall: sentiment,
      scores: {
        positive: positiveScore,
        negative: negativeScore,
        neutral: neutralScore,
        total: totalScore
      },
      percentages: {
        positive: totalScore > 0 ? Math.round((positiveScore / totalScore) * 100) : 0,
        negative: totalScore > 0 ? Math.round((negativeScore / totalScore) * 100) : 0,
        neutral: totalScore > 0 ? Math.round((neutralScore / totalScore) * 100) : 0
      },
      foundWords: foundSentiments,
      confidence: this.calculateConfidence(totalScore, words.length)
    }
  }

  calculateOverallSentiment(positive, negative, total) {
    if (total === 0) return 'neutral'
    
    const ratio = (positive - negative) / total
    
    if (ratio > 0.2) return 'positive'
    if (ratio < -0.2) return 'negative'
    return 'neutral'
  }

  calculateConfidence(sentimentWords, totalWords) {
    if (totalWords === 0) return 0
    const ratio = sentimentWords / totalWords
    return Math.min(100, Math.round(ratio * 500)) // Scale confidence
  }

  extractMeetingText(meeting) {
    const textSources = [
      meeting.title || '',
      meeting.description || '',
      meeting.digitalNotes ? Object.values(meeting.digitalNotes).join(' ') : '',
      meeting.notes ? meeting.notes.map(n => n.content).join(' ') : '',
      meeting.ocrResult ? meeting.ocrResult.text : ''
    ]
    
    return textSources.join(' ')
  }

  generateAISummary(meeting) {
    const sentiment = this.analyzeMeetingSentiment(meeting)
    const keyPoints = this.extractKeyPoints(meeting)
    const actionItems = this.extractActionItems(meeting)
    
    return {
      sentiment,
      keyPoints,
      actionItems,
      summary: this.generateTextSummary(meeting, sentiment, keyPoints),
      recommendations: this.generateRecommendations(sentiment, actionItems)
    }
  }

  extractKeyPoints(meeting) {
    const text = this.extractMeetingText(meeting)
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20)
    
    // Simple keyword-based extraction
    const importantKeywords = [
      'decision', 'agreed', 'approved', 'rejected', 'priority', 'deadline',
      'budget', 'timeline', 'milestone', 'launch', 'release', 'target'
    ]
    
    const keyPoints = sentences
      .filter(sentence => 
        importantKeywords.some(keyword => 
          sentence.toLowerCase().includes(keyword)
        )
      )
      .slice(0, 5)
      .map(point => point.trim())
      .filter(point => point.length > 0)
    
    return keyPoints
  }

  extractActionItems(meeting) {
    const actionItems = []
    
    // From digital notes
    if (meeting.digitalNotes) {
      const actionText = meeting.digitalNotes.bottomRight || ''
      const items = actionText.split('\n').filter(item => item.trim().length > 0)
      actionItems.push(...items.map(item => ({ text: item.trim(), source: 'digital_notes' })))
    }
    
    // From OCR results
    if (meeting.ocrResults && meeting.ocrResults.actionItems) {
      actionItems.push(...meeting.ocrResults.actionItems.map(item => ({ 
        ...item, 
        source: 'ocr' 
      })))
    }
    
    return actionItems.slice(0, 8) // Limit to 8 items
  }

  generateTextSummary(meeting, sentiment, keyPoints) {
    const templates = {
      positive: [
        "This was a productive meeting with positive outcomes.",
        "The team made significant progress and achieved key milestones.",
        "Strong collaboration and clear decision-making characterized this session."
      ],
      negative: [
        "The meeting highlighted several challenges that need immediate attention.",
        "Key blockers and concerns were identified that require follow-up.",
        "This session focused on addressing critical issues and roadblocks."
      ],
      neutral: [
        "The meeting covered standard agenda items with routine updates.",
        "This was a regular check-in session with informational updates.",
        "The team reviewed current status and planned next steps."
      ]
    }
    
    const baseTemplate = templates[sentiment.overall][
      Math.floor(Math.random() * templates[sentiment.overall].length)
    ]
    
    let summary = baseTemplate
    
    if (keyPoints.length > 0) {
      summary += ` Key discussion points included ${keyPoints.slice(0, 2).join(' and ')}.`
    }
    
    const stakeholderCount = meeting.attendees?.length || 0
    if (stakeholderCount > 0) {
      summary += ` The session involved ${stakeholderCount} participant${stakeholderCount > 1 ? 's' : ''}.`
    }
    
    return summary
  }

  generateRecommendations(sentiment, actionItems) {
    const recommendations = []
    
    if (sentiment.overall === 'negative') {
      recommendations.push({
        type: 'priority',
        text: 'Schedule a follow-up meeting to address concerns raised',
        priority: 'high'
      })
      recommendations.push({
        type: 'action',
        text: 'Review and mitigate identified risks and blockers',
        priority: 'high'
      })
    }
    
    if (actionItems.length > 5) {
      recommendations.push({
        type: 'organization',
        text: 'Consider breaking down action items into smaller, manageable tasks',
        priority: 'medium'
      })
    }
    
    if (sentiment.overall === 'positive') {
      recommendations.push({
        type: 'momentum',
        text: 'Leverage current positive momentum for upcoming initiatives',
        priority: 'medium'
      })
    }
    
    if (actionItems.filter(item => !item.assignee || item.assignee === 'Unassigned').length > 0) {
      recommendations.push({
        type: 'assignment',
        text: 'Ensure all action items have clear ownership and deadlines',
        priority: 'high'
      })
    }
    
    return recommendations
  }

  getSentimentColor(sentiment) {
    const colors = {
      positive: 'text-green-600 bg-green-100',
      negative: 'text-red-600 bg-red-100',
      neutral: 'text-gray-600 bg-gray-100'
    }
    return colors[sentiment] || colors.neutral
  }

  getSentimentIcon(sentiment) {
    const icons = {
      positive: '😊',
      negative: '😟',
      neutral: '😐'
    }
    return icons[sentiment] || icons.neutral
  }
}