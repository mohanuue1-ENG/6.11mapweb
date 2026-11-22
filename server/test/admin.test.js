import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createTestContext, bearer, makeFleet } from './helpers.js';
import { seed } from '../src/db/seed.js';
import { csvCell } from '../src/services/csv.js';

const V1 = '/api/v1';
let ctx, a, b, root;
const as = (session) => ({
  get: (path) => ctx.api().get(V1 + path).set(bearer(session)),
  post: (path, body) => ctx.api().post(V1 + path).set(bearer(session)).send(body),
  put: (path, body) => ctx.api().put(V1 + path).set(bearer(session)).send(body),
  patch: (path, body) => ctx.api().patch(V1 + path).set(bearer(session)).send(body),
});
const ago = (s) => new Date(Date.now() - s * 1000).toISOString();
const fix = (secondsAgo, lat) => ({ latitude: lat, longitude: -96.8, gpsTimestamp: ago(secondsAgo), accuracyMeters: 8 });

before(async () => {
  ctx = await createTestContext();
  a = await ctx.registerCompany('Alpha Freight');
  b = await ctx.registerCompany('Bravo Haulers');
  root = await ctx.createSuperAdmin();
});
after(async () => {
  await ctx.db.close();
});

test('csv cells are quoted and cannot start a spreadsheet formula', () => {
  assert.equal(csvCell('plain'), 'plain');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  for (const bad of ['=1+1', '+cmd', '-2', '@SUM(A1)']) assert.equal(csvCell(bad), `'${bad}`);
  assert.equal(csvCell(null), '');
});

test('admin routes are closed to company admins and drivers', async () => {
  const f = await makeFleet(ctx, a, 'X');
  for (const path of ['/admin/overview', '/admin/plans', '/admin/subscriptions', '/admin/payments', '/admin/audit-logs']) {
    assert.equal((await ctx.api().get(V1 + path)).status, 401, path);
    assert.equal((await as(a).get(path)).status, 403, path);
    assert.equal((await as(f.session).get(path)).status, 403, path);
    assert.equal((await as(root).get(path)).status, 200, path);
  }
  assert.equal((await as(a).post('/admin/plans', { name: 'Hack', priceCents: 0 })).status, 403);
});

test('plans: create, edit, switch off; the public list shows only active customer plans', async () => {
  const created = await as(root).post('/admin/plans', { name: 'Starter', priceCents: 4900, truckLimit: 3, description: 'Small fleets' });
  assert.equal(created.status, 201);
  const starter = created.body.plan;
  assert.equal(starter.truckLimit, 3);
  assert.equal((await as(root).post('/admin/plans', { name: 'Starter', priceCents: 1 })).status, 409);
  assert.equal((await as(root).post('/admin/plans', { name: 'Bad', priceCents: -5 })).status, 400);
  assert.equal((await as(root).post('/admin/plans', { name: 'Bad', priceCents: 1, extra: true })).status, 400);

  const hidden = (await as(root).post('/admin/plans', { name: 'Internal Only', priceCents: 0, isInternalOnly: true })).body.plan;
  const off = (await as(root).post('/admin/plans', { name: 'Retired', priceCents: 100 })).body.plan;
  await as(root).patch(`/admin/plans/${off.id}`, { isActive: false });

  const edit = await as(root).patch(`/admin/plans/${starter.id}`, { priceCents: 5900, truckLimit: null });
  assert.equal(edit.body.plan.priceCents, 5900);
  assert.equal(edit.body.plan.truckLimit, null);
  assert.equal((await as(root).patch(`/admin/plans/${starter.id}`, {})).status, 400);
  assert.equal((await as(root).patch(`/admin/plans/${crypto.randomUUID()}`, { name: 'X' })).status, 404);

  // Public, no login: no internal or retired plans.
  const pub = await ctx.api().get(`${V1}/plans`);
  assert.equal(pub.status, 200);
  const names = pub.body.plans.map((p) => p.name);
  assert.ok(names.includes('Starter'));
  assert.ok(!names.includes('Internal Only') && !names.includes('Retired'));
  assert.ok(hidden.id);
});

