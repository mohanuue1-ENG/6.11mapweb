import { Router } from 'express';
import { asyncHandler, HttpError } from '../errors.js';
import { requireRole } from '../middleware/auth.js';
import { truckUsage } from '../services/fleet.js';

export function toPlan(r) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    priceCents: r.price_cents,
    currency: r.currency,
    truckLimit: r.truck_limit,
    isInternalOnly: r.is_internal_only,
    isActive: r.is_active,
    createdAt: r.created_at,
  };
}

export const SUBSCRIPTION_SELECT = `
  SELECT s.id, s.company_id, s.status, s.price_cents, s.truck_limit, s.current_period_start,
         s.current_period_end, s.created_at, p.id AS plan_id, p.name AS plan_name
    FROM subscriptions s JOIN plans p ON p.id = s.plan_id`;

export function toSubscription(r) {
  return {
    id: r.id,
    companyId: r.company_id,
    plan: { id: r.plan_id, name: r.plan_name },
    status: r.status,
    priceCents: r.price_cents,
    truckLimit: r.truck_limit,
    currentPeriodStart: r.current_period_start,
    currentPeriodEnd: r.current_period_end,
  };
}

// Plans, the company's own subscription and payments. Mounted at the API root,
// so each route carries its own authentication.
export function billingRoutes({ db, authenticate }) {
  const router = Router();
  const admin = [authenticate, requireRole('COMPANY_ADMIN')];

  // Public: the pricing page lists what a company can subscribe to.
  router.get(
    '/plans',
    asyncHandler(async (req, res) => {
      const { rows } = await db.query(
        `SELECT * FROM plans WHERE is_active AND NOT is_internal_only ORDER BY price_cents, name`,
      );
      res.json({ plans: rows.map(toPlan) });
    }),
  );

  router.get(
    '/subscriptions/current',
    ...admin,
    asyncHandler(async (req, res) => {
      const { rows } = await db.query(
        `${SUBSCRIPTION_SELECT} WHERE s.company_id = $1 AND s.status IN ('trialing', 'active', 'past_due', 'suspended')`,
        [req.auth.companyId],
      );
      res.json({
        subscription: rows[0] ? toSubscription(rows[0]) : null,
        usage: await truckUsage(db, req.auth.companyId),
      });
    }),
  );

  router.get(
    '/payments',
    ...admin,
    asyncHandler(async (req, res) => {
      const { rows } = await db.query(
        `SELECT id, amount_cents, currency, status, paid_at, created_at FROM payments
          WHERE company_id = $1 ORDER BY created_at DESC LIMIT 200`,
        [req.auth.companyId],
      );
      res.json({
        payments: rows.map((r) => ({
          id: r.id,
          amountCents: r.amount_cents,
          currency: r.currency,
          status: r.status,
          paidAt: r.paid_at,
          createdAt: r.created_at,
        })),
      });
    }),
  );

  // The payment provider is still to be chosen (PRD section 14). Until one is
  // configured, checkout is refused rather than pretending to take money.
  router.post(
    '/payments/checkout',
    ...admin,
    asyncHandler(async () => {
      throw new HttpError(501, 'NOT_CONFIGURED', 'Online payment is not available yet. Contact 6.11 to change your plan.');
    }),
  );

  return router;
}
