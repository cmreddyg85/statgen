"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { SelectField, TextField } from "@/components/Field";
import { ConfirmDialog } from "@/components/Modal";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import { useToast } from "@/components/Toast";
import { PencilIcon, TrashIcon } from "../students/[id]/RecordsTable";
import { PaymentForm, REPORT_TYPES, type Payment } from "./PaymentForm";

const rupees = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);

/** A date-only value, read as a local date so it never shifts a day. */
const day = (value: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(`${value}T00:00:00`),
  );

const receivedOf = (payment: Payment) =>
  payment.installments.reduce((sum, row) => sum + Number(row.amount), 0);

/** Paid includes overpaid; part paid has some money in but a balance left. */
const statusOf = (payment: Payment) => {
  const received = receivedOf(payment);
  return received >= payment.amount ? "paid" : received > 0 ? "part" : "unpaid";
};

const NONE = "__none__";

/** Admin-only: what each student is paying for and what has come in. */
export function PaymentsClient() {
  const toast = useToast();
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Payment | null>(null);
  const [deleting, setDeleting] = useState<Payment | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [search, setSearch] = useState("");
  const [referredBy, setReferredBy] = useState("");
  const [status, setStatus] = useState("");
  const [reportType, setReportType] = useState("");
  const [liveDone, setLiveFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const filtersApplied = Boolean(
    search || referredBy || status || reportType || liveDone || from || to,
  );

  const referrers = useMemo(
    () =>
      [...new Set((payments ?? []).map((p) => p.referredBy?.trim()).filter(Boolean))].sort() as string[],
    [payments],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (payments ?? []).filter((p) => {
      if (term && !`${p.studentName} ${p.studentCode}`.toLowerCase().includes(term)) return false;
      const ref = p.referredBy?.trim() ?? "";
      if (referredBy === NONE ? ref !== "" : referredBy && ref !== referredBy) return false;
      if (status && statusOf(p) !== status) return false;
      if (reportType && !p.reportTypes.includes(reportType as never)) return false;
      if (liveDone === "done" && !p.liveDoneAt) return false;
      if (liveDone === "pending" && p.liveDoneAt) return false;
      if (from && p.connectedDate < from) return false;
      if (to && p.connectedDate > to) return false;
      return true;
    });
  }, [payments, search, referredBy, status, reportType, liveDone, from, to]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await api.get<{ payments: Payment[] }>("/payments");
      setPayments(result.payments);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Could not load payments.",
      );
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
      setPayments(
        (current) =>
          current?.map((row) =>
            row.id === payment.id ? { ...row, liveDoneAt } : row,
          ) ?? current,
      );
      toast.success(done ? "Marked as live done." : "Live done cleared.");
    } catch (caught) {
      toast.error(
        caught instanceof ApiError
          ? caught.message
          : "Could not update the payment.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api.delete(`/payments/${deleting.id}`);
      toast.success("Payment deleted.");
      setDeleting(null);
      await load();
    } catch (caught) {
      toast.error(
        caught instanceof ApiError
          ? caught.message
          : "Could not delete the payment.",
      );
    } finally {
      setDeleteBusy(false);
    }
  };

  const openForm = (payment: Payment | null) => {
    setEditing(payment);
    setFormOpen(true);
  };

  const filterBar = (
    <div className="flex flex-wrap items-end gap-3 border-b border-line px-4 py-3">
      <div className="min-w-55 flex-1">
        <TextField
          label="Search"
          placeholder="Student name or ID"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      <SelectField
        label="Referred by"
        className="w-50"
        value={referredBy}
        onChange={setReferredBy}
        options={[
          { value: "", label: "Anyone" },
          { value: NONE, label: "Blank (not referred)" },
          ...referrers.map((name) => ({ value: name, label: name })),
        ]}
      />
      <SelectField
        label="Payment status"
        className="w-40"
        value={status}
        onChange={setStatus}
        options={[
          { value: "", label: "All" },
          { value: "paid", label: "Paid" },
          { value: "part", label: "Part paid" },
          { value: "unpaid", label: "Not paid" },
        ]}
      />
      <SelectField
        label="Report"
        className="w-36"
        value={reportType}
        onChange={setReportType}
        options={[
          { value: "", label: "Any" },
          ...REPORT_TYPES.map((t) => ({ value: t.value, label: t.label })),
        ]}
      />
      <SelectField
        label="Live done"
        className="w-36"
        value={liveDone}
        onChange={setLiveFilter}
        options={[
          { value: "", label: "All" },
          { value: "done", label: "Done" },
          { value: "pending", label: "Not done" },
        ]}
      />
      <TextField label="Connected from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
      <TextField label="Connected to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
      {filtersApplied && (
        <Button
          variant="ghost"
          onClick={() => {
            setSearch("");
            setReferredBy("");
            setStatus("");
            setReportType("");
            setLiveFilter("");
            setFrom("");
            setTo("");
          }}
        >
          Clear
        </Button>
      )}
    </div>
  );

  return (
    <>
      <PageHeader
        title="Payments"
        description="What each student is paying for, and the amounts received."
        actions={<Button onClick={() => openForm(null)}>Add payment</Button>}
      />

      <section className="card">
        {error ? (
          <ErrorState
            title="Payments unavailable"
            message={error}
            onRetry={load}
          />
        ) : !payments ? (
          <LoadingState label="Loading payments…" />
        ) : payments.length > 0 && filtered.length === 0 ? (
          <>
            {filterBar}
            <EmptyState
              title="No matching payments"
              message="No payment matches the current filters."
            />
          </>
        ) : payments.length === 0 ? (
          <EmptyState
            title="No payments yet"
            message="Add a payment to start tracking what a student owes."
            action={<Button onClick={() => openForm(null)}>Add payment</Button>}
          />
        ) : (
          <>
          {filterBar}
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Connected</th>
                  <th scope="col">Student</th>
                  <th scope="col" className="text-right">
                    Total amount
                  </th>
                  <th scope="col" className="text-right">
                    Received amount
                  </th>
                  <th scope="col" className="text-right">
                    Pending amount
                  </th>
                  <th scope="col">Referred by</th>
                  <th scope="col">Reports</th>
                  <th scope="col" className="col-actions text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((payment) => {
                  const received = receivedOf(payment);
                  const balance = payment.amount - received;
                  return (
                    <tr
                      key={payment.id}
                      className={payment.liveDoneAt ? "row-done" : undefined}
                    >
                      <td
                        data-label="Connected"
                        className="whitespace-nowrap text-muted"
                      >
                        {day(payment.connectedDate)}
                      </td>
                      <td data-label="Student">
                        <div className="font-medium">{payment.studentName}</div>
                        <div className="text-xs tabular-nums text-muted">
                          {payment.studentCode}
                        </div>
                      </td>
                      <td
                        data-label="Total amount"
                        className="text-right tabular-nums font-medium whitespace-nowrap"
                      >
                        {rupees(payment.amount)}
                      </td>
                      <td
                        data-label="Received amount"
                        className="text-right tabular-nums whitespace-nowrap"
                      >
                        {rupees(received)}
                        {payment.installments.length > 0 && (
                          <div className="text-xs text-muted">
                            {payment.installments.length} payment
                            {payment.installments.length > 1 ? "s" : ""}
                          </div>
                        )}
                      </td>
                      <td
                        data-label="Pending amount"
                        className="text-right whitespace-nowrap"
                      >
                        {balance <= 0 ? (
                          <Badge tone="success">
                            {balance < 0
                              ? `Over by ${rupees(-balance)}`
                              : "Paid"}
                          </Badge>
                        ) : (
                          <span className="tabular-nums font-semibold text-danger">
                            {rupees(balance)}
                          </span>
                        )}
                      </td>
                      <td data-label="Referred by">
                        {payment.referredBy ?? (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td data-label="Reports">
                        <div className="flex flex-wrap gap-1">
                          {payment.reportTypes.length === 0 ? (
                            <span className="text-muted">—</span>
                          ) : (
                            REPORT_TYPES.filter((t) =>
                              payment.reportTypes.includes(t.value),
                            ).map((t) => (
                              <Badge key={t.value} tone="info">
                                {t.label}
                              </Badge>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="col-actions">
                        <div className="flex items-center justify-end gap-1">
                          {payment.liveDoneAt ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              className="w-28 border-green-200 bg-green-50 text-success hover:bg-green-100"
                              title={`Marked ${formatDateTime(payment.liveDoneAt)}. Click to undo.`}
                              loading={busyId === payment.id}
                              onClick={() => void setLiveDone(payment, false)}
                            >
                              ✓ Live done
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              className="w-28"
                              loading={busyId === payment.id}
                              onClick={() => void setLiveDone(payment, true)}
                            >
                              Live Done
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label="Edit payment"
                            title="Edit"
                            onClick={() => openForm(payment)}
                          >
                            <PencilIcon />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label="Delete payment"
                            title="Delete"
                            className="text-danger hover:bg-red-50"
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
          </>
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
        message={`This removes the payment for ${deleting?.studentName ?? "this student"} and every amount recorded against it. This cannot be undone.`}
        confirmLabel="Delete"
        loading={deleteBusy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}
