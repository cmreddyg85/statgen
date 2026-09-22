'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, api } from '@/lib/api';
import { Button } from './Button';
import { TextField } from './Field';
import { Modal } from './Modal';
import { useToast } from './Toast';

/**
 * Lets an administrator change their own password (admin-only; the API
 * enforces the same restriction). Other sessions for the account are signed
 * out by the server, while this one stays active.
 */
export function ChangePasswordDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setNewPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setFormError(null);
    setFieldErrors({});
  }, [open]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;

    setFormError(null);
    setFieldErrors({});

    if (newPassword !== confirmPassword) {
      setFieldErrors({ confirmPassword: 'Passwords do not match' });
      return;
    }

    setSaving(true);
    try {
      const result = await api.post<{ revokedSessions: number }>('/auth/change-password', {
        newPassword,
        confirmPassword,
      });
      toast.success(
        result.revokedSessions > 0
          ? `Password updated. ${result.revokedSessions} other session${
              result.revokedSessions === 1 ? ' was' : 's were'
            } signed out.`
          : 'Password updated.',
      );
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        setFieldErrors(error.fields ?? {});
        setFormError(error.fields ? null : error.message);
      } else {
        setFormError('Something went wrong. Please try again.');
      }
      setSaving(false);
      return;
    }
    setSaving(false);
  };

  const toggleVisibility = (
    <button
      type="button"
      onClick={() => setShowPassword((value) => !value)}
      className="rounded px-2 py-1 text-xs font-semibold text-[var(--color-primary)] hover:bg-blue-50"
      aria-pressed={showPassword}
    >
      {showPassword ? 'Hide' : 'Show'}
    </button>
  );

  return (
    <Modal
      open={open}
      title="Change password"
      description="Set a new password for your administrator account."
      onClose={onClose}
      width="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="change-password-form" loading={saving}>
            Update
          </Button>
        </>
      }
    >
      <form
        id="change-password-form"
        onSubmit={handleSubmit}
        noValidate
        className="flex flex-col gap-4"
      >
        {formError && (
          <p
            className="rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-[var(--color-danger)]"
            role="alert"
          >
            {formError}
          </p>
        )}

        <p className="rounded-[8px] border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-[var(--color-warning)]">
          Any other devices signed in as you will be signed out. This session stays active.
        </p>

        <TextField
          label="New password"
          required
          autoFocus
          type={showPassword ? 'text' : 'password'}
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          error={fieldErrors.newPassword}
          hint="At least 12 characters."
          disabled={saving}
          autoComplete="new-password"
          trailing={toggleVisibility}
        />

        <TextField
          label="Re-enter new password"
          required
          type={showPassword ? 'text' : 'password'}
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          error={fieldErrors.confirmPassword}
          disabled={saving}
          autoComplete="new-password"
        />
      </form>
    </Modal>
  );
}
