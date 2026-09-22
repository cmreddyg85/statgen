import { env } from '../config/env.js';
import { pool, query } from './pool.js';
import { hashPassword } from '../services/password.service.js';

/**
 * Controlled admin bootstrap (PRD 20): the first administrator is created
 * here, never through public registration.
 *
 * The first password is deliberately the same as the username. It is a
 * single-use credential meant to be replaced from the profile menu at first
 * sign-in, which is why it is allowed to ignore the normal minimum length.
 * Running this again is safe — an existing admin is left untouched.
 */
async function seed(): Promise<void> {
  const username = env.BOOTSTRAP_ADMIN_USERNAME;

  const existing = await query<{ id: string }>(
    `SELECT id FROM users WHERE lower(username) = lower($1)`,
    [username],
  );

  if (existing.rows[0]) {
    console.log(`Admin "${username}" already exists — nothing to do.`);
    return;
  }

  const passwordHash = await hashPassword(username);
  await query(
    `INSERT INTO users (name, username, password_hash, role, active)
     VALUES ($1, $2, $3, 'ADMIN', true)`,
    [env.BOOTSTRAP_ADMIN_NAME, username, passwordHash],
  );

  console.log('\nBootstrap administrator created.');
  console.log(`  username: ${username}`);
  console.log(`  password: ${username}   (same as the username)`);
  console.log(
    '\n  ! This is a first-use credential. Sign in, then change it from the',
  );
  console.log('    profile menu > Change password before anyone else can reach this');
  console.log('    environment.\n');
}

seed()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
