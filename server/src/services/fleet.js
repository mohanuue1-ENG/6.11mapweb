import { HttpError, conflict } from '../errors.js';

// Enforces the subscription's truck limit (PRD section 9). Call inside a
// transaction before a truck is added or re-activated. The company row is
// locked so two simultaneous requests cannot both take the last slot.
//
// A company with no live subscription is not limited yet: subscriptions and
// the expired-plan rules arrive with the billing phase.
export async function assertTruckCapacity(q, companyId, excludingTruckId = null) {
  await q.query('SELECT id FROM companies WHERE id = $1 FOR UPDATE', [companyId]);

  const sub = await q.query(
    `SELECT truck_limit FROM subscriptions
      WHERE company_id = $1 AND status IN ('trialing', 'active', 'past_due')
      ORDER BY created_at DESC LIMIT 1`,
    [companyId],
  );
  const limit = sub.rows[0]?.truck_limit;
  if (limit == null) return;

  const used = await q.query(
    `SELECT count(*)::int AS n FROM trucks
      WHERE company_id = $1 AND status <> 'inactive' AND ($2::uuid IS NULL OR id <> $2::uuid)`,
    [companyId, excludingTruckId],
  );
  if (used.rows[0].n >= limit) {
    throw new HttpError(
      409,
      'TRUCK_LIMIT_REACHED',
      `Your plan allows ${limit} active truck${limit === 1 ? '' : 's'}. Deactivate a truck or upgrade your plan.`,
    );
  }
}

// Returns usage for the company profile: { activeTrucks, truckLimit } (limit null = unlimited).
export async function truckUsage(q, companyId) {
  const { rows } = await q.query(
    `SELECT (SELECT count(*)::int FROM trucks WHERE company_id = $1 AND status <> 'inactive') AS active_trucks,
            (SELECT truck_limit FROM subscriptions
              WHERE company_id = $1 AND status IN ('trialing', 'active', 'past_due')
              ORDER BY created_at DESC LIMIT 1) AS truck_limit,
            EXISTS (SELECT 1 FROM subscriptions
              WHERE company_id = $1 AND status IN ('trialing', 'active', 'past_due')) AS has_subscription`,
    [companyId],
  );
  return {
    activeTrucks: rows[0].active_trucks,
    truckLimit: rows[0].truck_limit,
    hasSubscription: rows[0].has_subscription,
  };
}

// A driver or truck on a trip cannot be unassigned, deactivated or reassigned.
export async function assertNoActiveTrip(q, companyId, { driverId = null, truckId = null }) {
  const { rows } = await q.query(
    `SELECT 1 FROM trips
      WHERE company_id = $1 AND status = 'ACTIVE'
        AND (driver_id = $2::uuid OR truck_id = $3::uuid) LIMIT 1`,
    [companyId, driverId, truckId],
  );
  if (rows.length) throw conflict('There is a trip in progress. End the trip first.');
}

// Closes the active assignment of a driver and/or truck, keeping it as history.
export async function endActiveAssignments(q, companyId, { driverId = null, truckId = null }) {
  await q.query(
    `UPDATE driver_truck_assignments SET active = false, end_at = now()
      WHERE company_id = $1 AND active AND (driver_id = $2::uuid OR truck_id = $3::uuid)`,
    [companyId, driverId, truckId],
  );
}
