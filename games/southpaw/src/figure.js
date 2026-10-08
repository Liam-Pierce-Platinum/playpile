// THE FIGURE RENDERER. A fighter is drawn as ONE sprite, not a pile of parts.
//
// Every frame the posed skeleton is rasterised into a small private pixel
// buffer (facing right, always), then three passes run over the whole body:
//
//   1. each LIMB is a chain of tapered capsules drawn as a unit: all of its
//      outline layer first, then all of its fill, then its highlight - so an
//      elbow or a knee is one smooth bend with no seam in it
//   2. RIM LIGHT: any skin or cloth pixel with open air above it catches the
//      arena's light
//   3. ONE OUTLINE around the union of everything, in plum-black ink
//
// Parts that overlap the body (the lead arm across the chest, a glove over
// the face) carry a darker line of their OWN colour ("selective outline"), so
// they read as in front without breaking the silhouette into pieces.
//
// The buffer is then blitted into the view, mirrored for facing left. Nothing
// is cached: it is cheaper to redraw a 120x120 sprite than to hold hundreds.

import { P, mix, shade, light } from './palette.js';
import { SKINS } from './roster.js';

const BW = 120, BH = 120, OX = 60, OY = 108;
export const SCALE = 1.1;

let can = null, ctx = null, img = null, u32 = null;
function ensure() {
  if (can) return;
  can = document.createElement('canvas'); can.width = BW; can.height = BH;
  ctx = can.getContext('2d');
  img = ctx.createImageData(BW, BH);
  u32 = new Uint32Array(img.data.buffer);
}

// '#rrggbb' -> ABGR uint32 (little endian ImageData), cached
const CC = new Map();
function C(hex) {
  let v = CC.get(hex);
  if (v !== undefined) return v;
  const n = parseInt(hex.slice(1), 16);
  v = (0xff000000 | ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255)) >>> 0;
  CC.set(hex, v);
  return v;
}
const ramp = (base) => ({ line: C(shade(base, 0.42)), dark: C(shade(base, 0.22)), mid: C(base), lite: C(light(base, 0.28)) });
const rampOf = (a, b, c) => ({ line: C(shade(c, 0.35)), dark: C(c), mid: C(b), lite: C(a) });

