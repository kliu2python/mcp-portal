import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart as BarChartIcon,
  CheckCircle2,
  Edit,
  Layers,
  LineChart as LineChartIcon,
  Loader2,
  PlayCircle,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Tags as TagsIcon,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
} from 'recharts';
import { format, parseISO } from 'date-fns';

const API_BASE_URL = (process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '');

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: Activity },
  { id: 'testCases', label: 'Test Cases', icon: Layers },
  { id: 'executions', label: 'Executions', icon: PlayCircle },
];

const priorityPalette = {
  critical: 'from-rose-500 to-orange-500',
  high: 'from-amber-500 to-yellow-500',
  medium: 'from-sky-500 to-blue-600',
  low: 'from-emerald-500 to-teal-500',
};

const statusColors = {
  draft: 'bg-slate-700 text-slate-200',
  ready: 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/40',
  'in-review': 'bg-amber-500/10 text-amber-200 border border-amber-400/40',
  deprecated: 'bg-rose-500/10 text-rose-200 border border-rose-400/40',
  archived: 'bg-slate-800 text-slate-300 border border-slate-700',
  queued: 'bg-sky-500/10 text-sky-200 border border-sky-400/40',
  running: 'bg-indigo-500/10 text-indigo-200 border border-indigo-400/40 animate-pulse',
  passed: 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/40',
  failed: 'bg-rose-500/10 text-rose-200 border border-rose-400/40',
  cancelled: 'bg-slate-700 text-slate-300 border border-slate-600',
};

const defaultStep = () => ({ action: '', expected: '', target: '', data: '' });

const StepEditor = ({ index, step, onChange, onRemove }) => (
  <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 space-y-3">
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium text-slate-300">Step {index + 1}</span>
      <button
        type="button"
        onClick={onRemove}
        className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-xs text-rose-200 hover:bg-rose-500/20"
      >
        <Trash2 className="h-3.5 w-3.5" /> Remove
      </button>
    </div>
    <div className="grid gap-3 md:grid-cols-2">
      <label className="text-xs uppercase tracking-wide text-slate-400">
        Action
        <textarea
          value={step.action}
          onChange={(event) => onChange({ ...step, action: event.target.value })}
          rows={2}
          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          placeholder="Describe the action to execute"
        />
      </label>
      <label className="text-xs uppercase tracking-wide text-slate-400">
        Expected Result
        <textarea
          value={step.expected}
          onChange={(event) => onChange({ ...step, expected: event.target.value })}
          rows={2}
          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          placeholder="What should happen?"
        />
      </label>
    </div>
    <div className="grid gap-3 md:grid-cols-2">
      <label className="text-xs uppercase tracking-wide text-slate-400">
        Target Element / Selector
        <input
          value={step.target}
          onChange={(event) => onChange({ ...step, target: event.target.value })}
          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          placeholder="CSS or XPath selector"
        />
      </label>
      <label className="text-xs uppercase tracking-wide text-slate-400">
        Data / Payload
        <input
          value={step.data}
          onChange={(event) => onChange({ ...step, data: event.target.value })}
          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          placeholder="Optional JSON payload or fixture"
        />
      </label>
    </div>
  </div>
);

const CaseSummaryCard = ({ testCase, selected, onToggleSelection, onPreview, onEdit }) => {
  const priorityGradient = priorityPalette[testCase.priority] || 'from-slate-600 to-slate-700';
  const updatedAt = testCase.updated_at ? format(parseISO(testCase.updated_at), 'PPp') : 'Unknown';
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50 p-5 transition-all hover:border-sky-500/50 ${
      selected ? 'ring-2 ring-sky-500/60' : ''
    }`}>
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sky-500 to-cyan-400" />
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${priorityGradient} text-slate-50`}>
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-100">{testCase.title}</h3>
            <p className="text-sm text-slate-400 line-clamp-2">{testCase.description}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onEdit(testCase);
          }}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-xs text-slate-200 hover:border-sky-500/60 hover:text-sky-200"
        >
          <Edit className="h-3.5 w-3.5" /> Edit
        </button>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
        <span className={`rounded-full px-3 py-1 capitalize ${statusColors[testCase.status] || 'bg-slate-700 text-slate-200'}`}>
          {testCase.status.replace('-', ' ')}
        </span>
        <span className="rounded-full border border-slate-700/80 px-3 py-1 text-slate-300">
          Priority: <span className="font-medium capitalize text-slate-100">{testCase.priority}</span>
        </span>
        {testCase.category ? (
          <span className="rounded-full border border-slate-700/80 px-3 py-1 text-slate-300">
            Category: <span className="font-medium text-slate-100">{testCase.category}</span>
          </span>
        ) : null}
        {testCase.owner ? (
          <span className="rounded-full border border-slate-700/80 px-3 py-1 text-slate-300">
            Owner: <span className="font-medium text-slate-100">{testCase.owner}</span>
          </span>
        ) : null}
      </div>
      {testCase.tags?.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {testCase.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-slate-800/80 px-2.5 py-1 text-xs text-slate-300">
              #{tag}
            </span>
          ))}
        </div>
      ) : null}
      <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
        <span>Updated {updatedAt}</span>
        <button
          type="button"
          onClick={() => onPreview(testCase)}
          className="inline-flex items-center gap-1 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-sky-100 hover:bg-sky-500/20"
        >
          <TagsIcon className="h-3.5 w-3.5" /> Details
        </button>
      </div>
      <input
        type="checkbox"
        className="absolute right-4 top-4 h-4 w-4 rounded border-slate-600 bg-slate-900 text-sky-500 focus:ring-sky-500"
        checked={selected}
        onChange={(event) => onToggleSelection(testCase.id, event.target.checked)}
      />
    </div>
  );
};

