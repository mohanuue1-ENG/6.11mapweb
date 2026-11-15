import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, parse, badRequest, notFound } from '../errors.js';
import { requireRole } from '../middleware/auth.js';
import { uuid } from '../validation.js';
import { resolveDriver, ingestBatch, toLocation } from '../services/gps.js';
import { findLastStop } from '../services/stops.js';

const isoDate = z.string().datetime({ offset: true });
const historyQuery = z.object({
  truckId: uuid.optional(),
  driverId: uuid.optional(),
  tripId: uuid.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  limit: z.coerce.number().int().min(1).max(5000).default(500),
});

// /gps — location ingestion (drivers) and location reads (company admins).
export function gpsRoutes({ db, config, authenticate, events, geocoder }) {
  const router = Router();
  router.use(authenticate);

  // POST /gps/locations/batch — the mobile app uploads queued GPS points.
  // The response tells the app exactly which points are settled, so it can
  // drop them from its offline queue: accepted and duplicate points are done,
  // rejected points will never be accepted and must not be retried.
  router.post(
    '/locations/batch',
    requireRole('DRIVER'),
    asyncHandler(async (req, res) => {
      const body = req.body ?? {};
      const batchId = parse(uuid, body.batchId);
      if (!Array.isArray(body.locations) || body.locations.length === 0) {
        throw badRequest('locations must be a non-empty array');
      }
      if (body.locations.length > config.gpsMaxBatchSize) {
        throw badRequest(`A batch can hold at most ${config.gpsMaxBatchSize} locations`);
      }

      const result = await db.tx(async (q) => {
        const driver = await resolveDriver(q, req.auth);
        return ingestBatch(q, config, {
          companyId: req.auth.companyId,
          driverId: driver.id,
          locations: body.locations,
        });
      });

      // Persisted first, announced second (PRD section 7).
      for (const location of result.latest) {
        events.emit('truck:location_updated', { companyId: req.auth.companyId, location });
      }

      res.json({
        batchId,
        accepted: result.accepted,
        duplicates: result.duplicates,
        rejected: result.rejected,
      });
    }),
  );

  // GET /gps/locations/current — latest known position of every truck in the company.
  router.get(
    '/locations/current',
    requireRole('COMPANY_ADMIN'),
    asyncHandler(async (req, res) => {
      const { rows } = await db.query(
        `SELECT c.* FROM current_locations c WHERE c.company_id = $1 ORDER BY c.gps_timestamp DESC`,
        [req.auth.companyId],
      );
      res.json({ locations: rows.map(toLocation) });
    }),
  );

  // GET /gps/geocode?lat&lng — the place name for a position ("I-35, Waco, Texas").
  // place is null when the lookup is switched off or fails; the dashboard then shows coordinates.
  router.get(
    '/geocode',
    requireRole('COMPANY_ADMIN'),
    asyncHandler(async (req, res) => {
      const q = parse(z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) }), req.query);
      res.json({ place: (await geocoder?.reverse(q.lat, q.lng)) ?? null });
    }),
  );

  // GET /gps/trucks/:truckId/activity — where the truck last stood still, from the last 24 hours of points.
  router.get(
    '/trucks/:truckId/activity',
    requireRole('COMPANY_ADMIN'),
    asyncHandler(async (req, res) => {
      const truckId = parse(uuid, req.params.truckId);
      const truck = await db.query('SELECT 1 FROM trucks WHERE company_id = $1 AND id = $2', [req.auth.companyId, truckId]);
      if (!truck.rows.length) throw notFound('Truck not found');
      const { rows } = await db.query(
        `SELECT latitude, longitude, accuracy_meters, gps_timestamp
           FROM location_history
          WHERE company_id = $1 AND truck_id = $2 AND gps_timestamp >= now() - interval '24 hours'
          ORDER BY gps_timestamp DESC
          LIMIT 3000`,
        [req.auth.companyId, truckId],
      );
      const points = rows
        .reverse()
        .map((r) => ({ latitude: r.latitude, longitude: r.longitude, accuracyMeters: r.accuracy_meters, timeMs: new Date(r.gps_timestamp).getTime() }));
      const stop = findLastStop(points);
      res.json({
        lastStop: stop && {
          latitude: stop.latitude,
          longitude: stop.longitude,
          startedAt: new Date(stop.startedAtMs).toISOString(),
          endedAt: new Date(stop.endedAtMs).toISOString(),
          durationSeconds: stop.durationSeconds,
          ongoing: stop.ongoing,
        },
      });
    }),
  );

  // GET /gps/history — stored points, newest first, filtered by truck, driver, trip and time.
  router.get(
    '/history',
    requireRole('COMPANY_ADMIN'),
    asyncHandler(async (req, res) => {
      const f = parse(historyQuery, req.query);
      const where = ['h.company_id = $1'];
      const params = [req.auth.companyId];
      const add = (sql, value) => {
        params.push(value);
        where.push(sql.replace('?', `$${params.length}`));
      };
      if (f.truckId) add('h.truck_id = ?', f.truckId);
      if (f.driverId) add('h.driver_id = ?', f.driverId);
      if (f.tripId) add('h.trip_id = ?', f.tripId);
      if (f.from) add('h.gps_timestamp >= ?', new Date(f.from));
      if (f.to) add('h.gps_timestamp <= ?', new Date(f.to));
      params.push(f.limit + 1);

      const { rows } = await db.query(
        `SELECT h.id, h.truck_id, h.driver_id, h.trip_id, h.latitude, h.longitude, h.accuracy_meters,
                h.speed_mps, h.heading_degrees, h.gps_timestamp, h.received_at
           FROM location_history h
          WHERE ${where.join(' AND ')}
          ORDER BY h.gps_timestamp DESC, h.id
          LIMIT $${params.length}`,
        params,
      );
      const hasMore = rows.length > f.limit;
      res.json({
        points: rows.slice(0, f.limit).map((r) => ({ id: r.id, tripId: r.trip_id, ...toLocation(r) })),
        hasMore,
      });
    }),
  );

  return router;
}

