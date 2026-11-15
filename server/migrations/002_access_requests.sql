-- Access requests: a company asks to join, the platform admin reviews and approves,
-- and the company's administrator sets their own password from a one-time link.

CREATE TABLE registration_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name  text NOT NULL,
  contact_name  text NOT NULL,
  email         text NOT NULL,
  phone         text,
  dot_number    text,
  mc_number     text,
  address       text,
  message       text,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by   uuid REFERENCES users (id) ON DELETE SET NULL,
  reviewed_at   timestamptz,
  review_note   text,
  company_id    uuid REFERENCES companies (id) ON DELETE SET NULL,
  ip_address    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
-- Someone who asks twice while the first request is still open does not create a second one.
CREATE UNIQUE INDEX registration_requests_one_pending_per_email ON registration_requests (lower(email)) WHERE status = 'pending';
CREATE INDEX registration_requests_status_idx ON registration_requests (status, created_at DESC);

-- One-time links for choosing a password (invitation now, password reset later).
-- Only a SHA-256 hash of each token is stored.
CREATE TABLE password_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose    text NOT NULL CHECK (purpose IN ('invite', 'reset')),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX password_tokens_user_idx ON password_tokens (user_id);
