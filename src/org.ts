// Org directory helpers: sample-org generator, paste-from-Excel parser, tree helpers, and respondent selection.
import { allQuestions, uid } from './model';
import type { Person, Respondents, Survey } from './types';

export const ORG_COLUMNS: Array<[keyof Person, string]> = [
  ['code', 'Employee code'],
  ['name', 'Name'],
  ['managerCode', 'Manager code'],
  ['division', 'Division'],
  ['band', 'Band'],
  ['category', 'Category'],
  ['role', 'Role'],
];

export const emptyPerson = (patch: Partial<Person> = {}): Person => ({
  id: uid(),
  code: '',
  name: '',
  managerCode: '',
  division: '',
  band: '',
  category: '',
  role: '',
  ...patch,
});

/** Map of manager code → direct reports. */
export function childrenMap(org: Person[]): Map<string, Person[]> {
  const m = new Map<string, Person[]>();
  for (const p of org) {
    const k = p.managerCode || '';
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(p);
  }
  return m;
}

/** People at the top of the tree (no manager, or a manager code not in the directory). */
export function roots(org: Person[]): Person[] {
  const codes = new Set(org.map((p) => p.code));
  return org.filter((p) => !p.managerCode || !codes.has(p.managerCode));
}

export function respondentsFor(survey: Survey): Respondents {
  if (survey.respondents) return survey.respondents;
  if (survey.sections.some((s) => s.kind === 'roster')) return 'managers';
  if (/account manager/i.test(`${survey.title} ${survey.audience}`)) return 'role:Account manager';
  return 'everyone';
}

/** The question that stores the respondent's own code (explicit setting, else the first text question mentioning "code"). */
export function identityCodeFor(survey: Survey): string {
  if (survey.identityCode !== undefined) return survey.identityCode;
  const qs = survey.sections.filter((s) => s.kind !== 'roster').flatMap((s) => s.questions);
  return qs.find((q) => q.type === 'text' && /code/i.test(q.text))?.code ?? '';
}

export function eligiblePeople(survey: Survey, org: Person[]): Person[] {
  const who = respondentsFor(survey);
  if (who === 'everyone') return org;
  if (who === 'managers') {
    const mgrs = new Set(org.map((p) => p.managerCode).filter(Boolean));
    return org.filter((p) => mgrs.has(p.code));
  }
  const role = who.slice(5).toLowerCase();
  return org.filter((p) => p.role.toLowerCase() === role);
}

export function respondentsLabel(r: Respondents): string {
  return r === 'everyone' ? 'Everyone' : r === 'managers' ? 'People managers' : `Role: ${r.slice(5)}`;
}

/** Parse rows pasted from Excel/CSV. Accepts an optional header row; columns follow ORG_COLUMNS order. */
export function parsePastedOrg(text: string): Person[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const split = (l: string) => (l.includes('\t') ? l.split('\t') : l.split(',')).map((c) => c.trim());
  let order = ORG_COLUMNS.map(([k]) => k);
  const first = split(lines[0]).map((c) => c.toLowerCase());
  if (first.some((c) => /code|name/.test(c))) {
    order = first.map((h) => {
      if (/manager/.test(h)) return 'managerCode';
      if (/code|id/.test(h)) return 'code';
      if (/name/.test(h)) return 'name';
      if (/div|function/.test(h)) return 'division';
      if (/band|grade/.test(h)) return 'band';
      if (/categ/.test(h)) return 'category';
      if (/role|title/.test(h)) return 'role';
      return 'id';
    }) as Array<keyof Person>;
    lines.shift();
  }
  return lines.map((l) => {
    const p = emptyPerson();
    split(l).forEach((v, i) => {
      const k = order[i];
      if (k && k !== 'id') (p as unknown as Record<string, string>)[k] = v;
    });
    return p;
  });
}

