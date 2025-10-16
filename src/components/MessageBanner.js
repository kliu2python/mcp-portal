import { CheckCircle, Loader2, XCircle } from 'lucide-react';

const messageVariants = {
  success: 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40',
  error: 'bg-rose-500/20 text-rose-200 border border-rose-400/40',
  info: 'bg-slate-500/20 text-slate-200 border border-slate-400/40',
};

function MessageBanner({ message }) {
  if (!message) {
    return null;
  }

  return (
    <div
      className={`mb-6 flex items-center gap-2 rounded-md px-4 py-3 text-sm ${
        messageVariants[message.type || 'info']
      }`}
    >
      {message.type === 'success' && <CheckCircle className="h-4 w-4" />}
      {message.type === 'error' && <XCircle className="h-4 w-4" />}
      {message.type === 'info' && <Loader2 className="h-4 w-4" />}
      <span>{message.text}</span>
    </div>
  );
}

export default MessageBanner;