// /driver — what a signed-in driver may see: their own profile and assigned truck only.
export function driverSelfRoutes({ db, authenticate }) {
  const router = Router();
  router.use(authenticate, requireRole('DRIVER'));

  router.get(
    '/me',
    asyncHandler(async (req, res) => {
      const driver = await resolveDriver(db, req.auth);
      const truck = await db.query(
        `SELECT t.id, t.truck_number, t.plate_number, t.make, t.model, t.year
           FROM driver_truck_assignments a JOIN trucks t ON t.id = a.truck_id
          WHERE a.company_id = $1 AND a.driver_id = $2 AND a.active`,
        [req.auth.companyId, driver.id],
      );
      const trip = await db.query(
        `SELECT id, started_at FROM trips WHERE company_id = $1 AND driver_id = $2 AND status = 'ACTIVE'`,
        [req.auth.companyId, driver.id],
      );
      const t = truck.rows[0];
      res.json({
        driver: { id: driver.id, name: driver.name, phone: driver.phone, driverNumber: driver.driver_number },
        company: { id: req.auth.companyId, name: req.auth.user.company_name },
        truck: t
          ? { id: t.id, truckNumber: t.truck_number, plateNumber: t.plate_number, make: t.make, model: t.model, year: t.year }
          : null,
        activeTrip: trip.rows[0] ? { id: trip.rows[0].id, startedAt: trip.rows[0].started_at } : null,
      });
    }),
  );

  return router;
}

// GET /trucks/:id/location is registered here so it shares the location mapping.
export function truckLocationHandler({ db }) {
  return asyncHandler(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const truck = await db.query('SELECT 1 FROM trucks WHERE company_id = $1 AND id = $2', [req.auth.companyId, id]);
    if (!truck.rows.length) throw notFound('Truck not found');
    const { rows } = await db.query('SELECT * FROM current_locations WHERE company_id = $1 AND truck_id = $2', [
      req.auth.companyId,
      id,
    ]);
    res.json({ location: rows[0] ? toLocation(rows[0]) : null });
  });
}
