'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/Modal';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { useToast } from '@/components/Toast';
import { PencilIcon, TrashIcon } from '../students/[id]/RecordsTable';
import { PaymentForm, REPORT_TYPES, type Payment } from './PaymentForm';

const rupees = (value: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);

/** A date-only value, read as a local date so it never shifts a day. */
const day = (value: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(`${value}T00:00:00`));

/** Admin-only: what each student is paying for and what has come in. */
export function PaymentsClient() {
  const toast = useToast();
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Payment | null>(null);
  const [deleting, setDeleting] = useState<Payment | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await api.get<{ payments: Payment[] }>('/payments');
      setPayments(result.payments);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load payments.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const [busyId, setBusyId] = useState<string | null>(null);

  const setLiveDone = async (payment: Payment, done: boolean) => {
    setBusyId(payment.id);
    try {
      const { liveDoneAt } = await api.post<{ liveDoneAt: string | null }>(
        `/payments/${payment.id}/live-done`,
        { done },
      );
      setPayments((current) =>
        current?.map((row) => (row.id === payment.id ? { ...row, liveDoneAt } : row)) ?? current,
      );
      toast.success(done ? 'Marked as live done.' : 'Live done cleared.');
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : 'Could not update the payment.');
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api.delete(`/payments/${deleting.id}`);
      toast.success('Payment deleted.');
      setDeleting(null);
      await load();
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : 'Could not delete the payment.');
    } finally {
      setDeleteBusy(false);
    }
  };

  const openForm = (payment: Payment | null) => {
    setEditing(payment);
    setFormOpen(true);
  };

  return (
    <>
      <PageHeader
        title="Payments"
        description="What each student is paying for, and the amounts received."
        actions={<Button onClick={() => openForm(null)}>Add payment</Button>}
      />

      <section className="card">
        {error ? (
          <ErrorState title="Payments unavailable" message={error} onRetry={load} />
        ) : !payments ? (
          <LoadingState label="Loading payments…" />
        ) : payments.length === 0 ? (
          <EmptyState
            title="No payments yet"
            message="Add a payment to start tracking what a student owes."
            action={<Button onClick={() => openForm(null)}>Add payment</Button>}
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Connected</th>
                  <th scope="col">Student</th>
                  <th scope="col">Referred by</th>
                  <th scope="col">Reports</th>
                  <th scope="col" className="text-right">Total amount</th>
                  <th scope="col" className="text-right">Received amount</th>
                  <th scope="col" className="text-right">Pending amount</th>
                  <th scope="col" className="col-actions text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => {
                  const received = payment.installments.reduce((sum, row) => sum + Number(row.amount), 0);
                  const balance = payment.amount - received;
                  return (
                    <tr key={payment.id} className={payment.liveDoneAt ? 'row-done' : undefined}>
                      <td data-label="Connected" className="whitespace-nowrap text-[var(--color-muted)]">
                        {day(payment.connectedDate)}
                      </td>
                      <td data-label="Student">
                        <div className="font-medium">{payment.studentName}</div>
                        <div className="text-xs tabular-nums text-[var(--color-muted)]">{payment.studentCode}</div>
                      </td>
                      <td data-label="Referred by">{payment.referredBy ?? <span className="text-[var(--color-muted)]">—</span>}</td>
                      <td data-label="Reports">
                        <div className="flex flex-wrap gap-1">
                          {payment.reportTypes.length === 0 ? (
                            <span className="text-[var(--color-muted)]">—</span>
                          ) : (
                            REPORT_TYPES.filter((t) => payment.reportTypes.includes(t.value)).map((t) => (
                              <Badge key={t.value} tone="info">
                                {t.label}
                              </Badge>
                            ))
                          )}
                        </div>
                      </td>
                      <td data-label="Total amount" className="text-right tabular-nums font-medium whitespace-nowrap">
                        {rupees(payment.amount)}
                      </td>
                      <td data-label="Received amount" className="text-right tabular-nums whitespace-nowrap">
                        {rupees(received)}
                        {payment.installments.length > 0 && (
                          <div className="text-xs text-[var(--color-muted)]">
                            {payment.installments.length} payment{payment.installments.length > 1 ? 's' : ''}
                          </div>
                        )}
                      </td>
                      <td data-label="Pending amount" className="text-right whitespace-nowrap">
                        {balance <= 0 ? (
                          <Badge tone="success">{balance < 0 ? `Over by ${rupees(-balance)}` : 'Paid'}</Badge>
                        ) : (
                          <span className="tabular-nums font-semibold text-[var(--color-danger)]">{rupees(balance)}</span>
                        )}
                      </td>
                      <td className="col-actions">
                        <div className="flex items-center justify-end gap-1">
                          {payment.liveDoneAt ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              className="w-[112px] border-green-200 bg-green-50 text-[var(--color-success)] hover:bg-green-100"
                              title={`Marked ${formatDateTime(payment.liveDoneAt)}. Click to undo.`}
                              loading={busyId === payment.id}
                              onClick={() => void setLiveDone(payment, false)}
                            >
                              ✓ Live done
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              className="w-[112px]"
                              loading={busyId === payment.id}
                              onClick={() => void setLiveDone(payment, true)}
                            >
                              Live Done
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" aria-label="Edit payment" title="Edit" onClick={() => openForm(payment)}>
                            <PencilIcon />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label="Delete payment"
                            title="Delete"
                            className="text-[var(--color-danger)] hover:bg-red-50"
                            onClick={() => setDeleting(payment)}
                          >
                            <TrashIcon />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <PaymentForm
        open={formOpen}
        payment={editing}
        onClose={() => setFormOpen(false)}
        onSaved={(message) => {
          setFormOpen(false);
          toast.success(message);
          void load();
        }}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete payment"
        message={`This removes the payment for ${deleting?.studentName ?? 'this student'} and every amount recorded against it. This cannot be undone.`}
        confirmLabel="Delete"
        loading={deleteBusy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}
