import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { api, errorMessage } from '../../services/api';
import { dateTime, money } from '../../services/format';
import { Building2, ShieldCheck, Truck, Edit2, AlertCircle, CheckCircle2, Info } from 'lucide-react';

const FIELDS = [
  { key: 'name', label: 'Company Legal Name', required: true },
  { key: 'dotNumber', label: 'USDOT Number' },
  { key: 'mcNumber', label: 'Motor Carrier (MC) Number' },
  { key: 'email', label: 'Contact Email', type: 'email' },
  { key: 'phone', label: 'Contact Phone', type: 'tel' },
  { key: 'address', label: 'Headquarters Address' },
];

export default function CompanyProfile() {
  const { user, company, usage, updateCompany, reloadCompany } = useAuth();
  const { isDark } = useTheme();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [sub, setSub] = useState(null);
  const [payments, setPayments] = useState([]);

  // Usage changes whenever trucks are added elsewhere, so refresh on entry.
  useEffect(() => {
    reloadCompany().catch(() => {});
  }, [reloadCompany]);

  useEffect(() => {
    api('/subscriptions/current').then((r) => setSub(r.subscription)).catch(() => {});
    api('/payments').then((r) => setPayments(r.payments)).catch(() => {});
  }, []);

  const startEdit = () => {
    setForm(Object.fromEntries(FIELDS.map((f) => [f.key, company?.[f.key] || ''])));
    setError('');
    setSaved(false);
    setEditing(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      await updateCompany({
        name: form.name,
        dotNumber: form.dotNumber || null,
        mcNumber: form.mcNumber || null,
        contactEmail: form.email || null,
        contactPhone: form.phone || null,
        address: form.address || null,
      });
      setEditing(false);
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err, 'Could not save the company profile.'));
    } finally {
      setSaving(false);
    }
  };

  const card = `p-5 rounded-3xl border transition-colors ${
    isDark ? 'border-white/10 bg-dark-surface text-white' : 'border-gray-200 bg-white text-[#111827] shadow-sm'
  }`;
  const muted = isDark ? 'text-gray-400' : 'text-gray-500';
  const tile = `p-3.5 rounded-2xl border ${isDark ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-gray-50'}`;
  const inputClass = `w-full rounded-xl px-3 py-2 text-xs border focus:outline-none focus:border-brand-green ${
    isDark ? 'bg-dark-surface2 border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'
  }`;

  const limitText = usage?.truckLimit == null ? 'Unlimited' : usage.truckLimit;

  return (
    <div className="space-y-6 pb-12 font-sans">
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${card}`}>
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold flex items-center gap-2">
            <Building2 className="w-6 h-6 text-brand-green" />
            Company Profile & Subscription
          </h1>
          <p className={`text-xs mt-0.5 ${muted}`}>Company details • Fleet usage • Plan</p>
        </div>
        {!editing && (
          <button
            onClick={startEdit}
            className="px-4 py-2 text-xs font-bold rounded-lg bg-brand-green text-black hover:bg-brand-green-hover transition-all flex items-center gap-2 self-start"
          >
            <Edit2 className="w-4 h-4" /> Edit Profile
          </button>
        )}
      </div>

      {saved && (
        <div role="status" className="p-3 rounded-2xl bg-brand-green/10 border border-brand-green/30 text-brand-green text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" /> Company profile saved.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Company details */}
        <div className={`${card} space-y-4`}>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-brand-green/15 border border-brand-green/30 flex items-center justify-center text-brand-green font-bold text-lg shrink-0">
              6.11
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold truncate">{company?.name || user?.companyName}</h2>
              <span className="text-xs text-brand-green font-semibold">
                {company?.isInternal ? 'Internal Platform Member' : 'External Carrier'}
              </span>
            </div>
          </div>

          {editing ? (
            <form onSubmit={handleSave} className={`space-y-3 pt-3 border-t text-xs ${isDark ? 'border-white/10' : 'border-gray-200'}`}>
              {error && (
                <div role="alert" className="p-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-500 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              {FIELDS.map((f) => (
                <div key={f.key}>
                  <label htmlFor={`company-${f.key}`} className={`block mb-1 font-semibold ${muted}`}>
                    {f.label}
                    {f.required ? ' *' : ''}
                  </label>
                  <input
                    id={`company-${f.key}`}
                    type={f.type || 'text'}
                    required={!!f.required}
                    value={form[f.key] ?? ''}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    className={inputClass}
                  />
                </div>
              ))}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className={`px-4 py-2 rounded-xl border ${isDark ? 'border-white/10 text-gray-400 hover:text-white' : 'border-gray-200 text-gray-600 hover:text-gray-900'}`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-lg bg-brand-green text-black font-bold hover:bg-brand-green-hover disabled:opacity-60"
                >
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          ) : (
            <dl className={`space-y-2.5 pt-3 border-t text-xs ${isDark ? 'border-white/10' : 'border-gray-200'}`}>
              {FIELDS.filter((f) => f.key !== 'name').map((f) => (
                <div key={f.key}>
                  <dt className={`text-[10px] uppercase font-bold ${muted}`}>{f.label}</dt>
                  <dd className="font-semibold break-words">{company?.[f.key] || '—'}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        {/* Plan and usage */}
        <div className={`lg:col-span-2 ${card} space-y-5`}>
          <div>
            <span className={`text-xs uppercase tracking-wider block font-bold ${muted}`}>Subscription Plan</span>
            <h2 className="text-2xl font-black text-brand-green mt-1">
              {sub ? `${sub.plan.name} — ${money(sub.priceCents)} / ${sub.billingInterval === 'year' ? 'year' : 'month'}` : company?.isInternal ? 'Internal Fleet — $0 / month' : 'No plan yet'}
            </h2>
          </div>

          {company?.isInternal ? (
            <div className="p-4 rounded-2xl border border-brand-green/30 bg-brand-green/10 text-xs space-y-1">
              <span className="font-bold text-brand-green flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" /> Internal zero-fee status
              </span>
              <p className={`text-[11px] leading-relaxed ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                This is the internal company, with a $0 subscription configured by the platform administrator.
              </p>
            </div>
          ) : (
            !usage?.hasSubscription && (
              <div className={`p-4 rounded-2xl border text-xs flex items-start gap-2 ${isDark ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-gray-50'}`}>
                <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                <p className={`text-[11px] leading-relaxed ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                  No plan is attached to your company yet. Contact 6.11 to choose one; until then there is no truck limit.
                </p>
              </div>
            )
          )}

          {sub && (
            <p className={`text-xs ${muted}`}>
              Status: <span className="font-semibold capitalize">{sub.status.replace('_', ' ')}</span>
              {sub.currentPeriodEnd && ` · current period ends ${dateTime(sub.currentPeriodEnd)}`}
            </p>
          )}
          {payments.length > 0 && (
            <div className="text-xs space-y-1.5">
              <span className={`block text-[10px] font-bold uppercase ${muted}`}>Payments</span>
              {payments.slice(0, 5).map((p) => (
                <div key={p.id} className="flex justify-between font-numbers">
                  <span>{dateTime(p.paidAt || p.createdAt)}</span>
                  <span>{money(p.amountCents)} · {p.status}</span>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className={tile}>
              <span className={`flex items-center gap-1.5 text-[10px] font-bold uppercase ${muted}`}>
                <Truck className="w-3.5 h-3.5" /> Active trucks
              </span>
              <span className="text-xl font-bold mt-1 block font-numbers">
                {usage ? `${usage.activeTrucks} / ${limitText}` : '—'}
              </span>
            </div>
            <div className={tile}>
              <span className={`block text-[10px] font-bold uppercase ${muted}`}>Account status</span>
              <span className="text-xl font-bold text-brand-green mt-1 block capitalize">{company?.status || '—'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
