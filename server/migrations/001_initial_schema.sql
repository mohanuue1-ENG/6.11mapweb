-- 6.11 Drive GPS: initial schema (PRD section 5).
-- Every tenant-owned table carries company_id. Child tables reference their
-- parents with composite (id, company_id) foreign keys, so a row can never
-- point at another company's driver, truck or trip even if application code
-- has a bug.

-- ---------------------------------------------------------------- plans
CREATE TABLE plans (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL UNIQUE,
  description      text,
  price_cents      integer NOT NULL CHECK (price_cents >= 0),
  currency         text NOT NULL DEFAULT 'USD',
  billing_interval text NOT NULL DEFAULT 'monthly' CHECK (billing_interval IN ('monthly')),
  truck_limit      integer CHECK (truck_limit IS NULL OR truck_limit > 0), -- NULL = unlimited
  is_internal_only boolean NOT NULL DEFAULT false,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------ companies
CREATE TABLE companies (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'suspended')),
  is_internal   boolean NOT NULL DEFAULT false,
  contact_email text,
  contact_phone text,
  address       text,
  dot_number    text,
  mc_number     text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- users
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid REFERENCES companies (id) ON DELETE CASCADE,
  role          text NOT NULL CHECK (role IN ('SUPER_ADMIN', 'COMPANY_ADMIN', 'DRIVER')),
  name          text NOT NULL,
  email         text,
  phone         text,
  password_hash text NOT NULL,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- Super admins belong to no company; everyone else belongs to exactly one.
  CONSTRAINT users_company_matches_role
    CHECK ((role = 'SUPER_ADMIN') = (company_id IS NULL)),
  CONSTRAINT users_has_login_identifier
    CHECK (email IS NOT NULL OR phone IS NOT NULL),
  UNIQUE (id, company_id)
);
CREATE UNIQUE INDEX users_email_unique ON users (lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX users_phone_unique ON users (phone) WHERE phone IS NOT NULL;
CREATE INDEX users_company_idx ON users (company_id);

-- -------------------------------------------------------------- drivers
CREATE TABLE drivers (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  user_id            uuid UNIQUE,
  name               text NOT NULL,
  phone              text,
  driver_number      text,
  license_number     text,
  license_state      text,
  license_expires_on date,
  status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, company_id),
  UNIQUE (company_id, driver_number),
  FOREIGN KEY (user_id, company_id) REFERENCES users (id, company_id)
);
CREATE INDEX drivers_company_idx ON drivers (company_id);

-- --------------------------------------------------------------- trucks
CREATE TABLE trucks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  truck_number text NOT NULL,
  plate_number text,
  make         text,
  model        text,
  year         integer CHECK (year IS NULL OR year BETWEEN 1950 AND 2100),
  vin          text,
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, company_id),
  UNIQUE (company_id, truck_number)
);
CREATE INDEX trucks_company_status_idx ON trucks (company_id, status);

-- --------------------------------------------- driver_truck_assignments
CREATE TABLE driver_truck_assignments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  driver_id  uuid NOT NULL,
  truck_id   uuid NOT NULL,
  start_at   timestamptz NOT NULL DEFAULT now(),
  end_at     timestamptz,
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (driver_id, company_id) REFERENCES drivers (id, company_id) ON DELETE CASCADE,
  FOREIGN KEY (truck_id, company_id) REFERENCES trucks (id, company_id) ON DELETE CASCADE,
  CONSTRAINT assignments_active_has_no_end CHECK (active = (end_at IS NULL))
);
-- One active truck per driver and one active driver per truck.
CREATE UNIQUE INDEX assignments_one_active_per_driver ON driver_truck_assignments (driver_id) WHERE active;
CREATE UNIQUE INDEX assignments_one_active_per_truck ON driver_truck_assignments (truck_id) WHERE active;
CREATE INDEX assignments_company_idx ON driver_truck_assignments (company_id);

-- -------------------------------------------------------------- devices
CREATE TABLE devices (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  driver_id         uuid NOT NULL,
  platform          text NOT NULL CHECK (platform IN ('android', 'ios')),
  device_identifier text NOT NULL,
  push_token        text,
  status            text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  last_seen_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (driver_id, company_id) REFERENCES drivers (id, company_id) ON DELETE CASCADE,
  UNIQUE (driver_id, device_identifier)
);

-- ---------------------------------------------------------------- trips
CREATE TABLE trips (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  driver_id           uuid NOT NULL,
  truck_id            uuid NOT NULL,
  status              text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'CANCELLED')),
  start_latitude      double precision NOT NULL CHECK (start_latitude BETWEEN -90 AND 90),
  start_longitude     double precision NOT NULL CHECK (start_longitude BETWEEN -180 AND 180),
  start_gps_timestamp timestamptz NOT NULL,
  started_at          timestamptz NOT NULL DEFAULT now(),
  end_latitude        double precision CHECK (end_latitude BETWEEN -90 AND 90),
  end_longitude       double precision CHECK (end_longitude BETWEEN -180 AND 180),
  end_gps_timestamp   timestamptz,
  ended_at            timestamptz,
  duration_seconds    integer CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  distance_meters     double precision CHECK (distance_meters IS NULL OR distance_meters >= 0),
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, company_id),
  FOREIGN KEY (driver_id, company_id) REFERENCES drivers (id, company_id),
  FOREIGN KEY (truck_id, company_id) REFERENCES trucks (id, company_id)
);
-- A driver can have only one active trip (PRD 4.4).
CREATE UNIQUE INDEX trips_one_active_per_driver ON trips (driver_id) WHERE status = 'ACTIVE';
CREATE INDEX trips_company_status_idx ON trips (company_id, status);
CREATE INDEX trips_company_started_idx ON trips (company_id, started_at DESC);
CREATE INDEX trips_truck_idx ON trips (truck_id);

