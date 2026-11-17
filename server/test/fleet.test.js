import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, bearer, randomPassword } from './helpers.js';

let ctx, a, b;
before(async () => {
  ctx = await createTestContext();
  a = await ctx.registerCompany('Alpha Freight');
  b = await ctx.registerCompany('Bravo Haulers');
});
after(async () => {
  await ctx.db.close();
});

const V1 = '/api/v1';
const as = (session) => ({
  get: (path) => ctx.api().get(V1 + path).set(bearer(session)),
  post: (path, body) => ctx.api().post(V1 + path).set(bearer(session)).send(body),
  patch: (path, body) => ctx.api().patch(V1 + path).set(bearer(session)).send(body),
  del: (path) => ctx.api().delete(V1 + path).set(bearer(session)),
});

async function makeTruck(session, truckNumber, extra = {}) {
  const res = await as(session).post('/trucks', { truckNumber, ...extra });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.truck;
}
async function makeDriver(session, name, extra = {}) {
  const res = await as(session).post('/drivers', { name, ...extra });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.driver;
}

test('fleet routes require a company admin', async () => {
  for (const path of ['/trucks', '/drivers', '/assignments']) {
    assert.equal((await ctx.api().get(V1 + path)).status, 401);
  }
  const root = await ctx.createSuperAdmin();
  assert.equal((await as(root).get('/trucks')).status, 403);
});

test('truck create, read, update and validation', async () => {
  const truck = await makeTruck(a, '101', { plateNumber: 'TX-101', make: 'Volvo', model: 'VNL', year: 2022 });
  assert.equal(truck.status, 'active');
  assert.equal(truck.assignedDriver, null);

  const got = await as(a).get(`/trucks/${truck.id}`);
  assert.equal(got.body.truck.make, 'Volvo');

  const upd = await as(a).patch(`/trucks/${truck.id}`, { model: 'VNR', plateNumber: null });
  assert.equal(upd.status, 200);
  assert.equal(upd.body.truck.model, 'VNR');
  assert.equal(upd.body.truck.plateNumber, null);
  assert.equal(upd.body.truck.make, 'Volvo'); // untouched

  assert.equal((await as(a).post('/trucks', {})).status, 400);
  assert.equal((await as(a).post('/trucks', { truckNumber: 'X', year: 1800 })).status, 400);
  assert.equal((await as(a).patch(`/trucks/${truck.id}`, {})).status, 400);
  assert.equal((await as(a).get('/trucks/not-a-uuid')).status, 400);
});

test('truck numbers are unique per company, not across companies', async () => {
  await makeTruck(a, 'DUP-1');
  assert.equal((await as(a).post('/trucks', { truckNumber: 'DUP-1' })).status, 409);
  await makeTruck(b, 'DUP-1');
});

test('one company cannot see or touch another company\'s trucks and drivers', async () => {
  const truck = await makeTruck(a, 'A-ONLY');
  const driver = await makeDriver(a, 'Alpha Driver');

  const listB = await as(b).get('/trucks');
  assert.ok(!listB.body.trucks.some((t) => t.id === truck.id));
  assert.ok(!(await as(b).get('/drivers')).body.drivers.some((d) => d.id === driver.id));

  assert.equal((await as(b).get(`/trucks/${truck.id}`)).status, 404);
  assert.equal((await as(b).patch(`/trucks/${truck.id}`, { make: 'Hijack' })).status, 404);
  assert.equal((await as(b).del(`/trucks/${truck.id}`)).status, 404);
  assert.equal((await as(b).get(`/drivers/${driver.id}`)).status, 404);
  assert.equal((await as(b).patch(`/drivers/${driver.id}`, { name: 'Hijack' })).status, 404);
  assert.equal((await as(b).del(`/drivers/${driver.id}`)).status, 404);

  // A client-supplied company id is rejected, never obeyed.
  assert.equal((await as(b).post('/trucks', { truckNumber: 'Z', companyId: a.companyId })).status, 400);
  assert.equal((await as(b).post('/drivers', { name: 'Z', companyId: a.companyId })).status, 400);

  const still = await as(a).get(`/trucks/${truck.id}`);
  assert.equal(still.body.truck.make, null);
});

test('the subscription truck limit is enforced when adding and activating', async () => {
  const c = await ctx.registerCompany('Limit Co');
  const plan = (
    await ctx.db.query(`INSERT INTO plans (name, price_cents, truck_limit) VALUES ('Test Two', 100, 2) RETURNING id`)
  ).rows[0].id;
  await ctx.db.query(
    `INSERT INTO subscriptions (company_id, plan_id, status, price_cents, truck_limit) VALUES ($1, $2, 'active', 100, 2)`,
    [c.companyId, plan],
  );

  const t1 = await makeTruck(c, '1');
  await makeTruck(c, '2');
  const third = await as(c).post('/trucks', { truckNumber: '3' });
  assert.equal(third.status, 409);
  assert.equal(third.body.error.code, 'TRUCK_LIMIT_REACHED');

  // An inactive truck does not use a slot, but activating it does.
  const parked = await makeTruck(c, '3', { status: 'inactive' });
  const activate = await as(c).patch(`/trucks/${parked.id}`, { status: 'active' });
  assert.equal(activate.body.error?.code, 'TRUCK_LIMIT_REACHED');

  assert.equal((await as(c).patch(`/trucks/${t1.id}`, { status: 'inactive' })).status, 200);
  assert.equal((await as(c).patch(`/trucks/${parked.id}`, { status: 'active' })).status, 200);

  const me = await as(c).get('/companies/me');
  assert.deepEqual(me.body.usage, { activeTrucks: 2, truckLimit: 2, hasSubscription: true });

  // Company A has no subscription yet and is not limited.
  assert.equal((await as(a).get('/companies/me')).body.usage.hasSubscription, false);
});

