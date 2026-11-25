import React, { useEffect, useState } from 'react';
import { CreditCard, Loader2 } from 'lucide-react';
import { api, errorMessage } from '../../services/api';

const DAY = 86400000;
const GRACE_DAYS = 7;

const two = (n) => String(n).padStart(2, '0');
function parts(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

// Shown to the owner of a company when the plan is about to renew (the last 7 days) or when the last payment failed.
// It counts down, and one button opens the page where the card is updated.
export default function PaymentBanner() {
  const [sub, setSub] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    api('/subscriptions/current')
      .then((r) => live && setSub(r.subscription))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!sub?.currentPeriodEnd) return null;
  const end = new Date(sub.currentPeriodEnd).getTime();
  const failed = sub.status === 'past_due';
  // Failed payment: the dashboard stays open for 7 days after the period ended. Otherwise: the last 7 days before the renewal.
  const target = failed ? end + GRACE_DAYS * DAY : end;
  const left = target - now;
  if (!failed && left > GRACE_DAYS * DAY) return null;
  if (left <= 0 && !failed) return null;

  const t = parts(left);
  const urgent = failed || left < 2 * DAY;

  const update = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await api('/billing/portal', { method: 'POST', body: {} });
      window.location.assign(r.url);
    } catch (err) {
      setError(errorMessage(err, 'We could not open the payment page. Please try again.'));
      setBusy(false);
    }
  };

  return (
    <div
      role="status"
      className={`no-3d mb-4 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm ${urgent ? 'border-red-500/50 bg-red-500/10' : 'border-brand-amber/60 bg-brand-amber/10'}`}
    >
      <CreditCard className={`w-5 h-5 shrink-0 ${urgent ? 'text-red-500' : 'text-brand-amber'}`} aria-hidden="true" />
      <div className="flex-1 min-w-[12rem]">
        <p className="font-semibold">{failed ? 'Your last payment did not go through.' : 'Your plan renews soon.'}</p>
        <p className="text-mute">
          {failed ? 'Update your payment to keep your dashboard.' : 'Make sure your card is up to date.'}{' '}
          {left > 0 && (
            <span className="font-mono font-bold text-ink tabular-nums" aria-label={`${t.d} days ${t.h} hours ${t.m} minutes left`}>
              {t.d}d {two(t.h)}h {two(t.m)}m {two(t.s)}s
            </span>
          )}
        </p>
        {error && <p role="alert" className="mt-1 text-red-500">{error}</p>}
      </div>
      <button
        type="button"
        onClick={update}
        disabled={busy}
        className="no-3d h-10 px-4 inline-flex items-center gap-2 rounded-lg bg-brand-green text-[#052E16] font-semibold hover:bg-brand-green-hover disabled:opacity-60"
      >
        {busy && <Loader2 className="w-4 h-4 animate-spin" />} Update payment
      </button>
    </div>
  );
}
