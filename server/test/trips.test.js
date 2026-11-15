import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createTestContext, bearer, makeFleet } from './helpers.js';
import { haversineMeters, routeDistance } from '../src/services/geo.js';

const V1 = '/api/v1';
let ctx, a, b;
const as = (session) => ({
  get: (path) => ctx.api().get(V1 + path).set(bearer(session)),
  post: (path, body) => ctx.api().post(V1 + path).set(bearer(session)).send(body),
});
const ago = (s) => new Date(Date.now() - s * 1000).toISOString();
const fix = (secondsAgo, lat = 32.7, extra = {}) => ({
  latitude: lat,
  longitude: -96.8,
  gpsTimestamp: ago(secondsAgo),
  accuracyMeters: 8,
  ...extra,
});
const point = (secondsAgo, lat) => ({
  eventId: crypto.randomUUID(),
  latitude: lat,
  longitude: -96.8,
  gpsTimestamp: ago(secondsAgo),
  accuracyMeters: 6,
  speedMps: 5,
});
const upload = (session, pts) => as(session).post('/gps/locations/batch', { batchId: crypto.randomUUID(), locations: pts });

before(async () => {
  ctx = await createTestContext();
  a = await ctx.registerCompany('Alpha Freight');
  b = await ctx.registerCompany('Bravo Haulers');
});
after(async () => {
  await ctx.db.close();
});

test('distance: needs enough points, ignores jitter and GPS jumps', () => {
  const t0 = Date.now();
  const p = (i, lat, acc = 5) => ({ latitude: lat, longitude: -96.8, accuracyMeters: acc, timeMs: t0 + i * 10000 });
  assert.equal(routeDistance([p(0, 32.7), p(1, 32.701)]), null);

  // ~111 m per 0.001 degrees of latitude, 11 m/s.
  const d = routeDistance([p(0, 32.7), p(1, 32.701), p(2, 32.702)]);
  assert.ok(Math.abs(d - haversineMeters({ latitude: 32.7, longitude: -96.8 }, { latitude: 32.702, longitude: -96.8 })) < 2);

  // Standing still with 1 m of jitter adds nothing.
  assert.equal(routeDistance([p(0, 32.7), p(1, 32.700005), p(2, 32.7), p(3, 32.700005)]), 0);
  // A teleport of 1000 km in 10 s is dropped; a poor-accuracy point is ignored.
  const withJump = routeDistance([p(0, 32.7), p(1, 32.701), p(2, 42.0), p(3, 42.001)]);
  assert.ok(withJump < 400, `jump counted: ${withJump}`);
  assert.equal(routeDistance([p(0, 32.7), p(1, 32.701, 500), p(2, 32.702)]), null);
});

test('only a driver can start a trip, and only with a real, fresh, accurate GPS fix', async () => {
  const f = await makeFleet(ctx, a, 'S1');
  assert.equal((await ctx.api().post(`${V1}/trips/start`).send(fix(5))).status, 401);
  assert.equal((await as(a).post('/trips/start', fix(5))).status, 403);

  const post = (body) => as(f.session).post('/trips/start', body);
  assert.equal((await post({})).status, 400);
  assert.equal((await post({ ...fix(5), latitude: 95 })).status, 400);
  const stale = await post(fix(600));
  assert.equal(stale.status, 422);
  assert.equal(stale.body.error.code, 'GPS_FIX_STALE');
  const weak = await post(fix(5, 32.7, { accuracyMeters: 900 }));
  assert.equal(weak.body.error.code, 'GPS_FIX_INACCURATE');
  assert.equal((await post(fix(-3600))).body.error.code, 'GPS_FIX_INVALID_TIME');
  // The company cannot be chosen by the client.
  assert.equal((await post({ ...fix(5), companyId: b.companyId })).status, 400);

  const { rows } = await ctx.db.query('SELECT count(*)::int AS n FROM trips WHERE driver_id = $1', [f.driver.id]);
  assert.equal(rows[0].n, 0); // nothing was saved by the refused attempts
});

