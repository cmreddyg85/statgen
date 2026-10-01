import { buildSalaryPeriods, parseDetails } from '../sbi/salary-periods.js';

function inputError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function field(text, label, endLabels) {
  const ends = endLabels.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const match = text.match(new RegExp(`${label}\\s*:\\s*(.*?)(?=\\s*(?:${ends})\\s*:|$)`, 'i'));
  return match?.[1].trim() ?? '';
}

async function readStatementText(pdfBuffer, password) {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    password: password || undefined,
    useSystemFonts: true,
  });

  try {
    const pdf = await loadingTask.promise;
    const pages = await Promise.all(
      Array.from({ length: Math.min(pdf.numPages, 3) }, async (_, index) => {
        const page = await pdf.getPage(index + 1);
        const content = await page.getTextContent();
        return content.items.map((item) => item.str).filter(Boolean).join(' ');
      }),
    );
    await loadingTask.destroy();
    return pages.join(' ');
  } catch (error) {
    await loadingTask.destroy();
    if (error?.name === 'PasswordException') {
      throw inputError(
        error.code === pdfjsLib.PasswordResponses.NEED_PASSWORD
          ? 'This PDF is password protected. Provide the password.'
          : 'The password provided is incorrect.',
        error.code === pdfjsLib.PasswordResponses.NEED_PASSWORD
          ? 'PASSWORD_REQUIRED'
          : 'INVALID_PASSWORD',
      );
    }
    if (error?.name === 'InvalidPDFException') {
      throw inputError('The uploaded file is not a valid PDF.', 'INVALID_PDF');
    }
    throw error;
  }
}

export async function extractIdbiAccountInfo(pdfBuffer, password, details = {}) {
  const form = parseDetails(details);
  const text = (await readStatementText(pdfBuffer, password)).replace(/\s+/g, ' ').trim();

  const accountNumber = field(text, 'Account No', ['Account Opening Date']);
  if (!accountNumber) {
    throw inputError('Could not find IDBI account details in this PDF.', 'INVALID_PDF');
  }

  const accountName = field(text, 'Account Holder Name', ['Address']);
  const addressLine = field(text, 'Address', ['Account No']);
  const branchAddress =
    text.match(/Account Branch\s*:\s*.*?\s+Address\s*:\s*(.*?)(?=\s*Branch IFSC Code\s*:|$)/i)?.[1].trim() ?? '';
  const statementPeriod = text.match(/Transaction Date From\s+(\d{2}-[A-Za-z]{3}-\d{4})\s+to\s+(\d{2}-[A-Za-z]{3}-\d{4})/i);

  return {
    accountInfo: {
      accountName,
      addressLine1: addressLine,
      addressLine2: '',
      addressLine3: '',
      accountNumber,
      accountOpeningDate: field(text, 'Account Opening Date', ['Account Status']),
      accountStatus: field(text, 'Account Status', ['Currency']),
      currency: field(text, 'Currency', ['Nominee Registered']),
      nominationRegistered: field(text, 'Nominee Registered', ['CKYC Number']),
      ckycNumber: field(text, 'CKYC Number', ['Sol Id/Branch Code']),
      solIdBranchCode: field(text, 'Sol Id/Branch Code', ['Account Branch']),
      branch: field(text, 'Account Branch', ['Address']),
      branchAddress,
      ifsCode: field(text, 'Branch IFSC Code', ['Branch Email Id']),
      branchEmailId:
        text.match(/Branch Email Id\s*:\s*(.*?)(?=\s*Name of the Nominee\b|\s*STATEMENT OF ACCOUNT\s*:|$)/i)?.[1].trim() ?? '',
      nomineeName:
        text.match(/If Nominee is Minor,?\s*Guardian Name\s+(.*?)\s+\d+(?:\.\d+)?\s+(?:Father|Mother|Spouse|Other)\b/i)?.[1].trim() ?? '',
      nomineePercentage:
        text.match(/If Nominee is Minor,?\s*Guardian Name\s+.*?\s+(\d+(?:\.\d+)?)\s+(?:Father|Mother|Spouse|Other)\b/i)?.[1] ?? '',
      nomineeRelationship:
        text.match(/If Nominee is Minor,?\s*Guardian Name\s+.*?\s+\d+(?:\.\d+)?\s+(Father|Mother|Spouse|Other)\b/i)?.[1] ?? '',
      fromDate: statementPeriod?.[1] ?? '',
      toDate: statementPeriod?.[2] ?? '',
      password: form.pdfPassword,
    },
    numberOfCreditsTransactions: [1, 3],
    numberOfDebitsTransactions: [15, 20],
    balanceBeforeFromDate: 5000,
    balanceAfterToDate: 453,
    salaryDay: form.salaryDay,
    nextWorkingDay: form.nextWorkingDay,
    salaries: buildSalaryPeriods(form),
  };
}
