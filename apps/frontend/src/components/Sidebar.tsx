import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import type { ConversationSummary, RateLimitBucket, UsageSnapshot } from '../types';
import {
  IconChat,
  IconGauge,
  IconLibrary,
  IconLogout,
  IconMoon,
  IconPencil,
  IconPlus,
  IconSettings,
  IconSidebar,
  IconSun,
  IconTrash
} from './icons';

type Props = {
  sessions: ConversationSummary[];
  activeId: number | null;
  open: boolean;
  rail: boolean;
  theme: 'dark' | 'light';
  email: string;
  usage: UsageSnapshot | null;
  isAdmin: boolean;
  onNewChat: () => void;
  onToggleSidebar: () => void;
  onOpenDocuments: () => void;
  onToggleTheme: () => void;
  onLogout: () => void;
  onRename: (id: number, title: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onNavigate: () => void;
};

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatCount(value: number | null): string {
  if (value === null) return '—';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${Math.round(value / 1_000)}k`;
  return value.toLocaleString();
}

function bucketPercent(bucket: RateLimitBucket): number | null {
  if (bucket.limit === null || bucket.remaining === null || bucket.limit <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((bucket.remaining / bucket.limit) * 100)));
}

function bucketState(percent: number | null): 'ok' | 'warn' | 'low' {
  if (percent === null) return 'ok';
  if (percent <= 10) return 'low';
  if (percent <= 25) return 'warn';
  return 'ok';
}

function bucketCounts(bucket: RateLimitBucket): string {
  if (bucket.limit === null && bucket.remaining === null) return 'not reported';
  return `${formatCount(bucket.remaining)} of ${formatCount(bucket.limit)} left`;
}

function describeBucket(label: string, bucket: RateLimitBucket): string {
  if (bucket.limit === null && bucket.remaining === null) return `${label}: not reported`;
  const reset = bucket.resetAt ? ` · refills at ${new Date(bucket.resetAt).toLocaleTimeString()}` : '';
  return `${label}: ${bucketCounts(bucket)}${reset}`;
}

const PROVIDER_LABELS: Record<string, string> = {
  'api.groq.com': 'Groq',
  'api.openai.com': 'OpenAI',
  'openai.com': 'OpenAI',
  'api.anthropic.com': 'Anthropic',
  'api.mistral.ai': 'Mistral',
  'api.gemini.google.com': 'Google Gemini',
  'generativelanguage.googleapis.com': 'Google Gemini'
};

function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider;
}

function shortModelName(model: string): string {
  const slash = model.lastIndexOf('/');
  return slash === -1 ? model : model.slice(slash + 1);
}

function UsageBucket({ label, bucket }: { label: string; bucket: RateLimitBucket }) {
  const percent = bucketPercent(bucket);
  const state = bucketState(percent);
  const reported = bucket.limit !== null || bucket.remaining !== null;

  return (
    <div className="usage-bucket">
      <div className="usage-bucket-head">
        <span className="usage-label">{label}</span>
        <span className="usage-counts">
          {reported ? bucketCounts(bucket) : 'not reported'}
        </span>
        {percent !== null && (
          <span className={`usage-percent usage-percent-${state}`}>{percent}%</span>
        )}
      </div>
      {percent !== null && (
        <span
          className={`usage-meter usage-meter-${state}`}
          role="meter"
          aria-label={`${label} remaining`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <span className="usage-meter-fill" style={{ width: `${percent}%` }} />
        </span>
      )}
    </div>
  );
}

function SessionRow({
  session,
  active,
  onRename,
  onDelete,
  onNavigate
}: {
  session: ConversationSummary;
  active: boolean;
  onRename: (id: number, title: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onNavigate: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(session.title);

  async function commitRename() {
    const title = draft.trim();
    setEditing(false);
    if (title && title !== session.title) {
      await onRename(session.id, title);
    }
  }

  async function handleDelete() {
    if (window.confirm(`Delete "${session.title}"? This removes its messages too.`)) {
      await onDelete(session.id);
    }
  }

  return (
    <li className={`session-item${active ? ' active' : ''}`}>
      {editing ? (
        <input
          className="session-rename-input"
          value={draft}
          autoFocus
          aria-label="Rename conversation"
          onChange={e => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={e => {
            if (e.key === 'Enter') commitRename();
            if (e.key === 'Escape') setEditing(false);
          }}
        />
      ) : (
        <NavLink
          to={`/c/${session.id}`}
          className="session-link"
          onClick={onNavigate}
          title={session.title}
        >
          <span className="session-rail-icon" aria-hidden="true">
            <IconChat size={16} />
          </span>
          <span className="session-title">{session.title}</span>
          <span className="session-meta">
            {timeAgo(session.updated_at)} · {Number(session.message_count)}{' '}
            {Number(session.message_count) === 1 ? 'message' : 'messages'}
          </span>
        </NavLink>
      )}
      {!editing && (
        <div className="session-actions">
          <button
            className="btn btn-ghost btn-icon"
            aria-label={`Rename ${session.title}`}
            onClick={() => {
              setDraft(session.title);
              setEditing(true);
            }}
          >
            <IconPencil size={14} />
          </button>
          <button
            className="btn btn-danger-ghost btn-icon"
            aria-label={`Delete ${session.title}`}
            onClick={handleDelete}
          >
            <IconTrash size={14} />
          </button>
        </div>
      )}
    </li>
  );
}

export default function Sidebar({
  sessions,
  activeId,
  open,
  rail,
  theme,
  email,
  usage,
  isAdmin,
  onNewChat,
  onToggleSidebar,
  onOpenDocuments,
  onToggleTheme,
  onLogout,
  onRename,
  onDelete,
  onNavigate
}: Props) {
  const navigate = useNavigate();
  const toggleLabel = open ? 'Close sidebar' : rail ? 'Expand sidebar' : 'Collapse sidebar';
  const limits = usage?.available ? usage : null;
  const usageTitle = !usage
    ? undefined
    : !usage.available
      ? 'Your model provider reports these limits on every response. They appear after your first model call.'
      : [
          `Provider limits for ${usage.model}${usage.provider ? ` (${usage.provider})` : ''}`,
          'Reported by your provider — this app never blocks requests.',
          describeBucket('Requests', usage.requests),
          describeBucket('Tokens', usage.tokens),
          `Updated ${new Date(usage.updatedAt).toLocaleTimeString()}`
        ].join('\n');

  return (
    <aside className={`sidebar${open ? ' open' : ''}`} aria-label="Chat sessions">
      <div className="sidebar-top">
        <span className="brand">
          <span className="brand-mark" aria-hidden="true">
            <IconLibrary size={15} />
          </span>
          <span className="brand-name">Knowledge Assistant</span>
        </span>
        <div className="header-spacer" />
        <button
          className="btn btn-ghost btn-icon"
          aria-label={toggleLabel}
          title={toggleLabel}
          onClick={onToggleSidebar}
        >
          <IconSidebar size={17} />
        </button>
      </div>

      <button className="btn new-chat" aria-label="New chat" onClick={onNewChat}>
        <IconPlus size={16} />
        <span className="new-chat-label">New chat</span>
      </button>

      <div className="sidebar-label">Sessions</div>
      <ul className="session-list">
        {sessions.length === 0 && (
          <li className="session-empty">No sessions yet. Ask your first question to start one.</li>
        )}
        {sessions.map(session => (
          <SessionRow
            key={session.id}
            session={session}
            active={session.id === activeId}
            onRename={onRename}
            onDelete={onDelete}
            onNavigate={onNavigate}
          />
        ))}
      </ul>

      <div className="sidebar-footer">
        <button
          className="sidebar-footer-row"
          aria-label="Documents"
          onClick={onOpenDocuments}
        >
          <IconLibrary size={16} />
          <span className="user-email">Documents</span>
        </button>
        {isAdmin && (
          <button
            className="sidebar-footer-row"
            aria-label="Admin"
            onClick={() => navigate('/admin')}
          >
            <IconSettings size={16} />
            <span className="user-email">Admin</span>
          </button>
        )}
        {usage && (
          <div className="usage-row" title={usageTitle}>
            <div className="usage-head">
              <IconGauge size={16} />
              <div className="usage-head-text">
                <span className="usage-model">
                  {limits ? shortModelName(limits.model) : 'Provider limits'}
                </span>
                <span className="usage-sub">
                  {limits
                    ? `Reported by ${providerLabel(limits.provider)}`
                    : 'Waiting for your first model call'}
                </span>
              </div>
            </div>
            {limits && (
              <>
                <UsageBucket label="Requests" bucket={limits.requests} />
                <UsageBucket label="Tokens" bucket={limits.tokens} />
              </>
            )}
          </div>
        )}
        <button
          className="sidebar-footer-row"
          onClick={onToggleTheme}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? <IconSun size={16} /> : <IconMoon size={16} />}
          <span className="user-email">{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
        </button>
        <div className="sidebar-footer-row" title={email}>
          <span className="user-email">{email}</span>
        </div>
        <button className="sidebar-footer-row" aria-label="Log out" onClick={onLogout}>
          <IconLogout size={16} />
          <span className="user-email">Log out</span>
        </button>
      </div>
    </aside>
  );
}
