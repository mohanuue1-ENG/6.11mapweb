import crypto from 'node:crypto';
import { z } from 'zod';
import { HttpError, parse } from '../errors.js';
import { ingestBatch } from './gps.js';
import { routeDistance } from './geo.js';
import { findLastStop } from './stops.js';
import { notify } from './notifications.js';

export const TRIP_SELECT = `
  SELECT t.id, t.status, t.driver_id, d.name AS driver_name, t.truck_id, k.truck_number,
         t.start_latitude, t.start_longitude, t.start_gps_timestamp, t.started_at,
         t.end_latitude, t.end_longitude, t.end_gps_timestamp, t.ended_at,
         t.duration_seconds, t.distance_meters, t.load_id, l.load_number
    FROM trips t
    JOIN drivers d ON d.id = t.driver_id
    JOIN trucks k ON k.id = t.truck_id
    LEFT JOIN loads l ON l.id = t.load_id`;

export function toTrip(r) {
  return {
    id: r.id,
    status: r.status,
    driver: { id: r.driver_id, name: r.driver_name },
    truck: { id: r.truck_id, truckNumber: r.truck_number },
    start: { latitude: r.start_latitude, longitude: r.start_longitude, gpsTimestamp: r.start_gps_timestamp },
    end:
      r.end_gps_timestamp == null
        ? null
        : { latitude: r.end_latitude, longitude: r.end_longitude, gpsTimestamp: r.end_gps_timestamp },
    startedAt: r.started_at,
    endedAt: r.ended_at,
    durationSeconds: r.duration_seconds,
    distanceMeters: r.distance_meters,
    loadId: r.load_id ?? null,
    loadNumber: r.load_number ?? null,
  };
}

const fixSchema = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    gpsTimestamp: z.string().datetime({ offset: true }),
    accuracyMeters: z.number().min(0).max(100000),
  })
  .strict();

// A trip start/end must carry a real, fresh, reasonably accurate GPS fix (PRD 4.3,
// 4.4). The server never invents a location; a weak fix is refused with a clear
// error so the app can ask the device again and the driver can retry.
export function validateFix(config, body, now = Date.now()) {
  const fix = parse(fixSchema, body);
  const ts = Date.parse(fix.gpsTimestamp);
  if (ts > now + config.gpsMaxFutureSeconds * 1000) {
    throw new HttpError(422, 'GPS_FIX_INVALID_TIME', "The phone's clock looks wrong. Check the date and time settings and try again.");
  }
  if (now - ts > config.tripFixMaxAgeSeconds * 1000) {
    throw new HttpError(422, 'GPS_FIX_STALE', 'The GPS position is too old. Wait for a fresh GPS fix and try again.');
  }
  if (fix.accuracyMeters > config.tripFixMaxAccuracyMeters) {
    throw new HttpError(422, 'GPS_FIX_INACCURATE', 'The GPS signal is too weak. Move to open sky and try again.');
  }
  return fix;
}

// Stores a trip start/end position as an ordinary location point (so the route
// and the live map include it) and returns the ingestion result.
export function recordFix(q, config, { companyId, driverId, fix }) {
  return ingestBatch(q, config, {
    companyId,
    driverId,
    locations: [{ eventId: crypto.randomUUID(), ...fix }],
  });
}

export async function loadRoute(q, companyId, tripId) {
  const { rows } = await q.query(
    `SELECT latitude, longitude, accuracy_meters, speed_mps, gps_timestamp
       FROM location_history WHERE company_id = $1 AND trip_id = $2 ORDER BY gps_timestamp, id`,
    [companyId, tripId],
  );
  return rows.map((r) => ({
    latitude: r.latitude,
    longitude: r.longitude,
    accuracyMeters: r.accuracy_meters,
    speedMps: r.speed_mps,
    gpsTimestamp: r.gps_timestamp,
    timeMs: new Date(r.gps_timestamp).getTime(),
  }));
}

export const distanceOf = (route) => routeDistance(route);

// Keeps the first and last point and thins the rest so a map never receives more than `max`.
export function downsample(route, max = 1500) {
  if (route.length <= max) return route;
  const step = Math.ceil(route.length / max);
  const out = route.filter((_, i) => i % step === 0);
  if (out[out.length - 1] !== route[route.length - 1]) out.push(route[route.length - 1]);
  return out;
}


// A truck that stands still for 5 minutes during a trip (it never moved after the trip started, or it stopped on the way):
// the administrator is told once, and the stop stays on the trip's map even if the trip carries on or ends.
export const STOP_ALERT_SECONDS = 300;
export async function checkTripStop(db, { companyId, driverId }) {
  const trip = (
    await db.query(
      `SELECT t.id, k.truck_number, d.name AS driver_name FROM trips t JOIN trucks k ON k.id = t.truck_id JOIN drivers d ON d.id = t.driver_id
        WHERE t.company_id = $1 AND t.driver_id = $2 AND t.status = 'ACTIVE'`,
      [companyId, driverId],
    )
  ).rows[0];
  if (!trip) return null;
  const route = await loadRoute(db, companyId, trip.id);
  const stop = findLastStop(route, { minSeconds: STOP_ALERT_SECONDS });
  if (!stop) return null;
  const startedAt = new Date(stop.startedAtMs);
  const inserted = await db.query(
    `INSERT INTO trip_stops (company_id, trip_id, latitude, longitude, started_at, duration_seconds)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (trip_id, started_at) DO UPDATE SET duration_seconds = GREATEST(trip_stops.duration_seconds, EXCLUDED.duration_seconds)
     RETURNING (xmax = 0) AS is_new`,
    [companyId, trip.id, stop.latitude, stop.longitude, startedAt, stop.durationSeconds],
  );
  if (inserted.rows[0].is_new && stop.ongoing) {
    await notify(db, {
      companyId,
      type: 'TRUCK_STOPPED',
      title: `Truck #${trip.truck_number} has not moved for 5 minutes`,
      message: `${trip.driver_name}'s trip is running, but the truck has stood still since ${startedAt.toISOString()} at ${stop.latitude.toFixed(5)}, ${stop.longitude.toFixed(5)}. The stop is marked on the map.`,
      severity: 'warning',
    });
  }
  return { ...stop, isNew: inserted.rows[0].is_new };
}

export async function loadStops(q, companyId, tripId) {
  const { rows } = await q.query(
    `SELECT latitude, longitude, started_at, duration_seconds FROM trip_stops WHERE company_id = $1 AND trip_id = $2 ORDER BY started_at`,
    [companyId, tripId],
  );
  return rows.map((r) => ({ latitude: r.latitude, longitude: r.longitude, startedAt: r.started_at, durationSeconds: r.duration_seconds }));
}
