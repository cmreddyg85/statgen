import { Router } from 'express';
import multer from 'multer';
import { getActor, requireAdmin, requireAuth } from '../middleware/auth.js';
import { body, routeParams, validate } from '../middleware/validate.js';
import * as reportService from '../services/sbi-report.service.js';
import {
  sbiReportSchema,
  statementPdfSchema,
  uuidParamSchema,
} from '../validation/schemas.js';
import { asyncHandler } from '../utils/async-handler.js';
import { AppError, badRequest } from '../utils/errors.js';
import { extractSbiAccountInfo } from './extract.js';
import { generateSbiTransactions } from './generate.js';
import { buildSalaryPeriods, parseDetails } from './salary-periods.js';
import { createSbiStatementPdf } from './statement.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

/** Errors the SBI pipeline raises for bad input, as opposed to real faults. */
const INPUT_ERROR_CODES = new Set([
  'PASSWORD_REQUIRED',
  'INVALID_PASSWORD',
  'INVALID_PDF',
  'INVALID_DETAILS',
]);

function asAppError(error: unknown): unknown {
  const code = (error as { code?: string } | null)?.code;
  if (code && INPUT_ERROR_CODES.has(code)) {
    return badRequest((error as Error).message);
  }
  if (code === 'LIMIT_FILE_SIZE') {
    return badRequest('The statement PDF must be 25 MB or smaller.');
  }
  return error;
}

export const sbiRouter = Router();

sbiRouter.use(requireAuth);

/**
 * The Generate-record form posts here: the first page of an SBI statement plus
 * the employment details it collected.
 *
 * The reply carries both halves of the pipeline: `extracted` is the account
 * block and salary periods read off the PDF — the exact payload
 * /generate-transactions takes — and the rest is what that produced.
 */
sbiRouter.post(
  '/extract-statement',
  (req, res, next) => {
    upload.single('file')(req, res, (error) => next(error ? asAppError(error) : undefined));
  },
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw badRequest('The bank statement first page is required (field name: file).');
    }

    let extracted;
    let generated;
    try {
      extracted = await extractSbiAccountInfo(
        req.file.buffer,
        req.body?.password,
        req.body?.details,
      );
      generated = generateSbiTransactions(extracted);
    } catch (error) {
      throw asAppError(error);
    }

    if (generated.invalidDates.length > 0) {
      throw new AppError(422, 'VALIDATION_ERROR', 'Generated transactions are out of order.', {
        logDetail: JSON.stringify(generated.invalidDates),
      });
    }

    res.json({ extracted, ...generated });
  }),
);

/**
 * Editing a saved record. The account block was already read off a PDF, so
 * only the salary periods are rebuilt from the changed form and the statement
 * is generated again — no re-upload needed.
 */
sbiRouter.post(
  '/regenerate',
  asyncHandler(async (req, res) => {
    const { extract, details } = req.body ?? {};

    if (!extract || typeof extract !== 'object' || !extract.accountInfo) {
      throw badRequest('A previously extracted payload is required.');
    }

    let extracted;
    let generated;
    try {
      const form = parseDetails(details);
      extracted = {
        ...extract,
        accountInfo: { ...extract.accountInfo, password: form.pdfPassword },
        salaryDay: form.salaryDay,
        nextWorkingDay: form.nextWorkingDay,
        salaries: buildSalaryPeriods(form),
      };
      generated = generateSbiTransactions(extracted);
    } catch (error) {
      throw asAppError(error);
    }

    res.json({ extracted, ...generated });
  }),
);

/** Regenerate transactions from an already extracted payload. */
sbiRouter.post(
  '/generate-transactions',
  asyncHandler(async (req, res) => {
    const generated = generateSbiTransactions(req.body ?? {});

    if (generated.invalidDates.length > 0) {
      throw new AppError(422, 'VALIDATION_ERROR', 'Generated transactions are out of order.', {
        logDetail: JSON.stringify(generated.invalidDates),
      });
    }

    res.json(generated);
  }),
);

/** Renders one statement PDF from an account block and its transactions. */
sbiRouter.post(
  '/generate-statement',
  asyncHandler(async (req, res) => {
    const { accountInfo, transactions } = req.body ?? {};

    if (!accountInfo || !Array.isArray(transactions) || transactions.length === 0) {
      throw badRequest('accountInfo and a non-empty transactions array are required.');
    }

    const pdf = await createSbiStatementPdf(accountInfo, transactions);
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="AccountStatement_${stamp}.pdf"`);
    res.send(pdf);
  }),
);

/**
 * Standalone reports, built on the SBI screen from a pasted payload rather
 * than from a student's Generate form. Administrators only.
 */
const reportsRouter = Router();
reportsRouter.use(requireAdmin);

/** GET /api/v1/sbi/reports */
reportsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ reports: await reportService.list() });
  }),
);

/** POST /api/v1/sbi/reports */
reportsRouter.post(
  '/',
  validate(sbiReportSchema),
  asyncHandler(async (req, res) => {
    const { source, input } = body<{ source: 'extract' | 'transactions'; input: string }>(req);
    const report = await reportService.create(source, input, getActor(req));
    res.status(201).json({ report });
  }),
);

/** GET /api/v1/sbi/reports/:id */
reportsRouter.get(
  '/:id',
  validate(uuidParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const { id } = routeParams<{ id: string }>(req);
    res.json({ report: await reportService.getById(id) });
  }),
);

/** PUT /api/v1/sbi/reports/:id */
reportsRouter.put(
  '/:id',
  validate(uuidParamSchema, 'params'),
  validate(sbiReportSchema),
  asyncHandler(async (req, res) => {
    const { id } = routeParams<{ id: string }>(req);
    const { source, input } = body<{ source: 'extract' | 'transactions'; input: string }>(req);
    res.json({ report: await reportService.update(id, source, input, getActor(req)) });
  }),
);

/** DELETE /api/v1/sbi/reports/:id */
reportsRouter.delete(
  '/:id',
  validate(uuidParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const { id } = routeParams<{ id: string }>(req);
    await reportService.remove(id, getActor(req));
    res.json({ success: true });
  }),
);

/** POST /api/v1/sbi/reports/:id/statement-pdf */
reportsRouter.post(
  '/:id/statement-pdf',
  validate(uuidParamSchema, 'params'),
  validate(statementPdfSchema),
  asyncHandler(async (req, res) => {
    const { id } = routeParams<{ id: string }>(req);
    const options = body<{
      fromDate: string;
      toDate: string;
      dateOfStatement?: string;
      dummy: boolean;
      protect: boolean;
      password?: string;
    }>(req);

    const { pdf, fileName } = await reportService.statementPdf(id, options);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(pdf);
  }),
);

sbiRouter.use('/reports', reportsRouter);
