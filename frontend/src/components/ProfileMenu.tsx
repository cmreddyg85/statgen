'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from '@/lib/session-context';
import { initials } from '@/lib/format';
import { Spinner } from './Button';
import { ChangePasswordDialog } from './ChangePasswordDialog';

/** Avatar + dropdown with identity and Logout (PRD 7.7). */
export function ProfileMenu() {
  const { user, isAdmin, logout } = useSession();
  const [open, setOpen] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || changingPassword) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, changingPassword]);

  const handleLogout = async () => {
    setSigningOut(true);
    await logout();
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${user.name}`}
        className="flex items-center gap-2 rounded-full border border-[var(--color-line)] bg-white py-1 pl-1 pr-2.5 transition-colors hover:bg-slate-50"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-primary)] text-[11px] font-bold text-white">
          {initials(user.name)}
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="m6 9 6 6 6-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="animate-in card absolute right-0 top-[calc(100%+8px)] z-40 w-60 overflow-hidden shadow-lg"
        >
          <div className="border-b border-[var(--color-line)] px-4 py-3">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="truncate text-xs text-[var(--color-muted)]">
              {user.username} · {user.role === 'ADMIN' ? 'Administrator' : 'User'}
            </p>
          </div>
          {isAdmin && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setChangingPassword(true);
              }}
              className="flex w-full items-center gap-2 border-b border-[var(--color-line)] px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-slate-50"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect
                  x="4"
                  y="10"
                  width="16"
                  height="10"
                  rx="2"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
                <path d="M8 10V7a4 4 0 1 1 8 0v3" stroke="currentColor" strokeWidth="1.6" />
              </svg>
              Change password
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={handleLogout}
            disabled={signingOut}
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-[var(--color-danger)] transition-colors hover:bg-red-50 disabled:opacity-60"
          >
            {signingOut ? (
              <Spinner />
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M15 16.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1.5M19 12H9m10 0-3-3m3 3-3 3"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
            {signingOut ? 'Signing out…' : 'Logout'}
          </button>
        </div>
      )}

      <ChangePasswordDialog
        open={changingPassword}
        onClose={() => setChangingPassword(false)}
      />
    </div>
  );
}
