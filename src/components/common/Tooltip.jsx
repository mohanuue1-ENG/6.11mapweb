import React, { cloneElement, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// A tooltip with a "skip delay": the first one waits a moment (so tooltips do not flash while the pointer passes by),
// but once one has shown, moving to the next one shows it at once, until the pointer has rested for a while.
let lastClosed = 0;
const WAIT = 380;
const WARM = 450;

export default function Tooltip({ label, side = 'right', disabled = false, children }) {
  const [box, setBox] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const show = (e) => {
    if (disabled || !label) return;
    const target = e.currentTarget;
    const open = () => {
      const r = target.getBoundingClientRect();
      setBox(side === 'right' ? { x: r.right + 10, y: r.top + r.height / 2 } : { x: r.left + r.width / 2, y: r.bottom + 8 });
    };
    clearTimeout(timer.current);
    if (Date.now() - lastClosed < WARM) open();
    else timer.current = setTimeout(open, WAIT);
  };
  const hide = () => {
    clearTimeout(timer.current);
    if (box) lastClosed = Date.now();
    setBox(null);
  };

  return (
    <>
      {cloneElement(children, { onMouseEnter: show, onMouseLeave: hide, onFocus: show, onBlur: hide })}
      {box &&
        createPortal(
          <span
            role="tooltip"
            className="anim-pop pointer-events-none fixed z-[10001] px-2.5 py-1 rounded-lg bg-[#111827] text-white text-xs font-semibold shadow-lg whitespace-nowrap"
            style={side === 'right' ? { left: box.x, top: box.y, transform: 'translateY(-50%)' } : { left: box.x, top: box.y, transform: 'translateX(-50%)' }}
          >
            {label}
          </span>,
          document.body
        )}
    </>
  );
}
