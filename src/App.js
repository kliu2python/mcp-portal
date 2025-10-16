import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  BarChart3,
  BookOpen,
  CheckCircle,
  ClipboardList,
  Edit3,
  Loader2,
  Monitor,
  Play,
  Plus,
  RefreshCcw,
  Settings,
  StopCircle,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000';

const tabs = [
  { id: 'testCases', label: 'MCP Task Hub', icon: ClipboardList },
  { id: 'quality', label: 'Quality Insights', icon: BarChart3 },
  { id: 'models', label: 'Connections', icon: Settings },
  { id: 'prompts', label: 'Prompt Library', icon: BookOpen },
];

const priorities = ['Critical', 'High', 'Medium', 'Low'];
const statuses = ['Draft', 'Ready', 'Queued', 'Running', 'Blocked'];

const emptyTestCaseForm = {
  reference: '',
  title: '',
  description: '',
  category: '',
  priority: 'Medium',
  status: 'Draft',
  tags: '',
  steps: '',
};

const emptyRunForm = {
  promptId: '',
  promptOverride: '',
  modelId: '',
};

const emptyPromptForm = {
  id: null,
  name: '',
  description: '',
  template: '',
  isSystem: false,
};

const emptyTaskForm = {
  task: '',
  promptId: '',
  promptText: '',
  modelId: '',
};

const emptyLlmForm = {
  id: null,
  name: '',
  baseUrl: '',
  apiKey: '',
  modelName: '',
  description: '',
  isSystem: false,
};

const XpraFrame = React.memo(({ src }) => {
  if (!src) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-400">
        Xpra stream will appear here when available.
      </div>
    );
  }

  return (
    <iframe
      title="Xpra session"
      src={src}
      className="h-full w-full rounded-md border border-slate-700 bg-black"
      sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
    />
  );
});

XpraFrame.displayName = 'XpraFrame';

const messageVariants = {
  success: 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40',
  error: 'bg-rose-500/20 text-rose-200 border border-rose-400/40',
  info: 'bg-slate-500/20 text-slate-200 border border-slate-400/40',
};

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function formatDuration(duration) {
  if (!duration && duration !== 0) return '—';
  if (duration < 60) return `${duration.toFixed(1)}s`;
  const minutes = Math.floor(duration / 60);
  const seconds = Math.round(duration % 60);
  return `${minutes}m ${seconds}s`;
}

