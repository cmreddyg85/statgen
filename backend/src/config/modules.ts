import type { Role } from '../types.js';

/**
 * The business modules a student record can be generated against.
 *
 * These no longer have their own pages: a module is chosen from the dropdown
 * on a student's Generate screen. The registry stays the single source of
 * truth for the list, its labels and who may use it.
 */
export interface ModuleDefinition {
  key: ModuleKey;
  label: string;
  description: string;
  roles: Role[];
}

export const MODULE_KEYS = ['sbi', 'idbi', 'hdfc', 'pf', 'gmail'] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

export const MODULE_DEFINITIONS: ModuleDefinition[] = [
  {
    key: 'sbi',
    label: 'SBI',
    description: 'State Bank of India',
    roles: ['ADMIN', 'USER'],
  },
  {
    key: 'idbi',
    label: 'IDBI',
    description: 'IDBI Bank',
    roles: ['ADMIN', 'USER'],
  },
  {
    key: 'hdfc',
    label: 'HDFC',
    description: 'HDFC Bank',
    roles: ['ADMIN', 'USER'],
  },
  {
    key: 'pf',
    label: 'PF',
    description: 'Provident Fund',
    roles: ['ADMIN', 'USER'],
  },
  {
    key: 'gmail',
    label: 'Gmail',
    description: 'Shared business inbox',
    roles: ['ADMIN', 'USER'],
  },
];

export function findModule(key: string): ModuleDefinition | undefined {
  return MODULE_DEFINITIONS.find((module) => module.key === key);
}

export function modulesForRole(role: Role): ModuleDefinition[] {
  return MODULE_DEFINITIONS.filter((module) => module.roles.includes(role));
}
