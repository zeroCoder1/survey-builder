import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import type pg from 'pg';
import { audit } from './audit.js';
import { query, tx } from './db.js';

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const SESSION_COOKIE = 'sb_session';
const SESSION_DAYS = 14;
const INVITE_DAYS = 7;
const MIN_PASSWORD = 10;
const isProd = process.env.NODE_ENV === 'production';

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Workspace {
  id: string;
  name: string;
  role: 'owner' | 'member';
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: User;
    workspace?: Workspace;
    sessionId?: string;
  }
}

// ---------------------------------------------------------------------------------------------
// Passwords (scrypt, no native dependencies)

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, keyB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const actual = await scryptAsync(password, Buffer.from(saltB64, 'base64'), expected.length);
  return timingSafeEqual(expected, actual);
}

function passwordProblem(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`;
  if (password.length > 200) return 'Password is too long.';
  return null;
}

const normalizeEmail = (e: unknown) => (typeof e === 'string' ? e.trim().toLowerCase() : '');
const validEmail = (e: string) => e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const cleanName = (n: unknown, max = 80) => (typeof n === 'string' ? n.trim().slice(0, max) : '');
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

// ---------------------------------------------------------------------------------------------
// Sessions: the cookie holds a random token; only its hash is stored. Each session has an active workspace.

async function startSession(res: Response, userId: string, workspaceId: string | null) {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await query('INSERT INTO sessions (id, user_id, workspace_id, expires_at) VALUES ($1, $2, $3, $4)', [sha256(token), userId, workspaceId, expires]);
  await query('DELETE FROM sessions WHERE expires_at < now()');
  res.cookie(SESSION_COOKIE, token, { httpOnly: true, secure: isProd, sameSite: 'lax', expires, path: '/' });
}

async function workspacesOf(userId: string): Promise<Workspace[]> {
  const { rows } = await query<Workspace>(
    `SELECT w.id, w.name, m.role FROM memberships m JOIN workspaces w ON w.id = m.workspace_id
      WHERE m.user_id = $1 ORDER BY m.created_at`,
    [userId],
  );
  return rows;
}

async function createWorkspace(client: pg.PoolClient, ownerId: string, name: string): Promise<string> {
  const id = randomUUID();
  await client.query('INSERT INTO workspaces (id, name) VALUES ($1, $2)', [id, name]);
  await client.query(`INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`, [id, ownerId]);
  return id;
}

/** Attaches req.user and req.workspace when the session cookie is valid. */
export async function loadUser(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token === 'string' && token) {
    const sid = sha256(token);
    const { rows } = await query<User & { workspace_id: string | null }>(
      `SELECT u.id, u.email, u.name, s.workspace_id FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.id = $1 AND s.expires_at > now()`,
      [sid],
    );
    if (rows[0]) {
      const { workspace_id, ...user } = rows[0];
      req.user = user;
      req.sessionId = sid;
      const mine = await workspacesOf(user.id);
      req.workspace = mine.find((w) => w.id === workspace_id) ?? mine[0];
    }
  }
  next();
}

export function requireUser(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Please sign in.' });
  next();
}

/** Signed in and inside a workspace. Someone removed from every workspace gets a fresh one of their own. */
export async function requireWorkspace(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Please sign in.' });
  if (!req.workspace) {
    const user = req.user;
    const id = await tx((client) => createWorkspace(client, user.id, `${(user.name || 'My').split(' ')[0]}'s workspace`));
    await query('UPDATE sessions SET workspace_id = $1 WHERE id = $2', [id, req.sessionId]);
    req.workspace = (await workspacesOf(user.id)).find((w) => w.id === id);
  }
  next();
}

function requireOwner(req: Request, res: Response, next: NextFunction) {
  if (req.workspace?.role !== 'owner') return res.status(403).json({ error: 'Only the workspace owner can do this.' });
  next();
}

// ---------------------------------------------------------------------------------------------
// Invites

async function findInvite(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const { rows } = await query<{ id: string; workspace_id: string; workspace_name: string; inviter: string | null }>(
    `SELECT i.id, i.workspace_id, w.name AS workspace_name, COALESCE(NULLIF(u.name, ''), u.email) AS inviter
       FROM invites i JOIN workspaces w ON w.id = i.workspace_id LEFT JOIN users u ON u.id = i.created_by
      WHERE i.token_hash = $1 AND i.revoked_at IS NULL AND i.expires_at > now()`,
    [sha256(token)],
  );
  return rows[0] ?? null;
}

