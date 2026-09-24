import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/server-session';
import { AccessDenied } from '@/components/States';
import { SbiReportsClient } from './SbiReportsClient';

export const metadata: Metadata = { title: 'SBI' };
export const dynamic = 'force-dynamic';

/**
 * Admin-only screen, gated the same way as Users: the API returns 403 for a
 * non-admin regardless, so this only saves them a broken page.
 */
export default async function SbiPage() {
  const session = await getServerSession();
  if (!session) redirect('/login?reason=unauthenticated');
  if (session.user.role !== 'ADMIN') return <AccessDenied />;

  return <SbiReportsClient />;
}
