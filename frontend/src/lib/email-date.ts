const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const MONTH = '(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
const WEEKDAY = /\b(Sun(?:day)?|Mon(?:day)?|Tue(?:s(?:day)?)?|Wed(?:nesday)?|Thu(?:r(?:s(?:day)?)?)?|Fri(?:day)?|Sat(?:urday)?)\b/i;

/** `name` written the way `like` was: full or three letters, and its case. */
function styled(like: string, name: string): string {
  const word = like.length > 3 ? name : name.slice(0, 3);
  if (like === like.toUpperCase()) return word.toUpperCase();
  if (like === like.toLowerCase()) return word.toLowerCase();
  return word;
}

const pad = (like: string, n: number) => (like.length === 2 && like.startsWith('0') ? String(n).padStart(2, '0') : String(n));

export interface EmailWhen {
  date: string;
  hour: number;
  minute: number;
  meridiem: 'AM' | 'PM';
}

/**
 * Rewrites a pasted mail date ("Tue, Aug 11, 2026 at 2:29 PM") to `when`,
 * keeping its layout; a "(9 days ago)" tail is dropped. Null when the text
 * is not a date. A date without a year gains one ("Mon, 8 Apr 2022, …")
 * when `when` falls in another year, as a mail client prints it.
 */
export function retargetDate(old: string, when: EmailWhen, now = new Date()): string | null {
  if (!when.date) return null;
  const [y, m, d] = when.date.split('-').map(Number) as [number, number, number];
  const month = MONTHS[m - 1]!;
  const weekday = DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]!;
  const hasYear = /\b(19|20)\d{2}\b/.test(old);
  const needYear = !hasYear && y !== now.getFullYear();

  let text = old.replace(/\s*\([^)]*\bago\)/i, '');
  let found = false;

  text = text.replace(new RegExp(`\\b${MONTH}(\\.?\\s+)(\\d{1,2})\\b(?!:)`, 'i'), (_, mon: string, sep: string, day: string) => {
    found = true;
    return needYear ? `${d} ${styled(mon, month)} ${y}` : `${styled(mon, month)}${sep}${pad(day, d)}`;
  });
  if (!found) {
    text = text.replace(new RegExp(`\\b(\\d{1,2})(\\s+)${MONTH}\\b`, 'i'), (_, day: string, sep: string, mon: string) => {
      found = true;
      return `${pad(day, d)}${sep}${styled(mon, month)}${needYear ? ` ${y}` : ''}`;
    });
  }
  if (!found) {
    // Numeric dates are day/month, as the row date prints them.
    text = text.replace(/\b(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})\b/, (_, day: string, mon: string, year: string) => {
      found = true;
      return `${String(d).padStart(day.length, "0")}/${String(m).padStart(mon.length, "0")}/${year.length === 2 ? String(y).slice(2) : y}`;
    });
  }
  if (!found) return null;

  text = text.replace(WEEKDAY, (like) => styled(like, weekday));
  if (hasYear) text = text.replace(/\b(19|20)\d{2}\b/, String(y));
  text = text.replace(/\b(\d{1,2}):(\d{2})(?::\d{2})?(\s*)(AM|PM)?/i, (_, h: string, _min, sep: string, ampm?: string) => {
    const minute = String(when.minute).padStart(2, '0');
    if (ampm) return `${pad(h, when.hour)}:${minute}${sep}${styled(ampm, when.meridiem)}`;
    const hour24 = (when.hour % 12) + (when.meridiem === 'PM' ? 12 : 0);
    return `${String(hour24).padStart(h.length, '0')}:${minute}${sep}`;
  });
  return text;
}
