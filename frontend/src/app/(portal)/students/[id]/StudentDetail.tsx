'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { formatDateTime, formatMobile } from '@/lib/format';
import type { Student } from '@/lib/types';
import { Badge, StatusDot } from '@/components/Badge';
import { LinkButton } from '@/components/Button';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState, LoadingState } from '@/components/States';
import { RecordsTable } from './RecordsTable';

/**
 * A single student: their details, and the records generated for them.
 * Reached by clicking a name in the Students table. The API enforces
 * ownership, so a user opening someone else's record gets a not-found.
 */
export function StudentDetail({ studentId }: { studentId: string }) {
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { student: found } = await api.get<{ student: Student }>(`/students/${studentId}`);
      setStudent(found);
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
          <LinkButton href={`/students/${student.id}/generate`}>Generate record</LinkButton>
        }
      />

      <div className="grid gap-4">
        <section className="card">
          <h2 className="border-b border-[var(--color-line)] px-5 py-3.5 text-[15px] font-semibold">
            Student details
          </h2>
          <dl className="grid gap-x-6 gap-y-4 px-5 py-4 sm:grid-cols-2">
            <Detail label="Mobile number" value={formatMobile(student.mobileNumber)} />
            <Detail label="Offer company" value={student.offerCompany ?? '—'} />
            <Detail
              label="Status"
              value={
                student.archivedAt ? (
                  <Badge tone="neutral">
                    <StatusDot tone="neutral" />
                    Archived {formatDateTime(student.archivedAt)}
                  </Badge>
                ) : (
                  <Badge tone="success">
                    <StatusDot tone="success" />
                    Active
                  </Badge>
                )
              }
            />
            <Detail label="Created by" value={student.createdByName ?? '—'} />
            <Detail label="Last updated" value={formatDateTime(student.updatedAt)} />
          </dl>
        </section>

        <RecordsTable studentId={student.id} />
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
