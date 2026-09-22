import { z } from 'zod';
import { env } from '../config/env.js';

/** Shared field rules from PRD section 14. */
export const nameSchema = z
  .string()
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .max(120, 'Name must be at most 120 characters');

export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters')
  .max(100, 'Username must be at most 100 characters')
  .regex(
    /^[a-zA-Z0-9._-]+$/,
    'Username may only contain letters, numbers, dots, underscores and hyphens',
  );

export const passwordSchema = z
  .string()
  .min(
    env.PASSWORD_MIN_LENGTH,
    `Password must be at least ${env.PASSWORD_MIN_LENGTH} characters`,
  )
  .max(200, 'Password must be at most 200 characters');

/** Strips formatting noise before validating against the configured format. */
export function normalizeMobileNumber(value: string): string {
  return value.replace(/[^\d]/g, '');
}

export const mobileNumberSchema = z
  .string()
  .trim()
  .min(1, 'Mobile number is required')
  .transform(normalizeMobileNumber)
  .refine(
    (value) => env.mobileNumberPattern.test(value),
    'Enter a valid mobile number',
  );

export const offerCompanySchema = z
  .string()
  .trim()
  .max(150, 'Offer company must be at most 150 characters')
  .transform((value) => (value.length === 0 ? null : value))
  .nullable()
  .optional();

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const loginSchema = z.object({
  username: z.string().trim().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export const createUserSchema = z.object({
  name: nameSchema,
  username: usernameSchema,
  password: passwordSchema,
  active: z.boolean().default(true),
});

export const updateUserSchema = z
  .object({
    name: nameSchema.optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update',
  });

export const resetPasswordSchema = z.object({
  newPassword: passwordSchema,
});

/** Admin changing their own password from the profile menu. */
export const changePasswordSchema = z
  .object({
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, 'Please re-enter the new password'),
  })
  // Confirmed server-side too: client-side checks are for convenience only.
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const listUsersQuerySchema = paginationSchema.extend({
  search: z.string().trim().max(120).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  role: z.enum(['ADMIN', 'USER']).optional(),
});

export const createStudentSchema = z.object({
  name: nameSchema,
  mobileNumber: mobileNumberSchema,
  offerCompany: offerCompanySchema,
  companyVerified: z.boolean().default(false),
});

export const updateStudentSchema = z
  .object({
    name: nameSchema.optional(),
    mobileNumber: mobileNumberSchema.optional(),
    offerCompany: offerCompanySchema,
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: 'Provide at least one field to update',
  });

export const listStudentsQuerySchema = paginationSchema.extend({
  search: z.string().trim().max(120).optional(),
  verified: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  // Admin-only filter. A non-admin request is scoped to its own records
  // regardless of what is passed here (see student-access.ts).
  createdBy: z.string().uuid('Invalid user identifier').optional(),
});

export const generateRecordsSchema = z.object({
  module: z.string().trim().min(1, 'Choose a module'),
  count: z.coerce.number().int().min(1).max(50).default(5),
});

export const listRecordsQuerySchema = paginationSchema.extend({
  module: z.string().trim().min(1).optional(),
});

export const uuidParamSchema = z.object({
  id: z.string().uuid('Invalid identifier'),
});
