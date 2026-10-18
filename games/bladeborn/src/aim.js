// Aiming: which ONE enemy the crosshair is on, and which body zone of his it points at.
import * as THREE from 'three';

const _p = new THREE.Vector3(), _ray = new THREE.Raycaster(), _c = new THREE.Vector2(0, 0);
const PROBE = ['head', 'torso', 'pelvis', 'uarmL', 'uarmR', 'thighL', 'thighR', 'shinL', 'shinR'];

// The enemy whose body is closest to the crosshair on screen (aspect-corrected NDC), within reach.
export function crossTarget(G, hero, reach = 5.5) {
  const cam = G.camera; let best = null, bs = 0.55;
  for (const e of G.enemies) {
    if (e.held || !e.alive) continue;
    const d = Math.hypot(e.pos.x - hero.pos.x, e.pos.z - hero.pos.z);
    if (d > reach || Math.abs(e.pos.y - hero.pos.y) > 2.5) continue;
    let sd = 9;
    for (const k of PROBE) {
      if (e.rig.cut.has(k)) continue;
      e.rig.m[k].getWorldPosition(_p).project(cam);
      if (_p.z > 1 || _p.z < -1) continue;
      sd = Math.min(sd, Math.hypot(_p.x * cam.aspect, _p.y));
    }
    sd += d * 0.015;
    if (sd < bs) { bs = sd; best = e; }
  }
  if (!best) { // point blank: whoever is right in front of you
    const f = hero.forward();
    for (const e of G.enemies) {
      if (e.held || !e.alive) continue;
      const dx = e.pos.x - hero.pos.x, dz = e.pos.z - hero.pos.z, d = Math.hypot(dx, dz);
      if (d < 1.9 && (dx * f.x + dz * f.z) / (d || 1) > 0.3 && (!best || d < bs)) { best = e; bs = d; }
    }
  }
  return best;
}

// Zone under the crosshair on this enemy. Ray from the camera through screen centre against his body cubes;
// if it misses, the cube closest to the ray. Returns { zone, seg, mesh, local } (local = hit point in mesh space).
// ray vs a segment's physics box (in its local frame): distance or Infinity
const _inv = new THREE.Matrix4(), _o = new THREE.Vector3(), _d = new THREE.Vector3();
function rayBoxLocal(ray, seg) {
  seg.updateWorldMatrix(true, false); _inv.copy(seg.matrixWorld).invert();
  _o.copy(ray.origin).applyMatrix4(_inv); _d.copy(ray.direction).transformDirection(_inv);
  const s = seg.userData.size; let t0 = 0, t1 = Infinity;
  for (const [k, h] of [['x', s[0] / 2], ['y', s[1] / 2], ['z', s[2] / 2]]) {
    if (Math.abs(_d[k]) < 1e-9) { if (Math.abs(_o[k]) > h) return Infinity; continue; }
    let a = (-h - _o[k]) / _d[k], b = (h - _o[k]) / _d[k]; if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return Infinity;
  }
  return t0;
}
// Zone under the crosshair on this enemy: ray from the camera through screen centre against his segment boxes;
// if it misses, the segment closest to the ray. Returns { zone, seg, mesh, local } (local = hit point in seg space).
export function aimZone(G, e) {
  _ray.setFromCamera(_c, G.camera);
  e.rig.root.updateMatrixWorld(true);
  let mesh = null, point = null, best = Infinity;
  for (const k in e.rig.m) { if (e.rig.cut.has(k)) continue; const t = rayBoxLocal(_ray.ray, e.rig.m[k]); if (t < best) { best = t; mesh = e.rig.m[k]; } }
  if (mesh) point = _ray.ray.at(best, new THREE.Vector3());
  else {
    let bd = 1e9;
    for (const k in e.rig.m) { if (e.rig.cut.has(k)) continue; const m = e.rig.m[k]; m.getWorldPosition(_p); const d = _ray.ray.distanceSqToPoint(_p); if (d < bd) { bd = d; mesh = m; } }
    point = new THREE.Vector3(); _ray.ray.closestPointToPoint(mesh.getWorldPosition(_p), point);
    point.lerp(mesh.getWorldPosition(new THREE.Vector3()), 0.7);
  }
  const seg = mesh.userData.seg, local = mesh.worldToLocal(point.clone()), s = mesh.userData.size;
  let zone = seg;
  if (seg === 'handL') zone = 'larmL'; else if (seg === 'handR') zone = 'larmR';
  else if (seg === 'footL') zone = 'shinL'; else if (seg === 'footR') zone = 'shinR';
  else if (seg === 'pelvis') zone = 'gut';
  else if (seg === 'head') zone = local.y < -s[1] * 0.3 ? 'neck' : 'head';
  else if (seg === 'torso') zone = local.y > s[1] * 0.32 ? 'neck' : local.y < -s[1] * 0.12 ? 'gut' : Math.abs(local.x) > s[0] * 0.3 && local.y > 0 ? (local.x > 0 ? 'armpitL' : 'armpitR') : 'chest';
  return { zone, seg, mesh, local };
}
