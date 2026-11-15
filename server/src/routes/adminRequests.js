import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { z } from 'zod';
import { asyncHandler, parse, notFound, conflict } from '../errors.js';
import { uuid, nullableText } from '../validation.js';
import { audit } from '../services/audit.js';
import { hashToken } from '../services/tokens.js';

const approveSchema = z.object({ planId: uuid.optional() }).strict();
const rejectSchema = z.object({ note: nullableText(500) }).strict();
const requestStatus = z.enum(['pending', 'approved', 'rejected', 'awaiting_payment', 'paid', 'expired']);
const INVITE_DAYS = 7;

function toRequest(r) {
  return {
    id: r.id,
    companyName: r.company_name,
    contactName: r.contact_name,
    email: r.email,
    phone: r.phone,
    dotNumber: r.dot_number,
    mcNumber: r.mc_number,
    address: r.address,
    message: r.message,
    status: r.status,
    createdAt: r.created_at,
    reviewedAt: r.reviewed_at,
    reviewNote: r.review_note,
    companyId: r.company_id,
    planName: r.plan_name ?? null,
    paidAt: r.paid_at ?? null,
  };
}

// Mounted inside the Super Admin router, which already checks the role.
export function registrationRequestRoutes({ db, config, mailer }) {
  const router = Router();

  router.get(
    '/registration-requests',
    asyncHandler(async (req, res) => {
      const status = req.query.status ? parse(requestStatus, req.query.status) : null;
      const { rows } = await db.query(
        `SELECT r.*, p.name AS plan_name FROM registration_requests r LEFT JOIN plans p ON p.id = r.plan_id
          WHERE ($1::text IS NULL OR r.status = $1)
          ORDER BY (r.status = 'pending') DESC, r.created_at DESC LIMIT 200`,
        [status],
      );
      res.json({ requests: rows.map(toRequest) });
    }),
  );

  // Approving creates the company and its administrator, starts the free trial when a plan is
  // chosen, and sends the administrator a one-time link to set their own password. No password
  // is ever created for them or emailed.
  router.post(
    '/registration-requests/:id/approve',
    asyncHandler(async (req, res) => {
      const id = parse(uuid, req.params.id);
      const { planId } = parse(approveSchema, req.body ?? {});
      const rawToken = crypto.randomBytes(32).toString('base64url');
      const unusablePassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), config.bcryptRounds);

      const out = await db.tx(async (q) => {
        const r = (await q.query('SELECT * FROM registration_requests WHERE id = $1 FOR UPDATE', [id])).rows[0];
        if (!r) throw notFound('Request not found');
        if (r.status !== 'pending') throw conflict('This request was already reviewed');
        if ((await q.query('SELECT 1 FROM users WHERE lower(email) = $1', [r.email.toLowerCase()])).rows.length) {
          throw conflict('An account with this email already exists');
        }
        let plan = null;
        if (planId) {
          plan = (await q.query('SELECT * FROM plans WHERE id = $1', [planId])).rows[0];
          if (!plan) throw notFound('Plan not found');
          if (!plan.is_active || plan.is_internal_only) throw conflict('This plan cannot be used for a new company');
        }

        const company = await q.query(
          `INSERT INTO companies (name, contact_email, contact_phone, address, dot_number, mc_number)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [r.company_name, r.email, r.phone, r.address, r.dot_number, r.mc_number],
        );
        const companyId = company.rows[0].id;
        const chosen = r.password_hash || null;
        const user = await q.query(
          `INSERT INTO users (company_id, role, name, email, password_hash)
           VALUES ($1, 'COMPANY_ADMIN', $2, $3, $4) RETURNING id`,
          [companyId, r.contact_name, r.email.toLowerCase(), chosen || unusablePassword],
        );
        if (plan) {
          await q.query(
            `INSERT INTO subscriptions (company_id, plan_id, status, price_cents, truck_limit, current_period_end)
             VALUES ($1, $2, 'trialing', $3, $4, now() + ($5 || ' days')::interval)`,
            [companyId, plan.id, plan.price_cents, plan.truck_limit, String(config.trialDays)],
          );
        }
        if (!chosen) {
          await q.query(
            `INSERT INTO password_tokens (user_id, purpose, token_hash, expires_at)
             VALUES ($1, 'invite', $2, now() + ($3 || ' days')::interval)`,
            [user.rows[0].id, hashToken(rawToken), String(INVITE_DAYS)],
          );
        }
        await q.query(
          `UPDATE registration_requests SET status = 'approved', reviewed_by = $2, reviewed_at = now(), company_id = $3 WHERE id = $1`,
          [id, req.auth.userId, companyId],
        );
        await audit(q, {
          companyId,
          actorUserId: req.auth.userId,
          action: 'REGISTRATION_APPROVED',
          details: { requestId: id, trial: !!plan },
          ip: req.ip,
        });
        return { companyId, name: r.contact_name, email: r.email, companyName: r.company_name, passwordChosen: Boolean(chosen) };
      });

      const inviteUrl = out.passwordChosen ? null : `${config.appUrl}/set-password?token=${rawToken}`;
      const mail = await mailer.send({
        to: out.email,
        subject: `Your ${out.companyName} account on 6.11 Drive GPS is ready`,
        text: [
          `Hello ${out.name},`,
          '',
          `Your company, ${out.companyName}, has been approved on 6.11 Drive GPS.`,
          planId ? `You have a ${config.trialDays}-day free trial.` : null,
          '',
          ...(out.passwordChosen
            ? [`Sign in at ${config.appUrl}/login with this email address and the password you chose.`]
            : [
                `Choose your password here (the link works once and expires in ${INVITE_DAYS} days):`,
                inviteUrl,
                '',
                `Then sign in at ${config.appUrl}/login with this email address.`,
              ]),
        ]
          .filter((l) => l !== null)
          .join('\n'),
      });
      // inviteUrl is returned so the admin can pass it on by hand when email is not set up.
      // It is null when the person chose their own password while creating the account.
      res.json({ companyId: out.companyId, inviteUrl, passwordChosen: out.passwordChosen, emailSent: mail.sent, trialDays: planId ? config.trialDays : null });
    }),
  );

  router.post(
    '/registration-requests/:id/reject',
    asyncHandler(async (req, res) => {
      const id = parse(uuid, req.params.id);
      const { note } = parse(rejectSchema, req.body ?? {});
      await db.tx(async (q) => {
        const r = (await q.query('SELECT status FROM registration_requests WHERE id = $1 FOR UPDATE', [id])).rows[0];
        if (!r) throw notFound('Request not found');
        if (r.status !== 'pending') throw conflict('This request was already reviewed');
        await q.query(
          `UPDATE registration_requests SET status = 'rejected', reviewed_by = $2, reviewed_at = now(), review_note = $3 WHERE id = $1`,
          [id, req.auth.userId, note],
        );
        await audit(q, { actorUserId: req.auth.userId, action: 'REGISTRATION_REJECTED', details: { requestId: id }, ip: req.ip });
      });
      res.status(204).end();
    }),
  );

  return router;
}
