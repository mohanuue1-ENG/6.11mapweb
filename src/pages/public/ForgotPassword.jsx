import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Loader2, Mail } from 'lucide-react';
import { api, errorMessage } from '../../services/api';
import AuthShell from '../../components/layout/AuthShell';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setErrorMsg('');
    setSubmitting(true);
    try {
      await api('/auth/forgot-password', { method: 'POST', auth: false, body: { email } });
      setSent(true);
    } catch (err) {
      setErrorMsg(errorMessage(err, 'We could not send the request. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <AuthShell title="Check your email">
        <div className="space-y-5 text-sm">
          <div className="flex items-start gap-3 p-4 rounded-2xl border border-brand-green/40 bg-brand-green/10">
            <CheckCircle2 className="w-5 h-5 text-accent mt-0.5 shrink-0" />
            <p>If an account exists for <span className="font-semibold">{email}</span>, we have sent a link to choose a new password. It works once and expires in 1 hour.</p>
          </div>
          <Link to="/login" className="inline-flex h-11 items-center px-5 rounded-xl border border-line font-semibold hover:border-brand-green transition-colors">Back to sign in</Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Forgot your password?"
      subtitle="Enter your email and we will send you a link to choose a new one."
      footer={<Link to="/login" className="text-accent font-semibold hover:underline">Back to sign in</Link>}
    >
      {errorMsg && (
        <div role="alert" className="mb-5 p-3 rounded-xl bg-status-red/10 border border-status-red/30 text-status-red text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
      <form onSubmit={submit} className="space-y-5">
        <div>
          <label htmlFor="fp-email" className="block text-sm font-medium mb-1.5">Email</label>
          <div className="relative">
            <Mail className="w-4 h-4 absolute left-4 top-4 text-mute" />
            <input
              id="fp-email"
              type="email"
              required
              autoComplete="username"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-12 rounded-xl border border-line bg-surface text-ink placeholder:text-mute pl-11 pr-4 text-sm focus:outline-none focus:border-brand-green focus:ring-2 focus:ring-brand-green/25 transition"
            />
          </div>
        </div>
        <button type="submit" disabled={submitting} className="w-full h-12 rounded-xl bg-brand-green text-[#052E16] font-semibold hover:bg-brand-green-hover transition-colors flex items-center justify-center gap-2 shadow-lg shadow-brand-green/20 disabled:opacity-60">
          {submitting ? (<><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>) : 'Send reset link'}
        </button>
      </form>
    </AuthShell>
  );
}
