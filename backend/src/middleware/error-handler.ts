import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `No route matches ${req.method} ${req.path}.`,
      requestId: req.id,
    },
  });
}

/**
 * Single place that shapes error responses (PRD Appendix A.1). Stack traces,
 * SQL detail and internal messages stay in the server log.
 */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof AppError) {
    if (error.status >= 500) {
      logger.error({ err: error, requestId: req.id }, error.logDetail ?? error.message);
    } else {
      logger.warn(
        { code: error.code, requestId: req.id, detail: error.logDetail },
        error.message,
      );
    }

    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.fields ? { fields: error.fields } : {}),
        requestId: req.id,
      },
    });
    return;
  }

  logger.error(
    { err: error, requestId: req.id, method: req.method, path: req.path },
    'Unhandled error while processing request',
  );

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong. Please try again.',
      requestId: req.id,
      ...(env.isProduction ? {} : { debug: String(error) }),
    },
  });
}
