import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/server-session';
import { AccessDenied } from '@/components/States';
import { PaymentsClient } from './PaymentsClient';

export const metadata: Metadata = { title: 'Payments' };
export const dynamic = 'force-dynamic';

/** Admin-only; the API returns 403 for anyone else. */
export default async function PaymentsPage() {
  const session = await getServerSession();
  if (!session) redirect('/login?reason=unauthenticated');
  if (session.user.role !== 'ADMIN') return <AccessDenied />;

  return <PaymentsClient />;
}
