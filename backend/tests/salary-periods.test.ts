import { describe, expect, it } from 'vitest';
import { buildSalaryPeriods, parseDetails } from '../src/sbi/salary-periods.js';

const company = (overrides = {}) => ({
  name: 'Acme',
  joiningDate: '2021-03-08',
  relievingDate: '2022-06-30',
  salary: 60000,
  bank: 'SBIN',
  ifsc: 'SBIN0001234',
  salaryCreditText: '{{ShortMonth}}{{ShortYear}} SALARY ACME',
  hikes: [],
  ...overrides,
});

const form = (overrides = {}) =>
  parseDetails({ salaryDay: 5, nextWorkingDay: false, companies: [company()], ...overrides });

/** Periods must run strictly forward — generate.js does not re-sort them. */
const isOrdered = (periods: { from: string; to: string }[]) =>
  periods.every(
    (period, index) =>
      period.from <= period.to && (index === 0 || periods[index - 1]!.to < period.from),
  );

/** Local yyyy-mm-dd — toISOString() shifts a local midnight into the day before. */
const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;

/** The last period that actually credits a salary. */
const lastPaid = (periods: { to: string; amount: string }[]) =>
  [...periods].reverse().find((period) => period.amount !== '');

describe('buildSalaryPeriods', () => {
  it('pays the month after joining, prorated, and runs to the settlement', () => {
    const periods = buildSalaryPeriods(form());

    expect(isOrdered(periods)).toBe(true);
    // Idle until the first pay day, then a prorated credit for April.
    expect(periods[0]).toMatchObject({ text: '', amount: '' });
    expect(periods[1]).toMatchObject({ from: '2021-04-01', to: '2021-04-30' });
    expect(periods[1]?.amount).toBe(((60000 / 31) * 24).toFixed(2));
    expect(periods[1]?.text).toBe(
      'DEP TFR NEFT-SBIN0001234*SBIN-{{TraNum}}-{{ShortMonth}}{{ShortYear}} SALARY ACME',
    );
    // Full and final lands the month after relieving.
    expect(periods.filter((period) => period.from === '2022-07-01')).toHaveLength(1);
  });

  it('adds a full extra month when joining after the 15th', () => {
    const periods = buildSalaryPeriods(
      form({ companies: [company({ joiningDate: '2021-03-18' })] }),
    );

    expect(periods[1]).toMatchObject({ from: '2021-05-01' });
    expect(periods[1]?.amount).toBe(((60000 / 31) * 14 + 60000).toFixed(2));
  });

  it('switches amount the month a hike lands', () => {
    const periods = buildSalaryPeriods(
      form({
        companies: [company({ hikes: [{ date: '2021-10-01', salary: 75000 }] })],
      }),
    );

    expect(isOrdered(periods)).toBe(true);
    expect(periods).toContainEqual(expect.objectContaining({ to: '2021-10-31', amount: '60000.00' }));
    expect(periods).toContainEqual(
      expect.objectContaining({ from: '2021-11-01', amount: '75000.00' }),
    );
  });

  it('drops the settlement when full and final was not credited', () => {
    const paid = buildSalaryPeriods(form());
    const unpaid = buildSalaryPeriods(form({ fullAndFinalCredited: false }));

    const settlement = (periods: { from: string; amount: string }[]) =>
      periods.find((period) => period.from === '2022-07-01' && period.amount !== '');

    expect(settlement(paid)?.amount).toBe('60000.00');
    expect(settlement(unpaid)).toBeUndefined();
    // Relieved on the 30th, so the relieving month itself is still paid.
    expect(lastPaid(unpaid)?.to).toBe('2022-06-30');
    expect(isOrdered(unpaid)).toBe(true);
  });

  it('also withholds the relieving month when the last day worked is the 10th or earlier', () => {
    const early = buildSalaryPeriods(
      form({
        fullAndFinalCredited: false,
        companies: [company({ relievingDate: '2022-06-09' })],
      }),
    );
    const late = buildSalaryPeriods(
      form({
        fullAndFinalCredited: false,
        companies: [company({ relievingDate: '2022-06-11' })],
      }),
    );

    // Left on the 9th: the settlement would have been May's salary plus the
    // days worked, so neither lands.
    expect(lastPaid(early)?.to).toBe('2022-05-31');
    // Left on the 11th: only the part-month settlement is withheld.
    expect(lastPaid(late)?.to).toBe('2022-06-30');
  });

  it('leaves an earlier company untouched when full and final is off', () => {
    const periods = buildSalaryPeriods(
      form({
        fullAndFinalCredited: false,
        companies: [
          company({ relievingDate: '2022-06-05' }),
          company({
            name: 'Globex',
            joiningDate: '2022-08-01',
            relievingDate: '2023-09-05',
            salary: 90000,
            ifsc: 'HDFC0000123',
          }),
        ],
      }),
    );

    // Acme was settled: the month after it ended still carries a credit.
    expect(periods).toContainEqual(
      expect.objectContaining({ from: '2022-07-01', amount: '10000.00' }),
    );
    // Globex, the current job, stops before its relieving month.
    expect(lastPaid(periods)?.to).toBe('2023-08-31');
  });

  it('keeps several companies in order without overlapping', () => {
    const periods = buildSalaryPeriods(
      form({
        companies: [
          company(),
          company({
            name: 'Globex',
            joiningDate: '2022-08-01',
            relievingDate: '2023-09-30',
            salary: 90000,
            bank: 'HDFC',
            ifsc: 'HDFC0000123',
          }),
        ],
      }),
    );

    expect(isOrdered(periods)).toBe(true);
    expect(periods.some((period) => period.text.includes('HDFC0000123*HDFC'))).toBe(true);
  });

  it('stops at today: no future months, no settlement that has not happened', () => {
    // Relieved 5 days ago, so the settlement month is still in the future.
    const relieving = new Date();
    relieving.setDate(relieving.getDate() - 5);
    const todayIso = iso(new Date());

    const periods = buildSalaryPeriods(
      form({
        companies: [
          company({ joiningDate: '2022-01-10', relievingDate: iso(relieving) }),
        ],
      }),
    );

    expect(isOrdered(periods)).toBe(true);
    expect(periods.every((period) => period.to <= todayIso)).toBe(true);
    // The last period runs to today and carries the closing balance.
    expect(periods.at(-1)?.to).toBe(todayIso);
    // Nothing is credited for a settlement month that has not arrived.
    expect(periods.filter((period) => period.from > todayIso)).toHaveLength(0);
  });

  it('leaves out this month when the current job ended this month', () => {
    // Relieved earlier this month: the settlement lands next month, and the
    // relieving month's own credit goes with it.
    const relieving = new Date();
    relieving.setDate(3);
    const previousMonthEnd = new Date(relieving.getFullYear(), relieving.getMonth(), 0);

    for (const fullAndFinalCredited of [true, false]) {
      const periods = buildSalaryPeriods(
        form({
          fullAndFinalCredited,
          companies: [company({ joiningDate: '2022-01-10', relievingDate: iso(relieving) })],
        }),
      );

      expect(lastPaid(periods)?.to).toBe(iso(previousMonthEnd));
      // The statement still runs to today, with no salary in between.
      expect(periods.at(-1)?.to).toBe(iso(new Date()));
      expect(periods.at(-1)?.amount).toBe('');
      expect(isOrdered(periods)).toBe(true);
    }
  });

  it('rejects payloads the form should never send', () => {
    expect(() => parseDetails('{"companies":[]}')).toThrow(/at least one company/);
    expect(() => parseDetails({ companies: [company()], salaryDay: 45 })).toThrow(/1 and 31/);
    expect(() =>
      buildSalaryPeriods(form({ companies: [company({ relievingDate: '2020-01-01' })] })),
    ).toThrow(/relievingDate must be after joiningDate/);
    expect(() =>
      buildSalaryPeriods(
        form({ companies: [company({ hikes: [{ date: '2024-01-01', salary: 70000 }] })] }),
      ),
    ).toThrow(/between the joining and relieving dates/);
  });
});
