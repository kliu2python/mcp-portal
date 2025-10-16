import { Edit3, Trash2, Upload } from 'lucide-react';

function PromptLibraryTab({
  promptForm,
  onPromptFormChange,
  onPromptSubmit,
  onPromptReset,
  prompts,
  onPromptEdit,
  onPromptDelete,
}) {
  return (
    <div className="space-y-6">
      <form onSubmit={onPromptSubmit} className="rounded-lg border border-slate-700 bg-slate-900/60 p-6">
        <h2 className="mb-4 text-lg font-semibold text-purple-200">
          {promptForm.id ? 'Edit Prompt Template' : 'Create Prompt Template'}
        </h2>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-gray-300">Name</label>
            <input
              required
              value={promptForm.name}
              onChange={(event) => onPromptFormChange('name', event.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-300">Description</label>
            <input
              value={promptForm.description}
              onChange={(event) => onPromptFormChange('description', event.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-300">Template</label>
            <textarea
              required
              rows={6}
              value={promptForm.template}
              onChange={(event) => onPromptFormChange('template', event.target.value)}
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
                onClick={onPromptReset}
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
          <div key={prompt.id} className="rounded-lg border border-slate-700 bg-slate-900/60 p-5">
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
                  onClick={() => onPromptEdit(prompt)}
                  disabled={prompt.is_system}
                  className="rounded-md border border-slate-700 p-1 text-gray-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:text-gray-500"
                >
                  <Edit3 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => onPromptDelete(prompt)}
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
}

export default PromptLibraryTab;
