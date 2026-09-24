import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/server-session';
import { AdminDashboard } from './home/AdminDashboard';
import { UserDashboard } from './home/UserDashboard';

export const dynamic = 'force-dynamic';

/** Home resolves to the dashboard that matches the signed-in role (PRD 7.2/7.3). */
export default async function HomePage() {
  const session = await getServerSession();
  // The layout redirects too, but it renders alongside this page rather than
  // before it, so an expired session would reach the line below.
  if (!session) redirect('/login?reason=unauthenticated');
  const user = session.user;

  return user.role === 'ADMIN' ? <AdminDashboard /> : <UserDashboard name={user.name} />;
}
