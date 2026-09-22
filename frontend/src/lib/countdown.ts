/**
 * Countdown maths for the session timer (PRD 8.3).
 *
 * The client never keeps its own session clock: remaining time is always
 * derived from the server's absolute `expiresAt`, so a sleeping tab or a
 * suspended laptop cannot drift out of sync with the real expiry.
 */

export type TimerState = 'normal' | 'warning' | 'expiring' | 'expired';

export const WARNING_THRESHOLD_MS = 2 * 60 * 1000;
export const EXPIRING_THRESHOLD_MS = 30 * 1000;

export function remainingMs(expiresAt: string, now: number = Date.now()): number {
  const expiry = new Date(expiresAt).getTime();
  if (Number.isNaN(expiry)) return 0;
  return Math.max(0, expiry - now);
}

export function timerState(remaining: number): TimerState {
  if (remaining <= 0) return 'expired';
  if (remaining <= EXPIRING_THRESHOLD_MS) return 'expiring';
  if (remaining <= WARNING_THRESHOLD_MS) return 'warning';
  return 'normal';
}

/**
 * MM:SS for short (user) sessions, HH:MM:SS once an hour or more remains,
 * matching the per-role formats in the PRD.
 */
export function formatCountdown(remaining: number): string {
  const totalSeconds = Math.floor(remaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, '0');

  return hours > 0
    ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}
