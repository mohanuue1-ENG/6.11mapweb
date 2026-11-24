import { audit } from './audit.js';
import { amountFor, periodDays } from './plans.js';
import { createCompanyAndAdmin, inviteUrl, sendInviteEmail, sendWelcomeEmail } from './onboarding.js';

const PERIOD_DAYS = 30;

// Turns a confirmed payment into a working account: company, administrator, active
// subscription, payment record and the email with the one-time password link.
// Safe to call more than once for the same payment (providers retry): the second call does nothing.
//
// Returns { status: 'created' | 'already' | 'unknown' | 'conflict' | 'ignored', ... }.
export async function fulfillPaidSignup({ db, config, mailer }, payment) {
  const { sessionId, amountCents, currency = 'USD', customerId = null, subscriptionId = null, reference = null } = payment;

  const out = await db.tx(async (q) => {
    const r = (await q.query('SELECT * FROM registration_requests WHERE provider_session_id = $1 FOR UPDATE', [sessionId])).rows[0];
    if (!r) return { status: 'unknown' };
    if (r.status === 'paid') return { status: 'already' };
    // Money was taken, so an abandoned/expired request is still honoured; anything else is not ours to fulfil.
    if (!['awaiting_payment', 'expired'].includes(r.status)) return { status: 'ignored' };
    if ((await q.query('SELECT 1 FROM users WHERE lower(email) = $1', [r.email.toLowerCase()])).rows.length) {
      return { status: 'conflict', request: r };
    }
    const plan = (await q.query('SELECT * FROM plans WHERE id = $1', [r.plan_id])).rows[0];

    const periodEnd = new Date(Date.now() + PERIOD_DAYS * 24 * 60 * 60 * 1000);
    const created = await createCompanyAndAdmin(q, config, r, {
      plan,
      subscription: { status: 'active', periodEnd, provider: r.provider, customerId, subscriptionId },
    });
    await q.query(
      `INSERT INTO payments (company_id, subscription_id, amount_cents, currency, status, provider, provider_reference, paid_at)
       VALUES ($1, $2, $3, $4, 'succeeded', $5, $6, now())
       ON CONFLICT (provider, provider_reference) DO NOTHING`,
      [created.companyId, created.subscriptionId, amountCents ?? plan.price_cents, currency.toUpperCase(), r.provider, reference ?? sessionId],
    );
    await q.query(
      `UPDATE registration_requests SET status = 'paid', paid_at = now(), company_id = $2 WHERE id = $1`,
      [r.id, created.companyId],
    );
    await audit(q, {
      companyId: created.companyId,
      action: 'SIGNUP_PAID',
      details: { requestId: r.id, plan: plan.name, provider: r.provider },
    });
    return { status: 'created', request: r, plan, ...created };
  });

  if (out.status === 'conflict') {
    // Paid for an email that already has an account: needs a human (refund or merge).
    console.error(`[signup] payment ${sessionId} is for ${out.request.email}, which already has an account. Handle it by hand.`);
  }
  if (out.status !== 'created') return out;

  const r = out.request;
  // Mail problems never undo a paid sign-up: the admin can still hand over a link from the dashboard.
  const intro = `Thank you. Your payment was received and your company, ${r.company_name}, is ready on 6.11 Drive GPS (plan: ${out.plan.name}).`;
  const mail = out.passwordChosen
    ? await sendWelcomeEmail(mailer, config, { to: r.email, name: r.contact_name, companyName: r.company_name, intro })
    : await sendInviteEmail(mailer, config, { to: r.email, name: r.contact_name, companyName: r.company_name, rawToken: out.rawToken, intro });
  if (config.adminNotifyEmail) {
    await mailer.send({
      to: config.adminNotifyEmail,
      subject: `New paid sign-up: ${r.company_name}`,
      text: `${r.company_name} (${r.contact_name} <${r.email}>) paid for the ${out.plan.name} plan and its account was created.\n\n${config.appUrl}/superadmin/companies`,
    });
  }
  return { ...out, emailSent: mail.sent, inviteUrl: inviteUrl(config, out.rawToken) };
}


// A company that already has its account has paid for a plan: the subscription becomes active, which opens the dashboard.
// Safe to call more than once for the same payment. Returns { status: 'created' | 'already' | 'unknown' | 'conflict' }.
export async function fulfillAccountCheckout({ db, config, mailer }, payment) {
  const { sessionId, amountCents, currency = 'USD', customerId = null, subscriptionId = null, reference = null } = payment;
  const out = await db.tx(async (q) => {
    const r = (await q.query('SELECT * FROM account_checkouts WHERE provider_session_id = $1 FOR UPDATE', [sessionId])).rows[0];
    if (!r) return { status: 'unknown' };
    if (r.status === 'paid') return { status: 'already' };
    const live = await q.query(`SELECT 1 FROM subscriptions WHERE company_id = $1 AND status IN ('trialing', 'active', 'past_due', 'suspended')`, [r.company_id]);
    if (live.rows.length) return { status: 'conflict', checkout: r };
    const plan = (await q.query('SELECT * FROM plans WHERE id = $1', [r.plan_id])).rows[0];
    const company = (await q.query('SELECT name, contact_email FROM companies WHERE id = $1', [r.company_id])).rows[0];
    const interval = r.billing_interval === 'year' ? 'year' : 'month';
    const price = amountFor(plan, interval);
    const periodEnd = new Date(Date.now() + periodDays(interval) * 24 * 60 * 60 * 1000);
    const sub = await q.query(
      `INSERT INTO subscriptions (company_id, plan_id, status, price_cents, truck_limit, current_period_end, billing_interval, product, provider, provider_customer_id, provider_subscription_id)
       VALUES ($1, $2, 'active', $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [r.company_id, plan.id, price, plan.truck_limit, periodEnd, interval, plan.product ?? 'trackova', r.provider, customerId, subscriptionId],
    );
    await q.query(
      `INSERT INTO payments (company_id, subscription_id, amount_cents, currency, status, provider, provider_reference, paid_at)
       VALUES ($1, $2, $3, $4, 'succeeded', $5, $6, now()) ON CONFLICT (provider, provider_reference) DO NOTHING`,
      [r.company_id, sub.rows[0].id, amountCents ?? price, currency.toUpperCase(), r.provider, reference ?? sessionId],
    );
    await q.query(`UPDATE account_checkouts SET status = 'paid', paid_at = now() WHERE id = $1`, [r.id]);
    await audit(q, { companyId: r.company_id, action: 'SUBSCRIPTION_PAID', details: { checkoutId: r.id, plan: plan.name, interval, provider: r.provider } });
    return { status: 'created', plan, company };
  });
  if (out.status === 'conflict') {
    console.error(`[billing] payment ${sessionId} is for a company that already has a plan. Handle it by hand (refund).`);
  }
  if (out.status === 'created' && config.adminNotifyEmail) {
    await mailer.send({
      to: config.adminNotifyEmail,
      subject: `New paid plan: ${out.company.name}`,
      text: `${out.company.name} (${out.company.contact_email}) paid for the ${out.plan.name} plan.\n\n${config.appUrl}/superadmin/companies`,
    });
  }
  return out;
}
