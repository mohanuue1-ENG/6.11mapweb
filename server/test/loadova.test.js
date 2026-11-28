import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createTestContext, bearer, makeFleet, randomPassword } from './helpers.js';
import { checkTripStop } from '../src/services/trips.js';

const V1 = '/api/v1';
let ctx, admin, fleet, dispatcher, dispatcherEmail, dispatcherPassword, otherAdmin, otherFleet;
const as = (s) => ({
  get: (p) => ctx.api().get(V1 + p).set(bearer(s)),
  post: (p, b) => ctx.api().post(V1 + p).set(bearer(s)).send(b),
  patch: (p, b) => ctx.api().patch(V1 + p).set(bearer(s)).send(b),
  del: (p) => ctx.api().delete(V1 + p).set(bearer(s)),
});
const login = async (email, password) => (await ctx.api().post(`${V1}/auth/login`).set('X-Client-Type', 'mobile').send({ email, password })).body;
const load = (over = {}) => ({ loadNumber: `L-${crypto.randomBytes(2).toString('hex')}`, loadDate: '2026-11-25', broker: 'ABC Logistics', pickupLocation: 'Des Moines, IA', pickupTime: '08:00', dropoffLocation: 'Chicago, IL', dropoffTime: '16:00', cashInCents: 50000, driverId: fleet.driver.id, truckId: fleet.truck.id, ...over });

before(async () => {
  ctx = await createTestContext();
  admin = await ctx.registerCompany('Haulers Inc');
  fleet = await makeFleet(ctx, admin, 'A');
  otherAdmin = await ctx.registerCompany('Other Co');
  otherFleet = await makeFleet(ctx, otherAdmin, 'B');
  dispatcherEmail = `disp-${crypto.randomBytes(3).toString('hex')}@example.test`;
  dispatcherPassword = randomPassword();
});
after(async () => {
  await ctx.db.close();
});

test('the owner creates a dispatcher, who signs in and works with the fleet but not the company or the team', async () => {
  const created = await as(admin).post('/team/dispatchers', { name: 'Dina Dispatch', email: dispatcherEmail, password: dispatcherPassword });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  dispatcher = await login(dispatcherEmail, dispatcherPassword);
  assert.equal(dispatcher.user.role, 'DISPATCHER');

  // Works with trucks, drivers and trips of the company.
  assert.equal((await as(dispatcher).get('/trucks')).status, 200);
  assert.equal((await as(dispatcher).get('/drivers')).status, 200);
  assert.equal((await as(dispatcher).get('/trips')).status, 200);
  // Does not manage the company, the plan or the team.
  assert.equal((await as(dispatcher).get('/companies/me')).status, 403);
  assert.equal((await as(dispatcher).post('/payments/checkout', { planId: crypto.randomUUID() })).status, 403);
  assert.equal((await as(dispatcher).post('/team/dispatchers', { name: 'X Y', email: 'x@example.test', password: randomPassword() })).status, 403);
  // A driver cannot create dispatchers either.
  assert.equal((await as(fleet.session).post('/team/dispatchers', { name: 'X Y', email: 'x2@example.test', password: randomPassword() })).status, 403);

  const list = await as(admin).get('/team/dispatchers');
  assert.equal(list.body.dispatchers.length, 1);
  // Another company never sees them.
  assert.equal((await as(otherAdmin).get('/team/dispatchers')).body.dispatchers.length, 0);
});

test('a switched-off dispatcher cannot work any more', async () => {
  const id = (await as(admin).get('/team/dispatchers')).body.dispatchers[0].id;
  assert.equal((await as(admin).patch(`/team/dispatchers/${id}`, { status: 'disabled' })).status, 200);
  assert.equal((await as(dispatcher).get('/trucks')).status, 403);
  assert.equal((await ctx.api().post(`${V1}/auth/login`).set('X-Client-Type', 'mobile').send({ email: dispatcherEmail, password: dispatcherPassword })).status, 403);
  assert.equal((await as(admin).patch(`/team/dispatchers/${id}`, { status: 'active' })).status, 200);
  dispatcher = await login(dispatcherEmail, dispatcherPassword);
  assert.equal((await as(dispatcher).get('/trucks')).status, 200);
});

