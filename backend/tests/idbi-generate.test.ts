import { describe, expect, it } from 'vitest';
import { generateIdbiTransactions } from '../src/idbi/generate.js';
import { buildSalaryPeriods } from '../src/sbi/salary-periods.js';

const details = {
  salaryDay: 5,
  nextWorkingDay: false,
  pdfPassword: 'pw',
  companies: [
    {
      name: 'Acme',
      joiningDate: '2023-01-09',
      relievingDate: '2024-06-28',
      salary: 40000,
      bank: 'HDFC',
      ifsc: 'HDFC0000032',
      narration: 'NEFT-HDFCN{{TraNum}}-SAL {{ShortMonth}}{{ShortYear}} ACME',
      hikes: [{ date: '2023-12-15', salary: 50000 }],
    },
  ],
};

const extract = {
  accountInfo: {
    accountName: 'Student Account',
    accountNumber: '0000000000000000',
    ifsCode: 'IBKL0000000',
    password: 'pw',
  },
  numberOfCreditsTransactions: [1, 3],
  numberOfDebitsTransactions: [15, 20],
  balanceBeforeFromDate: 5000,
  balanceAfterToDate: 453,
  salaryDay: 5,
  nextWorkingDay: false,
  salaries: buildSalaryPeriods(details),
};

describe('IDBI transaction generation', () => {

  it('generates ordered rows with salary credits, ending on the target balance', () => {
    const result = generateIdbiTransactions(extract);
    const { transactions } = result;

    expect(result.invalidDates).toEqual([]);
    expect(transactions.length).toBeGreaterThan(50);
    expect(transactions.at(-1)!.balance).toBe('453.00');

    const salaries = transactions.filter((txn) => txn.isSalary);
    expect(salaries.some((txn) => txn.amount === '40000.00')).toBe(true);
    expect(salaries.some((txn) => txn.amount === '50000.00')).toBe(true);
    expect(result.salaryTrans.length).toBe(salaries.length);
    expect(salaries[0]!.details).toMatch(/^NEFT-HDFCN\d{11}-SAL [A-Z][a-z]{2}\d{2} ACME$/);

    for (const txn of transactions) {
      expect(txn.date).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/);
      expect(['Cr', 'Dr']).toContain(txn.type);
      expect(Number(txn.balance)).toBeGreaterThanOrEqual(0);
    }
  });

  it('accepts balances given as text, as an edited extract carries them', () => {
    const updatedExtract = {
      ...extract,
      balanceBeforeFromDate: '5000',
      balanceAfterToDate: '1200.50',
    };
    const { transactions } = generateIdbiTransactions(updatedExtract);
    expect(transactions.at(-1)!.balance).toBe('1200.50');
  });

});
