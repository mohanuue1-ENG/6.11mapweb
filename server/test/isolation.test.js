import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, bearer } from './helpers.js';
import { seed } from '../src/db/seed.js';

let ctx, a, b, root;
before(async () => {
  ctx = await createTestContext();
  a = await ctx.registerCompany('Alpha Freight');
  b = await ctx.registerCompany('Bravo Haulers');
  root = await ctx.createSuperAdmin();
});
after(async () => {
  await ctx.db.close();
});

const V1 = '/api/v1';

test('a company admin reads only their own company', async () => {
  const resA = await ctx.api().get(`${V1}/companies/me`).set(bearer(a));
  const resB = await ctx.api().get(`${V1}/companies/me`).set(bearer(b));
  assert.equal(resA.body.company.id, a.companyId);
  assert.equal(resA.body.company.name, 'Alpha Freight');
  assert.equal(resB.body.company.id, b.companyId);
  assert.notEqual(a.companyId, b.companyId);
});

test('a client-supplied company id cannot redirect an update', async () => {
  for (const extra of [{ id: b.companyId }, { companyId: b.companyId }, { company_id: b.companyId }]) {
    const res = await ctx
      .api()
      .patch(`${V1}/companies/me`)
      .set(bearer(a))
      .send({ name: 'Hijacked', ...extra });
    assert.equal(res.status, 400);
  }
  // Same for the query string.
  const viaQuery = await ctx
    .api()
    .patch(`${V1}/companies/me?companyId=${b.companyId}`)
    .set(bearer(a))
    .send({ name: 'Alpha Freight Inc' });
  assert.equal(viaQuery.status, 200);
  assert.equal(viaQuery.body.company.id, a.companyId);

  const { rows } = await ctx.db.query('SELECT id, name FROM companies WHERE id = ANY($1::uuid[])', [
    [a.companyId, b.companyId],
  ]);
  const byId = Object.fromEntries(rows.map((r) => [r.id, r.name]));
  assert.equal(byId[a.companyId], 'Alpha Freight Inc');
  assert.equal(byId[b.companyId], 'Bravo Haulers');
});

test('a company admin cannot change status or internal flags', async () => {
  for (const body of [{ status: 'suspended' }, { isInternal: true }]) {
    const res = await ctx.api().patch(`${V1}/companies/me`).set(bearer(a)).send(body);
    assert.equal(res.status, 400);
  }
});

test('roles are enforced on the server', async () => {
  assert.equal((await ctx.api().get(`${V1}/admin/companies`).set(bearer(a))).status, 403);
  assert.equal((await ctx.api().get(`${V1}/admin/companies`)).status, 401);
  assert.equal(
    (await ctx.api().patch(`${V1}/admin/companies/${b.companyId}/status`).set(bearer(a)).send({ status: 'suspended' }))
      .status,
    403,
  );

  const list = await ctx.api().get(`${V1}/admin/companies`).set(bearer(root));
  assert.equal(list.status, 200);
  const ids = list.body.companies.map((c) => c.id);
  assert.ok(ids.includes(a.companyId) && ids.includes(b.companyId));

  // The super admin has no company, so the company-scoped route is closed to them.
  assert.equal((await ctx.api().get(`${V1}/companies/me`).set(bearer(root))).status, 403);
});

test('a driver account cannot use company admin routes', async () => {
  const { rows } = await ctx.db.query('SELECT password_hash FROM users WHERE id = $1', [a.user.id]);
  await ctx.db.query(
    `INSERT INTO users (company_id, role, name, email, password_hash) VALUES ($1, 'DRIVER', 'Dee Driver', 'dee@example.test', $2)`,
    [a.companyId, rows[0].password_hash],
  );
  const login = await ctx.api().post(`${V1}/auth/login`).set('X-Client-Type', 'mobile').send({ email: 'dee@example.test', password: a.password });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.role, 'DRIVER');
  assert.equal((await ctx.api().get(`${V1}/companies/me`).set(bearer(login.body))).status, 403);
  assert.equal((await ctx.api().get(`${V1}/admin/companies`).set(bearer(login.body))).status, 403);
});

