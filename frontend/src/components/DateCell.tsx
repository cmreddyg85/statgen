import { formatDate } from '@/lib/format';

/**
 * Timestamps in tables: date on one line, time beneath it. Two short lines
 * take far less width than one long one, which keeps wide admin tables from
 * needing horizontal scroll.
 */
export function DateCell({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-[var(--color-muted)]">—</span>;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return <span className="text-[var(--color-muted)]">—</span>;
  }

  const time = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(date);

  return (
    <div className="whitespace-nowrap text-[var(--color-muted)]">
      <div>{formatDate(value)}</div>
      <div className="text-[11px]">{time}</div>
    </div>
  );
}