-- ---------------------------------------------------- current_locations
CREATE TABLE current_locations (
  truck_id        uuid PRIMARY KEY,
  company_id      uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  driver_id       uuid,
  latitude        double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude       double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  accuracy_meters double precision,
  speed_mps       double precision,
  heading_degrees double precision,
  gps_timestamp   timestamptz NOT NULL,
  received_at     timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (truck_id, company_id) REFERENCES trucks (id, company_id) ON DELETE CASCADE,
  FOREIGN KEY (driver_id, company_id) REFERENCES drivers (id, company_id)
);
CREATE INDEX current_locations_company_idx ON current_locations (company_id);

-- ----------------------------------------------------- location_history
CREATE TABLE location_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        uuid NOT NULL, -- client-generated idempotency key
  company_id      uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  driver_id       uuid NOT NULL,
  truck_id        uuid NOT NULL,
  trip_id         uuid,
  latitude        double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude       double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  accuracy_meters double precision CHECK (accuracy_meters IS NULL OR accuracy_meters >= 0),
  speed_mps       double precision CHECK (speed_mps IS NULL OR speed_mps >= 0),
  heading_degrees double precision CHECK (heading_degrees IS NULL OR (heading_degrees >= 0 AND heading_degrees <= 360)),
  gps_timestamp   timestamptz NOT NULL,
  received_at     timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (driver_id, company_id) REFERENCES drivers (id, company_id),
  FOREIGN KEY (truck_id, company_id) REFERENCES trucks (id, company_id),
  FOREIGN KEY (trip_id, company_id) REFERENCES trips (id, company_id),
  -- Re-uploading the same offline point is a no-op, scoped to the driver so
  -- one tenant can never collide with another tenant's event IDs.
  UNIQUE (driver_id, event_id)
);
CREATE INDEX location_history_truck_time_idx ON location_history (company_id, truck_id, gps_timestamp DESC);
CREATE INDEX location_history_driver_time_idx ON location_history (company_id, driver_id, gps_timestamp DESC);
CREATE INDEX location_history_trip_idx ON location_history (trip_id, gps_timestamp) WHERE trip_id IS NOT NULL;

-- ------------------------------------------------ subscriptions/payments
CREATE TABLE subscriptions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  plan_id              uuid NOT NULL REFERENCES plans (id),
  status               text NOT NULL DEFAULT 'active'
                         CHECK (status IN ('trialing', 'active', 'past_due', 'suspended', 'cancelled', 'expired')),
  price_cents          integer NOT NULL CHECK (price_cents >= 0),
  truck_limit          integer CHECK (truck_limit IS NULL OR truck_limit > 0),
  current_period_start timestamptz NOT NULL DEFAULT now(),
  current_period_end   timestamptz, -- NULL = does not expire (internal company)
  cancelled_at         timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, company_id)
);
-- One live subscription per company.
CREATE UNIQUE INDEX subscriptions_one_live_per_company ON subscriptions (company_id)
  WHERE status IN ('trialing', 'active', 'past_due', 'suspended');

CREATE TABLE payments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  subscription_id    uuid,
  amount_cents       integer NOT NULL CHECK (amount_cents >= 0),
  currency           text NOT NULL DEFAULT 'USD',
  status             text NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
  provider           text,
  provider_reference text,
  paid_at            timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (subscription_id, company_id) REFERENCES subscriptions (id, company_id),
  UNIQUE (provider, provider_reference)
);
CREATE INDEX payments_company_idx ON payments (company_id, created_at DESC);

-- -------------------------------------------------------- notifications
CREATE TABLE notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  user_id    uuid, -- NULL = visible to all admins of the company
  type       text NOT NULL,
  title      text NOT NULL,
  message    text NOT NULL,
  severity   text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (user_id, company_id) REFERENCES users (id, company_id) ON DELETE CASCADE
);
CREATE INDEX notifications_company_idx ON notifications (company_id, created_at DESC);

-- ------------------------------------------------------- refresh_tokens
-- Revocable sessions. Only a SHA-256 hash of each refresh token is stored.
-- Tokens rotate on every use; family_id links a rotation chain so that reuse
-- of an old token revokes the whole session.
CREATE TABLE refresh_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  family_id   uuid NOT NULL,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  user_agent  text,
  ip_address  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id);
CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family_id);

-- ----------------------------------------------------------- audit_logs
CREATE TABLE audit_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid REFERENCES companies (id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  action        text NOT NULL,
  details       jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_company_idx ON audit_logs (company_id, created_at DESC);
CREATE INDEX audit_logs_created_idx ON audit_logs (created_at DESC);
