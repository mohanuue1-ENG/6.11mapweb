import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../../services/api';
import { coords, dateTime, duration, miles } from '../../services/format';
import { ErrorBanner, Modal, Spinner } from '../../components/common/ui';
import RouteReplayMap from '../../components/maps/RouteReplayMap';
import RouteGlobe from '../../components/maps/RouteGlobe';

export default function TripDetailsModal({ tripId, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // The street map shows the whole route on real roads; the globe shows where it is on the planet.
  const [view, setView] = useState('map');

  const load = useCallback(async () => {
    try {
      setData(await api(`/trips/${tripId}`));
      setError('');
    } catch (err) {
      setError(errorMessage(err, 'Could not load this trip.'));
    }
  }, [tripId]);

  useEffect(() => {
    load();
  }, [load]);

  const recalc = async () => {
    setBusy(true);
    try {
      await api(`/trips/${tripId}/recalculate-distance`, { method: 'POST' });
      await load();
      onChanged?.();
    } catch (err) {
      setError(errorMessage(err, 'Could not recalculate the distance.'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm('Delete this trip and its GPS route? This cannot be undone.')) return;
    setBusy(true);
    setError('');
    try {
      await api(`/trips/${tripId}`, { method: 'DELETE' });
      onChanged?.();
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'Could not delete the trip.'));
      setBusy(false);
    }
  };

  const t = data?.trip;
  const stat = (label, value) => (
    <div>
      <span className="block text-[10px] uppercase font-bold text-gray-400">{label}</span>
      <span className="text-sm font-semibold font-numbers">{value}</span>
    </div>
  );

  return (
    <Modal title={t ? `Trip ${t.id.slice(0, 8)}` : 'Trip'} onClose={onClose} xl>
      <ErrorBanner message={error} />
      {!t && !error && <Spinner />}
      {t && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {stat('Driver', t.driver.name)}
            {stat('Truck', `#${t.truck.truckNumber}`)}
            {stat('Status', t.status === 'ACTIVE' ? 'In progress' : 'Completed')}
            {stat('Route points', data.routePointCount)}
            {stat('Started', dateTime(t.startedAt))}
            {stat('Ended', dateTime(t.endedAt))}
            {stat('Duration', duration(t.durationSeconds))}
            {stat('Distance', t.distanceMeters == null ? (t.status === 'ACTIVE' ? 'When the trip ends' : 'Not enough GPS points') : miles(t.distanceMeters))}
          </div>
          <div className="text-xs text-gray-400 font-numbers">
            Start {coords(t.start.latitude, t.start.longitude)}
            {t.end && ` · End ${coords(t.end.latitude, t.end.longitude)}`}
          </div>

          <div className="flex items-center gap-2">
            {[['map', 'Road map'], ['globe', 'Globe']].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                aria-pressed={view === id}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                  view === id ? 'bg-brand-green text-[#052E16] border-brand-green' : 'border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/5'
                }`}
              >
                {label}
              </button>
            ))}
            <span className="text-[11px] text-gray-500 ml-auto">The whole route is shown from start to end.</span>
          </div>
          {view === 'map' ? <RouteReplayMap route={data.route} height="520px" /> : <RouteGlobe route={data.route} height="520px" />}

          {t.status === 'COMPLETED' && (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <button onClick={recalc} disabled={busy} className="text-xs font-semibold text-brand-green hover:underline flex items-center gap-1.5 disabled:opacity-60">
                <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} /> Recalculate distance (use after late offline uploads)
              </button>
              <button onClick={remove} disabled={busy} className="text-xs font-semibold text-red-500 hover:underline flex items-center gap-1.5 disabled:opacity-60">
                <Trash2 className="w-3.5 h-3.5" /> Delete this trip
              </button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
