'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api, applyApiError } from '@/lib/api';
import { formatDateTime, sortKeys } from '@/lib/format';
import type { RecordBank, SbiReportEntry, SbiReportSource, SbiReportSummary } from '@/lib/types';
import { Badge, StatusDot } from '@/components/Badge';
import { Button } from '@/components/Button';
import { DateCell } from '@/components/DateCell';
import { DownloadIcon, EyeIcon } from '@/components/Icon';
import { MatchTransactionsDialog } from '@/components/MatchTransactionsDialog';
import { ConfirmDialog, Modal } from '@/components/Modal';
import { PageHeader } from '@/components/PageHeader';
import { StatementDialog, downloadStatementJson } from '@/components/StatementDialog';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { useToast } from '@/components/Toast';

const SOURCE_LABEL: Record<SbiReportSource, string> = {
  extract: 'Extract details',
  transactions: 'Transactions',
};

/** The JSON panels, in the order they appear as columns. */
const PANELS = [
  { key: 'input', label: 'Input details', pick: (r: SbiReportEntry) => r.input },
  {
    key: 'account',
    label: 'Account details',
    pick: (r: SbiReportEntry) => sortKeys(r.statement.accountInfo),
  },
  {
    key: 'salary',
    label: 'Salary transactions',
    pick: (r: SbiReportEntry) => r.statement.salaryTrans,
  },
  {
    key: 'transactions',
    label: 'Transactions',
    pick: (r: SbiReportEntry) => r.statement.transactions,
  },
] as const;

/**
 * Statements built straight from a pasted payload, with no student attached
 * (admin only). Either an extract, which is run through the generator, or a
 * ready-made account block and transaction list.
 *
 * Serves both the SBI and the IDBI screen. IDBI reports get a mock account
 * block whatever is pasted, and only the SAMPLE-marked PDF.
 */
