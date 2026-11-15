// A small load test of GPS ingestion: many drivers upload batches at the same time.
//
//   node scripts/loadtest.js [drivers=20] [batches=10] [pointsPerBatch=50]
//
// It starts the API in-process on an in-memory database, so the numbers show how
// the code behaves, NOT what production hardware will do. Run the same script
// against your real staging server (set LOADTEST_URL) before release.
import crypto from 'node:crypto';
import http from 'node:http';
import { loadConfig } from '../src/config.js';
import { createDb } from '../src/db/index.js';
import { runMigrations } from '../src/db/migrate.js';
import { createApp } from '../src/app.js';
import { attachRealtime } from '../src/realtime.js';

const [drivers = 20, batches = 10, perBatch = 50] = process.argv.slice(2).map(Number);
let base = process.env.LOADTEST_URL;
let closeAll = async () => {};

if (!base) {
  const config = loadConfig({
    NODE_ENV: 'test',
    JWT_ACCESS_SECRET: crypto.randomBytes(48).toString('base64url'),
    BCRYPT_ROUNDS: '4',
    AUTH_RATE_LIMIT_PER_MINUTE: '100000',
    GPS_RATE_LIMIT_PER_MINUTE: '100000',
    CLIENT_URL: 'http://localhost:3000',
    ALLOW_SELF_REGISTRATION: 'true',
  });
  const db = await createDb(config, { memory: true });
  await runMigrations(db);
  const app = createApp({ db, config });
  const server = http.createServer(app);
  const rt = attachRealtime(server, { db, config, events: app.locals.events });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  closeAll = async () => {
    await rt.close();
    await new Promise((r) => server.close(r));
    await db.close();
  };
}

const call = async (path, body, token) => {
  const res = await fetch(`${base}/api/v1${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Client-Type': 'mobile', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

console.log(`[loadtest] ${base} — ${drivers} drivers x ${batches} batches x ${perBatch} points`);
const admin = await call('/auth/register', { companyName: 'Load Co', adminName: 'Load Admin', email: `load-${Date.now()}@example.test`, password: 'Load-test-pw-1' });
const A = admin.body.accessToken;

const fleet = [];
for (let i = 0; i < drivers; i += 1) {
  const truck = (await call('/trucks', { truckNumber: `L${i}` }, A)).body.truck;
  const email = `d${i}-${crypto.randomBytes(3).toString('hex')}@example.test`;
  const driver = (await call('/drivers', { name: `Driver ${i}`, login: { email, password: 'Load-test-pw-1' } }, A)).body.driver;
  await call('/assignments', { driverId: driver.id, truckId: truck.id }, A);
  fleet.push({ email });
}
const sessions = await Promise.all(fleet.map((f) => call('/auth/login', { email: f.email, password: 'Load-test-pw-1' })));
// The assignment started "now"; points are timestamped just after it so they are attributed correctly.
await new Promise((r) => setTimeout(r, 1200));

const latencies = [];
let ok = 0;
let failed = 0;
let stored = 0;
const t0 = Date.now();
await Promise.all(
  sessions.map(async (s, di) => {
    const token = s.body.accessToken;
    for (let b = 0; b < batches; b += 1) {
      const locations = Array.from({ length: perBatch }, (_, p) => ({
        eventId: crypto.randomUUID(),
        latitude: 32 + di * 0.01 + p * 0.00001,
        longitude: -96 + b * 0.0001,
        gpsTimestamp: new Date().toISOString(),
        accuracyMeters: 6,
        speedMps: 10,
        headingDegrees: 90,
      }));
      const start = performance.now();
      const res = await call('/gps/locations/batch', { batchId: crypto.randomUUID(), locations }, token);
      latencies.push(performance.now() - start);
      if (res.status === 200) {
        ok += 1;
        stored += res.body.accepted;
      } else failed += 1;
    }
  }),
);
const seconds = (Date.now() - t0) / 1000;
latencies.sort((a, b) => a - b);
const pct = (p) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))].toFixed(0);
console.log(`[loadtest] requests ok=${ok} failed=${failed}, points stored=${stored} in ${seconds.toFixed(1)} s`);
console.log(`[loadtest] throughput ${(stored / seconds).toFixed(0)} points/s, latency p50=${pct(0.5)} ms p95=${pct(0.95)} ms max=${pct(1)} ms`);
await closeAll();
process.exit(failed ? 1 : 0);
