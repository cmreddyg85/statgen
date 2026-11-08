import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/server-session';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; next?: string }>;
}) {
  // An already-valid session should never see the login form again.
  const session = await getServerSession();
  if (session) redirect('/');

  const { reason, next } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-105">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-base font-bold text-white">
            SP
          </span>
          <h1 className="text-[22px] font-bold tracking-tight">Welcome back</h1>
          <p className="mt-1 text-sm text-muted">Sign in to continue</p>
        </div>

        <div className="card px-6 py-6 shadow-sm">
          <LoginForm reason={reason} nextPath={next} />
        </div>

        <p className="mt-5 text-center text-xs text-muted">
          Contact your administrator for access.
        </p>
      </div>
    </main>
  );
}
