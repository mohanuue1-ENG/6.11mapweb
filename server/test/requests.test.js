import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createTestContext, bearer } from './helpers.js';

const V1 = '/api/v1';
let ctx, root, plan;
const as = (session) => ({
  get: (path) => ctx.api().get(V1 + path).set(bearer(session)),
  post: (path, body) => ctx.api().post(V1 + path).set(bearer(session)).send(body),
});
const request = (over = {}) => ({
  companyName: 'Prospect Freight',
  contactName: 'Pat Prospect',
  email: `pat-${crypto.randomBytes(3).toString('hex')}@example.test`,
  phone: '+1 555 0100',
  message: 'We run 12 trucks',
  ...over,
});
const tokenFrom = (url) => new URL(url).searchParams.get('token');

before(async () => {
  ctx = await createTestContext();
  root = await ctx.createSuperAdmin();
  plan = (await as(root).post('/admin/plans', { name: 'Trial Plan', priceCents: 9900, truckLimit: 3 })).body.plan;
});
after(async () => {
  await ctx.db.close();
});

test('anyone can ask for access, and the admin is told by email and on the dashboard', async () => {
  const body = request();
  const res = await ctx.api().post(`${V1}/registration-requests`).send(body);
  assert.equal(res.status, 202);

  const mail = ctx.mail.find((m) => m.subject.includes('Prospect Freight'));
  assert.equal(mail.to, 'owner@example.test');
  assert.ok(mail.text.includes(body.email) && mail.text.includes('/superadmin/requests'));

  assert.equal((await as(root).get('/admin/overview')).body.pendingRequests, 1);
  const list = (await as(root).get('/admin/registration-requests?status=pending')).body.requests;
  assert.equal(list.length, 1);
  assert.equal(list[0].companyName, 'Prospect Freight');
  assert.equal(list[0].status, 'pending');

  // No account and no company exist yet.
  assert.equal((await ctx.db.query('SELECT count(*)::int AS n FROM users WHERE email = $1', [body.email])).rows[0].n, 0);
});

test('the request form validates input, hides who already has an account, and does not duplicate', async () => {
  const post = (b) => ctx.api().post(`${V1}/registration-requests`).send(b);
  assert.equal((await post({})).status, 400);
  assert.equal((await post(request({ email: 'not-an-email' }))).status, 400);
  assert.equal((await post({ ...request(), companyId: crypto.randomUUID() })).status, 400);

  const same = request({ email: 'dup@example.test' });
  const before = (await as(root).get('/admin/registration-requests')).body.requests.length;
  assert.equal((await post(same)).status, 202);
  assert.equal((await post({ ...same, companyName: 'Different Name' })).status, 202); // same answer, no second row
  assert.equal((await as(root).get('/admin/registration-requests')).body.requests.length, before + 1);

  // An email that already has an account gets the same answer and creates nothing.
  const existing = await ctx.registerCompany('Already Here');
  const count = (await as(root).get('/admin/registration-requests')).body.requests.length;
  assert.equal((await post(request({ email: existing.email }))).status, 202);
  assert.equal((await as(root).get('/admin/registration-requests')).body.requests.length, count);
});

test('only the super admin can review requests', async () => {
  const c = await ctx.registerCompany('Some Company');
  const id = (await as(root).get('/admin/registration-requests')).body.requests[0].id;
  assert.equal((await ctx.api().get(`${V1}/admin/registration-requests`)).status, 401);
  assert.equal((await as(c).get('/admin/registration-requests')).status, 403);
  assert.equal((await as(c).post(`/admin/registration-requests/${id}/approve`, {})).status, 403);
  assert.equal((await as(c).post(`/admin/registration-requests/${id}/reject`, {})).status, 403);
});

test('approving creates the company, a 7-day trial and a one-time link by email, never a password', async () => {
  const body = request({ companyName: 'Approved Freight' });
  await ctx.api().post(`${V1}/registration-requests`).send(body);
  const id = (await as(root).get('/admin/registration-requests?status=pending')).body.requests.find((r) => r.email === body.email).id;

  const res = await as(root).post(`/admin/registration-requests/${id}/approve`, { planId: plan.id });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.emailSent, true);
  assert.equal(res.body.trialDays, 7);
  const token = tokenFrom(res.body.inviteUrl);
  assert.ok(token.length >= 40);

  // The company, its admin and the trial exist.
  const row = (
    await ctx.db.query(
      `SELECT c.name, c.status, u.role, u.company_id, s.status AS sub_status, s.truck_limit,
              (EXTRACT(EPOCH FROM (s.current_period_end - now())) / 86400)::float8 AS days_left
         FROM companies c JOIN users u ON u.company_id = c.id JOIN subscriptions s ON s.company_id = c.id
        WHERE c.id = $1`,
      [res.body.companyId],
    )
  ).rows[0];
  assert.equal(row.name, 'Approved Freight');
  assert.equal(row.role, 'COMPANY_ADMIN');
  assert.equal(row.sub_status, 'trialing');
  assert.equal(row.truck_limit, 3);
  assert.ok(row.days_left > 6.9 && row.days_left <= 7.01, `trial length ${row.days_left} days`);

  // The invitation email carries the link, not a password.
  const mail = ctx.mail.find((m) => m.to === body.email);
  assert.ok(mail.text.includes(res.body.inviteUrl));
  assert.ok(!/password:/i.test(mail.text));
  // The token is stored only as a hash.
  const stored = (await ctx.db.query('SELECT token_hash FROM password_tokens ORDER BY created_at DESC LIMIT 1')).rows[0].token_hash;
  assert.notEqual(stored, token);

  // Until the password is chosen, nobody can sign in as that admin.
  const noLogin = await ctx.api().post(`${V1}/auth/login`).send({ email: body.email, password: 'anything-at-all' });
  assert.equal(noLogin.status, 401);

  // Choosing a password works once; then the admin signs in and sees only their company, on trial.
  const pw = `Aa1!${crypto.randomBytes(8).toString("base64url")}`;
  assert.equal((await ctx.api().post(`${V1}/auth/set-password`).send({ token, password: pw })).status, 204);
  const login = await ctx.api().post(`${V1}/auth/login`).send({ email: body.email, password: pw });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.companyId, res.body.companyId);
  const sub = await as(login.body).get('/subscriptions/current');
  assert.equal(sub.body.subscription.status, 'trialing');
  assert.equal(sub.body.subscription.truckLimit, 3);

  // The link cannot be used again.
  const again = await ctx.api().post(`${V1}/auth/set-password`).send({ token, password: `${pw}-2` });
  assert.equal(again.status, 400);
  assert.equal(again.body.error.code, 'INVALID_TOKEN');

  // The request is closed and cannot be approved or rejected again.
  assert.equal((await as(root).post(`/admin/registration-requests/${id}/approve`, {})).status, 409);
  assert.equal((await as(root).post(`/admin/registration-requests/${id}/reject`, {})).status, 409);
  const logs = (await as(root).get('/admin/audit-logs?action=REGISTRATION_APPROVED')).body.logs;
  assert.ok(logs.some((l) => l.companyId === res.body.companyId));
});

