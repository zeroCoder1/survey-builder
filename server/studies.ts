import { randomBytes, randomUUID } from 'node:crypto';
import { Router } from 'express';
import type pg from 'pg';
import type { Study, SurveyResponse } from '../src/types.js';
import { audit } from './audit.js';
import { requireUser } from './auth.js';
import { query, tx } from './db.js';

export const newFormToken = () => randomBytes(18).toString('base64url');
const today = () => new Date().toISOString().slice(0, 10);

/** Form tokens are owned by the server: keep existing ones, mint new ones, ignore client-supplied values. */
function withFormTokens(next: Study, prev?: Study): Study {
  const existing = new Map((prev?.surveys ?? []).map((s) => [s.id, s.formToken]));
  return { ...next, surveys: next.surveys.map((s) => ({ ...s, formToken: existing.get(s.id) || newFormToken() })) };
}

interface ResponseRow {
  id: string;
  study_id: string;
  survey_id: string;
  response_id: string;
  submitted_at: string;
  data_type: 'LIVE' | 'SIMULATED';
  answers: SurveyResponse['answers'];
  roster: SurveyResponse['roster'];
  person_code: string | null;
  person_name: string | null;
}

const toResponse = (r: ResponseRow): SurveyResponse => ({
  id: r.id,
  studyId: r.study_id,
  surveyId: r.survey_id,
  responseId: r.response_id,
  submittedAt: r.submitted_at,
  dataType: r.data_type,
  answers: r.answers,
  roster: r.roster,
  ...(r.person_code ? { personCode: r.person_code } : {}),
  ...(r.person_name ? { personName: r.person_name } : {}),
});

export interface ResponseInput {
  surveyId: string;
  dataType?: 'LIVE' | 'SIMULATED';
  submittedAt?: string;
  answers?: SurveyResponse['answers'];
  roster?: SurveyResponse['roster'];
  personCode?: string;
  personName?: string;
  consentedAt?: Date | null;
}

