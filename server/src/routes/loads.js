import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, parse, notFound, badRequest } from '../errors.js';
import { requireRole } from '../middleware/auth.js';
import { uuid, requiredText, nullableText } from '../validation.js';
import { audit } from '../services/audit.js';

const SELECT = `
  SELECT l.*, d.name AS driver_name, t.truck_number
    FROM loads l
    LEFT JOIN drivers d ON d.id = l.driver_id
    LEFT JOIN trucks t ON t.id = l.truck_id`;

// The staff view has the money; the driver's view never does.
function toLoad(r, { money = true } = {}) {
  const out = {
    id: r.id,
    loadNumber: r.load_number,
    loadDate: typeof r.load_date === 'string' ? r.load_date.slice(0, 10) : new Date(r.load_date).toISOString().slice(0, 10),
    broker: r.broker,
    pickupLocation: r.pickup_location,
    pickupTime: r.pickup_time,
    dropoffLocation: r.dropoff_location,
    dropoffTime: r.dropoff_time,
    driverId: r.driver_id,
    driverName: r.driver_name ?? null,
    truckId: r.truck_id,
    truckNumber: r.truck_number ?? null,
    status: r.status,
    pickedUpAt: r.picked_up_at,
    deliveredAt: r.delivered_at,
    createdAt: r.created_at,
  };
  if (money) {
    out.cashInCents = r.cash_in_cents;
    out.payMethod = r.pay_method;
  }
  return out;
}

