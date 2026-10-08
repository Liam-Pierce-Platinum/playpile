// sprites.js - every creature, soldier, hero and tower, painted once at load
// into small canvases (ink line + watercolor wash), then blitted each frame.
//
// Drawing space is map pixels with the feet at (0,0), facing right; the
// sheet is rendered at SS pixels per map pixel so it stays crisp when the
// map is shown at 2x on a big screen.

import { rng, rgb, rgba, shade, mix, ellipsePts, P, dab, ink, inkPoly, deform, tracePoly, makeCanvas, INK, hex } from './paint.js';
import { drawTower2, drawCreature2, OUTFIT2, UNIT_BOX2 } from './art2.js';

export const SS = 2.5;
const TAU = Math.PI * 2;

// ------------------------------------------------------------------ painter
// A thin wrapper so each drawing reads like a list of brush strokes.
// MODE.piece: figures are painted as one solid piece - no line around each
// part; bake() then puts a single soft edge around the whole silhouette.
// MODE.noInk: keep the watercolour washes but drop the pen lines (map scenery).
let MODE = {};
function painter(g, R, mode = MODE) {
  const piece = !!mode.piece, noInk = piece || !!mode.noInk;
  const p = {
    g, R, piece,
    // filled shape: wash, then a shadow wash on the lower-right, then ink
    shape(pts, col, o = {}) {
      const c = typeof col === 'string' ? rgb(col) : col;
      if (piece) {
        // solid body colour first so overlapping parts merge into one piece
        g.fillStyle = rgba(c, o.alphaSolid ?? 1);
        tracePoly(g, pts);
        g.fill();
        dab(g, pts, shade(c, 0.12), R, { layers: 2, alpha: 0.18, amt: 0.06, edge: 0 });
      } else dab(g, pts, c, R, { layers: o.layers ?? 4, alpha: o.alpha ?? 0.36, amt: o.amt ?? 0.08, edge: 0.6, edgeW: 0.5 });
      if (o.shadow !== false && piece) {
        // flat planes: a shadow side cut on a diagonal, and a small lit facet
        g.save();
        tracePoly(g, pts); g.clip();
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        for (const q of pts) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
        const w = x1 - x0, h = y1 - y0, cx = x0 + w * 0.58, cy = y0 + h * 0.45;
        g.fillStyle = rgba(shade(c, -0.45), 0.3);
        g.beginPath(); g.moveTo(cx + h * 0.35, y0 - 1); g.lineTo(x1 + 2, y0 - 1); g.lineTo(x1 + 2, y1 + 2); g.lineTo(x0 - 2, y1 + 2); g.lineTo(x0 - 2, cy + h * 0.45); g.closePath(); g.fill();
        if (o.hi !== false) {
          g.fillStyle = rgba(shade(c, 0.5), 0.28);
          g.beginPath(); g.moveTo(x0 - 1, y0 - 1); g.lineTo(x0 + w * 0.45, y0 - 1); g.lineTo(x0 - 1, y0 + h * 0.4); g.closePath(); g.fill();
        }
        g.restore();
      } else if (o.shadow !== false) {
        g.save();
        tracePoly(g, pts); g.clip();
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        for (const q of pts) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
        const w = x1 - x0, h = y1 - y0;
        dab(g, ellipsePts(x0 + w * 0.85, y0 + h * 0.9, w * 0.62, h * 0.55, 10), shade(c, -0.45), R, { layers: 3, alpha: 0.22, amt: 0.15, edge: 0 });
        if (o.hi !== false) dab(g, ellipsePts(x0 + w * 0.3, y0 + h * 0.25, w * 0.25, h * 0.18, 8), shade(c, 0.45), R, { layers: 2, alpha: 0.3, amt: 0.2, edge: 0 });
        g.restore();
      }
      if (o.ink !== false && (!noInk || o.forceInk)) inkPoly(g, pts, R, { w: o.w ?? 0.55, jitter: 0.12, step: 2.5, alpha: o.inkA ?? 0.9 });
      return p;
    },
    ell(cx, cy, rx, ry, col, o = {}) { return p.shape(ellipsePts(cx, cy, rx, ry, o.n ?? 12, o.rot ?? 0), col, o); },
    poly(arr, col, o) { return p.shape(P(arr), col, o); },
    // a limb: capsule between two points
    limb(x1, y1, x2, y2, w, col, o = {}) {
      const a = Math.atan2(y2 - y1, x2 - x1), nx = -Math.sin(a) * w / 2, ny = Math.cos(a) * w / 2;
      if (piece) {
        const ux = Math.cos(a), uy = Math.sin(a), t = o.taper ?? 0.8, c = w * 0.18;
        const pts = [
          { x: x1 + nx - ux * c, y: y1 + ny - uy * c }, { x: x2 + nx * t, y: y2 + ny * t },
          { x: x2 + nx * t * 0.55 + ux * c, y: y2 + ny * t * 0.55 + uy * c }, { x: x2 - nx * t * 0.55 + ux * c, y: y2 - ny * t * 0.55 + uy * c },
          { x: x2 - nx * t, y: y2 - ny * t }, { x: x1 - nx - ux * c, y: y1 - ny - uy * c },
          { x: x1 - nx * 0.55 - ux * c * 2, y: y1 - ny * 0.55 - uy * c * 2 }, { x: x1 + nx * 0.55 - ux * c * 2, y: y1 + ny * 0.55 - uy * c * 2 },
        ];
        return p.shape(pts, col, { ...o, hi: false });
      }
      const cap = [];
      for (let i = 0; i <= 4; i++) { const t = a + Math.PI / 2 + (i / 4) * Math.PI; cap.push({ x: x1 + Math.cos(t) * w / 2, y: y1 + Math.sin(t) * w / 2 }); }
      const cap2 = [];
      for (let i = 0; i <= 4; i++) { const t = a - Math.PI / 2 + (i / 4) * Math.PI; cap2.push({ x: x2 + Math.cos(t) * w / 2, y: y2 + Math.sin(t) * w / 2 }); }
      return p.shape([...cap, ...cap2], col, { ...o, hi: false });
    },
    line(arr, w = 0.6, col = INK, o = {}) {
      // in piece mode a plain ink line is a detail stroke (seams, mouths): softer
      if (piece && col === INK) { col = '#4a3a40'; w *= 0.8; }
      ink(g, P(arr), R, { w, color: col, jitter: o.jitter ?? 0.1, step: 2, alpha: (o.alpha ?? 0.95) * (piece && col === '#4a3a40' ? 0.7 : 1), noTaper: o.noTaper });
      return p;
    },
    dot(x, y, r, col, a = 1) { g.fillStyle = rgba(col, a); g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); return p; },
    // soft glow (magic, eyes)
    glow(x, y, r, col, a = 0.6) {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, rgba(col, a)); gr.addColorStop(1, rgba(col, 0));
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); return p;
    },
    wash(x, y, rx, ry, col, a = 0.2) { dab(g, ellipsePts(x, y, rx, ry, 10), typeof col === 'string' ? rgb(col) : col, R, { layers: 3, alpha: a, amt: 0.3, edge: 0.3 }); return p; },
  };
  return p;
}

// a clump of leaves: a ragged star of points rather than a circle
export function leafClump(cx, cy, rx, ry, R, n = 13) {
  const pts = [];
  const rot = R() * 6;
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i / (n * 2)) * Math.PI * 2;
    const k = i % 2 ? 0.74 + R() * 0.08 : 0.95 + R() * 0.12;
    pts.push({ x: cx + Math.cos(a) * rx * k, y: cy + Math.sin(a) * ry * k });
  }
  return pts;
}

// ------------------------------------------------------------------ sheet plumbing
// smooth closed path through polygon points (rounder, more brush-like fills)
function traceSmoothPts(g, pts) {
  const n = pts.length;
  if (n < 5) { tracePoly(g, pts); return; }
  g.beginPath();
  g.moveTo((pts[n - 1].x + pts[0].x) / 2, (pts[n - 1].y + pts[0].y) / 2);
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; g.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2); }
  g.closePath();
}

function bake(w, h, ax, ay, draw, o = {}) {
  // w,h,ax,ay in map px; ax/ay = anchor (feet) inside the box
  const W2 = Math.ceil(w * SS), H2 = Math.ceil(h * SS);
  const body = makeCanvas(W2, H2);
  const bg = body.getContext('2d');
  bg.scale(SS, SS);
  bg.translate(ax, ay);
  const prev = MODE;
  MODE = { piece: true };
  try { draw(bg); } finally { MODE = prev; }

  // one soft dark edge around the whole silhouette
  const rimCol = o.rim ?? 'rgba(38,28,40,1)';
  const mask = makeCanvas(W2, H2);
  const mg = mask.getContext('2d');
  mg.drawImage(body, 0, 0);
  // only solid paint gets an edge: thin washes, shadows and glows don't
  const id = mg.getImageData(0, 0, W2, H2), d = id.data;
  const [rr, rg, rb] = o.rimRGB ?? [38, 28, 40];
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] > 150 ? 255 : 0;
    d[i] = rr; d[i + 1] = rg; d[i + 2] = rb; d[i + 3] = a;
  }
  mg.putImageData(id, 0, 0);

  const c = makeCanvas(W2, H2);
  const g = c.getContext('2d');
  const r = (o.rimW ?? 0.75) * SS;
  g.globalAlpha = o.rimA ?? 0.85;
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.drawImage(mask, Math.cos(a) * r, Math.sin(a) * r); }
  g.globalAlpha = 1;
  g.drawImage(body, 0, 0);

  // light from the upper left across the whole figure, as one piece
  g.globalCompositeOperation = 'source-atop';
  const top = (ay - h) * SS, ground = ay * SS;
  const gr = g.createLinearGradient(0, ay * SS - h * SS * 0.95, W2 * 0.25, ground);
  gr.addColorStop(0, 'rgba(255,248,225,0.22)');
  gr.addColorStop(0.45, 'rgba(255,248,225,0)');
  gr.addColorStop(1, 'rgba(40,28,50,0.28)');
  g.fillStyle = gr;
  g.fillRect(0, 0, W2, H2);
  // a little paper grain inside the paint so it isn't flat digital colour
  const R = rng(w * 13 + h);
  for (let i = 0; i < W2 * H2 / 60; i++) {
    g.fillStyle = R() < 0.5 ? 'rgba(255,250,235,0.08)' : 'rgba(40,30,40,0.07)';
    g.fillRect(R() * W2, R() * H2, 1.5, 1.5);
  }
  g.globalCompositeOperation = 'source-over';
  // cast-shadow silhouette: sharp where it touches the ground, softer and
  // fainter the further it reaches (a real penumbra), as an alpha mask
  const sh = makeCanvas(W2, H2);
  const shg = sh.getContext('2d');
  shg.filter = `blur(${(2.4 * SS).toFixed(1)}px)`;
  shg.drawImage(mask, 0, 0);
  shg.filter = 'none';
  const sharp = makeCanvas(W2, H2);
  const sp = sharp.getContext('2d');
  sp.filter = `blur(${(0.5 * SS).toFixed(1)}px)`;
  sp.drawImage(mask, 0, 0);
  sp.filter = 'none';
  sp.globalCompositeOperation = 'destination-in';
  const feet = ay * SS, reach = Math.max(8, (ay - (o.shTop ?? 0)) * SS);
  const fade = sp.createLinearGradient(0, feet, 0, feet - reach);
  fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(0.55, 'rgba(0,0,0,0)');
  sp.fillStyle = fade; sp.fillRect(0, 0, W2, H2);
  shg.drawImage(sharp, 0, 0);
  shg.globalCompositeOperation = 'destination-in';
  const far = shg.createLinearGradient(0, feet, 0, 0);
  far.addColorStop(0, 'rgba(0,0,0,1)'); far.addColorStop(1, 'rgba(0,0,0,0.55)');
  shg.fillStyle = far; shg.fillRect(0, 0, W2, H2);
  return { c, sh, w, h, ax, ay };
}

