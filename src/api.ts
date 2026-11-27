import type { Study, StudySummary, Survey, SurveyResponse } from './types';

export type NewResponse = Pick<SurveyResponse, 'surveyId' | 'answers' | 'roster'> &
  Partial<Pick<SurveyResponse, 'dataType' | 'submittedAt' | 'personCode' | 'personName'>>;

interface Api {
  listStudies(): Promise<StudySummary[]>;
  getStudy(id: string): Promise<Study>;
  createStudy(s: Omit<Study, 'id'>): Promise<Study>;
  saveStudy(s: Study): Promise<Study>;
  deleteStudy(id: string): Promise<void>;
  listResponses(id: string): Promise<SurveyResponse[]>;
  submitResponse(id: string, r: NewResponse): Promise<SurveyResponse[]>;
  submitBatch(id: string, batch: NewResponse[]): Promise<SurveyResponse[]>;
  deleteResponse(id: string, rid: string): Promise<void>;
  clearResponses(id: string, filter?: { surveyId?: string; dataType?: string }): Promise<void>;
}

/** True for static builds (e.g. GitHub Pages) where there is no API server and data lives in the browser. */
export const LOCAL_MODE = import.meta.env.VITE_STORAGE === 'local';

// ---------------------------------------------------------------------------------------------
// HTTP: talks to server/index.js

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errors?: Record<string, string>,
  ) {
    super(message);
  }
}

/** Fired when the server says the session is missing or expired. */
export const AUTH_REQUIRED_EVENT = 'survey-builder:auth-required';

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: { 'X-Requested-With': 'survey-builder', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const msg = await res.json().catch(() => ({}));
    if (res.status === 401 && !url.startsWith('/api/auth/')) window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT));
    throw new ApiError(msg.error || `Request failed (${res.status})`, res.status, msg.errors);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

const httpApi: Api = {
  listStudies: () => req('GET', '/api/studies'),
  getStudy: (id) => req('GET', `/api/studies/${id}`),
  createStudy: (s) => req('POST', '/api/studies', s),
  saveStudy: (s) => req('PUT', `/api/studies/${s.id}`, s),
  deleteStudy: (id) => req('DELETE', `/api/studies/${id}`),
  listResponses: (id) => req('GET', `/api/studies/${id}/responses`),
  submitResponse: (id, r) => req('POST', `/api/studies/${id}/responses`, r),
  submitBatch: (id, batch) => req('POST', `/api/studies/${id}/responses`, { batch }),
  deleteResponse: (id, rid) => req('DELETE', `/api/studies/${id}/responses/${rid}`),
  clearResponses: (id, filter = {}) => {
    const qs = new URLSearchParams(Object.entries(filter).filter(([, v]) => v) as [string, string][]).toString();
    return req('DELETE', `/api/studies/${id}/responses${qs ? `?${qs}` : ''}`);
  },
};

// ---------------------------------------------------------------------------------------------
// Local: same behaviour as the server, persisted in localStorage

interface Db {
  studies: Study[];
  responses: SurveyResponse[];
}

const KEY = 'survey-builder:db';
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const today = () => new Date().toISOString().slice(0, 10);

function load(): Db {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '') as Db;
  } catch {
    return { studies: [], responses: [] };
  }
}

function save(db: Db) {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    throw new Error('Browser storage is full or unavailable. Clear some simulated responses and try again.');
  }
}

function findStudy(db: Db, id: string): Study {
  const s = db.studies.find((x) => x.id === id);
  if (!s) throw new Error('Study not found');
  return s;
}

