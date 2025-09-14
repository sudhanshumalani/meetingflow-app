import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  Search, 
  X, 
  Calendar, 
  Users, 
  FileText, 
  Clock, 
  TrendingUp,
  Filter,
  ArrowRight,
  Sparkles
} from 'lucide-react'
import { GlobalSearchEngine } from '../utils/searchEngine'
import { format } from 'date-fns'

export default function GlobalSearch({ 
  meetings = [], 
  stakeholders = [], 
  isOpen, 
  onClose 
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchType, setSearchType] = useState('all')
  const [recentSearches, setRecentSearches] = useState([])
  const [suggestedSearches, setSuggestedSearches] = useState([])
  const [selectedIndex, setSelectedIndex] = useState(-1)
  
  const searchRef = useRef(null)
  const resultsRef = useRef(null)
  const navigate = useNavigate()
  
  const searchEngine = new GlobalSearchEngine(meetings, stakeholders)

  useEffect(() => {
    if (isOpen && searchRef.current) {
      searchRef.current.focus()
    }
  }, [isOpen])

  useEffect(() => {
    // Load recent searches and suggestions
    setRecentSearches(searchEngine.getRecentSearches())
    setSuggestedSearches(searchEngine.getSuggestedSearches(meetings, stakeholders))
  }, [meetings, stakeholders])

  useEffect(() => {
    if (query.length >= 2) {
      setIsSearching(true)
      
      // Debounce search
      const timeoutId = setTimeout(() => {
        const searchResults = searchEngine.search(query, {
          type: searchType,
          limit: 20,
          includeHighlights: true
        })
        setResults(searchResults)
        setIsSearching(false)
        setSelectedIndex(-1)
      }, 300)

      return () => clearTimeout(timeoutId)
    } else {
      setResults([])
      setIsSearching(false)
    }
  }, [query, searchType])

  const handleSearch = (searchQuery) => {
    setQuery(searchQuery)
    // Add to recent searches
    const newRecentSearches = [searchQuery, ...recentSearches.filter(s => s !== searchQuery)].slice(0, 5)
    setRecentSearches(newRecentSearches)
  }

  const handleResultClick = (result) => {
    if (result.type === 'meeting') {
      navigate(`/meeting/${result.id}`)
    } else if (result.type === 'stakeholder') {
      // Navigate to home with stakeholder filter
      navigate(`/?stakeholder=${result.id}`)
    }
    onClose()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => Math.max(prev - 1, -1))
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault()
      handleResultClick(results[selectedIndex])
    }
  }

  const getResultIcon = (type) => {
    switch (type) {
      case 'meeting':
        return <Calendar size={16} className="text-blue-600" />
      case 'stakeholder':
        return <Users size={16} className="text-purple-600" />
      default:
        return <FileText size={16} className="text-gray-600" />
    }
  }

  const highlightText = (text, query) => {
    if (!query) return text
    const parts = text.split(new RegExp(`(${query})`, 'gi'))
    return parts.map((part, index) => 
      part.toLowerCase() === query.toLowerCase() ? 
        <span key={index} className="bg-yellow-200 font-medium">{part}</span> : 
        part
    )
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-start justify-center pt-4 sm:pt-20 px-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl">
        {/* Search Header */}
        <div className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4 border-b border-gray-200">
          <Search className="text-gray-400 w-[18px] h-[18px] sm:w-5 sm:h-5" />
          <input
            ref={searchRef}
            type="text"
            placeholder="Search meetings, stakeholders, notes..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 text-base sm:text-lg outline-none"
          />
          
          {/* Search Type Filter */}
          <select
            value={searchType}
            onChange={(e) => setSearchType(e.target.value)}
            className="px-2 sm:px-3 py-1 border border-gray-300 rounded text-xs sm:text-sm focus:border-blue-500"
          >
            <option value="all">All</option>
            <option value="meetings">Meetings</option>
            <option value="stakeholders">Stakeholders</option>
          </select>
          
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Search Results */}
        <div className="max-h-64 sm:max-h-96 overflow-y-auto" ref={resultsRef}>
          {isSearching && (
            <div className="p-4 text-center">
              <div className="inline-flex items-center gap-2 text-gray-600">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent"></div>
                Searching...
              </div>
            </div>
          )}

          {query.length >= 2 && !isSearching && results.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              <Search size={48} className="mx-auto mb-4 text-gray-300" />
              <p>No results found for "{query}"</p>
              <p className="text-sm mt-2">Try adjusting your search terms or search type</p>
            </div>
          )}

          {results.length > 0 && (
            <div className="p-2">
              <div className="text-xs text-gray-500 px-3 py-2">
                {results.length} result{results.length !== 1 ? 's' : ''} found
              </div>
              {results.map((result, index) => (
                <div
                  key={`${result.type}-${result.id}`}
                  onClick={() => handleResultClick(result)}
                  className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                    index === selectedIndex ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'
                  }`}
                >
                  {getResultIcon(result.type)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-medium text-gray-900 truncate">
                        {highlightText(result.title || result.name, query)}
                      </h3>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-green-600 font-medium">
                          {result.relevancePercentage}% match
                        </span>
                        <ArrowRight size={14} className="text-gray-400" />
                      </div>
                    </div>
                    
                    {result.type === 'meeting' && (
                      <div className="text-sm text-gray-600">
                        {result.scheduledAt && (
                          <span className="flex items-center gap-1">
                            <Clock size={12} />
                            {format(new Date(result.scheduledAt), 'MMM d, yyyy')}
                          </span>
                        )}
                        {result.attendees && result.attendees.length > 0 && (
                          <span className="ml-4">
                            {result.attendees.length} attendee{result.attendees.length !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    )}
                    
                    {result.type === 'stakeholder' && (
                      <div className="text-sm text-gray-600">
                        <span>{result.role}</span>
                        {result.category && (
                          <span className="ml-2 px-2 py-0.5 bg-gray-100 rounded-full text-xs">
                            {result.category}
                          </span>
                        )}
                      </div>
                    )}

                    {result.description && (
                      <p className="text-sm text-gray-500 mt-1 truncate">
                        {highlightText(result.description, query)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Recent & Suggested Searches */}
          {query.length < 2 && (
            <div className="p-4 space-y-6">
              {recentSearches.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                    <Clock size={14} />
                    Recent Searches
                  </h4>
                  <div className="space-y-1">
                    {recentSearches.map((search, index) => (
                      <button
                        key={index}
                        onClick={() => handleSearch(search)}
                        className="flex items-center gap-3 w-full text-left p-2 hover:bg-gray-50 rounded-lg transition-colors"
                      >
                        <Search size={14} className="text-gray-400" />
                        <span className="text-gray-700">{search}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {suggestedSearches.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                    <Sparkles size={14} />
                    Suggested Searches
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    {suggestedSearches.map((suggestion, index) => (
                      <button
                        key={index}
                        onClick={() => handleSearch(suggestion)}
                        className="text-left p-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Search Tips */}
        {query.length < 2 && (
          <div className="p-4 border-t border-gray-200 bg-gray-50">
            <div className="text-xs text-gray-500">
              <div className="flex items-center gap-4">
                <span><kbd className="px-1.5 py-0.5 bg-white border rounded">↑↓</kbd> Navigate</span>
                <span><kbd className="px-1.5 py-0.5 bg-white border rounded">Enter</kbd> Select</span>
                <span><kbd className="px-1.5 py-0.5 bg-white border rounded">Esc</kbd> Close</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}