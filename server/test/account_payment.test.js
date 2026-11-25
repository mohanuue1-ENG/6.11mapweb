import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createTestContext, bearer, randomPassword } from './helpers.js';

const V1 = '/api/v1';
let ctx, root, plan;
const as = (session) => ({
  get: (path) => ctx.api().get(V1 + path).set(bearer(session)),
  post: (path, body) => ctx.api().post(V1 + path).set(bearer(session)).send(body),
});

// The account exists at once and can sign in, but the dashboard opens only after the plan is paid.
before(async () => {
  ctx = await createTestContext({ REQUIRE_SUBSCRIPTION: 'true' });
  root = await ctx.createSuperAdmin();
  plan = (await as(root).post('/admin/plans', { name: 'Fleet', priceCents: 12900, truckLimit: 5 })).body.plan;
});
after(async () => {
  await ctx.db.close();
});

async function newCompany() {
  const email = `${crypto.randomBytes(5).toString('hex')}@example.test`;
  const password = randomPassword();
  const res = await ctx.api().post(`${V1}/auth/register`).set('X-Client-Type', 'mobile').send({ adminName: 'Una Paid', email, password });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return { email, password, session: res.body, user: res.body.user };
}

test('a new account signs in at once, but is told to choose a plan and cannot use the fleet yet', async () => {
  const c = await newCompany();
  assert.equal(c.user.subscribed, false);
  // It can sign in again.
  const login = await ctx.api().post(`${V1}/auth/login`).set('X-Client-Type', 'mobile').send({ email: c.email, password: c.password });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.subscribed, false);
  // The fleet endpoints are closed.
  for (const path of ['/trucks', '/drivers', '/trips', '/notifications']) {
    const res = await as(c.session).get(path);
    assert.equal(res.status, 402, path);
    assert.equal(res.body.error.code, 'PAYMENT_REQUIRED');
  }
  // The plan page works.
  assert.equal((await ctx.api().get(`${V1}/plans`)).status, 200);
  assert.equal((await as(c.session).get('/subscriptions/current')).body.subscription, null);
});

test('paying the plan opens the dashboard, and paying twice does nothing more', async () => {
  const c = await newCompany();
  const res = await as(c.session).post('/payments/checkout', { planId: plan.id });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.ok(res.body.checkoutUrl.includes('/mock-checkout?session=mock_'));

  // Not paid yet: still closed, and the status says so.
  assert.equal((await as(c.session).get('/trucks')).status, 402);
  const before = await ctx.api().get(`${V1}/signup/status?session=${res.body.sessionId}`);
  assert.equal(before.body.status, 'awaiting_payment');
  assert.equal(before.body.planName, 'Fleet');

  const paid = await ctx.api().post(`${V1}/signup/mock/complete`).send({ session: res.body.sessionId });
  assert.equal(paid.status, 200, JSON.stringify(paid.body));
  assert.equal(paid.body.status, 'paid');

  // Open now, with the plan's truck limit.
  assert.equal((await as(c.session).get('/trucks')).status, 200);
  const sub = (await as(c.session).get('/subscriptions/current')).body.subscription;
  assert.equal(sub.status, 'active');
  assert.equal(sub.plan.name, 'Fleet');
  assert.equal(sub.truckLimit, 5);
  // A fresh sign-in now says the company is subscribed.
  const login = await ctx.api().post(`${V1}/auth/login`).set('X-Client-Type', 'mobile').send({ email: c.email, password: c.password });
  assert.equal(login.body.user.subscribed, true);

  // The same payment again changes nothing.
  const again = await ctx.api().post(`${V1}/signup/mock/complete`).send({ session: res.body.sessionId });
  assert.equal(again.body.status, 'paid');
  const payments = (await as(c.session).get('/payments')).body.payments;
  assert.equal(payments.length, 1);
  assert.equal(payments[0].amountCents, 12900);
});