// ------------------------------------------------------------------ humanoid
// One rig for every two-legged figure. Options pick the outfit.
function humanoid(p, o, ph, atk) {
  const s = o.scale ?? 1;
  const g = p.g;
  g.save();
  g.scale(s, s);
  const walk = Math.sin(ph * TAU);
  const bob = Math.abs(Math.cos(ph * TAU)) * 0.8;
  const hunch = o.hunch ?? 0;
  const hipY = -10 - bob * 0.5;
  const legL = 10;
  const sw = walk * 0.45;
  const skin = o.skin ?? '#e8b98f';
  const legCol = o.legs ?? '#6b5a4a';
  const boot = o.boots ?? '#3c3029';
  // back leg
  const leg = (sign, dark) => {
    const a = Math.PI / 2 + sign * sw;
    const kx = Math.cos(a) * legL * 0.55, ky = Math.sin(a) * legL * 0.55;
    const fx = Math.cos(a) * legL, fy = Math.sin(a) * legL;
    const col = dark ? shade(legCol, -0.25) : legCol;
    if (o.robe || o.noLegs) return;
    p.limb(-1 + sign * 1.5, hipY, -1 + sign * 1.5 + kx, hipY + ky, 3.6 * (o.thick ?? 1), col);
    p.limb(-1 + sign * 1.5 + kx, hipY + ky, -1 + sign * 1.5 + fx, Math.min(0, hipY + fy), 3.2 * (o.thick ?? 1), col);
    const bx = -1 + sign * 1.5 + fx, by = Math.min(0, hipY + fy), k = o.thick ?? 1;
    p.poly([[bx - 1.7 * k, by], [bx + 3.6 * k, by], [bx + 3.4 * k, by - 1.3], [bx + 1.2 * k, by - 2.4], [bx - 1.5 * k, by - 2.8]], dark ? shade(boot, -0.2) : boot, { hi: false });
  };
  leg(-1, true);
  // cape behind
  if (o.cape) p.poly([[-3, -24 - hunch], [3, -24 - hunch], [5 - walk, -4], [-9 - walk * 1.5, -3], [-8, -14]], o.cape, { hi: false });
  // back arm
  const armY = -21 - hunch * 0.6 + bob * 0.3;
  const armCol = o.sleeve ?? o.body;
  const backSw = -walk * 0.5;
  if (!o.noArms) p.limb(-2, armY, -2 + Math.sin(backSw) * 6, armY + Math.cos(backSw) * 8, 3 * (o.thick ?? 1), shade(armCol, p.piece ? -0.3 : -0.2));
  leg(1, false);
  // torso
  const tw = (o.wide ?? 1) * 6.2, th = 8;
  if (o.robe) {
    const hem = 0;
    p.poly([[-tw * 0.8, -24 - hunch], [tw * 0.8, -24 - hunch], [tw * 1.15 + walk, hem], [-tw * 1.15 + walk, hem]], o.body);
    if (o.robeTrim) p.line([[-tw * 1.1 + walk, -1], [tw * 1.1 + walk, -1]], 1.2, o.robeTrim);
  } else {
    const cx = hunch * 0.6, cy = -16 - bob * 0.4 - hunch * 0.5, bh = th + (o.belly ? 1.5 : 0), bl = o.belly ? 1.6 : 0;
    p.poly([[cx - tw * 0.98, cy - bh + 2.2], [cx - tw * 0.62, cy - bh], [cx + tw * 0.62, cy - bh], [cx + tw * 0.98, cy - bh + 2.2],
      [cx + tw * 0.8 + bl, cy + bh * 0.35], [cx + tw * 0.86 + bl * 0.6, cy + bh], [cx - tw * 0.84, cy + bh], [cx - tw * 0.78, cy + bh * 0.35]], o.body);
    if (o.belt) p.line([[-tw + 1 + hunch * 0.6, -12 - bob * 0.4], [tw - 1 + hunch * 0.6, -12.6 - bob * 0.4]], 1.3, o.belt);
    if (o.tabard) p.poly([[-2.6, -21], [2.6, -21], [3, -9], [0, -7.5], [-3, -9]].map(q => [q[0] + hunch * 0.6, q[1] - bob * 0.4]), o.tabard, { hi: false });
    if (o.emblem) p.dot(hunch * 0.6, -16 - bob * 0.4, 1.2, o.emblem);
  }
  // head
  const hx = 1 + hunch * 1.4, hy = -28.5 - bob * 0.5 + hunch * 0.9;
  const hr = 4.6 * (o.headScale ?? 1);
  drawHead(p, o, hx, hy, hr, ph);
  // front arm + weapon
  if (!o.noArms) {
    let ang = walk * 0.5;
    // attack beat 0..1: wind up, strike, follow through, settle
    if (atk) {
      const L = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));
      ang = atk < 0.45 ? L(0.3, -2.5, atk / 0.45) : atk < 0.62 ? L(-2.5, 1.25, (atk - 0.45) / 0.17) : L(1.25, 0.35, (atk - 0.62) / 0.38);
    }
    if (o.weapon === 'bow') ang = -1.2;
    const sx = 2 + hunch * 0.6, sy = armY;
    const ex = sx + Math.sin(ang + 0.3) * 4, ey = sy + Math.cos(ang + 0.3) * 4.5;
    const hx2 = ex + Math.sin(ang) * 4.4, hy2 = ey + Math.cos(ang) * 4.4;
    if (o.shield && !atk) drawShield(p, o, 4 + hunch, -17 - bob * 0.4);
    p.limb(sx, sy, ex, ey, 3.1 * (o.thick ?? 1), p.piece ? shade(armCol, 0.16) : armCol);
    p.limb(ex, ey, hx2, hy2, 2.8 * (o.thick ?? 1), p.piece ? shade(armCol, 0.16) : armCol);
    p.ell(hx2, hy2, 1.7 * (o.thick ?? 1), 1.7 * (o.thick ?? 1), o.glove ?? skin, { hi: false, shadow: false });
    drawWeapon(p, o.weapon, hx2, hy2, ang, o, atk);
    if (o.shield && atk) drawShield(p, o, 3 + hunch, -16);
  }
  g.restore();
}

function drawShield(p, o, x, y) {
  const s = o.shield;
  if (s.kind === 'round') {
    p.ell(x + 2.5, y, 5, 5.6, s.col);
    p.ell(x + 2.5, y, 1.5, 1.5, s.boss ?? '#c9a24a', { shadow: false });
  } else {
    p.poly([[x - 1.5, y - 6.5], [x + 6.5, y - 6.5], [x + 6.8, y + 1], [x + 2.5, y + 7.5], [x - 1.8, y + 1]], s.col);
    if (s.emblem) p.line([[x + 2.5, y - 4.5], [x + 2.5, y + 4]], 1.1, s.emblem).line([[x - 0.2, y - 1.5], [x + 5.2, y - 1.5]], 1.1, s.emblem);
  }
}

