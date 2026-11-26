import { LIKERT_LABELS, type Question, type Study } from '../types';
import { scaleLabel, scalePoints } from '../model';

/** A print-friendly rendering of the whole study, laid out like the source questionnaire document. */
export default function QuestionnaireView({ study }: { study: Study }) {
  return (
    <div className="container">
      <div className="row between no-print">
        <p className="muted small">Print or “Save as PDF” to share the questionnaire as a document.</p>
        <button className="btn small" onClick={() => window.print()}>Print / Save PDF</button>
      </div>
      <article className="doc">
        <h1>{study.title}</h1>
        {study.intro && <p>{study.intro}</p>}
        {study.surveys.map((s, i) => (
          <div key={s.id}>
            <h2>
              Survey {i + 1}: {s.title}
              {s.audience ? ` (${s.audience.toLowerCase()})` : ''}
            </h2>
            {s.description && <p>{s.description}</p>}
            {s.sections.map((sec) => (
              <div key={sec.id}>
                <h3>
                  {sec.title}
                  {sec.kind === 'roster' && sec.roster ? ` (for each ${sec.roster.itemLabel}; see ${sec.roster.sheetName} sheet)` : ''}
                </h3>
                {sec.questions.map((q) => (
                  <div key={q.id} className="doc-q">
                    <p>
                      <b>{q.code}</b>&nbsp;&nbsp;{q.text}
                      {q.showIf?.code && <span className="muted"> [ask if {q.showIf.code} = {q.showIf.equals}]</span>}
                    </p>
                    <p className="doc-a">{answerLine(q)}</p>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </article>
    </div>
  );
}

function answerLine(q: Question): string {
  switch (q.type) {
    case 'likert':
      return LIKERT_LABELS.map((l, i) => `${i + 1} ${l}`).join('   ') + '   [ ] [ ] [ ] [ ] [ ]';
    case 'scale': {
      const pts = scalePoints(q);
      const labelled = pts.filter((p) => scaleLabel(q, p));
      return 'Options: ' + (labelled.length ? labelled.map((p) => `${p} ${scaleLabel(q, p)}`).join(' ... ') : `${pts[0]} ... ${pts[pts.length - 1]}`);
    }
    case 'yesno':
      return '[ ] Yes     [ ] No';
    case 'single':
    case 'multi':
      return 'Options: ' + q.options.join('; ');
    default:
      return 'Answer: ______________________';
  }
}
