import { useMemo, useState } from 'react';
import { parseBulkQuestions, PRESETS, TYPE_ICONS } from '../questionPresets';
import { QTYPE_LABELS, type Question, type QType } from '../types';
import { newQuestion } from '../model';
import Icon from './Icon';

const BLANK_TYPES: QType[] = ['single', 'multi', 'likert', 'scale', 'yesno', 'text', 'longtext', 'number'];

interface Props {
  /** Returns the next free code for this section each time it is called. */
  nextCodes: (count: number) => string[];
  divisions: string[];
  onAdd: (questions: Question[]) => void;
}

/** "Add question": blank types, ready-made questions, or paste a whole list at once. */
export default function AddQuestion({ nextCodes, divisions, onAdd }: Props) {
  const [mode, setMode] = useState<'closed' | 'pick' | 'paste'>('closed');
  const [text, setText] = useState('');
  const [defaultType, setDefaultType] = useState<QType>('likert');
  const parsed = useMemo(() => parseBulkQuestions(text, defaultType), [text, defaultType]);

  const close = () => {
    setMode('closed');
    setText('');
  };

  if (mode === 'closed')
    return (
      <div className="add-q">
        <button className="btn small dashed" onClick={() => setMode('pick')}>
          <Icon name="plus" size={14} /> Add question
        </button>
      </div>
    );

  if (mode === 'paste')
    return (
      <div className="card add-panel">
        <div className="row between center">
          <b>Paste a list of questions</b>
          <button className="icon" aria-label="Close" onClick={close}><Icon name="x" /></button>
        </div>
        <p className="muted small">
          One question per line. Put answer options underneath, starting with “-” or a number. Questions with options become single choice,
          or multiple choice if the text says “pick 3” or “select all”.
        </p>
        <textarea
          rows={8}
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'I feel valued at work.\nMy manager supports my growth.\nWhich office do you work in?\n- Pune\n- Tokyo\n- Remote'}
        />
        <div className="row gap center wrap" style={{ marginTop: 10 }}>
          <label className="field inline">
            <span>Questions without options become</span>
            <select value={defaultType} onChange={(e) => setDefaultType(e.target.value as QType)} style={{ width: 'auto' }}>
              {(['likert', 'yesno', 'text', 'longtext', 'number'] as QType[]).map((t) => (
                <option key={t} value={t}>{QTYPE_LABELS[t]}</option>
              ))}
            </select>
          </label>
          <div className="spacer" />
          <span className="muted small">
            {parsed.length} question{parsed.length === 1 ? '' : 's'}
            {parsed.some((p) => p.options.length) ? `, ${parsed.filter((p) => p.options.length).length} with options` : ''}
          </span>
          <button
            className="btn primary small"
            disabled={!parsed.length}
            onClick={() => {
              const codes = nextCodes(parsed.length);
              onAdd(
                parsed.map((p, i) => ({
                  ...newQuestion(p.type, codes[i]),
                  text: p.text,
                  ...(p.options.length ? { options: p.options } : {}),
                  ...(p.type === 'multi' ? { pickCount: p.pickCount, pickExact: true } : {}),
                })),
              );
              close();
            }}
          >
            Add {parsed.length || ''} question{parsed.length === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    );

  return (
    <div className="card add-panel">
      <div className="row between center">
        <b>Add a question</b>
        <button className="icon" aria-label="Close" onClick={close}><Icon name="x" /></button>
      </div>
      <div className="add-grid">
        {BLANK_TYPES.map((t) => (
          <button
            key={t}
            className="add-tile"
            onClick={() => {
              onAdd([newQuestion(t, nextCodes(1)[0])]);
              close();
            }}
          >
            <Icon name={TYPE_ICONS[t]} size={18} />
            {QTYPE_LABELS[t]}
          </button>
        ))}
      </div>
      <div className="add-sub">Ready-made</div>
      <div className="add-grid presets">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            className="add-tile"
            onClick={() => {
              onAdd([p.build(nextCodes(1)[0], { divisions })]);
              close();
            }}
          >
            <Icon name={p.icon} size={18} />
            <span>
              {p.label}
              <small>{p.hint}</small>
            </span>
          </button>
        ))}
      </div>
      <button className="btn small ghost paste-btn" onClick={() => setMode('paste')}>
        <Icon name="clipboard" size={14} /> Paste a list of questions
      </button>
    </div>
  );
}
