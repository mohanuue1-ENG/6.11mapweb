import React, { useEffect, useMemo, useState } from 'react';
import { Package, PlusCircle, Edit2, Trash2, Search } from 'lucide-react';
import { api, errorMessage } from '../../services/api';
import { money } from '../../services/format';
import { useGps } from '../../context/GpsContext';
import { useTheme } from '../../context/ThemeContext';
import { ErrorBanner, Field, Modal, PageHeader, Panel, Spinner, primaryButton, useFieldClass } from '../../components/common/ui';

const STATUS = {
  assigned: { label: 'Assigned', cls: 'bg-amber-500/15 text-amber-600' },
  picked_up: { label: 'Picked up', cls: 'bg-blue-500/15 text-blue-500' },
  delivered: { label: 'Delivered', cls: 'bg-brand-green/15 text-brand-green' },
};
const today = () => new Date().toISOString().slice(0, 10);
const EMPTY = { loadNumber: '', loadDate: today(), broker: '', pickupLocation: '', pickupTime: '', dropoffLocation: '', dropoffTime: '', cash: '', payMethod: 'ach', driverId: '', truckId: '', status: 'assigned' };

// The loads: written by the dispatcher (or the owner) and given to a driver. The driver sees them in the app.
export default function Loads() {
  const { isDark } = useTheme();
  const { drivers, trucks } = useGps();
  const field = useFieldClass();
  const [loads, setLoads] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(undefined); // undefined = closed, null = new, object = edit
  const [f, setF] = useState(EMPTY);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const muted = isDark ? 'text-gray-400' : 'text-gray-500';

  const load = () => {
    const qs = new URLSearchParams();
    if (status) qs.set('status', status);
    if (q.trim()) qs.set('q', q.trim());
    return api(`/loads?${qs}`).then((r) => { setLoads(r.loads); setError(''); }).catch((e) => setError(errorMessage(e, 'Could not load the loads.')));
  };
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [status, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = (l = null) => {
    setFormError('');
    setF(l ? { loadNumber: l.loadNumber, loadDate: l.loadDate, broker: l.broker, pickupLocation: l.pickupLocation || '', pickupTime: l.pickupTime || '', dropoffLocation: l.dropoffLocation || '', dropoffTime: l.dropoffTime || '', cash: (l.cashInCents / 100).toString(), payMethod: l.payMethod, driverId: l.driverId || '', truckId: l.truckId || '', status: l.status } : EMPTY);
    setEditing(l);
  };

  const save = async (e) => {
    e.preventDefault();
    const cash = f.cash === '' ? 0 : Number(f.cash);
    if (!Number.isFinite(cash) || cash < 0) return setFormError('Cash In must be 0 or more.');
    const body = {
      loadNumber: f.loadNumber.trim(), loadDate: f.loadDate, broker: f.broker.trim(),
      pickupLocation: f.pickupLocation.trim() || null, pickupTime: f.pickupTime || null,
      dropoffLocation: f.dropoffLocation.trim() || null, dropoffTime: f.dropoffTime || null,
      cashInCents: Math.round(cash * 100), payMethod: f.payMethod,
      driverId: f.driverId || null, truckId: f.truckId || null,
    };
    if (editing) body.status = f.status;
    setSaving(true);
    setFormError('');
    try {
      await api(editing ? `/loads/${editing.id}` : '/loads', { method: editing ? 'PATCH' : 'POST', body });
      setEditing(undefined);
      load();
    } catch (err) {
      setFormError(errorMessage(err, 'Could not save the load.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (l) => {
    if (!window.confirm(`Delete load ${l.loadNumber}?`)) return;
    try { await api(`/loads/${l.id}`, { method: 'DELETE' }); load(); } catch (err) { setError(errorMessage(err, 'Could not delete the load.')); }
  };

  const totals = useMemo(() => (loads || []).reduce((s, l) => s + (l.cashInCents || 0), 0), [loads]);

  return (
    <div className="space-y-6 pb-8">
      <PageHeader icon={Package} title="Loads" subtitle="Write a load and give it to a driver. The driver sees it in the app and marks it picked up and delivered.">
        <button onClick={() => open(null)} className={primaryButton}><PlusCircle className="w-4 h-4" /> New load</button>
      </PageHeader>
      <ErrorBanner message={error} />

      <Panel className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-gray-400" />
            <input className={`${field} pl-9`} placeholder="Search load number or broker…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="flex gap-1 text-[11px] font-bold">
            {[['', 'All'], ['assigned', 'Assigned'], ['picked_up', 'Picked up'], ['delivered', 'Delivered']].map(([k, label]) => (
              <button key={k} onClick={() => setStatus(k)} className={`px-3 py-1.5 rounded-lg ${status === k ? 'bg-brand-green text-black' : isDark ? 'bg-white/5 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>{label}</button>
            ))}
          </div>
        </div>

        {!loads ? <Spinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className={`border-b text-[11px] uppercase tracking-wider ${isDark ? 'border-white/10 text-gray-400' : 'border-gray-200 text-gray-600'}`}>
                  {['Load', 'Date', 'Broker', 'Pick up', 'Drop off', 'Driver', 'Cash In', 'Status', ''].map((h) => <th key={h} className="py-3 px-3 font-semibold">{h}</th>)}
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? 'divide-white/5' : 'divide-gray-100'}`}>
                {loads.length === 0 && <tr><td colSpan={9} className={`py-10 text-center ${muted}`}>No loads yet. Click “New load”.</td></tr>}
                {loads.map((l) => (
                  <tr key={l.id}>
                    <td className="py-3 px-3 font-bold">#{l.loadNumber}</td>
                    <td className="py-3 px-3 font-numbers">{l.loadDate}</td>
                    <td className="py-3 px-3">{l.broker}</td>
                    <td className="py-3 px-3">{l.pickupLocation || '—'}<div className={muted}>{l.pickupTime || ''}</div></td>
                    <td className="py-3 px-3">{l.dropoffLocation || '—'}<div className={muted}>{l.dropoffTime || ''}</div></td>
                    <td className="py-3 px-3">{l.driverName || 'Unassigned'}<div className={muted}>{l.truckNumber ? `Truck #${l.truckNumber}` : ''}</div></td>
                    <td className="py-3 px-3 font-numbers font-bold">{money(l.cashInCents)}</td>
                    <td className="py-3 px-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${STATUS[l.status].cls}`}>{STATUS[l.status].label}</span></td>
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      <button onClick={() => open(l)} aria-label={`Edit load ${l.loadNumber}`} className="p-1.5 rounded-lg text-gray-400 hover:text-brand-green"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => remove(l)} aria-label={`Delete load ${l.loadNumber}`} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
              {loads.length > 0 && (
                <tfoot><tr className="font-bold"><td colSpan={6} className="py-3 px-3 text-right">Total Cash In</td><td className="py-3 px-3 font-numbers">{money(totals)}</td><td colSpan={2} /></tr></tfoot>
              )}
            </table>
          </div>
        )}
      </Panel>

      {editing !== undefined && (
        <Modal title={editing ? `Edit load #${editing.loadNumber}` : 'New load'} onClose={() => setEditing(undefined)} wide>
          <form onSubmit={save} className="space-y-3">
            <ErrorBanner message={formError} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Load number *"><input required className={field} value={f.loadNumber} onChange={(e) => setF({ ...f, loadNumber: e.target.value })} /></Field>
              <Field label="Date *"><input required type="date" className={field} value={f.loadDate} onChange={(e) => setF({ ...f, loadDate: e.target.value })} /></Field>
            </div>
            <Field label="Broker / company *"><input required className={field} value={f.broker} onChange={(e) => setF({ ...f, broker: e.target.value })} /></Field>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2"><Field label="Pick up"><input className={field} value={f.pickupLocation} onChange={(e) => setF({ ...f, pickupLocation: e.target.value })} /></Field></div>
              <Field label="Time"><input type="time" className={field} value={f.pickupTime} onChange={(e) => setF({ ...f, pickupTime: e.target.value })} /></Field>
              <div className="col-span-2"><Field label="Drop off"><input className={field} value={f.dropoffLocation} onChange={(e) => setF({ ...f, dropoffLocation: e.target.value })} /></Field></div>
              <Field label="Time"><input type="time" className={field} value={f.dropoffTime} onChange={(e) => setF({ ...f, dropoffTime: e.target.value })} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Driver">
                <select className={field} value={f.driverId} onChange={(e) => setF({ ...f, driverId: e.target.value })}>
                  <option value="">Unassigned</option>
                  {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </Field>
              <Field label="Truck">
                <select className={field} value={f.truckId} onChange={(e) => setF({ ...f, truckId: e.target.value })}>
                  <option value="">None</option>
                  {trucks.map((t) => <option key={t.id} value={t.id}>#{t.truckNumber}</option>)}
                </select>
              </Field>
              <Field label="Cash In (USD)"><input type="number" min="0" step="0.01" className={field} value={f.cash} onChange={(e) => setF({ ...f, cash: e.target.value })} /></Field>
              <Field label="Paid by">
                <select className={field} value={f.payMethod} onChange={(e) => setF({ ...f, payMethod: e.target.value })}>
                  <option value="ach">ACH</option>
                  <option value="wire">Wire</option>
                </select>
              </Field>
            </div>
            {editing && (
              <Field label="Status">
                <select className={field} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
                  {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </Field>
            )}
            <button type="submit" disabled={saving} className={`${primaryButton} w-full justify-center`}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create load'}</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
