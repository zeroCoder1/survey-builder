// Public, unauthenticated endpoints used by respondents. They expose only one survey's questions —
// never the org directory, other surveys or any responses.
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { validateSubmission } from '../src/model.js';
import type { Study, Survey } from '../src/types.js';
import { query, tx } from './db.js';
import { insertResponses } from './studies.js';

const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

async function findByToken(token: string): Promise<{ study: Study; survey: Survey } | null> {
  if (!TOKEN_RE.test(token)) return null;
  const { rows } = await query<{ id: string; data: Study }>(`SELECT id, data FROM studies WHERE data->'surveys' @> $1::jsonb LIMIT 1`, [
    JSON.stringify([{ formToken: token }]),
  ]);
  if (!rows[0]) return null;
  const study = { ...rows[0].data, id: rows[0].id };
  const survey = study.surveys.find((s) => s.formToken === token);
  return survey ? { study, survey } : null;
}

const submitLimiter = rateLimit({
  windowMs: 10 * 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many submissions from this network. Please try again later.' },
});

export const formsRouter = Router();

formsRouter.get('/:token', async (req, res) => {
  const found = await findByToken(String(req.params.token));
  if (!found) return res.status(404).json({ error: 'This survey link is not valid.' });
  const { study, survey } = found;
  const { formToken: _t, respondents: _r, identityCode: _i, ...publicSurvey } = survey;
  res.json({
    study: { title: study.title, intro: study.intro, consentText: study.consentText ?? '' },
    survey: publicSurvey,
    accepting: survey.acceptingResponses !== false,
  });
});

formsRouter.post('/:token/responses', submitLimiter, async (req, res) => {
  const found = await findByToken(String(req.params.token));
  if (!found) return res.status(404).json({ error: 'This survey link is not valid.' });
  const { study, survey } = found;
  if (survey.acceptingResponses === false) return res.status(403).json({ error: 'This survey is closed.' });
  if (study.consentText?.trim() && req.body?.consent !== true) return res.status(400).json({ error: 'Please confirm the privacy notice.' });

  const { errors, answers, roster } = validateSubmission(survey, req.body?.answers, req.body?.roster);
  if (Object.keys(errors).length) return res.status(400).json({ error: 'Some answers need attention.', errors });

  const [created] = await tx((client) =>
    insertResponses(client, study, [{ surveyId: survey.id, dataType: 'LIVE', answers, roster, consentedAt: study.consentText?.trim() ? new Date() : null }]),
  );
  res.status(201).json({ responseId: created.responseId });
});
