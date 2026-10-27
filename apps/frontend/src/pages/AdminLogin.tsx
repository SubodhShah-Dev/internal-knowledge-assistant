import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, setAdminToken, clearAdminToken } from '../api/client';

export default function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await login(email, password);
      if (res.user.role !== 'admin') {
        setError('Admin account required.');
        return;
      }
      setAdminToken(res.token);
      navigate('/admin', { replace: true });
    } catch (err: any) {
      setError(err?.message || 'Admin login failed.');
    } finally {
      setBusy(false);
    }
  }

  function handleLogout() {
    clearAdminToken();
    navigate('/login', { replace: true });
  }

  const DEMO_EMAIL = 'admin@example.com';
  const DEMO_PASSWORD = 'AdminPassword123!';

  const useDemoCredentials = () => {
    setEmail(DEMO_EMAIL);
    setPassword(DEMO_PASSWORD);
    setError('');
    emailRef.current?.focus();
  };

  return (
    <div className="auth-shell">
      <div className="auth-split" data-mode="login">
        <div className="auth-form">
          <div className="auth-brand">
            <span className="auth-brand-name">Admin</span>
          </div>
          <h1>Admin Login</h1>
          <p className="auth-lede">Sign in to manage models and app settings.</p>
          {error && <p className="auth-error">{error}</p>}
          <form className="auth-fields" onSubmit={handleLogin}>
            <div className="field">
              <label htmlFor="admin-email">Email</label>
              <input
                id="admin-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="admin-password">Password</label>
              <input
                id="admin-password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="auth-actions">
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </div>
          </form>
          <p className="auth-switch" style={{ marginTop: 'var(--space-4)' }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleLogout}
              style={{ background: 'transparent', border: 'none', padding: 0, color: 'var(--accent)', cursor: 'pointer' }}
            >
              Back to user login
            </button>
          </p>
        </div>
        <div className="auth-info">
          <h1>Administration</h1>
          <p className="auth-lede">Configure models, retrieval settings, and verification for the knowledge assistant.</p>
          <div className="demo-creds">
            <div className="demo-label">Demo admin credentials</div>
            <div className="demo-row">
              <span>Email</span>
              <code>admin@example.com</code>
            </div>
            <div className="demo-row">
              <span>Password</span>
              <code>AdminPassword123!</code>
            </div>
            <button type="button" className="btn btn-ghost demo-fill" onClick={useDemoCredentials}>
              Fill and sign in
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
