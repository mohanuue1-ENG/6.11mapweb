import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, parse, badRequest, conflict, HttpError } from '../errors.js';
import { audit } from '../services/audit.js';
import { uuid } from '../validation.js';
import { requireRole } from '../middleware/auth.js';
import { truckUsage } from '../services/fleet.js';
import { amountFor, yearlyCents } from '../services/plans.js';

export function toPlan(r) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    priceCents: r.price_cents,
    currency: r.currency,
    truckLimit: r.truck_limit,
    product: r.product ?? 'trackova',
    yearlyDiscountPercent: r.yearly_discount_percent ?? 0,
    yearlyPriceCents: yearlyCents(r.price_cents, r.yearly_discount_percent ?? 0),
    isInternalOnly: r.is_internal_only,
    isActive: r.is_active,
    createdAt: r.created_at,
  };
}

export const SUBSCRIPTION_SELECT = `
  SELECT s.id, s.company_id, s.status, s.price_cents, s.truck_limit, s.current_period_start,
         s.current_period_end, s.billing_interval, s.product, s.created_at, p.id AS plan_id, p.name AS plan_name
    FROM subscriptions s JOIN plans p ON p.id = s.plan_id`;

export function toSubscription(r) {
  return {
    id: r.id,
    companyId: r.company_id,
    plan: { id: r.plan_id, name: r.plan_name },
    status: r.status,
    billingInterval: r.billing_interval ?? 'month',
    product: r.product ?? 'trackova',
    priceCents: r.price_cents,
    truckLimit: r.truck_limit,
    currentPeriodStart: r.current_period_start,
    currentPeriodEnd: r.current_period_end,
  };
}

// Plans, the company's own subscription and payments. Mounted at the API root,
// so each route carries its own authentication.
export function billingRoutes({ db, authenticate, config, payments }) {
  // A plan for Loadova (or both) is listed, but cannot be bought until Loadova is available.
  const purchasable = (planRow) => planRow.product === 'trackova' || Boolean(config?.loadovaAvailable);
  const router = Router();
  const admin = [authenticate, requireRole('COMPANY_ADMIN')];

  // Public: the pricing page lists what a company can subscribe to.
  router.get(
    '/plans',
    asyncHandler(async (req, res) => {
      const { rows } = await db.query(
        `SELECT * FROM plans WHERE is_active AND NOT is_internal_only ORDER BY price_cents, name`,
      );
      res.json({ plans: rows.map((r) => ({ ...toPlan(r), purchasable: purchasable(r) })) });
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

  // POST /payments/checkout: the company chose a plan, so open the payment page. When the payment is confirmed the
  // subscription becomes active, and that is what opens the dashboard.
  router.post(
    '/payments/checkout',
    ...admin,
    asyncHandler(async (req, res) => {
      const { planId, interval } = parse(z.object({ planId: uuid, interval: z.enum(['month', 'year']).default('month') }).strict(), req.body);
      if (!payments) {
        throw new HttpError(503, 'PAYMENTS_UNAVAILABLE', 'Online payment is not available right now. Please try again later.');
      }
      const plan = (await db.query('SELECT * FROM plans WHERE id = $1 AND is_active AND NOT is_internal_only', [planId])).rows[0];
      if (!plan) throw badRequest('Choose one of the listed plans');
      if (!purchasable(plan)) throw new HttpError(409, 'COMING_SOON', 'This plan is not available yet. Contact us to join the waiting list.');
      const live = await db.query(`SELECT 1 FROM subscriptions WHERE company_id = $1 AND status IN ('trialing', 'active', 'past_due', 'suspended')`, [req.auth.companyId]);
      if (live.rows.length) throw conflict('Your company already has a plan.');

      const checkout = await db.tx(async (q) => {
        await q.query(`UPDATE account_checkouts SET status = 'expired' WHERE company_id = $1 AND status = 'awaiting_payment'`, [req.auth.companyId]);
        return (
          await q.query(`INSERT INTO account_checkouts (company_id, plan_id, provider, billing_interval) VALUES ($1, $2, $3, $4) RETURNING *`, [req.auth.companyId, plan.id, payments.name, interval])
        ).rows[0];
      });
      let opened;
      try {
        opened = await payments.createCheckout({
          request: { id: checkout.id, email: req.auth.user.email },
          plan,
          config,
          interval,
          amountCents: amountFor(plan, interval),
          successUrl: `${config.appUrl}/subscribe/complete?session={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${config.appUrl}/subscribe?canceled=1`,
        });
      } catch (err) {
        console.error('[payments] could not open checkout:', err.message);
        await db.query(`UPDATE account_checkouts SET status = 'expired' WHERE id = $1`, [checkout.id]);
        throw new HttpError(502, 'PAYMENT_PROVIDER_ERROR', 'We could not start the payment. Please try again.');
      }
      await db.query('UPDATE account_checkouts SET provider_session_id = $2 WHERE id = $1', [checkout.id, opened.sessionId]);
      await audit(db, { companyId: req.auth.companyId, actorUserId: req.auth.userId, action: 'CHECKOUT_STARTED', details: { plan: plan.name, interval, provider: payments.name }, ip: req.ip });
      res.status(201).json({ checkoutUrl: opened.url, sessionId: opened.sessionId });
    }),
  );

  // POST /billing/portal: the page where the owner updates the card. The customer id is the one the payment provider gave at the first payment.
  router.post(
    '/billing/portal',
    ...admin,
    asyncHandler(async (req, res) => {
      const sub = (
        await db.query(
          `SELECT provider_customer_id FROM subscriptions WHERE company_id = $1 AND status IN ('trialing', 'active', 'past_due', 'suspended') ORDER BY created_at DESC LIMIT 1`,
          [req.auth.companyId],
        )
      ).rows[0];
      if (!sub) throw conflict('Your company has no plan to update.');
      if (!payments?.createPortal || (payments.name === 'stripe' && !sub.provider_customer_id)) {
        throw new HttpError(503, 'PAYMENTS_UNAVAILABLE', 'Updating the payment is not available right now. Please contact us.');
      }
      try {
        const opened = await payments.createPortal({ customerId: sub.provider_customer_id, returnUrl: `${config.appUrl}/company/dashboard` });
        res.json({ url: opened.url });
      } catch (err) {
        console.error('[payments] could not open the billing portal:', err.message);
        throw new HttpError(502, 'PAYMENT_PROVIDER_ERROR', 'We could not open the payment page. Please try again.');
      }
    }),
  );

  return router;
}
