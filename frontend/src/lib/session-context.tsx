'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { api, onSessionInvalid } from './api';
import type { SessionInfo, SessionResponse, User } from './types';

interface SessionContextValue {
  user: User;
  session: SessionInfo;
  isAdmin: boolean;
  /** Re-reads the session from the server (also used after profile changes). */
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({
  initialSession,
  children,
}: {
  initialSession: SessionResponse;
  children: ReactNode;
}) {
  const router = useRouter();
  const [user, setUser] = useState(initialSession.user);
  const [session, setSession] = useState(initialSession.session);
  const endingRef = useRef(false);

  /**
   * One place that ends the session in the browser: clears state and sends
   * the user to Login with a reason. Guarded so several failing requests
   * cannot trigger several redirects.
   */
  const endSession = useCallback(
    (reason: 'session_expired' | 'unauthenticated' | 'signed_out') => {
      if (endingRef.current) return;
      endingRef.current = true;
      const query = reason === 'signed_out' ? '' : `?reason=${reason}`;
      // Replace, so Back cannot return to a protected page after logout.
      window.location.replace(`/login${query}`);
    },
    [],
  );

  useEffect(() => onSessionInvalid((reason) => endSession(reason)), [endSession]);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get<SessionResponse>('/auth/session');
      setUser(data.user);
      setSession(data.session);
    } catch {
      // A 401 is already handled by the api client's listener.
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      endSession('signed_out');
    }
  }, [endSession]);

  /**
   * Re-validate whenever the tab regains focus. Absolute expiry is enforced
   * server-side; this simply makes a revoked or deactivated session surface
   * immediately rather than on the next action.
   */
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  useEffect(() => {
    router.refresh();
  }, [router]);

  const value = useMemo<SessionContextValue>(
    () => ({ user, session, isAdmin: user.role === 'ADMIN', refresh, logout }),
    [user, session, refresh, logout],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used inside the portal layout');
  }
  return context;
}
