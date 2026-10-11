// Foreground art: terrain, hazards, the bike, the rider and his ragdoll.
// Flat-vector cartoon: every foreground shape gets a thick #1b1b2a outline.
import { OUTLINE, mix, TAU } from './util.js';
import { riderPose, HEAD_R } from './bikes.js';
import { pieceY } from './terrain.js';
import { hexA } from './backdrop.js';

let LW = 3; // outline width in world units (set per frame so it stays ~3 screen px)
export function setLineWidth(s) { LW = Math.max(2.2, Math.min(5.5, 3 / s)); }

function stroke(ctx, w = LW) { ctx.lineWidth = w; ctx.strokeStyle = OUTLINE; ctx.stroke(); }
function fillStroke(ctx, fill, w = LW) { ctx.fillStyle = fill; ctx.fill(); stroke(ctx, w); }
function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); }
function limb(ctx, pts, w, col) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = w + LW * 2; ctx.stroke();
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke();
}

// ------------------------------------------------------------------ terrain
const patCache = new Map();
function dotPattern(ctx, T, key) {
  if (patCache.has(key)) return patCache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = 96;
  const g = c.getContext('2d');
  let s = 7;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  if (key === 'neon') {
    for (let y = 8; y < 96; y += 24) for (let x = 6; x < 96; x += 16) if (r() < 0.45) { g.fillStyle = r() < 0.5 ? 'rgba(255,215,106,0.35)' : 'rgba(46,242,255,0.25)'; g.fillRect(x, y, 6, 9); }
  } else {
    for (let i = 0; i < 9; i++) { g.fillStyle = T.dots; g.globalAlpha = 0.55; g.beginPath(); g.arc(r() * 96, r() * 96, 2 + r() * 3.5, 0, TAU); g.fill(); }
    for (let i = 0; i < 4; i++) { g.fillStyle = '#ffffff'; g.globalAlpha = 0.12; g.beginPath(); g.arc(r() * 96, r() * 96, 2 + r() * 3, 0, TAU); g.fill(); }
  }
  const p = ctx.createPattern(c, 'repeat');
  patCache.set(key, p);
  return p;
}

function piecePaths(p) {
  if (p.path) return;
  const pts = p.pts, bottom = p.maxY + 4000;
  const path = new Path2D(), surf = new Path2D(), out = new Path2D();
  path.moveTo(pts[0], pts[1]); surf.moveTo(pts[0], pts[1]);
  out.moveTo(pts[0], bottom); out.lineTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) { path.lineTo(pts[i], pts[i + 1]); surf.lineTo(pts[i], pts[i + 1]); out.lineTo(pts[i], pts[i + 1]); }
  const n = pts.length;
  out.lineTo(pts[n - 2], bottom);
  path.lineTo(pts[n - 2], bottom); path.lineTo(pts[0], bottom); path.closePath();
  p.path = path; p.surf = surf; p.out = out;
}

