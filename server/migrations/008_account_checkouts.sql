-- A company that already has its account pays for a plan here. The dashboard opens when the payment is confirmed.
CREATE TABLE account_checkouts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  plan_id             uuid NOT NULL REFERENCES plans (id),
  provider            text NOT NULL,
  provider_session_id text UNIQUE,
  status              text NOT NULL DEFAULT 'awaiting_payment' CHECK (status IN ('awaiting_payment', 'paid', 'expired')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  paid_at             timestamptz
);
CREATE INDEX account_checkouts_company_idx ON account_checkouts (company_id, created_at DESC);
