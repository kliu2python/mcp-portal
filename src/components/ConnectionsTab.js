import { Edit3, Loader2, RefreshCcw, Trash2, Upload } from 'lucide-react';

function ConnectionsTab({
  modelConfigs,
  defaultModelConfig,
  onRefreshConfigs,
  onSubmitLlm,
  llmForm,
  onLlmFormChange,
  onLlmFormReset,
  isSavingLlm,
  llmModels,
  onLlmEdit,
  onLlmDelete,
}) {
  return (
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
            onClick={onRefreshConfigs}
            className="flex items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-sm text-gray-200 transition-colors hover:bg-slate-800"
          >
            <RefreshCcw className="h-4 w-4" /> Refresh
          </button>
        </div>
        <div className="mt-4 space-y-3">
          {modelConfigs.map((config) => (
            <div key={config.id} className="rounded-lg border border-slate-700 bg-slate-900/60 p-5">
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
        <form onSubmit={onSubmitLlm} className="rounded-lg border border-slate-700 bg-slate-900/60 p-6">
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
                onChange={(event) => onLlmFormChange('name', event.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-300">Base URL</label>
              <input
                required
                value={llmForm.baseUrl}
                onChange={(event) => onLlmFormChange('baseUrl', event.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-300">API Key</label>
              <input
                type="password"
                value={llmForm.apiKey}
                onChange={(event) => onLlmFormChange('apiKey', event.target.value)}
                placeholder={llmForm.id ? 'Leave blank to keep existing key' : 'Required'}
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-300">Model Name</label>
              <input
                required
                value={llmForm.modelName}
                onChange={(event) => onLlmFormChange('modelName', event.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-300">Description</label>
              <textarea
                rows={3}
                value={llmForm.description}
                onChange={(event) => onLlmFormChange('description', event.target.value)}
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
                  onClick={onLlmFormReset}
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
            <div key={model.id} className="rounded-lg border border-slate-700 bg-slate-900/60 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-purple-200">{model.name}</h3>
                  <p className="text-sm text-gray-400">{model.model_name}</p>
                  <p className="text-xs text-gray-500">{model.base_url}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onLlmEdit(model)}
                    disabled={model.is_system}
                    className="rounded-md border border-slate-700 p-1 text-gray-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:text-gray-500"
                  >
                    <Edit3 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => onLlmDelete(model)}
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
}

export default ConnectionsTab;
