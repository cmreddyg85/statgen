'use client';

import { useState } from 'react';
import { ApiError, apiBlob, downloadBlob } from '@/lib/api';
import type { IdbiStatement, IdbiTransaction, SbiStatement, SbiTransaction } from '@/lib/types';
import { Button } from './Button';
import { CheckboxField, TextField } from './Field';
import { Modal } from './Modal';
import { useToast } from './Toast';

type StatementRow = SbiTransaction | IdbiTransaction;

/**
 * A row's day as `2026-09-23`, so ranges compare as plain strings. SBI rows
 * carry `Date: 23/09/2026`; IDBI rows `date: 23/09/2026 18:37:07`.
 */
const transactionIso = (entry: StatementRow) => {
  const date = ('Date' in entry ? entry.Date : entry.date).split(' ')[0]!;
  const [day, month, year] = date.split('/');
  return `${year}-${month}-${day}`;
};

const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
};

/** `AccountStatement_24092026_174843.pdf`, the name the bank's export uses. */
const statementFileName = () => {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  const date = `${pad(now.getDate())}${pad(now.getMonth() + 1)}${now.getFullYear()}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `AccountStatement_${date}_${time}.pdf`;
};

const slug = (value: string) =>
  value.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'statement';

/** The data file the generator reads back: three consts, nothing else. */
export function downloadStatementJson(statement: SbiStatement | IdbiStatement): void {
  const { accountInfo, transactions, salaryTrans } = statement;
  const file = `const accountInfo = ${JSON.stringify(accountInfo, null, 2)};

const transactions = ${JSON.stringify(transactions, null, 2)};

const salaryTrans = ${JSON.stringify(salaryTrans, null, 2)};

module.exports = {
  accountInfo,
  transactions,
  salaryTrans,
};
`;
  downloadBlob(
    new Blob([file], { type: 'text/javascript' }),
    `final-${slug(accountInfo.customerName ?? accountInfo.accountName ?? 'statement')}.js`,
  );
}

/**
 * Date range for one statement PDF: the dates go into the account block and
 * decide which transactions are printed. Used wherever a stored statement can
 * be downloaded — a student's record, or a standalone SBI report.
 */
export function StatementDialog({
  endpoint,
  transactions,
  defaultPassword = '',
  dummy = false,
  sample = false,
  onClose,
}: {
  /** Where to POST the range; the server renders from its own copy. */
  endpoint: string;
  transactions: StatementRow[];
  /** Prefills the password box, when the payload carries one. */
  defaultPassword?: string;
  /** The watermarked preview rather than the clean statement. */
  dummy?: boolean;
  /** An IDBI-format record: always the SAMPLE-marked layout. */
  sample?: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const bounds = transactions.map(transactionIso).sort();

  const [protect, setProtect] = useState(false);
  // Prefilled from the record, but free to change: it protects this file only.
  const [password, setPassword] = useState(defaultPassword);
  const [dateOfStatement, setDateOfStatement] = useState(todayIso());
  const [fromDate, setFromDate] = useState(bounds[0] ?? '');
  const [toDate, setToDate] = useState(bounds[bounds.length - 1] ?? todayIso());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const inRange = (entry: StatementRow) => {
    const iso = transactionIso(entry);
    return iso >= fromDate && iso <= toDate;
  };

  const download = async () => {
    if (!fromDate) {
      setError('Pick the date the statement starts from.');
      return;
    }
    if (!toDate) {
      setError('Pick the date the statement runs to.');
      return;
    }
    if (toDate < fromDate) {
      setError('The end date cannot be before the start date.');
      return;
    }

    const filtered = transactions.filter(inRange);
    if (filtered.length === 0) {
      setError('There are no transactions in that range.');
      return;
    }
    if (protect && !password.trim()) {
      setError('Enter a password to protect the PDF with.');
      return;
    }

    setError(null);
    setBusy(true);
    try {
      // The server filters the stored transactions and decides on the
      // watermark, so the range is all the client sends.
      const blob = await apiBlob(endpoint, {
        fromDate,
        toDate,
        dateOfStatement: dateOfStatement || undefined,
        dummy,
        protect,
        password: protect ? password.trim() : undefined,
      });
      const fileName = statementFileName();
      downloadBlob(
        blob,
        sample ? fileName.replace('AccountStatement_', 'SampleStatement_') : fileName,
      );
      toast.success('Statement downloaded.');
      onClose();
    } catch (caught) {
      const message =
        caught instanceof ApiError ? caught.message : 'Could not generate the statement.';
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const count = fromDate && toDate ? transactions.filter(inRange).length : 0;

  return (
    <Modal
      open
      title={sample ? 'Download sample PDF' : dummy ? 'Download dummy PDF' : 'Download PDF statement'}
      description={`${count} transaction(s) in the selected range.${
        sample
          ? ' Every page is marked SAMPLE – NOT A BANK DOCUMENT.'
          : dummy
            ? ' Every page is stamped DUMMY REPORT.'
            : ''
      }`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void download()} loading={busy}>
            Download
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <TextField
            label="Date of statement"
            type="date"
            value={dateOfStatement}
            onChange={(event) => setDateOfStatement(event.target.value)}
            hint="Defaults to today. Change it to date the statement differently."
          />
        </div>
        <TextField
          label="From date"
          type="date"
          required
          value={fromDate}
          onChange={(event) => setFromDate(event.target.value)}
        />
        <TextField
          label="To date"
          type="date"
          required
          value={toDate}
          onChange={(event) => setToDate(event.target.value)}
        />
      </div>
      <div className="mt-4">
        <CheckboxField
          label="Protect the PDF with a password"
          description="Applies to this download only — nothing is saved on the record."
          checked={protect}
          onChange={(event) => setProtect(event.target.checked)}
        />

        {protect && (
          <div className="mt-3">
            <TextField
              label="PDF password"
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              hint={
                defaultPassword
                  ? 'Prefilled from this record. Change it for a one-off password.'
                  : 'Anything you like — it is needed to open the downloaded file.'
              }
            />
          </div>
        )}
      </div>

      {error && (
        <p className="field-error mt-3" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