test('the dispatcher writes a load and gives it to a driver; the driver sees it without the money and moves it forward', async () => {
  const created = await as(dispatcher).post('/loads', load({ loadNumber: 'L-1001' }));
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const id = created.body.load.id;
  assert.equal(created.body.load.status, 'assigned');
  assert.equal(created.body.load.cashInCents, 50000);
  assert.equal(created.body.load.driverName, 'A Driver');

  // The dispatcher and the owner see it; the staff list carries the money.
  const staff = (await as(admin).get('/loads?status=assigned')).body.loads;
  assert.equal(staff.find((l) => l.id === id).cashInCents, 50000);

  // The driver sees it, without the money.
  const mine = (await as(fleet.session).get('/driver/loads')).body.loads;
  const m = mine.find((l) => l.id === id);
  assert.equal(m.loadNumber, 'L-1001');
  assert.equal(m.pickupLocation, 'Des Moines, IA');
  assert.equal(m.cashInCents, undefined);
  assert.equal(m.payMethod, undefined);

  // Forward only.
  assert.equal((await as(fleet.session).post(`/driver/loads/${id}/status`, { status: 'delivered' })).status, 400); // not picked up yet
  const up = await as(fleet.session).post(`/driver/loads/${id}/status`, { status: 'picked_up' });
  assert.equal(up.status, 200, JSON.stringify(up.body));
  assert.equal(up.body.load.status, 'picked_up');
  assert.equal((await as(fleet.session).post(`/driver/loads/${id}/status`, { status: 'picked_up' })).status, 400); // already
  const done = await as(fleet.session).post(`/driver/loads/${id}/status`, { status: 'delivered' });
  assert.equal(done.body.load.status, 'delivered');
  assert.ok(done.body.load.deliveredAt);
  assert.equal((await as(admin).get('/loads?status=delivered')).body.loads.length, 1);
});

test('loads belong to one company and one driver', async () => {
  const mineLoad = (await as(admin).post('/loads', load({ loadNumber: 'L-2000' }))).body.load;
  // Another company's driver and administrator see and change nothing of it.
  assert.equal((await as(otherFleet.session).get('/driver/loads')).body.loads.length, 0);
  assert.equal((await as(otherFleet.session).post(`/driver/loads/${mineLoad.id}/status`, { status: 'picked_up' })).status, 404);
  assert.equal((await as(otherAdmin).get('/loads')).body.loads.length, 0);
  assert.equal((await as(otherAdmin).patch(`/loads/${mineLoad.id}`, { broker: 'Hacker' })).status, 404);
  assert.equal((await as(otherAdmin).del(`/loads/${mineLoad.id}`)).status, 404);
  // A load cannot be given to another company's driver or truck.
  assert.equal((await as(admin).post('/loads', load({ driverId: otherFleet.driver.id }))).status, 400);
  assert.equal((await as(admin).post('/loads', load({ truckId: otherFleet.truck.id }))).status, 400);
  // A driver cannot write loads.
  assert.equal((await as(fleet.session).post('/loads', load())).status, 403);

  // Staff can change and remove.
  assert.equal((await as(dispatcher).patch(`/loads/${mineLoad.id}`, { broker: 'XYZ Freight', cashInCents: 60000 })).body.load.broker, 'XYZ Freight');
  assert.equal((await as(dispatcher).del(`/loads/${mineLoad.id}`)).status, 204);
  // Bad input is refused.
  assert.equal((await as(admin).post('/loads', load({ pickupTime: '25:99' }))).status, 400);
  assert.equal((await as(admin).post('/loads', load({ loadDate: 'tomorrow' }))).status, 400);
});


const fix = (secondsAgo = 5) => ({ latitude: 41.6, longitude: -93.6, gpsTimestamp: new Date(Date.now() - secondsAgo * 1000).toISOString(), accuracyMeters: 8 });

