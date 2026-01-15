/**
 * Firebase Debug Panel
 * Shows diagnostic information for Firebase/Firestore issues
 * Especially useful for diagnosing iOS Safari crashes
 */

import React, { useState, useEffect } from 'react'
import { Bug, RefreshCw, Clipboard, CheckCircle, XCircle, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'

export default function FirebaseDebugPanel() {
  const [firebaseStatus, setFirebaseStatus] = useState(null)
  const [firestoreStatus, setFirestoreStatus] = useState(null)
  const [firebaseLogs, setFirebaseLogs] = useState([])
  const [firestoreLogs, setFirestoreLogs] = useState([])
  const [isExpanded, setIsExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [testing, setTesting] = useState(false)

  const loadDebugInfo = async () => {
    try {
      // Import debug functions lazily
      const firebaseModule = await import('../config/firebase')
      const firestoreModule = await import('../utils/firestoreService')

      // Get Firebase status
      if (firebaseModule.getFirebaseStatus) {
        setFirebaseStatus(firebaseModule.getFirebaseStatus())
      }

      // Get Firebase logs
      if (firebaseModule.getFirebaseDebugLogs) {
        setFirebaseLogs(firebaseModule.getFirebaseDebugLogs())
      }

      // Get Firestore status
      if (firestoreModule.default?.getStatus) {
        setFirestoreStatus(firestoreModule.default.getStatus())
      }

      // Get Firestore logs
      if (firestoreModule.getFirestoreDebugLogs) {
        setFirestoreLogs(firestoreModule.getFirestoreDebugLogs())
      }
    } catch (err) {
      console.error('Error loading debug info:', err)
      setFirebaseLogs([{
        timestamp: new Date().toISOString(),
        message: `Error loading debug info: ${err.message}`,
        type: 'error'
      }])
    }
  }

  useEffect(() => {
    loadDebugInfo()
  }, [])

  const runConnectionTest = async () => {
    setTesting(true)
    setTestResult(null)

    try {
      const firestoreModule = await import('../utils/firestoreService')
      const result = await firestoreModule.default.checkConnection()
      setTestResult(result)
    } catch (err) {
      setTestResult({ connected: false, error: err.message })
    } finally {
      setTesting(false)
      // Refresh logs after test
      loadDebugInfo()
    }
  }

  const copyLogsToClipboard = () => {
    const allLogs = [
      '=== FIREBASE STATUS ===',
      JSON.stringify(firebaseStatus, null, 2),
      '',
      '=== FIRESTORE STATUS ===',
      JSON.stringify(firestoreStatus, null, 2),
      '',
      '=== DEVICE INFO ===',
      `User Agent: ${navigator.userAgent}`,
      `Platform: ${navigator.platform}`,
      `Max Touch Points: ${navigator.maxTouchPoints}`,
      `Online: ${navigator.onLine}`,
      `Standalone PWA: ${window.navigator?.standalone || window.matchMedia('(display-mode: standalone)').matches}`,
      '',
      '=== FIREBASE LOGS ===',
      ...firebaseLogs.map(l => `[${l.timestamp}] [${l.type}] ${l.message}`),
      '',
      '=== FIRESTORE LOGS ===',
      ...firestoreLogs.map(l => `[${l.timestamp}] [${l.type}] ${l.message}`)
    ].join('\n')

    navigator.clipboard.writeText(allLogs).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const StatusBadge = ({ status, label }) => {
    const colors = {
      success: 'bg-green-100 text-green-800',
      error: 'bg-red-100 text-red-800',
      warning: 'bg-yellow-100 text-yellow-800',
      info: 'bg-blue-100 text-blue-800'
    }
    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${colors[status] || colors.info}`}>
        {label}
      </span>
    )
  }

  const LogEntry = ({ log }) => {
    const colors = {
      error: 'text-red-600 bg-red-50',
      warn: 'text-yellow-600 bg-yellow-50',
      info: 'text-gray-600 bg-gray-50'
    }
    return (
      <div className={`text-xs font-mono p-1 rounded mb-1 ${colors[log.type] || colors.info}`}>
        <span className="text-gray-400">{log.timestamp.split('T')[1].split('.')[0]}</span>
        {' '}
        <span>{log.message}</span>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Bug size={18} className="text-gray-600" />
          <span className="font-medium text-gray-900">Firebase Debug Panel</span>
          {firebaseStatus?.hasError && (
            <AlertTriangle size={16} className="text-red-500" />
          )}
        </div>
        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>

      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* Quick Status */}
          <div className="flex flex-wrap gap-2">
            <StatusBadge
              status={firebaseStatus?.isInitialized ? 'success' : 'error'}
              label={firebaseStatus?.isInitialized ? 'Firebase OK' : 'Firebase Not Init'}
            />
            <StatusBadge
              status={firestoreStatus?.isInitialized ? 'success' : 'error'}
              label={firestoreStatus?.isInitialized ? 'Firestore OK' : 'Firestore Not Init'}
            />
            <StatusBadge
              status={firebaseStatus?.isIOS ? 'warning' : 'info'}
              label={firebaseStatus?.isIOS ? 'iOS Device' : 'Non-iOS'}
            />
            {firebaseStatus?.hasError && (
              <StatusBadge status="error" label="Has Errors" />
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={loadDebugInfo}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded transition-colors"
            >
              <RefreshCw size={14} />
              Refresh
            </button>
            <button
              onClick={runConnectionTest}
              disabled={testing}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 rounded transition-colors disabled:opacity-50"
            >
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
            <button
              onClick={copyLogsToClipboard}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-100 hover:bg-green-200 text-green-700 rounded transition-colors"
            >
              <Clipboard size={14} />
              {copied ? 'Copied!' : 'Copy All'}
            </button>
          </div>

          {/* Connection Test Result */}
          {testResult && (
            <div className={`p-3 rounded ${testResult.connected ? 'bg-green-50' : 'bg-red-50'}`}>
              <div className="flex items-center gap-2">
                {testResult.connected ? (
                  <CheckCircle size={16} className="text-green-600" />
                ) : (
                  <XCircle size={16} className="text-red-600" />
                )}
                <span className={testResult.connected ? 'text-green-700' : 'text-red-700'}>
                  {testResult.connected ? 'Connection successful!' : `Connection failed: ${testResult.error || testResult.reason}`}
                </span>
              </div>
            </div>
          )}

          {/* Error Display */}
          {(firebaseStatus?.lastError || firestoreStatus?.lastError) && (
            <div className="p-3 bg-red-50 rounded border border-red-200">
              <div className="font-medium text-red-800 mb-1">Last Error:</div>
              <div className="text-sm text-red-600 font-mono">
                {firebaseStatus?.lastError || firestoreStatus?.lastError}
              </div>
            </div>
          )}

          {/* Device Info */}
          <div className="text-xs text-gray-500 space-y-1">
            <div><strong>Platform:</strong> {navigator.platform}</div>
            <div><strong>Touch Points:</strong> {navigator.maxTouchPoints}</div>
            <div><strong>PWA Mode:</strong> {(window.navigator?.standalone || window.matchMedia('(display-mode: standalone)').matches) ? 'Yes' : 'No'}</div>
            <div className="truncate"><strong>UA:</strong> {navigator.userAgent}</div>
          </div>

          {/* Firebase Logs */}
          <div>
            <div className="font-medium text-gray-700 mb-2 flex items-center justify-between">
              <span>Firebase Logs ({firebaseLogs.length})</span>
            </div>
            <div className="max-h-40 overflow-y-auto bg-gray-50 rounded p-2">
              {firebaseLogs.length === 0 ? (
                <div className="text-xs text-gray-400">No logs yet</div>
              ) : (
                firebaseLogs.map((log, i) => <LogEntry key={i} log={log} />)
              )}
            </div>
          </div>

          {/* Firestore Logs */}
          <div>
            <div className="font-medium text-gray-700 mb-2">
              Firestore Logs ({firestoreLogs.length})
            </div>
            <div className="max-h-40 overflow-y-auto bg-gray-50 rounded p-2">
              {firestoreLogs.length === 0 ? (
                <div className="text-xs text-gray-400">No logs yet</div>
              ) : (
                firestoreLogs.map((log, i) => <LogEntry key={i} log={log} />)
              )}
            </div>
          </div>

          {/* Raw Status */}
          <details className="text-xs">
            <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
              Raw Status (click to expand)
            </summary>
            <pre className="mt-2 p-2 bg-gray-100 rounded overflow-x-auto text-xs">
              {JSON.stringify({ firebase: firebaseStatus, firestore: firestoreStatus }, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  )
}
