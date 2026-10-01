/**
 * IDBI-format records run on mock data only: nothing is read from an uploaded
 * statement. The account block is synthetic and labelled as such, and the
 * salary periods come from the same Generate-record form as SBI.
 */
import { buildSalaryPeriods, parseDetails } from "../sbi/salary-periods.js";

const digits = (length) =>
  Array.from({ length }, () => Math.floor(Math.random() * 10)).join("");

/** A clearly synthetic account holder, branch and account number. */
export function mockIdbiAccountInfo(password = "") {
  return {
    accountName: "SAMPLE ACCOUNT HOLDER",
    addressLine1: "1 Sample Street",
    addressLine2: "Test Nagar",
    addressLine3: "Mock City, 000000",
    accountNumber: `0000${digits(12)}`,
    accountOpeningDate: "01-01-2015",
    accountStatus: "Active",
    currency: "INR",
    nominationRegistered: "No",
    ckycNumber: "-",
    solIdBranchCode: "000",
    branch: "SAMPLE BRANCH",
    branchAddress: "Sample Branch Road, Mock City, 000000",
    ifsCode: "TEST0000000",
    branchEmailId: "sample@example.com",
    nomineeName: "-",
    nomineePercentage: "-",
    nomineeRelationship: "-",
    fromDate: "",
    toDate: "",
    password,
  };
}

/**
 * Form payload -> the extract generate.js takes. `previous` is a stored
 * extract: editing a record keeps its mock account block and balances.
 */
export function buildIdbiExtract(details, previous = null) {
  const form = parseDetails(details);
  const accountInfo = previous?.accountInfo
    ? { ...previous.accountInfo, password: form.pdfPassword }
    : mockIdbiAccountInfo(form.pdfPassword);

  return {
    accountInfo,
    numberOfCreditsTransactions: previous?.numberOfCreditsTransactions ?? [1, 3],
    numberOfDebitsTransactions: previous?.numberOfDebitsTransactions ?? [15, 20],
    balanceBeforeFromDate: previous?.balanceBeforeFromDate ?? 5000.0,
    balanceAfterToDate: previous?.balanceAfterToDate ?? 453.0,
    salaryDay: form.salaryDay,
    nextWorkingDay: form.nextWorkingDay,
    salaries: buildSalaryPeriods(form),
  };
}
