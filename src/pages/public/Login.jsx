import CodeInput from '../../components/common/CodeInput';
import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { AlertCircle, Loader2, Lock, Mail } from 'lucide-react';
import PasswordField from '../../components/common/PasswordField';
import GoogleButton from '../../components/common/GoogleButton';
import { sounds } from '../../utils/sound';
import { useAuth, homePathFor } from '../../context/AuthContext';
import { errorMessage } from '../../services/api';
import AuthShell from '../../components/layout/AuthShell';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, verifyLogin, loginWithGoogle } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Set when the password was right and a code was emailed: { challengeId, hint, devCode }.
  const [challenge, setChallenge] = useState(null);
  const [code, setCode] = useState('');
  const [remember, setRemember] = useState(true);

  const finish = (user) => {
    const home = homePathFor(user.role);
    // Return to the page that sent the user here, if it belongs to their role.
    const from = location.state?.from;
    navigate(from && from.startsWith(`/${home.split('/')[1]}`) ? from : home, { replace: true });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setErrorMsg('');
    setSubmitting(true);
    try {
      const res = await login(email.trim().toLowerCase(), password);
      if (res.verification) {
        setChallenge(res.verification);
        setCode('');
        setSubmitting(false);
        return;
      }
      finish(res);
    } catch (err) {
      setErrorMsg(errorMessage(err, 'Sign in failed. Please try again.'));
      sounds.error();
      setSubmitting(false);
    }
  };

  const onGoogle = async (credential) => {
    setErrorMsg('');
    try {
      const res = await loginWithGoogle(credential);
      if (res.newUser) {
        // Not an account yet: carry on to "Create account" with the Google name and email filled in.
        navigate('/create-account', { state: { google: { email: res.email, name: res.name } } });
        return;
      }
      finish(res);
    } catch (err) {
      setErrorMsg(errorMessage(err, 'Google sign-in did not work. Try again, or use your email.'));
      sounds.error();
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setErrorMsg('');
    setSubmitting(true);
    try {
      finish(await verifyLogin(email.trim().toLowerCase(), challenge.challengeId, code, remember));
    } catch (err) {
      setErrorMsg(errorMessage(err, 'That code did not work. Check it and try again.'));
      setSubmitting(false);
    }
  };

  const backToPassword = () => {
    setChallenge(null);
    setCode('');
    setPassword('');
    setErrorMsg('');
  };

  const input =
    'w-full h-12 rounded-lg border border-line bg-surface text-ink placeholder:text-mute pl-11 pr-4 text-sm focus:outline-none focus:border-brand-green focus:ring-2 focus:ring-brand-green/25 transition';

  return (
    <AuthShell
      title={challenge ? 'Check your email' : 'Sign in'}
      subtitle={challenge ? `We sent a 6-digit code to ${challenge.hint}. Enter it to finish signing in.` : 'Welcome back. Enter your details to open your dashboard.'}
      footer={
        <div className="space-y-3 pt-6 border-t border-line">
          <p>New to 6.11 TruckOS?</p>
          <Link
            to="/create-account"
            className="flex h-12 w-full items-center justify-center rounded-lg border-2 border-brand-green text-accent font-semibold hover:bg-brand-green/10 transition-colors"
          >
            Create account
          </Link>
        </div>
      }
    >
      {errorMsg && (
        <div key={errorMsg} role="alert" className="anim-shake mb-5 p-3 rounded-xl bg-status-red/10 border border-status-red/30 text-status-red text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {challenge && (
        <form onSubmit={handleVerify} className="slide-from-right space-y-5">
          {challenge.devCode && (
            <p className="p-3 rounded-xl bg-status-amber/10 border border-status-amber/30 text-sm">Test mode: your code is <strong>{challenge.devCode}</strong></p>
          )}
          <div>
            <label htmlFor="login-code" className="block text-sm font-medium mb-1.5">6-digit code</label>
            <CodeInput id="login-code" value={code} onChange={setCode} autoFocus />
          </div>
          <label className="flex items-center gap-2 text-sm text-mute">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="rounded border-line" />
            Remember this browser for 30 days
          </label>
          <button
            type="submit"
            disabled={submitting || code.length !== 6}
            className="w-full h-12 rounded-lg bg-brand-green text-[#052E16] font-semibold hover:bg-brand-green-hover transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Checking…
              </>
            ) : (
              'Confirm and sign in'
            )}
          </button>
          <button type="button" onClick={backToPassword} className="w-full text-sm font-semibold text-accent hover:underline">
            Back
          </button>
        </form>
      )}

      {!challenge && <GoogleButton onCredential={onGoogle} oneTap />}

      {!challenge && (
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="login-email" className="block text-sm font-medium mb-1.5">Email</label>
          <div className="relative">
            <Mail className="w-4 h-4 absolute left-4 top-4 text-mute" />
            <input id="login-email" type="email" required autoFocus autoComplete="username" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
          </div>
        </div>

        <PasswordField
          id="login-password"
          label="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          show={show}
          onToggle={() => setShow(!show)}
          autoComplete="current-password"
          placeholder="Your password"
          eyes
          right={<Link to="/forgot-password" className="text-xs font-semibold text-accent hover:underline">Forgot password?</Link>}
        />

        <button
          type="submit"
          disabled={submitting}
          className="w-full h-12 rounded-lg bg-brand-green text-[#052E16] font-semibold hover:bg-brand-green-hover transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Signing in…
            </>
          ) : (
            'Sign in'
          )}
        </button>
      </form>
      )}
    </AuthShell>
  );
}
