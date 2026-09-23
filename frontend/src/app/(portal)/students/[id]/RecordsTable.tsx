'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api, apiBlob, downloadBlob } from '@/lib/api';
import type { SbiTransaction, StudentRecordEntry, StudentRecordSummary } from '@/lib/types';
import { Badge, StatusDot } from '@/components/Badge';
import { Button, LinkButton } from '@/components/Button';
import { DateCell } from '@/components/DateCell';
import { Modal, ConfirmDialog } from '@/components/Modal';
import { TextField } from '@/components/Field';
import { ErrorState, LoadingState } from '@/components/States';
import { useToast } from '@/components/Toast';
import { useSession } from '@/lib/session-context';

/** The JSON panels, in the order they appear as columns. */
const PANELS = [
  { key: 'input', label: 'Input details', pick: (r: StudentRecordEntry) => r.input },
  { key: 'extract', label: 'Extract details', pick: (r: StudentRecordEntry) => r.extract },
  {
    key: 'account',
    label: 'Account details',
    pick: (r: StudentRecordEntry) => r.statement.accountInfo,
  },
  {
    key: 'salary',
    label: 'Salary transactions',
    pick: (r: StudentRecordEntry) => r.statement.salaryTrans,
  },
  {
    key: 'transactions',
    label: 'Transactions',
    pick: (r: StudentRecordEntry) => r.statement.transactions,
  },
] as const;

const slug = (value: string) =>
  value.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'statement';

/** `2026-09-23` (what a date input gives) to `23-09-2026` / `23/09/2026`. */
const formatDmy = (iso: string, separator: '-' | '/') => {
  const [year, month, day] = iso.split('-');
  return [day, month, year].join(separator);
};

/** `23/09/2026` back to `2026-09-23`, so ranges compare as plain strings. */
const transactionIso = (date: string) => {
  const [day, month, year] = date.split('/');
  return `${year}-${month}-${day}`;
};

const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
};

/**
 * The statements generated for one student. The list carries summaries only —
 * a statement payload is hundreds of kilobytes — so a record is fetched the
 * first time one of its panels, downloads or the PDF dialog is opened.
 */