test('subscriptions: assigning a plan sets the truck limit the fleet routes enforce', async () => {
  const plan = (await as(root).post('/admin/plans', { name: 'Two Trucks', priceCents: 9900, truckLimit: 2 })).body.plan;
  const c = await ctx.registerCompany('Limited Co');
  assert.equal((await as(c).get('/subscriptions/current')).body.subscription, null);

  const assigned = await as(root).put(`/admin/companies/${c.companyId}/subscription`, { planId: plan.id });
  assert.equal(assigned.status, 200);
  assert.equal(assigned.body.subscription.plan.name, 'Two Trucks');
  assert.equal(assigned.body.subscription.truckLimit, 2);
  assert.ok(assigned.body.subscription.currentPeriodEnd);

  const mine = await as(c).get('/subscriptions/current');
  assert.equal(mine.body.subscription.priceCents, 9900);
  assert.deepEqual(mine.body.usage, { activeTrucks: 0, truckLimit: 2, hasSubscription: true });

  await as(c).post('/trucks', { truckNumber: '1' });
  await as(c).post('/trucks', { truckNumber: '2' });
  const third = await as(c).post('/trucks', { truckNumber: '3' });
  assert.equal(third.body.error.code, 'TRUCK_LIMIT_REACHED');

  // A later edit of the plan does not change what the company already agreed to.
  await as(root).patch(`/admin/plans/${plan.id}`, { truckLimit: 50, priceCents: 1 });
  assert.equal((await as(c).get('/subscriptions/current')).body.subscription.truckLimit, 2);

  // Moving to a plan smaller than the current fleet is refused; the old plan stays.
  const tiny = (await as(root).post('/admin/plans', { name: 'One Truck', priceCents: 100, truckLimit: 1 })).body.plan;
  const down = await as(root).put(`/admin/companies/${c.companyId}/subscription`, { planId: tiny.id });
  assert.equal(down.status, 409);
  assert.equal(down.body.error.code, 'TRUCK_LIMIT_BELOW_USAGE');
  assert.equal((await as(c).get('/subscriptions/current')).body.subscription.plan.name, 'Two Trucks');

  // Changing plan keeps exactly one live subscription and keeps the old one as history.
  const big = (await as(root).post('/admin/plans', { name: 'Big', priceCents: 29900, truckLimit: 50 })).body.plan;
  await as(root).put(`/admin/companies/${c.companyId}/subscription`, { planId: big.id });
  const history = await ctx.db.query(`SELECT status FROM subscriptions WHERE company_id = $1 ORDER BY created_at`, [c.companyId]);
  assert.deepEqual(history.rows.map((r) => r.status), ['cancelled', 'active']);

  assert.equal((await as(root).put(`/admin/companies/${c.companyId}/subscription`, { planId: crypto.randomUUID() })).status, 404);
  assert.equal((await as(a).put(`/admin/companies/${c.companyId}/subscription`, { planId: big.id })).status, 403);
  const all = await as(root).get('/admin/subscriptions');
  assert.ok(all.body.subscriptions.some((s) => s.companyName === 'Limited Co' && s.plan.name === 'Big'));
});

test('the internal plan is only for the internal company, which seeds at $0', async () => {
  await seed(ctx.db, ctx.config, {});
  const plans = (await as(root).get('/admin/plans')).body.plans;
  const internal = plans.find((p) => p.name === 'NEB Internal Fleet');
  assert.equal(internal.priceCents, 0);
  assert.equal(internal.isInternalOnly, true);
  const refused = await as(root).put(`/admin/companies/${a.companyId}/subscription`, { planId: internal.id });
  assert.equal(refused.status, 409);

  // The Super Admin adds the internal company; it gets the $0 plan by itself.
  const made = await as(root).post('/admin/companies', { companyName: 'NEB Trucking', adminName: 'NEB Admin', email: `neb-${crypto.randomUUID()}@example.test`, password: 'Neb-Password-123', isInternal: true });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  const list = (await as(root).get('/admin/companies')).body.companies;
  const neb = list.find((c) => c.name === 'NEB Trucking');
  assert.equal(neb.isInternal, true);
  assert.equal(neb.subscription.priceCents, 0);
  assert.equal(neb.subscription.currentPeriodEnd, null);
  const alpha = list.find((c) => c.id === a.companyId);
  assert.equal(alpha.subscription, null);
  assert.equal(typeof alpha.activeTrucks, 'number');
});

test('checkout is honestly unavailable until a payment provider is chosen', async () => {
  const res = await as(a).post('/payments/checkout', { planId: crypto.randomUUID() });
  assert.equal(res.status, 501);
  assert.equal(res.body.error.code, 'NOT_CONFIGURED');
  assert.equal((await ctx.api().post(`${V1}/payments/checkout`).send({})).status, 401);
});