export function drawTerrain(ctx, world, view, t) {
  const T = world.theme, terr = world.terrain;
  const pat = dotPattern(ctx, T, world.themeKey);
  for (const p of terr.pieces) {
    if (p.x1 < view.x0 - 50 || p.x0 > view.x1 + 50) continue;
    piecePaths(p);
    if (world.themeKey === 'neon') { ctx.strokeStyle = hexA(T.top, 0.22); ctx.lineWidth = 34; ctx.lineJoin = 'round'; ctx.stroke(p.surf); }
    ctx.fillStyle = T.ground; ctx.fill(p.path);
    ctx.save();
    ctx.clip(p.path);
    ctx.fillStyle = pat; ctx.fill(p.path);
    ctx.lineJoin = 'round';
    // strata bands following the surface
    ctx.translate(0, 95); ctx.strokeStyle = T.ground2; ctx.globalAlpha = 0.55; ctx.lineWidth = 46; ctx.stroke(p.surf);
    ctx.translate(0, 120); ctx.globalAlpha = 0.4; ctx.lineWidth = 30; ctx.stroke(p.surf);
    ctx.translate(0, -215); ctx.globalAlpha = 1;
    // lip shadow + top strip + highlight
    ctx.strokeStyle = T.ground2; ctx.lineWidth = 40; ctx.stroke(p.surf);
    ctx.strokeStyle = T.top; ctx.lineWidth = 28; ctx.stroke(p.surf);
    ctx.strokeStyle = T.top2; ctx.lineWidth = 8; ctx.stroke(p.surf);
    if (world.themeKey === 'volcano') {
      ctx.translate(0, 24); ctx.setLineDash([26, 40, 12, 60]); ctx.strokeStyle = '#ff6a2a'; ctx.globalAlpha = 0.55 + 0.25 * Math.sin(t * 3); ctx.lineWidth = 3; ctx.stroke(p.surf); ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
    ctx.restore();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = LW; ctx.stroke(p.out);
  }
  // overlays: conveyors and ice
  for (const o of terr.overlays) {
    if (o.x1 < view.x0 || o.x0 > view.x1) continue;
    if (o.kind === 'conv') drawConveyor(ctx, o, t);
    else if (o.kind === 'ice') drawIce(ctx, terr, o, t);
  }
  // painted tutorial pictograms just under the surface band
  for (const d of terr.decals) {
    if (d.x < view.x0 - 200 || d.x > view.x1 + 200) continue;
    const y = terr.surfaceY(d.x);
    if (!isFinite(y)) continue;
    drawDecal(ctx, d, y + 58, t);
  }
}

// cheap trackside dressing, drawn on the surface behind the bike
const PROP_LABELS = { canyon: 'DUST', junk: 'SCRAP', glacier: 'ICE', volcano: 'HOT!', neon: 'GO' };
export function drawProps(ctx, world, props, view, t) {
  if (!props || !props.length) return;
  const T = world.theme, key = world.themeKey;
  for (const p of props) {
    if (p.x < view.x0 - 120 || p.x > view.x1 + 120) continue;
    ctx.save(); ctx.translate(p.x, p.y + 2);
    if (p.flip) ctx.scale(-1, 1);
    const sc = 0.85 + p.v * 0.4;
    ctx.scale(sc, sc);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (key === 'canyon') {
      if (p.kind === 0) { // rocks
        ctx.beginPath(); ctx.moveTo(-34, 0); ctx.lineTo(-26, -22); ctx.lineTo(-6, -30); ctx.lineTo(12, -18); ctx.lineTo(16, 0); ctx.closePath(); fillStroke(ctx, '#c95c37');
        ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(14, -14); ctx.lineTo(30, -18); ctx.lineTo(38, 0); ctx.closePath(); fillStroke(ctx, '#e2734a');
        ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.ellipse(-14, -22, 8, 3, -0.4, 0, TAU); ctx.fill();
      } else if (p.kind === 1) { // saguaro
        limb(ctx, [[0, 2], [0, -58]], 14, '#4f9a5a');
        limb(ctx, [[0, -30], [-16, -30], [-16, -50]], 9, '#4f9a5a');
        limb(ctx, [[0, -40], [14, -40], [14, -56]], 9, '#4f9a5a');
        ctx.strokeStyle = 'rgba(27,27,42,0.35)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-3, -6); ctx.lineTo(-3, -52); ctx.moveTo(3, -6); ctx.lineTo(3, -52); ctx.stroke();
      } else { // skull on a stick
        ctx.beginPath(); ctx.rect(-3, -46, 6, 48); fillStroke(ctx, '#9a6232');
        circle(ctx, 0, -50, 11); fillStroke(ctx, '#f4f1ea');
        ctx.fillStyle = OUTLINE; circle(ctx, -4, -52, 3); ctx.fill(); circle(ctx, 4, -52, 3); ctx.fill(); ctx.fillRect(-4, -44, 8, 3);
      }
    } else if (key === 'junk') {
      if (p.kind === 0) { // tyre stack
        for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.ellipse(k === 1 ? 6 : 0, -11 - k * 20, 26, 11, 0, 0, TAU); fillStroke(ctx, '#2f2f42'); ctx.fillStyle = '#5a5a70'; ctx.beginPath(); ctx.ellipse(k === 1 ? 6 : 0, -12 - k * 20, 11, 4, 0, 0, TAU); ctx.fill(); }
      } else if (p.kind === 1) { // cone
        ctx.beginPath(); ctx.moveTo(-9, -46); ctx.lineTo(9, -46); ctx.lineTo(20, 0); ctx.lineTo(-20, 0); ctx.closePath(); fillStroke(ctx, '#ff7a1f');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(-14, -24, 28, 7);
        ctx.beginPath(); ctx.rect(-26, -4, 52, 6); fillStroke(ctx, '#ff7a1f');
      } else { // barrel
        ctx.beginPath(); ctx.roundRect(-18, -54, 36, 56, 5); fillStroke(ctx, '#3fb3a4');
        ctx.fillStyle = 'rgba(27,27,42,0.35)'; ctx.fillRect(-18, -40, 36, 4); ctx.fillRect(-18, -18, 36, 4);
        ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.moveTo(-6, -36); ctx.lineTo(6, -36); ctx.lineTo(2, -26); ctx.lineTo(8, -26); ctx.lineTo(-4, -12); ctx.lineTo(-1, -22); ctx.lineTo(-7, -22); ctx.closePath(); ctx.fill();
      }
    } else if (key === 'glacier') {
      if (p.kind === 0) { // ice boulder
        ctx.beginPath(); ctx.moveTo(-30, 0); ctx.lineTo(-22, -24); ctx.lineTo(-2, -34); ctx.lineTo(22, -22); ctx.lineTo(30, 0); ctx.closePath(); fillStroke(ctx, '#aee3f7');
        ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.moveTo(-18, -22); ctx.lineTo(-2, -31); ctx.lineTo(16, -21); ctx.lineTo(-4, -18); ctx.fill();
      } else if (p.kind === 1) { // snowy pine
        ctx.beginPath(); ctx.rect(-4, -14, 8, 16); fillStroke(ctx, '#6a4a33');
        for (let k = 0; k < 3; k++) { const y = -12 - k * 18, w = 28 - k * 7; ctx.beginPath(); ctx.moveTo(-w, y); ctx.lineTo(0, y - 26); ctx.lineTo(w, y); ctx.closePath(); fillStroke(ctx, '#2f7a6a'); ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(-w * 0.5, y - 13); ctx.lineTo(0, y - 26); ctx.lineTo(w * 0.5, y - 13); ctx.lineTo(0, y - 9); ctx.fill(); }
      } else { // snowman
        circle(ctx, 0, -16, 17); fillStroke(ctx, '#ffffff'); circle(ctx, 0, -42, 12); fillStroke(ctx, '#ffffff');
        ctx.fillStyle = OUTLINE; circle(ctx, -4, -45, 2); ctx.fill(); circle(ctx, 4, -45, 2); ctx.fill();
        ctx.fillStyle = '#ff7a1f'; ctx.beginPath(); ctx.moveTo(0, -42); ctx.lineTo(14, -39); ctx.lineTo(0, -37); ctx.fill();
        ctx.strokeStyle = '#6a4a33'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-14, -22); ctx.lineTo(-30, -34); ctx.moveTo(14, -22); ctx.lineTo(28, -30); ctx.stroke();
      }
    } else if (key === 'volcano') {
      if (p.kind === 0) { // ember rock
        ctx.beginPath(); ctx.moveTo(-32, 0); ctx.lineTo(-24, -20); ctx.lineTo(-4, -30); ctx.lineTo(20, -20); ctx.lineTo(30, 0); ctx.closePath(); fillStroke(ctx, '#3a3342');
        ctx.strokeStyle = '#ff6a2a'; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 3 + p.x); ctx.beginPath(); ctx.moveTo(-14, -8); ctx.lineTo(-4, -22); ctx.lineTo(8, -12); ctx.lineTo(16, -16); ctx.stroke(); ctx.globalAlpha = 1;
      } else if (p.kind === 1) { // bones
        limb(ctx, [[-22, -6], [18, -14]], 5, '#e9e2d0'); for (const [x, y] of [[-22, -6], [18, -14]]) { circle(ctx, x, y - 3, 4); fillStroke(ctx, '#e9e2d0', LW * 0.6); circle(ctx, x - 2, y + 3, 4); fillStroke(ctx, '#e9e2d0', LW * 0.6); }
      } else { // warning sign
        ctx.beginPath(); ctx.rect(-3, -52, 6, 54); fillStroke(ctx, '#55596e');
        ctx.beginPath(); ctx.moveTo(0, -76); ctx.lineTo(24, -40); ctx.lineTo(-24, -40); ctx.closePath(); fillStroke(ctx, '#ffd23f');
        ctx.fillStyle = OUTLINE; ctx.fillRect(-2.5, -66, 5, 14); circle(ctx, 0, -46, 3); ctx.fill();
      }
    } else { // neon
      if (p.kind === 0) { // cone
        ctx.beginPath(); ctx.moveTo(-9, -46); ctx.lineTo(9, -46); ctx.lineTo(20, 0); ctx.lineTo(-20, 0); ctx.closePath(); fillStroke(ctx, '#ff3dbb');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(-14, -24, 28, 7);
        ctx.beginPath(); ctx.rect(-26, -4, 52, 6); fillStroke(ctx, '#ff3dbb');
      } else if (p.kind === 1) { // trash can
        ctx.beginPath(); ctx.roundRect(-16, -44, 32, 46, 4); fillStroke(ctx, '#3b3660');
        ctx.beginPath(); ctx.roundRect(-20, -50, 40, 9, 4); fillStroke(ctx, '#5a548a');
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-8, -38); ctx.lineTo(-8, -8); ctx.moveTo(0, -38); ctx.lineTo(0, -8); ctx.moveTo(8, -38); ctx.lineTo(8, -8); ctx.stroke();
      } else { // neon arrow sign
        ctx.beginPath(); ctx.rect(-3, -60, 6, 62); fillStroke(ctx, '#3b3660');
        ctx.beginPath(); ctx.roundRect(-30, -86, 60, 30, 8); fillStroke(ctx, '#1e1a3c');
        const on = Math.sin(t * 6 + p.x) > -0.9;
        ctx.strokeStyle = on ? '#2ef2ff' : '#1d7f88'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-18, -71); ctx.lineTo(16, -71); ctx.moveTo(6, -80); ctx.lineTo(16, -71); ctx.lineTo(6, -62); ctx.stroke();
      }
    }
    ctx.restore();
  }
}