const localApi: Api = {
  async listStudies() {
    const db = load();
    return db.studies.map((s) => ({
      id: s.id,
      title: s.title,
      updatedAt: s.updatedAt ?? '',
      surveyCount: s.surveys.length,
      responseCount: db.responses.filter((r) => r.studyId === s.id).length,
    }));
  },
  async getStudy(id) {
    return findStudy(load(), id);
  },
  async createStudy(input) {
    const db = load();
    const now = new Date().toISOString();
    const study = { ...input, id: uid(), createdAt: now, updatedAt: now } as Study;
    db.studies.push(study);
    save(db);
    return study;
  },
  async saveStudy(s) {
    const db = load();
    const prev = findStudy(db, s.id);
    const next = { ...s, createdAt: prev.createdAt, updatedAt: new Date().toISOString() };
    db.studies = db.studies.map((x) => (x.id === s.id ? next : x));
    save(db);
    return next;
  },
  async deleteStudy(id) {
    const db = load();
    db.studies = db.studies.filter((s) => s.id !== id);
    db.responses = db.responses.filter((r) => r.studyId !== id);
    save(db);
  },
  async listResponses(id) {
    return load().responses.filter((r) => r.studyId === id);
  },
  async submitResponse(id, r) {
    return localApi.submitBatch(id, [r]);
  },
  async submitBatch(id, batch) {
    const db = load();
    const study = findStudy(db, id);
    const created: SurveyResponse[] = [];
    for (const item of batch) {
      const survey = study.surveys.find((s) => s.id === item.surveyId);
      if (!survey) throw new Error('Unknown survey');
      const prefix = `${survey.code}-R`;
      const maxN = db.responses
        .filter((r) => r.studyId === id && r.surveyId === survey.id && r.responseId.startsWith(prefix))
        .reduce((m, r) => Math.max(m, parseInt(r.responseId.slice(prefix.length), 10) || 0), 0);
      const r: SurveyResponse = {
        id: uid(),
        studyId: id,
        surveyId: survey.id,
        responseId: `${prefix}${String(maxN + 1).padStart(3, '0')}`,
        submittedAt: item.submittedAt || today(),
        dataType: item.dataType === 'SIMULATED' ? 'SIMULATED' : 'LIVE',
        answers: item.answers || {},
        roster: item.roster || {},
        ...(item.personCode ? { personCode: item.personCode } : {}),
        ...(item.personName ? { personName: item.personName } : {}),
      };
      db.responses.push(r);
      created.push(r);
    }
    save(db);
    return created;
  },
  async deleteResponse(id, rid) {
    const db = load();
    db.responses = db.responses.filter((r) => !(r.studyId === id && r.id === rid));
    save(db);
  },
  async clearResponses(id, filter = {}) {
    const db = load();
    db.responses = db.responses.filter(
      (r) =>
        !(r.studyId === id && (!filter.surveyId || r.surveyId === filter.surveyId) && (!filter.dataType || r.dataType === filter.dataType)),
    );
    save(db);
  },
};

export const api: Api = LOCAL_MODE ? localApi : httpApi;

/**
 * Absolute URL of a survey's respondent form. The server build uses the survey's unguessable form token;
 * the static build uses hash routes. Returns '' until the server has assigned a token.
 */
export function formUrl(studyId: string, survey: Pick<Survey, 'id' | 'formToken'>): string {
  if (LOCAL_MODE) return `${location.origin}${import.meta.env.BASE_URL}#/take/${studyId}/${survey.id}`;
  return survey.formToken ? `${location.origin}/f/${survey.formToken}` : '';
}

// ---------------------------------------------------------------------------------------------
// Accounts (server build only)

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt?: string;
}

export const authApi = {
  me: () => req<{ user: User }>('GET', '/api/auth/me'),
  login: (email: string, password: string) => req<{ user: User }>('POST', '/api/auth/login', { email, password }),
  setup: (body: { email: string; name: string; password: string; setupToken: string }) => req<{ user: User }>('POST', '/api/auth/setup', body),
  logout: () => req<void>('POST', '/api/auth/logout'),
  changePassword: (currentPassword: string, newPassword: string) => req<void>('POST', '/api/auth/password', { currentPassword, newPassword }),
  listUsers: () => req<User[]>('GET', '/api/users'),
  createUser: (body: { email: string; name: string; password: string }) => req<User>('POST', '/api/users', body),
  deleteUser: (id: string) => req<void>('DELETE', `/api/users/${id}`),
};

/** Records an export in the server's audit log (no-op for the static build). */
export function logExport(studyId: string, detail: Record<string, unknown>) {
  if (LOCAL_MODE) return Promise.resolve();
  return req<void>('POST', `/api/studies/${studyId}/audit`, { action: 'responses.exported', detail }).catch(() => undefined);
}

// ---------------------------------------------------------------------------------------------
// Public respondent form (server build only)

export interface PublicForm {
  study: { title: string; intro: string; consentText: string };
  survey: Survey;
  accepting: boolean;
}

export const formsApi = {
  get: (token: string) => req<PublicForm>('GET', `/api/forms/${encodeURIComponent(token)}`),
  submit: (token: string, body: { answers: SurveyResponse['answers']; roster: SurveyResponse['roster']; consent: boolean }) =>
    req<{ responseId: string }>('POST', `/api/forms/${encodeURIComponent(token)}/responses`, body),
};
