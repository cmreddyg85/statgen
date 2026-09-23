'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { formatDateTime, formatRelative } from '@/lib/format';
import type { ActiveSession, User } from '@/lib/types';
import { Button } from '@/components/Button';
import { Modal } from '@/components/Modal';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';

/**
 * Where a user is signed in right now (admin only): one panel per live
 * session with the machine details resolved when it was created.
 */
export function UserSessionsDialog({
  user,
  onClose,
}: {
  user: User | null;
  onClose: () => void;
}) {
  const [sessions, setSessions] = useState<ActiveSession[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const { sessions: rows } = await api.get<{ sessions: ActiveSession[] }>(
        `/users/${user.id}/sessions`,
      );
      setSessions(rows);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load sessions.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Modal
      open={user !== null}
      title="Active sessions"
      description={user ? `Where ${user.name} (${user.username}) is signed in.` : ''}
      width="lg"
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      {loading && !sessions ? (
        <LoadingState label="Loading sessions…" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !sessions || sessions.length === 0 ? (
        <EmptyState
          title="No active sessions"
          message="This user is not signed in anywhere right now."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {sessions.map((session, index) => {
            const client = session.clientInfo ?? {};
            return (
              <div
                key={session.id}
                className="rounded-[10px] border border-[var(--color-line)] px-4 py-3"
              >
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold">
                    {client.browser ?? 'Unknown browser'}
                    {client.operatingSystem ? ` on ${client.operatingSystem}` : ''}
                  </h3>
                  <span className="text-xs text-[var(--color-muted)]">
                    Session {index + 1} · expires {formatRelative(session.expiresAt)}
                  </span>
                </div>

                <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  <Row label="IP address" value={client.ipAddress ?? session.ipAddress} mono />
                  <Row label="MAC address" value={client.macAddress} mono />
                  <Row label="Internet provider" value={client.provider} />
                  <Row label="Host name" value={client.hostname} />
                  <Row label="Machine" value={client.device} />
                  <Row label="Signed in" value={formatDateTime(session.createdAt)} />
                  <Row label="Expires" value={formatDateTime(session.expiresAt)} />
                  <div className="sm:col-span-2">
                    <Row label="User agent" value={session.userAgent} mono />
                  </div>
                </dl>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

function Row({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
        {label}
      </dt>
      <dd className={`mt-0.5 text-[13px] break-all ${mono ? 'font-mono text-[12px]' : ''}`}>
        {value || <span className="text-[var(--color-muted)]">Not available</span>}
      </dd>
    </div>
  );
}
