import React, { useState, useRef, useEffect } from 'react'
import { 
  Menu,
  X,
  ChevronDown,
  ChevronUp,
  Smartphone,
  Camera,
  Upload,
  MoreVertical,
  ArrowUp,
  ArrowDown,
  Maximize2,
  Minimize2
} from 'lucide-react'

// Mobile Navigation Drawer
export function MobileNavDrawer({ isOpen, onClose, navigation }) {
  const drawerRef = useRef(null)
  
  useEffect(() => {
    const handleTouch = (e) => {
      if (isOpen && drawerRef.current && !drawerRef.current.contains(e.target)) {
        onClose()
      }
    }
    
    if (isOpen) {
      document.addEventListener('touchstart', handleTouch)
      document.body.style.overflow = 'hidden'
    }
    
    return () => {
      document.removeEventListener('touchstart', handleTouch)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, onClose])
  
  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
          onClick={onClose}
        />
      )}
      
      {/* Drawer */}
      <div
        ref={drawerRef}
        className={`fixed top-0 left-0 h-full w-80 bg-white shadow-lg transform transition-transform duration-300 ease-in-out z-50 md:hidden ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Navigation</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg touch-target"
          >
            <X size={20} />
          </button>
        </div>
        
        <nav className="p-4 space-y-2">
          {navigation?.map((item, index) => (
            <button
              key={index}
              onClick={() => {
                item.onClick?.()
                onClose()
              }}
              className="w-full text-left p-3 hover:bg-gray-100 rounded-lg touch-target flex items-center gap-3"
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </>
  )
}

// Mobile-Optimized Header
export function MobileHeader({ title, subtitle, actions, onMenuClick, showMenu = true }) {
  return (
    <header className="bg-white shadow-sm border-b sticky top-0 z-30">
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {showMenu && (
            <button
              onClick={onMenuClick}
              className="p-2 hover:bg-gray-100 rounded-lg touch-target md:hidden"
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
          )}
          
          <div className="min-w-0 flex-1">
            <h1 className="text-lg sm:text-xl font-bold text-gray-900 truncate">
              {title}
            </h1>
            {subtitle && (
              <p className="text-sm text-gray-500 truncate">{subtitle}</p>
            )}
          </div>
        </div>
        
        {actions && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {actions}
          </div>
        )}
      </div>
    </header>
  )
}

// Touch-Friendly Button
export function TouchButton({ 
  children, 
  variant = 'primary', 
  size = 'medium', 
  fullWidth = false,
  disabled = false,
  loading = false,
  ...props 
}) {
  const baseClasses = "touch-target font-medium rounded-lg transition-all duration-200 disabled:opacity-50 active:scale-95"
  
  const variants = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800",
    secondary: "bg-gray-100 text-gray-900 hover:bg-gray-200 active:bg-gray-300",
    danger: "bg-red-600 text-white hover:bg-red-700 active:bg-red-800",
    ghost: "text-gray-600 hover:bg-gray-100 active:bg-gray-200"
  }
  
  const sizes = {
    small: "px-3 py-2 text-sm min-h-[36px]",
    medium: "px-4 py-3 text-base min-h-[44px]",
    large: "px-6 py-4 text-lg min-h-[52px]"
  }
  
  const widthClass = fullWidth ? "w-full" : ""
  
  return (
    <button
      className={`${baseClasses} ${variants[variant]} ${sizes[size]} ${widthClass}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <div className="flex items-center justify-center gap-2">
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          Processing...
        </div>
      ) : (
        children
      )}
    </button>
  )
}

// Mobile-Optimized Input
export function TouchInput({ 
  label, 
  error, 
  helper,
  fullWidth = true,
  ...props 
}) {
  const [isFocused, setIsFocused] = useState(false)
  
  return (
    <div className={fullWidth ? "w-full" : ""}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {label}
        </label>
      )}
      
      <input
        className={`w-full px-4 py-3 text-base border rounded-lg transition-all duration-200 touch-target
          ${error 
            ? 'border-red-300 focus:border-red-500' 
            : 'border-gray-300 focus:border-blue-500'
          }
          ${isFocused ? 'ring-2 ring-opacity-20' : ''}
        `}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        {...props}
      />
      
      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}
      
      {helper && !error && (
        <p className="mt-2 text-sm text-gray-500">{helper}</p>
      )}
    </div>
  )
}

