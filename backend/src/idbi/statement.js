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
          <td class="left">${escapeHtml(txn.details)}</td>
          <td>${txn.type === "Dr" ? money(txn.amount) : ""}</td>
          <td>${txn.type === "Cr" ? money(txn.amount) : ""}</td>
          <td>${money(txn.balance)}</td>
        </tr>`,
    )
    .join("");

  const kv = (label, value) =>
    `<tr><td class="label">${label}</td><td>${value || "-"}</td></tr>`;

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <style>
      * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #222; margin: 0; }
      .mark {
        position: fixed; top: 40%; left: 0; width: 100%; text-align: center;
        font-size: 46px; font-weight: bold; color: rgba(200, 0, 0, 0.18);
        transform: rotate(-30deg); z-index: 10; pointer-events: none;
      }
      .banner {
        border: 2px dashed #c00; color: #c00; text-align: center;
        font-weight: bold; padding: 6px; margin-bottom: 14px;
      }
      h1 { font-size: 16px; margin: 0 0 12px; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 14px; }
      table { width: 100%; border-collapse: collapse; }
      .kv td { padding: 2px 4px; vertical-align: top; }
      .kv td.label { width: 42%; color: #555; }
      .txn th, .txn td, .summary th, .summary td { border: 1px solid #999; padding: 4px; text-align: center; }
      .txn th, .summary th { background: #eee; }
      .txn td.left { text-align: left; }
      .summary { margin-top: 14px; }
    </style>
  </head>
  <body>
    <div class="mark">${SAMPLE_MARK}</div>
    <div class="banner">${SAMPLE_MARK} — generated from mock data for testing only</div>
    <h1>Sample statement (IDBI format)</h1>

    <div class="grid">
      <table class="kv">
        ${kv("Account holder", info.accountName)}
        ${kv("Address", [info.addressLine1, info.addressLine2, info.addressLine3].filter(Boolean).join(", "))}
        ${kv("Account no", info.accountNumber)}
        ${kv("Opening date", info.accountOpeningDate)}
        ${kv("Status", info.accountStatus)}
        ${kv("Currency", info.currency)}
      </table>
      <table class="kv">
        ${kv("Branch code", info.solIdBranchCode)}
        ${kv("Branch", info.branch)}
        ${kv("Branch address", info.branchAddress)}
        ${kv("IFSC", info.ifsCode)}
        ${kv("Period", `${info.fromDate} to ${info.toDate}`)}
      </table>
    </div>

    <table class="txn">
      <thead>
        <tr>
          <th>S.No</th><th>Txn date</th><th>Description</th>
          <th>Withdrawals (Dr)</th><th>Deposits (Cr)</th><th>Balance</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <table class="summary">
      <thead><tr><th>Dr count</th><th>Cr count</th><th>Debits</th><th>Credits</th></tr></thead>
      <tbody>
        <tr>
          <td>${summary.drCount}</td><td>${summary.crCount}</td>
          <td>${summary.totalDebits}</td><td>${summary.totalCredits}</td>
        </tr>
      </tbody>
    </table>
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