function drawHead(p, o, x, y, r, ph) {
  const skin = o.skin ?? '#e8b98f';
  const h = o.head ?? 'bare';
  if (h === 'void') {
    p.ell(x, y, r * 1.05, r * 1.15, '#1c1822');
  } else {
    p.ell(x, y, r, r * 1.05, skin);
  }
  // face
  const eye = (ex, ey) => p.dot(ex, ey, 0.6, '#1d1620');
  if (h === 'goblin') {
    // ears + big eyes
    p.poly([[x - r * 0.7, y - 1], [x - r * 2.1, y - 3.2], [x - r * 0.7, y + 1.4]], skin, { shadow: false });
    p.dot(x + r * 0.45, y - 0.6, 1.3, '#f6efd8').dot(x + r * 0.6, y - 0.6, 0.6, '#14101a');
    p.dot(x - r * 0.05, y - 0.6, 1.1, '#f6efd8').dot(x + r * 0.08, y - 0.6, 0.5, '#14101a');
    p.line([[x + r * 0.1, y + r * 0.55], [x + r * 0.7, y + r * 0.45]], 0.4);
  } else if (h !== 'void' && h !== 'helm' && h !== 'greathelm' && h !== 'mask') {
    eye(x + r * 0.55, y - 0.4);
    if (o.beard) p.poly([[x - r * 0.3, y + r * 0.2], [x + r * 1.0, y + r * 0.2], [x + r * 0.5, y + r * 1.5 + (o.beardLong ?? 0)], [x - r * 0.1, y + r * 1.2 + (o.beardLong ?? 0) * 0.8]], o.beard, { shadow: false });
  }
  switch (h) {
    case 'straw': // farmer's hat
      p.ell(x, y - r * 0.6, r * 2, r * 0.55, '#d9b85a');
      p.ell(x, y - r * 1.0, r * 0.95, r * 0.75, '#e2c46b');
      break;
    case 'cap':
      p.poly([[x - r, y - r * 0.2], [x - r * 0.8, y - r * 1.2], [x + r * 0.6, y - r * 1.3], [x + r * 1.1, y - r * 0.3]], o.hat ?? '#6a7a8a');
      break;
    case 'kettle':
      p.ell(x, y - r * 0.4, r * 1.6, r * 0.45, o.hat ?? '#8a96a3');
      p.ell(x, y - r * 0.85, r * 1.0, r * 0.8, o.hat ?? '#8a96a3');
      break;
    case 'helm':
      p.ell(x, y - r * 0.15, r * 1.1, r * 1.2, o.hat ?? '#9aa5b0');
      p.line([[x + r * 0.2, y - r * 0.1], [x + r * 1.05, y - r * 0.1]], 0.9, '#1d1620');
      if (o.plume) p.poly([[x - r * 0.1, y - r * 1.1], [x - r * 0.6, y - r * 1.9], [x - r * 1.5, y - r * 2.2], [x - r * 2.3, y - r * 1.7], [x - r * 2.6, y - r * 0.8], [x - r * 2.0, y - r * 0.2], [x - r * 1.6, y - r * 1.0], [x - r * 0.8, y - r * 1.2]], o.plume, { shadow: false });
      break;
    case 'greathelm':
      p.poly([[x - r * 1.1, y + r], [x - r * 1.1, y - r * 0.9], [x, y - r * 1.4], [x + r * 1.1, y - r * 0.9], [x + r * 1.1, y + r]], o.hat ?? '#2b2833');
      p.line([[x + r * 0.15, y - r * 0.15], [x + r * 1.1, y - r * 0.15]], 0.9, o.visor ?? '#c8423b');
      if (o.plume) p.poly([[x - r * 0.1, y - r * 1.3], [x - r * 0.8, y - r * 2.3], [x - r * 2.0, y - r * 2.6], [x - r * 2.9, y - r * 1.8], [x - r * 3.1, y - r * 0.4], [x - r * 2.5, y + r * 0.4], [x - r * 2.0, y - r * 0.8], [x - r * 1.0, y - r * 1.0]], o.plume, { shadow: false });
      break;
    case 'hood':
      p.poly([[x - r * 1.3, y + r * 1.1], [x - r * 1.2, y - r * 0.6], [x - r * 0.2, y - r * 1.5], [x + r * 0.9, y - r * 1.1], [x + r * 1.15, y - r * 0.1], [x + r * 0.2, y - r * 0.3], [x - r * 0.3, y + r * 1.0]], o.hat ?? '#4d6b3a');
      break;
    case 'wizard':
      p.ell(x, y - r * 0.55, r * 2.0, r * 0.5, o.hat ?? '#4f6b3a');
      p.poly([[x - r * 1.1, y - r * 0.7], [x + r * 1.1, y - r * 0.7], [x + r * 0.3, y - r * 2.4], [x - r * 1.2, y - r * 3.6]], o.hat ?? '#4f6b3a');
      if (o.mushrooms) { p.ell(x + r * 0.6, y - r * 1.3, r * 0.55, r * 0.35, '#c4473a', { shadow: false }); p.dot(x + r * 0.55, y - r * 1.38, 0.45, '#fff4e0'); p.ell(x - r * 0.3, y - r * 2.0, r * 0.4, r * 0.26, '#e0a640', { shadow: false }); }
      break;
    case 'antler':
      p.line([[x - r * 0.3, y - r], [x - r * 0.9, y - r * 2.6], [x - r * 1.8, y - r * 3.0]], 0.8, '#d8caa6').line([[x - r * 0.75, y - r * 2.0], [x - r * 0.1, y - r * 2.9]], 0.7, '#d8caa6');
      p.line([[x + r * 0.3, y - r], [x + r * 0.8, y - r * 2.5], [x + r * 1.7, y - r * 2.8]], 0.8, '#d8caa6');
      p.ell(x + r * 0.2, y, r * 0.95, r * 1.0, '#e8dcc0', { shadow: false });
      p.dot(x + r * 0.55, y - r * 0.2, 0.8, '#14101a');
      break;
    case 'mask':
      p.ell(x + r * 0.15, y, r * 1.0, r * 1.1, '#e5dccb');
      p.dot(x + r * 0.55, y - r * 0.15, 0.9, '#14101a');
      break;
    case 'bearhood':
      p.ell(x - r * 0.2, y - r * 0.5, r * 1.25, r * 0.95, '#6b4a33');
      p.ell(x - r * 0.8, y - r * 1.3, r * 0.4, r * 0.4, '#6b4a33', { shadow: false });
      p.ell(x + r * 0.5, y - r * 1.35, r * 0.4, r * 0.4, '#6b4a33', { shadow: false });
      break;
    case 'braid':
      p.ell(x - r * 0.25, y - r * 0.35, r * 1.05, r * 0.85, o.hair ?? '#b0582f', { shadow: false });
      p.limb(x - r * 0.9, y, x - r * 1.5, y + r * 1.6, 1.6, o.hair ?? '#b0582f');
      if (o.hat) p.poly([[x - r * 1.3, y + r * 0.6], [x - r * 1.2, y - r * 0.7], [x - r * 0.1, y - r * 1.4], [x + r * 0.9, y - r * 1.0], [x + r * 0.5, y - r * 0.4], [x - r * 0.6, y - r * 0.2]], o.hat, { shadow: false });
      break;
    case 'crown':
      p.poly([[x - r * 1.1, y - r * 0.7], [x - r * 1.2, y - r * 2.0], [x - r * 0.5, y - r * 1.3], [x, y - r * 2.4], [x + r * 0.5, y - r * 1.3], [x + r * 1.2, y - r * 2.0], [x + r * 1.1, y - r * 0.7]], '#d8b24a');
      break;
    case 'void':
      p.glow(x + r * 0.4, y - r * 0.1, r * 0.7, o.eyes ?? '#d8b24a', 0.9).dot(x + r * 0.4, y - r * 0.1, 0.7, o.eyes ?? '#ffe08a');
      break;
    case 'troll':
      p.dot(x + r * 0.4, y - r * 0.2, 0.9, '#f2e2a0').dot(x + r * 0.5, y - r * 0.2, 0.45, '#14101a');
      p.poly([[x + r * 0.6, y + r * 0.5], [x + r * 0.9, y - r * 0.3], [x + r * 1.0, y + r * 0.6]], '#f0e7cf', { shadow: false });
      p.poly([[x + r * 0.9, y + r * 0.1], [x + r * 1.7, y + r * 0.3], [x + r * 1.0, y + r * 0.7]], skin, { shadow: false });
      break;
    case 'bare':
    default:
      if (o.hair) p.poly([[x - r * 1.05, y + r * 0.2], [x - r * 0.9, y - r * 0.8], [x + r * 0.1, y - r * 1.2], [x + r * 1.0, y - r * 0.6], [x + r * 0.6, y - r * 0.3], [x - r * 0.4, y - r * 0.2]], o.hair, { shadow: false });
  }
  if (o.crown) p.poly([[x - r * 1.0, y - r * 0.9], [x - r * 1.2, y - r * 2.1], [x - r * 0.5, y - r * 1.4], [x, y - r * 2.5], [x + r * 0.5, y - r * 1.4], [x + r * 1.2, y - r * 2.1], [x + r * 1.0, y - r * 0.9]], '#d8b24a');
  if (o.book) { p.poly([[x + r * 1.6, y + r * 2.6], [x + r * 3.2, y + r * 2.0], [x + r * 3.4, y + r * 3.0], [x + r * 1.8, y + r * 3.6]], '#efe6cf', { shadow: false }); p.glow(x + r * 2.5, y + r * 2.8, r * 1.6, '#e05a8a', 0.35); }
  if (o.tusks) p.poly([[x + r * 0.5, y + r * 0.8], [x + r * 0.75, y + r * 0.1], [x + r * 0.95, y + r * 0.8]], '#f2ead2', { shadow: false });
}

function drawWeapon(p, w, x, y, ang, o, atk) {
  if (!w) return;
  const dx = Math.sin(ang), dy = Math.cos(ang);
  const along = (d) => [x + dx * d, y + dy * d];
  switch (w) {
    case 'pitchfork': {
      const a = along(-12), b = along(8);
      p.line([a, b], 0.9, '#7a5a3a');
      const nx = dy, ny = -dx;
      for (const k of [-1.6, 0, 1.6]) p.line([[b[0] + nx * k, b[1] + ny * k], [b[0] + nx * k + dx * 4, b[1] + ny * k + dy * 4]], 0.6, '#5d6670');
      break;
    }
    case 'spear': case 'quill': {
      const a = along(-11), b = along(13);
      p.line([a, b], 1, w === 'quill' ? '#e8e0d0' : '#7a5a3a');
      if (w === 'quill') p.poly([along(-11), [x - dx * 4 + dy * 2.4, y - dy * 4 - dx * 2.4], along(1)], '#efe8dc', { shadow: false });
      else p.poly([[b[0] + dy * 1.4, b[1] - dx * 1.4], [b[0] + dx * 4, b[1] + dy * 4], [b[0] - dy * 1.4, b[1] + dx * 1.4]], '#aab4bd', { shadow: false });
      break;
    }
    case 'sword': case 'greatsword': case 'holysword': {
      const len = w === 'greatsword' ? 15 : 10;
      const b = along(len);
      p.limb(x + dx * 1, y + dy * 1, b[0], b[1], w === 'greatsword' ? 2.3 : 1.6, w === 'greatsword' ? '#5c5966' : '#c8d1d9', { ink: true });
      p.line([[x + dy * 2.4, y - dx * 2.4], [x - dy * 2.4, y + dx * 2.4]], 1.1, '#8a6a3a');
      if (w === 'holysword') p.glow(b[0], b[1], 5, '#ffe9a0', 0.45);
      break;
    }
    case 'axe': case 'axes': {
      const b = along(9);
      p.line([along(-3), b], 1, '#6b4a2f');
      p.poly([[b[0] - dy * 0.5, b[1] + dx * 0.5], [b[0] + dy * 4.2 - dx * 2.5, b[1] - dx * 4.2 - dy * 2.5], [b[0] + dy * 4.6 + dx * 2.5, b[1] - dx * 4.6 + dy * 2.5]], '#b9c2c9', { shadow: false });
      break;
    }
    case 'club': {
      const b = along(11);
      p.limb(x, y, b[0], b[1], 3.6, '#6e5236');
      p.dot(b[0], b[1], 1.0, '#3a2f2a');
      break;
    }
    case 'bow': {
      const cx = x + 1.5, cy = y;
      p.g.save();
      p.g.strokeStyle = rgba('#6b4a2f', 0.95); p.g.lineWidth = 1.2;
      p.g.beginPath(); p.g.arc(cx - 3, cy, 7.5, -1.05, 1.05); p.g.stroke();
      p.g.strokeStyle = 'rgba(240,235,220,0.8)'; p.g.lineWidth = 0.35;
      p.g.beginPath(); p.g.moveTo(cx - 3 + Math.cos(-1.05) * 7.5, cy + Math.sin(-1.05) * 7.5); p.g.lineTo(cx - 3 + Math.cos(1.05) * 7.5, cy + Math.sin(1.05) * 7.5); p.g.stroke();
      p.g.restore();
      break;
    }
    case 'staff': case 'lantern': case 'leafstaff': {
      const a = along(-10), b = along(10);
      const top = [x - 1.5 + dx * 0, y - 16];
      p.line([[x - 1.5, y + 8], top], 1.1, '#6b4a2f');
      if (w === 'lantern') { p.ell(top[0], top[1] + 1.5, 1.8, 2.2, '#e6c85a'); p.glow(top[0], top[1] + 1.5, 7, '#ffd86a', 0.5); }
      if (w === 'leafstaff') { p.ell(top[0] + 1, top[1] - 1, 2.6, 1.4, '#6fa04a', { rot: -0.6 }); p.glow(top[0], top[1], 6, '#b8f08a', 0.35); }
      if (w === 'staff') p.glow(top[0], top[1], 5, '#9fd3ff', 0.5).dot(top[0], top[1], 1.2, '#cfe8ff');
      break;
    }
    case 'scepter': {
      const top = [x - 1, y - 18];
      p.line([[x - 1, y + 6], top], 1.4, '#2a2230');
      p.poly([[top[0] - 2.5, top[1]], [top[0], top[1] - 6], [top[0] + 2.5, top[1]], [top[0], top[1] + 2]], '#d8b24a');
      p.glow(top[0], top[1] - 2, 8, '#ffcf5a', 0.4);
      break;
    }
  }
}

