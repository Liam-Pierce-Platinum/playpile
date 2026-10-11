// Sprite cache. Every enemy is a flat dark silhouette with ONE rim-light colour on
// the side that faces the lantern, baked once per animation frame (plus a white
// "hit flash" copy). The player and upgrade icons are drawn with paths too.
import { makeCanvas, TAU } from './util.js';
import { ENEMY, UP, FAMS, CHARS } from './data.js';

export let SS = 3;            // bake scale: set to zoom*dpr so sprites blit 1:1 (fast and crisp)
export const SPR = {};
export const PLAYER = {};

function figure(w, h, ax, ay, nf, shape, body, rim, shift = [-2.2, 1.4], extra) {
  const frames = [], flash = [], burn = [];
  for (let f = 0; f < nf; f++) {
    const c = makeCanvas(w * SS, h * SS), g = c.getContext('2d');
    g.setTransform(SS, 0, 0, SS, ax * SS, ay * SS);
    g.fillStyle = rim; g.strokeStyle = rim; g.lineCap = 'round'; g.lineJoin = 'round';
    shape(g, f, nf);
    g.globalCompositeOperation = 'source-atop';
    g.translate(shift[0], shift[1]);
    g.fillStyle = body; g.strokeStyle = body;
    shape(g, f, nf);
    g.setTransform(SS, 0, 0, SS, ax * SS, ay * SS);
    // faint inner sheen so big silhouettes are not dead flat
    const gr = g.createLinearGradient(-w / 2, 0, w / 2, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0.25)'); gr.addColorStop(1, 'rgba(255,255,255,0.03)');
    g.fillStyle = gr; g.fillRect(-ax, -ay, w, h);
    g.globalCompositeOperation = 'source-over';
    if (extra) extra(g, f, nf);
    frames.push(c);
    const c2 = makeCanvas(w * SS, h * SS), g2 = c2.getContext('2d');
    g2.drawImage(c, 0, 0); g2.globalCompositeOperation = 'source-atop'; g2.fillStyle = '#fff6e6'; g2.fillRect(0, 0, c2.width, c2.height);
    flash.push(c2);
    // the "burning" copy: an ember-orange wash with a hot rim, drawn over anything standing in the light
    const c3 = makeCanvas(w * SS, h * SS), g3 = c3.getContext('2d');
    g3.drawImage(c, 0, 0); g3.globalCompositeOperation = 'source-atop';
    const bg = g3.createLinearGradient(0, 0, 0, h * SS); bg.addColorStop(0, '#ffb347'); bg.addColorStop(1, '#ff5a1e');
    g3.fillStyle = bg; g3.fillRect(0, 0, c3.width, c3.height);
    burn.push(c3);
  }
  const flip = (c) => { const o = makeCanvas(c.width, c.height), q = o.getContext('2d'); q.translate(c.width, 0); q.scale(-1, 1); q.drawImage(c, 0, 0); return o; };
  return { frames, flash, burn, framesL: frames.map(flip), flashL: flash.map(flip), burnL: burn.map(flip), w, h, ax, ay };
}

