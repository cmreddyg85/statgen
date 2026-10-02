'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { api, applyApiError } from '@/lib/api';
import { Button } from '@/components/Button';
import { TextField } from '@/components/Field';
import { Modal } from '@/components/Modal';

export const REPORT_TYPES = [
  { value: 'SBI', label: 'SBI' },
  { value: 'IDBI', label: 'IDBI' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'STATEMENTS', label: 'Statements' },
] as const;
export type ReportType = (typeof REPORT_TYPES)[number]['value'];

export interface Installment {
  date: string;
  remarks: string;
  amount: number;
}

export interface Payment {
  id: string;
  connectedDate: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  offerCompany: string | null;
  bgvCompany: string | null;
  referredBy: string | null;
  reportTypes: ReportType[];
  amount: number;
  installments: Installment[];
  liveDoneAt: string | null;
}

interface StudentOption {
  id: string;
  studentCode: string;
  name: string;
  offerCompany: string | null;
  referredBy: string | null;
  archived: boolean;
}

interface Row {
  key: number;
  date: string;
  remarks: string;
  amount: string;
}

let nextKey = 0;
const today = () => new Date().toLocaleDateString('en-CA');
const emptyRow = (): Row => ({ key: nextKey++, date: today(), remarks: '', amount: '' });