function drawConveyor(ctx, o, t) {
  const y = o.y, h = 14;
  ctx.beginPath(); ctx.roundRect(o.x0, y - 3, o.x1 - o.x0, h, 7); fillStroke(ctx, '#2b2b3d');
  ctx.save(); ctx.beginPath(); ctx.rect(o.x0 + 6, y - 3, o.x1 - o.x0 - 12, h); ctx.clip();
  const off = (t * o.speed * 0.5) % 40;
  ctx.fillStyle = o.speed > 0 ? '#ffd23f' : '#ff5a5a';
  for (let x = o.x0 - 40 + (o.speed > 0 ? off : 40 - off); x < o.x1 + 40; x += 40) {
    const d = o.speed > 0 ? 1 : -1;
    ctx.beginPath(); ctx.moveTo(x, y - 1); ctx.lineTo(x + 10 * d, y + 4); ctx.lineTo(x, y + 9); ctx.lineTo(x + 6 * d, y + 9); ctx.lineTo(x + 16 * d, y + 4); ctx.lineTo(x + 6 * d, y - 1); ctx.fill();
  }
  ctx.restore();
  for (const x of [o.x0 + 7, o.x1 - 7]) { circle(ctx, x, y + 4, 6); fillStroke(ctx, '#9aa6b8', LW * 0.7); }
}

function drawIce(ctx, terr, o, t) {
  ctx.save();
  ctx.beginPath();
  for (let x = o.x0; x <= o.x1; x += 20) { const y = terr.surfaceY(x); if (x === o.x0) ctx.moveTo(x, y + 2); else ctx.lineTo(x, y + 2); }
  ctx.strokeStyle = 'rgba(190,240,255,0.9)'; ctx.lineWidth = 10; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 3; ctx.setLineDash([30, 50]); ctx.lineDashOffset = -t * 30; ctx.stroke(); ctx.setLineDash([]);
  ctx.restore();
}

// Tutorial pictograms painted on the ground: big white shapes with the dark
// outline so they read on any ground colour, plus a one-word label.
const DECAL_LABEL = { gas: 'HOLD GAS', release: 'LET GO IN THE AIR', flip: 'TAP GAS = BACKFLIP', brake: 'TAP BRAKE = FRONTFLIP', land: 'LAND FLAT' };
function drawDecal(ctx, d, y, t) {
  ctx.save();
  ctx.translate(d.x, y);
  const pulse = 0.85 + 0.15 * Math.sin(t * 4);
  ctx.globalAlpha = pulse;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // every shape is drawn twice: fat outline, then white
  const twice = (fn) => { ctx.strokeStyle = OUTLINE; ctx.fillStyle = OUTLINE; fn(LW * 2.2); ctx.strokeStyle = '#ffffff'; ctx.fillStyle = '#ffffff'; fn(0); };
  const chev = (x, s = 1) => twice((o) => { ctx.lineWidth = o; ctx.beginPath(); ctx.moveTo(x, -22 * s); ctx.lineTo(x + 22 * s, 0); ctx.lineTo(x, 22 * s); ctx.lineTo(x - 12 * s, 22 * s); ctx.lineTo(x + 10 * s, 0); ctx.lineTo(x - 12 * s, -22 * s); ctx.closePath(); ctx.fill(); if (o) ctx.stroke(); });
  const pedal = (x, lifted) => twice((o) => {
    ctx.lineWidth = 6 + o; ctx.beginPath(); ctx.roundRect(x - 16, -22, 32, 44, 8); ctx.stroke();
    ctx.lineWidth = 4 + o; ctx.beginPath(); ctx.moveTo(x - 7, -8); ctx.lineTo(x + 7, -8); ctx.moveTo(x - 7, 2); ctx.lineTo(x + 7, 2); ctx.moveTo(x - 7, 12); ctx.lineTo(x + 7, 12); ctx.stroke();
    if (lifted) { ctx.lineWidth = 5 + o; ctx.beginPath(); ctx.moveTo(x, -30); ctx.lineTo(x, -54); ctx.moveTo(x - 9, -45); ctx.lineTo(x, -54); ctx.lineTo(x + 9, -45); ctx.stroke(); }
  });
  const spinArrow = (x, back) => twice((o) => {
    ctx.lineWidth = 9 + o; ctx.beginPath();
    if (back) ctx.arc(x, 0, 30, -0.3, -Math.PI * 1.75, true); else ctx.arc(x, 0, 30, Math.PI + 0.3, Math.PI * 2.75);
    ctx.stroke();
    const a = back ? -Math.PI * 1.75 : Math.PI * 2.75, ex = x + Math.cos(a) * 30, ey = Math.sin(a) * 30;
    const tdir = a + (back ? -Math.PI / 2 : Math.PI / 2);
    ctx.lineWidth = o; ctx.beginPath(); ctx.moveTo(ex + Math.cos(tdir) * 16, ey + Math.sin(tdir) * 16);
    ctx.lineTo(ex + Math.cos(tdir + 2.3) * 14, ey + Math.sin(tdir + 2.3) * 14); ctx.lineTo(ex + Math.cos(tdir - 2.3) * 14, ey + Math.sin(tdir - 2.3) * 14); ctx.closePath(); ctx.fill(); if (o) ctx.stroke();
  });
  if (d.kind === 'gas') { pedal(-70, false); chev(0); chev(40); chev(80); }
  else if (d.kind === 'release') { pedal(-40, true); chev(20, 0.8); chev(56, 0.8); }
  else if (d.kind === 'flip') { pedal(-80, false); spinArrow(0, true); chev(60, 0.8); }
  else if (d.kind === 'brake') { pedal(-80, false); spinArrow(0, false); }
  else if (d.kind === 'land') twice((o) => {
    ctx.lineWidth = 7 + o;
    circle(ctx, -40, 6, 16); ctx.stroke(); circle(ctx, 40, 6, 16); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-40, 6); ctx.lineTo(0, -14); ctx.lineTo(40, 6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-70, 34); ctx.lineTo(70, 34); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -60); ctx.lineTo(0, -34); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-12, -42); ctx.lineTo(0, -28); ctx.lineTo(12, -42); ctx.stroke();
  });
  const label = DECAL_LABEL[d.kind];
  if (label) {
    ctx.font = '26px "Lilita One", "Arial Black", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 6; ctx.strokeStyle = OUTLINE; ctx.strokeText(label, 0, 64); ctx.fillStyle = '#ffffff'; ctx.fillText(label, 0, 64);
  }
  ctx.restore();
}

export function drawLava(ctx, world, view, t) {
  for (const L of world.terrain.lava) {
    if (L.x1 < view.x0 || L.x0 > view.x1) continue;
    const g = ctx.createLinearGradient(0, L.y - 30, 0, L.y + 200);
    g.addColorStop(0, 'rgba(255,140,40,0)'); g.addColorStop(0.15, 'rgba(255,120,40,0.45)'); g.addColorStop(1, 'rgba(255,90,31,0)');
    ctx.fillStyle = g; ctx.fillRect(L.x0, L.y - 120, L.x1 - L.x0, 140);
    ctx.beginPath();
    ctx.moveTo(L.x0, L.y + 1200);
    for (let x = L.x0; x <= L.x1; x += 12) ctx.lineTo(x, L.y + Math.sin(x * 0.04 + t * 3) * 4 + Math.sin(x * 0.013 - t * 2) * 3);
    ctx.lineTo(L.x1, L.y + 1200); ctx.closePath();
    ctx.fillStyle = '#ff5a1f'; ctx.fill();
    ctx.strokeStyle = '#ffd36a'; ctx.lineWidth = 6; ctx.stroke();
    ctx.fillStyle = '#ffb02e';
    for (let i = 0; i < 6; i++) {
      const ph = (t * 0.7 + i * 0.37) % 1, x = L.x0 + ((i * 97 + Math.floor(t * 0.7 + i * 0.37) * 53) % Math.max(1, L.x1 - L.x0));
      circle(ctx, x, L.y + 20 - ph * 22, 4 + ph * 6); ctx.globalAlpha = 1 - ph; ctx.fill(); ctx.globalAlpha = 1;
    }
    ctx.fillStyle = 'rgba(255,200,80,0.35)';
    for (let x = L.x0 + 30; x < L.x1; x += 70) { ctx.beginPath(); ctx.ellipse(x + Math.sin(t + x) * 10, L.y + 30, 18, 4, 0, 0, TAU); ctx.fill(); }
  }
}

