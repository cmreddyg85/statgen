'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Small hand-built SVG charts for the dashboard. Categorical slots come from
 * the validated reference palette, in fixed order (blue, orange, aqua); aqua
 * sits under 3:1 on white, so wherever it is used the value is also printed.
 */
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a'] as const;
const GRID = '#e8edf3';
const AXIS_TEXT = '#64748b';

/** Tracks an element's width so SVG text stays crisp at any size. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** A clean axis maximum and its ticks: 0, 250, 500, 750, 1,000. */
function niceScale(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw)!;
  const ticks = [];
  for (let value = 0; value <= max + step * 0.001 || ticks.length < 2; value += step) {
    ticks.push(Math.round(value * 1e6) / 1e6);
    if (value >= max) break;
  }
  return ticks;
}

export const compact = (value: number) =>
  new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(value);

/** Every nth label, so x-axis text never collides. */
const labelStride = (count: number, width: number) => Math.max(1, Math.ceil(count / Math.max(2, Math.floor(width / 72))));

export interface Series {
  label: string;
  color: string;
  values: number[];
}

interface Hover {
  index: number;
  x: number;
}

function Tooltip({ x, width, title, rows }: { x: number; width: number; title: string; rows: { color: string; label: string; value: string }[] }) {
  const left = Math.min(Math.max(x - 80, 0), Math.max(width - 168, 0));
  return (
    <div
      className="pointer-events-none absolute top-0 z-10 w-[168px] rounded-[8px] border border-[var(--color-line)] bg-white px-3 py-2 text-xs shadow-lg"
      style={{ left }}
    >
      <p className="mb-1 font-semibold text-[var(--color-ink)]">{title}</p>
      {rows.map((row) => (
        <p key={row.label} className="flex items-center gap-2 text-[var(--color-muted)]">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
          <span className="flex-1">{row.label}</span>
          <span className="font-semibold tabular-nums text-[var(--color-ink)]">{row.value}</span>
        </p>
      ))}
    </div>
  );
}

const PAD = { top: 12, right: 12, bottom: 26, left: 44 };

/** Lines over time, one axis, crosshair + tooltip on hover. */
export function LineChart({
  labels,
  series,
  height = 220,
  format = (v: number) => v.toLocaleString('en-IN'),
}: {
  labels: string[];
  series: Series[];
  height?: number;
  format?: (value: number) => string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<Hover | null>(null);
  const ticks = niceScale(Math.max(0, ...series.flatMap((s) => s.values)));
  const top = ticks[ticks.length - 1]!;
  const plotW = Math.max(width - PAD.left - PAD.right, 1);
  const plotH = height - PAD.top - PAD.bottom;
  const n = labels.length;
  const x = (i: number) => PAD.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;
  const stride = labelStride(n, plotW);

  const onMove = (clientX: number, rect: DOMRect) => {
    const px = clientX - rect.left;
    const index = n <= 1 ? 0 : Math.round(((px - PAD.left) / plotW) * (n - 1));
    const clamped = Math.min(Math.max(index, 0), n - 1);
    setHover({ index: clamped, x: x(clamped) });
  };

  return (
    <div ref={ref} className="relative" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={series.map((s) => s.label).join(' and ') + ' over time'}
          onMouseMove={(event) => onMove(event.clientX, event.currentTarget.getBoundingClientRect())}
          onMouseLeave={() => setHover(null)}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} stroke={GRID} strokeWidth={1} />
              <text x={PAD.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" fontSize={11} fill={AXIS_TEXT}>
                {compact(tick)}
              </text>
            </g>
          ))}
          {labels.map((label, i) =>
            i % stride === 0 || i === n - 1 ? (
              <text key={i} x={x(i)} y={height - 6} textAnchor={n > 1 && i === n - 1 ? 'end' : n > 1 && i === 0 ? 'start' : 'middle'} fontSize={11} fill={AXIS_TEXT}>
                {label}
              </text>
            ) : null,
          )}
          {series.map((s) => (
            <g key={s.label}>
              {series.length === 1 && n > 1 && (
                <path
                  d={`M${x(0)},${y(0)} ${s.values.map((v, i) => `L${x(i)},${y(v)}`).join(' ')} L${x(n - 1)},${y(0)} Z`}
                  fill={s.color}
                  opacity={0.1}
                />
              )}
              <path
                d={s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ')}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {n > 0 && <circle cx={x(n - 1)} cy={y(s.values[n - 1]!)} r={4} fill={s.color} stroke="#fff" strokeWidth={2} />}
            </g>
          ))}
          {hover && (
            <g>
              <line x1={hover.x} x2={hover.x} y1={PAD.top} y2={PAD.top + plotH} stroke="#94a3b8" strokeWidth={1} />
              {series.map((s) => (
                <circle key={s.label} cx={hover.x} cy={y(s.values[hover.index]!)} r={4.5} fill={s.color} stroke="#fff" strokeWidth={2} />
              ))}
            </g>
          )}
        </svg>
      )}
      {hover && (
        <Tooltip
          x={hover.x}
          width={width}
          title={labels[hover.index]!}
          rows={series.map((s) => ({ color: s.color, label: s.label, value: format(s.values[hover.index]!) }))}
        />
      )}
    </div>
  );
}