// Mobile-Optimized Select
export function TouchSelect({ 
  label, 
  options, 
  value, 
  onChange, 
  error,
  fullWidth = true,
  ...props 
}) {
  return (
    <div className={fullWidth ? "w-full" : ""}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {label}
        </label>
      )}
      
      <select
        value={value}
        onChange={onChange}
        className={`w-full px-4 py-3 text-base border rounded-lg touch-target appearance-none bg-white
          ${error 
            ? 'border-red-300 focus:border-red-500' 
            : 'border-gray-300 focus:border-blue-500'
          }
        `}
        {...props}
      >
        {options?.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      
      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}
    </div>
  )
}

// Expandable Card for Mobile
export function MobileExpandableCard({ 
  title, 
  subtitle, 
  badge,
  children, 
  defaultExpanded = false,
  actions
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)
  
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 text-left hover:bg-gray-50 active:bg-gray-100 touch-target"
      >
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-medium text-gray-900 truncate">{title}</h3>
              {badge && (
                <span className="flex-shrink-0">{badge}</span>
              )}
            </div>
            {subtitle && (
              <p className="text-sm text-gray-500 truncate">{subtitle}</p>
            )}
          </div>
          
          <div className="flex items-center gap-2 flex-shrink-0 ml-3">
            {actions && (
              <div className="flex gap-1">
                {actions}
              </div>
            )}
            {isExpanded ? (
              <ChevronUp size={20} className="text-gray-400" />
            ) : (
              <ChevronDown size={20} className="text-gray-400" />
            )}
          </div>
        </div>
      </button>
      
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-gray-100">
          {children}
        </div>
      )}
    </div>
  )
}

// Mobile Action Sheet
export function MobileActionSheet({ isOpen, onClose, title, actions }) {
  const sheetRef = useRef(null)
  
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    }
    
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])
  
  if (!isOpen) return null
  
  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 z-50"
        onClick={onClose}
      />
      
      {/* Action Sheet */}
      <div
        ref={sheetRef}
        className="fixed bottom-0 left-0 right-0 bg-white rounded-t-lg shadow-lg z-50 animate-slide-up"
      >
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            {title && (
              <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg touch-target"
            >
              <X size={20} />
            </button>
          </div>
        </div>
        
        <div className="p-4 space-y-2 max-h-96 overflow-y-auto">
          {actions?.map((action, index) => (
            <button
              key={index}
              onClick={() => {
                action.onClick?.()
                onClose()
              }}
              className={`w-full p-3 text-left rounded-lg touch-target flex items-center gap-3
                ${action.destructive 
                  ? 'text-red-600 hover:bg-red-50 active:bg-red-100' 
                  : 'text-gray-900 hover:bg-gray-100 active:bg-gray-200'
                }
              `}
            >
              {action.icon}
              <span>{action.label}</span>
            </button>
          ))}
        </div>
        
        {/* Safe area padding for devices with home indicator */}
        <div className="h-safe-area-inset-bottom" />
      </div>
    </>
  )
}

// Mobile Camera Component
export function MobileCameraCapture({ 
  onCapture, 
  onClose, 
  facingMode = 'user' // 'user' for front camera, 'environment' for back camera
}) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState(null)
  const [currentFacingMode, setCurrentFacingMode] = useState(facingMode)
  
  useEffect(() => {
    startCamera()
    
    return () => {
      stopCamera()
    }
  }, [currentFacingMode])
  
  const startCamera = async () => {
    try {
      setError(null)
      setIsReady(false)
      
      const constraints = {
        video: {
          facingMode: currentFacingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      }
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => {
          setIsReady(true)
        }
      }
    } catch (err) {
      setError('Camera access denied or not available')
      console.error('Camera error:', err)
    }
  }
  
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
  }
  
  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return
    
    const video = videoRef.current
    const canvas = canvasRef.current
    const context = canvas.getContext('2d')
    
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    
    context.drawImage(video, 0, 0)
    
    canvas.toBlob((blob) => {
      if (blob) {
        onCapture(blob)
        stopCamera()
        onClose()
      }
    }, 'image/jpeg', 0.8)
  }
  
  const switchCamera = () => {
    setCurrentFacingMode(prev => prev === 'user' ? 'environment' : 'user')
  }
  
  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 text-white">
        <button
          onClick={() => {
            stopCamera()
            onClose()
          }}
          className="p-2 hover:bg-white hover:bg-opacity-20 rounded-lg touch-target"
        >
          <X size={24} />
        </button>
        
        <h2 className="text-lg font-semibold">Camera</h2>
        
        <button
          onClick={switchCamera}
          className="p-2 hover:bg-white hover:bg-opacity-20 rounded-lg touch-target"
          disabled={!isReady}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 5h-3.17L15 3H9L7.17 5H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zM12 18c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.65 0-3 1.35-3 3s1.35 3 3 3 3-1.35 3-3-1.35-3-3-3z"/>
          </svg>
        </button>
      </div>
      
      {/* Camera View */}
      <div className="flex-1 relative overflow-hidden">
        {error ? (
          <div className="flex items-center justify-center h-full text-white text-center p-4">
            <div>
              <Camera size={48} className="mx-auto mb-4 opacity-50" />
              <p className="text-lg mb-2">Camera Error</p>
              <p className="text-sm opacity-75">{error}</p>
            </div>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            
            {!isReady && (
              <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
                <div className="text-white text-center">
                  <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <p>Loading camera...</p>
                </div>
              </div>
            )}
          </>
        )}
        
        {/* Capture Overlay */}
        {isReady && (
          <div className="absolute inset-x-0 bottom-0 p-8">
            <div className="flex items-center justify-center">
              <button
                onClick={capturePhoto}
                className="w-20 h-20 bg-white rounded-full border-4 border-gray-300 hover:border-gray-400 active:scale-95 transition-all touch-target flex items-center justify-center"
              >
                <div className="w-16 h-16 bg-white rounded-full shadow-inner" />
              </button>
            </div>
          </div>
        )}
      </div>
      
      {/* Hidden canvas for capturing */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
}

