import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LOCAL_MODE } from '../api';
import { useAuth } from '../auth';
import Icon from './Icon';

/** Account menu: current workspace, switching between workspaces, team settings and sign-out. */
export default function UserMenu() {
  const { user, workspace, workspaces, switchWorkspace, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  if (LOCAL_MODE || !user) return null;
  const initials = (user.name || user.email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

  return (
    <div className="menu-wrap">
      <button className="user-btn" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open}>
        <span className="ws-label">{workspace?.name}</span>
        <span className="avatar">{initials}</span>
        <Icon name="chevronDown" size={14} />
      </button>
      {open && (
        <div className="menu" role="menu" onMouseLeave={() => setOpen(false)}>
          <div className="menu-head">
            <b>{user.name || user.email}</b>
            <span className="muted small">{user.email}</span>
          </div>
          <hr />
          {workspaces.length > 1 && (
            <>
              <div className="menu-label">Workspaces</div>
              {workspaces.map((w) => (
                <button
                  key={w.id}
                  role="menuitemradio"
                  aria-checked={w.id === workspace?.id}
                  onClick={async () => {
                    setOpen(false);
                    if (w.id !== workspace?.id) {
                      await switchWorkspace(w.id);
                      nav('/');
                    }
                  }}
                >
                  <span>{w.name}</span>
                  {w.id === workspace?.id && <Icon name="check" size={14} />}
                </button>
              ))}
              <hr />
            </>
          )}
          <Link to="/team" role="menuitem" className="menu-link" onClick={() => setOpen(false)}>
            <Icon name="users" size={14} /> Team &amp; settings
          </Link>
          <button
            role="menuitem"
            onClick={async () => {
              setOpen(false);
              await signOut();
              nav('/login');
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
