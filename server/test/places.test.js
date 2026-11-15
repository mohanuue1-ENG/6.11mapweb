import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createTestContext, bearer, randomPassword } from './helpers.js';
import { createGeocoder, placeFrom } from '../src/services/geocode.js';
import { findLastStop } from '../src/services/stops.js';

const V1 = '/api/v1';

// ---- place names ----

const nominatim = {
  display_name: '1200, Interstate 35, Waco, McLennan County, Texas, 76706, United States',
  address: { road: 'Interstate 35', city: 'Waco', county: 'McLennan County', state: 'Texas', postcode: '76706', country: 'United States' },
};

test('placeFrom builds a short name from road, area and state', () => {
  const p = placeFrom(nominatim);
  assert.equal(p.name, 'Interstate 35, Waco, Texas');
  assert.equal(p.state, 'Texas');
  assert.equal(placeFrom({}), null);
  assert.equal(placeFrom({ address: {} }), null);
});

function fakeGeocoder(handler, extra = {}) {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url: String(url), opts });
    return handler(calls.length);
  };
  const g = createGeocoder({ geocoderUrl: 'https://geo.example.test/reverse', geocoderUserAgent: 'test-agent', ...extra }, { fetchImpl, sleep: async () => {} });
  return { g, calls };
}

test('reverse geocoding asks the service once per position and caches the answer', async () => {
  const { g, calls } = fakeGeocoder(() => ({ ok: true, json: async () => nominatim }));
  const a = await g.reverse(31.5493, -97.1467);
  const b = await g.reverse(31.54931, -97.14671); // about a metre away: same cache cell
  assert.equal(a.name, 'Interstate 35, Waco, Texas');
  assert.deepEqual(a, b);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /lat=31\.5493/);
  assert.equal(calls[0].opts.headers['User-Agent'], 'test-agent');
});

test('simultaneous lookups of one position share a single request', async () => {
  const { g, calls } = fakeGeocoder(() => ({ ok: true, json: async () => nominatim }));
  const results = await Promise.all([g.reverse(10, 10), g.reverse(10, 10), g.reverse(10, 10)]);
  assert.equal(calls.length, 1);
  assert.ok(results.every((r) => r.name === 'Interstate 35, Waco, Texas'));
});

test('a failing service gives null, and is not asked again straight away', async () => {
  const { g, calls } = fakeGeocoder(() => ({ ok: false, status: 503, json: async () => ({}) }));
  assert.equal(await g.reverse(20, 20), null);
  assert.equal(await g.reverse(20, 20), null);
  assert.equal(calls.length, 1);
});

test('with no service configured nothing is sent anywhere', async () => {
  const { g, calls } = fakeGeocoder(() => ({ ok: true, json: async () => nominatim }), { geocoderUrl: '' });
  assert.equal(g.enabled, false);
  assert.equal(await g.reverse(1, 1), null);
  assert.equal(calls.length, 0);
});

// ---- stops ----

const T0 = Date.UTC(2026, 0, 1, 12, 0, 0);
const at = (minutes, lat, lng, extra = {}) => ({ latitude: lat, longitude: lng, timeMs: T0 + minutes * 60_000, ...extra });

test('a truck sitting in one place for several minutes is a stop, and it is ongoing at the end', () => {
  const pts = [at(0, 32.0, -96.0), at(1, 32.01, -96.0), at(2, 32.1, -96.0), at(3, 32.1001, -96.0001), at(6, 32.1, -96.0), at(9, 32.10005, -96.0)];
  const stop = findLastStop(pts);
  assert.ok(stop);
  assert.equal(stop.ongoing, true);
  assert.equal(stop.durationSeconds, 7 * 60);
  assert.ok(Math.abs(stop.latitude - 32.1) < 0.001);
});

