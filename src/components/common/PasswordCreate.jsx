import React, { useEffect, useRef, useState } from 'react';
import { Check, Volume2, VolumeX, Wand2 } from 'lucide-react';
import PasswordField from './PasswordField';
import { RULES, assess, suggestPassword } from '../../utils/passwordPolicy';
import { isMuted, setMuted, sounds } from '../../utils/sound';

const LEVEL_COLOR = ['transparent', 'oklch(0.63 0.22 27)', 'oklch(0.77 0.16 75)', 'oklch(0.72 0.19 150)', 'oklch(0.62 0.18 150)'];

// Creating a password: the rules tick as they are met, a meter and a plain sentence say how good it is, the second
// field says whether it matches, and one button offers a strong password to use.
export default function PasswordCreate({ password, setPassword, confirm, setConfirm, email = '', label = 'Password', autoFocus = false }) {
  const [show, setShow] = useState(false);
  const [quiet, setQuiet] = useState(isMuted());
  const a = assess(password, { email });
  const prev = useRef({ met: 0, level: 0, match: false });
  const match = confirm.length > 0 && confirm === password;
  const prefix = confirm.length > 0 && !match && password.startsWith(confirm);

  useEffect(() => {
    const met = RULES.filter((r) => r.test(password)).length;
    if (met > prev.current.met) sounds.rule();
    if (a.level >= 3 && prev.current.level < 3) sounds.strong();
    prev.current.met = met;
    prev.current.level = a.level;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [password]);
  useEffect(() => {
    if (match && !prev.current.match) sounds.match();
    prev.current.match = match;
  }, [match]);

  const suggest = () => {
    const s = suggestPassword();
    setPassword(s);
    setConfirm(s);
    setShow(true);
    sounds.suggest();
  };
  const toggleSound = () => {
    setMuted(!quiet);
    setQuiet(!quiet);
    if (quiet) sounds.show();
  };

  return (
    <div className="space-y-4">
      <PasswordField
        id="pw-new"
        label={label}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        show={show}
        onToggle={() => setShow(!show)}
        autoComplete="new-password"
        invalid={password.length > 0 && !a.ok && a.level === 1}
        valid={a.ok}
        autoFocus={autoFocus}
        eyes
        right={
          <button type="button" onClick={toggleSound} aria-label={quiet ? 'Turn sounds on' : 'Turn sounds off'} aria-pressed={!quiet} className="hit text-mute hover:text-ink">
            {quiet ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        }
      />

      <div aria-live="polite">
        <div className="flex gap-1.5" role="meter" aria-label="Password strength" aria-valuemin={0} aria-valuemax={4} aria-valuenow={a.level}>
          {[1, 2, 3, 4].map((n) => (
            <span key={n} className="h-1.5 flex-1 rounded-sm" style={{ background: a.level >= n ? LEVEL_COLOR[a.level] : 'var(--glass-border)', transition: 'background-color 300ms var(--ease-out)' }} />
          ))}
        </div>
        <p className="text-xs mt-1.5 min-h-[2.2em]" style={{ color: password ? (a.level <= 1 ? 'oklch(0.55 0.21 27)' : 'var(--text-secondary)') : 'var(--text-secondary)' }}>
          {a.label && <strong className="font-semibold" style={{ color: LEVEL_COLOR[a.level] === 'transparent' ? undefined : a.level >= 3 ? 'var(--accent-text)' : LEVEL_COLOR[a.level] }}>{a.label}. </strong>}
          {a.message}
        </p>
      </div>

      <ul className="flex flex-wrap gap-1.5" aria-label="Password rules">
        {RULES.map((r) => {
          const ok = r.test(password);
          return (
            <li
              key={r.id}
              title={r.label}
              className="inline-flex items-center gap-1 h-6 px-2 rounded-md text-[11px] font-semibold border"
              style={{ color: ok ? 'oklch(0.3 0.08 150)' : 'var(--text-secondary)', borderColor: ok ? 'oklch(0.72 0.19 150)' : 'var(--glass-border)', background: ok ? 'oklch(0.72 0.19 150 / 0.22)' : 'transparent', transition: 'background-color 200ms var(--ease-out), border-color 200ms ease, color 200ms ease, transform 260ms var(--ease-spring)', transform: ok ? 'scale(1.06)' : 'scale(1)' }}
            >
              {ok && <Check className="w-3 h-3" strokeWidth={3} />}
              <span className="sr-only">{ok ? 'Done: ' : 'Needed: '}{r.label}</span>
              <span aria-hidden="true">{r.short}</span>
            </li>
          );
        })}
      </ul>

      <button type="button" onClick={suggest} className="hit inline-flex items-center gap-2 text-sm font-semibold text-link hover:underline">
        <Wand2 className="w-4 h-4" /> Suggest a strong password
      </button>

      <PasswordField
        id="pw-confirm"
        label="Repeat password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        show={show}
        onToggle={() => setShow(!show)}
        autoComplete="new-password"
        invalid={confirm.length > 0 && !match && !prefix}
        valid={match}
        hint={confirm.length === 0 ? '' : match ? 'The two passwords match.' : prefix ? 'Keep typing…' : 'The two passwords are different.'}
      />
    </div>
  );
}
