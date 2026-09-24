import { recordAudit } from './audit.service.js';
import * as reports from '../repositories/sbi-report.repository.js';
import { generateSbiTransactions } from '../sbi/generate.js';
import { renderStatement, type StatementPayload } from '../sbi/statement-render.js';
import type {
  RequestActor,
  SbiReportEntry,
  SbiReportSource,
  SbiReportSummary,
} from '../types.js';
import { badRequest, notFound } from '../utils/errors.js';
import type { RenderOptions } from '../sbi/statement-render.js';

/**
 * Standalone statements, built from a payload pasted on the SBI screen
 * instead of from a student's form. Administrators only — the routes enforce
 * the role.
 */

function parseInput(input: unknown): Record<string, unknown> {
  const value = typeof input === 'string' ? safeParse(input) : input;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw badRequest('Paste a JSON object.');
  }
  return value as Record<string, unknown>;
}

function safeParse(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) throw badRequest('Paste the JSON to build the report from.');
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    throw badRequest(`That is not valid JSON: ${(error as Error).message}`);
  }
}

/**
 * Extract payloads still have to be run through the generator; a transactions
 * payload is already the finished statement and is taken as it stands.
 */
function buildStatement(source: SbiReportSource, input: Record<string, unknown>) {
  const accountInfo = input.accountInfo;
  if (!accountInfo || typeof accountInfo !== 'object') {
    throw badRequest('The payload needs an "accountInfo" object.');
  }

  if (source === 'transactions') {
    const transactions = input.transactions;
    if (!Array.isArray(transactions) || transactions.length === 0) {
      throw badRequest('The payload needs a non-empty "transactions" array.');
    }
    return {
      accountInfo,
      transactions,
      salaryTrans: Array.isArray(input.salaryTrans) ? input.salaryTrans : [],
    };
  }

  if (!Array.isArray(input.salaries) || input.salaries.length === 0) {
    throw badRequest('An extract payload needs a non-empty "salaries" array.');
  }

  const generated = generateSbiTransactions(input);
  if (generated.invalidDates.length > 0) {
    throw badRequest(
      `The generated transactions came out in the wrong order (${generated.invalidDates.length} date(s)).`,
    );
  }
  if (generated.transactions.length === 0) {
    throw badRequest('That extract produced no transactions.');
  }

  return {
    accountInfo: generated.accountInfo,
    transactions: generated.transactions,
    salaryTrans: generated.salaryTrans,
  };
}

export async function list(): Promise<SbiReportSummary[]> {
  return reports.listReports();
}

export async function getById(id: string): Promise<SbiReportEntry> {
  const report = await reports.findById(id);
  if (!report) throw notFound('Report not found.');
  return report;
}

export async function create(
  source: SbiReportSource,
  rawInput: unknown,
  actor: RequestActor,
): Promise<SbiReportSummary> {
  const input = parseInput(rawInput);
  const statement = buildStatement(source, input);
  const created = await reports.insertReport({ source, input, statement }, actor.user.id);

  await recordAudit({
    userId: actor.user.id,
    action: 'SBI_REPORT_CREATED',
    entityType: 'sbi_report',
    entityId: created.id,
    metadata: { source, transactions: created.transactionCount },
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  });

  return created;
}

export async function update(
  id: string,
  source: SbiReportSource,
  rawInput: unknown,
  actor: RequestActor,
): Promise<SbiReportSummary> {
  await getById(id);
  const input = parseInput(rawInput);
  const statement = buildStatement(source, input);

  const updated = await reports.updateReport(id, { source, input, statement });
  if (!updated) throw notFound('Report not found.');

  await recordAudit({
    userId: actor.user.id,
    action: 'SBI_REPORT_UPDATED',
    entityType: 'sbi_report',
    entityId: id,
    metadata: { source },
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  });

  return updated;
}

export async function remove(id: string, actor: RequestActor): Promise<void> {
  await getById(id);
  const deleted = await reports.deleteReport(id);
  if (!deleted) throw notFound('Report not found.');

  await recordAudit({
    userId: actor.user.id,
    action: 'SBI_REPORT_DELETED',
    entityType: 'sbi_report',
    entityId: id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  });
}

export async function statementPdf(
  id: string,
  options: RenderOptions,
): Promise<{ pdf: Buffer; fileName: string }> {
  const report = await getById(id);
  return renderStatement(report.statement as StatementPayload, options);
}
