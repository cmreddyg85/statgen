'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { RANGE_PRESETS, presetRange, type RangePreset } from '@/lib/date-range';
import { formatRelative, humanizeAction } from '@/lib/format';
import type { AdminStats } from '@/lib/types';
import { BarList, ChartCard, ColumnChart, Legend, LineChart, SERIES, StatTile, compact } from '@/components/charts';
import { SelectField } from '@/components/Field';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState, LoadingState } from '@/components/States';
import { UserAuditDialog } from '../users/UserAuditDialog';

interface DashboardData {
  range: { from: string; to: string; prevFrom: string; prevTo: string; days: number; bucket: 'day' | 'week' | 'month' };
  current: { students: number; records: number; finalized: number; collected: number; booked: number };
  previous: DashboardData['current'];
  series: { bucket: string; students: number; records: number; collected: number }[];
  byBank: { bank: string; total: number; finalized: number }[];
  snapshot: { activeStudents: number; liveStudents: number; outstanding?: number; paymentsWithDues?: number };
  paymentStatus?: { status: 'paid' | 'partial' | 'unpaid'; count: number; amount: number; received: number }[];
  reportTypes?: { type: string; count: number }[];
  referrers?: { name: string; count: number }[];
  team?: { name: string; students: number; records: number }[];
  topDues?: { id: string; student: string; code: string; amount: number; pending: number }[];
}