test('a trip started for a load is called by the load number, and the load is on its way', async () => {
  const fleet2 = await makeFleet(ctx, admin, 'C');
  const mine = (await as(admin).post('/loads', load({ loadNumber: 'L-7777', driverId: fleet2.driver.id, truckId: fleet2.truck.id }))).body.load;
  const theirs = (await as(admin).post('/loads', load({ loadNumber: 'L-8888' }))).body.load; // another driver's load

  // A load that is not the driver's own is refused.
  assert.equal((await as(fleet2.session).post('/trips/start', { ...fix(), loadId: theirs.id })).status, 404);
  const started = await as(fleet2.session).post('/trips/start', { ...fix(), loadId: mine.id });
  assert.equal(started.status, 201, JSON.stringify(started.body));
  assert.equal(started.body.trip.loadNumber, 'L-7777');
  assert.equal((await as(admin).get('/loads?status=picked_up')).body.loads.find((l) => l.id === mine.id).status, 'picked_up');
  // The trips list shows the load number.
  const listed = (await as(admin).get('/trips')).body.trips.find((t) => t.id === started.body.trip.id);
  assert.equal(listed.loadNumber, 'L-7777');
  // Without a load it still works, as before.
  await as(fleet2.session).post(`/trips/${started.body.trip.id}/end`, fix());
  const plain = await as(fleet2.session).post('/trips/start', fix());
  assert.equal(plain.status, 201);
  assert.equal(plain.body.trip.loadNumber, null);
});

test('a truck that stands still for 5 minutes during a trip tells the administrator once, and the stop stays on the map', async () => {
  const f = await makeFleet(ctx, admin, 'D');
  const started = await as(f.session).post('/trips/start', fix());
  const tripId = started.body.trip.id;
  // Seven minutes at the same place (the points a phone would send).
  const base = Date.now() - 7 * 60 * 1000;
  for (let i = 0; i <= 7; i += 1) {
    await ctx.db.query(
      `INSERT INTO location_history (event_id, company_id, driver_id, truck_id, trip_id, latitude, longitude, accuracy_meters, speed_mps, gps_timestamp)
       VALUES ($1, $2, $3, $4, $5, 41.6, -93.6, 6, 0, $6)`,
      [crypto.randomUUID(), admin.companyId, f.driver.id, f.truck.id, tripId, new Date(base + i * 60 * 1000)],
    );
  }
  const before = (await as(admin).get('/notifications')).body.notifications.length;
  const first = await checkTripStop(ctx.db, { companyId: admin.companyId, driverId: f.driver.id });
  assert.ok(first && first.ongoing && first.durationSeconds >= 300);
  const after = (await as(admin).get('/notifications')).body.notifications;
  assert.equal(after.length, before + 1);
  assert.match(after[0].title || '', /has not moved for 5 minutes/);
  // The second check does not tell again.
  await checkTripStop(ctx.db, { companyId: admin.companyId, driverId: f.driver.id });
  assert.equal((await as(admin).get('/notifications')).body.notifications.length, before + 1);
  // The stop is on the trip.
  const detail = (await as(admin).get(`/trips/${tripId}`)).body;
  assert.equal(detail.stops.length, 1);
  assert.ok(detail.stops[0].durationSeconds >= 300);
  // A trip that moves tells nothing.
  const g = await makeFleet(ctx, admin, 'E');
  const moving = await as(g.session).post('/trips/start', fix());
  for (let i = 0; i <= 7; i += 1) {
    await ctx.db.query(
      `INSERT INTO location_history (event_id, company_id, driver_id, truck_id, trip_id, latitude, longitude, accuracy_meters, speed_mps, gps_timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, -93.6, 6, 20, $7)`,
      [crypto.randomUUID(), admin.companyId, g.driver.id, g.truck.id, moving.body.trip.id, 41.6 + i * 0.01, new Date(base + i * 60 * 1000)],
    );
  }
  assert.equal(await checkTripStop(ctx.db, { companyId: admin.companyId, driverId: g.driver.id }), null);
});

