import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card max-w-md px-8 py-10 text-center">
        <p className="text-sm font-semibold text-[var(--color-primary)]">404</p>
        <h1 className="mt-1 text-xl font-bold">Page not found</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          The page you are looking for does not exist or you no longer have access to it.
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex h-10 items-center justify-center rounded-[8px] bg-[var(--color-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)]"
        >
          Back to Home
        </Link>
      </div>
    </main>
  );
}