/** One series as columns: ≤24px wide, rounded at the data end, tooltip per column. */
export function ColumnChart({
  labels,
  values,
  label,
  color = SERIES[0],
  height = 220,
  format = (v: number) => v.toLocaleString('en-IN'),
}: {
  labels: string[];
  values: number[];
  label: string;
  color?: string;
  height?: number;
  format?: (value: number) => string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const ticks = niceScale(Math.max(0, ...values));
  const top = ticks[ticks.length - 1]!;
  const plotW = Math.max(width - PAD.left - PAD.right, 1);
  const plotH = height - PAD.top - PAD.bottom;
  const n = Math.max(labels.length, 1);
  const band = plotW / n;
  const barW = Math.max(Math.min(24, band - 2), 2);
  const cx = (i: number) => PAD.left + band * i + band / 2;
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;
  const stride = labelStride(labels.length, plotW);

  /** A column with a 4px rounded top and a square foot on the baseline. */
  const column = (i: number, v: number) => {
    const x0 = cx(i) - barW / 2;
    const h = Math.max(PAD.top + plotH - y(v), 0);
    if (h === 0) return '';
    const r = Math.min(4, barW / 2, h);
    const base = PAD.top + plotH;
    return `M${x0},${base} V${base - h + r} Q${x0},${base - h} ${x0 + r},${base - h} H${x0 + barW - r} Q${x0 + barW},${base - h} ${x0 + barW},${base - h + r} V${base} Z`;
  };

  return (
    <div ref={ref} className="relative" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={label} onMouseLeave={() => setHover(null)}>
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} stroke={GRID} strokeWidth={1} />
              <text x={PAD.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" fontSize={11} fill={AXIS_TEXT}>
                {compact(tick)}
              </text>
            </g>
          ))}
          {values.map((v, i) => (
            <g key={i} onMouseEnter={() => setHover(i)}>
              {/* The hit target is the whole band, not just the column. */}
              <rect x={cx(i) - band / 2} y={PAD.top} width={band} height={plotH} fill={hover === i ? '#f1f5f9' : 'transparent'} />
              <path d={column(i, v)} fill={color} />
            </g>
          ))}
          {labels.map((text, i) =>
            i % stride === 0 ? (
              <text key={i} x={cx(i)} y={height - 6} textAnchor="middle" fontSize={11} fill={AXIS_TEXT}>
                {text}
              </text>
            ) : null,
          )}
        </svg>
      )}
      {hover !== null && (
        <Tooltip x={cx(hover)} width={width} title={labels[hover]!} rows={[{ color, label, value: format(values[hover]!) }]} />
      )}
    </div>
  );
}

