// Shared sketch geometry: ten box-like parts in a rough isometric projection.
// A stand-in for the real House (src/lib/house), only so the three visual
// sketches can be compared by looking. Not the frozen grammar. A classic script
// (sets window.ISO) so the sketches open straight from disk, where browsers
// refuse ES module imports.

(() => {

const STARTING = ["Make", "a", "website", "that", "people", "would", "miss", "if", "it", "disappeared"];
const LABELS = ["ground", "front-left mass", "central hall", "front-right mass", "entry", "upper-left volume", "roof", "upper-right volume", "side mass", "threshold"];

// [x0, y0, z0, x1, y1, z1] in plan units; the word's length nudges each part
// so a replacement visibly changes its part (a crude proxy for the grammar).
function parts(words) {
  const k = (i) => Math.min(1, Math.max(0.15, Math.log(words[i].length / 2.5) / Math.log(14 / 2.5)));
  return [
    { box: [0, 0, 0, 10, 8, 0.4 + 0.5 * k(0)] },
    { box: [1, 4.6, 0.6, 4, 7.4, 2 + 2 * k(1)] },
    { box: [4, 1.8, 0.6, 7, 6, 3.4 + 1.6 * k(2)] },
    { box: [7, 4.6, 0.6, 9.4, 7.4, 2 + 2 * k(3)] },
    { box: [4.7, 6, 0.6, 6.3, 6.8 + 1.2 * k(4), 1.6 + 1.2 * k(4)] },
    { box: [1.2, 4.8, 2 + 2 * k(1), 3.8, 7, 3.4 + 2 * k(1) + 1.4 * k(5)] },
    { roof: [4, 1.8, 3.4 + 1.6 * k(2), 7, 6, 0.8 + 2.2 * k(6)] },
    { box: [7.2, 4.8, 2 + 2 * k(3), 9.2, 7, 3.2 + 2 * k(3) + 1.2 * k(7)] },
    { box: [7.8, 0.4, 0.6, 9.8, 3.2, 2 + 5 * k(8)] },
    { box: [3 - 1.5 * k(9), 8.1, 0, 8 + 1.5 * k(9), 8.5 + 1.1 * k(9), 0.18] },
  ];
}

const project = (x, y, z) => [(x - y) * 0.866, (x + y) * 0.5 - z];

// Faces of one part as screen polygons with a shade key, back to front.
function faces(part) {
  const P = (x, y, z) => project(x, y, z);
  if (part.box) {
    const [x0, y0, z0, x1, y1, z1] = part.box;
    return [
      { pts: [P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)], shade: "left" },
      { pts: [P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)], shade: "right" },
      { pts: [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], shade: "top" },
    ];
  }
  const [x0, y0, z0, x1, y1, h] = part.roof;
  const ym = (y0 + y1) / 2;
  return [
    { pts: [P(x0, ym, z0 + h), P(x1, ym, z0 + h), P(x1, y1, z0), P(x0, y1, z0)], shade: "left" },
    { pts: [P(x1, y0, z0), P(x1, y1, z0), P(x1, ym, z0 + h)], shade: "right" },
    { pts: [P(x0, y0, z0), P(x1, y0, z0), P(x1, ym, z0 + h), P(x0, ym, z0 + h)], shade: "top" },
  ];
}

const depth = (p) => {
  const b = p.box ?? [p.roof[0], p.roof[1], p.roof[2], p.roof[3], p.roof[4], p.roof[2] + p.roof[5]];
  return (b[0] + b[3]) / 2 + (b[1] + b[4]) / 2 + b[2] * 0.6;
};
const order = (ps) => ps.map((p, i) => [p, i]).sort((a, b) => depth(a[0]) - depth(b[0])).map(([, i]) => i);

function centre(part) {
  const fs = faces(part).flatMap((f) => f.pts);
  return [fs.reduce((s, p) => s + p[0], 0) / fs.length, fs.reduce((s, p) => s + p[1], 0) / fs.length];
}

// A part grown from its base to fraction t of its height, for construction.
function grown(part, t) {
  if (part.box) {
    const [x0, y0, z0, x1, y1, z1] = part.box;
    return { box: [x0, y0, z0, x1, y1, z0 + Math.max(0.02, (z1 - z0) * t)] };
  }
  const [x0, y0, z0, x1, y1, h] = part.roof;
  return { roof: [x0, y0, z0, x1, y1, Math.max(0.02, h * t)] };
}

function fitCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const r = canvas.getBoundingClientRect();
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: r.width, h: r.height };
}

function poly(ctx, pts, ox, oy, s) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(ox + x * s, oy + y * s) : ctx.moveTo(ox + x * s, oy + y * s)));
  ctx.closePath();
}

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const phase = (t, a, b) => clamp01((t - a) / (b - a));
// #after jumps a sketch to the end of its script, with no motion, for review screenshots
const reduced = () => window.ISO_INSTANT || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
function demo(play, steps) {
  if (location.hash === "#play") setTimeout(play, 50);
  if (location.hash !== "#after") return;
  window.ISO_INSTANT = true;
  let n = 0;
  // with ISO_INSTANT every transition completes on its first frame; a resize
  // forces that frame even where requestAnimationFrame is throttled
  (function next() { if (n < steps) { if (play()) n++; dispatchEvent(new Event("resize")); setTimeout(next, 30); } })();
}

window.ISO = { STARTING, LABELS, parts, project, faces, order, centre, grown, fitCanvas, poly, ease, clamp01, phase, reduced, demo };
})();
