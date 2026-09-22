-- Baseline schema for the Secure Business Portal (PRD Appendix B).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('ADMIN', 'USER');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          varchar(120) NOT NULL,
  username      varchar(100) NOT NULL,
  password_hash text        NOT NULL,
  role          user_role   NOT NULL DEFAULT 'USER',
  active        boolean     NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Usernames are unique regardless of letter case (PRD 14.1).
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_key ON users (lower(username));
CREATE INDEX IF NOT EXISTS users_active_idx ON users (active);

CREATE TABLE IF NOT EXISTS sessions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  ip_address inet,
  user_agent text
);

CREATE INDEX IF NOT EXISTS sessions_user_expires_idx ON sessions (user_id, expires_at);

CREATE TABLE IF NOT EXISTS students (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             varchar(120) NOT NULL,
  mobile_number    varchar(30)  NOT NULL,
  offer_company    varchar(150),
  company_verified boolean      NOT NULL DEFAULT false,
  verified_by      uuid REFERENCES users (id),
  verified_at      timestamptz,
  created_by       uuid NOT NULL REFERENCES users (id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);

CREATE INDEX IF NOT EXISTS students_mobile_idx ON students (mobile_number);
CREATE INDEX IF NOT EXISTS students_verified_idx ON students (company_verified);
CREATE INDEX IF NOT EXISTS students_deleted_at_idx ON students (deleted_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES users (id) ON DELETE SET NULL,
  action        varchar(80) NOT NULL,
  entity_type   varchar(80),
  entity_id     uuid,
  metadata_json jsonb,
  ip_address    inet,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_user_created_idx ON audit_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs (entity_type, entity_id, created_at DESC);
