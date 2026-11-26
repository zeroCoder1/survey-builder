// Builds the survey-data workbook:
//   README sheet, then one sheet per survey (DATA_TYPE | Response ID | Date submitted | <question codes>),
//   with each roster section ("for each direct report") as its own long-format sheet right after its survey.
import ExcelJS from 'exceljs';
import { allQuestions, isEmpty } from './model';
import type { AnswerValue, Question, Section, Study, Survey, SurveyResponse } from './types';

export interface ExportOptions {
  /** Which data types to include. */
  dataTypes: Array<'LIVE' | 'SIMULATED'>;
  /** Headers only, no rows (a blank template for form-tool imports). */
  blank?: boolean;
}

export interface SheetPlan {
  name: string;
  headers: string[];
  rows: Array<Array<string | number | null>>;
  kind: 'survey' | 'roster' | 'org';
  survey?: Survey;
}

const header = (q: Question) => (q.exportHeader?.trim() ? q.exportHeader.trim() : q.code);

/** Converts a stored answer into the cell value used in the export. */
export function cellValue(q: Question, v: AnswerValue): string | number | null {
  if (isEmpty(v)) return null;
  if (Array.isArray(v)) return v.join('; ');
  if (q.type === 'likert' || q.type === 'scale' || q.type === 'number') {
    const n = Number(v);
    return Number.isNaN(n) ? String(v) : n;
  }
  return String(v);
}

const safeSheetName = (s: string, used: Set<string>) => {
  let base = (s || 'Sheet').replace(/[\\/?*[\]:]/g, '_').slice(0, 31);
  let name = base;
  let i = 2;
  while (used.has(name.toLowerCase())) name = `${base.slice(0, 28)}_${i++}`;
  used.add(name.toLowerCase());
  return name;
};

export function planSheets(study: Study, responses: SurveyResponse[], opts: ExportOptions): SheetPlan[] {
  const used = new Set<string>(['readme']);
  const plans: SheetPlan[] = [];

  for (const survey of study.surveys) {
    const standard = survey.sections.filter((s) => s.kind !== 'roster');
    const rosters = survey.sections.filter((s) => s.kind === 'roster');
    const qs = standard.flatMap((s) => s.questions);
    if (qs.length === 0 && rosters.length === 0) continue;

    const rs = opts.blank
      ? []
      : responses
          .filter((r) => r.surveyId === survey.id && opts.dataTypes.includes(r.dataType))
          .sort((a, b) => a.responseId.localeCompare(b.responseId, undefined, { numeric: true }));

    // Named (non-anonymous) responses add a "Respondent name" column; fully anonymous exports keep the original layout.
    const named = rs.some((r) => r.personName);
    plans.push({
      name: safeSheetName(survey.sheetName || survey.code, used),
      kind: 'survey',
      survey,
      headers: ['DATA_TYPE', 'Response ID', 'Date submitted', ...(named ? ['Respondent name'] : []), ...qs.map(header)],
      rows: rs.map((r) => [
        r.dataType,
        r.responseId,
        r.submittedAt,
        ...(named ? [r.personName ?? null] : []),
        ...qs.map((q) => cellValue(q, r.answers[q.id])),
      ]),
    });

    for (const sec of rosters) plans.push(rosterPlan(survey, sec, rs, used));
  }

  // The org directory (names + reporting lines) goes in its own lookup sheet; survey sheets carry codes (plus names when not anonymous).
  const org = study.org ?? [];
  if (org.length) {
    const names = new Map(org.map((p) => [p.code, p.name]));
    plans.push({
      name: safeSheetName('ORG', used),
      kind: 'org',
      headers: ['Employee code', 'Name', 'Manager code', 'Manager name', 'Division', 'Band', 'Category', 'Role'],
      rows: org.map((p) => [p.code, p.name, p.managerCode || null, names.get(p.managerCode) ?? null, p.division || null, p.band || null, p.category || null, p.role || null]),
    });
  }
  return plans;
}

/** "Manager code" → "Manager name"; "Employee code (direct report)" → "Employee name (direct report)". */
const nameHeader = (h: string) => (/code/i.test(h) ? h.replace(/code/i, 'name') : `${h} name`);

