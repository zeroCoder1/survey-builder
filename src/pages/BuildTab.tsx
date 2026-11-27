import { formUrl } from '../api';
import Icon from '../components/Icon';
import { useState } from 'react';
import QuestionEditor from '../components/QuestionEditor';
import RespondentsPicker from '../components/RespondentsPicker';
import { allQuestions, newQuestion, newSection, newSurvey, nextCode, renumberSurvey, uid } from '../model';
import { identityCodeFor, respondentsFor } from '../org';
import { QTYPE_LABELS, type QType, type Question, type Section, type Study, type Survey } from '../types';

interface Props {
  study: Study;
  setStudy: (s: Study) => void;
}

function move<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const a = [...arr];
  [a[i], a[j]] = [a[j], a[i]];
  return a;
}

const QUICK_TYPES: QType[] = ['likert', 'single', 'multi', 'yesno', 'scale', 'text', 'number', 'longtext'];

export default function BuildTab({ study, setStudy }: Props) {
  const [selId, setSelId] = useState(study.surveys[0]?.id ?? '');
  const [openQ, setOpenQ] = useState<string | null>(null);
  const [surveySettings, setSurveySettings] = useState(false);
  const survey = study.surveys.find((s) => s.id === selId) ?? study.surveys[0];

  const setSurvey = (sv: Survey) => setStudy({ ...study, surveys: study.surveys.map((s) => (s.id === sv.id ? sv : s)) });

  const addSurvey = () => {
    const s = newSurvey(`S${study.surveys.length + 1}`);
    setStudy({ ...study, surveys: [...study.surveys, s] });
    setSelId(s.id);
    setSurveySettings(false);
  };
  const removeSurvey = () => {
    if (!confirm(`Delete survey “${survey.title}”? Its responses will no longer be exported.`)) return;
    const rest = study.surveys.filter((s) => s.id !== survey.id);
    setStudy({ ...study, surveys: rest });
    setSelId(rest[0]?.id ?? '');
  };

  const codes = survey ? allQuestions(survey).map((q) => q.code) : [];
  const dupCodes = new Set(codes.filter((c, i) => c && codes.indexOf(c) !== i));
  const shareUrl = survey ? formUrl(study.id, survey) : '';
  const [copied, setCopied] = useState(false);

  return (
    <div className="build">
      <aside className="side">
        <div className="side-title">Surveys</div>
        {study.surveys.map((s, i) => (
          <div key={s.id} className={`side-item ${s.id === survey?.id ? 'on' : ''}`} onClick={() => (setSelId(s.id), setOpenQ(null))}>
            <span className="pill">{s.code}</span>
            <span className="side-text">{s.title}</span>
            <span className="side-move" onClick={(e) => e.stopPropagation()}>
              <button className="icon tiny" title="Move up" onClick={() => setStudy({ ...study, surveys: move(study.surveys, i, -1) })}><Icon name="arrowUp" size={13} /></button>
              <button className="icon tiny" title="Move down" onClick={() => setStudy({ ...study, surveys: move(study.surveys, i, 1) })}><Icon name="arrowDown" size={13} /></button>
            </span>
          </div>
        ))}
        <button className="btn small block" onClick={addSurvey}><Icon name="plus" size={14} /> Add survey</button>

        <details className="more" style={{ marginTop: 24 }}>
          <summary>Study settings</summary>
          <label className="field">
            <span>Intro shown on every form</span>
            <textarea rows={5} value={study.intro} onChange={(e) => setStudy({ ...study, intro: e.target.value })} />
          </label>
          <label className="field">
            <span>Privacy notice (respondents must agree before submitting)</span>
            <textarea
              rows={4}
              placeholder="e.g. Your answers are used only for this study, stored securely, deleted after 12 months, and reported only for groups of five or more."
              value={study.consentText ?? ''}
              onChange={(e) => setStudy({ ...study, consentText: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Extra lines for the export's README sheet</span>
            <textarea rows={3} value={study.readmeNotes} onChange={(e) => setStudy({ ...study, readmeNotes: e.target.value })} />
          </label>
        </details>
      </aside>

      {survey ? (
        <main className="editor">
          <div className="card survey-head">
            <input className="survey-title" value={survey.title} onChange={(e) => setSurvey({ ...survey, title: e.target.value })} aria-label="Survey title" />
            <div className="row gap wrap center">
              <input className="subtle" value={survey.audience} placeholder="Audience, e.g. All employees" onChange={(e) => setSurvey({ ...survey, audience: e.target.value })} style={{ maxWidth: 240 }} />
              <input className="subtle" value={survey.description} placeholder="Instructions shown at the top of the form (optional)" onChange={(e) => setSurvey({ ...survey, description: e.target.value })} style={{ flex: 1, minWidth: 220 }} />
            </div>
            <div className="row gap wrap center" style={{ marginTop: 10 }}>
              <a className={`btn small ${shareUrl ? '' : 'disabled'}`} href={shareUrl || undefined} target="_blank" rel="noreferrer" aria-disabled={!shareUrl}>
                Preview form <Icon name="external" size={14} />
              </a>
              <button
                className="btn small"
                disabled={!shareUrl}
                title={shareUrl ? undefined : 'Saving…'}
                onClick={() => (navigator.clipboard?.writeText(shareUrl), setCopied(true), setTimeout(() => setCopied(false), 1500))}
              >
                <Icon name={copied ? 'check' : 'link'} size={14} /> {copied ? 'Link copied' : 'Copy form link'}
              </button>
              <label className="check switch" title="When off, the form shows a closed message and rejects new submissions">
                <input
                  type="checkbox"
                  checked={survey.acceptingResponses !== false}
                  onChange={(e) => setSurvey({ ...survey, acceptingResponses: e.target.checked })}
                />
                {survey.acceptingResponses !== false ? 'Accepting responses' : 'Closed'}
              </label>
              <div className="spacer" />
              <button className={`btn small ghost ${surveySettings ? 'on' : ''}`} onClick={() => setSurveySettings(!surveySettings)}>
                <Icon name="sliders" size={14} /> Settings
              </button>
            </div>
            {surveySettings && (
              <div className="settings">
                <div className="grid-4">
                  <label className="field">
                    <span>Survey code</span>
                    <input
                      value={survey.code}
                      onChange={(e) => {
                        const code = e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '');
                        setSurvey({ ...survey, code, sheetName: survey.sheetName === survey.code ? code : survey.sheetName });
                      }}
                    />
                  </label>
                  <label className="field">
                    <span>Export sheet name</span>
                    <input value={survey.sheetName} maxLength={31} onChange={(e) => setSurvey({ ...survey, sheetName: e.target.value })} />
                  </label>
                  <label className="field">
                    <span>Who responds (org simulation)</span>
                    <RespondentsPicker value={respondentsFor(survey)} org={study.org ?? []} onChange={(v) => setSurvey({ ...survey, respondents: v })} />
                  </label>
                  <label className="field">
                    <span>Respondent's own code is in</span>
                    <select value={identityCodeFor(survey)} onChange={(e) => setSurvey({ ...survey, identityCode: e.target.value })}>
                      <option value="">(none)</option>
                      {survey.sections
                        .filter((s) => s.kind !== 'roster')
                        .flatMap((s) => s.questions)
                        .filter((q) => q.type === 'text')
                        .map((q) => (
                          <option key={q.id} value={q.code}>{q.code}</option>
                        ))}
                    </select>
                  </label>
                </div>
                <div className="row gap">
                  <button
                    className="btn small"
                    onClick={() => confirm('Renumber all question codes as CODE-LetterN? Export columns will change to match.') && setSurvey(renumberSurvey(survey))}
                  >
                    Renumber question codes
                  </button>
                  <div className="spacer" />
                  <button className="btn small ghost danger" onClick={removeSurvey}>Delete survey</button>
                </div>
              </div>
            )}
            {dupCodes.size > 0 && <div className="alert small">Duplicate codes: {[...dupCodes].join(', ')}. Each export column needs a unique code.</div>}
          </div>

          {survey.sections.map((sec, si) => (
            <SectionBlock
              key={sec.id}
              survey={survey}
              sec={sec}
              dupCodes={dupCodes}
              openQ={openQ}
              setOpenQ={setOpenQ}
              onChange={(next) => setSurvey({ ...survey, sections: survey.sections.map((s) => (s.id === sec.id ? next : s)) })}
              onMove={(dir) => setSurvey({ ...survey, sections: move(survey.sections, si, dir) })}
              onDelete={() =>
                confirm(`Delete section “${sec.title}” and its ${sec.questions.length} questions?`) &&
                setSurvey({ ...survey, sections: survey.sections.filter((s) => s.id !== sec.id) })
              }
            />
          ))}

          <div className="row gap">
            <button
              className="btn"
              onClick={() => {
                const used = new Set(survey.sections.map((s) => s.letter));
                const letter = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find((l) => !used.has(l)) ?? 'X';
                setSurvey({ ...survey, sections: [...survey.sections, newSection('New section', letter)] });
              }}
            >
              + Add section
            </button>
            <button
              className="btn"
              title="Questions answered once per item (e.g. per direct report), exported to their own sheet"
              onClick={() => {
                const sec = newSection('Repeating group', 'T', 'roster');
                sec.roster!.sheetName = `${survey.code}_TEAM`;
                setSurvey({ ...survey, sections: [...survey.sections, sec] });
              }}
            >
              + Add repeating group
            </button>
          </div>
        </main>
      ) : (
        <main className="editor">
          <div className="empty">No surveys yet. Add one from the left.</div>
        </main>
      )}
    </div>
  );
}

function SectionBlock({
  survey,
  sec,
  dupCodes,
  openQ,
  setOpenQ,
  onChange,
  onMove,
  onDelete,
}: {
  survey: Survey;
  sec: Section;
  dupCodes: Set<string>;
  openQ: string | null;
  setOpenQ: (id: string | null) => void;
  onChange: (s: Section) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}) {
  const [settings, setSettings] = useState(false);
  const [adding, setAdding] = useState(false);
  const roster = sec.kind === 'roster' ? sec.roster : undefined;
  const setRoster = (patch: Partial<NonNullable<Section['roster']>>) => onChange({ ...sec, roster: { ...sec.roster!, ...patch } });
  const linkable = survey.sections.filter((s) => s.kind !== 'roster').flatMap((s) => s.questions).filter((q) => q.type === 'text' || q.type === 'number');

  const add = (type: QType) => {
    const nq = newQuestion(type, nextCode(survey, sec));
    onChange({ ...sec, questions: [...sec.questions, nq] });
    setOpenQ(nq.id);
    setAdding(false);
  };

  return (
    <section className={`section ${roster ? 'roster' : ''}`}>
      <div className="section-head">
        <input className="section-title" value={sec.title} onChange={(e) => onChange({ ...sec, title: e.target.value })} />
        <span className="muted small">{sec.questions.length} question{sec.questions.length === 1 ? '' : 's'}</span>
        <button className={`icon ${settings ? 'on' : ''}`} title="Section settings" aria-label="Section settings" onClick={() => setSettings(!settings)}><Icon name="sliders" /></button>
        <button className="icon" title="Move section up" aria-label="Move section up" onClick={() => onMove(-1)}><Icon name="arrowUp" /></button>
        <button className="icon" title="Move section down" aria-label="Move section down" onClick={() => onMove(1)}><Icon name="arrowDown" /></button>
        <button className="icon danger" title="Delete section" aria-label="Delete section" onClick={onDelete}><Icon name="x" /></button>
      </div>
      {roster && (
        <div className="muted small roster-note">
          <Icon name="repeat" size={13} /> Answered once per <b>{roster.itemLabel || 'item'}</b> · exported to its own <b>{roster.sheetName}</b> sheet
          {roster.parentKeyCode ? <> linked by {roster.parentKeyCode}</> : null}
        </div>
      )}

      {settings && (
        <div className="settings">
          <div className="grid-4">
            <label className="field">
              <span>Code letter (for auto-numbering)</span>
              <input className="letter" value={sec.letter} maxLength={3} onChange={(e) => onChange({ ...sec, letter: e.target.value.toUpperCase() })} />
            </label>
            {roster && (
              <>
                <label className="field">
                  <span>Each row is a…</span>
                  <input value={roster.itemLabel} onChange={(e) => setRoster({ itemLabel: e.target.value })} />
                </label>
                <label className="field">
                  <span>Sheet name</span>
                  <input value={roster.sheetName} maxLength={31} onChange={(e) => setRoster({ sheetName: e.target.value })} />
                </label>
                <label className="field">
                  <span>Row key column header</span>
                  <input value={roster.itemKeyHeader} onChange={(e) => setRoster({ itemKeyHeader: e.target.value })} />
                </label>
                <label className="field">
                  <span>Link rows to respondent via</span>
                  <select value={roster.parentKeyCode} onChange={(e) => setRoster({ parentKeyCode: e.target.value })}>
                    <option value="">(Response ID)</option>
                    {linkable.map((q) => (
                      <option key={q.id} value={q.code}>{q.code}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Link column header</span>
                  <input value={roster.parentKeyHeader} onChange={(e) => setRoster({ parentKeyHeader: e.target.value })} />
                </label>
              </>
            )}
          </div>
        </div>
      )}

      {sec.questions.map((q, qi) => (
        <QuestionEditor
          key={q.id}
          q={q}
          survey={survey}
          inRoster={!!roster}
          duplicateCode={dupCodes.has(q.code)}
          open={openQ === q.id}
          onToggle={() => setOpenQ(openQ === q.id ? null : q.id)}
          onChange={(nq: Question) => onChange({ ...sec, questions: sec.questions.map((x) => (x.id === q.id ? nq : x)) })}
          onMove={(dir) => onChange({ ...sec, questions: move(sec.questions, qi, dir) })}
          onDuplicate={() => {
            const copy = { ...structuredClone(q), id: uid(), code: nextCode(survey, sec) };
            const qs = [...sec.questions];
            qs.splice(qi + 1, 0, copy);
            onChange({ ...sec, questions: qs });
            setOpenQ(copy.id);
          }}
          onDelete={() => onChange({ ...sec, questions: sec.questions.filter((x) => x.id !== q.id) })}
        />
      ))}

      {adding ? (
        <div className="type-picker">
          {QUICK_TYPES.map((t) => (
            <button key={t} className="btn small" onClick={() => add(t)}>{QTYPE_LABELS[t]}</button>
          ))}
          <button className="btn small ghost" onClick={() => setAdding(false)}>Cancel</button>
        </div>
      ) : (
        <button className="btn small dashed" onClick={() => setAdding(true)}><Icon name="plus" size={14} /> Add question</button>
      )}
    </section>
  );
}
