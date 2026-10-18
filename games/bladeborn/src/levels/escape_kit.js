// Shared helpers for the two escape chapters (escape_roofs = CH3 ROOFTOP ESCAPE, escape_forest = CH4 THE TREES).
// Owned by the escape builder; not a level (never pass ?level=escape_kit). Everything goes through the LevelKit (L),
// so it is all removed on unload. Greys only: lights are white, glass is grey, blood stays the only colour.
import { rayBox } from '../world.js';

// ---- one-draw-call scenery: lit windows, tree trunks, leaf clumps, branches -------------------------------------
// inst.add(key, geometry, material, x, y, z, sx, sy, sz, ry) collects transforms; inst.flush() builds one
// InstancedMesh per key (call it once at the end of build).
export function instancer(L) {
  const T = L.THREE, sets = new Map(), M = new T.Matrix4(), Q = new T.Quaternion(), E = new T.Euler(), P = new T.Vector3(), S = new T.Vector3();
  return {
    add(key, geo, mat, x, y, z, sx = 1, sy = 1, sz = 1, ry = 0, rx = 0, shadow = true) {
      let s = sets.get(key); if (!s) sets.set(key, s = { geo, mat, shadow, m: [] });
      E.set(rx, ry, 0); Q.setFromEuler(E); s.m.push(M.compose(P.set(x, y, z), Q, S.set(sx, sy, sz)).clone());
    },
    flush() {
      for (const s of sets.values()) {
        if (!s.m.length) continue;
        const im = new T.InstancedMesh(s.geo, typeof s.mat === 'string' ? L.mat(s.mat) : s.mat, s.m.length);
        s.m.forEach((m, i) => im.setMatrixAt(i, m)); im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere();
        im.castShadow = s.shadow; im.receiveShadow = true; L.deco(im);
      }
      sets.clear();
    },
  };
}

let _mats = null;
export function escMats(T) {
  if (_mats) return _mats;
  _mats = {
    winLit: new T.MeshStandardMaterial({ color: 0x1a1a1a, emissive: 0xc8c8c8, emissiveIntensity: 0.55, roughness: 0.4 }),
    winDim: new T.MeshStandardMaterial({ color: 0x1e1e1e, emissive: 0x505050, emissiveIntensity: 0.35, roughness: 0.3 }),
    winDark: new T.MeshStandardMaterial({ color: 0x141414, roughness: 0.15, metalness: 0.3 }),
    beam: new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.06, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide }),
    water: new T.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.08, metalness: 0.6 }),
  };
  return _mats;
}

// a seeded random so a level looks the same on every load and retry
export const rng = seed => { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };

// A building: solid box (claw-climbable on every face) + grey window grid on its faces. o: { mat, win: 0..1 lit
// share, faces: ['+x','-x','+z','-z'], rim (roof lip height, 0 = none), seed }
export function building(L, inst, x, z, w, d, h, o = {}) {
  const T = L.THREE, M = escMats(T), r = rng(o.seed ?? Math.floor(x * 31 + z * 17 + h * 7));
  const b = L.box(x, o.y || 0, z, w, h, d, { mat: o.mat || 'concrete', tile: 5 });
  const geo = _winGeo || (_winGeo = new T.PlaneGeometry(1, 1));
  const lit = o.win ?? 0.22, top = (o.y || 0) + h;
  for (const f of o.faces || ['+x', '-x', '+z', '-z']) {
    const alongX = f === '+z' || f === '-z', len = alongX ? w : d, sgn = f[0] === '+' ? 1 : -1;
    const n = Math.floor((len - 1.2) / 2.6); if (n < 1) continue;
    for (let fy = (o.y || 0) + 1.6; fy < top - 1.4; fy += 3.2) for (let i = 0; i < n; i++) {
      const u = -((n - 1) * 2.6) / 2 + i * 2.6, roll = r();
      const m = roll < lit ? M.winLit : roll < lit + 0.18 ? M.winDim : M.winDark, key = m === M.winLit ? 'wl' : m === M.winDim ? 'wd' : 'wk';
      const px = alongX ? x + u : x + sgn * (w / 2 + 0.03), pz = alongX ? z + sgn * (d / 2 + 0.03) : z + u;
      const ry = f === '+z' ? 0 : f === '-z' ? Math.PI : f === '+x' ? Math.PI / 2 : -Math.PI / 2;
      inst.add(key, geo, m, px, fy + 0.7, pz, 1.1, 1.4, 1, ry, 0, false);
    }
  }
  if (o.rim) for (const [px, pz, sw, sd] of [[x, z - d / 2 + 0.15, w, 0.3], [x, z + d / 2 - 0.15, w, 0.3], [x - w / 2 + 0.15, z, 0.3, d], [x + w / 2 - 0.15, z, 0.3, d]])
    L.box(px, top, pz, sw, o.rim, sd, { mat: 'concreteDark', tile: 2 });
  return b;
}
let _winGeo = null;