test('the database itself refuses cross-company links', async () => {
  const truckB = (
    await ctx.db.query(`INSERT INTO trucks (company_id, truck_number) VALUES ($1, 'B-1') RETURNING id`, [b.companyId])
  ).rows[0].id;
  const driverA = (
    await ctx.db.query(`INSERT INTO drivers (company_id, name) VALUES ($1, 'A Driver') RETURNING id`, [a.companyId])
  ).rows[0].id;

  // Company A's driver assigned to company B's truck.
  await assert.rejects(
    ctx.db.query(`INSERT INTO driver_truck_assignments (company_id, driver_id, truck_id) VALUES ($1, $2, $3)`, [
      a.companyId,
      driverA,
      truckB,
    ]),
  );
  await assert.rejects(
    ctx.db.query(
      `INSERT INTO trips (company_id, driver_id, truck_id, start_latitude, start_longitude, start_gps_timestamp)
       VALUES ($1, $2, $3, 32.1, -96.1, now())`,
      [a.companyId, driverA, truckB],
    ),
  );
});

test('the database allows only one active trip per driver and validates coordinates', async () => {
  const truck = (
    await ctx.db.query(`INSERT INTO trucks (company_id, truck_number) VALUES ($1, 'A-1') RETURNING id`, [a.companyId])
  ).rows[0].id;
  const driver = (
    await ctx.db.query(`INSERT INTO drivers (company_id, name) VALUES ($1, 'Solo Driver') RETURNING id`, [a.companyId])
  ).rows[0].id;
  const insertTrip = (lat = 32.1) =>
    ctx.db.query(
      `INSERT INTO trips (company_id, driver_id, truck_id, start_latitude, start_longitude, start_gps_timestamp)
       VALUES ($1, $2, $3, $4, -96.1, now())`,
      [a.companyId, driver, truck, lat],
    );

  await insertTrip();
  await assert.rejects(insertTrip());
  await ctx.db.query(`UPDATE trips SET status = 'COMPLETED' WHERE driver_id = $1`, [driver]);
  await assert.rejects(insertTrip(123)); // latitude out of range
  await insertTrip();
});

test('seed creates the internal plan only, and is repeatable; no company is created', async () => {
  const before = (await ctx.db.query(`SELECT count(*)::int AS n FROM companies`)).rows[0].n;
  await seed(ctx.db, ctx.config, {});
  await seed(ctx.db, ctx.config, {});
  assert.equal((await ctx.db.query(`SELECT count(*)::int AS n FROM plans WHERE name = 'NEB Internal Fleet'`)).rows[0].n, 1);
  assert.equal((await ctx.db.query(`SELECT count(*)::int AS n FROM companies`)).rows[0].n, before);
  assert.equal((await ctx.db.query(`SELECT count(*)::int AS n FROM companies WHERE name = 'NEB Trucking'`)).rows[0].n, 0);
});

// Keep this last: it suspends company B.
test('suspending a company blocks its tokens, logins and refreshes at once', async () => {
  assert.equal((await ctx.api().get(`${V1}/companies/me`).set(bearer(b))).status, 200);

  const res = await ctx
    .api()
    .patch(`${V1}/admin/companies/${b.companyId}/status`)
    .set(bearer(root))
    .send({ status: 'suspended' });
  assert.equal(res.status, 200);

  // The still-unexpired access token stops working immediately.
  assert.equal((await ctx.api().get(`${V1}/companies/me`).set(bearer(b))).status, 403);
  assert.equal((await ctx.api().post(`${V1}/auth/login`).send({ email: b.email, password: b.password })).status, 403);
  assert.notEqual((await ctx.api().post(`${V1}/auth/refresh`).send({ refreshToken: b.refreshToken })).status, 200);

  // Company A is unaffected.
  assert.equal((await ctx.api().get(`${V1}/companies/me`).set(bearer(a))).status, 200);
});
