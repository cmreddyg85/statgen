import type { Role } from './types';

export interface NavItem {
  label: string;
  href: string;
  roles: Role[];
  description: string;
  icon: 'home' | 'bank' | 'wallet' | 'mail' | 'students' | 'users';
}

/**
 * Single source of truth for navigation. Hiding a menu item is a usability
 * measure only — the API enforces the same roles independently.
 *
 * The business modules (SBI, IDBI, HDFC, PF, Gmail) are not destinations of
 * their own: a module is chosen from the dropdown on a student's Generate
 * screen.
 */
export const NAV_ITEMS: NavItem[] = [
  {
    label: 'Home',
    href: '/',
    roles: ['ADMIN', 'USER'],
    description: 'Your landing dashboard',
    icon: 'home',
  },
  {
    label: 'Students',
    href: '/students',
    roles: ['ADMIN', 'USER'],
    description: 'Student records and company verification',
    icon: 'students',
  },
  {
    label: 'Users',
    href: '/users',
    roles: ['ADMIN'],
    description: 'Manage portal accounts',
    icon: 'users',
  },
];

export function navItemsForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}

export function pageTitleForPath(pathname: string): string {
  const match = NAV_ITEMS.find((item) =>
    item.href === '/' ? pathname === '/' : pathname.startsWith(item.href),
  );
  return match?.label ?? 'Portal';
}
