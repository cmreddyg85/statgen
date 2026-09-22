import { hash, verify } from '@node-rs/argon2';
import { env } from '../config/env.js';

/**
 * Argon2id parameters: 19 MiB memory, 2 passes, 1 lane — the OWASP baseline
 * recommendation. The configured pepper is mixed in as a secret so that a
 * stolen database dump alone is not enough to mount an offline attack.
 */
const ARGON2_OPTIONS = {
  algorithm: 2 as const, // Argon2id
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  secret: Buffer.from(env.SESSION_SECRET_OR_PEPPER, 'utf8'),
};

export async function hashPassword(plainPassword: string): Promise<string> {
  return hash(plainPassword, ARGON2_OPTIONS);
}

export async function verifyPassword(
  passwordHash: string,
  plainPassword: string,
): Promise<boolean> {
  try {
    return await verify(passwordHash, plainPassword, ARGON2_OPTIONS);
  } catch {
    // A malformed or truncated hash must read as "wrong password", never as a 500.
    return false;
  }
}
