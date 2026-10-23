import { useCallback, useEffect, useState } from 'react';
import {
  Navigate,
  Outlet,
  createBrowserRouter,
  useLocation,
  useNavigate
} from 'react-router-dom';
import {
  clearToken,
  deleteConversation,
  getToken,
  listConversations,
  renameConversation
} from './api/client';
import type { ConversationSummary } from './types';
import { getTheme, toggleTheme, type Theme } from './theme';
import Sidebar from './components/Sidebar';
import DocumentsModal from './components/DocumentsModal';
import LoginPage from './pages/LoginPage';
import ChatPage from './pages/ChatPage';

export type RootOutletContext = {
  refreshSessions: () => Promise<void>;
  onUnauthorized: () => void;
  onOpenDocuments: () => void;
  onToggleSidebar: () => void;
  title: string;
};

function RootLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  // useParams in a pathless layout route does not see child params.
  const activeMatch = /^\/c\/(\d+)$/.exec(location.pathname);
  const activeId = activeMatch ? Number(activeMatch[1]) : null;
  const [sessions, setSessions] = useState<ConversationSummary[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [documentsVersion, setDocumentsVersion] = useState(0);
  const [theme, setTheme] = useState<Theme>(getTheme());

  const refreshSessions = useCallback(async () => {
    try {
      setSessions(await listConversations());
    } catch {
      // 401 handled by callers; list failures are non-fatal for the chat view.
    }
  }, []);

  useEffect(() => {
    if (!getToken()) return;
    void refreshSessions();
  }, [refreshSessions]);

  const handleUnauthorized = useCallback(() => {
    clearToken();
    localStorage.removeItem('email');
    navigate('/login', { replace: true });
  }, [navigate]);

  if (!getToken()) {
    return <Navigate to="/login" replace />;
  }

  const email = localStorage.getItem('email') ?? 'logged-in user';
  const title =
    activeId !== null
      ? sessions.find(session => session.id === activeId)?.title ?? ''
      : '';

  return (
    <div className="app-layout">
      <button
        className={`sidebar-backdrop${sidebarOpen ? ' visible' : ''}`}
        aria-label="Close sidebar"
        onClick={() => setSidebarOpen(false)}
      />
      <Sidebar
        sessions={sessions}
        activeId={activeId}
        open={sidebarOpen}
        theme={theme}
        email={email}
        onNewChat={() => {
          setSidebarOpen(false);
          navigate('/');
        }}
        onToggleSidebar={() => setSidebarOpen(false)}
        onOpenDocuments={() => {
          setSidebarOpen(false);
          setModalOpen(true);
        }}
        onToggleTheme={() => setTheme(toggleTheme())}
        onLogout={handleUnauthorized}
        onRename={async (id, nextTitle) => {
          try {
            await renameConversation(id, nextTitle);
            await refreshSessions();
          } catch (err: any) {
            if (err?.status === 401) handleUnauthorized();
          }
        }}
        onDelete={async id => {
          try {
            await deleteConversation(id);
            await refreshSessions();
            navigate('/', { replace: true });
          } catch (err: any) {
            if (err?.status === 401) handleUnauthorized();
          }
        }}
        onNavigate={() => setSidebarOpen(false)}
      />

      <Outlet
        context={
          {
            refreshSessions,
            onUnauthorized: handleUnauthorized,
            onOpenDocuments: () => setModalOpen(true),
            onToggleSidebar: () => setSidebarOpen(open => !open),
            title
          } satisfies RootOutletContext
        }
      />

      <DocumentsModal
        open={modalOpen}
        refreshToken={documentsVersion}
        onClose={() => setModalOpen(false)}
        onUploaded={() => setDocumentsVersion(version => version + 1)}
        onUnauthorized={handleUnauthorized}
      />
    </div>
  );
}

function LoginRoute() {
  if (getToken()) return <Navigate to="/" replace />;
  return <LoginPage />;
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginRoute /> },
  {
    element: <RootLayout />,
    children: [
      { path: '/', element: <ChatPage /> },
      { path: '/c/:conversationId', element: <ChatPage /> },
      { path: '*', element: <Navigate to="/" replace /> }
    ]
  }
]);
