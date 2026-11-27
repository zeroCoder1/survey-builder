import { useState } from 'react';
import { ApiError } from '../api';
import { isEmpty, isVisible, validateSubmission } from '../model';
import type { AnswerValue, RosterRow, Survey } from '../types';
import Icon from './Icon';
import QuestionInput from './QuestionInput';

export interface SurveyFormProps {
  studyTitle: string;
  intro: string;
  consentText?: string;
  survey: Survey;
  accepting: boolean;
  /** Persists the submission and resolves with the response reference. */
  onSubmit: (payload: { answers: Record<string, AnswerValue>; roster: Record<string, RosterRow[]>; consent: boolean }) => Promise<string>;
}

const initialRoster = (survey: Survey) =>
  Object.fromEntries(survey.sections.filter((s) => s.kind === 'roster').map((s) => [s.id, [{ key: '', answers: {} }]])) as Record<string, RosterRow[]>;

/** The respondent-facing form: rendering, client-side validation, progress and the thank-you state. */
export default function SurveyForm({ studyTitle, intro, consentText, survey, accepting, onSubmit }: SurveyFormProps) {
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [roster, setRoster] = useState<Record<string, RosterRow[]>>(() => initialRoster(survey));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState(false);
  const [formError, setFormError] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const needsConsent = !!consentText?.trim();

  if (!accepting)
    return (
      <div className="take">
        <div className="card center-text">
          <h2>{survey.title}</h2>
          <p>This survey is closed and is no longer accepting responses.</p>
        </div>
      </div>
    );

  if (done)
    return (
      <div className="take">
        <div className="card center-text">
          <div className="done-mark"><Icon name="check" size={22} /></div>
          <h2>Thank you</h2>
          <p>Your response has been recorded.</p>
          <p className="muted small">Reference: {done}</p>
        </div>
      </div>
    );

  const setRow = (secId: string, i: number, row: RosterRow) => setRoster({ ...roster, [secId]: roster[secId].map((r, j) => (j === i ? row : r)) });
  const scrollToError = () =>
    setTimeout(() => document.querySelector('.has-error, .field .error, .consent .error')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);

  const submit = async () => {
    const result = validateSubmission(survey, answers, roster);
    const errs = { ...result.errors };
    if (needsConsent && !consent) errs.consent = 'Please confirm you have read the privacy notice.';
    setErrors(errs);
    setFormError('');
    if (Object.keys(errs).length) return scrollToError();
    setSubmitting(true);
    try {
      setDone(await onSubmit({ answers: result.answers, roster: result.roster, consent }));
      window.scrollTo(0, 0);
    } catch (e) {
      if (e instanceof ApiError && e.errors) {
        setErrors(e.errors);
        scrollToError();
      }
      setFormError((e as Error).message || 'Could not submit. Please try again.');
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
  const errorCount = Object.keys(errors).length;

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
        <div className="muted small">{studyTitle}</div>
        <h1>{survey.title}</h1>
        {intro && <p>{intro}</p>}
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
                    <span>
                      {sec.roster!.itemKeyHeader} <span className="req">*</span>
                    </span>
                    <input value={row.key} maxLength={100} onChange={(e) => setRow(sec.id, i, { ...row, key: e.target.value })} />
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
                <Icon name="plus" size={14} /> Add {sec.roster.itemLabel}
              </button>
            </>
          ) : (
            sec.questions
              .filter((q) => isVisible(q, survey, answers))
              .map((q) => (
                <QuestionInput key={q.id} q={q} name={q.id} value={answers[q.id]} error={errors[q.id]} onChange={(v) => setAnswers({ ...answers, [q.id]: v })} />
              ))
          )}
        </section>
      ))}

      {hasQuestions && needsConsent && (
        <section className={`card take-section consent ${errors.consent ? 'has-error' : ''}`}>
          <h2>Privacy notice</h2>
          <p className="consent-text">{consentText}</p>
          <label className="check">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            I have read the privacy notice and agree to take part.
          </label>
          {errors.consent && <div className="error small">{errors.consent}</div>}
        </section>
      )}

      {hasQuestions && (
        <div className="take-foot">
          {(errorCount > 0 || formError) && <span className="error">{errorCount > 0 ? 'Please fix the highlighted answers.' : formError}</span>}
          <button className="btn primary big" disabled={submitting} onClick={submit}>
            {submitting ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      )}
    </div>
  );
}