test('a truck that kept moving has no stop, and a finished stop is not ongoing', () => {
  const moving = [0, 1, 2, 3, 4].map((m) => at(m, 32 + m * 0.01, -96));
  assert.equal(findLastStop(moving), null);

  const pts = [at(0, 32.0, -96), at(5, 32.0, -96), at(6, 32.05, -96), at(7, 32.1, -96)];
  const stop = findLastStop(pts);
  assert.equal(stop.ongoing, false);
  assert.equal(stop.durationSeconds, 300);
});

test('GPS jitter does not split a stop, and a short pause is not a stop', () => {
  const jitter = [at(0, 32, -96), at(2, 32.0002, -96), at(4, 32, -96.0002), at(6, 32.0001, -96.0001)];
  assert.equal(findLastStop(jitter).durationSeconds, 360);
  assert.equal(findLastStop([at(0, 32, -96), at(1, 32, -96)]), null);
});

test('points with poor accuracy are ignored', () => {
  const pts = [at(0, 32, -96), at(3, 33, -97, { accuracyMeters: 500 }), at(5, 32, -96)];
  assert.equal(findLastStop(pts).durationSeconds, 300);
});

// ---- the API ----

let ctx, a1, b1, truck, driverSession;
const as = (s) => ({ get: (path) => ctx.api().get(V1 + path).set(bearer(s)), post: (path, body) => ctx.api().post(V1 + path).set(bearer(s)).send(body) });

before(async () => {
  ctx = await createTestContext();
  a1 = await ctx.registerCompany('Alpha Freight');
  b1 = await ctx.registerCompany('Bravo Haulers');
  truck = (await as(a1).post('/trucks', { truckNumber: 'A-1' })).body.truck;
  const email = `d-${crypto.randomBytes(3).toString('hex')}@example.test`;
  const password = randomPassword();
  const driver = (await as(a1).post('/drivers', { name: 'Dee', login: { email, password } })).body.driver;
  await as(a1).post('/assignments', { driverId: driver.id, truckId: truck.id });
  await ctx.db.query(`UPDATE driver_truck_assignments SET start_at = now() - interval '2 hours' WHERE driver_id = $1`, [driver.id]);
  driverSession = (await ctx.api().post(`${V1}/auth/login`).set('X-Client-Type', 'mobile').send({ email, password })).body;
});
after(async () => ctx.db.close());

test('activity reports where the truck stood still, and only for the company\'s own trucks', async () => {
  const ago = (min) => new Date(Date.now() - min * 60_000).toISOString();
  const locations = [30, 25, 20, 15, 10, 5].map((m) => ({ eventId: crypto.randomUUID(), latitude: 32.7767, longitude: -96.797, gpsTimestamp: ago(m), accuracyMeters: 8, speedMps: 0 }));
  const up = await as(driverSession).post('/gps/locations/batch', { batchId: crypto.randomUUID(), locations });
  assert.equal(up.status, 200, JSON.stringify(up.body));

  const res = await as(a1).get(`/gps/trucks/${truck.id}/activity`);
  assert.equal(res.status, 200);
  assert.equal(res.body.lastStop.ongoing, true);
  assert.equal(res.body.lastStop.durationSeconds, 25 * 60);
  assert.ok(Math.abs(res.body.lastStop.latitude - 32.7767) < 1e-6);

  assert.equal((await as(b1).get(`/gps/trucks/${truck.id}/activity`)).status, 404);
  assert.equal((await as(driverSession).get(`/gps/trucks/${truck.id}/activity`)).status, 403);
});

test('the geocode endpoint is for company admins, validates input, and answers null when lookups are off', async () => {
  assert.equal((await ctx.api().get(`${V1}/gps/geocode?lat=1&lng=1`)).status, 401);
  assert.equal((await as(driverSession).get('/gps/geocode?lat=1&lng=1')).status, 403);
  assert.equal((await as(a1).get('/gps/geocode?lat=abc&lng=1')).status, 400);
  assert.equal((await as(a1).get('/gps/geocode?lat=95&lng=1')).status, 400);
  const ok = await as(a1).get('/gps/geocode?lat=32.7&lng=-96.8');
  assert.equal(ok.status, 200);
  assert.equal(ok.body.place, null);
});
