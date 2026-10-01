import { describe, expect, it } from 'vitest';
import { generateIdbiTransactions } from '../src/idbi/generate.js';
import { buildIdbiExtract, mockIdbiAccountInfo } from '../src/idbi/mock.js';

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

describe('IDBI mock pipeline', () => {
  it('uses a synthetic account block and carries the PDF password', () => {
    const extract = buildIdbiExtract(details);
    expect(extract.accountInfo.accountName).toBe('SAMPLE ACCOUNT HOLDER');
    expect(extract.accountInfo.ifsCode).toBe('TEST0000000');
    expect(extract.accountInfo.password).toBe('pw');
    expect(extract.salaries.length).toBeGreaterThan(0);
  });

  it('keeps the stored account block when a record is edited', () => {
    const previous = { ...buildIdbiExtract(details), balanceAfterToDate: 999 };
    const next = buildIdbiExtract({ ...details, pdfPassword: 'new' }, previous);
    expect(next.accountInfo.accountNumber).toBe(previous.accountInfo.accountNumber);
    expect(next.accountInfo.password).toBe('new');
    expect(next.balanceAfterToDate).toBe(999);
  });

  it('generates ordered rows with salary credits, ending on the target balance', () => {
    const result = generateIdbiTransactions(buildIdbiExtract(details));
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
    const extract = {
      ...buildIdbiExtract(details),
      balanceBeforeFromDate: '5000',
      balanceAfterToDate: '1200.50',
    };
    const { transactions } = generateIdbiTransactions(extract);
    expect(transactions.at(-1)!.balance).toBe('1200.50');
  });

  it('gives each mock account its own number', () => {
    expect(mockIdbiAccountInfo().accountNumber).not.toBe(mockIdbiAccountInfo().accountNumber);
  });
});
