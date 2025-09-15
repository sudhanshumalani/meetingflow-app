import { useState, useCallback, useRef } from 'react'
import { processWithClaude, getCapabilities } from '../utils/ocrServiceNew'

export const useAIAnalysis = () => {
  const [result, setResult] = useState(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState(null)
  const [progress, setProgress] = useState(0)
  const abortControllerRef = useRef(null)

  const analyze = useCallback(async (text, context = {}) => {
    if (!text?.trim()) {
      setError('No text to analyze')
      return
    }

    // Reset state
    setError(null)
    setIsAnalyzing(true)
    setProgress(0)

    // Create abort controller for cancellation
    abortControllerRef.current = new AbortController()

    try {
      const capabilities = getCapabilities()
      console.log('🚀 Starting AI analysis...', {
        textLength: text.length,
        capabilities,
        context
      })

      // Optimistic UI update with progress simulation
      setResult({
        summary: 'Analyzing meeting content with Claude AI...',
        keyDiscussionPoints: ['🔍 Extracting key discussion points...'],
        actionItems: [
          {
            task: '📋 Identifying action items and assignments...',
            assignee: 'Claude',
            priority: 'medium',
            confidence: 0.0
          }
        ],
        sentiment: 'neutral',
        isStreaming: true,
        provider: capabilities.claudeAPI ? 'Claude API' : 'Claude Workflow'
      })

      // Simulate progress for better UX
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev < 70) return prev + Math.random() * 15
          return prev
        })
      }, 500)

      // Call the AI service
      const aiResult = await processWithClaude(text, context)

      // Clear progress simulation
      clearInterval(progressInterval)
      setProgress(100)

      // Update with real results
      setResult({
        ...aiResult,
        isStreaming: false,
        textLength: text.length,
        analyzedAt: new Date().toISOString()
      })

      console.log('✅ AI analysis complete:', aiResult)
      return aiResult

    } catch (err) {
      console.error('❌ AI analysis failed:', err)
      setError(err.message || 'Analysis failed')
      setResult(null)
    } finally {
      setIsAnalyzing(false)
      setProgress(0)
      abortControllerRef.current = null
    }
  }, [])

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      setIsAnalyzing(false)
      setProgress(0)
      setError('Analysis cancelled')
    }
  }, [])

  const clear = useCallback(() => {
    setResult(null)
    setError(null)
    setProgress(0)
  }, [])

  const exportResults = useCallback(() => {
    if (!result) return null

    const exportData = {
      analysis: result,
      metadata: {
        exportedAt: new Date().toISOString(),
        version: '2.0',
        provider: result.provider || 'Claude'
      }
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json'
    })

    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `ai-analysis-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    return exportData
  }, [result])

  return {
    // State
    result,
    isAnalyzing,
    error,
    progress,

    // Actions
    analyze,
    cancel,
    clear,
    exportResults,

    // Computed
    hasResult: !!result && !result.isStreaming,
    isStreaming: result?.isStreaming || false,
    capabilities: getCapabilities()
  }
}