const parseTags = (value) =>
  value
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);

const DashboardView = ({ refreshKey }) => {
  const [summary, setSummary] = useState(null);
  const [trend, setTrend] = useState([]);
  const [categoryBreakdown, setCategoryBreakdown] = useState([]);
  const [priorityBreakdown, setPriorityBreakdown] = useState([]);
  const [recentExecutions, setRecentExecutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryResponse, trendResponse, categoryResponse, priorityResponse, executionsResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/metrics/summary`),
        fetch(`${API_BASE_URL}/metrics/trends?days=14`),
        fetch(`${API_BASE_URL}/metrics/breakdown?group_by=category`),
        fetch(`${API_BASE_URL}/metrics/breakdown?group_by=priority`),
        fetch(`${API_BASE_URL}/executions?limit=5`),
      ]);
      if (!summaryResponse.ok) throw new Error('Failed to load summary metrics');
      if (!trendResponse.ok) throw new Error('Failed to load trend data');
      if (!categoryResponse.ok || !priorityResponse.ok) throw new Error('Failed to load breakdown data');
      if (!executionsResponse.ok) throw new Error('Failed to load recent executions');
      const [summaryData, trendData, categoryData, priorityData, executionsData] = await Promise.all([
        summaryResponse.json(),
        trendResponse.json(),
        categoryResponse.json(),
        priorityResponse.json(),
        executionsResponse.json(),
      ]);
      setSummary(summaryData);
      setTrend(trendData);
      setCategoryBreakdown(categoryData);
      setPriorityBreakdown(priorityData);
      setRecentExecutions(executionsData);
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData, refreshKey]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-50">Automation Quality Overview</h1>
          <p className="mt-1 text-sm text-slate-400">
            Monitor execution health, coverage trends, and quality performance in real time.
          </p>
        </div>
        <button
          type="button"
          onClick={loadData}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-2 text-sm text-slate-100 hover:border-sky-500/60"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-6 text-rose-100">{error}</div>
      ) : null}

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900/80 to-slate-950/60 p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-400">Total Test Cases</span>
            <Layers className="h-5 w-5 text-sky-400" />
          </div>
          <p className="mt-4 text-3xl font-semibold text-slate-50">{summary?.total_cases ?? '--'}</p>
          <p className="mt-2 text-xs text-slate-500">Case library with category, owner, and lifecycle controls.</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-sky-500/10 to-slate-950/60 p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-400">Total Executions</span>
            <PlayCircle className="h-5 w-5 text-sky-400" />
          </div>
          <p className="mt-4 text-3xl font-semibold text-slate-50">{summary?.total_executions ?? '--'}</p>
          <p className="mt-2 text-xs text-slate-500">Aggregate of scripted and natural language automation runs.</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-emerald-500/10 to-slate-950/60 p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-400">Pass Rate</span>
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          </div>
          <p className="mt-4 text-3xl font-semibold text-emerald-300">
            {summary ? `${(summary.pass_rate * 100).toFixed(1)}%` : '--'}
          </p>
          <p className="mt-2 text-xs text-slate-500">Successful executions across the rolling reporting window.</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-indigo-500/10 to-slate-950/60 p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-400">Active Executions</span>
            <Activity className="h-5 w-5 text-indigo-400" />
          </div>
          <p className="mt-4 text-3xl font-semibold text-indigo-300">{summary?.active_executions ?? '--'}</p>
          <p className="mt-2 text-xs text-slate-500">Tests currently running with live status streaming.</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">Execution Trend</h2>
              <p className="text-xs text-slate-400">Daily execution volume, pass rate, and average duration.</p>
            </div>
            <LineChartIcon className="h-5 w-5 text-sky-400" />
          </div>
          <div className="mt-4 h-72">
            {loading ? (
              <div className="flex h-full items-center justify-center text-slate-400">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading trend data...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="4 4" stroke="#1e293b" />
                  <XAxis dataKey="label" stroke="#94a3b8" tick={{ fontSize: 12 }} />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderRadius: '0.75rem',
                      border: '1px solid #1e293b',
                      color: '#e2e8f0',
                    }}
                  />
                  <Line type="monotone" dataKey="executions" stroke="#38bdf8" strokeWidth={2} dot={false} name="Executions" />
                  <Line type="monotone" dataKey="passed" stroke="#34d399" strokeWidth={2} dot={false} name="Passed" />
                  <Line type="monotone" dataKey="failed" stroke="#f97316" strokeWidth={2} dot={false} name="Failed" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-100">Category Breakdown</h2>
              <BarChartIcon className="h-5 w-5 text-sky-400" />
            </div>
            <div className="mt-4 h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="label" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderRadius: '0.75rem',
                      border: '1px solid #1e293b',
                      color: '#e2e8f0',
                    }}
                  />
                  <Bar dataKey="executions" fill="#38bdf8" radius={8} name="Executions" />
                  <Bar dataKey="passed" fill="#34d399" radius={8} name="Passed" />
                  <Bar dataKey="failed" fill="#f97316" radius={8} name="Failed" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-100">Priority Coverage</h2>
              <Settings2 className="h-5 w-5 text-sky-400" />
            </div>
            <ul className="mt-4 space-y-3 text-sm text-slate-300">
              {priorityBreakdown.map((item) => (
                <li key={item.label} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-2">
                  <span className="capitalize text-slate-100">{item.label}</span>
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-300">{item.passed} passed</span>
                    <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-rose-200">{item.failed} failed</span>
                    <span className="rounded-full bg-slate-800 px-2 py-0.5 text-slate-300">{item.executions} total</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Recent Executions</h2>
            <p className="text-xs text-slate-400">Latest automated runs with status and coverage details.</p>
          </div>
          <PlayCircle className="h-5 w-5 text-sky-400" />
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {recentExecutions.map((execution) => (
            <div key={execution.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-100 line-clamp-2">{execution.name}</h3>
                <span className={`rounded-full px-2.5 py-1 text-xs capitalize ${statusColors[execution.status] || 'bg-slate-800 text-slate-300'}`}>
                  {execution.status}
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-400">Triggered by {execution.requested_by}</p>
              <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                <span>{execution.total_steps} steps</span>
                <span>
                  {execution.passed_steps}✅ / {execution.failed_steps}❌
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const TestCaseManager = ({ refreshKey, availableTags, onDataChanged }) => {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCase, setSelectedCase] = useState(null);
  const [editingCaseId, setEditingCaseId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [filters, setFilters] = useState({ search: '', status: 'all', priority: 'all', tag: 'all' });
  const [form, setForm] = useState({
    title: '',
    description: '',
    category: '',
    owner: '',
    priority: 'medium',
    status: 'draft',
    tags: '',
    steps: [defaultStep()],
  });
  const [bulkUpdate, setBulkUpdate] = useState({ status: 'ready', priority: 'medium', tags: '' });

  const loadCases = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/test-cases`);
      if (!response.ok) throw new Error('Failed to load test cases');
      const data = await response.json();
      setCases(data);
      setError(null);
    } catch (err) {
      setError(err.message || 'Unable to load test cases');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCases();
  }, [loadCases, refreshKey]);

  const filteredCases = useMemo(
    () =>
      cases.filter((testCase) => {
        if (filters.status !== 'all' && testCase.status !== filters.status) return false;
        if (filters.priority !== 'all' && testCase.priority !== filters.priority) return false;
        if (filters.tag !== 'all' && !testCase.tags.includes(filters.tag)) return false;
        if (filters.search) {
          const text = `${testCase.title} ${testCase.description}`.toLowerCase();
          if (!text.includes(filters.search.toLowerCase())) return false;
        }
        return true;
      }),
    [cases, filters]
  );

  const resetForm = () => {
    setEditingCaseId(null);
    setSelectedCase(null);
    setForm({
      title: '',
      description: '',
      category: '',
      owner: '',
      priority: 'medium',
      status: 'draft',
      tags: '',
      steps: [defaultStep()],
    });
    setSelectedIds([]);
  };

  const handleEdit = (testCase) => {
    setEditingCaseId(testCase.id);
    setSelectedCase(testCase);
    setForm({
      title: testCase.title,
      description: testCase.description,
      category: testCase.category || '',
      owner: testCase.owner || '',
      priority: testCase.priority,
      status: testCase.status,
      tags: testCase.tags.join(', '),
      steps: testCase.steps.length
        ? testCase.steps.map((step) => ({
            action: step.action || '',
            expected: step.expected || '',
            target: step.target || '',
            data: typeof step.data === 'string' ? step.data : JSON.stringify(step.data || {}),
          }))
        : [defaultStep()],
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      const payload = {
        title: form.title,
        description: form.description,
        category: form.category || null,
        owner: form.owner || null,
        priority: form.priority,
        status: form.status,
        tags: parseTags(form.tags),
        steps: form.steps.map((step) => ({
          action: step.action,
          expected: step.expected,
          target: step.target,
          data: (() => {
            if (!step.data) return {};
            try {
              return JSON.parse(step.data);
            } catch (err) {
              return { value: step.data };
            }
          })(),
        })),
      };

      const url = editingCaseId ? `${API_BASE_URL}/test-cases/${editingCaseId}` : `${API_BASE_URL}/test-cases`;
      const method = editingCaseId ? 'PUT' : 'POST';
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || 'Failed to save test case');
      }

      resetForm();
      onDataChanged();
      await loadCases();
    } catch (err) {
      setError(err.message || 'Failed to save test case');
    }
  };

  const handleDelete = async (testCaseId) => {
    if (!window.confirm('Delete this test case? This action cannot be undone.')) return;
    try {
      const response = await fetch(`${API_BASE_URL}/test-cases/${testCaseId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete test case');
      onDataChanged();
      await loadCases();
      resetForm();
    } catch (err) {
      setError(err.message || 'Failed to delete test case');
    }
  };

  const handleBulkUpdate = async (event) => {
    event.preventDefault();
    if (!selectedIds.length) return;
    try {
      const payload = {
        ids: selectedIds,
        status: bulkUpdate.status,
        priority: bulkUpdate.priority,
        tags: bulkUpdate.tags ? parseTags(bulkUpdate.tags) : undefined,
      };
      const response = await fetch(`${API_BASE_URL}/test-cases/bulk-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error('Bulk update failed');
      onDataChanged();
      await loadCases();
      setSelectedIds([]);
    } catch (err) {
      setError(err.message || 'Bulk update failed');
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr,1.1fr]">
      <div className="space-y-5">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="search"
                value={filters.search}
                onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
                placeholder="Search by title, description, or tag"
                className="w-full rounded-xl border border-slate-800 bg-slate-950/60 py-2 pl-9 pr-3 text-sm text-slate-100 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
            <select
              value={filters.status}
              onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
              className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              <option value="all">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="ready">Ready</option>
              <option value="in-review">In Review</option>
              <option value="deprecated">Deprecated</option>
              <option value="archived">Archived</option>
            </select>
            <select
              value={filters.priority}
              onChange={(event) => setFilters((prev) => ({ ...prev, priority: event.target.value }))}
              className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              <option value="all">All Priorities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <select
              value={filters.tag}
              onChange={(event) => setFilters((prev) => ({ ...prev, tag: event.target.value }))}
              className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              <option value="all">All Tags</option>
              {availableTags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={loadCases}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-2 text-sm text-slate-200 hover:border-sky-500/60"
            >
              <RefreshCw className="h-4 w-4" /> Reload
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex h-64 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/40 text-slate-400">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading test cases...
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-6 text-rose-100">{error}</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {filteredCases.map((testCase) => (
              <CaseSummaryCard
                key={testCase.id}
                testCase={testCase}
                selected={selectedIds.includes(testCase.id)}
                onToggleSelection={(caseId, checked) => {
                  setSelectedIds((prev) => {
                    if (checked) {
                      return Array.from(new Set([...prev, caseId]));
                    }
                    return prev.filter((id) => id !== caseId);
                  });
                }}
                onPreview={(target) => {
                  setSelectedCase(target);
                }}
                onEdit={handleEdit}
              />
            ))}
          </div>
        )}

        {selectedIds.length > 0 ? (
          <form onSubmit={handleBulkUpdate} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100">Bulk Update</h3>
              <span className="text-xs text-slate-400">Selected {selectedIds.length} test cases</span>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <label className="text-xs uppercase tracking-wide text-slate-400">
                Status
                <select
                  value={bulkUpdate.status}
                  onChange={(event) => setBulkUpdate((prev) => ({ ...prev, status: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  <option value="ready">Ready</option>
                  <option value="draft">Draft</option>
                  <option value="in-review">In Review</option>
                  <option value="deprecated">Deprecated</option>
                  <option value="archived">Archived</option>
                </select>
              </label>
              <label className="text-xs uppercase tracking-wide text-slate-400">
                Priority
                <select
                  value={bulkUpdate.priority}
                  onChange={(event) => setBulkUpdate((prev) => ({ ...prev, priority: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </label>
              <label className="text-xs uppercase tracking-wide text-slate-400">
                Tags
                <input
                  value={bulkUpdate.tags}
                  onChange={(event) => setBulkUpdate((prev) => ({ ...prev, tags: event.target.value }))}
                  placeholder="comma separated"
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </label>
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                className="rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-2 text-sm text-slate-200 hover:border-sky-500/60"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/50 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200 hover:bg-emerald-500/20"
              >
                <Upload className="h-4 w-4" /> Apply Changes
              </button>
            </div>
          </form>
        ) : null}
      </div>

      <div className="space-y-5">
        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-100">{editingCaseId ? 'Edit Test Case' : 'Create Test Case'}</h2>
            {editingCaseId ? (
              <button type="button" onClick={resetForm} className="text-xs text-slate-400 hover:text-slate-200">
                Reset
              </button>
            ) : null}
          </div>
          <div className="grid gap-4">
            <label className="text-xs uppercase tracking-wide text-slate-400">
              Title
              <input
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                required
                className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </label>
            <label className="text-xs uppercase tracking-wide text-slate-400">
              Description
              <textarea
                value={form.description}
                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                rows={3}
                className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-xs uppercase tracking-wide text-slate-400">
                Category
                <input
                  value={form.category}
                  onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </label>
              <label className="text-xs uppercase tracking-wide text-slate-400">
                Owner
                <input
                  value={form.owner}
                  onChange={(event) => setForm((prev) => ({ ...prev, owner: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <label className="text-xs uppercase tracking-wide text-slate-400">
                Priority
                <select
                  value={form.priority}
                  onChange={(event) => setForm((prev) => ({ ...prev, priority: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </label>
              <label className="text-xs uppercase tracking-wide text-slate-400">
                Status
                <select
                  value={form.status}
                  onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  <option value="draft">Draft</option>
                  <option value="ready">Ready</option>
                  <option value="in-review">In Review</option>
                  <option value="deprecated">Deprecated</option>
                  <option value="archived">Archived</option>
                </select>
              </label>
              <label className="text-xs uppercase tracking-wide text-slate-400">
                Tags
                <input
                  value={form.tags}
                  onChange={(event) => setForm((prev) => ({ ...prev, tags: event.target.value }))}
                  placeholder="comma separated"
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </label>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100">Test Steps</h3>
              <button
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, steps: [...prev.steps, defaultStep()] }))}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-1.5 text-xs text-slate-200 hover:border-sky-500/60"
              >
                <Plus className="h-3.5 w-3.5" /> Add Step
              </button>
            </div>
            <div className="space-y-4">
              {form.steps.map((step, index) => (
                <StepEditor
                  key={index}
                  index={index}
                  step={step}
                  onChange={(updatedStep) =>
                    setForm((prev) => ({
                      ...prev,
                      steps: prev.steps.map((existing, idx) => (idx === index ? updatedStep : existing)),
                    }))
                  }
                  onRemove={() =>
                    setForm((prev) => ({
                      ...prev,
                      steps: prev.steps.filter((_, idx) => idx !== index),
                    }))
                  }
                />
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3">
            {editingCaseId ? (
              <button
                type="button"
                onClick={() => selectedCase && handleDelete(selectedCase.id)}
                className="inline-flex items-center gap-2 rounded-xl border border-rose-500/50 bg-rose-500/10 px-4 py-2 text-sm text-rose-200 hover:bg-rose-500/20"
              >
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            ) : null}
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-xl border border-sky-500/50 bg-sky-500/10 px-4 py-2 text-sm text-sky-100 hover:bg-sky-500/20"
            >
              <Upload className="h-4 w-4" /> {editingCaseId ? 'Update Test Case' : 'Create Test Case'}
            </button>
          </div>
        </form>

        {selectedCase ? (
          <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-100">Case Details</h2>
              <span className="text-xs text-slate-400">ID #{selectedCase.id}</span>
            </div>
            <p className="text-sm text-slate-300">{selectedCase.description}</p>
            <div className="grid gap-3 text-xs text-slate-400">
              <div>Created: {selectedCase.created_at ? format(parseISO(selectedCase.created_at), 'PPpp') : 'Unknown'}</div>
              <div>Last Updated: {selectedCase.updated_at ? format(parseISO(selectedCase.updated_at), 'PPpp') : 'Unknown'}</div>
              <div>Steps: {selectedCase.steps.length}</div>
            </div>
            <div className="space-y-3">
              {selectedCase.steps.map((step, index) => (
                <div key={index} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-300">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Step {index + 1}</span>
                    {step.target ? <span className="rounded-full bg-slate-800 px-2 py-0.5 text-slate-300">{step.target}</span> : null}
                  </div>
                  <p className="mt-2 font-medium text-slate-100">{step.action}</p>
                  {step.expected ? <p className="mt-1 text-xs text-emerald-300">Expected: {step.expected}</p> : null}
                  {step.data && Object.keys(step.data).length ? (
                    <p className="mt-2 text-xs text-slate-400">Data: {JSON.stringify(step.data)}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 text-sm text-slate-400">
            Select a test case to review detailed steps and metadata.
          </div>
        )}
      </div>
    </div>
  );
};

const ExecutionCenter = ({ refreshKey, availableTags, onDataChanged }) => {
  const [executions, setExecutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cases, setCases] = useState([]);
  const [selectedExecutionId, setSelectedExecutionId] = useState(null);
  const [executionDetails, setExecutionDetails] = useState(null);
  const [error, setError] = useState(null);
  const [singleRunForm, setSingleRunForm] = useState({ testCaseId: '', requestedBy: '', tags: '' });
  const [promptRunForm, setPromptRunForm] = useState({ prompt: '', name: '', requestedBy: '', tags: '', priority: 'medium', category: '' });
  const [batchSelection, setBatchSelection] = useState([]);

  const loadExecutions = useCallback(async () => {
    setLoading(true);
    try {
      const [execResponse, caseResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/executions?limit=40`),
        fetch(`${API_BASE_URL}/test-cases`),
      ]);
      if (!execResponse.ok || !caseResponse.ok) throw new Error('Failed to load execution data');
      const [execData, caseData] = await Promise.all([execResponse.json(), caseResponse.json()]);
      setExecutions(execData);
      setCases(caseData);
      setError(null);
    } catch (err) {
      setError(err.message || 'Unable to load executions');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchExecutionDetails = useCallback(async (executionId) => {
    const response = await fetch(`${API_BASE_URL}/executions/${executionId}`);
    if (!response.ok) throw new Error('Failed to load execution details');
    const data = await response.json();
    setExecutionDetails(data);
    setSelectedExecutionId(executionId);
  }, []);

  useEffect(() => {
    loadExecutions();
  }, [loadExecutions, refreshKey]);

  useEffect(() => {
    if (!executionDetails || !['queued', 'running'].includes(executionDetails.status)) {
      return undefined;
    }
    const source = new EventSource(`${API_BASE_URL}/executions/${executionDetails.id}/stream`);

    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (!payload) return;
        if (!payload.type) {
          setExecutionDetails(payload);
          return;
        }
        if (payload.type === 'status') {
          setExecutionDetails((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              status: payload.status || prev.status,
              total_steps: payload.total_steps ?? prev.total_steps,
              passed_steps: payload.passed_steps ?? prev.passed_steps,
              failed_steps: payload.failed_steps ?? prev.failed_steps,
            };
          });
        } else if (payload.type === 'step-start') {
          setExecutionDetails((prev) => {
            if (!prev) return prev;
            const steps = [...(prev.steps || [])];
            const existingIndex = steps.findIndex((item) => item.step_index === payload.step_index);
            const baseStep = {
              id: payload.step_id,
              execution_id: prev.id,
              step_index: payload.step_index,
              action: payload.action || `Step ${payload.step_index + 1}`,
              expected: '',
              status: 'running',
              details: null,
              screenshot_path: null,
              started_at: new Date().toISOString(),
              completed_at: null,
            };
            if (existingIndex >= 0) {
              steps[existingIndex] = { ...steps[existingIndex], ...baseStep };
            } else {
              steps.push(baseStep);
            }
            steps.sort((a, b) => a.step_index - b.step_index);
            return { ...prev, steps };
          });
        } else if (payload.type === 'step-complete') {
          setExecutionDetails((prev) => {
            if (!prev) return prev;
            const steps = [...(prev.steps || [])];
            const index = steps.findIndex((item) => item.step_index === payload.step_index);
            if (index >= 0) {
              steps[index] = {
                ...steps[index],
                status: payload.status || steps[index].status,
                completed_at: new Date().toISOString(),
                screenshot_path: payload.screenshot_path || steps[index].screenshot_path,
              };
            }
            return { ...prev, steps };
          });
        } else if (payload.type === 'completed') {
          setExecutionDetails((prev) => (prev ? { ...prev, status: payload.status || prev.status } : prev));
          loadExecutions();
          onDataChanged();
        }
      } catch (err) {
        console.error('Failed to process execution event', err);
      }
    };

    source.onerror = () => {
      source.close();
    };

    return () => {
      source.close();
    };
  }, [executionDetails, loadExecutions, onDataChanged]);

  const startSingleRun = async (event) => {
    event.preventDefault();
    if (!singleRunForm.testCaseId) return;
    try {
      const payload = {
        test_case_id: Number(singleRunForm.testCaseId),
        requested_by: singleRunForm.requestedBy || undefined,
        tags: parseTags(singleRunForm.tags),
      };
      const response = await fetch(`${API_BASE_URL}/executions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error('Failed to start execution');
      const data = await response.json();
      setSingleRunForm({ testCaseId: '', requestedBy: '', tags: '' });
      await loadExecutions();
      onDataChanged();
      await fetchExecutionDetails(data.id);
    } catch (err) {
      setError(err.message || 'Failed to start execution');
    }
  };

  const startPromptRun = async (event) => {
    event.preventDefault();
    if (!promptRunForm.prompt.trim()) return;
    try {
      const payload = {
        prompt: promptRunForm.prompt,
        name: promptRunForm.name || undefined,
        requested_by: promptRunForm.requestedBy || undefined,
        tags: parseTags(promptRunForm.tags),
        priority: promptRunForm.priority,
        category: promptRunForm.category || undefined,
      };
      const response = await fetch(`${API_BASE_URL}/executions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error('Failed to start natural language execution');
      const data = await response.json();
      setPromptRunForm({ prompt: '', name: '', requestedBy: '', tags: '', priority: 'medium', category: '' });
      await loadExecutions();
      onDataChanged();
      await fetchExecutionDetails(data.id);
    } catch (err) {
      setError(err.message || 'Failed to start natural language execution');
    }
  };

  const startBatchRun = async (event) => {
    event.preventDefault();
    if (!batchSelection.length) return;
    try {
      const payload = {
        test_case_ids: batchSelection,
        requested_by: singleRunForm.requestedBy || undefined,
        tags: parseTags(singleRunForm.tags),
      };
      const response = await fetch(`${API_BASE_URL}/executions/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error('Failed to start batch execution');
      setBatchSelection([]);
      await loadExecutions();
      onDataChanged();
    } catch (err) {
      setError(err.message || 'Failed to start batch execution');
    }
  };

  const baseScreenshotUrl = API_BASE_URL;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr,1fr]">
      <div className="space-y-5">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-100">Launch Test Executions</h2>
            <button
              type="button"
              onClick={loadExecutions}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-sm text-slate-200 hover:border-sky-500/60"
            >
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
          </div>
          <form onSubmit={startSingleRun} className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <h3 className="text-sm font-semibold text-slate-100">Run a Test Case</h3>
            <select
              value={singleRunForm.testCaseId}
              onChange={(event) => setSingleRunForm((prev) => ({ ...prev, testCaseId: event.target.value }))}
              className="w-full rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              <option value="">Select a test case</option>
              {cases.map((testCase) => (
                <option key={testCase.id} value={testCase.id}>
                  {testCase.title}
                </option>
              ))}
            </select>
            <div className="grid gap-3 md:grid-cols-2">
              <input
                value={singleRunForm.requestedBy}
                onChange={(event) => setSingleRunForm((prev) => ({ ...prev, requestedBy: event.target.value }))}
                placeholder="Requested by"
                className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
              <input
                value={singleRunForm.tags}
                onChange={(event) => setSingleRunForm((prev) => ({ ...prev, tags: event.target.value }))}
                placeholder="Tags (comma separated)"
                className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-xl border border-sky-500/50 bg-sky-500/10 px-4 py-2 text-sm text-sky-100 hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!singleRunForm.testCaseId}
            >
              <PlayCircle className="h-4 w-4" /> Run Selected Test
            </button>
          </form>

          <form onSubmit={startBatchRun} className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <h3 className="text-sm font-semibold text-slate-100">Batch Execution</h3>
            <div className="max-h-40 space-y-2 overflow-y-auto pr-2">
              {cases.map((testCase) => (
                <label key={testCase.id} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-200">
                  <span className="line-clamp-1">{testCase.title}</span>
                  <input
                    type="checkbox"
                    checked={batchSelection.includes(testCase.id)}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setBatchSelection((prev) => {
                        if (checked) {
                          return Array.from(new Set([...prev, testCase.id]));
                        }
                        return prev.filter((value) => value !== testCase.id);
                      });
                    }}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-sky-500 focus:ring-sky-500"
                  />
                </label>
              ))}
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/50 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!batchSelection.length}
            >
              <Upload className="h-4 w-4" /> Run {batchSelection.length || '0'} Test(s)
            </button>
          </form>

          <form onSubmit={startPromptRun} className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <h3 className="text-sm font-semibold text-slate-100">Natural Language Automation</h3>
            <textarea
              value={promptRunForm.prompt}
              onChange={(event) => setPromptRunForm((prev) => ({ ...prev, prompt: event.target.value }))}
              rows={4}
              placeholder="Describe the end-to-end test scenario in natural language"
              className="w-full rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
            <div className="grid gap-3 md:grid-cols-2">
              <input
                value={promptRunForm.name}
                onChange={(event) => setPromptRunForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Execution name"
                className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
              <input
                value={promptRunForm.requestedBy}
                onChange={(event) => setPromptRunForm((prev) => ({ ...prev, requestedBy: event.target.value }))}
                placeholder="Requested by"
                className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <select
                value={promptRunForm.priority}
                onChange={(event) => setPromptRunForm((prev) => ({ ...prev, priority: event.target.value }))}
                className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <input
                value={promptRunForm.category}
                onChange={(event) => setPromptRunForm((prev) => ({ ...prev, category: event.target.value }))}
                placeholder="Category"
                className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
            <input
              value={promptRunForm.tags}
              onChange={(event) => setPromptRunForm((prev) => ({ ...prev, tags: event.target.value }))}
              placeholder="Tags (comma separated)"
              className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-xl border border-indigo-500/50 bg-indigo-500/10 px-4 py-2 text-sm text-indigo-200 hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!promptRunForm.prompt.trim()}
            >
              <PlayCircle className="h-4 w-4" /> Execute Prompt
            </button>
          </form>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/40">
          <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
            <h2 className="text-lg font-semibold text-slate-100">Execution History</h2>
            <span className="text-xs text-slate-400">{executions.length} records</span>
          </div>
          {error ? (
            <div className="p-5 text-sm text-rose-200">{error}</div>
          ) : loading ? (
            <div className="flex h-40 items-center justify-center text-slate-400">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading executions...
            </div>
          ) : (
            <div className="space-y-2 p-5">
              {executions.map((execution) => (
                <button
                  key={execution.id}
                  type="button"
                  onClick={() => fetchExecutionDetails(execution.id)}
                  className={`w-full rounded-xl border px-4 py-3 text-left transition hover:border-sky-500/60 hover:bg-slate-900/80 ${
                    selectedExecutionId === execution.id ? 'border-sky-500/60 bg-slate-900/80' : 'border-slate-800 bg-slate-950/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-100 line-clamp-1">{execution.name}</h3>
                      <p className="text-xs text-slate-400">{execution.requested_by || 'automation-bot'}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs capitalize ${statusColors[execution.status] || 'bg-slate-800 text-slate-300'}`}>
                      {execution.status}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                    <span>{execution.total_steps} steps</span>
                    <span>
                      {execution.passed_steps}✅ / {execution.failed_steps}❌
                    </span>
                    {execution.priority ? <span className="capitalize">Priority {execution.priority}</span> : null}
                    {execution.category ? <span>Category {execution.category}</span> : null}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-5">
        {executionDetails ? (
          <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-100">Execution Details</h2>
                <p className="text-xs text-slate-400">ID #{executionDetails.id}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs capitalize ${statusColors[executionDetails.status] || 'bg-slate-800 text-slate-300'}`}>
                {executionDetails.status}
              </span>
            </div>
            {executionDetails.prompt ? (
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-300">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Prompt</h3>
                <p className="mt-2 whitespace-pre-line">{executionDetails.prompt}</p>
              </div>
            ) : null}
            {executionDetails.test_case ? (
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-300">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Linked Test Case</h3>
                <p className="mt-2 font-semibold text-slate-100">{executionDetails.test_case.title}</p>
                <p className="mt-1 text-xs text-slate-400">{executionDetails.test_case.description}</p>
              </div>
            ) : null}
            <div className="grid gap-3 text-xs text-slate-400">
              <div>Requested By: {executionDetails.requested_by || 'automation-bot'}</div>
              <div>Started: {executionDetails.started_at ? format(parseISO(executionDetails.started_at), 'PPpp') : 'Pending'}</div>
              <div>
                Completed: {executionDetails.completed_at ? format(parseISO(executionDetails.completed_at), 'PPpp') : 'In progress'}
              </div>
              <div>
                Duration:{' '}
                {executionDetails.duration_ms ? `${(executionDetails.duration_ms / 1000).toFixed(1)} seconds` : 'N/A'}
              </div>
              <div>Tags: {executionDetails.tags?.length ? executionDetails.tags.join(', ') : 'None'}</div>
            </div>
            <div className="space-y-3">
              {executionDetails.steps?.map((step) => (
                <div key={step.id ?? `${executionDetails.id}-${step.step_index}`} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-300">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-400">Step {step.step_index + 1}</p>
                      <p className="mt-1 font-semibold text-slate-100">{step.action}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs capitalize ${statusColors[step.status] || 'bg-slate-800 text-slate-300'}`}>
                      {step.status}
                    </span>
                  </div>
                  {step.expected ? <p className="mt-2 text-xs text-emerald-300">Expected: {step.expected}</p> : null}
                  {step.details ? <p className="mt-1 text-xs text-slate-400">{step.details}</p> : null}
                  {step.screenshot_path ? (
                    <a
                      href={`${baseScreenshotUrl}${step.screenshot_path}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex items-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-100 hover:bg-sky-500/20"
                    >
                      <PlayCircle className="h-3.5 w-3.5" /> View Screenshot
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
            {executionDetails.error_message ? (
              <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-rose-300">Error Message</h3>
                <p className="mt-2">{executionDetails.error_message}</p>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 text-sm text-slate-400">
            Select an execution to view real-time progress and detailed reporting.
          </div>
        )}
      </div>
    </div>
  );
};

const App = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [refreshKey, setRefreshKey] = useState(0);
  const [availableTags, setAvailableTags] = useState([]);

  const loadTags = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/tags`);
      if (!response.ok) return;
      const data = await response.json();
      setAvailableTags(data);
    } catch (err) {
      console.error('Failed to load tags', err);
    }
  }, []);

  useEffect(() => {
    loadTags();
  }, [loadTags, refreshKey]);

  const handleDataChanged = useCallback(() => {
    setRefreshKey((value) => value + 1);
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-6 py-10 space-y-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-cyan-400 text-slate-950">
                <PlayCircle className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-50">Web Automation Quality Portal</h1>
                <p className="text-sm text-slate-400">
                  Smart test case management, natural-language executions, and real-time automation analytics.
                </p>
              </div>
            </div>
          </div>
          <nav className="flex flex-wrap gap-3">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm transition ${
                  activeTab === tab.id
                    ? 'border-sky-500/60 bg-sky-500/10 text-sky-100'
                    : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-sky-500/40 hover:text-slate-100'
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </header>

        <main className="space-y-8">
          {activeTab === 'dashboard' ? <DashboardView refreshKey={refreshKey} /> : null}
          {activeTab === 'testCases' ? (
            <TestCaseManager refreshKey={refreshKey} availableTags={availableTags} onDataChanged={handleDataChanged} />
          ) : null}
          {activeTab === 'executions' ? (
            <ExecutionCenter refreshKey={refreshKey} availableTags={availableTags} onDataChanged={handleDataChanged} />
          ) : null}
        </main>

        <footer className="border-t border-slate-800 pt-6 text-xs text-slate-500">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <span>Automation insights backed by FastAPI, SQLModel, and React dashboards.</span>
            <span>
              Need help? Reach out to <a href="mailto:qa-ops@example.com" className="text-sky-400 hover:text-sky-300">QA Ops</a>.
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default App;
