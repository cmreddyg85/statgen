import { describe, expect, it } from 'vitest';
import { extractBranchTransactions } from '../src/sbi/extract.js';

// Positions as pdfjs reports them for a real statement's details column.
const items = [
  { str: 'WDL TFR', x: 138, y: 304 },
  { str: 'UPI/DR/609187953259/Jar/YESB/J', x: 138, y: 295 },
  { str: 'ARRETAIL@/Gold wil', x: 138, y: 286 },
  { str: '0097692162094 AT 64367 HMT', x: 138, y: 276 },
  { str: 'SWARNAPURI COLONY BRANCH', x: 138, y: 267 },
  { str: '629.81', x: 518, y: 297 },
  { str: 'WDL TFR', x: 138, y: 254 },
  { str: 'UPI/DR/609281819291/Jar/YESB/J', x: 138, y: 245 },
];

describe('extractBranchTransactions', () => {
  it('reads the wrapped branch name and stops at the next transaction', () => {
    expect(extractBranchTransactions(items, '64367')).toBe('HMT SWARNAPURI COLONY BRANCH');
  });

  it('is empty when no transaction carries the branch code', () => {
    expect(extractBranchTransactions(items, '11111')).toBe('');
    expect(extractBranchTransactions(items, '')).toBe('');
  });
});
