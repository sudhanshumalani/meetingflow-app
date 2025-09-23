/**
 * Performance Monitor for Mobile Optimization
 * Tracks performance metrics and provides insights for mobile UX improvements
 */

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      renderTimes: [],
      interactionDelays: [],
      memoryUsage: [],
      networkRequests: []
    }
    this.observers = {}
    this.isEnabled = process.env.NODE_ENV === 'development'
    this.init()
  }

  init() {
    if (!this.isEnabled) return

    // Performance Observer for measuring interactions
    if ('PerformanceObserver' in window) {
      this.setupPerformanceObserver()
    }

    // Memory monitoring
    if ('memory' in performance) {
      this.startMemoryMonitoring()
    }

    // Network monitoring
    this.setupNetworkMonitoring()
  }

  setupPerformanceObserver() {
    try {
      // First Input Delay (FID)
      const fidObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.metrics.interactionDelays.push({
            delay: entry.processingStart - entry.startTime,
            timestamp: Date.now(),
            type: 'first-input'
          })
        }
      })
      fidObserver.observe({ type: 'first-input', buffered: true })

      // Largest Contentful Paint (LCP)
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries()
        const lastEntry = entries[entries.length - 1]
        this.metrics.renderTimes.push({
          lcp: lastEntry.startTime,
          timestamp: Date.now()
        })
      })
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true })

      // Layout Shift (CLS)
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) {
            this.metrics.renderTimes.push({
              cls: entry.value,
              timestamp: Date.now()
            })
          }
        }
      })
      clsObserver.observe({ type: 'layout-shift', buffered: true })

    } catch (error) {
      console.warn('Performance Observer setup failed:', error)
    }
  }

  startMemoryMonitoring() {
    const checkMemory = () => {
      if (performance.memory) {
        this.metrics.memoryUsage.push({
          used: performance.memory.usedJSHeapSize,
          total: performance.memory.totalJSHeapSize,
          limit: performance.memory.jsHeapSizeLimit,
          timestamp: Date.now()
        })
      }
    }

    // Check memory every 30 seconds
    setInterval(checkMemory, 30000)
    checkMemory()
  }

  setupNetworkMonitoring() {
    // Monitor fetch requests
    const originalFetch = window.fetch
    window.fetch = async (...args) => {
      const startTime = performance.now()
      try {
        const response = await originalFetch(...args)
        const endTime = performance.now()

        this.metrics.networkRequests.push({
          url: args[0],
          duration: endTime - startTime,
          status: response.status,
          timestamp: Date.now()
        })

        return response
      } catch (error) {
        const endTime = performance.now()
        this.metrics.networkRequests.push({
          url: args[0],
          duration: endTime - startTime,
          error: error.message,
          timestamp: Date.now()
        })
        throw error
      }
    }
  }

  // Measure component render time
  measureRender(componentName, renderFn) {
    if (!this.isEnabled) return renderFn()

    const startTime = performance.now()
    const result = renderFn()
    const endTime = performance.now()

    this.metrics.renderTimes.push({
      component: componentName,
      duration: endTime - startTime,
      timestamp: Date.now()
    })

    if (endTime - startTime > 16) { // More than one frame (60fps)
      console.warn(`Slow render detected: ${componentName} took ${(endTime - startTime).toFixed(2)}ms`)
    }

    return result
  }

  // Measure user interaction response time
  measureInteraction(interactionName, interactionFn) {
    if (!this.isEnabled) return interactionFn()

    const startTime = performance.now()
    const result = interactionFn()
    const endTime = performance.now()

    this.metrics.interactionDelays.push({
      interaction: interactionName,
      delay: endTime - startTime,
      timestamp: Date.now()
    })

    if (endTime - startTime > 100) { // More than 100ms
      console.warn(`Slow interaction detected: ${interactionName} took ${(endTime - startTime).toFixed(2)}ms`)
    }

    return result
  }

  // Get performance summary
  getPerformanceSummary() {
    const now = Date.now()
    const fiveMinutesAgo = now - (5 * 60 * 1000)

    // Filter recent metrics
    const recentRenders = this.metrics.renderTimes.filter(m => m.timestamp > fiveMinutesAgo)
    const recentInteractions = this.metrics.interactionDelays.filter(m => m.timestamp > fiveMinutesAgo)
    const recentMemory = this.metrics.memoryUsage.filter(m => m.timestamp > fiveMinutesAgo)
    const recentRequests = this.metrics.networkRequests.filter(m => m.timestamp > fiveMinutesAgo)

    return {
      renderPerformance: {
        averageRenderTime: recentRenders.length > 0
          ? recentRenders.reduce((sum, m) => sum + (m.duration || 0), 0) / recentRenders.length
          : 0,
        slowRenders: recentRenders.filter(m => (m.duration || 0) > 16).length,
        totalRenders: recentRenders.length
      },
      interactionPerformance: {
        averageDelay: recentInteractions.length > 0
          ? recentInteractions.reduce((sum, m) => sum + m.delay, 0) / recentInteractions.length
          : 0,
        slowInteractions: recentInteractions.filter(m => m.delay > 100).length,
        totalInteractions: recentInteractions.length
      },
      memoryUsage: recentMemory.length > 0 ? recentMemory[recentMemory.length - 1] : null,
      networkPerformance: {
        averageRequestTime: recentRequests.length > 0
          ? recentRequests.reduce((sum, m) => sum + m.duration, 0) / recentRequests.length
          : 0,
        slowRequests: recentRequests.filter(m => m.duration > 1000).length,
        failedRequests: recentRequests.filter(m => m.error).length,
        totalRequests: recentRequests.length
      }
    }
  }

  // Get mobile-specific insights
  getMobileInsights() {
    const summary = this.getPerformanceSummary()
    const insights = []

    // Render performance insights
    if (summary.renderPerformance.averageRenderTime > 16) {
      insights.push({
        type: 'warning',
        category: 'render',
        message: `Average render time (${summary.renderPerformance.averageRenderTime.toFixed(1)}ms) exceeds 16ms. Consider optimizing components.`
      })
    }

    // Interaction insights
    if (summary.interactionPerformance.averageDelay > 100) {
      insights.push({
        type: 'warning',
        category: 'interaction',
        message: `Average interaction delay (${summary.interactionPerformance.averageDelay.toFixed(1)}ms) is too high for good mobile UX.`
      })
    }

    // Memory insights
    if (summary.memoryUsage && summary.memoryUsage.used > summary.memoryUsage.limit * 0.8) {
      insights.push({
        type: 'error',
        category: 'memory',
        message: 'Memory usage is approaching limit. Consider implementing memory optimizations.'
      })
    }

    // Network insights
    if (summary.networkPerformance.averageRequestTime > 2000) {
      insights.push({
        type: 'warning',
        category: 'network',
        message: `Network requests are slow (${summary.networkPerformance.averageRequestTime.toFixed(0)}ms average). Consider caching or request optimization.`
      })
    }

    return insights
  }

  // Log performance report to console
  logPerformanceReport() {
    if (!this.isEnabled) return

    const summary = this.getPerformanceSummary()
    const insights = this.getMobileInsights()

    console.group('📱 Mobile Performance Report')
    console.table(summary)

    if (insights.length > 0) {
      console.group('🚨 Performance Insights')
      insights.forEach(insight => {
        const emoji = insight.type === 'error' ? '🔴' : '🟡'
        console.log(`${emoji} ${insight.category.toUpperCase()}: ${insight.message}`)
      })
      console.groupEnd()
    } else {
      console.log('✅ No performance issues detected')
    }

    console.groupEnd()
  }
}

// Create singleton instance
const performanceMonitor = new PerformanceMonitor()

// Auto-report every 5 minutes in development
if (process.env.NODE_ENV === 'development') {
  setInterval(() => {
    performanceMonitor.logPerformanceReport()
  }, 5 * 60 * 1000)
}

export default performanceMonitor

// React hook for measuring component performance
export function usePerformanceMonitor(componentName) {
  return {
    measureRender: (renderFn) => performanceMonitor.measureRender(componentName, renderFn),
    measureInteraction: (interactionName, interactionFn) =>
      performanceMonitor.measureInteraction(`${componentName}:${interactionName}`, interactionFn)
  }
}