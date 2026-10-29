import type { KeyboardEvent, ReactNode } from 'react';

/**
 * onKeyDown for a radiogroup: the arrow keys, Home and End move to another radio and choose it, as in a native radio
 * group. With radioTab, the group is one tab stop.
 */
export function radioKeys(e: KeyboardEvent<HTMLElement>) {
  const step = ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as Record<string, number>)[e.key];
  if (step === undefined && e.key !== 'Home' && e.key !== 'End') return;
  const radios = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]:not(:disabled)')];
  const at = radios.indexOf(document.activeElement as HTMLElement);
  if (at < 0) return;
  e.preventDefault();
  const next = radios[e.key === 'Home' ? 0 : e.key === 'End' ? radios.length - 1 : (at + step + radios.length) % radios.length];
  next.focus();
  if (next.getAttribute('aria-checked') !== 'true') next.click();
}

/** A radio's tabIndex: the checked one is the group's tab stop, or the first while none is. */
export const radioTab = (checked: boolean, index: number, anyChecked: boolean) => (checked || (index === 0 && !anyChecked) ? 0 : -1);

/** A row of segments to choose one of, named by label or by the element labelledBy points to. */
export default function Segmented<T extends string>({
  label,
  labelledBy,
  value,
  options,
  onChange,
  className = ''
}: {
  label?: string;
  labelledBy?: string;
  value: T | null;
  /** value, what the segment shows and, when that isn't text, what it's called */
  options: readonly (readonly [T, ReactNode, string?])[];
  onChange: (value: T) => void;
  className?: string;
}) {
  const anyChecked = options.some(([option]) => option === value);
  return (
    <div className={`segmented small ${className}`.trim()} role="radiogroup" aria-label={label} aria-labelledby={labelledBy} onKeyDown={radioKeys}>
      {options.map(([option, text, spoken], i) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          aria-label={spoken}
          tabIndex={radioTab(value === option, i, anyChecked)}
          className={`segment ${value === option ? 'active' : ''}`}
          onClick={() => onChange(option)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
