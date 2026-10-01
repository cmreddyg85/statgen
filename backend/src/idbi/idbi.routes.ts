import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';
import { AppError, badRequest } from '../utils/errors.js';
import { reportsRouterFor } from '../sbi/sbi.routes.js';
import { generateIdbiTransactions } from './generate.js';
import { buildIdbiExtract } from './mock.js';

export const idbiRouter = Router();

idbiRouter.use(requireAuth);

/**
 * The Generate-record form posts here for an IDBI-format record. There is no
 * upload: the account block is mock data, and an edit passes its stored
 * `extract` so that block stays the same.
 */
idbiRouter.post(
  '/generate',
  asyncHandler(async (req, res) => {
    const { details, extract } = req.body ?? {};

    let extracted;
    let generated;
    try {
      extracted = buildIdbiExtract(details, extract ?? null);
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
