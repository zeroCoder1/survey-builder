import { LIKERT_LABELS, type AnswerValue, type Question, type QType, type RosterRow, type Section, type Study, type Survey } from './types';

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function newQuestion(type: QType = 'likert', code = ''): Question {
  const q: Question = { id: uid(), code, text: '', type, options: [], required: true };
  return normalizeForType(q, type);
}

/** Fill in sensible defaults when a question's type changes. */
export function normalizeForType(q: Question, type: QType): Question {
  const next: Question = { ...q, type };
  if ((type === 'single' || type === 'multi') && next.options.length === 0) next.options = ['Option 1', 'Option 2'];
  if (type === 'multi') {
    next.pickCount ??= 3;
    next.pickExact ??= true;
  }
  if (type === 'scale') {
    next.scaleMin ??= 1;
    next.scaleMax ??= 5;
    next.scaleLabels ??= { '1': '', '5': '' };
  }
  return next;
}

export function newSection(title = 'New section', letter = 'X', kind: Section['kind'] = 'standard'): Section {
  return {
    id: uid(),
    title,
    letter,
    kind,
    questions: [],
    roster:
      kind === 'roster'
        ? { sheetName: 'TEAM', parentKeyCode: '', parentKeyHeader: 'Parent code', itemKeyHeader: 'Item code', itemLabel: 'item' }
        : undefined,
  };
}

export function newSurvey(code = 'SVY'): Survey {
  return {
    id: uid(),
    code,
    title: 'New survey',
    audience: '',
    description: '',
    sheetName: code,
    sections: [newSection('Profile', 'P')],
  };
}

export function newStudy(): Study {
  return {
    id: '',
    title: 'Untitled study',
    intro: 'Confidential. Please answer for yourself. There are no right or wrong answers.',
    readmeNotes: '',
    surveys: [newSurvey('SVY')],
  };
}

/** Re-assign every question code in a survey as <SURVEY>-<LETTER><n>, numbering continuously per letter. */
export function renumberSurvey(survey: Survey): Survey {
  const counters: Record<string, number> = {};
  const renames: Record<string, string> = {};
  const sections = survey.sections.map((s) => ({
    ...s,
    questions: s.questions.map((q) => {
      const n = (counters[s.letter] = (counters[s.letter] || 0) + 1);
      const code = `${survey.code}-${s.letter}${n}`;
      if (q.code) renames[q.code] = code;
      return { ...q, code };
    }),
  }));
  // keep references (showIf, roster parent key) pointing at the renamed codes
  for (const s of sections) {
    if (s.roster && renames[s.roster.parentKeyCode]) s.roster = { ...s.roster, parentKeyCode: renames[s.roster.parentKeyCode] };
    s.questions = s.questions.map((q) =>
      q.showIf && renames[q.showIf.code] ? { ...q, showIf: { ...q.showIf, code: renames[q.showIf.code] } } : q,
    );
  }
  return { ...survey, sections };
}

