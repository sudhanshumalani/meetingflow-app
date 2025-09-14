import React from 'react'
import { Loader2 } from 'lucide-react'

export default function LoadingSpinner({ 
  size = 'medium', 
  text = 'Loading...', 
  className = '',
  variant = 'primary'
}) {
  const sizeClasses = {
    small: 'w-4 h-4',
    medium: 'w-6 h-6',
    large: 'w-8 h-8',
    xl: 'w-12 h-12'
  }

  const colorClasses = {
    primary: 'text-blue-600',
    white: 'text-white',
    gray: 'text-gray-600',
    success: 'text-green-600',
    danger: 'text-red-600'
  }

  return (
    <div className={`flex items-center justify-center gap-3 ${className}`}>
      <Loader2 
        className={`animate-spin ${sizeClasses[size]} ${colorClasses[variant]}`} 
      />
      {text && (
        <span className={`text-sm font-medium ${colorClasses[variant]}`}>
          {text}
        </span>
      )}
    </div>
  )
}

export function SkeletonCard({ className = '' }) {
  return (
    <div className={`animate-pulse ${className}`}>
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex justify-between items-start mb-4">
          <div className="skeleton h-6 bg-gray-200 rounded w-2/3"></div>
          <div className="skeleton h-5 bg-gray-200 rounded w-16"></div>
        </div>
        <div className="space-y-3">
          <div className="skeleton h-4 bg-gray-200 rounded w-full"></div>
          <div className="skeleton h-4 bg-gray-200 rounded w-4/5"></div>
        </div>
        <div className="flex justify-between items-center mt-4">
          <div className="skeleton h-4 bg-gray-200 rounded w-24"></div>
          <div className="skeleton h-4 bg-gray-200 rounded w-20"></div>
        </div>
      </div>
    </div>
  )
}

export function SkeletonText({ lines = 1, className = '' }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div 
          key={i}
          className="skeleton h-4 bg-gray-200 rounded"
          style={{ width: `${Math.random() * 40 + 60}%` }}
        ></div>
      ))}
    </div>
  )
}

export function SkeletonAvatar({ size = 'medium', className = '' }) {
  const sizeClasses = {
    small: 'w-8 h-8',
    medium: 'w-10 h-10',
    large: 'w-16 h-16'
  }

  return (
    <div className={`skeleton ${sizeClasses[size]} bg-gray-200 rounded-full ${className}`}></div>
  )
}

export function SkeletonButton({ className = '' }) {
  return (
    <div className={`skeleton h-10 bg-gray-200 rounded-lg w-32 ${className}`}></div>
  )
}