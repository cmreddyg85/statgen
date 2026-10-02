'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/Button';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState, LoadingState } from '@/components/States';
import { useToast } from '@/components/Toast';

interface LiveStudent {
  id: string;
  studentCode: string;
  name: string;
  banks: string[];
}

interface LiveResponse {
  students: LiveStudent[];
  selected: string[];
  active: string | null;
}

export function LiveClient() {
  const toast = useToast();
  const [students, setStudents] = useState<LiveStudent[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** What is saved, as opposed to what is ticked. */
  const [live, setLive] = useState<Set<string>>(new Set());
  /** Served by the public APIs called without a student id. */
  const [active, setActive] = useState('');
  const [savedActive, setSavedActive] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** Which of the two dropdowns is open. */
  const [open, setOpen] = useState<'students' | 'active' | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api.get<LiveResponse>('/live');
      setStudents(data.students);
      setSelected(new Set(data.selected));
      setLive(new Set(data.selected));
      setActive(data.active ?? '');
      setSavedActive(data.active ?? '');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load students.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Close the dropdown on a click outside it or Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (!(event.target as Element).closest('[data-menu]')) setOpen(null);
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(null);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
        // Taking a student off live takes them off active too.
        setActive((current) => (current === id ? '' : current));
      } else next.add(id);
      return next;
    });

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/live', { studentIds: [...selected], activeStudentId: active || null });
      setLive(new Set(selected));
      setSavedActive(active);
      toast.success('Live students saved.');
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const term = search.trim().toLowerCase();
  const visible = (students ?? []).filter(
    (s) => !term || s.name.toLowerCase().includes(term) || s.studentCode.includes(term),
  );
  const chosen = (students ?? []).filter((s) => selected.has(s.id));
  const liveNow = (students ?? []).filter((s) => live.has(s.id));
  const activeStudent = chosen.find((s) => s.id === active);

  return (
    <>
      <PageHeader
        title="Live"
        description="Only the students selected here are served by the public SBI details API."
      />
      <section className="card p-5">
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : !students ? (
          <LoadingState />
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
            className="space-y-4"
          >
            <div data-menu className="relative max-w-xl">
              <span className="field-label">Students</span>
              <button
                type="button"
                className="field-input flex items-center justify-between text-left"
                aria-haspopup="listbox"
                aria-expanded={open === 'students'}
                onClick={() => setOpen((value) => (value === 'students' ? null : 'students'))}
              >
                <span className={chosen.length ? '' : 'text-[var(--color-muted)]'}>
                  {chosen.length ? `${chosen.length} selected` : 'Select students'}
                </span>
                <span aria-hidden="true">▾</span>
              </button>
              {open === 'students' && (
                <div className="absolute z-20 mt-1 w-full rounded-md border border-[var(--color-line)] bg-white shadow-lg">
                  <div className="border-b border-[var(--color-line)] p-2">
                    <input
                      autoFocus
                      className="field-input"
                      placeholder="Search by name or ID"
                      aria-label="Search students"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </div>
                  <ul role="listbox" aria-multiselectable="true" className="max-h-72 overflow-y-auto py-1">
                    {visible.length === 0 ? (
                      <li className="px-3 py-2 text-sm text-[var(--color-muted)]">
                        {students.length === 0 ? 'No students with a finalized record.' : 'No matches.'}
                      </li>
                    ) : (
                      visible.map((s) => (
                        <li key={s.id} role="option" aria-selected={selected.has(s.id)}>
                          <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50">
                            <input
                              type="checkbox"
                              checked={selected.has(s.id)}
                              onChange={() => toggle(s.id)}
                            />
                            <span className="tabular-nums text-[var(--color-muted)]">{s.studentCode}</span>
                            <span className="flex-1">{s.name}</span>
                            <span className="text-xs text-[var(--color-muted)]">{s.banks.join(', ')}</span>
                          </label>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              )}
            </div>

            <div data-menu className="relative max-w-xl">
              <span className="field-label">Active live student</span>
              <button
                type="button"
                className="field-input flex items-center justify-between text-left"
                aria-haspopup="listbox"
                aria-expanded={open === 'active'}
                onClick={() => setOpen((value) => (value === 'active' ? null : 'active'))}
              >
                <span className={activeStudent ? '' : 'text-[var(--color-muted)]'}>
                  {activeStudent ? `${activeStudent.studentCode} — ${activeStudent.name}` : 'None'}
                </span>
                <span aria-hidden="true">▾</span>
              </button>
              {open === 'active' && (
                <div className="absolute z-20 mt-1 w-full rounded-md border border-[var(--color-line)] bg-white shadow-lg">
                  <ul role="listbox" className="max-h-72 overflow-y-auto py-1">
                    {[null, ...chosen].map((s) => (
                      <li key={s?.id ?? 'none'} role="option" aria-selected={active === (s?.id ?? '')}>
                        <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50">
                          <input
                            type="radio"
                            name="active-live-student"
                            checked={active === (s?.id ?? '')}
                            onChange={() => {
                              setActive(s?.id ?? '');
                              setOpen(null);
                            }}
                          />
                          {s ? (
                            <>
                              <span className="tabular-nums text-[var(--color-muted)]">{s.studentCode}</span>
                              <span className="flex-1">{s.name}</span>
                              <span className="text-xs text-[var(--color-muted)]">{s.banks.join(', ')}</span>
                            </>
                          ) : (
                            <span className="flex-1 text-[var(--color-muted)]">None</span>
                          )}
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <p className="-mt-2 text-xs text-[var(--color-muted)]">
              Served by the public APIs when they are called without a student id.
            </p>

            <Button type="submit" loading={saving}>
              Save
            </Button>
          </form>
        )}
      </section>
      {students && (
        <section className="card mt-5">
          <h2 className="border-b border-[var(--color-line)] px-5 py-3.5 text-[15px] font-semibold">
            Live now ({liveNow.length})
          </h2>
          {liveNow.length === 0 ? (
            <p className="px-5 py-4 text-sm text-[var(--color-muted)]">No students are live.</p>
          ) : (
            <ul className="divide-y divide-[var(--color-line)]">
              {liveNow.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                  <span className="tabular-nums text-[var(--color-muted)]">{s.studentCode}</span>
                  <span className="flex-1">
                    {s.name}
                    {s.id === savedActive && (
                      <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-700">
                        Active
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-[var(--color-muted)]">{s.banks.join(', ')}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
