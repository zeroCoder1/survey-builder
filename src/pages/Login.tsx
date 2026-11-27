import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { authApi } from '../api';
import { useAuth } from '../auth';

export default function Login() {
  const { user, loading, refresh } = useAuth();
  const location = useLocation();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const from = (location.state as { from?: string } | null)?.from || '/';
  if (loading) return null;
  if (user) return <Navigate to={from} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await authApi.login(email, password);
      await refresh();
      nav(from, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={submit}>
        <div className="brand">Survey Builder</div>
        <h1>Sign in</h1>
        <label className="field">
          <span>Email</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>
        {error && <div className="error small">{error}</div>}
        <button className="btn primary block" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="auth-switch">
          New here?{' '}
          <Link to="/signup" state={location.state}>
            Create an account
          </Link>
        </p>
      </form>
    </div>
  );
}
