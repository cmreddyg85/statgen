import { describe, expect, it } from 'vitest';
import { clusterLines, processLabeledColumn } from '../src/sbi/extract.js';

const LABELS = [
  ['MICR Code', 'micrCode'],
  ['Nominee Name', 'nomineeName'],
];

const read = (items: { str: string; x: number; y: number }[]) =>
  processLabeledColumn(clusterLines(items), LABELS).fields;

// Positions as pdfjs reports them on two real statements.
describe('labeled fields', () => {
  it('keeps a nominee printed a few points above its label off the MICR code', () => {
    expect(
      read([
        { str: 'MICR Code', x: 349, y: 436.66 },
        { str: ': 500002586', x: 443, y: 437.73 },
        { str: 'Nominee Name', x: 348, y: 410.66 },
        { str: ':', x: 442, y: 410.73 },
        { str: 'B VENKATA SUBBA REDDY', x: 451, y: 413.98 },
      ]),
    ).toEqual({ micrCode: '500002586', nomineeName: 'B VENKATA SUBBA REDDY' });
  });

  it('joins a nominee wrapped around its label', () => {
    expect(
      read([
        { str: 'MICR Code', x: 349, y: 436.66 },
        { str: ': 522002306', x: 443, y: 437.73 },
        { str: 'Nominee Name', x: 348, y: 410.66 },
        { str: ':', x: 442, y: 410.73 },
        { str: 'XXXXXXXXXXXXXXXXXXXXXXXXXXXX', x: 451, y: 415.83 },
        { str: 'XX', x: 451, y: 409.43 },
      ]),
    ).toEqual({ micrCode: '522002306', nomineeName: 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' });
  });
});
