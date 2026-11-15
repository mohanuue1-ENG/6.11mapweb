import React, { useCallback, useEffect, useState } from 'react';
import { CreditCard, Edit2, PlusCircle } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { api, errorMessage } from '../../services/api';
import { money } from '../../services/format';
import { ErrorBanner, Field, Modal, PageHeader, Panel, Spinner, primaryButton, useFieldClass } from '../../components/common/ui';

const EMPTY = { name: '', description: '', price: '', truckLimit: '', isInternalOnly: false, isActive: true };

function PlanForm({ plan, onClose, onSaved }) {
  const field = useFieldClass();
  const [f, setF] = useState(
    plan
      ? { name: plan.name, description: plan.description || '', price: (plan.priceCents / 100).toString(), truckLimit: plan.truckLimit ?? '', isInternalOnly: plan.isInternalOnly, isActive: plan.isActive }
      : EMPTY,
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    const price = Number(f.price);
    if (!Number.isFinite(price) || price < 0) return setError('Enter a valid monthly price (0 or more).');
    setSaving(true);
    setError('');
    const body = {
      name: f.name,
      description: f.description || null,
      priceCents: Math.round(price * 100),
      truckLimit: f.truckLimit === '' ? null : Number(f.truckLimit),
      isInternalOnly: f.isInternalOnly,
      isActive: f.isActive,
    };
    try {
      await api(plan ? `/admin/plans/${plan.id}` : '/admin/plans', { method: plan ? 'PATCH' : 'POST', body });
      onSaved();
    } catch (err) {
      setError(errorMessage(err, 'Could not save the plan.'));
      setSaving(false);
    }
  };

  return (
    <Modal title={plan ? `Edit ${plan.name}` : 'New plan'} onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <ErrorBanner message={error} />
        <Field label="Name *"><input required className={field} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Description"><input className={field} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Monthly price (USD) *"><input required type="number" min="0" step="0.01" className={field} value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></Field>
          <Field label="Truck limit (empty = unlimited)"><input type="number" min="1" className={field} value={f.truckLimit} onChange={(e) => setF({ ...f, truckLimit: e.target.value })} /></Field>
        </div>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" className="accent-brand-green" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} /> Active (can be chosen)</label>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" className="accent-brand-green" checked={f.isInternalOnly} onChange={(e) => setF({ ...f, isInternalOnly: e.target.checked })} /> Internal company only (hidden from the pricing page)</label>
        {plan && <p className="text-[11px] text-gray-400">Changing price or limit affects new subscriptions only. Companies already on this plan keep what they agreed to.</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 text-xs rounded-xl border border-white/10 text-gray-400 hover:text-white">Cancel</button>
          <button type="submit" disabled={saving} className={primaryButton}>{saving ? 'Saving…' : 'Save plan'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function SuperAdminPlans() {
  const { isDark } = useTheme();
  const [plans, setPlans] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(undefined); // undefined = closed, null = new, object = edit

  const load = useCallback(async () => {
    try {
      setPlans((await api('/admin/plans')).plans);
      setError('');
    } catch (err) {
      setError(errorMessage(err, 'Could not load plans.'));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (p) => {
    try {
      await api(`/admin/plans/${p.id}`, { method: 'PATCH', body: { isActive: !p.isActive } });
      await load();
    } catch (err) {
      setError(errorMessage(err, 'Could not update the plan.'));
    }
  };

  const muted = isDark ? 'text-gray-400' : 'text-gray-500';
  return (
    <div className="space-y-6 pb-12 font-sans">
      <PageHeader icon={CreditCard} title="Plans" subtitle="Monthly plans and their truck limits. Assign a plan to a company under Companies.">
        <button onClick={() => setEditing(null)} className={primaryButton}><PlusCircle className="w-4 h-4" /> New plan</button>
      </PageHeader>
      <ErrorBanner message={error} />
      <Panel className="p-0 overflow-hidden">
        {!plans && !error ? <Spinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className={`border-b text-[11px] uppercase tracking-wider ${isDark ? 'border-white/10 bg-white/[0.02] text-gray-400' : 'border-gray-200 bg-gray-50 text-gray-600'}`}>
                  {['Plan', 'Price', 'Truck limit', 'Visibility', 'Status', ''].map((h) => <th key={h} className="py-3.5 px-4 font-semibold">{h}</th>)}
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? 'divide-white/5' : 'divide-gray-100'}`}>
                {plans?.length === 0 && <tr><td colSpan={6} className={`py-10 text-center ${muted}`}>No plans yet. Prices are not set until you create them.</td></tr>}
                {plans?.map((p) => (
                  <tr key={p.id} className={p.isActive ? '' : 'opacity-60'}>
                    <td className="py-3.5 px-4"><div className="font-bold">{p.name}</div><div className={muted}>{p.description || '—'}</div></td>
                    <td className="py-3.5 px-4 font-numbers">{money(p.priceCents)}/mo</td>
                    <td className="py-3.5 px-4 font-numbers">{p.truckLimit ?? 'Unlimited'}</td>
                    <td className="py-3.5 px-4">{p.isInternalOnly ? 'Internal only' : 'Public'}</td>
                    <td className="py-3.5 px-4">
                      <button onClick={() => toggle(p)} className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${p.isActive ? 'bg-brand-green/15 text-brand-green' : 'bg-gray-500/20 text-gray-400'}`}>
                        {p.isActive ? 'Active' : 'Off'}
                      </button>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button onClick={() => setEditing(p)} aria-label={`Edit ${p.name}`} className="p-1.5 rounded-lg border border-white/10 text-gray-400 hover:text-brand-green"><Edit2 className="w-3.5 h-3.5" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {editing !== undefined && <PlanForm plan={editing} onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); load(); }} />}
    </div>
  );
}
