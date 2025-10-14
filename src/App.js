import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Play, Terminal, Monitor, Trash2, Plus, Upload, Server, AlertCircle, CheckCircle, XCircle, Search, Home, Chrome, Database, FolderOpen, Cloud, X, Maximize2, Minimize2 } from 'lucide-react';
import { SessionManager } from './SessionManager';

const XpraFrame = React.memo(({ src }) => {
  const iframeRef = useRef(null);
  const lastSrcRef = useRef(null);

  useEffect(() => {
    if (!iframeRef.current) {
      return;
    }

    if (src) {
      if (src !== lastSrcRef.current) {
        iframeRef.current.src = src;
        lastSrcRef.current = src;
      }
    } else if (lastSrcRef.current) {
      iframeRef.current.src = 'about:blank';
      lastSrcRef.current = null;
    }
  }, [src]);

  if (!src) {
    return null;
  }

  return (
    <iframe
      ref={iframeRef}
      className="w-full h-full"
      title="Xpra Desktop"
      sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
    />
  );
});

XpraFrame.displayName = 'XpraFrame';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000';

const MCPPortal = () => {
  const [currentPage, setCurrentPage] = useState('home');
  const [selectedMCP, setSelectedMCP] = useState(null);
  const [sessionManager] = useState(() => new SessionManager());
  const [sessions, setSessions] = useState([]);
  const [currentSession, setCurrentSession] = useState(null);
  const [task, setTask] = useState('');
  const [consoleOutput, setConsoleOutput] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [customMCPConfig, setCustomMCPConfig] = useState('');
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [hasExecuted, setHasExecuted] = useState(false);
  const [isInitialRunActive, setIsInitialRunActive] = useState(false);

  const xpraUrl = useMemo(() => {
    if (!selectedMCP?.baseUrl || !currentSession?.port?.xpra) {
      return '';
    }
    return `${selectedMCP.baseUrl}:${currentSession.port.xpra}`;
  }, [selectedMCP?.baseUrl, currentSession?.port?.xpra, currentSession?.id]);

  const [mcpServers] = useState([
    {
      id: 'chrome-devtools',
      name: 'Chrome DevTools MCP',
      description: 'Browser automation, web scraping, and DevTools protocol access',
      icon: Chrome,
      category: 'Browser',
      color: 'from-blue-500 to-cyan-500',
      sessionLimit: 4,
      usesDedicatedPorts: true,
      baseUrl: 'http://10.160.13.110',
      features: ['Web Automation', 'Screenshot Capture', 'DOM Manipulation', 'Network Monitoring']
    },
    {
      id: 'filesystem',
      name: 'Filesystem MCP',
      description: 'File system operations, directory management, and file I/O',
      icon: FolderOpen,
      category: 'System',
      color: 'from-green-500 to-emerald-500',
      url: 'http://your-filesystem-server:9000/sse',
      features: ['Read/Write Files', 'Directory Operations', 'File Search', 'Path Management']
    },
    {
      id: 'database',
      name: 'Database MCP',
      description: 'SQL database queries, schema management, and data operations',
      icon: Database,
      category: 'Data',
      color: 'from-purple-500 to-pink-500',
      url: 'http://your-database-server:9001/sse',
      features: ['SQL Queries', 'Schema Inspector', 'Data Migration', 'Backup/Restore']
    },
    {
      id: 'api-integration',
      name: 'API Integration MCP',
      description: 'REST API calls, webhook handling, and external service integration',
      icon: Cloud,
      category: 'Integration',
      color: 'from-orange-500 to-red-500',
      url: 'http://your-api-server:9002/sse',
      features: ['HTTP Requests', 'OAuth Support', 'Webhook Handler', 'API Documentation']
    },
    {
      id: 'git-operations',
      name: 'Git Operations MCP',
      description: 'Git repository management, commits, and version control',
      icon: Server,
      category: 'Development',
      color: 'from-indigo-500 to-blue-500',
      url: 'http://your-git-server:9003/sse',
      features: ['Repo Management', 'Commit History', 'Branch Operations', 'Merge Support']
    },
    {
      id: 'ai-models',
      name: 'AI Models MCP',
      description: 'Access to various AI models for text, image, and audio processing',
      icon: Server,
      category: 'AI/ML',
      color: 'from-pink-500 to-purple-500',
      url: 'http://your-ai-server:9004/sse',
      features: ['Text Generation', 'Image Analysis', 'Audio Processing', 'Model Fine-tuning']
    }
  ]);

  useEffect(() => {
    if (selectedMCP) {
      refreshSessions();
    }
  }, [selectedMCP]);

  const refreshSessions = () => {
    if (selectedMCP) {
      setSessions(sessionManager.getSessions(selectedMCP.id));
    }
  };

  const createNewSession = () => {
    try {
      const session = sessionManager.createSession(selectedMCP.id, selectedMCP);
      setCurrentSession(session);
      refreshSessions();
      addConsoleLog(`Session created: ${selectedMCP.name}`, 'success');
      if (session.port) {
        addConsoleLog(`Allocated ports - Proxy: ${session.port.proxy}, Xpra: ${session.port.xpra}`, 'info');
      }
    } catch (error) {
      addConsoleLog(error.message, 'error');
    }
  };

  const releaseSession = (sessionId) => {
    sessionManager.releaseSession(selectedMCP.id, sessionId);
    if (currentSession?.id === sessionId) {
      setCurrentSession(null);
      setHasExecuted(false);
      setIsMinimized(false);
      setIsInitialRunActive(false);
    }
    refreshSessions();
    addConsoleLog('Session released', 'info');
  };

  const handleSelectSession = (session) => {
    setCurrentSession(session);
    
    // If session already has executed tasks, jump directly to workspace
    // Otherwise, show task modal for new session
    if (session.hasExecuted) {
      setHasExecuted(true);
      setIsMinimized(true);
      addConsoleLog(`Switched to session ${session.id.slice(-6)}`, 'info');
    } else {
      setShowTaskModal(true);
      setHasExecuted(false);
      setIsMinimized(false);
      setTask('');
      setConsoleOutput([]);
      setIsInitialRunActive(false);
    }
  };

  const addConsoleLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setConsoleOutput(prev => [...prev, { timestamp, message, type }]);
  };

  const parseAndLogEvent = (payload) => {
    if (!payload) return;

    try {
      const data = JSON.parse(payload);
      let message = data.message || '';
      let type = 'info';

      switch (data.type) {
        case 'success':
          type = 'success';
          break;
        case 'error':
          type = 'error';
          break;
        case 'result':
          type = 'success';
          message = `Result: ${message}`;
          break;
        default:
          type = 'info';
      }

      addConsoleLog(message, type);
    } catch (error) {
      addConsoleLog(payload, 'info');
    }
  };

  const runTask = async () => {
    if (!currentSession) {
      addConsoleLog('Please create a session first', 'error');
      return;
    }

    if (!task.trim()) {
      addConsoleLog('Please enter a task', 'error');
      return;
    }

    const hasXpraPort = Boolean(currentSession?.port?.xpra);

    if (!hasExecuted && !isInitialRunActive && hasXpraPort) {
      setIsInitialRunActive(true);
      setShowTaskModal(false);
      setIsMinimized(true);
    }

    setIsRunning(true);
    sessionManager.updateActivity(selectedMCP.id, currentSession.id);

    addConsoleLog(`Starting task: ${task}`, 'info');
    
    if (currentSession.port) {
      addConsoleLog(`Using MCP proxy: ${selectedMCP.baseUrl}:${currentSession.port.proxy}/sse`, 'info');
    } else {
      addConsoleLog(`Using MCP server: ${selectedMCP.url}`, 'info');
    }
    
    let streamCompleted = false;

    try {
      const response = await fetch(`${API_BASE_URL}/run-task`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ task }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to execute task');
      }

      if (!response.body) {
        throw new Error('Streaming not supported in this environment');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop();

        for (const part of parts) {
          if (!part.startsWith('data:')) continue;
          const payload = part.replace(/^data:\s*/, '');
          if (payload === '[DONE]') {
            streamCompleted = true;
            break;
          }
          parseAndLogEvent(payload);
        }

        if (streamCompleted) {
          break;
        }
      }

      if (!streamCompleted) {
        // Handle the case where the stream ended without an explicit [DONE]
        parseAndLogEvent(JSON.stringify({ type: 'error', message: 'Stream ended unexpectedly.' }));
      }
    } catch (error) {
      addConsoleLog(`Task execution failed: ${error.message}`, 'error');
    } finally {
      setIsRunning(false);

      if (streamCompleted) {
        setShowTaskModal(false);
        setHasExecuted(true);

        // Mark session as having executed tasks
        currentSession.hasExecuted = true;
        sessionManager.save();

        // Auto minimize after 2 seconds
        setTimeout(() => {
          setIsMinimized(true);
        }, 2000);
      } else if (!hasExecuted) {
        setShowTaskModal(true);
      }

      setIsInitialRunActive(false);
    }
  };

  const uploadCustomMCP = () => {
    try {
      const config = JSON.parse(customMCPConfig);
      addConsoleLog('Custom MCP uploaded successfully', 'success');
      setCustomMCPConfig('');
      setShowUploadModal(false);
    } catch (error) {
      addConsoleLog('Invalid MCP configuration', 'error');
    }
  };

  const getConsoleIcon = (type) => {
    switch (type) {
      case 'success': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'error': return <XCircle className="w-4 h-4 text-red-500" />;
      default: return <AlertCircle className="w-4 h-4 text-blue-500" />;
    }
  };

  const filteredMCPs = mcpServers.filter(mcp =>
    mcp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    mcp.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    mcp.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const groupedMCPs = filteredMCPs.reduce((acc, mcp) => {
    if (!acc[mcp.category]) {
      acc[mcp.category] = [];
    }
    acc[mcp.category].push(mcp);
    return acc;
  }, {});

  // Home Page - MCP Browser
  const renderHomePage = () => (
    <div>
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
          MCP Collection Portal
        </h1>
        <p className="text-gray-400">Browse and connect to Model Context Protocol servers</p>
      </div>

      <div className="flex gap-4 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search MCP servers..."
            className="w-full pl-10 pr-4 py-3 bg-slate-800 text-white rounded-lg border border-slate-600 focus:border-purple-500 focus:outline-none"
          />
        </div>
        <button
          onClick={() => setShowUploadModal(true)}
          className="px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg flex items-center gap-2 transition-colors"
        >
          <Upload className="w-5 h-5" />
          Upload MCP
        </button>
      </div>

      <div className="space-y-8">
        {Object.entries(groupedMCPs).map(([category, mcps]) => (
          <div key={category}>
            <h2 className="text-2xl font-semibold mb-4 text-purple-300">{category}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {mcps.map((mcp) => {
                const Icon = mcp.icon;
                return (
                  <div
                    key={mcp.id}
                    onClick={() => {
                      setSelectedMCP(mcp);
                      setCurrentPage('workspace');
                      setConsoleOutput([]);
                      setTask('');
                      setHasExecuted(false);
                      setIsMinimized(false);
                      setIsInitialRunActive(false);
                    }}
                    className="bg-slate-800 rounded-lg p-6 border border-slate-700 hover:border-purple-500 cursor-pointer transition-all hover:transform hover:scale-105 group"
                  >
                    <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${mcp.color} flex items-center justify-center mb-4`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2 group-hover:text-purple-400 transition-colors">
                      {mcp.name}
                    </h3>
                    <p className="text-gray-400 text-sm mb-4">{mcp.description}</p>
                    <div className="flex flex-wrap gap-2">
                      {mcp.features.slice(0, 2).map((feature, idx) => (
                        <span key={idx} className="px-2 py-1 bg-slate-900 text-xs rounded text-gray-300">
                          {feature}
                        </span>
                      ))}
                      {mcp.features.length > 2 && (
                        <span className="px-2 py-1 bg-slate-900 text-xs rounded text-gray-500">
                          +{mcp.features.length - 2} more
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // Workspace Page
  const renderWorkspacePage = () => {
    if (!selectedMCP) {
      return null;
    }

    const Icon = selectedMCP?.icon || Server;
    const sessionLimit = selectedMCP?.sessionLimit;
    const currentSessionCount = sessions.length;

    return (
      <div className="h-screen flex flex-col">
        <div className="mb-6 flex items-center gap-4">
          <button
            onClick={() => {
              setCurrentPage('home');
              setSelectedMCP(null);
              setCurrentSession(null);
              setHasExecuted(false);
              setIsMinimized(false);
            }}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg flex items-center gap-2 transition-colors"
          >
            <Home className="w-4 h-4" />
            Back
          </button>
          <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${selectedMCP?.color} flex items-center justify-center`}>
            <Icon className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">{selectedMCP?.name}</h1>
            <p className="text-gray-400">{selectedMCP?.description}</p>
          </div>
        </div>

        {/* Session Management - Collapses after task starts */}
        <div className={`transition-all duration-700 ease-in-out overflow-hidden ${
          hasExecuted ? 'max-h-0 opacity-0 mb-0' : 'max-h-96 opacity-100 mb-6'
        }`}>
          <div className="bg-slate-800 rounded-lg p-6 border border-purple-500/20">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Server className="w-5 h-5 text-purple-400" />
                Active Sessions {sessionLimit ? `(${currentSessionCount}/${sessionLimit})` : `(${currentSessionCount})`}
              </h2>
              <button
                onClick={createNewSession}
                disabled={sessionLimit && currentSessionCount >= sessionLimit}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg flex items-center gap-2 transition-colors"
              >
                <Plus className="w-4 h-4" />
                New Session
              </button>
            </div>

            {sessions.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                      currentSession?.id === session.id
                        ? 'bg-purple-900/50 border-purple-500'
                        : 'bg-slate-900 border-slate-700 hover:border-purple-500/50'
                    }`}
                    onClick={() => handleSelectSession(session)}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="font-semibold">Session {session.id.slice(-6)}</div>
                        {session.port && (
                          <div className="text-sm text-gray-400">
                            Port: {session.port.xpra}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          releaseSession(session.id);
                        }}
                        className="p-1 hover:bg-red-500/20 rounded transition-colors"
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(session.createdAt).toLocaleTimeString()}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                No active sessions. Click "New Session" to start.
              </div>
            )}
          </div>
        </div>

        {/* Floating Session Toggle Button */}
        {hasExecuted && sessions.length > 0 && (
          <button
            onClick={() => setHasExecuted(false)}
            className="fixed top-24 right-6 z-40 p-3 bg-purple-600 hover:bg-purple-700 rounded-full shadow-2xl border-2 border-purple-400 transition-all hover:scale-110 group"
            title="Show sessions"
          >
            <Server className="w-5 h-5 text-white" />
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-xs font-bold">
              {sessions.length}
            </span>
            <span className="absolute right-full mr-3 top-1/2 -translate-y-1/2 bg-slate-800 text-white px-3 py-2 rounded-lg text-sm whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              Show {sessions.length} session{sessions.length !== 1 ? 's' : ''}
            </span>
          </button>
        )}

        {/* Main Content Area */}
        {currentSession && currentSession.port && (hasExecuted || isInitialRunActive) && (
          <div className="flex-1 flex gap-4 min-h-0">
            {/* Xpra Window */}
            <div className={`transition-all duration-700 ease-in-out ${isMinimized ? 'flex-1' : 'flex-1'} flex flex-col`}>
              <div className="bg-slate-800 rounded-lg p-3 border border-purple-500/20 flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Monitor className="w-5 h-5 text-purple-400" />
                    Xpra Desktop Session - {selectedMCP.baseUrl}:{currentSession.port.xpra}
                  </h2>
                  <button
                    onClick={() => setIsMinimized(!isMinimized)}
                    className="p-2 hover:bg-slate-700 rounded transition-colors"
                    title={isMinimized ? "Expand sidebar" : "Minimize sidebar"}
                  >
                    {isMinimized ? <Maximize2 className="w-5 h-5 text-purple-400" /> : <Minimize2 className="w-5 h-5 text-gray-400" />}
                  </button>
                </div>
                <div className="bg-black rounded-lg overflow-hidden border-2 border-slate-700 flex-1 shadow-2xl">
                  <XpraFrame src={xpraUrl} />
                </div>
                <p className="text-xs text-gray-500 mt-2 text-center">
                  Remote desktop environment for browser automation
                </p>
              </div>
            </div>

            {/* Minimized Sidebar */}
            <div className={`transition-all duration-700 ease-in-out flex flex-col gap-3 ${
              isMinimized 
                ? 'w-80 opacity-40 hover:opacity-100' 
                : 'w-0 opacity-0 overflow-hidden'
            }`}>
              {isMinimized && (
                <>
                  {/* Task Input */}
                  <div className="bg-slate-800/80 backdrop-blur rounded-lg p-4 border border-purple-500/20 shadow-lg">
                    <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-purple-400" />
                      Task Input
                    </h3>
                    <textarea
                      value={task}
                      onChange={(e) => setTask(e.target.value)}
                      placeholder="Enter new task..."
                      className="w-full h-20 bg-slate-900 text-white p-3 rounded-lg border border-slate-600 focus:border-purple-500 focus:outline-none mb-2 resize-none text-sm"
                      disabled={isRunning}
                    />
                    <button
                      onClick={runTask}
                      disabled={isRunning || !task.trim()}
                      className="w-full py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg flex items-center justify-center gap-2 transition-colors text-sm font-medium"
                    >
                      <Play className="w-4 h-4" />
                      {isRunning ? 'Running...' : 'Execute'}
                    </button>
                  </div>

                  {/* Console Output */}
                  <div className="bg-slate-800/80 backdrop-blur rounded-lg p-4 border border-purple-500/20 flex-1 flex flex-col min-h-0 shadow-lg">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold flex items-center gap-2">
                        <Terminal className="w-4 h-4 text-purple-400" />
                        Console Log
                      </h3>
                      <button
                        onClick={() => setConsoleOutput([])}
                        className="text-xs text-gray-400 hover:text-white transition-colors px-2 py-1 hover:bg-slate-700 rounded"
                      >
                        Clear
                      </button>
                    </div>
                    <div className="bg-slate-900 rounded-lg p-3 flex-1 overflow-y-auto font-mono text-xs space-y-1.5 max-h-96">
                      {consoleOutput.length === 0 ? (
                        <div className="text-gray-600 text-center py-4">No logs yet...</div>
                      ) : (
                        consoleOutput.map((log, idx) => (
                          <div key={idx} className="flex items-start gap-2 leading-tight">
                            <div className="flex-shrink-0 mt-0.5">{getConsoleIcon(log.type)}</div>
                            <span className="text-gray-500 flex-shrink-0">[{log.timestamp}]</span>
                            <span className={`flex-1 break-words ${
                              log.type === 'error' ? 'text-red-400' : 
                              log.type === 'success' ? 'text-green-400' : 
                              'text-gray-300'
                            }`}>
                              {log.message}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white p-6">
      <div className="h-full w-full">
        {currentPage === 'home' && renderHomePage()}
        {currentPage === 'workspace' && renderWorkspacePage()}

        {/* Task Input Modal */}
        {showTaskModal && currentSession && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 backdrop-blur-sm">
            <div className="bg-slate-800 rounded-lg p-6 max-w-2xl w-full mx-4 border border-purple-500/30 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  <Terminal className="w-6 h-6 text-purple-400" />
                  Enter Task
                </h2>
                <button
                  onClick={() => setShowTaskModal(false)}
                  className="p-2 hover:bg-slate-700 rounded transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <textarea
                value={task}
                onChange={(e) => setTask(e.target.value)}
                placeholder="Enter your task here... e.g., 'Find the best restaurant in San Francisco using Google Search'"
                className="w-full h-48 bg-slate-900 text-white p-4 rounded-lg border border-slate-600 focus:border-purple-500 focus:outline-none mb-4 resize-none"
                disabled={isRunning}
                autoFocus
              />

              {/* Console Output in Modal */}
              {consoleOutput.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-purple-400" />
                    Console Output
                  </h3>
                  <div className="bg-slate-900 rounded-lg p-4 max-h-48 overflow-y-auto font-mono text-sm space-y-2">
                    {consoleOutput.map((log, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        {getConsoleIcon(log.type)}
                        <span className="text-gray-500">[{log.timestamp}]</span>
                        <span className={log.type === 'error' ? 'text-red-400' : log.type === 'success' ? 'text-green-400' : 'text-gray-300'}>
                          {log.message}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={runTask}
                  disabled={isRunning || !task.trim()}
                  className="flex-1 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg flex items-center justify-center gap-2 transition-colors font-semibold"
                >
                  <Play className="w-5 h-5" />
                  {isRunning ? 'Executing...' : 'Execute Task'}
                </button>
                <button
                  onClick={() => setShowTaskModal(false)}
                  className="px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Upload Custom MCP Modal */}
        {showUploadModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 backdrop-blur-sm">
            <div className="bg-slate-800 rounded-lg p-6 max-w-2xl w-full mx-4 border border-purple-500/30 shadow-2xl">
              <h2 className="text-2xl font-bold mb-4">Upload Custom MCP Server</h2>
              <textarea
                value={customMCPConfig}
                onChange={(e) => setCustomMCPConfig(e.target.value)}
                placeholder={`{
  "name": "My Custom MCP",
  "description": "Custom MCP server",
  "url": "http://your-server:port/sse",
  "category": "Custom",
  "features": ["Feature 1", "Feature 2"]
}`}
                className="w-full h-64 bg-slate-900 text-white p-4 rounded-lg border border-slate-600 focus:border-purple-500 focus:outline-none font-mono text-sm mb-4"
              />
              <div className="flex gap-3">
                <button
                  onClick={uploadCustomMCP}
                  className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
                >
                  Upload
                </button>
                <button
                  onClick={() => {
                    setShowUploadModal(false);
                    setCustomMCPConfig('');
                  }}
                  className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MCPPortal;
