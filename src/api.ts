import type { Study, StudySummary, SurveyResponse } from './types';

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

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const msg = await res.json().catch(() => ({}));
    throw new Error(msg.error || `${method} ${url} failed (${res.status})`);
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

/** Absolute URL of a survey's respondent form, correct for both the server build and the static (hash-routed) build. */
export function formUrl(studyId: string, surveyId: string): string {
  const path = `/take/${studyId}/${surveyId}`;
  if (LOCAL_MODE) return `${location.origin}${import.meta.env.BASE_URL}#${path}`;
  return `${location.origin}${path}`;
}