// ------------------------------------------------------------ primitives ---
function pset(x, y, c) { if (x >= 0 && y >= 0 && x < BW && y < BH) u32[y * BW + x] = c; }
function rect(x, y, w, h, c) {
  x = Math.round(x); y = Math.round(y);
  for (let j = Math.max(0, y); j < Math.min(BH, y + h); j++) for (let i = Math.max(0, x); i < Math.min(BW, x + w); i++) u32[j * BW + i] = c;
}
function capsule(ax, ay, bx, by, ra, rb, c) {
  if (ra <= 0 && rb <= 0) return;
  const R = Math.max(ra, rb);
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - R - 1)), x1 = Math.min(BW - 1, Math.ceil(Math.max(ax, bx) + R + 1));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - R - 1)), y1 = Math.min(BH - 1, Math.ceil(Math.max(ay, by) + R + 1));
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-6;
  for (let y = y0; y <= y1; y++) {
    const py = y + 0.5;
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5;
      let t = ((px - ax) * dx + (py - ay) * dy) / L2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = ax + dx * t - px, qy = ay + dy * t - py;
      const r = ra + (rb - ra) * t;
      if (qx * qx + qy * qy <= r * r) u32[y * BW + x] = c;
    }
  }
}
function ellipse(cx, cy, rx, ry, ang, c) {
  const R = Math.max(rx, ry) + 1, cs = Math.cos(ang), sn = Math.sin(ang);
  for (let y = Math.max(0, Math.floor(cy - R)); y <= Math.min(BH - 1, Math.ceil(cy + R)); y++) {
    for (let x = Math.max(0, Math.floor(cx - R)); x <= Math.min(BW - 1, Math.ceil(cx + R)); x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const u = (dx * cs + dy * sn) / rx, w = (-dx * sn + dy * cs) / ry;
      if (u * u + w * w <= 1) u32[y * BW + x] = c;
    }
  }
}
function poly(pts, c) {
  let lo = 1e9, hi = -1e9;
  for (const p of pts) { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); }
  lo = Math.max(0, Math.floor(lo)); hi = Math.min(BH - 1, Math.ceil(hi));
  const xs = [];
  for (let y = lo; y <= hi; y++) {
    xs.length = 0;
    const cy = y + 0.5;
    for (let i = 0, n = pts.length; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      if ((a[1] <= cy && b[1] > cy) || (b[1] <= cy && a[1] > cy)) xs.push(a[0] + (cy - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      for (let x = Math.max(0, Math.round(xs[i])); x < Math.min(BW, Math.round(xs[i + 1])); x++) u32[y * BW + x] = c;
    }
  }
}
function grow(pts, k) {
  // push a polygon outward from its centroid by k pixels (for outline layers)
  let cx = 0, cy = 0; for (const p of pts) { cx += p[0]; cy += p[1]; } cx /= pts.length; cy /= pts.length;
  return pts.map((p) => { const dx = p[0] - cx, dy = p[1] - cy, l = Math.hypot(dx, dy) || 1; return [p[0] + dx / l * k, p[1] + dy / l * k]; });
}
function line(x0, y0, x1, y1, c) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let i = 0; i < 400; i++) {
    pset(x0, y0, c);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

// A limb: a chain of capsules [[a, b, ra, rb], ...] drawn as one shape.
function limb(chain, rp, hi = true) {
  for (const [a, b, ra, rb] of chain) capsule(a[0], a[1], b[0], b[1], ra + 1, rb + 1, rp.line);
  for (const [a, b, ra, rb] of chain) capsule(a[0], a[1], b[0], b[1], ra, rb, rp.mid);
  if (hi) for (const [a, b, ra, rb] of chain) if (ra >= 2) capsule(a[0] - 0.4, a[1] - 0.9, b[0] - 0.4, b[1] - 0.9, ra - 1.3, rb - 1.3, rp.lite);
}

// ----------------------------------------------------------------- draw ---
// look: the fighter's look. pose: joints (local units, y up, facing right).
// o: { flash, rim (hex), outfit }
// Returns positions (in buffer px, unmirrored) of the head and both hands.
export function renderFigure(look, pose, o = {}) {
  ensure();
  u32.fill(0);
  const H = ((look.build && look.build.h) || 1) * SCALE, Wd = (look.build && look.build.w) || 1;
  const T = (j) => [OX + j[0] * SCALE, OY - j[1] * H];
  const outfit = look.outfit || 'boxer';
  const sk = SKINS[look.skin || 0] || SKINS[0];
  const skin = rampOf(sk[0], sk[1], sk[2]);
  const skinB = rampOf(sk[1], sk[2], shade(sk[2], 0.2));      // the far side of the body, a step darker

  const hip = T(pose.hip), neck = T(pose.neck), head = T(pose.head);
  const kL = T(pose.kL), kR = T(pose.kR), fL = T(pose.fL), fR = T(pose.fR);
  const eF = T(pose.eF), gF = T(pose.gF), eB = T(pose.eB), gB = T(pose.gB);
  // torso axis (screen space, y down) and its "front" perpendicular
  let ax = neck[0] - hip[0], ay = neck[1] - hip[1];
  const al = Math.hypot(ax, ay) || 1; ax /= al; ay /= al;
  const fx = -ay, fy = ax;   // rotate the up-axis 90deg toward facing (+x)
  const nfx = fx >= 0 ? fx : -fx, nfy = fx >= 0 ? fy : -fy;
  const tw = pose.tw || 0;
  const at = (t, off) => [hip[0] + ax * al * t + nfx * off * Wd, hip[1] + ay * al * t + nfy * off * Wd];
  const sF = at(0.9, 2.2 + tw * 2.2), sB = at(0.88, -2.2 + tw * 3.4);
  const belly = look.belly || 0;

  // ---- colours by outfit
  const tr = look.trunks || ['#ff5b4d', '#d2372c', '#8a1e16'];
  const trunk = rampOf(tr[0], tr[1], tr[2]);
  const trunkB = rampOf(tr[1], tr[2], shade(tr[2], 0.25));
  const shoeR = ramp(look.shoes || '#f6f2e6');
  const shoeB = ramp(shade(look.shoes || '#f6f2e6', 0.2));
  const pants = outfit === 'ref' ? ramp(look.pants || '#2c2834') : outfit === 'wrestler' && look.tights ? ramp(look.tights) : null;
  const pantsB = pants ? ramp(shade(outfit === 'ref' ? (look.pants || '#2c2834') : look.tights, 0.2)) : null;
  const shirt = outfit === 'ref' ? ramp(look.shirt || '#ecebe4') : outfit === 'wrestler' && look.top ? ramp(look.top) : null;
  const hands = look.hands || (outfit === 'boxer' ? 'gloves' : 'fists');

  // ---------------------------------------------------------- rear arm
  limb([[sB, eB, 2.6 * Math.min(Wd, 1.1), 2.3 * Math.min(Wd, 1.1)]], shirt && outfit === 'ref' ? ramp(shade(look.shirt || '#ecebe4', 0.15)) : skinB, false);
  limb([[eB, gB, 2.4 * Wd, 1.9 * Wd]], skinB, false);
  hand(gB, eB, true);

  // ---------------------------------------------------------- legs
  leg(kR, fR, true);
  leg(kL, fL, false);

  // ---------------------------------------------------------- hips / trunks
  const waist = at(0.2, 0);
  const thighL = [hip[0] + (kL[0] - hip[0]) * 0.5, hip[1] + (kL[1] - hip[1]) * 0.5];
  const thighR = [hip[0] + (kR[0] - hip[0]) * 0.5, hip[1] + (kR[1] - hip[1]) * 0.5];
  if (outfit === 'sumo') {
    // mawashi: the thick silk belt, a front flap and the hanging sagari
    const mw = ramp(look.trunks ? look.trunks[0] : '#3a3a6a');
    const bF = at(0.12, 6.2 + belly * 2), bB = at(0.12, -5.8);
    limb([[bB, bF, 3.2, 3.2]], mw);
    limb([[hip, thighR, 4.2, 3.6], [hip, thighL, 4.2, 3.6]], mw, true);
    poly([at(0.05, 3), at(0.05, -1), [thighL[0] + 1, thighL[1] + 2]], mw.dark);
    for (let i = 0; i < 6; i++) { const s = at(0.02, 4.5 - i * 1.4); line(s[0], s[1], s[0] + 0.5, s[1] + 7 + (i & 1), mw.line); }
  } else if (outfit === 'ref') {
    limb([[hip, thighR, 4.6 * Wd, 3.8 * Wd]], pantsB, false);
    limb([[hip, thighL, 4.6 * Wd, 3.8 * Wd]], pants, false);
    limb([[at(0.18, -5.2), at(0.18, 5.4), 1.5, 1.5]], ramp('#141018'), false);
  } else {
    // trunks (boxer) / briefs (wrestler): over the hips and the top of the thighs
    limb([[hip, thighR, 4.4 * Wd, 3.9 * Wd]], trunkB, false);
    const wF = at(0.22, 5.6), wB = at(0.22, -5.6), hF = at(-0.02, 5.8), hB = at(-0.02, -5.8);
    const body = [wB, wF, hF, [thighL[0] + 2, thighL[1]], [thighL[0] - 3, thighL[1] + 1], [thighR[0], thighR[1] + 1], hB];
    poly(grow(body, 1), trunk.line);
    limb([[hip, thighL, 4.4 * Wd, 3.9 * Wd]], trunk, true);
    poly(body, trunk.mid);
    poly([at(0.2, 4.6), at(0.2, 1.5), [thighL[0], thighL[1] - 1], [thighL[0] + 2, thighL[1] - 2]], trunk.lite);
    // a fold, and the stripe down the side
    line(waist[0] + 1, waist[1] + 3, thighL[0] - 2, thighL[1] - 1, trunk.dark);
    line(at(0.2, 4.8)[0], at(0.2, 4.8)[1] + 2, thighL[0] + 3, thighL[1] - 1, C(look.stripe || '#ffffff'));
  }

  // ---------------------------------------------------------- torso
  const torso = [at(0.18, 5.6), at(0.45, 5.0 + belly * 4), at(0.72, 6.6 + belly * 1.5), at(0.92, 6.0), at(1.04, 3.2), at(1.05, -1.6), at(0.99, -3.9),
    at(0.88, -5.0), at(0.7, -5.2), at(0.45, -4.6 - belly * 0.5), at(0.18, -5.4 - belly * 0.5)];
  const tor = shirt || skin;
  poly(grow(torso, 1), tor.line);
  poly(torso, tor.mid);
  if (belly > 0) { const bc = at(0.42, 3.5 + belly * 2.5); ellipse(bc[0], bc[1], 5 + belly * 4, 6 + belly * 3, Math.atan2(ay, ax), tor.line); ellipse(bc[0], bc[1], 4 + belly * 4, 5 + belly * 3, Math.atan2(ay, ax), tor.mid); ellipse(bc[0] - 1, bc[1] - 2, 2.5 + belly * 2.5, 3 + belly * 2, Math.atan2(ay, ax), tor.lite); }
  // light on the chest and the front of the stomach, shade down the back
  poly([at(0.24, 4.6), at(0.46, 4.0 + belly * 3), at(0.72, 5.6), at(0.9, 5.0), at(0.98, 1.4), at(0.6, 1.2), at(0.3, 1.6)], tor.lite);
  poly([at(0.2, -3.6), at(0.9, -3.0), at(0.86, -4.8), at(0.7, -5.0), at(0.45, -4.4), at(0.2, -5.0)], tor.dark);
  if (!shirt) {
    // pec line, the six-pack, the navel
    const p1 = at(0.7, 1.4), p2 = at(0.7, 5.6);
    line(p1[0], p1[1], p2[0], p2[1], skin.dark);
    if (belly < 0.3) {
      for (let i = 0; i < 3; i++) { const q = at(0.34 + i * 0.11, 3.0); pset(Math.round(q[0]), Math.round(q[1]), skin.dark); pset(Math.round(q[0]) + 2, Math.round(q[1]), skin.dark); }
    }
    const nv = at(0.27, 2.8 + belly * 3); pset(Math.round(nv[0]), Math.round(nv[1]), skin.line);
  } else if (outfit === 'ref') {
    // shirt: placket, collar and the bow tie
    const c1 = at(1.0, 1), c2 = at(0.2, 1.4);
    line(c1[0], c1[1], c2[0], c2[1], shirt.dark);
    const bt = at(0.98, 2.4); rect(bt[0] - 2, bt[1], 5, 2, C('#141018')); pset(Math.round(bt[0]), Math.round(bt[1]), C('#3a3446'));
  } else if (outfit === 'wrestler') {
    // singlet straps
    const s1 = at(1.0, 3.2), s2 = at(0.7, 4.6);
    line(s1[0], s1[1], s2[0], s2[1], shirt.line);
  }
  if (outfit !== 'ref' && outfit !== 'sumo') {
    // waistband over everything below the chest
    const b1 = at(0.22, -5.8), b2 = at(0.22, 5.8);
    limb([[b1, b2, 1.6, 1.6]], ramp(look.stripe || '#ffffff'), false);
    if (look.belt) { const m = at(0.22, 1); rect(m[0] - 3, m[1] - 2, 7, 4, C(P.ink)); rect(m[0] - 2, m[1] - 1, 5, 2, C('#ffd36b')); pset(Math.round(m[0]), Math.round(m[1]) - 1, C('#fff8d0')); }
  }
  if (look.top && outfit === 'boxer') {
    const top = ramp(look.top);
    const band = [at(0.6, 6.4), at(0.92, 6.0), at(1.03, 3.2), at(1.03, -3.4), at(0.92, -5.4), at(0.6, -5.2)];
    poly(grow(band, 0.6), top.line); poly(band, top.mid); poly([at(0.64, 5.6), at(0.9, 5.2), at(0.98, 1.5), at(0.64, 1.5)], top.lite);
  }

  // ---------------------------------------------------------- neck + traps
  const nb = at(1.02, 0.4);
  limb([[nb, [head[0] - 1, head[1] + 2], 2.6 * Wd, 2.3 * Wd]], skin, false);
  if (outfit === 'ref') { const cl = at(1.04, 0); limb([[[cl[0] - 3, cl[1]], [cl[0] + 3, cl[1]], 1.4, 1.4]], shirt, false); }

  // ---------------------------------------------------------- head
  headDraw(look, head, o, skin);

  // ---------------------------------------------------------- lead arm
  limb([[sF, eF, 3.2 * Wd, 2.6 * Wd], [eF, gF, 2.6 * Wd, 2.0 * Wd]], outfit === 'ref' ? shirt : skin);
  if (outfit !== 'ref') { const d = sF; ellipse(d[0], d[1] + 0.5, 3.4 * Wd, 3.0 * Wd, 0, skin.mid); ellipse(d[0] - 0.4, d[1] - 0.3, 2.2 * Wd, 1.6 * Wd, 0, skin.lite); }
  hand(gF, eF, false);

  // ---------------------------------------------------------- passes
  const rim = o.rim ? C(o.rim) : 0;
  if (rim) {
    // rim light: a pixel with air directly above it catches the light
    const rr = rim & 255, rg = (rim >> 8) & 255, rbl = (rim >> 16) & 255;
    for (let y = 1; y < BH; y++) for (let x = 0; x < BW; x++) {
      const i = y * BW + x, c = u32[i];
      if (c && !u32[i - BW]) {
        const r = c & 255, g = (c >> 8) & 255, b = (c >> 16) & 255;
        u32[i] = (0xff000000 | (((b + rbl) >> 1) << 16) | (((g + rg) >> 1) << 8) | ((r + rr) >> 1)) >>> 0;
      }
    }
  }
  const ink = o.flash ? C('#fff8ea') : C(P.ink);
  // the one outline: every empty pixel touching the body becomes ink
  const out = [];
  for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) {
    const i = y * BW + x;
    if (u32[i]) continue;
    if ((x > 0 && u32[i - 1] && u32[i - 1] !== ink) || (x < BW - 1 && u32[i + 1] && u32[i + 1] !== ink) ||
        (y > 0 && u32[i - BW] && u32[i - BW] !== ink) || (y < BH - 1 && u32[i + BW] && u32[i + BW] !== ink)) out.push(i);
  }
  for (const i of out) u32[i] = ink;
  if (o.flash) { const w = C('#fff8ea'); for (let i = 0; i < u32.length; i++) if (u32[i]) u32[i] = w; }
  ctx.putImageData(img, 0, 0);
  return { head, gF, gB, hip, canvas: can };

  // ------------------------------------------------------------- helpers
  function leg(k, f, rear) {
    const sr = rear ? skinB : skin;
    const legR = pants ? (rear ? pantsB : pants) : sr;
    const calf = [k[0] + (f[0] - k[0]) * 0.36 - 0.9, k[1] + (f[1] - k[1]) * 0.36];
    const ankle = [f[0], f[1] - 2.2];
    limb([[hip, k, 3.6 * Wd, 2.7 * Wd], [k, calf, 2.7 * Wd, 2.7 * Wd], [calf, ankle, 2.6 * Wd, 1.7 * Wd]], legR, !rear);
    if (outfit === 'sumo') {
      limb([[[f[0] - 2, f[1] - 1], [f[0] + 4, f[1] - 1], 1.8, 1.6]], sr, false);
      return;
    }
    // boot: up the shin a third of the way, sole forward
    const bootTop = [ankle[0] + (k[0] - ankle[0]) * (outfit === 'wrestler' ? 0.6 : 0.36), ankle[1] + (k[1] - ankle[1]) * (outfit === 'wrestler' ? 0.6 : 0.36)];
    const sh = rear ? shoeB : shoeR;
    limb([[bootTop, ankle, 2.5, 2.3], [[f[0] - 1.6, f[1] - 1.5], [f[0] + 3.4, f[1] - 1.3], 1.8, 1.5]], sh, !rear);
    rect(f[0] - 3, f[1] - 0.2, 8, 1, sh.line);
    if (!rear) for (let i = 0; i < 3; i++) { const q = [bootTop[0] + (ankle[0] - bootTop[0]) * (i / 3) + 1.5, bootTop[1] + (ankle[1] - bootTop[1]) * (i / 3)]; pset(Math.round(q[0]), Math.round(q[1]), sh.dark); }
    if (outfit === 'wrestler' && look.pads) { ellipse(k[0] + 0.8, k[1], 3.4, 3.6, 0, ramp(look.pads).line); ellipse(k[0] + 0.8, k[1], 2.5, 2.7, 0, ramp(look.pads).mid); }
  }
  function hand(g, e, rear) {
    const dx = g[0] - e[0], dy = g[1] - e[1], l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
    const ang = Math.atan2(uy, ux);
    if (hands === 'gloves') {
      const gc = look.gloves || ['#e8463c', '#a8231c'];
      const gr = rear ? rampOf(gc[0], gc[1], shade(gc[1], 0.3)) : rampOf(light(gc[0], 0.2), gc[0], gc[1]);
      const cuff = ramp(rear ? '#d8d2c4' : '#f2ede0');
      // the cuff, wrapped in tape, where the forearm goes in
      const c0 = [g[0] - ux * 3.0, g[1] - uy * 3.0], c1 = [g[0] - ux * 5.2, g[1] - uy * 5.2];
      limb([[c0, c1, 2.7, 2.6]], cuff, false);
      line(c0[0] - uy * 2, c0[1] + ux * 2, c0[0] + uy * 2, c0[1] - ux * 2, cuff.dark);
      // the glove: a fat oval along the punch, a thumb on the upper side
      const cx = g[0] + ux * 0.8, cy = g[1] + uy * 0.8;
      ellipse(cx, cy, 5.4, 4.7, ang, gr.line);
      const th = [g[0] + uy * 3.2 - ux * 0.5, g[1] - ux * 3.2 - uy * 0.5];
      ellipse(cx, cy, 4.4, 3.8, ang, gr.mid);
      ellipse(th[0], th[1] - 0.6, 2.1, 1.6, ang, gr.dark);
      ellipse(cx - 0.6, cy - 1.2, 3.0, 2.1, ang, gr.lite);
      pset(Math.round(cx - 1.6), Math.round(cy - 2.2), C('#fff8ea'));
      pset(Math.round(cx - 0.6), Math.round(cy - 2.4), C(light(gc[0], 0.6)));
    } else {
      // bare fist (wrestling, sumo): knuckles and a wrap if they wear one
      const sr = rear ? skinB : skin;
      if (hands === 'wraps') limb([[[g[0] - ux * 1.5, g[1] - uy * 1.5], [g[0] - ux * 4, g[1] - uy * 4], 2.2, 2.1]], ramp('#efe8d8'), false);
      ellipse(g[0] + ux * 0.5, g[1] + uy * 0.5, 3.0, 2.5, ang, sr.line);
      ellipse(g[0] + ux * 0.5, g[1] + uy * 0.5, 2.2, 1.8, ang, sr.mid);
      pset(Math.round(g[0] + ux * 2), Math.round(g[1] + uy * 2 - 1), sr.lite);
    }
  }
}

