import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LOCAL_MODE } from '../api';
import { useAuth } from '../auth';
import Icon from './Icon';

export default function UserMenu() {
  const { user, signOut } = useAuth();
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
      <button className="user-btn" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} title={user.email}>
        <span className="avatar">{initials}</span>
        <Icon name="chevronDown" size={14} />
      </button>
      {open && (
        <div className="menu" role="menu" onMouseLeave={() => setOpen(false)}>
          <div className="menu-head">
            <b>{user.name || user.email}</b>
            {user.name && <span className="muted small">{user.email}</span>}
          </div>
          <hr />
          <Link to="/account" role="menuitem" className="menu-link" onClick={() => setOpen(false)}>
            <Icon name="users" size={14} /> Team &amp; account
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
