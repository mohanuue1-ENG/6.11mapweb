import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import Stripe from 'stripe';
import { createTestContext, bearer } from './helpers.js';
import { createApp } from '../src/app.js';

const V1 = '/api/v1';
const SECRET = 'whsec_test_secret_for_unit_tests';
const stripeLib = new Stripe('sk_test_unit_tests_only');

let ctx, root, plan, stripeApp;
const as = (session) => ({
  get: (path) => ctx.api().get(V1 + path).set(bearer(session)),
  post: (path, body) => ctx.api().post(V1 + path).set(bearer(session)).send(body),
});
const form = (over = {}) => ({
  companyName: 'Paying Freight',
  contactName: 'Paula Payer',
  email: `paula-${crypto.randomBytes(3).toString('hex')}@example.test`,
  planId: plan.id,
  ...over,
});
const token = (text) => new URL(text.match(/https?:\/\/\S+/)[0]).searchParams.get('token');

// A Stripe-like provider whose signature check is the real one.
const fakeStripe = {
  name: 'stripe',
  createCheckout: async ({ request: r }) => ({ url: `https://checkout.example/${r.id}`, sessionId: `cs_test_${crypto.randomBytes(6).toString('hex')}` }),
  constructEvent: (raw, sig) => stripeLib.webhooks.constructEvent(raw, sig, SECRET),
};
const signed = (event) => {
  const payload = JSON.stringify(event);
  return { payload, header: Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET }) };
};
const webhook = (event, header) => {
  const { payload, header: good } = signed(event);
  return request(stripeApp).post(`${V1}/signup/webhooks/stripe`).set('Content-Type', 'application/json').set('Stripe-Signature', header ?? good).send(payload);
};

before(async () => {
  ctx = await createTestContext();
  root = await ctx.createSuperAdmin();
  plan = (await as(root).post('/admin/plans', { name: 'Fleet', priceCents: 12900, truckLimit: 5 })).body.plan;
  stripeApp = createApp({ db: ctx.db, config: ctx.config, mailer: { configured: true, send: async (m) => (ctx.mail.push(m), { sent: true }) }, payments: fakeStripe });
});
after(async () => {
  await ctx.db.close();
});

test('paying through the (mock) checkout creates the company, an active plan and a password link', async () => {
  const body = form();
  const res = await ctx.api().post(`${V1}/registration-requests`).send(body);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.ok(res.body.checkoutUrl.includes('/mock-checkout?session=mock_'));

  // Before payment: nothing exists.
  const status = await ctx.api().get(`${V1}/signup/status?session=${res.body.sessionId}`);
  assert.equal(status.body.status, 'awaiting_payment');
  assert.equal(status.body.planName, 'Fleet');
  assert.equal((await ctx.db.query('SELECT count(*)::int AS n FROM users WHERE email = $1', [body.email])).rows[0].n, 0);

  // The payment is confirmed.
  const paid = await ctx.api().post(`${V1}/signup/mock/complete`).send({ session: res.body.sessionId });
  assert.equal(paid.status, 200);
  assert.equal(paid.body.status, 'created');
  assert.ok(paid.body.devInviteUrl === null || paid.body.devInviteUrl.includes('/set-password?token='));
  assert.equal((await ctx.api().get(`${V1}/signup/status?session=${res.body.sessionId}`)).body.status, 'paid');

  const row = (
    await ctx.db.query(
      `SELECT c.name, u.role, s.status, s.price_cents, s.truck_limit,
              (EXTRACT(EPOCH FROM (s.current_period_end - now())) / 86400)::float8 AS days,
              (SELECT count(*)::int FROM payments p WHERE p.company_id = c.id AND p.status = 'succeeded') AS payments
         FROM users u JOIN companies c ON c.id = u.company_id JOIN subscriptions s ON s.company_id = c.id
        WHERE u.email = $1`,
      [body.email],
    )
  ).rows[0];
  assert.equal(row.name, 'Paying Freight');
  assert.equal(row.role, 'COMPANY_ADMIN');
  assert.equal(row.status, 'active');
  assert.equal(row.price_cents, 12900);
  assert.equal(row.truck_limit, 5);
  assert.ok(row.days > 29 && row.days <= 30.01);
  assert.equal(row.payments, 1);

  // The email carries a one-time link, not a password; the admin is told too.
  const invite = ctx.mail.find((m) => m.to === body.email);
  assert.ok(invite && !/password:/i.test(invite.text));
  assert.ok(ctx.mail.some((m) => m.to === 'owner@example.test' && m.subject.includes('Paying Freight')));

  // They choose a password, sign in, and see their own dashboard data.
  const pw = `Aa1!${crypto.randomBytes(8).toString("base64url")}`;
  assert.equal((await ctx.api().post(`${V1}/auth/set-password`).send({ token: token(invite.text), password: pw })).status, 204);
  const login = await ctx.api().post(`${V1}/auth/login`).send({ email: body.email, password: pw });
  assert.equal(login.status, 200);
  assert.equal((await as(login.body).get('/subscriptions/current')).body.subscription.status, 'active');

  // A repeated confirmation changes nothing.
  const again = await ctx.api().post(`${V1}/signup/mock/complete`).send({ session: res.body.sessionId });
  assert.equal(again.body.status, 'already');
  assert.equal((await ctx.db.query('SELECT count(*)::int AS n FROM companies WHERE name = $1', ['Paying Freight'])).rows[0].n, 1);
});

