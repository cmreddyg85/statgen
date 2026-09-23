import { z } from 'zod';

/**
 * Every environment value the API depends on is declared here and validated at
 * boot. `.env` is loaded by node's own --env-file-if-exists flag (see the npm
 * scripts), so real environment variables alone are enough in production. The process refuses to start with an invalid configuration so that a
 * misconfigured deployment fails loudly instead of running insecurely.
 */
const booleanish = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_SSL: booleanish.default('false'),

  SESSION_COOKIE_NAME: z.string().min(1).default('app_session'),
  SESSION_SECRET_OR_PEPPER: z
    .string()
    .min(32, 'SESSION_SECRET_OR_PEPPER must be at least 32 characters'),
  SESSION_TTL_USER_MINUTES: z.coerce.number().int().positive().default(15),
  SESSION_TTL_ADMIN_HOURS: z.coerce.number().int().positive().default(24),
  CSRF_COOKIE_NAME: z.string().min(1).default('app_csrf'),

  ALLOWED_ORIGINS: z.string().default(''),

  COOKIE_SECURE: z.enum(['auto', 'true', 'false']).default('auto'),
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  LOGIN_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
  LOGIN_RATE_LIMIT_MAX_ATTEMPTS: z.coerce.number().int().positive().default(10),
  PASSWORD_MIN_LENGTH: z.coerce.number().int().min(3).default(3),
  MOBILE_NUMBER_REGEX: z.string().default('^[0-9]{10,15}$'),

  BOOTSTRAP_ADMIN_NAME: z.string().default('Platform Administrator'),
  BOOTSTRAP_ADMIN_USERNAME: z.string().default('admin'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  // eslint-disable-next-line no-console
  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

const raw = parsed.data;

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  isTest: raw.NODE_ENV === 'test',
  allowedOrigins: raw.ALLOWED_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  cookieSecure:
    raw.COOKIE_SECURE === 'auto'
      ? raw.NODE_ENV === 'production'
      : raw.COOKIE_SECURE === 'true',
  mobileNumberPattern: new RegExp(raw.MOBILE_NUMBER_REGEX),
};

export type Env = typeof env;
