import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createTestContext, bearer } from './helpers.js';

// "Create account" first: the person chooses a password, then sets up the company (Join us).

const V1 = '/api/v1';
let ctx, root, plan;
const as = (session) => ({
  get: (path) => ctx.api().get(V1 + path).set(bearer(session)),
  post: (path, body) => ctx.api().post(V1 + path).set(bearer(session)).send(body),
});
const unique = () => crypto.randomBytes(4).toString('hex');
const form = (over = {}) => ({
  companyName: `Account First ${unique()}`,
  contactName: 'Amina Driver',
  email: `amina-${unique()}@example.test`,
  password: 'a-long-enough-pass',
  ...over,
});
const login = (email, password) => ctx.api().post(`${V1}/auth/login`).set('X-Client-Type', 'mobile').send({ email, password });

before(async () => {
  ctx = await createTestContext();
  root = await ctx.createSuperAdmin();
  plan = (await as(root).post('/admin/plans', { name: 'Starter', priceCents: 4900, truckLimit: 3 })).body.plan;
});
after(async () => ctx.db.close());

test('a password chosen at sign-up becomes the administrator\'s password once payment is confirmed', async () => {
  const body = form({ planId: plan.id });
  const res = await ctx.api().post(`${V1}/registration-requests`).send(body);
  assert.equal(res.status, 201, JSON.stringify(res.body));

  // Nothing is stored as typed, and nobody can sign in before the company exists.
  const stored = (await ctx.db.query('SELECT password_hash FROM registration_requests WHERE lower(email) = $1', [body.email])).rows[0];
  assert.ok(stored.password_hash.startsWith('$2'));
  assert.ok(!stored.password_hash.includes(body.password));
  assert.equal((await login(body.email, body.password)).status, 401);

  const status = await ctx.api().get(`${V1}/signup/status?session=${res.body.sessionId}`);
  assert.equal(status.body.passwordChosen, true);

  const paid = await ctx.api().post(`${V1}/signup/mock/complete`).send({ session: res.body.sessionId });
  assert.equal(paid.body.status, 'created');
  assert.equal(paid.body.devInviteUrl, null);

  // The chosen password works straight away, and no password link was created.
  const ok = await login(body.email, body.password);
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.user.role, 'COMPANY_ADMIN');
  assert.equal((await login(body.email, 'some-other-password')).status, 401);
  const tokens = await ctx.db.query(`SELECT count(*)::int AS n FROM password_tokens t JOIN users u ON u.id = t.user_id WHERE u.email = $1`, [body.email]);
  assert.equal(tokens.rows[0].n, 0);

  // The email says to sign in; it carries no link and no password.
  const mail = ctx.mail.find((m) => m.to === body.email);
  assert.ok(/sign in/i.test(mail.text));
  assert.ok(!mail.text.includes('set-password'));
  assert.ok(!mail.text.includes(body.password));
});

test('an approved request keeps the chosen password and sends no link', async () => {
  const body = form();
  assert.equal((await ctx.api().post(`${V1}/registration-requests`).send(body)).status, 202);
  const id = (await as(root).get('/admin/registration-requests?status=pending')).body.requests.find((r) => r.email === body.email).id;

  const res = await as(root).post(`/admin/registration-requests/${id}/approve`, { planId: plan.id });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.inviteUrl, null);
  assert.equal(res.body.passwordChosen, true);
  assert.equal((await login(body.email, body.password)).status, 200);
});

test('without a password the earlier link-by-email flow still works', async () => {
  const body = form();
  delete body.password;
  assert.equal((await ctx.api().post(`${V1}/registration-requests`).send(body)).status, 202);
  const id = (await as(root).get('/admin/registration-requests?status=pending')).body.requests.find((r) => r.email === body.email).id;
  const res = await as(root).post(`/admin/registration-requests/${id}/approve`, {});
  assert.equal(res.status, 200);
  assert.ok(res.body.inviteUrl.includes('/set-password?token='));
  assert.equal(res.body.passwordChosen, false);
});

test('a weak or oversized password is refused', async () => {
  assert.equal((await ctx.api().post(`${V1}/registration-requests`).send(form({ password: 'short' }))).status, 400);
  assert.equal((await ctx.api().post(`${V1}/registration-requests`).send(form({ password: 'x'.repeat(80) }))).status, 400);
});
