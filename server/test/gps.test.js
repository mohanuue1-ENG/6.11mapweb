import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createTestContext, bearer, randomPassword } from './helpers.js';

let ctx, a, b, fleetA, fleetB;
const V1 = '/api/v1';
const as = (session) => ({
  get: (path) => ctx.api().get(V1 + path).set(bearer(session)),
  post: (path, body) => ctx.api().post(V1 + path).set(bearer(session)).send(body),
  patch: (path, body) => ctx.api().patch(V1 + path).set(bearer(session)).send(body),
  del: (path) => ctx.api().delete(V1 + path).set(bearer(session)),
});

const ago = (seconds) => new Date(Date.now() - seconds * 1000).toISOString();
const point = (secondsAgo, extra = {}) => ({
  eventId: crypto.randomUUID(),
  latitude: 32.7767,
  longitude: -96.797,
  gpsTimestamp: ago(secondsAgo),
  accuracyMeters: 8.5,
  speedMps: 12.2,
  headingDegrees: 180,
  ...extra,
});
const batch = (locations) => ({ batchId: crypto.randomUUID(), locations });

// A truck, a driver with a login, and (optionally) an assignment that started an hour ago.
async function makeFleet(admin, label, { assign = true } = {}) {
  const truck = (await as(admin).post('/trucks', { truckNumber: `${label}-T` })).body.truck;
  const email = `${label.toLowerCase()}-${crypto.randomBytes(3).toString('hex')}@example.test`;
  const password = randomPassword();
  const driver = (await as(admin).post('/drivers', { name: `${label} Driver`, login: { email, password } })).body.driver;
  if (assign) {
    await as(admin).post('/assignments', { driverId: driver.id, truckId: truck.id });
    await ctx.db.query(`UPDATE driver_truck_assignments SET start_at = now() - interval '1 hour' WHERE driver_id = $1`, [
      driver.id,
    ]);
  }
  const login = await ctx.api().post(`${V1}/auth/login`).set('X-Client-Type', 'mobile').send({ email, password });
  assert.equal(login.status, 200);
  return { truck, driver, session: login.body };
}

before(async () => {
  ctx = await createTestContext();
  a = await ctx.registerCompany('Alpha Freight');
  b = await ctx.registerCompany('Bravo Haulers');
  fleetA = await makeFleet(a, 'A');
  fleetB = await makeFleet(b, 'B');
});
after(async () => {
  await ctx.db.close();
});

test('only drivers can upload GPS, and only admins can read it', async () => {
  const body = batch([point(10)]);
  assert.equal((await ctx.api().post(`${V1}/gps/locations/batch`).send(body)).status, 401);
  assert.equal((await as(a).post('/gps/locations/batch', body)).status, 403);
  assert.equal((await as(fleetA.session).get('/gps/history')).status, 403);
  assert.equal((await as(fleetA.session).get('/gps/locations/current')).status, 403);
  assert.equal((await as(fleetA.session).get(`/trucks/${fleetA.truck.id}/location`)).status, 403);
});

test('a valid batch is stored against the driver\'s company and assigned truck', async () => {
  const pts = [point(30), point(20), point(10, { latitude: 32.8, longitude: -96.8, speedMps: 20 })];
  const events = [];
  const onEvent = (e) => events.push(e);
  ctx.app.locals.events.on('truck:location_updated', onEvent);

  const body = batch(pts);
  const res = await as(fleetA.session).post('/gps/locations/batch', body);
  ctx.app.locals.events.off('truck:location_updated', onEvent);

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body, { batchId: body.batchId, accepted: 3, duplicates: 0, rejected: [] });

  const { rows } = await ctx.db.query(
    'SELECT company_id, driver_id, truck_id, received_at, gps_timestamp FROM location_history WHERE event_id = ANY($1::uuid[])',
    [pts.map((p) => p.eventId)],
  );
  assert.equal(rows.length, 3);
  for (const r of rows) {
    assert.equal(r.company_id, a.companyId);
    assert.equal(r.driver_id, fleetA.driver.id);
    assert.equal(r.truck_id, fleetA.truck.id);
    assert.ok(r.received_at > r.gps_timestamp); // device time and server time are both kept
  }

  // The newest point became the truck's current location, and was announced once.
  const loc = await as(a).get(`/trucks/${fleetA.truck.id}/location`);
  assert.equal(loc.body.location.latitude, 32.8);
  assert.equal(loc.body.location.speedMps, 20);
  assert.equal(events.length, 1);
  assert.equal(events[0].companyId, a.companyId);
  assert.equal(events[0].location.truckId, fleetA.truck.id);
  assert.equal(events[0].location.latitude, 32.8);
});

