// Chapter IV (tower) look: night Toronto skyline, curtain-wall glass, rain, lightning, the circling helicopter with its
// searchlight, and a small pool of point lights that follows the hero between floors (every lamp in the tower is an
// emissive fixture; only the nearest few actually light, so the shader never carries dozens of lights).
// Greys only. Owned by the tower builder (src/levels/tower*).
import * as THREE from 'three';
import { tiledBox } from '../world.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const rng = seed => { let s = seed * 9301 + 49297; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); };

function canvas(n, draw) {
  const c = document.createElement('canvas'); c.width = c.height = n; draw(c.getContext('2d'), n);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

// ---------- materials ----------
let MATS = null;
export function towerMats() {
  if (MATS) return MATS;
  // curtain wall: 4 x 4 panes per 8 m tile, dark glass, a few panes lit (emissive) - office lights left on at night
  const panes = (lit, seed) => (g, n) => {
    const r = rng(seed), p = n / 4;
    g.fillStyle = lit ? '#000' : '#1b1b1b'; g.fillRect(0, 0, n, n);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const v = r(), on = v < 0.24;
      if (lit) { if (on) { const b = 110 + Math.floor(r() * 110), w = r() < 0.75; g.fillStyle = w ? `rgb(${b},${b * 0.82 | 0},${b * 0.55 | 0})` : `rgb(${b * 0.7 | 0},${b * 0.85 | 0},${b})`; g.fillRect(i * p + 3, j * p + 3, p - 6, p * 0.62); } }
      else { const b = 26 + Math.floor(r() * 26); g.fillStyle = `rgb(${b},${b},${b})`; g.fillRect(i * p + 3, j * p + 3, p - 6, p * 0.62); g.fillStyle = '#2a2a2a'; g.fillRect(i * p + 3, j * p + p * 0.66, p - 6, p * 0.3); }
    }
    if (!lit) { g.strokeStyle = '#0c0c0c'; g.lineWidth = 3; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * p, 0); g.lineTo(i * p, n); g.stroke(); g.beginPath(); g.moveTo(0, i * p); g.lineTo(n, i * p); g.stroke(); } }
  };
  const curtain = new THREE.MeshStandardMaterial({ map: canvas(256, panes(false, 4)), emissiveMap: canvas(256, panes(true, 4)), emissive: 0xffffff, emissiveIntensity: 0.85, roughness: 0.22, metalness: 0.55, color: 0xbdbdbd });
  const skyline = new THREE.MeshStandardMaterial({ map: canvas(256, panes(false, 9)), emissiveMap: canvas(256, panes(true, 9)), emissive: 0xffffff, emissiveIntensity: 0.7, roughness: 0.4, metalness: 0.3, color: 0x9a9a9a });
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x2c2c2c, roughness: 0.35, metalness: 0.15 }); // wet road
  const lake = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.12, metalness: 0.7 });
  const beam = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.055, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const rain = new THREE.LineBasicMaterial({ color: 0xc8c8c8, transparent: true, opacity: 0.32, depthWrite: false });
  const mark = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 });
  return (MATS = { curtain, skyline, asphalt, lake, beam, rain, mark });
}

// a grey screen: a canvas drawn once (camera feeds, the transfer file)
export function screenMat(draw) {
  const t = canvas(256, (g, n) => { g.fillStyle = '#2b2b2b'; g.fillRect(0, 0, n, n); draw(g, n); const r = rng(13); for (let i = 0; i < 1800; i++) { const v = Math.floor(r() * 90); g.fillStyle = `rgba(${v},${v},${v},0.18)`; g.fillRect(r() * n, r() * n, 2, 1); } for (let y = 0; y < n; y += 3) { g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, y, n, 1); } });
  return new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.3 });
}