function App() {
  const [activeTab, setActiveTab] = useState('testCases');
  const [testCases, setTestCases] = useState([]);
  const [modelConfigs, setModelConfigs] = useState([]);
  const [llmModels, setLlmModels] = useState([]);
  const [prompts, setPrompts] = useState([]);
  const [testRuns, setTestRuns] = useState([]);
  const [qualityInsights, setQualityInsights] = useState(null);
  const [message, setMessage] = useState(null);
  const [isLoading, setIsLoading] = useState({
    testCases: false,
    models: false,
    llms: false,
    runs: false,
    insights: false,
    queue: false,
    prompts: false,
  });
  const [testCaseForm, setTestCaseForm] = useState(emptyTestCaseForm);
  const [editingTestCaseId, setEditingTestCaseId] = useState(null);
  const [testCaseSearch, setTestCaseSearch] = useState('');
  const [selectedTestCaseIds, setSelectedTestCaseIds] = useState([]);
  const [runForm, setRunForm] = useState(emptyRunForm);
  const [promptForm, setPromptForm] = useState(emptyPromptForm);
  const [llmForm, setLlmForm] = useState(emptyLlmForm);
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [taskForm, setTaskForm] = useState(emptyTaskForm);
  const [taskLogs, setTaskLogs] = useState([]);
  const [taskStatus, setTaskStatus] = useState(null);
  const [activeTaskId, setActiveTaskId] = useState(null);
  const [taskServerInfo, setTaskServerInfo] = useState({ serverUrl: '', xpraUrl: '' });
  const [isTaskStreaming, setIsTaskStreaming] = useState(false);
  const [testCaseView, setTestCaseView] = useState('catalog');
  const [isSavingLlm, setIsSavingLlm] = useState(false);
  const [isTestCaseModalOpen, setIsTestCaseModalOpen] = useState(false);
  const [manualRunRecord, setManualRunRecord] = useState(null);
  const taskAbortControllerRef = useRef(null);

  const showMessage = useCallback((type, text) => {
    setMessage({ type, text });
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [message]);

  const fetchTestCases = useCallback(async () => {
    setIsLoading((prev) => ({ ...prev, testCases: true }));
    try {
      const response = await fetch(`${API_BASE_URL}/test-cases`);
      if (!response.ok) {
        throw new Error('Failed to load test cases');
      }
      const data = await response.json();
      setTestCases(data);
    } catch (error) {
      showMessage('error', error.message);
    } finally {
      setIsLoading((prev) => ({ ...prev, testCases: false }));
    }
  }, [showMessage]);

  const fetchModelConfigs = useCallback(async () => {
    setIsLoading((prev) => ({ ...prev, models: true }));
    try {
      const response = await fetch(`${API_BASE_URL}/model-configs`);
      if (!response.ok) {
        throw new Error('Failed to load model configurations');
      }
      const data = await response.json();
      setModelConfigs(data);
    } catch (error) {
      showMessage('error', error.message);
    } finally {
      setIsLoading((prev) => ({ ...prev, models: false }));
    }
  }, [showMessage]);

  const fetchLlmModels = useCallback(async () => {
    setIsLoading((prev) => ({ ...prev, llms: true }));
    try {
      const response = await fetch(`${API_BASE_URL}/llm-models`);
      if (!response.ok) {
        throw new Error('Failed to load LLM models');
      }
      const data = await response.json();
      setLlmModels(data);
    } catch (error) {
      showMessage('error', error.message);
    } finally {
      setIsLoading((prev) => ({ ...prev, llms: false }));
    }
  }, [showMessage]);

  const fetchPrompts = useCallback(async () => {
    setIsLoading((prev) => ({ ...prev, prompts: true }));
    try {
      const response = await fetch(`${API_BASE_URL}/prompts`);
      if (!response.ok) {
        throw new Error('Failed to load prompts');
      }
      const data = await response.json();
      setPrompts(data);
    } catch (error) {
      showMessage('error', error.message);
    } finally {
      setIsLoading((prev) => ({ ...prev, prompts: false }));
    }
  }, [showMessage]);

  const fetchTestRuns = useCallback(
    async (silent = false) => {
      if (!silent) {
        setIsLoading((prev) => ({ ...prev, runs: true }));
      }
      try {
        const response = await fetch(`${API_BASE_URL}/test-runs`);
        if (!response.ok) {
          throw new Error('Failed to load test runs');
        }
        const data = await response.json();
        setTestRuns(data);
      } catch (error) {
        showMessage('error', error.message);
      } finally {
        if (!silent) {
          setIsLoading((prev) => ({ ...prev, runs: false }));
        }
      }
    },
    [showMessage]
  );

  const fetchQualityInsights = useCallback(async () => {
    setIsLoading((prev) => ({ ...prev, insights: true }));
    try {
      const response = await fetch(`${API_BASE_URL}/quality-insights`);
      if (!response.ok) {
        throw new Error('Failed to load quality insights');
      }
      const data = await response.json();
      setQualityInsights(data);
    } catch (error) {
      showMessage('error', error.message);
    } finally {
      setIsLoading((prev) => ({ ...prev, insights: false }));
    }
  }, [showMessage]);

  const refreshAll = useCallback(() => {
    fetchTestCases();
    fetchModelConfigs();
    fetchLlmModels();
    fetchPrompts();
    fetchTestRuns();
    fetchQualityInsights();
  }, [
    fetchLlmModels,
    fetchPrompts,
    fetchQualityInsights,
    fetchModelConfigs,
    fetchTestCases,
    fetchTestRuns,
  ]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    return () => {
      if (taskAbortControllerRef.current) {
        taskAbortControllerRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchTestRuns(true);
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchTestRuns]);

  useEffect(() => {
    if (testRuns.length === 0) {
      setSelectedRunId(null);
      return;
    }
    if (selectedRunId && testRuns.some((run) => run.id === selectedRunId)) {
      return;
    }
    const preferred = testRuns.find((run) => run.status === 'running') || testRuns[0];
    setSelectedRunId(preferred.id);
  }, [selectedRunId, testRuns]);

  const filteredTestCases = useMemo(() => {
    if (!testCaseSearch.trim()) {
      return testCases;
    }
    const query = testCaseSearch.trim().toLowerCase();
    return testCases.filter((testCase) =>
      [
        testCase.reference,
        testCase.title,
        testCase.description,
        testCase.category,
      ]
        .filter(Boolean)
        .some((field) => field.toLowerCase().includes(query)) ||
      (testCase.tags || []).some((tag) => tag.toLowerCase().includes(query))
    );
  }, [testCaseSearch, testCases]);

  const toggleTestCaseSelection = (testCaseId) => {
    setSelectedTestCaseIds((prev) =>
      prev.includes(testCaseId)
        ? prev.filter((id) => id !== testCaseId)
        : [...prev, testCaseId]
    );
  };

  const toggleSelectAllFiltered = () => {
    const filteredIds = filteredTestCases.map((testCase) => testCase.id);
    if (filteredIds.length === 0) return;
    const allSelected = filteredIds.every((id) => selectedTestCaseIds.includes(id));
    if (allSelected) {
      setSelectedTestCaseIds((prev) => prev.filter((id) => !filteredIds.includes(id)));
    } else {
      setSelectedTestCaseIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
    }
  };

  const handleTestCaseFieldChange = (field, value) => {
    setTestCaseForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleTestCaseSubmit = async (event) => {
    event.preventDefault();
    const tags = testCaseForm.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    const steps = testCaseForm.steps
      .split('\n')
      .map((step) => step.trim())
      .filter(Boolean);

    const payload = {
      reference: testCaseForm.reference,
      title: testCaseForm.title,
      description: testCaseForm.description,
      category: testCaseForm.category,
      priority: testCaseForm.priority,
      status: testCaseForm.status,
      tags,
      steps,
    };

    try {
      const url = editingTestCaseId
        ? `${API_BASE_URL}/test-cases/${editingTestCaseId}`
        : `${API_BASE_URL}/test-cases`;
      const method = editingTestCaseId ? 'PUT' : 'POST';
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to save test case');
      }

      showMessage('success', editingTestCaseId ? 'Updated test case' : 'Created test case');
      closeTestCaseModal();
      fetchTestCases();
      fetchQualityInsights();
    } catch (error) {
      showMessage('error', error.message);
    }
  };

  const handleTestCaseEdit = (testCase) => {
    setEditingTestCaseId(testCase.id);
    setTestCaseForm({
      reference: testCase.reference,
      title: testCase.title,
      description: testCase.description || '',
      category: testCase.category || '',
      priority: testCase.priority || 'Medium',
      status: testCase.status || 'Draft',
      tags: (testCase.tags || []).join(', '),
      steps: (testCase.steps || []).join('\n'),
    });
    setIsTestCaseModalOpen(true);
  };

  const handleTestCaseDelete = async (testCaseId) => {
    if (!window.confirm('Delete this test case?')) return;
    try {
      const response = await fetch(`${API_BASE_URL}/test-cases/${testCaseId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to delete test case');
      }
      showMessage('success', 'Deleted test case');
      setSelectedTestCaseIds((prev) => prev.filter((id) => id !== testCaseId));
      if (editingTestCaseId === testCaseId) {
        setEditingTestCaseId(null);
        setTestCaseForm(emptyTestCaseForm);
      }
      fetchTestCases();
      fetchQualityInsights();
    } catch (error) {
      showMessage('error', error.message);
    }
  };

  const resetTestCaseForm = () => {
    setEditingTestCaseId(null);
    setTestCaseForm(emptyTestCaseForm);
  };

  const openCreateTestCaseModal = () => {
    resetTestCaseForm();
    setIsTestCaseModalOpen(true);
  };

  const closeTestCaseModal = () => {
    resetTestCaseForm();
    setIsTestCaseModalOpen(false);
  };

  const handleRunFormChange = (field, value) => {
    setRunForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleRunQueue = async () => {
    if (selectedTestCaseIds.length === 0) {
      showMessage('info', 'Select at least one task to run');
      return;
    }

    if (!selectedQueueModel) {
      showMessage('error', 'Select an LLM model to use for the run queue.');
      return;
    }

    const matchingConfig = modelConfigs.find((config) => {
      const params = config.parameters || {};
      return (
        config.provider === 'llm-model' &&
        String(params.llm_model_id) === String(selectedQueueModel.id)
      );
    });

    let payload = {
      test_case_ids: selectedTestCaseIds,
    };

    if (matchingConfig) {
      payload = { ...payload, model_config_id: Number(matchingConfig.id) };
    } else {
      payload = {
        ...payload,
        model_config: {
          name: `LLM · ${selectedQueueModel.name}`,
          provider: 'llm-model',
          description: `Auto-generated configuration for ${selectedQueueModel.name}`,
          parameters: { llm_model_id: selectedQueueModel.id },
        },
      };
    }

    if (runForm.promptId) {
      payload = { ...payload, prompt_id: Number(runForm.promptId) };
    }
    if (runForm.promptOverride && runForm.promptOverride.trim()) {
      payload = { ...payload, prompt: runForm.promptOverride.trim() };
    }

    setIsLoading((prev) => ({ ...prev, queue: true }));
    try {
      const response = await fetch(`${API_BASE_URL}/test-runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to queue test runs');
      }
      await response.json();
      showMessage('success', 'Queued test runs');
      setSelectedTestCaseIds([]);
      setRunForm((prev) => ({ ...emptyRunForm, modelId: prev.modelId }));
      fetchTestRuns();
      fetchQualityInsights();
      fetchModelConfigs();
    } catch (error) {
      showMessage('error', error.message);
    } finally {
      setIsLoading((prev) => ({ ...prev, queue: false }));
    }
  };

  const selectedRun = useMemo(
    () => testRuns.find((run) => run.id === selectedRunId) || null,
    [selectedRunId, testRuns]
  );

  const groupedRuns = useMemo(() => {
    return {
      draft: testRuns.filter((run) => run.status === 'draft'),
      running: testRuns.filter((run) => run.status === 'running'),
      pending: testRuns.filter((run) => run.status === 'pending'),
      queued: testRuns.filter((run) => run.status === 'queued'),
      completed: testRuns.filter((run) => run.status === 'completed'),
      failed: testRuns.filter((run) => run.status === 'failed'),
    };
  }, [testRuns]);

  const defaultModelConfig = useMemo(() => {
    if (modelConfigs.length === 0) {
      return null;
    }
    const explicitDefault = modelConfigs.find((config) => config.is_default);
    if (explicitDefault) {
      return explicitDefault;
    }
    return modelConfigs[modelConfigs.length - 1];
  }, [modelConfigs]);

  const defaultLlmModel = useMemo(() => {
    if (llmModels.length === 0) {
      return null;
    }
    return llmModels.find((model) => model.is_system) || llmModels[0];
  }, [llmModels]);

  const selectedQueueModel = useMemo(() => {
    if (llmModels.length === 0) {
      return null;
    }
    return llmModels.find((model) => String(model.id) === runForm.modelId) || null;
  }, [llmModels, runForm.modelId]);

  const selectedManualModel = useMemo(() => {
    if (llmModels.length === 0) {
      return null;
    }
    return llmModels.find((model) => String(model.id) === taskForm.modelId) || null;
  }, [llmModels, taskForm.modelId]);

  useEffect(() => {
    if (llmModels.length === 0) {
      setRunForm((prev) => ({ ...prev, modelId: '' }));
      setTaskForm((prev) => ({ ...prev, modelId: '' }));
      return;
    }
    const defaultId = defaultLlmModel ? String(defaultLlmModel.id) : String(llmModels[0].id);
    const ids = llmModels.map((model) => String(model.id));
    setRunForm((prev) => {
      if (prev.modelId && ids.includes(prev.modelId)) {
        return prev;
      }
      return { ...prev, modelId: defaultId };
    });
    setTaskForm((prev) => {
      if (prev.modelId && ids.includes(prev.modelId)) {
        return prev;
      }
      return { ...prev, modelId: defaultId };
    });
  }, [llmModels, defaultLlmModel]);

  const handlePromptSubmit = async (event) => {
    event.preventDefault();
    if (!promptForm.name.trim() || !promptForm.template.trim()) {
      showMessage('info', 'Prompt name and template are required');
      return;
    }

    const payload = {
      name: promptForm.name.trim(),
      description: promptForm.description.trim() || '',
      template: promptForm.template,
    };

    try {
      const url = promptForm.id
        ? `${API_BASE_URL}/prompts/${promptForm.id}`
        : `${API_BASE_URL}/prompts`;
      const method = promptForm.id ? 'PUT' : 'POST';
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to save prompt');
      }
      await response.json();
      showMessage('success', promptForm.id ? 'Updated prompt' : 'Created prompt');
      setPromptForm(emptyPromptForm);
      fetchPrompts();
    } catch (error) {
      showMessage('error', error.message);
    }
  };

  const handlePromptEdit = (prompt) => {
    setPromptForm({
      id: prompt.id,
      name: prompt.name,
      description: prompt.description || '',
      template: prompt.template,
      isSystem: prompt.is_system,
    });
  };

  const handlePromptDelete = async (prompt) => {
    if (prompt.is_system) {
      showMessage('info', 'System prompts cannot be deleted');
      return;
    }
    if (!window.confirm('Delete this prompt?')) return;
    try {
      const response = await fetch(`${API_BASE_URL}/prompts/${prompt.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to delete prompt');
      }
      showMessage('success', 'Deleted prompt');
      if (promptForm.id === prompt.id) {
        setPromptForm(emptyPromptForm);
      }
      fetchPrompts();
    } catch (error) {
      showMessage('error', error.message);
    }
  };

  const handleLlmSubmit = async (event) => {
    event.preventDefault();
    if (!llmForm.name.trim() || !llmForm.baseUrl.trim() || !llmForm.modelName.trim()) {
      showMessage('info', 'Name, base URL, and model name are required');
      return;
    }
    if (!llmForm.id && !llmForm.apiKey.trim()) {
      showMessage('info', 'API key is required for a new LLM connection');
      return;
    }

    const payload = {
      name: llmForm.name.trim(),
      base_url: llmForm.baseUrl.trim(),
      api_key: llmForm.apiKey.trim(),
      model_name: llmForm.modelName.trim(),
      description: llmForm.description.trim() || '',
    };

    if (llmForm.id && !payload.api_key) {
      delete payload.api_key;
    }

    try {
      setIsSavingLlm(true);
      if (!llmForm.id) {
        const verifyResponse = await fetch(`${API_BASE_URL}/llm-models/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            base_url: payload.base_url,
            api_key: payload.api_key,
            model_name: payload.model_name,
          }),
        });
        if (!verifyResponse.ok) {
          const errorText = await verifyResponse.text();
          throw new Error(errorText || 'Unable to verify LLM connection');
        }
      }

      const url = llmForm.id
        ? `${API_BASE_URL}/llm-models/${llmForm.id}`
        : `${API_BASE_URL}/llm-models`;
      const method = llmForm.id ? 'PUT' : 'POST';
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to save LLM model');
      }
      await response.json();
      showMessage('success', llmForm.id ? 'Updated LLM model' : 'Added LLM model');
      setLlmForm(emptyLlmForm);
      fetchLlmModels();
    } catch (error) {
      showMessage('error', error.message);
    } finally {
      setIsSavingLlm(false);
    }
  };

  const handleLlmEdit = (model) => {
    if (model.is_system) {
      showMessage('info', 'System models are managed via configuration');
      return;
    }
    setLlmForm({
      id: model.id,
      name: model.name,
      baseUrl: model.base_url,
      apiKey: '',
      modelName: model.model_name,
      description: model.description || '',
      isSystem: model.is_system,
    });
  };

  const handleLlmDelete = async (model) => {
    if (model.is_system) {
      showMessage('info', 'System models cannot be deleted');
      return;
    }
    if (!window.confirm('Delete this LLM model?')) return;
    try {
      const response = await fetch(`${API_BASE_URL}/llm-models/${model.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to delete LLM model');
      }
      showMessage('success', 'Deleted LLM model');
      if (llmForm.id === model.id) {
        setLlmForm(emptyLlmForm);
      }
      fetchLlmModels();
    } catch (error) {
      showMessage('error', error.message);
    }
  };

  const handleTaskStart = async (event) => {
    event.preventDefault();
    if (!taskForm.task.trim()) {
      showMessage('info', 'Enter a task description to start');
      return;
    }
    if (!selectedManualModel) {
      showMessage('error', 'Select an LLM connection before launching tasks');
      return;
    }
    if (isTaskStreaming) {
      showMessage('info', 'A task is already streaming');
      return;
    }

    setTaskLogs([]);
    setTaskStatus('pending');
    setActiveTaskId(null);
    setTaskServerInfo({ serverUrl: '', xpraUrl: '' });
    setManualRunRecord(null);

    const payload = {
      task: taskForm.task.trim(),
    };
    if (taskForm.promptId) {
      payload.prompt_id = Number(taskForm.promptId);
    }
    if (taskForm.promptText && taskForm.promptText.trim()) {
      payload.prompt_text = taskForm.promptText.trim();
    }
    if (taskForm.modelId) {
      payload.model_id = Number(taskForm.modelId);
    }

    const controller = new AbortController();
    taskAbortControllerRef.current = controller;
    setIsTaskStreaming(true);

    let latestStatus = 'pending';

    try {
      const response = await fetch(`${API_BASE_URL}/run-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to start task');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf('\n\n');
        while (boundary !== -1) {
          const chunk = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const dataLines = chunk
            .split('\n')
            .filter((line) => line.startsWith('data:'));
          if (dataLines.length > 0) {
            const payloadText = dataLines
              .map((line) => line.slice(6).trim())
              .join('');
            if (payloadText === '[DONE]') {
              if (latestStatus === 'pending') {
                latestStatus = 'completed';
              }
            } else if (payloadText) {
              try {
                const eventData = JSON.parse(payloadText);
                setTaskLogs((prev) => [
                  ...prev,
                  { ...eventData, timestamp: new Date().toISOString() },
                ]);
                if (eventData.type === 'task') {
                  setActiveTaskId(eventData.taskId || eventData.task_id || null);
                  latestStatus = eventData.status || latestStatus;
                  setTaskStatus(eventData.status || latestStatus);
                  setTaskServerInfo({
                    serverUrl: eventData.serverUrl || '',
                    xpraUrl: eventData.xpraUrl || '',
                  });
                  if (eventData.runId || eventData.testCaseId || eventData.testCaseReference) {
                    setManualRunRecord({
                      runId: eventData.runId || null,
                      testCaseId: eventData.testCaseId || null,
                      reference: eventData.testCaseReference || null,
                    });
                  }
                } else if (eventData.type === 'session') {
                  latestStatus = 'running';
                  setTaskStatus('running');
                  setTaskServerInfo({
                    serverUrl: eventData.serverUrl || '',
                    xpraUrl: eventData.xpraUrl || '',
                  });
                } else if (eventData.type === 'success') {
                  latestStatus = 'completed';
                  setTaskStatus('completed');
                } else if (eventData.type === 'error') {
                  latestStatus = 'failed';
                  setTaskStatus('failed');
                } else if (eventData.type === 'cancelled') {
                  latestStatus = 'cancelled';
                  setTaskStatus('cancelled');
                }
              } catch (parseError) {
                setTaskLogs((prev) => [
                  ...prev,
                  {
                    type: 'info',
                    message: payloadText,
                    timestamp: new Date().toISOString(),
                  },
                ]);
              }
            }
          }
          boundary = buffer.indexOf('\n\n');
        }
      }

      setTaskStatus(latestStatus);
      if (latestStatus === 'completed') {
        showMessage('success', 'Task completed successfully');
      } else if (latestStatus === 'cancelled') {
        showMessage('info', 'Task was cancelled');
      } else if (latestStatus === 'failed') {
        showMessage('error', 'Task failed');
      }
      if (manualRunRecord) {
        fetchTestRuns();
        fetchTestCases();
        fetchQualityInsights();
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        setTaskStatus('failed');
        showMessage('error', error.message);
      }
    } finally {
      setIsTaskStreaming(false);
      taskAbortControllerRef.current = null;
    }
  };

  const handleTaskCancel = async () => {
    if (activeTaskId) {
      try {
        const response = await fetch(`${API_BASE_URL}/tasks/${activeTaskId}/cancel`, {
          method: 'POST',
        });
        if (!response.ok) {
          throw new Error('Failed to cancel task');
        }
        showMessage('info', 'Cancellation requested');
      } catch (error) {
        showMessage('error', error.message);
      }
    }
    if (taskAbortControllerRef.current) {
      taskAbortControllerRef.current.abort();
      taskAbortControllerRef.current = null;
    }
  };

  const renderTestCasesTab = () => {
    const allSelected =
      filteredTestCases.length > 0 &&
      filteredTestCases.every((testCase) => selectedTestCaseIds.includes(testCase.id));

    const viewTabs = [
      { id: 'catalog', label: 'Task Catalog', icon: ClipboardList },
      { id: 'history', label: 'Run History', icon: Activity },
      { id: 'manual', label: 'Manual Run', icon: Play },
    ];

    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-purple-200">Unified MCP Tasks</h2>
            <p className="text-sm text-gray-400">
              Curate scenarios, queue executions, and inspect history from a single workspace.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {viewTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = testCaseView === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setTestCaseView(tab.id)}
                  className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm transition-colors ${
                    isActive
                      ? 'bg-purple-600 text-white'
                      : 'border border-slate-700 bg-slate-900/60 text-gray-300 hover:border-purple-500/50'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={openCreateTestCaseModal}
              className="flex items-center gap-2 rounded-md border border-purple-500/40 px-4 py-2 text-sm text-purple-200 transition-colors hover:border-purple-400 hover:bg-purple-500/20"
            >
              <Plus className="h-4 w-4" /> New Task
            </button>
          </div>
        </div>

        {testCaseView === 'catalog' && (
          <>
            <div className="space-y-4">
              <div className="flex flex-col gap-3 rounded-lg border border-slate-700 bg-slate-900/60 p-4 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    value={testCaseSearch}
                    onChange={(event) => setTestCaseSearch(event.target.value)}
                    placeholder="Search MCP tasks..."
                    className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-purple-500 focus:outline-none sm:w-80"
                  />
                  <button
                    type="button"
                    onClick={toggleSelectAllFiltered}
                    className="rounded-md border border-purple-500/40 px-3 py-2 text-sm text-purple-200 hover:bg-purple-500/10"
                  >
                    {allSelected ? 'Unselect' : 'Select'} filtered
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={refreshAll}
                    className="flex items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-sm text-gray-200 transition-colors hover:bg-slate-800"
                  >
                    <RefreshCcw className="h-4 w-4" /> Refresh
                  </button>
                  <span className="text-sm text-gray-400">
                    {selectedTestCaseIds.length} selected
                  </span>
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border border-slate-700">
                <table className="min-w-full divide-y divide-slate-700">
                  <thead className="bg-slate-800/60">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleSelectAllFiltered}
                        />
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                        Reference
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                        Title
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                        Category
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                        Priority
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                        Status
                      </th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 bg-slate-900/40">
                    {filteredTestCases.map((testCase) => (
                      <tr key={testCase.id} className="hover:bg-slate-800/40">
                        <td className="px-4 py-3 text-sm text-gray-300">
                          <input
                            type="checkbox"
                            checked={selectedTestCaseIds.includes(testCase.id)}
                            onChange={() => toggleTestCaseSelection(testCase.id)}
                          />
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-purple-200">
                          {testCase.reference}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-200">{testCase.title}</td>
                        <td className="px-4 py-3 text-sm text-gray-400">
                          {testCase.category || '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-400">{testCase.priority}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className="rounded-full bg-slate-800/80 px-3 py-1 text-xs text-gray-300">
                            {testCase.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-sm">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleTestCaseEdit(testCase)}
                              className="rounded-md border border-slate-700 p-1 text-gray-300 hover:bg-slate-800"
                            >
                              <Edit3 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleTestCaseDelete(testCase.id)}
                              className="rounded-md border border-rose-500/30 p-1 text-rose-200 hover:bg-rose-500/20"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredTestCases.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-400">
                          No tasks found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-purple-200">Queue MCP Tasks</h3>
                  <p className="text-sm text-gray-400">
                    Selected tasks will execute using the chosen LLM connection and optional prompt overrides.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRunQueue}
                  disabled={isLoading.queue || !selectedQueueModel}
                  className="flex items-center gap-2 rounded-md bg-purple-600 px-4 py-2 text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:bg-purple-900/40"
                >
                  {isLoading.queue ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Queue Run
                </button>
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="space-y-3 rounded-md border border-slate-700 bg-slate-950/40 p-4">
                  <label className="text-xs uppercase tracking-wide text-gray-400">LLM connection</label>
                  <select
                    value={runForm.modelId}
                    onChange={(event) => handleRunFormChange('modelId', event.target.value)}
                    className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                  >
                    <option value="">Select an LLM model</option>
                    {llmModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name} {model.is_system ? '· System' : ''}
                      </option>
                    ))}
                  </select>
                  {selectedQueueModel ? (
                    <div className="space-y-1 text-sm text-gray-300">
                      <p className="font-semibold text-purple-200">{selectedQueueModel.name}</p>
                      <p className="text-xs text-gray-400">{selectedQueueModel.model_name}</p>
                      <p className="text-xs text-gray-500">{selectedQueueModel.base_url}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-rose-300">
                      No LLM model detected. Add one on the Connections tab to enable queued runs.
                    </p>
                  )}
                </div>
                <div className="space-y-3">
                  <select
                    value={runForm.promptId}
                    onChange={(event) => handleRunFormChange('promptId', event.target.value)}
                    className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                  >
                    <option value="">Use default prompt</option>
                    {prompts.map((prompt) => (
                      <option key={prompt.id} value={prompt.id}>
                        {prompt.name} {prompt.is_system ? '· System' : ''}
                      </option>
                    ))}
                  </select>
                  <textarea
                    rows={4}
                    placeholder="Optional custom prompt override"
                    value={runForm.promptOverride}
                    onChange={(event) => handleRunFormChange('promptOverride', event.target.value)}
                    className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </>
        )}

        {testCaseView === 'history' && (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-1">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-purple-200">Run Groups</h3>
                <button
                  type="button"
                  onClick={() => fetchTestRuns()}
                  className="flex items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-sm text-gray-200 hover:bg-slate-800"
                >
                  <RefreshCcw className="h-4 w-4" /> Refresh
                </button>
              </div>
              {['draft', 'running', 'pending', 'queued', 'completed', 'failed'].map((group) => (
                <div key={group} className="space-y-2">
                  <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-400">
                    {group}
                  </h4>
                  {groupedRuns[group].map((run) => (
                    <button
                      key={run.id}
                      onClick={() => setSelectedRunId(run.id)}
                      className={`w-full rounded-md border px-4 py-3 text-left transition-colors ${
                        selectedRunId === run.id
                          ? 'border-purple-500 bg-purple-500/20'
                          : 'border-slate-700 bg-slate-900/50 hover:border-purple-400/40'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-gray-200">Run #{run.id}</span>
                        <span className="text-xs text-gray-400">{run.status}</span>
                      </div>
                      <p className="mt-1 text-xs text-gray-400">Task #{run.test_case_id}</p>
                    </button>
                  ))}
                  {groupedRuns[group].length === 0 && (
                    <div className="rounded-md border border-slate-700 bg-slate-900/40 px-4 py-3 text-sm text-gray-400">
                      None
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="lg:col-span-2">
              {selectedRun ? (
                <div className="space-y-4">
                  <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-6">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <h3 className="text-xl font-semibold text-purple-200">Run #{selectedRun.id}</h3>
                        <p className="text-sm text-gray-400">
                          Status: <span className="text-purple-200">{selectedRun.status}</span>
                        </p>
                        <p className="text-sm text-gray-400">
                          Result: <span className="text-gray-200">{selectedRun.result || '—'}</span>
                        </p>
                        <p className="text-sm text-gray-400">
                          Model Config ID: {selectedRun.model_config_id || '—'}
                        </p>
                        <p className="text-sm text-gray-400">Server URL: {selectedRun.server_url || '—'}</p>
                      </div>
                      <div className="space-y-2 text-sm text-gray-400">
                        <p>Created: {formatDate(selectedRun.created_at)}</p>
                        <p>Started: {formatDate(selectedRun.started_at)}</p>
                        <p>Completed: {formatDate(selectedRun.completed_at)}</p>
                        <p>
                          Duration:{' '}
                          {selectedRun.metrics?.duration
                            ? formatDuration(selectedRun.metrics.duration)
                            : '—'}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4">
                      <h4 className="text-sm font-semibold text-gray-300">Prompt</h4>
                      <pre className="mt-2 max-h-40 overflow-auto rounded-md border border-slate-800 bg-slate-950/60 p-3 text-xs text-gray-300">
                        {selectedRun.prompt}
                      </pre>
                    </div>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-4">
                      <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-200">
                        <Monitor className="h-4 w-4 text-purple-300" /> Xpra Session
                      </h4>
                      <div className="h-64 overflow-hidden rounded-md border border-slate-800 bg-black">
                        <XpraFrame src={selectedRun.xpra_url} />
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-4">
                      <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-200">
                        <Activity className="h-4 w-4 text-purple-300" /> Console Output
                      </h4>
                      <div className="max-h-64 overflow-auto space-y-2 pr-2 text-xs text-gray-300">
                        {selectedRun.log.length === 0 && (
                          <div className="rounded-md border border-slate-700 bg-slate-900/40 px-3 py-2 text-sm text-gray-400">
                            No log entries yet.
                          </div>
                        )}
                        {selectedRun.log.map((entry, index) => (
                          <div
                            key={`${entry.timestamp}-${index}`}
                            className="rounded-md border border-slate-700 bg-slate-900/40 px-3 py-2"
                          >
                            <div className="flex items-center justify-between text-[11px] text-gray-400">
                              <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                              <span className="uppercase tracking-wide">{entry.type}</span>
                            </div>
                            <p className="mt-1 whitespace-pre-wrap text-xs text-gray-200">{entry.message}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-64 items-center justify-center rounded-lg border border-slate-700 bg-slate-900/60 text-gray-400">
                  Select a run to inspect its details.
                </div>
              )}
            </div>
          </div>
        )}

        {testCaseView === 'manual' && (
          <div className="space-y-4 rounded-lg border border-slate-700 bg-slate-900/60 p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-purple-200">Manual MCP Task Runner</h3>
                <p className="text-sm text-gray-400">
                  Launch ad-hoc work using the selected LLM connection and optional prompt overrides.
                </p>
              </div>
              {activeTaskId && (
                <span className="rounded-full border border-slate-700 px-3 py-1 text-xs uppercase tracking-wide text-gray-300">
                  Task ID: {activeTaskId}
                </span>
              )}
            </div>

            <form onSubmit={handleTaskStart} className="space-y-5">
              <textarea
                rows={4}
                required
                value={taskForm.task}
                onChange={(event) => setTaskForm((prev) => ({ ...prev, task: event.target.value }))}
                placeholder="Describe the task for the MCP agent to execute"
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
              />
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-3 rounded-md border border-slate-700 bg-slate-950/40 p-4">
                  <label className="text-xs uppercase tracking-wide text-gray-400">LLM connection</label>
                  <select
                    value={taskForm.modelId}
                    onChange={(event) => setTaskForm((prev) => ({ ...prev, modelId: event.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                  >
                    <option value="">Select an LLM model</option>
                    {llmModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name} {model.is_system ? '· System' : ''}
                      </option>
                    ))}
                  </select>
                  {selectedManualModel ? (
                    <div className="space-y-1 text-sm text-gray-300">
                      <p className="font-semibold text-purple-200">{selectedManualModel.name}</p>
                      <p className="text-xs text-gray-400">{selectedManualModel.model_name}</p>
                      <p className="text-xs text-gray-500">{selectedManualModel.base_url}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-rose-300">
                      No LLM connection detected. Add or select one to continue.
                    </p>
                  )}
                </div>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <label className="text-sm text-gray-300">Prompt Template</label>
                    <select
                      value={taskForm.promptId}
                      onChange={(event) => setTaskForm((prev) => ({ ...prev, promptId: event.target.value }))}
                      className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                    >
                      <option value="">Use default prompt</option>
                      {prompts.map((prompt) => (
                        <option key={prompt.id} value={prompt.id}>
                          {prompt.name} {prompt.is_system ? '· System' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-gray-300">Custom prompt override</label>
                    <textarea
                      rows={3}
                      value={taskForm.promptText}
                      onChange={(event) => setTaskForm((prev) => ({ ...prev, promptText: event.target.value }))}
                      placeholder="Optional custom instructions"
                      className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={isTaskStreaming || !selectedManualModel}
                  className="flex items-center gap-2 rounded-md bg-purple-600 px-4 py-2 text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:bg-purple-900/40"
                >
                  {isTaskStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  {isTaskStreaming ? 'Running Task' : 'Start Task'}
                </button>
                <button
                  type="button"
                  onClick={handleTaskCancel}
                  disabled={!isTaskStreaming && !activeTaskId}
                  className="flex items-center gap-2 rounded-md border border-slate-700 px-4 py-2 text-sm text-gray-200 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:text-gray-500"
                >
                  <StopCircle className="h-4 w-4" /> Cancel Task
                </button>
              </div>
            </form>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3 rounded-lg border border-slate-700 bg-slate-900/60 p-4">
                <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-200">
                  <Activity className="h-4 w-4 text-purple-300" /> Console Output
                </h4>
                <div className="max-h-72 overflow-auto space-y-2 pr-2">
                  {taskLogs.length === 0 && (
                    <div className="rounded-md border border-slate-700 bg-slate-900/40 px-3 py-2 text-sm text-gray-400">
                      Task output will appear here.
                    </div>
                  )}
                  {taskLogs.map((entry, index) => (
                    <div
                      key={`${entry.timestamp}-${index}`}
                      className={`rounded-md border px-3 py-2 text-sm ${
                        entry.type === 'error'
                          ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
                          : entry.type === 'success'
                          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                          : entry.type === 'cancelled'
                          ? 'border-amber-400/40 bg-amber-500/10 text-amber-200'
                          : 'border-slate-700 bg-slate-900/40 text-gray-200'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] text-gray-400">
                        <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                        <span className="uppercase tracking-wide">{entry.type}</span>
                      </div>
                      <p className="mt-1 text-xs">
                        {typeof entry.message === 'string' ? entry.message : JSON.stringify(entry.message)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-4">
                <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-4 text-sm text-gray-300">
                  <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-200">
                    <Monitor className="h-4 w-4 text-purple-300" /> Session Overview
                  </h4>
                  <div className="mt-2 space-y-2">
                    <p>
                      Status:{' '}
                      <span className="font-semibold text-purple-200">{taskStatus || 'idle'}</span>
                    </p>
                    <p>
                      MCP Session:{' '}
                      <span className="text-gray-400">{taskServerInfo.serverUrl || 'Waiting'}</span>
                    </p>
                    {manualRunRecord && manualRunRecord.reference && (
                      <p>
                        Draft Test Case:{' '}
                        <span className="font-semibold text-purple-200">{manualRunRecord.reference}</span>
                      </p>
                    )}
                    {manualRunRecord && manualRunRecord.testCaseId && (
                      <p>
                        Test Case ID:{' '}
                        <span className="text-gray-400">{manualRunRecord.testCaseId}</span>
                      </p>
                    )}
                  </div>
                  <div className="mt-4 h-56 overflow-hidden rounded-md border border-slate-800 bg-black">
                    <XpraFrame src={taskServerInfo.xpraUrl} />
                  </div>
                </div>
                {manualRunRecord && (
                  <div className="rounded-lg border border-purple-500/40 bg-purple-500/10 px-4 py-3 text-sm text-purple-100">
                    {`Manual run history saved ${manualRunRecord.reference ? 'as ' + manualRunRecord.reference : 'as a draft test case'}${manualRunRecord.runId ? ' (Run #' + manualRunRecord.runId + ')' : ''}. Review it in the task catalog when ready.`}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      {isTestCaseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6">
          <div className="w-full max-w-3xl overflow-hidden rounded-lg border border-slate-700 bg-slate-900/95 shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-700 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-purple-200">
                  {editingTestCaseId ? 'Edit Task Definition' : 'Create Task Definition'}
                </h2>
                <p className="mt-1 text-sm text-gray-400">
                  Draft tasks can be refined and promoted to ready once validated.
                </p>
              </div>
              <button
                type="button"
                onClick={closeTestCaseModal}
                className="rounded-md border border-slate-700 p-1 text-gray-400 transition-colors hover:bg-slate-800"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleTestCaseSubmit} className="max-h-[75vh] overflow-y-auto px-6 py-4">
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="md:col-span-1">
                    <label className="mb-1 block text-sm text-gray-300">Reference</label>
                    <input
                      required
                      value={testCaseForm.reference}
                      onChange={(event) => handleTestCaseFieldChange('reference', event.target.value)}
                      className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                    />
                  </div>
                  <div className="md:col-span-1">
                    <label className="mb-1 block text-sm text-gray-300">Title</label>
                    <input
                      required
                      value={testCaseForm.title}
                      onChange={(event) => handleTestCaseFieldChange('title', event.target.value)}
                      className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm text-gray-300">Description</label>
                  <textarea
                    rows={3}
                    value={testCaseForm.description}
                    onChange={(event) => handleTestCaseFieldChange('description', event.target.value)}
                    className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm text-gray-300">Category</label>
                    <input
                      value={testCaseForm.category}
                      onChange={(event) => handleTestCaseFieldChange('category', event.target.value)}
                      className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm text-gray-300">Priority</label>
                    <select
                      value={testCaseForm.priority}
                      onChange={(event) => handleTestCaseFieldChange('priority', event.target.value)}
                      className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                    >
                      {priorities.map((priority) => (
                        <option key={priority} value={priority}>
                          {priority}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm text-gray-300">Status</label>
                    <select
                      value={testCaseForm.status}
                      onChange={(event) => handleTestCaseFieldChange('status', event.target.value)}
                      className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                    >
                      {statuses.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm text-gray-300">Tags</label>
                    <input
                      value={testCaseForm.tags}
                      onChange={(event) => handleTestCaseFieldChange('tags', event.target.value)}
                      placeholder="Smoke, regression"
                      className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm text-gray-300">Steps (one per line)</label>
                  <textarea
                    rows={4}
                    value={testCaseForm.steps}
                    onChange={(event) => handleTestCaseFieldChange('steps', event.target.value)}
                    className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                  />
                </div>
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={closeTestCaseModal}
                    className="rounded-md border border-slate-700 px-4 py-2 text-sm text-gray-200 transition-colors hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex items-center gap-2 rounded-md bg-purple-600 px-4 py-2 text-white transition-colors hover:bg-purple-700"
                  >
                    {editingTestCaseId ? <Edit3 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    {editingTestCaseId ? 'Update Task' : 'Create Task'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    );
  };

  const renderQualityTab = () => {
    if (!qualityInsights) {
      return (
        <div className="flex h-64 items-center justify-center text-gray-400">
          {isLoading.insights ? <Loader2 className="h-6 w-6 animate-spin" /> : 'No insights available yet.'}
        </div>
      );
    }

    const cards = [
      {
        label: 'Total Test Cases',
        value: qualityInsights.total_test_cases,
      },
      {
        label: 'Ready',
        value: qualityInsights.ready_test_cases,
      },
      {
        label: 'Blocked',
        value: qualityInsights.blocked_test_cases,
      },
      {
        label: 'Draft',
        value: qualityInsights.draft_test_cases,
      },
      {
        label: 'Total Runs',
        value: qualityInsights.total_runs,
      },
      {
        label: 'Pass Rate',
        value: `${qualityInsights.success_rate.toFixed(1)}%`,
      },
      {
        label: 'Average Duration',
        value: formatDuration(qualityInsights.average_duration),
      },
      {
        label: 'Last Run',
        value: formatDate(qualityInsights.latest_run_at),
      },
    ];

    const renderBreakdown = (title, entries) => (
      <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-6">
        <h3 className="mb-4 text-lg font-semibold text-purple-200">{title}</h3>
        <div className="space-y-3">
          {entries.map((entry) => (
            <div
              key={entry.key}
              className="flex items-center justify-between rounded-md border border-slate-700 bg-slate-900/60 px-4 py-3"
            >
              <div>
                <p className="text-sm font-semibold text-gray-200">{entry.key}</p>
                <p className="text-xs text-gray-400">{entry.total} test cases</p>
              </div>
              <div className="text-right text-sm text-purple-200">
                {entry.pass_rate.toFixed(1)}%
              </div>
            </div>
          ))}
          {entries.length === 0 && (
            <div className="rounded-md border border-slate-700 bg-slate-900/40 px-4 py-3 text-sm text-gray-400">
              No data available yet.
            </div>
          )}
        </div>
      </div>
    );

    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {cards.map((card) => (
            <div
              key={card.label}
              className="rounded-lg border border-slate-700 bg-slate-900/60 p-5"
            >
              <p className="text-xs uppercase tracking-wide text-gray-400">{card.label}</p>
              <p className="mt-2 text-2xl font-semibold text-purple-200">{card.value}</p>
            </div>
          ))}
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {renderBreakdown('By Category', qualityInsights.category_breakdown)}
          {renderBreakdown('By Priority', qualityInsights.priority_breakdown)}
        </div>
      </div>
    );
  };

  const renderModelsTab = () => (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-700 bg-slate-900/60 p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-purple-200">Provisioned Model Configurations</h2>
            <p className="text-sm text-gray-400">
              Model configurations are managed centrally. The default entry is used automatically when tasks are queued.
            </p>
          </div>
          <button
            type="button"
            onClick={() => fetchModelConfigs()}
            className="flex items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-sm text-gray-200 transition-colors hover:bg-slate-800"
          >
            <RefreshCcw className="h-4 w-4" /> Refresh
          </button>
        </div>
        <div className="mt-4 space-y-3">
          {modelConfigs.map((config) => (
            <div
              key={config.id}
              className="rounded-lg border border-slate-700 bg-slate-900/60 p-5"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-400">{config.provider}</p>
                  <h3 className="text-lg font-semibold text-purple-200">{config.name}</h3>
                  {config.description && (
                    <p className="mt-1 text-sm text-gray-400">{config.description}</p>
                  )}
                </div>
                {defaultModelConfig && defaultModelConfig.id === config.id && (
                  <span className="inline-flex items-center rounded-full border border-purple-500/50 px-3 py-1 text-xs uppercase tracking-wide text-purple-200">
                    Default runtime model
                  </span>
                )}
              </div>
              <pre className="mt-3 max-h-40 overflow-auto rounded-md border border-slate-800 bg-slate-950/60 p-3 text-xs text-gray-300">
                {JSON.stringify(config.parameters || {}, null, 2)}
              </pre>
            </div>
          ))}
          {modelConfigs.length === 0 && (
            <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-6 text-center text-gray-400">
              No model configurations available yet.
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <form
          onSubmit={handleLlmSubmit}
          className="rounded-lg border border-slate-700 bg-slate-900/60 p-6"
        >
          <h2 className="mb-4 text-lg font-semibold text-purple-200">
            {llmForm.id ? 'Edit LLM Connection' : 'Add LLM Connection'}
          </h2>
          <p className="mb-4 text-sm text-gray-400">Connections are verified against the provider before being saved.</p>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm text-gray-300">Display Name</label>
              <input
                required
                value={llmForm.name}
                onChange={(event) => setLlmForm((prev) => ({ ...prev, name: event.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-300">Base URL</label>
              <input
                required
                value={llmForm.baseUrl}
                onChange={(event) => setLlmForm((prev) => ({ ...prev, baseUrl: event.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-300">API Key</label>
              <input
                type="password"
                value={llmForm.apiKey}
                onChange={(event) => setLlmForm((prev) => ({ ...prev, apiKey: event.target.value }))}
                placeholder={llmForm.id ? 'Leave blank to keep existing key' : 'Required'}
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-300">Model Name</label>
              <input
                required
                value={llmForm.modelName}
                onChange={(event) => setLlmForm((prev) => ({ ...prev, modelName: event.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-300">Description</label>
              <textarea
                rows={3}
                value={llmForm.description}
                onChange={(event) => setLlmForm((prev) => ({ ...prev, description: event.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={isSavingLlm}
                className="flex items-center gap-2 rounded-md bg-purple-600 px-4 py-2 text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:bg-purple-900/40"
              >
                {isSavingLlm ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {llmForm.id ? 'Update LLM' : 'Add LLM'}
              </button>
              {llmForm.id && (
                <button
                  type="button"
                  onClick={() => setLlmForm(emptyLlmForm)}
                  className="rounded-md border border-slate-700 px-3 py-2 text-sm text-gray-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </form>

        <div className="space-y-3">
          {llmModels.map((model) => (
            <div
              key={model.id}
              className="rounded-lg border border-slate-700 bg-slate-900/60 p-5"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-purple-200">{model.name}</h3>
                  <p className="text-sm text-gray-400">{model.model_name}</p>
                  <p className="text-xs text-gray-500">{model.base_url}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleLlmEdit(model)}
                    disabled={model.is_system}
                    className="rounded-md border border-slate-700 p-1 text-gray-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:text-gray-500"
                  >
                    <Edit3 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleLlmDelete(model)}
                    disabled={model.is_system}
                    className="rounded-md border border-rose-500/30 p-1 text-rose-200 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:text-rose-300/50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="mt-3 space-y-2 text-sm text-gray-300">
                <p>{model.description || 'No description provided.'}</p>
                <p className="text-xs text-gray-400">API Key: {model.masked_api_key || '—'}</p>
                {model.is_system && (
                  <span className="inline-flex items-center rounded-full border border-purple-500/50 px-2 py-1 text-[11px] uppercase tracking-wide text-purple-200">
                    System Default
                  </span>
                )}
              </div>
            </div>
          ))}
          {llmModels.length === 0 && (
            <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-6 text-center text-gray-400">
              No LLM connections yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderPromptsTab = () => (
    <div className="space-y-6">
      <form
        onSubmit={handlePromptSubmit}
        className="rounded-lg border border-slate-700 bg-slate-900/60 p-6"
      >
        <h2 className="mb-4 text-lg font-semibold text-purple-200">
          {promptForm.id ? 'Edit Prompt Template' : 'Create Prompt Template'}
        </h2>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-gray-300">Name</label>
            <input
              required
              value={promptForm.name}
              onChange={(event) => setPromptForm((prev) => ({ ...prev, name: event.target.value }))}
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-300">Description</label>
            <input
              value={promptForm.description}
              onChange={(event) => setPromptForm((prev) => ({ ...prev, description: event.target.value }))}
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-300">Template</label>
            <textarea
              required
              rows={6}
              value={promptForm.template}
              onChange={(event) => setPromptForm((prev) => ({ ...prev, template: event.target.value }))}
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 font-mono text-sm text-white focus:border-purple-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-gray-500">Use {'{task}'} as a placeholder for the task instructions.</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="flex items-center gap-2 rounded-md bg-purple-600 px-4 py-2 text-white transition-colors hover:bg-purple-700"
            >
              <Upload className="h-4 w-4" />
              {promptForm.id ? 'Update Prompt' : 'Create Prompt'}
            </button>
            {promptForm.id && (
              <button
                type="button"
                onClick={() => setPromptForm(emptyPromptForm)}
                className="rounded-md border border-slate-700 px-3 py-2 text-sm text-gray-300 hover:bg-slate-800"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </form>

      <div className="space-y-3">
        {prompts.map((prompt) => (
          <div
            key={prompt.id}
            className="rounded-lg border border-slate-700 bg-slate-900/60 p-5"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-purple-200">{prompt.name}</h3>
                <p className="text-sm text-gray-400">{prompt.description || 'No description provided.'}</p>
                {prompt.is_system && (
                  <span className="mt-1 inline-flex items-center rounded-full border border-purple-500/50 px-2 py-1 text-[11px] uppercase tracking-wide text-purple-200">
                    System Default
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePromptEdit(prompt)}
                  disabled={prompt.is_system}
                  className="rounded-md border border-slate-700 p-1 text-gray-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:text-gray-500"
                >
                  <Edit3 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handlePromptDelete(prompt)}
                  disabled={prompt.is_system}
                  className="rounded-md border border-rose-500/30 p-1 text-rose-200 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:text-rose-300/50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            <pre className="mt-3 max-h-40 overflow-auto rounded-md border border-slate-800 bg-slate-950/60 p-3 text-xs text-gray-300">
              {prompt.template}
            </pre>
          </div>
        ))}
        {prompts.length === 0 && (
          <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-6 text-center text-gray-400">
            No prompts available yet.
          </div>
        )}
      </div>
    </div>
  );

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'testCases':
        return renderTestCasesTab();
      case 'quality':
        return renderQualityTab();
      case 'models':
        return renderModelsTab();
      case 'prompts':
        return renderPromptsTab();
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="flex flex-col gap-4 px-6 py-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">TestGPT Control Center</h1>
            <p className="text-sm text-gray-400">
              Manage test cases, queue automated executions, and monitor live sessions.
            </p>
          </div>
          <nav className="flex flex-wrap items-center gap-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm transition-colors ${
                    isActive
                      ? 'bg-purple-600 text-white'
                      : 'border border-slate-700 bg-slate-900/60 text-gray-300 hover:border-purple-500/50'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="px-6 py-8">
        {message && (
          <div className={`mb-6 flex items-center gap-2 rounded-md px-4 py-3 text-sm ${messageVariants[message.type || 'info']}`}>
            {message.type === 'success' && <CheckCircle className="h-4 w-4" />}
            {message.type === 'error' && <XCircle className="h-4 w-4" />}
            {message.type === 'info' && <Loader2 className="h-4 w-4" />}
            <span>{message.text}</span>
          </div>
        )}
        <div className="w-full rounded-xl border border-slate-800 bg-slate-950/80 p-6 shadow-xl">
          {renderActiveTab()}
        </div>
      </main>
    </div>
  );
}

export default App;
