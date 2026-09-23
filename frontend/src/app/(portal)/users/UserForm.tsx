'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { api, applyApiError } from '@/lib/api';
import type { User } from '@/lib/types';
import { Button } from '@/components/Button';
import { CheckboxField, TextField } from '@/components/Field';
import { Modal } from '@/components/Modal';

interface UserFormProps {
  open: boolean;
  /** null = create. On edit, username is shown read-only: it is immutable. */
  user: User | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}

/**
 * Create and edit share this form. Setting a user's password lives here too:
 * users cannot change their own password in this release, so an administrator
 * does it from this dialog (PRD 7.4 / 20).
 */

export function UserForm({ open, user, onClose, onSaved }: UserFormProps) {
  const isEdit = user !== null;

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setName(user?.name ?? '');
    setUsername(user?.username ?? '');
    setPassword('');
    setActive(user?.active ?? true);
    setFormError(null);
    setFieldErrors({});
  }, [open, user]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;

    setFormError(null);
    setFieldErrors({});
    setSaving(true);

    try {
      if (isEdit) {
        await api.patch(`/users/${user.id}`, { name: name.trim(), active });

        // Optional on edit: a blank field leaves the current password alone.
        if (password) {
          await api.post(`/users/${user.id}/reset-password`, { newPassword: password });
          onSaved(`User updated and password reset for ${user.username}.`);
        } else {
          onSaved('User updated.');
        }
      } else {
        await api.post('/users', { name: name.trim(), username: username.trim(), password, active });
        onSaved('User created.');
      }
    } catch (error) {
      applyApiError(error, setFieldErrors, setFormError);
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={isEdit ? 'Edit user' : 'Add user'}
      description={
        isEdit
          ? 'Update this account, or set a new password. Usernames cannot be changed.'
          : 'New accounts are created with the User role.'
      }
      onClose={onClose}
      width="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="user-form" loading={saving}>
            {isEdit ? 'Save changes' : 'Create user'}
          </Button>
        </>
      }
    >
      <form id="user-form" onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {formError && (
          <p
            className="rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-[var(--color-danger)]"
            role="alert"
          >
            {formError}
          </p>
        )}

        <TextField
          label="Name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={fieldErrors.name}
          disabled={saving}
          autoComplete="off"
        />

        <TextField
          label="Username"
          required={!isEdit}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          error={fieldErrors.username}
          hint={
            isEdit
              ? 'Usernames are immutable so that audit history stays unambiguous.'
              : 'Letters, numbers, dots, underscores and hyphens. Case-insensitively unique.'
          }
          disabled={saving || isEdit}
          readOnly={isEdit}
          autoComplete="off"
        />

        <TextField
          label={isEdit ? 'New password' : 'Password'}
          required={!isEdit}
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={fieldErrors.password ?? fieldErrors.newPassword}
          hint={
            isEdit
              ? 'Leave blank to keep the current password. Setting one signs this user out everywhere.'
              : 'At least 12 characters. Share it with the user through a secure channel.'
          }
          disabled={saving}
          autoComplete="new-password"
        />

        <CheckboxField
          label="Active"
          description="Inactive accounts cannot sign in, and any open session ends immediately."
          checked={active}
          onChange={(event) => setActive(event.target.checked)}
          disabled={saving}
        />
      </form>
    </Modal>
  );
}
