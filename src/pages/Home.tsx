import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, LOCAL_MODE } from '../api';
import { newStudy } from '../model';
import { sampleStudyTemplate } from '../template';
import type { StudySummary } from '../types';

export default function Home() {
  const [studies, setStudies] = useState<StudySummary[] | null>(null);
  const [error, setError] = useState('');
  const nav = useNavigate();

  const refresh = () => api.listStudies().then(setStudies).catch((e) => setError(e.message));
  useEffect(() => {
    refresh();
  }, []);

  const create = async (fromTemplate: boolean) => {
    const { id: _ignored, ...blank } = newStudy();
    const s = await api.createStudy(fromTemplate ? sampleStudyTemplate() : blank);
    nav(`/study/${s.id}`);
  };

  const remove = async (s: StudySummary) => {
    if (!confirm(`Delete “${s.title}” and its ${s.responseCount} responses? This cannot be undone.`)) return;
    await api.deleteStudy(s.id);
    refresh();
  };

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">Survey Builder</div>
      </header>
      <main className="container">
        <div className="row between wrap gap">
          <div>
            <h1 className="home-title">Your studies</h1>
            <p className="muted home-sub">
              Build multi-survey questionnaires, collect or simulate responses, and export one analysis-ready Excel workbook.
            </p>
          </div>
          <div className="row gap">
            <button className="btn" onClick={() => create(true)}>
              Start from sample study
            </button>
            <button className="btn primary" onClick={() => create(false)}>
              New blank study
            </button>
          </div>
        </div>
        {LOCAL_MODE && (
          <div className="note small" style={{ marginTop: 16 }}>
            This demo stores studies and responses in your browser only. Run the app with its server to collect responses from other people.
          </div>
        )}
        {error && <div className="alert">Could not reach the API: {error}. Is the server running (npm run dev)?</div>}
        {studies && studies.length === 0 && (
          <div className="empty">
            No studies yet. Start from the sample study to see a complete example with four surveys.
          </div>
        )}
        <div className="cards">
          {studies?.map((s) => (
            <div key={s.id} className="card study-card">
              <Link to={`/study/${s.id}`} className="study-title">
                {s.title}
              </Link>
              <div className="muted small">
                {s.surveyCount} survey{s.surveyCount === 1 ? '' : 's'} · {s.responseCount} response
                {s.responseCount === 1 ? '' : 's'} · updated {new Date(s.updatedAt).toLocaleString()}
              </div>
              <div className="row gap" style={{ marginTop: 12 }}>
                <Link className="btn small" to={`/study/${s.id}`}>
                  Open
                </Link>
                <button className="btn small ghost danger" onClick={() => remove(s)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
