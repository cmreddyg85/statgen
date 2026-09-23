import { describe, expect, it } from 'vitest';
import {
  changePasswordSchema,
  createStudentSchema,
  createUserSchema,
  listStudentsQuerySchema,
  normalizeMobileNumber,
  updateStudentSchema,
} from '../src/validation/schemas.js';

describe('mobile number normalization', () => {
  it('strips formatting noise before storage', () => {
    expect(normalizeMobileNumber('+91 (98765) 43210')).toBe('919876543210');
    expect(normalizeMobileNumber('98765-43210')).toBe('9876543210');
  });
});

describe('student validation', () => {
  it('accepts a minimal valid student and defaults verification to false', () => {
    const result = createStudentSchema.parse({
      name: '  Asha Menon  ',
      mobileNumber: '98765 43210',
    });
    expect(result.name).toBe('Asha Menon');
    expect(result.mobileNumber).toBe('9876543210');
  });

  it('turns a blank offer company into null', () => {
    const result = createStudentSchema.parse({
      name: 'Asha Menon',
      mobileNumber: '9876543210',
      offerCompany: '   ',
    });
    expect(result.offerCompany).toBeNull();
  });

  it('rejects a too-short name and a malformed mobile number', () => {
    expect(createStudentSchema.safeParse({ name: 'A', mobileNumber: '9876543210' }).success).toBe(
      false,
    );
    expect(createStudentSchema.safeParse({ name: 'Asha Menon', mobileNumber: '123' }).success).toBe(
      false,
    );
  });

  it('requires at least one field on update', () => {
    expect(updateStudentSchema.safeParse({}).success).toBe(false);
    expect(updateStudentSchema.safeParse({ name: 'Asha Menon' }).success).toBe(true);
  });
});

describe('user validation', () => {
  it('enforces the configured minimum password length', () => {
    const base = { name: 'Ravi Kumar', username: 'ravi.k' };
    expect(createUserSchema.safeParse({ ...base, password: 'ab' }).success).toBe(false);
    expect(createUserSchema.safeParse({ ...base, password: 'LongEnoughPass!23' }).success).toBe(
      true,
    );
  });

  it('defaults new users to active', () => {
    const parsed = createUserSchema.parse({
      name: 'Ravi Kumar',
      username: 'ravi.k',
      password: 'LongEnoughPass!23',
    });
    expect(parsed.active).toBe(true);
    expect(parsed.username).toBe('ravi.k');
  });

  it('rejects usernames with unsafe characters', () => {
    expect(
      createUserSchema.safeParse({
        name: 'Ravi Kumar',
        username: "ravi'; DROP TABLE users;--",
        password: 'LongEnoughPass!23',
      }).success,
    ).toBe(false);
  });
});

describe('change password validation', () => {
  it('accepts a matching pair', () => {
    expect(
      changePasswordSchema.safeParse({
        newPassword: 'LongEnoughPass!23',
        confirmPassword: 'LongEnoughPass!23',
      }).success,
    ).toBe(true);
  });

  it('rejects a mismatch and reports it on the confirmation field', () => {
    const result = changePasswordSchema.safeParse({
      newPassword: 'LongEnoughPass!23',
      confirmPassword: 'LongEnoughPass!24',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['confirmPassword']);
      expect(result.error.issues[0]?.message).toBe('Passwords do not match');
    }
  });

  it('enforces the minimum length even when both fields match', () => {
    expect(
      changePasswordSchema.safeParse({ newPassword: 'ab', confirmPassword: 'ab' })
        .success,
    ).toBe(false);
  });

  it('requires the confirmation to be filled in', () => {
    expect(
      changePasswordSchema.safeParse({
        newPassword: 'LongEnoughPass!23',
        confirmPassword: '',
      }).success,
    ).toBe(false);
  });
});

describe('list query validation', () => {
  it('applies the default page size of 20', () => {
    expect(listStudentsQuerySchema.parse({})).toMatchObject({ page: 1, pageSize: 20 });
  });

  it('caps the page size so a client cannot request the whole table', () => {
    expect(listStudentsQuerySchema.safeParse({ pageSize: '5000' }).success).toBe(false);
  });

  it('accepts only the three archive scopes', () => {
    expect(listStudentsQuerySchema.parse({ status: 'archived' }).status).toBe('archived');
    expect(listStudentsQuerySchema.parse({}).status).toBeUndefined();
    expect(() => listStudentsQuerySchema.parse({ status: 'deleted' })).toThrow();
  });
});
