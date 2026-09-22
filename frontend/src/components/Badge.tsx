import type { ReactNode } from 'react';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const TONES: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700 border-slate-200',
  success: 'bg-green-50 text-[var(--color-success)] border-green-200',
  warning: 'bg-amber-50 text-[var(--color-warning)] border-amber-200',
  danger: 'bg-red-50 text-[var(--color-danger)] border-red-200',
  info: 'bg-blue-50 text-[var(--color-primary-dark)] border-blue-200',
};

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

/** Status text always accompanies the colour, never colour alone. */
export function StatusDot({ tone }: { tone: Tone }) {
  const colors: Record<Tone, string> = {
    neutral: 'bg-slate-400',
    success: 'bg-[var(--color-success)]',
    warning: 'bg-[var(--color-warning)]',
    danger: 'bg-[var(--color-danger)]',
    info: 'bg-[var(--color-primary)]',
  };
  return <span className={`h-1.5 w-1.5 rounded-full ${colors[tone]}`} aria-hidden="true" />;
}