// ------------------------------------------------------------------ outfits
const OUTFIT = {
  militia: { body: '#9c7b55', legs: '#6b5a4a', head: 'straw', weapon: 'pitchfork', belt: '#5a4330', skin: '#e3b08a' },
  farmer: { body: '#b58b5c', legs: '#5d6a7a', head: 'straw', weapon: 'pitchfork', belt: '#5a4330', skin: '#d9a77e' },
  footman: { body: '#5f7fa6', legs: '#6c645b', head: 'kettle', weapon: 'spear', shield: { col: '#3f5f8c', emblem: '#e2c16b' }, tabard: '#e0d6bd' },
  knight: { body: '#8d98a3', legs: '#6f7880', head: 'helm', hat: '#9aa5b0', plume: '#3e64a8', weapon: 'sword', shield: { col: '#3e64a8', emblem: '#e2c16b' }, tabard: '#3e64a8', boots: '#4a4f57' },
  paladin: { body: '#e8e2cf', legs: '#b8b2a0', head: 'helm', hat: '#e8dfc4', plume: '#e0b440', weapon: 'holysword', shield: { col: '#f3ecd6', emblem: '#d8a93a' }, cape: '#c4433a', boots: '#8c7a4a', tabard: '#d8a93a' },
  berserker: { body: '#9a6b4b', legs: '#5b4636', head: 'bearhood', weapon: 'axes', skin: '#e6b08e', beard: '#b4532a', thick: 1.15, wide: 1.15, belt: '#3a2c22' },
  wren: { body: '#a4adb7', legs: '#6c7680', head: 'helm', hat: '#b4bdc6', plume: '#f2ecdf', weapon: 'sword', shield: { col: '#a8352e', emblem: '#f2ecdf' }, cape: '#a8352e', tabard: '#a8352e', boots: '#4a3b30', scale: 1.15 },
  ysolde: { body: '#5e7b45', legs: '#6b5a42', head: 'braid', hair: '#b0582f', hat: '#4a6b36', weapon: 'bow', cape: '#3f5c32', skin: '#eac09a', scale: 1.08, belt: '#5a4330' },
  moss: { body: '#5c7a45', legs: '#5c7a45', robe: true, robeTrim: '#8fb05a', head: 'wizard', hat: '#4c6a3a', mushrooms: true, beard: '#e8e2d0', beardLong: 3, weapon: 'leafstaff', skin: '#e6b892', scale: 1.1 },
  // the warriors for hire (2026-10-07)
  tamsin: { body: '#2e2a3c', legs: '#24202e', head: 'bare', hair: '#1c1822', weapon: 'sword', cape: '#a8352e', skin: '#e3b08a', belt: '#8a5a30', boots: '#3a2a20', scale: 1.05 },
  hob: { body: '#5f7050', legs: '#4a4638', head: 'cap', hat: '#c89a3a', beard: '#dcd4c2', beardLong: 2, weapon: 'spear', skin: '#d7a27a', belt: '#5a4330', boots: '#3a3226', thick: 1.12, wide: 1.08, scale: 1.08 },
  vermilia: { body: '#b8402f', legs: '#8a2f24', robe: true, robeTrim: '#e8b04a', head: 'braid', hair: '#2a1e1a', hat: '#9a2e24', weapon: 'scepter', cape: '#e8b04a', skin: '#eac09a', scale: 1.06 },
  bramwell: { body: '#7a6a50', legs: '#5a5040', head: 'greathelm', hat: '#8a9098', visor: '#e0c060', plume: '#5a3a8a', weapon: 'sword', shield: { col: '#5a3a8a', emblem: '#e0c060' }, tabard: '#5a3a8a', boots: '#3a3430', glove: '#8a9098', scale: 1.24, thick: 1.3, wide: 1.25 },
  umber: { body: '#6a4a2a', legs: '#5a3e24', robe: true, robeTrim: '#b8862a', head: 'wizard', hat: '#4a3220', beard: undefined, hair: '#d8d0c0', weapon: 'lantern', skin: '#c8a07a', hunch: 2, scale: 1.04 },
  // enemies built on the same rig
  inkling: { body: '#3b3550', legs: '#3b3550', skin: '#4a4268', head: 'goblin', weapon: 'spear', boots: '#2a2438', scale: 0.82, headScale: 1.2 },
  quill: { body: '#6b4a5f', legs: '#3d3348', skin: '#5a5078', head: 'goblin', hat: '#5a3d4f', weapon: 'bow', boots: '#2a2438', scale: 0.86, headScale: 1.15, cape: '#5a3d4f' },
  brute: { body: '#4c5a3a', legs: '#3a3a30', skin: '#6f8a4f', head: 'bare', tusks: true, weapon: 'club', scale: 1.3, hunch: 3, thick: 1.35, wide: 1.25, belt: '#2b2620', belly: true, boots: '#2a2620' },
  ironsmudge: { body: '#55606b', legs: '#4a535d', head: 'greathelm', hat: '#4d5761', visor: '#a084d8', weapon: 'sword', shield: { col: '#4d5761', emblem: '#2a2230' }, scale: 1.25, thick: 1.25, wide: 1.2, boots: '#3a4048', glove: '#4d5761' },
  shaman: { body: '#5b6a3c', legs: '#5b6a3c', robe: true, robeTrim: '#d9c46a', skin: '#6a7a52', head: 'antler', weapon: 'lantern', scale: 0.95 },
  hknight: { body: '#2c2a38', legs: '#25232f', head: 'greathelm', hat: '#2c2a38', visor: '#c8423b', plume: '#c8423b', weapon: 'greatsword', scale: 1.4, thick: 1.3, wide: 1.25, boots: '#1d1b25', cape: '#5a1e22', glove: '#2c2a38' },
  shade: { body: '#33284a', legs: '#33284a', robe: true, robeTrim: '#e05a8a', head: 'void', eyes: '#e05a8a', weapon: 'quill', book: true, cape: '#4a3a66', scale: 1.1, skin: '#33284a' },
  troll: { body: '#56704a', legs: '#4f6440', skin: '#6c8a55', head: 'troll', weapon: 'club', scale: 2.4, hunch: 4, thick: 1.5, wide: 1.4, belly: true, belt: '#5a4330', boots: '#4f6440', glove: '#6c8a55' },
  hollowking: { body: '#1e1a28', legs: '#1e1a28', robe: true, robeTrim: '#d8b24a', head: 'void', eyes: '#ffd86a', weapon: 'scepter', cape: '#2e1e3a', crown: true, scale: 2.4, wide: 1.2, skin: '#1e1a28' },
};

// ------------------------------------------------------------------ non-humanoid creatures
function drawCreature(p, kind, ph, atk) {
  const g = p.g;
  const walk = Math.sin(ph * TAU);
  switch (kind) {
    case 'scuttler': {
      const s = 0.9;
      g.save(); g.scale(s, s);
      for (let i = 0; i < 3; i++) {
        const o = Math.sin(ph * TAU + i * 2) * 2;
        p.line([[-4 + i * 4, -4], [-6 + i * 4 + o, 0]], 0.7).line([[-4 + i * 4, -4], [-2 + i * 4 - o, 0]], 0.7);
      }
      p.ell(0, -6, 7.5, 4.6, '#4a3b3b');
      p.line([[0, -10.4], [0.5, -2]], 0.5, '#2a2020');
      p.ell(7, -6.5, 2.6, 2.3, '#3a2c2c');
      p.dot(8.2, -7.2, 0.7, '#f0a070');
      p.line([[8.5, -8.5], [12, -12 + walk]], 0.4).line([[8, -8.5], [10, -13 - walk]], 0.4);
      p.wash(-2, -8, 3, 1.5, '#b0533d', 0.25);
      g.restore();
      break;
    }
    case 'crow': {
      const flap = Math.sin(ph * TAU);
      const wingY = -flap * 9;
      p.poly([[-2, -2], [-10, wingY - 2], [-16, wingY + 1], [-11, wingY + 3], [-6, wingY + 4], [-1, 1]], '#3a3442', { hi: false });
      p.ell(0, 0, 8, 4.2, '#2f2a35');
      p.poly([[-7, -1], [-14, -3], [-13, 2], [-7, 2]], '#2f2a35', { shadow: false });
      p.ell(7, -2.5, 3.6, 3.2, '#2f2a35');
      p.poly([[10, -3], [15, -1.6], [10, -0.8]], '#d4a04a', { shadow: false });
      p.dot(8.4, -3.4, 0.8, '#f2d27a');
      p.poly([[2, -2], [-6, wingY - 4], [-12, wingY], [-8, wingY + 3], [-3, wingY + 4], [3, 1]], '#463f52');
      // rag tatters
      p.line([[-12, wingY + 2], [-14, wingY + 6]], 0.5).line([[-8, wingY + 3], [-9, wingY + 7]], 0.5);
      break;
    }
    case 'wraith': {
      const b = Math.sin(ph * TAU) * 1.5;
      g.save(); g.globalAlpha = 0.85;
      p.wash(0, -6, 9, 4, '#4b6f7a', 0.2);
      p.poly([[-7, -22 + b], [7, -22 + b], [10, -6 + b], [8, 0], [4, -3], [1, 1], [-3, -3], [-7, 1], [-10, -6 + b]], '#5f8792', { inkA: 0.5 });
      p.ell(0, -25 + b, 6.3, 6.5, '#6f98a3', { inkA: 0.5 });
      p.poly([[-6.5, -24 + b], [0, -33 + b], [6.5, -24 + b], [4, -21 + b], [-4, -21 + b]], '#4b6f7a', { inkA: 0.5 });
      g.restore();
      p.glow(1.8, -24.5 + b, 4.5, '#9fd3d6', 0.7).dot(1.2, -24.5 + b, 0.9, '#e8ffff').dot(4.2, -24.5 + b, 0.9, '#e8ffff');
      p.limb(5, -16 + b, 11 + (atk ? 4 : 0), -12 + b, 2.6, '#6f98a3', { inkA: 0.5 });
      break;
    }
    case 'splotch': {
      const sq = Math.sin(ph * TAU) * 0.08;
      const pts = [];
      for (let i = 0; i < 16; i++) {
        const a = Math.PI + (i / 15) * Math.PI;
        const wob = 1 + Math.sin(i * 2.7 + ph * TAU) * 0.08;
        pts.push({ x: Math.cos(a) * 13 * (1 + sq) * wob, y: Math.sin(a) * 15 * (1 - sq) * wob });
      }
      pts.push({ x: 13, y: 0 }, { x: 8, y: 2 }, { x: 3, y: 0.5 }, { x: -2, y: 2.5 }, { x: -8, y: 1 });
      p.shape(pts, '#3a3150');
      p.wash(-3, -10, 5, 4, '#8d7cc4', 0.3);
      for (const [ex, ey, r] of [[3, -9, 2.4], [8, -6, 1.8], [-3, -12, 1.5], [6, -13, 1.3]]) { p.dot(ex, ey, r, '#f3ecd8').dot(ex + r * 0.3, ey, r * 0.45, '#14101a'); }
      p.line([[1, -3], [8, -3.5]], 0.6, '#f3ecd8');
      break;
    }
    case 'hound': {
      const s = 1.1;
      g.save(); g.scale(s, s);
      const run = Math.sin(ph * TAU);
      p.limb(-7, -8, -9 - run * 4, 0, 2.4, '#4a3628');
      p.limb(6, -8, 4 + run * 4, 0, 2.4, '#4a3628');
      p.ell(0, -10, 10, 4.6, '#5c4433');
      p.limb(-7, -8, -9 + run * 4, 0, 2.6, '#5c4433');
      p.limb(6, -8, 8 - run * 4, 0, 2.6, '#5c4433');
      p.poly([[-9, -11], [-15, -15 - run * 2], [-14, -12], [-9, -9]], '#5c4433', { shadow: false });
      p.ell(11, -14, 4.6, 3.6, '#5c4433');
      p.poly([[13, -15], [19, -13.4], [18.5, -11.5], [13, -11.6]], '#5c4433', { shadow: false });
      p.poly([[9, -17], [10, -21.5], [12, -17.5]], '#3e2c22', { shadow: false });
      p.dot(13, -15.4, 0.75, '#ffb070');
      p.poly([[16, -11.5], [17.5, -8 - (atk ? 1 : 0)], [15.5, -11]], '#1c1424', { shadow: false });
      p.wash(-2, -12, 6, 2.5, '#1c1424', 0.35);
      g.restore();
      break;
    }
    case 'moth': {
      const flap = Math.sin(ph * TAU);
      const wy = flap * 6;
      p.poly([[0, -1], [-6, -6 - wy], [-11, -3 - wy], [-8, 1], [-1, 1]], '#7b6ea0', { hi: false });
      p.ell(0, 0, 4.5, 2, '#3e3552');
      p.poly([[0, -1], [-4, -8 - wy], [-10, -7 - wy], [-7, -1], [0, 1]], '#c9b7e8');
      p.dot(-5, -5 - wy * 0.8, 1.1, '#4a4060');
      p.line([[4, -1], [7, -4]], 0.4).line([[4, -1], [7.5, -2]], 0.4);
      break;
    }
    case 'golem': {
      const s = 1.55;
      g.save(); g.scale(s, s);
      const w = Math.sin(ph * TAU);
      p.poly([[-7 - w, 0], [-8, -9], [-3, -10], [-2 - w, 0]], '#4a4552');
      p.poly([[2 + w, 0], [1, -10], [6, -9], [7 + w, 0]], '#55505e');
      p.poly([[-10, -9], [-11, -22], [-5, -28], [6, -28], [11, -22], [10, -9], [0, -7]], '#5a5466');
      p.poly([[-3, -27], [-4, -34], [3, -35], [6, -30], [5, -26]], '#4f4a5a');
      p.dot(3.5, -31, 1.1, '#c9a8ff');
      p.glow(3.5, -31, 4, '#a07ae0', 0.5);
      // ink cracks
      p.line([[-6, -24], [-2, -18], [-5, -12]], 0.7, '#8f6ad0').line([[4, -22], [6, -15]], 0.6, '#8f6ad0');
      const a = atk ? -1.5 : w * 0.3;
      p.limb(9, -24, 13 + Math.sin(a) * 2, -14 + Math.cos(a) * 0, 5, '#5f596c');
      p.ell(14 + Math.sin(a) * 3, -9 - (atk ? 6 : 0), 4, 3.6, '#4f4a5a');
      p.limb(-9, -24, -13, -14, 5, '#4f4a5a');
      // moss
      p.wash(-4, -27, 4, 1.5, '#6b8a4a', 0.4);
      g.restore();
      break;
    }
    case 'brood': {
      const s = 1.4;
      g.save(); g.scale(s, s);
      for (let i = 0; i < 4; i++) {
        const o = Math.sin(ph * TAU + i * 1.6) * 2.5;
        p.line([[-8 + i * 5, -5], [-11 + i * 5 + o, 0]], 0.9).line([[-8 + i * 5, -5], [-5 + i * 5 - o, 0]], 0.9);
      }
      p.ell(-6, -9, 9, 6.5, '#d8c7a6');  // egg sac
      for (const [ex, ey] of [[-10, -10], [-6, -12], [-4, -7], [-9, -6]]) p.ell(ex, ey, 2, 1.6, '#efe2c6', { shadow: false, w: 0.35 });
      p.ell(4, -9, 9, 6, '#4a3536');
      p.wash(3, -12, 5, 2, '#c0604a', 0.35);
      p.ell(13, -9.5, 3.8, 3.4, '#3a2829');
      p.dot(15, -10.5, 0.9, '#ff9a6a');
      p.line([[15.5, -7], [18.5, -6 + (atk ? 2 : 0)]], 0.9).line([[15.5, -8], [18.5, -9.5]], 0.9);
      g.restore();
      break;
    }
    case 'gargoyle': {
      const flap = Math.sin(ph * TAU);
      const wy = -flap * 8;
      p.poly([[-2, -6], [-12, wy - 10], [-20, wy - 4], [-16, wy - 1], [-12, wy + 1], [-8, wy], [-2, -2]], '#4a4650', { hi: false });
      p.ell(0, -3, 7, 6, '#5a5560');
      p.ell(6, -9, 4.4, 4.2, '#5a5560');
      p.poly([[4, -12.5], [3, -17], [6, -13]], '#3f3b45', { shadow: false });
      p.poly([[8, -12.5], [9.5, -16.5], [9.5, -12]], '#3f3b45', { shadow: false });
      p.dot(8, -9.5, 0.8, '#ff6a4a');
      p.poly([[-6, 1], [-14, 5], [-9, 0]], '#5a5560', { shadow: false });
      p.limb(3, 1, 6, 6, 2.2, '#4f4a55');
      p.poly([[2, -7], [-8, wy - 12], [-16, wy - 7], [-12, wy - 3], [-6, wy - 2], [3, -2]], '#6a6570');
      break;
    }
    case 'matron': {
      const flap = Math.sin(ph * TAU);
      const wy = flap * 5;
      const s = 2.0;
      g.save(); g.scale(s, s);
      // back wings
      p.poly([[0, -18], [-14, -30 - wy], [-22, -22 - wy], [-18, -10], [-6, -12]], '#6f5ea0', { hi: false });
      p.poly([[0, -12], [-12, -4 - wy * 0.5], [-14, 2], [-6, 0]], '#5c4c8a', { hi: false });
      // body
      p.poly([[-3, -22], [4, -22], [6, -6], [3, 0], [-2, 0], [-5, -6]], '#4c3f68');
      p.ell(1, -26, 4.5, 4.5, '#5a4b7a');
      p.poly([[-2, -29], [-1, -33], [1, -30], [3, -34], [4, -29]], '#e3c9ff', { shadow: false });
      p.glow(2.5, -26.5, 4, '#f0dcff', 0.8).dot(2.5, -26.5, 0.8, '#ffffff');
      p.line([[3, -30], [8, -36], [10, -35]], 0.5).line([[2, -30], [5, -37], [7, -37]], 0.5);
      // front wings with eye spots
      p.poly([[1, -18], [16, -34 - wy], [26, -26 - wy], [22, -12], [8, -12]], '#8a78c0');
      p.ell(17, -24 - wy * 0.8, 3.5, 3, '#e3c9ff', { shadow: false }); p.dot(17.5, -24 - wy * 0.8, 1.4, '#2a2040');
      p.poly([[1, -12], [14, -6 - wy * 0.5], [16, 2], [6, 0]], '#7a68b0');
      p.ell(10, -4, 2, 1.8, '#e3c9ff', { shadow: false });
      g.restore();
      p.glow(0, -40, 40, '#c9b7e8', 0.12);
      break;
    }
    case 'elemental': {
      const b = Math.sin(ph * TAU) * 1;
      const cols = ['#d9534a', '#e8b33c', '#4f86c6', '#6aa84f'];
      p.limb(-4, -10, -5 - walk * 2, 0, 4, cols[2]);
      p.limb(3, -10, 4 + walk * 2, 0, 4, cols[3]);
      p.ell(0, -17 + b, 8.5, 9, cols[0]);
      p.wash(-3, -20 + b, 4, 3, cols[1], 0.5);
      p.wash(4, -13 + b, 3, 3, cols[2], 0.5);
      p.ell(1, -29 + b, 5, 4.6, cols[1]);
      p.dot(3, -29.5 + b, 1, '#fff7e0').dot(3.2, -29.5 + b, 0.5, '#1a1420');
      const a = atk ? -1.8 : 0.4;
      p.limb(6, -21 + b, 10 + Math.sin(a) * 5, -15 + Math.cos(a) * 3, 4, cols[3]);
      // drips
      p.dot(-6, -6, 1, cols[0], 0.8).dot(7, -9, 0.8, cols[2], 0.8);
      break;
    }
  }
}

