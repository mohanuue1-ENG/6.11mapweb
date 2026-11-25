-- Counts that block by themselves: 10 wrong passwords in a row block the account, 10 failed payments block the company.
ALTER TABLE users ADD COLUMN failed_logins int NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN blocked_at timestamptz;
ALTER TABLE subscriptions ADD COLUMN failed_payments int NOT NULL DEFAULT 0;