test('a driver with no truck cannot start; only one active trip at a time', async () => {
  const none = await makeFleet(ctx, a, 'S2', { assign: false });
  const refused = await as(none.session).post('/trips/start', fix(5));
  assert.equal(refused.status, 409);
  assert.equal(refused.body.error.code, 'NO_TRUCK_ASSIGNED');

  const f = await makeFleet(ctx, a, 'S3');
  const first = await as(f.session).post('/trips/start', fix(5));
  assert.equal(first.status, 201);
  assert.equal(first.body.trip.status, 'ACTIVE');
  assert.equal(first.body.trip.truck.id, f.truck.id);
  assert.equal(first.body.trip.start.latitude, 32.7);

  const second = await as(f.session).post('/trips/start', fix(3));
  assert.equal(second.status, 409);
  assert.equal(second.body.error.code, 'ACTIVE_TRIP');
  assert.equal(second.body.error.details.tripId, first.body.trip.id);

  // Concurrent starts by the same driver produce exactly one trip.
  const g = await makeFleet(ctx, a, 'S4');
  const results = await Promise.all([1, 2, 3].map(() => as(g.session).post('/trips/start', fix(5))));
  assert.equal(results.filter((r) => r.status === 201).length, 1);
  const { rows } = await ctx.db.query(`SELECT count(*)::int AS n FROM trips WHERE driver_id = $1 AND status = 'ACTIVE'`, [g.driver.id]);
  assert.equal(rows[0].n, 1);

  // The active trip is visible on the driver's own profile.
  assert.equal((await as(f.session).get('/driver/me')).body.activeTrip.id, first.body.trip.id);
});

test('a full trip: start, GPS points, end with duration and distance, events, notifications', async () => {
  const f = await makeFleet(ctx, a, 'T1');
  const events = [];
  const on = (name) => (e) => events.push([name, e]);
  const handlers = ['trip:started', 'trip:completed', 'truck:location_updated'].map((n) => [n, on(n)]);
  handlers.forEach(([n, h]) => ctx.app.locals.events.on(n, h));

  const start = await as(f.session).post('/trips/start', fix(100, 32.7));
  assert.equal(start.status, 201);
  const tripId = start.body.trip.id;

  // Four points on the way, each about 55 m (0.0005 deg) apart.
  const up = await upload(f.session, [
    point(80, 32.7005),
    point(60, 32.701),
    point(40, 32.7015),
    point(20, 32.702),
  ]);
  assert.equal(up.body.accepted, 4);

  const end = await as(f.session).post(`/trips/${tripId}/end`, fix(5, 32.7025));
  assert.equal(end.status, 200, JSON.stringify(end.body));
  handlers.forEach(([n, h]) => ctx.app.locals.events.off(n, h));

  const t = end.body.trip;
  assert.equal(t.status, 'COMPLETED');
  assert.equal(t.end.latitude, 32.7025);
  assert.ok(Math.abs(t.durationSeconds - 95) <= 2, `duration ${t.durationSeconds}`);
  const expected = haversineMeters({ latitude: 32.7, longitude: -96.8 }, { latitude: 32.7025, longitude: -96.8 });
  assert.ok(Math.abs(t.distanceMeters - expected) < 15, `distance ${t.distanceMeters} vs ${expected}`);

  // Start and end points are part of the trip's stored route.
  const route = await ctx.db.query('SELECT count(*)::int AS n FROM location_history WHERE trip_id = $1', [tripId]);
  assert.equal(route.rows[0].n, 6);

  const names = events.map(([n]) => n);
  assert.ok(names.includes('trip:started') && names.includes('trip:completed'));
  const completed = events.find(([n]) => n === 'trip:completed')[1];
  assert.equal(completed.companyId, a.companyId);
  assert.equal(completed.trip.id, tripId);
  assert.equal(completed.trip.driver, undefined); // no personal data in broadcasts

  // Ending twice is refused, and the driver can start a new trip afterwards.
  assert.equal((await as(f.session).post(`/trips/${tripId}/end`, fix(3, 32.703))).body.error.code, 'TRIP_NOT_ACTIVE');
  assert.equal((await as(f.session).post('/trips/start', fix(2, 32.703))).status, 201);

  // The company's admins were notified; the other company was not.
  const mine = await as(a).get('/notifications');
  const types = mine.body.notifications.map((n) => n.type);
  assert.ok(types.includes('TRIP_STARTED') && types.includes('TRIP_COMPLETED'));
  assert.ok(mine.body.unreadCount >= 2);
  assert.equal((await as(b).get('/notifications')).body.notifications.length, 0);
});