// ------------------------------------------------------------------ unit sheets
const UNIT_BOX = {
  // [w, h, ax, ay] in map px, generous so outlines aren't clipped
  default: [44, 46, 22, 42],
  brute: [56, 58, 28, 54], ironsmudge: [56, 60, 28, 56], hknight: [66, 70, 33, 66],
  troll: [110, 110, 55, 104], hollowking: [100, 120, 50, 114], matron: [150, 140, 70, 116],
  golem: [80, 80, 40, 76], brood: [72, 50, 36, 44], splotch: [60, 50, 30, 46], gargoyle: [56, 50, 28, 40],
  crow: [48, 40, 24, 26], moth: [32, 30, 16, 20], scuttler: [40, 28, 20, 24], hound: [56, 40, 26, 36],
  wren: [52, 56, 26, 52], moss: [52, 64, 26, 60], ysolde: [50, 54, 25, 50],
  tamsin: [50, 54, 25, 50], hob: [52, 56, 26, 52], vermilia: [50, 58, 25, 54], bramwell: [60, 64, 30, 60], umber: [52, 62, 26, 58], elemental: [48, 52, 24, 48],
};

const FRAMES = 12;
export const ATK_BEATS = [0.2, 0.4, 0.55, 0.72, 0.9];
const sheets = {};

export function unitSheet(look) {
  if (sheets[look]) return sheets[look];
  const box = UNIT_BOX2[look] || UNIT_BOX[look] || UNIT_BOX.default;
  const walk = [], atk = [];
  for (let i = 0; i < FRAMES; i++) {
    walk.push(bake(box[0], box[1], box[2], box[3], g => drawLook(g, look, i / FRAMES, 0, i)));
  }
  for (const beat of ATK_BEATS) atk.push(bake(box[0], box[1], box[2], box[3], g => drawLook(g, look, 0, beat, 10)));
  sheets[look] = { walk, atk };
  return sheets[look];
}

function drawLook(g, look, ph, atk, seedOff) {
  // same seed per look so frames share brushwork; tiny variation per frame keeps it alive
  const R = rng(hashStr(look) + seedOff * 0);
  const p = painter(g, R);
  // ground shadow is drawn live, not baked
  if (OUTFIT[look]) humanoid(p, OUTFIT[look], ph, atk);
  else if (OUTFIT2[look]) humanoid(p, OUTFIT2[look], ph, atk);
  else if (!drawCreature2(p, look, ph, atk, humanoid, OUTFIT)) drawCreature(p, look, ph, atk);
}

function hashStr(s) { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 100000; }

// ------------------------------------------------------------------ towers
// Towers are 76 x 96 map px, anchored at the plot centre.
const TW = 84, TH = 108, TAX = 42, TAY = 86;
const towerCache = {};

export function towerSprite(id) {
  if (towerCache[id]) return towerCache[id];
  const s = bake(TW, TH, TAX, TAY, g => {
    const R = rng(hashStr(id));
    const p = painter(g, R);
    drawTower(p, id);
  });
  towerCache[id] = s;
  return s;
}

const STONE = '#b9b0a2', STONE_D = '#8f877b', WOOD = '#8a6a48', WOOD_D = '#6a4e34', THATCH = '#c9a55a', SLATE = '#5c6a7a';

function stoneCourses(p, x0, y0, x1, y1, rows = 4) {
  const h = (y1 - y0) / rows;
  for (let r = 1; r < rows; r++) p.line([[x0 + 1, y0 + r * h], [x1 - 1, y0 + r * h]], 0.35, '#6a6258', { alpha: 0.5 });
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? 0.5 : 0;
    for (let c = 1; c < 4; c++) { const x = x0 + (x1 - x0) * (c - off) / 3.5; if (x > x0 + 2 && x < x1 - 2) p.line([[x, y0 + r * h + 0.5], [x, y0 + (r + 1) * h - 0.5]], 0.3, '#6a6258', { alpha: 0.45 }); }
  }
}
function crenels(p, x0, x1, y, col, n = 4) {
  const w = (x1 - x0) / (n * 2 - 1);
  for (let i = 0; i < n; i++) p.poly([[x0 + i * 2 * w, y], [x0 + i * 2 * w + w, y], [x0 + i * 2 * w + w, y - 5], [x0 + i * 2 * w, y - 5]], col, { hi: false });
}
function banner(p, x, y, col, h = 12) {
  p.line([[x, y], [x, y - h - 6]], 0.7, '#4a3a2a');
  p.poly([[x, y - h - 6], [x + 8, y - h - 4], [x + 6, y - h], [x + 8, y - h + 3], [x, y - h + 1]], col, { hi: false });
}
function plotBase(p, col = '#a08560') {
  p.wash(0, 2, 30, 11, '#3a2a20', 0.18);
  p.ell(0, 0, 27, 10, col, { hi: false });
}