// Mobile-Optimized Grid
export function ResponsiveGrid({ 
  children, 
  minItemWidth = "280px",
  gap = "1rem",
  className = "" 
}) {
  return (
    <div 
      className={`grid gap-4 ${className}`}
      style={{
        gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${minItemWidth}), 1fr))`,
        gap
      }}
    >
      {children}
    </div>
  )
}

// Pull-to-Refresh Component
export function PullToRefresh({ onRefresh, children }) {
  const [isPulling, setIsPulling] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const startY = useRef(0)
  const containerRef = useRef(null)
  
  const threshold = 100
  
  const handleTouchStart = (e) => {
    if (containerRef.current?.scrollTop === 0) {
      startY.current = e.touches[0].clientY
      setIsPulling(true)
    }
  }
  
  const handleTouchMove = (e) => {
    if (!isPulling) return
    
    const currentY = e.touches[0].clientY
    const distance = Math.max(0, currentY - startY.current)
    
    if (distance > 0) {
      e.preventDefault()
      setPullDistance(Math.min(distance, threshold + 50))
    }
  }
  
  const handleTouchEnd = async () => {
    if (pullDistance >= threshold && !isRefreshing) {
      setIsRefreshing(true)
      try {
        await onRefresh()
      } finally {
        setIsRefreshing(false)
      }
    }
    
    setIsPulling(false)
    setPullDistance(0)
  }
  
  return (
    <div
      ref={containerRef}
      className="relative overflow-y-auto h-full"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull indicator */}
      {(isPulling || isRefreshing) && (
        <div 
          className="absolute top-0 left-0 right-0 flex items-center justify-center bg-blue-50 text-blue-600 transition-all duration-200"
          style={{ 
            height: Math.max(0, pullDistance),
            transform: `translateY(-${Math.max(0, pullDistance)}px)`
          }}
        >
          <div className="flex items-center gap-2">
            {isRefreshing ? (
              <>
                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm font-medium">Refreshing...</span>
              </>
            ) : (
              <>
                <ArrowDown 
                  size={16} 
                  className={`transition-transform ${pullDistance >= threshold ? 'rotate-180' : ''}`} 
                />
                <span className="text-sm font-medium">
                  {pullDistance >= threshold ? 'Release to refresh' : 'Pull to refresh'}
                </span>
              </>
            )}
          </div>
        </div>
      )}
      
      <div style={{ paddingTop: isPulling ? pullDistance : 0 }}>
        {children}
      </div>
    </div>
  )
}

// Mobile-Optimized Tabs
export function MobileTabs({ tabs, activeTab, onTabChange }) {
  const tabsRef = useRef(null)
  
  useEffect(() => {
    // Scroll active tab into view
    if (tabsRef.current) {
      const activeTabElement = tabsRef.current.querySelector(`[data-tab="${activeTab}"]`)
      if (activeTabElement) {
        activeTabElement.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'nearest',
          inline: 'center' 
        })
      }
    }
  }, [activeTab])
  
  return (
    <div className="border-b border-gray-200 bg-white sticky top-0 z-10">
      <div 
        ref={tabsRef}
        className="flex overflow-x-auto scrollbar-hide"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            data-tab={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex-shrink-0 px-4 py-3 text-sm font-medium border-b-2 touch-target whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <div className="flex items-center gap-2">
              {tab.icon}
              <span>{tab.label}</span>
              {tab.badge && (
                <span className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded-full">
                  {tab.badge}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}