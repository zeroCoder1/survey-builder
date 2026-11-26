import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import QuestionInput from '../components/QuestionInput';
import { isEmpty, isVisible, validateAnswer } from '../model';
import type { AnswerValue, RosterRow, Study, Survey } from '../types';

export default function TakeSurvey() {
  const { studyId, surveyId } = useParams();
  const [study, setStudy] = useState<Study | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [roster, setRoster] = useState<Record<string, RosterRow[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<string | null>(null);
  const [failed, setFailed] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.getStudy(studyId!).then(setStudy).catch(() => setFailed('This survey could not be found.'));
  }, [studyId]);

  const survey: Survey | undefined = study?.surveys.find((s) => s.id === surveyId);

  useEffect(() => {
    if (!survey) return;
    const init: Record<string, RosterRow[]> = {};
    for (const s of survey.sections) if (s.kind === 'roster') init[s.id] = [{ key: '', answers: {} }];
    setRoster(init);
  }, [survey?.id]); // re-initialise only when the survey itself changes

  if (failed) return <div className="take"><div className="card">{failed}</div></div>;
  if (!study) return <div className="take muted">Loading…</div>;
  if (!survey) return <div className="take"><div className="card">This survey could not be found.</div></div>;

  if (done)
    return (
      <div className="take">
        <div className="card center-text">
          <h2>Thank you</h2>
          <p>Your response has been recorded.</p>
          <p className="muted small">Reference: {done}</p>
          <button className="btn" onClick={() => location.reload()}>Submit another response</button>
        </div>
      </div>
    );

  const setRow = (secId: string, i: number, row: RosterRow) =>
    setRoster({ ...roster, [secId]: roster[secId].map((r, j) => (j === i ? row : r)) });

  const submit = async () => {
    const errs: Record<string, string> = {};
    const clean: Record<string, AnswerValue> = {};
    for (const sec of survey.sections) {
      if (sec.kind === 'roster') {
        (roster[sec.id] || []).forEach((row, i) => {
          if (!row.key.trim()) errs[`${sec.id}:${i}:key`] = 'Required.';
          for (const q of sec.questions) {
            const e = validateAnswer(q, row.answers[q.id]);
            if (e) errs[`${sec.id}:${i}:${q.id}`] = e;
          }
        });
        continue;
      }
      for (const q of sec.questions) {
        if (!isVisible(q, survey, answers)) continue;
        const e = validateAnswer(q, answers[q.id]);
        if (e) errs[q.id] = e;
        else clean[q.id] = typeof answers[q.id] === 'string' ? (answers[q.id] as string).trim() : answers[q.id];
      }
    }
    setErrors(errs);
    if (Object.keys(errs).length) {
      setTimeout(() => document.querySelector('.has-error, .error')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
      return;
    }
    setSubmitting(true);
    try {
      const cleanRoster = Object.fromEntries(
        Object.entries(roster).map(([k, rows]) => [k, rows.map((r) => ({ ...r, key: r.key.trim() }))]),
      );
      const [r] = await api.submitResponse(study.id, { surveyId: survey.id, answers: clean, roster: cleanRoster, dataType: 'LIVE' });
      setDone(r.responseId);
      window.scrollTo(0, 0);
    } catch (e) {
      alert(`Could not submit: ${(e as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const hasQuestions = survey.sections.some((s) => s.questions.length);
  const visibleQs = survey.sections
    .filter((s) => s.kind !== 'roster')
    .flatMap((s) => s.questions)
    .filter((q) => isVisible(q, survey, answers));
  const answered = visibleQs.filter((q) => !isEmpty(answers[q.id])).length;
  const pct = visibleQs.length ? Math.round((answered / visibleQs.length) * 100) : 0;

  return (
    <div className="take">
      {visibleQs.length > 0 && (
        <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Survey progress">
          <div className="progress-track">
            <div className="progress-bar" style={{ width: `${pct}%` }} />
          </div>
          <span className="progress-text">
            {answered} of {visibleQs.length} answered
          </span>
        </div>
      )}
      <header className="take-head">
        <div className="muted small">{study.title}</div>
        <h1>{survey.title}</h1>
        {study.intro && <p>{study.intro}</p>}
        {survey.description && <p className="note">{survey.description}</p>}
      </header>

      {survey.sections.map((sec) => (
        <section key={sec.id} className="card take-section">
          <h2>{sec.title}</h2>
          {sec.kind === 'roster' && sec.roster ? (
            <>
              <p className="muted small">Answer the following for each {sec.roster.itemLabel}.</p>
              {(roster[sec.id] || []).map((row, i) => (
                <div key={i} className="roster-item">
                  <div className="row between center">
                    <b>
                      {sec.roster!.itemLabel[0]?.toUpperCase() + sec.roster!.itemLabel.slice(1)} {i + 1}
                    </b>
                    {(roster[sec.id] || []).length > 1 && (
                      <button className="btn small ghost danger" onClick={() => setRoster({ ...roster, [sec.id]: roster[sec.id].filter((_, j) => j !== i) })}>
                        Remove
                      </button>
                    )}
                  </div>
                  <label className="field">
                    <span>{sec.roster!.itemKeyHeader} <span className="req">*</span></span>
                    <input value={row.key} onChange={(e) => setRow(sec.id, i, { ...row, key: e.target.value })} />
                    {errors[`${sec.id}:${i}:key`] && <span className="error small">{errors[`${sec.id}:${i}:key`]}</span>}
                  </label>
                  {sec.questions.map((q) => (
                    <QuestionInput
                      key={q.id}
                      q={q}
                      name={`${sec.id}-${i}-${q.id}`}
                      value={row.answers[q.id]}
                      error={errors[`${sec.id}:${i}:${q.id}`]}
                      onChange={(v) => setRow(sec.id, i, { ...row, answers: { ...row.answers, [q.id]: v } })}
                    />
                  ))}
                </div>
              ))}
              <button className="btn small dashed" onClick={() => setRoster({ ...roster, [sec.id]: [...(roster[sec.id] || []), { key: '', answers: {} }] })}>
                + Add {sec.roster.itemLabel}
              </button>
            </>
          ) : (
            sec.questions
              .filter((q) => isVisible(q, survey, answers))
              .map((q) => (
                <QuestionInput
                  key={q.id}
                  q={q}
                  name={q.id}
                  value={answers[q.id]}
                  error={errors[q.id]}
                  onChange={(v) => setAnswers({ ...answers, [q.id]: v })}
                />
              ))
          )}
        </section>
      ))}

      {hasQuestions && (
        <div className="take-foot">
          {Object.keys(errors).length > 0 && <span className="error">Please fix the highlighted answers.</span>}
          <button className="btn primary big" disabled={submitting} onClick={submit}>
            {submitting ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      )}
    </div>
  );
}
