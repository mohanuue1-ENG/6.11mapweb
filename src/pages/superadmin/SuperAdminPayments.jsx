import React, { useCallback, useEffect, useState } from 'react';
import { DollarSign, PlusCircle } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { api, errorMessage } from '../../services/api';
import { dateTime, money } from '../../services/format';
import { ErrorBanner, Field, Modal, PageHeader, Panel, Spinner, primaryButton, useFieldClass } from '../../components/common/ui';

function RecordModal({ companies, onClose, onSaved }) {
  const field = useFieldClass();
  const [f, setF] = useState({ companyId: companies[0]?.id || '', amount: '', status: 'succeeded', reference: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    const amount = Number(f.amount);
    if (!Number.isFinite(amount) || amount < 0) return setError('Enter a valid amount.');
    setSaving(true);
    try {
      await api('/admin/payments', {
        method: 'POST',
        body: { companyId: f.companyId, amountCents: Math.round(amount * 100), status: f.status, providerReference: f.reference || null },
      });
      onSaved();
    } catch (err) {
      setError(errorMessage(err, 'Could not record the payment.'));
      setSaving(false);
    }
  };

  return (
    <Modal title="Record a payment" onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <ErrorBanner message={error} />
        <p className="text-[11px] text-gray-400">Payments are recorded by hand until an online payment provider is chosen.</p>
        <Field label="Company">
          <select className={field} value={f.companyId} onChange={(e) => setF({ ...f, companyId: e.target.value })}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount (USD)"><input required type="number" min="0" step="0.01" className={field} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
          <Field label="Status">
            <select className={field} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
              {['succeeded', 'pending', 'failed', 'refunded'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Reference (invoice, transfer…)"><input className={field} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-xs rounded-xl border border-white/10 text-gray-400 hover:text-white">Cancel</button>
          <button type="submit" disabled={saving || !f.companyId} className={primaryButton}>{saving ? 'Saving…' : 'Record payment'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function SuperAdminPayments() {
  const { isDark } = useTheme();
  const [payments, setPayments] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([api('/admin/payments'), api('/admin/companies')]);
      setPayments(p.payments);
      setCompanies(c.companies);
      setError('');
    } catch (err) {
      setError(errorMessage(err, 'Could not load payments.'));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const muted = isDark ? 'text-gray-400' : 'text-gray-500';
  return (
    <div className="space-y-6 pb-12 font-sans">
      <PageHeader icon={DollarSign} title="Payments" subtitle="Payments recorded for company subscriptions">
        <button onClick={() => setOpen(true)} disabled={!companies.length} className={primaryButton}><PlusCircle className="w-4 h-4" /> Record payment</button>
      </PageHeader>
      <ErrorBanner message={error} />
      <Panel className="p-0 overflow-hidden">
        {!payments && !error ? <Spinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className={`border-b text-[11px] uppercase tracking-wider ${isDark ? 'border-white/10 bg-white/[0.02] text-gray-400' : 'border-gray-200 bg-gray-50 text-gray-600'}`}>
                  {['Date', 'Company', 'Amount', 'Status', 'Reference'].map((h) => <th key={h} className="py-3.5 px-4 font-semibold">{h}</th>)}
                </tr>
              </thead>
              <tbody className={`divide-y font-numbers ${isDark ? 'divide-white/5' : 'divide-gray-100'}`}>
                {payments?.length === 0 && <tr><td colSpan={5} className={`py-10 text-center ${muted}`}>No payments recorded yet.</td></tr>}
                {payments?.map((p) => (
                  <tr key={p.id}>
                    <td className="py-3.5 px-4">{dateTime(p.paidAt || p.createdAt)}</td>
                    <td className="py-3.5 px-4 font-semibold">{p.companyName}</td>
                    <td className="py-3.5 px-4">{money(p.amountCents)}</td>
                    <td className="py-3.5 px-4 capitalize">{p.status}</td>
                    <td className={`py-3.5 px-4 ${muted}`}>{p.providerReference || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {open && <RecordModal companies={companies} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); load(); }} />}
    </div>
  );
}