// rooftop clutter: an AC unit (low cover), a vent stack, a water tank on legs, an antenna mast
export function acUnit(L, x, y, z, ry = 0) { const b = ry ? L.box(x, y, z, 1.3, 1.1, 1.8, { mat: 'metal', cover: true, tile: 1.2 }) : L.box(x, y, z, 1.8, 1.1, 1.3, { mat: 'metal', cover: true, tile: 1.2 }); L.mesh(new L.THREE.CylinderGeometry(0.45, 0.45, 0.06, 10), 'black', x, y + 1.13, z); return b; }
export function waterTank(L, x, y, z) {
  const T = L.THREE; L.box(x, y, z, 2.6, 6.4, 2.6, { visible: false });
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) L.mesh(new T.BoxGeometry(0.16, 2.4, 0.16), 'steel', x + dx, y + 1.2, z + dz);
  L.mesh(new T.BoxGeometry(2.6, 0.12, 2.6), 'steel', x, y + 2.46, z);
  const tank = new T.CylinderGeometry(1.5, 1.5, 3, 12); L.mesh(tank, 'bark', x, y + 4.0, z);
  L.mesh(new T.ConeGeometry(1.6, 1.0, 12), 'concreteDark', x, y + 6.0, z);
}
export function mast(L, x, y, z, h = 6) { L.mesh(new L.THREE.BoxGeometry(0.12, h, 0.12), 'steel', x, y + h / 2, z); L.mesh(new L.THREE.BoxGeometry(0.9, 0.06, 0.06), 'steel', x, y + h * 0.8, z); }

