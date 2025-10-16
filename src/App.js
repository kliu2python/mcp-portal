import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  CheckCircle,
  ClipboardList,
  Edit3,
  Loader2,
  Monitor,
  Play,
  Plus,
  RefreshCcw,
  Settings,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000';

const tabs = [
  { id: 'testCases', label: 'Test Case Management', icon: ClipboardList },
  { id: 'quality', label: 'Quality Insights', icon: BarChart3 },
  { id: 'tasks', label: 'Testing Tasks', icon: Activity },
  { id: 'models', label: 'Model Modify', icon: Settings },
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

const emptyModelForm = {
  id: null,
  name: '',
  provider: '',
  description: '',
  parameters: '{\n  "temperature": 0.0\n}',
};

const emptyRunForm = {
  modelConfigId: '',
  serverUrl: '',
  xpraUrl: '',
  useNewModel: false,
  newModel: {
    name: '',
    provider: '',
    description: '',
    parameters: '{\n  "temperature": 0.0\n}',
  },
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
  const [testRuns, setTestRuns] = useState([]);
  const [qualityInsights, setQualityInsights] = useState(null);
  const [message, setMessage] = useState(null);
  const [isLoading, setIsLoading] = useState({
    testCases: false,
    models: false,
    runs: false,
    insights: false,
    queue: false,
  });
  const [testCaseForm, setTestCaseForm] = useState(emptyTestCaseForm);
  const [editingTestCaseId, setEditingTestCaseId] = useState(null);
  const [testCaseSearch, setTestCaseSearch] = useState('');
  const [selectedTestCaseIds, setSelectedTestCaseIds] = useState([]);
  const [runForm, setRunForm] = useState(emptyRunForm);
  const [modelForm, setModelForm] = useState(emptyModelForm);
  const [selectedRunId, setSelectedRunId] = useState(null);

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
    fetchTestRuns();
    fetchQualityInsights();
  }, [fetchQualityInsights, fetchModelConfigs, fetchTestCases, fetchTestRuns]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

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
      setTestCaseForm(emptyTestCaseForm);
      setEditingTestCaseId(null);
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

  const handleRunFormChange = (field, value) => {
    setRunForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleRunQueue = async () => {
    if (selectedTestCaseIds.length === 0) {
      showMessage('info', 'Select at least one test case to run');
      return;
    }

    let payload = {
      test_case_ids: selectedTestCaseIds,
      server_url: runForm.serverUrl || undefined,
      xpra_url: runForm.xpraUrl || undefined,
    };

    if (runForm.useNewModel) {
      try {
        const parameters = JSON.parse(runForm.newModel.parameters || '{}');
        payload = {
          ...payload,
          model_config: {
            name: runForm.newModel.name,
            provider: runForm.newModel.provider,
            description: runForm.newModel.description,
            parameters,
          },
        };
      } catch (error) {
        showMessage('error', 'Model parameters must be valid JSON');
        return;
      }
    } else {
      if (!runForm.modelConfigId) {
        showMessage('info', 'Select a model configuration or create a new one');
        return;
      }
      payload = {
        ...payload,
        model_config_id: Number(runForm.modelConfigId),
      };
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
      setRunForm(emptyRunForm);
      fetchTestRuns();
      fetchQualityInsights();
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
      running: testRuns.filter((run) => run.status === 'running'),
      queued: testRuns.filter((run) => run.status === 'queued'),
      completed: testRuns.filter((run) => run.status === 'completed'),
      failed: testRuns.filter((run) => run.status === 'failed'),
    };
  }, [testRuns]);

  const handleModelFormSubmit = async (event) => {
    event.preventDefault();
    let parameters;
    try {
      parameters = JSON.parse(modelForm.parameters || '{}');
    } catch (error) {
      showMessage('error', 'Model parameters must be valid JSON');
      return;
    }

    const payload = {
      name: modelForm.name,
      provider: modelForm.provider,
      description: modelForm.description,
      parameters,
    };

    try {
      const url = modelForm.id
        ? `${API_BASE_URL}/model-configs/${modelForm.id}`
        : `${API_BASE_URL}/model-configs`;
      const method = modelForm.id ? 'PUT' : 'POST';
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to save model configuration');
      }
      await response.json();
      showMessage('success', modelForm.id ? 'Updated model configuration' : 'Created model configuration');
      setModelForm(emptyModelForm);
      fetchModelConfigs();
    } catch (error) {
      showMessage('error', error.message);
    }
  };

  const handleModelEdit = (config) => {
    setModelForm({
      id: config.id,
      name: config.name,
      provider: config.provider,
      description: config.description || '',
      parameters: JSON.stringify(config.parameters || {}, null, 2),
    });
  };

  const handleModelDelete = async (configId) => {
    if (!window.confirm('Delete this model configuration?')) return;
    try {
      const response = await fetch(`${API_BASE_URL}/model-configs/${configId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to delete model configuration');
      }
      showMessage('success', 'Deleted model configuration');
      if (modelForm.id === configId) {
        setModelForm(emptyModelForm);
      }
      fetchModelConfigs();
    } catch (error) {
      showMessage('error', error.message);
    }
  };

  const renderTestCasesTab = () => {
    const allSelected =
      filteredTestCases.length > 0 &&
      filteredTestCases.every((testCase) => selectedTestCaseIds.includes(testCase.id));

    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row">
          <form
            onSubmit={handleTestCaseSubmit}
            className="w-full rounded-lg border border-slate-700 bg-slate-900/60 p-6 lg:w-1/3"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-purple-200">
                {editingTestCaseId ? 'Edit Test Case' : 'Create Test Case'}
              </h2>
              {editingTestCaseId && (
                <button
                  type="button"
                  onClick={resetTestCaseForm}
                  className="rounded-md border border-slate-700 px-3 py-1 text-sm text-gray-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
              )}
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm text-gray-300">Reference</label>
                <input
                  required
                  value={testCaseForm.reference}
                  onChange={(event) => handleTestCaseFieldChange('reference', event.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-300">Title</label>
                <input
                  required
                  value={testCaseForm.title}
                  onChange={(event) => handleTestCaseFieldChange('title', event.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                />
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
              <div className="grid grid-cols-2 gap-3">
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
              <div className="grid grid-cols-2 gap-3">
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
              <button
                type="submit"
                className="flex items-center justify-center gap-2 rounded-md bg-purple-600 px-4 py-2 text-white transition-colors hover:bg-purple-700"
              >
                {editingTestCaseId ? <Edit3 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {editingTestCaseId ? 'Update' : 'Create'} Test Case
              </button>
            </div>
          </form>

          <div className="w-full space-y-4 lg:w-2/3">
            <div className="flex flex-col gap-3 rounded-lg border border-slate-700 bg-slate-900/60 p-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3">
                <input
                  value={testCaseSearch}
                  onChange={(event) => setTestCaseSearch(event.target.value)}
                  placeholder="Search test cases..."
                  className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-purple-500 focus:outline-none md:w-80"
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
                        No test cases found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-purple-200">Queue Test Execution</h3>
                  <p className="text-sm text-gray-400">
                    Select test cases above, choose a model configuration, then queue the run.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRunQueue}
                  disabled={isLoading.queue}
                  className="flex items-center gap-2 rounded-md bg-purple-600 px-4 py-2 text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:bg-purple-900/40"
                >
                  {isLoading.queue ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Queue Run
                </button>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-sm text-gray-300">
                    <input
                      type="checkbox"
                      checked={runForm.useNewModel}
                      onChange={(event) =>
                        setRunForm((prev) => ({ ...prev, useNewModel: event.target.checked }))
                      }
                    />
                    Create new model configuration for this run
                  </label>
                  {!runForm.useNewModel && (
                    <select
                      value={runForm.modelConfigId}
                      onChange={(event) => handleRunFormChange('modelConfigId', event.target.value)}
                      className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                    >
                      <option value="">Select model configuration</option>
                      {modelConfigs.map((config) => (
                        <option key={config.id} value={config.id}>
                          {config.name} · {config.provider}
                        </option>
                      ))}
                    </select>
                  )}
                  <input
                    placeholder="MCP server URL"
                    value={runForm.serverUrl}
                    onChange={(event) => handleRunFormChange('serverUrl', event.target.value)}
                    className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                  />
                  <input
                    placeholder="Xpra stream URL"
                    value={runForm.xpraUrl}
                    onChange={(event) => handleRunFormChange('xpraUrl', event.target.value)}
                    className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                  />
                </div>
                {runForm.useNewModel && (
                  <div className="space-y-3">
                    <input
                      placeholder="Model name"
                      value={runForm.newModel.name}
                      onChange={(event) =>
                        setRunForm((prev) => ({
                          ...prev,
                          newModel: { ...prev.newModel, name: event.target.value },
                        }))
                      }
                      className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                    />
                    <input
                      placeholder="Provider"
                      value={runForm.newModel.provider}
                      onChange={(event) =>
                        setRunForm((prev) => ({
                          ...prev,
                          newModel: { ...prev.newModel, provider: event.target.value },
                        }))
                      }
                      className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                    />
                    <textarea
                      rows={2}
                      placeholder="Description"
                      value={runForm.newModel.description}
                      onChange={(event) =>
                        setRunForm((prev) => ({
                          ...prev,
                          newModel: { ...prev.newModel, description: event.target.value },
                        }))
                      }
                      className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                    />
                    <textarea
                      rows={4}
                      placeholder="Parameters (JSON)"
                      value={runForm.newModel.parameters}
                      onChange={(event) =>
                        setRunForm((prev) => ({
                          ...prev,
                          newModel: { ...prev.newModel, parameters: event.target.value },
                        }))
                      }
                      className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 font-mono text-sm text-white focus:border-purple-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
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

  const renderTasksTab = () => (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-1">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-purple-200">Runs</h2>
          <button
            type="button"
            onClick={() => fetchTestRuns()}
            className="flex items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-sm text-gray-200 hover:bg-slate-800"
          >
            <RefreshCcw className="h-4 w-4" /> Refresh
          </button>
        </div>
        {['running', 'queued', 'completed', 'failed'].map((group) => (
          <div key={group} className="space-y-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400">
              {group}
            </h3>
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
                <p className="mt-1 text-xs text-gray-400">Test Case #{run.test_case_id}</p>
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
                  <h2 className="text-xl font-semibold text-purple-200">
                    Run #{selectedRun.id}
                  </h2>
                  <p className="text-sm text-gray-400">
                    Status: <span className="text-purple-200">{selectedRun.status}</span>
                  </p>
                  <p className="text-sm text-gray-400">
                    Result: <span className="text-gray-200">{selectedRun.result || '—'}</span>
                  </p>
                  <p className="text-sm text-gray-400">Model Config ID: {selectedRun.model_config_id || '—'}</p>
                  <p className="text-sm text-gray-400">Server URL: {selectedRun.server_url || '—'}</p>
                </div>
                <div className="space-y-2 text-sm text-gray-400">
                  <p>Created: {formatDate(selectedRun.created_at)}</p>
                  <p>Started: {formatDate(selectedRun.started_at)}</p>
                  <p>Completed: {formatDate(selectedRun.completed_at)}</p>
                  <p>
                    Duration:{' '}
                    {selectedRun.metrics?.duration ?
                      formatDuration(selectedRun.metrics.duration) : '—'}
                  </p>
                </div>
              </div>
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-gray-300">Prompt</h3>
                <pre className="mt-2 max-h-40 overflow-auto rounded-md border border-slate-800 bg-slate-950/60 p-3 text-xs text-gray-300">
                  {selectedRun.prompt}
                </pre>
              </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-4">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-200">
                  <Monitor className="h-4 w-4 text-purple-300" /> Xpra Session
                </h3>
                <div className="h-64 overflow-hidden rounded-md border border-slate-800 bg-black">
                  <XpraFrame src={selectedRun.xpra_url} />
                </div>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-4">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-200">
                  <Activity className="h-4 w-4 text-purple-300" /> Console Output
                </h3>
                <div className="max-h-64 overflow-auto space-y-2 pr-2 text-xs text-gray-300">
                  {selectedRun.log.length === 0 && (
                    <div className="rounded-md border border-slate-700 bg-slate-900/40 px-3 py-2 text-sm text-gray-400">
                      No log entries yet.
                    </div>
                  )}
                  {selectedRun.log.map((entry, index) => (
                    <div
                      key={`${entry.timestamp}-${index}`}
                      className={`rounded-md border px-3 py-2 ${
                        entry.type === 'error'
                          ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
                          : entry.type === 'success'
                          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                          : 'border-slate-700 bg-slate-900/40'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] text-gray-400">
                        <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                        <span className="uppercase tracking-wide">{entry.type}</span>
                      </div>
                      <p className="mt-1 text-xs text-gray-200">{entry.message}</p>
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
  );

  const renderModelsTab = () => (
    <div className="grid gap-6 lg:grid-cols-2">
      <form
        onSubmit={handleModelFormSubmit}
        className="rounded-lg border border-slate-700 bg-slate-900/60 p-6"
      >
        <h2 className="mb-4 text-lg font-semibold text-purple-200">
          {modelForm.id ? 'Edit Model Configuration' : 'Create Model Configuration'}
        </h2>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-gray-300">Name</label>
            <input
              required
              value={modelForm.name}
              onChange={(event) => setModelForm((prev) => ({ ...prev, name: event.target.value }))}
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-300">Provider</label>
            <input
              required
              value={modelForm.provider}
              onChange={(event) => setModelForm((prev) => ({ ...prev, provider: event.target.value }))}
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-300">Description</label>
            <textarea
              rows={3}
              value={modelForm.description}
              onChange={(event) => setModelForm((prev) => ({ ...prev, description: event.target.value }))}
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-300">Parameters (JSON)</label>
            <textarea
              rows={6}
              value={modelForm.parameters}
              onChange={(event) => setModelForm((prev) => ({ ...prev, parameters: event.target.value }))}
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 font-mono text-sm text-white focus:border-purple-500 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="flex items-center gap-2 rounded-md bg-purple-600 px-4 py-2 text-white transition-colors hover:bg-purple-700"
            >
              <Upload className="h-4 w-4" />
              {modelForm.id ? 'Update Model' : 'Create Model'}
            </button>
            {modelForm.id && (
              <button
                type="button"
                onClick={() => setModelForm(emptyModelForm)}
                className="rounded-md border border-slate-700 px-3 py-2 text-sm text-gray-300 hover:bg-slate-800"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </form>

      <div className="space-y-3">
        {modelConfigs.map((config) => (
          <div
            key={config.id}
            className="rounded-lg border border-slate-700 bg-slate-900/60 p-5"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-purple-200">{config.name}</h3>
                <p className="text-sm text-gray-400">{config.provider}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleModelEdit(config)}
                  className="rounded-md border border-slate-700 p-1 text-gray-300 hover:bg-slate-800"
                >
                  <Edit3 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleModelDelete(config.id)}
                  className="rounded-md border border-rose-500/30 p-1 text-rose-200 hover:bg-rose-500/20"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="mt-3 space-y-2 text-sm text-gray-300">
              <p>{config.description || 'No description provided.'}</p>
              <pre className="max-h-32 overflow-auto rounded-md border border-slate-800 bg-slate-950/60 p-3 text-xs text-gray-300">
                {JSON.stringify(config.parameters || {}, null, 2)}
              </pre>
            </div>
          </div>
        ))}
        {modelConfigs.length === 0 && (
          <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-6 text-center text-gray-400">
            No model configurations yet.
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
      case 'tasks':
        return renderTasksTab();
      case 'models':
        return renderModelsTab();
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6 md:flex-row md:items-center md:justify-between">
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

      <main className="mx-auto max-w-6xl px-6 py-8">
        {message && (
          <div className={`mb-6 flex items-center gap-2 rounded-md px-4 py-3 text-sm ${messageVariants[message.type || 'info']}`}>
            {message.type === 'success' && <CheckCircle className="h-4 w-4" />}
            {message.type === 'error' && <XCircle className="h-4 w-4" />}
            {message.type === 'info' && <Loader2 className="h-4 w-4" />}
            <span>{message.text}</span>
          </div>
        )}
        <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-6 shadow-xl">
          {renderActiveTab()}
        </div>
      </main>
    </div>
  );
}

export default App;
