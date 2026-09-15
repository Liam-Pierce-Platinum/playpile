// ===================== HIGHWAY :: CAR ART =====================
// Cars drawn procedurally, straight down from above, into a cached sprite.
//
// From an eagle-eye view a car is almost entirely PROPORTION: how much of the
// length is bonnet, how far back and how narrow the roof sits, how wide the
// arches bulge, and where the lights are. Nothing else survives at thirty
// pixels. So every shape here is driven from the real car's numbers, and the
// shading is FLAT PANELS with hard edges rather than gradients - a gradient
// turns to mush the moment the sprite is scaled down into a low-res buffer,
// while a hard edge stays a hard edge.

const cache = new Map();
const PPM = 26;

function key(spec, extra) {
  return [spec.id, spec.paint, spec.accent, spec.kit && spec.kit.id,
          spec.wing && spec.wing.id, spec.wheel && spec.wheel.id,
          spec.livery, spec.glow && spec.glow.id,
          Math.round(spec.wid * 100), extra || ''].join('|');
}

// ---------- colour ----------
function hex2rgb(h) {
  if (!h || h[0] !== '#') return [190, 190, 190];
  const s = h.length === 4 ? h[1]+h[1]+h[2]+h[2]+h[3]+h[3] : h.slice(1);
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function shade(h, amt) {
  const [r, g, b] = hex2rgb(h);
  const f = v => Math.max(0, Math.min(255, Math.round(
    amt > 0 ? v + (255 - v) * amt : v * (1 + amt))));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
function rgba(h, a) { const [r, g, b] = hex2rgb(h); return `rgba(${r},${g},${b},${a})`; }
export function luminance(h) {
  const [r, g, b] = hex2rgb(h); return (0.299*r + 0.587*g + 0.114*b) / 255;
}

// ---------- the silhouette ----------
// t: 0 at the nose, 1 at the tail. Returns a multiplier on half width.
// ---------------------------------------------------------------------------
// THE SILHOUETTE
//
// From directly above you cannot see a grille, a badge or a roofline - the only
// thing carrying the car's identity is its OUTLINE. The previous version made
// every body a 0.90-1.00 rectangle with 4 cm wheel arches, which is why a
// Corvette and a four-door came out the same shape in different paint.
//
// Each body type now gets a real plan-view character:
//   shoulder / hip   how far the front and rear arches bulge past the body
//   waist            how much the doors pull in between the arches
//   noseW / tailW    end widths, which set the overhang shape
//   tuck             where the tail starts drawing in
//
// A Corvette is a wasp: narrow waist, big hips. A Fox-body is a plank. A pickup
// is a wide bed on a narrower cab. Those are readable at 40 px; badges are not.
// ---------------------------------------------------------------------------
const SHAPE = {
  //                shoulder  hip   waist  noseW  tailW  tuck
  coupe:    { sh: 0.055, hip: 0.075, waist: 0.055, nw: 0.90, tw: 0.95, tuck: 0.86 },
  notch:    { sh: 0.040, hip: 0.050, waist: 0.020, nw: 0.94, tw: 0.98, tuck: 0.92 },
  fastback: { sh: 0.060, hip: 0.090, waist: 0.070, nw: 0.88, tw: 0.90, tuck: 0.80 },
  buttress: { sh: 0.070, hip: 0.105, waist: 0.080, nw: 0.86, tw: 0.96, tuck: 0.88 },
  vette:    { sh: 0.085, hip: 0.135, waist: 0.150, nw: 0.72, tw: 0.86, tuck: 0.82 },
  mid:      { sh: 0.075, hip: 0.155, waist: 0.130, nw: 0.66, tw: 0.94, tuck: 0.90 },
  sedan:    { sh: 0.030, hip: 0.035, waist: 0.015, nw: 0.93, tw: 0.96, tuck: 0.90 },
  suv:      { sh: 0.035, hip: 0.040, waist: 0.000, nw: 0.95, tw: 0.99, tuck: 0.94 },
  truck:    { sh: 0.040, hip: 0.070, waist: 0.075, nw: 0.92, tw: 1.00, tuck: 0.97 },
  van:      { sh: 0.015, hip: 0.015, waist: 0.000, nw: 0.96, tw: 1.00, tuck: 0.97 },
  box:      { sh: 0.000, hip: 0.000, waist: 0.000, nw: 0.86, tw: 1.00, tuck: 0.99 },
};

function profile(spec, t) {
  const c = spec.car || spec;
  const S = SHAPE[c.body] || SHAPE.coupe;
  const wideKit = spec.kit ? spec.kit.widen : 0;
  // per-car nose/tail still modulate the type, so two coupes are not identical
  const nose = (c.nose ?? 0.86) * 0.5 + S.nw * 0.5;
  const tail = (c.tail ?? 0.94) * 0.5 + S.tw * 0.5;

  // base body: full width at the arches, pulled in at the waist
  let w = 1 - S.waist * Math.cos((t - 0.5) * Math.PI * 2) * 0.5 - S.waist * 0.5;

  // ---- overhangs ----
  // In front of the front wheels the body draws in toward the nose; behind the
  // rear wheels it draws in toward the tail. How fast is the whole difference
  // between a long-nosed muscle car and a mid-engined wedge.
  if (t < 0.18) {
    const k = 1 - t / 0.18;
    w *= 1 - (1 - nose) * k * k;
  }
  if (t > S.tuck) {
    const k = (t - S.tuck) / (1 - S.tuck);
    w *= 1 - (1 - tail) * k * k;
  }

  // ---- wheel arches ----
  // These are the loudest identity cue in a plan view and they were doing
  // almost nothing. A muscle car's rear hips now stand ~13% proud of the doors.
  const arch = (mid, half, amt) => {
    const d = (t - mid) / half;
    return Math.abs(d) > 1 ? 0 : amt * Math.cos(d * Math.PI / 2) ** 2;
  };
  const fw = c.fw ?? 0.55;                      // where the front axle sits
  const frontAxle = 0.16 + (1 - fw) * 0.10;
  const rearAxle = 0.84 - (1 - fw) * 0.06;
  w += arch(frontAxle, 0.11, S.sh + wideKit * 0.55);
  w += arch(rearAxle, 0.13, S.hip + wideKit * 0.80);

  return w;
}

function bodyPath(ctx, spec, L, W, inset) {
  const N = 64;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    pts.push([t * L, -Math.max(0.02, profile(spec, t) * W / 2 - inset)]);
  }
  for (let i = N; i >= 0; i--) {
    const t = i / N;
    pts.push([t * L, Math.max(0.02, profile(spec, t) * W / 2 - inset)]);
  }
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  ctx.closePath();
}

const widthAt = (spec, t, W) => profile(spec, t) * W;

// A band across the body between two x positions, inset by a fraction of the
// local body width - this is how glass and roof follow the silhouette.
function band(ctx, spec, W, L, x0, x1, f0, f1) {
  const N = 12;
  ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    const t = i / N, x = x0 + (x1 - x0) * t, f = f0 + (f1 - f0) * t;
    const y = -widthAt(spec, x / L, W) * f * 0.5;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  for (let i = N; i >= 0; i--) {
    const t = i / N, x = x0 + (x1 - x0) * t, f = f0 + (f1 - f0) * t;
    ctx.lineTo(x, widthAt(spec, x / L, W) * f * 0.5);
  }
  ctx.closePath();
}

// ---------- the sprite ----------
export function carSprite(spec, ppmOverride) {
  const PP = ppmOverride || PPM;
  const k = key(spec, 'p' + PP);
  const hit = cache.get(k);
  if (hit) return hit;

  const L = spec.len, W = spec.wid;
  const pad = 0.5;
  const cw = Math.ceil((L + pad * 2) * PP);
  const ch = Math.ceil((W * 1.5 + pad * 2) * PP);
  const cv = document.createElement('canvas');
  cv.width = cw; cv.height = ch;
  const ctx = cv.getContext('2d');
  ctx.translate(pad * PP, ch / 2);
  ctx.scale(PP, PP);
  // paintBody draws nose-at-0; the car drives along +x, so flip it.
  ctx.translate(L, 0);
  ctx.scale(-1, 1);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'butt';

  paintBody(ctx, spec, L, W);

  const out = { canvas: cv, ppm: PP, ox: pad * PP, oy: ch / 2, w: cw, h: ch };
  cache.set(k, out);
  if (cache.size > 120) cache.delete(cache.keys().next().value);
  return out;
}

function paintBody(ctx, spec, L, W) {
  const c = spec.car || spec;
  const paint = spec.paint || c.color;
  const accent = spec.accent || c.accent || '#16181c';
  const dark = luminance(paint) < 0.28;
  const body = c.body || 'coupe';
  const glass = '#101a2a';

  const hood = c.hood ?? 0.40;
  const deck = c.deck ?? 0.24;
  const roofW = c.roofW ?? 0.72;
  const cabin0 = hood * L;
  const cabin1 = (1 - deck) * L;
  const cabLen = cabin1 - cabin0;

  // ---- hard dark outline: at this size the silhouette is most of the read ----
  ctx.save();
  bodyPath(ctx, spec, L, W, -0.075);
  ctx.fillStyle = '#080a0e';
  ctx.fill();
  ctx.restore();

  // ---- flat base coat ----
  ctx.save();
  bodyPath(ctx, spec, L, W, 0);
  ctx.fillStyle = paint;
  ctx.fill();
  ctx.clip();

  // ---- two flat shading bands. Not a gradient: hard edges survive a
  //      downscale into a low-resolution buffer, soft ramps do not. ----
  ctx.fillStyle = shade(paint, -0.40);
  ctx.fillRect(0, -W * 0.62, L, W * 0.30);
  ctx.fillRect(0, W * 0.32, L, W * 0.30);
  ctx.fillStyle = shade(paint, -0.20);
  ctx.fillRect(0, -W * 0.34, L, W * 0.10);
  ctx.fillRect(0, W * 0.24, L, W * 0.10);
  ctx.fillStyle = shade(paint, dark ? 0.42 : 0.30);
  ctx.fillRect(0, -W * 0.15, L, W * 0.30);
  ctx.fillStyle = shade(paint, dark ? 0.60 : 0.46);
  ctx.fillRect(0, -W * 0.05, L, W * 0.10);

  drawStripes(ctx, spec, L, W, accent, body, hood, deck);

  // ---- panel shut lines ----
  ctx.fillStyle = 'rgba(0,0,0,0.34)';
  ctx.fillRect(cabin0 - 0.03, -W, 0.055, W * 2);          // bonnet / screen
  ctx.fillRect(cabin1 - 0.02, -W, 0.055, W * 2);          // rear screen / boot
  // door shut
  ctx.fillRect(cabin0 + cabLen * 0.52, -W * 0.46, 0.045, W * 0.92);

  // ---- bonnet detail ----
  drawHood(ctx, spec, L, W, paint, accent, c, hood, dark);

  // ---- greenhouse ----
  drawGreenhouse(ctx, spec, L, W, paint, glass, body, cabin0, cabin1, roofW, dark);

  // ---- deck detail ----
  if (body === 'truck') {
    // an open bed, which is what makes a pickup a pickup from above
    ctx.fillStyle = shade(paint, -0.62);
    ctx.fillRect(cabin1 + 0.05, -widthAt(spec, 0.85, W) * 0.40,
      L - cabin1 - 0.16, widthAt(spec, 0.85, W) * 0.80);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let x = cabin1 + 0.25; x < L - 0.2; x += 0.28) {
      ctx.fillRect(x, -widthAt(spec, 0.85, W) * 0.38, 0.05, widthAt(spec, 0.85, W) * 0.76);
    }
  } else if (body === 'box') {
    ctx.fillStyle = shade(paint, -0.12);
    ctx.fillRect(cabin0 + 0.1, -W * 0.47, L - cabin0 - 0.2, W * 0.94);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let x = cabin0 + 0.4; x < L - 0.2; x += 0.5) ctx.fillRect(x, -W * 0.47, 0.05, W * 0.94);
  }

  ctx.restore();

  // ---- lights sit on top of the clip so they can overhang the nose ----
  drawLights(ctx, spec, L, W, c.lights || 'wide', true);
  drawLights(ctx, spec, L, W, c.tails || 'wide', false);

  // ---- mirrors ----
  const mx = cabin0 + 0.10;
  ctx.fillStyle = shade(paint, -0.34);
  for (const s of [-1, 1]) {
    ctx.fillRect(mx, s * (widthAt(spec, mx / L, W) * 0.48) - (s > 0 ? 0 : 0.10), 0.20, 0.10);
  }

  // ---- overfender lips read as bolt-ons ----
  if (spec.kit && spec.kit.widen > 0.12) {
    ctx.strokeStyle = 'rgba(8,10,14,0.9)';
    ctx.lineWidth = 0.07;
    for (const mid of [0.20, 0.80]) {
      for (const s of [-1, 1]) {
        ctx.beginPath();
        for (let i = 0; i <= 12; i++) {
          const t = mid - 0.10 + (i / 12) * 0.20;
          const y = s * profile(spec, t) * W / 2;
          i ? ctx.lineTo(t * L, y) : ctx.moveTo(t * L, y);
        }
        ctx.stroke();
      }
    }
  }

  drawWing(ctx, spec, L, W);
}