const time = z.union([z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm'), z.literal(''), z.null()]).transform((v) => v || null);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const fields = {
  loadNumber: requiredText(60),
  loadDate: day,
  broker: requiredText(200),
  pickupLocation: nullableText(300),
  pickupTime: time,
  dropoffLocation: nullableText(300),
  dropoffTime: time,
  cashInCents: z.number().int().min(0).max(1_000_000_000),
  payMethod: z.enum(['ach', 'wire']),
  driverId: z.union([uuid, z.null()]),
  truckId: z.union([uuid, z.null()]),
  status: z.enum(['assigned', 'picked_up', 'delivered']),
};
const createSchema = z
  .object({ ...fields, cashInCents: fields.cashInCents.default(0), payMethod: fields.payMethod.default('ach'), driverId: fields.driverId.default(null), truckId: fields.truckId.default(null) })
  .omit({ status: true })
  .strict();
const updateSchema = z.object(fields).partial().strict();
const COLUMNS = {
  loadNumber: 'load_number', loadDate: 'load_date', broker: 'broker', pickupLocation: 'pickup_location', pickupTime: 'pickup_time',
  dropoffLocation: 'dropoff_location', dropoffTime: 'dropoff_time', cashInCents: 'cash_in_cents', payMethod: 'pay_method',
  driverId: 'driver_id', truckId: 'truck_id', status: 'status',
};

// /loads: the dispatcher and the owner write the loads and give them to drivers.
export function loadRoutes({ db, authenticate, pusher }) {
  const router = Router();
  router.use(authenticate, requireRole('COMPANY_ADMIN', 'DISPATCHER'));

  const checkRefs = async (q, companyId, { driverId, truckId }) => {
    if (driverId && !(await q.query('SELECT 1 FROM drivers WHERE id = $1 AND company_id = $2', [driverId, companyId])).rows.length) throw badRequest('Choose one of your drivers');
    if (truckId && !(await q.query('SELECT 1 FROM trucks WHERE id = $1 AND company_id = $2', [truckId, companyId])).rows.length) throw badRequest('Choose one of your trucks');
  };

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const where = ['l.company_id = $1'];
      const params = [req.auth.companyId];
      const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
      const { status, driverId, from, to, q } = req.query;
      if (status && ['assigned', 'picked_up', 'delivered'].includes(String(status))) add('l.status = ?', String(status));
      if (driverId) add('l.driver_id = ?', parse(uuid, String(driverId)));
      if (from) add('l.load_date >= ?', parse(day, String(from)));
      if (to) add('l.load_date <= ?', parse(day, String(to)));
      if (q) add(`(l.load_number ILIKE ? OR l.broker ILIKE ?)`.replaceAll('?', '$' + (params.length + 1)), `%${String(q).slice(0, 60)}%`);
      const { rows } = await db.query(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY l.load_date DESC, l.created_at DESC LIMIT 500`, params);
      res.json({ loads: rows.map((r) => toLoad(r)) });
    }),
  );

  // The driver's phone gets a reminder when a load is given to them, with a button to start the trip straight away.
  const remind = async (loadId, driverId) => {
    if (!pusher || !driverId) return;
    const row = (
      await db.query(
        `SELECT l.load_number, l.pickup_location, l.dropoff_location, d.user_id FROM loads l JOIN drivers d ON d.id = l.driver_id WHERE l.id = $1 AND d.id = $2`,
        [loadId, driverId],
      )
    ).rows[0];
    if (!row?.user_id) return;
    const route = [row.pickup_location, row.dropoff_location].filter(Boolean).join(' → ');
    await pusher.send(db, row.user_id, {
      title: `New load #${row.load_number}`,
      body: route ? `${route}. Tap Start trip when you are ready.` : 'Tap Start trip when you are ready.',
      data: { type: 'load', loadId, category: 'load', route },
    });
  };

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const input = parse(createSchema, req.body);
      const row = await db.tx(async (q) => {
        await checkRefs(q, req.auth.companyId, input);
        const { rows } = await q.query(
          `INSERT INTO loads (company_id, load_number, load_date, broker, pickup_location, pickup_time, dropoff_location, dropoff_time,
                              cash_in_cents, pay_method, driver_id, truck_id, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
          [req.auth.companyId, input.loadNumber, input.loadDate, input.broker, input.pickupLocation, input.pickupTime, input.dropoffLocation, input.dropoffTime,
            input.cashInCents, input.payMethod, input.driverId, input.truckId, req.auth.userId],
        );
        await audit(q, { companyId: req.auth.companyId, actorUserId: req.auth.userId, action: 'LOAD_CREATED', details: { loadId: rows[0].id, loadNumber: input.loadNumber }, ip: req.ip });
        return (await q.query(`${SELECT} WHERE l.id = $1`, [rows[0].id])).rows[0];
      });
      res.status(201).json({ load: toLoad(row) });
      if (row.driver_id) remind(row.id, row.driver_id).catch(() => {});
    }),
  );

  router.patch(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = parse(uuid, req.params.id);
      const input = parse(updateSchema, req.body);
      const keys = Object.keys(input);
      if (!keys.length) throw badRequest('No fields to update');
      const before = (await db.query('SELECT driver_id FROM loads WHERE id = $1 AND company_id = $2', [id, req.auth.companyId])).rows[0];
      const row = await db.tx(async (q) => {
        await checkRefs(q, req.auth.companyId, input);
        const sets = keys.map((k, i) => `${COLUMNS[k]} = $${i + 3}`);
        if (input.status === 'picked_up') sets.push('picked_up_at = COALESCE(picked_up_at, now())');
        if (input.status === 'delivered') sets.push('delivered_at = COALESCE(delivered_at, now())');
        const { rows } = await q.query(`UPDATE loads SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 AND company_id = $2 RETURNING id`, [id, req.auth.companyId, ...keys.map((k) => input[k])]);
        if (!rows[0]) throw notFound('Load not found');
        await audit(q, { companyId: req.auth.companyId, actorUserId: req.auth.userId, action: 'LOAD_UPDATED', details: { loadId: id, fields: keys }, ip: req.ip });
        return (await q.query(`${SELECT} WHERE l.id = $1`, [id])).rows[0];
      });
      res.json({ load: toLoad(row) });
      if (row.driver_id && row.driver_id !== before?.driver_id) remind(row.id, row.driver_id).catch(() => {});
    }),
  );

  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = parse(uuid, req.params.id);
      const { rowCount } = await db.query('DELETE FROM loads WHERE id = $1 AND company_id = $2', [id, req.auth.companyId]);
      if (!rowCount) throw notFound('Load not found');
      await audit(db, { companyId: req.auth.companyId, actorUserId: req.auth.userId, action: 'LOAD_DELETED', details: { loadId: id }, ip: req.ip });
      res.status(204).end();
    }),
  );

  return router;
}

// /driver/loads: the driver sees only their own loads (without the money) and moves them forward.
export function driverLoadRoutes({ db, authenticate }) {
  const router = Router();
  router.use(authenticate, requireRole('DRIVER'));

  const myDriver = async (auth) => {
    const { rows } = await db.query('SELECT id FROM drivers WHERE user_id = $1 AND company_id = $2', [auth.userId, auth.companyId]);
    if (!rows[0]) throw notFound('Driver profile not found');
    return rows[0].id;
  };

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const driverId = await myDriver(req.auth);
      const { rows } = await db.query(
        `${SELECT} WHERE l.company_id = $1 AND l.driver_id = $2
            AND (l.status <> 'delivered' OR l.delivered_at > now() - interval '14 days')
          ORDER BY (l.status = 'delivered'), l.load_date DESC, l.created_at DESC LIMIT 100`,
        [req.auth.companyId, driverId],
      );
      res.json({ loads: rows.map((r) => toLoad(r, { money: false })) });
    }),
  );

  // Forward only: assigned -> picked_up -> delivered.
  router.post(
    '/:id/status',
    asyncHandler(async (req, res) => {
      const id = parse(uuid, req.params.id);
      const { status } = parse(z.object({ status: z.enum(['picked_up', 'delivered']) }).strict(), req.body);
      const driverId = await myDriver(req.auth);
      const row = await db.tx(async (q) => {
        const cur = (await q.query('SELECT status FROM loads WHERE id = $1 AND company_id = $2 AND driver_id = $3 FOR UPDATE', [id, req.auth.companyId, driverId])).rows[0];
        if (!cur) throw notFound('Load not found');
        const ok = (cur.status === 'assigned' && status === 'picked_up') || (cur.status === 'picked_up' && status === 'delivered');
        if (!ok) throw badRequest(`This load is already ${cur.status.replace('_', ' ')}.`);
        await q.query(
          `UPDATE loads SET status = $2, picked_up_at = CASE WHEN $2 = 'picked_up' THEN now() ELSE picked_up_at END,
                            delivered_at = CASE WHEN $2 = 'delivered' THEN now() ELSE delivered_at END, updated_at = now() WHERE id = $1`,
          [id, status],
        );
        await audit(q, { companyId: req.auth.companyId, actorUserId: req.auth.userId, action: 'LOAD_STATUS', details: { loadId: id, status }, ip: req.ip });
        return (await q.query(`${SELECT} WHERE l.id = $1`, [id])).rows[0];
      });
      res.json({ load: toLoad(row, { money: false }) });
    }),
  );

  return router;
}