export function drawLoops(ctx, world, view, front) {
  const T = world.theme;
  for (const l of world.terrain.loops) {
    if (l.x1 < view.x0 || l.x0 > view.x1) continue;
    const { cx, cy, R } = l;
    if (!front) {
      // legs
      for (const sx of [-0.62, 0.62]) {
        const x = cx + sx * R, y = cy + Math.sqrt(1 - sx * sx) * R;
        ctx.beginPath(); ctx.moveTo(x - 7, y); ctx.lineTo(cx + sx * R * 1.15 - 7, cy + R + 4); ctx.lineTo(cx + sx * R * 1.15 + 7, cy + R + 4); ctx.lineTo(x + 7, y); ctx.closePath();
        fillStroke(ctx, mix(T.ground2, '#000000', 0.2));
      }
      continue;
    }
    ctx.lineWidth = 24 + LW * 2; ctx.strokeStyle = OUTLINE; circle(ctx, cx, cy, R + 12); ctx.stroke();
    ctx.lineWidth = 24; ctx.strokeStyle = T.top; ctx.stroke();
    ctx.lineWidth = 6; ctx.strokeStyle = T.top2; circle(ctx, cx, cy, R + 3); ctx.stroke();
    ctx.setLineDash([14, 22]); ctx.lineWidth = 4; ctx.strokeStyle = mix(T.top, '#1b1b2a', 0.35); circle(ctx, cx, cy, R + 16); ctx.stroke(); ctx.setLineDash([]);
  }
}

// ------------------------------------------------------------------ hazards
const WOOD = '#c98a4b', WOOD2 = '#9a6232';
export function drawObjects(ctx, world, view, t, layer) {
  const T = world.theme;
  for (const o of world.objs) {
    const ox = o.x ?? o.cx ?? o.hx ?? 0;
    if (ox < view.x0 - 900 || ox > view.x1 + 900) continue;
    switch (o.constructor.name) {
      case 'Seesaw': if (layer === 1) drawSeesaw(ctx, o); break;
      case 'Plank': if (layer === 1) drawPlank(ctx, o, t); break;
      case 'Drawbridge': if (layer === 0) drawDrawTower(ctx, o); else drawDrawbridge(ctx, o); break;
      case 'Crate': if (layer === 1) drawCrate(ctx, o); break;
      case 'Tnt': if (layer === 1) drawTnt(ctx, o, t); break;
    }
  }
  for (const s of world.statics) {
    if ((s.x ?? s.x0) > view.x1 + 600 || (s.x ?? s.x1) < view.x0 - 600) continue;
    if (s.type === 'ropes' && layer === 0) drawRopes(ctx, s);
    if (s.type === 'fan' && layer === 0) drawFan(ctx, s, t);
    if (s.type === 'finish' && layer === 0) drawFinish(ctx, s, t);
  }
  if (layer === 1) for (const b of world.circles) if (!b.dead && b.x > view.x0 - 200 && b.x < view.x1 + 200) drawBoulder(ctx, b, world, t);
}

