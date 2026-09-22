'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ApiError, api } from '@/lib/api';
import type { SessionResponse } from '@/lib/types';
import { Button } from '@/components/Button';
import { TextField } from '@/components/Field';

const REASON_MESSAGES: Record<string, string> = {
  session_expired: 'Your session expired. Please sign in again.',
  unauthenticated: 'Your session is no longer valid. Please sign in again.',
};

/** Login form (PRD 7.1). Client validation is for convenience only. */
export function LoginForm({ reason, nextPath }: { reason?: string; nextPath?: string }) {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const notice = reason ? REASON_MESSAGES[reason] : undefined;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    setFormError(null);
    setFieldErrors({});

    const errors: Record<string, string> = {};
    if (!username.trim()) errors.username = 'Username is required';
    if (!password) errors.password = 'Password is required';
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      const result = await api.post<SessionResponse>(
        '/auth/login',
        { username: username.trim(), password },
        { skipSessionHandling: true },
      );

      // Only redirect within this app — never to a caller-supplied absolute URL.
      const safeNext =
        nextPath && nextPath.startsWith('/') && !nextPath.startsWith('//') ? nextPath : '/';

      router.replace(result.user.role === 'ADMIN' ? safeNext : safeNext);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError) {
        setFieldErrors(error.fields ?? {});
        setFormError(error.fields ? null : error.message);
      } else {
        setFormError('Something went wrong. Please try again.');
      }
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {notice && (
        <p
          className="rounded-[8px] border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-[var(--color-warning)]"
          role="status"
        >
          {notice}
        </p>
      )}

      {formError && (
        <p
          className="rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-[var(--color-danger)]"
          role="alert"
        >
          {formError}
        </p>
      )}

      <TextField
        label="Username"
        name="username"
        autoComplete="username"
        autoFocus
        required
        value={username}
        onChange={(event) => setUsername(event.target.value)}
        error={fieldErrors.username}
        disabled={submitting}
      />

      <TextField
        label="Password"
        name="password"
        type={showPassword ? 'text' : 'password'}
        autoComplete="current-password"
        required
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        error={fieldErrors.password}
        disabled={submitting}
        trailing={
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="rounded px-2 py-1 text-xs font-semibold text-[var(--color-primary)] hover:bg-blue-50"
            aria-pressed={showPassword}
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        }
      />

      <Button type="submit" loading={submitting} className="mt-1 w-full">
        {submitting ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
