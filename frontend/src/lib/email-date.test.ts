import assert from 'node:assert/strict';
import test from 'node:test';
import { retargetDate } from './email-date.ts';

const now = new Date(2026, 9, 2);
const jul6 = { date: '2026-07-06', hour: 5, minute: 11, meridiem: 'PM' as const };
const apr8 = { date: '2022-04-08', hour: 10, minute: 54, meridiem: 'AM' as const };

test('keeps the pasted layout', () => {
  assert.equal(retargetDate('Tue, Aug 11, 2:27 PM (9 days ago)', jul6, now), 'Mon, Jul 6, 5:11 PM');
  assert.equal(retargetDate('Tue, Aug 11, 2026 at 2:27 PM', jul6, now), 'Mon, Jul 6, 2026 at 5:11 PM');
  assert.equal(retargetDate('Aug 11, 2026, 2:27 PM', jul6, now), 'Jul 6, 2026, 5:11 PM');
  assert.equal(retargetDate('Tue, Aug 11, 2026 at 2:29 PM', apr8, now), 'Fri, Apr 8, 2022 at 10:54 AM');
  assert.equal(retargetDate('11 August 2026 14:29', apr8, now), '8 April 2022 10:54');
  assert.equal(retargetDate('11/08/2026', apr8, now), '08/04/2022');
});

test('adds the year when the target is another year', () => {
  assert.equal(retargetDate('Mon, Aug 3, 5:07 PM (20 hours ago)', apr8, now), 'Fri, 8 Apr 2022, 10:54 AM');
});

test('leaves non-dates alone', () => {
  assert.equal(retargetDate('Hello Priya', jul6, now), null);
  assert.equal(retargetDate('May I ask', jul6, now), null);
  assert.equal(retargetDate('Aug 11, 2026', { ...jul6, date: '' }, now), null);
});
