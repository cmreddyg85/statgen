import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Double-submit cookie CSRF protection for state-changing requests made with
 * an existing session cookie. Requests without a session cookie (e.g. login)
 * carry no ambient authority and are skipped.
 */
export function csrfProtection(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const sessionCookie = req.cookies?.[env.SESSION_COOKIE_NAME];
  if (!sessionCookie) {
    next();
    return;
  }

  const cookieToken = req.cookies?.[env.CSRF_COOKIE_NAME];
  const headerToken = req.header('x-csrf-token');

  if (!cookieToken || !headerToken || !safeEqual(cookieToken, headerToken)) {
    next(
      new AppError(
        403,
        'CSRF_ERROR',
        'Request could not be verified. Please refresh the page and try again.',
        { logDetail: 'CSRF double-submit token mismatch' },
      ),
    );
    return;
  }

  next();
}
