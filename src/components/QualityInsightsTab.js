import { Loader2 } from 'lucide-react';

function QualityInsightsTab({ insights, isLoading, formatDate, formatDuration }) {
  if (!insights) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-400">
        {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : 'No insights available yet.'}
      </div>
    );
  }

  const cards = [
    { label: 'Total Test Cases', value: insights.total_test_cases },
    { label: 'Ready', value: insights.ready_test_cases },
    { label: 'Blocked', value: insights.blocked_test_cases },
    { label: 'Draft', value: insights.draft_test_cases },
    { label: 'Total Runs', value: insights.total_runs },
    { label: 'Pass Rate', value: `${insights.success_rate.toFixed(1)}%` },
    { label: 'Average Duration', value: formatDuration(insights.average_duration) },
    { label: 'Last Run', value: formatDate(insights.latest_run_at) },
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
            <div className="text-right text-sm text-purple-200">{entry.pass_rate.toFixed(1)}%</div>
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
          <div key={card.label} className="rounded-lg border border-slate-700 bg-slate-900/60 p-5">
            <p className="text-xs uppercase tracking-wide text-gray-400">{card.label}</p>
            <p className="mt-2 text-2xl font-semibold text-purple-200">{card.value}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        {renderBreakdown('By Category', insights.category_breakdown)}
        {renderBreakdown('By Priority', insights.priority_breakdown)}
      </div>
    </div>
  );
}

export default QualityInsightsTab;
