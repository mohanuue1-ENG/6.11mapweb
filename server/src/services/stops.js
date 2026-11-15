import { haversineMeters } from './geo.js';

// Finds where a truck last stood still.
//
// A stop is a stretch of time in which every recorded point stays within `radiusM` of the point
// where the stretch began, lasting at least `minSeconds`. Using distance and not the reported speed
// keeps it correct for phones that do not report speed, and a truck idling in a yard stays one stop.
//
// points: [{ latitude, longitude, timeMs, accuracyMeters? }] in time order.
// Returns the most recent stop, or null:
//   { latitude, longitude, startedAtMs, endedAtMs, durationSeconds, ongoing }
// `ongoing` means the latest point belongs to the stop: the truck is stopped right now.
export function findLastStop(points, { radiusM = 60, minSeconds = 180, maxAccuracyM = 100 } = {}) {
  const usable = points.filter((p) => p.accuracyMeters == null || p.accuracyMeters <= maxAccuracyM);
  if (usable.length < 2) return null;

  let last = null;
  let from = 0;
  const close = (to) => {
    const first = usable[from];
    const end = usable[to];
    const seconds = (end.timeMs - first.timeMs) / 1000;
    if (seconds >= minSeconds) {
      // The middle of the cluster is a better "where" than its first point.
      const slice = usable.slice(from, to + 1);
      last = {
        latitude: slice.reduce((s, p) => s + p.latitude, 0) / slice.length,
        longitude: slice.reduce((s, p) => s + p.longitude, 0) / slice.length,
        startedAtMs: first.timeMs,
        endedAtMs: end.timeMs,
        durationSeconds: Math.round(seconds),
        ongoing: to === usable.length - 1,
      };
    }
  };

  for (let i = 1; i < usable.length; i += 1) {
    if (haversineMeters(usable[from], usable[i]) > radiusM) {
      close(i - 1);
      from = i;
    }
  }
  close(usable.length - 1);
  return last;
}