// the new path ids reuse the paintings of the towers they grew out of
const SAME_AS = { marks2: 'archer2', marks3: 'archer3', marks4: 'musket', knight2: 'barracks2', knight3: 'barracks3', knight4: 'paladin',
  raider4: 'berserker', venom4: 'ranger', lens4: 'prism', sorc2: 'mage2', sorc3: 'mage3', sorc4: 'sorcerer', spark4: 'storm',
  bomb2: 'artillery2', bomb3: 'artillery3', bomb4: 'bertha' };
function drawTower(p, id) {
  const g = p.g;
  id = SAME_AS[id] || id;
  if (drawTower2(p, id) !== false) return;
  switch (id) {
    case 'slot': {
      p.wash(0, 1, 26, 9, '#4a3a2a', 0.12);
      p.ell(0, 0, 24, 8.5, '#b09068', { hi: false });
      for (const [x, y] of [[-16, -2], [-8, 4], [6, 4.5], [17, 1], [12, -4], [-3, -5]]) p.ell(x, y, 2.2, 1.5, '#9a958c', { shadow: false, w: 0.35 });
      // stake sign
      p.line([[17, -2], [17, -16]], 0.9, '#6a4e34');
      p.poly([[12, -20], [23, -20], [23, -14], [12, -14]], '#d9c49a', { hi: false });
      p.line([[14, -17], [21, -17]], 0.4, '#6a4e34');
      break;
    }
    // ---------------- archers
    case 'archer1': {
      plotBase(p);
      for (const x of [-15, 15, -7, 7]) p.limb(x, 0, x * 0.85, -34, 3, x < 0 ? WOOD : WOOD_D);
      p.line([[-15, -6], [15, -26]], 0.8, WOOD_D).line([[15, -6], [-15, -26]], 0.8, WOOD_D);
      p.poly([[-20, -34], [20, -34], [18, -42], [-18, -42]], WOOD);
      for (let i = -18; i <= 18; i += 5) p.line([[i, -34], [i * 0.95, -46]], 1.5, i % 2 ? WOOD : WOOD_D);
      p.line([[-19, -44], [19, -44]], 0.9, WOOD_D);
      break;
    }
    case 'archer2': {
      plotBase(p);
      p.poly([[-18, 0], [18, 0], [16, -22], [-16, -22]], STONE);
      stoneCourses(p, -17, -22, 17, 0, 3);
      for (const x of [-14, 14]) p.limb(x, -22, x * 0.9, -38, 3, WOOD);
      p.poly([[-21, -36], [21, -36], [19, -44], [-19, -44]], WOOD);
      for (let i = -19; i <= 19; i += 5) p.line([[i, -36], [i * 0.95, -48]], 1.5, i % 2 ? WOOD : WOOD_D);
      p.poly([[-6, 0], [6, 0], [6, -10], [0, -14], [-6, -10]], '#4a3a2a', { hi: false });
      banner(p, 19, -46, '#3e64a8');
      break;
    }
    case 'archer3': {
      plotBase(p);
      p.poly([[-19, 0], [19, 0], [16, -40], [-16, -40]], STONE);
      stoneCourses(p, -18, -40, 18, 0, 5);
      p.poly([[-22, -40], [22, -40], [22, -46], [-22, -46]], STONE_D);
      crenels(p, -22, 22, -46, STONE, 5);
      p.poly([[-5, 0], [5, 0], [5, -10], [0, -14], [-5, -10]], '#3a2e24', { hi: false });
      p.poly([[-10, -26], [-6, -26], [-6, -32], [-10, -32]], '#3a2e24', { hi: false });
      banner(p, -20, -50, '#3e64a8', 16);
      p.wash(-8, -20, 6, 10, '#6a8a4a', 0.15);
      break;
    }
    case 'ranger': {
      plotBase(p, '#7d8a55');
      // living tree trunk
      p.poly([[-14, 0], [14, 0], [10, -20], [12, -40], [-12, -40], [-9, -20]], '#7a5a3c');
      p.line([[-6, -2], [-3, -20], [-7, -38]], 0.6, '#4a3424').line([[5, -2], [3, -22], [6, -38]], 0.6, '#4a3424');
      for (const [x, y, r] of [[-16, -2, 5], [15, -1, 5]]) p.ell(x, y, r, 2.5, '#6b4f36', { hi: false });
      p.poly([[-20, -40], [20, -40], [18, -46], [-18, -46]], WOOD);
      for (const [x, y, rx, ry, c] of [[-14, -58, 12, 9, '#4f7a3a'], [12, -60, 13, 10, '#5f8a42'], [0, -66, 14, 9, '#6a9a4a'], [-20, -48, 7, 5, '#5a8540'], [20, -50, 7, 6, '#4f7a3a']]) p.shape(leafClump(x, y, rx, ry, p.R, 9), c);
      p.dot(-8, -60, 1.4, '#c4473a').dot(9, -64, 1.4, '#c4473a').dot(16, -55, 1.2, '#c4473a');
      p.line([[-19, -46], [-24, -38], [-21, -30]], 0.7, '#4f7a3a').line([[19, -46], [24, -36]], 0.7, '#4f7a3a');
      break;
    }
    case 'musket': {
      plotBase(p);
      p.poly([[-20, 0], [20, 0], [18, -36], [-18, -36]], '#8e8a86');
      stoneCourses(p, -19, -36, 19, 0, 4);
      p.poly([[-23, -36], [23, -36], [23, -44], [-23, -44]], '#3d3a40');
      for (const x of [-16, -6, 4, 14]) p.poly([[x, -44], [x + 4, -44], [x + 4, -50], [x, -50]], '#4a4650', { hi: false });
      p.limb(-20, -42, -28, -46, 3.4, '#2a2830');
      p.limb(20, -42, 28, -46, 3.4, '#2a2830');
      p.poly([[-5, 0], [5, 0], [5, -10], [0, -13], [-5, -10]], '#2a2228', { hi: false });
      p.wash(-14, -52, 8, 4, '#c8c2b8', 0.35);
      p.wash(16, -56, 7, 4, '#c8c2b8', 0.3);
      banner(p, 0, -50, '#2a2230', 14);
      break;
    }
    // ---------------- barracks
    case 'barracks1': {
      plotBase(p, '#a89068');
      p.poly([[-20, 0], [0, -30], [20, 0]], '#d8c8a0');
      p.poly([[0, -30], [6, 0], [-6, 0]], '#7a5a3c', { hi: false });
      p.line([[0, -30], [0, -36]], 0.7, WOOD_D);
      p.poly([[0, -36], [7, -34], [0, -32]], '#c4433a', { shadow: false });
      for (const x of [-24, -18, 18, 24]) p.limb(x, 2, x, -8, 2, WOOD);
      p.line([[-25, -4], [-17, -4]], 0.7, WOOD_D).line([[17, -4], [25, -4]], 0.7, WOOD_D);
      break;
    }
    case 'barracks2': {
      plotBase(p);
      p.poly([[-22, 0], [22, 0], [22, -20], [-22, -20]], '#c4a77e');
      for (let x = -18; x <= 18; x += 6) p.line([[x, 0], [x, -20]], 0.4, '#7a5a3c', { alpha: 0.6 });
      p.poly([[-26, -18], [0, -36], [26, -18]], '#8c4a3a');
      p.poly([[-5, 0], [5, 0], [5, -12], [-5, -12]], '#4a3424', { hi: false });
      banner(p, 20, -24, '#3e64a8');
      break;
    }
    case 'barracks3': {
      plotBase(p);
      p.poly([[-24, 0], [24, 0], [22, -28], [-22, -28]], STONE);
      stoneCourses(p, -23, -28, 23, 0, 4);
      crenels(p, -24, 24, -28, STONE_D, 5);
      p.poly([[-8, -30], [8, -30], [7, -44], [-7, -44]], STONE);
      crenels(p, -9, 9, -44, STONE_D, 3);
      p.poly([[-6, 0], [6, 0], [6, -13], [0, -17], [-6, -13]], '#3a2e24', { hi: false });
      p.line([[-6, -8], [6, -8]], 0.4, '#8a7a5a');
      banner(p, -20, -33, '#3e64a8', 14); banner(p, 20, -33, '#3e64a8', 14);
      break;
    }
    case 'paladin': {
      plotBase(p, '#b8a888');
      p.poly([[-24, 0], [24, 0], [22, -28], [-22, -28]], '#ece4d0');
      stoneCourses(p, -23, -28, 23, 0, 4);
      p.poly([[-14, -28], [14, -28], [12, -40], [-12, -40]], '#ece4d0');
      p.ell(0, -42, 12, 9, '#d8a93a');
      p.line([[0, -51], [0, -60]], 0.9, '#b8862a').line([[-3.5, -56.5], [3.5, -56.5]], 0.9, '#b8862a');
      p.poly([[-6, 0], [6, 0], [6, -14], [0, -19], [-6, -14]], '#8c3a30', { hi: false });
      p.ell(-14, -16, 3, 4.5, '#5a82b8', { shadow: false }); p.ell(14, -16, 3, 4.5, '#5a82b8', { shadow: false });
      p.glow(0, -44, 18, '#ffe9a0', 0.25);
      banner(p, -22, -30, '#c4433a', 14); banner(p, 22, -30, '#c4433a', 14);
      break;
    }
    case 'berserker': {
      plotBase(p, '#8a7a55');
      p.poly([[-26, 0], [26, 0], [24, -18], [-24, -18]], '#7a5a3c');
      for (let x = -22; x <= 22; x += 5) p.line([[x, 0], [x, -18]], 0.5, '#4a3424', { alpha: 0.6 });
      p.poly([[-30, -16], [0, -40], [30, -16]], '#6a5a3a');
      for (let i = 0; i < 6; i++) p.line([[-26 + i * 9, -18], [-18 + i * 6, -30]], 0.4, '#3e3424', { alpha: 0.5 });
      // antlers on the ridge
      p.line([[0, -40], [-6, -50], [-12, -52]], 1, '#e0d2b0').line([[-4, -46], [-2, -54]], 0.8, '#e0d2b0');
      p.line([[0, -40], [6, -50], [12, -52]], 1, '#e0d2b0').line([[4, -46], [2, -54]], 0.8, '#e0d2b0');
      p.ell(-15, -8, 5, 4, '#6b4a33'); // fur hung up
      p.poly([[-5, 0], [5, 0], [5, -12], [-5, -12]], '#2e2218', { hi: false });
      p.ell(15, -10, 4, 4, '#8c3a2e', { shadow: false });
      p.line([[13, -14], [17, -6]], 0.6, '#d8d0c0').line([[17, -14], [13, -6]], 0.6, '#d8d0c0');
      break;
    }
    // ---------------- mages
    case 'mage1': {
      plotBase(p);
      p.poly([[-13, 0], [13, 0], [11, -28], [-11, -28]], STONE);
      stoneCourses(p, -12, -28, 12, 0, 3);
      p.poly([[-17, -26], [17, -26], [0, -52]], '#6a5aa0');
      p.poly([[-4, 0], [4, 0], [4, -9], [0, -12], [-4, -9]], '#3a2e40', { hi: false });
      p.ell(0, -18, 2.4, 3, '#f0d878', { shadow: false });
      break;
    }
    case 'mage2': {
      plotBase(p);
      p.poly([[-15, 0], [15, 0], [12, -38], [-12, -38]], STONE);
      stoneCourses(p, -14, -38, 14, 0, 4);
      p.poly([[-19, -36], [19, -36], [0, -66]], '#5a4a96');
      p.dot(0, -66, 1.6, '#e8d070');
      p.poly([[-4, 0], [4, 0], [4, -9], [0, -12], [-4, -9]], '#3a2e40', { hi: false });
      p.ell(0, -24, 2.4, 3.2, '#f0d878', { shadow: false });
      p.wash(-8, -10, 4, 6, '#6a8a4a', 0.2);
      break;
    }
    case 'mage3': {
      plotBase(p);
      p.poly([[-16, 0], [16, 0], [12, -44], [-12, -44]], '#c2b8c8');
      stoneCourses(p, -15, -44, 15, 0, 5);
      p.poly([[-16, -44], [16, -44], [14, -50], [-14, -50]], '#9a8eb0');
      p.poly([[-12, -50], [12, -50], [0, -74]], '#4a3a88');
      p.ell(0, -28, 2.5, 3.4, '#f0d878', { shadow: false });
      p.poly([[-4, 0], [4, 0], [4, -9], [0, -12], [-4, -9]], '#3a2e40', { hi: false });
      for (const s of [-1, 1]) p.line([[s * 14, -46], [s * 22, -54], [s * 20, -60]], 0.6, '#4a3a88');
      break;
    }
    case 'prism': {
      plotBase(p, '#a8a0b0');
      p.poly([[-17, 0], [17, 0], [13, -36], [-13, -36]], '#d8d4e4');
      stoneCourses(p, -16, -36, 16, 0, 4);
      p.poly([[-16, -36], [16, -36], [12, -42], [-12, -42]], '#b0a8c8');
      for (const s of [-1, 1]) p.poly([[s * 12, -42], [s * 18, -54], [s * 14, -56], [s * 9, -44]], '#c8d8f0', { hi: false });
      p.poly([[-9, -44], [9, -44], [0, -78]], '#cfe6ff');
      p.poly([[0, -78], [9, -44], [2, -48]], '#9ac0e8', { hi: false });
      p.wash(-2, -56, 3, 10, '#f0a0c0', 0.2); p.wash(3, -52, 3, 9, '#a0f0c0', 0.2);
      p.glow(0, -60, 22, '#e8f4ff', 0.35);
      break;
    }
    case 'sorcerer': {
      plotBase(p, '#9a8a70');
      p.poly([[-16, 0], [16, 0], [12, -42], [-12, -42]], '#e8dcc4');
      for (const [x, y, c] of [[-8, -10, '#d9534a'], [6, -22, '#4f86c6'], [-4, -32, '#e8b33c'], [8, -6, '#6aa84f'], [-10, -24, '#9a5ab8']]) p.wash(x, y, 5, 4, c, 0.45);
      p.poly([[-18, -40], [18, -40], [10, -58], [-4, -72], [-10, -58]], '#3a6a9a');
      p.ell(14, -46, 8, 4, '#c8a878', { rot: -0.3 }); // palette
      for (const [x, y, c] of [[11, -47, '#d9534a'], [15, -48, '#e8b33c'], [18, -45, '#4f86c6']]) p.dot(x, y, 1.2, c);
      p.line([[-14, -38], [-22, -60]], 0.9, '#6a4e34');
      p.poly([[-22, -60], [-24, -66], [-20, -66]], '#d9534a', { shadow: false });
      p.poly([[-4, 0], [4, 0], [4, -9], [0, -12], [-4, -9]], '#3a2e40', { hi: false });
      break;
    }
    // ---------------- artillery
    case 'artillery1': {
      plotBase(p);
      p.poly([[-22, 0], [22, 0], [20, -12], [-20, -12]], WOOD);
      for (let x = -18; x <= 18; x += 6) p.line([[x, 0], [x, -12]], 0.4, WOOD_D, { alpha: 0.7 });
      p.poly([[-22, -12], [22, -12], [20, -16], [-20, -16]], WOOD_D);
      for (const [x, y] of [[-15, -20], [15, -20], [-10, -19]]) p.ell(x, y, 3.6, 3.4, '#6a4a2a');
      break;
    }
    case 'artillery2': {
      plotBase(p);
      p.poly([[-23, 0], [23, 0], [21, -16], [-21, -16]], STONE);
      stoneCourses(p, -22, -16, 22, 0, 2);
      p.poly([[-23, -16], [23, -16], [21, -21], [-21, -21]], STONE_D);
      for (const [x, y] of [[-17, -24], [17, -24]]) p.ell(x, y, 4, 3.6, '#5a4a3a');
      break;
    }
    case 'artillery3': {
      plotBase(p);
      p.poly([[-25, 0], [25, 0], [23, -22], [-23, -22]], STONE);
      stoneCourses(p, -24, -22, 24, 0, 3);
      crenels(p, -25, 25, -22, STONE_D, 6);
      p.poly([[-5, 0], [5, 0], [5, -9], [-5, -9]], '#3a2e24', { hi: false });
      banner(p, -24, -28, '#b8862a', 12);
      break;
    }
    case 'storm': {
      plotBase(p, '#8a8070');
      p.poly([[-22, 0], [22, 0], [20, -16], [-20, -16]], '#9a6a4a');
      stoneCourses(p, -21, -16, 21, 0, 2);
      p.ell(0, -30, 18, 17, '#b06a46');
      p.wash(-5, -36, 6, 5, '#ffcf8a', 0.35);
      p.poly([[-4, -12], [4, -12], [4, -20], [-4, -20]], '#3a2018', { hi: false });
      p.glow(0, -16, 6, '#ffb060', 0.6);
      for (const s of [-1, 1]) {
        p.line([[s * 15, -38], [s * 20, -52]], 1.6, '#b87333');
        for (let i = 0; i < 4; i++) p.ell(s * (16 + i * 1.2), -40 - i * 3.2, 2.6, 0.9, '#d08a4a', { shadow: false, w: 0.35 });
        p.dot(s * 20, -53, 2, '#9fd3ff');
      }
      p.line([[0, -47], [0, -60]], 1.6, '#b87333');
      p.dot(0, -61, 2.6, '#cfe8ff');
      p.glow(0, -61, 12, '#9fd3ff', 0.45);
      break;
    }
    case 'bertha': {
      plotBase(p);
      p.poly([[-28, 0], [28, 0], [26, -16], [-26, -16]], STONE);
      stoneCourses(p, -27, -16, 27, 0, 2);
      p.ell(0, -18, 26, 7, '#6a6058');
      p.ell(0, -20, 22, 5.5, '#857a6e', { hi: false });
      for (const [x, y] of [[-22, -26], [22, -26], [-18, -28]]) p.ell(x, y, 3.2, 3, '#3e3630');
      banner(p, 26, -20, '#b8862a', 10);
      break;
    }
  }
}

