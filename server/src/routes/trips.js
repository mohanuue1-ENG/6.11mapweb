import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, parse, notFound, HttpError } from '../errors.js';
import { requireRole } from '../middleware/auth.js';
import { uuid } from '../validation.js';
import { resolveDriver } from '../services/gps.js';
import { TRIP_SELECT, toTrip, validateFix, recordFix, loadRoute, distanceOf, downsample } from '../services/trips.js';
import { notify } from '../services/notifications.js';
import { audit } from '../services/audit.js';

const miles = (m) => (m / 1609.344).toFixed(1);
const isoDate = z.string().datetime({ offset: true });

const listQuery = z.object({
  status: z.enum(['ACTIVE', 'COMPLETED']).optional(),
  driverId: uuid.optional(),
  truckId: uuid.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// /trips — drivers start and end their own trips; admins read their company's.
export function tripRoutes({ db, config, authenticate, events }) {
  const router = Router();
  router.use(authenticate);

  const emitLocations = (companyId, result) => {
    for (const location of result.latest) events.emit('truck:location_updated', { companyId, location });
  };

  // POST /trips/start
  router.post(
    '/start',
    requireRole('DRIVER'),
    asyncHandler(async (req, res) => {
      const fix = validateFix(config, req.body);
      const { companyId } = req.auth;

      const { row, ingest } = await db.tx(async (q) => {
        const driver = await resolveDriver(q, req.auth);
        // Serialise concurrent starts by the same driver.
        await q.query('SELECT id FROM drivers WHERE id = $1 FOR UPDATE', [driver.id]);

        const assignment = await q.query(
          `SELECT a.truck_id, k.truck_number FROM driver_truck_assignments a
             JOIN trucks k ON k.id = a.truck_id
            WHERE a.company_id = $1 AND a.driver_id = $2 AND a.active`,
          [companyId, driver.id],
        );
        if (!assignment.rows[0]) {
          throw new HttpError(409, 'NO_TRUCK_ASSIGNED', 'You have no truck assigned. Ask your administrator to assign one.');
        }
        const active = await q.query(
          `SELECT id FROM trips WHERE company_id = $1 AND driver_id = $2 AND status = 'ACTIVE'`,
          [companyId, driver.id],
        );
        if (active.rows[0]) {
          // The app can adopt this trip (e.g. after a lost response).
          throw new HttpError(409, 'ACTIVE_TRIP', 'You already have a trip in progress.', { tripId: active.rows[0].id });
        }

        const inserted = await q.query(
          `INSERT INTO trips (company_id, driver_id, truck_id, start_latitude, start_longitude, start_gps_timestamp)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [companyId, driver.id, assignment.rows[0].truck_id, fix.latitude, fix.longitude, new Date(fix.gpsTimestamp)],
        );
        const tripId = inserted.rows[0].id;
        const point = await recordFix(q, config, { companyId, driverId: driver.id, fix });
        await notify(q, {
          companyId,
          type: 'TRIP_STARTED',
          title: 'Trip started',
          message: `${driver.name} started a trip on truck #${assignment.rows[0].truck_number}.`,
        });
        const { rows } = await q.query(`${TRIP_SELECT} WHERE t.company_id = $1 AND t.id = $2`, [companyId, tripId]);
        return { row: rows[0], ingest: point };
      });

      emitLocations(companyId, ingest);
      events.emit('trip:started', {
        companyId,
        trip: { id: row.id, truckId: row.truck_id, startedAt: row.started_at, status: row.status },
      });
      res.status(201).json({ trip: toTrip(row) });
    }),
  );

  // POST /trips/:id/end
  router.post(
    '/:id/end',
    requireRole('DRIVER'),
    asyncHandler(async (req, res) => {
      const id = parse(uuid, req.params.id);
      const fix = validateFix(config, req.body);
      const { companyId } = req.auth;

      const { row, ingest } = await db.tx(async (q) => {
        const driver = await resolveDriver(q, req.auth);
        // Ownership is part of the query: another driver's trip is simply "not found".
        const current = await q.query(
          `SELECT status, start_gps_timestamp FROM trips
            WHERE company_id = $1 AND driver_id = $2 AND id = $3 FOR UPDATE`,
          [companyId, driver.id, id],
        );
        if (!current.rows[0]) throw notFound('Trip not found');
        if (current.rows[0].status !== 'ACTIVE') throw new HttpError(409, 'TRIP_NOT_ACTIVE', 'This trip has already ended.');

        const endTs = new Date(fix.gpsTimestamp);
        if (endTs <= new Date(current.rows[0].start_gps_timestamp)) {
          throw new HttpError(422, 'GPS_FIX_BEFORE_START', 'The GPS position is older than the trip start. Wait for a fresh fix and try again.');
        }

        const point = await recordFix(q, config, { companyId, driverId: driver.id, fix });
        const route = await loadRoute(q, companyId, id);
        // Duration comes from the validated GPS timestamps; distance only when there are enough route points.
        const durationSeconds = Math.round((endTs - new Date(current.rows[0].start_gps_timestamp)) / 1000);
        const distanceMeters = distanceOf(route);

        await q.query(
          `UPDATE trips SET status = 'COMPLETED', end_latitude = $3, end_longitude = $4, end_gps_timestamp = $5,
                  ended_at = now(), duration_seconds = $6, distance_meters = $7
            WHERE company_id = $1 AND id = $2`,
          [companyId, id, fix.latitude, fix.longitude, endTs, durationSeconds, distanceMeters],
        );
        const { rows } = await q.query(`${TRIP_SELECT} WHERE t.company_id = $1 AND t.id = $2`, [companyId, id]);
        const t = rows[0];
        await notify(q, {
          companyId,
          type: 'TRIP_COMPLETED',
          title: 'Trip completed',
          message: `${driver.name} completed a trip on truck #${t.truck_number} (${Math.round(durationSeconds / 60)} min${
            distanceMeters == null ? '' : `, ${miles(distanceMeters)} mi`
          }).`,
        });
        return { row: t, ingest: point };
      });

      emitLocations(companyId, ingest);
      events.emit('trip:completed', {
        companyId,
        trip: {
          id: row.id,
          truckId: row.truck_id,
          endedAt: row.ended_at,
          durationSeconds: row.duration_seconds,
          distanceMeters: row.distance_meters,
          status: row.status,
        },
      });
      res.json({ trip: toTrip(row) });
    }),
  );

  router.get(
    '/',
    requireRole('COMPANY_ADMIN', 'DRIVER'),
    asyncHandler(async (req, res) => {
      const f = parse(listQuery, req.query);
      const params = [req.auth.companyId];
      const where = ['t.company_id = $1'];
      const add = (sql, value) => {
        params.push(value);
        where.push(sql.replace('?', `$${params.length}`));
      };
      // A driver only ever sees their own trips.
      if (req.auth.role === 'DRIVER') add('t.driver_id = ?', (await resolveDriver(db, req.auth)).id);
      if (f.status) add('t.status = ?', f.status);
      if (f.driverId && req.auth.role === 'COMPANY_ADMIN') add('t.driver_id = ?', f.driverId);
      if (f.truckId) add('t.truck_id = ?', f.truckId);
      if (f.from) add('t.started_at >= ?', new Date(f.from));
      if (f.to) add('t.started_at <= ?', new Date(f.to));

      const total = await db.query(`SELECT count(*)::int AS n FROM trips t WHERE ${where.join(' AND ')}`, params);
      params.push(f.limit, f.offset);
      const { rows } = await db.query(
        `${TRIP_SELECT} WHERE ${where.join(' AND ')}
          ORDER BY t.started_at DESC, t.id LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );
      res.json({ trips: rows.map(toTrip), total: total.rows[0].n });
    }),
  );

  router.get(
    '/:id',
    requireRole('COMPANY_ADMIN', 'DRIVER'),
    asyncHandler(async (req, res) => {
      const id = parse(uuid, req.params.id);
      const params = [req.auth.companyId, id];
      let ownerFilter = '';
      if (req.auth.role === 'DRIVER') {
        params.push((await resolveDriver(db, req.auth)).id);
        ownerFilter = 'AND t.driver_id = $3';
      }
      const { rows } = await db.query(`${TRIP_SELECT} WHERE t.company_id = $1 AND t.id = $2 ${ownerFilter}`, params);
      if (!rows[0]) throw notFound('Trip not found');
      const route = await loadRoute(db, req.auth.companyId, id);
      res.json({
        trip: toTrip(rows[0]),
        routePointCount: route.length,
        route: downsample(route).map((p) => ({
          latitude: p.latitude,
          longitude: p.longitude,
          speedMps: p.speedMps,
          gpsTimestamp: p.gpsTimestamp,
        })),
      });
    }),
  );

  // Recomputes a finished trip's distance, e.g. after offline points arrived late.
  router.post(
    '/:id/recalculate-distance',
    requireRole('COMPANY_ADMIN'),
    asyncHandler(async (req, res) => {
      const id = parse(uuid, req.params.id);
      const { companyId, userId } = req.auth;
      const row = await db.tx(async (q) => {
        const found = await q.query(`SELECT status FROM trips WHERE company_id = $1 AND id = $2 FOR UPDATE`, [companyId, id]);
        if (!found.rows[0]) throw notFound('Trip not found');
        if (found.rows[0].status !== 'COMPLETED') throw new HttpError(409, 'TRIP_NOT_COMPLETED', 'Only a completed trip can be recalculated.');
        const distance = distanceOf(await loadRoute(q, companyId, id));
        await q.query('UPDATE trips SET distance_meters = $3 WHERE company_id = $1 AND id = $2', [companyId, id, distance]);
        await audit(q, { companyId, actorUserId: userId, action: 'TRIP_DISTANCE_RECALCULATED', details: { tripId: id }, ip: req.ip });
        const { rows } = await q.query(`${TRIP_SELECT} WHERE t.company_id = $1 AND t.id = $2`, [companyId, id]);
        return rows[0];
      });
      res.json({ trip: toTrip(row) });
    }),
  );

  return router;
}
