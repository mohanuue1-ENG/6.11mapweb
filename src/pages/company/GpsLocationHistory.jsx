import React, { useEffect, useMemo, useState } from 'react';
import { Radio } from 'lucide-react';
import { useGps } from '../../context/GpsContext';
import { useTheme } from '../../context/ThemeContext';
import { api, errorMessage } from '../../services/api';
import { dateTime, mph } from '../../services/format';
import { ErrorBanner, Field, PageHeader, Panel, Spinner, primaryButton, useFieldClass } from '../../components/common/ui';
import RouteReplayMap from '../../components/maps/RouteReplayMap';
import RouteGlobe from '../../components/maps/RouteGlobe';

const LIMIT = 1000;
// <input type="datetime-local"> wants local "YYYY-MM-DDTHH:mm".
const local = (date) => {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function GpsLocationHistory() {
  const { trucks } = useGps();
  const { isDark } = useTheme();
  const field = useFieldClass();

  const [truckId, setTruckId] = useState('');
  const [from, setFrom] = useState(() => local(Date.now() - 24 * 3600 * 1000));
  const [to, setTo] = useState(() => local(Date.now()));
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // The globe is the first view; the street map shows the same points on real roads.
  const [view, setView] = useState('globe');

  useEffect(() => {
    if (!truckId && trucks.length) setTruckId(trucks[0].id);
  }, [trucks, truckId]);

  const search = async (e) => {
    e?.preventDefault();
    if (!truckId || loading) return;
    if (new Date(from) >= new Date(to)) {
      setError('“From” must be before “To”.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams({ truckId, from: new Date(from).toISOString(), to: new Date(to).toISOString(), limit: String(LIMIT) });
      setResult(await api(`/gps/history?${q}`));
    } catch (err) {
      setError(errorMessage(err, 'Could not load the GPS history.'));
    } finally {
      setLoading(false);
    }
  };

  // The API returns newest first; the map wants the route in driving order.
  const route = useMemo(() => (result ? [...result.points].reverse() : []), [result]);
  const muted = isDark ? 'text-gray-400' : 'text-gray-500';

  return (
    <div className="space-y-6 pb-12 font-sans">
      <PageHeader icon={Radio} title="GPS History" subtitle="Stored location points for a truck, on the map and as a list" />
      <ErrorBanner message={error} />

      <Panel>
        <form onSubmit={search} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <Field label="Truck">
            <select className={field} value={truckId} onChange={(e) => setTruckId(e.target.value)}>
              {trucks.length === 0 && <option value="">No trucks yet</option>}
              {trucks.map((t) => (
                <option key={t.id} value={t.id}>#{t.truckNumber}</option>
              ))}
            </select>
          </Field>
          <Field label="From">
            <input type="datetime-local" className={field} value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <input type="datetime-local" className={field} value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <button type="submit" disabled={!truckId || loading} className={primaryButton + ' justify-center'}>
            {loading ? 'Loading…' : 'Show history'}
          </button>
        </form>
      </Panel>

      {loading && !result && <Spinner />}
      {result && (
        <>
          <Panel className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className={`text-xs ${muted}`}>
                {result.points.length} point{result.points.length === 1 ? '' : 's'}
                {result.hasMore && ` — showing the newest ${LIMIT}. Narrow the time range to see the rest.`}
              </div>
              <div className={`inline-flex rounded-xl p-0.5 border ${isDark ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-gray-50'}`} role="tablist" aria-label="Map view">
                {[['globe', 'Globe'], ['map', 'Road map']].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={view === id}
                    onClick={() => setView(id)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                      view === id ? 'bg-brand-green text-[#052E16]' : isDark ? 'text-gray-300 hover:text-white' : 'text-gray-700 hover:text-gray-900'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {view === 'globe' ? <RouteGlobe route={route} height="460px" /> : <RouteReplayMap route={route} height="420px" />}
            {view === 'globe' && route.length > 0 && <p className={`text-[11px] ${muted}`}>Drag the globe to turn it. Open “Road map” to see the exact roads the truck used.</p>}
          </Panel>

          {result.points.length > 0 && (
            <Panel className="p-0 overflow-hidden">
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-left text-xs">
                  <thead className={`sticky top-0 ${isDark ? 'bg-[#0B0F14]' : 'bg-white'}`}>
                    <tr className={`border-b text-[11px] uppercase tracking-wider ${isDark ? 'border-white/10 text-gray-400' : 'border-gray-200 text-gray-600'}`}>
                      {['GPS time', 'Latitude', 'Longitude', 'Speed', 'Accuracy', 'Trip'].map((h) => (
                        <th key={h} className="py-3 px-4 font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className={`divide-y font-numbers ${isDark ? 'divide-white/5' : 'divide-gray-100'}`}>
                    {result.points.slice(0, 200).map((p) => (
                      <tr key={p.id}>
                        <td className="py-2.5 px-4">{dateTime(p.gpsTimestamp)}</td>
                        <td className="py-2.5 px-4">{p.latitude.toFixed(5)}</td>
                        <td className="py-2.5 px-4">{p.longitude.toFixed(5)}</td>
                        <td className="py-2.5 px-4">{mph(p.speedMps)}</td>
                        <td className="py-2.5 px-4">{p.accuracyMeters == null ? '—' : `±${Math.round(p.accuracyMeters)} m`}</td>
                        <td className="py-2.5 px-4">{p.tripId ? p.tripId.slice(0, 8) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {result.points.length > 200 && <p className={`px-4 py-2 text-[11px] ${muted}`}>The list shows the newest 200 points; the map shows all of them.</p>}
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
