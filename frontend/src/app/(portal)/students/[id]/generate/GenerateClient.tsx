'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import type {
  ModuleOption,
  Paginated,
  Student,
  StudentModuleRecord,
} from '@/lib/types';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { DateCell } from '@/components/DateCell';
import { SelectField, TextField } from '@/components/Field';
import { PageHeader } from '@/components/PageHeader';
import { Pagination } from '@/components/Pagination';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { useToast } from '@/components/Toast';

/**
 * Generate module records for one student.
 *
 * The dropdown picks which business module (SBI, IDBI, HDFC, PF, Gmail) the
 * batch belongs to; Generate creates that many records and they appear in the
 * table below, newest first.
 */
export function GenerateClient({ studentId }: { studentId: string }) {
  const toast = useToast();

  const [student, setStudent] = useState<Student | null>(null);
  const [modules, setModules] = useState<ModuleOption[]>([]);
  const [selectedModule, setSelectedModule] = useState('');
  const [count, setCount] = useState('5');

  const [records, setRecords] = useState<Paginated<StudentModuleRecord> | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Student and module list are fetched once; the record table reloads on its own.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.get<{ student: Student }>(`/students/${studentId}`),
      api.get<{ modules: ModuleOption[] }>('/modules'),
    ])
      .then(([studentResult, moduleResult]) => {
        if (cancelled) return;
        setStudent(studentResult.student);
        setModules(moduleResult.modules);
        setSelectedModule((current) => current || (moduleResult.modules[0]?.key ?? ''));
      })
      .catch((caught) => {
        if (cancelled) return;
        setError(
          caught instanceof ApiError ? caught.message : 'Could not load this student.',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      setRecords(
        await api.get<Paginated<StudentModuleRecord>>(`/students/${studentId}/records`, {
          query: { page, pageSize: 20 },
        }),
      );
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Could not load generated records.',
      );
    } finally {
      setLoading(false);
    }
  }, [studentId, page]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const generate = async () => {
    if (generating || !selectedModule) return;
    setFieldErrors({});
    setGenerating(true);
    try {
      const result = await api.post<{ count: number }>(
        `/students/${studentId}/records/generate`,
        { module: selectedModule, count: Number(count) },
      );
      const label =
        modules.find((module) => module.key === selectedModule)?.label ?? selectedModule;
      toast.success(
        `Generated ${result.count} ${label} record${result.count === 1 ? '' : 's'}.`,
      );
      setPage(1);
      await loadRecords();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setFieldErrors(caught.fields ?? {});
        if (!caught.fields) toast.error(caught.message);
      } else {
        toast.error('Could not generate records.');
      }
    } finally {
      setGenerating(false);
    }
  };

  if (error && !student) {
    return (
      <div className="card">
        <ErrorState message={error} />
      </div>
    );
  }

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
        title="Generate records"
        description={
          student
            ? `Create module records for ${student.name}.`
            : 'Create module records for this student.'
        }
      />

      {/* The generate bar: module, how many, and the action. */}
      <div className="card mb-4 flex flex-wrap items-end gap-3 px-4 py-4">
        <SelectField
          label="Module"
          className="w-[220px]"
          value={selectedModule}
          onChange={setSelectedModule}
          options={modules.map((module) => ({
            value: module.key,
            label: `${module.label} — ${module.description}`,
          }))}
        />
        <div className="w-[130px]">
          <TextField
            label="Records"
            type="number"
            min={1}
            max={50}
            value={count}
            onChange={(event) => setCount(event.target.value)}
            error={fieldErrors.count}
          />
        </div>
        <Button onClick={generate} loading={generating} disabled={!selectedModule}>
          {generating ? 'Generating…' : 'Generate'}
        </Button>
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--color-line)] px-5 py-3.5">
          <h2 className="text-[15px] font-semibold">Generated records</h2>
          {records && records.total > 0 && <Badge tone="info">{records.total} total</Badge>}
        </div>

        {loading && !records ? (
          <LoadingState label="Loading records…" />
        ) : records && records.items.length === 0 ? (
          <EmptyState
            title="No records yet"
            message="Choose a module above and select Generate to create the first batch."
          />
        ) : records ? (
          <>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Reference</th>
                    <th scope="col">Module</th>
                    <th scope="col">Status</th>
                    <th scope="col">Generated by</th>
                    <th scope="col">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {records.items.map((record) => (
                    <tr key={record.id}>
                      <td className="font-mono font-medium">{record.reference}</td>
                      <td>
                        <Badge tone="info">{record.module.toUpperCase()}</Badge>
                      </td>
                      <td>
                        <Badge tone="neutral">{record.status}</Badge>
                      </td>
                      <td className="text-[var(--color-muted)]">
                        {record.generatedByName ?? '—'}
                      </td>
                      <td>
                        <DateCell value={record.createdAt} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              page={records.page}
              pageSize={records.pageSize}
              total={records.total}
              totalPages={records.totalPages}
              onPageChange={setPage}
            />
          </>
        ) : null}
      </div>
    </>
  );
}
