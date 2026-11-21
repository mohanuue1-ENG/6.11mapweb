import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { AlertCircle, Eye, EyeOff, Loader2, Lock, Mail } from 'lucide-react';
import { useAuth, homePathFor } from '../../context/AuthContext';
import { errorMessage } from '../../services/api';
import AuthShell from '../../components/layout/AuthShell';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setErrorMsg('');
    setSubmitting(true);
    try {
      const user = await login(email, password);
      const home = homePathFor(user.role);
      // Return to the page that sent the user here, if it belongs to their role.
      const from = location.state?.from;
      navigate(from && from.startsWith(`/${home.split('/')[1]}`) ? from : home, { replace: true });
    } catch (err) {
      setErrorMsg(errorMessage(err, 'Sign in failed. Please try again.'));
      setSubmitting(false);
    }
  };

  const input =
    'w-full h-12 rounded-xl border border-line bg-surface text-ink placeholder:text-mute pl-11 pr-4 text-sm focus:outline-none focus:border-brand-green focus:ring-2 focus:ring-brand-green/25 transition';

  return (
    <AuthShell
      title="Sign in"
      subtitle="Welcome back. Enter your details to open your dashboard."
      footer={
        <div className="space-y-3 pt-6 border-t border-line">
          <p>New to 6.11 BIS?</p>
          <Link
            to="/create-account"
            className="flex h-12 w-full items-center justify-center rounded-xl border-2 border-brand-green text-accent font-semibold hover:bg-brand-green/10 transition-colors"
          >
            Create account
          </Link>
        </div>
      }
    >
      {errorMsg && (
        <div role="alert" className="mb-5 p-3 rounded-xl bg-status-red/10 border border-status-red/30 text-status-red text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="login-email" className="block text-sm font-medium mb-1.5">Email</label>
          <div className="relative">
            <Mail className="w-4 h-4 absolute left-4 top-4 text-mute" />
            <input id="login-email" type="email" required autoComplete="username" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="login-password" className="block text-sm font-medium">Password</label>
            <Link to="/forgot-password" className="text-xs font-semibold text-accent hover:underline">Forgot password?</Link>
          </div>
          <div className="relative">
            <Lock className="w-4 h-4 absolute left-4 top-4 text-mute" />
            <input
              id="login-password"
              type={show ? 'text' : 'password'}
              required
              autoComplete="current-password"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${input} pr-12`}
            />
            <button
              type="button"
              onClick={() => setShow(!show)}
              aria-label={show ? 'Hide password' : 'Show password'}
              className="absolute right-3 top-3 p-1 text-mute hover:text-ink"
            >
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full h-12 rounded-xl bg-brand-green text-[#052E16] font-semibold hover:bg-brand-green-hover transition-colors flex items-center justify-center gap-2 shadow-lg shadow-brand-green/20 disabled:opacity-60 disabled:cursor-not-allowed"
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
    </AuthShell>
  );
}