/** Create (payment null) or edit a payment, with any number of amounts received. */
export function PaymentForm({
  open,
  payment,
  onClose,
  onSaved,
}: {
  open: boolean;
  payment: Payment | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [connectedDate, setConnectedDate] = useState('');
  const [studentId, setStudentId] = useState('');
  const [offerCompany, setOfferCompany] = useState('');
  const [bgvCompany, setBgvCompany] = useState('');
  const [referredBy, setReferredBy] = useState('');
  const [reportTypes, setReportTypes] = useState<ReportType[]>([]);
  const [amount, setAmount] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  /** Which dropdown is open. */
  const [menu, setMenu] = useState<'student' | 'types' | null>(null);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setConnectedDate(payment?.connectedDate ?? today());
    setStudentId(payment?.studentId ?? '');
    setOfferCompany(payment?.offerCompany ?? '');
    setBgvCompany(payment?.bgvCompany ?? '');
    setReferredBy(payment?.referredBy ?? '');
    setReportTypes(payment?.reportTypes ?? []);
    setAmount(payment ? String(payment.amount) : '');
    setRows(
      payment?.installments.map((row) => ({ ...row, key: nextKey++, amount: String(row.amount) })) ?? [],
    );
    setMenu(null);
    setSearch('');
    setFormError(null);
    setFieldErrors({});
    api
      .get<{ students: StudentOption[] }>('/payments/students', {
        query: { include: payment?.studentId },
      })
      .then((result) => setStudents(result.students))
      .catch(() => setFormError('Could not load the student list.'));
  }, [open, payment]);

  // An open dropdown closes on a click outside it.
  useEffect(() => {
    if (!menu) return;
    const onClick = (event: MouseEvent) => {
      if (!(event.target as Element).closest('[data-menu]')) setMenu(null);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menu]);

  /** Picking a student fills in what their record already knows. */
  const pickStudent = (id: string) => {
    setStudentId(id);
    setMenu(null);
    setSearch('');
    const student = students.find((s) => s.id === id);
    if (student) {
      setOfferCompany(student.offerCompany ?? '');
      setReferredBy(student.referredBy ?? '');
    }
  };

  const setRow = (index: number, next: Partial<Row>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...next } : row)));

  const toggleType = (value: ReportType) =>
    setReportTypes((current) =>
      current.includes(value)
        ? current.filter((type) => type !== value)
        : REPORT_TYPES.map((t) => t.value).filter((t) => t === value || current.includes(t)),
    );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setFormError(null);
    setFieldErrors({});
    setSaving(true);
    const payload = {
      connectedDate,
      studentId,
      offerCompany,
      bgvCompany,
      referredBy,
      reportTypes,
      amount: amount.trim(),
      installments: rows.map(({ date, remarks, amount: value }) => ({ date, remarks, amount: value.trim() })),
    };
    try {
      if (payment) {
        await api.put(`/payments/${payment.id}`, payload);
        onSaved('Payment updated.');
      } else {
        await api.post('/payments', payload);
        onSaved('Payment added.');
      }
    } catch (error) {
      applyApiError(error, setFieldErrors, setFormError);
    } finally {
      setSaving(false);
    }
  };

  const selectedStudent = students.find((s) => s.id === studentId);
  const term = search.trim().toLowerCase();
  const matches = term
    ? students.filter((s) => s.name.toLowerCase().includes(term) || s.studentCode.includes(term))
    : students;

  const typeLabel = reportTypes.length
    ? REPORT_TYPES.filter((t) => reportTypes.includes(t.value)).map((t) => t.label).join(', ')
    : 'Select report types';

  return (
    <Modal
      open={open}
      title={payment ? 'Edit payment' : 'Add payment'}
      width="lg"
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="payment-form" loading={saving}>
            {payment ? 'Save changes' : 'Save'}
          </Button>
        </>
      }
    >
      <form id="payment-form" onSubmit={(event) => void submit(event)} className="space-y-5">
        {formError && (
          <p className="rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-[var(--color-danger)]" role="alert">
            {formError}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Connected date"
            type="date"
            required
            value={connectedDate}
            onChange={(event) => setConnectedDate(event.target.value)}
            error={fieldErrors.connectedDate}
          />
          <div data-menu className="relative">
            <span className="field-label">Student</span>
            <button
              type="button"
              className="field-input flex items-center justify-between gap-2 text-left"
              aria-haspopup="listbox"
              aria-expanded={menu === 'student'}
              aria-invalid={fieldErrors.studentId ? true : undefined}
              onClick={() => setMenu((value) => (value === 'student' ? null : 'student'))}
            >
              {selectedStudent ? (
                <span className="flex min-w-0 items-center gap-2">
                  <span className="tabular-nums text-[var(--color-muted)]">{selectedStudent.studentCode}</span>
                  <span className="truncate">{selectedStudent.name}</span>
                  {selectedStudent.archived && <span className="shrink-0 text-xs text-[var(--color-muted)]">(archived)</span>}
                </span>
              ) : (
                <span className="text-[var(--color-muted)]">{students.length ? 'Select a student' : 'Loading students…'}</span>
              )}
              <span aria-hidden="true">▾</span>
            </button>
            {menu === 'student' && (
              <div className="absolute z-20 mt-1 w-full rounded-md border border-[var(--color-line)] bg-white shadow-lg">
                <div className="border-b border-[var(--color-line)] p-2">
                  <input
                    autoFocus
                    className="field-input"
                    placeholder="Search by name or ID"
                    aria-label="Search students"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    onKeyDown={(event) => {
                      // Enter picks the only match instead of submitting the form.
                      if (event.key !== 'Enter') return;
                      event.preventDefault();
                      if (matches.length === 1) pickStudent(matches[0]!.id);
                    }}
                  />
                </div>
                <ul role="listbox" className="max-h-64 overflow-y-auto py-1">
                  {matches.length === 0 ? (
                    <li className="px-3 py-2 text-sm text-[var(--color-muted)]">
                      {students.length === 0 ? 'No students.' : 'No matches.'}
                    </li>
                  ) : (
                    matches.map((s) => (
                      <li key={s.id} role="option" aria-selected={s.id === studentId}>
                        <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50">
                          <input
                            type="radio"
                            name="payment-student"
                            checked={s.id === studentId}
                            onChange={() => pickStudent(s.id)}
                          />
                          <span className="tabular-nums text-[var(--color-muted)]">{s.studentCode}</span>
                          <span className="flex-1 truncate">
                            {s.name}
                            {s.archived && <span className="ml-1 text-xs text-[var(--color-muted)]">(archived)</span>}
                          </span>
                          {s.offerCompany && (
                            <span className="truncate text-xs text-[var(--color-muted)]">{s.offerCompany}</span>
                          )}
                        </label>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            )}
            {fieldErrors.studentId && (
              <p className="field-error" role="alert">
                {fieldErrors.studentId}
              </p>
            )}
          </div>
          <TextField
            label="Offer company"
            value={offerCompany}
            onChange={(event) => setOfferCompany(event.target.value)}
            error={fieldErrors.offerCompany}
          />
          <TextField
            label="BGV company"
            value={bgvCompany}
            onChange={(event) => setBgvCompany(event.target.value)}
            error={fieldErrors.bgvCompany}
          />
          <TextField
            label="Referred by"
            value={referredBy}
            onChange={(event) => setReferredBy(event.target.value)}
            error={fieldErrors.referredBy}
          />

          <div data-menu className="relative">
            <span className="field-label">Reports type</span>
            <button
              type="button"
              className="field-input flex items-center justify-between text-left"
              aria-haspopup="listbox"
              aria-expanded={menu === 'types'}
              onClick={() => setMenu((value) => (value === 'types' ? null : 'types'))}
            >
              <span className={`truncate ${reportTypes.length ? '' : 'text-[var(--color-muted)]'}`}>{typeLabel}</span>
              <span aria-hidden="true">▾</span>
            </button>
            {menu === 'types' && (
              <ul
                role="listbox"
                aria-multiselectable="true"
                className="absolute z-20 mt-1 w-full rounded-md border border-[var(--color-line)] bg-white py-1 shadow-lg"
              >
                {REPORT_TYPES.map((type) => (
                  <li key={type.value} role="option" aria-selected={reportTypes.includes(type.value)}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={reportTypes.includes(type.value)}
                        onChange={() => toggleType(type.value)}
                      />
                      {type.label}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <TextField
            label="Total amount"
            inputMode="decimal"
            required
            placeholder="25000"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            error={fieldErrors.amount}
          />
        </div>

        <div className="border-t border-[var(--color-line)] pt-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[13px] font-semibold">
              Payments received{' '}
              <span className="font-normal text-[var(--color-muted)]">({rows.length})</span>
            </h3>
            <Button type="button" variant="secondary" size="sm" onClick={() => setRows([...rows, emptyRow()])}>
              Add amount
            </Button>
          </div>

          {rows.length === 0 ? (
            <p className="text-[13px] text-[var(--color-muted)]">No amounts received yet.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {rows.map((row, index) => (
                <div
                  key={row.key}
                  className="grid items-start gap-3 rounded-[8px] border border-[var(--color-line)] bg-slate-50/40 px-3 py-3 sm:grid-cols-[160px_1fr_140px_auto]"
                >
                  <TextField
                    label="Date"
                    type="date"
                    value={row.date}
                    onChange={(event) => setRow(index, { date: event.target.value })}
                    error={fieldErrors[`installments.${index}.date`]}
                  />
                  <TextField
                    label="Remarks"
                    value={row.remarks}
                    onChange={(event) => setRow(index, { remarks: event.target.value })}
                    error={fieldErrors[`installments.${index}.remarks`]}
                  />
                  <TextField
                    label="Received amount"
                    inputMode="decimal"
                    value={row.amount}
                    onChange={(event) => setRow(index, { amount: event.target.value })}
                    error={fieldErrors[`installments.${index}.amount`]}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-[var(--color-danger)] hover:bg-red-50 sm:mt-6"
                    onClick={() => setRows(rows.filter((_, i) => i !== index))}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
}
