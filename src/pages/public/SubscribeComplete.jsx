import React, { useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { api } from '../../services/api';
import { useAuth, homePathFor } from '../../context/AuthContext';
import AuthShell from '../../components/layout/AuthShell';

// Where the payment page sends the customer back. The payment is confirmed by the provider, which can take a few
// seconds, so this page asks until it is, then opens the dashboard.
export default function SubscribeComplete() {
  const [params] = useSearchParams();
  const { user, markSubscribed } = useAuth();
  const session = params.get('session') || '';
  const [status, setStatus] = useState(session ? 'awaiting_payment' : 'unknown');

  useEffect(() => {
    if (!session) return undefined;
    let tries = 0;
    let timer;
    const check = async () => {
      try {
        const r = await api(`/signup/status?session=${encodeURIComponent(session)}`, { auth: false });
        setStatus(r.status);
        if (r.status === 'paid') markSubscribed();
        else if (r.status === 'awaiting_payment' && tries++ < 45) timer = setTimeout(check, 2000);
      } catch {
        setStatus('unknown');
      }
    };
    check();
    return () => clearTimeout(timer);
  }, [session, markSubscribed]);

  if (status === 'paid' && user?.subscribed) return <Navigate to={homePathFor(user.role)} replace />;

  if (status === 'paid') {
    return (
      <AuthShell title="Payment confirmed">
        <p role="status" className="flex items-center gap-3 text-sm"><CheckCircle2 className="w-5 h-5 text-accent" /> Opening your dashboard…</p>
      </AuthShell>
    );
  }
  if (status === 'awaiting_payment') {
    return (
      <AuthShell title="Confirming your payment">
        <p role="status" className="flex items-center gap-3 text-sm text-mute"><Loader2 className="w-5 h-5 animate-spin" /> This takes a few seconds. Please keep this page open.</p>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="We could not find this payment">
      <div className="space-y-4 text-sm text-mute">
        <p>If you paid, your dashboard will open as soon as the payment is confirmed. You can also try again.</p>
        <Link to="/subscribe" className="inline-flex h-11 items-center px-5 rounded-lg border border-line text-ink font-semibold hover:border-brand-green transition-colors">Back to the plans</Link>
      </div>
    </AuthShell>
  );
}
