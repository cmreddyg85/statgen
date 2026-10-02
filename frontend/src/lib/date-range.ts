export type RangePreset = 'today' | 'last7' | 'last30' | 'quarter' | 'overall' | 'custom';

export const RANGE_PRESETS: { value: RangePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'last7', label: 'Last 7 days' },
  { value: 'last30', label: 'Last 30 days' },
  { value: 'quarter', label: 'Last 3 months' },
  { value: 'overall', label: 'Overall' },
  { value: 'custom', label: 'Custom range' },
];

/** YYYY-MM-DD for a local date. */
export const isoDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/**
 * The inclusive local-date range for a preset, ending today: "last 7 days" is
 * today and the six before it; "last 3 months" is the three months up to and
 * including today.
 */
export function presetRange(preset: Exclude<RangePreset, 'custom' | 'overall'>, now = new Date()): { from: string; to: string } {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const from = new Date(today);
  if (preset === 'last7') from.setDate(today.getDate() - 6);
  if (preset === 'last30') from.setDate(today.getDate() - 29);
  if (preset === 'quarter') {
    from.setMonth(today.getMonth() - 3);
    // 31 May minus three months is 31 Feb; settle on the month's last day.
    if (from.getDate() !== today.getDate()) from.setDate(0);
    from.setDate(from.getDate() + 1);
  }
  return { from: isoDay(from), to: isoDay(today) };
}
