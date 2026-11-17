-- Drivers create their own account in the app, proved by a text-message code sent to the phone number the
-- company put on the driver profile. The same codes verify later sign-ins, and a "remember this phone for
-- 30 days" token lets a verified phone skip the code until it expires.

-- One-time codes. Only a hash is kept. A code works once, for a few minutes, with a few attempts.
CREATE TABLE sms_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose     text NOT NULL CHECK (purpose IN ('register', 'login')),
  phone       text NOT NULL,                 -- digits only
  driver_id   uuid REFERENCES drivers (id) ON DELETE CASCADE,
  user_id     uuid REFERENCES users (id) ON DELETE CASCADE,
  code_hash   text NOT NULL,
  expires_at  timestamptz NOT NULL,
  attempts    integer NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sms_codes_phone_idx ON sms_codes (phone, purpose, created_at DESC);

-- Phones that passed the code and were asked to be remembered. Only a hash of the token is kept.
CREATE TABLE trusted_devices (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash   text NOT NULL UNIQUE,
  expires_at   timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
CREATE INDEX trusted_devices_user_idx ON trusted_devices (user_id);
