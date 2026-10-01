import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/server-session';
import { AccessDenied } from '@/components/States';
import { LiveClient } from './LiveClient';

export const metadata: Metadata = { title: 'Live' };
export const dynamic = 'force-dynamic';

/** Admin-only; the API returns 403 for anyone else. */
export default async function LivePage() {
  const session = await getServerSession();
  if (!session) redirect('/login?reason=unauthenticated');
  if (session.user.role !== 'ADMIN') return <AccessDenied />;

  return <LiveClient />;
}
