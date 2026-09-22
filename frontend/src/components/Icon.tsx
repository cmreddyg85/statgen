import type { NavItem } from '@/lib/navigation';

const PATHS: Record<NavItem['icon'], string> = {
  home: 'M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-5H9v5H5a1 1 0 0 1-1-1v-8.5Z',
  bank: 'M4 9.5 12 5l8 4.5M6 11v6m4-6v6m4-6v6m4-6v6M4 19h16',
  wallet: 'M4 8a2 2 0 0 1 2-2h11a1 1 0 0 1 1 1v1m-14 0v9a2 2 0 0 0 2 2h12a1 1 0 0 0 1-1v-3m0-4h-4a2 2 0 0 0 0 4h4a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1Z',
  mail: 'M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5v-9Zm0 .5 8 5.5L20 8',
  students:
    'M12 5 3 9l9 4 9-4-9-4Zm-5 6.5V16c0 1.1 2.24 2 5 2s5-.9 5-2v-4.5',
  users:
    'M15 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-4A3.5 3.5 0 0 0 4 17.5V19m9.5-14a3 3 0 1 1 0 6m-4-3a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM20 19v-1.5a3.5 3.5 0 0 0-2.5-3.35',
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
