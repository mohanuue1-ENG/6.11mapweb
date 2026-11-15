import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { api, errorMessage } from '../../services/api';
import { coords, dateTime, duration, miles } from '../../services/format';
import { ErrorBanner, Modal, Spinner } from '../../components/common/ui';
import RouteReplayMap from '../../components/maps/RouteReplayMap';

export default function TripDetailsModal({ tripId, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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

  const t = data?.trip;
  const stat = (label, value) => (
    <div>
      <span className="block text-[10px] uppercase font-bold text-gray-400">{label}</span>
      <span className="text-sm font-semibold font-numbers">{value}</span>
    </div>
  );

  return (
    <Modal title={t ? `Trip ${t.id.slice(0, 8)}` : 'Trip'} onClose={onClose} wide>
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

          <RouteReplayMap route={data.route} height="360px" />

          {t.status === 'COMPLETED' && (
            <button onClick={recalc} disabled={busy} className="text-xs font-semibold text-brand-green hover:underline flex items-center gap-1.5 disabled:opacity-60">
              <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} /> Recalculate distance (use after late offline uploads)
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}