// ---------------- bonnet ----------------
function drawHood(ctx, spec, L, W, paint, accent, c, hood, dark) {
  const scoop = c.scoop || 'none';
  const hw = widthAt(spec, hood * 0.6, W);
  const cx = hood * L * 0.55;

  // power bulge / crease lines down the bonnet
  ctx.fillStyle = `rgba(0,0,0,${dark ? 0.30 : 0.18})`;
  for (const s of [-1, 1]) {
    ctx.fillRect(L * 0.06, s * hw * 0.26, hood * L * 0.82, 0.04);
  }

  if (scoop === 'shaker') {
    ctx.fillStyle = '#14171c';
    roundRect(ctx, cx - 0.34, -0.30, 0.68, 0.60, 0.10); ctx.fill();
    ctx.fillStyle = shade(paint, -0.45);
    roundRect(ctx, cx - 0.26, -0.22, 0.52, 0.44, 0.08); ctx.fill();
  } else if (scoop === 'twin') {
    ctx.fillStyle = '#14171c';
    for (const s of [-1, 1]) {
      roundRect(ctx, cx - 0.30, s * hw * 0.22 - 0.11, 0.62, 0.22, 0.06); ctx.fill();
    }
  } else if (scoop === 'cowl') {
    ctx.fillStyle = '#14171c';
    roundRect(ctx, hood * L - 0.40, -hw * 0.30, 0.34, hw * 0.60, 0.06); ctx.fill();
  } else if (scoop === 'ram') {
    ctx.fillStyle = '#0f1216';
    roundRect(ctx, cx - 0.42, -hw * 0.30, 0.84, hw * 0.60, 0.09); ctx.fill();
    ctx.fillStyle = '#1c2128';
    roundRect(ctx, cx - 0.32, -hw * 0.22, 0.64, hw * 0.44, 0.07); ctx.fill();
  } else if (scoop === 'side') {
    // mid-engine intakes sit beside the cabin, not on the bonnet
    ctx.fillStyle = '#12161b';
    for (const s of [-1, 1]) {
      ctx.fillRect(L * 0.52, s * widthAt(spec, 0.55, W) * 0.34, L * 0.14, 0.14);
    }
  }
}

