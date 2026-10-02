import type { Role } from "./types";

export interface NavItem {
  label: string;
  href: string;
  roles: Role[];
  icon: "home" | "students" | "users" | "sbi" | "payments" | "live";
}

/**
 * Single source of truth for navigation. Hiding a menu item is a usability
 * measure only — the API enforces the same roles independently.
 *
 * A student's records pick their bank from the dropdown on the Generate
 * screen; the SBI and IDBI items are the admin-only standalone reports.
 */
export const NAV_ITEMS: NavItem[] = [
  {
    label: "Home",
    href: "/",
    roles: ["ADMIN", "USER"],
    icon: "home",
  },
  {
    label: "Users",
    href: "/users",
    roles: ["ADMIN"],
    icon: "users",
  },
  {
    label: "Students",
    href: "/students",
    roles: ["ADMIN", "USER"],
    icon: "students",
  },
  {
    label: "SBI",
    href: "/sbi",
    roles: ["ADMIN"],
    icon: "sbi",
  },
  {
    label: "IDBI",
    href: "/idbi",
    roles: ["ADMIN"],
    icon: "sbi",
  },
  {
    label: "Payments",
    href: "/payments",
    roles: ["ADMIN"],
    icon: "payments",
  },
  {
    label: "Live",
    href: "/live",
    roles: ["ADMIN"],
    icon: "live",
  },
];

export function navItemsForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}

export function pageTitleForPath(pathname: string): string {
  const match = NAV_ITEMS.find((item) =>
    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href),
  );
  return match?.label ?? "Portal";
}
