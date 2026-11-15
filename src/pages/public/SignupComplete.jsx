import React, { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { api } from '../../services/api';
import { clearDraft } from '../../services/signupDraft';
import AuthShell from '../../components/layout/AuthShell';

// Where the payment page sends the customer back. The account is created by the payment
// provider's confirmation, which can arrive a few seconds after the redirect, so this page asks
// until it exists.
export default function SignupComplete() {
  const [params] = useSearchParams();
  const location = useLocation();
  const session = params.get('session') || '';
  const [status, setStatus] = useState(session ? 'awaiting_payment' : 'unknown');
  const [passwordChosen, setPasswordChosen] = useState(false);

  useEffect(() => {
    if (!session) return undefined;
    let tries = 0;
    let timer;
    const check = async () => {
      try {
        const r = await api(`/signup/status?session=${encodeURIComponent(session)}`, { auth: false });
        setStatus(r.status);
        setPasswordChosen(Boolean(r.passwordChosen));
        if (r.status === 'paid') clearDraft();
        if (r.status === 'awaiting_payment' && tries++ < 40) timer = setTimeout(check, 2000);
      } catch {
        setStatus('unknown');
      }
    };
    check();
    return () => clearTimeout(timer);
  }, [session]);

  // Only present in local development without email: lets the flow be tried end to end.
  const devLink = location.state?.devInviteUrl;

  if (status === 'paid') {
    return (
      <AuthShell title="Payment confirmed">
        <div className="space-y-5 text-sm">
          <div className="flex items-start gap-3 p-4 rounded-2xl border border-brand-green/40 bg-brand-green/10">
            <CheckCircle2 className="w-5 h-5 text-accent mt-0.5 shrink-0" />
            <p>
              Thank you. Your company is ready.{' '}
              {passwordChosen
                ? 'Sign in with the email and password you chose to open your dashboard.'
                : devLink
                ? 'Choose your password to open your dashboard.'
                : 'We emailed you a link to choose your password; after that you can sign in to your dashboard.'}
            </p>
          </div>
          {devLink && !passwordChosen && (
            <a href={devLink} className="flex h-12 w-full items-center justify-center rounded-xl bg-brand-green text-[#052E16] font-semibold hover:bg-brand-green-hover transition-colors">
              Choose your password (development: no email is configured)
            </a>
          )}
          <Link to="/login" className={passwordChosen ? 'flex h-12 w-full items-center justify-center rounded-xl bg-brand-green text-[#052E16] font-semibold hover:bg-brand-green-hover transition-colors' : 'inline-flex h-11 items-center px-5 rounded-xl border border-line font-semibold hover:border-brand-green transition-colors'}>{passwordChosen ? 'Sign in' : 'Go to sign in'}</Link>
        </div>
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
        <p>If you paid, your account will still be created and you will receive an email. Otherwise you can start again.</p>
        <Link to="/create-account" className="inline-flex h-11 items-center px-5 rounded-xl border border-line text-ink font-semibold hover:border-brand-green transition-colors">Start again</Link>
      </div>
    </AuthShell>
  );
}
