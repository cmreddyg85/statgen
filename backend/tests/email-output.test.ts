import { describe, expect, it } from 'vitest';
import { buildEmailOutput } from '../src/email/output.js';

describe('buildEmailOutput', () => {
  const now = new Date(2026, 9, 2);

  it('formats this year and older mails the way the mail client does', () => {
    const [current, old] = buildEmailOutput(
      [
        { subject: 'testing one', date: '2026-07-06', hour: 5, minute: 11, meridiem: 'PM', replacements: [{ find: 'a', replace: 'b' }] },
        { subject: 'testing mail 2', date: '2022-04-08', hour: 10, minute: 54, meridiem: 'AM', replacements: [] },
      ],
      now,
    );
    expect(current).toEqual({
      subject: 'testing one',
      rowDate: 'Jul 6',
      headerDateTime: 'Mon, Jul 6, 5:11 PM',
      date: 'Jul 6, 2026, 5:11 PM',
      textReplacements: [{ find: 'a', replace: 'b' }],
    });
    expect(old).toMatchObject({
      rowDate: '8/4/22',
      headerDateTime: 'Fri, 8 Apr 2022, 10:54 AM',
      date: 'Apr 8, 2022, 10:54 AM',
    });
  });

  it('adds the sender fields for "all details" only', () => {
    const base = { subject: 's', date: '2026-01-05', hour: 9, minute: 3, meridiem: 'AM' as const, replacements: [] };
    const sender = { senderName: 'HR', senderEmail: 'hr@x.com', mailedBy: 'x.com', signedBy: 'x.com', logo: 'https://x.com/logo.png' };
    const [all, dateOnly] = buildEmailOutput([{ ...base, ...sender, mode: 'all' }, { ...base, ...sender, mode: 'date' }], now);
    expect(all).toMatchObject(sender);
    expect(dateOnly).not.toHaveProperty('senderName');
  });

  it('pads minutes', () => {
    const [mail] = buildEmailOutput([{ subject: 's', date: '2026-01-05', hour: 9, minute: 3, meridiem: 'AM', replacements: [] }], now);
    expect(mail!.date).toBe('Jan 5, 2026, 9:03 AM');
  });
});
