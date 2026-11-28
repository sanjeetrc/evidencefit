import { useState, type InputHTMLAttributes } from 'react';

type Native = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur' | 'min' | 'max' | 'type'>;

interface Props extends Native {
  value: number;
  min: number;
  max: number;
  /** Decimal places kept (0 = whole numbers). */
  decimals?: number;
  onCommit: (n: number) => void;
}

/**
 * Number input that holds what's typed locally and never snaps to a fallback mid-edit.
 * (Clearing a field used to reset it to e.g. 60, so typing "72" gave "6072".)
 * - While typing, a value inside [min, max] is saved straight away.
 * - On blur or Enter, the value is clamped to [min, max]. An empty or invalid entry reverts to the saved value.
 */
export default function NumberField({ value, min, max, decimals = 0, onCommit, className, ...rest }: Props) {
  const [text, setText] = useState<string | null>(null); // null = not editing → show the saved value
  const f = 10 ** decimals;
  const parse = (t: string) => {
    const n = Number(t.trim().replace(',', '.'));
    return t.trim() === '' || !Number.isFinite(n) ? null : Math.round(n * f) / f;
  };
  const finish = () => {
    if (text === null) return;
    const n = parse(text);
    if (n !== null) {
      const c = Math.min(max, Math.max(min, n));
      if (c !== value) onCommit(c);
    }
    setText(null);
  };
  const shown = text ?? String(value);
  const n = text === null ? null : parse(text);
  const outOfRange = n !== null && (n < min || n > max);
  return (
    <input
      {...rest}
      type="text"
      inputMode={decimals > 0 ? 'decimal' : 'numeric'}
      value={shown}
      aria-invalid={outOfRange || undefined}
      title={`${min}–${max}`}
      onChange={(e) => {
        setText(e.target.value);
        const v = parse(e.target.value);
        if (v !== null && v >= min && v <= max && v !== value) onCommit(v);
      }}
      onBlur={finish}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      className={`${className ?? ''} ${outOfRange ? 'border-amber-600 ring-2 ring-amber-300' : ''}`}
    />
  );
}
