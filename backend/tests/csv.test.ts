import { describe, expect, it } from 'vitest';
import { parseCsv, toCsv } from '../src/utils/csv.js';

describe('csv', () => {
  it('round-trips commas, quotes and newlines', () => {
    const rows = [['a', 'b,c', 'd"e', 'f\ng'], ['', '[{"x":1}]', '1', '']];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});
