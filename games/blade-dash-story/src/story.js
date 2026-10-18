// The story: short ink panels between floors. Tap for the next panel, Skip to
// jump straight back into the fight. Each panel paints itself into a PW x PH box.
import { CHAPTERS } from './levels.js';
import { drawSky, drawCastle, drawFigure, pose, lerpPose, seeded, stamp, BRUSH, DISPLAY, tierBox, TIER_H } from './draw.js';

export const PW = 1120, PH = 470;
const INK = '#16120f', PAPER = '#f4ead6', RED = '#c8281e';
const night = CHAPTERS[3], dusk = CHAPTERS[1], day = CHAPTERS[0];
const KAGE = { hat: 'hood', mask: 'cloth', robe: '#4a0c12', pattern: 'waves', sash: '#ff3a2a', scarf: '#16120f' };

function speed(x, cx, cy, n, R, col = INK) {
  x.strokeStyle = col; x.lineCap = 'round';
  for (let k = 0; k < n; k++) { const a = R() * 6.28, r0 = 180 + R() * 120; x.globalAlpha = 0.25; x.lineWidth = 1 + R() * 3; x.beginPath(); x.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); x.lineTo(cx + Math.cos(a) * (r0 + 200), cy + Math.sin(a) * (r0 + 200)); x.stroke(); }
  x.globalAlpha = 1;
}
const fig = (x, px, py, P, face, s, ink, look, t, kind = 'player', extra = {}) => drawFigure(x, px, py, { pose: typeof P === 'string' ? pose(P) : P, face, scale: s, ink, paper: PAPER, accent: RED, kind, t, look, ...extra });

