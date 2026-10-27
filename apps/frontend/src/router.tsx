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
  getAdminToken,
  getUsage,
  getToken,
  listConversations,
  renameConversation
} from './api/client';
import type { ConversationSummary, UsageSnapshot } from './types';
import { getTheme, toggleTheme, type Theme } from './theme';
import Sidebar from './components/Sidebar';
import DocumentsModal from './components/DocumentsModal';
import LoginPage from './pages/LoginPage';
import ChatPage from './pages/ChatPage';
import DocumentsPage from './pages/DocumentsPage';
import AdminLogin from './pages/AdminLogin';
import AdminPage from './pages/AdminPage';

export type RootOutletContext = {
  refreshSessions: () => Promise<void>;
  refreshUsage: () => Promise<void>;
  onUnauthorized: () => void;
  onOpenDocuments: () => void;
  onToggleSidebar: () => void;
  sidebarVisible: boolean;
  title: string;
  attachedDocIds: string[];
  setAttachedDocIds: (ids: string[]) => void;
};

const RAIL_KEY = 'sidebarRail';

function RootLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  // useParams in a pathless layout route does not see child params.
  const activeMatch = /^\/c\/(\d+)$/.exec(location.pathname);
  const activeId = activeMatch ? Number(activeMatch[1]) : null;
  const [sessions, setSessions] = useState<ConversationSummary[]>([]);
  // Desktop: rail = collapsed icon strip. Mobile: open = slide-in drawer.
  const [rail, setRail] = useState(() => localStorage.getItem(RAIL_KEY) === '1');
  const [isDesktop, setIsDesktop] = useState(() =>
    window.matchMedia('(min-width: 901px)').matches
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [documentsVersion, setDocumentsVersion] = useState(0);
  const [attachedDocIds, setAttachedDocIds] = useState<string[]>([]);
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  const [theme, setTheme] = useState<Theme>(getTheme());

  useEffect(() => {
    localStorage.setItem(RAIL_KEY, rail ? '1' : '0');
  }, [rail]);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 901px)');
    setIsDesktop(mq.matches);
    const onChange = (event: MediaQueryListEvent) => {
      setIsDesktop(event.matches);
      // The drawer only exists below 901px; drop its state on crossing up.
      if (event.matches) setSidebarOpen(false);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const toggleSidebar = useCallback(() => {
    if (window.matchMedia('(min-width: 901px)').matches) setRail(current => !current);
    else setSidebarOpen(current => !current);
  }, []);

  const refreshSessions = useCallback(async () => {
    try {
      setSessions(await listConversations());
    } catch {
      // 401 handled by callers; list failures are non-fatal for the chat view.
    }
  }, []);

  const refreshUsage = useCallback(async () => {
    try {
      setUsage(await getUsage());
    } catch {
      // Non-fatal: the sidebar keeps its last known usage value.
    }
  }, []);

  useEffect(() => {
    if (!getToken()) return;
    void refreshSessions();
    void refreshUsage();
  }, [refreshSessions, refreshUsage]);

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
    <div className={`app-layout${rail ? ' rail' : ''}`}>
      <button
        className={`sidebar-backdrop${sidebarOpen ? ' visible' : ''}`}
        aria-label="Close sidebar"
        onClick={() => setSidebarOpen(false)}
      />
        <Sidebar
          sessions={sessions}
          activeId={activeId}
          open={sidebarOpen}
          rail={rail}
          theme={theme}
          email={email}
          usage={usage}
          isAdmin={!!getAdminToken()}
          onNewChat={() => {
          setSidebarOpen(false);
          navigate('/');
        }}
        onToggleSidebar={toggleSidebar}
        onOpenDocuments={() => {
          setSidebarOpen(false);
          navigate('/documents');
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
            refreshUsage,
            onUnauthorized: handleUnauthorized,
            onOpenDocuments: () => setModalOpen(true),
            onToggleSidebar: toggleSidebar,
            sidebarVisible: isDesktop ? rail : sidebarOpen,
            title,
            attachedDocIds,
            setAttachedDocIds
          } satisfies RootOutletContext
        }
      />

      {/* Mounted only while open: keeps one UploadForm (one file input) in the DOM. */}
      {modalOpen && (
        <DocumentsModal
          open
          refreshToken={documentsVersion}
          conversationId={activeId}
          attachedDocIds={attachedDocIds}
          onAttach={(docId) => setAttachedDocIds(prev => prev.includes(docId) ? prev : [...prev, docId])}
          onDetach={(docId) => setAttachedDocIds(prev => prev.filter(id => id !== docId))}
          onClose={() => setModalOpen(false)}
          onUploaded={() => setDocumentsVersion(version => version + 1)}
          onUnauthorized={handleUnauthorized}
        />
      )}
    </div>
  );
}

function LoginRoute() {
  if (getToken()) return <Navigate to="/" replace />;
  return <LoginPage />;
}

function AdminRoute() {
  if (!getAdminToken()) return <Navigate to="/admin/login" replace />;
  return <AdminPage />;
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginRoute /> },
  { path: '/admin/login', element: <AdminLogin /> },
  { path: '/admin', element: <AdminRoute /> },
  {
    element: <RootLayout />,
    children: [
      { path: '/', element: <ChatPage /> },
      { path: '/c/:conversationId', element: <ChatPage /> },
      { path: '/documents', element: <DocumentsPage /> },
      { path: '*', element: <Navigate to="/" replace /> }
    ]
  }
]);
