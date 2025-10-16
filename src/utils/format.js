export function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

export function formatDuration(duration) {
  if (!duration && duration !== 0) return '—';
  if (duration < 60) return `${duration.toFixed(1)}s`;
  const minutes = Math.floor(duration / 60);
  const seconds = Math.round(duration % 60);
  return `${minutes}m ${seconds}s`;
}
