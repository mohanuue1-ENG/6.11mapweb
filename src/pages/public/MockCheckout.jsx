import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, FlaskConical, Loader2 } from 'lucide-react';
import { api, errorMessage } from '../../services/api';
import { money } from '../../services/format';
import AuthShell from '../../components/layout/AuthShell';

// A stand-in for the card payment page, used ONLY in local development when no payment
// provider is configured. The server refuses to complete it in any other setup.
export default function MockCheckout() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const session = params.get('session') || '';
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    api(`/signup/status?session=${encodeURIComponent(session)}`, { auth: false })
      .then((r) => (r.provider === 'mock' ? setInfo(r) : setError('This test checkout is not available.')))
      .catch(() => setError('This test checkout is not available.'));
  }, [session]);

  const pay = async () => {
    setPaying(true);
    setError('');
    try {
      await api('/signup/mock/complete', { method: 'POST', auth: false, body: { session } });
      navigate(`/subscribe/complete?session=${encodeURIComponent(session)}`);
    } catch (err) {
      setError(errorMessage(err, 'The test payment failed.'));
      setPaying(false);
    }
  };

  return (
    <AuthShell title="Test payment" subtitle="Development only. No money is taken.">
      <div className="space-y-5 text-sm">
        <div className="flex items-start gap-3 p-4 rounded-xl border border-status-amber/40 bg-status-amber/10">
          <FlaskConical className="w-5 h-5 mt-0.5 shrink-0" />
          <p>This stands in for the card page. With a Stripe key configured, customers pay on Stripe’s own page instead.</p>
        </div>
        {error && (
          <div role="alert" className="p-3 rounded-xl bg-status-red/10 border border-status-red/30 text-status-red flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> <span>{error}</span>
          </div>
        )}
        {info && (
          <>
            <div className="p-4 rounded-xl border border-line bg-surface flex items-center justify-between">
              <span className="font-bold">{info.planName}</span>
              <span className="font-extrabold">{money(info.amountCents)} <span className="text-xs text-mute font-medium">/ month</span></span>
            </div>
            <button onClick={pay} disabled={paying} className="w-full h-12 rounded-lg bg-brand-green text-[#052E16] font-semibold hover:bg-brand-green-hover transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
              {paying ? (<><Loader2 className="w-4 h-4 animate-spin" /> Paying…</>) : 'Pay (test)'}
            </button>
            <Link to="/subscribe?canceled=1" className="block text-center text-mute hover:text-ink">Cancel</Link>
          </>
        )}
      </div>
    </AuthShell>
  );
}