function drawSeesaw(ctx, o) {
  ctx.beginPath(); ctx.moveTo(o.cx, o.cy); ctx.lineTo(o.cx - 34, o.gy + 2); ctx.lineTo(o.cx + 34, o.gy + 2); ctx.closePath(); fillStroke(ctx, '#7b8aa0');
  circle(ctx, o.cx, o.cy, 7); fillStroke(ctx, '#c9d2de');
  ctx.save(); ctx.translate(o.cx, o.cy); ctx.rotate(o.th);
  ctx.beginPath(); ctx.roundRect(-o.L, -16, o.L * 2, 16, 4); fillStroke(ctx, WOOD);
  ctx.strokeStyle = WOOD2; ctx.lineWidth = 2;
  for (let x = -o.L + 40; x < o.L; x += 60) { ctx.beginPath(); ctx.moveTo(x, -14); ctx.lineTo(x, -2); ctx.stroke(); }
  ctx.fillStyle = '#ffd23f'; for (const x of [-o.L + 10, o.L - 10]) { ctx.fillRect(x - 5, -13, 10, 10); }
  ctx.restore();
}
function drawPlank(ctx, o, t) {
  if (o.state === 'fall' && o.dy > 1400) return;
  const sh = o.state === 'shake' ? Math.sin(t * 80) * 2 : 0;
  ctx.save(); ctx.translate(o.x + o.pw / 2 + sh, o.y - 2 + o.dy + 7); ctx.rotate(o.rot);
  ctx.beginPath(); ctx.roundRect(-o.pw / 2 + 1, -8, o.pw - 2, 14, 3); fillStroke(ctx, o.state === 'idle' ? WOOD : '#b77a3e');
  ctx.strokeStyle = WOOD2; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-o.pw / 2 + 8, -2); ctx.lineTo(o.pw / 2 - 12, -2); ctx.stroke();
  ctx.fillStyle = OUTLINE; ctx.fillRect(-o.pw / 2 + 5, -4, 3, 3); ctx.fillRect(o.pw / 2 - 8, -4, 3, 3);
  ctx.restore();
}
function drawRopes(ctx, s) {
  for (const x of [s.x0, s.x1]) { ctx.beginPath(); ctx.roundRect(x - 6, s.y - 70, 12, 76, 3); fillStroke(ctx, WOOD2); circle(ctx, x, s.y - 70, 7); fillStroke(ctx, WOOD); }
  ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(s.x0, s.y - 62); ctx.quadraticCurveTo((s.x0 + s.x1) / 2, s.y - 10, s.x1, s.y - 62); ctx.stroke();
}
function drawDrawTower(ctx, o) {
  const x = o.hx + 22, y = o.hy, H = o.L + 40;
  ctx.beginPath(); ctx.rect(x - 11, y - H, 22, H + 6); fillStroke(ctx, '#5b5f73');
  ctx.strokeStyle = 'rgba(27,27,42,0.35)'; ctx.lineWidth = 2;
  for (let k = y - H + 30; k < y; k += 40) { ctx.beginPath(); ctx.moveTo(x - 11, k); ctx.lineTo(x + 11, k + 20); ctx.stroke(); }
  ctx.beginPath(); ctx.rect(x - 20, y - H - 12, 40, 18); fillStroke(ctx, '#7b8aa0');
  circle(ctx, x, y - H - 3, 6); fillStroke(ctx, '#ffd23f');
  // chain to the free end
  const fx = o.hx + Math.cos(o.phi) * o.L, fy = o.hy + Math.sin(o.phi) * o.L;
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 3; ctx.setLineDash([6, 4]);
  ctx.beginPath(); ctx.moveTo(x, y - H - 3); ctx.lineTo(fx, fy - 6); ctx.stroke(); ctx.setLineDash([]);
}
function drawDrawbridge(ctx, o) {
  ctx.save(); ctx.translate(o.hx, o.hy); ctx.rotate(o.phi - Math.PI);
  ctx.beginPath(); ctx.roundRect(-o.L, -7, o.L, 14, 3); fillStroke(ctx, '#8a5a34');
  ctx.strokeStyle = '#6a4224'; ctx.lineWidth = 2;
  for (let x = -o.L + 30; x < -10; x += 34) { ctx.beginPath(); ctx.moveTo(x, -6); ctx.lineTo(x, 6); ctx.stroke(); }
  ctx.fillStyle = '#c9d2de'; for (let x = -o.L + 12; x < 0; x += 34) ctx.fillRect(x, -2, 4, 4);
  ctx.beginPath(); ctx.rect(-o.L, -7, 18, 14); fillStroke(ctx, '#ff5a3d');
  ctx.restore();
  circle(ctx, o.hx, o.hy, 8); fillStroke(ctx, '#c9d2de');
}
function drawCrate(ctx, o) {
  if (o.state === 'wait' || o.state === 'smashed') return;
  const s = o.s, sq = o.squash;
  ctx.save(); ctx.translate(o.x, o.y); ctx.scale(1 + sq * 0.18, 1 - sq * 0.18);
  ctx.beginPath(); ctx.rect(-s / 2, -s, s, s); fillStroke(ctx, '#d99a55');
  ctx.strokeStyle = '#9a6232'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(-s / 2 + 7, -7); ctx.lineTo(s / 2 - 7, -s + 7); ctx.stroke();
  ctx.lineWidth = LW; ctx.strokeStyle = OUTLINE; ctx.strokeRect(-s / 2 + 6, -s + 6, s - 12, s - 12);
  ctx.restore();
  if (o.state === 'fall') { ctx.fillStyle = 'rgba(27,27,42,0.25)'; const k = Math.max(0.2, 1 - (o.gy - o.y) / 720); ctx.beginPath(); ctx.ellipse(o.x, o.gy, s * 0.6 * k, 6 * k, 0, 0, TAU); ctx.fill(); }
}
function drawTnt(ctx, o, t) {
  if (o.state === 'gone') return;
  const x = o.x, y = o.y;
  ctx.beginPath(); ctx.roundRect(x - 16, y - 42, 32, 42, 6); fillStroke(ctx, '#e8433a');
  ctx.fillStyle = OUTLINE; ctx.fillRect(x - 16, y - 34, 32, 5); ctx.fillRect(x - 16, y - 12, 32, 5);
  ctx.fillStyle = '#fff4e0'; ctx.font = '900 11px "Lilita One", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('TNT', x, y - 16);
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x, y - 42); ctx.quadraticCurveTo(x + 6, y - 52, x + 2, y - 58); ctx.stroke();
  const f = 0.6 + 0.4 * Math.sin(t * 30 + x);
  ctx.fillStyle = '#ffd23f'; circle(ctx, x + 2, y - 59, 3.5 * f + 1.5); ctx.fill();
}
function drawFan(ctx, s, t) {
  const f = s.fan, x = s.x, y = s.y;
  // wind columns
  ctx.save();
  ctx.globalAlpha = 0.18; ctx.fillStyle = '#ffffff';
  ctx.fillRect(f.x0 + 10, f.top, f.x1 - f.x0 - 20, y - f.top);
  ctx.globalAlpha = 0.5; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  for (let i = 0; i < 14; i++) {
    const u = ((t * 0.9 + i * 0.137) % 1);
    const wx = f.x0 + 20 + ((i * 53) % Math.max(1, f.x1 - f.x0 - 40));
    const wy = y - u * (y - f.top);
    ctx.globalAlpha = Math.sin(u * Math.PI) * 0.6;
    ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx + Math.sin(u * 12 + i) * 6, wy - 46); ctx.stroke();
  }
  ctx.restore();
  ctx.beginPath(); ctx.roundRect(x - 90, y - 20, 180, 70, 10); fillStroke(ctx, '#5b6680');
  ctx.beginPath(); ctx.ellipse(x, y - 20, 80, 14, 0, 0, TAU); fillStroke(ctx, '#2b2b3d');
  ctx.strokeStyle = '#c9d2de'; ctx.lineWidth = 6;
  for (let k = 0; k < 4; k++) { const a = t * 22 + k * Math.PI / 2; ctx.beginPath(); ctx.moveTo(x, y - 20); ctx.lineTo(x + Math.cos(a) * 72, y - 20 + Math.sin(a) * 11); ctx.stroke(); }
  circle(ctx, x, y - 20, 8); fillStroke(ctx, '#ffd23f');
}
function drawFinish(ctx, s, t) {
  const x = s.x, y = s.y;
  for (const px of [x - 70, x + 70]) { ctx.beginPath(); ctx.rect(px - 6, y - 190, 12, 192); fillStroke(ctx, '#f4f1ea'); }
  ctx.save(); ctx.beginPath(); ctx.rect(x - 76, y - 200, 152, 44); ctx.clip();
  for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { ctx.fillStyle = (i + j) % 2 ? '#1b1b2a' : '#ffffff'; ctx.fillRect(x - 76 + i * 10 + Math.sin(t * 4 + i * 0.5) * 1.5, y - 200 + j * 11, 10, 11); }
  ctx.restore();
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = LW; ctx.strokeRect(x - 76, y - 200, 152, 44);
  // checkered strip on the ground
  for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) { ctx.fillStyle = (i + j) % 2 ? '#1b1b2a' : '#ffffff'; ctx.fillRect(x - 15 + j * 15, y + 4 + i * 10, 15, 10); }
}
// big striped checkpoint flag in the world's accent colour; it goes green and
// waves hard for a moment when you pass it
export function drawCheckpoint(ctx, cp, reached, t, T) {
  const x = cp.x, y = cp.y;
  ctx.beginPath(); ctx.rect(x - 5, y - 176, 10, 178); fillStroke(ctx, '#e6e9ef');
  ctx.fillStyle = 'rgba(27,27,42,0.25)'; ctx.fillRect(x + 1, y - 170, 3, 170);
  const since = reached ? (cp.anim2 || 0) : 99;
  const wave = (reached && since < 1.6 ? 9 - since * 4 : 3), spd = reached && since < 1.6 ? 14 : 5;
  const W = 112, Hh = 62, n = 8;
  const top = (i) => y - 172 + Math.sin(t * spd - i * 0.9) * wave * (i / n);
  const bot = (i) => y - 172 + Hh + Math.sin(t * spd - i * 0.9) * wave * (i / n) - i * 1.2;
  const flag = new Path2D();
  flag.moveTo(x + 5, y - 172);
  for (let i = 0; i <= n; i++) flag.lineTo(x + 5 + i * (W / n), top(i));
  for (let i = n; i >= 0; i--) flag.lineTo(x + 5 + i * (W / n), bot(i));
  flag.closePath();
  const base = reached ? '#36c46a' : T.accent, stripe = reached ? '#d8ffe0' : '#ffffff';
  ctx.fillStyle = base; ctx.fill(flag);
  ctx.save(); ctx.clip(flag);
  ctx.fillStyle = stripe; ctx.globalAlpha = reached ? 0.9 : 0.85;
  for (let i = 0; i < n; i += 2) { ctx.beginPath(); ctx.moveTo(x + 5 + i * (W / n), top(i)); ctx.lineTo(x + 5 + (i + 1) * (W / n), top(i + 1)); ctx.lineTo(x + 5 + (i + 1) * (W / n), bot(i + 1)); ctx.lineTo(x + 5 + i * (W / n), bot(i)); ctx.closePath(); ctx.fill(); }
  ctx.globalAlpha = 1;
  if (reached) { ctx.fillStyle = OUTLINE; ctx.font = '900 30px "Lilita One", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✓', x + 5 + W / 2, y - 172 + Hh / 2 - 4); }
  ctx.restore();
  ctx.lineWidth = LW; ctx.strokeStyle = OUTLINE; ctx.stroke(flag);
  circle(ctx, x, y - 180, 8); fillStroke(ctx, reached ? '#ffd23f' : '#c9d2de');
  if (!reached) { ctx.fillStyle = OUTLINE; ctx.font = '900 13px "Lilita One", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('CP', x, y - 180); }
}
function drawBoulder(ctx, b, world, t) {
  const volcano = world.themeKey === 'volcano', snow = world.themeKey === 'glacier';
  const gy = world.terrain.surfaceY(b.x);
  if (isFinite(gy) && gy > b.y) {
    const d = gy - b.y - b.r, k = Math.max(0.15, 1 - d / 700);
    ctx.fillStyle = 'rgba(27,27,42,0.28)'; ctx.beginPath(); ctx.ellipse(b.x, gy + 2, b.r * 1.1 * k, 7 * k, 0, 0, TAU); ctx.fill();
    if (b.kind === 'drop' && d > 80) {
      ctx.fillStyle = '#ff3d3d'; ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 20);
      ctx.font = '900 34px "Lilita One", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', b.x, gy - 18); ctx.globalAlpha = 1;
    }
  }
  ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot);
  const col = volcano ? '#4b3f4a' : snow ? '#e9f7ff' : '#a0684a';
  ctx.beginPath();
  for (let i = 0; i < 11; i++) { const a = (i / 11) * TAU, rr = b.r * (0.92 + 0.08 * Math.sin(i * 2.7)); i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(rr, 0); }
  ctx.closePath(); fillStroke(ctx, col);
  ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.beginPath(); ctx.arc(-b.r * 0.3, -b.r * 0.3, b.r * 0.35, 0, TAU); ctx.fill();
  ctx.strokeStyle = volcano ? '#ff6a2a' : 'rgba(27,27,42,0.45)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-b.r * 0.2, -b.r * 0.1); ctx.lineTo(b.r * 0.25, b.r * 0.2); ctx.lineTo(b.r * 0.1, b.r * 0.55); ctx.moveTo(b.r * 0.25, b.r * 0.2); ctx.lineTo(b.r * 0.6, b.r * 0.1); ctx.stroke();
  ctx.restore();
}

