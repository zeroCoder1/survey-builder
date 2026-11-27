import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi, inviteUrl, workspaceApi, type Invite, type Member } from '../api';
import { useAuth } from '../auth';
import Icon from '../components/Icon';
import UserMenu from '../components/UserMenu';

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export default function TeamPage() {
  const { user, workspace, refresh } = useAuth();
  const nav = useNavigate();
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [newLink, setNewLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const isOwner = workspace?.role === 'owner';

  const load = () => {
    workspaceApi.members().then(setMembers).catch((e) => setError(e.message));
    workspaceApi.invites().then(setInvites).catch((e) => setError(e.message));
  };
  useEffect(load, [workspace?.id]);

  const createLink = async () => {
    try {
      const inv = await workspaceApi.createInvite();
      setNewLink(inviteUrl(inv.token));
      setCopied(false);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const copy = () => {
    navigator.clipboard?.writeText(newLink);
    setCopied(true);
  };

  const remove = async (m: Member) => {
    const self = m.id === user?.id;
    const msg = self ? `Leave ${workspace?.name}? You will lose access to its studies.` : `Remove ${m.name || m.email} from ${workspace?.name}? Their account stays, but they lose access to these studies.`;
    if (!confirm(msg)) return;
    try {
      await workspaceApi.removeMember(m.id);
      if (self) {
        await refresh();
        nav('/');
      } else load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="page">
      <header className="topbar">
        <Link to="/" className="brand">Survey Builder</Link>
        <span className="crumb">/</span>
        <span>Team &amp; settings</span>
        <div className="spacer" />
        <UserMenu />
      </header>
      <main className="container narrow">
        {error && <div className="alert">{error}</div>}
        <WorkspaceName canEdit={isOwner} />

        <section className="card">
          <div className="row between center">
            <div>
              <h2 style={{ margin: 0 }}>Invite people</h2>
              <p className="muted small" style={{ margin: '4px 0 0' }}>
                Anyone with the link can join this workspace for 7 days. Share it by email or chat.
              </p>
            </div>
            <button className="btn primary small" onClick={createLink}>
              <Icon name="link" size={14} /> Create invite link
            </button>
          </div>
          {newLink && (
            <div className="invite-link">
              <input readOnly value={newLink} onFocus={(e) => e.target.select()} aria-label="Invite link" />
              <button className="btn small" onClick={copy}>
                <Icon name={copied ? 'check' : 'copy'} size={14} /> {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}
          {invites.length > 0 && (
            <div className="invite-list">
              <div className="muted small">Active links</div>
              {invites.map((i) => (
                <div key={i.id} className="invite-row">
                  <span className="small">
                    Created by {i.createdBy ?? 'someone'} on {fmtDate(i.createdAt)} · used {i.uses} time{i.uses === 1 ? '' : 's'} · expires {fmtDate(i.expiresAt)}
                  </span>
                  <button className="btn small ghost danger" onClick={() => workspaceApi.revokeInvite(i.id).then(load)}>
                    Turn off
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card" style={{ padding: 0 }}>
          <h2 style={{ padding: '16px 16px 0' }}>Members</h2>
          {members.map((m) => (
            <div key={m.id} className="user-row">
              <span className="avatar">{(m.name || m.email)[0].toUpperCase()}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div>
                  {m.name || m.email} {m.id === user?.id && <span className="muted small">(you)</span>}
                </div>
                <div className="muted small">{m.email}</div>
              </div>
              <span className={`role ${m.role}`}>{m.role === 'owner' ? 'Owner' : 'Member'}</span>
              {m.role !== 'owner' && (isOwner || m.id === user?.id) && (
                <button className="btn small ghost danger" onClick={() => remove(m)}>
                  {m.id === user?.id ? 'Leave' : 'Remove'}
                </button>
              )}
            </div>
          ))}
        </section>

        <ChangePassword />
      </main>
    </div>
  );
}

function WorkspaceName({ canEdit }: { canEdit: boolean }) {
  const { workspace, refresh } = useAuth();
  const [name, setName] = useState(workspace?.name ?? '');
  const [saved, setSaved] = useState(false);
  useEffect(() => setName(workspace?.name ?? ''), [workspace?.name]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    await workspaceApi.rename(name);
    await refresh();
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <form className="ws-head" onSubmit={save}>
      <input className="ws-name" value={name} disabled={!canEdit} onChange={(e) => setName(e.target.value)} aria-label="Workspace name" maxLength={80} />
      {canEdit && name.trim() && name !== workspace?.name && <button className="btn small">Save name</button>}
      {saved && <span className="muted small">Saved</span>}
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
    <form className="card" onSubmit={submit}>
      <h2>Your password</h2>
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
