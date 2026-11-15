// Place names for GPS positions ("I-35, Waco, Texas"), so dispatchers see where a truck is and not
// just two numbers.
//
// This sends the coordinates of a truck to a map-data service (by default OpenStreetMap's public
// Nominatim). Two consequences are handled here:
//  - the request goes from this server, never from the browser, so the dispatcher's address is not
//    shared and the service sees one polite client;
//  - the public service allows about one request per second and wants a real User-Agent, so lookups are
//    queued, cached by position (to about 10 m) and never retried in a loop.
// For heavy use, point GEOCODER_URL at a paid or self-hosted Nominatim-compatible service. Setting
// GEOCODER_URL to an empty value turns place names off; the dashboard then shows coordinates.

const MIN_GAP_MS = 1100;
const CACHE_MAX = 5000;
const FAILURE_TTL_MS = 60_000;
const TIMEOUT_MS = 6000;

export function placeFrom(json) {
  const a = json?.address;
  if (!a) return null;
  const road = a.road || a.pedestrian || a.highway || a.footway || null;
  const area = a.city || a.town || a.village || a.hamlet || a.suburb || a.county || null;
  const state = a.state || a.region || null;
  const parts = [road, area, state].filter(Boolean);
  if (!parts.length) return null;
  return {
    name: parts.join(', '),
    road,
    city: area,
    state,
    postcode: a.postcode || null,
    country: a.country || null,
    displayName: json.display_name || parts.join(', '),
  };
}

export function createGeocoder(config, { fetchImpl = globalThis.fetch, now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const enabled = Boolean(config.geocoderUrl);
  const cache = new Map(); // key -> { place, expires }
  const inflight = new Map();
  let chain = Promise.resolve();
  let lastCallAt = 0;

  const keyOf = (lat, lng) => `${lat.toFixed(4)},${lng.toFixed(4)}`;

  async function lookup(lat, lng) {
    const url = new URL(config.geocoderUrl);
    url.search = new URLSearchParams({ format: 'jsonv2', lat: String(lat), lon: String(lng), zoom: '17', addressdetails: '1' }).toString();
    const res = await fetchImpl(url, {
      headers: { 'User-Agent': config.geocoderUserAgent, 'Accept-Language': 'en', Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`geocoder answered ${res.status}`);
    return placeFrom(await res.json());
  }

  // One request at a time, with a pause between them.
  function enqueue(work) {
    const run = chain.then(async () => {
      const wait = lastCallAt + MIN_GAP_MS - now();
      if (wait > 0) await sleep(wait);
      lastCallAt = now();
      return work();
    });
    chain = run.catch(() => {});
    return run;
  }

  return {
    enabled,
    async reverse(lat, lng) {
      if (!enabled) return null;
      const key = keyOf(lat, lng);
      const hit = cache.get(key);
      if (hit && hit.expires > now()) return hit.place;
      if (inflight.has(key)) return inflight.get(key);

      const job = enqueue(() => lookup(lat, lng))
        .then((place) => {
          cache.set(key, { place, expires: place ? Infinity : now() + FAILURE_TTL_MS });
          if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
          return place;
        })
        .catch(() => {
          // Remember the failure briefly so a down service is not hammered.
          cache.set(key, { place: null, expires: now() + FAILURE_TTL_MS });
          return null;
        })
        .finally(() => inflight.delete(key));
      inflight.set(key, job);
      return job;
    },
  };
}
