/**
 * Generate-record form payload -> salary periods.
 *
 * The form collects employment history (companies, hikes, salary day). This
 * turns it into the `salaries` array that generate.js walks: one period per
 * salary level, each with the narration template and the amount credited in
 * every month of that period.
 *
 * Nothing is ever emitted past today: a statement cannot show future months,
 * so a period is cut short at today and one starting later is dropped — which
 * is what removes a full-and-final settlement that has not happened yet.
 *
 * ponytail: periods are emitted strictly in sequence and clamped so they never
 * overlap — generate.js concatenates each period's transactions without a
 * global sort, and an out-of-order date trips its own checkDateOrder().
 */

const MS_DAY = 86_400_000;

function invalidDetails(message) {
  const error = new Error(message);
  error.code = "INVALID_DETAILS";
  return error;
}

/** Accepts `yyyy-mm-dd` (what <input type="date"> submits) and `dd/mm/yyyy`. */
export function parseDate(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) return new Date(Number(slash[3]), Number(slash[2]) - 1, Number(slash[1]));

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const pad = (value) => String(value).padStart(2, "0");
const formatDate = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const firstDayOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
const lastDayOfMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0);
/** Months forward from `date`, landing on the 1st — same as the original. */
const addMonths = (date, months) =>
  new Date(date.getFullYear(), date.getMonth() + months, 1);
const daysInMonth = (date) => lastDayOfMonth(date).getDate();
const nextDay = (date) => new Date(date.getTime() + MS_DAY);
const today = () => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
};

/**
 * `DEP TFR NEFT-<ifsc>*<bank>-{{TraNum}}-<credit text>`, the narration the
 * form previews. generate.js fills {{TraNum}}, {{ShortMonth}}, {{ShortYear}}.
 */
export function narrationFor(company) {
  if (company.narration) return String(company.narration);
  return `DEP TFR NEFT-${company.ifsc || "IFSC"}*${company.bank || "BANK"}-{{TraNum}}-${
    company.salaryCreditText || "{{ShortMonth}}{{ShortYear}}"
  }`;
}

/** Tolerates the payload arriving as a JSON string (multipart form field). */
export function parseDetails(details) {
  let data = details;

  if (typeof data === "string") {
    const text = data.trim();
    if (!text) throw invalidDetails('"details" is required');
    try {
      data = JSON.parse(text);
    } catch (error) {
      throw invalidDetails(`"details" is not valid JSON: ${error.message}`);
    }
  }

  if (!data || typeof data !== "object") {
    throw invalidDetails('"details" must be an object');
  }

  const companies = Array.isArray(data.companies) ? data.companies : [];
  if (companies.length === 0) {
    throw invalidDetails('"details.companies" must contain at least one company');
  }

  const salaryDay = Number(data.salaryDay ?? 5);
  if (!Number.isInteger(salaryDay) || salaryDay < 1 || salaryDay > 31) {
    throw invalidDetails('"details.salaryDay" must be a whole number between 1 and 31');
  }

  return {
    companies,
    salaryDay,
    nextWorkingDay: Boolean(data.nextWorkingDay),
    // Used to encrypt a generated statement, when one is asked for.
    pdfPassword: String(data.pdfPassword ?? ""),
    // The form's default is true: the final settlement lands the month after
    // the last relieving date. False drops that last credit entirely.
    fullAndFinalCredited: data.fullAndFinalCredited !== false,
  };
}