// The moving part of a tower, drawn live: mortar barrels, archers, orbs.
const topCache = {};
export function towerTop(kind) {
  if (topCache[kind]) return topCache[kind];
  let s;
  if (kind === 'mortar' || kind === 'bigmortar') {
    const big = kind === 'bigmortar';
    s = bake(40, 40, 20, 30, g => {
      const R = rng(5 + big);
      const p = painter(g, R);
      const k = big ? 1.5 : 1;
      p.ell(0, 0, 9 * k, 4 * k, '#4a4038');
      p.poly([[-6 * k, 0], [6 * k, 0], [7 * k, -12 * k], [-7 * k, -12 * k]], '#3e3a40');
      p.ell(0, -12 * k, 7 * k, 2.8 * k, '#2a2630');
      p.ell(0, -12 * k, 5 * k, 1.8 * k, '#141018', { shadow: false });
      p.line([[-6.5 * k, -5 * k], [6.5 * k, -5 * k]], 0.9 * k, '#8a7a5a');
    });
  } else {
    const look = kind;
    s = bake(30, 30, 15, 26, g => {
      const R = rng(hashStr(look) + 3);
      const p = painter(g, R);
      const o = { ...OUTFIT[look === 'musketeer' ? 'footman' : 'ysolde'] };
      if (look === 'bowman') Object.assign(o, { body: '#5f7fa6', head: 'cap', hat: '#3e64a8', weapon: 'bow', cape: null, scale: 0.62 });
      if (look === 'ranger') Object.assign(o, { body: '#4f7a3a', head: 'hood', hat: '#3f5c32', weapon: 'bow', cape: null, scale: 0.62 });
      if (look === 'musketeer') Object.assign(o, { body: '#3a3640', head: 'cap', hat: '#2a2630', weapon: 'spear', shield: null, tabard: null, scale: 0.62 });
      if (look === 'wizard') Object.assign(o, { body: '#4a3a88', robe: true, robeTrim: '#e8d070', head: 'wizard', hat: '#4a3a88', weapon: 'staff', beard: '#e8e2d0', scale: 0.62, mushrooms: false });
      if (look === 'sorcerer') Object.assign(o, { body: '#3a6a9a', robe: true, robeTrim: '#e8b33c', head: 'wizard', hat: '#d9534a', weapon: 'staff', beard: null, hair: '#2a1a14', scale: 0.62, mushrooms: false });
      humanoid(p, o, 0.25, 0);
    });
  }
  topCache[kind] = s;
  return s;
}

// ------------------------------------------------------------------ icons
// Round painted medallions for the build ring and abilities.
const iconCache = {};
export function icon(name, size = 40) {
  const key = name + size;
  if (iconCache[key]) return iconCache[key];
  const c = makeCanvas(size * SS, size * SS);
  const g = c.getContext('2d');
  g.scale(SS, SS);
  const R = rng(hashStr(name) + 77);
  const p = painter(g, R);
  const r = size / 2;
  g.translate(r, r);
  const ring = { archer: '#6a8a4a', barracks: '#a84a3a', mage: '#5a4a96', artillery: '#8a6a3a', beast: '#7a5a8a', ability: '#b8862a', sell: '#b8862a', ui: '#4a5a6a' };
  const kind = name.split(':')[0];
  const bg = ring[kind] || '#6a6a6a';
  p.ell(0, 0, r - 2, r - 2, '#f2e8d0', { hi: false, layers: 5 });
  g.save();
  g.beginPath(); g.arc(0, 0, r - 3.5, 0, TAU); g.clip();
  p.wash(0, r * 0.4, r, r * 0.6, bg, 0.2);
  drawIcon(p, name, r);
  g.restore();
  ink(g, ellipsePts(0, 0, r - 2, r - 2, 28), R, { closed: true, w: 1.6, color: bg, jitter: 0.2 });
  ink(g, ellipsePts(0, 0, r - 2.8, r - 2.8, 28), R, { closed: true, w: 0.5, jitter: 0.1 });
  iconCache[key] = { c, size };
  return iconCache[key];
}