// ---------- the city around the tower (visual only) ----------
export function buildCity(L) {
  const M = towerMats(), r = rng(21), geos = [];
  const add = (x, z, w, d, h) => { const g = tiledBox(w, h, d, 8); g.translate(x, h / 2, z); geos.push(g); };
  // near blocks around the plaza (lower than the tower so it dominates)
  for (const [x, z, w, d, h] of [[-34, 0, 18, 30, 34], [34, -4, 16, 26, 28], [-30, -34, 22, 16, 44], [30, -36, 20, 18, 38], [0, -40, 24, 12, 26],
    [-28, 56, 22, 18, 22], [4, 58, 20, 16, 30], [32, 56, 18, 20, 18], [-58, 30, 16, 24, 40], [60, 28, 18, 22, 32]]) add(x, z, w, d, h);
  // the skyline: an annulus of towers, a few tall ones; open to the south (the lake)
  for (let i = 0; i < 64; i++) {
    const a = r() * Math.PI * 2, R = 90 + r() * 330, x = Math.cos(a) * R, z = Math.sin(a) * R;
    if (z > 150) continue; // the lake shore
    const h = r() < 0.18 ? 90 + r() * 70 : 22 + r() * 55, w = 14 + r() * 22, d = 14 + r() * 22;
    add(x, z, w, d, h);
  }
  const city = new THREE.Mesh(mergeGeometries(geos), M.skyline); city.castShadow = false; city.receiveShadow = false; L.deco(city);
  // CN Tower, north-west across the core: a tapering shaft, the pod, the sky pod, the antenna
  const cn = new THREE.Group(), cm = L.mat('concreteLight');
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(3, 9, 240, 6), cm); shaft.position.y = 120; cn.add(shaft);
  const pod = new THREE.Mesh(new THREE.CylinderGeometry(15, 11, 12, 12), cm); pod.position.y = 160; cn.add(pod);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(15.2, 15.2, 2.5, 12), L.mat('lamp')); ring.position.y = 162; cn.add(ring);
  const sky = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 6, 8), cm); sky.position.y = 205; cn.add(sky);
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 2, 70, 6), cm); ant.position.y = 275; cn.add(ant);
  cn.position.set(-170, 0, -250); cn.traverse(o => { o.castShadow = false; }); L.deco(cn);
  // the lake and the city floor
  const lake = new THREE.Mesh(new THREE.PlaneGeometry(2400, 900), M.lake); lake.rotation.x = -Math.PI / 2; lake.position.set(0, -0.6, 600); L.deco(lake);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 900), M.asphalt); ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.05, -300); L.deco(ground);
}

