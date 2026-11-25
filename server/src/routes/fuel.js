import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, parse, notFound, badRequest } from '../errors.js';
import { requireRole } from '../middleware/auth.js';
import { uuid, requiredText, nullableText } from '../validation.js';
import { audit } from '../services/audit.js';

const SELECT = `
  SELECT f.*, d.name AS driver_name, t.truck_number
    FROM fuel_transactions f
    JOIN drivers d ON d.id = f.driver_id
    LEFT JOIN trucks t ON t.id = f.truck_id`;

const toFuel = (r) => ({
  id: r.id,
  fuelDate: typeof r.fuel_date === 'string' ? r.fuel_date.slice(0, 10) : new Date(r.fuel_date).toISOString().slice(0, 10),
  stateAbbr: r.state_abbr,
  location: r.location,
  receiptNumber: r.receipt_number,
  gallons: Number(r.gallons),
  cashOutCents: r.cash_out_cents,
  driverId: r.driver_id,
  driverName: r.driver_name,
  truckId: r.truck_id,
  truckNumber: r.truck_number ?? null,
  createdAt: r.created_at,
});

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const fields = {
  fuelDate: day,
  stateAbbr: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Use the two-letter state'),
  location: requiredText(200),
  receiptNumber: nullableText(60),
  gallons: z.number().min(0).max(100000),
  cashOutCents: z.number().int().min(0).max(1_000_000_000),
  driverId: uuid,
  truckId: z.union([uuid, z.null()]),
};
const createSchema = z.object({ ...fields, receiptNumber: fields.receiptNumber.default(null), truckId: fields.truckId.default(null) }).strict();
const updateSchema = z.object(fields).partial().strict();
const COLUMNS = { fuelDate: 'fuel_date', stateAbbr: 'state_abbr', location: 'location', receiptNumber: 'receipt_number', gallons: 'gallons', cashOutCents: 'cash_out_cents', driverId: 'driver_id', truckId: 'truck_id' };

// /fuel: the dispatcher and the owner write the fuel the trucks bought.
export function fuelRoutes({ db, authenticate }) {
  const router = Router();
  router.use(authenticate, requireRole('COMPANY_ADMIN', 'DISPATCHER'));

  const checkRefs = async (q, companyId, { driverId, truckId }) => {
    if (driverId && !(await q.query('SELECT 1 FROM drivers WHERE id = $1 AND company_id = $2', [driverId, companyId])).rows.length) throw badRequest('Choose one of your drivers');
    if (truckId && !(await q.query('SELECT 1 FROM trucks WHERE id = $1 AND company_id = $2', [truckId, companyId])).rows.length) throw badRequest('Choose one of your trucks');
  };

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const where = ['f.company_id = $1'];
      const params = [req.auth.companyId];
      const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
      const { driverId, truckId, from, to, state } = req.query;
      if (driverId) add('f.driver_id = ?', parse(uuid, String(driverId)));
      if (truckId) add('f.truck_id = ?', parse(uuid, String(truckId)));
      if (from) add('f.fuel_date >= ?', parse(day, String(from)));
      if (to) add('f.fuel_date <= ?', parse(day, String(to)));
      if (state) add('f.state_abbr = ?', String(state).toUpperCase().slice(0, 2));
      const { rows } = await db.query(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY f.fuel_date DESC, f.created_at DESC LIMIT 500`, params);
      const items = rows.map(toFuel);
      res.json({
        fuel: items,
        totals: { gallons: Math.round(items.reduce((s, f) => s + f.gallons, 0) * 100) / 100, cashOutCents: items.reduce((s, f) => s + f.cashOutCents, 0) },
      });
    }),
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const v = parse(createSchema, req.body);
      const row = await db.tx(async (q) => {
        await checkRefs(q, req.auth.companyId, v);
        const { rows } = await q.query(
          `INSERT INTO fuel_transactions (company_id, driver_id, truck_id, fuel_date, state_abbr, location, receipt_number, gallons, cash_out_cents, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
          [req.auth.companyId, v.driverId, v.truckId, v.fuelDate, v.stateAbbr, v.location, v.receiptNumber, v.gallons, v.cashOutCents, req.auth.userId],
        );
        await audit(q, { companyId: req.auth.companyId, actorUserId: req.auth.userId, action: 'FUEL_ADDED', details: { fuelId: rows[0].id }, ip: req.ip });
        return (await q.query(`${SELECT} WHERE f.id = $1`, [rows[0].id])).rows[0];
      });
      res.status(201).json({ fuel: toFuel(row) });
    }),
  );

  router.patch(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = parse(uuid, req.params.id);
      const v = parse(updateSchema, req.body);
      const keys = Object.keys(v);
      if (!keys.length) throw badRequest('No fields to update');
      const row = await db.tx(async (q) => {
        await checkRefs(q, req.auth.companyId, v);
        const sets = keys.map((k, i) => `${COLUMNS[k]} = $${i + 3}`);
        const { rows } = await q.query(`UPDATE fuel_transactions SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 AND company_id = $2 RETURNING id`, [id, req.auth.companyId, ...keys.map((k) => v[k])]);
        if (!rows[0]) throw notFound('Fuel record not found');
        return (await q.query(`${SELECT} WHERE f.id = $1`, [id])).rows[0];
      });
      res.json({ fuel: toFuel(row) });
    }),
  );

  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = parse(uuid, req.params.id);
      const { rowCount } = await db.query('DELETE FROM fuel_transactions WHERE id = $1 AND company_id = $2', [id, req.auth.companyId]);
      if (!rowCount) throw notFound('Fuel record not found');
      res.status(204).end();
    }),
  );

  return router;
}

// /driver/fuel: the driver sees the fuel recorded for them.
export function driverFuelRoutes({ db, authenticate }) {
  const router = Router();
  router.use(authenticate, requireRole('DRIVER'));
  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const d = (await db.query('SELECT id FROM drivers WHERE user_id = $1 AND company_id = $2', [req.auth.userId, req.auth.companyId])).rows[0];
      if (!d) throw notFound('Driver profile not found');
      const { rows } = await db.query(`${SELECT} WHERE f.company_id = $1 AND f.driver_id = $2 ORDER BY f.fuel_date DESC, f.created_at DESC LIMIT 100`, [req.auth.companyId, d.id]);
      res.json({ fuel: rows.map(toFuel) });
    }),
  );
  return router;
}
