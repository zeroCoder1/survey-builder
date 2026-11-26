import Icon from './Icon';
import { allQuestions, normalizeForType, scalePoints, typeSummary } from '../model';
import { QTYPE_LABELS, type QType, type Question, type Survey } from '../types';

interface Props {
  q: Question;
  survey: Survey;
  open: boolean;
  inRoster: boolean;
  duplicateCode: boolean;
  onToggle: () => void;
  onChange: (q: Question) => void;
  onMove: (dir: -1 | 1) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

export default function QuestionEditor({ q, survey, open, inRoster, duplicateCode, onToggle, onChange, onMove, onDuplicate, onDelete }: Props) {
  const set = (patch: Partial<Question>) => onChange({ ...q, ...patch });
  const others = allQuestions(survey).filter((x) => x.id !== q.id && (x.type === 'yesno' || x.type === 'single' || x.type === 'multi'));
  const dep = others.find((x) => x.code === q.showIf?.code);
  const depOptions = dep ? (dep.type === 'yesno' ? ['Yes', 'No'] : dep.options) : [];

  return (
    <div className={`card q-card ${open ? 'open' : ''}`}>
      <div className="q-head" onClick={onToggle}>
        <span className={`q-code ${duplicateCode ? 'dup' : ''}`} title={duplicateCode ? 'Duplicate code — export columns must be unique' : ''}>
          {q.code || '—'}
        </span>
        <div className="q-head-text">
          <div>{q.text || <em className="muted">Untitled question</em>}</div>
          <div className="muted small">
            {QTYPE_LABELS[q.type]}
            {q.type !== 'likert' && q.type !== 'text' && q.type !== 'longtext' ? ` · ${typeSummary(q)}` : ''}
            {q.showIf?.code ? ` · shown if ${q.showIf.code} = ${q.showIf.equals}` : ''}
            {!q.required ? ' · optional' : ''}
          </div>
        </div>
        <div className="q-actions" onClick={(e) => e.stopPropagation()}>
          <button className="icon" title="Move up" aria-label="Move up" onClick={() => onMove(-1)}><Icon name="arrowUp" /></button>
          <button className="icon" title="Move down" aria-label="Move down" onClick={() => onMove(1)}><Icon name="arrowDown" /></button>
          <button className="icon" title="Duplicate" aria-label="Duplicate" onClick={onDuplicate}><Icon name="copy" /></button>
          <button className="icon danger" title="Delete" aria-label="Delete" onClick={onDelete}><Icon name="x" /></button>
        </div>
      </div>

      {open && (
        <div className="q-body">
          <label className="field">
            <span>Question</span>
            <textarea rows={2} value={q.text} onChange={(e) => set({ text: e.target.value })} autoFocus={!q.text} placeholder="Type the question…" />
          </label>
          <div className="row gap center wrap" style={{ marginBottom: 10 }}>
            <select value={q.type} onChange={(e) => onChange(normalizeForType(q, e.target.value as QType))} style={{ width: 'auto' }}>
              {Object.entries(QTYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <label className="check">
              <input type="checkbox" checked={q.required} onChange={(e) => set({ required: e.target.checked })} /> Required
            </label>
            {q.type === 'multi' && (
              <span className="row gap center">
                <select value={q.pickExact ? 'exact' : 'upto'} onChange={(e) => set({ pickExact: e.target.value === 'exact' })} style={{ width: 'auto' }}>
                  <option value="exact">Pick exactly</option>
                  <option value="upto">Pick up to</option>
                </select>
                <input type="number" min={1} className="num" style={{ width: 64 }} value={q.pickCount ?? 1} onChange={(e) => set({ pickCount: Math.max(1, Number(e.target.value)) })} />
              </span>
            )}
            {q.type === 'scale' && (
              <span className="row gap center">
                <span className="muted small">from</span>
                <input type="number" className="num" style={{ width: 64 }} value={q.scaleMin ?? 1} onChange={(e) => set({ scaleMin: Number(e.target.value) })} />
                <span className="muted small">to</span>
                <input type="number" className="num" style={{ width: 64 }} value={q.scaleMax ?? 5} onChange={(e) => set({ scaleMax: Number(e.target.value) })} />
              </span>
            )}
            {q.type === 'number' && (
              <span className="row gap center">
                <span className="muted small">min</span>
                <input type="number" className="num" style={{ width: 72 }} value={q.min ?? ''} onChange={(e) => set({ min: e.target.value === '' ? undefined : Number(e.target.value) })} />
                <span className="muted small">max</span>
                <input type="number" className="num" style={{ width: 72 }} value={q.max ?? ''} onChange={(e) => set({ max: e.target.value === '' ? undefined : Number(e.target.value) })} />
              </span>
            )}
          </div>

          {(q.type === 'single' || q.type === 'multi') && (
            <label className="field">
              <span>Options, one per line</span>
              <textarea
                rows={Math.min(10, Math.max(3, q.options.length + 1))}
                value={q.options.join('\n')}
                onChange={(e) => set({ options: e.target.value.split('\n') })}
                onBlur={() => set({ options: q.options.map((o) => o.trim()).filter(Boolean) })}
              />
            </label>
          )}

          {q.type === 'scale' && (
            <div className="field">
              <span>Point labels (optional)</span>
              <div className="scale-labels">
                {scalePoints(q).slice(0, 11).map((p) => (
                  <label key={p}>
                    <b>{p}</b>
                    <input
                      value={q.scaleLabels?.[String(p)] ?? ''}
                      onChange={(e) => set({ scaleLabels: { ...q.scaleLabels, [String(p)]: e.target.value } })}
                    />
                  </label>
                ))}
              </div>
            </div>
          )}

          <details className="more">
            <summary>More options{q.showIf?.code ? ' · conditional' : ''}{q.exportHeader ? ' · custom header' : ''}</summary>
            <div className="grid-3">
              <label className="field">
                <span>Code (export column)</span>
                <input value={q.code} onChange={(e) => set({ code: e.target.value.trim() })} />
              </label>
              <label className="field span-2">
                <span>Column header override (defaults to the code)</span>
                <input value={q.exportHeader ?? ''} placeholder={q.code} onChange={(e) => set({ exportHeader: e.target.value })} />
              </label>
            </div>
            <label className="field">
              <span>Help text under the question</span>
              <input value={q.helpText ?? ''} onChange={(e) => set({ helpText: e.target.value })} />
            </label>
            {!inRoster && (
              <div className="row gap center wrap">
                <span className="muted small">Show only if</span>
                <select
                  style={{ width: 'auto' }}
                  value={q.showIf?.code ?? ''}
                  onChange={(e) => set({ showIf: e.target.value ? { code: e.target.value, equals: '' } : undefined })}
                >
                  <option value="">(always shown)</option>
                  {others.map((x) => (
                    <option key={x.id} value={x.code}>{x.code}</option>
                  ))}
                </select>
                {q.showIf?.code && (
                  <>
                    <span className="muted small">is</span>
                    <select style={{ width: 'auto' }} value={q.showIf.equals} onChange={(e) => set({ showIf: { code: q.showIf!.code, equals: e.target.value } })}>
                      <option value="">Select…</option>
                      {depOptions.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  </>
                )}
              </div>
            )}
          </details>
        </div>
      )}
    </div>
  );
}