test('payments are recorded by the super admin and each company sees only its own', async () => {
  const rec = await as(root).post('/admin/payments', { companyId: a.companyId, amountCents: 4900, providerReference: 'INV-1' });
  assert.equal(rec.status, 201);
  assert.equal((await as(root).post('/admin/payments', { companyId: crypto.randomUUID(), amountCents: 1 })).status, 404);
  assert.equal((await as(root).post('/admin/payments', { companyId: a.companyId, amountCents: -1 })).status, 400);
  assert.equal((await as(a).post('/admin/payments', { companyId: a.companyId, amountCents: 1 })).status, 403);
  await as(root).post('/admin/payments', { companyId: b.companyId, amountCents: 100, status: 'failed' });

  const platform = (await as(root).get('/admin/payments')).body.payments;
  assert.ok(platform.some((p) => p.companyId === a.companyId) && platform.some((p) => p.companyId === b.companyId));
  assert.equal((await as(root).get(`/admin/payments?companyId=${b.companyId}`)).body.payments.length, 1);

  const own = (await as(a).get('/payments')).body.payments;
  assert.equal(own.length, 1);
  assert.equal(own[0].amountCents, 4900);
  assert.ok(own[0].paidAt);
  assert.equal((await as(b).get('/payments')).body.payments[0].status, 'failed');
});

test('overview counts the platform', async () => {
  const f = await makeFleet(ctx, a, 'OV');
  await as(f.session).post('/trips/start', fix(5, 32.7));
  const o = (await as(root).get('/admin/overview')).body;
  assert.ok(o.companies >= 3);
  assert.ok(o.activeCompanies >= 3);
  assert.ok(o.activeTrucks >= 1 && o.activeDrivers >= 1);
  assert.ok(o.activeTrips >= 1);
  assert.ok(o.gpsPoints24h >= 1);
  assert.equal(typeof o.monthlyRevenueCents, 'number');
});

test('the audit log records privileged actions and can be filtered', async () => {
  const logs = (await as(root).get('/admin/audit-logs?limit=500')).body.logs;
  const actions = new Set(logs.map((l) => l.action));
  for (const expected of ['PLAN_CREATED', 'PLAN_UPDATED', 'SUBSCRIPTION_CHANGED', 'PAYMENT_RECORDED', 'COMPANY_REGISTERED']) {
    assert.ok(actions.has(expected), `missing ${expected}`);
  }
  const pay = logs.find((l) => l.action === 'PAYMENT_RECORDED');
  assert.equal(pay.actor.role, 'SUPER_ADMIN');
  assert.ok(pay.companyName);
  assert.ok(!JSON.stringify(logs).includes('password'));

  const byCompany = (await as(root).get(`/admin/audit-logs?companyId=${a.companyId}`)).body.logs;
  assert.ok(byCompany.length > 0 && byCompany.every((l) => l.companyId === a.companyId));
  const byAction = (await as(root).get('/admin/audit-logs?action=PLAN_CREATED')).body.logs;
  assert.ok(byAction.length > 0 && byAction.every((l) => l.action === 'PLAN_CREATED'));
  const page = (await as(root).get('/admin/audit-logs?limit=2')).body;
  assert.equal(page.logs.length, 2);
  assert.equal(page.hasMore, true);
  assert.equal((await as(root).get('/admin/audit-logs?limit=9999')).status, 400);
});

test('notifications: list, mark one read, mark all read, never another company\'s', async () => {
  const c = await ctx.registerCompany('Notify Co');
  const f = await makeFleet(ctx, c, 'NT');
  await as(f.session).post('/trips/start', fix(5, 32.7));
  const list = await as(c).get('/notifications');
  assert.equal(list.body.notifications.length, 1);
  assert.equal(list.body.unreadCount, 1);
  const id = list.body.notifications[0].id;

  assert.equal((await as(b).get('/notifications')).body.notifications.length, 0);
  assert.equal((await as(b).patch(`/notifications/${id}/read`)).status, 404);
  assert.equal((await as(f.session).get('/notifications')).status, 403);

  assert.equal((await as(c).patch(`/notifications/${id}/read`)).status, 204);
  assert.equal((await as(c).get('/notifications')).body.unreadCount, 0);
  await as((await makeFleet(ctx, c, 'NT2')).session).post('/trips/start', fix(5, 32.7));
  assert.equal((await as(c).get('/notifications')).body.unreadCount, 1);
  assert.equal((await ctx.api().post(`${V1}/notifications/read-all`).set(bearer(c))).status, 204);
  assert.equal((await as(c).get('/notifications')).body.unreadCount, 0);
});

