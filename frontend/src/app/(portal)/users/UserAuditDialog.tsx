'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { formatDateTime, formatRelative, humanizeAction } from '@/lib/format';
import type { User, UserAuditPage } from '@/lib/types';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Modal } from '@/components/Modal';
import { Pagination } from '@/components/Pagination';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';

/**
 * Per-user activity timeline (admin only). Shows both what the user did and
 * what administrators did to their account, newest first.
 */
export function UserAuditDialog({
  user,
  onClose,
}: {
  user: User | null;
  onClose: () => void;
}) {
  const [data, setData] = useState<UserAuditPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  // Start each visit at the newest page.
  useEffect(() => {
    if (user) setPage(1);
  }, [user]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      setData(
        await api.get<UserAuditPage>(`/users/${user.id}/audit`, {
          query: { page, pageSize: 10 },
        }),
      );
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load activity.');
    } finally {
      setLoading(false);
    }
  }, [user, page]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Modal
      open={user !== null}
      title="Account activity"
      description={
        user ? `Audit history for ${user.name} (${user.username}).` : ''
      }
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="-mx-6 -my-5">
        {loading && !data ? (
          <LoadingState label="Loading activity…" />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : data && data.items.length === 0 ? (
          <EmptyState
            title="No activity recorded"
            message="Nothing has been logged for this account yet."
          />
        ) : data ? (
          <>
            <ul className="max-h-[50vh] divide-y divide-[#e2e8f0] overflow-y-auto">
              {data.items.map((entry) => (
                <li key={entry.id} className="flex items-start gap-3 px-6 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-semibold">
                        {humanizeAction(entry.action)}
                      </span>
                      {entry.action.includes('FAILURE') && (
                        <Badge tone="danger">Failed</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                      {/* Who performed it: the user themselves, or an admin acting on them. */}
                      by {entry.userName ?? 'System'}
                      {entry.entityType ? ` · ${entry.entityType}` : ''}
                      {entry.ipAddress ? ` · ${entry.ipAddress}` : ''}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-[var(--color-muted)]">
                      {formatRelative(entry.createdAt)}
                    </p>
                    <p className="text-[11px] text-[var(--color-muted)]">
                      {formatDateTime(entry.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

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
    </Modal>
  );
}
