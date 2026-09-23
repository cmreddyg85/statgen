'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { api, applyApiError } from '@/lib/api';
import type { Student } from '@/lib/types';
import { Button } from '@/components/Button';
import { CheckboxField, TextField } from '@/components/Field';
import { Modal } from '@/components/Modal';

interface StudentFormProps {
  open: boolean;
  /** null = create, a record = edit. Create and edit share this component. */
  student: Student | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}

export function StudentForm({ open, student, onClose, onSaved }: StudentFormProps) {
  const isEdit = student !== null;

  const [name, setName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [offerCompany, setOfferCompany] = useState('');
  const [companyVerified, setCompanyVerified] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setName(student?.name ?? '');
    setMobileNumber(student?.mobileNumber ?? '');
    setOfferCompany(student?.offerCompany ?? '');
    setCompanyVerified(student?.companyVerified ?? false);
    setFormError(null);
    setFieldErrors({});
  }, [open, student]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;

    setFormError(null);
    setFieldErrors({});
    setSaving(true);

    try {
      if (isEdit) {
        await api.patch(`/students/${student.id}`, {
          name: name.trim(),
          mobileNumber: mobileNumber.trim(),
          offerCompany: offerCompany.trim(),
        });

        // Verification carries its own audit trail, so it has its own endpoint.
        if (companyVerified !== student.companyVerified) {
          await api.post(
            `/students/${student.id}/${companyVerified ? 'verify-company' : 'unverify-company'}`,
          );
        }
        onSaved('Student updated.');
      } else {
        await api.post('/students', {
          name: name.trim(),
          mobileNumber: mobileNumber.trim(),
          offerCompany: offerCompany.trim(),
          companyVerified,
        });
        onSaved('Student created.');
      }
    } catch (error) {
      applyApiError(error, setFieldErrors, setFormError);
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={isEdit ? 'Edit student' : 'Add student'}
      description={
        isEdit ? 'Update this student record.' : 'Create a new student record.'
      }
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="student-form" loading={saving}>
            {isEdit ? 'Save changes' : 'Create student'}
          </Button>
        </>
      }
    >
      <form id="student-form" onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
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
          label="Mobile number"
          required
          inputMode="tel"
          value={mobileNumber}
          onChange={(event) => setMobileNumber(event.target.value)}
          error={fieldErrors.mobileNumber}
          hint="Digits only are stored; spaces and symbols are removed automatically."
          disabled={saving}
          autoComplete="off"
        />

        <TextField
          label="Offer company"
          value={offerCompany}
          onChange={(event) => setOfferCompany(event.target.value)}
          error={fieldErrors.offerCompany}
          hint="Optional. Up to 150 characters."
          disabled={saving}
          autoComplete="off"
        />

        <CheckboxField
          label="Company verified"
          description="Records who verified the offer company and when."
          checked={companyVerified}
          onChange={(event) => setCompanyVerified(event.target.checked)}
          disabled={saving}
        />
      </form>
    </Modal>
  );
}
