-- Reviews written by real customers (one per company). They are shown on the website only after the platform admin approves them.
CREATE TABLE reviews (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL UNIQUE REFERENCES companies (id) ON DELETE CASCADE,
  user_id      uuid,
  rating       integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body         text NOT NULL,
  display_name text NOT NULL,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'hidden')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
