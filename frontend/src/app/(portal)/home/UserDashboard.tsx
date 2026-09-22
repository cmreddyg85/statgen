'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { StudentStats } from '@/lib/types';
import { NavIcon } from '@/components/Icon';
import { PageHeader } from '@/components/PageHeader';

/**
 * User landing page: a welcome, a summary of the records they own, and the
 * way into Students. No administrative statistics or controls.
 */
export function UserDashboard({ name }: { name: string }) {
  const [stats, setStats] = useState<StudentStats | null>(null);
  const firstName = name.trim().split(/\s+/)[0] ?? name;

  useEffect(() => {
    api
      .get<StudentStats>('/students/stats')
      .then(setStats)
      .catch(() => setStats(null));
  }, []);

  return (
    <>
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description="Your student records at a glance."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Your students" value={stats?.total} />
        <StatCard label="Verified" value={stats?.verified} tone="success" />
        <StatCard label="Unverified" value={stats?.unverified} tone="muted" />
      </div>

      <Link
        href="/students"
        className="card group mt-4 flex items-start gap-3 px-5 py-4 transition-shadow hover:shadow-md"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-blue-50 text-[var(--color-primary)]">
          <NavIcon name="students" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold group-hover:text-[var(--color-primary)]">
            Students
          </span>
          <span className="mt-0.5 block text-[13px] text-[var(--color-muted)]">
            Add students, verify offer companies and generate module records.
          </span>
        </span>
      </Link>
    </>
  );
}

function StatCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number | undefined;
  tone?: 'default' | 'success' | 'muted';
}) {
  const color =
    tone === 'success'
      ? 'text-[var(--color-success)]'
      : tone === 'muted'
        ? 'text-[var(--color-muted)]'
        : 'text-[var(--color-ink)]';

  return (
    <div className="card px-5 py-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
        {label}
      </p>
      <p className={`mt-1.5 text-3xl font-bold tabular-nums ${color}`}>
        {value ?? '—'}
      </p>
    </div>
  );
}
