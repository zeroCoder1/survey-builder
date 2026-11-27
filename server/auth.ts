import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { audit } from './audit.js';
import { query } from './db.js';

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const SESSION_COOKIE = 'sb_session';
const SESSION_DAYS = 14;
const MIN_PASSWORD = 10;
const isProd = process.env.NODE_ENV === 'production';

export interface User {
  id: string;
  email: string;
  name: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: User;
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
  return null;
}

const normalizeEmail = (e: unknown) => (typeof e === 'string' ? e.trim().toLowerCase() : '');
const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// ---------------------------------------------------------------------------------------------
// Sessions: the cookie holds a random token; only its hash is stored.

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

async function startSession(res: Response, userId: string) {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await query('INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)', [tokenHash(token), userId, expires]);
  await query('DELETE FROM sessions WHERE expires_at < now()');
  res.cookie(SESSION_COOKIE, token, { httpOnly: true, secure: isProd, sameSite: 'lax', expires, path: '/' });
}

/** Attaches req.user when the session cookie is valid. */
export async function loadUser(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token === 'string' && token) {
    const { rows } = await query<User>(
      `SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.id = $1 AND s.expires_at > now()`,
      [tokenHash(token)],
    );
    if (rows[0]) req.user = rows[0];
  }
  next();
}

export function requireUser(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Please sign in.' });
  next();
}

async function userCount(): Promise<number> {
  const { rows } = await query<{ n: string }>('SELECT count(*) AS n FROM users');
  return Number(rows[0].n);
}

/** First-run setup is open only while there are no users, and in production only with SETUP_TOKEN. */
function setupTokenOk(token: unknown): boolean {
  const expected = process.env.SETUP_TOKEN;
  if (!expected) return !isProd;
  if (typeof token !== 'string' || token.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

// ---------------------------------------------------------------------------------------------
// Routes

const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many attempts. Try again in a few minutes.' } });

export const authRouter = Router();

authRouter.get('/me', async (req, res) => {
  if (req.user) return res.json({ user: req.user });
  // 200 rather than 401: "not signed in" is a normal state for this endpoint
  const needsSetup = (await userCount()) === 0;
  res.json({ user: null, needsSetup, setupRequiresToken: needsSetup && (isProd || !!process.env.SETUP_TOKEN) });
});

authRouter.post('/setup', loginLimiter, async (req, res) => {
  if ((await userCount()) > 0) return res.status(409).json({ error: 'Setup is already complete. Please sign in.' });
  if (!setupTokenOk(req.body?.setupToken))
    return res.status(403).json({ error: 'This setup link is missing or incorrect. Open the full link, including ?token=…' });
  const email = normalizeEmail(req.body?.email);
  if (!validEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  const problem = passwordProblem(req.body?.password);
  if (problem) return res.status(400).json({ error: problem });
  const id = randomUUID();
  await query('INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, $3, $4)', [
    id,
    email,
    String(req.body?.name ?? '').trim(),
    await hashPassword(req.body.password),
  ]);
  await startSession(res, id);
  await audit(req, 'user.setup', { userId: id });
  res.status(201).json({ user: { id, email, name: String(req.body?.name ?? '').trim() } });
});

authRouter.post('/login', loginLimiter, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const { rows } = await query<User & { password_hash: string }>('SELECT id, email, name, password_hash FROM users WHERE email = $1', [email]);
  const user = rows[0];
  const ok = user ? await verifyPassword(String(req.body?.password ?? ''), user.password_hash) : false;
  if (!user || !ok) {
    await audit(req, 'auth.login_failed', { email });
    return res.status(401).json({ error: 'Email or password is incorrect.' });
  }
  await startSession(res, user.id);
  req.user = { id: user.id, email: user.email, name: user.name };
  await audit(req, 'auth.login');
  res.json({ user: req.user });
});

authRouter.post('/logout', async (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token === 'string') await query('DELETE FROM sessions WHERE id = $1', [tokenHash(token)]);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.status(204).end();
});

authRouter.post('/password', requireUser, async (req, res) => {
  const { rows } = await query<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = $1', [req.user!.id]);
  if (!(await verifyPassword(String(req.body?.currentPassword ?? ''), rows[0].password_hash)))
    return res.status(400).json({ error: 'Current password is incorrect.' });
  const problem = passwordProblem(req.body?.newPassword);
  if (problem) return res.status(400).json({ error: problem });
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [await hashPassword(req.body.newPassword), req.user!.id]);
  // sign out other devices
  const current = tokenHash(String(req.cookies?.[SESSION_COOKIE] ?? ''));
  await query('DELETE FROM sessions WHERE user_id = $1 AND id <> $2', [req.user!.id, current]);
  await audit(req, 'user.password_changed');
  res.status(204).end();
});

export const usersRouter = Router();
usersRouter.use(requireUser);

usersRouter.get('/', async (_req, res) => {
  const { rows } = await query('SELECT id, email, name, created_at AS "createdAt" FROM users ORDER BY created_at');
  res.json(rows);
});

usersRouter.post('/', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!validEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  const problem = passwordProblem(req.body?.password);
  if (problem) return res.status(400).json({ error: problem });
  const id = randomUUID();
  try {
    await query('INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, $3, $4)', [
      id,
      email,
      String(req.body?.name ?? '').trim(),
      await hashPassword(req.body.password),
    ]);
  } catch (e) {
    if ((e as { code?: string }).code === '23505') return res.status(409).json({ error: 'A user with that email already exists.' });
    throw e;
  }
  await audit(req, 'user.created', { userId: id, email });
  res.status(201).json({ id, email, name: String(req.body?.name ?? '').trim() });
});

usersRouter.delete('/:id', async (req, res) => {
  if (req.params.id === req.user!.id) return res.status(400).json({ error: 'You cannot remove your own account.' });
  if ((await userCount()) <= 1) return res.status(400).json({ error: 'At least one user must remain.' });
  await query('DELETE FROM users WHERE id = $1', [req.params.id]);
  await audit(req, 'user.removed', { userId: req.params.id });
  res.status(204).end();
});
