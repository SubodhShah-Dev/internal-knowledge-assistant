import { useState } from 'react';
import { login, signup, ApiError } from '../api/client';

type Props = {
  onAuthenticated: (token: string, email: string) => void;
};

export default function LoginPage({ onAuthenticated }: Props) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('demo@example.com');
  const [password, setPassword] = useState('DemoPassword123!');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result = mode === 'login' ? await login(email, password) : await signup(email, password);
      onAuthenticated(result.token, result.user.email);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <div className="card auth-card">
        <h1>AI Knowledge Assistant</h1>
        <p className="subtitle">Ask questions about your own PDFs and text documents — answered locally, grounded in evidence.</p>

        <form className="auth-box" onSubmit={handleSubmit}>
          <div className="row">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="row">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
          {error && <p className="error-text" role="alert">{error}</p>}
          <div className="actions">
            <button type="submit" disabled={busy}>
              {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Sign up'}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setMode(mode === 'login' ? 'signup' : 'login');
                setError('');
              }}
            >
              Switch to {mode === 'login' ? 'sign up' : 'log in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
