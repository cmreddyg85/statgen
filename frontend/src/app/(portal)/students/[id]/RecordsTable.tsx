'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import type { RecordBank, StudentRecordEntry, StudentRecordSummary } from '@/lib/types';
import { Badge, StatusDot } from '@/components/Badge';
import { Button, LinkButton } from '@/components/Button';
import { MatchTransactionsDialog } from '@/components/MatchTransactionsDialog';
import { StatementDialog, downloadStatementJson } from '@/components/StatementDialog';
import { DateCell } from '@/components/DateCell';
import { DownloadIcon, EyeIcon, PaperclipIcon } from '@/components/Icon';
import { Modal, ConfirmDialog } from '@/components/Modal';
import { ErrorState, LoadingState } from '@/components/States';
import { useToast } from '@/components/Toast';
import { useSession } from '@/lib/session-context';

/** The JSON panels, in the order they appear as columns. */
const PANELS = [
  { key: 'input', label: 'Input details', short: 'Input', pick: (r: StudentRecordEntry) => r.input },
  { key: 'extract', label: 'Extract details', short: 'Extract', pick: (r: StudentRecordEntry) => r.extract },
  {
    key: 'account',
    label: 'Account details',
    short: 'Account',
    pick: (r: StudentRecordEntry) => r.statement.accountInfo,
    forUsers: true,
  },
  {
    key: 'salary',
    label: 'Salary transactions',
    short: 'Salary',
    pick: (r: StudentRecordEntry) => r.statement.salaryTrans,
    forUsers: true,
  },
  {
    key: 'transactions',
    label: 'Transactions',
    short: 'Transactions',
    pick: (r: StudentRecordEntry) => r.statement.transactions,
  },
] as const;

/**
 * The account block laid out as the statement prints it — customer side on
 * the left, branch side on the right — so it can be checked against the PDF
 * line by line. Keys the statement does not print sit where they belong.
 */
const ACCOUNT_LEFT: [string, string][] = [
  ['customerName', 'Customer Name'],
  ['email', 'Email'],
  ['address', 'Address'],
  ['unclearedAmount', 'Uncleared Amount'],
  ['modBalance', '+MOD Bal'],
  ['lien', 'Lien'],
  ['limit', 'Limit'],
  ['monthlyAvgBalance', 'Monthly Avg Balance'],
  ['interestRate', 'Interest Rate'],
  ['drawingPower', 'Drawing Power'],
  ['accountOpenDate', 'Account open Date'],
  ['password', 'PDF Password'],
];
const ACCOUNT_RIGHT: [string, string][] = [
  ['district', 'Branch District'],
  ['bankAddress', 'Branch Address'],
  ['branchCode', 'Branch Code'],
  ['branchName', 'Branch Name'],
  ['branchTransactions', 'Branch Name in Transactions'],
  ['branchEmail', 'Branch Email ID'],
  ['branchPhone', 'Branch Phone'],
  ['cifNumber', 'CIF Number'],
  ['accountNumber', 'Account Number'],
  ['accountTypeSuffix', 'Account Type Suffix'],
  ['product', 'Product'],
  ['ifscCode', 'IFSC Code'],
  ['currency', 'Currency'],
  ['accountStatus', 'Account Status'],
  ['ckycrNumber', 'CKYCR Number'],
  ['micrCode', 'MICR Code'],
  ['nomineeName', 'Nominee Name'],
];
/** The IDBI account block, in the same two-column arrangement. */
const IDBI_ACCOUNT_LEFT: [string, string][] = [
  ['accountName', 'Account Holder Name'],
  ['addressLine1', 'Address Line 1'],
  ['addressLine2', 'Address Line 2'],
  ['addressLine3', 'Address Line 3'],
  ['accountNumber', 'Account No'],
  ['accountOpeningDate', 'Account Opening Date'],
  ['accountStatus', 'Account Status'],
  ['currency', 'Currency'],
  ['nominationRegistered', 'Nominee Registered'],
  ['ckycNumber', 'CKYC Number'],
  ['password', 'PDF Password'],
];
const IDBI_ACCOUNT_RIGHT: [string, string][] = [
  ['solIdBranchCode', 'Sol Id/Branch Code'],
  ['branch', 'Account Branch'],
  ['branchAddress', 'Branch Address'],
  ['ifsCode', 'Branch IFSC Code'],
  ['branchEmailId', 'Branch Email Id'],
  ['nomineeName', 'Nominee Name'],
  ['nomineePercentage', 'Nominee Percentage'],
  ['nomineeRelationship', 'Nominee Relationship'],
];
// Filled in when a statement is downloaded, so there is nothing to verify here.
const ACCOUNT_HIDDEN = new Set(['clearBalance', 'dateOfStatement', 'fromDate', 'toDate']);

