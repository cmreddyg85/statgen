/**
 * Appends one or two rows to a generated statement so that it closes on
 * `target`. Existing rows are never touched. The new rows copy the narration
 * of a random existing row going the same way, so they read like the rest.
 *
 * SBI rows: { Date: 'dd/mm/yyyy', Narration, Ref, Debit, Credit, Balance }.
 * IDBI rows: { date: 'dd/mm/yyyy hh:mm:ss', details, type: 'Cr'|'Dr', amount, balance }.
 */

// ponytail: above this the difference is split in two rows so one odd-sized
// entry doesn't stand out; tune if statements look off.
const SPLIT_ABOVE = 1000;

function pick(list, random) {
  return list[Math.floor(random() * list.length)];
}

/** The difference as one or two same-signed amounts, in paise-exact strings. */
function splitAmounts(difference, random) {
  const total = Math.round(Math.abs(difference) * 100);
  if (total <= SPLIT_ABOVE * 100) return [total];
  const first = Math.round((total * (0.35 + random() * 0.3)) / 100) * 100;
  return [first, total - first];
}

function nextIdbiDate(date, seconds) {
  const [d, t = "00:00:00"] = date.trim().split(" ");
  const [day, month, year] = d.split("/").map(Number);
  const [h, m, s] = t.split(":").map(Number);
  const next = new Date(year, month - 1, day, h, m, s + seconds);
  // Never roll into the next day: the statement period ends on this one.
  if (next.getDate() !== day) next.setTime(new Date(year, month - 1, day, 23, 59, 59).getTime());
  const p = (n) => String(n).padStart(2, "0");
  return `${p(next.getDate())}/${p(next.getMonth() + 1)}/${next.getFullYear()} ${p(next.getHours())}:${p(next.getMinutes())}:${p(next.getSeconds())}`;
}

export function matchTransactions(bank, transactions, target, random = Math.random) {
  if (!Array.isArray(transactions) || transactions.length === 0) {
    throw new Error("The statement has no transactions to continue from.");
  }
  const isIdbi = bank === "IDBI";
  const last = transactions[transactions.length - 1];
  const closing = Number.parseFloat(isIdbi ? last.balance : last.Balance);
  const difference = Math.round((target - closing) * 100) / 100;
  if (difference === 0) return { added: [], transactions };

  const credit = difference > 0;
  const sameWay = transactions.filter((row) =>
    !row.isSalary && (isIdbi ? row.type === (credit ? "Cr" : "Dr") : Boolean(credit ? row.Credit : row.Debit)),
  );
  const pool = sameWay.length > 0 ? sameWay : transactions;

  let balance = Math.round(closing * 100);
  const added = splitAmounts(difference, random).map((paise, index) => {
    balance += credit ? paise : -paise;
    const amount = (paise / 100).toFixed(2);
    const source = pick(pool, random);
    return isIdbi
      ? {
          date: nextIdbiDate(last.date, 60 * (index + 1)),
          details: source.details,
          type: credit ? "Cr" : "Dr",
          amount,
          balance: (balance / 100).toFixed(2),
        }
      : {
          Date: last.Date,
          Narration: source.Narration,
          Ref: "",
          Debit: credit ? "" : amount,
          Credit: credit ? amount : "",
          Balance: (balance / 100).toFixed(2),
        };
  });

  return { added, transactions: [...transactions, ...added] };
}
