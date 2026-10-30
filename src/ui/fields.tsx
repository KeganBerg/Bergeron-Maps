import { forwardRef, useEffect, useState, type InputHTMLAttributes } from 'react';

/**
 * Text/number input that commits on Enter or blur (not every keystroke), so
 * one edit is one undo step. Escape reverts.
 */
type CommitInputProps = {
  value: string | number;
  onCommit: (v: string) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>;

export const CommitInput = forwardRef<HTMLInputElement, CommitInputProps>(function CommitInput(
  { value, onCommit, type = 'text', onBlur, ...rest },
  ref,
) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    if (draft !== String(value)) onCommit(draft);
  };
  return (
    <input
      {...rest}
      ref={ref}
      type={type}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => {
        commit();
        onBlur?.(e);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commit();
          (e.target as HTMLInputElement).blur();
        } else if (e.key === 'Escape') {
          setDraft(String(value));
          (e.target as HTMLInputElement).blur();
        }
        e.stopPropagation();
      }}
    />
  );
});

export const toNumber = (v: string, fallback: number, min = -Infinity, max = Infinity) => {
  const n = Number(v);
  return Number.isFinite(n) && v.trim() !== '' ? Math.max(min, Math.min(max, n)) : fallback;
};
