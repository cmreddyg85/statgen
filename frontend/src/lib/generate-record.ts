/**
 * Shape and rules for the generate-record form.
 *
 * Pure: no React, no DOM — the form holds the state, this decides whether it
 * is valid and what JSON it produces.
 */

export interface HikeInput {
  id: string;
  date: string;
  salary: string;
}

export interface CompanyInput {
  id: string;
  name: string;
  joiningDate: string;
  relievingDate: string;
  salary: string;
  bank: string;
  ifsc: string;
  salaryCreditText: string;
  hikes: HikeInput[];
}

export interface GenerateRecordInput {
  companies: CompanyInput[];
  salaryDay: string;
  nextWorkingDay: boolean;
  fullAndFinalCredited: boolean;
  documentName: string | null;
}

/** Errors keyed by field path, e.g. `companies.0.hikes.1.date`. */
export type Errors = Record<string, string>;

let sequence = 0;
export const nextId = (): string => `id-${++sequence}`;

export const emptyHike = (): HikeInput => ({ id: nextId(), date: '', salary: '' });

export const emptyCompany = (): CompanyInput => ({
  id: nextId(),
  name: '',
  joiningDate: '',
  relievingDate: '',
  salary: '',
  bank: '',
  ifsc: '',
  salaryCreditText: '',
  hikes: [],
});

export const emptyForm = (): GenerateRecordInput => ({
  companies: [emptyCompany()],
  salaryDay: '5',
  nextWorkingDay: false,
  fullAndFinalCredited: true,
  documentName: null,
});

const isMoney = (value: string): boolean => /^\d+(\.\d{1,2})?$/.test(value.trim());
const money = (value: string): number => Number(value.trim());

export function validate(form: GenerateRecordInput): Errors {
  const errors: Errors = {};

  if (form.companies.length === 0) {
    errors.companies = 'Add at least one company.';
  }

  const salaryDay = Number(form.salaryDay);
  if (!/^\d+$/.test(form.salaryDay.trim())) {
    errors.salaryDay = 'Salary day must be a number.';
  } else if (salaryDay < 1 || salaryDay > 31) {
    errors.salaryDay = 'Salary day must be between 1 and 31.';
  }

  // The generator reads the account block off the statement's first page.
  if (!form.documentName) {
    errors.document = 'Bank statement first page (PDF) is required.';
  }

  form.companies.forEach((company, index) => {
    const at = (field: string) => `companies.${index}.${field}`;

    if (!company.name.trim()) errors[at('name')] = 'Company name is required.';
    if (!company.joiningDate) errors[at('joiningDate')] = 'Joining date is required.';
    if (!company.relievingDate) errors[at('relievingDate')] = 'Relieving date is required.';

    if (
      company.joiningDate &&
      company.relievingDate &&
      company.relievingDate <= company.joiningDate
    ) {
      errors[at('relievingDate')] = 'Relieving date must be after the joining date.';
    }

    // Employment periods run in order and must not overlap.
    const previous = form.companies[index - 1];
    if (previous?.relievingDate && company.joiningDate) {
      if (company.joiningDate <= previous.relievingDate) {
        errors[at('joiningDate')] =
          'Joining date must be after the previous company’s relieving date.';
      }
    }

    if (!company.salary.trim()) {
      errors[at('salary')] = 'Salary is required.';
    } else if (!isMoney(company.salary)) {
      errors[at('salary')] = 'Salary must be a number.';
    } else if (money(company.salary) <= 0) {
      errors[at('salary')] = 'Salary must be greater than zero.';
    }

    if (!company.bank) errors[at('bank')] = 'Select a bank.';
    if (!company.ifsc) errors[at('ifsc')] = 'Select an IFSC code.';
    if (company.bank && company.ifsc && !company.ifsc.startsWith(company.bank)) {
      errors[at('ifsc')] = 'This IFSC code does not belong to the selected bank.';
    }
    if (!company.salaryCreditText.trim()) {
      errors[at('salaryCreditText')] = 'Salary credit text is required.';
    }

    let previousSalary = isMoney(company.salary) ? money(company.salary) : null;
    let previousHikeDate = '';

    company.hikes.forEach((hike, hikeIndex) => {
      const hikeAt = (field: string) => `${at(`hikes.${hikeIndex}`)}.${field}`;

      if (!hike.date) {
        errors[hikeAt('date')] = 'Hike date is required.';
      } else {
        if (company.joiningDate && hike.date <= company.joiningDate) {
          errors[hikeAt('date')] = 'Hike date must be after the joining date.';
        } else if (company.relievingDate && hike.date >= company.relievingDate) {
          errors[hikeAt('date')] = 'Hike date must be before the relieving date.';
        } else if (previousHikeDate && hike.date <= previousHikeDate) {
          errors[hikeAt('date')] = 'Each hike must come after the previous one.';
        }
        previousHikeDate = hike.date;
      }

      if (!hike.salary.trim()) {
        errors[hikeAt('salary')] = 'Hike salary is required.';
      } else if (!isMoney(hike.salary)) {
        errors[hikeAt('salary')] = 'Hike salary must be a number.';
      } else if (previousSalary !== null && money(hike.salary) <= previousSalary) {
        errors[hikeAt('salary')] = 'A hike must be greater than the previous salary.';
      }

      if (isMoney(hike.salary)) previousSalary = money(hike.salary);
    });
  });

  return errors;
}

