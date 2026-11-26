import { scaleLabel, scalePoints } from '../model';
import type { AnswerValue, Question } from '../types';

interface Props {
  q: Question;
  value: AnswerValue;
  onChange: (v: AnswerValue) => void;
  error?: string | null;
  name: string;
}

/** Renders one question for a respondent. */
export default function QuestionInput({ q, value, onChange, error, name }: Props) {
  return (
    <div className={`q-input ${error ? 'has-error' : ''}`}>
      <div className="q-label">
        <span className="q-code">{q.code}</span>
        <span>
          {q.text || <em className="muted">Untitled question</em>}
          {q.required && <span className="req"> *</span>}
        </span>
      </div>
      {q.helpText && <div className="muted small help">{q.helpText}</div>}
      <Control q={q} value={value} onChange={onChange} name={name} />
      {error && <div className="error small">{error}</div>}
    </div>
  );
}

function Control({ q, value, onChange, name }: Omit<Props, 'error'>) {
  switch (q.type) {
    case 'likert':
    case 'scale': {
      const pts = scalePoints(q);
      return (
        <div className="scale" role="radiogroup">
          {pts.map((p) => (
            <label key={p} className={`scale-pt ${Number(value) === p ? 'on' : ''}`}>
              <input type="radio" name={name} checked={Number(value) === p} onChange={() => onChange(p)} />
              <span className="pt">{p}</span>
              <span className="pt-label">{scaleLabel(q, p)}</span>
            </label>
          ))}
        </div>
      );
    }
    case 'yesno':
    case 'single': {
      const options = q.type === 'yesno' ? ['Yes', 'No'] : q.options;
      if (options.length > 8)
        return (
          <select value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value || null)}>
            <option value="">Select…</option>
            {options.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        );
      return (
        <div className={`choices ${q.type === 'yesno' ? 'inline' : ''}`}>
          {options.map((o) => (
            <label key={o} className={`choice ${value === o ? 'on' : ''}`}>
              <input type="radio" name={name} checked={value === o} onChange={() => onChange(o)} />
              {o}
            </label>
          ))}
        </div>
      );
    }
    case 'multi': {
      const sel = Array.isArray(value) ? value : [];
      const full = !!q.pickCount && sel.length >= q.pickCount;
      return (
        <>
          <div className="muted small">
            {q.pickExact ? `Pick exactly ${q.pickCount}` : `Pick up to ${q.pickCount}`} · {sel.length} selected
          </div>
          <div className="choices">
            {q.options.map((o) => {
              const on = sel.includes(o);
              return (
                <label key={o} className={`choice ${on ? 'on' : ''} ${!on && full ? 'disabled' : ''}`}>
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={!on && full}
                    onChange={() => onChange(on ? sel.filter((x) => x !== o) : [...sel, o])}
                  />
                  {o}
                </label>
              );
            })}
          </div>
        </>
      );
    }
    case 'number':
      return (
        <input
          type="number"
          className="num"
          value={value === null || value === undefined ? '' : String(value)}
          min={q.min}
          max={q.max}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        />
      );
    case 'longtext':
      return <textarea rows={3} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />;
    default:
      return <input type="text" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />;
  }
}