// ---------- shapes (facing right, origin at the feet / hover point) ----------
function mothShape(g, f, nf) {
  const k = [1, 0.62, 0.28, 0.62][f % 4];
  g.beginPath();
  // upper wings
  for (const s of [-1, 1]) {
    g.moveTo(0, -12);
    g.bezierCurveTo(s * 7, -26 * k - 4, s * 17, -22 * k - 6, s * 15, -12);
    g.bezierCurveTo(s * 13, -9, s * 6, -9, 0, -10);
    // lower wings
    g.moveTo(0, -9);
    g.bezierCurveTo(s * 10, -4 - 6 * k, s * 12, -4 + 2 * k, s * 6, -2);
    g.bezierCurveTo(s * 3, -3, s * 1, -6, 0, -8);
  }
  g.fill();
  g.beginPath(); g.ellipse(0, -9, 2.4, 6, 0, 0, TAU); g.fill();
  g.lineWidth = 0.8; g.beginPath(); g.moveTo(-1, -14); g.quadraticCurveTo(-4, -20, -6, -19); g.moveTo(1, -14); g.quadraticCurveTo(4, -20, 6, -19); g.stroke();
}
function wolfShape(g, f) {
  const leg = [[6, -4, -10, 2], [3, 1, -6, -2], [-4, 6, 2, -8], [1, 3, -2, -5]][f % 4];
  const bob = [0, -1.2, 0, -1.2][f % 4];
  g.save(); g.translate(0, bob);
  g.beginPath();
  g.moveTo(-18, -15);
  g.quadraticCurveTo(-4, -23, 9, -19);
  g.lineTo(13, -23); g.lineTo(15, -30); g.lineTo(18, -24); g.lineTo(20, -29); g.lineTo(21.5, -22);
  g.quadraticCurveTo(26, -20, 30, -16); g.lineTo(29, -13); g.lineTo(21, -12.5);
  g.quadraticCurveTo(16, -9, 12, -9);
  g.lineTo(-13, -9); g.quadraticCurveTo(-20, -10, -18, -15);
  g.closePath(); g.fill();
  // tail
  g.beginPath(); g.moveTo(-16, -16); g.quadraticCurveTo(-28, -17, -33, -9 + (f % 2) * 2); g.quadraticCurveTo(-26, -12, -16, -11.5); g.fill();
  g.restore();
  // legs
  g.lineWidth = 3.4;
  const hips = [[10, -10], [7, -10], [-11, -10], [-14, -10]];
  g.beginPath();
  for (let i = 0; i < 4; i++) {
    const [hx, hy] = hips[i]; const fx = hx + leg[i];
    g.moveTo(hx, hy + bob); g.lineTo((hx + fx) / 2 + 1.5, -4); g.lineTo(fx, 0);
  }
  g.stroke();
}
function treeShape(g, f) {
  const sw = [0, 2, 0, -2][f % 4];
  g.beginPath();
  // trunk
  g.moveTo(-15, -6);
  g.bezierCurveTo(-17, -30, -14, -48, -10, -58);
  g.lineTo(-13 + sw, -72); g.lineTo(-6, -61); g.lineTo(-1, -76 + sw); g.lineTo(3, -61); g.lineTo(11 - sw, -70); g.lineTo(10, -56);
  g.bezierCurveTo(15, -44, 17, -28, 15, -6);
  g.closePath(); g.fill();
  // arms
  g.lineWidth = 5;
  g.beginPath(); g.moveTo(12, -40); g.quadraticCurveTo(26, -44 + sw, 30, -58 + sw); g.moveTo(26, -48 + sw); g.lineTo(34, -50 + sw);
  g.moveTo(-12, -38); g.quadraticCurveTo(-26, -40 - sw, -28, -54 - sw); g.stroke();
  g.lineWidth = 3; g.beginPath(); g.moveTo(-24, -46 - sw); g.lineTo(-33, -48 - sw); g.stroke();
  // roots / feet
  const st = [[-4, 4], [0, 0], [4, -4], [0, 0]][f % 4];
  g.lineWidth = 5;
  g.beginPath(); g.moveTo(-10, -8); g.quadraticCurveTo(-16 + st[0], -2, -22 + st[0], 0); g.moveTo(10, -8); g.quadraticCurveTo(16 + st[1], -2, 22 + st[1], 0);
  g.moveTo(0, -8); g.lineTo(2, 0); g.stroke();
}
function treeHoles(g) {
  // hollow face: dark knot holes where the eyes glow
  g.fillStyle = '#05060a';
  g.beginPath(); g.ellipse(-4, -42, 3.6, 4.6, 0, 0, TAU); g.ellipse(7, -42, 3.6, 4.6, 0, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(2, -28, 4.5, 6.5, 0, 0, TAU); g.fill();
}
function wraithShape(g, f) {
  const w = [0, 1.5, 0, -1.5][f % 4];
  g.beginPath();
  g.moveTo(-6, -52);
  g.quadraticCurveTo(8, -50, 13, -40);
  g.quadraticCurveTo(16, -32, 12, -26);
  g.quadraticCurveTo(20, -24 + w, 26, -20 + w);
  g.lineTo(30, -23 + w); g.lineTo(28, -19 + w); g.lineTo(32, -18 + w); g.lineTo(27, -16 + w); g.lineTo(29, -12 + w); g.lineTo(23, -15 + w);
  g.quadraticCurveTo(16, -18, 10, -16);
  g.bezierCurveTo(12, -6, 8, 0, 6 + w, 6);
  g.lineTo(2, -1); g.lineTo(-1, 9 - w); g.lineTo(-4, 0); g.lineTo(-9, 7 + w); g.lineTo(-11, -2); g.lineTo(-17 + w, 2);
  g.bezierCurveTo(-16, -14, -16, -30, -12, -40);
  g.quadraticCurveTo(-10, -48, -6, -52);
  g.closePath(); g.fill();
  g.lineWidth = 2.2; g.beginPath();
  g.moveTo(-14, -22); g.quadraticCurveTo(-24, -20 + w * 2, -31, -26 + w);
  g.moveTo(-15, -10); g.quadraticCurveTo(-25, -6 - w, -30, -12);
  g.stroke();
}
function wraithFace(g) { g.fillStyle = '#020306'; g.beginPath(); g.ellipse(6, -36, 5, 6.5, 0.15, 0, TAU); g.fill(); }
function broodShape(g, f) {
  const p = [0, 1.2, 2, 1.2][f % 4];
  g.beginPath();
  g.ellipse(0, -16, 22 + p, 15 + p * 0.6, 0, 0, TAU);
  g.ellipse(-12, -26, 9 + p * 0.5, 8 + p * 0.5, 0, 0, TAU);
  g.ellipse(10, -28, 8, 7 + p * 0.6, 0, 0, TAU);
  g.ellipse(2, -33, 6 + p * 0.4, 6, 0, 0, TAU);
  g.fill();
  g.lineWidth = 2.4; g.beginPath();
  for (let i = 0; i < 5; i++) { const x = -18 + i * 9; g.moveTo(x, -4); g.quadraticCurveTo(x - 4, 2, x - 7 + i, 4); }
  g.stroke();
}
function broodSacs(g, f) {
  const p = [0, 0.5, 1, 0.5][f % 4];
  g.fillStyle = `rgba(255,120,170,${0.35 + p * 0.25})`;
  for (const [x, y, r] of [[-10, -18, 3.5], [4, -14, 4], [12, -22, 3], [-3, -26, 2.6], [-14, -27, 2.4]]) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
}
function stagShape(g, f) {
  const leg = [[8, -6, -12, 4], [4, 0, -6, 0], [-6, 8, 4, -10], [0, 4, -2, -6]][f % 4];
  g.beginPath();
  g.moveTo(-30, -38);
  g.quadraticCurveTo(-6, -46, 16, -42);
  g.quadraticCurveTo(22, -50, 24, -62); // neck
  g.lineTo(30, -66); g.lineTo(40, -62); g.lineTo(42, -58); g.lineTo(32, -55);
  g.quadraticCurveTo(28, -44, 24, -34);
  g.quadraticCurveTo(10, -26, -22, -27);
  g.quadraticCurveTo(-34, -30, -30, -38);
  g.closePath(); g.fill();
  // antlers
  g.lineWidth = 2.6; g.beginPath();
  g.moveTo(28, -64); g.quadraticCurveTo(22, -80, 30, -96); g.moveTo(25, -76); g.lineTo(14, -84); g.moveTo(27, -86); g.lineTo(20, -98); g.moveTo(29, -92); g.lineTo(38, -100);
  g.moveTo(31, -64); g.quadraticCurveTo(38, -78, 48, -88); g.moveTo(36, -74); g.lineTo(46, -74); g.moveTo(42, -82); g.lineTo(44, -94);
  g.stroke();
  g.lineWidth = 4.2;
  const hips = [[16, -30], [12, -30], [-20, -30], [-25, -31]];
  g.beginPath();
  for (let i = 0; i < 4; i++) { const [hx, hy] = hips[i]; const fx = hx + leg[i]; g.moveTo(hx, hy); g.lineTo((hx + fx) / 2 + 2, -14); g.lineTo(fx, 0); }
  g.stroke();
  g.beginPath(); g.moveTo(-30, -37); g.lineTo(-37, -33); g.lineTo(-31, -32); g.fill();
}
function wardenShape(g, f) {
  const w = [0, 2, 0, -2][f % 4];
  g.beginPath();
  // hood + shoulders + cloak
  g.moveTo(4, -128);
  g.bezierCurveTo(22, -128, 30, -112, 28, -96);
  g.quadraticCurveTo(46, -88, 52, -64 + w); // shoulder / arm
  g.lineTo(62, -40 + w); g.lineTo(58, -38 + w); g.lineTo(64, -30 + w); g.lineTo(56, -33 + w); g.lineTo(58, -24 + w); g.lineTo(50, -36 + w);
  g.lineTo(40, -62);
  g.bezierCurveTo(42, -40, 40, -14, 34 + w, 4);
  g.lineTo(24, -4); g.lineTo(16, 8 - w); g.lineTo(6, -2); g.lineTo(-4, 8 + w); g.lineTo(-12, -2); g.lineTo(-22, 6 - w); g.lineTo(-28, -4); g.lineTo(-38 + w, 2);
  g.bezierCurveTo(-36, -30, -40, -60, -34, -78);
  g.quadraticCurveTo(-48, -66, -54, -46 - w); g.lineTo(-60, -40 - w); g.lineTo(-56, -38 - w); g.lineTo(-48, -50 - w);
  g.quadraticCurveTo(-42, -86, -22, -98);
  g.bezierCurveTo(-24, -116, -12, -128, 4, -128);
  g.closePath(); g.fill();
  // antler crown
  g.lineWidth = 3.4; g.beginPath();
  g.moveTo(-6, -124); g.quadraticCurveTo(-18, -140, -12, -158); g.moveTo(-12, -140); g.lineTo(-26, -148); g.moveTo(-14, -150); g.lineTo(-22, -164);
  g.moveTo(14, -124); g.quadraticCurveTo(28, -140, 24, -158); g.moveTo(24, -142); g.lineTo(38, -148); g.moveTo(26, -152); g.lineTo(34, -166);
  g.stroke();
}
function wardenFace(g) { g.fillStyle = '#020306'; g.beginPath(); g.ellipse(8, -106, 13, 15, 0.15, 0, TAU); g.fill(); }

export function buildSprites(scale) {
  if (scale) SS = Math.max(1, Math.min(4, Math.round(scale * 4) / 4));
  SPR.moth = figure(40, 34, 20, 26, 4, mothShape, '#151021', ENEMY.moth.rim, [-1.6, 1.6]);
  SPR.lumen = figure(40, 34, 20, 26, 4, mothShape, '#3a2a10', ENEMY.lumen.rim, [-1.2, 1.2]);
  SPR.wolf = figure(70, 40, 35, 34, 4, wolfShape, '#0d1430', ENEMY.wolf.rim);
  SPR.tree = figure(74, 84, 37, 80, 4, treeShape, '#121a10', ENEMY.tree.rim, [-3, 1.5], treeHoles);
  SPR.wraith = figure(68, 64, 34, 54, 4, wraithShape, '#071a24', ENEMY.wraith.rim, [-2.2, 1.4], wraithFace);
  SPR.brood = figure(56, 48, 28, 44, 4, broodShape, '#1d0d18', ENEMY.brood.rim, [-2.5, 1.5], broodSacs);
  SPR.stag = figure(100, 108, 46, 104, 4, stagShape, '#191208', ENEMY.stag.rim, [-3, 1.6]);
  SPR.warden = figure(140, 180, 66, 172, 4, wardenShape, '#0b0814', ENEMY.warden.rim, [-4, 2], wardenFace);
  // soft drop shadow
  const sh = makeCanvas(64, 32), sg = sh.getContext('2d');
  const gr = sg.createRadialGradient(32, 16, 0, 32, 16, 32);
  gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  sg.fillStyle = gr; sg.setTransform(1, 0, 0, 0.5, 0, 8); sg.beginPath(); sg.arc(32, 16, 32, 0, TAU); sg.fill();
  SPR.shadow = sh;
  for (const k of Object.keys(CHARS)) PLAYER[k] = playerFrames(k);
}

// ---------- the player: a small hooded figure, 4-frame bobbing walk ----------
function playerFrames(key) {
  const ch = CHARS[key];
  const frames = [];
  const W = 40, H = 52, AX = 20, AY = 48;
  const small = key === 'child' ? 0.86 : 1;
  for (let f = 0; f < 4; f++) {
    const c = makeCanvas(W * SS, H * SS), g = c.getContext('2d');
    g.setTransform(SS * small, 0, 0, SS * small, AX * SS, AY * SS);
    g.lineJoin = 'round'; g.lineCap = 'round';
    const bob = [0, -1.6, 0, -1.6][f];
    const step = [[-4, 3], [-1, 1], [3, -4], [1, -1]][f];
    // boots
    g.fillStyle = '#1a120c';
    g.beginPath(); g.ellipse(step[0] + 1, -1.5, 3.6, 2.2, 0, 0, TAU); g.ellipse(step[1] + 1, -1.8, 3.6, 2.2, 0, 0, TAU); g.fill();
    g.translate(0, bob);
    // cloak
    const cg = g.createLinearGradient(-10, 0, 10, 0);
    cg.addColorStop(0, shade(ch.cloak, -0.45)); cg.addColorStop(0.6, ch.cloak); cg.addColorStop(1, shade(ch.cloak, 0.35));
    g.fillStyle = cg;
    g.beginPath();
    g.moveTo(-1, -33);
    g.bezierCurveTo(8, -33, 10, -22, 10, -14);
    g.quadraticCurveTo(11, -6, 9, -3);
    g.lineTo(5, -4.5); g.lineTo(2, -2.5); g.lineTo(-2, -4.5); g.lineTo(-6, -2.5); g.lineTo(-10, -4);
    g.quadraticCurveTo(-11, -18, -8, -26);
    g.quadraticCurveTo(-6, -33, -1, -33);
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(10,6,4,0.6)'; g.lineWidth = 0.9; g.stroke();
    // trim
    g.strokeStyle = ch.trim; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(9, -3.5); g.lineTo(5, -4.5); g.lineTo(2, -2.5); g.lineTo(-2, -4.5); g.lineTo(-6, -2.5); g.lineTo(-10, -4); g.stroke();
    // head / hood
    if (key === 'witch') {
      g.fillStyle = shade(ch.cloak, -0.2);
      g.beginPath(); g.moveTo(-10, -33); g.lineTo(13, -33); g.quadraticCurveTo(4, -37, 2, -42); g.quadraticCurveTo(-1, -48, -9, -51); g.quadraticCurveTo(-3, -44, -5, -36); g.closePath(); g.fill();
      g.fillStyle = '#e8d4b0'; g.beginPath(); g.ellipse(3, -30.5, 4, 3.4, 0, 0, TAU); g.fill();
      g.strokeStyle = ch.trim; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-6, -35); g.lineTo(9, -35); g.stroke();
    } else if (key === 'miner') {
      g.fillStyle = '#e8c9a0'; g.beginPath(); g.ellipse(2, -31, 5, 4.6, 0, 0, TAU); g.fill();
      g.fillStyle = '#c99a2e'; g.beginPath(); g.ellipse(1, -35.5, 7, 4.6, 0, Math.PI, TAU); g.fill(); g.fillRect(-7, -36, 15, 1.6);
      g.fillStyle = '#fff1b0'; g.beginPath(); g.arc(7.6, -37, 2, 0, TAU); g.fill();
      g.fillStyle = '#ddd'; g.beginPath(); g.ellipse(4, -27.5, 4.5, 2.6, 0, 0, Math.PI); g.fill(); // beard
    } else if (key === 'monk') {
      g.fillStyle = '#d9b48c'; g.beginPath(); g.ellipse(2, -32, 5, 5, 0, 0, TAU); g.fill();
      g.fillStyle = shade(ch.cloak, -0.25); g.beginPath(); g.ellipse(-2, -29, 7, 4, 0.2, 0, Math.PI); g.fill();
      g.fillStyle = '#2a1a10'; g.fillRect(4.2, -33, 1.2, 1.2);
    } else {
      g.fillStyle = key === 'child' ? shade(ch.cloak, 0.1) : shade(ch.cloak, -0.1);
      g.beginPath(); g.moveTo(-8, -28); g.bezierCurveTo(-10, -42, 8, -44, 9, -33); g.quadraticCurveTo(10, -28, 7, -26); g.quadraticCurveTo(-2, -24, -8, -28); g.fill();
      g.fillStyle = '#0c0806'; g.beginPath(); g.ellipse(4, -31, 4, 4.2, 0.1, 0, TAU); g.fill();
      g.fillStyle = '#ffd98a'; g.fillRect(4.6, -32, 1.1, 1.1); g.fillRect(7, -32, 1.1, 1.1);
      if (key === 'child') { g.strokeStyle = ch.trim; g.lineWidth = 1.4; g.beginPath(); g.moveTo(-5, -40); g.quadraticCurveTo(-9, -46, -4, -47); g.stroke(); }
    }
    // arm holding the lantern forward
    g.strokeStyle = shade(ch.cloak, 0.2); g.lineWidth = 3.2;
    g.beginPath(); g.moveTo(4, -24); g.quadraticCurveTo(10, -20, 12, -17); g.stroke();
    frames.push(c);
  }
  return { frames, w: W, h: H, ax: AX, ay: AY, hand: [13 * small, -16 * small] };
}

