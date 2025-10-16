import { Edit3, Plus, XCircle } from 'lucide-react';

function TestCaseModal({
  isOpen,
  onClose,
  onSubmit,
  testCaseForm,
  onFieldChange,
  priorities,
  statuses,
  isEditing,
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6">
      <div className="w-full max-w-3xl overflow-hidden rounded-lg border border-slate-700 bg-slate-900/95 shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-700 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-purple-200">
              {isEditing ? 'Edit Task Definition' : 'Create Task Definition'}
            </h2>
            <p className="mt-1 text-sm text-gray-400">
              Draft tasks can be refined and promoted to ready once validated.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-700 p-1 text-gray-400 transition-colors hover:bg-slate-800"
          >
            <XCircle className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={onSubmit} className="max-h-[75vh] overflow-y-auto px-6 py-4">
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-1">
                <label className="mb-1 block text-sm text-gray-300">Reference</label>
                <input
                  required
                  value={testCaseForm.reference}
                  onChange={(event) => onFieldChange('reference', event.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                />
              </div>
              <div className="md:col-span-1">
                <label className="mb-1 block text-sm text-gray-300">Title</label>
                <input
                  required
                  value={testCaseForm.title}
                  onChange={(event) => onFieldChange('title', event.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-300">Description</label>
              <textarea
                rows={3}
                value={testCaseForm.description}
                onChange={(event) => onFieldChange('description', event.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm text-gray-300">Category</label>
                <input
                  value={testCaseForm.category}
                  onChange={(event) => onFieldChange('category', event.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-300">Priority</label>
                <select
                  value={testCaseForm.priority}
                  onChange={(event) => onFieldChange('priority', event.target.value)}
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
                  onChange={(event) => onFieldChange('status', event.target.value)}
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
                  onChange={(event) => onFieldChange('tags', event.target.value)}
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
                onChange={(event) => onFieldChange('steps', event.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
              />
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-slate-700 px-4 py-2 text-sm text-gray-200 transition-colors hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex items-center gap-2 rounded-md bg-purple-600 px-4 py-2 text-white transition-colors hover:bg-purple-700"
              >
                {isEditing ? <Edit3 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {isEditing ? 'Update Task' : 'Create Task'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default TestCaseModal;
