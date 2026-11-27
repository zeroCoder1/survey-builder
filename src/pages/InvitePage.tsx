import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { invitesApi } from '../api';
import { useAuth } from '../auth';
import Signup from './Signup';

/** Opened from a shared invite link: join directly when signed in, otherwise sign up (or sign in) to join. */
export default function InvitePage() {
  const { token = '' } = useParams();
  const { user, loading, refresh } = useAuth();
  const nav = useNavigate();
  const [info, setInfo] = useState<{ workspaceName: string; inviter: string | null; alreadyMember: boolean } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    invitesApi.get(token).then(setInfo).catch((e: Error) => setError(e.message));
  }, [token, loading, user?.id]);

  if (error)
    return (
      <div className="auth-page">
        <div className="card auth-card">
          <div className="brand">Survey Builder</div>
          <h1>Invite not valid</h1>
          <p className="muted">{error}</p>
          <Link className="btn block" to="/">Go to Survey Builder</Link>
        </div>
      </div>
    );
  if (loading || !info) return <div className="auth-page muted">Loading…</div>;
  if (!user) return <Signup inviteToken={token} workspaceName={info.workspaceName} />;

  const join = async () => {
    setBusy(true);
    try {
      await invitesApi.accept(token);
      await refresh();
      nav('/', { replace: true });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="card auth-card">
        <div className="brand">Survey Builder</div>
        <h1>Join {info.workspaceName}</h1>
        <p className="muted">
          {info.inviter ? `${info.inviter} invited you` : 'You were invited'} to work on studies in this workspace. You're signed in as {user.email}.
        </p>
        {info.alreadyMember ? (
          <Link className="btn primary block" to="/">You're already a member, open it</Link>
        ) : (
          <button className="btn primary block" disabled={busy} onClick={join}>
            {busy ? 'Joining…' : `Join ${info.workspaceName}`}
          </button>
        )}
      </div>
    </div>
  );
}
