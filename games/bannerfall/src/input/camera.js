// BANNERFALL :: input/camera.js - RTS camera: pan (WASD / arrows / edge / drag), rotate (Q/E,
// middle drag), zoom toward the cursor. On a war map it reaches from 14 m to 1,400 m (DESIGN.md
// 15.1): the pitch eases from 27 deg close in to 62 deg at 400 m, then up to 75 deg for the
// strategic view. Pan speed scales with height. flyTo() eases a jump along a short arc (it rises
// for long jumps), and bookmarks remember four views.
export function createRTSCamera(camera, terrainHeight, size, opts = {}) {
  const S = {
    x: size / 2, z: 70, yaw: Math.PI, dist: 95, tilt: 0,
    tx: size / 2, tz: 70, tyaw: Math.PI, tdist: 95, ttilt: 0,
    keys: new Set(), edge: { x: 0, y: 0 }, edgePan: true,
    min: opts.min || 14, max: opts.max || 210, shake: 0, size,
    fly: null, marks: {},
  };
  const isBig = () => S.max > 400;
  // yaw = PI means the camera sits south of the target looking north (+z)
  function pitchFor(d) {
    if (!isBig()) { const k = (d - S.min) / (S.max - S.min); return (27 + 35 * Math.pow(Math.min(1, Math.max(0, k)), 1.1)) * Math.PI / 180; }
    if (d <= 400) { const k = (d - S.min) / (400 - S.min); return (27 + 35 * Math.pow(Math.min(1, Math.max(0, k)), 1.1)) * Math.PI / 180; }
    const k = Math.min(1, (d - 400) / (S.max - 400));
    return (62 + 13 * k) * Math.PI / 180;
  }
  function update(dt) {
    const pan = (S.tdist * 0.9 + 18) * dt;
    let mx = 0, mz = 0;
    if (S.keys.has('w') || S.keys.has('arrowup')) mz += 1;
    if (S.keys.has('s') || S.keys.has('arrowdown')) mz -= 1;
    if (S.keys.has('a') || S.keys.has('arrowleft')) mx -= 1;
    if (S.keys.has('d') || S.keys.has('arrowright')) mx += 1;
    if (S.edgePan) { mx += S.edge.x; mz += S.edge.y; }
    if (S.keys.has('q')) S.tyaw += 1.6 * dt;
    if (S.keys.has('e')) S.tyaw -= 1.6 * dt;
    if (mx || mz) {
      S.fly = null;
      const fx = -Math.sin(S.yaw), fz = -Math.cos(S.yaw);
      const rx = -fz, rz = fx;
      S.tx += (fx * mz + rx * mx) * pan;
      S.tz += (fz * mz + rz * mx) * pan;
    }
    // a fly-to: ease along an arc that rises for long jumps
    if (S.fly) {
      const F = S.fly;
      F.t = Math.min(1, F.t + dt / F.dur);
      const k = F.t < 0.5 ? 2 * F.t * F.t : 1 - Math.pow(-2 * F.t + 2, 2) / 2;
      S.tx = F.x0 + (F.x1 - F.x0) * k; S.tz = F.z0 + (F.z1 - F.z0) * k;
      S.tdist = F.d0 + (F.d1 - F.d0) * k + Math.sin(F.t * Math.PI) * F.lift;
      S.x = S.tx; S.z = S.tz; S.dist = S.tdist;
      if (F.t >= 1) S.fly = null;
    }
    const m = 6;
    S.tx = Math.max(m, Math.min(S.size - m, S.tx)); S.tz = Math.max(m, Math.min(S.size - m, S.tz));
    S.tdist = Math.max(S.min, Math.min(S.max, S.tdist));
    const k = 1 - Math.pow(0.0015, dt);
    S.x += (S.tx - S.x) * k; S.z += (S.tz - S.z) * k;
    S.yaw += (S.tyaw - S.yaw) * k; S.dist += (S.tdist - S.dist) * k; S.tilt += (S.ttilt - S.tilt) * k;
    const pitch = Math.max(0.35, Math.min(1.35, pitchFor(S.dist) + S.tilt));
    const ty = terrainHeight(S.x, S.z);
    const cx = S.x + Math.sin(S.yaw) * Math.cos(pitch) * S.dist;
    const cz = S.z + Math.cos(S.yaw) * Math.cos(pitch) * S.dist;
    let cy = ty + Math.sin(pitch) * S.dist;
    cy = Math.max(cy, terrainHeight(cx, cz) + 4);
    let sx = 0, sy = 0;
    if (S.shake > 0) { S.shake = Math.max(0, S.shake - dt * 2.5); sx = (Math.random() - 0.5) * S.shake; sy = (Math.random() - 0.5) * S.shake; }
    camera.position.set(cx + sx, cy + sy, cz);
    camera.lookAt(S.x, ty + 1.5, S.z);
    return { x: S.x, y: ty, z: S.z, dist: S.dist };
  }
  function zoomAt(delta, ground) {
    S.fly = null;
    const f = Math.exp(delta * 0.0011);
    const nd = Math.max(S.min, Math.min(S.max, S.tdist * f));
    if (ground && nd < S.tdist) {
      const k = 1 - nd / S.tdist;
      S.tx += (ground[0] - S.tx) * k * 0.9; S.tz += (ground[1] - S.tz) * k * 0.9;
    }
    S.tdist = nd;
  }
  function jump(x, z, dist, yaw) { S.fly = null; S.tx = S.x = x; S.tz = S.z = z; if (dist) S.tdist = S.dist = dist; if (yaw !== undefined) S.tyaw = S.yaw = yaw; }
  function focus(x, z) { S.fly = null; S.tx = x; S.tz = z; }
  function flyTo(x, z, dist) {
    const d1 = dist || Math.min(S.tdist, 260);
    const far = Math.hypot(x - S.x, z - S.z);
    S.fly = { t: 0, dur: far > 800 ? 0.9 : 0.6, x0: S.x, z0: S.z, x1: x, z1: z, d0: S.dist, d1, lift: far > 800 ? Math.min(900, far * 0.35) : 0 };
  }
  function mark(k) { S.marks[k] = { x: S.tx, z: S.tz, dist: S.tdist, yaw: S.tyaw }; }
  function recall(k) { const m = S.marks[k]; if (!m) return false; flyTo(m.x, m.z, m.dist); S.tyaw = m.yaw; return true; }
  // a new map: its size and the zoom range
  function configure(sz, min, max) { S.size = sz; S.min = min; S.max = max; S.tdist = Math.max(min, Math.min(max, S.tdist)); }
  return { S, update, zoomAt, jump, focus, flyTo, mark, recall, configure };
}
