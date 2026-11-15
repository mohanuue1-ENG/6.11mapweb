import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, parse, notFound, conflict } from '../errors.js';
import { requireRole } from '../middleware/auth.js';
import { uuid } from '../validation.js';
import { assertNoActiveTrip, endActiveAssignments } from '../services/fleet.js';
import { audit } from '../services/audit.js';

const SELECT = `
  SELECT a.id, a.start_at, a.end_at, a.active,
         d.id AS driver_id, d.name AS driver_name,
         t.id AS truck_id, t.truck_number
    FROM driver_truck_assignments a
    JOIN drivers d ON d.id = a.driver_id
    JOIN trucks t ON t.id = a.truck_id`;

function toAssignment(r) {
  return {
    id: r.id,
    driver: { id: r.driver_id, name: r.driver_name },
    truck: { id: r.truck_id, truckNumber: r.truck_number },
    startAt: r.start_at,
    endAt: r.end_at,
    active: r.active,
  };
}

const createSchema = z.object({ driverId: uuid, truckId: uuid }).strict();
const listSchema = z.object({ active: z.enum(['true', 'false']).optional() });

// /assignments — which driver drives which truck. Only a Company Admin can
// change this (drivers cannot reassign themselves), and only inside their company.
export function assignmentRoutes({ db, authenticate }) {
  const router = Router();
  router.use(authenticate, requireRole('COMPANY_ADMIN'));

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const { active } = parse(listSchema, req.query);
      const filter = active === undefined ? '' : `AND a.active = ${active === 'true'}`;
      const { rows } = await db.query(
        `${SELECT} WHERE a.company_id = $1 ${filter} ORDER BY a.active DESC, a.start_at DESC LIMIT 500`,
        [req.auth.companyId],
      );
      res.json({ assignments: rows.map(toAssignment) });
    }),
  );

  // Assigns a driver to a truck. Whatever either of them was assigned to
  // before is closed and kept as history.
  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const { driverId, truckId } = parse(createSchema, req.body);
      const { companyId, userId } = req.auth;

      const row = await db.tx(async (q) => {
        // Both lookups are company-scoped: another company's ids are "not found".
        const driver = await q.query('SELECT status FROM drivers WHERE company_id = $1 AND id = $2 FOR UPDATE', [
          companyId,
          driverId,
        ]);
        if (!driver.rows[0]) throw notFound('Driver not found');
        const truck = await q.query('SELECT status FROM trucks WHERE company_id = $1 AND id = $2 FOR UPDATE', [
          companyId,
          truckId,
        ]);
        if (!truck.rows[0]) throw notFound('Truck not found');
        if (driver.rows[0].status !== 'active') throw conflict('This driver is inactive');
        if (truck.rows[0].status === 'inactive') throw conflict('This truck is inactive');

        const same = await q.query(
          `SELECT id FROM driver_truck_assignments
            WHERE company_id = $1 AND active AND driver_id = $2 AND truck_id = $3`,
          [companyId, driverId, truckId],
        );
        let id = same.rows[0]?.id;
        if (!id) {
          await assertNoActiveTrip(q, companyId, { driverId, truckId });
          await endActiveAssignments(q, companyId, { driverId, truckId });
          const inserted = await q.query(
            `INSERT INTO driver_truck_assignments (company_id, driver_id, truck_id) VALUES ($1, $2, $3) RETURNING id`,
            [companyId, driverId, truckId],
          );
          id = inserted.rows[0].id;
          await audit(q, {
            companyId,
            actorUserId: userId,
            action: 'ASSIGNMENT_CREATED',
            details: { assignmentId: id, driverId, truckId },
            ip: req.ip,
          });
        }
        const { rows } = await q.query(`${SELECT} WHERE a.company_id = $1 AND a.id = $2`, [companyId, id]);
        return rows[0];
      });
      res.status(201).json({ assignment: toAssignment(row) });
    }),
  );

  // Ends an assignment. The row stays as history with its end time.
  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = parse(uuid, req.params.id);
      const { companyId, userId } = req.auth;
      await db.tx(async (q) => {
        const { rows } = await q.query(
          `SELECT driver_id, truck_id, active FROM driver_truck_assignments WHERE company_id = $1 AND id = $2 FOR UPDATE`,
          [companyId, id],
        );
        if (!rows[0]) throw notFound('Assignment not found');
        if (!rows[0].active) return;
        await assertNoActiveTrip(q, companyId, { driverId: rows[0].driver_id });
        await q.query(
          `UPDATE driver_truck_assignments SET active = false, end_at = now() WHERE company_id = $1 AND id = $2`,
          [companyId, id],
        );
        await audit(q, {
          companyId,
          actorUserId: userId,
          action: 'ASSIGNMENT_ENDED',
          details: { assignmentId: id, driverId: rows[0].driver_id, truckId: rows[0].truck_id },
          ip: req.ip,
        });
      });
      res.status(204).end();
    }),
  );

  return router;
}
