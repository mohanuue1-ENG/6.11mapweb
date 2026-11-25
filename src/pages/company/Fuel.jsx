import React, { useEffect, useState } from 'react';
import { Fuel as FuelIcon, PlusCircle, Edit2, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../../services/api';
import { money } from '../../services/format';
import { useGps } from '../../context/GpsContext';
import { useTheme } from '../../context/ThemeContext';
import { US_STATES } from '../../data/usStates';
import { ErrorBanner, Field, Modal, PageHeader, Panel, Spinner, primaryButton, useFieldClass } from '../../components/common/ui';

const today = () => new Date().toISOString().slice(0, 10);
const EMPTY = { fuelDate: today(), stateAbbr: 'IA', location: '', receiptNumber: '', gallons: '', cash: '', driverId: '', truckId: '' };

// The fuel the trucks bought: written by the dispatcher or the owner, seen by the driver it belongs to.
export default function Fuel() {
  const { isDark } = useTheme();
  const { drivers, trucks } = useGps();
  const field = useFieldClass();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [driverId, setDriverId] = useState('');
  const [editing, setEditing] = useState(undefined);
  const [f, setF] = useState(EMPTY);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const muted = isDark ? 'text-gray-400' : 'text-gray-500';

  const load = () => api(`/fuel${driverId ? `?driverId=${driverId}` : ''}`).then((r) => { setData(r); setError(''); }).catch((e) => setError(errorMessage(e, 'Could not load the fuel records.')));
  useEffect(() => { load(); }, [driverId]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = (r = null) => {
    setFormError('');
    setF(r ? { fuelDate: r.fuelDate, stateAbbr: r.stateAbbr, location: r.location, receiptNumber: r.receiptNumber || '', gallons: String(r.gallons), cash: (r.cashOutCents / 100).toString(), driverId: r.driverId, truckId: r.truckId || '' } : EMPTY);
    setEditing(r);
  };

  const save = async (e) => {
    e.preventDefault();
    const gallons = Number(f.gallons);
    const cash = Number(f.cash);
    if (!Number.isFinite(gallons) || gallons < 0 || !Number.isFinite(cash) || cash < 0) return setFormError('Gallons and cost must be 0 or more.');
    if (!f.driverId) return setFormError('Choose the driver.');
    const body = { fuelDate: f.fuelDate, stateAbbr: f.stateAbbr, location: f.location.trim(), receiptNumber: f.receiptNumber.trim() || null, gallons, cashOutCents: Math.round(cash * 100), driverId: f.driverId, truckId: f.truckId || null };
    setSaving(true);
    setFormError('');
    try {
      await api(editing ? `/fuel/${editing.id}` : '/fuel', { method: editing ? 'PATCH' : 'POST', body });
      setEditing(undefined);
      load();
    } catch (err) {
      setFormError(errorMessage(err, 'Could not save the fuel record.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (r) => {
    if (!window.confirm('Delete this fuel record?')) return;
    try { await api(`/fuel/${r.id}`, { method: 'DELETE' }); load(); } catch (err) { setError(errorMessage(err, 'Could not delete the record.')); }
  };

  return (
    <div className="space-y-6 pb-8">
      <PageHeader icon={FuelIcon} title="Fuel" subtitle="Write each fuel purchase: the state, the place, the receipt, the gallons and the cost. The driver sees their own.">
        <button onClick={() => open(null)} className={primaryButton}><PlusCircle className="w-4 h-4" /> Add fuel</button>
      </PageHeader>
      <ErrorBanner message={error} />

      <Panel className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <select className={`${field} !w-auto min-w-[200px]`} value={driverId} onChange={(e) => setDriverId(e.target.value)} aria-label="Driver">
            <option value="">All drivers</option>
            {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          {data && (
            <div className="flex gap-6 text-sm">
              <div><span className={muted}>Gallons </span><strong className="font-numbers">{data.totals.gallons.toLocaleString()}</strong></div>
              <div><span className={muted}>Cost </span><strong className="font-numbers">{money(data.totals.cashOutCents)}</strong></div>
            </div>
          )}
        </div>

        {!data ? <Spinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className={`border-b text-[11px] uppercase tracking-wider ${isDark ? 'border-white/10 text-gray-400' : 'border-gray-200 text-gray-600'}`}>
                  {['Date', 'State', 'Place', 'Receipt', 'Gallons', 'Cost', 'Driver', ''].map((h) => <th key={h} className="py-3 px-3 font-semibold">{h}</th>)}
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? 'divide-white/5' : 'divide-gray-100'}`}>
                {data.fuel.length === 0 && <tr><td colSpan={8} className={`py-10 text-center ${muted}`}>No fuel records yet. Click “Add fuel”.</td></tr>}
                {data.fuel.map((r) => (
                  <tr key={r.id}>
                    <td className="py-3 px-3 font-numbers">{r.fuelDate}</td>
                    <td className="py-3 px-3 font-bold">{r.stateAbbr}</td>
                    <td className="py-3 px-3">{r.location}</td>
                    <td className="py-3 px-3">{r.receiptNumber || '—'}</td>
                    <td className="py-3 px-3 font-numbers">{r.gallons}</td>
                    <td className="py-3 px-3 font-numbers font-bold">{money(r.cashOutCents)}</td>
                    <td className="py-3 px-3">{r.driverName}<div className={muted}>{r.truckNumber ? `Truck #${r.truckNumber}` : ''}</div></td>
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      <button onClick={() => open(r)} aria-label="Edit fuel record" className="p-1.5 rounded-lg text-gray-400 hover:text-brand-green"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => remove(r)} aria-label="Delete fuel record" className="p-1.5 rounded-lg text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {editing !== undefined && (
        <Modal title={editing ? 'Edit fuel record' : 'Add fuel'} onClose={() => setEditing(undefined)} wide>
          <form onSubmit={save} className="space-y-3">
            <ErrorBanner message={formError} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date *"><input required type="date" className={field} value={f.fuelDate} onChange={(e) => setF({ ...f, fuelDate: e.target.value })} /></Field>
              <Field label="State *">
                <select className={field} value={f.stateAbbr} onChange={(e) => setF({ ...f, stateAbbr: e.target.value })}>
                  {US_STATES.map(([abbr, name]) => <option key={abbr} value={abbr}>{abbr} · {name}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Place *"><input required className={field} placeholder="Pilot, Des Moines" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></Field>
            <Field label="Receipt number"><input className={field} value={f.receiptNumber} onChange={(e) => setF({ ...f, receiptNumber: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Gallons *"><input required type="number" min="0" step="0.01" className={field} value={f.gallons} onChange={(e) => setF({ ...f, gallons: e.target.value })} /></Field>
              <Field label="Cost (USD) *"><input required type="number" min="0" step="0.01" className={field} value={f.cash} onChange={(e) => setF({ ...f, cash: e.target.value })} /></Field>
              <Field label="Driver *">
                <select required className={field} value={f.driverId} onChange={(e) => setF({ ...f, driverId: e.target.value })}>
                  <option value="">Choose…</option>
                  {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </Field>
              <Field label="Truck">
                <select className={field} value={f.truckId} onChange={(e) => setF({ ...f, truckId: e.target.value })}>
                  <option value="">None</option>
                  {trucks.map((t) => <option key={t.id} value={t.id}>#{t.truckNumber}</option>)}
                </select>
              </Field>
            </div>
            <button type="submit" disabled={saving} className={`${primaryButton} w-full justify-center`}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Add fuel'}</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
