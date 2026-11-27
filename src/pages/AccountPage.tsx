import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { authApi, type User } from '../api';
import { useAuth } from '../auth';
import Icon from '../components/Icon';
import UserMenu from '../components/UserMenu';

export default function AccountPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState('');
  const refresh = () => authApi.listUsers().then(setUsers).catch((e) => setError(e.message));
  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="page">
      <header className="topbar">
        <Link to="/" className="brand">Survey Builder</Link>
        <span className="crumb">/</span>
        <span>Team &amp; account</span>
        <div className="spacer" />
        <UserMenu />
      </header>
      <main className="container">
        <h1 className="home-title">Team</h1>
        <p className="muted home-sub">Everyone listed here can build studies, see all responses and export data.</p>
        {error && <div className="alert">{error}</div>}

        <div className="card" style={{ marginTop: 16, padding: 0 }}>
          {users.map((u) => (
            <div key={u.id} className="user-row">
              <span className="avatar">{(u.name || u.email)[0].toUpperCase()}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div>
                  {u.name || u.email} {u.id === user?.id && <span className="muted small">(you)</span>}
                </div>
                {u.name && <div className="muted small">{u.email}</div>}
              </div>
              {u.id !== user?.id && (
                <button
                  className="btn small ghost danger"
                  onClick={() =>
                    confirm(`Remove ${u.email}? They will be signed out and lose access. Their studies stay.`) &&
                    authApi.deleteUser(u.id).then(refresh).catch((e) => setError(e.message))
                  }
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>

        <AddUser onAdded={refresh} />
        <ChangePassword />
      </main>
    </div>
  );
}

function AddUser({ onAdded }: { onAdded: () => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await authApi.createUser({ email, name, password });
      setMsg({ ok: true, text: `Added ${email}. Share the temporary password with them privately and ask them to change it after signing in.` });
      setEmail('');
      setName('');
      setPassword('');
      onAdded();
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    }
  };

  return (
    <form className="card" onSubmit={submit} style={{ marginTop: 24 }}>
      <h2>
        <Icon name="plus" size={16} className="inline-ico" /> Add a team member
      </h2>
      <div className="grid-3">
        <label className="field">
          <span>Email</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
        </label>
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </label>
        <label className="field">
          <span>Temporary password</span>
          <input type="password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </label>
      </div>
      <div className="row gap center">
        <button className="btn primary small">Add member</button>
        {msg && <span className={`small ${msg.ok ? 'muted' : 'error'}`}>{msg.text}</span>}
      </div>
    </form>
  );
}

function ChangePassword() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await authApi.changePassword(current, next);
      setMsg({ ok: true, text: 'Password changed. Other devices have been signed out.' });
      setCurrent('');
      setNext('');
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    }
  };

  return (
    <form className="card" onSubmit={submit} style={{ marginTop: 12 }}>
      <h2>Change your password</h2>
      <div className="grid-3">
        <label className="field">
          <span>Current password</span>
          <input type="password" required value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        </label>
        <label className="field">
          <span>New password (at least 10 characters)</span>
          <input type="password" required minLength={10} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        </label>
      </div>
      <div className="row gap center">
        <button className="btn small">Update password</button>
        {msg && <span className={`small ${msg.ok ? 'muted' : 'error'}`}>{msg.text}</span>}
      </div>
    </form>
  );
}