test('a trip with too few route points has no distance; ending needs a fix after the start', async () => {
  const f = await makeFleet(ctx, a, 'T2');
  const start = await as(f.session).post('/trips/start', fix(60, 32.7));
  const id = start.body.trip.id;
  const before = await as(f.session).post(`/trips/${id}/end`, fix(90, 32.71));
  assert.equal(before.status, 422);
  assert.equal(before.body.error.code, 'GPS_FIX_BEFORE_START');
  const end = await as(f.session).post(`/trips/${id}/end`, fix(5, 32.71));
  assert.equal(end.body.trip.distanceMeters, null); // only the two end points: not enough to measure
  assert.ok(end.body.trip.durationSeconds >= 50);
});

test('only the trip\'s own driver can end it', async () => {
  const f = await makeFleet(ctx, a, 'T3');
  const other = await makeFleet(ctx, a, 'T4');
  const start = await as(f.session).post('/trips/start', fix(30));
  const id = start.body.trip.id;
  assert.equal((await as(other.session).post(`/trips/${id}/end`, fix(5))).status, 404);
  assert.equal((await as(a).post(`/trips/${id}/end`, fix(5))).status, 403);
  const foreign = await makeFleet(ctx, b, 'T5');
  assert.equal((await as(foreign.session).post(`/trips/${id}/end`, fix(5))).status, 404);
  assert.equal((await as(f.session).post(`/trips/${crypto.randomUUID()}/end`, fix(5))).status, 404);
});

test('trip history and detail: admins see the company, drivers only their own, nobody sees other companies', async () => {
  const f = await makeFleet(ctx, a, 'H1');
  const g = await makeFleet(ctx, a, 'H2');
  const tf = (await as(f.session).post('/trips/start', fix(100))).body.trip;
  await upload(f.session, [point(60, 32.7005), point(40, 32.701)]);
  await as(f.session).post(`/trips/${tf.id}/end`, fix(5, 32.7015));
  const tg = (await as(g.session).post('/trips/start', fix(20))).body.trip;
  const foreign = await makeFleet(ctx, b, 'H3');
  const tb = (await as(foreign.session).post('/trips/start', fix(20))).body.trip;

  const all = await as(a).get('/trips?limit=200');
  const ids = all.body.trips.map((t) => t.id);
  assert.ok(ids.includes(tf.id) && ids.includes(tg.id));
  assert.ok(!ids.includes(tb.id));
  assert.equal(all.body.total, ids.length);

  const filtered = await as(a).get(`/trips?driverId=${f.driver.id}&status=COMPLETED`);
  assert.deepEqual(filtered.body.trips.map((t) => t.id), [tf.id]);
  assert.equal((await as(a).get('/trips?limit=1')).body.trips.length, 1);
  assert.equal((await as(a).get('/trips?status=NOPE')).status, 400);

  const mine = await as(f.session).get('/trips');
  assert.deepEqual(mine.body.trips.map((t) => t.id), [tf.id]);
  assert.equal((await as(f.session).get(`/trips/${tg.id}`)).status, 404);

  const detail = await as(a).get(`/trips/${tf.id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.routePointCount, 4);
  assert.equal(detail.body.route[0].latitude, 32.7);
  assert.equal((await as(a).get(`/trips/${tb.id}`)).status, 404);
  assert.equal((await as(b).get(`/trips/${tf.id}`)).status, 404);
  assert.equal((await as(f.session).get(`/trips/${tf.id}`)).status, 200);
});

test('late offline points join the trip and a recalculation picks them up', async () => {
  const f = await makeFleet(ctx, a, 'L1');
  const trip = (await as(f.session).post('/trips/start', fix(100, 32.7))).body.trip;
  const end = await as(f.session).post(`/trips/${trip.id}/end`, fix(10, 32.7005));
  assert.equal(end.body.trip.distanceMeters, null);

  // Points recorded during the trip but uploaded after it ended.
  await upload(f.session, [point(80, 32.7002), point(60, 32.7003), point(40, 32.7004)]);
  const linked = await ctx.db.query('SELECT count(*)::int AS n FROM location_history WHERE trip_id = $1', [trip.id]);
  assert.equal(linked.rows[0].n, 5);

  assert.equal((await as(f.session).post(`/trips/${trip.id}/recalculate-distance`)).status, 403);
  const re = await as(a).post(`/trips/${trip.id}/recalculate-distance`);
  assert.equal(re.status, 200);
  assert.ok(re.body.trip.distanceMeters > 40 && re.body.trip.distanceMeters < 70);

  const active = (await as((await makeFleet(ctx, a, 'L2')).session).post('/trips/start', fix(5))).body.trip;
  assert.equal((await as(a).post(`/trips/${active.id}/recalculate-distance`)).status, 409);
});
