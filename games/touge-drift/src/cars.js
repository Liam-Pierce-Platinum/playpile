// Detailed top-down cars, and the rival drivers you race.
// Cars face +x; about 52 px long and 26 px wide.

export const STYLES = {
  hatch: { name: 'You', top: '#f2f2ee', side: '#141416', glass: '#1a1d26', accent: '#141416', lights: 'popup', shape: 'hatch' },
  red: { name: 'Kenta', top: '#c81e24', side: '#7a0e12', glass: '#14161c', accent: '#1a1a1a', lights: 'popup', shape: 'coupe' },
  blue: { name: 'Shin', top: '#2a4e9a', side: '#162a56', glass: '#12141a', accent: '#c8ccd4', lights: 'fixed', shape: 'sedan' },
  yellow: { name: 'Mika', top: '#f2c21e', side: '#a07a0a', glass: '#16181e', accent: '#1a1a1a', lights: 'fixed', shape: 'roadster' },
};

const rr = (x, px, py, w, h, r) => { x.beginPath(); x.roundRect(px, py, w, h, r); };

export function drawCar(x, car, style, opts = {}) {
  const S = STYLES[style];
  const L = 26, Wd = 13;           // half length, half width
  x.save();
  x.translate(car.x, car.y);
  x.rotate(car.h);
  // soft shadow
  x.fillStyle = 'rgba(0,0,0,0.22)'; rr(x, -L - 2, -Wd - 1, L * 2 + 6, Wd * 2 + 6, 9); x.fill();
  x.fillStyle = 'rgba(0,0,0,0.25)'; rr(x, -L + 1, -Wd + 2, L * 2 + 2, Wd * 2 + 2, 7); x.fill();
  // wheels (fronts turn with the steering)
  const wa = (car.steer || 0) * 0.45;
  const wheel = (wx, wy, a) => { x.save(); x.translate(wx, wy); x.rotate(a); x.fillStyle = '#0b0b0c'; rr(x, -5.5, -2.6, 11, 5.2, 1.5); x.fill(); x.fillStyle = '#6a6e76'; x.fillRect(-2, -2.6, 4, 1.2); x.restore(); };
  wheel(16, -Wd + 0.5, wa); wheel(16, Wd - 0.5, wa); wheel(-15, -Wd + 0.5, 0); wheel(-15, Wd - 0.5, 0);
  // body outline: tapered nose, squarer tail
  const body = () => {
    x.beginPath();
    x.moveTo(L, -Wd + 4);
    x.quadraticCurveTo(L + 1, 0, L, Wd - 4);
    x.quadraticCurveTo(L - 1, Wd, L - 6, Wd);
    x.lineTo(-L + 4, Wd);
    x.quadraticCurveTo(-L, Wd, -L, Wd - 4);
    x.lineTo(-L, -Wd + 4);
    x.quadraticCurveTo(-L, -Wd, -L + 4, -Wd);
    x.lineTo(L - 6, -Wd);
    x.quadraticCurveTo(L - 1, -Wd, L, -Wd + 4);
    x.closePath();
  };
  x.fillStyle = S.side; body(); x.fill();
  // upper paint with a highlight down the middle for a rounded look
  x.save();
  x.beginPath(); x.roundRect(-L + 2, -Wd + 2.2, L * 2 - 3, Wd * 2 - 4.4, 5); x.clip();
  const g = x.createLinearGradient(0, -Wd, 0, Wd);
  g.addColorStop(0, shade(S.top, -0.18)); g.addColorStop(0.45, shade(S.top, 0.12)); g.addColorStop(0.55, shade(S.top, 0.12)); g.addColorStop(1, shade(S.top, -0.22));
  x.fillStyle = g; x.fillRect(-L, -Wd, L * 2, Wd * 2);
  // panda paint: the hatch has a black lower half along each side
  if (S.shape === 'hatch') { x.fillStyle = S.side; x.fillRect(-L, -Wd, L * 2, 3.2); x.fillRect(-L, Wd - 3.2, L * 2, 3.2); }
  x.restore();
  // windscreen, roof, rear glass
  const glass = (pts) => {
    x.beginPath(); x.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) x.lineTo(p[0], p[1]); x.closePath();
    const gg = x.createLinearGradient(pts[0][0], -Wd, pts[2][0], Wd);
    gg.addColorStop(0, '#2a3242'); gg.addColorStop(0.5, S.glass); gg.addColorStop(1, '#0a0b0e');
    x.fillStyle = gg; x.fill();
  };
  if (S.shape === 'roadster') {
    glass([[9, -10], [12, -9], [12, 9], [9, 10]]);
    x.fillStyle = '#1c1c20'; rr(x, -12, -9, 20, 18, 4); x.fill();                    // open cockpit
    x.fillStyle = '#6a4a32'; rr(x, -6, -7.5, 8, 6, 2); x.fill(); rr(x, -6, 1.5, 8, 6, 2); x.fill();   // seats
    x.fillStyle = shade(S.top, -0.1); rr(x, -19, -8, 6, 16, 2); x.fill();           // rear deck
  } else {
    const ws = S.shape === 'sedan' ? 8 : 10, back = S.shape === 'hatch' ? -15 : S.shape === 'coupe' ? -12 : -14;
    glass([[ws, -10], [ws + 5, -8.5], [ws + 5, 8.5], [ws, 10]]);
    x.fillStyle = shade(S.top, S.shape === 'hatch' ? 0.05 : -0.05); rr(x, back + 7, -9.5, ws - back - 7, 19, 2.5); x.fill();   // roof
    x.fillStyle = 'rgba(255,255,255,0.10)'; x.fillRect(back + 9, -6, ws - back - 11, 2);
    glass([[back + 7, -9.5], [back + 7, 9.5], [back, 8], [back, -8]]);
    // reflection streak on the windscreen
    x.strokeStyle = 'rgba(255,255,255,0.25)'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(ws + 1.5, -7); x.lineTo(ws + 3.5, 2); x.stroke();
  }
  // panel lines: bonnet seam, doors, fuel cap
  x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 0.8;
  x.beginPath(); x.moveTo(L - 3, 0); x.lineTo(16, 0); x.stroke();
  x.beginPath(); x.moveTo(8, -Wd + 2.3); x.lineTo(8, -Wd + 4); x.moveTo(-4, -Wd + 2.3); x.lineTo(-4, -Wd + 4); x.moveTo(8, Wd - 2.3); x.lineTo(8, Wd - 4); x.moveTo(-4, Wd - 2.3); x.lineTo(-4, Wd - 4); x.stroke();
  x.fillStyle = 'rgba(0,0,0,0.3)'; x.beginPath(); x.arc(-11, Wd - 3, 1.2, 0, 7); x.fill();
  if (S.shape === 'coupe') { x.fillStyle = 'rgba(0,0,0,0.4)'; x.fillRect(18, -4, 5, 1.2); x.fillRect(18, 2.8, 5, 1.2); }   // bonnet vents
  // mirrors
  x.fillStyle = S.shape === 'hatch' ? S.side : shade(S.top, -0.15);
  x.beginPath(); x.ellipse(9, -Wd - 1.5, 2.2, 1.4, 0, 0, 7); x.fill(); x.beginPath(); x.ellipse(9, Wd + 1.5, 2.2, 1.4, 0, 0, 7); x.fill();
  // spoilers
  if (S.shape === 'hatch') { x.fillStyle = S.side; x.fillRect(-L + 1, -Wd + 1, 3, Wd * 2 - 2); }
  if (S.shape === 'coupe') { x.fillStyle = '#1a1a1a'; x.fillRect(-L - 1, -Wd + 1, 3.5, Wd * 2 - 2); x.fillRect(-L + 1, -8, 3, 2); x.fillRect(-L + 1, 6, 3, 2); }
  if (S.shape === 'sedan') { x.fillStyle = shade(S.top, -0.2); x.fillRect(-L + 1.5, -Wd + 3, 2.2, Wd * 2 - 6); }
  // headlights
  if (S.lights === 'popup') {
    x.fillStyle = shade(S.top, -0.08); rr(x, 17, -10.5, 6, 6, 1); x.fill(); rr(x, 17, 4.5, 6, 6, 1); x.fill();
    x.fillStyle = '#fff3c8'; x.fillRect(21.5, -9.5, 1.6, 4); x.fillRect(21.5, 5.5, 1.6, 4);
  } else {
    x.fillStyle = '#e8eef4'; x.beginPath(); x.moveTo(L - 1, -10); x.lineTo(L - 6, -11); x.lineTo(L - 6, -6); x.lineTo(L, -6.5); x.closePath(); x.fill();
    x.beginPath(); x.moveTo(L - 1, 10); x.lineTo(L - 6, 11); x.lineTo(L - 6, 6); x.lineTo(L, 6.5); x.closePath(); x.fill();
  }
  // number plates and bumpers
  x.fillStyle = '#e8e6dc'; x.fillRect(L - 0.5, -3.5, 1.5, 7); x.fillRect(-L - 1, -3.5, 1.5, 7);
  // tail lights (brighter on the brakes) and exhaust
  x.fillStyle = opts.braking ? '#ff3a3a' : '#a01818';
  x.fillRect(-L, -Wd + 1.5, 2.2, 5.5); x.fillRect(-L, Wd - 7, 2.2, 5.5);
  x.fillStyle = '#5a5e66'; x.beginPath(); x.arc(-L - 0.5, -6, 1.4, 0, 7); x.fill();
  x.restore();
}

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (c) => Math.max(0, Math.min(255, Math.round(amt > 0 ? c + (255 - c) * amt : c * (1 + amt))));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

