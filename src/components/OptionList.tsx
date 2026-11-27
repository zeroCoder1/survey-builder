import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import Icon from './Icon';

interface Props {
  options: string[];
  multi: boolean;
  onChange: (options: string[]) => void;
}

/**
 * Editable answer options, one row each. Enter adds a row below, Backspace on an empty row removes it,
 * pasting several lines adds them as separate options, and rows can be dragged to reorder.
 */
export default function OptionList({ options, multi, onChange }: Props) {
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  useEffect(() => {
    if (focusIndex === null) return;
    const el = inputs.current[focusIndex];
    if (el) {
      el.focus();
      el.select();
    }
    setFocusIndex(null);
  }, [focusIndex, options.length]);

  const setAt = (i: number, v: string) => onChange(options.map((o, j) => (j === i ? v : o)));
  const insertAfter = (i: number, values: string[]) => {
    const next = [...options];
    next.splice(i + 1, 0, ...values);
    onChange(next);
    setFocusIndex(i + values.length);
  };
  const removeAt = (i: number) => {
    if (options.length <= 1) return;
    onChange(options.filter((_, j) => j !== i));
    setFocusIndex(Math.max(0, i - 1));
  };
  const nextLabel = () => `Option ${options.length + 1}`;

  const onKey = (i: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      insertAfter(i, [nextLabel()]);
    } else if (e.key === 'Backspace' && options[i] === '' && options.length > 1) {
      e.preventDefault();
      removeAt(i);
    } else if (e.key === 'ArrowDown' && i < options.length - 1) {
      e.preventDefault();
      inputs.current[i + 1]?.focus();
    } else if (e.key === 'ArrowUp' && i > 0) {
      e.preventDefault();
      inputs.current[i - 1]?.focus();
    }
  };

  const onPaste = (i: number) => (e: ClipboardEvent<HTMLInputElement>) => {
    const lines = e.clipboardData
      .getData('text')
      .split(/\r?\n/)
      .map((l) => l.replace(/^\s*(?:[-*•–]|\d+[.)])\s+/, '').trim())
      .filter(Boolean);
    if (lines.length < 2) return;
    e.preventDefault();
    // pasting into an empty or placeholder row replaces it; otherwise the lines go below it
    const next = [...options];
    const replaceCurrent = !next[i].trim() || /^Option \d+$/.test(next[i]);
    if (replaceCurrent) next.splice(i, 1, ...lines);
    else next.splice(i + 1, 0, ...lines);
    onChange(next);
    setFocusIndex(replaceCurrent ? i + lines.length - 1 : i + lines.length);
  };

  const drop = (to: number) => {
    if (dragFrom === null || dragFrom === to) return;
    const next = [...options];
    const [item] = next.splice(dragFrom, 1);
    next.splice(to > dragFrom ? to - 1 : to, 0, item);
    onChange(next);
  };

  return (
    <div className="opt-list">
      {options.map((o, i) => (
        <div
          key={i}
          className={`opt-row ${dragOver === i ? 'drop-before' : ''} ${dragFrom === i ? 'dragging' : ''}`}
          onDragOver={(e) => {
            if (dragFrom === null) return;
            e.preventDefault();
            setDragOver(i);
          }}
          onDrop={() => {
            drop(i);
            setDragFrom(null);
            setDragOver(null);
          }}
        >
          <span
            className="opt-grip"
            draggable
            title="Drag to reorder"
            onDragStart={(e) => {
              setDragFrom(i);
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', o);
            }}
            onDragEnd={() => {
              setDragFrom(null);
              setDragOver(null);
            }}
          >
            <Icon name="grip" size={14} />
          </span>
          <span className={`opt-glyph ${multi ? 'square' : ''}`} aria-hidden="true" />
          <input
            ref={(el) => (inputs.current[i] = el)}
            value={o}
            aria-label={`Option ${i + 1}`}
            onChange={(e) => setAt(i, e.target.value)}
            onKeyDown={onKey(i)}
            onPaste={onPaste(i)}
            onBlur={() => {
              if (!o.trim() && options.length > 1) onChange(options.filter((_, j) => j !== i));
            }}
          />
          <button className="icon tiny" title="Remove option" aria-label={`Remove option ${i + 1}`} disabled={options.length <= 1} onClick={() => removeAt(i)}>
            <Icon name="x" size={14} />
          </button>
        </div>
      ))}
      <div
        className={`opt-row add ${dragOver === options.length ? 'drop-before' : ''}`}
        onDragOver={(e) => {
          if (dragFrom === null) return;
          e.preventDefault();
          setDragOver(options.length);
        }}
        onDrop={() => {
          drop(options.length);
          setDragFrom(null);
          setDragOver(null);
        }}
      >
        <span className="opt-grip" />
        <span className={`opt-glyph ${multi ? 'square' : ''}`} aria-hidden="true" />
        <button className="opt-add" onClick={() => insertAfter(options.length - 1, [nextLabel()])}>
          Add option
        </button>
        {!options.some((o) => o.trim().toLowerCase() === 'other') && (
          <>
            <span className="muted small">or</span>
            <button className="opt-add accent" onClick={() => onChange([...options, 'Other'])}>
              add “Other”
            </button>
          </>
        )}
      </div>
      <p className="muted small opt-tip">Tip: press Enter for a new option, or paste a list to add several at once.</p>
    </div>
  );
}
