-- Fuel ("flue") bought by a driver's truck: where, how much, and what it cost.
CREATE TABLE fuel_transactions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  driver_id        uuid NOT NULL,
  truck_id         uuid,
  fuel_date        date NOT NULL,
  state_abbr       text NOT NULL CHECK (char_length(state_abbr) = 2),
  location         text NOT NULL,
  receipt_number   text,
  gallons          numeric(10, 2) NOT NULL CHECK (gallons >= 0),
  cash_out_cents   integer NOT NULL CHECK (cash_out_cents >= 0),
  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (driver_id, company_id) REFERENCES drivers (id, company_id),
  FOREIGN KEY (truck_id, company_id) REFERENCES trucks (id, company_id)
);
CREATE INDEX fuel_company_date_idx ON fuel_transactions (company_id, fuel_date DESC);
CREATE INDEX fuel_driver_idx ON fuel_transactions (driver_id, fuel_date DESC);
