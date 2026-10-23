import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, login, setToken, signup } from '../api/client';
import { IconLibrary } from '../components/icons';

export default function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('demo@example.com');
  const [password, setPassword] = useState('DemoPassword123!');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = mode === 'login' ? await login(email, password) : await signup(email, password);
      setToken(result.token);
      localStorage.setItem('email', result.user.email);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark" aria-hidden="true">
            <IconLibrary size={15} />
          </span>
          <h1>Knowledge Assistant</h1>
        </div>
        <p className="subtitle">
          Ask questions about your documents and get answers you can verify — every claim is audited
          against its source.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="auth-fields">
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                className="input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                className="input"
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
          </div>

          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}

          <div className="auth-actions">
            <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
              {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Sign up'}
            </button>
            <button
              type="button"
              className="auth-switch"
              onClick={() => {
                setMode(mode === 'login' ? 'signup' : 'login');
                setError('');
              }}
            >
              {mode === 'login' ? 'Switch to sign up' : 'Switch to log in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
