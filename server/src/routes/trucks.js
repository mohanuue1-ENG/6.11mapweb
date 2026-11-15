import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, parse, notFound, conflict } from '../errors.js';
import { requireRole } from '../middleware/auth.js';
import { uuid, requiredText, nullableText, buildUpdate } from '../validation.js';
import { assertTruckCapacity, assertNoActiveTrip, endActiveAssignments } from '../services/fleet.js';
import { audit } from '../services/audit.js';
import { truckLocationHandler } from './gps.js';

const SELECT = `
  SELECT t.id, t.truck_number, t.plate_number, t.make, t.model, t.year, t.vin, t.status,
         t.created_at, t.updated_at,
         a.id AS assignment_id, d.id AS driver_id, d.name AS driver_name
    FROM trucks t
    LEFT JOIN driver_truck_assignments a ON a.truck_id = t.id AND a.active
    LEFT JOIN drivers d ON d.id = a.driver_id`;

function toTruck(r) {
  return {
    id: r.id,
    truckNumber: r.truck_number,
    plateNumber: r.plate_number,
    make: r.make,
    model: r.model,
    year: r.year,
    vin: r.vin,
    status: r.status,
    assignmentId: r.assignment_id,
    assignedDriver: r.driver_id ? { id: r.driver_id, name: r.driver_name } : null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const status = z.enum(['active', 'inactive', 'maintenance']);
const year = z
  .union([z.number().int().min(1950).max(2100), z.null()])
  .optional()
  .transform((v) => v ?? null);

const fields = {
  truckNumber: requiredText(40),
  plateNumber: nullableText(40),
  make: nullableText(80),
  model: nullableText(80),
  year,
  vin: nullableText(40),
  status,
};
const createSchema = z.object({ ...fields, status: status.default('active') }).strict();
const updateSchema = z.object(fields).partial().strict();

const COLUMNS = {
  truckNumber: 'truck_number',
  plateNumber: 'plate_number',
  make: 'make',
  model: 'model',
  year: 'year',
  vin: 'vin',
  status: 'status',
};

// /trucks — a Company Admin's own trucks. Every query is scoped by
// req.auth.companyId, so another company's truck id simply does not exist here.
export function truckRoutes({ db, authenticate }) {
  const router = Router();
  router.use(authenticate, requireRole('COMPANY_ADMIN'));

  const findOne = async (q, companyId, id) => {
    const { rows } = await q.query(`${SELECT} WHERE t.company_id = $1 AND t.id = $2`, [companyId, id]);
    if (!rows[0]) throw notFound('Truck not found');
    return rows[0];
  };

  const assertNumberFree = async (q, companyId, truckNumber, exceptId = null) => {
    const { rows } = await q.query(
      `SELECT 1 FROM trucks WHERE company_id = $1 AND truck_number = $2 AND ($3::uuid IS NULL OR id <> $3::uuid)`,
      [companyId, truckNumber, exceptId],
    );
    if (rows.length) throw conflict(`Truck number ${truckNumber} is already in use`);
  };

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const { rows } = await db.query(`${SELECT} WHERE t.company_id = $1 ORDER BY t.truck_number`, [
        req.auth.companyId,
      ]);
      res.json({ trucks: rows.map(toTruck) });
    }),
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const input = parse(createSchema, req.body);
      const { companyId, userId } = req.auth;

      const row = await db.tx(async (q) => {
        if (input.status !== 'inactive') await assertTruckCapacity(q, companyId);
        await assertNumberFree(q, companyId, input.truckNumber);
        const inserted = await q.query(
          `INSERT INTO trucks (company_id, truck_number, plate_number, make, model, year, vin, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [companyId, input.truckNumber, input.plateNumber, input.make, input.model, input.year, input.vin, input.status],
        );
        const id = inserted.rows[0].id;
        await audit(q, {
          companyId,
          actorUserId: userId,
          action: 'TRUCK_CREATED',
          details: { truckId: id, truckNumber: input.truckNumber },
          ip: req.ip,
        });
        return findOne(q, companyId, id);
      });
      res.status(201).json({ truck: toTruck(row) });
    }),
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = parse(uuid, req.params.id);
      res.json({ truck: toTruck(await findOne(db, req.auth.companyId, id)) });
    }),
  );

  // GET /trucks/:id/location — latest known position, or null before the first GPS fix.
  router.get('/:id/location', truckLocationHandler({ db }));

  router.patch(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = parse(uuid, req.params.id);
      const input = parse(updateSchema, req.body);
      const { companyId, userId } = req.auth;
      const update = buildUpdate(COLUMNS, input, req.body, 3);

      const row = await db.tx(async (q) => {
        const current = await findOne(q, companyId, id);

        if (input.truckNumber && input.truckNumber !== current.truck_number) {
          await assertNumberFree(q, companyId, input.truckNumber, id);
        }
        if (input.status && input.status !== current.status) {
          if (current.status === 'inactive') await assertTruckCapacity(q, companyId, id);
          if (input.status === 'inactive') {
            await assertNoActiveTrip(q, companyId, { truckId: id });
            await endActiveAssignments(q, companyId, { truckId: id });
          }
        }

        await q.query(
          `UPDATE trucks SET ${update.sets.join(', ')}, updated_at = now() WHERE company_id = $1 AND id = $2`,
          [companyId, id, ...update.values],
        );
        await audit(q, {
          companyId,
          actorUserId: userId,
          action: 'TRUCK_UPDATED',
          details: { truckId: id, fields: update.fields },
          ip: req.ip,
        });
        return findOne(q, companyId, id);
      });
      res.json({ truck: toTruck(row) });
    }),
  );

  // Removes a truck that has no trip or GPS history. Trucks with history are
  // refused by the database (409); deactivate those instead.
  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = parse(uuid, req.params.id);
      const { companyId, userId } = req.auth;
      await db.tx(async (q) => {
        const current = await findOne(q, companyId, id);
        await q.query('DELETE FROM trucks WHERE company_id = $1 AND id = $2', [companyId, id]);
        await audit(q, {
          companyId,
          actorUserId: userId,
          action: 'TRUCK_DELETED',
          details: { truckId: id, truckNumber: current.truck_number },
          ip: req.ip,
        });
      });
      res.status(204).end();
    }),
  );

  return router;
}
