'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useDebounced } from '@/lib/use-debounced';
import { formatMobile } from '@/lib/format';
import { useSession } from '@/lib/session-context';
import type { Paginated, Student, User } from '@/lib/types';
import { Badge, StatusDot } from '@/components/Badge';
import { DateCell } from '@/components/DateCell';
import { Button } from '@/components/Button';
import { SelectField, TextField } from '@/components/Field';
import { ConfirmDialog } from '@/components/Modal';
import { PageHeader } from '@/components/PageHeader';
import { Pagination } from '@/components/Pagination';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { useToast } from '@/components/Toast';
import { StudentForm } from './StudentForm';

type VerificationFilter = 'all' | 'verified' | 'unverified';

/**
 * Table-first Students screen (PRD 12.4).
 *
 * A user sees only the records they created; an admin sees every record and
 * can additionally filter by who created it. The API enforces the same scope,
 * so this is presentation, not the control itself.
 */
export function StudentsClient() {
  const toast = useToast();
  const { isAdmin } = useSession();

  const [data, setData] = useState<Paginated<Student> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounced(searchInput.trim());
  const [verification, setVerification] = useState<VerificationFilter>('all');
  const [createdBy, setCreatedBy] = useState('all');
  const [owners, setOwners] = useState<User[]>([]);
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [deleting, setDeleting] = useState<Student | null>(null);
  const [actionPending, setActionPending] = useState<string | null>(null);

  // Only an admin can filter by owner, and only an admin may call /users.
  useEffect(() => {
    if (!isAdmin) return;
    api
      .get<Paginated<User>>('/users', { query: { page: 1, pageSize: 100 } })
      .then((result) => setOwners(result.items))
      .catch(() => setOwners([]));
  }, [isAdmin]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(
        await api.get<Paginated<Student>>('/students', {
          query: {
            page,
            pageSize: 20,
            search: search || undefined,
            verified: verification === 'all' ? undefined : String(verification === 'verified'),
            createdBy: isAdmin && createdBy !== 'all' ? createdBy : undefined,
          },
        }),
      );
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load students.');
    } finally {
      setLoading(false);
    }
  }, [page, search, verification, createdBy, isAdmin]);

  // A new search term starts from the first page again.
  useEffect(() => setPage(1), [search]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleVerification = async (student: Student) => {
    setActionPending(student.id);
    try {
      await api.post(
        `/students/${student.id}/${student.companyVerified ? 'unverify-company' : 'verify-company'}`,
      );
      toast.success(
        student.companyVerified ? 'Company marked unverified.' : 'Company verified.',
      );
      await load();
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : 'Could not update verification.');
    } finally {
      setActionPending(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setActionPending(deleting.id);
    try {
      await api.delete(`/students/${deleting.id}`);
      toast.success('Student deleted.');
      setDeleting(null);
      await load();
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : 'Could not delete student.');
    } finally {
      setActionPending(null);
    }
  };

  const filtersApplied = search !== '' || verification !== 'all' || createdBy !== 'all';

  return (
    <>
      <PageHeader
        title="Students"
        description={
          isAdmin
            ? 'Every student record, across all users.'
            : 'Student records you have created.'
        }
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            Add student
          </Button>
        }
      />

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-end gap-3 border-b border-[var(--color-line)] px-4 py-3">
          <div className="min-w-[220px] flex-1">
            <TextField
              label="Search"
              placeholder="Name, mobile or company"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </div>
          <SelectField
            label="Verification"
            className="w-[180px]"
            value={verification}
            onChange={(value) => {
              setVerification(value as VerificationFilter);
              setPage(1);
            }}
            options={[
              { value: 'all', label: 'All' },
              { value: 'verified', label: 'Verified' },
              { value: 'unverified', label: 'Unverified' },
            ]}
          />
          {isAdmin && (
            <SelectField
              label="Created by"
              className="w-[200px]"
              value={createdBy}
              onChange={(value) => {
                setCreatedBy(value);
                setPage(1);
              }}
              options={[
                { value: 'all', label: 'Anyone' },
                ...owners.map((owner) => ({
                  value: owner.id,
                  label: `${owner.name} (${owner.username})`,
                })),
              ]}
            />
          )}
          {filtersApplied && (
            <Button
              variant="ghost"
              onClick={() => {
                setSearchInput('');
                setVerification('all');
                setCreatedBy('all');
                setPage(1);
              }}
            >
              Clear
            </Button>
          )}
        </div>

        {loading && !data ? (
          <LoadingState label="Loading students…" />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : data && data.items.length === 0 ? (
          <EmptyState
            title={filtersApplied ? 'No matching students' : 'No students yet'}
            message={
              filtersApplied
                ? 'No student matches the current search and filters.'
                : isAdmin
                  ? 'No student records exist yet. Add the first one to get started.'
                  : 'You have not added any students yet. Add your first record to get started.'
            }
            action={
              filtersApplied ? undefined : (
                <Button
                  onClick={() => {
                    setEditing(null);
                    setFormOpen(true);
                  }}
                >
                  Add student
                </Button>
              )
            }
          />
        ) : data ? (
          <>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Mobile</th>
                    <th scope="col">Offer company</th>
                    <th scope="col">Verification</th>
                    {isAdmin && <th scope="col">Created by</th>}
                    <th scope="col">Created</th>
                    <th scope="col" className="col-actions text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((student) => (
                    <tr key={student.id}>
                      <td className="font-medium">
                        <Link
                          href={`/students/${student.id}`}
                          className="text-[var(--color-primary)] hover:underline"
                        >
                          {student.name}
                        </Link>
                      </td>
                      <td className="tabular-nums">{formatMobile(student.mobileNumber)}</td>
                      <td>{student.offerCompany ?? <span className="text-[var(--color-muted)]">—</span>}</td>
                      <td>
                        {student.companyVerified ? (
                          <Badge tone="success">
                            <StatusDot tone="success" />
                            Verified
                          </Badge>
                        ) : (
                          <Badge tone="neutral">
                            <StatusDot tone="neutral" />
                            Unverified
                          </Badge>
                        )}
                      </td>
                      {isAdmin && (
                        <td className="text-[var(--color-muted)]">
                          {student.createdByName ?? '—'}
                        </td>
                      )}
                      <td>
                        <DateCell value={student.createdAt} />
                      </td>
                      <td className="col-actions">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditing(student);
                              setFormOpen(true);
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            loading={actionPending === student.id}
                            onClick={() => toggleVerification(student)}
                          >
                            {student.companyVerified ? 'Unverify' : 'Verify'}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-[var(--color-danger)] hover:bg-red-50"
                            onClick={() => setDeleting(student)}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              page={data.page}
              pageSize={data.pageSize}
              total={data.total}
              totalPages={data.totalPages}
              onPageChange={setPage}
            />
          </>
        ) : null}
      </div>

      <StudentForm
        open={formOpen}
        student={editing}
        onClose={() => setFormOpen(false)}
        onSaved={(message) => {
          setFormOpen(false);
          toast.success(message);
          void load();
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="Delete student"
        message={
          deleting
            ? `Delete ${deleting.name}? The record is archived rather than erased, and can be restored by an administrator.`
            : ''
        }
        confirmLabel="Delete student"
        loading={actionPending === deleting?.id}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}
