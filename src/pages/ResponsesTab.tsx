import Icon from '../components/Icon';
import { useMemo, useState } from 'react';
import { api, formUrl } from '../api';
import { planSheets } from '../exportExcel';
import { eligiblePeople, linkedQuestionCodes, respondentsFor } from '../org';
import { simulateAnonymous, simulateFromOrg } from '../simulate';
import type { Study, Survey, SurveyResponse } from '../types';
import RespondentsPicker from '../components/RespondentsPicker';

interface Props {
  study: Study;
  setStudy: (s: Study) => void;
  responses: SurveyResponse[];
  reload: () => Promise<unknown>;
  goToPeople: () => void;
}

const PREVIEW_ROWS = 100;

export default function ResponsesTab({ study, setStudy, responses, reload, goToPeople }: Props) {
  const plans = useMemo(() => planSheets(study, responses, { dataTypes: ['LIVE', 'SIMULATED'] }), [study, responses]);
  const [sheet, setSheet] = useState(plans[0]?.name ?? '');
  const [simOpen, setSimOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const plan = plans.find((p) => p.name === sheet) ?? plans[0];

  if (!plan) return <div className="container"><div className="empty">Add questions to a survey to start collecting responses.</div></div>;

  const survey = plan.survey;
  const mine = survey ? responses.filter((r) => r.surveyId === survey.id) : [];
  const live = mine.filter((r) => r.dataType === 'LIVE').length;
  const sim = mine.length - live;
  const byResponseId = new Map(mine.map((r) => [r.responseId, r]));

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container wide">
      <div className="sheet-tabs">
        {plans.map((p) => (
          <button key={p.name} className={p.name === plan.name ? 'on' : ''} onClick={() => (setSheet(p.name), setSimOpen(false))}>
            {p.name} <span className="muted">({p.rows.length})</span>
          </button>
        ))}
      </div>

      {survey ? (
        <div className="card toolbar">
          <div>
            <b>{survey.title}</b>
            <div className="muted small">
              {live} live · {sim} simulated
            </div>
          </div>
          <div className="spacer" />
          <a className="btn small" href={formUrl(study.id, survey.id)} target="_blank" rel="noreferrer">
            Fill in a response <Icon name="external" size={14} />
          </a>
          <button className={`btn small ${simOpen ? 'primary' : ''}`} onClick={() => setSimOpen(!simOpen)}>
            Simulate responses
          </button>
          <div className="menu-wrap">
            <button className="btn small ghost" disabled={busy || mine.length === 0} onClick={() => setClearOpen(!clearOpen)}>
              Clear <Icon name="chevronDown" size={14} />
            </button>
            {clearOpen && (
              <div className="menu" onMouseLeave={() => setClearOpen(false)}>
                <button
                  disabled={!sim}
                  onClick={() => (setClearOpen(false), confirm(`Delete ${sim} simulated responses for ${survey.code}?`) && run(() => api.clearResponses(study.id, { surveyId: survey.id, dataType: 'SIMULATED' })))}
                >
                  Simulated responses <span className="muted">({sim})</span>
                </button>
                <button
                  className="danger"
                  disabled={!live}
                  onClick={() => (setClearOpen(false), confirm(`Permanently delete ALL ${live} live responses for ${survey.code}? This cannot be undone.`) && run(() => api.clearResponses(study.id, { surveyId: survey.id, dataType: 'LIVE' })))}
                >
                  Live responses <span className="muted">({live})</span>
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="card toolbar">
          <div>
            <b>Org directory</b>
            <div className="muted small">Exported as a lookup sheet so codes in the survey sheets can be matched to names.</div>
          </div>
          <div className="spacer" />
          <button className="btn small" onClick={goToPeople}>Edit people</button>
        </div>
      )}

      {simOpen && survey && (
        <SimulatePanel
          study={study}
          setStudy={setStudy}
          survey={survey}
          responses={mine}
          busy={busy}
          goToPeople={goToPeople}
          onGenerate={(batch, replace) =>
            run(async () => {
              if (replace) await api.clearResponses(study.id, { surveyId: survey.id, dataType: 'SIMULATED' });
              if (batch.length) await api.submitBatch(study.id, batch);
            }).then(() => setSimOpen(false))
          }
        />
      )}

      <p className="muted small">
        Preview of the <b>{plan.name}</b> sheet as exported{plan.rows.length > PREVIEW_ROWS ? ` (first ${PREVIEW_ROWS} of ${plan.rows.length} rows)` : ''}.
      </p>
      <div className="table-wrap">
        <table className="sheet">
          <thead>
            <tr>
              {plan.kind === 'survey' && <th />}
              {plan.headers.map((h, i) => (
                <th key={i}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {plan.rows.slice(0, PREVIEW_ROWS).map((r, i) => {
              const resp = plan.kind === 'survey' ? byResponseId.get(String(r[1])) : undefined;
              return (
                <tr key={i} className={r[0] === 'SIMULATED' ? 'sim' : ''}>
                  {plan.kind === 'survey' && (
                    <td>
                      {resp && (
                        <button className="icon tiny danger" title="Delete response" onClick={() => confirm(`Delete response ${resp.responseId}?`) && run(() => api.deleteResponse(study.id, resp.id))}>
                          <Icon name="x" size={13} />
                        </button>
                      )}
                    </td>
                  )}
                  {r.map((c, j) => (
                    <td key={j} className={typeof c === 'number' ? 'n' : ''}>
                      {c ?? ''}
                    </td>
                  ))}
                </tr>
              );
            })}
            {plan.rows.length === 0 && (
              <tr>
                <td colSpan={plan.headers.length + 2} className="muted center-text">
                  No responses yet — share the form, or use “Simulate responses” to rehearse.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SimulatePanel({
  study,
  setStudy,
  survey,
  responses,
  busy,
  goToPeople,
  onGenerate,
}: {
  study: Study;
  setStudy: (s: Study) => void;
  survey: Survey;
  responses: SurveyResponse[];
  busy: boolean;
  goToPeople: () => void;
  onGenerate: (batch: ReturnType<typeof simulateAnonymous>, replace: boolean) => void;
}) {
  const org = study.org ?? [];
  const [anonymous, setAnonymous] = useState(org.length === 0);
  const [replace, setReplace] = useState(true);
  const [count, setCount] = useState(50);
  const [rate, setRate] = useState(80);

  const simulated = responses.filter((r) => r.dataType === 'SIMULATED');
  const eligible = eligiblePeople(survey, org);
  // when replacing, everyone is eligible again; otherwise top up towards the rate
  const responded = new Set(replace ? [] : (responses.map((r) => r.personCode).filter(Boolean) as string[]));
  const already = eligible.filter((p) => responded.has(p.code)).length;
  const target = Math.round((eligible.length * rate) / 100);
  const toAdd = anonymous ? count : Math.max(0, target - already);
  const linked = linkedQuestionCodes(survey, org);
  const hasRoster = survey.sections.some((s) => s.kind === 'roster');
  const setSurvey = (sv: Survey) => setStudy({ ...study, surveys: study.surveys.map((s) => (s.id === sv.id ? sv : s)) });

  const generate = () =>
    onGenerate(anonymous ? simulateAnonymous(survey, count, replace ? 0 : simulated.length) : simulateFromOrg(survey, org, rate / 100, responded), replace);

  return (
    <div className="card panel">
      <div className="row gap wrap center">
        <label className="check big-check">
          <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
          <span>
            <b>Anonymous</b>
            <span className="muted small">
              {anonymous
                ? ' Random answers, made-up codes, no names.'
                : ` Uses names from People (${org.length}) — respondent and direct-report names are added to the export.`}
            </span>
          </span>
        </label>
      </div>

      {!anonymous && org.length === 0 ? (
        <div className="row gap center" style={{ marginTop: 10 }}>
          <span className="muted">No people yet. Add or generate them on the People tab, or tick Anonymous.</span>
          <button className="btn small" onClick={goToPeople}>Go to People</button>
        </div>
      ) : (
        <>
          <div className="row gap center wrap" style={{ marginTop: 12 }}>
            {anonymous ? (
              <label className="field inline">
                <span>Number of responses</span>
                <input type="number" className="num" min={1} max={2000} value={count} onChange={(e) => setCount(Math.max(1, Math.min(2000, Number(e.target.value))))} />
              </label>
            ) : (
              <>
                <label className="field inline">
                  <span>Who responds</span>
                  <RespondentsPicker value={respondentsFor(survey)} org={org} onChange={(v) => setSurvey({ ...survey, respondents: v })} />
                </label>
                <label className="field inline">
                  <span>Response rate</span>
                  <input type="number" className="num" min={1} max={100} value={rate} onChange={(e) => setRate(Math.max(1, Math.min(100, Number(e.target.value))))} />
                  <span>%</span>
                </label>
              </>
            )}
            <label className="check">
              <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
              Replace the {simulated.length} existing simulated
            </label>
            <div className="spacer" />
            <button className="btn primary small" disabled={busy || (toAdd === 0 && !replace)} onClick={generate}>
              Simulate {toAdd} response{toAdd === 1 ? '' : 's'}
            </button>
          </div>
          {!anonymous && (
            <p className="muted small" style={{ marginBottom: 0 }}>
              {eligible.length} eligible{!replace && ` · ${already} already responded`} · {toAdd} to simulate at {rate}%.
              {linked.length > 0 && <> Filled from each person: {linked.join(', ')}.</>}
              {hasRoster && <> Team rows list each manager's actual direct reports, with names.</>}
              {' '}Changed names? Simulate again with “Replace” ticked.
            </p>
          )}
        </>
      )}
    </div>
  );
}
