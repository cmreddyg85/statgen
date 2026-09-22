import { cookies, headers } from 'next/headers';
import type { SessionResponse } from './types';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:4000';
const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME ?? 'app_session';

/**
 * Resolves the session on the server before a protected page renders, so a
 * protected screen is never painted for a request the API would reject.
 * The cookie is forwarded as-is; the API remains the only authority.
 */
export async function getServerSession(): Promise<SessionResponse | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE);
  if (!token) return null;

  const requestHeaders = await headers();

  try {
    const response = await fetch(`${API_ORIGIN}/api/v1/auth/session`, {
      headers: {
        cookie: `${token.name}=${token.value}`,
        'user-agent': requestHeaders.get('user-agent') ?? 'next-server',
        accept: 'application/json',
      },
      cache: 'no-store',
    });

    if (!response.ok) return null;
    return (await response.json()) as SessionResponse;
  } catch {
    // API unreachable — treat as unauthenticated rather than rendering a
    // protected shell we cannot verify.
    return null;
  }
}
