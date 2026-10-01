'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { retargetDate } from '@/lib/email-date';
import type { EmailInput, StudentRecordEntry } from '@/lib/types';
import { Button, LinkButton } from '@/components/Button';
import { SelectField, TextField } from '@/components/Field';
import { useToast } from '@/components/Toast';

interface Replacement {
  key: number;
  find: string;
  replace: string;
  /** What was filled in for `replace`; while it still reads that, it follows. */
  auto?: string;
}

/** Fills New text from a pasted date, unless someone has typed their own. */
const refill = (r: Replacement, email: EmailDraft): Replacement => {
  if (r.replace !== '' && r.replace !== r.auto) return r;
  const next = retargetDate(r.find, email);
  return next === null ? r : { ...r, replace: next, auto: next };
};

interface EmailDraft extends Omit<EmailInput, 'replacements'> {
  key: number;
  /** A newly picked file; without one the stored `fileId` is kept. */
  file: File | null;
  replacements: Replacement[];
}

let nextKey = 0;
const emptyReplacement = (): Replacement => ({ key: nextKey++, find: '', replace: '' });
const emptyEmail = (): EmailDraft => ({
  key: nextKey++,
  subject: '',
  date: '',
  hour: 12,
  minute: 0,
  meridiem: 'AM',
  mode: 'date',
  fileId: null,
  attachmentName: null,
  file: null,
  replacements: [],
});

const HOURS = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));
const MINUTES = Array.from({ length: 60 }, (_, i) => ({
  value: String(i),
  label: String(i).padStart(2, '0'),
}));
const MODES = [
  { value: 'date', label: 'Date only' },
  { value: 'all', label: 'All details' },
] as const;
const SENDER_FIELDS = [
  ['senderName', 'Sender name'],
  ['senderEmail', 'Sender email'],
  ['mailedBy', 'Mailed by'],
  ['signedBy', 'Signed by'],
  ['logo', 'Logo'],
] as const;
const MERIDIEMS = [
  { value: 'AM', label: 'AM' },
  { value: 'PM', label: 'PM' },
];

/**
 * The email record form: one section per email, each with a subject, a sent
 * date and time, an optional attachment and its old → new text replacements.
 * The server builds the output JSON from it.
 */