// p = the player's outfit look (so the hero in the panels wears what you bought)
export const SCENES = {
  intro: [
    { text: 'The night of the red moon. Tenshu Castle, fourteen floors of guards and the roof above them.', draw(x, t) {
      drawSky(x, PW, PH, night, seeded(3), { sunX: 820, sunY: 120, sunR: 90, drop: 60 });
      x.save(); x.translate(PW / 2 - 60, 0); x.scale(0.2, 0.2); drawCastle(x, 0, (PH - 40) / 0.2 + (1 - Math.min(1, t / 3)) * 400, night, { lit: (k) => k % 3 === 1 }); x.restore();
    } },
    { text: 'Kage, the shadow blade, took Princess Hana and ran for the top.', draw(x, t) {
      drawSky(x, PW, PH, night, seeded(5), { sunX: 300, sunY: 160, sunR: 130 });
      x.fillStyle = '#0b0d16'; x.beginPath(); x.moveTo(0, PH); x.lineTo(0, 380); x.quadraticCurveTo(PW / 2, 330, PW, 380); x.lineTo(PW, PH); x.fill();
      const k = Math.min(1, t / 2.5), px = 300 + k * 520;
      fig(x, px, 360 - Math.sin(k * Math.PI) * 60, 'dash', 1, 2.2, '#f2ead8', KAGE, t, 'ninja', { eyes: '#ff3a2a', hood: '#120a10' });
      x.save(); x.translate(px - 40, 300 - Math.sin(k * Math.PI) * 60); x.rotate(-1.2); fig(x, 0, 0, 'idle', 1, 1.6, INK, null, t, 'princess'); x.restore();
    } },
    { text: 'You climb. Floor by floor. Window by window. Nobody stops you.', draw(x, t, p) {
      drawSky(x, PW, PH, night, seeded(9), { sunX: 900, sunY: 110, sunR: 80, drop: 100 });
      x.fillStyle = '#0b0d16'; x.fillRect(0, 360, PW, PH);
      fig(x, 360, 360, 'idle', 1, 2.6, '#f2ead8', p, t);
      x.font = `120px ${BRUSH}`; x.fillStyle = RED; x.globalAlpha = 0.85; x.textAlign = 'center'; x.fillText('登', 820, 300); x.globalAlpha = 1;
    } },
  ],
  f4: [
    { text: 'Splintered shoji behind you. Somewhere above, a flute is playing. He is waiting.', draw(x, t, p) {
      x.fillStyle = day.paper; x.fillRect(0, 0, PW, PH);
      x.fillStyle = day.wood; for (let k = 0; k < 6; k++) x.fillRect(k * 200 + 40, 0, 22, PH);
      x.fillStyle = INK; x.beginPath(); x.moveTo(600, PH); for (let k = 0; k < 8; k++) { x.lineTo(600 + k * 64, PH - k * 58); x.lineTo(664 + k * 64, PH - k * 58); } x.lineTo(PW, 0); x.lineTo(PW, PH); x.fill();
      fig(x, 380, 430, lerpPose(pose('idle'), pose('aim'), 0.5), 1, 2.4, INK, p, t);
      x.font = `60px ${BRUSH}`; x.fillStyle = RED; x.fillText('♪', 900 + Math.sin(t * 2) * 10, 120);
    } },
  ],
  f9: [
    { text: 'A red ribbon drifts past the window. Hana is still up there, and she is still fighting.', draw(x, t) {
      drawSky(x, PW, PH, dusk, seeded(12), { sunX: 860, sunY: 200, sunR: 120, drop: 120 });
      x.fillStyle = dusk.wood; x.fillRect(0, 0, PW, 40); x.fillRect(0, PH - 40, PW, 40); x.fillRect(0, 0, 40, PH); x.fillRect(PW - 40, 0, 40, PH);
      const y = 60 + (t * 70) % (PH - 60);
      x.strokeStyle = RED; x.lineWidth = 8; x.lineCap = 'round';
      x.beginPath(); x.moveTo(500, y); x.bezierCurveTo(540, y + 30, 470, y + 60, 520 + Math.sin(t * 3) * 20, y + 100); x.stroke();
    } },
  ],
  f14: [
    { text: 'KAGE: "Fourteen floors to die on a roof. Come, then."', draw(x, t) {
      drawSky(x, PW, PH, night, seeded(21), { sunX: PW / 2, sunY: 210, sunR: 170 });
      x.fillStyle = '#0b0d16'; x.fillRect(0, 380, PW, PH);
      fig(x, PW / 2, 380, 'raise', -1, 3, '#f2ead8', KAGE, t, 'ninja', { eyes: '#ff3a2a', hood: '#120a10' });
      fig(x, 960, 380, 'idle', -1, 1.6, INK, null, t, 'princess', { tied: true });
    } },
    { text: 'He dashes like you do. Watch for the red line. Dash to dodge, then dash at him while he recovers.', draw(x, t, p) {
      x.fillStyle = PAPER; x.fillRect(0, 0, PW, PH);
      const k = (t % 3) / 3;
      x.strokeStyle = RED; x.lineWidth = 4; x.setLineDash([14, 10]); x.globalAlpha = k < 0.35 ? 0.9 : 0.15;
      x.beginPath(); x.moveTo(820, 300); x.lineTo(260, 300); x.stroke(); x.setLineDash([]); x.globalAlpha = 1;
      const bx = k < 0.35 ? 820 : k < 0.5 ? 820 - (k - 0.35) / 0.15 * 600 : 220;
      fig(x, bx, 340, k < 0.35 ? 'raise' : k < 0.5 ? 'dash' : 'stagger', -1, 2, INK, KAGE, t, 'ninja', { eyes: RED, hood: '#120a10' });
      const py = k > 0.38 && k < 0.6 ? 180 : 340;
      fig(x, k > 0.6 ? 220 + 40 : 420, py, k > 0.6 ? 'slash' : k > 0.38 ? 'dash' : 'idle', -1, 2, INK, p, t);
      x.font = `28px ${DISPLAY}`; x.fillStyle = INK; x.textAlign = 'center';
      x.fillText(k < 0.35 ? '1. the red line' : k < 0.6 ? '2. dash to dodge' : '3. dash at him!', PW / 2, 60);
    } },
  ],
  ending: [
    { text: 'The shadow blade falls. His mask splits down the middle.', draw(x, t) {
      drawSky(x, PW, PH, night, seeded(31), { sunX: 300, sunY: 160, sunR: 140 });
      x.fillStyle = '#0b0d16'; x.fillRect(0, 380, PW, PH);
      fig(x, 640, 380, 'stagger', -1, 2.6, '#f2ead8', KAGE, t, 'ninja', { eyes: '#ff3a2a', hood: '#120a10' });
      x.fillStyle = RED; x.globalAlpha = 0.8; x.beginPath(); x.ellipse(660, 390, 140, 14, 0, 0, 7); x.fill(); x.globalAlpha = 1;
    } },
    { text: 'One cut through the ropes. Hana steps down from the ridge pole and takes your hand.', draw(x, t, p) {
      drawSky(x, PW, PH, dusk, seeded(33), { sunX: 860, sunY: 330, sunR: 150, drop: 120 });
      x.fillStyle = '#2a1410'; x.fillRect(0, 380, PW, PH);
      fig(x, 480, 380, 'idle', 1, 2.6, INK, p, t);
      fig(x, 620, 380, 'idle', -1, 2.6, INK, null, t, 'princess');
    } },
    { text: 'The red moon sets. Dawn over Tenshu. THE END... until the next castle.', draw(x, t, p) {
      drawSky(x, PW, PH, day, seeded(35), { sunX: PW / 2, sunY: 360, sunR: 160, drop: 40 });
      x.fillStyle = INK; x.beginPath(); x.moveTo(0, PH); x.lineTo(0, 400); x.quadraticCurveTo(PW / 2, 360, PW, 400); x.lineTo(PW, PH); x.fill();
      fig(x, 520, 386, 'idle', 1, 1.8, INK, p, t);
      fig(x, 600, 386, 'idle', -1, 1.8, INK, null, t, 'princess');
      stamp(x, PW - 120, 110, 120, '終', RED, PAPER, -0.1);
    } },
  ],
};
// which scene plays after which floor
export const AFTER = { 4: 'f4', 9: 'f9', 14: 'f14' };

