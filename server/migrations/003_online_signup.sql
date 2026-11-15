-- Online sign-up: a company picks a plan, pays at the payment provider, and its account is
-- created automatically when the provider confirms the payment.

ALTER TABLE registration_requests DROP CONSTRAINT registration_requests_status_check;
ALTER TABLE registration_requests ADD CONSTRAINT registration_requests_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'awaiting_payment', 'paid', 'expired'));

ALTER TABLE registration_requests
  ADD COLUMN plan_id uuid REFERENCES plans (id),
  ADD COLUMN provider text,
  ADD COLUMN provider_session_id text UNIQUE,
  ADD COLUMN paid_at timestamptz;

-- Keep the provider's ids so renewals, failed payments and cancellations can be matched later.
ALTER TABLE subscriptions
  ADD COLUMN provider text,
  ADD COLUMN provider_customer_id text,
  ADD COLUMN provider_subscription_id text;
CREATE INDEX subscriptions_provider_subscription_idx ON subscriptions (provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;