// ---------- rain: streaks around the camera, bent by the wind; hidden indoors ----------
export function makeRain(L, n = 1400) {
  const M = towerMats(), pos = new Float32Array(n * 6), base = new Float32Array(n * 3), r = rng(5);
  for (let i = 0; i < n; i++) { base[i * 3] = (r() - 0.5) * 44; base[i * 3 + 1] = r() * 32; base[i * 3 + 2] = (r() - 0.5) * 44; }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const lines = new THREE.LineSegments(geo, M.rain); lines.frustumCulled = false; lines.castShadow = false; L.group.add(lines);
  let fall = 0;
  return {
    lines,
    update(dt, cam, wind, visible) {
      lines.visible = visible; if (!visible || !cam) return;
      fall = (fall + dt * 30) % 32;
      const wx = wind.x, wz = wind.z, sx = wx * 0.03, sz = wz * 0.03;
      for (let i = 0; i < n; i++) {
        let y = base[i * 3 + 1] - fall; if (y < 0) y += 32;
        const x = cam.x + base[i * 3] + wx * (32 - y) * 0.03, z = cam.z + base[i * 3 + 2] + wz * (32 - y) * 0.03, yy = cam.y - 14 + y;
        const k = i * 6; pos[k] = x; pos[k + 1] = yy; pos[k + 2] = z; pos[k + 3] = x - sx * 10; pos[k + 4] = yy + 0.9; pos[k + 5] = z - sz * 10;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

// ---------- the helicopter: circles the tower, hovers over the pad, leaves. Searchlight + a faint beam ----------
export function makeHeli(L) {
  const M = towerMats(), g = new THREE.Group(), dark = L.mat('paintDark'), steel = L.mat('steel');
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.9, 4.6), dark); g.add(body);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.3, 1.4), L.mat('glass')); nose.position.set(0, -0.15, 2.9); g.add(nose);
  const boom = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 5.4), dark); boom.position.set(0, 0.35, -4.9); g.add(boom);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.6, 0.9), dark); fin.position.set(0, 1.0, -7.4); g.add(fin);
  for (const s of [-1, 1]) { const sk = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 4.4), steel); sk.position.set(s * 1.1, -1.35, 0.2); g.add(sk); }
  const rotor = new THREE.Group(); rotor.position.set(0, 1.15, 0); g.add(rotor);
  for (let i = 0; i < 2; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.05, 0.32), steel); b.rotation.y = i * Math.PI / 2; rotor.add(b); }
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.6, 0.18), steel); tail.position.set(0.3, 1.0, -7.5); g.add(tail);
  g.traverse(o => { o.castShadow = false; });
  const spot = new THREE.SpotLight(0xffffff, 1100, 95, 0.26, 0.55, 1.6); spot.position.set(0, -1.1, 2.4); spot.castShadow = false; g.add(spot);
  const target = new THREE.Object3D(); L.group.add(target); spot.target = target;
  const cone = new THREE.ConeGeometry(7, 40, 18, 1, true); cone.translate(0, -20, 0); cone.rotateX(-Math.PI / 2); // apex at 0, opening along +z
  const beam = new THREE.Mesh(cone, M.beam); beam.castShadow = false; L.group.add(beam);
  L.group.add(g);
  const H = { g, spot, target, beam, rotor, mode: 'circle', a: 0.8, t: 0, vel: V(0, 0, 0), aim: V(0, 56, 0), hoverAt: V(27, 63, 2), gone: false };
  H.update = (dt, focus) => {
    H.t += dt; rotor.rotation.y += dt * 38; tail.rotation.x += dt * 50;
    const p = g.position, want = V(0, 0, 0);
    if (H.mode === 'circle') { H.a += dt * 0.11; want.set(Math.cos(H.a) * 38, 74 + Math.sin(H.t * 0.31) * 2.5, Math.sin(H.a) * 38); }
    else if (H.mode === 'hover') want.copy(H.hoverAt).add(V(Math.sin(H.t * 0.7) * 1.2, Math.sin(H.t * 1.1) * 0.6, Math.cos(H.t * 0.5) * 1.5));
    if (H.mode === 'leave') { H.vel.lerp(V(70, 14, -50).normalize().multiplyScalar(26), Math.min(1, dt * 0.6)); p.addScaledVector(H.vel, dt); if (p.length() > 420) { g.visible = beam.visible = false; spot.intensity = 0; H.gone = true; } }
    else { if (!H.init) { p.copy(want); H.init = true; } p.lerp(want, Math.min(1, dt * (H.mode === 'hover' ? 0.9 : 2))); }
    // nose toward travel / the pad, a slight bank
    const look = H.mode === 'circle' ? V(-Math.sin(H.a), 0, Math.cos(H.a)) : H.mode === 'hover' ? V(-p.x, 0, -p.z).normalize() : H.vel.clone().setY(0).normalize();
    const yaw = Math.atan2(look.x, look.z); g.rotation.set(H.mode === 'leave' ? 0.18 : 0.08, yaw, H.mode === 'circle' ? -0.12 : 0, 'YXZ');
    // searchlight: sweeps the tower, locks on the focus (the hero / the fight) when asked
    const aim = focus ? focus.clone() : V(Math.sin(H.t * 0.37) * 14, 30 + Math.sin(H.t * 0.21) * 26, Math.cos(H.t * 0.29) * 14);
    H.aim.lerp(aim, Math.min(1, dt * 1.6)); target.position.copy(H.aim);
    g.updateMatrixWorld(true);
    const sp = spot.getWorldPosition(V(0, 0, 0)), d = H.aim.distanceTo(sp);
    beam.position.copy(sp); beam.lookAt(H.aim); beam.scale.set(d / 40 * 0.9, d / 40 * 0.9, Math.min(1.6, d / 40));
  };
  return H;
}

// ---------- lights that follow the hero ----------
export function lightPool(L, n = 5) {
  const lights = [], anchors = [];
  for (let i = 0; i < n; i++) { const l = new THREE.PointLight(0xffd9a8, 0, 12, 2); l.castShadow = false; L.group.add(l); lights.push({ l, a: null, k: 0 }); }
  let t = 0;
  return {
    add(x, y, z, o = {}) { anchors.push({ p: V(x, y, z), i: o.intensity ?? 9, d: o.dist ?? 13 }); if (o.fixture !== false) { const m = L.mesh(new THREE.BoxGeometry(o.w || 0.9, 0.05, 0.3), 'lamp', x, y + 0.03, z); m.castShadow = false; } },
    update(dt, p) {
      t -= dt;
      if (t <= 0) {
        t = 0.25;
        const best = anchors.map(a => [a, (a.p.x - p.x) ** 2 + (a.p.z - p.z) ** 2 + ((a.p.y - p.y - 2) * 3.2) ** 2]).sort((a, b) => a[1] - b[1]).slice(0, n).map(e => e[0]);
        for (const s of lights) if (s.a && !best.includes(s.a)) s.a = null;
        for (const a of best) if (!lights.some(s => s.a === a)) { const s = lights.find(s => !s.a); if (s) { s.a = a; s.k = 0; s.l.position.copy(a.p); s.l.distance = a.d; } }
      }
      for (const s of lights) { s.k = Math.min(1, s.k + dt * 4); s.l.intensity = s.a ? s.a.i * s.k : 0; }
    },
  };
}