export function nextCode(survey: Survey, section: Section): string {
  const re = new RegExp(`^${escapeRe(survey.code)}-${escapeRe(section.letter)}(\\d+)$`);
  let max = 0;
  for (const s of survey.sections) for (const q of s.questions) {
    const m = q.code.match(re);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${survey.code}-${section.letter}${max + 1}`;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function allQuestions(survey: Survey): Question[] {
  return survey.sections.flatMap((s) => s.questions);
}

export function answerToString(v: AnswerValue): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.join('; ');
  return String(v);
}

/** Is this question visible given the answers so far (answers keyed by question id)? */
export function isVisible(q: Question, survey: Survey, answers: Record<string, AnswerValue>): boolean {
  if (!q.showIf || !q.showIf.code) return true;
  const dep = allQuestions(survey).find((x) => x.code === q.showIf!.code);
  if (!dep) return true;
  const v = answers[dep.id];
  if (Array.isArray(v)) return v.includes(q.showIf.equals);
  return answerToString(v) === q.showIf.equals;
}

export function isEmpty(v: AnswerValue): boolean {
  return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
}

/** Returns an error message, or null when the answer is valid. */
export function validateAnswer(q: Question, v: AnswerValue): string | null {
  if (isEmpty(v)) return q.required ? 'This question is required.' : null;
  if (q.type === 'multi' && Array.isArray(v) && q.pickCount) {
    if (q.pickExact && v.length !== q.pickCount) return `Please pick exactly ${q.pickCount}.`;
    if (!q.pickExact && v.length > q.pickCount) return `Please pick at most ${q.pickCount}.`;
  }
  if (q.type === 'number') {
    const n = Number(v);
    if (Number.isNaN(n)) return 'Please enter a number.';
    if (q.min !== undefined && n < q.min) return `Must be at least ${q.min}.`;
    if (q.max !== undefined && n > q.max) return `Must be at most ${q.max}.`;
  }
  return null;
}

export function scalePoints(q: Question): number[] {
  if (q.type === 'likert') return [1, 2, 3, 4, 5];
  const min = q.scaleMin ?? 1;
  const max = q.scaleMax ?? 5;
  const out: number[] = [];
  for (let i = min; i <= max; i++) out.push(i);
  return out;
}

export function scaleLabel(q: Question, point: number): string {
  if (q.type === 'likert') return LIKERT_LABELS[point - 1] ?? '';
  return q.scaleLabels?.[String(point)] ?? '';
}

export function typeSummary(q: Question): string {
  switch (q.type) {
    case 'likert':
      return '1 Strongly disagree … 5 Strongly agree';
    case 'scale': {
      const pts = scalePoints(q);
      return pts
        .filter((p) => scaleLabel(q, p))
        .map((p) => `${p} ${scaleLabel(q, p)}`)
        .join(' … ') || `${pts[0]}–${pts[pts.length - 1]}`;
    }
    case 'yesno':
      return 'Yes / No';
    case 'single':
    case 'multi':
      return q.options.join('; ');
    case 'number':
      return 'Number';
    default:
      return 'Free text';
  }
}

const TEXT_LIMIT = { text: 500, longtext: 5000 } as const;
const ROSTER_LIMIT = 200;

/** Validates one answer's shape and value against the question. Returns an error or null. */
function checkValue(q: Question, v: AnswerValue): string | null {
  switch (q.type) {
    case 'likert':
    case 'scale':
      return typeof v === 'number' && scalePoints(q).includes(v) ? null : 'Choose a point on the scale.';
    case 'yesno':
      return v === 'Yes' || v === 'No' ? null : 'Choose Yes or No.';
    case 'single':
      return typeof v === 'string' && q.options.includes(v) ? null : 'Choose one of the options.';
    case 'multi':
      return Array.isArray(v) && v.every((x) => q.options.includes(x)) && new Set(v).size === v.length ? null : 'Choose from the listed options.';
    case 'number':
      return typeof v === 'number' && Number.isFinite(v) ? null : 'Enter a number.';
    case 'text':
    case 'longtext':
      return typeof v === 'string' && v.length <= TEXT_LIMIT[q.type] ? null : `Keep the answer under ${TEXT_LIMIT[q.type]} characters.`;
  }
}

export interface SubmissionResult {
  /** Keyed by question id, or `${sectionId}:${row}:${questionId|key}` for repeating groups */
  errors: Record<string, string>;
  answers: Record<string, AnswerValue>;
  roster: Record<string, RosterRow[]>;
}

/**
 * Validates and cleans a full submission: drops unknown and hidden questions, trims text,
 * checks types, options, required answers and pick-N rules. Used by both the form and the server.
 */
export function validateSubmission(survey: Survey, rawAnswers: unknown, rawRoster: unknown): SubmissionResult {
  const errors: Record<string, string> = {};
  const answersIn = (rawAnswers && typeof rawAnswers === 'object' ? rawAnswers : {}) as Record<string, AnswerValue>;
  const rosterIn = (rawRoster && typeof rawRoster === 'object' ? rawRoster : {}) as Record<string, unknown>;
  const answers: Record<string, AnswerValue> = {};
  const roster: Record<string, RosterRow[]> = {};
  const tidy = (v: AnswerValue) => (typeof v === 'string' ? v.trim() : v);

  const check = (q: Question, v: AnswerValue, key: string, out: Record<string, AnswerValue>) => {
    const value = tidy(v);
    const err = isEmpty(value) ? validateAnswer(q, value) : checkValue(q, value) ?? validateAnswer(q, value);
    if (err) errors[key] = err;
    else if (!isEmpty(value)) out[q.id] = value;
  };

  for (const sec of survey.sections) {
    if (sec.kind === 'roster') {
      const rows = Array.isArray(rosterIn[sec.id]) ? (rosterIn[sec.id] as unknown[]).slice(0, ROSTER_LIMIT) : [];
      roster[sec.id] = rows.map((raw, i) => {
        const row = (raw && typeof raw === 'object' ? raw : {}) as Partial<RosterRow>;
        const key = typeof row.key === 'string' ? row.key.trim().slice(0, 100) : '';
        if (!key) errors[`${sec.id}:${i}:key`] = 'Required.';
        const out: Record<string, AnswerValue> = {};
        for (const q of sec.questions) check(q, (row.answers ?? {})[q.id], `${sec.id}:${i}:${q.id}`, out);
        return { key, answers: out };
      });
      continue;
    }
    for (const q of sec.questions) {
      if (!isVisible(q, survey, answersIn)) continue;
      check(q, answersIn[q.id], q.id, answers);
    }
  }
  return { errors, answers, roster };
}