test('driver create, update and license date', async () => {
  const d = await makeDriver(a, 'Dana Driver', {
    phone: '+1 555 0100',
    driverNumber: 'D-1',
    licenseNumber: 'TX123',
    licenseExpiresOn: '2027-03-31',
  });
  assert.equal(d.hasLogin, false);
  assert.equal(d.licenseExpiresOn, '2027-03-31');

  const upd = await as(a).patch(`/drivers/${d.id}`, { licenseExpiresOn: '2028-01-15', phone: '' });
  assert.equal(upd.body.driver.licenseExpiresOn, '2028-01-15');
  assert.equal(upd.body.driver.phone, null);

  assert.equal((await as(a).post('/drivers', { name: 'Other', driverNumber: 'D-1' })).status, 409);
  assert.equal((await as(a).post('/drivers', { name: 'Bad', licenseExpiresOn: '31/03/2027' })).status, 400);
});

test('a driver login works, is limited to the driver role, and follows the driver status', async () => {
  const email = 'drv.login@example.test';
  const pw = randomPassword();
  const d = await makeDriver(a, 'Login Driver', { login: { email, password: pw } });
  assert.equal(d.hasLogin, true);
  assert.equal(d.loginEmail, email);

  const login = await ctx.api().post(`${V1}/auth/login`).set('X-Client-Type', 'mobile').send({ email, password: pw });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.role, 'DRIVER');
  assert.equal(login.body.user.companyId, a.companyId);
  for (const path of ['/trucks', '/drivers', '/assignments', '/companies/me']) {
    assert.equal((await as(login.body).get(path)).status, 403);
  }

  // The same email cannot be reused, in this or any other company.
  assert.equal((await as(b).post('/drivers', { name: 'Clone', login: { email, password: pw } })).status, 409);
  assert.equal((await as(a).patch(`/drivers/${d.id}`, { login: { email: 'x@example.test', password: pw } })).status, 409);

  // Deactivating the driver closes their sessions and blocks sign-in.
  assert.equal((await as(a).patch(`/drivers/${d.id}`, { status: 'inactive' })).status, 200);
  assert.equal((await as(login.body).get('/auth/me')).status, 403);
  assert.equal((await ctx.api().post(`${V1}/auth/login`).set('X-Client-Type', 'mobile').send({ email, password: pw })).status, 403);
  assert.notEqual(
    (await ctx.api().post(`${V1}/auth/refresh`).send({ refreshToken: login.body.refreshToken })).status,
    200,
  );

  assert.equal((await as(a).patch(`/drivers/${d.id}`, { status: 'active' })).status, 200);
  assert.equal((await ctx.api().post(`${V1}/auth/login`).set('X-Client-Type', 'mobile').send({ email, password: pw })).status, 200);

  // A login can be added later to a driver who has none.
  const plain = await makeDriver(a, 'Late Login');
  const added = await as(a).patch(`/drivers/${plain.id}`, { login: { email: 'late@example.test', password: pw } });
  assert.equal(added.body.driver.hasLogin, true);

  // Deleting a driver removes the login too.
  assert.equal((await as(a).del(`/drivers/${d.id}`)).status, 204);
  assert.equal((await ctx.api().post(`${V1}/auth/login`).set('X-Client-Type', 'mobile').send({ email, password: pw })).status, 401);
});

