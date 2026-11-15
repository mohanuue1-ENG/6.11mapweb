import { useEffect, useRef } from 'react';

// Closes a menu, dropdown or drawer by itself while it is open:
//  - when the page is scrolled a little (so it never stays stuck over the content),
//  - when the person taps or clicks anywhere outside it (only if `insideRefs` are given),
//  - when Escape is pressed.
// `onClose` may change on every render; the latest one is always used.
export function useAutoClose(open, onClose, { insideRefs = [], scrollThreshold = 10 } = {}) {
  const close = useRef(onClose);
  close.current = onClose;
  const refs = useRef(insideRefs);
  refs.current = insideRefs;

  useEffect(() => {
    if (!open) return undefined;
    const startY = window.scrollY;
    const startX = window.scrollX;
    const onScroll = () => {
      if (Math.abs(window.scrollY - startY) > scrollThreshold || Math.abs(window.scrollX - startX) > scrollThreshold) close.current();
    };
    const onPointerDown = (e) => {
      if (!refs.current.length) return;
      const inside = refs.current.some((r) => r.current && r.current.contains(e.target));
      if (!inside) close.current();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close.current();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, scrollThreshold]);
}