// ---------------- greenhouse ----------------
function drawGreenhouse(ctx, spec, L, W, paint, glass, body, cabin0, cabin1, roofW, dark) {
  const cabLen = cabin1 - cabin0;
  // windscreen rake: muscle cars are steep, wedges are long
  const wsLen = cabLen * (body === 'vette' || body === 'mid' ? 0.40 : 0.30);
  const rsLen = cabLen * (body === 'fastback' ? 0.46
    : body === 'vette' ? 0.34 : body === 'van' || body === 'box' ? 0.08 : 0.26);
  const wsEnd = cabin0 + wsLen;
  const rsStart = cabin1 - rsLen;

  // windscreen
  ctx.fillStyle = glass;
  band(ctx, spec, W, L, cabin0, wsEnd, roofW * 0.94, roofW); ctx.fill();
  ctx.fillStyle = 'rgba(150,195,240,0.30)';
  band(ctx, spec, W, L, cabin0, wsEnd, roofW * 0.60, roofW * 0.66); ctx.fill();

  // roof
  if (body !== 'vette' || cabLen > 0) {
    ctx.fillStyle = shade(paint, dark ? 0.34 : 0.16);
    band(ctx, spec, W, L, wsEnd, rsStart, roofW, roofW); ctx.fill();
    ctx.fillStyle = shade(paint, -0.30);
    band(ctx, spec, W, L, wsEnd, rsStart, roofW, roofW);
    ctx.lineWidth = 0.05; ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.stroke();
    // roof highlight so it separates from the bonnet
    ctx.fillStyle = shade(paint, dark ? 0.58 : 0.44);
    ctx.fillRect(wsEnd, -widthAt(spec, (wsEnd + rsStart) / 2 / L, W) * roofW * 0.20,
      rsStart - wsEnd, widthAt(spec, (wsEnd + rsStart) / 2 / L, W) * roofW * 0.22);
    // a Viper's roof has two blisters in it
    if ((spec.car || spec).id === 'viper' || (spec.car || spec).id === 'acr') {
      ctx.fillStyle = shade(paint, 0.26);
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse((wsEnd + rsStart) / 2, s * W * 0.14, (rsStart - wsEnd) * 0.34, W * 0.10, 0, 0, 7);
        ctx.fill();
      }
    }
  }

  // rear screen
  ctx.fillStyle = glass;
  band(ctx, spec, W, L, rsStart, cabin1, roofW, roofW * 0.92); ctx.fill();

  // flying buttresses: body-colour wedges either side of the rear glass
  if (body === 'buttress') {
    ctx.fillStyle = shade(paint, -0.06);
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(rsStart, s * widthAt(spec, rsStart / L, W) * roofW * 0.5);
      ctx.lineTo(cabin1 + (L - cabin1) * 0.5, s * widthAt(spec, 0.86, W) * 0.46);
      ctx.lineTo(cabin1 + (L - cabin1) * 0.5, s * widthAt(spec, 0.86, W) * 0.30);
      ctx.lineTo(rsStart, s * widthAt(spec, rsStart / L, W) * roofW * 0.24);
      ctx.closePath(); ctx.fill();
    }
  }
  // fastbacks: the roof runs on to the tail, with louvres over the glass
  if (body === 'fastback') {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (let x = rsStart + 0.06; x < cabin1; x += 0.13) {
      ctx.fillRect(x, -widthAt(spec, x / L, W) * roofW * 0.46, 0.06,
        widthAt(spec, x / L, W) * roofW * 0.92);
    }
  }
  // a van or box has a roof over nearly everything
  if (body === 'van' || body === 'box' || body === 'suv') {
    ctx.fillStyle = shade(paint, -0.10);
    band(ctx, spec, W, L, wsEnd, cabin1, roofW, roofW); ctx.fill();
    if (body === 'suv') {
      ctx.fillStyle = '#2a2f36';
      for (const s of [-1, 1]) {
        ctx.fillRect(wsEnd + 0.1, s * W * 0.30 - 0.04, cabin1 - wsEnd - 0.2, 0.08);
      }
    }
  }
}

