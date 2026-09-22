import { describe, expect, it } from 'vitest';
import {
  computeExpiry,
  generateSessionToken,
  hashSessionToken,
  isExpired,
  sessionLifetimeMs,
  sessionTokenMatches,
} from '../src/services/session.service.js';

describe('session lifetime', () => {
  it('gives users a 15-minute absolute lifetime', () => {
    expect(sessionLifetimeMs('USER')).toBe(15 * 60 * 1000);
  });

  it('gives admins a 24-hour absolute lifetime', () => {
    expect(sessionLifetimeMs('ADMIN')).toBe(24 * 60 * 60 * 1000);
  });

  it('computes expiry from the login instant', () => {
    const loginAt = new Date('2026-09-22T10:00:00.000Z');
    expect(computeExpiry('USER', loginAt).toISOString()).toBe('2026-09-22T10:15:00.000Z');
    expect(computeExpiry('ADMIN', loginAt).toISOString()).toBe('2026-09-23T10:00:00.000Z');
  });
});

describe('expiry checks', () => {
  const now = new Date('2026-09-22T10:00:00.000Z');

  it('treats a future timestamp as live', () => {
    expect(isExpired('2026-09-22T10:00:01.000Z', now)).toBe(false);
  });

  it('treats the exact expiry instant as expired', () => {
    expect(isExpired('2026-09-22T10:00:00.000Z', now)).toBe(true);
  });

  it('treats a past timestamp as expired', () => {
    expect(isExpired('2026-09-22T09:59:59.000Z', now)).toBe(true);
  });
});

describe('session tokens', () => {
  it('generates unique high-entropy tokens', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateSessionToken()));
    expect(tokens.size).toBe(200);
    expect([...tokens][0]!.length).toBeGreaterThanOrEqual(43);
  });

  it('hashes deterministically and never echoes the raw token', () => {
    const token = generateSessionToken();
    const hash = hashSessionToken(token);
    expect(hash).toBe(hashSessionToken(token));
    expect(hash).not.toContain(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('matches only the originating token', () => {
    const token = generateSessionToken();
    expect(sessionTokenMatches(token, hashSessionToken(token))).toBe(true);
    expect(sessionTokenMatches(generateSessionToken(), hashSessionToken(token))).toBe(false);
  });
});
