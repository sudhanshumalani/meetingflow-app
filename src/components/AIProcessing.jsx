import React, { useState, useRef } from 'react'
import {
  Sparkles,
  FileImage,
  Upload,
  CheckCircle,
  XCircle,
  AlertCircle,
  Zap,
  Eye,
  TrendingUp,
  MessageSquare,
  Target,
  Clock,
  Loader2,
  Info,
  Download
} from 'lucide-react'

// AI Processing Status Indicator
export function AIProcessingStatus({ isProcessing, stage, progress = 0 }) {
  if (!isProcessing) return null
  
  const stages = {
    'ocr': { icon: Eye, label: 'Reading Image' },
    'extraction': { icon: Target, label: 'Extracting Actions' },
    'sentiment': { icon: MessageSquare, label: 'Analyzing Sentiment' },
    'insights': { icon: Sparkles, label: 'Generating Insights' },
    'notifications': { icon: Sparkles, label: 'Creating Notifications' }
  }
  
  const currentStage = stages[stage] || { icon: Loader2, label: 'Processing' }
  const Icon = currentStage.icon
  
  return (
    <div className="fixed top-4 right-4 z-50 bg-white rounded-lg shadow-lg border border-blue-200 p-4 min-w-[300px]">
      <div className="flex items-center gap-3 mb-3">
        <div className="relative">
          <Icon 
            size={20} 
            className={`text-blue-600 ${stage ? 'animate-pulse' : 'animate-spin'}`} 
          />
          <div className="absolute -inset-1 bg-blue-100 rounded-full animate-ping opacity-20"></div>
        </div>
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-gray-900">AI Processing</h4>
          <p className="text-xs text-gray-600">{currentStage.label}...</p>
        </div>
      </div>
      
      {progress > 0 && (
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-blue-600 h-2 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          ></div>
        </div>
      )}
    </div>
  )
}

// OCR Image Upload Component
export function OCRImageUpload({ onImageProcessed, onError }) {
  const [isProcessing, setIsProcessing] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [result, setResult] = useState(null)
  const fileInputRef = useRef(null)
  
  const handleFile = async (file) => {
    if (!file || !file.type.startsWith('image/')) {
      onError?.('Please select a valid image file')
      return
    }
    
    setIsProcessing(true)
    setResult(null)
    
    try {
      // Import AI service
      const { aiCoordinator } = await import('../utils/aiServices')
      
      // Process image with OCR and action item extraction
      const aiResult = await aiCoordinator.processImageWithAI(file, {
        extractActionItems: true,
        analyzeSentiment: true
      })
      
      if (aiResult.success === false) {
        onError?.(aiResult.error)
        return
      }
      
      setResult(aiResult)
      onImageProcessed?.(aiResult)
      
    } catch (error) {
      console.error('OCR processing error:', error)
      onError?.('Failed to process image. Please try again.')
    } finally {
      setIsProcessing(false)
    }
  }
  
  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }
  
  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0])
    }
  }
  
  const handleFileInput = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0])
    }
  }
  
  return (
    <div className="space-y-4">
      {/* Upload Area */}
      <div
        className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          dragActive 
            ? 'border-blue-500 bg-blue-50' 
            : 'border-gray-300 hover:border-gray-400'
        } ${isProcessing ? 'opacity-50 pointer-events-none' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileInput}
          className="hidden"
          disabled={isProcessing}
        />
        
        <div className="space-y-3">
          {isProcessing ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 size={32} className="text-blue-600 animate-spin" />
              <p className="text-sm text-gray-600">Processing image with AI...</p>
            </div>
          ) : (
            <>
              <FileImage size={32} className="text-gray-400 mx-auto" />
              <div>
                <p className="text-sm font-medium text-gray-900">
                  Upload image for AI text extraction
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Drag and drop or click to select (PNG, JPG, JPEG)
                </p>
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Upload size={16} />
                Choose File
              </button>
            </>
          )}
        </div>
      </div>
      
      {/* Processing Result */}
      {result && (
        <OCRResultDisplay result={result} />
      )}
    </div>
  )
}

