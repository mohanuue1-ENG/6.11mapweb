import React, { useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, Check, CheckCircle2, Loader2, Truck } from 'lucide-react';
import { api, errorMessage } from '../../services/api';
import { money } from '../../services/format';
import AuthShell from '../../components/layout/AuthShell';
import { clearDraft, readDraft } from '../../services/signupDraft';

const input =
  'w-full h-11 rounded-xl border border-line bg-surface text-ink placeholder:text-mute px-4 text-sm focus:outline-none focus:border-brand-green focus:ring-2 focus:ring-brand-green/25 transition';

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

function Steps({ step }) {
  const items = ['Account', 'Company', 'Plan', 'Payment'];
  return (
    <ol className="flex items-center gap-2 mb-6 text-xs font-semibold">
      {items.map((label, i) => (
        <li key={label} className="flex items-center gap-2">
          <span className={`w-6 h-6 rounded-full inline-flex items-center justify-center ${i <= step ? 'bg-brand-green text-[#052E16]' : 'bg-surface-2 text-mute border border-line'}`}>
            {i < step ? <Check className="w-3.5 h-3.5" /> : i + 1}
          </span>
          <span className={i <= step ? 'text-ink' : 'text-mute'}>{label}</span>
          {i < items.length - 1 && <span className="w-4 h-px bg-line" />}
        </li>
      ))}
    </ol>
  );
}