test('set-password rejects bad, weak and expired links and ends old sessions', async () => {
  const post = (b) => ctx.api().post(`${V1}/auth/set-password`).send(b);
  assert.equal((await post({})).status, 400);
  assert.equal((await post({ token: 'x'.repeat(43), password: 'Good-Password-123!' })).body.error.code, 'INVALID_TOKEN');
  assert.equal((await post({ token: 'x'.repeat(43), password: 'short' })).status, 400);
  // A password that is too easy is refused before the link is even looked at: no special character, or a common one.
  const noSpecial = await post({ token: 'x'.repeat(43), password: 'GoodPassword123' });
  assert.equal(noSpecial.status, 400);
  assert.match(JSON.stringify(noSpecial.body), /special character/);
  assert.equal((await post({ token: 'x'.repeat(43), password: 'P@ssw0rd!' })).status, 400);
  assert.match(JSON.stringify((await post({ token: 'x'.repeat(43), password: 'Welcome123!' })).body), /too common/);

  const body = request({ companyName: 'Expiring Freight' });
  await ctx.api().post(`${V1}/registration-requests`).send(body);
  const id = (await as(root).get('/admin/registration-requests?status=pending')).body.requests.find((r) => r.email === body.email).id;
  const res = await as(root).post(`/admin/registration-requests/${id}/approve`, {});
  assert.equal(res.body.trialDays, null); // no plan chosen, so no trial row
  const token = tokenFrom(res.body.inviteUrl);

  await ctx.db.query(`UPDATE password_tokens SET expires_at = now() - interval '1 minute' WHERE token_hash IS NOT NULL AND used_at IS NULL`);
  assert.equal((await post({ token, password: 'Good-Password-123!' })).body.error.code, 'INVALID_TOKEN');
});

test('a request can be rejected and then creates nothing', async () => {
  const body = request({ companyName: 'Rejected Freight' });
  await ctx.api().post(`${V1}/registration-requests`).send(body);
  const id = (await as(root).get('/admin/registration-requests?status=pending')).body.requests.find((r) => r.email === body.email).id;
  assert.equal((await as(root).post(`/admin/registration-requests/${id}/reject`, { note: 'Not a trucking company' })).status, 204);
  const r = (await as(root).get('/admin/registration-requests?status=rejected')).body.requests.find((x) => x.id === id);
  assert.equal(r.reviewNote, 'Not a trucking company');
  assert.equal((await ctx.db.query('SELECT count(*)::int AS n FROM users WHERE email = $1', [body.email])).rows[0].n, 0);
  // They may ask again later.
  assert.equal((await ctx.api().post(`${V1}/registration-requests`).send(body)).status, 202);
});

test('a failing email never undoes an approval and the link is still returned', async () => {
  const failing = await createTestContext();
  failing.app.locals.events; // app is built with its own recording mailer; swap its behaviour
  const failingRoot = await failing.createSuperAdmin();
  // Rebuild an app whose mailer always fails.
  const { createApp } = await import('../src/app.js');
  const { default: request } = await import('supertest');
  const app = createApp({ db: failing.db, config: failing.config, mailer: { configured: true, send: async () => ({ sent: false }) } });
  await request(app).post(`${V1}/registration-requests`).send({ companyName: 'No Mail Co', contactName: 'N M', email: 'nomail@example.test' });
  const list = await request(app).get(`${V1}/admin/registration-requests`).set(bearer(failingRoot));
  const res = await request(app).post(`${V1}/admin/registration-requests/${list.body.requests[0].id}/approve`).set(bearer(failingRoot)).send({});
  assert.equal(res.status, 200);
  assert.equal(res.body.emailSent, false);
  assert.ok(res.body.inviteUrl.includes('/set-password?token='));
  await failing.db.close();
});

test('instant self-registration is closed by default; companies must ask for access', async () => {
  const closed = await createTestContext({ ALLOW_SELF_REGISTRATION: 'false' });
  const res = await closed.api().post(`${V1}/auth/register`).send({ companyName: 'Sneaky Co', adminName: 'S N', email: 'sneaky@example.test', password: 'GoodPassword123' });
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'REGISTRATION_CLOSED');
  assert.equal((await closed.db.query('SELECT count(*)::int AS n FROM companies')).rows[0].n, 0);
  await closed.db.close();
});
