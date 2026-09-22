import type { Metadata } from 'next';
import { getServerSession } from '@/lib/server-session';
import { AccessDenied } from '@/components/States';
import { UsersClient } from './UsersClient';

export const metadata: Metadata = { title: 'Users' };
export const dynamic = 'force-dynamic';

/**
 * Admin-only screen. The check here keeps a non-admin from ever seeing the
 * page; the API independently returns 403 for the same reason, so hiding the
 * UI is convenience rather than the control itself (PRD 13.4).
 */
export default async function UsersPage() {
  const session = await getServerSession();
  if (session!.user.role !== 'ADMIN') return <AccessDenied />;

  return <UsersClient />;
}