test('assignments: assign, reassign, list, end', async () => {
  const t1 = await makeTruck(a, 'AS-1');
  const t2 = await makeTruck(a, 'AS-2');
  const d1 = await makeDriver(a, 'Assign One');
  const d2 = await makeDriver(a, 'Assign Two');

  const first = await as(a).post('/assignments', { driverId: d1.id, truckId: t1.id });
  assert.equal(first.status, 201);
  assert.equal(first.body.assignment.active, true);

  // Repeating the same assignment changes nothing.
  const again = await as(a).post('/assignments', { driverId: d1.id, truckId: t1.id });
  assert.equal(again.body.assignment.id, first.body.assignment.id);

  assert.equal((await as(a).get(`/trucks/${t1.id}`)).body.truck.assignedDriver.id, d1.id);
  assert.equal((await as(a).get(`/drivers/${d1.id}`)).body.driver.assignedTruck.truckNumber, 'AS-1');

  // Moving the driver to another truck frees the first truck.
  await as(a).post('/assignments', { driverId: d1.id, truckId: t2.id });
  assert.equal((await as(a).get(`/trucks/${t1.id}`)).body.truck.assignedDriver, null);
  // Giving that truck to another driver unassigns the previous driver.
  await as(a).post('/assignments', { driverId: d2.id, truckId: t2.id });
  assert.equal((await as(a).get(`/drivers/${d1.id}`)).body.driver.assignedTruck, null);

  const active = await as(a).get('/assignments?active=true');
  const mine = active.body.assignments.filter((x) => [d1.id, d2.id].includes(x.driver.id));
  assert.equal(mine.length, 1);
  assert.equal(mine[0].driver.id, d2.id);
  const all = await as(a).get('/assignments');
  assert.equal(all.body.assignments.filter((x) => [d1.id, d2.id].includes(x.driver.id)).length, 3);

  const end = await as(a).del(`/assignments/${mine[0].id}`);
  assert.equal(end.status, 204);
  assert.equal((await as(a).get(`/trucks/${t2.id}`)).body.truck.assignedDriver, null);
  const ended = (await as(a).get('/assignments?active=false')).body.assignments.find((x) => x.id === mine[0].id);
  assert.ok(ended.endAt);
});

test('assignments cannot cross companies or use inactive records', async () => {
  const truckA = await makeTruck(a, 'X-A');
  const driverA = await makeDriver(a, 'Cross A');
  const truckB = await makeTruck(b, 'X-B');
  const driverB = await makeDriver(b, 'Cross B');

  assert.equal((await as(a).post('/assignments', { driverId: driverA.id, truckId: truckB.id })).status, 404);
  assert.equal((await as(a).post('/assignments', { driverId: driverB.id, truckId: truckA.id })).status, 404);
  assert.equal((await as(b).post('/assignments', { driverId: driverA.id, truckId: truckA.id })).status, 404);

  const own = await as(a).post('/assignments', { driverId: driverA.id, truckId: truckA.id });
  assert.equal((await as(b).del(`/assignments/${own.body.assignment.id}`)).status, 404);
  assert.ok(!(await as(b).get('/assignments')).body.assignments.some((x) => x.id === own.body.assignment.id));

  // Deactivating a truck releases its driver; inactive records cannot be assigned.
  await as(a).patch(`/trucks/${truckA.id}`, { status: 'inactive' });
  assert.equal((await as(a).get(`/drivers/${driverA.id}`)).body.driver.assignedTruck, null);
  assert.equal((await as(a).post('/assignments', { driverId: driverA.id, truckId: truckA.id })).status, 409);
});

test('records with trip history cannot be deleted or changed mid-trip', async () => {
  const truck = await makeTruck(a, 'HIST-1');
  const driver = await makeDriver(a, 'History Driver');
  const asg = await as(a).post('/assignments', { driverId: driver.id, truckId: truck.id });
  await ctx.db.query(
    `INSERT INTO trips (company_id, driver_id, truck_id, start_latitude, start_longitude, start_gps_timestamp)
     VALUES ($1, $2, $3, 32.1, -96.1, now())`,
    [a.companyId, driver.id, truck.id],
  );

  // While the trip is active nothing about the pairing may change.
  assert.equal((await as(a).del(`/assignments/${asg.body.assignment.id}`)).status, 409);
  assert.equal((await as(a).patch(`/trucks/${truck.id}`, { status: 'inactive' })).status, 409);
  assert.equal((await as(a).patch(`/drivers/${driver.id}`, { status: 'inactive' })).status, 409);

  await ctx.db.query(`UPDATE trips SET status = 'COMPLETED' WHERE driver_id = $1`, [driver.id]);
  const delTruck = await as(a).del(`/trucks/${truck.id}`);
  assert.equal(delTruck.status, 409);
  assert.equal(delTruck.body.error.code, 'IN_USE');
  assert.equal((await as(a).del(`/drivers/${driver.id}`)).status, 409);
  assert.equal((await as(a).get(`/trucks/${truck.id}`)).status, 200);

  // A truck without history can be deleted.
  const fresh = await makeTruck(a, 'FRESH-1');
  assert.equal((await as(a).del(`/trucks/${fresh.id}`)).status, 204);
  assert.equal((await as(a).get(`/trucks/${fresh.id}`)).status, 404);
});

test('fleet changes are audited', async () => {
  const { rows } = await ctx.db.query('SELECT DISTINCT action FROM audit_logs WHERE company_id = $1', [a.companyId]);
  const actions = rows.map((r) => r.action);
  for (const expected of [
    'TRUCK_CREATED',
    'TRUCK_UPDATED',
    'TRUCK_DELETED',
    'DRIVER_CREATED',
    'DRIVER_UPDATED',
    'DRIVER_DELETED',
    'ASSIGNMENT_CREATED',
    'ASSIGNMENT_ENDED',
  ]) {
    assert.ok(actions.includes(expected), `missing audit action ${expected}`);
  }
});
