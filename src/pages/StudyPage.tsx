import Icon from '../components/Icon';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { downloadWorkbook } from '../exportExcel';
import type { Study, SurveyResponse } from '../types';
import BuildTab from './BuildTab';
import QuestionnaireView from './QuestionnaireView';
import PeopleTab from './PeopleTab';
import ResponsesTab from './ResponsesTab';

type Tab = 'build' | 'people' | 'responses' | 'questionnaire';

const TAB_LABELS: Record<Tab, string> = { build: 'Build', people: 'People', responses: 'Responses', questionnaire: 'Questionnaire' };

export default function StudyPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'build';
  const [study, setStudyState] = useState<Study | null>(null);
  const [responses, setResponses] = useState<SurveyResponse[]>([]);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'dirty' | 'error'>('saved');
  const [exportOpen, setExportOpen] = useState(false);
  const timer = useRef<number>();
  const latest = useRef<Study | null>(null);

  const loadResponses = useCallback(() => api.listResponses(id!).then(setResponses), [id]);

  useEffect(() => {
    api.getStudy(id!).then((s) => {
      latest.current = s;
      setStudyState(s);
    });
    loadResponses();
  }, [id, loadResponses]);

  const flush = useCallback(async () => {
    if (!latest.current) return;
    setSaveState('saving');
    try {
      await api.saveStudy(latest.current);
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  }, []);

  const setStudy = (s: Study) => {
    latest.current = s;
    setStudyState(s);
    setSaveState('dirty');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 600);
  };

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (saveState === 'dirty' || saveState === 'saving') e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [saveState]);

  if (!study) return <div className="page"><div className="container muted">Loading…</div></div>;

  const live = responses.filter((r) => r.dataType === 'LIVE').length;
  const sim = responses.length - live;
  const doExport = async (mode: 'LIVE' | 'SIMULATED' | 'ALL' | 'BLANK') => {
    setExportOpen(false);
    if (saveState !== 'saved') await flush();
    await downloadWorkbook(study, responses, {
      blank: mode === 'BLANK',
      dataTypes: mode === 'ALL' || mode === 'BLANK' ? ['LIVE', 'SIMULATED'] : [mode],
    });
  };

  return (
    <div className="page">
      <header className="topbar">
        <Link to="/" className="brand">Survey Builder</Link>
        <span className="crumb">/</span>
        <input
          className="title-input"
          value={study.title}
          onChange={(e) => setStudy({ ...study, title: e.target.value })}
          aria-label="Study title"
        />
        <span className={`save ${saveState}`}>
          {saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Save failed' : 'Saving…'}
        </span>
        <div className="spacer" />
        <div className="menu-wrap">
          <button className="btn primary" onClick={() => setExportOpen((o) => !o)}>
            <Icon name="download" size={15} /> Export Excel <Icon name="chevronDown" size={14} />
          </button>
          {exportOpen && (
            <div className="menu" onMouseLeave={() => setExportOpen(false)}>
              <button onClick={() => doExport('LIVE')}>
                Live responses <span className="muted">({live})</span>
              </button>
              <button onClick={() => doExport('SIMULATED')}>
                Simulated responses <span className="muted">({sim})</span>
              </button>
              <button onClick={() => doExport('ALL')}>
                All responses <span className="muted">({responses.length})</span>
              </button>
              <hr />
              <button onClick={() => doExport('BLANK')}>Blank template (headers only)</button>
            </div>
          )}
        </div>
      </header>
      <nav className="tabs">
        {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => setParams({ tab: t })}>
            {TAB_LABELS[t]}
            {t === 'responses' && <span className="count">{responses.length}</span>}
            {t === 'people' && <span className="count">{study.org?.length || 'optional'}</span>}
          </button>
        ))}
      </nav>
      {tab === 'build' && <BuildTab study={study} setStudy={setStudy} />}
      {tab === 'people' && <PeopleTab study={study} setStudy={setStudy} />}
      {tab === 'responses' && (
        <ResponsesTab study={study} setStudy={setStudy} responses={responses} reload={loadResponses} goToPeople={() => setParams({ tab: 'people' })} />
      )}
      {tab === 'questionnaire' && <QuestionnaireView study={study} />}
    </div>
  );
}
