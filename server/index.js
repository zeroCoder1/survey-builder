// Minimal JSON-file backed API for studies (survey definitions) and responses.
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DB_FILE = process.env.DB_FILE || path.join(ROOT, 'data', 'db.json');
const PORT = Number(process.env.NODE_ENV === 'production' ? process.env.PORT || 3001 : process.env.API_PORT || 3001);

function load() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return { studies: [], responses: [] };
  }
}
let db = load();
function save() {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_FILE);
}

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const today = () => new Date().toISOString().slice(0, 10);

const app = express();
app.use(express.json({ limit: '25mb' }));

const findStudy = (id) => db.studies.find((s) => s.id === id);

app.get('/api/studies', (_req, res) => {
  res.json(
    db.studies.map((s) => ({
      id: s.id,
      title: s.title,
      updatedAt: s.updatedAt,
      surveyCount: s.surveys.length,
      responseCount: db.responses.filter((r) => r.studyId === s.id).length,
    })),
  );
});

app.post('/api/studies', (req, res) => {
  const now = new Date().toISOString();
  const study = { ...req.body, id: uid(), createdAt: now, updatedAt: now };
  db.studies.push(study);
  save();
  res.status(201).json(study);
});

app.get('/api/studies/:id', (req, res) => {
  const s = findStudy(req.params.id);
  if (!s) return res.status(404).json({ error: 'Study not found' });
  res.json(s);
});

app.put('/api/studies/:id', (req, res) => {
  const i = db.studies.findIndex((s) => s.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Study not found' });
  db.studies[i] = { ...req.body, id: req.params.id, createdAt: db.studies[i].createdAt, updatedAt: new Date().toISOString() };
  save();
  res.json(db.studies[i]);
});

app.delete('/api/studies/:id', (req, res) => {
  db.studies = db.studies.filter((s) => s.id !== req.params.id);
  db.responses = db.responses.filter((r) => r.studyId !== req.params.id);
  save();
  res.status(204).end();
});

app.get('/api/studies/:id/responses', (req, res) => {
  res.json(db.responses.filter((r) => r.studyId === req.params.id));
});

// Accepts one response or { batch: [...] }. Assigns sequential Response IDs per survey (e.g. EMP-R001).
app.post('/api/studies/:id/responses', (req, res) => {
  const study = findStudy(req.params.id);
  if (!study) return res.status(404).json({ error: 'Study not found' });
  const items = Array.isArray(req.body?.batch) ? req.body.batch : [req.body];
  const created = [];
  for (const item of items) {
    const survey = study.surveys.find((s) => s.id === item.surveyId);
    if (!survey) return res.status(400).json({ error: 'Unknown survey' });
    const prefix = `${survey.code}-R`;
    const maxN = db.responses
      .filter((r) => r.studyId === study.id && r.surveyId === survey.id && r.responseId.startsWith(prefix))
      .reduce((m, r) => Math.max(m, parseInt(r.responseId.slice(prefix.length), 10) || 0), 0);
    const r = {
      id: uid(),
      studyId: study.id,
      surveyId: survey.id,
      responseId: `${prefix}${String(maxN + 1).padStart(3, '0')}`,
      submittedAt: item.submittedAt || today(),
      dataType: item.dataType === 'SIMULATED' ? 'SIMULATED' : 'LIVE',
      answers: item.answers || {},
      roster: item.roster || {},
      ...(item.personCode ? { personCode: String(item.personCode) } : {}),
      ...(item.personName ? { personName: String(item.personName) } : {}),
    };
    db.responses.push(r);
    created.push(r);
  }
  save();
  res.status(201).json(created);
});

app.delete('/api/studies/:id/responses/:rid', (req, res) => {
  db.responses = db.responses.filter((r) => !(r.studyId === req.params.id && r.id === req.params.rid));
  save();
  res.status(204).end();
});

// Bulk clear, optionally filtered by surveyId and/or dataType.
app.delete('/api/studies/:id/responses', (req, res) => {
  const { surveyId, dataType } = req.query;
  db.responses = db.responses.filter(
    (r) =>
      !(
        r.studyId === req.params.id &&
        (!surveyId || r.surveyId === surveyId) &&
        (!dataType || r.dataType === dataType)
      ),
  );
  save();
  res.status(204).end();
});

if (process.env.NODE_ENV === 'production') {
  const dist = path.join(ROOT, 'dist');
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));
