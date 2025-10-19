import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MessageCircle, X } from 'lucide-react';
import API_BASE_URL from '../config';

const STORAGE_KEY = 'fortiidentity-support-session-id';

const formatTimestamp = (value) => {
  try {
    return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (error) {
    return '';
  }
};

function SupportChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const storedSessionId = window.localStorage.getItem(STORAGE_KEY);
    if (storedSessionId) {
      setSessionId(storedSessionId);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (!sessionId) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, sessionId);
  }, [sessionId]);

  useEffect(() => {
    if (!isOpen || !sessionId) {
      return;
    }
    let ignore = false;
    const fetchHistory = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/support-chat/session/${sessionId}`);
        if (!response.ok) {
          throw new Error('Unable to load previous messages');
        }
        const data = await response.json();
        if (!ignore) {
          setMessages(data.history || []);
        }
      } catch (fetchError) {
        if (!ignore) {
          setError(fetchError.message);
        }
      }
    };
    fetchHistory();
    return () => {
      ignore = true;
    };
  }, [isOpen, sessionId]);

  useEffect(() => {
    if (!isOpen || messages.length === 0) {
      return;
    }
    requestAnimationFrame(() => {
      if (listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight;
      }
    });
  }, [isOpen, messages]);

  const ensureSession = useCallback(async () => {
    if (sessionId) {
      return sessionId;
    }
    const response = await fetch(`${API_BASE_URL}/support-chat/session`, {
      method: 'POST',
    });
    if (!response.ok) {
      throw new Error('Unable to start support session');
    }
    const data = await response.json();
    setSessionId(data.session_id);
    setMessages(data.history || []);
    return data.session_id;
  }, [sessionId]);

  const handleToggle = useCallback(async () => {
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);
    if (!nextOpen) {
      return;
    }
    try {
      await ensureSession();
    } catch (toggleError) {
      setError(toggleError.message);
    }
  }, [ensureSession, isOpen]);

  const handleInputChange = useCallback((event) => {
    setInputValue(event.target.value);
  }, []);

  const handleSubmit = useCallback(async (event) => {
    event.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed || isLoading) {
      return;
    }
    setError(null);
    setInputValue('');
    let activeSessionId = sessionId;
    setIsLoading(true);
    try {
      activeSessionId = await ensureSession();
      const optimisticMessage = {
        role: 'user',
        content: trimmed,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimisticMessage]);
      const response = await fetch(`${API_BASE_URL}/support-chat/session/${activeSessionId}/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: trimmed }),
      });
      if (!response.ok) {
        throw new Error('Unable to send your message right now');
      }
      const data = await response.json();
      setSessionId(data.session_id);
      setMessages(data.history || []);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setIsLoading(false);
    }
  }, [ensureSession, inputValue, isLoading, sessionId]);

  const hasMessages = useMemo(() => messages.length > 0, [messages]);

  return (
    <>
      <button
        type="button"
        onClick={handleToggle}
        className="fixed bottom-6 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-purple-600 text-white shadow-lg transition hover:bg-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-300"
        aria-label={isOpen ? 'Close FortiIdentity support chat' : 'Open FortiIdentity support chat'}
      >
        {isOpen ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      {isOpen && (
        <div className="fixed bottom-24 right-6 flex w-96 flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-950/95 shadow-2xl">
          <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900/70 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-purple-100">FortiIdentity Cloud Support</h2>
              <p className="text-xs text-slate-400">Ask questions about MFA and identity management.</p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-full p-1 text-slate-400 transition hover:text-slate-200"
              aria-label="Close support chat"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div ref={listRef} className="flex max-h-96 flex-1 flex-col gap-3 overflow-y-auto bg-slate-950 px-4 py-4">
            {!hasMessages && !error && (
              <div className="rounded-lg border border-dashed border-slate-800 bg-slate-900/40 px-3 py-4 text-center text-sm text-slate-400">
                Start the conversation with a question about configuring FortiIdentity Cloud.
              </div>
            )}
            {messages.map((message, index) => (
              <div
                key={`${message.timestamp}-${index}`}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`${
                    message.role === 'user'
                      ? 'bg-purple-600 text-white'
                      : 'bg-slate-800 text-slate-100'
                  } max-w-[80%] rounded-lg px-3 py-2 text-sm shadow`}
                >
                  <p className="whitespace-pre-wrap break-words">{message.content}</p>
                  <span className="mt-1 block text-[10px] uppercase tracking-wide text-slate-300">
                    {formatTimestamp(message.timestamp)}
                  </span>
                </div>
              </div>
            ))}
            {error && (
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {error}
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="border-t border-slate-800 bg-slate-900/60 p-3">
            <div className="flex items-end gap-2">
              <textarea
                rows={2}
                value={inputValue}
                onChange={handleInputChange}
                placeholder="Ask FortiIdentity Cloud support..."
                className="flex-1 resize-none rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-400/40"
              />
              <button
                type="submit"
                disabled={isLoading || !inputValue.trim()}
                className="inline-flex items-center justify-center rounded-lg bg-purple-600 px-3 py-2 text-sm font-semibold text-white shadow transition hover:bg-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-300 disabled:cursor-not-allowed disabled:bg-slate-700"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending
                  </span>
                ) : (
                  'Send'
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

export default SupportChatWidget;
