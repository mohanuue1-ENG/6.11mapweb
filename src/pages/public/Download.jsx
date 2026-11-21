import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Apple, Check, Copy, Download as DownloadIcon, MapPin, Smartphone } from 'lucide-react';

// Where the driver app is downloaded from. Nothing is invented: until a real file or store link exists
// the page says the app is being prepared.
//   VITE_ANDROID_APP_URL  a Play Store link, or a direct link to the .apk
//                         (default: /downloads/611-drive-gps.apk, a file you put in public/downloads/)
//   VITE_IOS_APP_URL      an App Store / TestFlight link
const ANDROID_URL = import.meta.env.VITE_ANDROID_APP_URL || '/downloads/611-drive-gps.apk';
const IOS_URL = import.meta.env.VITE_IOS_APP_URL || '';

// A single-page app answers every unknown address with the home page, so "the file exists" means the
// answer is not a web page.
function useFileAvailable(url) {
  const [ok, setOk] = useState(null);
  useEffect(() => {
    if (/^https?:\/\//i.test(url)) {
      setOk(true); // an outside link (a store): nothing to check from here
      return undefined;
    }
    let alive = true;
    fetch(url, { method: 'HEAD' })
      .then((r) => alive && setOk(r.ok && !(r.headers.get('content-type') || '').includes('text/html')))
      .catch(() => alive && setOk(false));
    return () => {
      alive = false;
    };
  }, [url]);
  return ok;
}

const STEPS = [
  'Tap Download on your phone and open the file when it finishes.',
  'If your phone asks, allow installs from this browser. This is normal for apps that do not come from the Play Store.',
  'Open 6.11 BIS and sign in with the email and password your company gave you.',
  'When asked about location, choose “Allow all the time”, so your trips are recorded with the screen off.',
];

export default function Download() {
  const androidReady = useFileAvailable(ANDROID_URL);
  const [copied, setCopied] = useState(false);
  const pageUrl = typeof window !== 'undefined' ? `${window.location.origin}/download` : '/download';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pageUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this link', pageUrl);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-20">
      <div className="max-w-2xl space-y-4">
        <span className="inline-flex items-center gap-2 text-xs font-semibold text-accent bg-brand-green/10 border border-brand-green/30 rounded-full px-3 py-1">
          <Smartphone className="w-3.5 h-3.5" /> For drivers
        </span>
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight">
          Get the driver app<span className="text-brand-green">.</span>
        </h1>
        <p className="text-lg text-mute">
          Drivers share their location and run their trips from the 6.11 BIS app on the phone they already carry. Your office sees it all on the dashboard.
        </p>
      </div>

      <div className="mt-10 grid md:grid-cols-2 gap-5">
        <section className="rounded-3xl border border-line bg-surface p-6 space-y-4">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-brand-green/15 text-accent inline-flex items-center justify-center"><Smartphone className="w-5 h-5" /></span>
            <div>
              <h2 className="font-bold">Android</h2>
              <p className="text-xs text-mute">Phones and tablets</p>
            </div>
          </div>
          {androidReady === true && (
            <a
              href={ANDROID_URL}
              {...(ANDROID_URL.endsWith('.apk') ? { download: '' } : {})}
              className="h-12 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-brand-green text-[#052E16] font-semibold hover:bg-brand-green-hover transition-colors shadow-lg shadow-brand-green/20"
            >
              <DownloadIcon className="w-4 h-4" /> Download for Android
            </a>
          )}
          {androidReady === false && (
            <p role="status" className="text-sm rounded-xl border border-line bg-surface-2 px-4 py-3 text-mute">
              The Android app is being prepared. It will be available to download here soon.
            </p>
          )}
          {androidReady === null && <div className="h-12 rounded-xl bg-surface-2 animate-pulse" aria-hidden="true" />}
        </section>

        <section className="rounded-3xl border border-line bg-surface p-6 space-y-4">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-brand-green/15 text-accent inline-flex items-center justify-center"><Apple className="w-5 h-5" /></span>
            <div>
              <h2 className="font-bold">iPhone</h2>
              <p className="text-xs text-mute">iOS</p>
            </div>
          </div>
          {IOS_URL ? (
            <a href={IOS_URL} className="h-12 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-brand-green text-[#052E16] font-semibold hover:bg-brand-green-hover transition-colors shadow-lg shadow-brand-green/20">
              <DownloadIcon className="w-4 h-4" /> Get it for iPhone
            </a>
          ) : (
            <p role="status" className="text-sm rounded-xl border border-line bg-surface-2 px-4 py-3 text-mute">The iPhone app is coming later.</p>
          )}
        </section>
      </div>

      <section className="mt-5 rounded-3xl border border-line bg-surface p-6">
        <h2 className="font-bold mb-4">How to install on Android</h2>
        <ol className="space-y-3">
          {STEPS.map((s, i) => (
            <li key={s} className="flex gap-3 text-sm">
              <span className="w-6 h-6 rounded-full bg-brand-green text-[#052E16] text-xs font-bold inline-flex items-center justify-center shrink-0">{i + 1}</span>
              <span className="text-mute leading-relaxed">{s}</span>
            </li>
          ))}
        </ol>
        <p className="mt-5 text-xs text-mute flex items-start gap-2">
          <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" /> Do not use the app while driving.
        </p>
      </section>

      <section className="mt-5 rounded-3xl border border-line bg-surface p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-bold">Sending this to your drivers?</h2>
          <p className="text-sm text-mute mt-1">Copy the link and send it by message. They also need the email and password you set up for them under Drivers.</p>
        </div>
        <button type="button" onClick={copy} className="h-11 px-5 inline-flex items-center justify-center gap-2 rounded-xl border border-line font-semibold hover:border-brand-green transition-colors shrink-0">
          {copied ? <><Check className="w-4 h-4 text-accent" /> Copied</> : <><Copy className="w-4 h-4" /> Copy link</>}
        </button>
      </section>

      <p className="mt-8 text-sm text-mute">
        Not a customer yet? <Link to="/create-account" className="text-accent font-semibold hover:underline">Create an account</Link>.
      </p>
    </div>
  );
}