export function SbiReportsClient({ bank = 'SBI' }: { bank?: RecordBank }) {
  const toast = useToast();
  const base = `/${bank.toLowerCase()}/reports`;
  const isIdbi = bank === 'IDBI';
  const [reports, setReports] = useState<SbiReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SbiReportEntry | null>(null);
  const [viewing, setViewing] = useState<{
    title: string;
    json: unknown;
    /** Set on a finalized report's transactions: they may be topped up to a closing balance. */
    matchReportId?: string;
  } | null>(null);
  const [matching, setMatching] = useState(false);
  const [downloading, setDownloading] = useState<{
    report: SbiReportEntry;
    dummy: boolean;
  } | null>(null);
  const [deleting, setDeleting] = useState<SbiReportSummary | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const cache = useRef(new Map<string, SbiReportEntry>());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { reports: rows } = await api.get<{ reports: SbiReportSummary[] }>(base);
      setReports(rows);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load reports.');
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Fetched once and kept: a report carries its whole transaction list. */
  const fullReport = async (id: string): Promise<SbiReportEntry | null> => {
    const cached = cache.current.get(id);
    if (cached) return cached;

    setBusyId(id);
    try {
      const { report } = await api.get<{ report: SbiReportEntry }>(`${base}/${id}`);
      cache.current.set(id, report);
      return report;
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : 'Could not open this report.');
      return null;
    } finally {
      setBusyId(null);
    }
  };

  const openPanel = async (
    id: string,
    key: string,
    title: string,
    pick: (r: SbiReportEntry) => unknown,
  ) => {
    const report = await fullReport(id);
    if (!report) return;
    setViewing({
      title,
      json: pick(report),
      matchReportId: key === 'transactions' && report.finalizedAt ? id : undefined,
    });
  };

  const open = async (id: string, target: 'json' | 'dummy' | 'download' | 'edit') => {
    const report = await fullReport(id);
    if (!report) return;
    if (target === 'json') downloadStatementJson(report.statement);
    if (target === 'dummy') setDownloading({ report, dummy: true });
    if (target === 'download') setDownloading({ report, dummy: false });
    if (target === 'edit') {
      setEditing(report);
      setFormOpen(true);
    }
  };

  /** A finalized report is locked: no edit, no delete, until unfinalized. */
  const setFinalized = async (report: SbiReportSummary, finalized: boolean) => {
    setBusyId(report.id);
    try {
      await api.post(`${base}/${report.id}/${finalized ? 'finalize' : 'unfinalize'}`);
      toast.success(finalized ? 'Report finalized.' : 'Report unfinalized.');
      await load();
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : 'Could not update the report.');
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api.delete(`${base}/${deleting.id}`);
      cache.current.delete(deleting.id);
      toast.success('Report deleted.');
      setDeleting(null);
      await load();
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : 'Could not delete the report.');
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title={bank}
        description={
          isIdbi
            ? 'Sample statements built from a pasted payload with a mock account block. PDFs are always marked SAMPLE.'
            : 'Statements built from a pasted payload, without a student record.'
        }
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            Create Report
          </Button>
        }
      />

      <div className="card overflow-hidden">
        {loading && reports.length === 0 ? (
          <LoadingState label="Loading reports…" />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : reports.length === 0 ? (
          <EmptyState
            title="No reports yet"
            message="Create one by pasting an extract payload or a transaction list."
            action={
              <Button
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                Create Report
              </Button>
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Created</th>
                  <th scope="col">Customer</th>
                  <th scope="col">Details</th>
                  <th scope="col">Downloads</th>
                  <th scope="col" className="col-actions text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <tr key={report.id}>
                    <td data-label="Created">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <DateCell value={report.createdAt} />
                        {report.finalizedAt && (
                          <Badge tone="success">
                            <StatusDot tone="success" />
                            Finalized
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td data-label="Customer" className="font-medium">
                      {report.customerName ?? <span className="text-[var(--color-muted)]">—</span>}
                    </td>
                    <td data-label="Details">
                      <div className="chip-row">
                        {PANELS.map((item) => (
                          <button
                            key={item.key}
                            type="button"
                            className="chip"
                            title={`View ${item.label.toLowerCase()}`}
                            onClick={() => void openPanel(report.id, item.key, item.label, item.pick)}
                            disabled={busyId === report.id}
                          >
                            <EyeIcon />
                            {item.label.replace(' details', '').replace(' transactions', '')}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td data-label="Downloads">
                      <div className="chip-row">
                        <button
                          type="button"
                          className="chip"
                          onClick={() => void open(report.id, 'dummy')}
                        >
                          <DownloadIcon />
                          {isIdbi ? 'Sample PDF' : 'Dummy PDF'}
                        </button>
                        {!isIdbi && (
                          <button
                            type="button"
                            className="chip"
                            onClick={() => void open(report.id, 'download')}
                          >
                            <DownloadIcon />
                            Statement
                          </button>
                        )}
                        <button
                          type="button"
                          className="chip"
                          disabled={busyId === report.id}
                          onClick={() => void open(report.id, 'json')}
                        >
                          <DownloadIcon />
                          JSON
                        </button>
                      </div>
                    </td>
                    <td className="col-actions">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant={report.finalizedAt ? 'secondary' : 'primary'}
                          size="sm"
                          className="w-[104px]"
                          loading={busyId === report.id}
                          onClick={() => void setFinalized(report, !report.finalizedAt)}
                        >
                          {report.finalizedAt ? 'Unfinalize' : 'Finalize'}
                        </Button>
                        {/* A finalized report is frozen: both stay in place,
                            disabled, so the reason is one hover away. */}
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={Boolean(report.finalizedAt)}
                          title={report.finalizedAt ? 'Unfinalize this report to edit it' : undefined}
                          onClick={() => void open(report.id, 'edit')}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-[var(--color-danger)] hover:bg-red-50"
                          disabled={Boolean(report.finalizedAt)}
                          title={
                            report.finalizedAt ? 'Unfinalize this report to delete it' : undefined
                          }
                          onClick={() => setDeleting(report)}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {formOpen && (
        <ReportForm
          base={base}
          isIdbi={isIdbi}
          report={editing}
          onClose={() => setFormOpen(false)}
          onSaved={(message) => {
            setFormOpen(false);
            if (editing) cache.current.delete(editing.id);
            toast.success(message);
            void load();
          }}
        />
      )}

      <Modal
        open={viewing !== null}
        title={viewing?.title ?? ''}
        width="lg"
        onClose={() => setViewing(null)}
        footer={
          <>
            {viewing?.matchReportId && (
              <Button variant="secondary" onClick={() => setMatching(true)}>
                Match transactions
              </Button>
            )}
            <Button variant="secondary" onClick={() => setViewing(null)}>
              Close
            </Button>
          </>
        }
      >
        <pre className="max-h-[60vh] overflow-auto rounded-[8px] bg-slate-50 p-4 font-mono text-[12px] leading-relaxed whitespace-pre-wrap break-all">
          {JSON.stringify(viewing?.json ?? null, null, 2)}
        </pre>
      </Modal>

      {matching && viewing?.matchReportId && (
        <MatchTransactionsDialog
          endpoint={`${base}/${viewing.matchReportId}/match-transactions`}
          transactions={viewing.json}
          onClose={() => setMatching(false)}
          onMatched={(transactions) => {
            cache.current.delete(viewing.matchReportId!);
            setViewing({ ...viewing, json: transactions });
          }}
        />
      )}

      {downloading && (
        <StatementDialog
          endpoint={`${base}/${downloading.report.id}/statement-pdf`}
          transactions={downloading.report.statement.transactions}
          defaultPassword={downloading.report.statement.accountInfo.password}
          dummy={downloading.dummy}
          sample={isIdbi}
          onClose={() => setDownloading(null)}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="Delete report"
        message={
          deleting
            ? `Delete the report for ${deleting.customerName ?? 'this account'}? This cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        loading={deleteBusy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}

/** Create or edit: pick what the payload is, then paste it. */
function ReportForm({
  base,
  isIdbi,
  report,
  onClose,
  onSaved,
}: {
  base: string;
  isIdbi: boolean;
  report: SbiReportEntry | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [source, setSource] = useState<SbiReportSource>(report?.source ?? 'extract');
  const [input, setInput] = useState(report ? JSON.stringify(report.input, null, 2) : '');
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    setFormError(null);
    setFieldErrors({});
    try {
      const body = { source, input };
      if (report) {
        await api.put(`${base}/${report.id}`, body);
        onSaved('Report updated.');
      } else {
        await api.post(base, body);
        onSaved('Report created.');
      }
    } catch (error) {
      applyApiError(error, setFieldErrors, setFormError);
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={report ? 'Edit report' : 'Create Report'}
      description="Paste the payload to build the statement from."
      width="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={saving}>
            {report ? 'Save changes' : 'Create'}
          </Button>
        </>
      }
    >
      {formError && (
        <p
          className="mb-4 rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-[var(--color-danger)]"
          role="alert"
        >
          {formError}
        </p>
      )}

      <fieldset className="mb-4">
        <legend className="field-label mb-2">Build from</legend>
        <div className="flex flex-wrap gap-4">
          {(['extract', 'transactions'] as const).map((value) => (
            <label key={value} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="source"
                value={value}
                checked={source === value}
                onChange={() => setSource(value)}
                className="h-4 w-4 accent-[var(--color-primary)]"
              />
              By {SOURCE_LABEL[value]}
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-[var(--color-muted)]">
          {source === 'extract'
            ? 'An extract payload: accountInfo plus the salary periods. Transactions are generated from it.'
            : 'A finished statement: accountInfo plus the transactions list, stored as pasted.'}
          {isIdbi &&
            ' IDBI reports always use a mock account block; only accountInfo.password is kept. Transactions use the IDBI shape: date, details, type, amount, balance.'}
        </p>
      </fieldset>

      <label className="field-label" htmlFor="report-input">
        Payload JSON
      </label>
      <textarea
        id="report-input"
        rows={16}
        value={input}
        onChange={(event) => setInput(event.target.value)}
        spellCheck={false}
        aria-invalid={fieldErrors.input ? true : undefined}
        placeholder={
          source === 'extract'
            ? '{\n  "accountInfo": { … },\n  "salaries": [ … ]\n}'
            : '{\n  "accountInfo": { … },\n  "transactions": [ … ]\n}'
        }
        className="field-input w-full font-mono text-[12px] leading-relaxed"
      />
      {fieldErrors.input && (
        <p className="field-error" role="alert">
          {fieldErrors.input}
        </p>
      )}
    </Modal>
  );
}
