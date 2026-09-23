'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { ApiError, api } from '@/lib/api';
import {
  emptyCompany,
  emptyForm,
  fromPayload,
  toPayload,
  validate,
  type CompanyInput,
  type Errors,
  type GenerateRecordInput,
} from '@/lib/generate-record';
import type { SbiStatement, Student, StudentRecordEntry } from '@/lib/types';
import { Button } from '@/components/Button';
import { TextField } from '@/components/Field';
import { PageHeader } from '@/components/PageHeader';
import { Toggle } from '@/components/Toggle';
import { useToast } from '@/components/Toast';
import { CompanySection } from './CompanySection';

type GenerateResponse = SbiStatement & { extracted: Record<string, unknown> };

/**
 * Generate-record form.
 *
 * Generate sends the details to the SBI module and prints all three payloads
 * to the console. A statement whose dates came out in order is stored against
 * the student and the browser returns to their page; one with `invalidDates`
 * is never stored, and the form stays put with the error.
 *
 * With `recordId` the same form edits a stored record: the account block was
 * already read off a PDF, so uploading one again is optional.
 */
export function GenerateRecordForm({
  studentId,
  recordId,
}: {
  studentId: string;
  recordId?: string;
}) {
  const toast = useToast();
  const router = useRouter();
  const [student, setStudent] = useState<Student | null>(null);
  const [form, setForm] = useState<GenerateRecordInput>(emptyForm);
  const [errors, setErrors] = useState<Errors>({});
  // The file input validates itself on pick, separately from the form rules.
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  // SBI statements are usually protected; blank unless the PDF asks for one.
  const [pdfPassword, setPdfPassword] = useState('');
  const [busy, setBusy] = useState(false);
  // Kept when editing: lets the statement be rebuilt without the PDF again.
  const [storedExtract, setStoredExtract] = useState<Record<string, unknown> | null>(null);
  const [storedAttachment, setStoredAttachment] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(recordId));
  const fileInput = useRef<HTMLInputElement>(null);

  // Once Generate has been pressed, errors follow edits instead of going
  // stale — a field the user has just fixed stops complaining.
  useEffect(() => {
    if (submitted) setErrors(validate(form));
  }, [form, submitted]);

  useEffect(() => {
    api
      .get<{ student: Student }>(`/students/${studentId}`)
      .then((result) => setStudent(result.student))
      .catch(() => setStudent(null));
  }, [studentId]);

  useEffect(() => {
    if (!recordId) return;
    let active = true;

    api
      .get<{ record: StudentRecordEntry }>(`/students/${studentId}/records/${recordId}`)
      .then(({ record }) => {
        if (!active) return;
        setForm(fromPayload(record.input));
        setStoredExtract(record.extract);
        setStoredAttachment(record.attachmentName);
      })
      .catch(() =>
        active ? setFormError('This record could not be loaded for editing.') : undefined,
      )
      .finally(() => (active ? setLoading(false) : undefined));

    return () => {
      active = false;
    };
  }, [studentId, recordId]);

  const set = <K extends keyof GenerateRecordInput>(
    key: K,
    value: GenerateRecordInput[K],
  ) => setForm((current) => ({ ...current, [key]: value }));

  const setCompany = (index: number, next: CompanyInput) =>
    setForm((current) => ({
      ...current,
      companies: current.companies.map((company, i) => (i === index ? next : company)),
    }));

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0];
    if (!picked) {
      setFile(null);
      set('documentName', null);
      return;
    }
    // accept="application/pdf" is a hint only — a file can still be picked.
    if (picked.type !== 'application/pdf' && !picked.name.toLowerCase().endsWith('.pdf')) {
      setDocumentError('Only PDF files are allowed.');
      setFile(null);
      set('documentName', null);
      if (fileInput.current) fileInput.current.value = '';
      return;
    }
    setDocumentError(null);
    setFile(picked);
    set('documentName', picked.name);
  };

  /** Runs the SBI module: a fresh PDF re-reads the account, otherwise the
   * stored account block is reused and only the salary periods change. */
  const runGeneration = useCallback(
    async (payload: ReturnType<typeof toPayload> & { studentId: string }) => {
      if (file) {
        const body = new FormData();
        body.append('file', file);
        body.append('details', JSON.stringify(payload));
        if (pdfPassword) body.append('password', pdfPassword);
        return api.post<GenerateResponse>('/sbi/extract-statement', body);
      }
      return api.post<GenerateResponse>('/sbi/regenerate', {
        extract: storedExtract,
        details: payload,
      });
    },
    [file, pdfPassword, storedExtract],
  );

  const generate = async () => {
    const found = validate(form);
    setSubmitted(true);
    setErrors(found);
    setFormError(null);

    if (Object.keys(found).length > 0 || documentError) {
      toast.error('Please correct the highlighted fields.');
      return;
    }

    if (!file && !storedExtract) {
      setDocumentError('Upload the bank statement first page.');
      toast.error('Please correct the highlighted fields.');
      return;
    }

    const payload = { studentId, student: student?.name ?? null, ...toPayload(form) };

    setBusy(true);
    try {
      const { extracted, ...statement } = await runGeneration(payload);
      /* eslint-disable no-console */
      console.log('1. Generate record payload:', payload);
      // What the form + the statement's first page become: account block,
      // salary periods, and the generator's settings.
      console.log('2. SBI extract:', extracted);
      console.log(JSON.stringify(extracted, null, 2));
      console.log('3. SBI statement:', statement);
      console.log(JSON.stringify(statement, null, 2));
      /* eslint-enable no-console */

      if (statement.invalidDates.length > 0) {
        // Out-of-order dates mean the generated statement is unusable, so
        // nothing is stored and the form stays where it is.
        setFormError(
          `The generated transactions came out in the wrong order (${statement.invalidDates.length} date(s)). Nothing was saved — adjust the dates and generate again.`,
        );
        toast.error('Generation produced invalid dates. Nothing was saved.');
        return;
      }

      // The statement page is stored with the record, so it travels as
      // multipart whenever one was picked. An edit that keeps its file sends
      // plain JSON and the stored PDF stays as it is.
      let record: FormData | Record<string, unknown>;
      if (file) {
        const body = new FormData();
        body.append('file', file);
        body.append('input', JSON.stringify(payload));
        body.append('extract', JSON.stringify(extracted));
        body.append('statement', JSON.stringify(statement));
        record = body;
      } else {
        record = { input: payload, extract: extracted, statement };
      }

      if (recordId) {
        await api.put(`/students/${studentId}/records/${recordId}`, record);
      } else {
        await api.post(`/students/${studentId}/records`, record);
      }

      toast.success(recordId ? 'Record updated.' : 'Record generated and saved.');
      router.push(`/students/${studentId}`);
      router.refresh();
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : 'Could not generate the record.';
      setFormError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Link
        href={`/students/${studentId}`}
        className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-muted)] hover:text-[var(--color-ink)]"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="m14 7-5 5 5 5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Back to {student?.name ?? 'student'}
      </Link>

      <PageHeader
        title={recordId ? 'Edit record' : 'Generate record'}
        description={
          student
            ? `Employment and salary details for ${student.name}.`
            : 'Employment and salary details.'
        }
      />

      {formError && (
        <p className="card mb-4 border-red-200 bg-red-50 px-5 py-3 text-[13px] text-[var(--color-danger)]" role="alert">
          {formError}
        </p>
      )}

      <div className="flex flex-col gap-4">
        <section className="card px-5 py-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">
              Companies{' '}
              <span className="font-normal text-[var(--color-muted)]">
                ({form.companies.length})
              </span>
            </h2>
            <Button
              onClick={() => set('companies', [...form.companies, emptyCompany()])}
            >
              Add company
            </Button>
          </div>

          {errors.companies && <p className="field-error mb-3">{errors.companies}</p>}

          <div className="flex flex-col gap-4">
            {form.companies.map((company, index) => (
              <CompanySection
                key={company.id}
                company={company}
                index={index}
                errors={errors}
                onChange={(next) => setCompany(index, next)}
                onRemove={() =>
                  set(
                    'companies',
                    form.companies.filter((_, i) => i !== index),
                  )
                }
                removable={form.companies.length > 1}
              />
            ))}
          </div>
        </section>

        <section className="card px-5 py-5">
          <h2 className="mb-4 text-[15px] font-semibold">Payout and settlement</h2>

          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              label="Salary day"
              inputMode="numeric"
              required
              value={form.salaryDay}
              onChange={(event) =>
                set('salaryDay', event.target.value.replace(/[^\d]/g, ''))
              }
              error={errors.salaryDay}
              hint="Day of the month, 1–31."
            />
            <div className="sm:pt-7">
              <Toggle
                label="Next working day"
                hint="If salary day is in weekend then we have to move to next/previous working day"
                checked={form.nextWorkingDay}
                onChange={(checked) => set('nextWorkingDay', checked)}
              />
            </div>

            <div className="sm:col-span-2">
              <Toggle
                label="Is full and final settled amount credited"
                checked={form.fullAndFinalCredited}
                onChange={(checked) => set('fullAndFinalCredited', checked)}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="field-label" htmlFor="bank-statement">
                Bank statement first page
              </label>
              <input
                ref={fileInput}
                id="bank-statement"
                type="file"
                accept="application/pdf,.pdf"
                onChange={onFileChange}
                aria-invalid={documentError ? true : undefined}
                className="block w-full cursor-pointer rounded-[8px] border border-[var(--color-line)] bg-white p-2 text-[13px] file:mr-3 file:cursor-pointer file:rounded-[6px] file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-[13px] file:font-semibold file:text-[var(--color-ink)] hover:file:bg-slate-200"
              />
              {documentError || (submitted && errors.document) ? (
                <p className="field-error" role="alert">
                  {documentError ?? errors.document}
                </p>
              ) : (
                <p className="mt-1.5 text-xs text-[var(--color-muted)]">
                  PDF only, first page only.
                  {form.documentName ? ` Selected: ${form.documentName}` : ''}
                  {recordId && ' Leave empty to keep the stored statement page.'}
                </p>
              )}
              {recordId && storedAttachment && (
                <a
                  href={`/api/v1/students/${studentId}/records/${recordId}/attachment`}
                  download={storedAttachment}
                  className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-primary)] hover:underline"
                >
                  Download attached PDF
                  <span className="text-[var(--color-muted)]">({storedAttachment})</span>
                </a>
              )}
            </div>

            <div className="sm:col-span-2">
              <TextField
                label="PDF password"
                type="password"
                value={pdfPassword}
                onChange={(event) => setPdfPassword(event.target.value)}
                hint="Only if the uploaded statement is protected."
              />
            </div>
          </div>
        </section>

        <div className="flex justify-end gap-3 pb-2">
          <Button
            variant="secondary"
            onClick={() => {
              setForm(emptyForm());
              setErrors({});
              setDocumentError(null);
              setFormError(null);
              setSubmitted(false);
              setFile(null);
              setPdfPassword('');
              setStoredExtract(null);
              if (fileInput.current) fileInput.current.value = '';
            }}
          >
            Reset
          </Button>
          <Button onClick={generate} loading={busy || loading}>
            {recordId ? 'Save changes' : 'Generate'}
          </Button>
        </div>
      </div>
    </>
  );
}
