// Ready-made questions and the bulk-paste parser used by the builder's "Add question" menu.
import type { IconName } from './components/Icon';
import { newQuestion } from './model';
import type { Question, QType } from './types';

export const TYPE_ICONS: Record<QType, IconName> = {
  likert: 'agree',
  scale: 'bars',
  single: 'radio',
  multi: 'checkbox',
  yesno: 'toggle',
  text: 'shortText',
  longtext: 'longText',
  number: 'hash',
};

export interface Preset {
  id: string;
  label: string;
  hint: string;
  icon: IconName;
  build: (code: string, ctx: { divisions: string[] }) => Question;
}

const make = (type: QType, code: string, patch: Partial<Question>): Question => ({ ...newQuestion(type, code), ...patch });

export const PRESETS: Preset[] = [
  {
    id: 'agree',
    label: 'Agreement statement',
    hint: 'Strongly disagree to Strongly agree',
    icon: 'agree',
    build: (code) => make('likert', code, { text: '' }),
  },
  {
    id: 'satisfaction',
    label: 'Satisfaction 1–5',
    hint: 'Very dissatisfied to Very satisfied',
    icon: 'bars',
    build: (code) =>
      make('scale', code, {
        text: 'How satisfied are you with …?',
        scaleMin: 1,
        scaleMax: 5,
        scaleLabels: { '1': 'Very dissatisfied', '3': 'Neutral', '5': 'Very satisfied' },
      }),
  },
  {
    id: 'recommend',
    label: 'Likelihood to recommend 0–10',
    hint: 'Net Promoter-style question',
    icon: 'bars',
    build: (code) =>
      make('scale', code, {
        text: 'How likely are you to recommend us to a friend or colleague?',
        scaleMin: 0,
        scaleMax: 10,
        scaleLabels: { '0': 'Not at all likely', '10': 'Extremely likely' },
      }),
  },
  {
    id: 'top3',
    label: 'Pick the top 3',
    hint: 'Multiple choice, exactly 3',
    icon: 'checkbox',
    build: (code) =>
      make('multi', code, { text: 'Which THREE of these matter most to you? (pick 3)', options: ['Option 1', 'Option 2', 'Option 3', 'Option 4'], pickCount: 3, pickExact: true }),
  },
  {
    id: 'division',
    label: 'Division / function',
    hint: 'Options from your People list',
    icon: 'radio',
    build: (code, { divisions }) =>
      make('single', code, { text: 'Which division / function do you work in?', options: divisions.length ? divisions : ['Division 1', 'Division 2'] }),
  },
  {
    id: 'comment',
    label: 'Open comment',
    hint: 'Optional long answer',
    icon: 'longText',
    build: (code) => make('longtext', code, { text: 'Anything else you would like to share? (optional)', required: false }),
  },
];

export interface ParsedQuestion {
  text: string;
  options: string[];
  type: QType;
  pickCount?: number;
}

const OPTION_LINE = /^\s*(?:[-*•–]|\d+[.)]|[a-z][.)])\s+/i;

/**
 * Turns pasted text into questions. Each plain line is a question; lines that start with a bullet,
 * number or letter (or are indented) become the options of the question above. Questions with options
 * become single choice, or multiple choice when the text says "pick N" / "select all".
 */
export function parseBulkQuestions(text: string, defaultType: QType): ParsedQuestion[] {
  const out: ParsedQuestion[] = [];
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const isOption = OPTION_LINE.test(raw) || /^\s{2,}|\t/.test(raw);
    const clean = raw.replace(OPTION_LINE, '').trim();
    if (isOption && out.length) out[out.length - 1].options.push(clean);
    else out.push({ text: clean.replace(/^Q?\d+[.)]\s*/i, ''), options: [], type: defaultType });
  }
  for (const q of out) {
    if (!q.options.length) continue;
    const pick = q.text.match(/pick\s+(?:up to\s+)?(\d+|one|two|three|four|five)|select all|choose\s+(\d+)/i);
    if (pick) {
      const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
      const n = pick[1] ? Number(pick[1]) || words[pick[1].toLowerCase()] : pick[2] ? Number(pick[2]) : undefined;
      q.type = 'multi';
      q.pickCount = n ?? q.options.length;
    } else q.type = 'single';
  }
  return out;
}
