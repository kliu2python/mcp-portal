import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Play,
  Terminal,
  Monitor,
  Trash2,
  Plus,
  Upload,
  Server,
  AlertCircle,
  CheckCircle,
  XCircle,
  Search,
  Home,
  Chrome,
  Database,
  FolderOpen,
  Cloud,
  X,
  Maximize2,
  Minimize2,
  Loader2,
  List,
  ClipboardList,
  Tag,
  Filter,
  BarChart3,
  TrendingUp,
  Clock3,
  PieChart,
  Edit3,
  CheckSquare,
  Flag,
  PlayCircle,
  RefreshCcw
} from 'lucide-react';
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
  const [currentTaskId, setCurrentTaskId] = useState(null);
  const taskAbortControllerRef = useRef(null);
  const executionTimerRef = useRef(null);

  const statusOptions = ['Draft', 'Ready', 'Queued', 'Running', 'Blocked'];
  const priorityOptions = ['Critical', 'High', 'Medium', 'Low'];

  const [testCases, setTestCases] = useState(() => [
    {
      id: 'tc-001',
      reference: 'TC-001',
      title: 'Authenticate with valid credentials',
      description: 'Ensure that a user can authenticate with a valid username and password using the TestGPT session.',
      category: 'Authentication',
      tags: ['login', 'smoke'],
      priority: 'High',
      status: 'Ready',
      steps: [
        'Launch the TestGPT Chrome session',
        'Navigate to the login screen',
        'Enter valid credentials',
        'Verify dashboard is displayed'
      ],
      totalRuns: 6,
      passCount: 5,
      failCount: 1,
      averageDuration: 42,
      lastDuration: 44,
      lastRunAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
      lastResult: 'Passed',
      history: []
    },
    {
      id: 'tc-002',
      reference: 'TC-002',
      title: 'Checkout flow with discount code',
      description: 'Validate that a shopper can complete checkout while applying a valid discount coupon.',
      category: 'Checkout',
      tags: ['regression', 'payments'],
      priority: 'Critical',
      status: 'Ready',
      steps: [
        'Add product to cart',
        'Apply discount code',
        'Complete payment',
        'Validate order confirmation'
      ],
      totalRuns: 8,
      passCount: 6,
      failCount: 2,
      averageDuration: 95,
      lastDuration: 101,
      lastRunAt: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(),
      lastResult: 'Failed',
      history: []
    },
    {
      id: 'tc-003',
      reference: 'TC-003',
      title: 'Search results pagination',
      description: 'Confirm that search results paginate and preserve filters when navigating through pages.',
      category: 'Search',
      tags: ['ui', 'regression'],
      priority: 'Medium',
      status: 'Draft',
      steps: [
        'Open search view',
        'Apply filter for availability',
        'Navigate to page two',
        'Verify filters persist'
      ],
      totalRuns: 3,
      passCount: 2,
      failCount: 1,
      averageDuration: 55,
      lastDuration: 49,
      lastRunAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
      lastResult: 'Passed',
      history: []
    }
  ]);

  const emptyTestCaseForm = useMemo(() => ({
    id: null,
    reference: '',
    title: '',
    description: '',
    category: '',
    tags: '',
    priority: 'Medium',
    status: 'Draft',
    steps: ''
  }), []);

  const [testCaseForm, setTestCaseForm] = useState(emptyTestCaseForm);
  const [selectedTestCaseId, setSelectedTestCaseId] = useState(null);
  const [selectedTestCaseIds, setSelectedTestCaseIds] = useState([]);
  const [testCaseFilters, setTestCaseFilters] = useState({
    search: '',
    category: 'all',
    status: 'all',
    priority: 'all',
    tag: 'all'
  });
  const [batchStatus, setBatchStatus] = useState('Ready');
  const [batchPriority, setBatchPriority] = useState('Medium');
  const [executionQueue, setExecutionQueue] = useState([]);
  const [currentExecution, setCurrentExecution] = useState(null);
  const [executionLog, setExecutionLog] = useState([]);

  const xpraUrl = useMemo(() => {
    if (!selectedMCP?.baseUrl || !currentSession?.port?.xpra) {
      return '';
    }
    return `${selectedMCP.baseUrl}:${currentSession.port.xpra}`;
  }, [selectedMCP?.baseUrl, currentSession?.port?.xpra]);

  const [mcpServers] = useState([
    {
      id: 'chrome-devtools',
      name: 'TestGPT',
      description: 'End-to-end test intelligence with session aware Chrome debugging',
      icon: Chrome,
      category: 'Browser',
      color: 'from-blue-500 to-cyan-500',
      sessionLimit: 4,
      usesDedicatedPorts: true,
      baseUrl: 'http://10.160.13.110',
      features: [
        'Test Case Management',
        'Batch Execution',
        'Real-time Step Logging',
        'Quality Insights Dashboard'
      ]
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

  const refreshSessions = useCallback(() => {
    if (selectedMCP) {
      setSessions(sessionManager.getSessions(selectedMCP.id));
    }
  }, [selectedMCP, sessionManager]);

  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

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
        case 'cancelled':
          type = 'info';
          message = message || 'Task cancelled.';
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

  const logExecutionEvent = useCallback((message, type = 'info', testCaseId = null) => {
    const timestamp = new Date().toISOString();
    setExecutionLog(prev => [
      {
        id: `${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp,
        message,
        type,
        testCaseId
      },
      ...prev
    ].slice(0, 200));
  }, []);

  const resetTestCaseForm = useCallback(() => {
    setTestCaseForm(emptyTestCaseForm);
    setSelectedTestCaseId(null);
  }, [emptyTestCaseForm]);

  const handleTestCaseFieldChange = (field, value) => {
    setTestCaseForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const toggleTestCaseSelection = (testCaseId) => {
    setSelectedTestCaseIds(prev =>
      prev.includes(testCaseId)
        ? prev.filter(id => id !== testCaseId)
        : [...prev, testCaseId]
    );
  };

  const toggleSelectAllFiltered = (cases) => {
    if (cases.length === 0) {
      return;
    }

    const allSelected = cases.every(testCase => selectedTestCaseIds.includes(testCase.id));

    if (allSelected) {
      const idsToRemove = new Set(cases.map(testCase => testCase.id));
      setSelectedTestCaseIds(prev => prev.filter(id => !idsToRemove.has(id)));
    } else {
      const existing = new Set(selectedTestCaseIds);
      cases.forEach(testCase => existing.add(testCase.id));
      setSelectedTestCaseIds(Array.from(existing));
    }
  };

  const handleEditTestCase = (testCase) => {
    setSelectedTestCaseId(testCase.id);
    setTestCaseForm({
      id: testCase.id,
      reference: testCase.reference || '',
      title: testCase.title || '',
      description: testCase.description || '',
      category: testCase.category || '',
      tags: (testCase.tags || []).join(', '),
      priority: testCase.priority || 'Medium',
      status: testCase.status || 'Draft',
      steps: (testCase.steps || []).join('\n')
    });
  };

  const handleDeleteTestCase = (testCaseId, reference) => {
    setTestCases(prev => prev.filter(testCase => testCase.id !== testCaseId));
    setSelectedTestCaseIds(prev => prev.filter(id => id !== testCaseId));
    if (selectedTestCaseId === testCaseId) {
      resetTestCaseForm();
    }
    logExecutionEvent(`Deleted ${reference || 'test case'}`, 'error', testCaseId);
  };

  const handleSubmitTestCase = (event) => {
    event.preventDefault();

    const trimmedReference = testCaseForm.reference.trim();
    const parsedTags = testCaseForm.tags
      .split(',')
      .map(tag => tag.trim())
      .filter(Boolean);
    const parsedSteps = testCaseForm.steps
      .split('\n')
      .map(step => step.trim())
      .filter(Boolean);

    if (testCaseForm.id) {
      setTestCases(prev => prev.map(testCase =>
        testCase.id === testCaseForm.id
          ? {
              ...testCase,
              reference: trimmedReference || testCase.reference,
              title: testCaseForm.title || testCase.title,
              description: testCaseForm.description,
              category: testCaseForm.category || testCase.category,
              tags: parsedTags,
              priority: testCaseForm.priority,
              status: testCaseForm.status,
              steps: parsedSteps.length > 0 ? parsedSteps : testCase.steps
            }
          : testCase
      ));

      logExecutionEvent(`Updated ${trimmedReference || testCaseForm.title || 'test case'}`, 'info', testCaseForm.id);
      resetTestCaseForm();
      return;
    }

    let createdReference = trimmedReference;
    const newId = `tc-${Date.now()}`;

    setTestCases(prev => {
      const referenceValue = createdReference || `TC-${String(prev.length + 1).padStart(3, '0')}`;
      createdReference = referenceValue;
      const steps = parsedSteps.length > 0 ? parsedSteps : ['Document scenario steps'];

      return [
        {
          id: newId,
          reference: referenceValue,
          title: testCaseForm.title || 'Untitled test case',
          description: testCaseForm.description,
          category: testCaseForm.category || 'Uncategorized',
          tags: parsedTags,
          priority: testCaseForm.priority,
          status: testCaseForm.status,
          steps,
          totalRuns: 0,
          passCount: 0,
          failCount: 0,
          averageDuration: 0,
          lastDuration: 0,
          lastRunAt: null,
          lastResult: 'Not Run',
          history: []
        },
        ...prev
      ];
    });

    logExecutionEvent(`Created ${createdReference}`, 'success', newId);
    resetTestCaseForm();
  };

  const applyStatusToSelection = () => {
    if (selectedTestCaseIds.length === 0) {
      return;
    }

    setTestCases(prev => prev.map(testCase =>
      selectedTestCaseIds.includes(testCase.id)
        ? { ...testCase, status: batchStatus }
        : testCase
    ));

    logExecutionEvent(`Updated status for ${selectedTestCaseIds.length} test case(s)`, 'info');
  };

  const applyPriorityToSelection = () => {
    if (selectedTestCaseIds.length === 0) {
      return;
    }

    setTestCases(prev => prev.map(testCase =>
      selectedTestCaseIds.includes(testCase.id)
        ? { ...testCase, priority: batchPriority }
        : testCase
    ));

    logExecutionEvent(`Updated priority for ${selectedTestCaseIds.length} test case(s)`, 'info');
  };

  const clearSelectedTestCases = () => {
    setSelectedTestCaseIds([]);
  };

  const queueTestCaseForExecution = (testCaseId) => {
    setExecutionQueue(prev => {
      if (prev.includes(testCaseId) || currentExecution?.testCaseId === testCaseId) {
        return prev;
      }
      return [...prev, testCaseId];
    });

    setTestCases(prev => prev.map(testCase =>
      testCase.id === testCaseId
        ? { ...testCase, status: 'Queued' }
        : testCase
    ));

    const testCase = testCases.find(item => item.id === testCaseId);
    logExecutionEvent(`Queued ${testCase?.reference || 'test case'} for execution`, 'info', testCaseId);
  };

  const handleBatchDelete = () => {
    if (selectedTestCaseIds.length === 0) {
      return;
    }

    setTestCases(prev => prev.filter(testCase => !selectedTestCaseIds.includes(testCase.id)));
    logExecutionEvent(`Deleted ${selectedTestCaseIds.length} test case(s)`, 'error');
    clearSelectedTestCases();
    resetTestCaseForm();
  };

  const handleBatchRun = () => {
    if (selectedTestCaseIds.length === 0) {
      return;
    }

    selectedTestCaseIds.forEach(queueTestCaseForExecution);
    logExecutionEvent(`Queued ${selectedTestCaseIds.length} test case(s) for execution`, 'success');
  };

  const handleExecuteTestCase = (testCaseId) => {
    queueTestCaseForExecution(testCaseId);
  };

  const testCaseById = useMemo(() => {
    const map = {};
    testCases.forEach(testCase => {
      map[testCase.id] = testCase;
    });
    return map;
  }, [testCases]);

  const availableCategories = useMemo(() => {
    const categories = new Set();
    testCases.forEach(testCase => {
      if (testCase.category) {
        categories.add(testCase.category);
      }
    });
    return Array.from(categories);
  }, [testCases]);

  const availableTags = useMemo(() => {
    const tags = new Set();
    testCases.forEach(testCase => {
      (testCase.tags || []).forEach(tag => tags.add(tag));
    });
    return Array.from(tags);
  }, [testCases]);

  const filteredTestCases = useMemo(() => {
    const search = testCaseFilters.search.trim().toLowerCase();
    return testCases.filter(testCase => {
      const matchesSearch = !search
        || (testCase.reference || '').toLowerCase().includes(search)
        || (testCase.title || '').toLowerCase().includes(search)
        || (testCase.description || '').toLowerCase().includes(search)
        || (testCase.tags || []).some(tag => tag.toLowerCase().includes(search));

      const matchesCategory = testCaseFilters.category === 'all' || testCase.category === testCaseFilters.category;
      const matchesStatus = testCaseFilters.status === 'all' || testCase.status === testCaseFilters.status;
      const matchesPriority = testCaseFilters.priority === 'all' || testCase.priority === testCaseFilters.priority;
      const matchesTag = testCaseFilters.tag === 'all' || (testCase.tags || []).includes(testCaseFilters.tag);

      return matchesSearch && matchesCategory && matchesStatus && matchesPriority && matchesTag;
    });
  }, [testCases, testCaseFilters]);

  const getPriorityBadgeClasses = (priority) => {
    switch (priority) {
      case 'Critical':
        return 'bg-red-500/20 text-red-300 border-red-400/40';
      case 'High':
        return 'bg-orange-500/20 text-orange-300 border-orange-400/40';
      case 'Low':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40';
      default:
        return 'bg-blue-500/20 text-blue-200 border-blue-400/40';
    }
  };

  const getStatusBadgeClasses = (status) => {
    switch (status) {
      case 'Running':
        return 'bg-purple-500/20 text-purple-200 border-purple-400/40';
      case 'Queued':
        return 'bg-sky-500/20 text-sky-200 border-sky-400/40';
      case 'Ready':
        return 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40';
      case 'Blocked':
        return 'bg-red-500/20 text-red-200 border-red-400/40';
      default:
        return 'bg-slate-500/20 text-slate-200 border-slate-400/40';
    }
  };

  const computeSuccessRate = (testCase) => {
    if (!testCase.totalRuns) {
      return 0;
    }
    return Math.round((testCase.passCount / testCase.totalRuns) * 100);
  };

  const formatDuration = (duration) => {
    if (!duration) {
      return '—';
    }
    if (duration < 60) {
      return `${duration.toFixed(1)}s`;
    }
    const minutes = Math.floor(duration / 60);
    const seconds = Math.round(duration % 60);
    return `${minutes}m ${seconds}s`;
  };

  const formatPercentage = (value) => {
    if (!Number.isFinite(value)) {
      return '—';
    }
    return `${Math.round(value)}%`;
  };

  const resultStats = useMemo(() => {
    let totalRuns = 0;
    let passCount = 0;
    let failCount = 0;
    let durationAccumulator = 0;
    let durationSamples = 0;
    let maxDuration = 0;
    let latestRun = null;

    testCases.forEach(testCase => {
      const runs = testCase.totalRuns || 0;
      const passes = testCase.passCount || 0;
      const fails = testCase.failCount || 0;
      totalRuns += runs;
      passCount += passes;
      failCount += fails;

      if (runs > 0 && Number.isFinite(testCase.averageDuration)) {
        durationAccumulator += testCase.averageDuration * runs;
        durationSamples += runs;
      }

      if (testCase.lastDuration && testCase.lastDuration > maxDuration) {
        maxDuration = testCase.lastDuration;
      }

      if (testCase.lastRunAt) {
        const runDate = new Date(testCase.lastRunAt);
        if (!latestRun || runDate > latestRun) {
          latestRun = runDate;
        }
      }
    });

    const successRate = totalRuns ? (passCount / totalRuns) * 100 : 0;
    const averageDuration = durationSamples ? durationAccumulator / durationSamples : 0;

    return {
      totalRuns,
      passCount,
      failCount,
      successRate,
      averageDuration,
      maxDuration,
      latestRun,
      running: testCases.filter(testCase => testCase.status === 'Running').length,
      ready: testCases.filter(testCase => testCase.status === 'Ready').length,
      blocked: testCases.filter(testCase => testCase.status === 'Blocked').length,
      draft: testCases.filter(testCase => testCase.status === 'Draft').length
    };
  }, [testCases]);

  const categoryStats = useMemo(() => {
    const stats = new Map();

    testCases.forEach(testCase => {
      if (!testCase.category) {
        return;
      }
      if (!stats.has(testCase.category)) {
        stats.set(testCase.category, {
          category: testCase.category,
          count: 0,
          runs: 0,
          pass: 0
        });
      }

      const entry = stats.get(testCase.category);
      entry.count += 1;
      entry.runs += testCase.totalRuns || 0;
      entry.pass += testCase.passCount || 0;
    });

    return Array.from(stats.values()).map(entry => ({
      ...entry,
      successRate: entry.runs ? (entry.pass / entry.runs) * 100 : 0
    }));
  }, [testCases]);

  const priorityStats = useMemo(() => {
    const stats = new Map();

    testCases.forEach(testCase => {
      if (!testCase.priority) {
        return;
      }
      if (!stats.has(testCase.priority)) {
        stats.set(testCase.priority, {
          priority: testCase.priority,
          count: 0,
          ready: 0,
          blocked: 0,
          runs: 0,
          pass: 0
        });
      }

      const entry = stats.get(testCase.priority);
      entry.count += 1;
      entry.runs += testCase.totalRuns || 0;
      entry.pass += testCase.passCount || 0;
      if (testCase.status === 'Ready') {
        entry.ready += 1;
      }
      if (testCase.status === 'Blocked') {
        entry.blocked += 1;
      }
    });

    return Array.from(stats.values()).map(entry => ({
      ...entry,
      successRate: entry.runs ? (entry.pass / entry.runs) * 100 : 0
    }));
  }, [testCases]);

  const formattedExecutionQueue = useMemo(() => (
    executionQueue.map(id => testCaseById[id]?.reference || 'Test Case')
  ), [executionQueue, testCaseById]);

  const isAllFilteredSelected = filteredTestCases.length > 0
    && filteredTestCases.every(testCase => selectedTestCaseIds.includes(testCase.id));

  const selectedCount = selectedTestCaseIds.length;

  const currentExecutionTestCase = currentExecution
    ? testCaseById[currentExecution.testCaseId]
    : null;

  useEffect(() => {
    return () => {
      if (executionTimerRef.current) {
        clearTimeout(executionTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (currentExecution || executionQueue.length === 0) {
      return;
    }

    const [nextTestCaseId, ...remainingQueue] = executionQueue;
    const testCase = testCases.find(item => item.id === nextTestCaseId);

    setExecutionQueue(remainingQueue);

    if (!testCase) {
      return;
    }

    const steps = (testCase.steps && testCase.steps.length > 0)
      ? testCase.steps
      : ['Prepare environment', 'Execute scenario', 'Validate assertions', 'Teardown'];

    const startedAt = new Date();

    setCurrentExecution({
      testCaseId: nextTestCaseId,
      runId: `${testCase.reference || 'TC'}-${startedAt.getTime()}`,
      steps,
      stepIndex: 0,
      stepResults: [],
      startedAt,
      failed: false
    });

    setTestCases(prev => prev.map(item =>
      item.id === nextTestCaseId
        ? { ...item, status: 'Running' }
        : item
    ));

    logExecutionEvent(`Started execution for ${testCase.reference || testCase.title}`, 'success', nextTestCaseId);
  }, [currentExecution, executionQueue, testCases, logExecutionEvent]);

  useEffect(() => {
    if (!currentExecution) {
      return;
    }

    const { stepIndex, steps } = currentExecution;

    if (stepIndex >= steps.length) {
      const finishedAt = new Date();
      const duration = (finishedAt.getTime() - currentExecution.startedAt.getTime()) / 1000;
      const status = currentExecution.failed ? 'Blocked' : 'Ready';
      const result = currentExecution.failed ? 'Failed' : 'Passed';

      setTestCases(prev => prev.map(testCase => {
        if (testCase.id !== currentExecution.testCaseId) {
          return testCase;
        }

        const totalRuns = (testCase.totalRuns || 0) + 1;
        const passCount = (testCase.passCount || 0) + (result === 'Passed' ? 1 : 0);
        const failCount = (testCase.failCount || 0) + (result === 'Failed' ? 1 : 0);
        const accumulatedDuration = (testCase.averageDuration || 0) * (testCase.totalRuns || 0) + duration;
        const averageDuration = totalRuns ? accumulatedDuration / totalRuns : duration;

        return {
          ...testCase,
          status,
          totalRuns,
          passCount,
          failCount,
          averageDuration,
          lastDuration: duration,
          lastRunAt: finishedAt.toISOString(),
          lastResult: result,
          history: [
            {
              runId: currentExecution.runId,
              status: result,
              finishedAt: finishedAt.toISOString(),
              startedAt: currentExecution.startedAt.toISOString(),
              stepResults: currentExecution.stepResults
            },
            ...(testCase.history || [])
          ].slice(0, 10)
        };
      }));

      logExecutionEvent(
        `Completed execution for ${testCaseById[currentExecution.testCaseId]?.reference || 'test case'}`,
        currentExecution.failed ? 'error' : 'success',
        currentExecution.testCaseId
      );

      setCurrentExecution(null);
      return;
    }

    const timer = setTimeout(() => {
      const stepName = steps[stepIndex];
      const stepSucceeded = Math.random() > 0.2;
      const stepTimestamp = new Date().toISOString();

      const stepResult = {
        name: stepName,
        status: stepSucceeded ? 'Passed' : 'Failed',
        timestamp: stepTimestamp,
        message: stepSucceeded ? 'Step completed successfully' : 'Validation failed',
        duration: Number((Math.random() * 4 + 1).toFixed(1))
      };

      setCurrentExecution(prev => prev ? {
        ...prev,
        stepIndex: prev.stepIndex + 1,
        failed: prev.failed || !stepSucceeded,
        stepResults: [...prev.stepResults, stepResult]
      } : prev);

      logExecutionEvent(
        `${stepName} ${stepSucceeded ? 'passed' : 'failed'}`,
        stepSucceeded ? 'info' : 'error',
        currentExecution.testCaseId
      );
    }, 900);

    executionTimerRef.current = timer;

    return () => {
      if (executionTimerRef.current) {
        clearTimeout(executionTimerRef.current);
      }
    };
  }, [currentExecution, logExecutionEvent, testCaseById]);

  const runTask = async () => {
    if (!currentSession) {
      addConsoleLog('Please create a session first', 'error');
      return;
    }

    if (!task.trim()) {
      addConsoleLog('Please enter a task', 'error');
      return;
    }

    const serverUrl = currentSession.port
      ? `${selectedMCP.baseUrl}:${currentSession.port.proxy}/sse`
      : selectedMCP.url;

    if (!serverUrl) {
      addConsoleLog('Selected MCP does not have a server URL configured', 'error');
      return;
    }

    const hasXpraPort = Boolean(currentSession?.port?.xpra);

    if (!hasExecuted && !isInitialRunActive && hasXpraPort) {
      setIsInitialRunActive(true);
      setShowTaskModal(false);
      setIsMinimized(true);
      setHasExecuted(true);
    }

    setIsRunning(true);
    sessionManager.updateActivity(selectedMCP.id, currentSession.id);

    addConsoleLog(`Starting task: ${task}`, 'info');
    
    if (currentSession.port) {
      addConsoleLog(`Using MCP proxy: ${serverUrl}`, 'info');
    } else {
      addConsoleLog(`Using MCP server: ${serverUrl}`, 'info');
    }
    
    let streamCompleted = false;

    try {
      setCurrentTaskId(null);
      taskAbortControllerRef.current = new AbortController();

      const response = await fetch(`${API_BASE_URL}/run-task`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ task, server_url: serverUrl }),
        signal: taskAbortControllerRef.current.signal,
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
          try {
            const data = JSON.parse(payload);

            if (data.type === 'task') {
              setCurrentTaskId(data.taskId || null);
              if (data.taskId) {
                const shortId = data.taskId.slice(0, 8);
                addConsoleLog(`Task started (ID: ${shortId}...)`, 'info');
              }
              continue;
            }

            parseAndLogEvent(payload);
          } catch (error) {
            parseAndLogEvent(payload);
          }
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
      if (error?.name === 'AbortError') {
        addConsoleLog('Task execution aborted.', 'info');
      } else {
        addConsoleLog(`Task execution failed: ${error.message}`, 'error');
      }
    } finally {
      const sessionAlreadyExecuted = Boolean(currentSession?.hasExecuted);

      setIsRunning(false);
      setCurrentTaskId(null);

      if (streamCompleted) {
        setShowTaskModal(false);
        setHasExecuted(true);

        if (currentSession) {
          currentSession.hasExecuted = true;
          sessionManager.save();
        }

        setTimeout(() => {
          setIsMinimized(true);
        }, 2000);
      } else if (!sessionAlreadyExecuted) {
        setHasExecuted(false);
        setShowTaskModal(true);
      }

      setIsInitialRunActive(false);

      if (taskAbortControllerRef.current) {
        taskAbortControllerRef.current = null;
      }
    }
  };

  const cancelTask = async () => {
    if (!currentTaskId) {
      return;
    }

    if (taskAbortControllerRef.current) {
      taskAbortControllerRef.current.abort();
    }

    try {
      const response = await fetch(`${API_BASE_URL}/tasks/${currentTaskId}/cancel`, {
        method: 'POST',
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to cancel task');
      }

      addConsoleLog('Task cancelled.', 'info');
    } catch (error) {
      addConsoleLog(`Failed to cancel task: ${error.message}`, 'error');
    } finally {
      setIsRunning(false);
      setIsInitialRunActive(false);
      setCurrentTaskId(null);
      if (taskAbortControllerRef.current) {
        taskAbortControllerRef.current = null;
      }
    }
  };

  const uploadCustomMCP = () => {
    try {
      JSON.parse(customMCPConfig);
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
          <div className="flex-1 flex flex-col gap-4 min-h-0">
            <div className="flex flex-col xl:flex-row gap-4 min-h-[400px]">
              {/* Xpra Window */}
              <div className="flex-1 flex flex-col">
                <div className="bg-slate-800 rounded-lg p-3 border border-purple-500/20 flex-1 flex flex-col min-h-0">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-start gap-3">
                      <Monitor className="w-6 h-6 text-purple-400" />
                      <div>
                        <h2 className="text-lg font-semibold">TestGPT Xpra Session</h2>
                        <p className="text-xs text-gray-400">
                          Connected to {selectedMCP.baseUrl}:{currentSession.port.xpra}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setIsMinimized(!isMinimized)}
                      className="p-2 hover:bg-slate-700 rounded transition-colors"
                      title={isMinimized ? 'Hide TestGPT control panel' : 'Show TestGPT control panel'}
                    >
                      {isMinimized ? (
                        <Minimize2 className="w-5 h-5 text-purple-400" />
                      ) : (
                        <Maximize2 className="w-5 h-5 text-gray-400" />
                      )}
                    </button>
                  </div>
                  <div className="bg-black rounded-lg overflow-hidden border-2 border-slate-700 flex-1 shadow-2xl">
                    <XpraFrame src={xpraUrl} />
                  </div>
                  <p className="text-xs text-gray-500 mt-2 text-center">
                    Remote desktop environment for guided browser testing
                  </p>
                </div>
                <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-slate-800/60 border border-purple-500/10 rounded-lg p-3">
                    <div className="text-[11px] text-gray-400 uppercase tracking-wide">Running</div>
                    <div className="text-2xl font-semibold text-white">{resultStats.running}</div>
                  </div>
                  <div className="bg-slate-800/60 border border-purple-500/10 rounded-lg p-3">
                    <div className="text-[11px] text-gray-400 uppercase tracking-wide">Ready</div>
                    <div className="text-2xl font-semibold text-emerald-300">{resultStats.ready}</div>
                  </div>
                  <div className="bg-slate-800/60 border border-purple-500/10 rounded-lg p-3">
                    <div className="text-[11px] text-gray-400 uppercase tracking-wide">Blocked</div>
                    <div className="text-2xl font-semibold text-red-300">{resultStats.blocked}</div>
                  </div>
                  <div className="bg-slate-800/60 border border-purple-500/10 rounded-lg p-3">
                    <div className="text-[11px] text-gray-400 uppercase tracking-wide">Success Rate</div>
                    <div className="text-2xl font-semibold text-purple-200">{formatPercentage(resultStats.successRate)}</div>
                  </div>
                </div>
              </div>

              {/* Test Execution Control Panel */}
              <div className={`transition-all duration-700 ease-in-out flex flex-col gap-3 xl:max-w-[420px] ${
                isMinimized ? 'opacity-100 xl:w-[420px]' : 'opacity-0 xl:w-0 pointer-events-none'
              }`}>
                {isMinimized && (
                  <div className="bg-slate-800/80 backdrop-blur rounded-lg p-4 border border-purple-500/20 shadow-lg flex flex-col gap-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <PlayCircle className="w-5 h-5 text-purple-300" />
                        <div>
                          <h3 className="text-sm font-semibold">Execution Control</h3>
                          <p className="text-xs text-gray-400">Run TestGPT cases with live telemetry.</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleBatchRun}
                          disabled={!selectedCount}
                          className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 disabled:text-gray-400 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors"
                        >
                          <Play className="w-3 h-3" />
                          Run Selected
                        </button>
                        <button
                          type="button"
                          onClick={clearSelectedTestCases}
                          disabled={!selectedCount}
                          className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-gray-500 rounded-lg text-xs font-medium transition-colors"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs text-gray-300">
                      <div className="bg-slate-900 rounded-lg border border-slate-700 p-3">
                        <div className="text-[11px] text-gray-400 uppercase tracking-wide">Selected</div>
                        <div className="text-xl font-semibold text-white">{selectedCount}</div>
                      </div>
                      <div className="bg-slate-900 rounded-lg border border-slate-700 p-3">
                        <div className="text-[11px] text-gray-400 uppercase tracking-wide">Queued</div>
                        <div className="text-xl font-semibold text-purple-200">{executionQueue.length}</div>
                      </div>
                      <div className="bg-slate-900 rounded-lg border border-slate-700 p-3">
                        <div className="text-[11px] text-gray-400 uppercase tracking-wide">Active</div>
                        <div className="text-xl font-semibold text-emerald-300">{currentExecution ? 1 : 0}</div>
                      </div>
                      <div className="bg-slate-900 rounded-lg border border-slate-700 p-3">
                        <div className="text-[11px] text-gray-400 uppercase tracking-wide">Success</div>
                        <div className="text-xl font-semibold text-purple-200">{formatPercentage(resultStats.successRate)}</div>
                      </div>
                    </div>

                    <div className="bg-slate-900 rounded-lg border border-slate-700 p-4 flex flex-col gap-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-xs text-gray-400 uppercase tracking-wide">Current Execution</div>
                          <div className="text-sm font-semibold text-white">
                            {currentExecutionTestCase?.reference || 'Idle'}
                          </div>
                          {currentExecutionTestCase?.title && (
                            <div className="text-xs text-gray-400">{currentExecutionTestCase.title}</div>
                          )}
                        </div>
                        <span className={`px-2 py-1 rounded-full border text-[10px] uppercase tracking-wide ${getStatusBadgeClasses(currentExecution ? 'Running' : 'Ready')}`}>
                          {currentExecution ? 'Running' : 'Idle'}
                        </span>
                      </div>
                      {currentExecution ? (
                        <div className="space-y-2">
                          {currentExecution.steps.map((step, index) => {
                            const result = currentExecution.stepResults[index];
                            const isCompleted = Boolean(result);
                            const isActive = !result && index === currentExecution.stepResults.length;
                            const status = isCompleted ? result.status : isActive ? 'Running' : 'Pending';

                            return (
                              <div
                                key={step}
                                className={`flex items-center gap-2 text-xs rounded-lg border px-2 py-1.5 ${
                                  isCompleted
                                    ? result.status === 'Passed'
                                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
                                      : 'border-red-500/40 bg-red-500/10 text-red-100'
                                    : isActive
                                    ? 'border-purple-500/40 bg-purple-500/10 text-purple-100'
                                    : 'border-slate-700 bg-slate-900 text-gray-300'
                                }`}
                              >
                                <div className="flex-shrink-0">
                                  {isCompleted ? (
                                    result.status === 'Passed' ? (
                                      <CheckCircle className="w-3.5 h-3.5" />
                                    ) : (
                                      <XCircle className="w-3.5 h-3.5" />
                                    )
                                  ) : isActive ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <AlertCircle className="w-3.5 h-3.5" />
                                  )}
                                </div>
                                <div className="flex-1">
                                  <div className="font-medium">{step}</div>
                                  <div className="text-[10px] text-gray-200">
                                    {status}{isCompleted && result.duration ? ` • ${result.duration}s` : ''}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                          <div className="flex items-center justify-between text-[10px] text-gray-400 pt-1 border-t border-slate-800">
                            <span>Started {currentExecution.startedAt.toLocaleTimeString()}</span>
                            <span>{currentExecution.stepResults.length}/{currentExecution.steps.length} steps</span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400">Queue a test case to start an execution run.</p>
                      )}
                    </div>

                    <div className="bg-slate-900 rounded-lg border border-slate-700 p-4 flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <List className="w-4 h-4 text-purple-300" />
                          <span className="text-sm font-semibold">Execution Queue</span>
                        </div>
                        <span className="text-xs text-gray-400">{executionQueue.length} queued</span>
                      </div>
                      <div className="space-y-2 max-h-32 overflow-y-auto pr-1">
                        {formattedExecutionQueue.length === 0 ? (
                          <div className="text-xs text-gray-500 text-center py-2">Queue is empty.</div>
                        ) : (
                          formattedExecutionQueue.map((reference, index) => (
                            <div
                              key={`${reference}-${index}`}
                              className="flex items-center justify-between text-xs text-gray-300 bg-black/40 border border-slate-800 rounded-md px-2 py-1.5"
                            >
                              <span className="font-medium text-purple-200">{reference}</span>
                              <span className="text-[10px] text-gray-500">#{index + 1}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="bg-slate-900 rounded-lg border border-slate-700 p-4 flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Terminal className="w-4 h-4 text-purple-300" />
                          <span className="text-sm font-semibold">Execution Log</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setExecutionLog([])}
                          className="text-xs text-gray-400 hover:text-white transition-colors"
                        >
                          Clear
                        </button>
                      </div>
                      <div className="bg-black/40 rounded-lg p-3 max-h-48 overflow-y-auto space-y-2 font-mono text-[11px]">
                        {executionLog.length === 0 ? (
                          <div className="text-gray-500 text-center py-2">No execution events yet.</div>
                        ) : (
                          executionLog.slice(0, 12).map((log) => (
                            <div key={log.id} className="flex items-start gap-2">
                              <div className="flex-shrink-0 mt-0.5">{getConsoleIcon(log.type)}</div>
                              <div>
                                <div className="text-gray-400">{new Date(log.timestamp).toLocaleTimeString()}</div>
                                <div className="text-gray-200">{log.message}</div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

          </div>
        )}
        {currentSession && (
          <div className="grid grid-cols-1 2xl:grid-cols-3 gap-4 mt-6">
            <div className="2xl:col-span-2 bg-slate-800 rounded-lg border border-purple-500/20 p-6 flex flex-col gap-6">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div className="flex items-center gap-3">
                  <ClipboardList className="w-6 h-6 text-purple-300" />
                  <div>
                    <h3 className="text-2xl font-semibold">Test Case Management</h3>
                    <p className="text-sm text-gray-400">Create, organise, and batch update TestGPT scenarios.</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-slate-900/60 border border-purple-500/10 rounded-lg px-3 py-2 text-right">
                    <div className="text-xs text-gray-400 uppercase tracking-wide">Total Cases</div>
                    <div className="text-lg font-semibold text-white">{testCases.length}</div>
                  </div>
                  <div className="bg-slate-900/60 border border-purple-500/10 rounded-lg px-3 py-2 text-right">
                    <div className="text-xs text-gray-400 uppercase tracking-wide">Success Rate</div>
                    <div className="text-lg font-semibold text-emerald-300">{formatPercentage(resultStats.successRate)}</div>
                  </div>
                </div>
              </div>

              <div className="grid gap-6 xl:grid-cols-3">
                <form onSubmit={handleSubmitTestCase} className="bg-slate-900 rounded-lg border border-slate-700 p-4 flex flex-col gap-3 xl:col-span-1">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-xs text-gray-400 uppercase tracking-wide">
                        {testCaseForm.id ? 'Edit Test Case' : 'New Test Case'}
                      </div>
                      <h4 className="text-lg font-semibold text-white">
                        {testCaseForm.id ? testCaseForm.reference || 'Selected Test Case' : 'Document a scenario'}
                      </h4>
                    </div>
                    {testCaseForm.id && (
                      <button
                        type="button"
                        onClick={resetTestCaseForm}
                        className="text-xs text-purple-200 hover:text-white transition-colors"
                      >
                        Cancel edit
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-gray-400 uppercase tracking-wide block mb-1">Reference</label>
                      <input
                        value={testCaseForm.reference}
                        onChange={(e) => handleTestCaseFieldChange('reference', e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
                        placeholder="TC-010"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-gray-400 uppercase tracking-wide block mb-1">Title</label>
                      <input
                        value={testCaseForm.title}
                        onChange={(e) => handleTestCaseFieldChange('title', e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
                        placeholder="Describe the objective"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-400 uppercase tracking-wide block mb-1">Description</label>
                    <textarea
                      value={testCaseForm.description}
                      onChange={(e) => handleTestCaseFieldChange('description', e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500 resize-none"
                      rows={3}
                      placeholder="Why are we running this scenario?"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-gray-400 uppercase tracking-wide block mb-1">Category</label>
                      <input
                        value={testCaseForm.category}
                        onChange={(e) => handleTestCaseFieldChange('category', e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
                        placeholder="e.g. Authentication"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-gray-400 uppercase tracking-wide block mb-1">Tags</label>
                      <input
                        value={testCaseForm.tags}
                        onChange={(e) => handleTestCaseFieldChange('tags', e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
                        placeholder="smoke, regression"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-gray-400 uppercase tracking-wide block mb-1">Priority</label>
                      <select
                        value={testCaseForm.priority}
                        onChange={(e) => handleTestCaseFieldChange('priority', e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
                      >
                        {priorityOptions.map(option => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-gray-400 uppercase tracking-wide block mb-1">Status</label>
                      <select
                        value={testCaseForm.status}
                        onChange={(e) => handleTestCaseFieldChange('status', e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
                      >
                        {statusOptions.map(option => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-400 uppercase tracking-wide block mb-1">Steps (one per line)</label>
                    <textarea
                      value={testCaseForm.steps}
                      onChange={(e) => handleTestCaseFieldChange('steps', e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
                      rows={4}
                      placeholder="Prepare environment\nExecute action\nValidate results"
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="submit"
                      className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                    >
                      <CheckSquare className="w-4 h-4" />
                      {testCaseForm.id ? 'Update Test Case' : 'Create Test Case'}
                    </button>
                    <button
                      type="button"
                      onClick={resetTestCaseForm}
                      className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                    >
                      <RefreshCcw className="w-4 h-4" />
                      Reset
                    </button>
                  </div>
                </form>

                <div className="xl:col-span-2 flex flex-col gap-4">
                  <div className="bg-slate-900 rounded-lg border border-slate-700 p-4 flex flex-col gap-4">
                    <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
                      <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="text"
                          value={testCaseFilters.search}
                          onChange={(e) => setTestCaseFilters(prev => ({ ...prev, search: e.target.value }))}
                          placeholder="Search by reference, title, or tag"
                          className="w-full pl-10 pr-4 py-2.5 bg-slate-950 text-white rounded-lg border border-slate-700 focus:border-purple-500 focus:outline-none text-sm"
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2">
                          <Filter className="w-4 h-4 text-purple-300" />
                          <span className="text-xs text-gray-400 uppercase tracking-wide">Filters</span>
                        </div>
                        <select
                          value={testCaseFilters.category}
                          onChange={(e) => setTestCaseFilters(prev => ({ ...prev, category: e.target.value }))}
                          className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-purple-500"
                        >
                          <option value="all">All Categories</option>
                          {availableCategories.map(category => (
                            <option key={category} value={category}>{category}</option>
                          ))}
                        </select>
                        <select
                          value={testCaseFilters.status}
                          onChange={(e) => setTestCaseFilters(prev => ({ ...prev, status: e.target.value }))}
                          className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-purple-500"
                        >
                          <option value="all">All Statuses</option>
                          {statusOptions.map(option => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                        <select
                          value={testCaseFilters.priority}
                          onChange={(e) => setTestCaseFilters(prev => ({ ...prev, priority: e.target.value }))}
                          className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-purple-500"
                        >
                          <option value="all">All Priorities</option>
                          {priorityOptions.map(option => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                        <select
                          value={testCaseFilters.tag}
                          onChange={(e) => setTestCaseFilters(prev => ({ ...prev, tag: e.target.value }))}
                          className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-purple-500"
                        >
                          <option value="all">All Tags</option>
                          {availableTags.map(tag => (
                            <option key={tag} value={tag}>{tag}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {selectedCount > 0 && (
                      <div className="bg-black/40 border border-purple-500/20 rounded-lg p-3 flex flex-wrap items-center gap-3 text-xs">
                        <span className="font-semibold text-purple-200">{selectedCount} selected</span>
                        <div className="flex items-center gap-2">
                          <select
                            value={batchStatus}
                            onChange={(e) => setBatchStatus(e.target.value)}
                            className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:border-purple-500"
                          >
                            {statusOptions.map(option => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={applyStatusToSelection}
                            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 rounded-lg text-xs font-semibold transition-colors"
                          >
                            Apply Status
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <select
                            value={batchPriority}
                            onChange={(e) => setBatchPriority(e.target.value)}
                            className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:border-purple-500"
                          >
                            {priorityOptions.map(option => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={applyPriorityToSelection}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-xs font-semibold transition-colors"
                          >
                            Apply Priority
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={handleBatchRun}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1"
                        >
                          <PlayCircle className="w-3 h-3" />
                          Run
                        </button>
                        <button
                          type="button"
                          onClick={handleBatchDelete}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1"
                        >
                          <Trash2 className="w-3 h-3" />
                          Delete
                        </button>
                      </div>
                    )}

                    <div className="overflow-x-auto">
                      {filteredTestCases.length === 0 ? (
                        <div className="text-sm text-gray-400 text-center py-8">No test cases match the current filters.</div>
                      ) : (
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400">
                              <th className="py-2 px-3">
                                <input
                                  type="checkbox"
                                  checked={isAllFilteredSelected}
                                  onChange={() => toggleSelectAllFiltered(filteredTestCases)}
                                  className="h-4 w-4 text-purple-500 bg-slate-900 border-slate-600 rounded"
                                />
                              </th>
                              <th className="py-2 px-3">Test Case</th>
                              <th className="py-2 px-3">Category</th>
                              <th className="py-2 px-3">Priority</th>
                              <th className="py-2 px-3">Status</th>
                              <th className="py-2 px-3">Last Result</th>
                              <th className="py-2 px-3">Success</th>
                              <th className="py-2 px-3">Last Run</th>
                              <th className="py-2 px-3 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800">
                            {filteredTestCases.map((testCase) => (
                              <tr
                                key={testCase.id}
                                className={`hover:bg-slate-900/60 transition-colors ${selectedTestCaseId === testCase.id ? 'bg-purple-500/10 border border-purple-500/40' : ''}`}
                              >
                                <td className="py-3 px-3 align-top">
                                  <input
                                    type="checkbox"
                                    checked={selectedTestCaseIds.includes(testCase.id)}
                                    onChange={() => toggleTestCaseSelection(testCase.id)}
                                    className="h-4 w-4 text-purple-500 bg-slate-900 border-slate-600 rounded"
                                  />
                                </td>
                                <td className="py-3 px-3 align-top">
                                  <div className="font-semibold text-white">{testCase.reference}</div>
                                  <div className="text-xs text-gray-400">{testCase.title}</div>
                                  {testCase.tags && testCase.tags.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-2">
                                      {testCase.tags.map((tag) => (
                                        <span key={tag} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-slate-900 border border-slate-700 rounded-full text-purple-200">
                                          <Tag className="w-3 h-3" />
                                          {tag}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </td>
                                <td className="py-3 px-3 align-top text-xs text-gray-300">{testCase.category || '—'}</td>
                                <td className="py-3 px-3 align-top">
                                  <span className={`px-2 py-1 rounded-full border text-xs ${getPriorityBadgeClasses(testCase.priority)}`}>
                                    {testCase.priority}
                                  </span>
                                </td>
                                <td className="py-3 px-3 align-top">
                                  <span className={`px-2 py-1 rounded-full border text-xs ${getStatusBadgeClasses(testCase.status)}`}>
                                    {testCase.status}
                                  </span>
                                </td>
                                <td className="py-3 px-3 align-top text-xs">
                                  <span className={testCase.lastResult === 'Passed' ? 'text-emerald-300' : testCase.lastResult === 'Failed' ? 'text-red-300' : 'text-gray-300'}>
                                    {testCase.lastResult || 'Not Run'}
                                  </span>
                                </td>
                                <td className="py-3 px-3 align-top text-xs text-gray-300">
                                  {testCase.totalRuns ? `${computeSuccessRate(testCase)}%` : '—'}
                                </td>
                                <td className="py-3 px-3 align-top text-xs text-gray-400">
                                  {testCase.lastRunAt ? new Date(testCase.lastRunAt).toLocaleString() : '—'}
                                </td>
                                <td className="py-3 px-3 align-top">
                                  <div className="flex items-center justify-end gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleEditTestCase(testCase)}
                                      className="p-2 bg-slate-900 hover:bg-slate-800 rounded-lg border border-slate-700 text-purple-200"
                                    >
                                      <Edit3 className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleExecuteTestCase(testCase.id)}
                                      className="p-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-white"
                                    >
                                      <PlayCircle className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteTestCase(testCase.id, testCase.reference)}
                                      className="p-2 bg-red-600 hover:bg-red-700 rounded-lg text-white"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="2xl:col-span-1 bg-slate-800 rounded-lg border border-purple-500/20 p-6 flex flex-col gap-5">
                <div className="flex items-center gap-3">
                  <BarChart3 className="w-6 h-6 text-purple-300" />
                  <div>
                    <h3 className="text-2xl font-semibold">Quality Insights</h3>
                    <p className="text-sm text-gray-400">Understand execution trends across priorities and categories.</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-slate-900/60 border border-purple-500/10 rounded-lg px-3 py-2">
                    <div className="text-xs text-gray-400 uppercase tracking-wide">Total Runs</div>
                    <div className="text-lg font-semibold text-white">{resultStats.totalRuns}</div>
                  </div>
                  <div className="bg-slate-900/60 border border-purple-500/10 rounded-lg px-3 py-2">
                    <div className="text-xs text-gray-400 uppercase tracking-wide">Pass Count</div>
                    <div className="text-lg font-semibold text-emerald-300">{resultStats.passCount}</div>
                  </div>
                  <div className="bg-slate-900/60 border border-purple-500/10 rounded-lg px-3 py-2">
                    <div className="text-xs text-gray-400 uppercase tracking-wide">Fail Count</div>
                    <div className="text-lg font-semibold text-red-300">{resultStats.failCount}</div>
                  </div>
                  <div className="bg-slate-900/60 border border-purple-500/10 rounded-lg px-3 py-2">
                    <div className="text-xs text-gray-400 uppercase tracking-wide flex items-center gap-1">
                      <Clock3 className="w-4 h-4" /> Avg Duration
                    </div>
                    <div className="text-lg font-semibold text-white">{formatDuration(resultStats.averageDuration)}</div>
                  </div>
                  <div className="bg-slate-900/60 border border-purple-500/10 rounded-lg px-3 py-2">
                    <div className="text-xs text-gray-400 uppercase tracking-wide">Longest Run</div>
                    <div className="text-lg font-semibold text-purple-200">{formatDuration(resultStats.maxDuration)}</div>
                  </div>
                  <div className="bg-slate-900/60 border border-purple-500/10 rounded-lg px-3 py-2">
                    <div className="text-xs text-gray-400 uppercase tracking-wide">Last Run</div>
                    <div className="text-lg font-semibold text-white">{resultStats.latestRun ? resultStats.latestRun.toLocaleString() : '—'}</div>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-purple-300" />
                    Success Snapshot
                  </h4>
                  <div className="grid grid-cols-2 gap-3 mt-3 text-xs text-gray-300">
                    <div className="bg-slate-900 rounded-lg border border-slate-700 p-3">
                      <div className="text-gray-400">Ready</div>
                      <div className="text-xl font-semibold text-emerald-300">{resultStats.ready}</div>
                    </div>
                    <div className="bg-slate-900 rounded-lg border border-slate-700 p-3">
                      <div className="text-gray-400">Running</div>
                      <div className="text-xl font-semibold text-purple-200">{resultStats.running}</div>
                    </div>
                    <div className="bg-slate-900 rounded-lg border border-slate-700 p-3">
                      <div className="text-gray-400">Blocked</div>
                      <div className="text-xl font-semibold text-red-300">{resultStats.blocked}</div>
                    </div>
                    <div className="bg-slate-900 rounded-lg border border-slate-700 p-3">
                      <div className="text-gray-400">Draft</div>
                      <div className="text-xl font-semibold text-slate-200">{resultStats.draft}</div>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <PieChart className="w-4 h-4 text-purple-300" />
                    Category Performance
                  </h4>
                  <div className="mt-3 space-y-2">
                    {categoryStats.length === 0 ? (
                      <p className="text-xs text-gray-400">Assign categories to start tracking coverage.</p>
                    ) : (
                      categoryStats.map((category) => (
                        <div key={category.category}>
                          <div className="flex items-center justify-between text-xs text-gray-300">
                            <span>{category.category}</span>
                            <span>{formatPercentage(category.successRate)}</span>
                          </div>
                          <div className="h-2 bg-slate-900 rounded-full overflow-hidden mt-1">
                            <div
                              className="h-full bg-purple-500"
                              style={{ width: `${Math.min(category.successRate, 100)}%` }}
                            />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Flag className="w-4 h-4 text-purple-300" />
                    Priority Focus
                  </h4>
                  <div className="mt-3 space-y-2">
                    {priorityStats.length === 0 ? (
                      <p className="text-xs text-gray-400">Define priorities to monitor risk.</p>
                    ) : (
                      priorityStats.map((priority) => (
                        <div key={priority.priority} className="flex items-center justify-between text-xs text-gray-300 bg-black/40 border border-slate-800 rounded-lg px-3 py-2">
                          <div className="flex items-center gap-2">
                            <CheckSquare className="w-4 h-4 text-purple-300" />
                            <span className="font-semibold text-white">{priority.priority}</span>
                          </div>
                          <div className="text-right">
                            <div>{priority.count} case(s)</div>
                            <div className="text-[10px] text-gray-400">{formatPercentage(priority.successRate)} success</div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
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
                {isRunning && (
                  <button
                    onClick={cancelTask}
                    disabled={!currentTaskId}
                    className="px-6 py-3 bg-red-600 hover:bg-red-700 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2"
                  >
                    <XCircle className="w-5 h-5" />
                    Cancel Task
                  </button>
                )}
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
