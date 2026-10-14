// Swinging doors. You barge them open just by running into them (they swing away from you);
// E slams one shut behind you. The thing cannot work a handle: a shut door has to be smashed
// (it pounds, the door shudders, then the whole slab comes off its hinges as a physics prop).
import * as THREE from 'three';
import * as TX from './textures.js';

const _a = new THREE.Vector3();
function segInt(ax, az, bx, bz, cx, cz, dx, dz) {
  const d1x = bx - ax, d1z = bz - az, d2x = dx - cx, d2z = dz - cz;
  const den = d1x * d2z - d1z * d2x; if (Math.abs(den) < 1e-9) return false;
  const s = ((cx - ax) * d2z - (cz - az) * d2x) / den, u = ((cx - ax) * d1z - (cz - az) * d1x) / den;
  return s >= 0 && s <= 1 && u >= 0 && u <= 1;
}
export class Doors {
  constructor(scene, W, props) {
    this.list = W.doors; this.props = props; this.events = [];
    const cols = [0x3b1f16, 0x1e3326, 0x5a1c17, 0x23272d, 0x4a3a22];
    const mats = cols.map(c => new THREE.MeshStandardMaterial({ map: TX.doorTexture(c), roughness: 0.5 }));
    const edge = new THREE.MeshStandardMaterial({ color: 0x1a1512, roughness: 0.6 });
    for (const d of this.list) {
      const g = new THREE.Group();
      g.position.set(d.hx, d.y, d.hz);
      const m = mats[d.id % mats.length];
      const geo = new THREE.BoxGeometry(d.w - 0.02, d.h, 0.05);
      geo.translate((d.w - 0.02) / 2 + 0.01, d.h / 2, 0);
      const panel = new THREE.Mesh(geo, [edge, edge, edge, edge, m, m]);
      panel.castShadow = true; panel.receiveShadow = true;
      // a push plate / handle
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.09), new THREE.MeshStandardMaterial({ color: 0x9c8a5a, metalness: 0.8, roughness: 0.3 }));
      h.position.set(d.w - 0.12, 1.0, 0);
      g.add(panel, h);
      scene.add(g);
      d.pivot = g; d.panel = panel; d.mat = m;
      d.baseYaw = Math.atan2(-d.az, d.ax);
      d.hits = 0; d.shudder = 0;
      this.sync(d);
    }
  }
  resetAll() { for (const d of this.list) { d.ang = d.vel = d.target = 0; d.broken = false; d.slamming = false; d.hits = 0; d.shudder = 0; d.pivot.visible = true; this.sync(d); } this.events.length = 0; }
  sync(d) { d.pivot.rotation.y = d.baseYaw + d.ang + Math.sin(performance.now() * 0.08) * 0.02 * d.shudder; }
  // free end of the panel at the current angle
  tip(d, out = _a) {
    const a = d.baseYaw + d.ang;
    return out.set(d.hx + Math.cos(a) * d.w, d.y, d.hz - Math.sin(a) * d.w);
  }
  isShut(d) { return !d.broken && Math.abs(d.ang) < 0.25; }
  update(dt) {
    for (const d of this.list) {
      if (d.broken) continue;
      // spring toward the target angle; a slam is fast and bangs at the end
      const k = d.slamming ? 60 : 14, damp = d.slamming ? 9 : 7;
      d.vel += ((d.target - d.ang) * k - d.vel * damp) * dt;
      d.ang += d.vel * dt;
      if (d.slamming && Math.abs(d.ang) < 0.04) { d.slamming = false; d.ang = 0; d.vel = 0; this.events.push({ type: 'slam', d, pos: new THREE.Vector3(d.cx, d.y + 1, d.cz) }); }
      d.shudder = Math.max(0, d.shudder - dt * 3);
      this.sync(d);
    }
  }
  // player (or anything round) vs door panels. Running into a shut door barges it open.
  collide(p, r, y0, y1, vel) {
    let ev = null;
    for (const d of this.list) {
      if (d.broken || y1 < d.y || y0 > d.y + d.h) continue;
      if (Math.abs(p.x - d.cx) > 2.5 || Math.abs(p.z - d.cz) > 2.5) continue;
      const tp = this.tip(d);
      const ax = d.hx, az = d.hz, bx = tp.x - ax, bz = tp.z - az;
      const L2 = bx * bx + bz * bz;
      let s = ((p.x - ax) * bx + (p.z - az) * bz) / L2; s = Math.max(0, Math.min(1, s));
      const cx = ax + bx * s, cz = az + bz * s;
      let dx = p.x - cx, dz = p.z - cz; const dd = Math.hypot(dx, dz);
      if (dd >= r + 0.03) continue;
      // which side of the panel are we on, and are we pushing into it?
      const nx = -bz / Math.sqrt(L2), nz = bx / Math.sqrt(L2);
      const side = Math.sign((p.x - ax) * nx + (p.z - az) * nz) || 1;
      const push = -(vel.x * nx + vel.z * nz) * side;
      if (push > 0.4 && !d.locked) {
        // swing it away from us
        const open = side > 0 ? -1.65 : 1.65;
        if (Math.abs(d.target) < 0.1 || Math.sign(d.target) !== Math.sign(open)) {
          d.target = open; d.vel += open * (2 + push * 1.2); d.slamming = false;
          ev = { type: 'doorOpen', d, pos: new THREE.Vector3(d.cx, d.y + 1, d.cz), hard: push > 3 };
        }
      }
      // keep us out of the panel
      if (dd > 1e-4) { const pen = r + 0.03 - dd; p.x += dx / dd * pen; p.z += dz / dd * pen; }
    }
    return ev;
  }
  // nearest door to slam / open for the E key
  nearest(p, yaw, maxD = 2.6) {
    let best = null, bd = maxD;
    for (const d of this.list) {
      if (d.broken || d.locked || Math.abs(p.y - d.y) > 1.2) continue;
      const dd = Math.hypot(p.x - d.cx, p.z - d.cz);
      if (dd < bd) { bd = dd; best = d; }
    }
    return best;
  }
  slam(d, p) {
    // do not slam it into ourselves
    d.target = 0; d.slamming = true; d.vel = -Math.sign(d.ang || 1) * 9;
  }
  open(d, p) {
    const a = d.baseYaw, nx = -Math.sin(a) * -1, nz = Math.cos(a) * -1;   // unused precision; just swing away
    const tp = this.tip(d), bx = tp.x - d.hx, bz = tp.z - d.hz, L = Math.hypot(bx, bz);
    const side = Math.sign((p.x - d.hx) * (-bz / L) + (p.z - d.hz) * (bx / L)) || 1;
    d.target = side > 0 ? -1.65 : 1.65; d.vel += d.target * 3; d.slamming = false;
  }
  // does a shut door stand between a and b?
  blocksSight(a, b) {
    for (const d of this.list) {
      if (d.broken || Math.abs(d.ang) > 0.3) continue;
      if (Math.max(a.y, b.y) < d.y || Math.min(a.y, b.y) > d.y + d.h) continue;
      const tp = this.tip(d);
      if (segInt(a.x, a.z, b.x, b.z, d.hx, d.hz, tp.x, tp.z)) return true;
    }
    return false;
  }
  // the monster hits it
  pound(d) { d.shudder = 1; d.hits++; this.events.push({ type: 'pound', d, pos: new THREE.Vector3(d.cx, d.y + 1, d.cz) }); }
  smash(d, fromX, fromZ) {
    d.broken = true; d.pivot.visible = false;
    // the slab flies off away from the monster
    const dx = d.cx - fromX, dz = d.cz - fromZ, l = Math.hypot(dx, dz) || 1;
    const mesh = new THREE.Group();
    const panel = d.panel.clone(); panel.geometry = d.panel.geometry.clone().translate(-(d.w - 0.02) / 2 - 0.01, -d.h / 2, 0);
    mesh.add(panel);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), d.baseYaw);
    const pr = this.props.spawn('door', d.cx, d.y + 0.01, d.cz, 0, { mesh, q, vel: new THREE.Vector3(dx / l * 7, 1.5, dz / l * 7), w: new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 3) });
    if (pr) pr.pos.y = d.y + d.h / 2 + 0.05;
    this.events.push({ type: 'break', d, pos: new THREE.Vector3(d.cx, d.y + 1, d.cz) });
  }
}
