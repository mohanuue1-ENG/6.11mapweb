import { useEffect, useRef, useState } from 'react';

// A number that counts to its value instead of jumping: it starts at the old value (0 the first time) and
// eases out over about half a second, so a change is seen as a change.
export default function useCountUp(target, ms = 600) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const end = Number(target);
    if (!Number.isFinite(end)) {
      setShown(target);
      return undefined;
    }
    const start = from.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now) => {
      const u = Math.min(1, (now - t0) / ms);
      const e = 1 - Math.pow(1 - u, 3);
      setShown(Math.round(start + (end - start) * e));
      if (u < 1) raf = requestAnimationFrame(tick);
      else from.current = end;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return shown;
}
