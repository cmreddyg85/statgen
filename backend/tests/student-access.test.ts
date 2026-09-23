import { describe, expect, it } from 'vitest';
import { canAccessStudent, listScopeFor } from '../src/services/student-access.js';
import type { Role, StudentRecord, UserRecord } from '../src/types.js';

const ADMIN_ID = '00000000-0000-0000-0000-0000000000a1';
const USER_ID = '00000000-0000-0000-0000-0000000000u1'.replace(/u/g, '1');
const OTHER_USER_ID = '00000000-0000-0000-0000-0000000000b2';

function user(role: Role, id: string): UserRecord {
  return {
    id,
    name: role === 'ADMIN' ? 'Admin Person' : 'Regular Person',
    username: role === 'ADMIN' ? 'admin' : 'regular',
    role,
    active: true,
    lastLoginAt: null,
    createdAt: '2026-09-22T10:00:00.000Z',
    updatedAt: '2026-09-22T10:00:00.000Z',
  };
}

function student(createdBy: string): StudentRecord {
  return {
    id: '00000000-0000-0000-0000-0000000000s1'.replace(/s/g, '5'),
    name: 'Asha Menon',
    mobileNumber: '9876543210',
    offerCompany: 'Acme Corp',
    createdBy,
    createdByName: 'Regular Person',
    createdAt: '2026-09-22T10:00:00.000Z',
    updatedAt: '2026-09-22T10:00:00.000Z',
    archivedAt: null,
  };
}

describe('list scope', () => {
  it('pins a user to their own records', () => {
    expect(listScopeFor(user('USER', USER_ID))).toBe(USER_ID);
  });

  it('ignores a createdBy filter supplied by a user', () => {
    // A user cannot widen or redirect their view by passing the parameter.
    expect(listScopeFor(user('USER', USER_ID), OTHER_USER_ID)).toBe(USER_ID);
    expect(listScopeFor(user('USER', USER_ID), ADMIN_ID)).toBe(USER_ID);
  });

  it('gives an admin every record by default', () => {
    expect(listScopeFor(user('ADMIN', ADMIN_ID))).toBeUndefined();
  });

  it('lets an admin narrow the list to one owner', () => {
    expect(listScopeFor(user('ADMIN', ADMIN_ID), USER_ID)).toBe(USER_ID);
  });
});

describe('record access', () => {
  it('lets a user open their own record', () => {
    expect(canAccessStudent(user('USER', USER_ID), student(USER_ID))).toBe(true);
  });

  it('refuses a user another owner’s record', () => {
    expect(canAccessStudent(user('USER', USER_ID), student(OTHER_USER_ID))).toBe(false);
  });

  it('lets an admin open any record', () => {
    expect(canAccessStudent(user('ADMIN', ADMIN_ID), student(USER_ID))).toBe(true);
    expect(canAccessStudent(user('ADMIN', ADMIN_ID), student(OTHER_USER_ID))).toBe(true);
    expect(canAccessStudent(user('ADMIN', ADMIN_ID), student(ADMIN_ID))).toBe(true);
  });
});