/** Inserts responses, numbering them <SURVEY>-R001… per survey. Serialised per study with an advisory lock. */
export async function insertResponses(client: pg.PoolClient, study: Study, items: ResponseInput[]): Promise<SurveyResponse[]> {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [study.id]);
  const next = new Map<string, number>();
  const created: SurveyResponse[] = [];
  for (const item of items) {
    const survey = study.surveys.find((s) => s.id === item.surveyId);
    if (!survey) throw Object.assign(new Error('Unknown survey'), { status: 400 });
    const prefix = `${survey.code}-R`;
    if (!next.has(survey.id)) {
      const { rows } = await client.query<{ n: number | null }>(
        `SELECT max(substring(response_id FROM length($3) + 1)::int) AS n
           FROM responses WHERE study_id = $1 AND survey_id = $2 AND response_id LIKE $3 || '%'
            AND substring(response_id FROM length($3) + 1) ~ '^[0-9]+$'`,
        [study.id, survey.id, prefix],
      );
      next.set(survey.id, (rows[0].n ?? 0) + 1);
    }
    const n = next.get(survey.id)!;
    next.set(survey.id, n + 1);
    const { rows } = await client.query<ResponseRow>(
      `INSERT INTO responses (id, study_id, survey_id, response_id, submitted_at, data_type, answers, roster, person_code, person_name, consented_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [
        randomUUID(),
        study.id,
        survey.id,
        `${prefix}${String(n).padStart(3, '0')}`,
        /^\d{4}-\d{2}-\d{2}$/.test(item.submittedAt ?? '') ? item.submittedAt : today(),
        item.dataType === 'SIMULATED' ? 'SIMULATED' : 'LIVE',
        JSON.stringify(item.answers ?? {}),
        JSON.stringify(item.roster ?? {}),
        item.personCode ? String(item.personCode).slice(0, 100) : null,
        item.personName ? String(item.personName).slice(0, 200) : null,
        item.consentedAt ?? null,
      ],
    );
    created.push(toResponse(rows[0]));
  }
  return created;
}

async function loadStudy(id: string): Promise<Study | null> {
  const { rows } = await query<{ data: Study; created_at: Date; updated_at: Date }>('SELECT data, created_at, updated_at FROM studies WHERE id = $1', [id]);
  if (!rows[0]) return null;
  return { ...rows[0].data, id, createdAt: rows[0].created_at.toISOString(), updatedAt: rows[0].updated_at.toISOString() };
}

export const studiesRouter = Router();
studiesRouter.use(requireUser);

studiesRouter.get('/', async (_req, res) => {
  const { rows } = await query(
    `SELECT s.id, s.data->>'title' AS title, s.updated_at AS "updatedAt",
            jsonb_array_length(s.data->'surveys') AS "surveyCount",
            (SELECT count(*)::int FROM responses r WHERE r.study_id = s.id) AS "responseCount"
       FROM studies s ORDER BY s.updated_at DESC`,
  );
  res.json(rows);
});

studiesRouter.post('/', async (req, res) => {
  const id = randomUUID();
  const study = withFormTokens({ ...(req.body as Study), id });
  const { createdAt: _c, updatedAt: _u, ...data } = study;
  await query('INSERT INTO studies (id, data, created_by) VALUES ($1, $2, $3)', [id, JSON.stringify(data), req.user!.id]);
  await audit(req, 'study.created', {}, id);
  res.status(201).json(await loadStudy(id));
});

studiesRouter.get('/:id', async (req, res) => {
  const study = await loadStudy(req.params.id);
  if (!study) return res.status(404).json({ error: 'Study not found' });
  res.json(study);
});

studiesRouter.put('/:id', async (req, res) => {
  const prev = await loadStudy(req.params.id);
  if (!prev) return res.status(404).json({ error: 'Study not found' });
  const study = withFormTokens({ ...(req.body as Study), id: prev.id }, prev);
  const { createdAt: _c, updatedAt: _u, ...data } = study;
  await query('UPDATE studies SET data = $1, updated_at = now() WHERE id = $2', [JSON.stringify(data), prev.id]);
  res.json(await loadStudy(prev.id));
});

studiesRouter.delete('/:id', async (req, res) => {
  await query('DELETE FROM studies WHERE id = $1', [req.params.id]);
  await audit(req, 'study.deleted', {}, req.params.id);
  res.status(204).end();
});

studiesRouter.get('/:id/responses', async (req, res) => {
  const { rows } = await query<ResponseRow>('SELECT * FROM responses WHERE study_id = $1 ORDER BY survey_id, response_id', [req.params.id]);
  res.json(rows.map(toResponse));
});

/** Admin insert: used for simulated data (and manual entry). Accepts one response or { batch: [...] }. */
studiesRouter.post('/:id/responses', async (req, res) => {
  const study = await loadStudy(req.params.id);
  if (!study) return res.status(404).json({ error: 'Study not found' });
  const items: ResponseInput[] = Array.isArray(req.body?.batch) ? req.body.batch : [req.body];
  if (items.length > 5000) return res.status(400).json({ error: 'At most 5000 responses per request.' });
  const created = await tx((client) => insertResponses(client, study, items));
  await audit(req, 'responses.added', { count: created.length, dataTypes: [...new Set(created.map((r) => r.dataType))] }, study.id);
  res.status(201).json(created);
});

studiesRouter.delete('/:id/responses/:rid', async (req, res) => {
  const { rows } = await query<{ response_id: string }>('DELETE FROM responses WHERE study_id = $1 AND id = $2 RETURNING response_id', [req.params.id, req.params.rid]);
  await audit(req, 'responses.deleted', { responseIds: rows.map((r) => r.response_id) }, req.params.id);
  res.status(204).end();
});

studiesRouter.delete('/:id/responses', async (req, res) => {
  const { surveyId, dataType } = req.query as Record<string, string | undefined>;
  const { rowCount } = await query(
    `DELETE FROM responses WHERE study_id = $1 AND ($2::text IS NULL OR survey_id = $2) AND ($3::text IS NULL OR data_type = $3)`,
    [req.params.id, surveyId ?? null, dataType ?? null],
  );
  await audit(req, 'responses.cleared', { surveyId, dataType, count: rowCount }, req.params.id);
  res.status(204).end();
});

/** Lets the client record exports (the workbook itself is built in the browser). */
studiesRouter.post('/:id/audit', async (req, res) => {
  const action = String(req.body?.action ?? '');
  if (!/^[a-z_.]{3,40}$/.test(action)) return res.status(400).json({ error: 'Invalid action' });
  await audit(req, action, typeof req.body?.detail === 'object' ? req.body.detail : {}, req.params.id);
  res.status(204).end();
});
