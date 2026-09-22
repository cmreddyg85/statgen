import { createApp } from './app.js';
import { env } from './config/env.js';
import { checkDatabaseConnection, pool } from './db/pool.js';
import { purgeExpiredSessions } from './services/session.service.js';
import { logger } from './utils/logger.js';

const app = createApp();

const databaseOk = await checkDatabaseConnection();
if (!databaseOk) {
  logger.error('Database is unreachable. Check DATABASE_URL and that PostgreSQL is running.');
  process.exit(1);
}

const server = app.listen(env.PORT, () => {
  logger.info(
    { port: env.PORT, env: env.NODE_ENV },
    `Secure Business Portal API listening on http://localhost:${env.PORT}`,
  );
});

// Housekeeping: clear out long-expired session rows once an hour.
const purgeTimer = setInterval(
  () => {
    purgeExpiredSessions().catch((error) =>
      logger.error({ err: error }, 'Failed to purge expired sessions'),
    );
  },
  60 * 60 * 1000,
);
purgeTimer.unref();

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutting down');
  clearInterval(purgeTimer);
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
