import type { NavItem } from '@/lib/navigation';

const PATHS: Record<NavItem['icon'], string> = {
  home: 'M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-5H9v5H5a1 1 0 0 1-1-1v-8.5Z',
  students:
    'M12 5 3 9l9 4 9-4-9-4Zm-5 6.5V16c0 1.1 2.24 2 5 2s5-.9 5-2v-4.5',
  users:
    'M15 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-4A3.5 3.5 0 0 0 4 17.5V19m9.5-14a3 3 0 1 1 0 6m-4-3a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM20 19v-1.5a3.5 3.5 0 0 0-2.5-3.35',
  // A bank front: columns under a roof.
  sbi: 'M3 20h18M4 20v-9m4 9v-9m8 9v-9m4 9v-9M2.5 11 12 5l9.5 6',
  // A broadcast: a dot with waves either side.
  live: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm-3.5 2.5a5 5 0 0 1 0-7m7 0a5 5 0 0 1 0 7M5.6 18.4a9 9 0 0 1 0-12.8m12.8 0a9 9 0 0 1 0 12.8',
};

export function NavIcon({ name, className = '' }: { name: NavItem['icon']; className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d={PATHS[name]}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function EyeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="12" cy="12" r="2.75" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
