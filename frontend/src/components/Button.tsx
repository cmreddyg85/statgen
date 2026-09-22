'use client';

import Link from 'next/link';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-[var(--color-primary)] text-white border border-transparent hover:bg-[var(--color-primary-dark)]',
  secondary:
    'bg-white text-[var(--color-ink)] border border-[var(--color-line)] hover:bg-slate-50',
  danger: 'bg-[var(--color-danger)] text-white border border-transparent hover:bg-red-800',
  ghost:
    'bg-transparent text-[var(--color-muted)] border border-transparent hover:bg-slate-100 hover:text-[var(--color-ink)]',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-[13px]',
  md: 'h-10 px-4 text-sm',
};

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-[8px] font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-60';

function classesFor(variant: Variant, size: Size, extra = ''): string {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${extra}`;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      // Blocking on `loading` is what prevents duplicate submissions.
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={classesFor(variant, size, className)}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

interface LinkButtonProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

/** A link that reads as a button — navigation, not an action. */
export function LinkButton({
  href,
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}: LinkButtonProps) {
  return (
    <Link {...props} href={href} className={classesFor(variant, size, className)}>
      {children}
    </Link>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`h-4 w-4 animate-spin ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
