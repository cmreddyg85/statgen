'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ApiError, api } from '@/lib/api';
import { formatRelative, humanizeAction } from '@/lib/format';
import type { AdminStats } from '@/lib/types';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState, LoadingState } from '@/components/States';
import { Badge } from '@/components/Badge';

/**
 * Admin overview (PRD 7.2): user count as the primary KPI, active/inactive as
 * secondary, plus recent audit activity. Deliberately uncluttered — the job is
 * orientation, not analytics.
 */
export function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStats(await api.get<AdminStats>('/users/stats'));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load dashboard data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <PageHeader
        title="Admin overview"
        description="Account health and recent activity across the portal."
      />

      {loading && !stats ? (
        <div className="card">
          <LoadingState />
        </div>
      ) : error ? (
        <div className="card">
          <ErrorState message={error} onRetry={load} />
        </div>
      ) : stats ? (
        <div className="flex flex-col gap-6">
          <section>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                label="Total users"
                value={stats.users.total}
                emphasis
                href="/users"
                hint="All portal accounts"
              />
              <KpiCard
                label="Active users"
                value={stats.users.active}
                tone="success"
                href="/users?status=active"
                hint="Can sign in today"
              />
              <KpiCard
                label="Inactive users"
                value={stats.users.inactive}
                tone="muted"
                href="/users?status=inactive"
                hint="Sign-in blocked"
              />
              <KpiCard
                label="Students"
                value={stats.students.total}
                href="/students"
                hint={`${stats.students.verified} verified · ${stats.students.unverified} unverified`}
              />
            </div>
          </section>

          <section className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--color-line)] px-5 py-3.5">
              <h2 className="text-[15px] font-semibold">Recent activity</h2>
              <Badge tone="info">Audit log</Badge>
            </div>

            {stats.recentActivity.length === 0 ? (
              <p className="px-5 py-8 text-center text-[13px] text-[var(--color-muted)]">
                No activity recorded yet.
              </p>
            ) : (
              <ul className="divide-y divide-[#e2e8f0]">
                {stats.recentActivity.map((entry) => (
                  <li key={entry.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">
                        {humanizeAction(entry.action)}
                      </p>
                      <p className="truncate text-xs text-[var(--color-muted)]">
                        {entry.userName ?? 'System'}
                        {entry.entityType ? ` · ${entry.entityType}` : ''}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-[var(--color-muted)]">
                      {formatRelative(entry.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}

function KpiCard({
  label,
  value,
  hint,
  href,
  emphasis = false,
  tone = 'default',
}: {
  label: string;
  value: number;
  hint?: string;
  href: string;
  emphasis?: boolean;
  tone?: 'default' | 'success' | 'muted';
}) {
  const valueColor =
    tone === 'success'
      ? 'text-[var(--color-success)]'
      : tone === 'muted'
        ? 'text-[var(--color-muted)]'
        : 'text-[var(--color-ink)]';

  return (
    <Link
      href={href}
      className={`card block px-5 py-4 transition-shadow hover:shadow-md ${
        emphasis ? 'ring-1 ring-[var(--color-primary)]/20' : ''
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
        {label}
      </p>
      <p className={`mt-1.5 text-3xl font-bold tabular-nums ${valueColor}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-[var(--color-muted)]">{hint}</p>}
    </Link>
  );
}
