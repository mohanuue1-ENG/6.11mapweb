import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { api, errorMessage } from '../../services/api';
import { useAuth, homePathFor } from '../../context/AuthContext';
import AuthShell from '../../components/layout/AuthShell';

const input =
  'w-full h-11 rounded-lg border border-line bg-surface text-ink placeholder:text-mute px-4 text-sm focus:outline-none focus:border-brand-green focus:ring-2 focus:ring-brand-green/25 transition';

function Field({ id, label, hint, children }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium mb-1.5">
        {label} {hint && <span className="text-mute font-normal">({hint})</span>}
      </label>
      {children}
    </div>
  );
}

// Right after the first payment: tell us about the company. Then the dashboard opens.
export default function CompanySetup() {
  const navigate = useNavigate();
  const { user, markSetupDone } = useAuth();
  const [f, setF] = useState({ name: '', phone: '', dotNumber: '', mcNumber: '', address: '' });
  const [errorMsg, setErrorMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setErrorMsg('');
    setSaving(true);
    try {
      const body = { name: f.name.trim() };
      if (f.phone.trim()) body.contactPhone = f.phone.trim();
      if (f.dotNumber.trim()) body.dotNumber = f.dotNumber.trim();
      if (f.mcNumber.trim()) body.mcNumber = f.mcNumber.trim();
      if (f.address.trim()) body.address = f.address.trim();
      const res = await api('/companies/me/setup', { method: 'POST', body });
      markSetupDone(res.company);
      navigate(homePathFor('COMPANY_ADMIN'), { replace: true });
    } catch (err) {
      setErrorMsg(errorMessage(err, 'We could not save this. Please try again.'));
      setSaving(false);
    }
  };

  return (
    <AuthShell title="Tell us about your company" subtitle="Your payment is confirmed. One last step, then your dashboard opens.">
      <div className="mb-5 flex items-start gap-3 p-3 rounded-xl border border-brand-green/40 bg-brand-green/10 text-sm">
        <CheckCircle2 className="w-5 h-5 text-accent mt-0.5 shrink-0" />
        <span>Payment received{user?.name ? `, thank you ${user.name}` : ''}.</span>
      </div>
      {errorMsg && (
        <div key={errorMsg} role="alert" className="anim-shake mb-5 p-3 rounded-xl bg-status-red/10 border border-status-red/30 text-status-red text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
      <form onSubmit={submit} className="space-y-4">
        <Field id="cs-name" label="Company name">
          <input id="cs-name" required minLength={2} className={input} value={f.name} onChange={set('name')} autoComplete="organization" autoFocus />
        </Field>
        <Field id="cs-phone" label="Phone" hint="optional">
          <input id="cs-phone" type="tel" className={input} value={f.phone} onChange={set('phone')} autoComplete="tel" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field id="cs-dot" label="USDOT number" hint="optional"><input id="cs-dot" className={`${input} uppercase`} value={f.dotNumber} onChange={set('dotNumber')} /></Field>
          <Field id="cs-mc" label="MC number" hint="optional"><input id="cs-mc" className={`${input} uppercase`} value={f.mcNumber} onChange={set('mcNumber')} /></Field>
        </div>
        <Field id="cs-address" label="Address" hint="optional">
          <input id="cs-address" className={input} value={f.address} onChange={set('address')} autoComplete="street-address" />
        </Field>
        <button type="submit" disabled={saving} className="w-full h-12 rounded-lg bg-brand-green text-[#052E16] font-semibold hover:bg-brand-green-hover transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
          {saving ? (<><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>) : 'Open my dashboard'}
        </button>
      </form>
    </AuthShell>
  );
}