// ------------------------------------------------------------------ bike + rider
function drawWheel(ctx, x, y, r, rot, style, color2, dark) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  circle(ctx, 0, 0, r); fillStroke(ctx, dark ? '#202030' : '#2f2f42');
  if (style !== 'bmx') {
    ctx.fillStyle = '#2f2f42';
    for (let k = 0; k < 16; k++) { ctx.save(); ctx.rotate((k / 16) * TAU); ctx.fillRect(r - 1.5, -2.5, 3.5, 5); ctx.restore(); }
    circle(ctx, 0, 0, r + 0.5); ctx.lineWidth = LW * 0.8; ctx.strokeStyle = OUTLINE; ctx.stroke();
  }
  const rr = style === 'quad' ? r * 0.55 : style === 'bmx' ? r * 0.85 : r * 0.68;
  circle(ctx, 0, 0, rr); ctx.lineWidth = 3; ctx.strokeStyle = style === 'rocket' ? color2 : '#c9d2de'; ctx.stroke();
  if (style === 'quad') { circle(ctx, 0, 0, rr); ctx.fillStyle = '#c9d2de'; ctx.fill(); }
  ctx.strokeStyle = '#e6ebf2'; ctx.lineWidth = style === 'bmx' ? 1.2 : 1.8;
  const n = style === 'quad' ? 5 : style === 'bmx' ? 12 : 8;
  ctx.beginPath();
  for (let k = 0; k < n; k++) { const a = (k / n) * TAU; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  if (style === 'quad') { ctx.strokeStyle = '#7b8aa0'; ctx.lineWidth = 3; }
  ctx.stroke();
  ctx.fillStyle = color2; ctx.beginPath(); ctx.arc(0, 0, rr + 1.5, -0.35, 0.35); ctx.arc(0, 0, rr - 1.5, 0.35, -0.35, true); ctx.fill();
  circle(ctx, 0, 0, r * 0.2); fillStroke(ctx, '#8a96a8', LW * 0.7);
  ctx.restore();
}

// local position of a wheel (inverse chassis transform)
function wheelLocal(bike, w) {
  const c = bike.c, ca = Math.cos(-c.a), sa = Math.sin(-c.a), dx = w.x - c.x, dy = w.y - c.y;
  return [ca * dx - sa * dy, sa * dx + ca * dy];
}

