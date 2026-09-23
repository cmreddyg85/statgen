'use client';

import { useId } from 'react';

/** A switch. Native checkbox underneath, so keyboard and screen readers work. */
export function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();

  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <label
        htmlFor={id}
        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--color-primary)] ${
          checked
            ? 'border-[var(--color-primary)] bg-[var(--color-primary)]'
            : 'border-[var(--color-line)] bg-slate-200'
        } ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
      >
        <span
          className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-all ${
            checked ? 'left-[18px]' : 'left-0.5'
          }`}
        />
      </label>
      <div className="min-w-0">
        <label
          htmlFor={id}
          className={`text-sm font-medium ${disabled ? '' : 'cursor-pointer'}`}
        >
          {label}
        </label>
        {hint && <p className="text-xs text-[var(--color-muted)]">{hint}</p>}
      </div>
    </div>
  );
}
