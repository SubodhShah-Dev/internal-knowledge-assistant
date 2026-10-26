import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import {
  ApiError,
  askQuestionStream,
  attachDocument,
  detachDocument,
  getConversation,
  listDocuments
} from '../api/client';
import type { DocumentMeta, ThreadMessage, Verification } from '../types';
import ChatMessage from '../components/ChatMessage';
import Composer from '../components/Composer';
import AttachedDocsChips from '../components/AttachedDocsChips';
import { IconHamburger, IconSpark } from '../components/icons';
import type { RootOutletContext } from '../router';

const SUGGESTIONS = [
  'Summarize my documents',
  'What are the key policies?',
  'List important deadlines or dates'
];

export default function ChatPage() {
  const { conversationId: conversationIdParam } = useParams<{ conversationId: string }>();
  const conversationId = conversationIdParam ? Number(conversationIdParam) : null;
  const navigate = useNavigate();
  const { refreshSessions, refreshUsage, onUnauthorized, onOpenDocuments, onToggleSidebar, sidebarVisible, title, attachedDocIds, setAttachedDocIds } =
    useOutletContext<RootOutletContext>();

  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadingThread, setLoadingThread] = useState(false);
  const [availableDocuments, setAvailableDocuments] = useState<DocumentMeta[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const handleDetach = useCallback(
    async (documentId: string) => {
      setAttachedDocIds(attachedDocIds.filter(id => id !== documentId));
      if (conversationId) {
        try {
          await detachDocument(conversationId, documentId);
        } catch {
          // Ignore detach errors; UI remains consistent.
        }
      }
    },
    [conversationId, attachedDocIds, setAttachedDocIds]
  );

  // Load an existing conversation thread.
  useEffect(() => {
    let cancelled = false;
    setMessages([]);
    setError('');
    setAttachedDocIds([]);
    setAvailableDocuments([]);
    if (conversationId === null || Number.isNaN(conversationId)) {
      if (conversationIdParam) navigate('/', { replace: true });
      // New chat: load library and attach all docs by default.
      void listDocuments()
        .then(docs => {
          if (cancelled) return;
          setAvailableDocuments(docs);
          setAttachedDocIds(docs.map(d => d.id));
        })
        .catch(() => {
          // Non-fatal; chips row simply stays empty.
        });
      return;
    }
    setLoadingThread(true);
    getConversation(conversationId)
      .then(detail => {
        if (cancelled) return;
        const loaded: ThreadMessage[] = detail.turns.flatMap(turn => [
          { role: 'user', text: turn.question },
          {
            role: 'assistant',
            text: turn.answer,
            sources: turn.sources,
            verification: turn.verification,
            streaming: false
          }
        ]);
        setMessages(loaded);
        setAttachedDocIds(detail.documents.map(d => d.id));
        setAvailableDocuments(detail.documents);
      })
      .catch(err => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) onUnauthorized();
        else if (err instanceof ApiError && err.status === 404) navigate('/', { replace: true });
        else setError(err instanceof ApiError ? err.message : 'Could not load this conversation.');
      })
      .finally(() => {
        if (!cancelled) setLoadingThread(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationIdParam, onUnauthorized, navigate]);

  // Auto-scroll while streaming.
  useEffect(() => {
    const el = threadRef.current;
    if (el && stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  function handleScroll() {
    const el = threadRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  const send = useCallback(
    async (question: string) => {
      if (busy || !question.trim()) return;
      const trimmed = question.trim();
      setError('');
      setInput('');
      setBusy(true);
      stickToBottom.current = true;

      const controller = new AbortController();
      abortRef.current = controller;

      const assistantIndex = messages.length + 1;
      setMessages(prev => [
        ...prev,
        { role: 'user', text: trimmed },
        { role: 'assistant', text: '', sources: null, verification: null, streaming: true }
      ]);

      const updateAssistant = (patch: Partial<Extract<ThreadMessage, { role: 'assistant' }>>) => {
        setMessages(prev =>
          prev.map((msg, index) =>
            index === assistantIndex && msg.role === 'assistant' ? { ...msg, ...patch } : msg
          )
        );
      };

      // Only pass documentIds on first ask (new conversation).
      const docIds = conversationId === null ? attachedDocIds : undefined;

      try {
        await askQuestionStream(trimmed, conversationId ?? undefined, {
          signal: controller.signal,
          onSources: sources => updateAssistant({ sources }),
          onToken: text =>
            setMessages(prev =>
              prev.map((msg, index) =>
                index === assistantIndex && msg.role === 'assistant'
                  ? { ...msg, text: msg.text + text }
                  : msg
              )
            ),
          onVerification: (verification: Verification) => updateAssistant({ verification }),
          onError: message => updateAssistant({ streaming: false, error: message }),
          onDone: payload => {
            // Snap to the server's canonical answer (citation brackets normalized).
            updateAssistant({ streaming: false, text: payload.answer });
            if (conversationId === null) {
              navigate(`/c/${payload.conversationId}`, { replace: true });
            }
            void refreshSessions();
            void refreshUsage();
          }
        }, docIds);
        // Stream ended without done (e.g. abort) — settle the bubble.
        updateAssistant({ streaming: false });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          updateAssistant({ streaming: false, error: undefined });
        } else if (err instanceof ApiError && err.status === 401) {
          onUnauthorized();
        } else {
          updateAssistant({
            streaming: false,
            error: err instanceof ApiError ? err.message : 'The request failed. Try again.'
          });
        }
      } finally {
        setBusy(false);
        abortRef.current = null;
      }
    },
    [busy, conversationId, attachedDocIds, messages.length, navigate, onUnauthorized, refreshSessions, refreshUsage]
  );

  function handleStop() {
    abortRef.current?.abort();
  }

  const showEmpty = messages.length === 0 && !loadingThread;

  return (
    <div className="main-pane">
      <header className="main-header">
        <button
          className="btn btn-ghost btn-icon hamburger"
          aria-label="Toggle sidebar"
          aria-expanded={sidebarVisible}
          onClick={onToggleSidebar}
        >
          <IconHamburger size={18} />
        </button>
        <div className="main-title">
          {conversationId === null ? (
            <span className="muted">New chat</span>
          ) : (
            title || <span className="muted">Conversation</span>
          )}
        </div>
        <div className="header-spacer" />
        <span className="model-badge">RAG · audited answers</span>
      </header>

      <div className="thread" ref={threadRef} onScroll={handleScroll}>
        {showEmpty ? (
          <div className="empty-state">
            <div className="empty-mark" aria-hidden="true">
              <IconSpark size={24} />
            </div>
            <h1>What should we look into?</h1>
            <p>
              Ask anything about your uploaded documents. Every answer cites its evidence and comes
              with a groundedness audit.
            </p>
            <div className="suggestions">
              {SUGGESTIONS.map(text => (
                <button key={text} className="suggestion" onClick={() => setInput(text)}>
                  {text}
                </button>
              ))}
            </div>
            {conversationId === null && availableDocuments.length > 0 && (
              <AttachedDocsChips
                conversationId={null}
                attachedDocIds={attachedDocIds}
                documents={availableDocuments}
                onDetach={handleDetach}
                onToggle={() => {}}
              />
            )}
          </div>
        ) : (
          <div className="thread-inner">
            {loadingThread && <p className="empty-note">Loading conversation…</p>}
            {messages.map((message, index) => (
              <ChatMessage key={index} message={message} />
            ))}
          </div>
        )}
      </div>

      {error && (
        <p className="composer-error" role="alert">
          {error}
        </p>
      )}

      <Composer
        value={input}
        onChange={setInput}
        onSubmit={() => send(input)}
        onStop={handleStop}
        onOpenDocuments={onOpenDocuments}
        busy={busy}
        disabled={loadingThread}
      />
    </div>
  );
}