test('the client cannot choose another company, driver or truck', async () => {
  const p = point(5, { truckId: fleetB.truck.id, companyId: b.companyId, driverId: fleetB.driver.id });
  const res = await as(fleetA.session).post('/gps/locations/batch', {
    ...batch([p]),
    companyId: b.companyId,
    truckId: fleetB.truck.id,
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.accepted, 1);
  const { rows } = await ctx.db.query('SELECT company_id, truck_id, driver_id FROM location_history WHERE event_id = $1', [
    p.eventId,
  ]);
  assert.equal(rows[0].company_id, a.companyId);
  assert.equal(rows[0].truck_id, fleetA.truck.id);
  assert.equal(rows[0].driver_id, fleetA.driver.id);
  assert.equal((await as(b).get(`/trucks/${fleetB.truck.id}/location`)).body.location, null);
});

test('re-sending points after a lost response creates no duplicates', async () => {
  const pts = [point(50), point(40)];
  const first = await as(fleetA.session).post('/gps/locations/batch', batch(pts));
  assert.equal(first.body.accepted, 2);

  // Same points again, plus one new one, plus the same event twice in one batch.
  const fresh = point(35);
  const retry = await as(fleetA.session).post('/gps/locations/batch', batch([...pts, fresh, fresh]));
  assert.equal(retry.status, 200);
  assert.equal(retry.body.accepted, 1);
  assert.equal(retry.body.duplicates, 3);

  const { rows } = await ctx.db.query('SELECT count(*)::int AS n FROM location_history WHERE event_id = ANY($1::uuid[])', [
    [...pts, fresh].map((p) => p.eventId),
  ]);
  assert.equal(rows[0].n, 3);
});

test('bad points are rejected one by one without blocking the good ones', async () => {
  const good = point(15);
  const res = await as(fleetA.session).post(
    '/gps/locations/batch',
    batch([
      point(15, { latitude: 91 }),
      point(15, { longitude: -181 }),
      point(15, { gpsTimestamp: 'yesterday' }),
      point(-3600), // an hour in the future
      point(30 * 24 * 3600), // a month old
      { ...point(15), eventId: 'not-a-uuid' },
      point(15, { speedMps: -1 }),
      good,
    ]),
  );
  assert.equal(res.status, 200);
  assert.equal(res.body.accepted, 1);
  assert.deepEqual(
    res.body.rejected.map((r) => [r.index, r.reason]),
    [
      [0, 'INVALID'],
      [1, 'INVALID'],
      [2, 'INVALID'],
      [3, 'FUTURE_TIMESTAMP'],
      [4, 'TOO_OLD'],
      [5, 'INVALID'],
      [6, 'INVALID'],
    ],
  );
  assert.equal(res.body.rejected[0].field, 'latitude');
});

test('malformed and oversized batches are refused', async () => {
  const post = (body) => as(fleetA.session).post('/gps/locations/batch', body);
  assert.equal((await post({})).status, 400);
  assert.equal((await post({ batchId: 'x', locations: [point(5)] })).status, 400);
  assert.equal((await post({ batchId: crypto.randomUUID(), locations: [] })).status, 400);
  assert.equal((await post({ batchId: crypto.randomUUID(), locations: 'nope' })).status, 400);

  const tooMany = Array.from({ length: ctx.config.gpsMaxBatchSize + 1 }, () => point(5));
  assert.equal((await post(batch(tooMany))).status, 400);

  // A full-size batch fits within the body limit and is stored.
  const full = Array.from({ length: ctx.config.gpsMaxBatchSize }, (_, i) => point(600 + i));
  const ok = await post(batch(full));
  assert.equal(ok.status, 200, JSON.stringify(ok.body).slice(0, 200));
  assert.equal(ok.body.accepted, ctx.config.gpsMaxBatchSize);
});

test('an old upload never moves the current location backwards', async () => {
  const newest = point(2, { latitude: 33.5 });
  await as(fleetA.session).post('/gps/locations/batch', batch([newest]));
  const late = await as(fleetA.session).post('/gps/locations/batch', batch([point(1800, { latitude: 10 })]));
  assert.equal(late.body.accepted, 1);
  const loc = await as(a).get(`/trucks/${fleetA.truck.id}/location`);
  assert.equal(loc.body.location.latitude, 33.5);
});

test('points are attributed to the truck assigned at the time they were recorded', async () => {
  const f = await makeFleet(a, 'RE');
  const second = (await as(a).post('/trucks', { truckNumber: 'RE-T2' })).body.truck;

  // Reassign the driver; pretend the switch happened 10 minutes ago.
  await as(a).post('/assignments', { driverId: f.driver.id, truckId: second.id });
  await ctx.db.query(
    `UPDATE driver_truck_assignments SET end_at = now() - interval '10 minutes' WHERE driver_id = $1 AND NOT active`,
    [f.driver.id],
  );
  await ctx.db.query(
    `UPDATE driver_truck_assignments SET start_at = now() - interval '10 minutes' WHERE driver_id = $1 AND active`,
    [f.driver.id],
  );

  const offlineOld = point(20 * 60); // recorded on the first truck, uploaded late
  const recent = point(60);
  const beforeAny = point(3 * 3600); // before the driver had any truck
  const res = await as(f.session).post('/gps/locations/batch', batch([offlineOld, recent, beforeAny]));
  assert.equal(res.body.accepted, 2);
  assert.deepEqual(res.body.rejected, [{ index: 2, eventId: beforeAny.eventId, reason: 'NO_TRUCK_ASSIGNED' }]);

  const truckOf = async (p) =>
    (await ctx.db.query('SELECT truck_id FROM location_history WHERE event_id = $1', [p.eventId])).rows[0].truck_id;
  assert.equal(await truckOf(offlineOld), f.truck.id);
  assert.equal(await truckOf(recent), second.id);
});

test('a driver with no truck, or who was deactivated, cannot upload', async () => {
  const f = await makeFleet(a, 'NT', { assign: false });
  const none = await as(f.session).post('/gps/locations/batch', batch([point(5)]));
  assert.equal(none.status, 200);
  assert.equal(none.body.accepted, 0);
  assert.equal(none.body.rejected[0].reason, 'NO_TRUCK_ASSIGNED');

  await as(a).patch(`/drivers/${f.driver.id}`, { status: 'inactive' });
  assert.equal((await as(f.session).post('/gps/locations/batch', batch([point(5)]))).status, 403);
});

test('points recorded during a trip are linked to it', async () => {
  const f = await makeFleet(a, 'TR');
  const trip = (
    await ctx.db.query(
      `INSERT INTO trips (company_id, driver_id, truck_id, start_latitude, start_longitude, start_gps_timestamp)
       VALUES ($1, $2, $3, 32.1, -96.1, now() - interval '5 minutes') RETURNING id`,
      [a.companyId, f.driver.id, f.truck.id],
    )
  ).rows[0].id;

  const during = point(60);
  const beforeTrip = point(20 * 60);
  await as(f.session).post('/gps/locations/batch', batch([during, beforeTrip]));

  const tripOf = async (p) =>
    (await ctx.db.query('SELECT trip_id FROM location_history WHERE event_id = $1', [p.eventId])).rows[0].trip_id;
  assert.equal(await tripOf(during), trip);
  assert.equal(await tripOf(beforeTrip), null);

  const byTrip = await as(a).get(`/gps/history?tripId=${trip}`);
  assert.equal(byTrip.body.points.length, 1);
  assert.equal(byTrip.body.points[0].tripId, trip);
});

test('history is filtered, bounded and limited to the admin\'s company', async () => {
  await as(fleetB.session).post('/gps/locations/batch', batch([point(10), point(5)]));

  const all = await as(a).get('/gps/history?limit=5000');
  assert.equal(all.status, 200);
  assert.ok(all.body.points.length > 500);
  assert.ok(all.body.points.every((p) => p.truckId !== fleetB.truck.id));
  // Newest first.
  const times = all.body.points.map((p) => Date.parse(p.gpsTimestamp));
  assert.deepEqual(times, [...times].sort((x, y) => y - x));

  const limited = await as(a).get('/gps/history?limit=2');
  assert.equal(limited.body.points.length, 2);
  assert.equal(limited.body.hasMore, true);

  const byTruck = await as(a).get(`/gps/history?truckId=${fleetA.truck.id}&from=${encodeURIComponent(ago(120))}`);
  assert.ok(byTruck.body.points.length >= 1);
  assert.ok(byTruck.body.points.every((p) => p.truckId === fleetA.truck.id && Date.parse(p.gpsTimestamp) >= Date.now() - 121000));

  // Another company's truck id returns nothing, not their data.
  assert.equal((await as(a).get(`/gps/history?truckId=${fleetB.truck.id}`)).body.points.length, 0);
  assert.equal((await as(a).get(`/trucks/${fleetB.truck.id}/location`)).status, 404);
  assert.equal((await as(a).get('/gps/history?truckId=nope')).status, 400);
  assert.equal((await as(a).get('/gps/history?limit=999999')).status, 400);

  const current = await as(b).get('/gps/locations/current');
  assert.deepEqual(
    current.body.locations.map((l) => l.truckId),
    [fleetB.truck.id],
  );
});

test('a driver sees their own profile and assigned truck, nothing else', async () => {
  const me = await as(fleetA.session).get('/driver/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.driver.id, fleetA.driver.id);
  assert.equal(me.body.truck.id, fleetA.truck.id);
  assert.equal(me.body.company.id, a.companyId);
  assert.equal(me.body.activeTrip, null);

  assert.equal((await as(a).get('/driver/me')).status, 403);
  assert.equal((await as(fleetA.session).get(`/trucks/${fleetA.truck.id}`)).status, 403);

  const unassigned = await makeFleet(b, 'UN', { assign: false });
  assert.equal((await as(unassigned.session).get('/driver/me')).body.truck, null);
});
