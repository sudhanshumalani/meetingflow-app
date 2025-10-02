import React, { useState, useEffect, useRef } from 'react';
import { X, Download, Trash2, Copy, ChevronDown, ChevronUp, Filter } from 'lucide-react';

const MobileDebugPanel = ({ isOpen, onClose }) => {
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState('all'); // 'all', 'error', 'warning', 'info', 'whisper'
  const [isMinimized, setIsMinimized] = useState(false);
  const logContainerRef = useRef(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (!isOpen) return;

    // Store original console methods
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;
    const originalConsoleInfo = console.info;

    // Helper to add log entry
    const addLog = (level, args, emoji) => {
      const timestamp = new Date().toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3
      });

      const message = args.map(arg => {
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg, null, 2);
          } catch (e) {
            return String(arg);
          }
        }
        return String(arg);
      }).join(' ');

      // Detect Whisper/transcription related logs
      const isWhisperLog = message.toLowerCase().includes('whisper') ||
                          message.toLowerCase().includes('transcription') ||
                          message.toLowerCase().includes('recording') ||
                          message.toLowerCase().includes('websocket') ||
                          message.toLowerCase().includes('audio') ||
                          message.includes('🎙️') ||
                          message.includes('📝');

      setLogs(prevLogs => [...prevLogs, {
        id: Date.now() + Math.random(),
        timestamp,
        level,
        message,
        emoji,
        isWhisper: isWhisperLog
      }]);
    };

    // Override console methods
    console.log = (...args) => {
      originalConsoleLog(...args);
      addLog('info', args, '💬');
    };

    console.error = (...args) => {
      originalConsoleError(...args);
      addLog('error', args, '❌');
    };

    console.warn = (...args) => {
      originalConsoleWarn(...args);
      addLog('warning', args, '⚠️');
    };

    console.info = (...args) => {
      originalConsoleInfo(...args);
      addLog('info', args, 'ℹ️');
    };

    // Add initial welcome message
    addLog('info', ['🐛 Mobile Debug Panel activated. All logs will appear here.'], '🐛');

    // Cleanup: restore original console methods
    return () => {
      console.log = originalConsoleLog;
      console.error = originalConsoleError;
      console.warn = originalConsoleWarn;
      console.info = originalConsoleInfo;
    };
  }, [isOpen]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleClearLogs = () => {
    setLogs([]);
  };

  const handleCopyLogs = () => {
    const logText = filteredLogs.map(log =>
      `[${log.timestamp}] ${log.level.toUpperCase()}: ${log.message}`
    ).join('\n');

    navigator.clipboard.writeText(logText).then(() => {
      alert('Logs copied to clipboard!');
    }).catch(err => {
      console.error('Failed to copy logs:', err);
    });
  };

  const handleDownloadLogs = () => {
    const logText = filteredLogs.map(log =>
      `[${log.timestamp}] ${log.level.toUpperCase()}: ${log.message}`
    ).join('\n');

    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `debug-logs-${new Date().toISOString()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const filteredLogs = logs.filter(log => {
    if (filter === 'all') return true;
    if (filter === 'whisper') return log.isWhisper;
    return log.level === filter;
  });

  const getLogColor = (level) => {
    switch (level) {
      case 'error':
        return 'bg-red-50 border-red-200 text-red-900';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200 text-yellow-900';
      case 'info':
        return 'bg-blue-50 border-blue-200 text-blue-900';
      default:
        return 'bg-gray-50 border-gray-200 text-gray-900';
    }
  };

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 z-[9999] bg-black bg-opacity-50 flex items-end transition-all ${
      isMinimized ? 'pointer-events-none' : ''
    }`}>
      {/* Debug Panel */}
      <div className={`w-full bg-white rounded-t-2xl shadow-2xl transition-all duration-300 ${
        isMinimized ? 'h-14' : 'h-[80vh]'
      } flex flex-col pointer-events-auto`}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-t-2xl">
          <div className="flex items-center gap-2">
            <span className="text-xl">🐛</span>
            <h3 className="font-bold text-white">Debug Console</h3>
            <span className="text-xs bg-white bg-opacity-20 text-white px-2 py-1 rounded-full">
              {filteredLogs.length} logs
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMinimized(!isMinimized)}
              className="p-2 text-white hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors"
              title={isMinimized ? "Expand" : "Minimize"}
            >
              {isMinimized ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </button>
            <button
              onClick={onClose}
              className="p-2 text-white hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors"
              title="Close"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {!isMinimized && (
          <>
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-2 bg-gray-100 border-b border-gray-200">
              {/* Filter Buttons */}
              <div className="flex items-center gap-1 overflow-x-auto">
                <button
                  onClick={() => setFilter('all')}
                  className={`px-3 py-1 text-xs rounded-full transition-colors whitespace-nowrap ${
                    filter === 'all'
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  All ({logs.length})
                </button>
                <button
                  onClick={() => setFilter('whisper')}
                  className={`px-3 py-1 text-xs rounded-full transition-colors whitespace-nowrap ${
                    filter === 'whisper'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  🎙️ Whisper ({logs.filter(l => l.isWhisper).length})
                </button>
                <button
                  onClick={() => setFilter('error')}
                  className={`px-3 py-1 text-xs rounded-full transition-colors whitespace-nowrap ${
                    filter === 'error'
                      ? 'bg-red-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  ❌ Errors ({logs.filter(l => l.level === 'error').length})
                </button>
                <button
                  onClick={() => setFilter('warning')}
                  className={`px-3 py-1 text-xs rounded-full transition-colors whitespace-nowrap ${
                    filter === 'warning'
                      ? 'bg-yellow-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  ⚠️ Warnings ({logs.filter(l => l.level === 'warning').length})
                </button>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setAutoScroll(!autoScroll)}
                  className={`p-1.5 text-xs rounded transition-colors ${
                    autoScroll
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-200 text-gray-600'
                  }`}
                  title="Auto-scroll"
                >
                  📜
                </button>
                <button
                  onClick={handleCopyLogs}
                  className="p-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors"
                  title="Copy logs"
                >
                  <Copy size={14} />
                </button>
                <button
                  onClick={handleDownloadLogs}
                  className="p-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors"
                  title="Download logs"
                >
                  <Download size={14} />
                </button>
                <button
                  onClick={handleClearLogs}
                  className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                  title="Clear logs"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {/* Log Container */}
            <div
              ref={logContainerRef}
              className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-50"
            >
              {filteredLogs.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-400">
                  <div className="text-center">
                    <p className="text-lg mb-2">📭</p>
                    <p className="text-sm">No logs to display</p>
                    {filter !== 'all' && (
                      <button
                        onClick={() => setFilter('all')}
                        className="mt-2 text-xs text-purple-600 hover:underline"
                      >
                        Show all logs
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                filteredLogs.map(log => (
                  <div
                    key={log.id}
                    className={`p-2 rounded-lg border text-xs ${getLogColor(log.level)} ${
                      log.isWhisper ? 'border-l-4 border-l-blue-500' : ''
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="flex-shrink-0">{log.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-gray-500 font-mono text-[10px]">
                            {log.timestamp}
                          </span>
                          {log.isWhisper && (
                            <span className="bg-blue-500 text-white px-1.5 py-0.5 rounded text-[9px] font-semibold">
                              WHISPER
                            </span>
                          )}
                          <span className={`uppercase font-semibold text-[9px] ${
                            log.level === 'error' ? 'text-red-700' :
                            log.level === 'warning' ? 'text-yellow-700' :
                            'text-gray-600'
                          }`}>
                            {log.level}
                          </span>
                        </div>
                        <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed">
                          {log.message}
                        </pre>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer Info */}
            <div className="px-4 py-2 bg-gray-100 border-t border-gray-200 text-xs text-gray-600 text-center">
              💡 Tip: Use Whisper filter to see only recording-related logs
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default MobileDebugPanel;