export function drawBike(ctx, bike, look, t, opts = {}) {
  const sp = bike.spec, c = bike.c, st = sp.style;
  const ghost = opts.ghost;
  const col = ghost ? '#ffffff' : look.color || sp.color, col2 = ghost ? '#ffffff' : sp.color2;
  if (ghost) ctx.globalAlpha = 0.32;
  // far-side quad wheels
  if (st === 'quad') for (const w of bike.wh) drawWheel(ctx, w.x + 5, w.y - 3, w.r * 0.96, w.rot, st, col2, true);
  const R = bike.wh[0], F = bike.wh[1];
  drawWheel(ctx, R.x, R.y, R.r, R.rot, st, col2);
  drawWheel(ctx, F.x, F.y, F.r, F.rot, st, col2);
  ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.a);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const rl = wheelLocal(bike, R), fl = wheelLocal(bike, F);
  const pose = riderPose(sp, bike.lean, {});
  // rider far-side limbs go behind the bike
  if (bike.riderOn && !opts.noRider) drawRiderBack(ctx, pose, look, ghost);
  if (st === 'bmx') drawBmx(ctx, rl, fl, col, col2, R.rot);
  else if (st === 'quad') drawQuad(ctx, rl, fl, col, col2);
  else if (st === 'chopper') drawChopper(ctx, rl, fl, col, col2);
  else drawMoto(ctx, rl, fl, col, col2, st, bike.throttle, t);
  if (bike.riderOn && !opts.noRider) drawRiderFront(ctx, pose, look, ghost, bike.lean);
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawMoto(ctx, rl, fl, col, col2, st, throttle, t) {
  const sc = st === 'mini' ? 0.8 : 1;
  // swingarm + fork go to the real (sprung) wheel positions
  limb(ctx, [[-4 * sc, 8 * sc], rl], 6, '#55596e');
  const head = [22 * sc, -18 * sc];
  limb(ctx, [head, fl], 7, '#3a3d52');
  ctx.lineCap = 'round'; ctx.strokeStyle = '#e6ebf2'; ctx.lineWidth = 3;
  const fx = head[0] + (fl[0] - head[0]) * 0.45, fy = head[1] + (fl[1] - head[1]) * 0.45;
  ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fl[0], fl[1]); ctx.stroke();
  ctx.save(); ctx.scale(sc, sc);
  if (st === 'rocket') {
    // rocket nozzle + flame
    ctx.beginPath(); ctx.moveTo(-36, -14); ctx.lineTo(-58, -20); ctx.lineTo(-58, 0); ctx.lineTo(-36, -2); ctx.closePath(); fillStroke(ctx, '#8a96a8');
    if (throttle) {
      const f = 0.7 + 0.3 * Math.sin(t * 60);
      ctx.beginPath(); ctx.moveTo(-58, -18); ctx.lineTo(-58 - 40 * f, -10); ctx.lineTo(-58, -2); ctx.closePath(); ctx.fillStyle = '#ffd23f'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(-58, -14); ctx.lineTo(-58 - 22 * f, -10); ctx.lineTo(-58, -6); ctx.closePath(); ctx.fillStyle = '#ffffff'; ctx.fill();
    }
  }
  // engine
  ctx.beginPath(); ctx.roundRect(-14, -6, 28, 22, 5); fillStroke(ctx, '#4b4b60');
  ctx.strokeStyle = '#6d7088'; ctx.lineWidth = 2; for (let y = -1; y < 14; y += 4) { ctx.beginPath(); ctx.moveTo(-10, y); ctx.lineTo(8, y); ctx.stroke(); }
  // exhaust
  ctx.beginPath(); ctx.moveTo(10, 2); ctx.quadraticCurveTo(14, 18, -4, 16); ctx.quadraticCurveTo(-22, 14, -30, -4);
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 7 + LW * 2; ctx.stroke(); ctx.strokeStyle = '#cfd6df'; ctx.lineWidth = 7; ctx.stroke();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath(); ctx.roundRect(-48, -12, 24, 10, 4); fillStroke(ctx, '#dfe5ec');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(-44, -10, 14, 2);
  // tail / rear fender
  ctx.beginPath(); ctx.moveTo(-8, -16); ctx.lineTo(-52, -24); ctx.lineTo(-54, -18); ctx.lineTo(-14, -6); ctx.closePath(); fillStroke(ctx, col);
  // side number plate
  ctx.beginPath(); ctx.ellipse(-22, -12, 10, 6, -0.15, 0, TAU); fillStroke(ctx, '#ffffff', LW * 0.8);
  // seat
  ctx.beginPath(); ctx.moveTo(-40, -19); ctx.quadraticCurveTo(-20, -26, -4, -24); ctx.lineTo(-2, -18); ctx.quadraticCurveTo(-22, -16, -38, -13); ctx.closePath(); fillStroke(ctx, '#2b2b3d');
  // tank
  ctx.beginPath(); ctx.moveTo(-6, -22); ctx.quadraticCurveTo(8, -30, 24, -24); ctx.lineTo(24, -12); ctx.quadraticCurveTo(10, -6, -4, -10); ctx.closePath(); fillStroke(ctx, col);
  ctx.beginPath(); ctx.moveTo(0, -20); ctx.quadraticCurveTo(10, -25, 20, -22); ctx.lineTo(19, -18); ctx.quadraticCurveTo(10, -20, 1, -16); ctx.closePath(); ctx.fillStyle = col2; ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.ellipse(6, -24, 6, 2, -0.2, 0, TAU); ctx.fill();
  // front fender + number board
  ctx.beginPath(); ctx.moveTo(26, -8); ctx.quadraticCurveTo(42, -16, 58, -8); ctx.lineTo(56, -4); ctx.quadraticCurveTo(42, -10, 28, -3); ctx.closePath(); fillStroke(ctx, col);
  ctx.beginPath(); ctx.moveTo(22, -30); ctx.lineTo(32, -26); ctx.lineTo(30, -10); ctx.lineTo(22, -12); ctx.closePath(); fillStroke(ctx, '#ffffff');
  // bars
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(22, -22); ctx.lineTo(20, -30); ctx.lineTo(14, -31); ctx.stroke();
  ctx.restore();
}
function drawChopper(ctx, rl, fl, col, col2) {
  limb(ctx, [[-10, 8], rl], 6, '#55596e');
  const head = [26, -24];
  limb(ctx, [head, fl], 5, '#cfd6df');
  // V-twin
  ctx.beginPath(); ctx.roundRect(-14, -6, 30, 22, 6); fillStroke(ctx, '#4b4b60');
  for (const a of [-0.45, 0.45]) { ctx.save(); ctx.translate(2, 0); ctx.rotate(a); ctx.beginPath(); ctx.roundRect(-6, -20, 12, 18, 3); fillStroke(ctx, '#dfe5ec'); ctx.restore(); }
  // twin pipes
  for (const dy of [0, 6]) {
    ctx.beginPath(); ctx.moveTo(8, 6 + dy); ctx.quadraticCurveTo(-20, 16 + dy, -62, 6 + dy);
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 6 + LW * 2; ctx.stroke(); ctx.strokeStyle = '#d5dbe4'; ctx.lineWidth = 6; ctx.stroke();
  }
  // frame + sissy bar
  limb(ctx, [[-30, -6], [-2, 12], [26, -24]], 5, '#2b2b3d');
  limb(ctx, [[-36, -10], [-44, -40]], 4, '#cfd6df');
  ctx.beginPath(); ctx.moveTo(-36, -12); ctx.quadraticCurveTo(-56, -20, -64, -8); ctx.lineTo(-40, -4); ctx.closePath(); fillStroke(ctx, col);
  ctx.beginPath(); ctx.moveTo(-34, -16); ctx.quadraticCurveTo(-18, -20, -6, -16); ctx.lineTo(-6, -10); ctx.lineTo(-32, -8); ctx.closePath(); fillStroke(ctx, '#3a2a22');
  ctx.beginPath(); ctx.ellipse(10, -20, 18, 9, -0.1, 0, TAU); fillStroke(ctx, col);
  ctx.beginPath(); ctx.ellipse(8, -23, 10, 3, -0.1, 0, TAU); ctx.fillStyle = col2; ctx.fill();
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(26, -24); ctx.lineTo(22, -40); ctx.lineTo(14, -40); ctx.stroke();
  circle(ctx, 34, -26, 6); fillStroke(ctx, '#fff4c2');
}
function drawBmx(ctx, rl, fl, col, col2, rot) {
  const bb = [2, 6], seat = [-8, -14], head = [22, -20];
  limb(ctx, [rl, seat, bb, rl], 4, col);
  limb(ctx, [seat, head, bb], 5, col);
  limb(ctx, [head, fl], 4, col);
  limb(ctx, [seat, [-10, -20]], 3, '#8a96a8');
  ctx.beginPath(); ctx.roundRect(-20, -24, 22, 6, 3); fillStroke(ctx, '#2b2b3d');
  limb(ctx, [head, [20, -30], [14, -32]], 3, '#2b2b3d');
  // cranks spin with the rear wheel
  const a = rot * 0.8;
  circle(ctx, bb[0], bb[1], 6); fillStroke(ctx, '#c9d2de');
  for (const s of [0, Math.PI]) { const ex = bb[0] + Math.cos(a + s) * 11, ey = bb[1] + Math.sin(a + s) * 11; limb(ctx, [bb, [ex, ey]], 3, '#8a96a8'); ctx.fillStyle = OUTLINE; ctx.fillRect(ex - 5, ey - 2, 10, 4); }
}
function drawQuad(ctx, rl, fl, col, col2) {
  limb(ctx, [[-6, 6], rl], 7, '#55596e'); limb(ctx, [[10, 6], fl], 7, '#55596e');
  ctx.beginPath(); ctx.roundRect(-20, -4, 40, 20, 5); fillStroke(ctx, '#4b4b60');
  // fenders
  ctx.beginPath(); ctx.moveTo(-58, -2); ctx.quadraticCurveTo(-34, -30, -8, -16); ctx.lineTo(-8, -6); ctx.lineTo(-56, 4); ctx.closePath(); fillStroke(ctx, col);
  ctx.beginPath(); ctx.moveTo(8, -16); ctx.quadraticCurveTo(36, -30, 60, -4); ctx.lineTo(58, 4); ctx.lineTo(8, -6); ctx.closePath(); fillStroke(ctx, col);
  ctx.beginPath(); ctx.moveTo(-34, -20); ctx.quadraticCurveTo(-12, -28, 6, -22); ctx.lineTo(6, -14); ctx.lineTo(-32, -12); ctx.closePath(); fillStroke(ctx, '#2b2b3d');
  // racks
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 3; ctx.strokeRect(30, -30, 24, 6); ctx.strokeRect(-56, -26, 22, 5);
  ctx.beginPath(); ctx.moveTo(14, -18); ctx.lineTo(16, -32); ctx.lineTo(10, -33); ctx.lineWidth = 4; ctx.stroke();
  ctx.fillStyle = col2; ctx.fillRect(-48, -12, 10, 4); ctx.fillRect(38, -12, 10, 4);
  circle(ctx, 56, -14, 5); fillStroke(ctx, '#fff4c2');
}