test('sign-up input is checked before any payment is opened', async () => {
  const post = (b) => ctx.api().post(`${V1}/registration-requests`).send(b);
  const existing = await ctx.registerCompany('Taken Co');
  assert.equal((await post(form({ email: existing.email }))).status, 409);
  assert.equal((await post(form({ planId: crypto.randomUUID() }))).status, 400);

  const internal = (await as(root).post('/admin/plans', { name: 'Internal Only', priceCents: 0, isInternalOnly: true })).body.plan;
  assert.equal((await post(form({ planId: internal.id }))).status, 400);
  const off = (await as(root).post('/admin/plans', { name: 'Switched Off', priceCents: 100 })).body.plan;
  await ctx.api().patch(`${V1}/admin/plans/${off.id}`).set(bearer(root)).send({ isActive: false });
  assert.equal((await post(form({ planId: off.id }))).status, 400);
  assert.equal((await post({ ...form(), companyId: crypto.randomUUID() })).status, 400);

  // A second attempt for the same email replaces the first unfinished one.
  const e = form();
  const first = await post(e);
  const second = await post(e);
  assert.equal(second.status, 201);
  assert.equal((await ctx.api().get(`${V1}/signup/status?session=${first.body.sessionId}`)).body.status, 'expired');
});

test('the mock payment cannot be used when a real provider is configured, or by guessing', async () => {
  const unknown = await ctx.api().post(`${V1}/signup/mock/complete`).send({ session: 'mock_does_not_exist_0000' });
  assert.equal(unknown.status, 404);
  const sneaky = await request(stripeApp).post(`${V1}/signup/mock/complete`).send({ session: 'mock_anything_000000' });
  assert.equal(sneaky.status, 404);
});

test('without a provider (production without Stripe) online sign-up is off', async () => {
  const noPay = createApp({ db: ctx.db, config: ctx.config, mailer: { configured: true, send: async () => ({ sent: true }) }, payments: null });
  const res = await request(noPay).post(`${V1}/registration-requests`).send(form());
  assert.equal(res.status, 503);
  assert.equal(res.body.error.code, 'PAYMENTS_UNAVAILABLE');
  // Plain requests (no plan) still work.
  assert.equal((await request(noPay).post(`${V1}/registration-requests`).send({ companyName: 'Plain Co', contactName: 'P C', email: 'plain@example.test' })).status, 202);
});

