import React, { useCallback, useEffect, useState } from 'react';
import { BarChart3, Download, Gauge, Route as RouteIcon, Timer, CheckCircle2 } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { api, downloadFile, errorMessage } from '../../services/api';
import { dateTime, dayEnd, dayStart, duration, isoDay, miles } from '../../services/format';
import { ErrorBanner, Field, PageHeader, Panel, Spinner, primaryButton, useFieldClass } from '../../components/common/ui';
import StatCard from '../../components/common/StatCard';

export default function Reports() {
  const { isDark } = useTheme();
  const field = useFieldClass();
  const [from, setFrom] = useState(() => isoDay(Date.now() - 29 * 24 * 3600 * 1000));
  const [to, setTo] = useState(() => isoDay(Date.now()));
  const [trips, setTrips] = useState(null);
  const [activity, setActivity] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const query = useCallback(() => new URLSearchParams({ from: dayStart(from), to: dayEnd(to) }), [from, to]);

  const load = useCallback(async () => {
    if (from > to) {
      setError('“From” must be on or before “To”.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const q = query();
      const [t, a] = await Promise.all([api(`/reports/trips?${q}`), api(`/reports/fleet-activity?${q}`)]);
      setTrips(t);
      setActivity(a);
    } catch (err) {
      setError(errorMessage(err, 'Could not load the reports.'));
    } finally {
      setBusy(false);
    }
  }, [from, to, query]);

  useEffect(() => {
    load();
    // Load once on entry; later changes need the button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exportCsv = async (path, name) => {
    try {
      await downloadFile(`${path}?${query()}&format=csv`, name);
    } catch (err) {
      setError(errorMessage(err, 'The download failed.'));
    }
  };

  const muted = isDark ? 'text-gray-400' : 'text-gray-500';
  const th = `py-3 px-4 font-semibold text-[11px] uppercase tracking-wider ${muted}`;
  const row = `divide-y font-numbers text-xs ${isDark ? 'divide-white/5' : 'divide-gray-100'}`;
  const totals = trips?.totals;

  return (
    <div className="space-y-6 pb-12 font-sans">
      <PageHeader icon={BarChart3} title="Reports" subtitle="Trips and fleet activity for a period, with CSV export" />
      <ErrorBanner message={error} />

      <Panel>
        <form onSubmit={(e) => { e.preventDefault(); load(); }} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <Field label="From">
            <input type="date" className={field} value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <input type="date" className={field} value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <button type="submit" disabled={busy} className={primaryButton + ' justify-center'}>
            {busy ? 'Loading…' : 'Run report'}
          </button>
        </form>
      </Panel>

      {!totals && !error && <Spinner />}
      {totals && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="Trips" value={totals.trips} icon={RouteIcon} color="green" subtitle={`${totals.active} in progress`} />
            <StatCard title="Completed" value={totals.completed} icon={CheckCircle2} color="blue" />
            <StatCard title="Distance" value={miles(totals.distanceMeters)} icon={Gauge} color="amber" subtitle="Trips with enough GPS points" />
            <StatCard title="Driving time" value={duration(totals.durationSeconds)} icon={Timer} color="gray" />
          </div>

          <Panel className="p-0 overflow-hidden">
            <div className="flex items-center justify-between p-4">
              <h3 className="text-xs font-bold uppercase tracking-wider">Fleet activity by truck</h3>
              <button onClick={() => exportCsv('/reports/fleet-activity', 'fleet-activity.csv')} className="text-xs font-semibold text-brand-green flex items-center gap-1.5 hover:underline">
                <Download className="w-3.5 h-3.5" /> CSV
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className={`border-t border-b ${isDark ? 'border-white/10' : 'border-gray-200'}`}>
                    {['Truck', 'Driver', 'Trips', 'Distance', 'Driving time', 'GPS points', 'Last seen'].map((h) => (
                      <th key={h} className={th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className={row}>
                  {activity.trucks.length === 0 && (
                    <tr><td colSpan={7} className={`py-8 px-4 text-center ${muted}`}>No trucks yet.</td></tr>
                  )}
                  {activity.trucks.map((t) => (
                    <tr key={t.truckId}>
                      <td className="py-3 px-4 font-bold text-brand-green">#{t.truckNumber}</td>
                      <td className="py-3 px-4">{t.driverName || '—'}</td>
                      <td className="py-3 px-4">{t.tripCount}</td>
                      <td className="py-3 px-4">{miles(t.distanceMeters)}</td>
                      <td className="py-3 px-4">{duration(t.durationSeconds)}</td>
                      <td className="py-3 px-4">{t.gpsPoints}</td>
                      <td className="py-3 px-4">{t.lastSeenAt ? dateTime(t.lastSeenAt) : 'never'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Panel className="p-0 overflow-hidden">
              <div className="flex items-center justify-between p-4">
                <h3 className="text-xs font-bold uppercase tracking-wider">By driver</h3>
                <button onClick={() => exportCsv('/reports/trips', 'trips.csv')} className="text-xs font-semibold text-brand-green flex items-center gap-1.5 hover:underline">
                  <Download className="w-3.5 h-3.5" /> All trips CSV
                </button>
              </div>
              <table className="w-full text-left">
                <thead><tr className={`border-t border-b ${isDark ? 'border-white/10' : 'border-gray-200'}`}>{['Driver', 'Trips', 'Distance', 'Time'].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
                <tbody className={row}>
                  {trips.byDriver.length === 0 && <tr><td colSpan={4} className={`py-8 px-4 text-center ${muted}`}>No trips in this period.</td></tr>}
                  {trips.byDriver.map((d) => (
                    <tr key={d.id}><td className="py-3 px-4 font-semibold">{d.name}</td><td className="py-3 px-4">{d.trips}</td><td className="py-3 px-4">{miles(d.distanceMeters)}</td><td className="py-3 px-4">{duration(d.durationSeconds)}</td></tr>
                  ))}
                </tbody>
              </table>
            </Panel>

            <Panel className="p-0 overflow-hidden">
              <div className="p-4"><h3 className="text-xs font-bold uppercase tracking-wider">By truck</h3></div>
              <table className="w-full text-left">
                <thead><tr className={`border-t border-b ${isDark ? 'border-white/10' : 'border-gray-200'}`}>{['Truck', 'Trips', 'Distance', 'Time'].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
                <tbody className={row}>
                  {trips.byTruck.length === 0 && <tr><td colSpan={4} className={`py-8 px-4 text-center ${muted}`}>No trips in this period.</td></tr>}
                  {trips.byTruck.map((t) => (
                    <tr key={t.id}><td className="py-3 px-4 font-semibold">#{t.truckNumber}</td><td className="py-3 px-4">{t.trips}</td><td className="py-3 px-4">{miles(t.distanceMeters)}</td><td className="py-3 px-4">{duration(t.durationSeconds)}</td></tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