function rosterPlan(survey: Survey, sec: Section, rs: SurveyResponse[], used: Set<string>): SheetPlan {
  const cfg = sec.roster!;
  const parentQ = allQuestions(survey).find((q) => q.code === cfg.parentKeyCode);
  const parentHeader = cfg.parentKeyHeader || 'Parent code';
  const itemHeader = cfg.itemKeyHeader || 'Item code';
  const named = rs.some((r) => r.personName || (r.roster[sec.id] || []).some((i) => i.name));
  const rows: SheetPlan['rows'] = [];
  for (const r of rs) {
    const parentKey = parentQ ? cellValue(parentQ, r.answers[parentQ.id]) : r.responseId;
    for (const item of r.roster[sec.id] || []) {
      rows.push([
        r.dataType,
        parentKey ?? r.responseId,
        ...(named ? [r.personName ?? null] : []),
        item.key,
        ...(named ? [item.name ?? null] : []),
        ...sec.questions.map((q) => cellValue(q, item.answers[q.id])),
      ]);
    }
  }
  return {
    name: safeSheetName(cfg.sheetName || `${survey.code}_${sec.letter}`, used),
    kind: 'roster',
    survey,
    headers: [
      'DATA_TYPE',
      parentHeader,
      ...(named ? [nameHeader(parentHeader)] : []),
      itemHeader,
      ...(named ? [nameHeader(itemHeader)] : []),
      ...sec.questions.map(header),
    ],
    rows,
  };
}

function readmeLines(study: Study, plans: SheetPlan[], opts: ExportOptions): string[] {
  const hasSim = !opts.blank && opts.dataTypes.includes('SIMULATED') && plans.some((p) => p.rows.some((r) => r[0] === 'SIMULATED'));
  const lines: string[] = ['NOTICE'];
  if (opts.blank) {
    lines.push('BLANK TEMPLATE - NO RESPONSES.', `Column layout for ${study.title}. Paste or import form exports using the same column names.`);
  } else if (hasSim) {
    lines.push(
      'CONTAINS SIMULATED DATA - NOT FROM A REAL SURVEY. Rows are flagged in the DATA_TYPE column.',
      'Do not report simulated figures as survey findings. If used in a submission, disclose clearly that the data are simulated.',
    );
  } else {
    lines.push(`Survey responses for ${study.title}.`);
  }
  lines.push(...study.readmeNotes.split('\n').map((l) => l.trim()).filter(Boolean));
  const sheetList = plans
    .map((p) => (p.kind === 'survey' ? `${p.name} (n=${p.rows.length})` : p.kind === 'org' ? `${p.name} (org directory, ${p.rows.length} people)` : p.name))
    .join(', ');
  const skipped = study.surveys.filter((s) => s.sections.every((sec) => sec.questions.length === 0)).map((s) => s.title);
  lines.push(
    `Sheets: ${sheetList}.${skipped.length ? ` Not included (no questions): ${skipped.join(', ')}.` : ''}`,
    `Exported ${new Date().toISOString().slice(0, 10)}.`,
  );
  return lines;
}

export async function buildWorkbook(study: Study, responses: SurveyResponse[], opts: ExportOptions): Promise<ExcelJS.Workbook> {
  const plans = planSheets(study, responses, opts);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Survey Builder';
  wb.created = new Date();

  const readme = wb.addWorksheet('README');
  readme.getColumn(1).width = 140;
  for (const line of readmeLines(study, plans, opts)) readme.addRow([line]);

  for (const p of plans) {
    const ws = wb.addWorksheet(p.name, { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] });
    ws.addRow(p.headers);
    for (const r of p.rows) ws.addRow(r);
    ws.columns.forEach((c, i) => (c.width = i === 1 ? 13 : 16));
  }
  return wb;
}

export async function downloadWorkbook(study: Study, responses: SurveyResponse[], opts: ExportOptions) {
  const wb = await buildWorkbook(study, responses, opts);
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const tag = opts.blank ? 'TEMPLATE' : opts.dataTypes.length === 1 ? opts.dataTypes[0] : 'ALL';
  const base = study.title.replace(/[^\w]+/g, '_').replace(/^_|_$/g, '').slice(0, 60) || 'Survey';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${base}_${tag}_Survey_Data.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