// the exterior shot between floors: you climb the outside of the tower from window f-1 up to window f.
export function drawClimb(x, W, H, f, k, t, p, pal, cleared) {
  const R = seeded(f * 17);
  drawSky(x, W, H, pal, R, { sunX: W * 0.8, sunY: H * 0.22, sunR: 90 });
  const cx = W * 0.55;
  const target = tierBox(Math.min(13, f - 1), cx), from = f > 1 ? tierBox(f - 2, cx) : null;
  // camera: follows the hero up the tower
  const yFrom = from ? from.top + 120 : 40, yTo = target.top + 120;
  const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  const hy = yFrom + (yTo - yFrom) * e;
  const baseY = H * 0.62 - hy;
  drawCastle(x, cx, baseY, pal, { lit: (q) => q >= f - 1, broken: (q) => q < f - 1 });
  // the hero: hops up the eaves, then crouches beside the window
  const wx = target.x0 - 12;
  const hx = (from ? from.x0 - 30 : target.x0 - 80) + ((wx) - (from ? from.x0 - 30 : target.x0 - 80)) * e;
  const lift = Math.sin(k * Math.PI * 3) * 18 * (1 - k);
  const P = k < 0.92 ? (Math.floor(t * 8) % 2 ? pose('climb') : lerpPose(pose('climb'), pose('air'), 0.6)) : pose('crouch');
  drawFigure(x, hx, baseY + hy - lift, { pose: P, face: 1, scale: 0.9, ink: '#16120f', paper: '#f4ead6', accent: '#c8281e', kind: 'player', t, look: p });
  // target window glows
  x.globalAlpha = 0.5 + Math.sin(t * 8) * 0.3; x.strokeStyle = '#c8281e'; x.lineWidth = 4;
  x.strokeRect(target.x0 + 46, baseY + target.top + 62, 42, 52); x.globalAlpha = 1;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = `52px ${DISPLAY}`; x.lineWidth = 8; x.strokeStyle = '#16120f'; x.fillStyle = '#f4ead6';
  const label = f > 14 ? 'THE ROOF' : `FLOOR ${f}`;
  x.strokeText(label, W / 2, 80); x.fillText(label, W / 2, 80);
  x.font = `20px ${DISPLAY}`; x.lineWidth = 5;
  const sub = f > 14 ? 'Kage is waiting' : CHAPTERS[f <= 5 ? 0 : f <= 10 ? 1 : 2].name.toUpperCase();
  x.strokeText(sub, W / 2, 124); x.fillText(sub, W / 2, 124);
  drawTowerGauge(x, W, H, f, t);
  void TIER_H; void cleared;
}
// the whole climb at a glance: a little ink tower down the right side, 14 floors + the roof.
// cleared floors are slashed, the floor you are about to enter pulses red, the princess waits on top.
function drawTowerGauge(x, W, H, f, t) {
  const gx = W - 70, top = 150, bot = H - 130, n = 15, step = (bot - top) / n;
  x.save();
  x.globalAlpha = 0.82; x.fillStyle = '#16120f';
  x.beginPath(); x.roundRect(gx - 44, top - 64, 88, bot - top + 84, 10); x.fill();
  x.globalAlpha = 1;
  for (let i = 0; i < n; i++) {
    const q = i + 1, y = bot - (i + 1) * step, w = 50 - i * 1.6;
    const cur = q === f, done = q < f;
    x.fillStyle = cur ? (Math.floor(t * 6) % 2 ? '#c8281e' : '#f4ead6') : done ? '#5a4c3e' : '#e8dcc2';
    x.fillRect(gx - w / 2, y + 3, w, step - 6);
    x.fillStyle = '#16120f'; x.fillRect(gx - w / 2 - 4, y, w + 8, 3);   // the eave
    if (done) { x.strokeStyle = '#c8281e'; x.lineWidth = 2; x.beginPath(); x.moveTo(gx - w / 2 + 2, y + step - 4); x.lineTo(gx + w / 2 - 2, y + 4); x.stroke(); }
  }
  // the princess on the roof
  x.fillStyle = '#c8281e'; x.beginPath(); x.arc(gx, top - 26, 7, 0, 7); x.fill();
  x.font = `13px ${DISPLAY}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#f4ead6';
  x.fillText('姫', gx, top - 46);
  x.fillText(`${Math.min(f, 15)}/15`, gx, bot + 12);
  x.restore();
}
