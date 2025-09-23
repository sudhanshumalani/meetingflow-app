import React, { useState, useRef, useEffect } from 'react'
import { Trash2, Archive, Edit, MoreHorizontal } from 'lucide-react'
import hapticFeedback from '../utils/hapticFeedback'

/**
 * SwipeableCard - Advanced mobile card with swipe gestures
 * Features: Left/right swipe actions, haptic feedback, accessibility
 */
export function SwipeableCard({
  children,
  onSwipeLeft,
  onSwipeRight,
  leftAction,
  rightAction,
  threshold = 80,
  className = '',
  disabled = false
}) {
  const [translateX, setTranslateX] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [startX, setStartX] = useState(0)
  const cardRef = useRef(null)
  const animationRef = useRef(null)

  // Touch event handlers
  const handleTouchStart = (e) => {
    if (disabled) return

    setIsDragging(true)
    setStartX(e.touches[0].clientX)
    hapticFeedback.light()
  }

  const handleTouchMove = (e) => {
    if (!isDragging || disabled) return

    const currentX = e.touches[0].clientX
    const deltaX = currentX - startX

    // Apply resistance for over-swipe
    const resistance = 0.5
    const maxSwipe = 120
    let newTranslateX = deltaX

    if (Math.abs(deltaX) > maxSwipe) {
      const excess = Math.abs(deltaX) - maxSwipe
      newTranslateX = deltaX > 0
        ? maxSwipe + (excess * resistance)
        : -(maxSwipe + (excess * resistance))
    }

    setTranslateX(newTranslateX)
  }

  const handleTouchEnd = () => {
    if (!isDragging || disabled) return

    setIsDragging(false)

    if (Math.abs(translateX) > threshold) {
      if (translateX > 0 && rightAction) {
        hapticFeedback.success()
        rightAction.onAction()
      } else if (translateX < 0 && leftAction) {
        hapticFeedback.success()
        leftAction.onAction()
      } else {
        hapticFeedback.light()
      }
    }

    // Animate back to center
    animateToPosition(0)
  }

  const animateToPosition = (targetX) => {
    const startTime = Date.now()
    const startTranslateX = translateX
    const duration = 200

    const animate = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)

      // Easing function
      const easeOut = 1 - Math.pow(1 - progress, 3)

      const currentTranslateX = startTranslateX + (targetX - startTranslateX) * easeOut
      setTranslateX(currentTranslateX)

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate)
      }
    }

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
    }

    animationRef.current = requestAnimationFrame(animate)
  }

  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [])

  const getActionColor = (action, isLeft) => {
    if (!action) return 'bg-gray-300'

    const colors = {
      delete: 'bg-red-500',
      archive: 'bg-blue-500',
      edit: 'bg-green-500',
      default: 'bg-gray-500'
    }

    return colors[action.type] || colors.default
  }

  const getActionIcon = (action) => {
    if (!action) return null

    const icons = {
      delete: <Trash2 size={20} />,
      archive: <Archive size={20} />,
      edit: <Edit size={20} />,
      default: <MoreHorizontal size={20} />
    }

    return icons[action.type] || icons.default
  }

  return (
    <div className={`relative overflow-hidden rounded-xl ${className}`}>
      {/* Left Action */}
      {leftAction && (
        <div
          className={`absolute left-0 top-0 h-full flex items-center justify-end pr-4 transition-opacity duration-200 ${getActionColor(leftAction)} ${
            translateX < -threshold/2 ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ width: Math.abs(Math.min(translateX, 0)) }}
        >
          <div className="text-white flex flex-col items-center gap-1">
            {getActionIcon(leftAction)}
            <span className="text-xs font-medium">{leftAction.label}</span>
          </div>
        </div>
      )}

      {/* Right Action */}
      {rightAction && (
        <div
          className={`absolute right-0 top-0 h-full flex items-center justify-start pl-4 transition-opacity duration-200 ${getActionColor(rightAction)} ${
            translateX > threshold/2 ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ width: Math.max(translateX, 0) }}
        >
          <div className="text-white flex flex-col items-center gap-1">
            {getActionIcon(rightAction)}
            <span className="text-xs font-medium">{rightAction.label}</span>
          </div>
        </div>
      )}

      {/* Card Content */}
      <div
        ref={cardRef}
        className="relative bg-white transition-transform duration-200 ease-out"
        style={{
          transform: `translateX(${translateX}px)`,
          transition: isDragging ? 'none' : 'transform 0.2s ease-out'
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        role="article"
        tabIndex={0}
        aria-label="Swipeable card. Swipe left or right for actions."
      >
        {children}
      </div>
    </div>
  )
}

/**
 * SwipeableListItem - Predefined swipeable item for lists
 */
export function SwipeableListItem({
  title,
  subtitle,
  badge,
  onEdit,
  onDelete,
  onArchive,
  avatar,
  onClick,
  className = ''
}) {
  const leftAction = onDelete ? {
    type: 'delete',
    label: 'Delete',
    onAction: onDelete
  } : null

  const rightAction = onEdit ? {
    type: 'edit',
    label: 'Edit',
    onAction: onEdit
  } : (onArchive ? {
    type: 'archive',
    label: 'Archive',
    onAction: onArchive
  } : null)

  return (
    <SwipeableCard
      leftAction={leftAction}
      rightAction={rightAction}
      className={className}
    >
      <div
        className="p-4 flex items-center gap-3 touch-target cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={onClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onClick?.()
          }
        }}
      >
        {avatar && (
          <div className="flex-shrink-0">
            {avatar}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium text-gray-900 truncate">{title}</h3>
            {badge && (
              <span className="flex-shrink-0" aria-hidden="true">{badge}</span>
            )}
          </div>
          {subtitle && (
            <p className="text-sm text-gray-500 truncate">{subtitle}</p>
          )}
        </div>
      </div>
    </SwipeableCard>
  )
}

export default SwipeableCard