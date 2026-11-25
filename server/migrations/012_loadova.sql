-- Loadova: the dispatcher role (an employee of the company) and the loads.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('SUPER_ADMIN', 'COMPANY_ADMIN', 'DISPATCHER', 'DRIVER'));

CREATE TABLE loads (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  load_number      text NOT NULL,
  load_date        date NOT NULL,
  broker           text NOT NULL,
  pickup_location  text,
  pickup_time      text,
  dropoff_location text,
  dropoff_time     text,
  cash_in_cents    integer NOT NULL DEFAULT 0 CHECK (cash_in_cents >= 0),
  pay_method       text NOT NULL DEFAULT 'ach' CHECK (pay_method IN ('ach', 'wire')),
  driver_id        uuid,
  truck_id         uuid,
  status           text NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'picked_up', 'delivered')),
  picked_up_at     timestamptz,
  delivered_at     timestamptz,
  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, company_id),
  FOREIGN KEY (driver_id, company_id) REFERENCES drivers (id, company_id),
  FOREIGN KEY (truck_id, company_id) REFERENCES trucks (id, company_id)
);
CREATE INDEX loads_company_date_idx ON loads (company_id, load_date DESC);
CREATE INDEX loads_driver_idx ON loads (driver_id, status);
