import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { hashToken } from './tokens.js';

export const INVITE_DAYS = 7;

// Creates a company, its first administrator and (when a plan is given) its subscription.
// The administrator gets an unusable password and a one-time link to choose their own, so
// no password is ever created for them or sent to them. Runs inside the caller's transaction.
//   subscription: { status, periodEnd, provider, customerId, subscriptionId }
export async function createCompanyAndAdmin(q, config, request, { plan = null, subscription = null } = {}) {
  // A password chosen at sign-up is used as it is; otherwise the administrator gets an unusable one and a link.
  const chosen = request.password_hash || null;
  const initialPassword = chosen || (await bcrypt.hash(crypto.randomBytes(32).toString('hex'), config.bcryptRounds));
  const rawToken = crypto.randomBytes(32).toString('base64url');

  const company = await q.query(
    `INSERT INTO companies (name, contact_email, contact_phone, address, dot_number, mc_number)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [request.company_name, request.email, request.phone, request.address, request.dot_number, request.mc_number],
  );
  const companyId = company.rows[0].id;
  const user = await q.query(
    `INSERT INTO users (company_id, role, name, email, password_hash)
     VALUES ($1, 'COMPANY_ADMIN', $2, $3, $4) RETURNING id`,
    [companyId, request.contact_name, request.email.toLowerCase(), initialPassword],
  );
  const userId = user.rows[0].id;

  let subscriptionId = null;
  if (plan && subscription) {
    const sub = await q.query(
      `INSERT INTO subscriptions
         (company_id, plan_id, status, price_cents, truck_limit, current_period_end, provider, provider_customer_id, provider_subscription_id, product)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [
        companyId,
        plan.id,
        subscription.status,
        plan.price_cents,
        plan.truck_limit,
        subscription.periodEnd,
        subscription.provider ?? null,
        subscription.customerId ?? null,
        subscription.subscriptionId ?? null,
        plan.product ?? 'trackova',
      ],
    );
    subscriptionId = sub.rows[0].id;
  }

  if (!chosen) {
    await q.query(
      `INSERT INTO password_tokens (user_id, purpose, token_hash, expires_at)
       VALUES ($1, 'invite', $2, now() + ($3 || ' days')::interval)`,
      [userId, hashToken(rawToken), String(INVITE_DAYS)],
    );
  }
  return { companyId, userId, subscriptionId, rawToken: chosen ? null : rawToken, passwordChosen: Boolean(chosen) };
}

export const inviteUrl = (config, rawToken) => (rawToken ? `${config.appUrl}/set-password?token=${rawToken}` : null);

// For people who chose their password when they created the account: nothing to set, just sign in.
export function sendWelcomeEmail(mailer, config, { to, name, companyName, intro }) {
  return mailer.send({
    to,
    subject: `Your ${companyName} account on 6.11 Drive GPS is ready`,
    text: [`Hello ${name},`, '', intro, '', `Sign in at ${config.appUrl}/login with this email address and the password you chose.`].join('\n'),
  });
}

// The email that carries the one-time link.
export function sendInviteEmail(mailer, config, { to, name, companyName, rawToken, intro }) {
  return mailer.send({
    to,
    subject: `Your ${companyName} account on 6.11 Drive GPS is ready`,
    text: [
      `Hello ${name},`,
      '',
      intro,
      '',
      `Choose your password here (the link works once and expires in ${INVITE_DAYS} days):`,
      inviteUrl(config, rawToken),
      '',
      `Then sign in at ${config.appUrl}/login with this email address.`,
    ].join('\n'),
  });
}
