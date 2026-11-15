import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react';
import { api, errorMessage } from '../../services/api';
import AuthShell from '../../components/layout/AuthShell';

const input =
  'w-full h-12 rounded-xl border border-line bg-surface text-ink placeholder:text-mute px-4 pr-12 text-sm focus:outline-none focus:border-brand-green focus:ring-2 focus:ring-brand-green/25 transition';

// Opened from the invitation email: the administrator chooses their own password.
export default function SetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';
  const isReset = params.get('type') === 'reset';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setErrorMsg('');
    if (password.length < 8) return setErrorMsg('Password must be at least 8 characters.');
    if (password !== confirm) return setErrorMsg('The two passwords do not match.');
    setSubmitting(true);
    try {
      await api('/auth/set-password', { method: 'POST', auth: false, body: { token, password } });
      setDone(true);
    } catch (err) {
      setErrorMsg(errorMessage(err, 'Could not set your password. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <AuthShell title="Link not valid">
        <p className="text-sm text-mute">This page needs the link from your invitation email. Open that email and use the link again, or go to <Link to="/login" className="text-accent font-semibold hover:underline">sign in</Link>.</p>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell title="Password set">
        <div className="space-y-5 text-sm">
          <div className="flex items-start gap-3 p-4 rounded-2xl border border-brand-green/40 bg-brand-green/10">
            <CheckCircle2 className="w-5 h-5 text-accent mt-0.5 shrink-0" />
            <p>Your password is saved. You can sign in now.</p>
          </div>
          <button onClick={() => navigate('/login', { replace: true })} className="h-12 w-full rounded-xl bg-brand-green text-[#052E16] font-semibold hover:bg-brand-green-hover transition-colors">
            Go to sign in
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={isReset ? 'Choose a new password' : 'Choose your password'}
      subtitle={isReset ? 'Enter a new password for your account.' : 'Your company is ready. Set a password to finish.'}
    >
      {errorMsg && (
        <div role="alert" className="mb-5 p-3 rounded-xl bg-status-red/10 border border-status-red/30 text-status-red text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
      <form onSubmit={submit} className="space-y-5">
        <div>
          <label htmlFor="sp-password" className="block text-sm font-medium mb-1.5">New password <span className="text-mute font-normal">(at least 8 characters)</span></label>
          <div className="relative">
            <input id="sp-password" type={show ? 'text' : 'password'} required minLength={8} autoComplete="new-password" className={input} value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-3 top-3 p-1 text-mute hover:text-ink">
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <div>
          <label htmlFor="sp-confirm" className="block text-sm font-medium mb-1.5">Repeat password</label>
          <input id="sp-confirm" type={show ? 'text' : 'password'} required autoComplete="new-password" className={input} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        <button type="submit" disabled={submitting} className="w-full h-12 rounded-xl bg-brand-green text-[#052E16] font-semibold hover:bg-brand-green-hover transition-colors flex items-center justify-center gap-2 shadow-lg shadow-brand-green/20 disabled:opacity-60">
          {submitting ? (<><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>) : 'Save password'}
        </button>
      </form>
    </AuthShell>
  );
}
