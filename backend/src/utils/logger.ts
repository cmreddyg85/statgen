import pino from 'pino';
import { env } from '../config/env.js';

/**
 * Structured logging. Anything that could carry a credential (passwords,
 * session tokens, cookies, authorization headers) is redacted before it is
 * ever written.
 */
export const logger = pino({
  level: env.isTest ? 'silent' : env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      'req.body.password',
      'req.body.newPassword',
      'res.headers["set-cookie"]',
      'password',
      'newPassword',
      'token',
      'passwordHash',
      'password_hash',
    ],
    censor: '[redacted]',
  },
  transport: env.isProduction
    ? undefined
    : { target: 'pino/file', options: { destination: 1 } },
});
