'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { navItemsForRole, pageTitleForPath } from '@/lib/navigation';
import { useSession } from '@/lib/session-context';
import { NavIcon } from './Icon';
import { ProfileMenu } from './ProfileMenu';
import { SessionTimer } from './SessionTimer';

/**
 * Shared shell for every authenticated page (PRD 6.3 / 12.2): sidebar on
 * desktop, overlay drawer on small screens, and a top bar that always carries
 * the page title, the session countdown and the profile menu.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user } = useSession();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const items = navItemsForRole(user.role);
  const title = pageTitleForPath(pathname);

  // The drawer is a navigation aid, not state worth keeping across pages.
  useEffect(() => setDrawerOpen(false), [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

  const navigation = (
    <nav className="flex flex-col gap-0.5 px-3 py-4" aria-label="Main">
      {items.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              active
                ? 'bg-primary text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-ink'
            }`}
          >
            <NavIcon name={item.icon} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-surface lg:flex">
        <BrandMark />
        {navigation}
        <FooterNote role={user.role} />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="animate-in absolute inset-y-0 left-0 flex w-66 flex-col border-r border-line bg-surface shadow-xl">
            <BrandMark />
            {navigation}
            <FooterNote role={user.role} />
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur sm:px-6">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={drawerOpen}
            className="-ml-1 rounded-lg p-2 text-muted transition-colors hover:bg-slate-100 hover:text-ink lg:hidden"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M4 7h16M4 12h16M4 17h16"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>

          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold">{title}</p>
            <p className="hidden truncate text-xs text-muted sm:block">
              {user.role === 'ADMIN' ? 'Administrator' : 'User'} · {user.name}
            </p>
          </div>

          <SessionTimer />
          <ThemeToggle />
          <ProfileMenu />
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}

/**
 * Light/dark switch. The theme lives on <html data-theme> (set before paint by
 * the script in the root layout), so the icon swap is plain CSS — no state.
 */
function ThemeToggle() {
  const toggle = () => {
    const root = document.documentElement;
    const dark = root.dataset.theme !== 'dark';
    if (dark) root.dataset.theme = 'dark';
    else delete root.dataset.theme;
    try {
      localStorage.setItem('theme', dark ? 'dark' : 'light');
    } catch {
      // Storage blocked: the theme still applies for this page load.
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle dark mode"
      title="Toggle dark mode"
      className="rounded-lg p-2 text-muted transition-colors hover:bg-slate-100 hover:text-ink"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        {/* Moon in light mode, sun in dark mode: the icon shows what a click gives. */}
        <path
          className="dark:hidden"
          d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path
          className="hidden dark:block"
          d="M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-13v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4m0-12.8L17 7M7 17l-1.4 1.4"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}

function BrandMark() {
  const appName = process.env.NEXT_PUBLIC_APP_NAME ?? 'Secure Business Portal';
  return (
    <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-line px-5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-white">
        SP
      </span>
      <span className="truncate text-sm font-bold tracking-tight">{appName}</span>
    </div>
  );
}

function FooterNote({ role }: { role: 'ADMIN' | 'USER' }) {
  return (
    <div className="mt-auto border-t border-line px-5 py-4">
      <p className="text-[11px] leading-relaxed text-muted">
        Sessions end automatically after{' '}
        <span className="font-semibold">{role === 'ADMIN' ? '24 hours' : '15 minutes'}</span>.
      </p>
    </div>
  );
}
