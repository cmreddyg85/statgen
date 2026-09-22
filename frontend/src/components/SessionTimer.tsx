'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import {
  formatCountdown,
  remainingMs,
  timerState,
  type TimerState,
} from '@/lib/countdown';
import { useSession } from '@/lib/session-context';

const STATE_STYLES: Record<Exclude<TimerState, 'expired'>, string> = {
  normal: 'border-[var(--color-line)] bg-white text-[var(--color-ink)]',
  warning: 'border-amber-300 bg-amber-50 text-[var(--color-warning)]',
  expiring: 'border-red-300 bg-red-50 text-[var(--color-danger)]',
};

/**
 * Live session countdown (PRD 8.3 / 11.4).
 *
 * Every tick recomputes from the server-provided absolute `expiresAt`, so the
 * display cannot drift even if the tab was asleep. Reaching zero triggers the
 * same logout path as any other session end — the timer is a display of the
 * server's decision, never the decision itself.
 */
export function SessionTimer() {
  const { session, logout } = useSession();
  const [remaining, setRemaining] = useState(() => remainingMs(session.expiresAt));
  // The countdown is a live clock, so it can only be correct on the client.
  // Rendering a placeholder until mount keeps server and client markup equal.
  const [mounted, setMounted] = useState(false);
  const expiredRef = useRef(false);

  useEffect(() => {
    expiredRef.current = false;
    setMounted(true);
    setRemaining(remainingMs(session.expiresAt));

    const tick = () => {
      const next = remainingMs(session.expiresAt);
      setRemaining(next);

      if (next <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        // Best-effort server cleanup, then redirect with the reason.
        api.post('/auth/logout').catch(() => undefined);
        window.location.replace('/login?reason=session_expired');
      }
    };

    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [session.expiresAt, logout]);

  const state = timerState(remaining);
  if (mounted && state === 'expired') return null;

  // Before mount there is no meaningful countdown to colour, so the pill shows
  // its neutral style until the client takes over.
  const displayState = !mounted || state === 'expired' ? 'normal' : state;

  return (
    <div
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold tabular-nums transition-colors ${STATE_STYLES[displayState]}`}
      title={
        mounted
          ? `Your session ends at ${new Date(session.expiresAt).toLocaleTimeString()}`
          : undefined
      }
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <span className="sr-only">Time left in this session: </span>
      <span aria-live={mounted && displayState !== 'normal' ? 'polite' : 'off'}>
        {mounted ? formatCountdown(remaining) : '--:--'}
      </span>
    </div>
  );
}
