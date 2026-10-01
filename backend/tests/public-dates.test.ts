import { describe, expect, it } from 'vitest';
import { toIsoDate } from '../src/routes/public.routes.js';

describe('toIsoDate', () => {
  it('accepts the three formats', () => {
    expect(toIsoDate('2026-01-31')).toBe('2026-01-31');
    expect(toIsoDate('31-01-2026')).toBe('2026-01-31');
    expect(toIsoDate('31/01/2026')).toBe('2026-01-31');
    expect(toIsoDate('29/02/2024')).toBe('2024-02-29');
  });

  it('rejects other formats, mixed separators and impossible dates', () => {
    for (const value of ['2026-1-1', '2026/01/31', '31-01/2026', '01-Jan-2026', '30/02/2026', '2026-13-01', '', undefined, ['2026-01-01']]) {
      expect(toIsoDate(value)).toBeNull();
    }
  });
});