function suitCols(look) { return { s1: look.suit.c1, s2: look.suit.c2, h1: look.helmet.c1, h2: look.helmet.c2 }; }
function drawRiderBack(ctx, P, look, ghost) {
  const S = suitCols(look), dark = ghost ? '#ffffff' : mix(S.s1, '#1b1b2a', 0.35);
  limb(ctx, [P.pel, [P.knee[0] - 3, P.knee[1] + 1], [P.foot[0] - 3, P.foot[1]]], 10, dark);
  limb(ctx, [P.neck, [P.elbow[0] - 2, P.elbow[1]], [P.hand[0] - 2, P.hand[1]]], 7, dark);
}
function drawRiderFront(ctx, P, look, ghost, lean) {
  const S = suitCols(look);
  const s1 = ghost ? '#ffffff' : S.s1, s2 = ghost ? '#ffffff' : S.s2;
  // torso
  limb(ctx, [P.pel, P.neck], 17, s1);
  ctx.strokeStyle = s2; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(P.pel[0] + 1, P.pel[1] - 2); ctx.lineTo(P.neck[0] + 1, P.neck[1] + 3); ctx.stroke();
  // leg
  limb(ctx, [P.pel, P.knee, P.foot], 11, s1);
  ctx.save(); ctx.translate(P.foot[0], P.foot[1]);
  ctx.beginPath(); ctx.roundRect(-6, -7, 16, 10, 3); fillStroke(ctx, '#2b2b3d'); ctx.restore();
  ctx.beginPath(); circle(ctx, P.knee[0], P.knee[1], 5); fillStroke(ctx, s2, LW * 0.7);
  // arm
  limb(ctx, [P.neck, P.elbow, P.hand], 8, s1);
  circle(ctx, P.hand[0], P.hand[1], 5); fillStroke(ctx, '#2b2b3d', LW * 0.8);
  drawHelmet(ctx, P.head[0], P.head[1], lean * 0.15, look.helmet, ghost);
}

export function drawHelmet(ctx, x, y, ang, H, ghost, r = HEAD_R) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  const c1 = ghost ? '#ffffff' : H.c1, c2 = ghost ? '#ffffff' : H.c2;
  circle(ctx, 0, 0, r);
  if (H.pat === 'chrome' && !ghost) { const g = ctx.createLinearGradient(-r, -r, r, r); g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, c1); g.addColorStop(1, c2); ctx.fillStyle = g; } else ctx.fillStyle = c1;
  ctx.fill();
  ctx.save(); circle(ctx, 0, 0, r); ctx.clip();
  if (!ghost) {
    ctx.fillStyle = c2;
    if (H.pat === 'stripe') { ctx.fillRect(-r, -4, r * 2, 6); }
    else if (H.pat === 'flames') { ctx.beginPath(); ctx.moveTo(-r, -2); for (let i = 0; i < 4; i++) { ctx.quadraticCurveTo(-r + 4 + i * 6, -14 + (i % 2) * 6, -r + 8 + i * 6, -4); } ctx.lineTo(-r + 30, 8); ctx.lineTo(-r, 10); ctx.fill(); }
    else if (H.pat === 'teeth') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 4, r, 10); ctx.fillStyle = OUTLINE; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(i * 4, 4); ctx.lineTo(i * 4 + 2, 9); ctx.lineTo(i * 4 + 4, 4); ctx.fill(); } circle(ctx, -4, -6, 2.2); ctx.fill(); ctx.fillStyle = c1; ctx.beginPath(); ctx.moveTo(-6, -r); ctx.lineTo(-12, -r - 10); ctx.lineTo(-2, -r + 2); ctx.fill(); }
    else if (H.pat === 'star') { star(ctx, -3, 1, 7, 3); ctx.fill(); }
    else if (H.pat === 'checker') { for (let i = -3; i < 3; i++) for (let j = -3; j < 3; j++) if ((i + j) & 1) ctx.fillRect(i * 6, j * 6, 6, 6); }
    else if (H.pat === 'chrome') { ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.ellipse(-4, -7, 6, 3, -0.5, 0, TAU); ctx.fill(); }
  }
  // visor + chin bar
  ctx.fillStyle = '#1b1b2a'; ctx.beginPath(); ctx.roundRect(r * 0.15, -r * 0.45, r * 0.95, r * 0.55, 4); ctx.fill();
  ctx.fillStyle = 'rgba(140,220,255,0.55)'; ctx.fillRect(r * 0.3, -r * 0.38, r * 0.6, 3);
  ctx.restore();
  circle(ctx, 0, 0, r); stroke(ctx);
  ctx.beginPath(); ctx.moveTo(r * 0.55, r * 0.45); ctx.quadraticCurveTo(r * 1.2, r * 0.35, r * 1.05, -r * 0.02); ctx.lineWidth = LW; ctx.strokeStyle = OUTLINE; ctx.stroke();
  if (!ghost) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(-r * 0.3, -r * 0.55, r * 0.35, r * 0.16, -0.5, 0, TAU); ctx.fill(); }
  ctx.restore();
}
function star(ctx, x, y, R, r) { ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r : R; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.closePath(); }

export function drawRagdoll(ctx, rd, look, burnt) {
  const p = rd.p.map((q) => [q.x, q.y]);
  const S = suitCols(look);
  const s1 = burnt ? '#3a3340' : S.s1, s2 = burnt ? '#55505e' : S.s2, dark = mix(s1, '#1b1b2a', 0.35);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  limb(ctx, [p[2], p[9], p[10]], 10, dark);
  limb(ctx, [p[1], p[5], p[6]], 7, dark);
  limb(ctx, [p[2], p[1]], 17, s1);
  ctx.strokeStyle = s2; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(p[2][0], p[2][1]); ctx.lineTo(p[1][0], p[1][1]); ctx.stroke();
  limb(ctx, [p[2], p[7], p[8]], 11, s1);
  limb(ctx, [p[1], p[3], p[4]], 8, s1);
  for (const k of [8, 10]) { circle(ctx, p[k][0], p[k][1], 6); fillStroke(ctx, '#2b2b3d', LW * 0.8); }
  for (const k of [4, 6]) { circle(ctx, p[k][0], p[k][1], 5); fillStroke(ctx, '#2b2b3d', LW * 0.8); }
  const a = Math.atan2(p[0][1] - p[1][1], p[0][0] - p[1][0]) + Math.PI / 2;
  const H = burnt ? { c1: '#3a3340', c2: '#55505e', pat: 'none' } : look.helmet;
  drawHelmet(ctx, p[0][0], p[0][1], a, H, false);
}
