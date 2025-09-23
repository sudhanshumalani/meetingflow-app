// Advanced global search functionality

export class GlobalSearchEngine {
  constructor(meetings, stakeholders) {
    this.meetings = meetings || []
    this.stakeholders = stakeholders || []
    this.searchIndex = this.buildSearchIndex()
  }

  buildSearchIndex() {
    const index = {
      meetings: {},
      stakeholders: {},
      notes: {},
      actionItems: {}
    }

    // Index meetings
    this.meetings.forEach(meeting => {
      const searchableText = [
        meeting.title,
        meeting.description,
        meeting.digitalNotes ? Object.values(meeting.digitalNotes).join(' ') : '',
        meeting.attendees ? meeting.attendees.join(' ') : '',
        meeting.notes ? meeting.notes.map(n => n.content).join(' ') : ''
      ].join(' ').toLowerCase()

      index.meetings[meeting.id] = {
        ...meeting,
        searchableText,
        type: 'meeting'
      }
    })

    // Index stakeholders
    this.stakeholders.forEach(stakeholder => {
      const searchableText = [
        stakeholder.name,
        stakeholder.role,
        stakeholder.category,
        stakeholder.email
      ].join(' ').toLowerCase()

      index.stakeholders[stakeholder.id] = {
        ...stakeholder,
        searchableText,
        type: 'stakeholder'
      }
    })

    return index
  }

  search(query, options = {}) {
    const {
      type = 'all', // 'all', 'meetings', 'stakeholders', 'notes'
      limit = 50,
      includeHighlights = true,
      fuzzyMatch = true
    } = options

    if (!query || query.length < 2) return []

    const searchTerms = query.toLowerCase().split(' ').filter(term => term.length > 0)
    const results = []

    // Search function
    const searchInObject = (obj, objType) => {
      const text = obj.searchableText
      let score = 0
      const highlights = []

      searchTerms.forEach(term => {
        if (text.includes(term)) {
          // Exact match gets higher score
          score += 10
          if (includeHighlights) {
            const regex = new RegExp(`(${term})`, 'gi')
            const matches = [...text.matchAll(regex)]
            highlights.push(...matches.map(match => ({
              term,
              position: match.index,
              length: match[0].length
            })))
          }
        } else if (fuzzyMatch) {
          // Fuzzy match for partial words
          const fuzzyRegex = new RegExp(term.split('').join('.*'), 'i')
          if (fuzzyRegex.test(text)) {
            score += 3
          }
        }
      })

      // Boost score for title matches
      if (obj.title && searchTerms.some(term => obj.title.toLowerCase().includes(term))) {
        score += 15
      }

      // Boost score for exact name matches (stakeholders)
      if (obj.name && searchTerms.some(term => obj.name.toLowerCase().includes(term))) {
        score += 20
      }

      if (score > 0) {
        results.push({
          ...obj,
          score,
          highlights,
          matchType: objType
        })
      }
    }

    // Search in different categories
    if (type === 'all' || type === 'meetings') {
      Object.values(this.searchIndex.meetings).forEach(meeting => 
        searchInObject(meeting, 'meeting')
      )
    }

    if (type === 'all' || type === 'stakeholders') {
      Object.values(this.searchIndex.stakeholders).forEach(stakeholder => 
        searchInObject(stakeholder, 'stakeholder')
      )
    }

    // Sort by relevance score and return
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(result => ({
        ...result,
        relevancePercentage: Math.min(100, Math.round((result.score / 30) * 100))
      }))
  }

  getRecentSearches() {
    // Simulate recent searches from localStorage
    return [
      'budget planning',
      'Sarah Chen',
      'action items',
      'Q4 review',
      'engineering blockers'
    ]
  }

  getSuggestedSearches(meetings, stakeholders) {
    const suggestions = []
    
    // Popular stakeholder names
    const topStakeholders = stakeholders
      .slice(0, 3)
      .map(s => s.name)
    
    // Recent meeting topics
    const recentTopics = meetings
      .slice(0, 5)
      .map(m => m.title)
      .filter(title => title && title.length > 0)
    
    // Common terms
    const commonTerms = [
      'action items',
      'overdue tasks',
      'high priority',
      'this week',
      'blockers'
    ]

    return [
      ...topStakeholders,
      ...recentTopics.slice(0, 3),
      ...commonTerms.slice(0, 3)
    ].slice(0, 8)
  }
}

export const highlightSearchTerms = (text, searchTerms, className = 'bg-yellow-200') => {
  if (!text || typeof text !== 'string' || !searchTerms || searchTerms.length === 0) return text

  let highlightedText = text
  searchTerms.forEach(term => {
    const regex = new RegExp(`(${term})`, 'gi')
    highlightedText = highlightedText.replace(
      regex, 
      `<span class="${className}">$1</span>`
    )
  })
  
  return highlightedText
}