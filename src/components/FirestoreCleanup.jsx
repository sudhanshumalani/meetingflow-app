/**
 * Firestore Cleanup Component
 * Allows users to view and permanently delete items from Firestore
 */

import React, { useState } from 'react'
import { Trash2, RefreshCw, AlertTriangle, CheckCircle, XCircle, ChevronDown, ChevronUp } from 'lucide-react'

export default function FirestoreCleanup() {
  const [isExpanded, setIsExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState(null)
  const [error, setError] = useState(null)
  const [purgeResult, setPurgeResult] = useState(null)
  const [selectedItems, setSelectedItems] = useState({ stakeholders: [], categories: [] })

  const loadReport = async () => {
    setLoading(true)
    setError(null)
    setPurgeResult(null)

    try {
      const firestoreModule = await import('../utils/firestoreService')
      const result = await firestoreModule.default.getCleanupReport()

      if (result.error) {
        setError(result.error)
      } else {
        setReport(result)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const purgeAllDeleted = async () => {
    if (!confirm('This will PERMANENTLY delete all soft-deleted items from Firestore. This cannot be undone. Continue?')) {
      return
    }

    setLoading(true)
    setError(null)

    try {
      const firestoreModule = await import('../utils/firestoreService')
      const result = await firestoreModule.default.purgeDeletedItems()

      if (result.success) {
        setPurgeResult(result.results)
        // Refresh report
        await loadReport()
      } else {
        setError(result.reason)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const hardDeleteSelected = async () => {
    const totalSelected = selectedItems.stakeholders.length + selectedItems.categories.length
    if (totalSelected === 0) {
      alert('No items selected')
      return
    }

    if (!confirm(`This will PERMANENTLY delete ${totalSelected} selected items from Firestore. This cannot be undone. Continue?`)) {
      return
    }

    setLoading(true)
    setError(null)

    try {
      const firestoreModule = await import('../utils/firestoreService')
      const result = await firestoreModule.default.hardDeleteItems(selectedItems)

      if (result.success) {
        setPurgeResult(result.results)
        setSelectedItems({ stakeholders: [], categories: [] })
        // Refresh report
        await loadReport()
      } else {
        setError(result.reason)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const toggleSelection = (type, id) => {
    setSelectedItems(prev => {
      const current = prev[type] || []
      if (current.includes(id)) {
        return { ...prev, [type]: current.filter(i => i !== id) }
      } else {
        return { ...prev, [type]: [...current, id] }
      }
    })
  }

  const selectAllDeleted = (type) => {
    if (!report) return
    const items = type === 'stakeholders' ? report.stakeholders.items : report.categories.items
    const deletedIds = items.filter(i => i.deleted).map(i => i.id)
    setSelectedItems(prev => ({ ...prev, [type]: deletedIds }))
  }

  return (
    <div className="bg-white rounded-lg border border-red-200 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => {
          setIsExpanded(!isExpanded)
          if (!isExpanded && !report) loadReport()
        }}
        className="w-full px-4 py-3 flex items-center justify-between bg-red-50 hover:bg-red-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Trash2 size={18} className="text-red-600" />
          <span className="font-medium text-red-900">Firestore Cleanup</span>
          <span className="text-xs text-red-600">(Advanced)</span>
        </div>
        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>

      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* Warning */}
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded flex gap-2">
            <AlertTriangle size={20} className="text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-800">
              <strong>Warning:</strong> Hard-deleting items from Firestore is permanent and cannot be undone.
              Only use this if you have items that keep resurrecting after deletion.
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={loadReport}
              disabled={loading}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded transition-colors disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Loading...' : 'Refresh Report'}
            </button>
            {report && (report.stakeholders.deleted > 0 || report.categories.deleted > 0) && (
              <button
                onClick={purgeAllDeleted}
                disabled={loading}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-red-100 hover:bg-red-200 text-red-700 rounded transition-colors disabled:opacity-50"
              >
                <Trash2 size={14} />
                Purge All Soft-Deleted
              </button>
            )}
            {(selectedItems.stakeholders.length > 0 || selectedItems.categories.length > 0) && (
              <button
                onClick={hardDeleteSelected}
                disabled={loading}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded transition-colors disabled:opacity-50"
              >
                <Trash2 size={14} />
                Delete Selected ({selectedItems.stakeholders.length + selectedItems.categories.length})
              </button>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded flex gap-2">
              <XCircle size={16} className="text-red-600 flex-shrink-0 mt-0.5" />
              <span className="text-sm text-red-700">{error}</span>
            </div>
          )}

          {/* Purge Result */}
          {purgeResult && (
            <div className="p-3 bg-green-50 border border-green-200 rounded flex gap-2">
              <CheckCircle size={16} className="text-green-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-green-700">
                Deleted: {purgeResult.stakeholders?.purged || purgeResult.stakeholders?.deleted || 0} stakeholders,
                {' '}{purgeResult.categories?.purged || purgeResult.categories?.deleted || 0} categories
                {purgeResult.meetings && `, ${purgeResult.meetings.purged || 0} meetings`}
              </div>
            </div>
          )}

          {/* Report */}
          {report && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="p-3 bg-gray-50 rounded">
                  <div className="text-2xl font-bold text-gray-900">{report.stakeholders.total}</div>
                  <div className="text-xs text-gray-600">Stakeholders</div>
                  <div className="text-xs text-red-600">{report.stakeholders.deleted} deleted</div>
                </div>
                <div className="p-3 bg-gray-50 rounded">
                  <div className="text-2xl font-bold text-gray-900">{report.categories.total}</div>
                  <div className="text-xs text-gray-600">Categories</div>
                  <div className="text-xs text-red-600">{report.categories.deleted} deleted</div>
                </div>
                <div className="p-3 bg-gray-50 rounded">
                  <div className="text-2xl font-bold text-gray-900">{report.meetings.total}</div>
                  <div className="text-xs text-gray-600">Meetings</div>
                  <div className="text-xs text-red-600">{report.meetings.deleted} deleted</div>
                </div>
              </div>

              {/* Stakeholders List */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-gray-700">Stakeholders ({report.stakeholders.items.length})</span>
                  {report.stakeholders.deleted > 0 && (
                    <button
                      onClick={() => selectAllDeleted('stakeholders')}
                      className="text-xs text-red-600 hover:text-red-800"
                    >
                      Select all deleted
                    </button>
                  )}
                </div>
                <div className="max-h-48 overflow-y-auto border rounded">
                  {report.stakeholders.items.length === 0 ? (
                    <div className="p-3 text-sm text-gray-500 text-center">No stakeholders in Firestore</div>
                  ) : (
                    report.stakeholders.items.map(item => (
                      <label
                        key={item.id}
                        className={`flex items-center gap-2 p-2 border-b last:border-b-0 cursor-pointer hover:bg-gray-50 ${
                          item.deleted ? 'bg-red-50' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedItems.stakeholders.includes(item.id)}
                          onChange={() => toggleSelection('stakeholders', item.id)}
                          className="rounded"
                        />
                        <span className={`text-sm flex-1 ${item.deleted ? 'text-red-700 line-through' : 'text-gray-900'}`}>
                          {item.name}
                        </span>
                        {item.deleted && (
                          <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">DELETED</span>
                        )}
                      </label>
                    ))
                  )}
                </div>
              </div>

              {/* Categories List */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-gray-700">Categories ({report.categories.items.length})</span>
                  {report.categories.deleted > 0 && (
                    <button
                      onClick={() => selectAllDeleted('categories')}
                      className="text-xs text-red-600 hover:text-red-800"
                    >
                      Select all deleted
                    </button>
                  )}
                </div>
                <div className="max-h-48 overflow-y-auto border rounded">
                  {report.categories.items.length === 0 ? (
                    <div className="p-3 text-sm text-gray-500 text-center">No categories in Firestore</div>
                  ) : (
                    report.categories.items.map(item => (
                      <label
                        key={item.id}
                        className={`flex items-center gap-2 p-2 border-b last:border-b-0 cursor-pointer hover:bg-gray-50 ${
                          item.deleted ? 'bg-red-50' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedItems.categories.includes(item.id)}
                          onChange={() => toggleSelection('categories', item.id)}
                          className="rounded"
                        />
                        <span className={`text-sm flex-1 ${item.deleted ? 'text-red-700 line-through' : 'text-gray-900'}`}>
                          {item.label}
                        </span>
                        {item.deleted && (
                          <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">DELETED</span>
                        )}
                      </label>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