/** Adds the user to the invite's workspace (no-op if already a member). Returns the workspace id. */
async function acceptInvite(client: pg.PoolClient, inviteId: string, workspaceId: string, userId: string) {
  const added = await client.query(
    `INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING`,
    [workspaceId, userId],
  );
  if (added.rowCount) await client.query('UPDATE invites SET uses = uses + 1 WHERE id = $1', [inviteId]);
  return workspaceId;
}

// ---------------------------------------------------------------------------------------------
// Routes: /api/auth

const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again in a few minutes.' },
});

export const authRouter = Router();

authRouter.get('/me', async (req, res) => {
  // 200 rather than 401: "not signed in" is a normal state for this endpoint
  if (!req.user) return res.json({ user: null });
  res.json({ user: req.user, workspace: req.workspace ?? null, workspaces: await workspacesOf(req.user.id) });
});

authRouter.post('/signup', authLimiter, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const name = cleanName(req.body?.name);
  if (!name) return res.status(400).json({ error: 'Enter your name.' });
  if (!validEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  const problem = passwordProblem(req.body?.password);
  if (problem) return res.status(400).json({ error: problem });

  const invite = req.body?.inviteToken ? await findInvite(String(req.body.inviteToken)) : null;
  if (req.body?.inviteToken && !invite) return res.status(400).json({ error: 'This invite link has expired or been revoked. Ask for a new one.' });

  const id = randomUUID();
  const passwordHash = await hashPassword(req.body.password);
  let workspaceId: string;
  try {
    workspaceId = await tx(async (client) => {
      await client.query('INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, $3, $4)', [id, email, name, passwordHash]);
      if (invite) return acceptInvite(client, invite.id, invite.workspace_id, id);
      return createWorkspace(client, id, cleanName(req.body?.workspaceName) || `${name.split(' ')[0]}'s workspace`);
    });
  } catch (e) {
    if ((e as { code?: string }).code === '23505') return res.status(409).json({ error: 'An account with this email already exists. Sign in instead.' });
    throw e;
  }
  await startSession(res, id, workspaceId);
  req.user = { id, email, name };
  await audit(req, invite ? 'user.signup_invited' : 'user.signup', { workspaceId });
  res.status(201).json({ user: req.user });
});

authRouter.post('/login', authLimiter, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const { rows } = await query<User & { password_hash: string }>('SELECT id, email, name, password_hash FROM users WHERE email = $1', [email]);
  const user = rows[0];
  const ok = user ? await verifyPassword(String(req.body?.password ?? ''), user.password_hash) : false;
  if (!user || !ok) {
    await audit(req, 'auth.login_failed', { email });
    return res.status(401).json({ error: 'Email or password is incorrect.' });
  }
  // the first workspace becomes active; requireWorkspace creates one if they have none
  await startSession(res, user.id, (await workspacesOf(user.id))[0]?.id ?? null);
  req.user = { id: user.id, email: user.email, name: user.name };
  await audit(req, 'auth.login');
  res.json({ user: req.user });
});

authRouter.post('/logout', async (req, res) => {
  if (req.sessionId) await query('DELETE FROM sessions WHERE id = $1', [req.sessionId]);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.status(204).end();
});

authRouter.post('/workspace', requireUser, async (req, res) => {
  const target = (await workspacesOf(req.user!.id)).find((w) => w.id === req.body?.workspaceId);
  if (!target) return res.status(404).json({ error: 'Workspace not found.' });
  await query('UPDATE sessions SET workspace_id = $1 WHERE id = $2', [target.id, req.sessionId]);
  res.json({ workspace: target });
});

authRouter.post('/password', requireUser, async (req, res) => {
  const { rows } = await query<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = $1', [req.user!.id]);
  if (!(await verifyPassword(String(req.body?.currentPassword ?? ''), rows[0].password_hash)))
    return res.status(400).json({ error: 'Current password is incorrect.' });
  const problem = passwordProblem(req.body?.newPassword);
  if (problem) return res.status(400).json({ error: problem });
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [await hashPassword(req.body.newPassword), req.user!.id]);
  await query('DELETE FROM sessions WHERE user_id = $1 AND id <> $2', [req.user!.id, req.sessionId]); // sign out other devices
  await audit(req, 'user.password_changed');
  res.status(204).end();
});

// ---------------------------------------------------------------------------------------------
// Routes: /api/invites (open an invite link)

