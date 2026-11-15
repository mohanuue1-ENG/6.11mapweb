import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, parse, badRequest, conflict, HttpError } from '../errors.js';
import bcrypt from 'bcryptjs';
import { email, password, requiredText, nullableText, uuid } from '../validation.js';
import { audit } from '../services/audit.js';

const requestSchema = z
  .object({
    companyName: requiredText(200),
    contactName: requiredText(200),
    email,
    phone: nullableText(40),
    dotNumber: nullableText(40),
    mcNumber: nullableText(40),
    address: nullableText(500),
    message: nullableText(1000),
    // Chosen on the "Create account" step. Never stored as typed: only its bcrypt hash is kept.
    password: password.optional(),
    // With a plan the company pays online and its account is created when the payment is confirmed.
    // Without one this is a plain request that the platform admin reviews.
    planId: uuid.optional(),
  })
  .strict();

// POST /registration-requests â€” public.
export function accessRoutes({ db, config, mailer, payments }) {
  const router = Router();

  // Paid sign-up: save the request, open a checkout at the provider, and send the browser there.
  async function startCheckout(req, res, input, passwordHash) {
    if (!payments) {
      throw new HttpError(503, 'PAYMENTS_UNAVAILABLE', 'Online payment is not available right now. Please try again later.');
    }
    const plan = (await db.query('SELECT * FROM plans WHERE id = $1 AND is_active AND NOT is_internal_only', [input.planId])).rows[0];
    if (!plan) throw badRequest('Choose one of the listed plans');

    const request = await db.tx(async (q) => {
      // Here the person is about to pay, so a clear message beats hiding that the email is known.
      if ((await q.query('SELECT 1 FROM users WHERE lower(email) = $1', [input.email])).rows.length) {
        throw conflict('This email already has an account. Sign in instead.');
      }
      // A new attempt replaces earlier unfinished ones for the same email.
      await q.query(`UPDATE registration_requests SET status = 'expired' WHERE lower(email) = $1 AND status = 'awaiting_payment'`, [input.email]);
      const { rows } = await q.query(
        `INSERT INTO registration_requests
           (company_name, contact_name, email, phone, dot_number, mc_number, address, message, ip_address, status, plan_id, provider, password_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'awaiting_payment', $10, $11, $12) RETURNING *`,
        [input.companyName, input.contactName, input.email, input.phone, input.dotNumber, input.mcNumber, input.address, input.message, req.ip, plan.id, payments.name, passwordHash],
      );
      return rows[0];
    });

    let checkout;
    try {
      checkout = await payments.createCheckout({
        request,
        plan,
        config,
        successUrl: `${config.appUrl}/signup/complete?session={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${config.appUrl}/join?canceled=1`,
      });
    } catch (err) {
      console.error('[payments] could not open checkout:', err.message);
      await db.query(`UPDATE registration_requests SET status = 'expired' WHERE id = $1`, [request.id]);
      throw new HttpError(502, 'PAYMENT_PROVIDER_ERROR', 'We could not start the payment. Please try again.');
    }
    await db.query('UPDATE registration_requests SET provider_session_id = $2 WHERE id = $1', [request.id, checkout.sessionId]);
    await audit(db, { action: 'SIGNUP_STARTED', details: { requestId: request.id, plan: plan.name, provider: payments.name }, ip: req.ip });

    // The mock provider needs the real session id in its URL; Stripe replaces {CHECKOUT_SESSION_ID} itself.
    res.status(201).json({ checkoutUrl: checkout.url, sessionId: checkout.sessionId });
  }

  // Plain request for the admin to review. The answer is the same whether or not the email is
  // already known, so the form cannot be used to find out who has an account.
  async function plainRequest(req, res, input, passwordHash) {
    const requestId = await db.tx(async (q) => {
      const known = await q.query('SELECT 1 FROM users WHERE lower(email) = $1', [input.email]);
      if (known.rows.length) return null;
      const { rows } = await q.query(
        `INSERT INTO registration_requests
           (company_name, contact_name, email, phone, dot_number, mc_number, address, message, ip_address, password_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (lower(email)) WHERE status = 'pending' DO NOTHING
         RETURNING id`,
        [input.companyName, input.contactName, input.email, input.phone, input.dotNumber, input.mcNumber, input.address, input.message, req.ip, passwordHash],
      );
      if (!rows[0]) return null;
      await audit(q, { action: 'ACCESS_REQUESTED', details: { requestId: rows[0].id, companyName: input.companyName }, ip: req.ip });
      return rows[0].id;
    });

    // Tell the platform admin by email. The request is already saved, so a mail problem changes nothing.
    if (requestId && config.adminNotifyEmail) {
      await mailer.send({
        to: config.adminNotifyEmail,
        subject: `New access request: ${input.companyName}`,
        text: [
          'A company has asked to join 6.11 Drive GPS.',
          '',
          `Company: ${input.companyName}`,
          `Contact: ${input.contactName} <${input.email}>`,
          input.phone ? `Phone: ${input.phone}` : null,
          input.dotNumber ? `USDOT: ${input.dotNumber}` : null,
          input.message ? `Message: ${input.message}` : null,
          '',
          `Review it: ${config.appUrl}/superadmin/requests`,
        ]
          .filter((l) => l !== null)
          .join('\n'),
      });
    }
    res.status(202).json({ ok: true });
  }

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const input = parse(requestSchema, req.body);
      const passwordHash = input.password ? await bcrypt.hash(input.password, config.bcryptRounds) : null;
      return input.planId ? startCheckout(req, res, input, passwordHash) : plainRequest(req, res, input, passwordHash);
    }),
  );

  return router;
}