function drawIcon(p, name, r) {
  const g = p.g;
  const [kind, what] = name.split(':');
  const k = r / 20;
  g.save(); g.scale(k, k);
  if (kind === 'archer' || kind === 'barracks' || kind === 'mage' || kind === 'artillery' || kind === 'beast') {
    // mini tower
    const t = towerSprite(what);
    g.drawImage(t.c, -t.ax * 0.42, -t.ay * 0.42 + 12, t.w * 0.42, t.h * 0.42);
    g.restore();
    return;
  }
  const A = (pts, col, o) => p.poly(pts, col, o);
  switch (what) {
    case 'bramble': p.line([[-10, 8], [10, -8]], 1.4, '#6a4e34'); A([[10, -8], [5, -7], [8, -4]], '#9aa5b0'); for (const t of [-6, -1, 4]) p.line([[t, t * -0.8 + 1], [t - 2, t * -0.8 - 3]], 0.7, '#4f7a3a'); p.dot(-4, 4, 2, '#7ac04a', 0.8); break;
    case 'thornroot': for (const x of [-8, 0, 8]) p.line([[x, 12], [x - 2, 0], [x + 2, -8]], 1.6, '#5a7a3a'); p.line([[-12, 12], [12, 12]], 1.2, '#6a4e34'); break;
    case 'deadeye': p.ell(0, 0, 9, 9, '#f2e8d0', { shadow: false }); p.line([[-12, 0], [12, 0]], 0.8).line([[0, -12], [0, 12]], 0.8); p.dot(0, 0, 2.4, '#c4433a'); break;
    case 'grapeshot': for (let i = 0; i < 7; i++) p.dot(-6 + Math.cos(i) * 8 + 6, Math.sin(i * 1.7) * 7, 1.8, '#3a3640'); A([[-12, -4], [-4, -2], [-4, 2], [-12, 4]], '#4a4650'); break;
    case 'heal': A([[-3, -10], [3, -10], [3, -3], [10, -3], [10, 3], [3, 3], [3, 10], [-3, 10], [-3, 3], [-10, 3], [-10, -3], [-3, -3]], '#e0b440'); p.glow(0, 0, 12, '#fff2b0', 0.4); break;
    case 'holystrike': p.line([[0, -12], [0, 8]], 2, '#c8d1d9'); p.line([[-5, 4], [5, 4]], 1.6, '#b8862a'); p.glow(0, -6, 12, '#ffe9a0', 0.55); break;
    case 'whirlwind': for (let i = 0; i < 3; i++) { g.save(); g.rotate(i * 2.1); p.line([[0, 0], [6, -4], [11, 0], [10, 6]], 1.2, '#7a8a9a'); g.restore(); } A([[-2, -2], [2, -2], [2, 2], [-2, 2]], '#6b4a2f'); break;
    case 'axes': for (const s of [-1, 1]) { p.line([[s * -8, 10], [s * 6, -8]], 1.2, '#6b4a2f'); A([[s * 6, -8], [s * 12, -12], [s * 12, -2]], '#b9c2c9'); } break;
    case 'refract': A([[0, -12], [9, 8], [-9, 8]], '#cfe6ff'); p.line([[-14, -2], [-3, 0]], 1.2, '#fff4c0'); p.line([[4, 2], [14, -6]], 1, '#f08080').line([[4, 3], [14, 2]], 1, '#80f0a0').line([[4, 4], [14, 9]], 1, '#80a0f0'); break;
    case 'glare': p.glow(0, 0, 14, '#fff2c0', 0.9); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; p.line([[Math.cos(a) * 6, Math.sin(a) * 6], [Math.cos(a) * 12, Math.sin(a) * 12]], 1, '#e0a020'); } break;
    case 'elemental': p.ell(0, 2, 8, 8, '#d9534a'); p.ell(1, -8, 5, 4, '#e8b33c'); p.wash(-3, 4, 3, 3, '#4f86c6', 0.6); p.dot(2.5, -8, 1, '#fff'); break;
    case 'curse': for (const [x, y, c] of [[-5, -4, '#d9534a'], [5, -4, '#4f86c6'], [0, 5, '#e8b33c']]) p.ell(x, y, 6, 6, c, { shadow: false, inkA: 0.5 }); p.line([[-10, 10], [10, -10]], 1.2, '#2a2230'); break;
    case 'overcharge': A([[2, -13], [-6, 1], [0, 1], [-3, 13], [7, -3], [1, -3], [5, -13]], '#9fd3ff'); p.glow(0, 0, 12, '#cfe8ff', 0.4); break;
    case 'static': for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; p.line([[Math.cos(a) * 3, Math.sin(a) * 3], [Math.cos(a + 0.3) * 8, Math.sin(a + 0.3) * 8], [Math.cos(a) * 12, Math.sin(a) * 12]], 0.8, '#6ab0f0'); } p.dot(0, 0, 3, '#cfe8ff'); break;
    case 'cluster': p.ell(0, -2, 7, 7, '#3a3640'); for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; p.dot(Math.cos(a) * 11, Math.sin(a) * 11, 2, '#5a5060'); } p.line([[3, -8], [6, -12]], 0.8, '#c08040'); break;
    case 'rockets': for (const s of [-5, 5]) { A([[s - 2, 8], [s + 2, 8], [s + 2, -6], [s, -11], [s - 2, -6]], '#c4433a'); p.dot(s, 10, 2, '#ffb040', 0.9); } break;
    case 'volley': for (const a of [-0.5, 0, 0.5]) { g.save(); g.rotate(a); p.line([[0, 12], [0, -10]], 1.1, '#6a4e34'); A([[0, -13], [-2.4, -8], [2.4, -8]], '#9aa5b0', { shadow: false }); g.restore(); } break;
    case 'charge': A([[-12, 6], [-6, -4], [4, -6], [12, -12], [8, -2], [12, 4], [-2, 4], [-6, 10]], '#8a5a3a'); p.line([[-14, 0], [14, -10]], 1.4, '#c8d1d9'); break;
    case 'trample': for (const [x, y] of [[-6, 4], [4, -4], [8, 8]]) { A([[x - 3, y + 3], [x + 3, y + 3], [x + 3.5, y - 1], [x, y - 4], [x - 3.5, y - 1]], '#5a4a3a'); } p.line([[-12, 12], [12, 12]], 1, '#8a7a5a'); break;
    case 'freeze': for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; p.line([[0, 0], [Math.cos(a) * 12, Math.sin(a) * 12]], 1.4, '#9fd3ef'); p.line([[Math.cos(a) * 7, Math.sin(a) * 7], [Math.cos(a + 0.5) * 9, Math.sin(a + 0.5) * 9]], 0.8, '#cfeeff'); } break;
    case 'rewind': A([[-7, -11], [7, -11], [1, 0], [7, 11], [-7, 11], [-1, 0]], '#e8f6ff'); A([[-4, 9], [4, 9], [0, 3]], '#e0c070', { shadow: false }); p.line([[-12, -4], [-14, 2], [-9, 2]], 1.2, '#4a5a6a'); break;
    case 'firestorm': for (const [x, y] of [[-6, -6], [6, -2], [-2, 6]]) { p.ell(x, y, 4, 4, '#2a2230'); p.glow(x, y - 2, 6, '#ff9a40', 0.6); } break;
    case 'scorch': A([[-10, 10], [-6, -2], [-2, 4], [2, -10], [6, 2], [10, -4], [10, 10]], '#e07a30'); A([[-6, 10], [-2, 2], [2, 6], [6, 10]], '#ffd070', { shadow: false }); break;
    case 'inferno': A([[-8, 12], [-12, 0], [-6, -4], [-4, -12], [2, -6], [6, -14], [10, -2], [8, 12]], '#e0602a'); A([[-4, 12], [-6, 4], [0, 0], [4, 4], [3, 12]], '#ffd070', { shadow: false }); break;
    case 'scales': for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) A([[-10 + c * 7, -8 + r * 7], [-4 + c * 7, -8 + r * 7], [-7 + c * 7, -2 + r * 7]], r % 2 ? '#4a3a68' : '#2a2236'); break;
    case 'roar': A([[-12, -6], [-2, -8], [4, -2], [-2, 4], [-12, 6]], '#6a4a33'); for (const r of [6, 10, 14]) p.line([[4 + r * 0.6, -r * 0.6], [4 + r, 0], [4 + r * 0.6, r * 0.6]], 1, '#4a3a2a'); break;
    case 'thickhide': A([[-10, -10], [10, -10], [10, 2], [0, 12], [-10, 2]], '#6a4a33'); A([[-6, -6], [6, -6], [6, 0], [0, 7], [-6, 0]], '#8a6a4a', { shadow: false }); break;
    case 'heads': for (const x of [-7, 0, 7]) { p.line([[x * 0.4, 12], [x, -4]], 2.2, '#2f5a44'); A([[x - 3, -4], [x + 4, -6], [x + 2, -1]], '#2f5a44'); } break;
    case 'petrify': p.ell(0, 0, 11, 7, '#ffd060'); p.ell(0, 0, 2.4, 6, '#1a1218', { shadow: false }); break;
    // UI symbols
    case 'sell': p.ell(0, 0, 9, 9, '#e0b440'); p.ell(0, 0, 6, 6, '#f0d070', { shadow: false }); p.line([[0, -4], [0, 4]], 1, '#8a6a20'); break;
    case 'rally': p.line([[-4, 12], [-4, -12]], 1.2, '#6a4e34'); A([[-4, -12], [10, -8], [-4, -3]], '#c4433a'); break;
    case 'meteor': A([[-12, -12], [2, -4], [-2, 0]], '#e0a040', { ink: false }); p.ell(4, 4, 7, 7, '#3a2a30'); p.glow(4, 4, 10, '#ff8040', 0.5); p.wash(-6, -6, 6, 3, '#ffb060', 0.4); break;
    case 'militia': p.line([[-8, 10], [6, -10]], 1.2, '#7a5a3a'); for (const k2 of [-2, 0, 2]) p.line([[6 + k2, -10 + k2 * 0.7], [9 + k2, -14 + k2 * 0.7]], 0.7, '#5d6670'); p.ell(-4, -4, 7, 3, '#d9b85a'); p.ell(-4, -6, 4, 3, '#e2c46b'); break;
    // the drawn spells (2026-10-07): a brush laying down a blue wave, and a stroke of ink
    case 'wash': p.wash(-2, 4, 12, 5, '#3a5ec8', 0.75); p.wash(4, -1, 7, 3, '#7aa0e8', 0.6); p.line([[-12, 8], [-4, 2], [4, 4], [12, -2]], 1.4, '#e8f4ff'); p.line([[6, -12], [-2, -2]], 1.6, '#8a5a30'); p.ell(-3, -1, 2.4, 2, '#3a5ec8'); break;
    case 'wall': p.line([[-12, 6], [-4, 2], [4, 4], [12, -1]], 4.2, '#231c2e'); p.line([[-12, 6], [12, -1]], 1, '#4a4060'); for (const [dx, dy] of [[-13, 9], [13, -4], [-9, 9]]) p.dot(dx, dy, 1.4, '#231c2e'); p.line([[5, -13], [-1, -3]], 1.6, '#8a5a30'); break;
    case 'pause': p.line([[-4, -8], [-4, 8]], 2.2).line([[4, -8], [4, 8]], 2.2); break;
    case 'play': A([[-6, -9], [9, 0], [-6, 9]], '#4a5a6a'); break;
    case 'fast': A([[-10, -8], [0, 0], [-10, 8]], '#4a5a6a'); A([[0, -8], [10, 0], [0, 8]], '#4a5a6a'); break;
    case 'menu': for (const y of [-6, 0, 6]) p.line([[-8, y], [8, y]], 1.6); break;
    case 'lock': p.ell(0, 3, 8, 7, '#8a7a5a'); p.line([[-4, -3], [-4, -8], [4, -8], [4, -3]], 1.4); break;
    case 'skull': {
      p.g.save(); p.g.fillStyle = 'rgba(120,30,30,0.35)'; p.g.beginPath(); p.g.arc(0, 0, 18, 0, 7); p.g.fill(); p.g.restore();
      for (const s2 of [-1, 1]) { p.line([[-11 * s2, -9], [11 * s2, 11]], 2.2, '#e8e0cc'); p.dot(-11 * s2, -9, 2, '#e8e0cc').dot(11 * s2, 11, 2, '#e8e0cc'); }
      p.poly([[-8, -3], [-8, -10], [-3, -14], [3, -14], [8, -10], [8, -3], [5, 0], [5, 4], [-5, 4], [-5, 0]], '#efe8d6');
      p.ell(-3.4, -6, 2.6, 2.8, '#2a2230', { shadow: false, w: 0.3 }); p.ell(3.4, -6, 2.6, 2.8, '#2a2230', { shadow: false, w: 0.3 });
      for (const tx of [-2.5, 0, 2.5]) p.line([[tx, 1], [tx, 4]], 0.5);
      break;
    }
  }
  g.restore();
}

export { painter, OUTFIT, bake };
