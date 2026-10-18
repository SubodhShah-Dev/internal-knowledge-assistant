import { useEffect, useState } from 'react';

const API = 'http://localhost:4000/api';

type Source = {
  label: string;
  title: string;
  chunkIndex: number;
  excerpt: string;
};

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [email, setEmail] = useState('demo@example.com');
  const [password, setPassword] = useState('DemoPassword123!');
  const [file, setFile] = useState<File | null>(null);
  const [question, setQuestion] = useState('What is the annual leave policy?');
  const [answer, setAnswer] = useState('');
  const [sources, setSources] = useState<Source[]>([]);
  const [status, setStatus] = useState('Please log in or sign up.');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');

  useEffect(() => {
    if (!token) {
      setStatus('Logged out.');
    }
  }, [token]);

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: token ? `Bearer ${token}` : ''
  };

  async function handleAuth() {
    const endpoint = authMode === 'signup' ? '/auth/signup' : '/auth/login';
    const res = await fetch(`${API}${endpoint}`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) {
      setStatus(data.error || 'Authentication failed');
      return;
    }
    localStorage.setItem('token', data.token);
    setToken(data.token);
    setStatus(`Logged in as ${data.user?.email || email}`);
  }

  async function handleUpload() {
    if (!file) {
      setStatus('Choose a PDF or TXT file first.');
      return;
    }
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${API}/documents`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: form
    });
    const data = await res.json();
    if (!res.ok) {
      setStatus(data.error || 'Upload failed');
      return;
    }
    setStatus(`Uploaded document: ${data.document?.title || file.name}`);
  }

  async function handleAsk() {
    if (!question.trim()) {
      setStatus('Type a question first.');
      return;
    }
    setStatus('Asking the local model...');
    const res = await fetch(`${API}/questions`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ question })
    });
    const data = await res.json();
    if (!res.ok) {
      setStatus(data.error || 'Question failed');
      return;
    }
    setAnswer(data.answer || 'No answer returned.');
    setSources(data.sources || []);
    setStatus('Answer generated.');
  }

  function handleLogout() {
    localStorage.removeItem('token');
    setToken('');
    setStatus('Logged out.');
  }

  return (
    <div className="app-shell">
      <div className="card">
        <h1>AI Knowledge Assistant</h1>
        <p className="subtitle">Upload your PDFs/TXT and ask questions from the documents.</p>

        <div className="auth-box">
          <div className="row">
            <label>Email</label>
            <input value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="row">
            <label>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          <div className="actions">
            <button onClick={handleAuth}>{authMode === 'login' ? 'Log in' : 'Sign up'}</button>
            <button onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')} className="secondary">
              Switch to {authMode === 'login' ? 'signup' : 'login'}
            </button>
            {token && <button onClick={handleLogout} className="secondary">Log out</button>}
          </div>
        </div>

        <div className="upload-box">
          <input type="file" accept=".pdf,.txt" onChange={e => setFile(e.target.files?.[0] || null)} />
          <button onClick={handleUpload} disabled={!token}>Upload</button>
        </div>

        <div className="question-box">
          <textarea value={question} onChange={e => setQuestion(e.target.value)} rows={4} />
          <button onClick={handleAsk} disabled={!token}>Ask</button>
        </div>

        <div className="status">{status}</div>

        {answer && (
          <div className="answer-box">
            <h3>Answer</h3>
            <p>{answer}</p>
          </div>
        )}

        {sources.length > 0 && (
          <div className="sources-box">
            <h3>Supporting excerpts</h3>
            {sources.map((src, index) => (
              <div key={`${src.label}-${index}`} className="source-item">
                <strong>{src.label}</strong> · {src.title} · Chunk {src.chunkIndex}
                <p>{src.excerpt}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
