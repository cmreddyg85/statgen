import { randomBytes } from 'node:crypto';
import type { CookieOptions, Response } from 'express';
import { env } from '../config/env.js';

const baseCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.cookieSecure,
  sameSite: env.COOKIE_SAME_SITE,
  path: '/',
};

/**
 * The session cookie is HttpOnly so browser script can never read the token.
 * Its Max-Age mirrors the server-side absolute expiry.
 */
export function setSessionCookie(res: Response, token: string, expiresAt: string): void {
  res.cookie(env.SESSION_COOKIE_NAME, token, {
    ...baseCookieOptions,
    expires: new Date(expiresAt),
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(env.SESSION_COOKIE_NAME, baseCookieOptions);
  res.clearCookie(env.CSRF_COOKIE_NAME, { ...baseCookieOptions, httpOnly: false });
}

/**
 * Double-submit CSRF token. Deliberately readable by script: the browser
 * copies it into the x-csrf-token header, which a cross-site page cannot do.
 */
export function issueCsrfCookie(res: Response, expiresAt: string): string {
  const csrfToken = randomBytes(32).toString('base64url');
  res.cookie(env.CSRF_COOKIE_NAME, csrfToken, {
    ...baseCookieOptions,
    httpOnly: false,
    expires: new Date(expiresAt),
  });
  return csrfToken;
}
