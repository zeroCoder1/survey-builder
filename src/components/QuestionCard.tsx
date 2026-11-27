import { useEffect, useRef, useState, type DragEvent } from 'react';
import { allQuestions, normalizeForType, scaleLabel, scalePoints } from '../model';
import { TYPE_ICONS } from '../questionPresets';
import { LIKERT_LABELS, QTYPE_LABELS, type QType, type Question, type Survey } from '../types';
import Icon from './Icon';
import OptionList from './OptionList';

export interface CardDnd {
  dragging: boolean;
  dropEdge: 'before' | 'after' | null;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDrop: () => void;
}

interface Props {
  q: Question;
  survey: Survey;
  active: boolean;
  inRoster: boolean;
  duplicateCode: boolean;
  dnd: CardDnd;
  onActivate: () => void;
  onClose: () => void;
  onChange: (q: Question) => void;
  onMove: (dir: -1 | 1) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

const TYPE_ORDER: QType[] = ['single', 'multi', 'likert', 'scale', 'yesno', 'text', 'longtext', 'number'];

/** One question on the builder canvas: a live preview when idle, edited in place when selected. */
export default function QuestionCard(props: Props) {
  const { q, active, dnd, duplicateCode, onActivate } = props;
  const cardRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={cardRef}
      className={`qc ${active ? 'active' : ''} ${dnd.dragging ? 'dragging' : ''} ${dnd.dropEdge ? `drop-${dnd.dropEdge}` : ''}`}
      onDragOver={dnd.onDragOver}
      onDrop={dnd.onDrop}
      onClick={() => !active && onActivate()}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && active) props.onClose();
      }}
    >
      <div
        className="qc-grip"
        draggable
        title="Drag to move"
        onDragStart={(e) => {
          if (cardRef.current) e.dataTransfer.setDragImage(cardRef.current, 24, 18);
          dnd.onDragStart(e);
        }}
        onDragEnd={dnd.onDragEnd}
        onClick={(e) => e.stopPropagation()}
      >
        <Icon name="gripHorizontal" size={16} />
      </div>
      {active ? <Editor {...props} /> : <Preview q={q} duplicateCode={duplicateCode} />}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Idle: how the respondent will see it

