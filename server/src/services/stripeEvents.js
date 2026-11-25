import { fulfillAccountCheckout, fulfillPaidSignup } from './signup.js';
import { audit } from './audit.js';

const LIVE = `('trialing', 'active', 'past_due')`;
const fromUnix = (s) => (s ? new Date(s * 1000) : null);

// Applies one verified Stripe event. Every branch is safe to run twice (Stripe retries).
export async function handleStripeEvent(deps, event) {
  const { db } = deps;
  const obj = event.data.object;

  switch (event.type) {
    // The first payment: this is what creates the account.
    case 'checkout.session.completed': {
      if (obj.payment_status !== 'paid') return { handled: false, reason: 'not paid yet' };
      const payment = {
        sessionId: obj.id,
        amountCents: obj.amount_total,
        currency: obj.currency || 'usd',
        customerId: obj.customer || null,
        subscriptionId: obj.subscription || null,
        reference: obj.payment_intent || obj.id,
      };
      // A company that already has its account pays for a plan; otherwise this is the older pay-first sign-up.
      const account = await fulfillAccountCheckout(deps, payment);
      if (account.status !== 'unknown') return { handled: true, result: account.status };
      const result = await fulfillPaidSignup(deps, payment);
      return { handled: true, result: result.status };
    }

    // Later months: extend the period and record the payment. The first invoice is covered above.
    case 'invoice.paid': {
      if (obj.billing_reason === 'subscription_create') return { handled: true, result: 'covered by checkout' };
      const subId = obj.subscription ?? obj.parent?.subscription_details?.subscription;
      const end = fromUnix(obj.lines?.data?.[0]?.period?.end);
      if (!subId || !end) return { handled: false, reason: 'no subscription or period' };
      const sub = (await db.query('SELECT id, company_id FROM subscriptions WHERE provider_subscription_id = $1', [subId])).rows[0];
      if (!sub) return { handled: false, reason: 'unknown subscription' };
      await db.tx(async (q) => {
        await q.query(
          `UPDATE subscriptions SET status = 'active', failed_payments = 0, current_period_end = GREATEST(COALESCE(current_period_end, $2), $2), updated_at = now() WHERE id = $1`,
          [sub.id, end],
        );
        await q.query(
          `INSERT INTO payments (company_id, subscription_id, amount_cents, currency, status, provider, provider_reference, paid_at)
           VALUES ($1, $2, $3, $4, 'succeeded', 'stripe', $5, now()) ON CONFLICT (provider, provider_reference) DO NOTHING`,
          [sub.company_id, sub.id, obj.amount_paid ?? 0, (obj.currency || 'usd').toUpperCase(), obj.id],
        );
      });
      return { handled: true, result: 'renewed' };
    }

    case 'invoice.payment_failed': {
      const subId = obj.subscription ?? obj.parent?.subscription_details?.subscription;
      if (!subId) return { handled: false, reason: 'no subscription' };
      const { rows } = await db.query(
        `UPDATE subscriptions SET status = 'past_due', failed_payments = failed_payments + 1, updated_at = now()
          WHERE provider_subscription_id = $1 AND status IN ${LIVE} RETURNING id, company_id, failed_payments`,
        [subId],
      );
      // Too many failed payments: the company is blocked by itself. The platform owner can open it again from Companies.
      const limit = deps.config?.maxFailedPayments ?? 10;
      if (rows[0] && rows[0].failed_payments >= limit) {
        await db.tx(async (q) => {
          await q.query(`UPDATE companies SET status = 'suspended', updated_at = now() WHERE id = $1 AND status = 'active'`, [rows[0].company_id]);
          await q.query(`UPDATE subscriptions SET status = 'suspended', updated_at = now() WHERE id = $1`, [rows[0].id]);
          await audit(q, { companyId: rows[0].company_id, action: 'COMPANY_STATUS_CHANGED', details: { status: 'suspended', reason: `${limit} failed payments` } });
        });
        return { handled: true, result: 'blocked' };
      }
      return { handled: true, result: 'past_due' };
    }

    case 'customer.subscription.deleted': {
      await db.query(
        `UPDATE subscriptions SET status = 'cancelled', cancelled_at = now(), updated_at = now() WHERE provider_subscription_id = $1`,
        [obj.id],
      );
      return { handled: true, result: 'cancelled' };
    }

    default:
      return { handled: false, reason: 'ignored event type' };
  }
}
