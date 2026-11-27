import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../api';
import { useAuth } from '../auth';

/** Sign-in, or first-run account creation when the server has no users yet. */
export default function Login() {
  const { user, needsSetup, loading, setUser } = useAuth();
  const [params] = useSearchParams();
  const location = useLocation();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const from = (location.state as { from?: string } | null)?.from || '/';
  if (loading) return null;
  if (user) return <Navigate to={from} replace />;

  const setup = needsSetup;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = setup
        ? await authApi.setup({ email, name, password, setupToken: params.get('token') ?? '' })
        : await authApi.login(email, password);
      setUser(r.user);
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
        <h1>{setup ? 'Create the first account' : 'Sign in'}</h1>
        {setup && <p className="muted small">This account can add the rest of your team afterwards.</p>}
        {setup && (
          <label className="field">
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </label>
        )}
        <label className="field">
          <span>Email</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus />
        </label>
        <label className="field">
          <span>Password{setup ? ' (at least 10 characters)' : ''}</span>
          <input
            type="password"
            required
            minLength={setup ? 10 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={setup ? 'new-password' : 'current-password'}
          />
        </label>
        {error && <div className="error small">{error}</div>}
        <button className="btn primary block" disabled={busy}>
          {busy ? 'Please wait…' : setup ? 'Create account' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
