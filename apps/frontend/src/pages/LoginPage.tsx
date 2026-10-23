import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, login, setToken, signup } from '../api/client';
import { IconLibrary } from '../components/icons';

const DEMO_EMAIL = 'demo@example.com';
const DEMO_PASSWORD = 'DemoPassword123!';

export default function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const firstRender = useRef(true);

  // Focus the email field after a mode switch (not on initial load).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    emailRef.current?.focus();
  }, [mode]);

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

  function switchMode() {
    setMode(mode === 'login' ? 'signup' : 'login');
    setError('');
  }

  function useDemoCredentials() {
    setEmail(DEMO_EMAIL);
    setPassword(DEMO_PASSWORD);
    setError('');
    emailRef.current?.focus();
  }

  return (
    <div className="auth-shell">
      <div className="auth-split" data-mode={mode}>
        <div className="auth-form">
          <form onSubmit={handleSubmit} aria-label={mode === 'login' ? 'Log in' : 'Sign up'}>
            <div className="auth-fields">
              <div className="field">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  ref={emailRef}
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

            <div className="auth-actions">
              <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
                {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Sign up'}
              </button>
              <button type="button" className="auth-switch" onClick={switchMode}>
                {mode === 'login' ? 'Switch to sign up' : 'Switch to log in'}
              </button>
            </div>
          </form>
        </div>

        <div className="auth-info">
          <div className="auth-brand">
            <span className="brand-mark" aria-hidden="true">
              <IconLibrary size={15} />
            </span>
            <span className="auth-brand-name">Knowledge Assistant</span>
          </div>
          <h1>{mode === 'login' ? 'Login' : 'Sign up'}</h1>
          <p className="auth-lede">
            {mode === 'login'
              ? 'Sign in to keep your sessions, documents, and groundedness audits in one place.'
              : 'Create an account and start asking questions with answers you can verify.'}
          </p>

          {mode === 'login' ? (
            <div className="demo-creds">
              <div className="demo-label">Demo account</div>
              <div className="demo-row">
                <span>Email</span>
                <code>{DEMO_EMAIL}</code>
              </div>
              <div className="demo-row">
                <span>Password</span>
                <code>{DEMO_PASSWORD}</code>
              </div>
              <button type="button" className="btn btn-ghost demo-fill" onClick={useDemoCredentials}>
                Use demo credentials
              </button>
            </div>
          ) : (
            <ul className="signup-notes">
              <li>Password must be at least 8 characters.</li>
              <li>Use a valid email address.</li>
              <li>Documents and sessions stay private to your account.</li>
            </ul>
          )}

          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
