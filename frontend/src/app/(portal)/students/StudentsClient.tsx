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

/** Admin-only: a user is always scoped to active students. */
type StatusFilter = 'active' | 'archived' | 'all';

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
  const [status, setStatus] = useState<StatusFilter>('active');
  const [createdBy, setCreatedBy] = useState('all');
  const [owners, setOwners] = useState<User[]>([]);
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [deleting, setDeleting] = useState<Student | null>(null);
  const [purging, setPurging] = useState<Student | null>(null);
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
            status: isAdmin ? status : undefined,
            createdBy: isAdmin && createdBy !== 'all' ? createdBy : undefined,
          },
        }),
      );
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load students.');
    } finally {
      setLoading(false);
    }
  }, [page, search, status, createdBy, isAdmin]);

  // A new search term starts from the first page again.
  useEffect(() => setPage(1), [search]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Admin only: brings an archived student back into the list. */
  const unarchive = async (student: Student) => {
    setActionPending(student.id);
    try {
      await api.post(`/students/${student.id}/unarchive`);
      toast.success('Student restored.');
      await load();
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : 'Could not restore the student.');
    } finally {
      setActionPending(null);
    }
  };

  /** Admin only: removes the student and everything generated for them. */
  const confirmPurge = async () => {
    if (!purging) return;
    setActionPending(purging.id);
    try {
      await api.delete(`/students/${purging.id}/permanent`);
      toast.success('Student deleted.');
      setPurging(null);
      await load();
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : 'Could not delete the student.');
    } finally {
      setActionPending(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setActionPending(deleting.id);
    try {
      await api.delete(`/students/${deleting.id}`);
      toast.success('Student archived.');
      setDeleting(null);
      await load();
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : 'Could not archive student.');
    } finally {
      setActionPending(null);
    }
  };

  const filtersApplied = search !== '' || status !== 'active' || createdBy !== 'all';

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
          {isAdmin && (
            <SelectField
              label="Status"
              className="w-[160px]"
              value={status}
              onChange={(value) => {
                setStatus(value as StatusFilter);
                setPage(1);
              }}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'archived', label: 'Archived' },
                { value: 'all', label: 'All' },
              ]}
            />
          )}
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
                setStatus('active');
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
                    {isAdmin && status !== 'active' && <th scope="col">Status</th>}
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
                      {isAdmin && status !== 'active' && (
                        <td>
                          {student.archivedAt ? (
                            <Badge tone="neutral">
                              <StatusDot tone="neutral" />
                              Archived
                            </Badge>
                          ) : (
                            <Badge tone="success">
                              <StatusDot tone="success" />
                              Active
                            </Badge>
                          )}
                        </td>
                      )}
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
                          {student.archivedAt ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-[104px]"
                              disabled={!isAdmin}
                              loading={actionPending === student.id}
                              onClick={() => unarchive(student)}
                            >
                              Unarchive
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-[104px] text-[var(--color-danger)] hover:bg-red-50"
                              onClick={() => setDeleting(student)}
                            >
                              Archive
                            </Button>
                          )}
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-[var(--color-danger)] hover:bg-red-50"
                              onClick={() => setPurging(student)}
                            >
                              Delete
                            </Button>
                          )}
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
        title="Archive student"
        message={
          deleting
            ? `Archive ${deleting.name}? The record and everything generated for it are kept, and an administrator can restore it.`
            : ''
        }
        confirmLabel="Archive student"
        loading={actionPending === deleting?.id}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />

      <ConfirmDialog
        open={purging !== null}
        title="Delete student"
        message={
          purging
            ? `Permanently delete ${purging.name}? Every record generated for them, and the statement pages attached to those records, go with it. This cannot be undone — archive instead if you only want them out of the way.`
            : ''
        }
        confirmLabel="Delete permanently"
        loading={actionPending === purging?.id}
        onConfirm={confirmPurge}
        onCancel={() => setPurging(null)}
      />
    </>
  );
}