// ---------------- lights ----------------
function drawLights(ctx, spec, L, W, kind, front) {
  const t = front ? 0.035 : 0.965;
  const w = widthAt(spec, t, W);
  const x = front ? L * 0.005 : L * 0.955;
  const lens = front ? '#e8f0fb' : '#e0242c';
  const rim = front ? '#aab6c6' : '#7a1018';
  ctx.save();
  const put = (px, py, pw, ph, r) => {
    ctx.fillStyle = rim; roundRect(ctx, px - 0.02, py - 0.02, pw + 0.04, ph + 0.04, r); ctx.fill();
    ctx.fillStyle = lens; roundRect(ctx, px, py, pw, ph, r); ctx.fill();
  };
  switch (kind) {
    case 'quad':                                   // four round lamps
      for (const s of [-1, 1]) for (let i = 0; i < 2; i++) {
        const y = s * (w * 0.16 + i * 0.19);
        ctx.fillStyle = rim;
        ctx.beginPath(); ctx.ellipse(x + 0.09, y, 0.10, 0.10, 0, 0, 7); ctx.fill();
        ctx.fillStyle = lens;
        ctx.beginPath(); ctx.ellipse(x + 0.09, y, 0.072, 0.072, 0, 0, 7); ctx.fill();
      }
      break;
    case 'round2':
      for (const s of [-1, 1]) {
        ctx.fillStyle = rim;
        ctx.beginPath(); ctx.ellipse(x + 0.10, s * w * 0.28, 0.115, 0.115, 0, 0, 7); ctx.fill();
        ctx.fillStyle = lens;
        ctx.beginPath(); ctx.ellipse(x + 0.10, s * w * 0.28, 0.085, 0.085, 0, 0, 7); ctx.fill();
      }
      break;
    case 'wide':
      for (const s of [-1, 1]) put(x + 0.02, s * w * 0.16 - (s > 0 ? 0 : 0.21), 0.20, 0.21, 0.05);
      break;
    case 'slim':
      for (const s of [-1, 1]) put(x + 0.03, s * w * 0.15 - (s > 0 ? 0 : 0.13), 0.24, 0.13, 0.05);
      break;
    case 'stack':
      for (const s of [-1, 1]) put(x + 0.04, s * w * 0.30 - (s > 0 ? 0 : 0.34), 0.13, 0.34, 0.04);
      break;
    case 'hidden':                                 // covered lamps: just a seam
      ctx.fillStyle = 'rgba(0,0,0,0.42)';
      ctx.fillRect(x + 0.04, -w * 0.40, 0.10, w * 0.80);
      break;
    case 'fullbar':
      put(x, -w * 0.42, 0.17, w * 0.84, 0.05);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      for (let i = -3; i <= 3; i++) ctx.fillRect(x, i * w * 0.115, 0.17, 0.035);
      break;
    case 'tri':                                    // three vertical bars a side
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
        put(x + 0.02, s * (w * 0.10 + i * 0.115) - (s > 0 ? 0 : 0.10), 0.16, 0.10, 0.03);
      }
      break;
    case 'panel2':
    case 'panel3': {
      const n = kind === 'panel3' ? 3 : 2;
      for (const s of [-1, 1]) for (let i = 0; i < n; i++) {
        put(x + 0.02, s * (w * 0.09 + i * 0.125) - (s > 0 ? 0 : 0.11), 0.17, 0.11, 0.03);
      }
      break;
    }
    default:
      for (const s of [-1, 1]) put(x + 0.02, s * w * 0.16 - (s > 0 ? 0 : 0.19), 0.18, 0.19, 0.05);
  }
  ctx.restore();
}

