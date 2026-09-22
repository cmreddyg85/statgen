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
            className={`flex items-center gap-3 rounded-[8px] px-3 py-2.5 text-sm font-medium transition-colors ${
              active
                ? 'bg-[var(--color-primary)] text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-[var(--color-ink)]'
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
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[256px] flex-col border-r border-[var(--color-line)] bg-white lg:flex">
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
          <aside className="animate-in absolute inset-y-0 left-0 flex w-[264px] flex-col border-r border-[var(--color-line)] bg-white shadow-xl">
            <BrandMark />
            {navigation}
            <FooterNote role={user.role} />
          </aside>
        </div>
      )}

      <div className="lg:pl-[256px]">
        <header className="sticky top-0 z-20 flex h-[64px] items-center gap-3 border-b border-[var(--color-line)] bg-white/95 px-4 backdrop-blur sm:px-6">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={drawerOpen}
            className="-ml-1 rounded-[8px] p-2 text-[var(--color-muted)] transition-colors hover:bg-slate-100 hover:text-[var(--color-ink)] lg:hidden"
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
            <p className="hidden truncate text-xs text-[var(--color-muted)] sm:block">
              {user.role === 'ADMIN' ? 'Administrator' : 'User'} · {user.name}
            </p>
          </div>

          <SessionTimer />
          <ProfileMenu />
        </header>

        <main className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function BrandMark() {
  const appName = process.env.NEXT_PUBLIC_APP_NAME ?? 'Secure Business Portal';
  return (
    <div className="flex h-[64px] shrink-0 items-center gap-2.5 border-b border-[var(--color-line)] px-5">
      <span className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[var(--color-primary)] text-sm font-bold text-white">
        SP
      </span>
      <span className="truncate text-sm font-bold tracking-tight">{appName}</span>
    </div>
  );
}

function FooterNote({ role }: { role: 'ADMIN' | 'USER' }) {
  return (
    <div className="mt-auto border-t border-[var(--color-line)] px-5 py-4">
      <p className="text-[11px] leading-relaxed text-[var(--color-muted)]">
        Sessions end automatically after{' '}
        <span className="font-semibold">{role === 'ADMIN' ? '24 hours' : '15 minutes'}</span>.
      </p>
    </div>
  );
}
