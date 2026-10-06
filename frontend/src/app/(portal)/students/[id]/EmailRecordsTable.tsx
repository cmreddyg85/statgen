'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import type { EmailInput, StudentRecordEntry, StudentRecordSummary } from '@/lib/types';
import { Badge, StatusDot } from '@/components/Badge';
import { Button } from '@/components/Button';
import { DateCell } from '@/components/DateCell';
import { EyeIcon, PaperclipIcon } from '@/components/Icon';
import { ConfirmDialog, Modal } from '@/components/Modal';
import { ErrorState, LoadingState } from '@/components/States';
import { useToast } from '@/components/Toast';
import { useSession } from '@/lib/session-context';
import { RowEditDelete } from './RecordsTable';

// Mirrors OUTPUT_KEYS in backend/src/email/output.ts.
const OUTPUT_KEYS = [
  'subject', 'rowDate', 'headerDateTime', 'date',
  'senderName', 'senderEmail', 'mailedBy', 'signedBy', 'logo',
  'textReplacements',
];

/**
 * The student's email records. Subjects and attachments come with the list;
 * the output JSON — administrators only — is fetched when opened. Finalizing
 * locks a record exactly as it does for the bank formats.
 */
export function EmailRecordsTable({ studentId, onChange }: { studentId: string; onChange?: () => void }) {
  const toast = useToast();
  const { isAdmin } = useSession();
  const [records, setRecords] = useState<StudentRecordSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [panel, setPanel] = useState<{ title: string; json: unknown } | null>(null);
  const [deleting, setDeleting] = useState<StudentRecordSummary | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { records: rows } = await api.get<{ records: StudentRecordSummary[] }>(
        `/students/${studentId}/records`,
      );
      setRecords(rows.filter((row) => row.bank === 'EMAIL'));
      onChange?.();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load email records.');
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openOutput = async (id: string, emails: EmailInput[]) => {
    setBusyId(id);
    try {
      const { record } = await api.get<{ record: StudentRecordEntry }>(
        `/students/${studentId}/records/${id}`,
      );
      const output = (record.statement as unknown as Record<string, unknown>[]).map(
        (item, i) => ({
          // jsonb stores keys sorted; put them back in the order the mail template reads.
          ...Object.fromEntries(OUTPUT_KEYS.filter((key) => key in item).map((key) => [key, item[key]])),
          // As /api/email-details serves it; opens only once finalized and live.
          fileUrl: emails[i]?.fileId
            ? `${window.location.origin}/api/email-files/${emails[i].fileId}`
            : null,
        }),
      );
      setPanel({ title: 'Output JSON', json: output });
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : 'Could not open this record.');
    } finally {
      setBusyId(null);
    }
  };

  /** Admin only: stores the done status and mails this record's JSON. */
  const markDone = async (record: StudentRecordSummary) => {
    setBusyId(record.id);
    try {
      await api.post(`/students/${studentId}/records/${record.id}/done`);
      toast.success('Marked done. Mail sent.');
      await load();
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : 'Could not mark the record done.');
    } finally {
      setBusyId(null);
    }
  };

  const setFinalized = async (record: StudentRecordSummary, finalized: boolean) => {
    setBusyId(record.id);
    try {
      await api.post(
        `/students/${studentId}/records/${record.id}/${finalized ? 'finalize' : 'unfinalize'}`,
      );
      toast.success(finalized ? 'Record finalized.' : 'Record unfinalized.');
      await load();
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : 'Could not update the record.');
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api.delete(`/students/${studentId}/records/${deleting.id}`);
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
      <h2 className="flex items-center gap-2 border-b border-[var(--color-line)] px-5 py-3.5 text-[15px] font-semibold">
        Email records
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 tabular-nums">
          {records.length}
        </span>
      </h2>

      {loading ? (
        <LoadingState label="Loading records…" />
      ) : error ? (
        <ErrorState title="Records unavailable" message={error} onRetry={load} />
      ) : records.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-[var(--color-muted)]">
          No email records yet.
        </p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Generated</th>
                <th scope="col">Subjects</th>
                <th scope="col">Details</th>
                <th scope="col">Attachments</th>
                <th scope="col" className="col-actions text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => {
                const emails = record.emailInput?.emails ?? [];
                const files = emails.filter((email) => email.fileId);
                return (
                  <tr key={record.id}>
                    <td data-label="Generated">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <DateCell value={record.createdAt} />
                        {record.finalizedAt && (
                          <Badge tone="success">
                            <StatusDot tone="success" />
                            Finalized
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td data-label="Subjects">
                      <ol className="min-w-[160px] max-w-[320px] space-y-1">
                        {emails.map((email, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="tabular-nums text-[var(--color-muted)]">{i + 1}.</span>
                            <span className="font-medium break-words">{email.subject}</span>
                          </li>
                        ))}
                      </ol>
                    </td>
                    <td data-label="Details">
                      <div className="chip-row">
                        <button
                          type="button"
                          className="chip"
                          onClick={() => setPanel({ title: 'Input details', json: record.emailInput })}
                        >
                          <EyeIcon />
                          Input
                        </button>
                        {isAdmin && (
                          <button
                            type="button"
                            className="chip"
                            disabled={busyId === record.id}
                            onClick={() => void openOutput(record.id, emails)}
                          >
                            <EyeIcon />
                            Output JSON
                          </button>
                        )}
                      </div>
                    </td>
                    <td data-label="Attachments">
                      {files.length === 0 ? (
                        <span className="text-[var(--color-muted)]">—</span>
                      ) : (
                        <div className="chip-row">
                          {files.map((email) => (
                            <a
                              key={email.fileId}
                              href={`/api/v1/students/${studentId}/records/${record.id}/files/${email.fileId}`}
                              download={email.attachmentName ?? undefined}
                              className="chip max-w-[220px]"
                              title={email.attachmentName ?? undefined}
                            >
                              <PaperclipIcon />
                              <span className="truncate">{email.attachmentName}</span>
                            </a>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="col-actions">
                      <div className="flex items-center justify-end gap-1">
                        {isAdmin && record.finalizedAt && (
                          <Button
                            variant="primary"
                            size="sm"
                            className="w-[72px]"
                            disabled={Boolean(record.doneAt)}
                            loading={busyId === record.id}
                            onClick={() => void markDone(record)}
                          >
                            {record.doneAt ? 'Done ✓' : 'Done'}
                          </Button>
                        )}
                        <Button
                          variant={record.finalizedAt ? 'secondary' : 'primary'}
                          size="sm"
                          className="w-[104px]"
                          loading={busyId === record.id}
                          onClick={() => void setFinalized(record, !record.finalizedAt)}
                        >
                          {record.finalizedAt ? 'Unfinalize' : 'Finalize'}
                        </Button>
                        <RowEditDelete
                          locked={Boolean(record.finalizedAt)}
                          editHref={`/students/${studentId}/generate?record=${record.id}`}
                          onDelete={() => setDeleting(record)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
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

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete record"
        message="This permanently removes the email record and its attachments. This cannot be undone."
        confirmLabel="Delete"
        loading={deleteBusy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      />
    </section>
  );
}