// ---- searchlights ----------------------------------------------------------------------------------------------
// A white spotlight on a tower that sweeps through `sweep` points and locks onto the hero when it catches him.
// o: { at: [x, y, z] lamp, sweep: [[x, y, z], ...], speed (sweeps/s scale), angle (half-cone, rad), tower: false,
//      hidden: h => bool (safe from this light), onSpot(S), power, follow: () => [x, y, z] (moves the lamp: a
//      helicopter), lockTime }
// Returns S: { meter 0..1, locked, update(dt) } (the level calls S.update in L.every).
export function searchlight(L, o) {
  const T = L.THREE, G = L.G, V = L.V, M = escMats(T);
  const O = V(...o.at), ang = o.angle || 0.075;
  if (o.tower !== false) {
    L.box(O.x, 0, O.z, 1.2, O.y - 1.0, 1.2, { mat: 'steel', tile: 2 });
    L.box(O.x, O.y - 1.0, O.z, 3, 0.25, 3, { mat: 'steel', tile: 2 });
    for (const [dx, dz] of [[-1.4, 0], [1.4, 0], [0, -1.4], [0, 1.4]]) L.mesh(new T.BoxGeometry(dx ? 0.06 : 2.9, 0.9, dz ? 0.06 : 2.9), 'steel', O.x + dx, O.y - 0.3, O.z + dz);
  }
  const head = new T.Group(); head.position.copy(O); L.deco(head);
  const can = new T.Mesh(new T.CylinderGeometry(0.42, 0.5, 0.9, 10), L.mat('steel')); can.rotation.x = Math.PI / 2; head.add(can);
  const lens = new T.Mesh(new T.CircleGeometry(0.4, 12), L.mat('lamp')); lens.position.z = 0.46; head.add(lens);
  const spot = new T.SpotLight(0xffffff, o.power ?? 2600, o.range ?? 90, ang * 1.25, 0.45, 2);
  spot.position.copy(O); L.group.add(spot); L.group.add(spot.target);
  const coneGeo = new T.CylinderGeometry(1, 0.06, 1, 18, 1, true); coneGeo.translate(0, 0.5, 0); coneGeo.rotateX(Math.PI / 2); // tip at the lamp, opens along +z (lookAt aims +z)
  const beam = new T.Mesh(coneGeo, M.beam.clone()); beam.renderOrder = 5; L.deco(beam); beam.castShadow = false; beam.receiveShadow = false;
  const S = { meter: 0, locked: 0, cool: 0, t: o.phase || 0, T: V(...o.sweep[0]), O, spot, head, beam, o, lit: false };
  const goal = V(0, 0, 0), dir = V(0, 0, 0), v = V(0, 0, 0);
  S.update = dt => {
    const h = G.hero;
    if (o.follow) O.set(...o.follow(dt));
    S.t += dt * (o.speed || 0.35); S.cool -= dt;
    if (S.locked > 0 && !h.dead) { S.locked -= dt; goal.set(h.pos.x, h.pos.y + 0.2, h.pos.z); S.T.lerp(goal, Math.min(1, dt * 5)); }
    else {
      const P = o.sweep, n = P.length, k = (1 - Math.cos(S.t)) / 2 * (n - 1), i = Math.min(n - 2, Math.floor(k)), f = k - i;
      if (o.sweepFn) goal.set(...o.sweepFn(S.t)); else goal.set(P[i][0] + (P[i + 1][0] - P[i][0]) * f, P[i][1] + (P[i + 1][1] - P[i][1]) * f, P[i][2] + (P[i + 1][2] - P[i][2]) * f);
      S.T.lerp(goal, Math.min(1, dt * 2.5));
    }
    // visuals: the lamp head aims, the cone reaches the target
    dir.copy(S.T).sub(O); const len = dir.length(); dir.divideScalar(len);
    head.position.copy(O); head.lookAt(S.T); spot.position.copy(O); spot.target.position.copy(S.T);
    const rad = Math.tan(ang) * len; beam.position.copy(O); beam.lookAt(S.T); beam.scale.set(rad, rad, len);
    beam.material.opacity = S.locked > 0 ? 0.11 : 0.05 + S.meter * 0.05;
    // detection: hero chest inside the cone, nothing solid in between
    S.lit = false;
    if (!h.dead && !(o.hidden && o.hidden(h)) && !h.crawling) {
      v.set(h.pos.x, h.pos.y + 1.1, h.pos.z).sub(O); const dist = v.length();
      if (dist > 1 && v.dot(dir) / dist > Math.cos(ang * 1.1)) {
        v.divideScalar(dist); const from = O.clone().addScaledVector(v, 2.2), hit = rayBox(from, v, dist - 2.8);
        S.lit = !hit || hit.box.glass;
      }
    }
    S.meter = Math.max(0, Math.min(1, S.meter + (S.lit ? dt * 1.7 : -dt * 0.7)));
    if (S.lit && S.meter >= 1) { S.locked = o.lockTime || 3.5; if (S.cool <= 0) { S.cool = o.cooldown || 9; try { o.onSpot?.(S); } catch (err) { console.warn('[level] searchlight: ' + err.message); } } }
  };
  return S;
}

