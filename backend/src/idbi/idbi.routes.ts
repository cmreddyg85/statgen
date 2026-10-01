import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';
import { AppError, badRequest } from '../utils/errors.js';
import { reportsRouterFor } from '../sbi/sbi.routes.js';
import { buildSalaryPeriods, parseDetails } from '../sbi/salary-periods.js';
import { generateIdbiTransactions } from './generate.js';
import { extractIdbiAccountInfo } from './extract.js';

export const idbiRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const INPUT_ERROR_CODES = new Set([
  'PASSWORD_REQUIRED',
  'INVALID_PASSWORD',
  'INVALID_PDF',
  'INVALID_DETAILS',
]);

function asAppError(error: unknown): unknown {
  const code = (error as { code?: string } | null)?.code;
  if (code && INPUT_ERROR_CODES.has(code)) return badRequest((error as Error).message);
  if (code === 'LIMIT_FILE_SIZE') return badRequest('The statement PDF must be 25 MB or smaller.');
  return error;
}

function regenerateIdbiExtract(details: unknown, previous: Record<string, unknown> | null) {
  if (!previous?.accountInfo || typeof previous.accountInfo !== 'object') {
    throw badRequest('A previously extracted payload is required.');
  }

  const form = parseDetails(details);
  return {
    ...previous,
    accountInfo: { ...previous.accountInfo, password: form.pdfPassword },
    salaryDay: form.salaryDay,
    nextWorkingDay: form.nextWorkingDay,
    salaries: buildSalaryPeriods(form),
  };
}

idbiRouter.use(requireAuth);

idbiRouter.post(
  '/extract-statement',
  (req, res, next) => {
    upload.single('file')(req, res, (error) => next(error ? asAppError(error) : undefined));
  },
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('The IDBI statement PDF is required (field name: file).');

    try {
      const extracted = await extractIdbiAccountInfo(req.file.buffer, req.body?.password, req.body?.details);
      const generated = generateIdbiTransactions(extracted);
      if (generated.invalidDates.length > 0) {
        throw new AppError(422, 'VALIDATION_ERROR', 'Generated transactions are out of order.', {
          logDetail: JSON.stringify(generated.invalidDates),
        });
      }
      res.json({ extracted, ...generated });
    } catch (error) {
      throw asAppError(error);
    }
  }),
);

/**
 * Editing a stored IDBI record keeps its extracted account block and rebuilds
 * the salary periods from the submitted form.
 */
idbiRouter.post(
  '/generate',
  asyncHandler(async (req, res) => {
    const { details, extract } = req.body ?? {};

    let extracted;
    let generated;
    try {
      extracted = regenerateIdbiExtract(details, extract ?? null);
      generated = generateIdbiTransactions(extracted);
    } catch (error) {
      if ((error as { code?: string }).code === 'INVALID_DETAILS') {
        throw badRequest((error as Error).message);
      }
      throw error;
    }

    if (generated.invalidDates.length > 0) {
      throw new AppError(422, 'VALIDATION_ERROR', 'Generated transactions are out of order.', {
        logDetail: JSON.stringify(generated.invalidDates),
      });
    }

    res.json({ extracted, ...generated });
  }),
);

/** Standalone IDBI-format reports for the admin IDBI screen. */
idbiRouter.use('/reports', reportsRouterFor('IDBI'));