// ---------------- stripes ----------------
function drawStripes(ctx, spec, L, W, accent, body, hood, deck) {
  const kind = spec.livery && spec.livery !== 'none'
    ? spec.livery : ((spec.car || spec).stripe || 'none');
  if (!kind || kind === 'none') return;
  ctx.save();
  if (kind === 'twin' || kind === 'stripe') {
    ctx.fillStyle = accent;
    ctx.fillRect(0, -W * 0.115, L, W * 0.085);
    ctx.fillRect(0, W * 0.030, L, W * 0.085);
  } else if (kind === 'wide') {
    ctx.fillStyle = accent;
    ctx.fillRect(0, -W * 0.17, L, W * 0.34);
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.fillRect(0, -W * 0.17, L, 0.05);
    ctx.fillRect(0, W * 0.17 - 0.05, L, 0.05);
  } else if (kind === 'hockey') {
    // over the front wing and back along the shoulder
    ctx.fillStyle = accent;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(L * 0.03, s * W * 0.24);
      ctx.lineTo(L * 0.03, s * W * 0.42);
      ctx.lineTo(hood * L * 1.02, s * W * 0.42);
      ctx.lineTo(hood * L * 1.02, s * W * 0.30);
      ctx.closePath(); ctx.fill();
    }
  } else if (kind === 'lower') {
    ctx.fillStyle = rgba(accent, 0.85);
    for (const s of [-1, 1]) ctx.fillRect(0, s * W * 0.40 - (s > 0 ? 0 : 0.09), L, 0.09);
  } else if (kind === 'bird') {
    // the big bonnet decal, which from above is most of what you see
    const cx = hood * L * 0.52, hw = widthAt(spec, hood * 0.5, W);
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(cx + hood * L * 0.42, 0);
    ctx.lineTo(cx, -hw * 0.42);
    ctx.lineTo(cx - hood * L * 0.40, -hw * 0.20);
    ctx.lineTo(cx - hood * L * 0.16, 0);
    ctx.lineTo(cx - hood * L * 0.40, hw * 0.20);
    ctx.lineTo(cx, hw * 0.42);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = rgba(accent, 0.55);
    ctx.fillRect(cx - hood * L * 0.10, -hw * 0.06, hood * L * 0.44, hw * 0.12);
  } else if (kind === 'taxi') {
    ctx.fillStyle = '#16181c';
    ctx.fillRect(L * 0.30, -W * 0.46, L * 0.42, 0.14);
    ctx.fillRect(L * 0.30, W * 0.32, L * 0.42, 0.14);
  } else if (kind === 'flames') {
    ctx.fillStyle = rgba(accent, 0.7);
    ctx.fillRect(0, -W, L * 0.45, W * 2);
  }
  ctx.restore();
}

