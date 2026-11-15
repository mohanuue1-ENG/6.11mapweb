import { useEffect, useRef, useState } from 'react';
import { api } from './api';

// Place names ("Interstate 35, Waco, Texas") and the last place a truck stood still.

const cache = new Map(); // "lat,lng" (about 10 m) -> place | null
const pending = new Map();
const key = (lat, lng) => `${lat.toFixed(4)},${lng.toFixed(4)}`;

export function fetchPlace(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return Promise.resolve(null);
  const k = key(lat, lng);
  if (cache.has(k)) return Promise.resolve(cache.get(k));
  if (pending.has(k)) return pending.get(k);
  const p = api(`/gps/geocode?lat=${lat}&lng=${lng}`)
    .then((r) => {
      cache.set(k, r.place);
      return r.place;
    })
    .catch(() => null)
    .finally(() => pending.delete(k));
  pending.set(k, p);
  return p;
}

const rad = (d) => (d * Math.PI) / 180;
function metersBetween(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

// The place name for a position. While a truck drives, the name is only looked up again after it has
// moved `minMoveM` metres, so one truck does not cause a request every few seconds.
export function usePlace(lat, lng, { minMoveM = 150 } = {}) {
  const [place, setPlace] = useState(null);
  const last = useRef(null);
  const requestId = useRef(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setPlace(null);
      last.current = null;
      return;
    }
    // A moving truck changes position every few seconds: keep the name until it has moved far enough.
    if (last.current && metersBetween(last.current, { lat, lng }) < minMoveM) return;
    last.current = { lat, lng };
    // Only the newest lookup may set the name, but an older position's re-render must not cancel it.
    const id = ++requestId.current;
    fetchPlace(lat, lng).then((p) => {
      if (alive.current && id === requestId.current) setPlace(p);
    });
  }, [lat, lng, minMoveM]);

  return place;
}

// Where the truck last stood still, refreshed when `refreshKey` changes (for example its last GPS time).
export function useLastStop(truckId, refreshKey) {
  const [stop, setStop] = useState(undefined); // undefined = loading, null = none found
  const lastLoadAt = useRef(0);
  const requestId = useRef(0);

  useEffect(() => {
    setStop(undefined);
    lastLoadAt.current = 0;
    requestId.current += 1; // a lookup for the previous truck must not set this one's stop
  }, [truckId]);

  useEffect(() => {
    if (!truckId) return undefined;
    // Truck positions can arrive every few seconds; the stop only needs refreshing about every 30 s.
    if (Date.now() - lastLoadAt.current < 30_000 && stop !== undefined) return undefined;
    lastLoadAt.current = Date.now();
    const id = ++requestId.current;
    api(`/gps/trucks/${truckId}/activity`)
      .then((r) => id === requestId.current && setStop(r.lastStop))
      .catch(() => id === requestId.current && setStop((s) => (s === undefined ? null : s)));
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [truckId, refreshKey]);

  return stop;
}

export function formatDuration(seconds) {
  const m = Math.round(seconds / 60);
  if (m < 1) return 'under a minute';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}