// The head, at native pixel size around its centre (lx forward, ly UP).
function headDraw(look, H, o, skin) {
  const hx = Math.round(H[0]), hy = Math.round(H[1]);
  const px = (lx, ly, w = 1, h = 1, c) => rect(hx + lx, hy - ly - h + 1, w, h, c);
  const s = o.state || 'idle';
  // skull and jaw
  ellipse(hx + 0.5, hy + 0.2, 6.9, 7.3, 0, skin.line);
  ellipse(hx + 0.5, hy + 0.2, 6.0, 6.4, 0, skin.mid);
  px(0, -8, 7, 4, skin.line); px(0, -7, 6, 3, skin.mid); px(1, -6, 5, 2, skin.mid);
  px(0, -3, 6, 7, skin.lite); px(-2, 1, 3, 4, skin.lite);
  px(-6, -3, 2, 6, skin.dark); px(0, -7, 5, 1, skin.dark);
  px(-2, -1, 2, 3, skin.dark); px(-1, 0, 1, 1, skin.mid);
  px(6, -1, 1, 3, skin.mid); px(7, -1, 1, 2, skin.mid); px(7, -2, 1, 1, skin.dark);
  const inkc = C(P.ink);
  const hurt = s === 'hit' || s === 'stagger' || s === 'down' || s === 'ko' || s === 'thrown' || s === 'pinned';
  const ko = s === 'ko' || s === 'down' || s === 'pinned';
  if (ko) { px(2, 1, 1, 1, inkc); px(4, 1, 1, 1, inkc); px(3, 0, 1, 1, inkc); px(2, -1, 1, 1, inkc); px(4, -1, 1, 1, inkc); }
  else if (hurt) px(2, 1, 3, 1, inkc);
  else { px(3, 0, 1, 2, inkc); px(4, 1, 1, 1, C('#fff8ea')); }
  const hc = C(look.hairC || '#3d2618');
  px(2, 2 + (hurt ? 0 : 1), 3, 1, look.hair === 'bald' ? skin.dark : hc);
  if ((s === 'hit' && o.hitT < 0.12) || s === 'stagger') { px(3, -4, 2, 2, inkc); px(3, -4, 1, 1, C(look.gloves ? look.gloves[0] : '#ffffff')); }
  else if (s === 'win' || s === 'grapple' || s === 'charge') { px(2, -4, 3, 1, inkc); px(3, -3, 1, 1, C('#fff8ea')); }
  else px(3, -3, 2, 1, skin.dark);
  const bc = C(look.beardC || look.hairC || '#2a1a10');
  switch (look.beard) {
    case 'full': px(-1, -7, 6, 3, bc); px(-2, -4, 2, 4, bc); px(3, -3, 2, 1, bc); px(1, -5, 4, 1, bc); px(3, -4, 2, 1, skin.dark); break;
    case 'goatee': px(2, -7, 3, 3, bc); px(2, -3, 3, 1, bc); break;
    case 'stache': px(2, -2, 4, 1, bc); px(1, -3, 1, 1, bc); break;
    case 'short': for (let i = 0; i < 6; i++) px(-1 + i, -6 + (i & 1), 1, 1, bc); px(4, -5, 1, 1, bc); px(0, -4, 1, 1, bc); break;
  }
  const hairPass = (dx, dy) => {};
  const hl = C(light(look.hairC || '#3d2618', 0.3)), hm = C(mix(look.hairC || '#3d2618', SKINS[look.skin || 0][1], 0.45));
  switch (look.hair) {
    case 'bald': px(-2, 4, 3, 1, C(light(SKINS[look.skin || 0][1], 0.45))); px(-1, 5, 1, 1, C(light(SKINS[look.skin || 0][1], 0.6))); break;
    case 'buzz': px(-4, 3, 8, 3, hm); px(-5, 0, 2, 3, hm); px(-3, 6, 6, 1, hm); break;
    case 'short': px(-5, 2, 9, 4, hc); px(-5, -1, 3, 3, hc); px(2, 5, 3, 1, hc); px(-3, 6, 6, 1, hc); px(-2, 5, 4, 1, hl); break;
    case 'messy': px(-5, 2, 10, 4, hc); px(-6, -1, 3, 4, hc); px(-3, 6, 7, 1, hc); px(4, 3, 2, 1, hc); px(-6, 4, 1, 1, hc); px(1, 7, 2, 1, hc); px(-2, 7, 1, 1, hc); px(-1, 5, 3, 1, hl); break;
    case 'spiky': px(-5, 2, 9, 3, hc); for (let i = 0; i < 4; i++) px(-4 + i * 3, 5, 2, 2 + (i & 1), hc); px(-6, 0, 2, 3, hc); px(-2, 4, 3, 1, hl); break;
    case 'flattop': px(-5, 2, 10, 7, hc); px(-5, -1, 2, 3, hc); px(-4, 8, 8, 1, hl); break;
    case 'fade': px(-4, 3, 8, 3, hc); px(-5, 1, 2, 3, hm); px(-3, 6, 6, 1, hc); px(-1, 5, 3, 1, hl); break;
    case 'slick': px(-5, 2, 10, 4, hc); px(-7, 1, 3, 3, hc); px(-2, 5, 5, 1, hl); break;
    case 'braids': px(-5, 2, 10, 4, hc); px(-6, -1, 3, 4, hc); for (let i = 0; i < 3; i++) px(-7 - i, -3 - i * 2, 2, 2, hc); px(-3, 6, 6, 1, hc); px(-1, 4, 4, 1, hl); break;
    case 'topknot': px(-5, 2, 10, 4, hc); px(-5, -1, 2, 3, hc); px(-4, 6, 4, 3, hc); px(-3, 8, 2, 1, hl); px(-3, 5, 4, 1, C('#d8263c')); break;
    case 'mohawk': px(-4, 3, 8, 2, hm); for (let i = 0; i < 5; i++) px(-4 + i * 2, 6, 2, 2 + (i % 2), hc); px(-2, 8, 4, 1, hl); break;
    case 'long': px(-5, 2, 10, 4, hc); px(-7, -6, 4, 9, hc); px(-3, 6, 6, 1, hc); px(-6, -6, 2, 1, hl); px(-1, 5, 4, 1, hl); break;
    case 'eboshi': px(-5, 3, 10, 3, hc); px(-4, 6, 8, 5, C('#141018')); px(-3, 11, 5, 2, C('#141018')); px(-2, 7, 3, 1, C('#3a3446')); break;
    case 'chonmage': px(-5, 3, 10, 3, hc); px(-5, -1, 2, 4, hc); px(-2, 6, 6, 2, hc); px(2, 8, 4, 1, hc); px(0, 7, 3, 1, hl); break;
  }
  if (look.mask) {
    // a luchador mask: covers the head, eye holes stay open
    const m = C(look.mask), m2 = C(shade(look.mask, 0.3)), m3 = C(look.maskTrim || '#ffffff');
    ellipse(hx + 0.5, hy + 0.3, 5.4, 5.9, 0, m); px(0, -6, 5, 3, m); px(1, -5, 4, 2, m);
    px(-5, -3, 2, 5, m2); px(3, -1, 3, 3, m3); px(2, 0, 4, 1, m3);
    px(3, 0, 1, 2, inkc); px(4, 1, 1, 1, C('#fff8ea'));
    px(-1, 3, 3, 1, m3); px(3, -4, 2, 1, skin.dark);
  }
}

// Blit the last rendered figure into a view with its feet at (X, Y).
export function blitFigure(v, X, Y, face) {
  const g = v.g;
  g.save();
  g.translate(Math.round(X), Math.round(Y));
  if (face < 0) g.scale(-1, 1);
  g.drawImage(can, -OX, -OY);
  g.restore();
}
// buffer px -> screen px for a figure blitted at (X, Y) facing `face`
export const toScreen = (pt, X, Y, face) => [Math.round(X) + (pt[0] - OX) * (face < 0 ? -1 : 1), Math.round(Y) + (pt[1] - OY)];