test('a driver gets a reminder on the phone when a load is given to them', async () => {
  const sent = [];
  const pusher = { enabled: true, send: async (_db, userId, msg) => (sent.push({ userId, ...msg }), { sent: 1 }) };
  const c = await createTestContext({}, { pusher });
  const boss = await c.registerCompany('Remind Co');
  const f = await makeFleet(c, boss, 'R');
  const call = (m, p, b) => c.api()[m](V1 + p).set(bearer(boss)).send(b);
  // The phone registers itself.
  const token = 'ExponentPushToken[abc123abc123]';
  assert.equal((await c.api().post(V1 + '/driver/push-token').set(bearer(f.session)).send({ token })).status, 204);
  assert.equal((await c.api().post(V1 + '/driver/push-token').set(bearer(f.session)).send({ token: 'nope' })).status, 400);
  const made = await call('post', '/loads', load({ loadNumber: 'L-5150', driverId: f.driver.id, truckId: f.truck.id }));
  assert.equal(made.status, 201, JSON.stringify(made.body));
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(sent.length, 1);
  assert.match(sent[0].title, /L-5150/);
  assert.equal(sent[0].data.loadId, made.body.load.id);
  // Changing something else does not remind again.
  await call('patch', `/loads/${made.body.load.id}`, { broker: 'New Broker' });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(sent.length, 1);
  await c.db.close();
});

test('the owner can edit a dispatcher: name, email and a new password', async () => {
  const c = await createTestContext();
  const boss = await c.registerCompany('Edit Co');
  const email1 = `d1-${crypto.randomBytes(3).toString('hex')}@example.test`;
  const pw1 = randomPassword();
  const made = await c.api().post(V1 + '/team/dispatchers').set(bearer(boss)).send({ name: 'Dee One', email: email1, password: pw1 });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  const id = made.body.dispatcher.id;
  const email2 = `d2-${crypto.randomBytes(3).toString('hex')}@example.test`;
  const pw2 = randomPassword();
  const edit = await c.api().patch(`${V1}/team/dispatchers/${id}`).set(bearer(boss)).send({ name: 'Dee Two', email: email2, password: pw2 });
  assert.equal(edit.status, 200, JSON.stringify(edit.body));
  assert.equal(edit.body.dispatcher.name, 'Dee Two');
  assert.equal(edit.body.dispatcher.email, email2);
  assert.equal((await c.api().post(`${V1}/auth/login`).send({ email: email1, password: pw1 })).status, 401);
  assert.equal((await c.api().post(`${V1}/auth/login`).send({ email: email2, password: pw2 })).status, 200);
  assert.equal((await c.api().patch(`${V1}/team/dispatchers/${id}`).set(bearer(boss)).send({})).status, 400);
  await c.db.close();
});

test('a plan given by the platform owner carries its product, so a Both plan opens Loadova', async () => {
  const c = await createTestContext({ REQUIRE_SUBSCRIPTION: 'true' });
  const root = await c.createSuperAdmin();
  const co = await c.registerCompany('Both Co');
  const plan = (await c.api().post(V1 + '/admin/plans').set(bearer(root)).send({ name: 'Both test', priceCents: 0, product: 'both' })).body.plan;
  const companyId = (await c.db.query(`SELECT company_id FROM users WHERE role = 'COMPANY_ADMIN' ORDER BY created_at DESC LIMIT 1`)).rows[0].company_id;
  const put = await c.api().put(`${V1}/admin/companies/${companyId}/subscription`).set(bearer(root)).send({ planId: plan.id });
  assert.equal(put.status, 200, JSON.stringify(put.body));
  assert.equal(put.body.subscription.product, 'both');
  const loads = await c.api().get(V1 + '/loads').set(bearer(co));
  assert.equal(loads.status, 200, JSON.stringify(loads.body));
  await c.db.close();
});
