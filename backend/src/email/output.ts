const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface EmailInput {
  subject: string;
  /** YYYY-MM-DD, wall-clock: no time zone is applied. */
  date: string;
  hour: number;
  minute: number;
  meridiem: 'AM' | 'PM';
  /** 'all' adds the sender fields to the output; 'date' (the default) leaves them out. */
  mode?: 'date' | 'all';
  senderName?: string;
  senderEmail?: string;
  mailedBy?: string;
  signedBy?: string;
  logo?: string;
  fileId?: string | null;
  attachmentName?: string | null;
  replacements: { find: string; replace: string }[];
}

/**
 * The three date strings a mail client shows: this year's mails read
 * "Jul 6" / "Mon, Jul 6, 5:11 PM", older ones "8/4/22" / "Fri, 8 Apr 2022, 10:54 AM".
 */
export function emailDates(email: Pick<EmailInput, 'date' | 'hour' | 'minute' | 'meridiem'>, now = new Date()) {
  const [y, m, d] = email.date.split('-').map(Number) as [number, number, number];
  const weekday = DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const month = MONTHS[m - 1];
  const time = `${email.hour}:${String(email.minute).padStart(2, '0')} ${email.meridiem}`;
  const thisYear = y === now.getFullYear();
  return {
    rowDate: thisYear ? `${month} ${d}` : `${d}/${m}/${String(y).slice(2)}`,
    headerDateTime: thisYear
      ? `${weekday}, ${month} ${d}, ${time}`
      : `${weekday}, ${d} ${month} ${y}, ${time}`,
    date: `${month} ${d}, ${y}, ${time}`,
  };
}

/** Output keys in the order the mail template reads them; jsonb stores them sorted. */
export const OUTPUT_KEYS = [
  'subject', 'rowDate', 'headerDateTime', 'date',
  'senderName', 'senderEmail', 'mailedBy', 'signedBy', 'logo',
  'textReplacements',
] as const;

export function inOutputOrder(item: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(OUTPUT_KEYS.filter((key) => key in item).map((key) => [key, item[key]]));
}

export function buildEmailOutput(emails: EmailInput[], now = new Date()) {
  return emails.map((email) => ({
    subject: email.subject,
    ...emailDates(email, now),
    ...(email.mode === 'all'
      ? {
          senderName: email.senderName ?? '',
          senderEmail: email.senderEmail ?? '',
          mailedBy: email.mailedBy ?? '',
          signedBy: email.signedBy ?? '',
          logo: email.logo ?? '',
        }
      : {}),
    textReplacements: email.replacements.map(({ find, replace }) => ({ find, replace })),
  }));
}
