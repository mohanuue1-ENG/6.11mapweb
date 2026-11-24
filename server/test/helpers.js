import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { loadConfig } from '../src/config.js';
import { createDb } from '../src/db/index.js';
import { runMigrations } from '../src/db/migrate.js';
import http from 'node:http';
import { createApp } from '../src/app.js';
import { attachRealtime } from '../src/realtime.js';

// Random, and always acceptable to the password rules (upper, lower, number, special character).
export const randomPassword = () => `Aa1!${crypto.randomBytes(12).toString('base64url')}`;

// A fresh in-memory PostgreSQL + app per test file.
export async function createTestContext(overrides = {}, deps = {}) {
  const config = loadConfig({
    NODE_ENV: 'test',
    JWT_ACCESS_SECRET: crypto.randomBytes(48).toString('base64url'),
    BCRYPT_ROUNDS: '4',
    AUTH_RATE_LIMIT_PER_MINUTE: '1000',
    CLIENT_URL: 'http://localhost:5173',
    ALLOW_SELF_REGISTRATION: 'true',
    // Most tests are about fleets, not payment: they run without the paywall. test/account_payment.test.js turns it on.
    REQUIRE_SUBSCRIPTION: 'false',
    ADMIN_NOTIFY_EMAIL: 'owner@example.test',
    ...overrides,
  });
  const db = await createDb(config, { memory: true });
  await runMigrations(db);
  // A mailer that records what would have been sent.
  const mail = [];
  const mailer = { configured: true, send: async (m) => (mail.push(m), { sent: true }) };
  const app = createApp({ db, config, mailer, ...deps });
  const api = () => request(app);

  // Registers a company through the API, as the mobile client so the refresh
  // token comes back in the body.
  async function registerCompany(name) {
    const email = `${crypto.randomBytes(5).toString('hex')}@example.test`;
    const password = randomPassword();
    const res = await api()
      .post('/api/v1/auth/register')
      .set('X-Client-Type', 'mobile')
      .send({ companyName: name, adminName: `${name} Admin`, email, password });
    if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
    return { email, password, ...res.body, companyId: res.body.user.companyId };
  }

  async function createSuperAdmin() {
    const email = `root-${crypto.randomBytes(4).toString('hex')}@example.test`;
    const password = randomPassword();
    await db.query(
      `INSERT INTO users (company_id, role, name, email, password_hash) VALUES (NULL, 'SUPER_ADMIN', 'Root', $1, $2)`,
      [email, await bcrypt.hash(password, 4)],
    );
    const res = await api().post('/api/v1/auth/login').set('X-Client-Type', 'mobile').send({ email, password });
    if (res.status !== 200) throw new Error(`super admin login failed: ${res.status}`);
    return { email, password, ...res.body };
  }

  // Real HTTP server with Socket.IO on a free port, for real-time tests.
  async function startRealtime() {
    const server = http.createServer(app);
    const realtime = attachRealtime(server, { db, config, events: app.locals.events });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    return {
      url,
      close: async () => {
        await realtime.close();
        await new Promise((resolve) => server.close(resolve));
      },
    };
  }

  return { config, db, app, api, mail, registerCompany, createSuperAdmin, startRealtime };
}

export const bearer = (session) => ({ Authorization: `Bearer ${session.accessToken}` });

// A truck, a driver with a mobile login, and (by default) an assignment that started an hour ago.
export async function makeFleet(ctx, admin, label, { assign = true, driverName } = {}) {
  const V1 = '/api/v1';
  const post = (path, body) => ctx.api().post(V1 + path).set(bearer(admin)).send(body);
  const truck = (await post('/trucks', { truckNumber: `${label}-T` })).body.truck;
  const email = `${label.toLowerCase()}-${crypto.randomBytes(3).toString('hex')}@example.test`;
  const password = randomPassword();
  const driver = (await post('/drivers', { name: driverName ?? `${label} Driver`, login: { email, password } })).body.driver;
  if (assign) {
    await post('/assignments', { driverId: driver.id, truckId: truck.id });
    await ctx.db.query(`UPDATE driver_truck_assignments SET start_at = now() - interval '1 hour' WHERE driver_id = $1`, [driver.id]);
  }
  const login = await ctx.api().post(`${V1}/auth/login`).set('X-Client-Type', 'mobile').send({ email, password });
  return { truck, driver, session: login.body };
}
