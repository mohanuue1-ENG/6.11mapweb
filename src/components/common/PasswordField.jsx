import React, { useId, useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { sounds } from '../../utils/sound';

// A pair of eyes that react to the password: open and looking at the field while you type, looking away
// (lids half down) while the password is hidden, wide open when it is shown. A small touch of character.
export function PasswordEyes({ shown, length = 0, active = false }) {
  const open = shown ? 9 : active ? 5.5 : 3;
  const dx = Math.max(-1, Math.min(1, (length - 6) / 10)) * 3;
  const dy = shown ? 2.5 : 1.5;
  const eye = (cx) => (
    <g key={cx} className="eye-blink">
      <ellipse cx={cx} cy="11" rx="9.5" ry={open} fill="var(--surface-main)" stroke="currentColor" strokeWidth="1.6" style={{ transition: 'ry 220ms var(--ease-out)' }} />
      <circle cx={cx + dx} cy={11 + dy} r="3.6" fill="currentColor" style={{ transition: 'cx 200ms var(--ease-out), cy 200ms var(--ease-out), opacity 200ms ease' }} opacity={open < 4 ? 0.0 : 1} />
    </g>
  );
  return (
    <svg width="48" height="22" viewBox="0 0 48 22" aria-hidden="true" className="text-mute shrink-0">
      {eye(13)}
      {eye(35)}
    </svg>
  );
}

// One password input: a clear outline, a frosted (privacy glass) look while the password is hidden, a monospace
// face while it is shown, and a show / hide button whose two icons swap with a soft blur.
export default function PasswordField({ id, label, value, onChange, show, onToggle, autoComplete, placeholder, invalid = false, valid = false, hint, eyes = false, right = null, autoFocus = false, required = true, name }) {
  const auto = useId();
  const inputId = id || auto;
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1.5 min-h-[22px]">
        <label htmlFor={inputId} className="block text-sm font-medium">{label}</label>
        <div className="flex items-center gap-3">
          {right}
          {eyes && <PasswordEyes shown={show} length={value.length} active={focused} />}
        </div>
      </div>
      <div className="glass-field" data-hidden={!show} data-invalid={invalid} data-valid={valid}>
        <Lock className="w-4 h-4 text-mute absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          id={inputId}
          name={name}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          required={required}
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          placeholder={placeholder}
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          aria-invalid={invalid || undefined}
          className={`pw-input ${show ? 'pw-mono' : ''}`}
        />
        <button
          type="button"
          onClick={() => {
            onToggle();
            (show ? sounds.hide : sounds.show)();
          }}
          aria-label={show ? 'Hide password' : 'Show password'}
          aria-pressed={show}
          className="hit absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 inline-flex items-center justify-center rounded-md text-mute hover:text-ink"
        >
          <EyeOff className="swap-icon w-4 h-4" data-on={show ? 'true' : 'false'} />
          <Eye className="swap-icon w-4 h-4" data-on={show ? 'false' : 'true'} />
        </button>
      </div>
      {hint && <p className="text-xs text-mute mt-1.5" aria-live="polite">{hint}</p>}
    </div>
  );
}
