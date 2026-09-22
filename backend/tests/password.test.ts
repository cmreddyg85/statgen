import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/services/password.service.js';

describe('password hashing', () => {
  it('produces an argon2id hash that never contains the password', async () => {
    const hash = await hashPassword('CorrectHorseBattery1!');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(hash).not.toContain('CorrectHorseBattery1!');
  });

  it('salts each hash independently', async () => {
    const [a, b] = await Promise.all([
      hashPassword('CorrectHorseBattery1!'),
      hashPassword('CorrectHorseBattery1!'),
    ]);
    expect(a).not.toBe(b);
  });

  it('verifies the right password and rejects the wrong one', async () => {
    const hash = await hashPassword('CorrectHorseBattery1!');
    await expect(verifyPassword(hash, 'CorrectHorseBattery1!')).resolves.toBe(true);
    await expect(verifyPassword(hash, 'correcthorsebattery1!')).resolves.toBe(false);
  });

  it('rejects rather than throws on a malformed stored hash', async () => {
    await expect(verifyPassword('not-a-hash', 'whatever')).resolves.toBe(false);
  });
});