/** The two columns for one record; keys nobody listed trail the left one. */
function accountColumns(
  values: Record<string, string>,
  bank: RecordBank,
): [string, string][][] {
  const [left, right] =
    bank === 'IDBI' ? [IDBI_ACCOUNT_LEFT, IDBI_ACCOUNT_RIGHT] : [ACCOUNT_LEFT, ACCOUNT_RIGHT];
  const listed = new Set([...left, ...right].map(([key]) => key));
  const rest = Object.keys(values)
    .filter((key) => !listed.has(key) && !ACCOUNT_HIDDEN.has(key))
    .map((key): [string, string] => [key, key]);
  return [
    [...left, ...rest].filter(([key]) => key in values),
    right.filter(([key]) => key in values),
  ];
}

/**
 * The statements generated for one student in one bank's format — the
 * student's page shows an SBI table and an IDBI table, each finalized on its
 * own. The list carries summaries only —
 * a statement payload is hundreds of kilobytes — so a record is fetched the
 * first time one of its panels, downloads or the PDF dialog is opened.
 */
export function RecordsTable({ studentId, bank }: { studentId: string; bank: RecordBank }) {
  const toast = useToast();
  // IDBI-format records have a SAMPLE-marked PDF only, so there is no clean
  // download to release.
  const isIdbi = bank === 'IDBI';
  // The raw payloads are an administrator's view; a user sees only the
  // account details and salary transactions, and otherwise the downloads.
  const { isAdmin } = useSession();
  const panels = PANELS.filter((item) => isAdmin || ('forUsers' in item && item.forUsers));
  const [records, setRecords] = useState<StudentRecordSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [panel, setPanel] = useState<{
    title: string;
    json: unknown;
    /** Set on the one panel an administrator may correct: the extract. */
    editRecordId?: string;
    /** Set on a finalized record's transactions: they may be topped up to a closing balance. */
    matchRecordId?: string;
  } | null>(null);
  const [matching, setMatching] = useState(false);
  // The extract being edited, as text, and why it was refused.
  const [draft, setDraft] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftSaving, setDraftSaving] = useState(false);
  // The account details dialog, and its fields while they are being edited.
  const [account, setAccount] = useState<{
    recordId: string;
    values: Record<string, string>;
    editable: boolean;
  } | null>(null);
  const [accountDraft, setAccountDraft] = useState<Record<string, string> | null>(null);
  const [pdfFor, setPdfFor] = useState<{ record: StudentRecordEntry; dummy: boolean } | null>(
    null,
  );
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
      setRecords(rows.filter((row) => row.bank === bank));
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Could not load generated records.',
      );
    } finally {
      setLoading(false);
    }
  }, [studentId, bank]);

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

  const openPanel = async (
    id: string,
    key: string,
    label: string,
    pick: (r: StudentRecordEntry) => unknown,
  ) => {
    const record = await fullRecord(id);
    if (!record) return;
    if (key === 'account') {
      setDraftError(null);
      setAccountDraft(null);
      setAccount({
        recordId: id,
        values: record.statement.accountInfo,
        editable: !record.finalizedAt,
      });
      return;
    }
    // A finalized record is locked, its extract included.
    const editable = isAdmin && key === 'extract' && !record.finalizedAt;
    setPanel({
      title: label,
      json: pick(record),
      editRecordId: editable ? id : undefined,
      matchRecordId: key === 'transactions' && record.finalizedAt ? id : undefined,
    });
  };

  const closePanel = () => {
    setPanel(null);
    setDraft(null);
    setDraftError(null);
  };

  /** Saves the corrected extract; the server regenerates the statement from it. */
  const saveExtract = async () => {
    if (!panel?.editRecordId || draft === null) return;
    let extract: unknown;
    try {
      extract = JSON.parse(draft);
    } catch (error) {
      setDraftError(`That is not valid JSON: ${(error as Error).message}`);
      return;
    }

    setDraftSaving(true);
    setDraftError(null);
    try {
      await api.put(`/students/${studentId}/records/${panel.editRecordId}/extract`, { extract });
      cache.current.delete(panel.editRecordId);
      toast.success('Extract saved and statement regenerated.');
      closePanel();
      await load();
    } catch (caught) {
      setDraftError(caught instanceof ApiError ? caught.message : 'Could not save the extract.');
    } finally {
      setDraftSaving(false);
    }
  };

  /** Saves the account block only; the transactions are left as generated. */
  const saveAccount = async () => {
    if (!account || !accountDraft) return;
    setDraftSaving(true);
    setDraftError(null);
    try {
      await api.put(`/students/${studentId}/records/${account.recordId}/account-info`, {
        accountInfo: accountDraft,
      });
      cache.current.delete(account.recordId);
      toast.success('Account details updated.');
      setAccount({ ...account, values: accountDraft });
      setAccountDraft(null);
    } catch (caught) {
      setDraftError(
        caught instanceof ApiError ? caught.message : 'Could not update the account details.',
      );
    } finally {
      setDraftSaving(false);
    }
  };

  const downloadJson = async (id: string) => {
    const record = await fullRecord(id);
    if (record) downloadStatementJson(record.statement);
  };

  const openPdfDialog = async (id: string, dummy: boolean) => {
    const record = await fullRecord(id);
    if (record) setPdfFor({ record, dummy });
  };

  /** Admin only: lets the student's owner download the clean statement. */
  const setDownloadShown = async (record: StudentRecordSummary, shown: boolean) => {
    setBusyId(record.id);
    try {
      await api.post(
        `/students/${studentId}/records/${record.id}/${shown ? 'show-download' : 'hide-download'}`,
      );
      toast.success(shown ? 'Download released.' : 'Download withdrawn.');
      await load();
    } catch (caught) {
      toast.error(
        caught instanceof ApiError ? caught.message : 'Could not update the record.',
      );
    } finally {
      setBusyId(null);
    }
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
      <h2 className="flex items-center gap-2 border-b border-[var(--color-line)] px-5 py-3.5 text-[15px] font-semibold">
        {bank} records
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
          No {bank} records generated yet.
        </p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Generated</th>
                <th scope="col">Details</th>
                <th scope="col">Attachment</th>
                <th scope="col">Downloads</th>
                <th scope="col" className="col-actions text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
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
                  <td data-label="Details">
                    <div className="chip-row">
                      {panels.map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          className="chip"
                          title={`View ${item.label.toLowerCase()}`}
                          onClick={() => void openPanel(record.id, item.key, item.label, item.pick)}
                          disabled={busyId === record.id}
                        >
                          <EyeIcon />
                          {item.short}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td data-label="Attachment">
                    {record.attachmentName ? (
                      // A plain anchor: the browser fetches it with the
                      // session cookie and saves it straight to disk.
                      <a
                        href={`/api/v1/students/${studentId}/records/${record.id}/attachment`}
                        download={record.attachmentName}
                        className="chip max-w-[200px]"
                        title={record.attachmentName}
                      >
                        <PaperclipIcon />
                        <span className="truncate">Uploaded PDF</span>
                      </a>
                    ) : (
                      <span className="text-[var(--color-muted)]">—</span>
                    )}
                  </td>
                  <td data-label="Downloads">
                    <div className="chip-row">
                      <button
                        type="button"
                        className="chip"
                        onClick={() => void openPdfDialog(record.id, true)}
                      >
                        <DownloadIcon />
                        {isIdbi ? 'Sample PDF' : 'Dummy PDF'}
                      </button>
                      {/* The clean statement is an administrator's to give:
                          the owner only sees it once it has been released. */}
                      {!isIdbi && (isAdmin || record.downloadReleasedAt) && (
                        <button
                          type="button"
                          className="chip"
                          onClick={() => void openPdfDialog(record.id, false)}
                        >
                          <DownloadIcon />
                          Statement
                        </button>
                      )}
                      {isAdmin && (
                        <button
                          type="button"
                          className="chip"
                          disabled={busyId === record.id}
                          onClick={() => void downloadJson(record.id)}
                        >
                          <DownloadIcon />
                          JSON
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="col-actions">
                    <div className="flex items-center justify-end gap-1">
                      {isAdmin && !isIdbi && (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="w-[124px]"
                          disabled={!record.finalizedAt}
                          title={
                            record.finalizedAt
                              ? undefined
                              : 'Finalize the record before releasing its statement'
                          }
                          loading={busyId === record.id}
                          onClick={() =>
                            void setDownloadShown(record, !record.downloadReleasedAt)
                          }
                        >
                          {record.downloadReleasedAt ? 'Hide download' : 'Show download'}
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
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={Boolean(panel)}
        title={panel?.title ?? ''}
        description={
          draft !== null
            ? 'Saving regenerates the statement from this extract, with fresh filler transactions.'
            : undefined
        }
        width="lg"
        onClose={closePanel}
        footer={
          draft !== null ? (
            <>
              <Button variant="secondary" onClick={() => setDraft(null)} disabled={draftSaving}>
                Cancel
              </Button>
              <Button onClick={() => void saveExtract()} loading={draftSaving}>
                Save
              </Button>
            </>
          ) : (
            <>
              {panel?.matchRecordId && (
                <Button
                  variant="secondary"
                  onClick={() => setMatching(true)}
                >
                  Match transactions
                </Button>
              )}
              {panel?.editRecordId && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setDraftError(null);
                    setDraft(JSON.stringify(panel.json ?? null, null, 2));
                  }}
                >
                  <PencilIcon />
                  Edit
                </Button>
              )}
              <Button variant="secondary" onClick={closePanel}>
                Close
              </Button>
            </>
          )
        }
      >
        {draftError && (
          <p
            className="mb-3 rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-[var(--color-danger)]"
            role="alert"
          >
            {draftError}
          </p>
        )}
        {draft !== null ? (
          <textarea
            aria-label="Extract JSON"
            rows={24}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            spellCheck={false}
            className="field-input max-h-[60vh] w-full font-mono text-[12px] leading-relaxed"
          />
        ) : (
          <pre className="max-h-[60vh] overflow-auto rounded-[8px] bg-slate-50 p-4 font-mono text-[12px] leading-relaxed whitespace-pre-wrap break-all">
            {JSON.stringify(panel?.json ?? null, null, 2)}
          </pre>
        )}
      </Modal>

      {matching && panel?.matchRecordId && (
        <MatchTransactionsDialog
          endpoint={`/students/${studentId}/records/${panel.matchRecordId}/match-transactions`}
          transactions={panel.json}
          onClose={() => setMatching(false)}
          onMatched={(transactions) => {
            cache.current.delete(panel.matchRecordId!);
            setPanel({ ...panel, json: transactions });
          }}
        />
      )}

      <Modal
        open={Boolean(account)}
        title="Account details"
        description={
          accountDraft
            ? 'Updates the account details only; transactions are not regenerated. Editing the record later restores the details read from the PDF.'
            : undefined
        }
        width="lg"
        onClose={() => setAccount(null)}
        footer={
          accountDraft ? (
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  setAccountDraft(null);
                  setDraftError(null);
                }}
                disabled={draftSaving}
              >
                Cancel
              </Button>
              <Button onClick={() => void saveAccount()} loading={draftSaving}>
                Update
              </Button>
            </>
          ) : (
            <>
              {account?.editable && (
                <Button variant="secondary" onClick={() => setAccountDraft({ ...account.values })}>
                  <PencilIcon />
                  Edit
                </Button>
              )}
              <Button variant="secondary" onClick={() => setAccount(null)}>
                Close
              </Button>
            </>
          )
        }
      >
        {draftError && accountDraft && (
          <p
            className="mb-3 rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-[var(--color-danger)]"
            role="alert"
          >
            {draftError}
          </p>
        )}
        {account && (
          <div className="grid max-h-[60vh] grid-cols-1 gap-x-8 gap-y-3 overflow-auto sm:grid-cols-2">
            {accountColumns(account.values, bank).map((column, index) => (
              <dl key={index} className="space-y-3">
                {column.map(([key, label]) => (
                  <div key={key}>
                    <dt>
                      <label className="field-label" htmlFor={`account-${key}`}>
                        {label}
                      </label>
                    </dt>
                    <dd>
                      {accountDraft ? (
                        <input
                          id={`account-${key}`}
                          className="field-input w-full"
                          value={accountDraft[key] ?? ''}
                          onChange={(event) =>
                            setAccountDraft({ ...accountDraft, [key]: event.target.value })
                          }
                        />
                      ) : (
                        <p id={`account-${key}`} className="break-words text-[14px]">
                          {account.values[key] || (
                            <span className="text-[var(--color-muted)]">—</span>
                          )}
                        </p>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            ))}
          </div>
        )}
      </Modal>

      {pdfFor && (
        <StatementDialog
          endpoint={`/students/${studentId}/records/${pdfFor.record.id}/statement-pdf`}
          transactions={pdfFor.record.statement.transactions}
          defaultPassword={pdfFor.record.statement.accountInfo.password}
          dummy={pdfFor.dummy}
          sample={isIdbi}
          onClose={() => setPdfFor(null)}
        />
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


/**
 * Edit and delete for a record row. A finalized record is frozen: no edit,
 * no delete, for administrators too, until it is released. Both stay in
 * place, disabled, so the column keeps its shape and the reason is one hover
 * away.
 */
export function RowEditDelete({
  locked,
  editHref,
  onDelete,
}: {
  locked: boolean;
  editHref: string;
  onDelete: () => void;
}) {
  if (locked) {
    return (
      <>
        <Button variant="ghost" size="sm" disabled aria-label="Edit record" title="Unfinalize this record to edit it">
          <PencilIcon />
        </Button>
        <Button variant="ghost" size="sm" disabled aria-label="Delete record" title="Unfinalize this record to delete it">
          <TrashIcon />
        </Button>
      </>
    );
  }
  return (
    <>
      <LinkButton href={editHref} variant="ghost" size="sm" aria-label="Edit record" title="Edit">
        <PencilIcon />
      </LinkButton>
      <Button
        variant="ghost"
        size="sm"
        aria-label="Delete record"
        title="Delete"
        className="text-[var(--color-danger)] hover:bg-red-50"
        onClick={onDelete}
      >
        <TrashIcon />
      </Button>
    </>
  );
}

export function PencilIcon() {
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

export function TrashIcon() {
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
