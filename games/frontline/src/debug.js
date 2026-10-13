// AI debug overlay (?ai=1 or F3): per bot a label (name, role, state, target, suppression,
// health), vision cone, line to the chosen cover (+ peek spot), path, detection lines to
// enemies (thickening with the detection meter), last-known positions and heard sounds.
import * as THREE from '../vendor/three.module.js';
import { TEAM_LOOK } from './models.js';

const MAXV = 30000;
const STATE_COL = { objective: '#9ad', engage: '#f55', cover: '#fd4', incover: '#fa4', suppress: '#f8f', flank: '#a6f', search: '#6cf', investigate: '#7ef', hold: '#cc8', retreat: '#f88', evade: '#fff', revive: '#7f7' };

export class AIDebug {
  constructor(scene, layer) {
    this.scene = scene; this.layer = layer;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAXV * 3); this.col = new Float32Array(MAXV * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.9 }));
    this.lines.frustumCulled = false; this.lines.renderOrder = 50;
    this.on = false; this.n = 0;
    this.labels = new Map();
    this.c = new THREE.Color();
    this.v = new THREE.Vector3();
  }
  set(on) {
    this.on = on;
    if (on) this.scene.add(this.lines); else { this.scene.remove(this.lines); this.layer.innerHTML = ''; this.labels.clear(); }
  }
  seg(ax, ay, az, bx, by, bz, col) {
    if (this.n >= MAXV - 2) return;
    this.c.set(col);
    const p = this.pos, c = this.col, i = this.n * 3;
    p[i] = ax; p[i + 1] = ay; p[i + 2] = az; p[i + 3] = bx; p[i + 4] = by; p[i + 5] = bz;
    c[i] = c[i + 3] = this.c.r; c[i + 1] = c[i + 4] = this.c.g; c[i + 2] = c[i + 5] = this.c.b;
    this.n += 2;
  }
  ring(x, y, z, r, col, n = 14) { for (let k = 0; k < n; k++) { const a = k / n * 6.283, b = (k + 1) / n * 6.283; this.seg(x + Math.cos(a) * r, y, z + Math.sin(a) * r, x + Math.cos(b) * r, y, z + Math.sin(b) * r, col); } }
  cross(x, y, z, s, col) { this.seg(x - s, y, z - s, x + s, y, z + s, col); this.seg(x - s, y, z + s, x + s, y, z - s, col); this.seg(x, y, z, x, y + s * 3, z, col); }
  update(m, cam, only) {
    if (!this.on) return;
    this.n = 0;
    const now = m.time;
    const seen = new Set();
    for (const s of m.soldiers) {
      if (!s.brain || !s.alive) continue;
      if (only !== undefined && only !== null && s.team !== only && m.mode !== 'watch') continue;
      const b = s.brain, tc = TEAM_LOOK[s.team].css;
      const y = s.pos.y + 0.08;
      // vision cone (shorter when relaxed)
      const alert = now < b.alertT;
      const half = (alert ? 80 : 62) * Math.PI / 180, L = alert ? 9 : 6;
      const ex = s.pos.x, ez = s.pos.z;
      const steps = 8;
      for (let k = 0; k < steps; k++) {
        const a0 = b.aimYaw - half + (2 * half) * k / steps, a1 = b.aimYaw - half + (2 * half) * (k + 1) / steps;
        this.seg(ex - Math.sin(a0) * L, y, ez - Math.cos(a0) * L, ex - Math.sin(a1) * L, y, ez - Math.cos(a1) * L, tc);
      }
      this.seg(ex, y, ez, ex - Math.sin(b.aimYaw - half) * L, y, ez - Math.cos(b.aimYaw - half) * L, tc);
      this.seg(ex, y, ez, ex - Math.sin(b.aimYaw + half) * L, y, ez - Math.cos(b.aimYaw + half) * L, tc);
      // aim ray
      this.seg(ex, s.pos.y + 1.5, ez, ex - Math.sin(b.aimYaw) * 3, s.pos.y + 1.5 + Math.sin(b.aimPitch) * 3, ez - Math.cos(b.aimYaw) * 3, '#ffffff');
      // path
      if (b.path && b.pi < b.path.length) {
        let px = s.pos.x, pz = s.pos.z, py = y;
        for (let k = b.pi; k < b.path.length; k++) { const q = b.path[k]; this.seg(px, py + 0.1, pz, q.x, q.y + 0.18, q.z, '#55ddff'); px = q.x; pz = q.z; py = q.y; }
      }
      // cover
      if (b.cover) {
        const cv = b.cover;
        this.seg(s.pos.x, s.pos.y + 1, s.pos.z, cv.x, cv.h + 0.4, cv.z, '#ffd040');
        this.ring(cv.x, cv.h + 0.06, cv.z, 0.45, cv.low ? '#ffd040' : '#ff9a30', 8);
        // threat direction it covers from
        const dx = cv.tx - cv.x, dz = cv.tz - cv.z, l = Math.hypot(dx, dz) || 1;
        this.seg(cv.x, cv.h + 0.3, cv.z, cv.x + dx / l * 1.6, cv.h + 0.3, cv.z + dz / l * 1.6, '#ff5030');
        if (cv.peek && !cv.peek.stand) { this.ring(cv.peek.x, cv.h + 0.06, cv.peek.z, 0.3, '#7fff7f', 6); this.seg(cv.x, cv.h + 0.06, cv.z, cv.peek.x, cv.h + 0.06, cv.peek.z, '#7fff7f'); }
      }
      // perception: detection lines and memory
      for (const [e, v] of b.dbg.vis) {
        const col = v >= 1 ? '#ff3030' : v > 0.5 ? '#ff9030' : '#ffff60';
        this.seg(s.pos.x, s.pos.y + 1.55, s.pos.z, e.pos.x, e.pos.y + 1.3, e.pos.z, col);
      }
      for (const mm of b.mem.values()) {
        if (mm.seen) continue;
        const age = now - mm.t;
        if (age > 22) continue;
        const col = mm.src === 'heard' ? '#7ef' : mm.src === 'callout' ? '#c8f' : mm.src === 'hit' ? '#f66' : '#fa4';
        this.cross(mm.x, mm.y + 0.1, mm.z, 0.35, col);
        if (b.target === mm) this.seg(s.pos.x, s.pos.y + 1.4, s.pos.z, mm.x, mm.y + 1, mm.z, col);
      }
      const hl = b.dbg.heard[b.dbg.heard.length - 1];
      if (hl && now - hl.t < 1) this.ring(hl.x, s.pos.y + 0.15, hl.z, 0.5 + (now - hl.t) * 1.5, '#77eeff', 8);
      // label
      let el = this.labels.get(s.id);
      if (!el) { el = document.createElement('div'); el.className = 'ailbl'; this.layer.append(el); this.labels.set(s.id, el); }
      seen.add(s.id);
      this.v.set(s.pos.x, s.pos.y + 2.25, s.pos.z).project(cam);
      const vis = this.v.z < 1 && Math.abs(this.v.x) < 1.1 && Math.abs(this.v.y) < 1.1;
      const dist = cam.position.distanceTo(s.pos);
      el.style.display = vis && dist < 70 ? '' : 'none';
      if (!vis) continue;
      el.style.transform = `translate(${(this.v.x * 0.5 + 0.5) * innerWidth}px,${(-this.v.y * 0.5 + 0.5) * innerHeight}px) translate(-50%,-100%)`;
      const st = b.state;
      const tgt = b.target ? `${b.target.s.name}${b.target.seen ? '' : ' (' + b.target.src + ' ' + (now - b.target.t).toFixed(0) + 's)'}` : '-';
      const sup = Math.round(b.suppress * 100);
      el.innerHTML = `<b style="color:${tc}">${s.name}</b> <i>${s.role}</i><br><span style="color:${STATE_COL[st] || '#fff'}">${b.dbg.line}</span> ${s.downed ? '<span style="color:#f66">DOWN</span>' : ''}<br>tgt ${tgt}<div class="bars"><span style="width:${s.hp}%;background:#7f7"></span><span style="width:${Math.min(100, sup)}%;background:#f8f"></span></div>${b.say && now - b.say.t < 3 ? `<q>${b.say.text}</q>` : ''}`;
      el.style.opacity = dist < 40 ? 1 : 0.6;
    }
    for (const [id, el] of this.labels) if (!seen.has(id)) { el.remove(); this.labels.delete(id); }
    const g = this.lines.geometry;
    g.setDrawRange(0, this.n);
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
  }
}