// ------------------------------------------------------------ rival drivers
// They follow a racing line (cut to the inside of what's coming), brake for
// tight corners, ease off when they're miles ahead of you and push when they're
// behind, and swing their tail out through the bends.
export class Rival {
  constructor(style, skill, x, y, h, idx) {
    this.style = style; this.name = STYLES[style].name;
    this.skill = skill;
    this.x = x; this.y = y; this.h = h; this.idx = idx;
    this.speed = 0; this.steer = 0; this.slip = 0; this.vx = 0; this.vy = 0;
    this.lane = 0; this.finished = null; this.braking = false;
  }
  update(dt, T, player, others, go) {
    if (!go) return;
    const p0 = T.pts[this.idx];
    // how tight is the road coming up?
    const look = 6 + Math.floor(this.speed / 60);
    let kmax = 0, ksum = 0;
    for (let i = this.idx + 2; i < this.idx + 2 + look * 2 && i < T.pts.length; i++) { const k = T.pts[i].k; ksum += k; if (Math.abs(k) > Math.abs(kmax)) kmax = k; }
    // rubber band: ease off when far ahead of the player, push when behind
    const gap = this.idx - player.idx;
    const band = gap > 90 ? 0.84 : gap > 35 ? 0.91 : gap < -90 ? 1.1 : gap < -40 ? 1.04 : 1;
    const vMax = 940 * this.skill * band;
    const vCorner = Math.sqrt((1250 * this.skill) / Math.max(0.0004, Math.abs(kmax)));
    const want = Math.min(vMax, vCorner);
    this.braking = this.speed > want + 30;
    this.speed += (this.speed < want ? 900 * (1 - this.speed / 1100) : -1500) * dt;
    this.speed = Math.max(0, this.speed);
    // lane: inside of the coming bend, nudged away from any car just ahead
    let lane = -Math.sign(ksum) * 0.45;
    for (const o of others) {
      if (o === this) continue;
      const di = o.idx - this.idx;
      if (di > 0 && di < 7) { const ol = T.offset(o.x, o.y, o.idx) / T.pts[o.idx].w; if (Math.abs(ol - lane) < 0.45) lane = ol > 0 ? ol - 0.6 : ol + 0.6; }
    }
    this.lane += (Math.max(-0.7, Math.min(0.7, lane)) - this.lane) * Math.min(1, dt * 1.5);
    // steer toward a point ahead on that lane
    const ti = Math.min(T.pts.length - 1, this.idx + 5 + Math.floor(this.speed / 140));
    const tp = T.pts[ti], nx = -Math.sin(tp.a), ny = Math.cos(tp.a);
    const tx = tp.x + nx * this.lane * tp.w, ty = tp.y + ny * this.lane * tp.w;
    let d = Math.atan2(ty - this.y, tx - this.x) - this.h;
    while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    this.steer += (Math.max(-1, Math.min(1, d * 3)) - this.steer) * Math.min(1, dt * 8);
    this.h += d * Math.min(1, dt * 5);
    // a showy slide through the bends (visual: the body yaws past the direction of travel)
    const slipWant = Math.max(-0.5, Math.min(0.5, kmax * this.speed * 0.9));
    this.slip += (slipWant - this.slip) * Math.min(1, dt * 3);
    this.vx = Math.cos(this.h) * this.speed; this.vy = Math.sin(this.h) * this.speed;
    this.x += this.vx * dt; this.y += this.vy * dt;
    // stay on the road
    this.idx = T.nearest(this.x, this.y, this.idx);
    const p = T.pts[this.idx], off = T.offset(this.x, this.y, this.idx), lim = p.w - 18;
    if (Math.abs(off) > lim) { const s = Math.sign(off), px = -Math.sin(p.a) * s, py = Math.cos(p.a) * s; this.x -= px * (Math.abs(off) - lim); this.y -= py * (Math.abs(off) - lim); this.speed *= 0.97; }
  }
  // body angle to draw (heading plus the slide)
  get drawH() { return this.h + this.slip; }
}