const FIRST = ['Aiko', 'Arjun', 'Hiroshi', 'Priya', 'Kenji', 'Ananya', 'Yuki', 'Rahul', 'Sakura', 'Vikram', 'Haruto', 'Meera', 'Ren', 'Kavya', 'Takeshi', 'Rohan', 'Emi', 'Sanjay', 'Daichi', 'Nisha', 'Sora', 'Aditya', 'Mei', 'Karthik', 'Riku', 'Divya', 'Kaito', 'Neha', 'Hana', 'Amit', 'Yuto', 'Pooja', 'Asahi', 'Suresh', 'Rina', 'Deepak', 'Kota', 'Lakshmi', 'Mio', 'Varun', 'Alex', 'Sam', 'Jordan', 'Taylor', 'Chris', 'Maria', 'Lena', 'Omar'];
const LAST = ['Tanaka', 'Sharma', 'Suzuki', 'Patel', 'Takahashi', 'Iyer', 'Watanabe', 'Reddy', 'Ito', 'Nair', 'Yamamoto', 'Gupta', 'Nakamura', 'Rao', 'Kobayashi', 'Menon', 'Kato', 'Joshi', 'Yoshida', 'Kulkarni', 'Yamada', 'Das', 'Sasaki', 'Bose', 'Matsumoto', 'Pillai', 'Inoue', 'Mehta', 'Kimura', 'Verma', 'Hayashi', 'Shetty', 'Mori', 'Chopra', 'Ikeda', 'Kapoor', 'Fischer', 'Silva', 'Novak', 'Khan'];

export interface SampleOrgOptions {
  employees: number;
  span: number;
  accountManagers: number;
  divisions: string[];
}

export const DEFAULT_SAMPLE: SampleOrgOptions = {
  employees: 300,
  span: 6,
  accountManagers: 40,
  divisions: ['Division 1', 'Division 2', 'Division 3', 'Division 4', 'Division 5', 'Corporate / support'],
};

/** Builds a plausible org tree: CEO → division heads → people managers → team members. */
export function generateSampleOrg(opts: SampleOrgOptions = DEFAULT_SAMPLE): Person[] {
  const rand = (n: number) => Math.floor(Math.random() * n);
  const pick = <T,>(a: T[]) => a[rand(a.length)];
  const used = new Set<string>();
  const name = () => {
    for (let i = 0; i < 50; i++) {
      const n = `${pick(FIRST)} ${pick(LAST)}`;
      if (!used.has(n)) return used.add(n), n;
    }
    return `${pick(FIRST)} ${pick(LAST)} ${used.size}`;
  };
  let seq = 0;
  const code = () => `E${String(++seq).padStart(4, '0')}`;
  const org: Person[] = [];
  const add = (p: Partial<Person>) => {
    const person = emptyPerson({ code: code(), name: name(), ...p });
    org.push(person);
    return person;
  };

  const ceo = add({ division: 'Corporate / support', band: 'Band 5', category: 'Management', role: 'CEO' });
  const divs = opts.divisions.length ? opts.divisions : ['Division 1'];
  const heads = divs.map((d) => add({ managerCode: ceo.code, division: d, band: 'Band 5', category: 'Management', role: 'Division head' }));
  const remaining = Math.max(0, opts.employees - org.length);
  const span = Math.max(2, opts.span);
  const managersNeeded = Math.max(divs.length, Math.round(remaining / (span + 1)));
  const managers: Person[] = [];
  for (let i = 0; i < managersNeeded; i++) {
    const head = heads[i % heads.length];
    managers.push(add({ managerCode: head.code, division: head.division, band: pick(['Band 3', 'Band 4']), category: 'Management', role: 'Manager' }));
  }
  const cats = ['Technical / Engineering', 'Technical / Engineering', 'Technical / Engineering', 'Sales', 'Support'];
  while (org.length < opts.employees) {
    const mgr = managers[rand(managers.length)];
    add({ managerCode: mgr.code, division: mgr.division, band: pick(['Band 1', 'Band 1', 'Band 2', 'Band 2', 'Band 3']), category: pick(cats), role: 'Engineer' });
  }
  // Account managers: prefer Sales people, then anyone non-management
  const pool = [...org.filter((p) => p.category === 'Sales'), ...org.filter((p) => p.role === 'Engineer' && p.category !== 'Sales')];
  for (const p of pool.slice(0, opts.accountManagers)) {
    p.role = 'Account manager';
    p.category = 'Sales';
  }
  for (const p of org) if (p.role === 'Engineer') p.role = p.category === 'Technical / Engineering' ? 'Engineer' : p.category === 'Sales' ? 'Sales' : 'Specialist';
  return org;
}

/** Question codes that, in org mode, are filled from the person rather than randomly. */
export function linkedQuestionCodes(survey: Survey, org: Person[]): string[] {
  const id = identityCodeFor(survey);
  const values = new Set(org.flatMap((p) => [p.division, p.band, p.category, p.role]).filter(Boolean));
  const out = allQuestions(survey)
    .filter((q) => q.type === 'single' && q.options.some((o) => values.has(o)))
    .map((q) => q.code);
  if (id) out.unshift(id);
  return out;
}
