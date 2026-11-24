import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, Loader2, Truck } from 'lucide-react';
import { api, errorMessage } from '../../services/api';
import { money } from '../../services/format';
import { useAuth } from '../../context/AuthContext';
import BillingSwitch, { bestDiscount, priceFor } from '../../components/common/BillingSwitch';
import AuthShell from '../../components/layout/AuthShell';

// Shown to a company that has its account but has not paid yet: choose a plan and pay. The dashboard opens as soon as the
// payment is confirmed.
export default function Subscribe() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [plans, setPlans] = useState(null);
  const [planId, setPlanId] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [paying, setPaying] = useState(false);
  const [interval, setInterval] = useState('month');

  useEffect(() => {
    api('/plans', { auth: false })
      .then((r) => {
        setPlans(r.plans);
        if (r.plans[0]) setPlanId(r.plans[0].id);
      })
      .catch(() => setPlans([]));
  }, []);

  const pay = async () => {
    if (paying || !planId) return;
    setErrorMsg('');
    setPaying(true);
    try {
      const res = await api('/payments/checkout', { method: 'POST', body: { planId, interval } });
      window.location.href = res.checkoutUrl; // the payment page
    } catch (err) {
      setErrorMsg(errorMessage(err, 'We could not start the payment. Please try again.'));
      setPaying(false);
    }
  };

  const signOut = async () => {
    await logout();
    navigate('/');
  };

  return (
    <AuthShell
      title="Choose your plan"
      subtitle={`Welcome${user?.name ? `, ${user.name}` : ''}. To use the service, choose a plan. After you pay we ask about your company, and your dashboard opens.`}
      footer={
        <>
          Signed in as {user?.email}.{' '}
          <button type="button" onClick={signOut} className="text-accent font-semibold hover:underline">Sign out</button>
        </>
      }
    >
      {params.get('canceled') === '1' && (
        <div role="status" className="mb-5 p-3 rounded-xl bg-status-amber/10 border border-status-amber/30 text-sm">The payment was cancelled. You can try again whenever you are ready.</div>
      )}
      {errorMsg && (
        <div role="alert" className="anim-shake mb-5 p-3 rounded-xl bg-status-red/10 border border-status-red/30 text-status-red text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
      {plans === null && <p className="flex items-center gap-3 text-sm text-mute"><Loader2 className="w-4 h-4 animate-spin" /> Loading plans…</p>}
      {plans && plans.length === 0 && <p className="text-sm text-mute">No plan is available right now. Please try again later, or contact us.</p>}
      {plans && plans.length > 0 && (
        <div className="space-y-4">
          {bestDiscount(plans) > 0 && <div className="flex justify-center"><BillingSwitch value={interval} onChange={setInterval} discount={bestDiscount(plans)} /></div>}
          <div role="radiogroup" aria-label="Plan" className="space-y-3">
            {plans.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={planId === p.id}
                onClick={() => setPlanId(p.id)}
                className={`w-full text-left p-4 rounded-xl border-2 transition-colors ${planId === p.id ? 'border-brand-green bg-brand-green/10' : 'border-line bg-surface hover:border-brand-green/50'}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-bold">{p.name}</span>
                  <span className="font-extrabold">{money(priceFor(p, interval).cents)}<span className="text-xs text-mute font-medium"> / {priceFor(p, interval).per}</span></span>
                </div>
                {p.description && <p className="text-xs text-mute mt-1">{p.description}</p>}
                {interval === 'year' && priceFor(p, interval).percent > 0 && <p className="text-xs font-semibold text-accent mt-1">Save {priceFor(p, interval).percent}% ({money(priceFor(p, interval).savedCents)} a year)</p>}
                <p className="text-xs text-mute mt-2 flex items-center gap-1.5"><Truck className="w-3.5 h-3.5" /> {p.truckLimit == null ? 'Unlimited trucks' : `Up to ${p.truckLimit} trucks`}</p>
              </button>
            ))}
          </div>
          <p className="text-xs text-mute">You pay securely by card on the next page.</p>
          <button type="button" onClick={pay} disabled={paying || !planId} className="w-full h-12 rounded-lg bg-brand-green text-[#052E16] font-semibold hover:bg-brand-green-hover transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
            {paying ? (<><Loader2 className="w-4 h-4 animate-spin" /> Opening payment…</>) : 'Pay and open my dashboard'}
          </button>
          <p className="text-xs text-mute text-center">Questions? <Link to="/contact" className="text-link font-semibold hover:underline">Contact us</Link></p>
        </div>
      )}
    </AuthShell>
  );
}