export function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (k < 0) { r *= 1 + k; g *= 1 + k; b *= 1 + k; } else { r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

// ---------- hand-drawn upgrade icons (ink on parchment) ----------
const INK = '#2b1a0e';
export function drawIcon(g, id, s, opts = {}) {
  const def = UP[id];
  const fam = def ? FAMS[def.fam] : FAMS.light;
  const col = opts.col || fam.col;
  g.save();
  g.scale(s / 64, s / 64);
  g.lineJoin = 'round'; g.lineCap = 'round';
  if (def && def.kind === 'evo') {
    // radiant halo behind evolved weapons
    g.save(); g.translate(32, 32);
    g.fillStyle = '#ffd36b';
    for (let i = 0; i < 12; i++) { g.rotate(TAU / 12); g.beginPath(); g.moveTo(-3, -16); g.lineTo(0, -31); g.lineTo(3, -16); g.fill(); }
    g.restore();
    g.fillStyle = 'rgba(255,240,200,0.9)'; g.beginPath(); g.arc(32, 32, 20, 0, TAU); g.fill();
    g.translate(32, 32); g.scale(0.78, 0.78); g.translate(-32, -32);
    drawGlyph(g, def.base, col, true);
  } else drawGlyph(g, id, col, false);
  g.restore();
}

function stroke(g, w = 3.2) { g.strokeStyle = INK; g.lineWidth = w; g.stroke(); }
function fillS(g, col, w = 3.2) { g.fillStyle = col; g.fill(); stroke(g, w); }
function flame(g, x, y, s, col) {
  g.beginPath();
  g.moveTo(x, y + 8 * s);
  g.bezierCurveTo(x - 7 * s, y + 6 * s, x - 6 * s, y - 2 * s, x - 1 * s, y - 10 * s);
  g.bezierCurveTo(x, y - 4 * s, x + 4 * s, y - 6 * s, x + 3 * s, y - 11 * s);
  g.bezierCurveTo(x + 9 * s, y - 4 * s, x + 7 * s, y + 6 * s, x, y + 8 * s);
  fillS(g, col, 2.6);
  g.beginPath(); g.ellipse(x, y + 3 * s, 2.4 * s, 4 * s, 0, 0, TAU); g.fillStyle = '#fff1b8'; g.fill();
}
function drawGlyph(g, id, col, evo) {
  switch (id) {
    case 'lantern': case 'wick': {
      if (id === 'wick') {
        g.beginPath(); g.rect(24, 30, 16, 24); fillS(g, '#f3e2c0');
        g.beginPath(); g.moveTo(32, 30); g.lineTo(32, 24); stroke(g, 2.5);
        flame(g, 32, 16, 1.25, col); break;
      }
      g.beginPath(); g.moveTo(26, 12); g.quadraticCurveTo(32, 4, 38, 12); stroke(g);
      g.beginPath(); g.moveTo(20, 18); g.lineTo(44, 18); g.lineTo(40, 14); g.lineTo(24, 14); g.closePath(); fillS(g, '#6b4a2a');
      g.beginPath(); g.moveTo(22, 18); g.lineTo(42, 18); g.lineTo(44, 48); g.lineTo(20, 48); g.closePath(); fillS(g, '#ffe3a0');
      flame(g, 32, 34, 1, col);
      g.beginPath(); g.rect(18, 48, 28, 6); fillS(g, '#6b4a2a'); break;
    }
    case 'flicker': {
      g.beginPath(); g.arc(32, 32, 6, 0, TAU); fillS(g, col);
      for (const r of [14, 22, 29]) { g.beginPath(); g.arc(32, 32, r, -0.9, 0.9); stroke(g, 3); g.beginPath(); g.arc(32, 32, r, Math.PI - 0.9, Math.PI + 0.9); stroke(g, 3); }
      break;
    }
    case 'beacon': {
      g.beginPath(); g.moveTo(14, 46); g.lineTo(58, 18); g.lineTo(60, 42); g.closePath(); g.fillStyle = '#ffe6a0'; g.fill(); stroke(g, 2.4);
      g.beginPath(); g.arc(14, 46, 8, 0, TAU); fillS(g, col); break;
    }
    case 'wisps': {
      g.beginPath(); g.arc(32, 32, 19, 0, TAU); g.setLineDash([4, 5]); stroke(g, 2.2); g.setLineDash([]);
      flame(g, 32, 15, 0.8, col); flame(g, 48, 40, 0.8, col); flame(g, 16, 40, 0.8, col);
      g.beginPath(); g.arc(32, 33, 4, 0, TAU); g.fillStyle = INK; g.fill(); break;
    }
    case 'firefly': {
      g.beginPath(); g.ellipse(38, 36, 12, 8, -0.5, 0, TAU); g.fillStyle = '#fff1a0'; g.fill(); stroke(g, 2.4);
      g.beginPath(); g.ellipse(28, 28, 8, 6, -0.5, 0, TAU); fillS(g, '#4a3220');
      g.beginPath(); g.ellipse(30, 20, 7, 4, -1.2, 0, TAU); g.ellipse(22, 24, 4, 7, -0.3, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.7)'; g.fill(); stroke(g, 2);
      g.beginPath(); g.moveTo(8, 50); g.lineTo(18, 44); g.moveTo(6, 40); g.lineTo(16, 38); g.moveTo(14, 58); g.lineTo(22, 50); stroke(g, 2.4); break;
    }
    case 'trail': {
      g.beginPath(); g.moveTo(8, 56); g.bezierCurveTo(24, 50, 18, 34, 34, 30); g.bezierCurveTo(48, 26, 44, 14, 58, 8);
      g.setLineDash([5, 6]); g.strokeStyle = '#7a4a22'; g.lineWidth = 4; g.stroke(); g.setLineDash([]);
      flame(g, 14, 46, 0.85, col); flame(g, 33, 24, 1.0, col); flame(g, 52, 6 + 6, 0.7, '#ffb347');
      break;
    }
    case 'runes': {
      g.beginPath(); g.arc(32, 32, 24, 0, TAU); g.fillStyle = 'rgba(120,220,190,0.35)'; g.fill(); stroke(g, 3);
      g.beginPath(); g.arc(32, 32, 17, 0, TAU); stroke(g, 1.8);
      g.beginPath(); for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * TAU / 3; g.lineTo(32 + Math.cos(a) * 17, 32 + Math.sin(a) * 17); } g.closePath(); g.fillStyle = col; g.fill(); stroke(g, 2.4);
      break;
    }
    case 'thorns': {
      g.beginPath(); g.moveTo(8, 54); g.bezierCurveTo(20, 30, 40, 52, 56, 12); g.strokeStyle = col; g.lineWidth = 7; g.stroke(); stroke(g, 2);
      for (const [x, y, a] of [[16, 42, -2.2], [26, 40, 0.9], [38, 42, -1.9], [46, 30, 1.2], [50, 22, -2.6]]) {
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 9, y + Math.sin(a) * 9); stroke(g, 2.6);
      }
      g.beginPath(); g.ellipse(22, 22, 7, 4, -0.6, 0, TAU); fillS(g, '#6fb35a', 2); break;
    }
    case 'moths': {
      g.beginPath(); g.ellipse(18, 26, 14, 11, -0.4, 0, TAU); g.ellipse(46, 26, 14, 11, 0.4, 0, TAU); fillS(g, '#e9e1ff');
      g.beginPath(); g.ellipse(22, 44, 9, 8, 0.4, 0, TAU); g.ellipse(42, 44, 9, 8, -0.4, 0, TAU); fillS(g, col);
      g.beginPath(); g.ellipse(32, 34, 3.6, 13, 0, 0, TAU); fillS(g, '#3a2a40', 2.4);
      g.beginPath(); g.moveTo(30, 22); g.quadraticCurveTo(26, 12, 22, 12); g.moveTo(34, 22); g.quadraticCurveTo(38, 12, 42, 12); stroke(g, 2); break;
    }
    case 'bell': {
      g.beginPath(); g.moveTo(32, 10); g.bezierCurveTo(18, 10, 18, 30, 16, 42); g.lineTo(10, 48); g.lineTo(54, 48); g.lineTo(48, 42); g.bezierCurveTo(46, 30, 46, 10, 32, 10); fillS(g, col);
      g.beginPath(); g.arc(32, 52, 5, 0, TAU); fillS(g, '#f3e2c0');
      g.beginPath(); g.arc(32, 8, 3, 0, TAU); stroke(g, 2.4);
      g.beginPath(); g.moveTo(6, 22); g.quadraticCurveTo(2, 32, 6, 40); g.moveTo(58, 22); g.quadraticCurveTo(62, 32, 58, 40); stroke(g, 2.4); break;
    }
    case 'oil': {
      g.beginPath(); g.moveTo(32, 8); g.bezierCurveTo(44, 26, 50, 34, 50, 42); g.arc(32, 42, 18, 0, Math.PI); g.bezierCurveTo(14, 34, 20, 26, 32, 8); fillS(g, col);
      g.beginPath(); g.ellipse(26, 42, 4, 7, 0.3, 0, TAU); g.fillStyle = 'rgba(255,250,220,0.8)'; g.fill(); break;
    }
    case 'mirror': {
      g.beginPath(); g.rect(28, 42, 8, 18); fillS(g, '#6b4a2a');
      g.beginPath(); g.arc(32, 26, 18, 0, TAU); fillS(g, '#c9d4e0');
      g.beginPath(); g.arc(32, 26, 12, 0, TAU); g.fillStyle = '#eef6ff'; g.fill();
      g.beginPath(); g.moveTo(24, 22); g.lineTo(30, 16); g.moveTo(26, 30); g.lineTo(36, 20); g.strokeStyle = col; g.lineWidth = 3; g.stroke(); break;
    }
    case 'kindling': {
      g.beginPath(); g.moveTo(12, 54); g.lineTo(52, 40); g.moveTo(12, 40); g.lineTo(52, 54); g.strokeStyle = '#6b4a2a'; g.lineWidth = 8; g.stroke();
      g.beginPath(); g.moveTo(12, 54); g.lineTo(52, 40); g.moveTo(12, 40); g.lineTo(52, 54); g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
      flame(g, 32, 28, 1.5, col); break;
    }
    case 'lens': {
      g.beginPath(); g.moveTo(40, 40); g.lineTo(56, 56); g.strokeStyle = '#6b4a2a'; g.lineWidth = 8; g.stroke(); stroke(g, 2);
      g.beginPath(); g.arc(28, 28, 17, 0, TAU); g.fillStyle = 'rgba(200,230,255,0.6)'; g.fill(); stroke(g, 4);
      g.beginPath(); g.moveTo(28, 18); g.lineTo(28, 38); g.moveTo(18, 28); g.lineTo(38, 28); g.strokeStyle = col; g.lineWidth = 2.6; g.stroke(); break;
    }
    case 'tinder': {
      g.beginPath(); g.moveTo(18, 10); g.lineTo(46, 10); g.lineTo(46, 14); g.quadraticCurveTo(44, 26, 34, 32); g.quadraticCurveTo(44, 38, 46, 50); g.lineTo(46, 54); g.lineTo(18, 54); g.lineTo(18, 50);
      g.quadraticCurveTo(20, 38, 30, 32); g.quadraticCurveTo(20, 26, 18, 14); g.closePath(); fillS(g, '#f3e6c8');
      g.beginPath(); g.moveTo(24, 50); g.lineTo(40, 50); g.lineTo(32, 40); g.closePath(); g.fillStyle = col; g.fill();
      g.beginPath(); g.moveTo(26, 18); g.lineTo(38, 18); g.lineTo(32, 26); g.closePath(); g.fill(); break;
    }
    case 'bark': {
      g.beginPath(); g.moveTo(32, 8); g.lineTo(52, 16); g.quadraticCurveTo(52, 44, 32, 58); g.quadraticCurveTo(12, 44, 12, 16); g.closePath(); fillS(g, '#7a5532');
      g.beginPath(); g.moveTo(24, 16); g.quadraticCurveTo(28, 32, 24, 48); g.moveTo(34, 14); g.quadraticCurveTo(38, 34, 32, 52); g.moveTo(43, 18); g.quadraticCurveTo(45, 30, 40, 42); stroke(g, 2);
      g.beginPath(); g.ellipse(32, 30, 4, 6, 0, 0, TAU); g.strokeStyle = col; g.lineWidth = 2.4; g.stroke(); break;
    }
    case 'moonsilk': {
      g.beginPath(); g.arc(32, 30, 20, 0.6, TAU - 0.6); g.arc(42, 22, 15, TAU - 1.1, 1.7, true); g.closePath(); fillS(g, '#eae6ff');
      g.beginPath(); g.moveTo(10, 56); g.bezierCurveTo(24, 44, 40, 60, 56, 48); g.strokeStyle = col; g.lineWidth = 3; g.stroke(); break;
    }
    case 'echo': {
      g.beginPath(); g.ellipse(32, 34, 16, 18, 0, 0, TAU); fillS(g, '#9aa7a8');
      g.beginPath(); g.arc(32, 34, 9, 0.5, TAU - 0.3); g.strokeStyle = col; g.lineWidth = 3; g.stroke();
      g.beginPath(); g.arc(32, 34, 4, 0, TAU); g.fillStyle = col; g.fill();
      g.beginPath(); g.arc(32, 34, 25, -0.6, 0.6); g.moveTo(32 - 25 * Math.cos(0.6), 34 - 25 * Math.sin(0.6)); g.arc(32, 34, 25, Math.PI - 0.6, Math.PI + 0.6); stroke(g, 2.4); break;
    }
    case 'lodestone': {
      g.beginPath(); g.arc(32, 30, 18, Math.PI, 0); g.lineTo(50, 50); g.lineTo(40, 50); g.lineTo(40, 30); g.arc(32, 30, 8, 0, Math.PI, true); g.lineTo(24, 50); g.lineTo(14, 50); g.closePath(); fillS(g, '#c83a2a');
      g.beginPath(); g.rect(14, 44, 10, 8); g.rect(40, 44, 10, 8); fillS(g, '#e8e8e8', 2.4);
      g.beginPath(); g.arc(14, 12, 3, 0, TAU); g.arc(50, 12, 3, 0, TAU); g.fillStyle = col; g.fill(); break;
    }
    case 'feather': {
      g.beginPath(); g.moveTo(14, 54); g.bezierCurveTo(16, 30, 34, 10, 52, 8); g.bezierCurveTo(50, 26, 36, 46, 14, 54); fillS(g, '#e9dcc0');
      g.beginPath(); g.moveTo(10, 58); g.quadraticCurveTo(28, 34, 50, 10); stroke(g, 2.2);
      g.beginPath(); g.moveTo(30, 30); g.lineTo(26, 24); g.moveTo(36, 24); g.lineTo(32, 18); g.moveTo(24, 38); g.lineTo(18, 34); g.strokeStyle = col; g.lineWidth = 2.4; g.stroke(); break;
    }
    case 'heartwood': {
      g.beginPath(); g.moveTo(32, 54); g.bezierCurveTo(4, 36, 10, 10, 32, 22); g.bezierCurveTo(54, 10, 60, 36, 32, 54); fillS(g, '#b8443a');
      g.beginPath(); g.moveTo(32, 22); g.quadraticCurveTo(36, 10, 46, 8); g.quadraticCurveTo(40, 18, 32, 22); fillS(g, '#6fb35a', 2.4); break;
    }
    case 'clover': {
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; g.beginPath(); g.arc(32 + Math.cos(a) * 11, 28 + Math.sin(a) * 11, 10, 0, TAU); fillS(g, '#5cae5a', 2.6); }
      g.beginPath(); g.moveTo(32, 30); g.quadraticCurveTo(34, 48, 26, 58); stroke(g, 3);
      g.beginPath(); g.arc(32, 28, 3, 0, TAU); g.fillStyle = col; g.fill(); break;
    }
    case 'lampoil': {
      g.beginPath(); g.rect(27, 8, 10, 10); fillS(g, '#6b4a2a');
      g.beginPath(); g.moveTo(26, 18); g.lineTo(38, 18); g.lineTo(38, 26); g.quadraticCurveTo(52, 32, 50, 46); g.quadraticCurveTo(48, 58, 32, 58); g.quadraticCurveTo(16, 58, 14, 46); g.quadraticCurveTo(12, 32, 26, 26); g.closePath(); fillS(g, '#e05a4a');
      g.beginPath(); g.moveTo(26, 42); g.lineTo(38, 42); g.moveTo(32, 36); g.lineTo(32, 48); g.strokeStyle = '#fff'; g.lineWidth = 3.4; g.stroke(); break;
    }
    case 'purse': {
      g.beginPath(); g.moveTo(22, 18); g.quadraticCurveTo(8, 34, 12, 48); g.quadraticCurveTo(16, 58, 32, 58); g.quadraticCurveTo(48, 58, 52, 48); g.quadraticCurveTo(56, 34, 42, 18); g.closePath(); fillS(g, '#8a5a32');
      g.beginPath(); g.moveTo(20, 18); g.lineTo(44, 18); stroke(g, 4);
      flame(g, 32, 40, 0.9, '#ff9a3d'); break;
    }
    case 'reroll': {
      g.beginPath(); g.arc(32, 32, 18, 0.3, Math.PI * 1.6); stroke(g, 4);
      g.beginPath(); g.moveTo(40, 8); g.lineTo(44, 18); g.lineTo(33, 20); g.closePath(); g.fillStyle = INK; g.fill();
      g.beginPath(); g.rect(24, 24, 16, 16); fillS(g, col || '#e8a92e', 2.4); break;
    }
    case 'banish': {
      g.beginPath(); g.moveTo(14, 50); g.lineTo(30, 26); g.strokeStyle = '#6b4a2a'; g.lineWidth = 6; g.stroke(); stroke(g, 1.6);
      g.beginPath(); g.moveTo(26, 30); g.quadraticCurveTo(32, 8, 50, 14); g.quadraticCurveTo(52, 28, 34, 34); g.closePath(); fillS(g, '#b8b0a0');
      g.beginPath(); g.moveTo(48, 40); g.quadraticCurveTo(52, 48, 46, 56); stroke(g, 2); break;
    }
    default: {
      g.beginPath(); g.arc(32, 32, 16, 0, TAU); fillS(g, col);
    }
  }
}

// Render an icon to a small canvas (for the HUD and HTML cards).
const iconCache = new Map();
export function iconCanvas(id, px) {
  const k = id + '@' + px;
  if (iconCache.has(k)) return iconCache.get(k);
  const c = makeCanvas(px, px), g = c.getContext('2d');
  drawIcon(g, id, px);
  iconCache.set(k, c);
  return c;
}
