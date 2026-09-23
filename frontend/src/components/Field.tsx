'use client';

import { useId, useState, type InputHTMLAttributes } from 'react';

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  error?: string;
  hint?: string;
}

/** A password field reveals itself; every other type renders plainly. */
export function TextField({ label, error, hint, ...props }: TextFieldProps) {
  const id = useId();
  const [revealed, setRevealed] = useState(false);
  const isPassword = props.type === 'password';
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div>
      <label className="field-label" htmlFor={id}>
        {label}
        {props.required && <span className="ml-1 text-[var(--color-danger)]">*</span>}
      </label>
      <div className="relative">
        <input
          {...props}
          type={isPassword && revealed ? 'text' : props.type}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`field-input ${isPassword ? 'pr-20' : ''} ${props.className ?? ''}`}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((value) => !value)}
            aria-pressed={revealed}
            className="absolute inset-y-0 right-2 my-auto h-7 rounded px-2 text-xs font-semibold text-[var(--color-primary)] hover:bg-blue-50"
          >
            {revealed ? 'Hide' : 'Show'}
          </button>
        )}
      </div>
      {error ? (
        <p className="field-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-[var(--color-muted)]" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

interface CheckboxFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type'> {
  label: string;
  description?: string;
}

export function CheckboxField({ label, description, ...props }: CheckboxFieldProps) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <input
        {...props}
        id={id}
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded border-[var(--color-line)] accent-[var(--color-primary)]"
      />
      <div>
        <label htmlFor={id} className="text-sm font-medium text-[var(--color-ink)]">
          {label}
        </label>
        {description && (
          <p className="text-xs text-[var(--color-muted)]">{description}</p>
        )}
      </div>
    </div>
  );
}

interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  className?: string;
}

export function SelectField({ label, value, onChange, options, className = '' }: SelectFieldProps) {
  const id = useId();
  return (
    <div className={className}>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="field-input cursor-pointer"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
