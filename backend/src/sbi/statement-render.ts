import { createSbiStatementPdf } from './statement.js';
import { badRequest } from '../utils/errors.js';

/** The generated statement, however it was produced. */
export interface StatementPayload {
  accountInfo: Record<string, string>;
  transactions: Array<Record<string, string>>;
}

export interface RenderOptions {
  fromDate: string;
  toDate: string;
  dateOfStatement?: string;
  /** Stamp every page DUMMY REPORT. */
  dummy?: boolean;
  /** Encrypt the file. */
  protect?: boolean;
  /** The password to encrypt with; falls back to the one on the account. */
  password?: string;
}

/** `AccountStatement_24092026_174843.pdf`, the name the bank's export uses. */
export function statementFileName(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  const date = `${pad(now.getDate())}${pad(now.getMonth() + 1)}${now.getFullYear()}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `AccountStatement_${date}_${time}.pdf`;
}

const slashDate = (iso: string) => iso.split('-').reverse().join('/');
const dashDate = (iso: string) => iso.split('-').reverse().join('-');
/** `23/09/2026` back to `2026-09-23`, so ranges compare as plain strings. */
const transactionIso = (date: string) => date.split('/').reverse().join('-');

function todayIso(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Renders one statement PDF: the transactions inside the range, the dates
 * written into the account block, and the password applied only when asked
 * for. Shared by the student records and the standalone SBI reports.
 */
export async function renderStatement(
  statement: StatementPayload,
  options: RenderOptions,
): Promise<{ pdf: Buffer; fileName: string }> {
  const transactions = (statement.transactions ?? []).filter((entry) => {
    const iso = transactionIso(entry.Date ?? '');
    return iso >= options.fromDate && iso <= options.toDate;
  });

  if (transactions.length === 0) {
    throw badRequest('There are no transactions in that date range.');
  }

  const password = (options.password ?? statement.accountInfo?.password ?? '').trim();
  if (options.protect && !password) {
    throw badRequest('Enter a password to protect this PDF with.');
  }

  const pdf = await createSbiStatementPdf(
    {
      ...statement.accountInfo,
      password: options.protect ? password : '',
      dateOfStatement: dashDate(options.dateOfStatement ?? todayIso()),
      fromDate: slashDate(options.fromDate),
      toDate: slashDate(options.toDate),
    },
    transactions,
    { watermark: options.dummy ? 'DUMMY REPORT' : null },
  );

  return { pdf, fileName: statementFileName() };
}
