// Display helpers. The API stores metric units and UTC times.
export const miles = (m) => (m == null ? '—' : `${(m / 1609.344).toFixed(1)} mi`);
export const mph = (mps) => (mps == null ? '—' : `${Math.round(mps * 2.23694)} mph`);

export function duration(seconds) {
  if (seconds == null) return '—';
  const total = Math.round(seconds / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? `${h} h ${m} min` : `${m} min`;
}

export const dateTime = (iso) => (iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—');
export const coords = (lat, lng) => `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`;
export const money = (cents) => `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

// <input type="date"> value (YYYY-MM-DD) -> start / end of that local day, as ISO.
export const dayStart = (value) => new Date(`${value}T00:00:00`).toISOString();
export const dayEnd = (value) => new Date(`${value}T23:59:59.999`).toISOString();
export const isoDay = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
