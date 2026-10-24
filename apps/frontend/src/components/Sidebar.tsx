import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import type { ConversationSummary } from '../types';
import {
  IconChat,
  IconLibrary,
  IconLogout,
  IconMoon,
  IconPencil,
  IconPlus,
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
  onNewChat,
  onToggleSidebar,
  onOpenDocuments,
  onToggleTheme,
  onLogout,
  onRename,
  onDelete,
  onNavigate
}: Props) {
  const toggleLabel = open ? 'Close sidebar' : rail ? 'Expand sidebar' : 'Collapse sidebar';

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
