import { geoPath } from 'd3-geo';

// One look for every globe: a clean, hollow ball. No grid lines; only the land is drawn, as bright outlines with
// a trace of colour inside, so the countries are what you see.
// A soft glow at the edge (no outline) makes it read as a round object, not a flat disc or a box.
export function drawGlobe(ctx, proj, { size, night, land, graticule, sphere }) {
  const path = geoPath(proj, ctx);
  const r = proj.scale();
  const [cx, cy] = proj.translate();
  const green = night ? '74,222,128' : '22,163,74';

  ctx.clearRect(0, 0, size, size);

  // glass: clear in the middle, a little tint toward the rim
  const body = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.3, r * 0.1, cx, cy, r);
  body.addColorStop(0, night ? 'rgba(96,165,250,0.05)' : 'rgba(96,165,250,0.04)');
  body.addColorStop(0.72, night ? 'rgba(96,165,250,0.07)' : 'rgba(96,165,250,0.06)');
  body.addColorStop(1, night ? 'rgba(96,165,250,0.08)' : 'rgba(59,130,246,0.06)');
  ctx.beginPath();
  path(sphere);
  ctx.fillStyle = body;
  ctx.fill();

  // countries: outline with only a trace of colour inside
  ctx.beginPath();
  path(land);
  ctx.fillStyle = `rgba(${green},0.10)`;
  ctx.fill();
  ctx.strokeStyle = `rgba(${green},0.95)`;
  ctx.lineWidth = 1.3;
  ctx.lineJoin = 'round';
  ctx.stroke();
}