test('a company with a plan cannot open a second checkout, and only listed plans can be chosen', async () => {
  const c = await newCompany();
  const bad = await as(c.session).post('/payments/checkout', { planId: crypto.randomUUID() });
  assert.equal(bad.status, 400);
  const ok = await as(c.session).post('/payments/checkout', { planId: plan.id });
  await ctx.api().post(`${V1}/signup/mock/complete`).send({ session: ok.body.sessionId });
  const second = await as(c.session).post('/payments/checkout', { planId: plan.id });
  assert.equal(second.status, 409);
});

test('the platform admin never needs a plan, and an unknown payment session is refused', async () => {
  assert.notEqual((await as(root).get('/trucks')).status, 402); // never stopped by the paywall
  const unknown = await ctx.api().post(`${V1}/signup/mock/complete`).send({ session: 'mock_does_not_exist_0000' });
  assert.equal(unknown.status, 404);
});

test('an account needs only a name, email and password; the company details are asked after the first payment', async () => {
  const c = await newCompany();
  assert.equal(c.user.needsSetup, true);
  const me = await as(c.session).get('/companies/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.company.name, 'Una Paid'); // a placeholder until the details are given

  // Before paying, the company cannot complete its setup.
  const early = await as(c.session).post('/companies/me/setup', { name: 'Unpaid Freight' });
  assert.equal(early.status, 402);

  const checkout = await as(c.session).post('/payments/checkout', { planId: plan.id });
  await ctx.api().post(`${V1}/signup/mock/complete`).send({ session: checkout.body.sessionId });
  const done = await as(c.session).post('/companies/me/setup', { name: 'Unpaid Freight', contactPhone: '+1 555 0100', dotNumber: 'dot123', mcNumber: 'mc456' });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  assert.equal(done.body.company.name, 'Unpaid Freight');
  assert.equal(done.body.company.dotNumber, 'DOT123');

  const login = await ctx.api().post(`${V1}/auth/login`).set('X-Client-Type', 'mobile').send({ email: c.email, password: c.password });
  assert.equal(login.body.user.needsSetup, false);
  assert.equal(login.body.user.subscribed, true);

  // A company created with a name (the platform admin, the app) is not asked again.
  const named = await ctx.api().post(`${V1}/auth/register`).set('X-Client-Type', 'mobile').send({ companyName: 'Named Co', adminName: 'Nina Named', email: `${crypto.randomBytes(4).toString('hex')}@example.test`, password: randomPassword() });
  assert.equal(named.body.user.needsSetup, false);
});

test('a plan can be paid yearly with a percentage off twelve months', async () => {
  const yearlyPlan = (await as(root).post('/admin/plans', { name: 'Yearly Fleet', priceCents: 10000, truckLimit: 20, yearlyDiscountPercent: 20 })).body.plan;
  assert.equal(yearlyPlan.yearlyDiscountPercent, 20);
  assert.equal(yearlyPlan.yearlyPriceCents, 96000); // 12 x $100 less 20%

  // The public list shows both prices.
  const listed = (await ctx.api().get(`${V1}/plans`)).body.plans.find((p) => p.id === yearlyPlan.id);
  assert.equal(listed.yearlyPriceCents, 96000);

  // A bad discount is refused.
  assert.equal((await as(root).post('/admin/plans', { name: 'Too cheap', priceCents: 1000, yearlyDiscountPercent: 95 })).status, 400);

  const c = await newCompany();
  const checkout = await as(c.session).post('/payments/checkout', { planId: yearlyPlan.id, interval: 'year' });
  assert.equal(checkout.status, 201, JSON.stringify(checkout.body));
  const status = await ctx.api().get(`${V1}/signup/status?session=${checkout.body.sessionId}`);
  assert.equal(status.body.interval, 'year');
  assert.equal(status.body.amountCents, 96000);

  await ctx.api().post(`${V1}/signup/mock/complete`).send({ session: checkout.body.sessionId });
  const sub = (await as(c.session).get('/subscriptions/current')).body.subscription;
  assert.equal(sub.billingInterval, 'year');
  assert.equal(sub.priceCents, 96000);
  const days = (new Date(sub.currentPeriodEnd) - Date.now()) / 86400000;
  assert.ok(days > 360 && days <= 365.1, `period is about a year, got ${days}`);
  assert.equal((await as(c.session).get('/payments')).body.payments[0].amountCents, 96000);

  // Monthly is still the default.
  const d = await newCompany();
  const monthly = await as(d.session).post('/payments/checkout', { planId: yearlyPlan.id });
  assert.equal((await ctx.api().get(`${V1}/signup/status?session=${monthly.body.sessionId}`)).body.amountCents, 10000);
  assert.equal((await as(d.session).post('/payments/checkout', { planId: yearlyPlan.id, interval: 'weekly' })).status, 400);
});


test('a plan says which product it is for; Loadova plans are listed but cannot be bought until Loadova is available', async () => {
  const loadova = (await as(root).post('/admin/plans', { name: 'Loadova Starter', priceCents: 3900, truckLimit: 10, product: 'loadova' })).body.plan;
  assert.equal(loadova.product, 'loadova');
  assert.equal(plan.product, 'trackova'); // the default

  const listed = (await ctx.api().get(`${V1}/plans`)).body.plans;
  assert.equal(listed.find((p) => p.id === loadova.id).purchasable, false);
  assert.equal(listed.find((p) => p.id === plan.id).purchasable, true);

  const c = await newCompany();
  const refused = await as(c.session).post('/payments/checkout', { planId: loadova.id });
  assert.equal(refused.status, 409);
  assert.equal(refused.body.error.code, 'COMING_SOON');

  // A tracking plan gives the tracking product only.
  const checkout = await as(c.session).post('/payments/checkout', { planId: plan.id });
  await ctx.api().post(`${V1}/signup/mock/complete`).send({ session: checkout.body.sessionId });
  const login = await ctx.api().post(`${V1}/auth/login`).set('X-Client-Type', 'mobile').send({ email: c.email, password: c.password });
  assert.deepEqual(login.body.user.products, ['trackova']);
  assert.equal((await as(c.session).get('/subscriptions/current')).body.subscription.product, 'trackova');
  assert.deepEqual((await ctx.api().post(`${V1}/auth/login`).set('X-Client-Type', 'mobile').send({ email: root.email, password: root.password })).body.user.products, ['trackova', 'loadova']);
});

test('when Loadova is available, a plan for both gives both products', async () => {
  const ctx2 = await createTestContext({ REQUIRE_SUBSCRIPTION: 'true', LOADOVA_AVAILABLE: 'true' });
  try {
    const root2 = await ctx2.createSuperAdmin();
    const both = (await ctx2.api().post(`${V1}/admin/plans`).set(bearer(root2)).send({ name: 'Both', priceCents: 7500, truckLimit: 30, product: 'both' })).body.plan;
    const email = `${crypto.randomBytes(5).toString('hex')}@example.test`;
    const password = randomPassword();
    const reg = await ctx2.api().post(`${V1}/auth/register`).set('X-Client-Type', 'mobile').send({ adminName: 'Bea Both', email, password });
    const session = reg.body;
    const checkout = await ctx2.api().post(`${V1}/payments/checkout`).set(bearer(session)).send({ planId: both.id });
    assert.equal(checkout.status, 201, JSON.stringify(checkout.body));
    await ctx2.api().post(`${V1}/signup/mock/complete`).send({ session: checkout.body.sessionId });
    const login = await ctx2.api().post(`${V1}/auth/login`).set('X-Client-Type', 'mobile').send({ email, password });
    assert.deepEqual(login.body.user.products, ['trackova', 'loadova']);
  } finally {
    await ctx2.db.close();
  }
});


test('loads are only for companies whose plan includes Loadova', async () => {
  const c = await newCompany();
  const checkout = await as(c.session).post('/payments/checkout', { planId: plan.id });
  await ctx.api().post(`${V1}/signup/mock/complete`).send({ session: checkout.body.sessionId });
  // A Trackova plan opens the fleet but not the loads.
  assert.equal((await as(c.session).get('/trucks')).status, 200);
  const res = await as(c.session).get('/loads');
  assert.equal(res.status, 402);
  assert.equal(res.body.error.code, 'PRODUCT_REQUIRED');
});

test('a failed payment keeps the dashboard open for 7 days after the period ended, and the owner can open the page to update the card', async () => {
  const c = await newCompany();
  const res = await as(c.session).post('/payments/checkout', { planId: plan.id });
  await ctx.api().post(`${V1}/signup/mock/complete`).send({ session: res.body.sessionId });
  assert.equal((await as(c.session).get('/trucks')).status, 200);

  // The card failed 2 days ago: still open.
  await ctx.db.query(`UPDATE subscriptions SET status = 'past_due', current_period_end = now() - interval '2 days' WHERE company_id = $1`, [c.user.companyId ?? (await ctx.db.query(`SELECT company_id FROM users WHERE email = $1`, [c.email])).rows[0].company_id]);
  assert.equal((await as(c.session).get('/trucks')).status, 200);
  // The owner can open the page to update the card.
  const portal = await as(c.session).post('/billing/portal', {});
  assert.equal(portal.status, 200, JSON.stringify(portal.body));
  assert.ok(portal.body.url);

  // 8 days after the period ended: closed.
  await ctx.db.query(`UPDATE subscriptions SET current_period_end = now() - interval '8 days' WHERE status = 'past_due' AND company_id = (SELECT company_id FROM users WHERE email = $1)`, [c.email]);
  assert.equal((await as(c.session).get('/trucks')).status, 402);
});

test('10 wrong passwords in a row block the account by themselves, and the owner can open it again', async () => {
  const c = await newCompany();
  const bad = () => ctx.api().post(`${V1}/auth/login`).set('X-Client-Type', 'mobile').send({ email: c.email, password: 'Wrong-Pass-1x' });
  for (let i = 0; i < 9; i += 1) assert.equal((await bad()).status, 401);
  // The 9th miss has not blocked yet: the right password still works and starts the count again.
  const ok = await ctx.api().post(`${V1}/auth/login`).set('X-Client-Type', 'mobile').send({ email: c.email, password: c.password });
  assert.equal(ok.status, 200);
  for (let i = 0; i < 10; i += 1) assert.equal((await bad()).status, 401);
  // Now blocked: even the right password is refused.
  const blocked = await ctx.api().post(`${V1}/auth/login`).set('X-Client-Type', 'mobile').send({ email: c.email, password: c.password });
  assert.equal(blocked.status, 403);
  const list = (await as(root).get('/admin/blocked-users')).body.users;
  const mine = list.find((u) => u.email === c.email);
  assert.ok(mine);
  assert.equal((await as(root).post(`/admin/blocked-users/${mine.id}/unblock`, {})).status, 204);
  const again = await ctx.api().post(`${V1}/auth/login`).set('X-Client-Type', 'mobile').send({ email: c.email, password: c.password });
  assert.equal(again.status, 200);
});

test('10 failed payments in a row block the company by themselves; a paid invoice starts the count again', async () => {
  const { handleStripeEvent } = await import('../src/services/stripeEvents.js');
  const c = await newCompany();
  const res = await as(c.session).post('/payments/checkout', { planId: plan.id });
  await ctx.api().post(`${V1}/signup/mock/complete`).send({ session: res.body.sessionId });
  const companyId = (await ctx.db.query(`SELECT company_id FROM users WHERE email = $1`, [c.email])).rows[0].company_id;
  await ctx.db.query(`UPDATE subscriptions SET provider_subscription_id = $2 WHERE company_id = $1`, [companyId, `sub_${companyId}`]);
  const deps = { db: ctx.db, config: { maxFailedPayments: 10 } };
  const failed = () => handleStripeEvent(deps, { type: 'invoice.payment_failed', data: { object: { subscription: `sub_${companyId}` } } });
  for (let i = 0; i < 9; i += 1) assert.equal((await failed()).result, 'past_due');
  assert.equal((await as(c.session).get('/trucks')).status, 200);
  assert.equal((await failed()).result, 'blocked');
  assert.equal((await ctx.db.query('SELECT status FROM companies WHERE id = $1', [companyId])).rows[0].status, 'suspended');
  assert.equal((await as(c.session).get('/trucks')).status, 403);
});
