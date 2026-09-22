import rateLimit from 'express-rate-limit';
import type { Request } from 'express';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

const rateLimitError = new AppError(
  429,
  'RATE_LIMITED',
  'Too many attempts. Please wait a few minutes and try again.',
);

/**
 * Buckets an address for rate limiting. IPv6 clients are grouped by their /64
 * prefix, because a single host is routinely handed a whole /64 and could
 * otherwise sidestep the limit by rotating addresses within it.
 */
function addressKey(ip: string | undefined): string {
  if (!ip) return 'unknown';
  const normalized = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (!normalized.includes(':')) return normalized;
  return `${normalized.split(':').slice(0, 4).join(':')}::/64`;
}

/**
 * Login attempts are limited per IP *and* username so that one noisy client
 * cannot lock out an unrelated account from a shared office IP.
 */
export const loginRateLimiter = rateLimit({
  windowMs: env.LOGIN_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  limit: env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.isTest,
  keyGenerator: (req: Request) => {
    const username =
      typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
    return `${addressKey(req.ip)}:${username}`;
  },
  handler: (_req, _res, next) => next(rateLimitError),
});

/** Broad safety net for the rest of the API. */
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.isTest,
  keyGenerator: (req: Request) => addressKey(req.ip),
  handler: (_req, _res, next) => next(rateLimitError),
});
