import { z } from 'zod';
import { forbidden } from '../errors.js';

const pointSchema = z.object({
  eventId: z.string().uuid(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  gpsTimestamp: z.string().datetime({ offset: true }),
  accuracyMeters: z.number().min(0).max(100000).nullish(),
  speedMps: z.number().min(0).max(150).nullish(),
  headingDegrees: z.number().min(0).max(360).nullish(),
});

// The driver record behind a signed-in DRIVER user. Company and driver id come
// from the session, never from the request.
export async function resolveDriver(q, auth) {
  const { rows } = await q.query(
    `SELECT id, name, phone, driver_number, status FROM drivers WHERE company_id = $1 AND user_id = $2`,
    [auth.companyId, auth.userId],
  );
  const driver = rows[0];
  if (!driver || driver.status !== 'active') throw forbidden('No active driver profile for this account');
  return driver;
}

const inWindow = (ts, start, end) => ts >= start.getTime() && (end == null || ts < end.getTime());

// Validates and stores a batch of GPS points for one driver (PRD 4.1, 4.2).
//
// Every point is judged on its own, so one bad point never blocks the rest of
// an offline queue. Each point is attributed to the truck the driver was
// assigned to at the moment it was recorded, which keeps late uploads correct
// after a reassignment. Re-sent points (same eventId) are ignored.
//
// Returns { accepted, duplicates, rejected: [{ index, eventId, reason }], latest }
// where `latest` holds the newest stored position per truck.
export async function ingestBatch(q, config, { companyId, driverId, locations, now = new Date() }) {
  const rejected = [];
  const valid = [];
  const maxFuture = now.getTime() + config.gpsMaxFutureSeconds * 1000;
  const minPast = now.getTime() - config.gpsMaxPointAgeDays * 24 * 60 * 60 * 1000;

  locations.forEach((raw, index) => {
    const parsed = pointSchema.safeParse(raw);
    const eventId = typeof raw?.eventId === 'string' ? raw.eventId : null;
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      rejected.push({ index, eventId, reason: 'INVALID', field: issue.path.join('.') || undefined });
      return;
    }
    const ts = Date.parse(parsed.data.gpsTimestamp);
    if (ts > maxFuture) return rejected.push({ index, eventId, reason: 'FUTURE_TIMESTAMP' });
    if (ts < minPast) return rejected.push({ index, eventId, reason: 'TOO_OLD' });
    valid.push({ index, ts, ...parsed.data });
  });

  if (!valid.length) return { accepted: 0, duplicates: 0, rejected, latest: [] };

  const minTs = new Date(Math.min(...valid.map((p) => p.ts)));
  const maxTs = new Date(Math.max(...valid.map((p) => p.ts)));

  const assignments = (
    await q.query(
      `SELECT truck_id, start_at, end_at FROM driver_truck_assignments
        WHERE company_id = $1 AND driver_id = $2 AND start_at <= $3 AND (end_at IS NULL OR end_at > $4)`,
      [companyId, driverId, maxTs, minTs],
    )
  ).rows;
  const trips = (
    await q.query(
      `SELECT id, truck_id, start_gps_timestamp, end_gps_timestamp FROM trips
        WHERE company_id = $1 AND driver_id = $2 AND status <> 'CANCELLED'
          AND start_gps_timestamp <= $3 AND (end_gps_timestamp IS NULL OR end_gps_timestamp >= $4)`,
      [companyId, driverId, maxTs, minTs],
    )
  ).rows;

  const rows = [];
  for (const p of valid) {
    const assignment = assignments.find((a) => inWindow(p.ts, a.start_at, a.end_at));
    if (!assignment) {
      rejected.push({ index: p.index, eventId: p.eventId, reason: 'NO_TRUCK_ASSIGNED' });
      continue;
    }
    const trip = trips.find(
      (t) =>
        t.truck_id === assignment.truck_id &&
        p.ts >= t.start_gps_timestamp.getTime() &&
        (t.end_gps_timestamp == null || p.ts <= t.end_gps_timestamp.getTime()),
    );
    rows.push({ ...p, truckId: assignment.truck_id, tripId: trip?.id ?? null });
  }
  rejected.sort((a, b) => a.index - b.index);
  if (!rows.length) return { accepted: 0, duplicates: 0, rejected, latest: [] };

  // One multi-row insert; the unique (driver_id, event_id) key drops re-sent points.
  const COLS = 11;
  const params = [];
  const tuples = rows.map((r, i) => {
    params.push(
      r.eventId,
      companyId,
      driverId,
      r.truckId,
      r.tripId,
      r.latitude,
      r.longitude,
      r.accuracyMeters ?? null,
      r.speedMps ?? null,
      r.headingDegrees ?? null,
      new Date(r.ts),
    );
    const base = i * COLS;
    return `(${Array.from({ length: COLS }, (_, k) => `$${base + k + 1}`).join(', ')})`;
  });
  const inserted = await q.query(
    `INSERT INTO location_history
       (event_id, company_id, driver_id, truck_id, trip_id, latitude, longitude,
        accuracy_meters, speed_mps, heading_degrees, gps_timestamp)
     VALUES ${tuples.join(', ')}
     ON CONFLICT (driver_id, event_id) DO NOTHING
     RETURNING event_id, received_at`,
    params,
  );
  const stored = new Map(inserted.rows.map((r) => [r.event_id, r.received_at]));

  // Move each truck's "current location" forward, never backward: a late
  // upload of old points must not overwrite a newer position.
  const newestByTruck = new Map();
  for (const r of rows) {
    if (!stored.has(r.eventId)) continue;
    const best = newestByTruck.get(r.truckId);
    if (!best || r.ts > best.ts) newestByTruck.set(r.truckId, r);
  }
  const latest = [];
  for (const r of newestByTruck.values()) {
    const receivedAt = stored.get(r.eventId);
    const res = await q.query(
      `INSERT INTO current_locations
         (truck_id, company_id, driver_id, latitude, longitude, accuracy_meters, speed_mps, heading_degrees, gps_timestamp, received_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (truck_id) DO UPDATE SET
         driver_id = EXCLUDED.driver_id, latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude,
         accuracy_meters = EXCLUDED.accuracy_meters, speed_mps = EXCLUDED.speed_mps,
         heading_degrees = EXCLUDED.heading_degrees, gps_timestamp = EXCLUDED.gps_timestamp,
         received_at = EXCLUDED.received_at
       WHERE current_locations.gps_timestamp < EXCLUDED.gps_timestamp
       RETURNING truck_id`,
      [
        r.truckId,
        companyId,
        driverId,
        r.latitude,
        r.longitude,
        r.accuracyMeters ?? null,
        r.speedMps ?? null,
        r.headingDegrees ?? null,
        new Date(r.ts),
        receivedAt,
      ],
    );
    if (res.rows.length) {
      latest.push({
        truckId: r.truckId,
        latitude: r.latitude,
        longitude: r.longitude,
        speedMps: r.speedMps ?? null,
        headingDegrees: r.headingDegrees ?? null,
        accuracyMeters: r.accuracyMeters ?? null,
        gpsTimestamp: new Date(r.ts).toISOString(),
        receivedAt: new Date(receivedAt).toISOString(),
      });
    }
  }

  return { accepted: stored.size, duplicates: rows.length - stored.size, rejected, latest };
}

export function toLocation(r) {
  return {
    truckId: r.truck_id,
    driverId: r.driver_id,
    latitude: r.latitude,
    longitude: r.longitude,
    accuracyMeters: r.accuracy_meters,
    speedMps: r.speed_mps,
    headingDegrees: r.heading_degrees,
    gpsTimestamp: r.gps_timestamp,
    receivedAt: r.received_at,
  };
}
