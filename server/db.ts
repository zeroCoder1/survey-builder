import pg from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env (local) or attach a Postgres database (Railway).');
}

// Railway's public proxy needs TLS; its private network and local databases do not.
const needsSsl = /sslmode=require/.test(connectionString) || process.env.DATABASE_SSL === 'true';

export const pool = new pg.Pool({
  connectionString,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  max: Number(process.env.DATABASE_POOL_SIZE || 10),
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: unknown[] = []) {
  return pool.query<T>(text, params);
}

/** Runs fn inside a transaction, rolling back on error. */
export async function tx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS users (
     id            text PRIMARY KEY,
     email         text NOT NULL UNIQUE,
     name          text NOT NULL DEFAULT '',
     password_hash text NOT NULL,
     created_at    timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS sessions (
     id         text PRIMARY KEY,
     user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     expires_at timestamptz NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id)`,
  `CREATE TABLE IF NOT EXISTS studies (
     id         text PRIMARY KEY,
     data       jsonb NOT NULL,
     created_by text REFERENCES users(id) ON DELETE SET NULL,
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS studies_surveys_idx ON studies USING gin ((data->'surveys') jsonb_path_ops)`,
  `CREATE TABLE IF NOT EXISTS responses (
     id           text PRIMARY KEY,
     study_id     text NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
     survey_id    text NOT NULL,
     response_id  text NOT NULL,
     submitted_at text NOT NULL,
     data_type    text NOT NULL CHECK (data_type IN ('LIVE', 'SIMULATED')),
     answers      jsonb NOT NULL DEFAULT '{}',
     roster       jsonb NOT NULL DEFAULT '{}',
     person_code  text,
     person_name  text,
     consented_at timestamptz,
     created_at   timestamptz NOT NULL DEFAULT now(),
     UNIQUE (study_id, survey_id, response_id)
   )`,
  `CREATE INDEX IF NOT EXISTS responses_study_idx ON responses(study_id, survey_id)`,
  `CREATE TABLE IF NOT EXISTS audit_log (
     id       bigserial PRIMARY KEY,
     user_id  text REFERENCES users(id) ON DELETE SET NULL,
     action   text NOT NULL,
     study_id text,
     detail   jsonb NOT NULL DEFAULT '{}',
     ip       text,
     at       timestamptz NOT NULL DEFAULT now()
   )`,
  // Workspaces: every study belongs to one; users join them as owner or member.
  `CREATE TABLE IF NOT EXISTS workspaces (
     id         text PRIMARY KEY,
     name       text NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS memberships (
     workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
     user_id      text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     role         text NOT NULL CHECK (role IN ('owner', 'member')),
     created_at   timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (workspace_id, user_id)
   )`,
  `CREATE INDEX IF NOT EXISTS memberships_user_idx ON memberships(user_id)`,
  // Invite links: only a hash of the token is stored; links can be reused until they expire or are revoked.
  `CREATE TABLE IF NOT EXISTS invites (
     id           text PRIMARY KEY,
     token_hash   text NOT NULL UNIQUE,
     workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
     created_by   text REFERENCES users(id) ON DELETE SET NULL,
     expires_at   timestamptz NOT NULL,
     revoked_at   timestamptz,
     uses         integer NOT NULL DEFAULT 0,
     created_at   timestamptz NOT NULL DEFAULT now()
   )`,
  `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS workspace_id text REFERENCES workspaces(id) ON DELETE SET NULL`,
  `ALTER TABLE studies ADD COLUMN IF NOT EXISTS workspace_id text REFERENCES workspaces(id) ON DELETE CASCADE`,
  `CREATE INDEX IF NOT EXISTS studies_workspace_idx ON studies(workspace_id)`,
  `ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS workspace_id text`,
];

export async function migrate() {
  for (const sql of MIGRATIONS) await pool.query(sql);
}