// "Join us", shown after "Create account": company details -> choose a plan -> pay. The account is created automatically
// when the payment is confirmed. If no plan is published yet, the form falls back to a plain
// request that the platform admin reviews.
export default function RequestAccess() {
  const [params] = useSearchParams();
  const [step, setStep] = useState(0);
  const draft = readDraft();
  const [f, setF] = useState({ companyName: '', phone: '', dotNumber: '', mcNumber: '', address: '' });
  const [plans, setPlans] = useState(null);
  const [planId, setPlanId] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState('');
  const set = (key) => (e) => setF({ ...f, [key]: e.target.value });

  useEffect(() => {
    api('/plans', { auth: false })
      .then((r) => {
        setPlans(r.plans);
        if (r.plans[0]) setPlanId(r.plans[0].id);
      })
      .catch(() => setPlans([]));
  }, []);

  const body = (withPlan) => {
    const b = { companyName: f.companyName, contactName: draft.name, email: draft.email, password: draft.password };
    for (const k of ['phone', 'mcNumber', 'address']) if (f[k].trim()) b[k] = f[k];
    if (f.dotNumber.trim()) b.dotNumber = f.dotNumber.toUpperCase();
    if (withPlan) b.planId = planId;
    return b;
  };

  const next = (e) => {
    e.preventDefault();
    setErrorMsg('');
    setStep(1);
  };

  const submit = async () => {
    if (submitting) return;
    setErrorMsg('');
    setSubmitting(true);
    try {
      if (plans?.length) {
        const res = await api('/registration-requests', { method: 'POST', auth: false, body: body(true) });
        setStep(2);
        window.location.href = res.checkoutUrl; // the payment page
        return;
      }
      await api('/registration-requests', { method: 'POST', auth: false, body: body(false) });
      setSentTo(draft.email);
      clearDraft();
    } catch (err) {
      setErrorMsg(errorMessage(err, 'We could not continue. Please try again.'));
      setStep(plans?.length ? 1 : 0);
    } finally {
      setSubmitting(false);
    }
  };

  // "Join us" only follows "Create account".
  if (!draft && !sentTo) return <Navigate to="/create-account" replace />;

  if (sentTo) {
    return (
      <AuthShell title="Request received">
        <div className="space-y-5 text-sm">
          <div className="flex items-start gap-3 p-4 rounded-2xl border border-brand-green/40 bg-brand-green/10">
            <CheckCircle2 className="w-5 h-5 text-accent mt-0.5 shrink-0" />
            <p>Thank you. We will review your request. Once your company is approved you can sign in with <span className="font-semibold">{sentTo}</span> and the password you chose.</p>
          </div>
          <Link to="/" className="inline-flex h-11 items-center px-5 rounded-xl border border-line font-semibold hover:border-brand-green transition-colors">Back to the website</Link>
        </div>
      </AuthShell>
    );
  }

  const canceled = params.get('canceled') === '1';
  const hasPlans = !!plans?.length;

  return (
    <AuthShell
      title="Join us"
      subtitle={hasPlans || plans === null ? 'Your account is ready to go. Now set up your company.' : 'Tell us about your company and we will get back to you.'}
      footer={<>Already a customer? <Link to="/login" className="text-accent font-semibold hover:underline">Sign in</Link></>}
    >
      {hasPlans && <Steps step={step + 1} />}
      <div className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface-2 px-4 py-3 text-sm">
        <div className="min-w-0">
          <div className="font-semibold truncate">{draft.name}</div>
          <div className="text-xs text-mute truncate">{draft.email}</div>
        </div>
        <Link to="/create-account" className="text-xs font-semibold text-accent hover:underline shrink-0">Change</Link>
      </div>
      {canceled && step === 0 && (
        <div role="status" className="mb-5 p-3 rounded-xl bg-status-amber/10 border border-status-amber/30 text-sm">The payment was cancelled. You can try again whenever you are ready.</div>
      )}
      {errorMsg && (
        <div role="alert" className="mb-5 p-3 rounded-xl bg-status-red/10 border border-status-red/30 text-status-red text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{errorMsg}{errorMsg.includes('already has an account') && <> <Link to="/login" className="font-semibold underline">Sign in</Link></>}</span>
        </div>
      )}

      {step === 0 && (
        <form onSubmit={hasPlans ? next : (e) => { e.preventDefault(); submit(); }} className="space-y-4">
          <Field id="ra-company" label="Company name">
            <input id="ra-company" required className={input} value={f.companyName} onChange={set('companyName')} autoComplete="organization" />
          </Field>
          <Field id="ra-phone" label="Phone" hint="optional"><input id="ra-phone" type="tel" className={input} value={f.phone} onChange={set('phone')} autoComplete="tel" /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field id="ra-dot" label="USDOT number" hint="optional"><input id="ra-dot" className={`${input} uppercase`} value={f.dotNumber} onChange={set('dotNumber')} /></Field>
            <Field id="ra-mc" label="MC number" hint="optional"><input id="ra-mc" className={`${input} uppercase`} value={f.mcNumber} onChange={set('mcNumber')} /></Field>
          </div>
          <button type="submit" disabled={submitting || plans === null} className="w-full h-12 rounded-xl bg-brand-green text-[#052E16] font-semibold hover:bg-brand-green-hover transition-colors flex items-center justify-center gap-2 shadow-lg shadow-brand-green/20 disabled:opacity-60">
            {submitting ? (<><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>) : hasPlans ? 'Continue' : 'Send request'}
          </button>
        </form>
      )}

      {step >= 1 && hasPlans && (
        <div className="space-y-4">
          <div role="radiogroup" aria-label="Plan" className="space-y-3">
            {plans.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={planId === p.id}
                onClick={() => setPlanId(p.id)}
                className={`w-full text-left p-4 rounded-2xl border-2 transition-colors ${planId === p.id ? 'border-brand-green bg-brand-green/10' : 'border-line bg-surface hover:border-brand-green/50'}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-bold">{p.name}</span>
                  <span className="font-extrabold">{money(p.priceCents)}<span className="text-xs text-mute font-medium"> / month</span></span>
                </div>
                {p.description && <p className="text-xs text-mute mt-1">{p.description}</p>}
                <p className="text-xs text-mute mt-2 flex items-center gap-1.5"><Truck className="w-3.5 h-3.5" /> {p.truckLimit == null ? 'Unlimited trucks' : `Up to ${p.truckLimit} trucks`}</p>
              </button>
            ))}
          </div>
          <p className="text-xs text-mute">You pay securely by card on the next page. Your dashboard opens as soon as the payment is confirmed.</p>
          <div className="flex gap-3">
            <button type="button" onClick={() => setStep(0)} disabled={submitting} className="h-12 px-5 rounded-xl border border-line font-semibold hover:border-brand-green transition-colors">Back</button>
            <button type="button" onClick={submit} disabled={submitting || !planId} className="flex-1 h-12 rounded-xl bg-brand-green text-[#052E16] font-semibold hover:bg-brand-green-hover transition-colors flex items-center justify-center gap-2 shadow-lg shadow-brand-green/20 disabled:opacity-60">
              {submitting ? (<><Loader2 className="w-4 h-4 animate-spin" /> Opening payment…</>) : 'Continue to payment'}
            </button>
          </div>
        </div>
      )}
    </AuthShell>
  );
}
