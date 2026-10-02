import { describe, expect, it } from 'vitest';
import { matchTransactions } from '../src/statement/match.js';

const sbi = [
  { Date: '01/03/2026', Narration: 'UPI CR', Ref: '', Debit: '', Credit: '500.00', Balance: '1500.00' },
  { Date: '04/03/2026', Narration: 'UPI DR', Ref: '', Debit: '200.00', Credit: '', Balance: '1300.00' },
];
const idbi = [
  { date: '04/03/2026 10:00:00', details: 'UPI DR', type: 'Dr', amount: '200.00', balance: '1300.00' },
  { date: '04/03/2026 23:59:30', details: 'UPI CR', type: 'Cr', amount: '50.00', balance: '1350.00' },
];

describe('matchTransactions', () => {
  it('appends one SBI row for a small difference and keeps the rest', () => {
    const { added, transactions } = matchTransactions('SBI', sbi, 1250.5);
    expect(transactions.slice(0, 2)).toEqual(sbi);
    expect(added).toEqual([
      { Date: '04/03/2026', Narration: 'UPI DR', Ref: '', Debit: '49.50', Credit: '', Balance: '1250.50' },
    ]);
  });

  it('splits a large difference into two rows that land on the target', () => {
    const { added } = matchTransactions('SBI', sbi, 25000, () => 0.5);
    expect(added).toHaveLength(2);
    expect(added.every((row) => row.Credit && !row.Debit && row.Narration === 'UPI CR')).toBe(true);
    expect(Number(added[0]!.Credit) + Number(added[1]!.Credit)).toBeCloseTo(23700);
    expect(added[1]!.Balance).toBe('25000.00');
  });

  it('dates IDBI rows after the last one without leaving its day', () => {
    const { added } = matchTransactions('IDBI', idbi, 5000, () => 0.5);
    expect(added.map((row) => row.date)).toEqual(['04/03/2026 23:59:59', '04/03/2026 23:59:59']);
    expect(added.at(-1)!.balance).toBe('5000.00');
  });

  it('adds nothing when the balance already matches', () => {
    expect(matchTransactions('SBI', sbi, 1300).added).toEqual([]);
  });
});
