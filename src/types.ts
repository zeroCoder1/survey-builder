export type QType = 'single' | 'multi' | 'likert' | 'scale' | 'yesno' | 'text' | 'longtext' | 'number';

export const QTYPE_LABELS: Record<QType, string> = {
  likert: 'Agreement scale (1–5)',
  scale: 'Rating scale (custom)',
  single: 'Single choice',
  multi: 'Multiple choice (pick N)',
  yesno: 'Yes / No',
  text: 'Short answer',
  longtext: 'Long answer',
  number: 'Number',
};

export const LIKERT_LABELS = ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'];

export interface Question {
  id: string;
  /** Column header in the export, e.g. EMP-P1 */
  code: string;
  text: string;
  type: QType;
  options: string[];
  /** multi: how many to pick */
  pickCount?: number;
  /** multi: true = exactly pickCount, false = up to pickCount */
  pickExact?: boolean;
  /** scale */
  scaleMin?: number;
  scaleMax?: number;
  /** scale: labels keyed by point value, e.g. { "1": "Very unlikely", "5": "Very likely" } */
  scaleLabels?: Record<string, string>;
  /** number */
  min?: number;
  max?: number;
  required: boolean;
  helpText?: string;
  /** Only show when another question (by code) has this answer */
  showIf?: { code: string; equals: string };
  /** Optional override for the export column header (defaults to code) */
  exportHeader?: string;
}

export interface RosterConfig {
  /** Export sheet name, e.g. MGR_TEAM */
  sheetName: string;
  /** Code of the parent question whose answer links rows back (e.g. MGR-P4) */
  parentKeyCode: string;
  /** Header for the link column, e.g. "Manager code" */
  parentKeyHeader: string;
  /** Header for each row's key, e.g. "Employee code (direct report)" */
  itemKeyHeader: string;
  /** Respondent-facing noun, e.g. "direct report" */
  itemLabel: string;
}

export interface Section {
  id: string;
  title: string;
  /** Letter used when auto-numbering codes, e.g. P, E, C */
  letter: string;
  kind: 'standard' | 'roster';
  roster?: RosterConfig;
  questions: Question[];
}

/** One person in the study's org directory. */
export interface Person {
  id: string;
  /** Employee code, e.g. E0042 — what gets written into identity / roster columns */
  code: string;
  name: string;
  /** Code of this person's manager ('' for the top of the tree) */
  managerCode: string;
  division: string;
  band: string;
  category: string;
  /** Free-text role, e.g. "Account manager" */
  role: string;
}

/** Who takes a survey when simulating from the org directory. */
export type Respondents = 'everyone' | 'managers' | `role:${string}`;

export interface Survey {
  id: string;
  /** Who answers this survey (used for org-based simulation) */
  respondents?: Respondents;
  /** Code of the question that holds the respondent's own code (e.g. EMP-P5) */
  identityCode?: string;
  /** Unguessable token used in the public form link; assigned by the server */
  formToken?: string;
  /** When false, the form is closed and new submissions are rejected (default: open) */
  acceptingResponses?: boolean;
  /** Code prefix and Response ID prefix, e.g. EMP */
  code: string;
  title: string;
  audience: string;
  description: string;
  /** Export sheet name */
  sheetName: string;
  sections: Section[];
}

export interface Study {
  id: string;
  title: string;
  intro: string;
  /** Extra README lines written into the export's README sheet */
  readmeNotes: string;
  /** Privacy / consent notice; when set, respondents must agree before submitting */
  consentText?: string;
  surveys: Survey[];
  /** Optional org directory (names, codes, reporting lines) */
  org?: Person[];
  createdAt?: string;
  updatedAt?: string;
}

export type AnswerValue = string | number | string[] | null | undefined;

export interface RosterRow {
  key: string;
  /** Name of the person in this row (named simulation only) */
  name?: string;
  answers: Record<string, AnswerValue>;
}

export interface SurveyResponse {
  id: string;
  studyId: string;
  surveyId: string;
  responseId: string;
  submittedAt: string;
  dataType: 'LIVE' | 'SIMULATED';
  /** keyed by question id */
  answers: Record<string, AnswerValue>;
  /** keyed by roster section id */
  roster: Record<string, RosterRow[]>;
  /** Org directory code of the respondent, when the response is linked to a person */
  personCode?: string;
  /** Respondent's name, captured when the response was created (absent = anonymous) */
  personName?: string;
}

export interface StudySummary {
  id: string;
  title: string;
  updatedAt: string;
  surveyCount: number;
  responseCount: number;
}
