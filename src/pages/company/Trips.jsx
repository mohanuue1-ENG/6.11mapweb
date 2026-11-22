import React, { useCallback, useEffect, useState } from 'react';
import { Route as RouteIcon, ChevronLeft, ChevronRight, Eye, Trash2 } from 'lucide-react';
import { useGps } from '../../context/GpsContext';
import { useTheme } from '../../context/ThemeContext';
import { api, errorMessage } from '../../services/api';
import { dateTime, dayEnd, dayStart, duration, miles } from '../../services/format';
import { ErrorBanner, Field, PageHeader, Panel, Spinner, useFieldClass } from '../../components/common/ui';
import TripDetailsModal from './TripDetailsModal';

const PAGE = 25;

export default function Trips() {
  const { trucks, drivers, trips: liveTrips } = useGps();
  const { isDark } = useTheme();
  const field = useFieldClass();

  const [filters, setFilters] = useState({ status: '', truckId: '', driverId: '', from: '', to: '' });
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null);
  const [deleting, setDeleting] = useState('');

  const load = useCallback(async () => {
    const q = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
    if (filters.status) q.set('status', filters.status);
    if (filters.truckId) q.set('truckId', filters.truckId);
    if (filters.driverId) q.set('driverId', filters.driverId);
    if (filters.from) q.set('from', dayStart(filters.from));
    if (filters.to) q.set('to', dayEnd(filters.to));
    try {
      setData(await api(`/trips?${q}`));
      setError('');
    } catch (err) {
      setError(errorMessage(err, 'Could not load trips.'));
    }
  }, [filters, offset]);

  // Reload when filters change, and whenever a trip starts or ends (the context sees those live).
  const signature = liveTrips.map((t) => `${t.id}${t.status}`).join();
  useEffect(() => {
    load();
  }, [load, signature]);

  // Deletes a finished trip and its recorded points (for example a test trip).
  const removeTrip = async (t) => {
    if (t.status === 'ACTIVE') {
      setError('This trip is still in progress. End it before deleting it.');
      return;
    }
    if (!window.confirm(`Delete trip ${t.id.slice(0, 8)} (truck #${t.truck.truckNumber}) and its GPS route? This cannot be undone.`)) return;
    setDeleting(t.id);
    try {
      await api(`/trips/${t.id}`, { method: 'DELETE' });
      setError('');
      if (openId === t.id) setOpenId(null);
      await load();
    } catch (err) {
      setError(errorMessage(err, 'Could not delete the trip.'));
    } finally {
      setDeleting('');
    }
  };

  const set = (key) => (e) => {
    setOffset(0);
    setFilters({ ...filters, [key]: e.target.value });
  };

  const total = data?.total ?? 0;
  const muted = isDark ? 'text-gray-400' : 'text-gray-500';

  return (
    <div className="space-y-6 pb-12 font-sans">
      <PageHeader icon={RouteIcon} title="Trips" subtitle="Every trip with real start and end positions, duration and distance" />
      <ErrorBanner message={error} />

      <Panel>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Field label="Status">
            <select className={field} value={filters.status} onChange={set('status')}>
              <option value="">All</option>
              <option value="ACTIVE">In progress</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </Field>
          <Field label="Truck">
            <select className={field} value={filters.truckId} onChange={set('truckId')}>
              <option value="">All trucks</option>
              {trucks.map((t) => (
                <option key={t.id} value={t.id}>#{t.truckNumber}</option>
              ))}
            </select>
          </Field>
          <Field label="Driver">
            <select className={field} value={filters.driverId} onChange={set('driverId')}>
              <option value="">All drivers</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </Field>
          <Field label="From">
            <input type="date" className={field} value={filters.from} onChange={set('from')} />
          </Field>
          <Field label="To">
            <input type="date" className={field} value={filters.to} onChange={set('to')} />
          </Field>
        </div>
      </Panel>

      <Panel className="p-0 overflow-hidden">
        {!data && !error ? (
          <Spinner label="Loading trips…" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className={`border-b text-[11px] uppercase tracking-wider ${isDark ? 'border-white/10 bg-white/[0.02] text-gray-400' : 'border-gray-200 bg-gray-50 text-gray-600'}`}>
                  {['Trip', 'Truck', 'Driver', 'Started', 'Duration', 'Distance', 'Status', ''].map((h) => (
                    <th key={h} className="py-3.5 px-4 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className={`divide-y font-numbers ${isDark ? 'divide-white/5' : 'divide-gray-100'}`}>
                {data?.trips.length === 0 && (
                  <tr>
                    <td colSpan={8} className={`py-10 px-4 text-center ${muted}`}>
                      No trips match. Trips appear here when a driver starts one in the mobile app.
                    </td>
                  </tr>
                )}
                {data?.trips.map((t) => (
                  <tr key={t.id} className={isDark ? 'hover:bg-white/5' : 'hover:bg-gray-50'}>
                    <td className="py-3.5 px-4 font-bold text-brand-green">{t.id.slice(0, 8)}</td>
                    <td className="py-3.5 px-4 font-semibold">#{t.truck.truckNumber}</td>
                    <td className="py-3.5 px-4">{t.driver.name}</td>
                    <td className="py-3.5 px-4">{dateTime(t.startedAt)}</td>
                    <td className="py-3.5 px-4">{duration(t.durationSeconds)}</td>
                    <td className="py-3.5 px-4">{miles(t.distanceMeters)}</td>
                    <td className="py-3.5 px-4">
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${t.status === 'ACTIVE' ? 'bg-brand-green/20 text-brand-green' : 'bg-blue-500/20 text-blue-500'}`}>
                        ● {t.status === 'ACTIVE' ? 'In progress' : 'Completed'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => setOpenId(t.id)} aria-label="View trip" title="View trip and route" className="p-1.5 rounded-lg border border-gray-300 dark:border-white/10 text-gray-500 hover:text-brand-green">
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => removeTrip(t)}
                          disabled={deleting === t.id}
                          aria-label="Delete trip"
                          title={t.status === 'ACTIVE' ? 'End the trip before deleting it' : 'Delete trip'}
                          className="p-1.5 rounded-lg border border-gray-300 dark:border-white/10 text-red-500 hover:bg-red-500/10 disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {total > PAGE && (
          <div className={`flex items-center justify-between px-4 py-3 border-t text-xs ${isDark ? 'border-white/10' : 'border-gray-200'}`}>
            <span className={muted}>
              {offset + 1}–{Math.min(offset + PAGE, total)} of {total}
            </span>
            <div className="flex gap-2">
              <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))} aria-label="Previous page" className="p-1.5 rounded-lg border border-white/10 disabled:opacity-40">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)} aria-label="Next page" className="p-1.5 rounded-lg border border-white/10 disabled:opacity-40">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </Panel>

      {openId && <TripDetailsModal tripId={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  );
}