/** Ranked horizontal bars in HTML, value printed at the end of each. */
export function BarList({
  rows,
  color = SERIES[0],
  format = (v: number) => v.toLocaleString('en-IN'),
  empty = 'Nothing in this period.',
}: {
  rows: { label: ReactNode; value: number; part?: number; key: string }[];
  color?: string;
  format?: (value: number) => string;
  empty?: string;
}) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  if (rows.length === 0) return <p className="py-6 text-center text-[13px] text-[var(--color-muted)]">{empty}</p>;
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.key} title={`${row.value}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate font-medium">{row.label}</span>
            <span className="shrink-0 tabular-nums font-semibold">{format(row.value)}</span>
          </div>
          <div className="flex h-2 gap-[2px] overflow-hidden rounded-full bg-slate-100" style={{ width: '100%' }}>
            {row.part !== undefined ? (
              <>
                <span className="h-full rounded-l-full" style={{ width: `${(row.part / max) * 100}%`, backgroundColor: color }} />
                <span className="h-full rounded-r-full" style={{ width: `${((row.value - row.part) / max) * 100}%`, backgroundColor: '#9ec5f4' }} />
              </>
            ) : (
              <span className="h-full rounded-full" style={{ width: `${(row.value / max) * 100}%`, backgroundColor: color }} />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** A legend: swatch beside ink-colored text, never colored text. */
export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-muted)]">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: item.color }} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/** A card for one chart, with an optional table view of the same numbers. */
export function ChartCard({
  title,
  subtitle,
  legend,
  action,
  table,
  className = '',
  children,
}: {
  title: string;
  subtitle?: string;
  legend?: ReactNode;
  action?: ReactNode;
  table?: { columns: string[]; rows: (string | number)[][] };
  className?: string;
  children: ReactNode;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className={`card flex flex-col px-5 py-4 ${className}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          {subtitle && <p className="text-xs text-[var(--color-muted)]">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {action}
          {table && (
            <button
              type="button"
              className="rounded-[6px] px-2 py-1 text-xs font-semibold text-[var(--color-muted)] hover:bg-slate-100 hover:text-[var(--color-ink)]"
              onClick={() => setAsTable((value) => !value)}
            >
              {asTable ? 'Chart' : 'Table'}
            </button>
          )}
        </div>
      </div>
      {legend && !asTable && <div className="mb-2">{legend}</div>}
      <div className="flex-1">
        {asTable && table ? (
          <div className="max-h-[260px] overflow-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-xs text-[var(--color-muted)]">
                  {table.columns.map((column, i) => (
                    <th key={column} className={`pb-2 font-semibold ${i ? 'text-right' : ''}`}>
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, r) => (
                  <tr key={r} className="border-t border-slate-100">
                    {row.map((cell, i) => (
                      <td key={i} className={`py-1.5 ${i ? 'text-right tabular-nums' : ''}`}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

/**
 * A figure with its change against the previous period. `upIsGood` sets the
 * color of the delta; the arrow and sign carry direction without color.
 */
export function StatTile({
  label,
  value,
  current,
  previous,
  hint,
  hero = false,
  tone,
  upIsGood = true,
}: {
  label: string;
  value: string;
  current?: number;
  previous?: number;
  hint?: string;
  hero?: boolean;
  tone?: 'danger';
  upIsGood?: boolean;
}) {
  let delta: ReactNode = null;
  if (current !== undefined && previous !== undefined) {
    if (previous === 0) {
      delta = current > 0 ? <span className="text-[var(--color-muted)]">New this period</span> : <span className="text-[var(--color-muted)]">No change</span>;
    } else {
      const change = ((current - previous) / previous) * 100;
      const good = change === 0 ? null : change > 0 === upIsGood;
      delta = (
        <span className={good === null ? 'text-[var(--color-muted)]' : good ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}>
          {change > 0 ? '▲' : change < 0 ? '▼' : '•'} {change > 0 ? '+' : ''}
          {Math.round(change)}%
          <span className="text-[var(--color-muted)]"> vs previous</span>
        </span>
      );
    }
  }
  return (
    <div className={`card px-5 py-4 ${hero ? 'bg-gradient-to-br from-blue-50 to-white ring-1 ring-blue-100' : ''}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">{label}</p>
      <p
        className={`mt-1.5 font-bold tracking-tight ${hero ? 'text-4xl' : 'text-[28px]'} ${tone === 'danger' ? 'text-[var(--color-danger)]' : 'text-[var(--color-ink)]'}`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs font-medium">{delta ?? <span className="text-[var(--color-muted)]">{hint}</span>}</p>
      {delta && hint && <p className="text-xs text-[var(--color-muted)]">{hint}</p>}
    </div>
  );
}