export const invitesRouter = Router();

invitesRouter.get('/:token', async (req, res) => {
  const invite = await findInvite(String(req.params.token));
  if (!invite) return res.status(404).json({ error: 'This invite link has expired or been revoked. Ask for a new one.' });
  const alreadyMember = req.user ? (await workspacesOf(req.user.id)).some((w) => w.id === invite.workspace_id) : false;
  res.json({ workspaceName: invite.workspace_name, inviter: invite.inviter, alreadyMember });
});

invitesRouter.post('/:token/accept', requireUser, async (req, res) => {
  const invite = await findInvite(String(req.params.token));
  if (!invite) return res.status(404).json({ error: 'This invite link has expired or been revoked. Ask for a new one.' });
  await tx((client) => acceptInvite(client, invite.id, invite.workspace_id, req.user!.id));
  await query('UPDATE sessions SET workspace_id = $1 WHERE id = $2', [invite.workspace_id, req.sessionId]);
  await audit(req, 'workspace.joined', { workspaceId: invite.workspace_id });
  res.json({ workspace: { id: invite.workspace_id, name: invite.workspace_name, role: 'member' } });
});

// ---------------------------------------------------------------------------------------------
// Routes: /api/workspace (the active workspace)

export const workspaceRouter = Router();
workspaceRouter.use(requireWorkspace);

workspaceRouter.patch('/', requireOwner, async (req, res) => {
  const name = cleanName(req.body?.name);
  if (!name) return res.status(400).json({ error: 'Enter a workspace name.' });
  await query('UPDATE workspaces SET name = $1 WHERE id = $2', [name, req.workspace!.id]);
  res.json({ workspace: { ...req.workspace!, name } });
});

workspaceRouter.get('/members', async (req, res) => {
  const { rows } = await query(
    `SELECT u.id, u.email, u.name, m.role, m.created_at AS "joinedAt"
       FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.workspace_id = $1 ORDER BY m.created_at`,
    [req.workspace!.id],
  );
  res.json(rows);
});

/** Owners can remove anyone except themselves; members can remove themselves (leave). */
workspaceRouter.delete('/members/:userId', async (req, res) => {
  const target = String(req.params.userId);
  const self = target === req.user!.id;
  if (!self && req.workspace!.role !== 'owner') return res.status(403).json({ error: 'Only the workspace owner can remove people.' });
  if (self && req.workspace!.role === 'owner') return res.status(400).json({ error: 'The owner cannot leave their own workspace.' });
  await query('DELETE FROM memberships WHERE workspace_id = $1 AND user_id = $2', [req.workspace!.id, target]);
  await query('UPDATE sessions SET workspace_id = NULL WHERE user_id = $1 AND workspace_id = $2', [target, req.workspace!.id]);
  await audit(req, self ? 'workspace.left' : 'workspace.member_removed', { userId: target });
  res.status(204).end();
});

workspaceRouter.get('/invites', async (req, res) => {
  const { rows } = await query(
    `SELECT i.id, i.expires_at AS "expiresAt", i.uses, i.created_at AS "createdAt", COALESCE(NULLIF(u.name, ''), u.email) AS "createdBy"
       FROM invites i LEFT JOIN users u ON u.id = i.created_by
      WHERE i.workspace_id = $1 AND i.revoked_at IS NULL AND i.expires_at > now() ORDER BY i.created_at DESC`,
    [req.workspace!.id],
  );
  res.json(rows);
});

/** Creates a shareable invite link. The token is returned once; only its hash is stored. */
workspaceRouter.post('/invites', async (req, res) => {
  const token = randomBytes(24).toString('base64url');
  const id = randomUUID();
  const expires = new Date(Date.now() + INVITE_DAYS * 86_400_000);
  await query('INSERT INTO invites (id, token_hash, workspace_id, created_by, expires_at) VALUES ($1, $2, $3, $4, $5)', [
    id,
    sha256(token),
    req.workspace!.id,
    req.user!.id,
    expires,
  ]);
  await audit(req, 'workspace.invite_created', { inviteId: id });
  res.status(201).json({ id, token, expiresAt: expires.toISOString() });
});

workspaceRouter.delete('/invites/:id', async (req, res) => {
  await query('UPDATE invites SET revoked_at = now() WHERE id = $1 AND workspace_id = $2', [req.params.id, req.workspace!.id]);
  await audit(req, 'workspace.invite_revoked', { inviteId: req.params.id });
  res.status(204).end();
});