function Preview({ q, duplicateCode }: { q: Question; duplicateCode: boolean }) {
  const pts = q.type === 'likert' || q.type === 'scale' ? scalePoints(q) : [];
  const shown = q.options.slice(0, 6);
  return (
    <div className="qc-preview" role="button" tabIndex={0} aria-label={`Edit question ${q.code}`}>
      <div className="qc-title">
        <span className={`q-code ${duplicateCode ? 'dup' : ''}`} title={duplicateCode ? 'Duplicate code: export columns must be unique' : 'Export column'}>
          {q.code || 'no code'}
        </span>
        <span className="qc-text">
          {q.text || <em className="muted">Untitled question</em>}
          {q.required && <span className="req"> *</span>}
        </span>
      </div>
      {q.helpText && <div className="muted small qc-help">{q.helpText}</div>}
      {q.showIf?.code && (
        <div className="qc-chip">
          <Icon name="branch" size={12} /> Shown only if {q.showIf.code} is “{q.showIf.equals || '…'}”
        </div>
      )}
      <div className="qc-answer">
        {(q.type === 'single' || q.type === 'multi') && (
          <div className="pv-options">
            {shown.map((o, i) => (
              <div key={i} className="pv-option">
                <span className={`opt-glyph ${q.type === 'multi' ? 'square' : ''}`} />
                {o}
              </div>
            ))}
            {q.options.length > shown.length && <div className="muted small">+ {q.options.length - shown.length} more</div>}
            {q.type === 'multi' && <div className="muted small">{q.pickExact ? `Pick exactly ${q.pickCount}` : `Pick up to ${q.pickCount}`}</div>}
          </div>
        )}
        {pts.length > 0 && (
          <div className="pv-scale">
            {pts.map((p) => (
              <span key={p} className="pv-pt">
                <b>{p}</b>
                {scaleLabel(q, p) && <small>{scaleLabel(q, p)}</small>}
              </span>
            ))}
          </div>
        )}
        {q.type === 'yesno' && (
          <div className="pv-options inline">
            <div className="pv-option"><span className="opt-glyph" />Yes</div>
            <div className="pv-option"><span className="opt-glyph" />No</div>
          </div>
        )}
        {q.type === 'text' && <div className="pv-line">Short answer</div>}
        {q.type === 'longtext' && <div className="pv-line tall">Long answer</div>}
        {q.type === 'number' && (
          <div className="pv-line short">
            Number{q.min !== undefined || q.max !== undefined ? ` (${q.min ?? '…'} to ${q.max ?? '…'})` : ''}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Selected: edit in place

function Editor({ q, survey, inRoster, duplicateCode, onChange, onMove, onDuplicate, onDelete, onClose }: Props) {
  const set = (patch: Partial<Question>) => onChange({ ...q, ...patch });
  const [more, setMore] = useState(!!q.showIf?.code || !!q.exportHeader);
  const [showHelp, setShowHelp] = useState(!!q.helpText);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [q.text]);
  // put the cursor straight into a brand-new, empty question (runs once when the editor opens)
  const isNew = useRef(!q.text);
  useEffect(() => {
    if (isNew.current) titleRef.current?.focus();
  }, []);

  const others = allQuestions(survey).filter((x) => x.id !== q.id && (x.type === 'yesno' || x.type === 'single' || x.type === 'multi'));
  const dep = others.find((x) => x.code === q.showIf?.code);
  const depOptions = dep ? (dep.type === 'yesno' ? ['Yes', 'No'] : dep.options) : [];

  return (
    <div className="qc-editor">
      <div className="qc-top">
        <textarea
          ref={titleRef}
          className="qc-title-input"
          rows={1}
          value={q.text}
          placeholder="Question"
          aria-label="Question text"
          onChange={(e) => set({ text: e.target.value })}
        />
        <TypeMenu value={q.type} onChange={(t) => onChange(normalizeForType(q, t))} />
      </div>
      {showHelp && (
        <input className="qc-help-input" value={q.helpText ?? ''} placeholder="Description (shown under the question)" onChange={(e) => set({ helpText: e.target.value })} />
      )}

      <div className="qc-body">
        {(q.type === 'single' || q.type === 'multi') && (
          <>
            <OptionList options={q.options} multi={q.type === 'multi'} onChange={(options) => set({ options })} />
            {q.type === 'multi' && (
              <div className="qc-inline">
                Respondents pick
                <select value={q.pickExact ? 'exact' : 'upto'} onChange={(e) => set({ pickExact: e.target.value === 'exact' })}>
                  <option value="exact">exactly</option>
                  <option value="upto">up to</option>
                </select>
                <input type="number" min={1} max={Math.max(1, q.options.length)} className="num" value={q.pickCount ?? 1} onChange={(e) => set({ pickCount: Math.max(1, Number(e.target.value)) })} />
              </div>
            )}
          </>
        )}

        {q.type === 'likert' && (
          <div className="pv-scale">
            {LIKERT_LABELS.map((l, i) => (
              <span key={l} className="pv-pt">
                <b>{i + 1}</b>
                <small>{l}</small>
              </span>
            ))}
          </div>
        )}

        {q.type === 'scale' && (
          <>
            <div className="qc-inline">
              <select value={q.scaleMin ?? 1} onChange={(e) => set({ scaleMin: Number(e.target.value) })} aria-label="Scale starts at">
                {[0, 1].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              to
              <select value={q.scaleMax ?? 5} onChange={(e) => set({ scaleMax: Number(e.target.value) })} aria-label="Scale ends at">
                {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="scale-label-rows">
              {scalePoints(q).map((p) => (
                <label key={p}>
                  <b>{p}</b>
                  <input
                    value={q.scaleLabels?.[String(p)] ?? ''}
                    placeholder={p === q.scaleMin || p === q.scaleMax ? 'Label (optional)' : ''}
                    onChange={(e) => set({ scaleLabels: { ...q.scaleLabels, [String(p)]: e.target.value } })}
                  />
                </label>
              ))}
            </div>
          </>
        )}

        {q.type === 'yesno' && (
          <div className="pv-options inline">
            <div className="pv-option"><span className="opt-glyph" />Yes</div>
            <div className="pv-option"><span className="opt-glyph" />No</div>
          </div>
        )}
        {q.type === 'text' && <div className="pv-line">Short answer text</div>}
        {q.type === 'longtext' && <div className="pv-line tall">Long answer text</div>}
        {q.type === 'number' && (
          <div className="qc-inline">
            Allowed range
            <input type="number" className="num" placeholder="min" value={q.min ?? ''} onChange={(e) => set({ min: e.target.value === '' ? undefined : Number(e.target.value) })} />
            to
            <input type="number" className="num" placeholder="max" value={q.max ?? ''} onChange={(e) => set({ max: e.target.value === '' ? undefined : Number(e.target.value) })} />
          </div>
        )}
      </div>

      {more && (
        <div className="qc-more">
          {!inRoster && (
            <div className="qc-inline">
              <Icon name="branch" size={14} />
              Show only if
              <select value={q.showIf?.code ?? ''} onChange={(e) => set({ showIf: e.target.value ? { code: e.target.value, equals: '' } : undefined })}>
                <option value="">(always shown)</option>
                {others.map((x) => (
                  <option key={x.id} value={x.code}>
                    {x.code} {x.text ? `· ${x.text.slice(0, 40)}` : ''}
                  </option>
                ))}
              </select>
              {q.showIf?.code && (
                <>
                  is
                  <select value={q.showIf.equals} onChange={(e) => set({ showIf: { code: q.showIf!.code, equals: e.target.value } })}>
                    <option value="">choose an answer</option>
                    {depOptions.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                </>
              )}
            </div>
          )}
          <div className="qc-inline">
            Excel column header
            <input value={q.exportHeader ?? ''} placeholder={q.code || 'same as code'} onChange={(e) => set({ exportHeader: e.target.value })} />
          </div>
        </div>
      )}

      <div className="qc-foot">
        <label className={`code-edit ${duplicateCode ? 'dup' : ''}`} title="Question code, used as the Excel column">
          <span>Code</span>
          <input value={q.code} onChange={(e) => set({ code: e.target.value.trim() })} aria-label="Question code" />
        </label>
        <div className="spacer" />
        <button className="icon" title="Move up" aria-label="Move up" onClick={() => onMove(-1)}><Icon name="arrowUp" /></button>
        <button className="icon" title="Move down" aria-label="Move down" onClick={() => onMove(1)}><Icon name="arrowDown" /></button>
        <button className="icon" title="Duplicate" aria-label="Duplicate question" onClick={onDuplicate}><Icon name="copy" /></button>
        <button className="icon danger" title="Delete" aria-label="Delete question" onClick={onDelete}><Icon name="trash" /></button>
        <span className="foot-sep" />
        <label className="switch-row">
          Required
          <span className="switch-ui">
            <input type="checkbox" role="switch" checked={q.required} onChange={(e) => set({ required: e.target.checked })} />
            <span />
          </span>
        </label>
        <div className="menu-wrap">
          <MoreMenu
            items={[
              { label: showHelp ? 'Remove description' : 'Add description', on: showHelp, onClick: () => (showHelp && set({ helpText: '' }), setShowHelp(!showHelp)) },
              { label: inRoster ? 'Excel column header' : 'Conditional logic & column header', on: more, onClick: () => setMore(!more) },
            ]}
          />
        </div>
        <button className="btn small ghost" onClick={onClose} title="Done (Esc)">Done</button>
      </div>
    </div>
  );
}

function TypeMenu({ value, onChange }: { value: QType; onChange: (t: QType) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="menu-wrap type-menu">
      <button className="type-btn" onClick={() => setOpen(!open)} aria-haspopup="listbox" aria-expanded={open}>
        <Icon name={TYPE_ICONS[value]} size={16} />
        <span>{QTYPE_LABELS[value]}</span>
        <Icon name="chevronDown" size={14} />
      </button>
      {open && (
        <div className="menu" role="listbox" onMouseLeave={() => setOpen(false)}>
          {TYPE_ORDER.map((t) => (
            <button
              key={t}
              role="option"
              aria-selected={t === value}
              className={t === value ? 'on' : ''}
              onClick={() => {
                onChange(t);
                setOpen(false);
              }}
            >
              <span className="row gap center">
                <Icon name={TYPE_ICONS[t]} size={16} /> {QTYPE_LABELS[t]}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MoreMenu({ items }: { items: Array<{ label: string; on: boolean; onClick: () => void }> }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="icon" title="More options" aria-label="More options" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="more" />
      </button>
      {open && (
        <div className="menu up" role="menu" onMouseLeave={() => setOpen(false)}>
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitemcheckbox"
              aria-checked={it.on}
              onClick={() => {
                it.onClick();
                setOpen(false);
              }}
            >
              <span>{it.label}</span>
              {it.on && <Icon name="check" size={14} />}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
