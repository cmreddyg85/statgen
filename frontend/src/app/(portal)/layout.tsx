import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { ToastProvider } from '@/components/Toast';
import { SessionProvider } from '@/lib/session-context';
import { getServerSession } from '@/lib/server-session';

// Protected pages are rendered per request and never cached.
export const dynamic = 'force-dynamic';

/**
 * Gate for every authenticated page: the session is validated against the API
 * on the server before any protected markup is produced.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!session) redirect('/login?reason=unauthenticated');

  return (
    <SessionProvider initialSession={session}>
      <ToastProvider>
        <AppShell>{children}</AppShell>
      </ToastProvider>
    </SessionProvider>
  );
}
