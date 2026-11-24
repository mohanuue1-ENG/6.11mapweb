-- A plan can be paid yearly, with a percentage taken off twelve months of the monthly price.
ALTER TABLE plans ADD COLUMN yearly_discount_percent integer NOT NULL DEFAULT 0 CHECK (yearly_discount_percent BETWEEN 0 AND 90);
ALTER TABLE account_checkouts ADD COLUMN billing_interval text NOT NULL DEFAULT 'month' CHECK (billing_interval IN ('month', 'year'));
ALTER TABLE subscriptions ADD COLUMN billing_interval text NOT NULL DEFAULT 'month' CHECK (billing_interval IN ('month', 'year'));
