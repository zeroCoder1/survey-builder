import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { authApi } from '../api';
import { useAuth } from '../auth';

/**
 * Create an account. On its own this also creates a private workspace; with an invite token
 * (passed by the invite page) the new account joins that workspace instead.
 */
export default function Signup({ inviteToken, workspaceName: invitedTo }: { inviteToken?: string; workspaceName?: string }) {
  const { user, loading, refresh } = useAuth();
  const location = useLocation();
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const from = (location.state as { from?: string } | null)?.from || '/';
  if (loading) return null;
  if (user && !inviteToken) return <Navigate to={from} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await authApi.signup({ name, email, password, workspaceName: inviteToken ? undefined : workspaceName, inviteToken });
      await refresh();
      nav(inviteToken ? '/' : from, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const firstName = name.trim().split(' ')[0];
  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={submit}>
        <div className="brand">Survey Builder</div>
        <h1>{invitedTo ? `Join ${invitedTo}` : 'Create your account'}</h1>
        <p className="muted small">
          {invitedTo ? 'Create an account to start working with your team.' : 'Free to start. You get your own private workspace for studies.'}
        </p>
        <label className="field">
          <span>Your name</span>
          <input required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" autoFocus maxLength={80} />
        </label>
        <label className="field">
          <span>Work email</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        <label className="field">
          <span>Password (at least 10 characters)</span>
          <input type="password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </label>
        {!inviteToken && (
          <label className="field">
            <span>Workspace name (optional)</span>
            <input
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              placeholder={firstName ? `${firstName}'s workspace` : 'e.g. your company or team'}
              maxLength={80}
            />
          </label>
        )}
        {error && <div className="error small">{error}</div>}
        <button className="btn primary block" disabled={busy}>
          {busy ? 'Creating account…' : invitedTo ? 'Create account and join' : 'Create account'}
        </button>
        <p className="auth-switch">
          Already have an account?{' '}
          <Link to="/login" state={inviteToken ? { from: location.pathname } : location.state}>
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