test('Stripe webhook: signed payment creates the account once; bad signatures are refused', async () => {
  const body = form({ companyName: 'Stripe Freight' });
  const res = await request(stripeApp).post(`${V1}/registration-requests`).send(body);
  assert.equal(res.status, 201);
  const sessionId = res.body.sessionId;
  const event = {
    id: 'evt_1',
    object: 'event',
    type: 'checkout.session.completed',
    data: { object: { id: sessionId, object: 'checkout.session', payment_status: 'paid', amount_total: 12900, currency: 'usd', customer: 'cus_1', subscription: 'sub_1', payment_intent: 'pi_1' } },
  };

  assert.equal((await webhook(event, 't=1,v1=deadbeef')).status, 400);
  assert.equal((await ctx.db.query('SELECT count(*)::int AS n FROM companies WHERE name = $1', ['Stripe Freight'])).rows[0].n, 0);

  const ok = await webhook(event);
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.result, 'created');
  const retry = await webhook(event); // Stripe retries
  assert.equal(retry.body.result, 'already');
  assert.equal((await ctx.db.query('SELECT count(*)::int AS n FROM companies WHERE name = $1', ['Stripe Freight'])).rows[0].n, 1);
  const sub = (await ctx.db.query(`SELECT provider, provider_customer_id, provider_subscription_id, status FROM subscriptions WHERE provider_subscription_id = 'sub_1'`)).rows[0];
  assert.deepEqual(sub, { provider: 'stripe', provider_customer_id: 'cus_1', provider_subscription_id: 'sub_1', status: 'active' });

  // An unpaid session does nothing; the mock endpoint refuses for a Stripe setup.
  const second = await request(stripeApp).post(`${V1}/registration-requests`).send(form({ companyName: 'Unpaid Freight' }));
  const unpaid = await webhook({ id: 'evt_2', object: 'event', type: 'checkout.session.completed', data: { object: { id: second.body.sessionId, payment_status: 'unpaid' } } });
  assert.equal(unpaid.body.handled, false);
  assert.equal((await ctx.db.query('SELECT count(*)::int AS n FROM companies WHERE name = $1', ['Unpaid Freight'])).rows[0].n, 0);
});

test('Stripe renewals extend the period, failures mark past due, cancellation ends it', async () => {
  const sub = (await ctx.db.query(`SELECT id, company_id FROM subscriptions WHERE provider_subscription_id = 'sub_1'`)).rows[0];
  const periodEnd = Math.floor(Date.now() / 1000) + 60 * 24 * 3600;
  const invoice = (over) => ({ id: `evt_${crypto.randomBytes(3).toString('hex')}`, object: 'event', type: 'invoice.paid', data: { object: { id: `in_${crypto.randomBytes(3).toString('hex')}`, subscription: 'sub_1', billing_reason: 'subscription_cycle', amount_paid: 12900, currency: 'usd', lines: { data: [{ period: { end: periodEnd } }] }, ...over } } });

  const renew = invoice();
  assert.equal((await webhook(renew)).body.result, 'renewed');
  await webhook(renew); // retried: still one payment per invoice
  const after = (await ctx.db.query(`SELECT (EXTRACT(EPOCH FROM (current_period_end - now())) / 86400)::float8 AS days FROM subscriptions WHERE id = $1`, [sub.id])).rows[0];
  assert.ok(after.days > 59);
  assert.equal((await ctx.db.query(`SELECT count(*)::int AS n FROM payments WHERE subscription_id = $1`, [sub.id])).rows[0].n, 2); // signup + one renewal

  // The first invoice is already covered by the checkout.
  assert.equal((await webhook(invoice({ billing_reason: 'subscription_create' }))).body.result, 'covered by checkout');

  await webhook({ id: 'evt_f', object: 'event', type: 'invoice.payment_failed', data: { object: { id: 'in_failed', subscription: 'sub_1' } } });
  assert.equal((await ctx.db.query('SELECT status FROM subscriptions WHERE id = $1', [sub.id])).rows[0].status, 'past_due');
  await webhook(invoice({ id: 'in_recovered' })); // a later successful payment restores it
  assert.equal((await ctx.db.query('SELECT status FROM subscriptions WHERE id = $1', [sub.id])).rows[0].status, 'active');

  await webhook({ id: 'evt_d', object: 'event', type: 'customer.subscription.deleted', data: { object: { id: 'sub_1' } } });
  assert.equal((await ctx.db.query('SELECT status FROM subscriptions WHERE id = $1', [sub.id])).rows[0].status, 'cancelled');
  assert.equal((await webhook({ id: 'evt_x', object: 'event', type: 'charge.refunded', data: { object: {} } })).body.handled, false);
});
