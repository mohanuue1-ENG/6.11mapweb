-- What a plan is for: the tracking product (Trackova), the load and dispatch product (Loadova), or both together.
ALTER TABLE plans ADD COLUMN product text NOT NULL DEFAULT 'trackova' CHECK (product IN ('trackova', 'loadova', 'both'));
ALTER TABLE subscriptions ADD COLUMN product text NOT NULL DEFAULT 'trackova' CHECK (product IN ('trackova', 'loadova', 'both'));
