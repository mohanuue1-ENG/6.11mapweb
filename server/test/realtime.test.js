import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { io as connect } from 'socket.io-client';
import { createTestContext, bearer, randomPassword } from './helpers.js';

const V1 = '/api/v1';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let ctx, rt, a, b, driverA, truckA, root;
const sockets = [];

function open(url, token) {
  const socket = connect(url, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true });
  sockets.push(socket);
  return socket;
}
// Resolves with 'connected' or the refusal code.
const outcome = (socket) =>
  new Promise((resolve) => {
    socket.once('connect', () => resolve('connected'));
    socket.once('connect_error', (err) => resolve(err.data?.code || err.message));
  });
const subscribe = (socket, payload) => new Promise((resolve) => socket.emit('company:subscribe', payload, resolve));
const collect = (socket, name) => {
  const seen = [];
  socket.on(name, (p) => seen.push(p));
  return seen;
};

async function makeDriver(context, admin, label) {
  const post = (path, body) => context.api().post(V1 + path).set(bearer(admin)).send(body);
  const truck = (await post('/trucks', { truckNumber: `${label}-1` })).body.truck;
  const email = `${label.toLowerCase()}-${crypto.randomBytes(3).toString('hex')}@example.test`;
  const password = randomPassword();
  const driver = (await post('/drivers', { name: `${label} Driver`, login: { email, password } })).body.driver;
  await post('/assignments', { driverId: driver.id, truckId: truck.id });
  await context.db.query(`UPDATE driver_truck_assignments SET start_at = now() - interval '1 hour' WHERE driver_id = $1`, [
    driver.id,
  ]);
  const login = await context.api().post(`${V1}/auth/login`).set('X-Client-Type', 'mobile').send({ email, password });
  return { truck, session: login.body };
}

const upload = (context, session, latitude) =>
  context
    .api()
    .post(`${V1}/gps/locations/batch`)
    .set(bearer(session))
    .send({
      batchId: crypto.randomUUID(),
      locations: [
        {
          eventId: crypto.randomUUID(),
          latitude,
          longitude: -96.797,
          gpsTimestamp: new Date().toISOString(),
          speedMps: 10,
          headingDegrees: 90,
        },
      ],
    });

before(async () => {
  ctx = await createTestContext();
  rt = await ctx.startRealtime();
  a = await ctx.registerCompany('Alpha Freight');
  b = await ctx.registerCompany('Bravo Haulers');
  root = await ctx.createSuperAdmin();
  const f = await makeDriver(ctx, a, 'A');
  driverA = f.session;
  truckA = f.truck;
});
after(async () => {
  for (const s of sockets) s.close();
  await rt.close();
  await ctx.db.close();
});

test('the handshake requires a valid company admin token', async () => {
  assert.equal(await outcome(open(rt.url, undefined)), 'UNAUTHORIZED');
  assert.equal(await outcome(open(rt.url, 'garbage')), 'UNAUTHORIZED');
  assert.equal(await outcome(open(rt.url, driverA.accessToken)), 'FORBIDDEN');
  assert.equal(await outcome(open(rt.url, root.accessToken)), 'FORBIDDEN');
  assert.equal(await outcome(open(rt.url, a.accessToken)), 'connected');
});

test('a saved GPS point reaches that company\'s subscribers only', async () => {
  const sa = open(rt.url, a.accessToken);
  const sb = open(rt.url, b.accessToken);
  const notSubscribed = open(rt.url, a.accessToken);
  await Promise.all([outcome(sa), outcome(sb), outcome(notSubscribed)]);

  assert.deepEqual(await subscribe(sa), { ok: true });
  // Company B tries to name company A's room in every way it can: all ignored.
  await subscribe(sb, { companyId: a.companyId, room: `company:${a.companyId}` });
  await subscribe(sb, `company:${a.companyId}`);
  sb.emit('join', `company:${a.companyId}`);

  const gotA = collect(sa, 'truck:location_updated');
  const gotB = collect(sb, 'truck:location_updated');
  const gotIdle = collect(notSubscribed, 'truck:location_updated');

  const res = await upload(ctx, driverA, 33.25);
  assert.equal(res.body.accepted, 1);
  await wait(300);

  assert.equal(gotA.length, 1);
  assert.equal(gotB.length, 0);
  assert.equal(gotIdle.length, 0);

  const event = gotA[0];
  assert.equal(event.truckId, truckA.id);
  assert.equal(event.latitude, 33.25);
  assert.equal(event.speedMps, 10);
  assert.ok(event.gpsTimestamp && event.receivedAt);
  // No personal or tenant identifiers in the broadcast.
  assert.equal(event.driverId, undefined);
  assert.equal(event.companyId, undefined);

  // The event was persisted before it was sent.
  const stored = await ctx.api().get(`${V1}/trucks/${truckA.id}/location`).set(bearer(a));
  assert.equal(stored.body.location.latitude, 33.25);
});

test('a socket that floods events is disconnected', async () => {
  const s = open(rt.url, a.accessToken);
  await outcome(s);
  const closed = new Promise((resolve) => s.once('disconnect', resolve));
  for (let i = 0; i < 40; i += 1) s.emit('company:subscribe');
  assert.equal(await Promise.race([closed, wait(2000).then(() => 'still open')]), 'io server disconnect');
});

test('suspending a company closes its live connections', async () => {
  const c = await ctx.registerCompany('Charlie Cargo');
  const s = open(rt.url, c.accessToken);
  await outcome(s);
  await subscribe(s);
  const closed = new Promise((resolve) => s.once('disconnect', resolve));

  const res = await ctx
    .api()
    .patch(`${V1}/admin/companies/${c.companyId}/status`)
    .set(bearer(root))
    .send({ status: 'suspended' });
  assert.equal(res.status, 200);
  assert.equal(await Promise.race([closed, wait(2000).then(() => 'still open')]), 'io server disconnect');
  // Same answer as the HTTP API gives a suspended company: forbidden.
  assert.equal(await outcome(open(rt.url, c.accessToken)), 'FORBIDDEN');
});

test('a socket is closed when its access token expires', async () => {
  const short = await createTestContext({ ACCESS_TOKEN_TTL_SECONDS: '2' });
  const shortRt = await short.startRealtime();
  try {
    const admin = await short.registerCompany('Short Lived');
    const s = open(shortRt.url, admin.accessToken);
    assert.equal(await outcome(s), 'connected');
    const expired = collect(s, 'session:expired');
    const closed = new Promise((resolve) => s.once('disconnect', resolve));
    assert.equal(await Promise.race([closed, wait(4000).then(() => 'still open')]), 'io server disconnect');
    assert.equal(expired.length, 1);
    // The expired token cannot open a new connection.
    assert.equal(await outcome(open(shortRt.url, admin.accessToken)), 'UNAUTHORIZED');
  } finally {
    await shortRt.close();
    await short.db.close();
  }
});
