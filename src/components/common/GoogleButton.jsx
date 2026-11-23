import React, { useEffect, useRef } from 'react';

// "Continue with Google". It appears only when the website was built with VITE_GOOGLE_CLIENT_ID (the OAuth client id
// from Google Cloud Console). With oneTap, Google's own prompt also appears by itself for a person who is already
// signed in to Google in this browser: that is the automatic connection.
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
export const googleEnabled = Boolean(CLIENT_ID);

let scriptPromise = null;
function loadGoogle() {
  if (window.google && window.google.accounts && window.google.accounts.id) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.defer = true;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

export default function GoogleButton({ onCredential, text = 'continue_with', oneTap = false }) {
  const holder = useRef(null);
  const callback = useRef(onCredential);
  callback.current = onCredential;

  useEffect(() => {
    if (!googleEnabled) return undefined;
    let cancelled = false;
    loadGoogle()
      .then(() => {
        if (cancelled || !holder.current) return;
        const id = window.google.accounts.id;
        id.initialize({
          client_id: CLIENT_ID,
          callback: (r) => r?.credential && callback.current(r.credential),
          auto_select: oneTap,
          cancel_on_tap_outside: true,
          itp_support: true,
        });
        id.renderButton(holder.current, { theme: 'outline', size: 'large', text, shape: 'rectangular', logo_alignment: 'left', width: Math.min(400, holder.current.offsetWidth || 360) });
        if (oneTap) id.prompt();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      try {
        window.google?.accounts?.id?.cancel();
      } catch {
        /* ignore */
      }
    };
  }, [oneTap, text]);

  if (!googleEnabled) return null;
  return (
    <div className="mb-6">
      <div ref={holder} className="flex justify-center min-h-[44px]" />
      <div className="flex items-center gap-3 mt-5 text-xs text-mute" aria-hidden="true">
        <span className="flex-1 h-px bg-[var(--glass-border)]" />
        or use your email
        <span className="flex-1 h-px bg-[var(--glass-border)]" />
      </div>
    </div>
  );
}
