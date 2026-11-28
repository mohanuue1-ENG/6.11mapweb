-- Plans given by the platform owner (or an approved request) did not copy the plan's product, so a plan for Loadova still worked as Trackova.
UPDATE subscriptions s SET product = p.product FROM plans p WHERE p.id = s.plan_id AND s.product <> p.product;
