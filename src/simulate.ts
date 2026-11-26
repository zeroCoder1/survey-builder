// Generates plausible SIMULATED responses so analysis and dashboards can be rehearsed before real data arrive.
// Two modes:
//   anonymous – random answers, made-up codes (no link to real people)
//   org       – one response per sampled person in the org directory; identity code, profile answers
//               (division / band / category) and repeating-group rows (direct reports) come from the org tree.
import type { NewResponse } from './api';
import { isVisible, scalePoints } from './model';
import { childrenMap, eligiblePeople, identityCodeFor } from './org';
import type { AnswerValue, Person, Question, RosterRow, Section, Survey } from './types';

const rand = (n: number) => Math.floor(Math.random() * n);
const pick = <T,>(a: T[]): T => a[rand(a.length)];
const shuffle = <T,>(a: T[]): T[] => [...a].sort(() => Math.random() - 0.5);
const pad = (n: number, w: number) => String(n).padStart(w, '0');

/** Weighted towards the middle/upper part of the scale, like typical engagement data. */
function scaleValue(points: number[]): number {
  const w = points.map((_, i) => {
    const x = (i + 0.5) / points.length;
    return Math.exp(-((x - 0.6) ** 2) / 0.08);
  });
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < points.length; i++) if ((r -= w[i]) <= 0) return points[i];
  return points[points.length - 1];
}

const COMMENTS = [
  'More cross-team projects please.',
  'Good initiative, share the results.',
  'Would like clearer promotion criteria.',
  'Workload peaks affect learning time.',
  'Training calendar should be shared earlier.',
];

const isReportCount = (q: Question) => q.type === 'number' && /direct reports/i.test(q.text);

function answerFor(q: Question, idx: number, survey: Survey): AnswerValue {
  switch (q.type) {
    case 'likert':
    case 'scale':
      return scaleValue(scalePoints(q));
    case 'yesno':
      return Math.random() < 0.35 ? 'Yes' : 'No';
    case 'single':
      return q.options.length ? pick(q.options) : null;
    case 'multi':
      return shuffle(q.options).slice(0, q.pickExact ? q.pickCount ?? 1 : 1 + rand(q.pickCount ?? 1));
    case 'number': {
      if (isReportCount(q)) return 3 + rand(7);
      const min = q.min ?? 0;
      const max = q.max ?? Math.max(min + 12, 12);
      return min + rand(max - min + 1);
    }
    case 'text':
      if (/code|name/i.test(q.text)) return `${survey.code.slice(0, 2)}${pad(idx + 1, 4)}`;
      return q.required ? `Sample answer ${idx + 1}` : Math.random() < 0.4 ? pick(COMMENTS) : null;
    case 'longtext':
      return q.required || Math.random() < 0.4 ? pick(COMMENTS) : null;
  }
}

function rosterRows(sec: Section, idx: number, survey: Survey, people: Array<{ key: string; name?: string }>): RosterRow[] {
  return people.map(({ key, name }) => ({
    key,
    ...(name ? { name } : {}),
    answers: Object.fromEntries(sec.questions.map((q) => [q.id, answerFor(q, idx, survey)])),
  }));
}

function randomDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - rand(14));
  return d.toISOString().slice(0, 10);
}

function build(survey: Survey, idx: number, person?: Person, reports: Person[] = []): NewResponse {
  const standard = survey.sections.filter((s) => s.kind !== 'roster');
  const answers: Record<string, AnswerValue> = {};
  for (const s of standard) for (const q of s.questions) answers[q.id] = answerFor(q, idx, survey);

  if (person) {
    const idCode = identityCodeFor(survey);
    const attrs = [person.division, person.band, person.category, person.role].filter(Boolean);
    for (const s of standard)
      for (const q of s.questions) {
        if (q.code === idCode) answers[q.id] = person.code;
        else if (q.type === 'single') {
          const match = q.options.find((o) => attrs.includes(o));
          if (match) answers[q.id] = match;
        }
        if (isReportCount(q)) answers[q.id] = reports.length;
      }
  }

  // keep "number of direct reports" and the repeating group in agreement
  const countQ = standard.flatMap((s) => s.questions).find(isReportCount);
  const roster: Record<string, RosterRow[]> = {};
  for (const s of survey.sections.filter((s) => s.kind === 'roster')) {
    const people = person
      ? reports.map((r) => ({ key: r.code, name: r.name }))
      : Array.from({ length: countQ ? Number(answers[countQ.id]) || 0 : 3 + rand(7) }, () => ({ key: `E${pad(1 + rand(400), 4)}` }));
    roster[s.id] = rosterRows(s, idx, survey, people);
  }

  // clear answers hidden by skip logic
  for (const s of standard) for (const q of s.questions) if (!isVisible(q, survey, answers)) answers[q.id] = null;

  return { surveyId: survey.id, dataType: 'SIMULATED', submittedAt: randomDate(), answers, roster, personCode: person?.code, personName: person?.name || undefined };
}

const byDate = (a: NewResponse, b: NewResponse) => (a.submittedAt! < b.submittedAt! ? -1 : 1);

export function simulateAnonymous(survey: Survey, count: number, startIndex = 0): NewResponse[] {
  return Array.from({ length: count }, (_, i) => build(survey, startIndex + i)).sort(byDate);
}

/**
 * One response per sampled person. People who already have a response to this survey are skipped,
 * so repeated runs top up towards the chosen response rate.
 */
export function simulateFromOrg(survey: Survey, org: Person[], responseRate: number, alreadyResponded: Set<string>): NewResponse[] {
  const eligible = eligiblePeople(survey, org);
  const target = Math.round(eligible.length * Math.min(1, Math.max(0, responseRate)));
  const need = Math.max(0, target - eligible.filter((p) => alreadyResponded.has(p.code)).length);
  const pool = shuffle(eligible.filter((p) => !alreadyResponded.has(p.code))).slice(0, need);
  const kids = childrenMap(org);
  return pool.map((p, i) => build(survey, i, p, kids.get(p.code) ?? [])).sort(byDate);
}
