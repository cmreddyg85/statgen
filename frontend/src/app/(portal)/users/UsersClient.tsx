'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ApiError, api } from '@/lib/api';
import { useDebounced } from '@/lib/use-debounced';

import { useSession } from '@/lib/session-context';
import type { Paginated, User, UserListItem } from '@/lib/types';
import { Badge, StatusDot } from '@/components/Badge';
import { DateCell } from '@/components/DateCell';
import { Button } from '@/components/Button';
import { SelectField, TextField } from '@/components/Field';
import { ConfirmDialog } from '@/components/Modal';
import { PageHeader } from '@/components/PageHeader';
import { Pagination } from '@/components/Pagination';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { useToast } from '@/components/Toast';
import { UserAuditDialog } from './UserAuditDialog';
import { UserForm } from './UserForm';

type StatusFilter = 'all' | 'active' | 'inactive';

/** User Management (PRD 7.4 / 12.3). */
export function UsersClient() {
  const toast = useToast();
  const { user: currentUser } = useSession();
  const searchParams = useSearchParams();

  const [data, setData] = useState<Paginated<UserListItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounced(searchInput.trim());
  const [status, setStatus] = useState<StatusFilter>(() => {
    const initial = searchParams.get('status');
    return initial === 'active' || initial === 'inactive' ? initial : 'all';
  });
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [viewingActivity, setViewingActivity] = useState<User | null>(null);
  const [deactivating, setDeactivating] = useState<User | null>(null);
  const [actionPending, setActionPending] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(
        await api.get<Paginated<UserListItem>>('/users', {
          query: {
            page,
            pageSize: 20,
            search: search || undefined,
            status: status === 'all' ? undefined : status,
          },
        }),
      );
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load users.');
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  // A new search term starts from the first page again.
  useEffect(() => setPage(1), [search]);

  useEffect(() => {
    void load();
  }, [load]);

  const activate = async (user: User) => {
    setActionPending(user.id);
    try {
      await api.post(`/users/${user.id}/activate`);
      toast.success(`${user.username} activated.`);
      await load();
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : 'Could not activate user.');
    } finally {
      setActionPending(null);
    }
  };

  const confirmDeactivate = async () => {
    if (!deactivating) return;
    setActionPending(deactivating.id);
    try {
      await api.post(`/users/${deactivating.id}/deactivate`);
      toast.success(`${deactivating.username} deactivated. Active sessions were ended.`);
      setDeactivating(null);
      await load();
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : 'Could not deactivate user.');
    } finally {
      setActionPending(null);
    }
  };

  const filtersApplied = search !== '' || status !== 'all';

  return (
    <>
      <PageHeader
        title="Users"
        description="Create accounts, control access, set passwords and review activity."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            Add user
          </Button>
        }
      />

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-end gap-3 border-b border-[var(--color-line)] px-4 py-3">
          <div className="min-w-[220px] flex-1">
            <TextField
              label="Search"
              placeholder="Name or username"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </div>
          <SelectField
            label="Status"
            className="w-[180px]"
            value={status}
            onChange={(value) => {
              setStatus(value as StatusFilter);
              setPage(1);
            }}
            options={[
              { value: 'all', label: 'All' },
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Inactive' },
            ]}
          />
          {filtersApplied && (
            <Button
              variant="ghost"
              onClick={() => {
                setSearchInput('');
                setStatus('all');
                setPage(1);
              }}
            >
              Clear
            </Button>
          )}
        </div>

        {loading && !data ? (
          <LoadingState label="Loading users…" />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : data && data.items.length === 0 ? (
          <EmptyState
            title={filtersApplied ? 'No matching users' : 'No users yet'}
            message={
              filtersApplied
                ? 'No account matches the current search and filters.'
                : 'Create the first user account to get started.'
            }
            action={
              filtersApplied ? undefined : (
                <Button
                  onClick={() => {
                    setEditing(null);
                    setFormOpen(true);
                  }}
                >
                  Add user
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
                    <th scope="col">Username</th>
                    <th scope="col">Role</th>
                    <th scope="col">Status</th>
                    <th scope="col">Created</th>
                    <th scope="col">Last login</th>
                    <th scope="col">Sessions</th>
                    <th scope="col" className="col-actions text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((user) => {
                    const isSelf = user.id === currentUser.id;
                    return (
                      <tr key={user.id}>
                        <td className="font-medium">
                          {user.name}
                          {isSelf && (
                            <span className="ml-2 text-xs text-[var(--color-muted)]">(you)</span>
                          )}
                        </td>
                        <td className="text-[var(--color-muted)]">{user.username}</td>
                        <td>
                          <Badge tone={user.role === 'ADMIN' ? 'info' : 'neutral'}>
                            {user.role === 'ADMIN' ? 'Administrator' : 'User'}
                          </Badge>
                        </td>
                        <td>
                          {user.active ? (
                            <Badge tone="success">
                              <StatusDot tone="success" />
                              Active
                            </Badge>
                          ) : (
                            <Badge tone="danger">
                              <StatusDot tone="danger" />
                              Inactive
                            </Badge>
                          )}
                        </td>
                        <td>
                          <DateCell value={user.createdAt} />
                        </td>
                        <td>
                          <DateCell value={user.lastLoginAt} />
                        </td>
                        <td className="whitespace-nowrap">
                          {user.activeSessions > 0 ? (
                            <Badge tone="success">
                              <StatusDot tone="success" />
                              {user.activeSessions}
                            </Badge>
                          ) : (
                            <span className="text-[var(--color-muted)]">—</span>
                          )}
                        </td>
                        <td className="col-actions">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditing(user);
                                setFormOpen(true);
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setViewingActivity(user)}
                            >
                              Activity
                            </Button>
                            {user.active ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-[var(--color-danger)] hover:bg-red-50"
                                onClick={() => setDeactivating(user)}
                              >
                                Deactivate
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                loading={actionPending === user.id}
                                onClick={() => activate(user)}
                              >
                                Activate
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
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

      <UserForm
        open={formOpen}
        user={editing}
        onClose={() => setFormOpen(false)}
        onSaved={(message) => {
          setFormOpen(false);
          toast.success(message);
          void load();
        }}
      />

      <UserAuditDialog
        user={viewingActivity}
        onClose={() => setViewingActivity(null)}
      />

      <ConfirmDialog
        open={deactivating !== null}
        title="Deactivate user"
        message={
          deactivating
            ? `Deactivate ${deactivating.username}? They will be signed out immediately and cannot sign in again until reactivated.`
            : ''
        }
        confirmLabel="Deactivate"
        loading={actionPending === deactivating?.id}
        onConfirm={confirmDeactivate}
        onCancel={() => setDeactivating(null)}
      />
    </>
  );
}
