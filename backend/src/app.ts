import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './config/env.js';
import { csrfProtection } from './middleware/csrf.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { apiRateLimiter } from './middleware/rate-limit.js';
import { requestContext } from './middleware/request-context.js';
import { authRouter } from './routes/auth.routes.js';
import { healthRouter } from './routes/health.routes.js';
import { modulesRouter } from './routes/modules.routes.js';
import { studentsRouter } from './routes/students.routes.js';
import { usersRouter } from './routes/users.routes.js';
import { logger } from './utils/logger.js';
import { AppError } from './utils/errors.js';

export function createApp(): Express {
  const app = express();

  // Behind the reverse proxy the real client IP arrives in X-Forwarded-For;
  // rate limiting and audit records depend on it being correct.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // The API serves JSON only; a strict CSP belongs to the web tier.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-site' },
      hsts: env.isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    }),
  );

  app.use(requestContext);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as express.Request).id,
      autoLogging: { ignore: (req) => req.url?.startsWith('/health') ?? false },
      customLogLevel: (_req, res, err) =>
        err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
    }),
  );

  /**
   * Production is same-origin (Next.js reverse-proxies /api), so CORS is only
   * configured for local cross-origin development, always against an explicit
   * allowlist — never a wildcard with credentials (PRD 13.3).
   */
  if (env.allowedOrigins.length > 0) {
    app.use(
      cors({
        origin: (origin, callback) => {
          if (!origin || env.allowedOrigins.includes(origin)) {
            callback(null, true);
            return;
          }
          callback(new AppError(403, 'FORBIDDEN', 'Origin is not allowed.'));
        },
        credentials: true,
        allowedHeaders: ['Content-Type', 'x-csrf-token', 'x-request-id'],
      }),
    );
  }

  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(csrfProtection);

  app.use('/health', healthRouter);

  const api = express.Router();
  api.use(apiRateLimiter);
  api.use('/auth', authRouter);
  api.use('/users', usersRouter);
  api.use('/students', studentsRouter);
  api.use('/modules', modulesRouter);
  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
