/**
 * Renders an IDBI-format record as a plain sample statement. No bank logo,
 * footer or legal text, and every page carries the SAMPLE mark — there is no
 * clean variant. `accountInfo.password` encrypts the result.
 */
import { PDFDocument } from "@cantoo/pdf-lib";
import { chromium } from "playwright";

export const SAMPLE_MARK = "SAMPLE – NOT A BANK DOCUMENT";

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const money = (value) =>
  Number.parseFloat(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function summarize(transactions) {
  const total = (type) =>
    transactions
      .filter((txn) => txn.type === type)
      .reduce((sum, txn) => sum + Number.parseFloat(txn.amount || 0), 0);

  return {
    drCount: transactions.filter((txn) => txn.type === "Dr").length,
    crCount: transactions.filter((txn) => txn.type === "Cr").length,
    totalDebits: money(total("Dr")),
    totalCredits: money(total("Cr")),
  };
}

/**
 * @param {Record<string, any>} accountInfo
 * @param {Array<Record<string, any>>} transactions
 */
export async function createIdbiSamplePdf(accountInfo = {}, transactions = []) {
  const info = Object.fromEntries(
    Object.entries(accountInfo).map(([key, value]) => [key, escapeHtml(value)]),
  );
  const summary = summarize(transactions);

  const rows = transactions
    .map(
      (txn, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(txn.date)}</td>
          <td>${escapeHtml(txn.date?.split(" ")[0])}</td>
          <td class="left">${escapeHtml(txn.details)}</td>
          <td></td>
          <td>${txn.type === "Dr" ? money(txn.amount) : ""}</td>
          <td>${txn.type === "Cr" ? money(txn.amount) : ""}</td>
          <td>${money(txn.balance)}</td>
        </tr>`,
    )
    .join("");

  const kv = (label, value) =>
    `<tr><td class="label">${label}</td><td class="colon">:</td><td>${value || "-"}</td></tr>`;

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <style>
      * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #1a1a1a; margin: 0; }
      .mark {
        position: fixed; top: 40%; left: 0; width: 100%; text-align: center;
        font-size: 46px; font-weight: bold; color: rgba(200, 0, 0, 0.18);
        transform: rotate(-30deg); z-index: 10; pointer-events: none;
      }
      .banner {
        border: 2px dashed #c00; color: #c00; text-align: center;
        font-weight: bold; padding: 6px; margin-bottom: 12px;
      }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-bottom: 14px; }
      h2, .section-title { font-size: 14px; margin: 0; padding: 5px; }
      table { width: 100%; border-collapse: collapse; }
      .details { background: #e4f6f8; padding: 6px; }
      .kv td { padding: 3px 4px; vertical-align: top; }
      .kv td.label { width: 46%; }
      .kv td.colon { width: 3%; }
      .section-title { margin-top: 16px; }
      .nominee th, .nominee td { border: 1px solid #aaa; padding: 4px; text-align: left; }
      .statement-title { background: #286f69; color: #fff; padding: 9px; margin: 16px 0 6px; text-align: center; font-weight: bold; letter-spacing: .4px; }
      .statement-sub { display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 10px; }
      .txn th, .txn td, .summary th, .summary td { border: 1px solid #4c8761; padding: 4px; text-align: center; }
      .txn th, .summary th { background: #fffed9; }
      .txn td.left { text-align: left; }
      .txn { font-size: 9px; }
      .txn th:nth-child(1) { width: 4%; }
      .txn th:nth-child(2), .txn th:nth-child(3) { width: 13%; }
      .txn th:nth-child(4) { width: 34%; }
      .summary { margin: 14px 0; }
      .legend { font-size: 10px; }
      .legend td { border: 1px solid #aaa; padding: 4px; width: 50%; }
      .note { font-size: 9px; line-height: 1.35; margin-top: 14px; }
    </style>
  </head>
  <body>
    <div class="mark">${SAMPLE_MARK}</div>
    <div class="banner">${SAMPLE_MARK} — generated data for testing only</div>
    <div class="grid">
      <div><h2>Customer details</h2><div class="details"><table class="kv">
        ${kv("Account holder name", info.accountName)}
        ${kv("Address", [info.addressLine1, info.addressLine2, info.addressLine3].filter(Boolean).join(", "))}
        ${kv("Account no", info.accountNumber)}
        ${kv("Account opening date", info.accountOpeningDate)}
        ${kv("Account status", info.accountStatus)}
        ${kv("Currency", info.currency)}
        ${kv("Nominee registered", info.nominationRegistered)}
        ${kv("CKYC number", info.ckycNumber)}
      </table></div></div>
      <div><h2>Branch details</h2><div class="details"><table class="kv">
        ${kv("Sol ID / branch code", info.solIdBranchCode)}
        ${kv("Account branch", info.branch)}
        ${kv("Address", info.branchAddress)}
        ${kv("Branch IFSC code", info.ifsCode)}
        ${kv("Branch email ID", info.branchEmailId)}
      </table></div></div>
    </div>

    <div class="section-title">Nominee details</div>
    <table class="nominee"><thead><tr><th>Name of nominee</th><th>Percentage</th><th>Relationship</th></tr></thead>
      <tbody><tr><td>${info.nomineeName || "-"}</td><td>${info.nomineePercentage || "-"}</td><td>${info.nomineeRelationship || "-"}</td></tr></tbody>
    </table>
    <div class="statement-title">SAMPLE STATEMENT OF ACCOUNT : ${info.accountNumber || "-"}</div>
    <div class="statement-sub"><span>Transaction date from ${info.fromDate || "-"} to ${info.toDate || "-"}</span><span>Generated for testing only</span></div>
    <table class="txn">
      <thead>
        <tr>
          <th>S.No</th><th>Txn date</th><th>Value date</th><th>Description</th><th>Cheque no</th>
          <th>Withdrawals (Dr)</th><th>Deposits (Cr)</th><th>Balance (INR)</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="section-title">Statement summary</div>
    <table class="summary">
      <thead><tr><th>Dr count</th><th>Cr count</th><th>Debits</th><th>Credits</th></tr></thead>
      <tbody>
        <tr>
          <td>${summary.drCount}</td><td>${summary.crCount}</td>
          <td>${summary.totalDebits}</td><td>${summary.totalCredits}</td>
        </tr>
      </tbody>
    </table>
    <table class="legend"><tbody>
      <tr><td colspan="2"><strong>Transaction legends</strong></td></tr>
      <tr><td>NEFT - National Electronic Funds Transfer</td><td>IMPS - Immediate Payment Service</td></tr>
      <tr><td>UPI - Unified Payments Interface</td><td>Dr / Cr - Debit / Credit</td></tr>
    </tbody></table>
    <p class="note">This is a generated sample for testing and training. It is not issued by a bank and must not be used for verification, credit, employment, or identity purposes.</p>
  </body>
</html>`;

  const browser = await chromium.launch({ headless: true });
  let pdfBuffer;
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "12mm", right: "10mm", bottom: "15mm", left: "10mm" },
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate: `
        <div style="width:100%; text-align:center; font-size:9px; color:#c00;">
          ${SAMPLE_MARK} · Page <span class="pageNumber"></span> of <span class="totalPages"></span>
        </div>`,
    });
  } finally {
    await browser.close();
  }

  if (!accountInfo.password?.trim()) return pdfBuffer;

  const pdfDoc = await PDFDocument.load(pdfBuffer);
  pdfDoc.encrypt({
    userPassword: accountInfo.password,
    ownerPassword: accountInfo.password,
  });
  return Buffer.from(await pdfDoc.save());
}
