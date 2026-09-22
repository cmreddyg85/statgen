# Secure Business Portal — Web

Next.js (App Router) + TypeScript + Tailwind CSS v4.

## Layout

```
src/
├── proxy.ts                  Route guard: no session cookie → /login
├── app/
│   ├── layout.tsx            Root layout, metadata, noindex
│   ├── login/                Login screen and form
│   └── (portal)/             Everything behind authentication
│       ├── layout.tsx        Validates the session server-side, then renders the shell
│       ├── page.tsx          Home → admin or user dashboard by role
│       ├── home/             The two dashboards
│       ├── students/         Student CRUD, detail page and Generate screen
│       ├── users/            Admin-only user management
├── components/               AppShell, SessionTimer, ProfileMenu, ChangePasswordDialog,
│                             Modal, Toast, table states…
└── lib/
    ├── api.ts                fetch wrapper: CSRF header, error shape, 401 handling
    ├── countdown.ts          Remaining-time maths and timer states
    ├── server-session.ts     Server-side session resolution for protected pages
    ├── session-context.tsx   Client session state, refresh and logout
    └── navigation.ts         Single source of truth for menu items and roles
```

## How access control works

Three layers, and only the last one is a real control:

1. `proxy.ts` redirects to `/login` when no session cookie is present — cheap and cosmetic.
2. `(portal)/layout.tsx` asks the API to validate the session before rendering any protected
   markup, and `/users` additionally checks for the Admin role.
3. The API independently enforces authentication and role on every request. A forged cookie or
   a hand-crafted `fetch` gets 401/403 regardless of what the UI shows.

## Students, details and Generate

Clicking a student's name in the table opens `/students/[id]`: their details plus the records
generated for them. **Generate** leads to `/students/[id]/generate`, where a dropdown at the
top selects the business module (SBI, IDBI, HDFC, PF, Gmail), a count sets how many records to
create, and the table below lists everything generated so far, newest first.

The modules have no pages of their own — the dropdown is the only place they appear, and its
options come from `GET /modules`.

## User Management columns

Each row shows **Last login** and a live **Sessions** count (sessions neither revoked nor
expired). The **Activity** action opens a modal with that account's audit timeline — the
user's own actions and any administrator changes to the account, interleaved newest first and
paginated. Both apply to administrator rows as well as user rows.

## Passwords in the UI

- **Admin, own password** — profile menu > Change password. A modal takes the new password
  twice and calls `/auth/change-password`. The entry is hidden for non-admins, and the API
  refuses them independently.
- **Any user's password** — Users > Edit, where the password field is optional: leaving it
  blank keeps the current password, and filling it in resets that user's password and signs
  them out everywhere. There is no separate row action for it.

## Student ownership in the UI

The Students screen adapts to the role: an admin sees every record, a "Created by" column and
a "Created by" filter; a user sees only their own records, and neither the column nor the
filter (both would be redundant). Both lists are ordered newest first. The API applies the same
scope independently, so this is presentation rather than the control itself.

## Session handling

- The server returns an absolute `expiresAt`; the client never keeps its own session clock.
- `SessionTimer` recomputes remaining time every second from that timestamp, so a sleeping tab
  cannot drift. It turns amber at 2 minutes and red at 30 seconds.
- At zero it calls logout and redirects to `/login?reason=session_expired`.
- Any 401 from any request clears client state and redirects once, via `onSessionInvalid`.
- No token is ever placed in `localStorage` or `sessionStorage`.

## Design system

Tokens from PRD 11.1 live in `app/globals.css` as CSS custom properties (`--color-primary`,
`--radius-card`, …) exposed to Tailwind via `@theme`. Component classes `.card`,
`.field-input`, `.data-table` keep spacing, borders and table density consistent across
screens. Reduced-motion preferences are respected, focus is always visible, and status is never
communicated by colour alone.

## Configuration

| Variable | Purpose |
| --- | --- |
| `API_ORIGIN` | Where `/api/v1/*` is proxied. Default `http://localhost:4000`. |
| `NEXT_PUBLIC_APP_NAME` | Product name in the sidebar and page titles. |
| `SESSION_COOKIE_NAME` | Must match the API. Default `app_session`. |

## Commands

```bash
npm run dev        # http://localhost:3000
npm run build
npm start
npm run typecheck
```
