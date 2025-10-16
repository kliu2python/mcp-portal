import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  ClipboardList,
  Edit3,
  Loader2,
  Monitor,
  Play,
  Plus,
  RefreshCcw,
  StopCircle,
  Trash2,
} from 'lucide-react';
import XpraFrame from './XpraFrame';

function TestCasesTab({
  view,
  onViewChange,
  testCaseSearch,
  onSearchChange,
  filteredTestCases,
  selectedTestCaseIds,
  onToggleTestCaseSelection,
  onToggleSelectAllFiltered,
  onRefreshAll,
  onOpenCreateTestCaseModal,
  onEditTestCase,
  onDeleteTestCase,
  onQueueRuns,
  isQueueLoading,
  selectedQueueModel,
  llmModels,
  runForm,
  onRunFormChange,
  prompts,
  groupedRuns,
  selectedRunId,
  onSelectRun,
  selectedRun,
  onRefreshRuns,
  formatDate,
  formatDuration,
  onTaskStart,
  taskForm,
  onTaskFormChange,
  selectedManualModel,
  onTaskCancel,
  isTaskStreaming,
  activeTaskId,
  taskLogs,
  taskStatus,
  taskServerInfo,
  manualRunRecord,
}) {
  const [isRunXpraModalOpen, setIsRunXpraModalOpen] = useState(false);
  const [isManualXpraModalOpen, setIsManualXpraModalOpen] = useState(false);

  const openXpraWindow = useCallback((url) => {
    if (!url) {
      return;
    }

    const { screen: screenInfo } = window;
    const availableWidth = screenInfo?.availWidth ?? window.innerWidth ?? 1600;
    const availableHeight = screenInfo?.availHeight ?? window.innerHeight ?? 900;
    const width = Math.max(1024, Math.min(availableWidth, 1600));
    const height = Math.max(768, Math.min(availableHeight, 1000));
    const left = Math.max(0, Math.round((availableWidth - width) / 2));
    const top = Math.max(0, Math.round((availableHeight - height) / 2));

    const features = [
      'noopener',
      'noreferrer',
      'resizable=yes',
      'scrollbars=yes',
      `width=${Math.round(width)}`,
      `height=${Math.round(height)}`,
      `left=${left}`,
      `top=${top}`,
    ].join(',');

    window.open(url, '_blank', features);
  }, []);

  useEffect(() => {
    if (view !== 'history') {
      setIsRunXpraModalOpen(false);
    }
    if (view !== 'manual') {
      setIsManualXpraModalOpen(false);
    }
  }, [view]);

  useEffect(() => {
    if (!selectedRun?.xpra_url) {
      setIsRunXpraModalOpen(false);
    }
  }, [selectedRun]);

  useEffect(() => {
    if (!taskServerInfo?.xpraUrl) {
      setIsManualXpraModalOpen(false);
    }
  }, [taskServerInfo]);

  useEffect(() => {
    if (!isRunXpraModalOpen && !isManualXpraModalOpen) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (isRunXpraModalOpen) {
          setIsRunXpraModalOpen(false);
        }
        if (isManualXpraModalOpen) {
          setIsManualXpraModalOpen(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isManualXpraModalOpen, isRunXpraModalOpen]);

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
            const isActive = view === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onViewChange(tab.id)}
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
            onClick={onOpenCreateTestCaseModal}
            className="flex items-center gap-2 rounded-md border border-purple-500/40 px-4 py-2 text-sm text-purple-200 transition-colors hover:border-purple-400 hover:bg-purple-500/20"
          >
            <Plus className="h-4 w-4" /> New Task
          </button>
        </div>
      </div>

      {view === 'catalog' && (
        <>
          <div className="space-y-4">
            <div className="flex flex-col gap-3 rounded-lg border border-slate-700 bg-slate-900/60 p-4 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  value={testCaseSearch}
                  onChange={(event) => onSearchChange(event.target.value)}
                  placeholder="Search MCP tasks..."
                  className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-purple-500 focus:outline-none sm:w-80"
                />
                <button
                  type="button"
                  onClick={onToggleSelectAllFiltered}
                  className="rounded-md border border-purple-500/40 px-3 py-2 text-sm text-purple-200 hover:bg-purple-500/10"
                >
                  {allSelected ? 'Unselect' : 'Select'} filtered
                </button>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onRefreshAll}
                  className="flex items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-sm text-gray-200 transition-colors hover:bg-slate-800"
                >
                  <RefreshCcw className="h-4 w-4" /> Refresh
                </button>
                <span className="text-sm text-gray-400">{selectedTestCaseIds.length} selected</span>
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-slate-700">
              <table className="min-w-full divide-y divide-slate-700">
                <thead className="bg-slate-800/60">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                      <input type="checkbox" checked={allSelected} onChange={onToggleSelectAllFiltered} />
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
                          onChange={() => onToggleTestCaseSelection(testCase.id)}
                        />
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-purple-200">{testCase.reference}</td>
                      <td className="px-4 py-3 text-sm text-gray-200">{testCase.title}</td>
                      <td className="px-4 py-3 text-sm text-gray-400">{testCase.category || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-400">{testCase.priority}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className="rounded-full bg-slate-800/80 px-3 py-1 text-xs text-gray-300">
                          {testCase.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => onEditTestCase(testCase)}
                            className="rounded-md border border-slate-700 p-1 text-gray-300 hover:bg-slate-800"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => onDeleteTestCase(testCase.id)}
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
                onClick={onQueueRuns}
                disabled={isQueueLoading || !selectedQueueModel}
                className="flex items-center gap-2 rounded-md bg-purple-600 px-4 py-2 text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:bg-purple-900/40"
              >
                {isQueueLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Queue Run
              </button>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="space-y-3 rounded-md border border-slate-700 bg-slate-950/40 p-4">
                <label className="text-xs uppercase tracking-wide text-gray-400">LLM connection</label>
                <select
                  value={runForm.modelId}
                  onChange={(event) => onRunFormChange('modelId', event.target.value)}
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
                  onChange={(event) => onRunFormChange('promptId', event.target.value)}
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
                  onChange={(event) => onRunFormChange('promptOverride', event.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                />
              </div>
            </div>
          </div>
        </>
      )}

      {view === 'history' && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-1">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-purple-200">Run Groups</h3>
              <button
                type="button"
                onClick={onRefreshRuns}
                className="flex items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-sm text-gray-200 hover:bg-slate-800"
              >
                <RefreshCcw className="h-4 w-4" /> Refresh
              </button>
            </div>
            {['draft', 'running', 'pending', 'queued', 'completed', 'failed'].map((group) => (
              <div key={group} className="space-y-2">
                <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-400">{group}</h4>
                {groupedRuns[group].map((run) => (
                  <button
                    key={run.id}
                    onClick={() => onSelectRun(run.id)}
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
                      <p className="text-sm text-gray-400">Model Config ID: {selectedRun.model_config_id || '—'}</p>
                      <p className="text-sm text-gray-400">Server URL: {selectedRun.server_url || '—'}</p>
                    </div>
                    <div className="space-y-2 text-sm text-gray-400">
                      <p>Created: {formatDate(selectedRun.created_at)}</p>
                      <p>Started: {formatDate(selectedRun.started_at)}</p>
                      <p>Completed: {formatDate(selectedRun.completed_at)}</p>
                      <p>
                        Duration{' '}
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
                    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-200">
                        <Monitor className="h-4 w-4 text-purple-300" /> Xpra Session
                      </h4>
                      <div className="flex items-center gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => setIsRunXpraModalOpen(true)}
                          disabled={!selectedRun?.xpra_url}
                          className="rounded border border-slate-600 px-2 py-1 text-gray-200 transition hover:border-purple-400 hover:text-purple-200 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-500"
                        >
                          Open popup
                        </button>
                        <button
                          type="button"
                          onClick={() => openXpraWindow(selectedRun?.xpra_url)}
                          disabled={!selectedRun?.xpra_url}
                          className="rounded border border-slate-600 px-2 py-1 text-gray-200 transition hover:border-purple-400 hover:text-purple-200 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-500"
                        >
                          Pop out
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-gray-400">
                      Launch the embedded Xpra session in a popup window for a larger view.
                    </p>
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

      {view === 'manual' && (
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

          <form onSubmit={onTaskStart} className="space-y-5">
            <textarea
              rows={4}
              required
              value={taskForm.task}
              onChange={(event) => onTaskFormChange('task', event.target.value)}
              placeholder="Describe the task for the MCP agent to execute"
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
            />
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3 rounded-md border border-slate-700 bg-slate-950/40 p-4">
                <label className="text-xs uppercase tracking-wide text-gray-400">LLM connection</label>
                <select
                  value={taskForm.modelId}
                  onChange={(event) => onTaskFormChange('modelId', event.target.value)}
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
                    onChange={(event) => onTaskFormChange('promptId', event.target.value)}
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
                    onChange={(event) => onTaskFormChange('promptText', event.target.value)}
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
              {(isTaskStreaming || activeTaskId) && (
                <button
                  type="button"
                  onClick={onTaskCancel}
                  className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 ${
                    isTaskStreaming
                      ? 'bg-rose-600 text-white hover:bg-rose-700'
                      : 'border border-slate-700 text-gray-200 hover:bg-slate-800'
                  }`}
                >
                  <StopCircle className="h-4 w-4" /> {isTaskStreaming ? 'Stop Task' : 'Cancel Task'}
                </button>
              )}
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
                      {typeof entry.message === 'string'
                        ? entry.message
                        : JSON.stringify(entry.message)}
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
                    Status{' '}
                    <span className="font-semibold text-purple-200">{taskStatus || 'idle'}</span>
                  </p>
                  <p>
                    MCP Session{' '}
                    <span className="text-gray-400">{taskServerInfo.serverUrl || 'Waiting'}</span>
                  </p>
                  {manualRunRecord && manualRunRecord.reference && (
                    <p>
                      Draft Test Case{' '}
                      <span className="font-semibold text-purple-200">{manualRunRecord.reference}</span>
                    </p>
                  )}
                  {manualRunRecord && manualRunRecord.testCaseId && (
                    <p>
                      Test Case ID{' '}
                      <span className="text-gray-400">{manualRunRecord.testCaseId}</span>
                    </p>
                  )}
                </div>
                <div className="mt-4 flex flex-col gap-2">
                  <div className="flex items-center justify-end gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setIsManualXpraModalOpen(true)}
                      disabled={!taskServerInfo?.xpraUrl}
                      className="rounded border border-slate-600 px-2 py-1 text-gray-200 transition hover:border-purple-400 hover:text-purple-200 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-500"
                    >
                      Open popup
                    </button>
                    <button
                      type="button"
                      onClick={() => openXpraWindow(taskServerInfo?.xpraUrl)}
                      disabled={!taskServerInfo?.xpraUrl}
                      className="rounded border border-slate-600 px-2 py-1 text-gray-200 transition hover:border-purple-400 hover:text-purple-200 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-500"
                    >
                      Pop out
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 text-right">
                    Use the popup to interact with the live Xpra session.
                  </p>
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

      {isRunXpraModalOpen && selectedRun?.xpra_url && (
        <div
          className="fixed inset-0 z-50 bg-black/80"
          role="dialog"
          aria-modal="true"
          onClick={() => setIsRunXpraModalOpen(false)}
        >
          <div
            className="flex h-full w-full flex-col bg-slate-950"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex-1 min-h-0">
              <XpraFrame src={selectedRun.xpra_url} />
            </div>
          </div>
        </div>
      )}

      {isManualXpraModalOpen && taskServerInfo?.xpraUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80"
          role="dialog"
          aria-modal="true"
          onClick={() => setIsManualXpraModalOpen(false)}
        >
          <div
            className="flex h-full w-full flex-col bg-slate-950"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex-1 min-h-0">
              <XpraFrame src={taskServerInfo.xpraUrl} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TestCasesTab;
