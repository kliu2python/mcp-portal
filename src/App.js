import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, BookOpen, ClipboardList, Settings } from 'lucide-react';
import ConnectionsTab from './components/ConnectionsTab';
import MessageBanner from './components/MessageBanner';
import PromptLibraryTab from './components/PromptLibraryTab';
import QualityInsightsTab from './components/QualityInsightsTab';
import TestCaseModal from './components/TestCaseModal';
import TestCasesTab from './components/TestCasesTab';
import { formatDate, formatDuration } from './utils/format';
import API_BASE_URL from './config';
import SupportChatWidget from './components/SupportChatWidget';

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
  const [isTestingLlm, setIsTestingLlm] = useState(false);
  const [llmTestStatus, setLlmTestStatus] = useState({ state: 'idle', message: '' });
  const [isTestCaseModalOpen, setIsTestCaseModalOpen] = useState(false);
  const [manualRunRecord, setManualRunRecord] = useState(null);
  const taskAbortControllerRef = useRef(null);

  const showMessage = useCallback((type, text) => {
    setMessage({ type, text });
  }, []);

  const isLlmFormComplete = useMemo(
    () =>
      Boolean(
        llmForm.name.trim() &&
          llmForm.baseUrl.trim() &&
          llmForm.modelName.trim() &&
          (llmForm.id || llmForm.apiKey.trim())
      ),
    [llmForm.baseUrl, llmForm.apiKey, llmForm.id, llmForm.modelName, llmForm.name]
  );

  const canSubmitLlm = useMemo(
    () => Boolean(isLlmFormComplete && (llmForm.id || llmTestStatus.state === 'success')),
    [isLlmFormComplete, llmForm.id, llmTestStatus.state]
  );

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

  const handleTaskFormChange = (field, value) => {
    setTaskForm((prev) => ({ ...prev, [field]: value }));
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

  const handlePromptFormChange = (field, value) => {
    setPromptForm((prev) => ({ ...prev, [field]: value }));
  };

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

  const handleLlmFormChange = (field, value) => {
    setLlmForm((prev) => ({ ...prev, [field]: value }));
    if (['baseUrl', 'apiKey', 'modelName'].includes(field)) {
      setLlmTestStatus((prev) => (prev.state === 'idle' ? prev : { state: 'idle', message: '' }));
    }
  };

  const handleLlmFormReset = () => {
    setLlmForm(emptyLlmForm);
    setLlmTestStatus({ state: 'idle', message: '' });
  };

  const handleLlmTest = async () => {
    if (!llmForm.baseUrl.trim() || !llmForm.modelName.trim()) {
      showMessage('info', 'Base URL and model name are required before testing');
      return;
    }
    if (!llmForm.apiKey.trim()) {
      showMessage('info', 'Enter an API key before testing the connection');
      return;
    }

    try {
      setIsTestingLlm(true);
      setLlmTestStatus({ state: 'pending', message: 'Testing connection…' });
      const response = await fetch(`${API_BASE_URL}/llm-models/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base_url: llmForm.baseUrl.trim(),
          api_key: llmForm.apiKey.trim(),
          model_name: llmForm.modelName.trim(),
        }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Unable to verify LLM connection');
      }
      setLlmTestStatus({ state: 'success', message: 'Connection verified successfully' });
    } catch (error) {
      setLlmTestStatus({ state: 'error', message: error.message });
      showMessage('error', error.message);
    } finally {
      setIsTestingLlm(false);
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
    if (!llmForm.id && llmTestStatus.state !== 'success') {
      showMessage('info', 'Test the connection before saving a new LLM');
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
      setLlmTestStatus({ state: 'idle', message: '' });
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
    setLlmTestStatus({ state: 'idle', message: '' });
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
        <MessageBanner message={message} />
        <div className="w-full rounded-xl border border-slate-800 bg-slate-950/80 p-6 shadow-xl">
          {activeTab === 'testCases' && (
            <TestCasesTab
              view={testCaseView}
              onViewChange={setTestCaseView}
              testCaseSearch={testCaseSearch}
              onSearchChange={setTestCaseSearch}
              filteredTestCases={filteredTestCases}
              selectedTestCaseIds={selectedTestCaseIds}
              onToggleTestCaseSelection={toggleTestCaseSelection}
              onToggleSelectAllFiltered={toggleSelectAllFiltered}
              onRefreshAll={refreshAll}
              onOpenCreateTestCaseModal={openCreateTestCaseModal}
              onEditTestCase={handleTestCaseEdit}
              onDeleteTestCase={handleTestCaseDelete}
              onQueueRuns={handleRunQueue}
              isQueueLoading={isLoading.queue}
              selectedQueueModel={selectedQueueModel}
              llmModels={llmModels}
              runForm={runForm}
              onRunFormChange={handleRunFormChange}
              prompts={prompts}
              groupedRuns={groupedRuns}
              selectedRunId={selectedRunId}
              onSelectRun={setSelectedRunId}
              selectedRun={selectedRun}
              onRefreshRuns={() => fetchTestRuns()}
              formatDate={formatDate}
              formatDuration={formatDuration}
              onTaskStart={handleTaskStart}
              taskForm={taskForm}
              onTaskFormChange={handleTaskFormChange}
              selectedManualModel={selectedManualModel}
              onTaskCancel={handleTaskCancel}
              isTaskStreaming={isTaskStreaming}
              activeTaskId={activeTaskId}
              taskLogs={taskLogs}
              taskStatus={taskStatus}
              taskServerInfo={taskServerInfo}
              manualRunRecord={manualRunRecord}
            />
          )}
          {activeTab === 'quality' && (
            <QualityInsightsTab
              insights={qualityInsights}
              isLoading={isLoading.insights}
              formatDate={formatDate}
              formatDuration={formatDuration}
            />
          )}
          {activeTab === 'models' && (
            <ConnectionsTab
              modelConfigs={modelConfigs}
              defaultModelConfig={defaultModelConfig}
              onRefreshConfigs={fetchModelConfigs}
              onSubmitLlm={handleLlmSubmit}
              llmForm={llmForm}
              onLlmFormChange={handleLlmFormChange}
              onLlmFormReset={handleLlmFormReset}
              isSavingLlm={isSavingLlm}
              llmModels={llmModels}
              onLlmEdit={handleLlmEdit}
              onLlmDelete={handleLlmDelete}
              onTestLlm={handleLlmTest}
              isTestingLlm={isTestingLlm}
              llmTestStatus={llmTestStatus}
              canSubmitLlm={canSubmitLlm}
            />
          )}
          {activeTab === 'prompts' && (
            <PromptLibraryTab
              promptForm={promptForm}
              onPromptFormChange={handlePromptFormChange}
              onPromptSubmit={handlePromptSubmit}
              onPromptReset={() => setPromptForm(emptyPromptForm)}
              prompts={prompts}
              onPromptEdit={handlePromptEdit}
              onPromptDelete={handlePromptDelete}
            />
          )}
        </div>
      </main>

      <TestCaseModal
        isOpen={isTestCaseModalOpen}
        onClose={closeTestCaseModal}
        onSubmit={handleTestCaseSubmit}
        testCaseForm={testCaseForm}
        onFieldChange={handleTestCaseFieldChange}
        priorities={priorities}
        statuses={statuses}
        isEditing={Boolean(editingTestCaseId)}
      />
      <SupportChatWidget />
    </div>
  );
}

export default App;
