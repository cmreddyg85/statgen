'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { formatDateTime, formatMobile } from '@/lib/format';
import type { Paginated, Student, StudentModuleRecord } from '@/lib/types';
import { Badge, StatusDot } from '@/components/Badge';
import { LinkButton } from '@/components/Button';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState, LoadingState } from '@/components/States';

/**
 * A single student: their details, and the records generated for them.
 * Reached by clicking a name in the Students table. The API enforces
 * ownership, so a user opening someone else's record gets a not-found.
 */
export function StudentDetail({ studentId }: { studentId: string }) {
  const [student, setStudent] = useState<Student | null>(null);
  const [records, setRecords] = useState<Paginated<StudentModuleRecord> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [studentResult, recordResult] = await Promise.all([
        api.get<{ student: Student }>(`/students/${studentId}`),
        api.get<Paginated<StudentModuleRecord>>(`/students/${studentId}/records`, {
          query: { page: 1, pageSize: 5 },
        }),
      ]);
      setStudent(studentResult.student);
      setRecords(recordResult);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Could not load this student.',
      );
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !student) {
    return (
      <div className="card">
        <LoadingState label="Loading student…" />
      </div>
    );
  }

  if (error || !student) {
    return (
      <div className="card">
        <ErrorState
          title="Student unavailable"
          message={error ?? 'This student could not be found.'}
          onRetry={load}
        />
      </div>
    );
  }

  return (
    <>
      <Link
        href="/students"
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
        Back to Students
      </Link>

      <PageHeader
        title={student.name}
        description={`Added ${formatDateTime(student.createdAt)} by ${
          student.createdByName ?? 'unknown'
        }.`}
        actions={
          <LinkButton href={`/students/${student.id}/generate`}>Generate</LinkButton>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <h2 className="border-b border-[var(--color-line)] px-5 py-3.5 text-[15px] font-semibold">
            Student details
          </h2>
          <dl className="grid gap-x-6 gap-y-4 px-5 py-4 sm:grid-cols-2">
            <Detail label="Mobile number" value={formatMobile(student.mobileNumber)} />
            <Detail label="Offer company" value={student.offerCompany ?? '—'} />
            <Detail
              label="Company verification"
              value={
                student.companyVerified ? (
                  <Badge tone="success">
                    <StatusDot tone="success" />
                    Verified
                  </Badge>
                ) : (
                  <Badge tone="neutral">
                    <StatusDot tone="neutral" />
                    Unverified
                  </Badge>
                )
              }
            />
            <Detail
              label="Verified by"
              value={
                student.companyVerified
                  ? `${student.verifiedByName ?? 'Unknown'} · ${formatDateTime(
                      student.verifiedAt,
                    )}`
                  : '—'
              }
            />
            <Detail label="Created by" value={student.createdByName ?? '—'} />
            <Detail label="Last updated" value={formatDateTime(student.updatedAt)} />
          </dl>
        </section>

        <section className="card">
          <div className="flex items-center justify-between border-b border-[var(--color-line)] px-5 py-3.5">
            <h2 className="text-[15px] font-semibold">Generated records</h2>
            {records && records.total > 0 && (
              <Badge tone="info">{records.total}</Badge>
            )}
          </div>

          {records && records.items.length > 0 ? (
            <>
              <ul className="divide-y divide-[#e2e8f0]">
                {records.items.map((record) => (
                  <li key={record.id} className="px-5 py-3">
                    <p className="font-mono text-[13px] font-medium">{record.reference}</p>
                    <p className="text-xs text-[var(--color-muted)]">
                      {record.module.toUpperCase()} · {formatDateTime(record.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
              <div className="border-t border-[var(--color-line)] px-5 py-3">
                <Link
                  href={`/students/${student.id}/generate`}
                  className="text-[13px] font-semibold text-[var(--color-primary)] hover:underline"
                >
                  View all and generate more
                </Link>
              </div>
            </>
          ) : (
            <div className="px-5 py-8 text-center">
              <p className="text-[13px] text-[var(--color-muted)]">
                No records generated for this student yet.
              </p>
              <div className="mt-3">
                <LinkButton
                  href={`/students/${student.id}/generate`}
                  variant="secondary"
                  size="sm"
                >
                  Generate records
                </LinkButton>
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
        {label}
      </dt>
      <dd className="mt-1 text-sm">{value}</dd>
    </div>
  );
}
