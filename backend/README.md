# Secure Business Portal — API

Node.js + Express + PostgreSQL service. All endpoints live under `/api/v1`; health checks are
unversioned at `/health`.

## Layout

```
src/
├── config/env.ts            Zod-validated environment; the process refuses to start if invalid
├── db/
│   ├── pool.ts              Parameterized query helpers and transactions
│   ├── migrate.ts           Forward-only migration runner
│   ├── seed.ts              Bootstrap administrator
│   └── migrations/*.sql     Schema
├── middleware/
│   ├── auth.ts              requireAuth + requireRole — the single authorization gate
│   ├── cookies.ts           Session and CSRF cookie policy
│   ├── csrf.ts              Double-submit CSRF check
│   ├── rate-limit.ts        Login and general limiters
│   ├── validate.ts          Schema validation that replaces req.body/query/params
│   └── error-handler.ts     Consistent error shape; stack traces stay server-side
├── repositories/            SQL access only
├── services/                Business logic: auth, users, students, sessions, audit, password
├── routes/                  HTTP contract
└── validation/schemas.ts    Field rules from PRD section 14
```

Requests flow: route → `validate` → `requireAuth` → `requireRole` → service → repository.

## Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/api/v1/auth/login` | Public | Create session; returns user, `expiresAt`, CSRF token |
| GET | `/api/v1/auth/session` | Session | Current user and session expiry (drives the timer) |
| GET | `/api/v1/auth/me` | Session | Current profile |
| POST | `/api/v1/auth/change-password` | Admin | Change your own password; signs out your other sessions |
| POST | `/api/v1/auth/logout` | Session | Revoke session and clear cookies |
| GET | `/api/v1/users` | Admin | List with `page`, `pageSize`, `search`, `status`, `role`. Each row carries `lastLoginAt` and `activeSessions`. |
| POST | `/api/v1/users` | Admin | Create (role is fixed to `USER`) |
| GET | `/api/v1/users/stats` | Admin | Dashboard counts and recent audit activity |
| GET | `/api/v1/users/:id` | Admin | Get one |
| GET | `/api/v1/users/:id/audit` | Admin | That account's activity timeline, paginated |
| PATCH | `/api/v1/users/:id` | Admin | Update name / active (username is immutable) |
| POST | `/api/v1/users/:id/activate` | Admin | Allow sign-in |
| POST | `/api/v1/users/:id/deactivate` | Admin | Block sign-in and revoke sessions |
| POST | `/api/v1/users/:id/reset-password` | Admin | Set another user's password and revoke their sessions |
| GET | `/api/v1/students` | Session | List with `page`, `pageSize`, `search`, `verified`, and `createdBy` (admin only). Newest first. |
| POST | `/api/v1/students` | Session | Create |
| GET | `/api/v1/students/stats` | Session | Verified / unverified counts, scoped to the caller |
| GET | `/api/v1/students/:id` | Session | Get one |
| PATCH | `/api/v1/students/:id` | Session | Update |
| DELETE | `/api/v1/students/:id` | Session | Soft delete |
| POST | `/api/v1/students/:id/verify-company` | Session | Mark verified; records who and when |
| POST | `/api/v1/students/:id/unverify-company` | Session | Clear verification |
| GET | `/api/v1/students/:id/records` | Session | Records generated for a student, optional `module` filter |
| POST | `/api/v1/students/:id/records/generate` | Session | Generate a batch for one module |
| GET | `/api/v1/modules` | Session | Modules available to the caller's role (the Generate dropdown) |
| GET | `/health/live`, `/health/ready` | Public | Liveness and database readiness |

Non-GET requests that carry a session cookie must send the `x-csrf-token` header matching the
`app_csrf` cookie.

