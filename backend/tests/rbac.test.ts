import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { requireRole } from '../src/middleware/auth.js';
import { AppError } from '../src/utils/errors.js';
import type { RequestActor, Role } from '../src/types.js';

vi.mock('../src/services/audit.service.js', () => ({ recordAudit: vi.fn() }));

function actorWithRole(role: Role): RequestActor {
  return {
    user: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Test Person',
      username: 'test',
      role,
      active: true,
      lastLoginAt: null,
      createdAt: '2026-09-22T10:00:00.000Z',
      updatedAt: '2026-09-22T10:00:00.000Z',
    },
    session: {
      id: '00000000-0000-0000-0000-000000000002',
      userId: '00000000-0000-0000-0000-000000000001',
      createdAt: '2026-09-22T10:00:00.000Z',
      expiresAt: '2026-09-22T10:15:00.000Z',
    },
    ipAddress: '127.0.0.1',
    userAgent: 'vitest',
  };
}

async function run(role: Role | null, allowed: Role[]): Promise<unknown> {
  const req = {
    actor: role ? actorWithRole(role) : undefined,
    method: 'GET',
    originalUrl: '/api/v1/users',
  } as unknown as Request;
  const next = vi.fn() as unknown as NextFunction;
  await requireRole(...allowed)(req, {} as Response, next);
  return (next as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
}

describe('requireRole', () => {
  it('lets an admin into an admin-only route', async () => {
    expect(await run('ADMIN', ['ADMIN'])).toBeUndefined();
  });

  it('returns 403 when a user calls an admin-only route directly', async () => {
    const error = await run('USER', ['ADMIN']);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).status).toBe(403);
    expect((error as AppError).code).toBe('FORBIDDEN');
  });

  it('lets both roles into a shared route', async () => {
    expect(await run('USER', ['ADMIN', 'USER'])).toBeUndefined();
    expect(await run('ADMIN', ['ADMIN', 'USER'])).toBeUndefined();
  });

  it('returns 401 when there is no authenticated actor', async () => {
    const error = await run(null, ['ADMIN', 'USER']);
    expect((error as AppError).status).toBe(401);
  });
});
