import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';
import { AppError } from '../utils/errors.js';

type Source = 'body' | 'query' | 'params';

function toFieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

/**
 * Validates and normalizes one part of the request, replacing it with the
 * parsed value so handlers only ever see trusted, typed data.
 */
export function validate(schema: ZodTypeAny, source: Source = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      next(
        new AppError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', {
          fields: toFieldErrors(result.error),
        }),
      );
      return;
    }
    Object.defineProperty(req, source, {
      value: result.data,
      writable: true,
      configurable: true,
      enumerable: true,
    });
    next();
  };
}

/** Typed accessors used by route handlers after `validate` has run. */
export const body = <T>(req: Request): T => req.body as T;
export const queryParams = <T>(req: Request): T => req.query as unknown as T;
export const routeParams = <T>(req: Request): T => req.params as unknown as T;
