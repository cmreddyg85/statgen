import type { ReactNode } from 'react';
import { Button, Spinner } from './Button';

/** Loading, empty and error states share one look across every screen. */

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-[var(--color-muted)]">
      <Spinner className="h-6 w-6 text-[var(--color-primary)]" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M4 7h16M4 12h16M4 17h10"
            stroke="var(--color-muted)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="max-w-sm text-[13px] text-[var(--color-muted)]">{message}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-red-50">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 8v5M12 16.5v.5"
            stroke="var(--color-danger)"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <circle cx="12" cy="12" r="9" stroke="var(--color-danger)" strokeWidth="1.5" />
        </svg>
      </div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="max-w-md text-[13px] text-[var(--color-muted)]">{message}</p>
      {onRetry && (
        <div className="mt-3">
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}
    </div>
  );
}

export function AccessDenied() {
  return (
    <div className="card mx-auto max-w-lg px-6 py-12 text-center">
      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-red-50">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect
            x="5"
            y="10"
            width="14"
            height="10"
            rx="2"
            stroke="var(--color-danger)"
            strokeWidth="1.5"
          />
          <path d="M8 10V7a4 4 0 118 0v3" stroke="var(--color-danger)" strokeWidth="1.5" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold">Access denied</h2>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        This area is restricted to administrators. If you believe you should have access,
        contact your administrator.
      </p>
    </div>
  );
}