// ---- pursuers: alert gunmen who come out of the streets behind you when you are spotted ----------------------
// spawns: [[x, y, z], ...]. Picks the spawn point nearest the hero that is at least `min` m away; never more than
// `cap` pursuers alive. Returns the new enemies.
export function pursue(L, spawns, o = {}) {
  const h = L.G.hero, cap = o.cap ?? 4, min = o.min ?? 14, types = o.types || ['guard_rifle', 'guard_baton'];
  if (L.alive('pursuit') >= cap) return [];
  const sp = spawns.map(p => ({ p, d: Math.hypot(p[0] - h.pos.x, p[2] - h.pos.z) })).filter(s => s.d >= min && (!o.behind || s.p[2] < h.pos.z + 4)).sort((a, b) => a.d - b.d)[0];
  if (!sp) return [];
  const out = [], n = Math.min(o.n ?? 2, cap - L.alive('pursuit'));
  for (let i = 0; i < n; i++) {
    const e = L.enemy(types[i % types.length], sp.p[0] + (i - (n - 1) / 2) * 1.6, sp.p[2] + i * 0.8, { y: sp.p[1], mode: 'alert', tag: 'pursuit', wander: true });
    e.lastKnown = h.pos.clone(); out.push(e);
  }
  return out;
}

// the big centre title (the chapter-card element): '' hides it
export function titleCard(text, sub = '') {
  try {
    const c = document.getElementById('card'); if (!c) return;
    if (!text) { c.style.opacity = 0; return; }
    c.innerHTML = (sub ? `<i>${sub}</i>` : '') + `<b>${text}</b>`; c.style.opacity = 1;
  } catch (_) {}
}

// a tutorial prompt in the subtitle bar, once per id per load
export function tip(L, id, text, sec = 4.5) { L._tips = L._tips || new Set(); if (L._tips.has(id)) return; L._tips.add(id); L.say('', text, sec); }

// ---- the forest round the Site 9 compound: a backdrop only (no colliders; the level's invisible walls keep the hero
// inside). Fills a band `depth` m wide outside rect [x0, z0, x1, z1] with instanced trunks and leaf clumps.
export function forestRing(L, I, rect, depth = 60, seed = 9, gap = 0) {
  const T = L.THREE, r = rng(seed), [x0, z0, x1, z1] = rect;
  const trunk = new T.CylinderGeometry(0.3, 0.42, 1, 6), clump = new T.IcosahedronGeometry(1, 0);
  const W = x1 - x0 + depth * 2, D = z1 - z0 + depth * 2, n = Math.floor((W * D - (x1 - x0) * (z1 - z0)) / 38);
  for (let i = 0, k = 0; i < n * 3 && k < n; i++) {
    const x = x0 - depth + r() * W, z = z0 - depth + r() * D;
    if (x > x0 - gap && x < x1 + gap && z > z0 - gap && z < z1 + gap) continue;
    const h = 10 + r() * 9; k++;
    I.add('ftrunk', trunk, 'bark', x, h / 2, z, 1, h, 1, 0, 0, false);
    for (let c = 0; c < 3; c++) I.add('fleaf', clump, 'leaf', x + (r() - 0.5) * 2.6, h - 2 + c * 1.3, z + (r() - 0.5) * 2.6, 2 + r() * 1.4, 1.7 + r(), 2 + r() * 1.4, r() * 6, 0, false);
  }
}

// a gradient sky that rides with the camera (drawn behind everything, no fog): top colour, horizon colour
export function skyDome(L, top, horizon) {
  const T = L.THREE, g = new T.SphereGeometry(1, 24, 12), p = g.attributes.position, c = [], a = new T.Color(top), b = new T.Color(horizon), k = new T.Color();
  for (let i = 0; i < p.count; i++) { const y = Math.max(0, p.getY(i)); k.copy(b).lerp(a, Math.pow(y, 0.6)); c.push(k.r, k.g, k.b); }
  g.setAttribute('color', new T.Float32BufferAttribute(c, 3));
  const m = new T.Mesh(g, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide, fog: false, depthWrite: false }));
  m.renderOrder = -10; m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false;
  m.onBeforeRender = (r, s, cam) => { m.position.copy(cam.position); m.scale.setScalar(cam.far * 0.9); m.updateMatrixWorld(); };
  L.deco(m); return m;
}