export function buildSalaryPeriods(form, statementEnd = today()) {
  const { companies, fullAndFinalCredited } = form;
  const periods = [];
  let cursor = null;

  const push = (from, to, entry) => {
    const start = cursor && from <= cursor ? nextDay(cursor) : from;
    // The statement stops at today, so the last period is cut short and
    // anything starting after today is dropped.
    const end = to > statementEnd ? statementEnd : to;
    if (start > end) return;
    periods.push({ from: formatDate(start), to: formatDate(end), ...entry });
    cursor = end;
  };
  const idle = { text: "", amount: "" };

  companies.forEach((company, index) => {
    const label = company.name ? `"${company.name}"` : `company ${index + 1}`;
    const joining = parseDate(company.joiningDate);
    const relieving = parseDate(company.relievingDate);
    const salary = Number(company.salary);

    if (!joining) throw invalidDetails(`${label}: joiningDate is required`);
    if (!relieving) throw invalidDetails(`${label}: relievingDate is required`);
    if (relieving <= joining) {
      throw invalidDetails(`${label}: relievingDate must be after joiningDate`);
    }
    if (!Number.isFinite(salary) || salary <= 0) {
      throw invalidDetails(`${label}: salary must be a number greater than zero`);
    }

    const text = narrationFor(company);
    const bankCode = company.bank || "";
    const isLast = index === companies.length - 1;

    // Joining on or before the 15th is paid next month, later the month after.
    const firstSalaryMonth = addMonths(joining, joining.getDate() <= 15 ? 1 : 2);

    // Nothing is credited between the previous job and the first pay day.
    push(
      index === 0
        ? new Date(joining.getFullYear() - 1, joining.getMonth(), joining.getDate())
        : nextDay(cursor),
      lastDayOfMonth(addMonths(firstSalaryMonth, -1)),
      idle,
    );

    // First credit is prorated over the days actually worked that month, plus
    // a full month when the credit only lands the month after next.
    const joinMonthDays = daysInMonth(joining);
    const prorated = (salary / joinMonthDays) * (joinMonthDays - joining.getDate() + 1);
    push(firstDayOfMonth(firstSalaryMonth), lastDayOfMonth(firstSalaryMonth), {
      text,
      amount: (joining.getDate() <= 15 ? prorated : prorated + salary).toFixed(2),
      bankCode,
    });

    const hikes = [...(company.hikes ?? [])]
      .map((hike) => ({
        date: parseDate(hike.date ?? hike.hikeDate),
        salary: Number(hike.salary ?? hike.HikeSalary),
      }))
      .filter((hike) => hike.date)
      .sort((first, second) => first.date - second.date);

    let current = salary;
    let start = addMonths(firstSalaryMonth, 1);

    for (const hike of hikes) {
      if (hike.date <= joining || hike.date >= relieving) {
        throw invalidDetails(
          `${label}: hike dates must fall between the joining and relieving dates`,
        );
      }
      if (!Number.isFinite(hike.salary) || hike.salary <= 0) {
        throw invalidDetails(`${label}: hike salary must be a number greater than zero`);
      }

      // A hike agreed in month M is first paid in the credit for month M.
      push(start, lastDayOfMonth(hike.date), { text, amount: current.toFixed(2), bankCode });
      current = hike.salary;
      start = addMonths(hike.date, 1);
    }

    // Full and final off applies to the current job only — an earlier job was
    // necessarily settled before the next one started. Nothing more is
    // credited after the settlement, and when the last day worked falls on or
    // before the 10th the relieving month's credit is withheld with it: the
    // settlement would have been that month's salary plus the days worked.
    const withheld = isLast && !fullAndFinalCredited;

    // Leaving during the current month: the settlement is still to come, and
    // the relieving month's credit goes out with it, so the statement stops
    // at the month before. Neither has happened yet on the day this is run.
    const leftThisMonth =
      relieving.getFullYear() === statementEnd.getFullYear() &&
      relieving.getMonth() === statementEnd.getMonth();

    const stopEarly =
      isLast && (leftThisMonth || (withheld && relieving.getDate() <= 10));
    const lastPaidMonth = stopEarly ? addMonths(relieving, -1) : relieving;

    push(start, lastDayOfMonth(lastPaidMonth), {
      text,
      amount: current.toFixed(2),
      bankCode,
    });

    // The settlement itself: the month after relieving, prorated to the last
    // day worked. A settlement month that has not arrived yet is dropped by
    // the clamp in push().
    if (!withheld) {
      const settlementMonth = addMonths(relieving, 1);
      push(firstDayOfMonth(settlementMonth), lastDayOfMonth(settlementMonth), {
        text,
        amount: ((current / daysInMonth(relieving)) * relieving.getDate()).toFixed(2),
        bankCode,
      });
    }

    if (isLast) {
      // Up to today, with no salary after the last job. The closing balance of
      // this period is the balance read off the uploaded statement.
      push(nextDay(cursor), statementEnd, idle);
    }
  });

  return periods;
}
