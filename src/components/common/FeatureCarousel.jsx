import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FEATURE_ART } from './FeatureArt';

// A ring of 3D picture cards, built for how each device is used:
// - Phones and tablets (touch): the page scrolls as normal. The ring is turned with a finger, left or right, and settles on a card when you let go.
// - Computers (mouse): scrolling the page turns the ring from the first card all the way round. A drag, a click on a side card or the arrow keys turn it too.
const RADIUS_DESKTOP = 640; // the ring: cards stand on a circle this wide
const RADIUS_TOUCH = 205; // a smaller ring on phones, so the cards beside the front one peek in and it reads as a circle
const SCROLL_PER_CARD = 0.6; // viewport heights of scrolling for each card (computers)
const PX_PER_CARD = 150; // finger or mouse travel that turns one card
const mod = (a, n) => ((a % n) + n) % n;

function useTouchDevice() {
  const q = '(hover: none), (pointer: coarse), (max-width: 767px)';
  const [touch, setTouch] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches);
  useEffect(() => {
    const m = window.matchMedia?.(q);
    if (!m) return undefined;
    const on = () => setTouch(m.matches);
    m.addEventListener?.('change', on);
    return () => m.removeEventListener?.('change', on);
  }, []);
  return touch;
}

export default function FeatureCarousel({ items }) {
  const n = items.length;
  const touch = useTouchDevice();
  const RADIUS = touch ? RADIUS_TOUCH : RADIUS_DESKTOP;
  const wrapRef = useRef(null);
  const [pos, setPos] = useState(0); // 0 .. n, may be a fraction while turning
  const posRef = useRef(0);
  const anim = useRef(0);
  const drag = useRef(null);
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const put = useCallback((p) => {
    posRef.current = p;
    setPos(p);
  }, []);

  // Computers: the page scroll decides where the ring is.
  const read = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const travel = el.offsetHeight - window.innerHeight;
    const p = travel > 0 ? Math.min(1, Math.max(0, -el.getBoundingClientRect().top / travel)) : 0;
    put(p * n);
  }, [n, put]);

  useEffect(() => {
    if (touch) return undefined;
    read();
    window.addEventListener('scroll', read, { passive: true });
    window.addEventListener('resize', read);
    return () => {
      window.removeEventListener('scroll', read);
      window.removeEventListener('resize', read);
    };
  }, [read, touch]);

  // Touch: turn the ring by itself, easing to the target.
  const ease = useCallback(
    (target) => {
      cancelAnimationFrame(anim.current);
      if (reduced) return put(target);
      const from = posRef.current;
      const t0 = performance.now();
      const step = (t) => {
        const k = Math.min(1, (t - t0) / 380);
        put(from + (target - from) * (1 - Math.pow(1 - k, 3)));
        if (k < 1) anim.current = requestAnimationFrame(step);
      };
      anim.current = requestAnimationFrame(step);
      return undefined;
    },
    [put, reduced],
  );
  useEffect(() => () => cancelAnimationFrame(anim.current), []);

  const current = mod(Math.round(pos), n);

  // Bring card `i` to the front (by the shortest way round).
  const goTo = (i) => {
    if (touch) {
      const base = Math.round(posRef.current);
      let d = mod(i - base, n);
      if (d > n / 2) d -= n;
      return ease(base + d);
    }
    const el = wrapRef.current;
    if (!el) return undefined;
    const travel = el.offsetHeight - window.innerHeight;
    const top = el.getBoundingClientRect().top + window.scrollY;
    return window.scrollTo({ top: top + (mod(i, n) / n) * travel * 0.999, behavior: reduced ? 'auto' : 'smooth' });
  };

  const onPointerDown = (e) => {
    cancelAnimationFrame(anim.current);
    drag.current = { x: e.clientX, moved: false };
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < 8) return;
    d.moved = true;
    d.x = e.clientX;
    if (touch) {
      put(posRef.current - dx / PX_PER_CARD);
    } else {
      const el = wrapRef.current;
      const travel = el.offsetHeight - window.innerHeight;
      window.scrollBy({ top: (-dx / PX_PER_CARD) * (travel / n), behavior: 'auto' });
    }
  };
  const onPointerUp = () => {
    const d = drag.current;
    if (d?.moved && touch) ease(Math.round(posRef.current));
    setTimeout(() => (drag.current = null), 0);
  };

  const ring = (
    <div className={touch ? 'flex flex-col items-center justify-center gap-5 py-4 overflow-hidden' : 'sticky top-16 h-[calc(100vh-4rem)] flex flex-col items-center justify-center gap-5 overflow-hidden'}>
      <div
        role="group"
        aria-roledescription="carousel"
        aria-label="Features"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') (e.preventDefault(), goTo(current + 1));
          if (e.key === 'ArrowLeft') (e.preventDefault(), goTo(current - 1));
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="relative w-full h-[min(52vh,360px)] max-md:h-[220px] select-none touch-pan-y outline-none cursor-grab active:cursor-grabbing"
        style={{ perspective: touch ? '900px' : '1300px' }}
      >
        <div className="absolute inset-0" style={{ transformStyle: 'preserve-3d', transform: `translateZ(${-RADIUS}px)` }}>
          {items.map((it, i) => {
            const ang = (i - pos) * (360 / n);
            const x = Math.abs(mod(ang + 180, 360) - 180); // degrees away from the front
            const Art = FEATURE_ART[it.title];
            return (
              <button
                key={it.title}
                type="button"
                tabIndex={-1}
                aria-label={`${it.title}${i === current ? '' : ': show this feature'}`}
                onClick={() => !drag.current?.moved && i !== current && goTo(i)}
                className="no-3d absolute left-1/2 top-1/2 w-[min(46vw,360px)] md:w-[min(50vw,380px)] rounded-2xl overflow-hidden text-left backdrop-blur-xl border border-white/25 dark:border-white/30 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.35)]"
                style={{
                  transform: `translate(-50%, -50%) rotateY(${ang}deg) translateZ(${RADIUS}px)`,
                  backfaceVisibility: 'hidden',
                  opacity: x <= 8 ? 1 : x <= 60 ? 1 - ((x - 8) / 52) * 0.62 : Math.max(0, 0.38 - ((x - 60) / 40) * 0.38), // the front card is clear, the ones beside it are faded
                  pointerEvents: x > 100 ? 'none' : 'auto',
                  willChange: 'transform',
                }}
              >
                <span className="block opacity-80"><Art /></span>
                <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/30 via-white/5 to-transparent" />
              </button>
            );
          })}
        </div>
      </div>

      <div className="w-full max-w-xl px-4 text-center h-[15rem] sm:h-[10.5rem]">
        <h3 className="text-xl font-extrabold leading-7">{items[current].title}</h3>
        <p className="mt-1 text-sm leading-5 text-mute h-10">{items[current].text}</p>
        <ul className="mt-2 text-sm leading-5 space-y-1">
          {items[current].details.map((d) => <li key={d}>{d}</li>)}
        </ul>
      </div>
    </div>
  );

  if (touch) return <div ref={wrapRef}>{ring}</div>;
  return (
    <div ref={wrapRef} style={{ height: `calc(100vh + ${(n - 1) * SCROLL_PER_CARD * 100}vh)` }} className="relative">
      {ring}
    </div>
  );
}
