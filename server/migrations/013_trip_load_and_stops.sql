-- A trip can be for a load (the trip is then called by the load number), and a truck that stands still during a trip
-- leaves a stop that stays on the map.
ALTER TABLE trips ADD COLUMN load_id uuid REFERENCES loads (id) ON DELETE SET NULL;
CREATE INDEX trips_load_idx ON trips (load_id);

CREATE TABLE trip_stops (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  trip_id          uuid NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
  latitude         double precision NOT NULL,
  longitude        double precision NOT NULL,
  started_at       timestamptz NOT NULL,
  duration_seconds integer NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trip_id, started_at)
);
CREATE INDEX trip_stops_trip_idx ON trip_stops (trip_id);
