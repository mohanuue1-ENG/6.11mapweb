import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import GoogleButton from '../../components/common/GoogleButton';
import { useAuth, homePathFor } from '../../context/AuthContext';
import { AlertCircle, Mail, User } from 'lucide-react';
import PasswordCreate from '../../components/common/PasswordCreate';
import { assess } from '../../utils/passwordPolicy';
import { sounds } from '../../utils/sound';
import AuthShell from '../../components/layout/AuthShell';
import { readDraft, saveDraft } from '../../services/signupDraft';

const input =
  'w-full h-12 rounded-lg border border-line bg-surface text-ink placeholder:text-mute pl-11 pr-4 text-sm focus:outline-none focus:border-brand-green focus:ring-2 focus:ring-brand-green/25 transition';

// Step 1 of getting started: the person creates their account. "Join us" (company, plan, payment)
// is shown only after this.
export default function CreateAccount() {
  const navigate = useNavigate();
  const location = useLocation();
  const { loginWithGoogle } = useAuth();
  const existing = readDraft();
  // Set when the person chose "Continue with Google": name and email come from Google, and no password is needed.
  const [google, setGoogle] = useState(location.state?.google || null);
  const [name, setName] = useState(location.state?.google?.name || existing?.name || '');
  const [email, setEmail] = useState(location.state?.google?.email || existing?.email || '');
  const [password, setPassword] = useState(existing?.password || '');
  const [confirm, setConfirm] = useState(existing?.password || '');
  const [errorMsg, setErrorMsg] = useState('');

  const onGoogle = async (credential) => {
    setErrorMsg('');
    try {
      const res = await loginWithGoogle(credential);
      if (res.newUser) {
        setGoogle({ email: res.email, name: res.name });
        setName(res.name || name);
        setEmail(res.email);
        return;
      }
      navigate(homePathFor(res.role), { replace: true }); // this Google address already has an account
    } catch (err) {
      setErrorMsg(err?.message || 'Google sign-in did not work. Try again, or use your email.');
    }
  };

  const submit = (e) => {
    e.preventDefault();
    setErrorMsg('');
    if (google) {
      saveDraft({ name: name.trim(), email: google.email.toLowerCase() });
      navigate('/join');
      return;
    }
    const verdict = assess(password, { email });
    if (!verdict.ok) {
      sounds.error();
      return setErrorMsg(verdict.label ? `${verdict.label}. ${verdict.message}` : verdict.message);
    }
    if (password !== confirm) {
      sounds.error();
      return setErrorMsg('The two passwords do not match.');
    }
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
      {!google && <GoogleButton onCredential={onGoogle} />}
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
            <input id="ca-email" type="email" required readOnly={!!google} className={input} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@company.com" />
          </div>
        </div>
        {google ? (
          <p className="text-sm text-mute rounded-lg border border-line bg-surface p-3">
            You are using your Google account, so you will not need a password. Next you set up your company.
          </p>
        ) : (
          <PasswordCreate password={password} setPassword={setPassword} confirm={confirm} setConfirm={setConfirm} email={email} />
        )}
        <button type="submit" className="w-full h-12 rounded-lg bg-brand-green text-[#052E16] font-semibold hover:bg-brand-green-hover transition-colors">
          Create account
        </button>
        <p className="text-xs text-mute text-center">You will sign in with this email and password once your company is set up.</p>
      </form>
    </AuthShell>
  );
}
