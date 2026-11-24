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
