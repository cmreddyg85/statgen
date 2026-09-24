'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api, applyApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { SbiReportEntry, SbiReportSource, SbiReportSummary } from '@/lib/types';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { DateCell } from '@/components/DateCell';
import { ConfirmDialog, Modal } from '@/components/Modal';
import { PageHeader } from '@/components/PageHeader';
import { StatementDialog } from '@/components/StatementDialog';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { useToast } from '@/components/Toast';

const SOURCE_LABEL: Record<SbiReportSource, string> = {
  extract: 'Extract details',
  transactions: 'Transactions',
};

/**
 * Statements built straight from a pasted payload, with no student attached
 * (admin only). Either an extract, which is run through the generator, or a
 * ready-made account block and transaction list.
 */
export function SbiReportsClient() {
  const toast = useToast();
  const [reports, setReports] = useState<SbiReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SbiReportEntry | null>(null);
  const [viewing, setViewing] = useState<SbiReportEntry | null>(null);
  const [downloading, setDownloading] = useState<SbiReportEntry | null>(null);
  const [deleting, setDeleting] = useState<SbiReportSummary | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const cache = useRef(new Map<string, SbiReportEntry>());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { reports: rows } = await api.get<{ reports: SbiReportSummary[] }>('/sbi/reports');
      setReports(rows);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load reports.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Fetched once and kept: a report carries its whole transaction list. */
  const fullReport = async (id: string): Promise<SbiReportEntry | null> => {
    const cached = cache.current.get(id);
    if (cached) return cached;

    setBusyId(id);
    try {
      const { report } = await api.get<{ report: SbiReportEntry }>(`/sbi/reports/${id}`);
      cache.current.set(id, report);
      return report;
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : 'Could not open this report.');
      return null;
    } finally {
      setBusyId(null);
    }
  };

  const open = async (id: string, target: 'view' | 'edit' | 'download') => {
    const report = await fullReport(id);
    if (!report) return;
    if (target === 'view') setViewing(report);
    if (target === 'download') setDownloading(report);
    if (target === 'edit') {
      setEditing(report);
      setFormOpen(true);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api.delete(`/sbi/reports/${deleting.id}`);
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
        title="SBI"
        description="Statements built from a pasted payload, without a student record."
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
                  <th scope="col">Account</th>
                  <th scope="col">Built from</th>
                  <th scope="col">Transactions</th>
                  <th scope="col">Input</th>
                  <th scope="col" className="col-actions text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <tr key={report.id}>
                    <td>
                      <DateCell value={report.createdAt} />
                    </td>
                    <td className="font-medium">
                      {report.customerName ?? <span className="text-[var(--color-muted)]">—</span>}
                    </td>
                    <td className="tabular-nums text-[var(--color-muted)]">
                      {report.accountNumber ?? '—'}
                    </td>
                    <td>
                      <Badge tone="neutral">{SOURCE_LABEL[report.source]}</Badge>
                    </td>
                    <td className="tabular-nums">{report.transactionCount}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => void open(report.id, 'view')}
                        disabled={busyId === report.id}
                        className="whitespace-nowrap text-[13px] font-medium text-[var(--color-primary)] hover:underline disabled:opacity-60"
                      >
                        Input Json
                      </button>
                    </td>
                    <td className="col-actions">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          loading={busyId === report.id}
                          onClick={() => void open(report.id, 'download')}
                        >
                          Download statement
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void open(report.id, 'edit')}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-[var(--color-danger)] hover:bg-red-50"
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
        title="Input JSON"
        description={viewing ? `Pasted as ${SOURCE_LABEL[viewing.source].toLowerCase()}.` : ''}
        width="lg"
        onClose={() => setViewing(null)}
        footer={
          <Button variant="secondary" onClick={() => setViewing(null)}>
            Close
          </Button>
        }
      >
        <pre className="max-h-[60vh] overflow-auto rounded-[8px] bg-slate-50 p-4 font-mono text-[12px] leading-relaxed whitespace-pre-wrap break-all">
          {JSON.stringify(viewing?.input ?? null, null, 2)}
        </pre>
      </Modal>

      {downloading && (
        <StatementDialog
          endpoint={`/sbi/reports/${downloading.id}/statement-pdf`}
          transactions={downloading.statement.transactions}
          defaultPassword={downloading.statement.accountInfo.password}
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
  report,
  onClose,
  onSaved,
}: {
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
        await api.put(`/sbi/reports/${report.id}`, body);
        onSaved('Report updated.');
      } else {
        await api.post('/sbi/reports', body);
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