/** The payload the Generate button prints. */
export function toPayload(form: GenerateRecordInput) {
  return {
    salaryDay: Number(form.salaryDay),
    nextWorkingDay: form.nextWorkingDay,
    fullAndFinalCredited: form.fullAndFinalCredited,
    bankStatementFirstPage: form.documentName,
    companies: form.companies.map((company) => ({
      name: company.name.trim(),
      joiningDate: company.joiningDate,
      relievingDate: company.relievingDate,
      salary: Number(company.salary),
      bank: company.bank,
      ifsc: company.ifsc,
      salaryCreditText: company.salaryCreditText.trim(),
      narration: `DEP TFR NEFT-${company.ifsc}*${company.bank}-{{TraNum}}-${company.salaryCreditText.trim()}`,
      hikes: company.hikes.map((hike) => ({
        date: hike.date,
        salary: Number(hike.salary),
      })),
    })),
  };
}

/** The stored shape of `toPayload`, as it comes back from the API. */
interface StoredPayload {
  companies?: Array<{
    name?: string;
    joiningDate?: string;
    relievingDate?: string;
    salary?: number | string;
    bank?: string;
    ifsc?: string;
    salaryCreditText?: string;
    hikes?: Array<{ date?: string; salary?: number | string }>;
  }>;
  salaryDay?: number | string;
  nextWorkingDay?: boolean;
  fullAndFinalCredited?: boolean;
  bankStatementFirstPage?: string | null;
}

const text = (value: number | string | undefined): string =>
  value === undefined || value === null ? '' : String(value);

/** Rebuilds editable form state from a stored payload. Inverse of `toPayload`. */
export function fromPayload(payload: StoredPayload): GenerateRecordInput {
  const companies = (payload.companies ?? []).map((company) => ({
    id: nextId(),
    name: company.name ?? '',
    joiningDate: company.joiningDate ?? '',
    relievingDate: company.relievingDate ?? '',
    salary: text(company.salary),
    bank: company.bank ?? '',
    ifsc: company.ifsc ?? '',
    salaryCreditText: company.salaryCreditText ?? '',
    hikes: (company.hikes ?? []).map((hike) => ({
      id: nextId(),
      date: hike.date ?? '',
      salary: text(hike.salary),
    })),
  }));

  return {
    companies: companies.length > 0 ? companies : [emptyCompany()],
    salaryDay: text(payload.salaryDay) || '5',
    nextWorkingDay: Boolean(payload.nextWorkingDay),
    fullAndFinalCredited: payload.fullAndFinalCredited !== false,
    documentName: payload.bankStatementFirstPage ?? null,
  };
}
