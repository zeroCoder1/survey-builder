import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { authRouter, invitesRouter, loadUser, workspaceRouter } from './auth.js';
import { migrate, pool } from './db.js';
import { formsRouter } from './forms.js';
import { studiesRouter } from './studies.js';

const isProd = process.env.NODE_ENV === 'production';
const PORT = Number(isProd ? process.env.PORT || 3001 : process.env.API_PORT || 3001);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // behind Railway's proxy: use the client IP for rate limiting and logs

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        ...(isProd ? {} : { upgradeInsecureRequests: null }),
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);
app.use(cookieParser());

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

// State-changing API calls must come from this app's own JavaScript (custom header = no cross-site form posts).
app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  if (req.method !== 'GET' && req.get('x-requested-with') !== 'survey-builder') return res.status(403).json({ error: 'Forbidden' });
  next();
});

// Public form submissions are small; admin uploads (simulated batches) can be larger.
app.use('/api/forms', express.json({ limit: '1mb' }), formsRouter);
app.use('/api', express.json({ limit: '20mb' }), loadUser);
app.use('/api/auth', authRouter);
app.use('/api/workspace', workspaceRouter);
app.use('/api/invites', invitesRouter);
app.use('/api/studies', studiesRouter);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

if (isProd) {
  const dist = path.join(ROOT, 'dist');
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.use('/assets', express.static(path.join(dist, 'assets'), { immutable: true, maxAge: '1y' }));
  app.get('/{*path}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err: Error & { status?: number; type?: string }, _req: Request, res: Response, _next: NextFunction) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large.' });
  if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

await migrate();
const server = app.listen(PORT, () => console.log(`Survey Builder listening on port ${PORT}`));

const shutdown = () => {
  server.close(() => pool.end().then(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