export function EmailRecordForm({ studentId, recordId }: { studentId: string; recordId?: string }) {
  const toast = useToast();
  const router = useRouter();
  const [emails, setEmails] = useState<EmailDraft[]>(() => [emptyEmail()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(Boolean(recordId));

  useEffect(() => {
    if (!recordId) return;
    let active = true;
    api
      .get<{ record: StudentRecordEntry }>(`/students/${studentId}/records/${recordId}`)
      .then(({ record }) => {
        const stored = (record.input as { emails?: EmailInput[] }).emails ?? [];
        if (active && stored.length > 0) {
          setEmails(
            stored.map((email) => ({
              ...email,
              key: nextKey++,
              file: null,
              replacements: email.replacements.map((r) => ({ ...r, key: nextKey++ })),
            })),
          );
        }
      })
      .catch(() => (active ? toast.error('This record could not be loaded for editing.') : undefined))
      .finally(() => (active ? setLoading(false) : undefined));
    return () => {
      active = false;
    };
  }, [studentId, recordId, toast]);

  const setEmail = (index: number, next: Partial<EmailDraft>) =>
    setEmails((current) =>
      current.map((email, i) => {
        if (i !== index) return email;
        const updated = { ...email, ...next };
        // A new date or time moves the filled-in texts with it.
        const when = 'date' in next || 'hour' in next || 'minute' in next || 'meridiem' in next;
        return when ? { ...updated, replacements: updated.replacements.map((r) => refill(r, updated)) } : updated;
      }),
    );

  const setReplacement = (index: number, rIndex: number, next: Partial<Replacement>) =>
    setEmails((current) =>
      current.map((email, i) =>
        i === index
          ? {
              ...email,
              replacements: email.replacements.map((r, j) =>
                j !== rIndex ? r : 'find' in next ? refill({ ...r, ...next }, email) : { ...r, ...next },
              ),
            }
          : email,
      ),
    );

  const save = async () => {
    const found: Record<string, string> = {};
    emails.forEach((email, i) => {
      if (!email.subject.trim()) found[`${i}.subject`] = 'Enter the subject.';
      if (!email.date) found[`${i}.date`] = 'Pick the date.';
      email.replacements.forEach((r, j) => {
        if (!r.find) found[`${i}.replacements.${j}.find`] = 'Enter the old text.';
      });
    });
    setErrors(found);
    if (Object.keys(found).length > 0) {
      toast.error('Please correct the highlighted fields.');
      return;
    }

    const body = new FormData();
    body.append(
      'input',
      JSON.stringify({
        emails: emails.map(({ key: _key, file: _file, attachmentName: _name, replacements, ...email }) => ({
          ...email,
          replacements: replacements.map(({ find, replace }) => ({ find, replace })),
        })),
      }),
    );
    emails.forEach((email, i) => {
      if (email.file) body.append(`file_${i}`, email.file);
    });

    setBusy(true);
    try {
      if (recordId) {
        await api.put(`/students/${studentId}/email-records/${recordId}`, body);
      } else {
        await api.post(`/students/${studentId}/email-records`, body);
      }
      toast.success(recordId ? 'Email record updated.' : 'Email record saved.');
      router.push(`/students/${studentId}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not save the email record.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section className="card px-5 py-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">
            Emails <span className="font-normal text-[var(--color-muted)]">({emails.length})</span>
          </h2>
          <Button onClick={() => setEmails([...emails, emptyEmail()])}>Add email</Button>
        </div>

        <div className="flex flex-col gap-4">
          {emails.map((email, index) => (
            <div
              key={email.key}
              className="rounded-[10px] border border-[var(--color-line)] bg-slate-50/40 px-4 py-4"
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Email {index + 1}</h3>
                {emails.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-[var(--color-danger)] hover:bg-red-50"
                    onClick={() => setEmails(emails.filter((_, i) => i !== index))}
                  >
                    Remove
                  </Button>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-4">
                <div className="flex gap-6 text-[13px] font-medium sm:col-span-4" role="radiogroup">
                  {MODES.map((mode) => (
                    <label key={mode.value} className="inline-flex cursor-pointer items-center gap-2">
                      <input
                        type="radio"
                        name={`email-mode-${email.key}`}
                        checked={(email.mode ?? 'date') === mode.value}
                        onChange={() => setEmail(index, { mode: mode.value })}
                      />
                      {mode.label}
                    </label>
                  ))}
                </div>

                <div className="sm:col-span-4">
                  <TextField
                    label="Subject"
                    required
                    value={email.subject}
                    onChange={(event) => setEmail(index, { subject: event.target.value })}
                    error={errors[`${index}.subject`]}
                  />
                </div>

                <TextField
                  label="Date"
                  type="date"
                  required
                  value={email.date}
                  onChange={(event) => setEmail(index, { date: event.target.value })}
                  error={errors[`${index}.date`]}
                />
                <SelectField
                  label="Hour"
                  value={String(email.hour)}
                  onChange={(value) => setEmail(index, { hour: Number(value) })}
                  options={HOURS}
                />
                <SelectField
                  label="Minute"
                  value={String(email.minute)}
                  onChange={(value) => setEmail(index, { minute: Number(value) })}
                  options={MINUTES}
                />
                <SelectField
                  label="AM / PM"
                  value={email.meridiem}
                  onChange={(value) => setEmail(index, { meridiem: value as 'AM' | 'PM' })}
                  options={MERIDIEMS}
                />

                {email.mode === 'all' &&
                  SENDER_FIELDS.map(([field, label]) => (
                    <div key={field} className="sm:col-span-2">
                      <TextField
                        label={label}
                        value={email[field] ?? ''}
                        onChange={(event) => setEmail(index, { [field]: event.target.value })}
                      />
                    </div>
                  ))}

                <div className="sm:col-span-4">
                  <label className="field-label" htmlFor={`email-file-${email.key}`}>
                    Attachment
                  </label>
                  <input
                    id={`email-file-${email.key}`}
                    type="file"
                    onChange={(event) => setEmail(index, { file: event.target.files?.[0] ?? null })}
                    className="block w-full cursor-pointer rounded-[8px] border border-[var(--color-line)] bg-white p-2 text-[13px] file:mr-3 file:cursor-pointer file:rounded-[6px] file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-[13px] file:font-semibold file:text-[var(--color-ink)] hover:file:bg-slate-200"
                  />
                  {!email.file && email.fileId && recordId && (
                    <p className="mt-1.5 text-xs text-[var(--color-muted)]">
                      Stored:{' '}
                      <a
                        href={`/api/v1/students/${studentId}/records/${recordId}/files/${email.fileId}`}
                        download={email.attachmentName ?? undefined}
                        className="font-medium text-[var(--color-primary)] hover:underline"
                      >
                        {email.attachmentName}
                      </a>
                      . Pick a file to replace it.{' '}
                      <button
                        type="button"
                        className="font-medium text-[var(--color-danger)] hover:underline"
                        onClick={() => setEmail(index, { fileId: null, attachmentName: null })}
                      >
                        Remove
                      </button>
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-5 border-t border-[var(--color-line)] pt-4">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="text-[13px] font-semibold">
                    Replace text{' '}
                    <span className="font-normal text-[var(--color-muted)]">
                      ({email.replacements.length})
                    </span>
                  </h4>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      setEmail(index, { replacements: [...email.replacements, emptyReplacement()] })
                    }
                  >
                    Add replacement
                  </Button>
                </div>

                {email.replacements.length === 0 ? (
                  <p className="text-[13px] text-[var(--color-muted)]">No replacements added.</p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {email.replacements.map((r, rIndex) => (
                      <div
                        key={r.key}
                        className="grid items-start gap-3 rounded-[8px] border border-[var(--color-line)] bg-white px-3 py-3 sm:grid-cols-[1fr_1fr_auto]"
                      >
                        <TextField
                          label="Old text"
                          value={r.find}
                          onChange={(event) => setReplacement(index, rIndex, { find: event.target.value })}
                          error={errors[`${index}.replacements.${rIndex}.find`]}
                        />
                        <TextField
                          label="New text"
                          value={r.replace}
                          onChange={(event) =>
                            setReplacement(index, rIndex, { replace: event.target.value })
                          }
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-6 text-[var(--color-danger)] hover:bg-red-50"
                          onClick={() =>
                            setEmail(index, {
                              replacements: email.replacements.filter((_, j) => j !== rIndex),
                            })
                          }
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="flex justify-end gap-3 pb-2">
        <LinkButton href={`/students/${studentId}`} variant="secondary">
          Cancel
        </LinkButton>
        <Button onClick={() => void save()} loading={busy || loading}>
          {recordId ? 'Save changes' : 'Save'}
        </Button>
      </div>
    </>
  );
}
