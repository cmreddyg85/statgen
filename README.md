# Secure Business Portal

Internal Admin + User portal built to the `Secure_Business_Portal_PRD.docx` requirements:
role-based access, strict server-enforced session expiry with a live countdown, admin user
management, a shared Student CRM, and per-student record generation against the SBI, IDBI,
HDFC, PF and Gmail modules.

```
statgen/
├── backend/     Node.js + Express + PostgreSQL API  (port 4000)
└── frontend/    Next.js App Router web application  (port 3000)
```

The browser only ever talks to the Next.js origin: `/api/v1/*` is reverse-proxied to the API,
so the session cookie stays same-origin exactly as the PRD's production topology intends.

---

## Quick start

Requires Node 20+ and PostgreSQL 14+.

```bash
# 1. Database
createdb secure_portal

# 2. API
cd backend
cp .env.example .env          # then set DATABASE_URL and SESSION_SECRET_OR_PEPPER
npm install
npm run migrate               # create tables and indexes
npm run seed                  # create the first administrator (admin / admin)
npm run dev                   # http://localhost:4000

# 3. Web app (second terminal)
cd frontend
cp .env.example .env.local
npm install
npm run dev                   # http://localhost:3000
```

Generate a session pepper with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Sign in at <http://localhost:3000/login> as **`admin` / `admin`** — the seeded administrator's
first password is deliberately the same as its username. Change it immediately from the
profile menu > **Change password**, then create User accounts from **Users**. There is no
public sign-up: the first admin comes from the seed script, and every other account is created
by an administrator.

---

## What is implemented

| Area | Status |
| --- | --- |
| Login, logout, session validation, expiry handling | Complete |
| Role-based access (Admin / User), server-enforced | Complete |
| Session policy: 15 min User / 24 h Admin, absolute | Complete |
| Live countdown with warning and expiring states | Complete |
| Admin user management (create, edit, activate, deactivate, set password) | Complete |
| Admin self-service password change from the profile menu | Complete |
| Per-user audit timeline, last login and live session count in User Management | Complete |
| Student CRUD with company verification and soft delete | Complete |
| Student ownership: users see only their own records, admins see all | Complete |
| Admin dashboard (KPIs + recent audit activity) and User dashboard | Complete |
| App shell: sidebar, mobile drawer, top bar, profile menu | Complete |
| Student detail page, reached by clicking a name | Complete |
| Record generation per student against a chosen module (SBI/IDBI/HDFC/PF/Gmail) | Structure complete; record payload is a placeholder |
| Audit logging for security and business events | Complete |
| Unit tests (session, password, validation, RBAC) | Complete — `cd backend && npm test` |
| Integration and E2E suites | Not included — see "Not built yet" |

### Not built yet

These are out of MVP scope in the PRD, or explicitly deferred:

- The real content of a generated record. Generation, ownership, references, sequencing and
  the module dropdown all work; each record carries an empty `payload` for the upstream module
  integration to fill in.
- Integration and end-to-end test suites (PRD 16.2/16.3). The unit layer is in place and the
  API surface is stable enough to add them without rework.
- SSO, self-service password reset, public registration, CSV export, notifications.

---

## Security model

- **Passwords** — Argon2id (19 MiB, t=2, p=1) with a server-side pepper. Never logged, never
  returned by the API.
- **Sessions** — opaque 48-byte random tokens in an HttpOnly cookie. PostgreSQL stores only an
  HMAC of the token. Expiry is absolute and decided at login; it is never silently extended.
- **Revocation** — logout, deactivation and password reset revoke sessions immediately, so an
  open browser tab loses access on the next request rather than at natural expiry.
- **Authorization** — every protected route re-resolves the session server-side and checks its
  role. Hidden menu items are convenience only: a User calling `/api/v1/users` gets a 403 and
  an audit record.
- **CSRF** — double-submit token (readable `app_csrf` cookie echoed in `x-csrf-token`) on every
  state-changing request that carries a session cookie.
- **Rate limiting** — login attempts limited per IP *and* username, so one noisy client cannot
  lock out an unrelated account from a shared office IP.
- **Account enumeration** — unknown user, wrong password and inactive account all return the
  same message, and a dummy hash verification keeps response timing flat.
- **Last admin** — the system refuses to deactivate the final active administrator.
- **Password changes** — an administrator changes their own password from the profile menu,
  which signs out their other devices but keeps the current session. A user's password is set
  only by an administrator, from **Users > Edit**; users cannot change their own.
- **Bootstrap credential** — the seeded admin's first password equals its username. It is a
  single-use credential and the only place this shortcut applies; every password set afterwards
  goes through the normal 12-character minimum.
- **Record ownership** — a user can read and modify only the students they created. The scope
  is derived from the session, so passing `createdBy` for someone else changes nothing. A
  cross-owner request returns 404 rather than 403, so record ids cannot be probed, and the
  attempt is written to the audit log.

---

## Commands

| Location | Command | Purpose |
| --- | --- | --- |
| `backend/` | `npm run dev` | API with reload |
| `backend/` | `npm run migrate` | Apply pending SQL migrations |
| `backend/` | `npm run seed` | Create the bootstrap administrator |
| `backend/` | `npm test` | Unit tests |
| `backend/` | `npm run typecheck` | TypeScript check |
| `backend/` | `npm run build && npm start` | Production build and run |
| `frontend/` | `npm run dev` | Web app with reload |
| `frontend/` | `npm run build && npm start` | Production build and run |

## Deployment notes

- Serve the web app and API from the same public domain behind a reverse proxy. Set
  `API_ORIGIN` on the web tier; leave `ALLOWED_ORIGINS` empty when same-origin, and use an
  explicit allowlist (never a wildcard) if the tiers are split.
- Set `NODE_ENV=production` so cookies become `Secure` and HSTS is sent.
- Keep `SESSION_SECRET_OR_PEPPER` in a secret manager. Changing it invalidates all sessions and
  all existing password hashes, so treat it as permanent per environment.
- `GET /health/live` is liveness, `GET /health/ready` checks database connectivity.

## Documentation

- [`backend/README.md`](backend/README.md) — API reference, data model, configuration.
- [`frontend/README.md`](frontend/README.md) — routes, components, session handling.
