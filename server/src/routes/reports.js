import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, parse, badRequest } from '../errors.js';
import { requireRole } from '../middleware/auth.js';
import { uuid } from '../validation.js';
import { TRIP_SELECT, toTrip } from '../services/trips.js';
import { toCsv } from '../services/csv.js';

const DAY = 24 * 60 * 60 * 1000;
const date = z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date');
const rangeQuery = z.object({
  from: date.optional(),
  to: date.optional(),
  driverId: uuid.optional(),
  truckId: uuid.optional(),
  format: z.enum(['json', 'csv']).default('json'),
});

// Defaults to the last 30 days; a range is limited to a year so a report stays fast.
function range(q) {
  const to = q.to ? new Date(q.to) : new Date();
  const from = q.from ? new Date(q.from) : new Date(to.getTime() - 30 * DAY);
  if (from >= to) throw badRequest('"from" must be before "to"');
  if (to - from > 366 * DAY) throw badRequest('The range can be at most one year');
  return { from, to };
}

const sum = (rows, key) => rows.reduce((n, r) => n + (r[key] ?? 0), 0);
const miles = (m) => (m == null ? '' : (m / 1609.344).toFixed(2));

// /reports — Company Admin only, always for the admin's own company.
export function reportRoutes({ db, authenticate }) {
  const router = Router();
  router.use(authenticate, requireRole('COMPANY_ADMIN', 'DISPATCHER'));

  router.get(
    '/trips',
    asyncHandler(async (req, res) => {
      const f = parse(rangeQuery, req.query);
      const { from, to } = range(f);
      const params = [req.auth.companyId, from, to];
      const where = ['t.company_id = $1', 't.started_at >= $2', 't.started_at < $3'];
      if (f.driverId) {
        params.push(f.driverId);
        where.push(`t.driver_id = $${params.length}`);
      }
      if (f.truckId) {
        params.push(f.truckId);
        where.push(`t.truck_id = $${params.length}`);
      }
      const { rows } = await db.query(
        `${TRIP_SELECT} WHERE ${where.join(' AND ')} ORDER BY t.started_at DESC LIMIT 10000`,
        params,
      );

      if (f.format === 'csv') {
        const csv = toCsv(
          ['Trip ID', 'Status', 'Driver', 'Truck', 'Started', 'Ended', 'Duration (min)', 'Distance (mi)', 'Start lat', 'Start lng', 'End lat', 'End lng'],
          rows.map((r) => [
            r.id,
            r.status,
            r.driver_name,
            r.truck_number,
            r.started_at,
            r.ended_at,
            r.duration_seconds == null ? '' : (r.duration_seconds / 60).toFixed(1),
            miles(r.distance_meters),
            r.start_latitude,
            r.start_longitude,
            r.end_latitude,
            r.end_longitude,
          ]),
        );
        res.set('Content-Type', 'text/csv; charset=utf-8');
        res.set('Content-Disposition', 'attachment; filename="trips.csv"');
        return res.send(csv);
      }

      const group = (idKey, nameKey, label) => {
        const map = new Map();
        for (const r of rows) {
          const g = map.get(r[idKey]) ?? { id: r[idKey], [label]: r[nameKey], trips: 0, distanceMeters: 0, durationSeconds: 0 };
          g.trips += 1;
          g.distanceMeters += r.distance_meters ?? 0;
          g.durationSeconds += r.duration_seconds ?? 0;
          map.set(r[idKey], g);
        }
        return [...map.values()].sort((a, b) => b.trips - a.trips);
      };

      res.json({
        range: { from, to },
        totals: {
          trips: rows.length,
          completed: rows.filter((r) => r.status === 'COMPLETED').length,
          active: rows.filter((r) => r.status === 'ACTIVE').length,
          distanceMeters: sum(rows, 'distance_meters'),
          durationSeconds: sum(rows, 'duration_seconds'),
        },
        byDriver: group('driver_id', 'driver_name', 'name'),
        byTruck: group('truck_id', 'truck_number', 'truckNumber'),
        trips: rows.slice(0, 1000).map(toTrip),
        truncated: rows.length > 1000,
      });
    }),
  );

  router.get(
    '/fleet-activity',
    asyncHandler(async (req, res) => {
      const f = parse(rangeQuery, req.query);
      const { from, to } = range(f);
      const { rows } = await db.query(
        `SELECT k.id, k.truck_number, k.status,
                (SELECT d.name FROM driver_truck_assignments a JOIN drivers d ON d.id = a.driver_id
                  WHERE a.truck_id = k.id AND a.active) AS driver_name,
                (SELECT count(*)::int FROM trips t WHERE t.truck_id = k.id AND t.started_at >= $2 AND t.started_at < $3) AS trip_count,
                (SELECT COALESCE(sum(t.distance_meters), 0)::float8 FROM trips t WHERE t.truck_id = k.id AND t.started_at >= $2 AND t.started_at < $3) AS distance_meters,
                (SELECT COALESCE(sum(t.duration_seconds), 0)::float8 FROM trips t WHERE t.truck_id = k.id AND t.started_at >= $2 AND t.started_at < $3) AS duration_seconds,
                (SELECT count(*)::int FROM location_history h WHERE h.truck_id = k.id AND h.gps_timestamp >= $2 AND h.gps_timestamp < $3) AS gps_points,
                (SELECT c.gps_timestamp FROM current_locations c WHERE c.truck_id = k.id) AS last_seen_at
           FROM trucks k WHERE k.company_id = $1 ORDER BY k.truck_number`,
        [req.auth.companyId, from, to],
      );
      const trucks = rows.map((r) => ({
        truckId: r.id,
        truckNumber: r.truck_number,
        status: r.status,
        driverName: r.driver_name,
        tripCount: r.trip_count,
        distanceMeters: r.distance_meters,
        durationSeconds: r.duration_seconds,
        gpsPoints: r.gps_points,
        lastSeenAt: r.last_seen_at,
      }));

      if (f.format === 'csv') {
        res.set('Content-Type', 'text/csv; charset=utf-8');
        res.set('Content-Disposition', 'attachment; filename="fleet-activity.csv"');
        return res.send(
          toCsv(
            ['Truck', 'Status', 'Driver', 'Trips', 'Distance (mi)', 'Duration (h)', 'GPS points', 'Last seen'],
            trucks.map((t) => [
              t.truckNumber,
              t.status,
              t.driverName,
              t.tripCount,
              miles(t.distanceMeters),
              (t.durationSeconds / 3600).toFixed(2),
              t.gpsPoints,
              t.lastSeenAt,
            ]),
          ),
        );
      }
      res.json({ range: { from, to }, trucks });
    }),
  );

  return router;
}