### Error shape

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please correct the highlighted fields.",
    "fields": { "username": "That username is already taken." },
    "requestId": "req_5f1c…"
  }
}
```

Codes: `VALIDATION_ERROR`, `UNAUTHENTICATED`, `SESSION_EXPIRED`, `FORBIDDEN`, `NOT_FOUND`,
`CONFLICT`, `RATE_LIMITED`, `CSRF_ERROR`, `INTERNAL_ERROR`.

## Data model

`users`, `sessions`, `students`, `audit_logs` — per PRD Appendix B, with the indexes from
section 10.1. Notable rules enforced in the database or in a service:

- `UNIQUE (lower(username))` — usernames are unique case-insensitively.
- `sessions.token_hash` stores an HMAC, never the raw token.
- Students are soft-deleted (`deleted_at`); users are deactivated, never deleted.
- `students.created_by` is the ownership key — see "Student ownership" below.
- `student_module_records` holds generated records; `reference` is globally unique.
- `updated_at` is maintained by a trigger, not by callers.

## Account activity and sessions

`GET /users/:id/audit` returns one timeline per account, combining two things an
administrator needs together:

- what the user did (`audit_logs.user_id = :id`), and
- what was done to the account (`entity_type = 'user' AND entity_id = :id`).

The user list carries `activeSessions` — sessions that are neither revoked nor expired,
counted live — alongside `lastLoginAt`, so an admin can see at a glance who is signed in
right now and from when.

## Password handling

Two distinct paths, matching the PRD's admin-controlled model (PRD 20):

| Who | How | Effect on sessions |
| --- | --- | --- |
| Admin, own password | Profile menu > Change password (`/auth/change-password`) | Other sessions revoked; the current one stays signed in |
| Any user's password | Admin only, Users > Edit (`/users/:id/reset-password`) | All of that user's sessions revoked |

Users cannot change their own password in this release — `/auth/change-password` is
admin-only and returns 403 for the USER role. Both paths enforce the configured minimum
length and write an audit entry (`USER_PASSWORD_CHANGED` / `USER_PASSWORD_RESET`).

The one exception is the seeded administrator, whose first password equals its username so
there is no secret to transport into a new environment. It is meant to be replaced at first
sign-in.

## Student ownership

`src/services/student-access.ts` holds the rule in one place:

- **ADMIN** reads and writes every student record, and may pass `createdBy` to filter the list
  by owner.
- **USER** reads and writes only the records they created. `listScopeFor` pins their list to
  their own id, so a `createdBy` parameter naming someone else is ignored rather than honoured.

`student.service.ts` calls `getById` before every update, delete and verification change, so
one ownership check guards every write path. A cross-owner request gets `404 Student not
found.` — the same answer as a genuinely missing record, so ids cannot be probed — and the
attempt is recorded as `AUTHORIZATION_FAILURE` with `reason: not_record_owner`.

## Generating student records

The business modules no longer have pages of their own. A module is picked from the dropdown
on a student's Generate screen, and `POST /students/:id/records/generate` creates a batch.

- `src/config/modules.ts` is the registry: keys, labels and which roles may use each one.
- References read `SBI-20260922-0007` — module, date, and a running sequence *per student and
  module*, so a second run continues where the first stopped rather than colliding.
- A batch is inserted in a single statement, so a run either lands completely or not at all.
- Ownership is inherited from the student: a user can only generate for, and list records of,
  students they created.

**What a record contains is deliberately unfinished.** Each row carries its identity (module,
reference, status `GENERATED`) and an empty `payload` jsonb. When a module integration is
built, have it fill `payload` (and refine `status`) in `student-record.service.ts` —
authentication, authorization, auditing, references and pagination are already in place.

## Configuration

See `.env.example`. The values worth understanding:

| Variable | Notes |
| --- | --- |
| `SESSION_SECRET_OR_PEPPER` | Min 32 chars. Peppers password hashes and keys session-token HMACs. Changing it invalidates every session and password hash. |
| `SESSION_TTL_USER_MINUTES` / `SESSION_TTL_ADMIN_HOURS` | Absolute lifetimes. Default 15 / 24. |
| `ALLOWED_ORIGINS` | Leave empty for same-origin production. Comma-separated allowlist otherwise; wildcards are never used with credentials. |
| `COOKIE_SECURE` | `auto` (secure in production), or force `true`/`false`. |
| `MOBILE_NUMBER_REGEX` | Applied after digits-only normalization. Default `^[0-9]{10,15}$`. |
| `PASSWORD_MIN_LENGTH` | Default 12. Applies to every password set through the API; the seeded bootstrap credential is exempt by design. |
| `LOGIN_RATE_LIMIT_*` | Default 10 attempts per 15 minutes, per IP *and* username. |

## Tests

```bash
npm test
```

28 unit tests covering session lifetime and expiry maths, token hashing, Argon2id hashing and
verification, field validation and normalization, and RBAC decisions. They need no database.