function drawWing(ctx, spec, L, W) {
  const id = spec.wing ? spec.wing.id : 'none';
  if (id === 'none') return;
  const w = widthAt(spec, 0.92, W);
  if (id === 'lip') {
    ctx.fillStyle = 'rgba(10,13,18,0.92)';
    roundRect(ctx, L * 0.90, -w * 0.46, 0.13, w * 0.92, 0.04); ctx.fill();
    return;
  }
  const back = id === 'swan' ? L * 0.95 : L * 0.90;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  roundRect(ctx, back - 0.04, -w * 0.56 + 0.06, 0.32, w * 1.12, 0.05); ctx.fill();
  ctx.fillStyle = '#1c222c';
  for (const s of [-1, 1]) { roundRect(ctx, back - 0.10, s * w * 0.30 - 0.05, 0.30, 0.10, 0.03); ctx.fill(); }
  ctx.fillStyle = '#454f5c';
  roundRect(ctx, back, -w * 0.56, 0.26, w * 1.12, 0.04); ctx.fill();
  ctx.fillStyle = '#2a323c';
  roundRect(ctx, back, -w * 0.56, 0.26, w * 0.30, 0.04); ctx.fill();
  ctx.fillStyle = '#0f141b';
  for (const s of [-1, 1]) { roundRect(ctx, back - 0.05, s * w * 0.56 - (s > 0 ? 0.07 : 0), 0.36, 0.07, 0.02); ctx.fill(); }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// ---------------- wheels ----------------
export function wheelPositions(spec) {
  const L = spec.len, W = spec.wid;
  const fx = L * 0.5 - L * 0.20, rx = L * 0.5 - L * 0.80;
  // sit them right at the arch lip so a sliver of tyre shows past the body -
  // that sliver is most of what says 'car' at thirty pixels
  const fy = profile(spec, 0.20) * W / 2 + 0.015;
  const ry = profile(spec, 0.80) * W / 2 + 0.02;
  return [
    { x: fx, y: -fy, front: true }, { x: fx, y: fy, front: true },
    { x: rx, y: -ry, front: false }, { x: rx, y: ry, front: false },
  ];
}

export function drawWheel(ctx, spec, wx, wy, ang, spin, radius) {
  const w = spec.wheel || { dish: 0.14, face: '#3a4048', lip: '#606870', spokes: 5 };
  const r = radius || Math.max(0.30, spec.len * 0.070);
  const width = r * 0.82;
  ctx.save();
  ctx.translate(wx, wy);
  ctx.rotate(ang);
  ctx.fillStyle = '#0b0d11';
  roundRect(ctx, -r, -width / 2, r * 2, width, width * 0.28); ctx.fill();
  const fr = r * (1 - w.dish * 0.5);
  ctx.fillStyle = w.face;
  roundRect(ctx, -fr, -width * 0.34, fr * 2, width * 0.68, width * 0.18); ctx.fill();
  ctx.fillStyle = w.lip;
  roundRect(ctx, -fr, -width * 0.34, fr * 2, width * 0.14, 0.02); ctx.fill();
  ctx.restore();
}

// ---------------- garage turntable ----------------
export function drawPreview(ctx, spec, w, h, t) {
  ctx.clearRect(0, 0, w, h);
  const scale = Math.min(w / (spec.len + 1.4), h / (spec.wid + 2.2));
  ctx.save();
  ctx.translate(w / 2, h / 2);
  const g = ctx.createRadialGradient(0, 0, 10, 0, 0, Math.max(w, h) * 0.5);
  g.addColorStop(0, 'rgba(34,224,255,0.13)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.rotate(Math.sin(t * 0.0005) * 0.045);
  ctx.scale(scale, scale);

  ctx.save();
  ctx.translate(0.10, 0.18);
  ctx.filter = 'blur(5px)';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  ctx.ellipse(0, 0, spec.len * 0.50, spec.wid * 0.52, 0, 0, 7);
  ctx.fill();
  ctx.restore();
  ctx.filter = 'none';

  for (const p of wheelPositions(spec)) drawWheel(ctx, spec, p.x, p.y, 0, 0, null);
  const spr = carSprite(spec, 110);
  ctx.drawImage(spr.canvas, -spec.len / 2 - spr.ox / spr.ppm, -spr.oy / spr.ppm,
    spr.w / spr.ppm, spr.h / spr.ppm);
  ctx.restore();
}