export function RecordsTable({ studentId }: { studentId: string }) {
  const toast = useToast();
  // The raw payloads are an administrator's view; a user works with the
  // downloads instead.
  const { isAdmin } = useSession();
  const [records, setRecords] = useState<StudentRecordSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [panel, setPanel] = useState<{ title: string; json: unknown } | null>(null);
  const [pdfFor, setPdfFor] = useState<StudentRecordEntry | null>(null);
  const [deleting, setDeleting] = useState<StudentRecordSummary | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const cache = useRef(new Map<string, StudentRecordEntry>());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { records: rows } = await api.get<{ records: StudentRecordSummary[] }>(
        `/students/${studentId}/records`,
      );
      setRecords(rows);
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Could not load generated records.',
      );
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Fetches the full record once and keeps it for the rest of the visit. */
  const fullRecord = async (id: string): Promise<StudentRecordEntry | null> => {
    const cached = cache.current.get(id);
    if (cached) return cached;

    setBusyId(id);
    try {
      const { record } = await api.get<{ record: StudentRecordEntry }>(
        `/students/${studentId}/records/${id}`,
      );
      cache.current.set(id, record);
      return record;
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : 'Could not open this record.');
      return null;
    } finally {
      setBusyId(null);
    }
  };

  const openPanel = async (id: string, label: string, pick: (r: StudentRecordEntry) => unknown) => {
    const record = await fullRecord(id);
    if (record) setPanel({ title: label, json: pick(record) });
  };

  /** The data file the generator reads back: three consts, nothing else. */
  const downloadJson = async (id: string) => {
    const record = await fullRecord(id);
    if (!record) return;

    const { accountInfo, transactions, salaryTrans } = record.statement;
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
      `final-${slug(accountInfo.customerName ?? 'statement')}.js`,
    );
  };

  const openPdfDialog = async (id: string) => {
    const record = await fullRecord(id);
    if (record) setPdfFor(record);
  };

  /** One record per student can be finalized; it is then locked for everyone. */
  const setFinalized = async (record: StudentRecordSummary, finalized: boolean) => {
    setBusyId(record.id);
    try {
      await api.post(
        `/students/${studentId}/records/${record.id}/${finalized ? 'finalize' : 'unfinalize'}`,
      );
      toast.success(finalized ? 'Record finalized.' : 'Record unfinalized.');
      await load();
    } catch (caught) {
      toast.error(
        caught instanceof ApiError ? caught.message : 'Could not update the record.',
      );
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api.delete(`/students/${studentId}/records/${deleting.id}`);
      cache.current.delete(deleting.id);
      toast.success('Record deleted.');
      setDeleting(null);
      await load();
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : 'Could not delete the record.');
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <section className="card">
      <h2 className="border-b border-[var(--color-line)] px-5 py-3.5 text-[15px] font-semibold">
        Generated records{' '}
        <span className="font-normal text-[var(--color-muted)]">({records.length})</span>
      </h2>

      {loading ? (
        <LoadingState label="Loading records…" />
      ) : error ? (
        <ErrorState title="Records unavailable" message={error} onRetry={load} />
      ) : records.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-[var(--color-muted)]">
          No records generated yet.
        </p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Generated</th>
                {isAdmin &&
                  PANELS.map((item) => (
                    <th key={item.key} scope="col">
                      {item.label}
                    </th>
                  ))}
                <th scope="col">Attachment</th>
                <th scope="col" className="col-actions text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id}>
                  <td>
                    <DateCell value={record.createdAt} />
                    {record.finalizedAt && (
                      <span className="mt-1 inline-block">
                        <Badge tone="success">
                          <StatusDot tone="success" />
                          Finalized
                        </Badge>
                      </span>
                    )}
                  </td>
                  {isAdmin &&
                    PANELS.map((item) => (
                      <td key={item.key}>
                        <button
                          type="button"
                          onClick={() => void openPanel(record.id, item.label, item.pick)}
                          disabled={busyId === record.id}
                          className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-medium text-[var(--color-primary)] hover:underline disabled:opacity-60"
                        >
                          {item.label}
                          <EyeIcon />
                        </button>
                      </td>
                    ))}
                  <td>
                    {record.attachmentName ? (
                      // A plain anchor: the browser fetches it with the
                      // session cookie and saves it straight to disk.
                      <a
                        href={`/api/v1/students/${studentId}/records/${record.id}/attachment`}
                        download={record.attachmentName}
                        className="whitespace-nowrap text-[13px] font-medium text-[var(--color-primary)] hover:underline"
                      >
                        Download attached PDF
                      </a>
                    ) : (
                      <span className="text-[var(--color-muted)]">—</span>
                    )}
                  </td>
                  <td className="col-actions">
                    <div className="flex items-center justify-end gap-1">
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void downloadJson(record.id)}
                          loading={busyId === record.id}
                        >
                          Download JSON
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void openPdfDialog(record.id)}
                      >
                        Download PDF statement
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-[104px]"
                        loading={busyId === record.id}
                        onClick={() => void setFinalized(record, !record.finalizedAt)}
                      >
                        {record.finalizedAt ? 'Unfinalize' : 'Finalize'}
                      </Button>
                      {/* A finalized record is frozen: no edit, no delete,
                          for administrators too, until it is released. Both
                          stay in place, disabled, so the column keeps its
                          shape and the reason is one hover away. */}
                      {record.finalizedAt ? (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled
                            aria-label="Edit record"
                            title="Unfinalize this record to edit it"
                          >
                            <PencilIcon />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled
                            aria-label="Delete record"
                            title="Unfinalize this record to delete it"
                          >
                            <TrashIcon />
                          </Button>
                        </>
                      ) : (
                        <>
                          <LinkButton
                            href={`/students/${studentId}/generate?record=${record.id}`}
                            variant="ghost"
                            size="sm"
                            aria-label="Edit record"
                          >
                            <PencilIcon />
                          </LinkButton>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label="Delete record"
                            className="text-[var(--color-danger)] hover:bg-red-50"
                            onClick={() => setDeleting(record)}
                          >
                            <TrashIcon />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={Boolean(panel)}
        title={panel?.title ?? ''}
        width="lg"
        onClose={() => setPanel(null)}
        footer={
          <Button variant="secondary" onClick={() => setPanel(null)}>
            Close
          </Button>
        }
      >
        <pre className="max-h-[60vh] overflow-auto rounded-[8px] bg-slate-50 p-4 font-mono text-[12px] leading-relaxed whitespace-pre-wrap break-all">
          {JSON.stringify(panel?.json ?? null, null, 2)}
        </pre>
      </Modal>

      {pdfFor && (
        <StatementDialog record={pdfFor} onClose={() => setPdfFor(null)} />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete record"
        message="This permanently removes the generated statement. This cannot be undone."
        confirmLabel="Delete"
        loading={deleteBusy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      />
    </section>
  );
}

/** Date range for one statement PDF: the dates go into the account block and
 * decide which transactions are printed. */
function StatementDialog({
  record,
  onClose,
}: {
  record: StudentRecordEntry;
  onClose: () => void;
}) {
  const toast = useToast();
  const transactions = record.statement.transactions;
  const bounds = transactions.map((entry) => transactionIso(entry.Date)).sort();

  const [dateOfStatement, setDateOfStatement] = useState('');
  const [fromDate, setFromDate] = useState(bounds[0] ?? '');
  const [toDate, setToDate] = useState(bounds[bounds.length - 1] ?? todayIso());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const inRange = (entry: SbiTransaction) => {
    const iso = transactionIso(entry.Date);
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

    setError(null);
    setBusy(true);
    try {
      const blob = await apiBlob('/sbi/generate-statement', {
        accountInfo: {
          ...record.statement.accountInfo,
          // Left blank, the statement is dated today.
          dateOfStatement: formatDmy(dateOfStatement || todayIso(), '-'),
          fromDate: formatDmy(fromDate, '/'),
          toDate: formatDmy(toDate, '/'),
        },
        transactions: filtered,
      });
      downloadBlob(blob, `${slug(record.statement.accountInfo.customerName ?? 'statement')}.pdf`);
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
      title="Download PDF statement"
      description={`${count} transaction(s) in the selected range.`}
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
            hint="Optional — today's date is used when left empty."
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
      {error && (
        <p className="field-error mt-3" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}

function EyeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="12" cy="12" r="2.75" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 7h16M9 7V5h6v2m-8 0 1 12h8l1-12"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
