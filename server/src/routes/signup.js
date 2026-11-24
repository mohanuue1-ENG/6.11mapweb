import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, parse, notFound, HttpError } from '../errors.js';
import { fulfillAccountCheckout, fulfillPaidSignup } from '../services/signup.js';
import { handleStripeEvent } from '../services/stripeEvents.js';

const sessionQuery = z.object({ session: z.string().min(8).max(300) });

// Online sign-up support: what the browser asks after paying, the provider's webhook, and
// the local "mock" payment used only when no real provider is configured.
export function signupRoutes({ db, config, mailer, payments }) {
  const router = Router();
  const deps = { db, config, mailer };

  // GET /signup/status?session=… — the "payment received" page asks until the account exists.
  router.get(
    '/status',
    asyncHandler(async (req, res) => {
      const { session } = parse(sessionQuery, req.query);
      const account = (
        await db.query(
          `SELECT a.status, p.name AS plan_name, p.price_cents FROM account_checkouts a JOIN plans p ON p.id = a.plan_id WHERE a.provider_session_id = $1`,
          [session],
        )
      ).rows[0];
      if (account) {
        return res.json({ status: account.status, passwordChosen: true, planName: account.plan_name, amountCents: account.price_cents, provider: payments?.name ?? null });
      }
      const { rows } = await db.query(
        `SELECT r.status, r.email, (r.password_hash IS NOT NULL) AS password_chosen, p.name AS plan_name, p.price_cents
           FROM registration_requests r LEFT JOIN plans p ON p.id = r.plan_id
          WHERE r.provider_session_id = $1`,
        [session],
      );
      if (!rows[0]) throw notFound('Unknown payment session');
      res.json({
        status: rows[0].status,
        passwordChosen: rows[0].password_chosen,
        planName: rows[0].plan_name,
        amountCents: rows[0].price_cents,
        provider: payments?.name ?? null,
      });
    }),
  );

  // POST /signup/webhooks/stripe — Stripe tells us a payment happened. The body must be the raw
  // bytes (the signature covers them); app.js mounts express.raw for this path.
  router.post(
    '/webhooks/stripe',
    asyncHandler(async (req, res) => {
      if (payments?.name !== 'stripe') throw notFound('Not found');
      let event;
      try {
        event = payments.constructEvent(req.body, req.get('stripe-signature') || '');
      } catch {
        throw new HttpError(400, 'BAD_SIGNATURE', 'Invalid signature');
      }
      const outcome = await handleStripeEvent(deps, event);
      // Anything other than success must be a non-2xx so Stripe retries it.
      res.json({ received: true, ...outcome });
    }),
  );

  // POST /signup/mock/complete — "pays" a fake checkout. Exists only for the mock provider.
  router.post(
    '/mock/complete',
    asyncHandler(async (req, res) => {
      if (payments?.name !== 'mock') throw notFound('Not found');
      const { session } = parse(z.object({ session: z.string().min(8).max(300) }).strict(), req.body);
      const account = await fulfillAccountCheckout(deps, { sessionId: session, amountCents: null, reference: session });
      if (account.status !== 'unknown') {
        return res.json({ status: account.status === 'created' || account.status === 'already' ? 'paid' : account.status, devInviteUrl: null });
      }
      const result = await fulfillPaidSignup(deps, { sessionId: session, amountCents: null, reference: session });
      if (result.status === 'unknown') throw notFound('Unknown payment session');
      // The link is returned here (and only here, only for the mock) so the flow can be tried without email.
      res.json({ status: result.status, devInviteUrl: result.inviteUrl && !mailer.configured ? result.inviteUrl : null });
    }),
  );

  return router;
}
