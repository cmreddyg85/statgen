'use client';

import { useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { Button } from '@/components/Button';
import { TextField } from '@/components/Field';
import { Modal } from '@/components/Modal';
import { useToast } from '@/components/Toast';

/** The closing balance of SBI (`Balance`) or IDBI (`balance`) rows. */
function closingBalance(transactions: unknown): string {
  const rows = (Array.isArray(transactions) ? transactions : []) as Record<string, string>[];
  const last = rows[rows.length - 1];
  return last?.Balance ?? last?.balance ?? '0.00';
}

/**
 * Asks for a closing balance and has the server append one or two rows to a
 * finalized statement so it ends there. `endpoint` is the match-transactions
 * URL; `onMatched` gets the statement's full transactions afterwards.
 */
export function MatchTransactionsDialog({
  endpoint,
  transactions,
  onClose,
  onMatched,
}: {
  endpoint: string;
  transactions: unknown;
  onClose: () => void;
  onMatched: (transactions: unknown[]) => void;
}) {
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const value = Number(amount.replace(/,/g, ''));
    if (amount.trim() === '' || !Number.isFinite(value) || value < 0) {
      setError('Enter an amount of 0 or more.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ added: unknown[]; transactions: unknown[] }>(endpoint, {
        amount: value,
      });
      onMatched(result.transactions);
      toast.success(
        result.added.length === 0
          ? 'The closing balance already matches. Nothing was added.'
          : `Added ${result.added.length} transaction${result.added.length > 1 ? 's' : ''}.`,
      );
      onClose();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not match the transactions.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title="Match transactions"
      description={`Adds one or two transactions after the last one so the statement closes on this amount. Existing transactions are not changed. Current closing balance: ${closingBalance(transactions)}.`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={busy}>
            Add transactions
          </Button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <TextField
          label="Closing balance"
          inputMode="decimal"
          placeholder="25000.00"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          error={error ?? undefined}
        />
      </form>
    </Modal>
  );
}