// OCR Result Display
export function OCRResultDisplay({ result }) {
  const [activeTab, setActiveTab] = useState('text')
  
  if (!result || !result.ocr) return null
  
  const { ocr, actionItems, sentiment } = result
  
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-4">
        <CheckCircle size={20} className="text-green-600" />
        <h3 className="font-semibold text-gray-900">AI Processing Complete</h3>
        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
          {ocr.confidence * 100}% confidence
        </span>
      </div>
      
      {/* Tab Navigation */}
      <div className="border-b border-gray-200 mb-4">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('text')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'text'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Extracted Text
          </button>
          {actionItems && (
            <button
              onClick={() => setActiveTab('actions')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'actions'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Action Items ({actionItems.actionItems?.length || 0})
            </button>
          )}
          {sentiment && (
            <button
              onClick={() => setActiveTab('sentiment')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'sentiment'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Sentiment
            </button>
          )}
        </nav>
      </div>
      
      {/* Tab Content */}
      <div className="space-y-4">
        {activeTab === 'text' && (
          <div>
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">
                {ocr.text}
              </pre>
            </div>
            
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Word Count:</span>
                <span className="ml-2 font-medium">{ocr.wordCount}</span>
              </div>
              <div>
                <span className="text-gray-500">Processing Time:</span>
                <span className="ml-2 font-medium">{ocr.processingTime}ms</span>
              </div>
              <div>
                <span className="text-gray-500">Language:</span>
                <span className="ml-2 font-medium">{ocr.language}</span>
              </div>
              <div>
                <span className="text-gray-500">Elements Found:</span>
                <span className="ml-2 font-medium">
                  {Object.values(ocr.extractedElements || {}).flat().length}
                </span>
              </div>
            </div>
          </div>
        )}
        
        {activeTab === 'actions' && actionItems && (
          <div>
            <div className="space-y-3">
              {actionItems.actionItems?.map((item, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-medium text-gray-900">{item.title}</h4>
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      item.priority === 'high' ? 'bg-red-100 text-red-700' :
                      item.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-green-100 text-green-700'
                    }`}>
                      {item.priority}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 text-sm text-gray-600">
                    {item.assignee && (
                      <div>
                        <span className="font-medium">Assignee:</span> {item.assignee}
                      </div>
                    )}
                    {item.dueDate && (
                      <div>
                        <span className="font-medium">Due:</span> {new Date(item.dueDate).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                  
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs text-gray-500">
                      Confidence: {Math.round(item.confidence * 100)}%
                    </span>
                    <button className="text-xs text-blue-600 hover:text-blue-800">
                      Add to Meeting
                    </button>
                  </div>
                </div>
              ))}
            </div>
            
            {actionItems.suggestions?.length > 0 && (
              <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                <h4 className="text-sm font-medium text-blue-900 mb-2">AI Suggestions</h4>
                <div className="space-y-2">
                  {actionItems.suggestions.map((suggestion, index) => (
                    <div key={index} className="flex items-start gap-2">
                      <Info size={12} className="text-blue-600 mt-0.5" />
                      <span className="text-sm text-blue-800">{suggestion.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        
        {activeTab === 'sentiment' && sentiment && (
          <div>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className={`text-2xl font-bold ${
                  sentiment.overall === 'positive' ? 'text-green-600' :
                  sentiment.overall === 'negative' ? 'text-red-600' :
                  'text-yellow-600'
                }`}>
                  {sentiment.overall === 'positive' ? '😊' :
                   sentiment.overall === 'negative' ? '😟' : '😐'}
                </div>
                <p className="text-sm font-medium text-gray-900 capitalize">{sentiment.overall}</p>
              </div>
              
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold text-gray-900">
                  {Math.round(sentiment.score * 100)}
                </div>
                <p className="text-sm text-gray-600">Score</p>
              </div>
              
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold text-gray-900">
                  {Math.round(sentiment.confidence * 100)}%
                </div>
                <p className="text-sm text-gray-600">Confidence</p>
              </div>
            </div>
            
            <div className="text-sm text-gray-600 space-y-1">
              <div>Positive words: {sentiment.positiveWords}</div>
              <div>Negative words: {sentiment.negativeWords}</div>
              <div>Total words analyzed: {sentiment.totalWords}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// AI Insights Display
export function AIInsightsDisplay({ insights, onActionClick }) {
  if (!insights || insights.length === 0) return null
  
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles size={20} className="text-purple-600" />
        <h3 className="font-semibold text-gray-900">AI Relationship Insights</h3>
      </div>
      
      {insights.map((insight, index) => (
        <div key={index} className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1">
              <h4 className="font-medium text-gray-900">{insight.title}</h4>
              <p className="text-sm text-gray-600 mt-1">{insight.message}</p>
            </div>
            <span className={`px-2 py-1 text-xs rounded-full ${
              insight.severity === 'warning' ? 'bg-red-100 text-red-700' :
              insight.severity === 'caution' ? 'bg-yellow-100 text-yellow-700' :
              'bg-blue-100 text-blue-700'
            }`}>
              {insight.severity}
            </span>
          </div>
          
          {insight.data && (
            <div className="mb-3 p-3 bg-gray-50 rounded-lg">
              <div className="grid grid-cols-2 gap-3 text-sm">
                {Object.entries(insight.data).map(([key, value]) => (
                  <div key={key}>
                    <span className="text-gray-500 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}:</span>
                    <span className="ml-2 font-medium">
                      {typeof value === 'number' ? value.toFixed(2) : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">
              Confidence: {Math.round(insight.confidence * 100)}%
            </span>
            
            {onActionClick && (
              <button
                onClick={() => onActionClick(insight)}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                Take Action
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// Predictive Notifications Display
export function PredictiveNotificationsDisplay({ notifications, onActionClick, onDismiss }) {
  if (!notifications || notifications.length === 0) return null
  
  const groupedNotifications = notifications.reduce((groups, notification) => {
    const priority = notification.priority >= 7 ? 'high' : notification.priority >= 5 ? 'medium' : 'low'
    if (!groups[priority]) groups[priority] = []
    groups[priority].push(notification)
    return groups
  }, {})
  
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles size={20} className="text-blue-600" />
        <h3 className="font-semibold text-gray-900">Predictive Notifications</h3>
      </div>
      
      {Object.entries(groupedNotifications).map(([priority, notifs]) => (
        <div key={priority} className="space-y-3">
          <h4 className={`text-sm font-medium ${
            priority === 'high' ? 'text-red-700' :
            priority === 'medium' ? 'text-yellow-700' :
            'text-gray-700'
          }`}>
            {priority.charAt(0).toUpperCase() + priority.slice(1)} Priority ({notifs.length})
          </h4>
          
          {notifs.map((notification) => (
            <div key={notification.id} className={`border rounded-lg p-4 ${
              priority === 'high' ? 'border-red-200 bg-red-50' :
              priority === 'medium' ? 'border-yellow-200 bg-yellow-50' :
              'border-gray-200 bg-gray-50'
            }`}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h5 className="font-medium text-gray-900">{notification.title}</h5>
                  <p className="text-sm text-gray-600 mt-1">{notification.message}</p>
                  {notification.stakeholder && (
                    <p className="text-xs text-gray-500 mt-1">
                      Related to: {notification.stakeholder}
                    </p>
                  )}
                </div>
                
                <button
                  onClick={() => onDismiss?.(notification.id)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XCircle size={16} />
                </button>
              </div>
              
              {notification.actions && notification.actions.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {notification.actions.map((action, index) => (
                    <button
                      key={index}
                      onClick={() => onActionClick?.(action, notification)}
                      className="text-xs px-3 py-1 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
              
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Confidence: {Math.round(notification.confidence * 100)}%</span>
                <span>Impact: {notification.predictedImpact?.replace(/_/g, ' ')}</span>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// AI Processing Summary
export function AIProcessingSummary({ results, onExport }) {
  if (!results) return null
  
  const {
    ocr,
    actionItems,
    sentiment,
    insights,
    notifications,
    processingTime
  } = results
  
  return (
    <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Zap size={20} className="text-purple-600" />
          <h3 className="font-semibold text-gray-900">AI Processing Summary</h3>
        </div>
        
        {onExport && (
          <button
            onClick={onExport}
            className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
          >
            <Download size={14} />
            Export Results
          </button>
        )}
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        {ocr && (
          <div className="text-center p-3 bg-white rounded-lg">
            <Eye size={20} className="text-blue-600 mx-auto mb-1" />
            <div className="text-lg font-bold text-gray-900">{ocr.wordCount}</div>
            <div className="text-xs text-gray-600">Words Extracted</div>
          </div>
        )}
        
        {actionItems && (
          <div className="text-center p-3 bg-white rounded-lg">
            <Target size={20} className="text-green-600 mx-auto mb-1" />
            <div className="text-lg font-bold text-gray-900">{actionItems.actionItems?.length || 0}</div>
            <div className="text-xs text-gray-600">Action Items</div>
          </div>
        )}
        
        {sentiment && (
          <div className="text-center p-3 bg-white rounded-lg">
            <MessageSquare size={20} className="text-yellow-600 mx-auto mb-1" />
            <div className="text-lg font-bold text-gray-900 capitalize">{sentiment.overall}</div>
            <div className="text-xs text-gray-600">Sentiment</div>
          </div>
        )}
        
        <div className="text-center p-3 bg-white rounded-lg">
          <Clock size={20} className="text-purple-600 mx-auto mb-1" />
          <div className="text-lg font-bold text-gray-900">{processingTime}ms</div>
          <div className="text-xs text-gray-600">Processing Time</div>
        </div>
      </div>
      
      <div className="text-sm text-gray-600 space-y-1">
        {insights && <div>✓ Generated {insights.insights?.length || 0} relationship insights</div>}
        {notifications && <div>✓ Created {notifications.notifications?.length || 0} predictive notifications</div>}
        <div>✓ All AI processing completed successfully</div>
      </div>
    </div>
  )
}