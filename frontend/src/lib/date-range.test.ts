import assert from 'node:assert/strict';
import test from 'node:test';
import { presetRange } from './date-range.ts';

const fri = new Date(2026, 9, 2, 15, 30); // Friday 2 Oct 2026

test('presets end today and start where they should', () => {
  assert.deepEqual(presetRange('today', fri), { from: '2026-10-02', to: '2026-10-02' });
  assert.deepEqual(presetRange('last7', fri), { from: '2026-09-26', to: '2026-10-02' });
  assert.deepEqual(presetRange('last30', fri), { from: '2026-09-03', to: '2026-10-02' });
  assert.deepEqual(presetRange('quarter', fri), { from: '2026-07-03', to: '2026-10-02' });
});

test('rolling ranges cross month and year ends', () => {
  assert.equal(presetRange('last7', new Date(2026, 0, 3)).from, '2025-12-28');
  assert.equal(presetRange('last30', new Date(2026, 2, 1)).from, '2026-01-31');
});

test('last 3 months from a month end does not overflow', () => {
  assert.deepEqual(presetRange('quarter', new Date(2026, 4, 31)), { from: '2026-03-01', to: '2026-05-31' });
});
