import React, { useRef } from 'react';

// A code typed or pasted into one box per digit (6). One hidden-looking real input keeps paste, autofill and the phone's
// "one-time code" suggestion working; the boxes only show what was typed.
export default function CodeInput({ id, value, onChange, length = 6, autoFocus = false }) {
  const ref = useRef(null);
  const cells = Array.from({ length }, (_, i) => value[i] ?? '');
  const active = Math.min(value.length, length - 1);
  return (
    <div className="relative" onClick={() => ref.current?.focus()}>
      <div className="flex justify-between gap-2" aria-hidden="true">
        {cells.map((c, i) => (
          <div
            key={i}
            className={`flex-1 h-14 rounded-xl grid place-items-center text-2xl font-bold border bg-surface-2 ${i === active && document.activeElement === ref.current ? 'border-brand-green ring-2 ring-brand-green/30' : 'border-line'}`}
          >
            {c}
          </div>
        ))}
      </div>
      <input
        ref={ref}
        id={id}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        required
        autoFocus={autoFocus}
        aria-label={`${length}-digit code`}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, length))}
        className="absolute inset-0 w-full h-full opacity-0 cursor-text"
      />
    </div>
  );
}