test('reports: trip summary, csv export and fleet activity, scoped to the company', async () => {
  const c = await ctx.registerCompany('Report Co');
  const f = await makeFleet(ctx, c, 'RP', { driverName: '=HYPERLINK("http://x")' });
  const trip = (await as(f.session).post('/trips/start', fix(100, 32.7))).body.trip;
  const pts = [80, 60, 40, 20].map((s, i) => ({
    eventId: crypto.randomUUID(),
    latitude: 32.7 + 0.0005 * (i + 1),
    longitude: -96.8,
    gpsTimestamp: ago(s),
    accuracyMeters: 5,
  }));
  await as(f.session).post('/gps/locations/batch', { batchId: crypto.randomUUID(), locations: pts });
  await as(f.session).post(`/trips/${trip.id}/end`, fix(5, 32.7025));

  const r = await as(c).get('/reports/trips');
  assert.equal(r.status, 200);
  assert.equal(r.body.totals.trips, 1);
  assert.equal(r.body.totals.completed, 1);
  assert.ok(r.body.totals.distanceMeters > 250);
  assert.ok(r.body.totals.durationSeconds >= 90);
  assert.equal(r.body.byDriver.length, 1);
  assert.equal(r.body.byTruck[0].trips, 1);

  const csv = await as(c).get('/reports/trips?format=csv');
  assert.match(csv.headers['content-type'], /text\/csv/);
  assert.match(csv.headers['content-disposition'], /attachment/);
  const lines = csv.text.trim().split('\r\n');
  assert.equal(lines.length, 2);
  assert.ok(lines[1].includes(`"'=HYPERLINK(""http://x"")"`), lines[1]); // formula neutralised, quotes escaped

  const activity = await as(c).get('/reports/fleet-activity');
  assert.equal(activity.body.trucks.length, 1);
  assert.equal(activity.body.trucks[0].tripCount, 1);
  assert.ok(activity.body.trucks[0].gpsPoints >= 6);
  assert.ok(activity.body.trucks[0].lastSeenAt);
  assert.match((await as(c).get('/reports/fleet-activity?format=csv')).headers['content-type'], /csv/);

  // Other companies see nothing of it; bad ranges and roles are refused.
  assert.equal((await as(b).get('/reports/trips')).body.totals.trips, 0);
  assert.equal((await as(f.session).get('/reports/trips')).status, 403);
  assert.equal((await as(c).get('/reports/trips?from=2026-01-02&to=2026-01-01')).status, 400);
  assert.equal((await as(c).get('/reports/trips?from=2020-01-01&to=2026-01-01')).status, 400);
  assert.equal((await as(c).get('/reports/trips?from=nonsense')).status, 400);
  assert.equal((await as(c).get(`/reports/trips?driverId=${crypto.randomUUID()}`)).body.totals.trips, 0);
});

test('a super admin can create a company with its first admin, who can then sign in', async () => {
  const email = `new-${crypto.randomBytes(3).toString('hex')}@example.test`;
  const pw = `Pw-${crypto.randomBytes(8).toString('base64url')}`;
  const body = { companyName: 'Onboarded Freight', adminName: 'Olivia Owner', email, password: pw, dotNumber: 'US-DOT-9' };

  assert.equal((await ctx.api().post(`${V1}/admin/companies`).send(body)).status, 401);
  assert.equal((await as(a).post('/admin/companies', body)).status, 403);

  const res = await as(root).post('/admin/companies', body);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.ok(res.body.companyId && res.body.adminUserId);

  // The new admin signs in and is scoped to the new company only.
  const login = await ctx.api().post(`${V1}/auth/login`).send({ email, password: pw });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.role, 'COMPANY_ADMIN');
  assert.equal(login.body.user.companyId, res.body.companyId);
  const me = await as(login.body).get('/companies/me');
  assert.equal(me.body.company.name, 'Onboarded Freight');
  assert.equal(me.body.company.dotNumber, 'US-DOT-9');

  // It appears in the platform list and in the audit log; the password is stored hashed.
  assert.ok((await as(root).get('/admin/companies')).body.companies.some((c) => c.id === res.body.companyId));
  const logs = (await as(root).get(`/admin/audit-logs?companyId=${res.body.companyId}`)).body.logs;
  assert.ok(logs.some((l) => l.action === 'COMPANY_CREATED' && l.actor.role === 'SUPER_ADMIN'));
  assert.ok(!JSON.stringify(logs).includes(pw));
  const hash = (await ctx.db.query('SELECT password_hash FROM users WHERE id = $1', [res.body.adminUserId])).rows[0].password_hash;
  assert.notEqual(hash, pw);

  // Same email twice, weak password and unknown fields are refused.
  assert.equal((await as(root).post('/admin/companies', body)).status, 409);
  assert.equal((await as(root).post('/admin/companies', { ...body, email: 'x@example.test', password: 'short' })).status, 400);
  assert.equal((await as(root).post('/admin/companies', { ...body, email: 'y@example.test', status: 'active' })).status, 400);
});
