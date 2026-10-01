import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/server-session';
import { AccessDenied } from '@/components/States';
import { SbiReportsClient } from '../sbi/SbiReportsClient';

export const metadata: Metadata = { title: 'IDBI' };
export const dynamic = 'force-dynamic';

/** Admin-only, like the SBI screen; the API returns 403 for anyone else. */
export default async function IdbiPage() {
  const session = await getServerSession();
  if (!session) redirect('/login?reason=unauthenticated');
  if (session.user.role !== 'ADMIN') return <AccessDenied />;

  return <SbiReportsClient bank="IDBI" />;
}