const rupees = (value: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
const rupeesShort = (value: number) => (value >= 100000 ? `₹${compact(value)}` : rupees(value));

const BANK_LABEL: Record<string, string> = { SBI: 'SBI', IDBI: 'IDBI', EMAIL: 'Email', STATEMENTS: 'Statements' };

const STATUS = {
  paid: { label: 'Paid', color: 'var(--color-success)', icon: '✓' },
  partial: { label: 'Part paid', color: '#d97706', icon: '◐' },
  unpaid: { label: 'Unpaid', color: 'var(--color-danger)', icon: '!' },
} as const;

/** "2 Oct", "Wk of 29 Sep", "Oct" / "Oct 25" — whatever the bucket is. */
function bucketLabel(iso: string, bucket: DashboardData['range']['bucket'], spansYears: boolean) {
  const date = new Date(`${iso}T00:00:00`);
  if (bucket === 'month') {
    return new Intl.DateTimeFormat('en-IN', spansYears ? { month: 'short', year: '2-digit' } : { month: 'short' }).format(date);
  }
  const day = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(date);
  return bucket === 'week' ? `Wk ${day}` : day;
}

const readableRange = (from: string, to: string) => {
  const f = (iso: string) =>
    new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${iso}T00:00:00`));
  return from === to ? f(from) : `${f(from)} – ${f(to)}`;
};

/**
 * The home dashboard for both roles. Everything follows the range picker;
 * "right now" figures (dues, live students) are snapshots and say so. A
 * user's numbers cover their own students only, and carry no money.
 */
export function Dashboard({ isAdmin, name }: { isAdmin: boolean; name: string }) {
  const [preset, setPreset] = useState<RangePreset>('last30');
  const [custom, setCustom] = useState(() => presetRange('last30'));
  // Overall has no dates of its own: the server starts from the earliest data.
  const range = useMemo(
    () => (preset === 'custom' ? custom : preset === 'overall' ? { from: '', to: '' } : presetRange(preset)),
    [preset, custom],
  );
  const [data, setData] = useState<DashboardData | null>(null);
  const [activity, setActivity] = useState<AdminStats['recentActivity']>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const rangeError = range.from && range.to && range.from > range.to ? 'The end date cannot be before the start date.' : null;

  const load = useCallback(async () => {
    if (preset !== 'overall' && (!range.from || !range.to || range.from > range.to)) return;
    setLoading(true);
    setError(null);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const query = preset === 'overall' ? { overall: 'true', tz } : { ...range, tz };
      setData(await api.get<DashboardData>('/dashboard', { query }));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load the dashboard.');
    } finally {
      setLoading(false);
    }
  }, [range, preset]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isAdmin) return;
    api
      .get<AdminStats>('/users/stats')
      .then((stats) => setActivity(stats.recentActivity))
      .catch(() => setActivity([]));
  }, [isAdmin]);

  const firstName = name.trim().split(/\s+/)[0] ?? name;

  return (
    <>
      <PageHeader
        title={isAdmin ? 'Dashboard' : `Welcome back, ${firstName}`}
        description={data ? readableRange(data.range.from, data.range.to) : 'Your portal at a glance.'}
        actions={
          <div className="flex flex-wrap items-end gap-2">
            {preset === 'custom' && (
              <>
                <input
                  type="date"
                  aria-label="From"
                  className="field-input w-[150px]"
                  value={custom.from}
                  max={custom.to}
                  onChange={(event) => setCustom({ ...custom, from: event.target.value })}
                />
                <span className="pb-2.5 text-[var(--color-muted)]">–</span>
                <input
                  type="date"
                  aria-label="To"
                  className="field-input w-[150px]"
                  value={custom.to}
                  min={custom.from}
                  onChange={(event) => setCustom({ ...custom, to: event.target.value })}
                />
              </>
            )}
            <div className="w-[170px] [&_.field-label]:sr-only">
              <SelectField
                label="Date range"
                value={preset}
                onChange={(value) => {
                  // Custom starts from whatever is on screen now.
                  if (value === 'custom' && preset !== 'custom' && data) setCustom({ from: data.range.from, to: data.range.to });
                  setPreset(value as RangePreset);
                }}
                options={RANGE_PRESETS}
              />
            </div>
          </div>
        }
      />
      {rangeError && <p className="field-error -mt-3 mb-4 text-right">{rangeError}</p>}

      {error ? (
        <div className="card">
          <ErrorState message={error} onRetry={load} />
        </div>
      ) : !data ? (
        <div className="card">
          <LoadingState label="Loading dashboard…" />
        </div>
      ) : (
        <div className={`flex flex-col gap-4 transition-opacity ${loading ? 'opacity-60' : ''}`}>
          <Body data={data} isAdmin={isAdmin} activity={activity} compare={preset !== 'overall'} />
        </div>
      )}
    </>
  );
}

function Body({
  data,
  isAdmin,
  activity,
  compare,
}: {
  data: DashboardData;
  isAdmin: boolean;
  activity: AdminStats['recentActivity'];
  /** Off for Overall: there is no period before all time to compare with. */
  compare: boolean;
}) {
  const [showAllActivity, setShowAllActivity] = useState(false);
  const { current, previous, range, snapshot } = data;
  const spansYears = range.from.slice(0, 4) !== range.to.slice(0, 4);
  const labels = data.series.map((row) => bucketLabel(row.bucket, range.bucket, spansYears));
  const per = range.bucket === 'day' ? 'per day' : range.bucket === 'week' ? 'per week' : 'per month';
  const banks = ['SBI', 'IDBI', 'EMAIL'].map((bank) => data.byBank.find((row) => row.bank === bank) ?? { bank, total: 0, finalized: 0 });

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isAdmin && (
          <StatTile hero label="Collected" value={rupees(current.collected)} current={current.collected} previous={compare ? previous.collected : undefined} hint={`${rupees(current.booked)} booked in new payments`} />
        )}
        <StatTile label="New students" value={current.students.toLocaleString('en-IN')} current={current.students} previous={compare ? previous.students : undefined} />
        <StatTile label="Records generated" value={current.records.toLocaleString('en-IN')} current={current.records} previous={compare ? previous.records : undefined} />
        <StatTile label="Records finalized" value={current.finalized.toLocaleString('en-IN')} current={current.finalized} previous={compare ? previous.finalized : undefined} />
        {!isAdmin && <StatTile label="Live students" value={String(snapshot.liveStudents)} hint={`of ${snapshot.activeStudents} active · right now`} />}
      </div>

      {isAdmin && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Snapshot label="Outstanding dues" value={rupees(snapshot.outstanding ?? 0)} tone="danger" hint={`${snapshot.paymentsWithDues ?? 0} payments pending`} href="/payments" />
          <Snapshot label="Live students" value={String(snapshot.liveStudents)} hint="On the public APIs" href="/live" />
          <Snapshot label="Active students" value={snapshot.activeStudents.toLocaleString('en-IN')} hint="Not archived" href="/students" />
          <Snapshot
            label="Finalize rate"
            value={current.records ? `${Math.round((banks.reduce((s, b) => s + b.finalized, 0) / current.records) * 100)}%` : '—'}
            hint="Of records generated this period"
          />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard
          className="lg:col-span-2"
          title="Activity"
          subtitle={`New students and records generated, ${per}`}
          legend={<Legend items={[{ label: 'New students', color: SERIES[0] }, { label: 'Records generated', color: SERIES[1] }]} />}
          table={{ columns: ['Period', 'Students', 'Records'], rows: data.series.map((row, i) => [labels[i]!, row.students, row.records]) }}
        >
          <LineChart
            labels={labels}
            series={[
              { label: 'New students', color: SERIES[0], values: data.series.map((row) => row.students) },
              { label: 'Records generated', color: SERIES[1], values: data.series.map((row) => row.records) },
            ]}
          />
        </ChartCard>

        <ChartCard
          title="Records by type"
          subtitle="Generated this period"
          legend={<Legend items={[{ label: 'Finalized', color: SERIES[0] }, { label: 'In progress', color: '#9ec5f4' }]} />}
          table={{ columns: ['Type', 'Generated', 'Finalized'], rows: banks.map((row) => [BANK_LABEL[row.bank]!, row.total, row.finalized]) }}
        >
          <BarList
            rows={banks.map((row) => ({
              key: row.bank,
              label: (
                <>
                  {BANK_LABEL[row.bank]}
                  <span className="ml-2 text-xs font-normal text-[var(--color-muted)]">{row.finalized} finalized</span>
                </>
              ),
              value: row.total,
              part: row.finalized,
            }))}
          />
        </ChartCard>
      </div>

      {isAdmin && (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <ChartCard
              className="lg:col-span-2"
              title="Collections"
              subtitle={`Amounts received, ${per}`}
              table={{ columns: ['Period', 'Collected'], rows: data.series.map((row, i) => [labels[i]!, rupees(row.collected)]) }}
            >
              <ColumnChart labels={labels} values={data.series.map((row) => row.collected)} label="Collected" format={rupees} />
            </ChartCard>
            <PaymentStatus rows={data.paymentStatus ?? []} />
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <ChartCard title="Pending dues" subtitle="Largest balances right now" action={<Link href="/payments" className="text-xs font-semibold text-[var(--color-primary)] hover:underline">All payments</Link>}>
              {(data.topDues ?? []).length === 0 ? (
                <p className="py-6 text-center text-[13px] text-[var(--color-muted)]">Nothing pending. 🎉</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {data.topDues!.map((due) => (
                    <li key={due.id} className="flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium">{due.student}</p>
                        <p className="text-xs text-[var(--color-muted)]">
                          <span className="tabular-nums">{due.code}</span> · of {rupees(due.amount)}
                        </p>
                      </div>
                      <span className="shrink-0 text-[13px] font-semibold tabular-nums text-[var(--color-danger)]">{rupees(due.pending)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </ChartCard>

            <ChartCard title="Reports sold" subtitle="Report types on payments connected this period">
              <BarList
                color={SERIES[0]}
                rows={(data.reportTypes ?? []).map((row) => ({ key: row.type, label: BANK_LABEL[row.type] ?? row.type, value: row.count }))}
              />
            </ChartCard>

            <ChartCard title="Top referrers" subtitle="Students referred this period">
              <BarList color={SERIES[0]} rows={(data.referrers ?? []).map((row) => ({ key: row.name, label: row.name, value: row.count }))} empty="No referrals recorded this period." />
            </ChartCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <ChartCard className="lg:col-span-2" title="Team" subtitle="Students added and records generated this period">
              {(data.team ?? []).length === 0 ? (
                <p className="py-6 text-center text-[13px] text-[var(--color-muted)]">No activity this period.</p>
              ) : (
                <TeamTable rows={data.team!} />
              )}
            </ChartCard>

            <ChartCard
              title="Recent activity"
              subtitle="Latest changes across the portal"
              action={
                <button type="button" className="text-xs font-semibold text-[var(--color-primary)] hover:underline" onClick={() => setShowAllActivity(true)}>
                  View all
                </button>
              }
            >
              {activity.length === 0 ? (
                <p className="py-6 text-center text-[13px] text-[var(--color-muted)]">No activity recorded yet.</p>
              ) : (
                <ul className="max-h-[280px] divide-y divide-slate-100 overflow-auto">
                  {activity.map((entry) => (
                    <li key={entry.id} className="flex items-center gap-3 py-2">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-slate-300" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium">{humanizeAction(entry.action)}</p>
                        <p className="truncate text-xs text-[var(--color-muted)]">{entry.userName ?? 'System'}</p>
                      </div>
                      <span className="shrink-0 text-xs text-[var(--color-muted)]">{formatRelative(entry.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </ChartCard>
          </div>
        </>
      )}

      {isAdmin && <UserAuditDialog user={null} all={showAllActivity} onClose={() => setShowAllActivity(false)} />}

      {!isAdmin && (
        <Link href="/students" className="card group flex items-center justify-between px-5 py-4 transition-shadow hover:shadow-md">
          <span>
            <span className="block text-sm font-semibold group-hover:text-[var(--color-primary)]">Go to Students</span>
            <span className="block text-[13px] text-[var(--color-muted)]">Add students and generate their records.</span>
          </span>
          <span aria-hidden="true" className="text-[var(--color-muted)]">→</span>
        </Link>
      )}
    </>
  );
}

/** A "right now" figure: not tied to the range, so it carries no delta. */
function Snapshot({ label, value, hint, href, tone }: { label: string; value: string; hint: string; href?: string; tone?: 'danger' }) {
  const body = (
    <>
      <p className="text-xs font-semibold text-[var(--color-muted)]">{label}</p>
      <p className={`mt-0.5 text-xl font-bold tabular-nums ${tone === 'danger' ? 'text-[var(--color-danger)]' : ''}`}>{value}</p>
      <p className="text-xs text-[var(--color-muted)]">{hint}</p>
    </>
  );
  const className = 'card block border-dashed bg-slate-50/60 px-4 py-3';
  return href ? (
    <Link href={href} className={`${className} transition-colors hover:bg-white`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

/**
 * Payments connected this period. The bar is the money: received against
 * still pending. Below it, each status with its count and how much of its
 * total has come in.
 */
function PaymentStatus({ rows }: { rows: NonNullable<DashboardData['paymentStatus']> }) {
  const order = (['paid', 'partial', 'unpaid'] as const).map((status) => rows.find((row) => row.status === status) ?? { status, count: 0, amount: 0, received: 0 });
  const count = order.reduce((sum, row) => sum + row.count, 0);
  const total = order.reduce((sum, row) => sum + row.amount, 0);
  const received = order.reduce((sum, row) => sum + Math.min(row.received, row.amount), 0);
  const pending = Math.max(total - received, 0);
  return (
    <ChartCard
      title="Payment status"
      subtitle="Payments connected or paid this period · totals to date"
      table={{
        columns: ['Status', 'Payments', 'Total', 'Received', 'Pending'],
        rows: order.map((row) => [
          STATUS[row.status].label,
          row.count,
          rupees(row.amount),
          rupees(row.received),
          rupees(Math.max(row.amount - row.received, 0)),
        ]),
      }}
    >
      {count === 0 ? (
        <p className="py-6 text-center text-[13px] text-[var(--color-muted)]">No payments connected or paid this period.</p>
      ) : (
        <>
          <div className="mb-1.5 flex items-baseline justify-between text-[13px]">
            <span>
              <span className="font-semibold text-[var(--color-success)]">{rupees(received)}</span>
              <span className="text-[var(--color-muted)]"> received</span>
            </span>
            <span>
              <span className="font-semibold text-[var(--color-danger)]">{rupees(pending)}</span>
              <span className="text-[var(--color-muted)]"> pending</span>
            </span>
          </div>
          <div
            className="flex h-3 gap-[2px] overflow-hidden rounded-full bg-slate-100"
            role="img"
            aria-label={`${rupees(received)} received, ${rupees(pending)} pending of ${rupees(total)}`}
          >
            {received > 0 && <span style={{ width: `${(received / total) * 100}%`, backgroundColor: 'var(--color-success)' }} />}
            {pending > 0 && <span style={{ width: `${(pending / total) * 100}%`, backgroundColor: 'var(--color-danger)' }} />}
          </div>
          <p className="mb-4 mt-1.5 text-xs text-[var(--color-muted)]">
            {Math.round((received / Math.max(total, 1)) * 100)}% of {rupees(total)} across {count} payment{count > 1 ? 's' : ''}
          </p>
          <ul className="space-y-2.5">
            {order.map((row) => (
              <li key={row.status} className="flex items-center gap-3 text-[13px]">
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                  style={{ backgroundColor: STATUS[row.status].color }}
                  aria-hidden="true"
                >
                  {STATUS[row.status].icon}
                </span>
                <span className="flex-1">
                  <span className="font-medium">{STATUS[row.status].label}</span>
                  {row.count > 0 && (
                    <span className="block text-xs text-[var(--color-muted)]">
                      {rupeesShort(row.received)} of {rupeesShort(row.amount)} received
                    </span>
                  )}
                </span>
                <span className="text-right font-semibold tabular-nums">
                  {row.count}
                  <span className="ml-1 text-xs font-normal text-[var(--color-muted)]">{row.count === 1 ? 'payment' : 'payments'}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </ChartCard>
  );
}

/** People ranked by students added, with an inline bar for each figure. */
function TeamTable({ rows }: { rows: NonNullable<DashboardData['team']> }) {
  const max = Math.max(1, ...rows.flatMap((row) => [row.students, row.records]));
  const Bar = ({ value, color }: { value: number; color: string }) => (
    <div className="flex items-center justify-end gap-2">
      <span className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-slate-100 sm:block">
        <span className="block h-full rounded-full" style={{ width: `${(value / max) * 100}%`, backgroundColor: color }} />
      </span>
      <span className="w-8 text-right font-semibold tabular-nums">{value}</span>
    </div>
  );
  return (
    <>
      <Legend items={[{ label: 'Students added', color: SERIES[0] }, { label: 'Records generated', color: SERIES[1] }]} />
      <table className="mt-2 w-full text-[13px]">
        <thead>
          <tr className="text-left text-xs text-[var(--color-muted)]">
            <th className="pb-2 font-semibold">Name</th>
            <th className="pb-2 text-right font-semibold">Students</th>
            <th className="pb-2 text-right font-semibold">Records</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.name} className="border-t border-slate-100">
              <td className="py-2">
                <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">{i + 1}</span>
                <span className="font-medium">{row.name}</span>
              </td>
              <td className="py-2">
                <Bar value={row.students} color={SERIES[0]} />
              </td>
              <td className="py-2">
                <Bar value={row.records} color={SERIES[1]} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
