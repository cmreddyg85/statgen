import { describe, expect, it } from 'vitest';
import { buildReference } from '../src/services/student-record.service.js';
import { findModule, modulesForRole, MODULE_KEYS } from '../src/config/modules.js';
import { generateRecordsSchema } from '../src/validation/schemas.js';

describe('reference format', () => {
  const at = new Date('2026-09-22T10:00:00.000Z');

  it('encodes module, date and a zero-padded sequence', () => {
    expect(buildReference('sbi', 1, at)).toBe('SBI-20260922-0001');
    expect(buildReference('pf', 42, at)).toBe('PF-20260922-0042');
  });

  it('keeps four digits up to 9999 and grows beyond', () => {
    expect(buildReference('hdfc', 9999, at)).toBe('HDFC-20260922-9999');
    expect(buildReference('hdfc', 10_000, at)).toBe('HDFC-20260922-10000');
  });

  it('produces a distinct reference per sequence number', () => {
    const refs = new Set(
      Array.from({ length: 50 }, (_, i) => buildReference('gmail', i + 1, at)),
    );
    expect(refs.size).toBe(50);
  });
});

describe('module registry', () => {
  it('exposes exactly the five business modules', () => {
    expect([...MODULE_KEYS]).toEqual(['sbi', 'idbi', 'hdfc', 'pf', 'gmail']);
  });

  it('resolves a known module and rejects an unknown one', () => {
    expect(findModule('sbi')?.label).toBe('SBI');
    expect(findModule('axis')).toBeUndefined();
  });

  it('offers every module to both roles', () => {
    expect(modulesForRole('USER')).toHaveLength(5);
    expect(modulesForRole('ADMIN')).toHaveLength(5);
  });
});

describe('generate request validation', () => {
  it('defaults the batch size to 5', () => {
    expect(generateRecordsSchema.parse({ module: 'sbi' }).count).toBe(5);
  });

  it('accepts a count within range and coerces a numeric string', () => {
    expect(generateRecordsSchema.parse({ module: 'sbi', count: '12' }).count).toBe(12);
  });

  it('rejects a module that is missing, and counts outside 1–50', () => {
    expect(generateRecordsSchema.safeParse({ count: 5 }).success).toBe(false);
    expect(generateRecordsSchema.safeParse({ module: 'sbi', count: 0 }).success).toBe(false);
    expect(generateRecordsSchema.safeParse({ module: 'sbi', count: 51 }).success).toBe(false);
  });
});
