import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, Eye, EyeOff, Lock, Mail, User } from 'lucide-react';
import AuthShell from '../../components/layout/AuthShell';
import { readDraft, saveDraft } from '../../services/signupDraft';

const input =
  'w-full h-12 rounded-xl border border-line bg-surface text-ink placeholder:text-mute pl-11 pr-4 text-sm focus:outline-none focus:border-brand-green focus:ring-2 focus:ring-brand-green/25 transition';

// Step 1 of getting started: the person creates their account. "Join us" (company, plan, payment)
// is shown only after this.
export default function CreateAccount() {
  const navigate = useNavigate();
  const existing = readDraft();
  const [name, setName] = useState(existing?.name || '');
  const [email, setEmail] = useState(existing?.email || '');
  const [password, setPassword] = useState(existing?.password || '');
  const [confirm, setConfirm] = useState(existing?.password || '');
  const [show, setShow] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const submit = (e) => {
    e.preventDefault();
    setErrorMsg('');
    if (password.length < 8) return setErrorMsg('Password must be at least 8 characters.');
    if (new TextEncoder().encode(password).length > 72) return setErrorMsg('Password is too long (72 characters at most).');
    if (password !== confirm) return setErrorMsg('The two passwords do not match.');
    saveDraft({ name: name.trim(), email: email.trim().toLowerCase(), password });
    navigate('/join');
  };

  return (
    <AuthShell
      title="Create your account"
      subtitle="Start here. Next you will set up your company."
      footer={<>Already have an account? <Link to="/login" className="text-accent font-semibold hover:underline">Sign in</Link></>}
    >
      {errorMsg && (
        <div role="alert" className="mb-5 p-3 rounded-xl bg-status-red/10 border border-status-red/30 text-status-red text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
      <form onSubmit={submit} className="space-y-5">
        <div>
          <label htmlFor="ca-name" className="block text-sm font-medium mb-1.5">Your name</label>
          <div className="relative">
            <User className="w-4 h-4 text-mute absolute left-4 top-4" />
            <input id="ca-name" required className={input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </div>
        </div>
        <div>
          <label htmlFor="ca-email" className="block text-sm font-medium mb-1.5">Email</label>
          <div className="relative">
            <Mail className="w-4 h-4 text-mute absolute left-4 top-4" />
            <input id="ca-email" type="email" required className={input} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@company.com" />
          </div>
        </div>
        <div>
          <label htmlFor="ca-password" className="block text-sm font-medium mb-1.5">Password <span className="text-mute font-normal">(at least 8 characters)</span></label>
          <div className="relative">
            <Lock className="w-4 h-4 text-mute absolute left-4 top-4" />
            <input id="ca-password" type={show ? 'text' : 'password'} required minLength={8} className={`${input} pr-12`} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-3 top-3 p-1 text-mute hover:text-ink">
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <div>
          <label htmlFor="ca-confirm" className="block text-sm font-medium mb-1.5">Repeat password</label>
          <div className="relative">
            <Lock className="w-4 h-4 text-mute absolute left-4 top-4" />
            <input id="ca-confirm" type={show ? 'text' : 'password'} required className={input} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          </div>
        </div>
        <button type="submit" className="w-full h-12 rounded-xl bg-brand-green text-[#052E16] font-semibold hover:bg-brand-green-hover transition-colors shadow-lg shadow-brand-green/20">
          Create account
        </button>
        <p className="text-xs text-mute text-center">You will sign in with this email and password once your company is set up.</p>
      </form>
    </AuthShell>
  );
}
