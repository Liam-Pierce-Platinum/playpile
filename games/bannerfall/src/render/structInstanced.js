// BANNERFALL :: render/structInstanced.js - every wall, gate, tower and stake on a war map in a
// dozen instanced draw calls (DESIGN.md 16.2). A wall piece of any length is drawn as a run of 4 m
// modules; gates swing open for their own side, portcullises lift; hits shake a piece; burning
// timber glows and stays charred; fallen pieces leave rubble. Blueprints (builds placed mid-war,
// not yet raised by builders) show as pale ghosts that grow with the work done, and pennants fly
// in the owner's colours, so a captured castle visibly changes hands.
import * as THREE from '../../vendor/three.module.js';
import { STRUCT_GEO, createTrenchDressing } from './structureMeshes.js';
import { forNear } from '../sim/combat.js';
import { teamHex } from './unitMeshes.js';
import { makeProp } from './props.js';

const MOD = { palisade: 4, stakes: 4, stoneWall: 4, gate: 4, stoneGate: 6 };

export function createStructureInstancer(scene, world) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 });
  const G = STRUCT_GEO;
  const geos = { palisade: G.palisadeGeo(), stakes: G.stakesGeo(), stoneWall: G.stoneWallGeo(), gate: G.gateGeo(), door: G.doorGeo(), tower: G.towerGeo(), stoneGate: G.stoneGateGeo(), portcullis: G.portcullisGeo(), stoneTower: G.stoneTowerGeo(), caltrops: G.caltropsGeo(), rubbleS: G.rubbleGeo(true), rubbleW: G.rubbleGeo(false),
    stairsW: G.stairsGeo(true), stairsS: G.stairsGeo(false), scaffold: G.scaffoldGeo(), timberKeep: G.timberKeepGeo() };
  // the stone keep of a castle founded mid-war: the same keep as the generated castles (props.js)
  { const k = makeProp({ type: 'keep', pos: [0, 0], small: true }, {}, { height: () => 0.1 }); k.updateMatrix(); geos.stoneKeep = k.geometry.clone().applyMatrix4(new THREE.Matrix4().makeScale(0.72, 0.72, 0.72)); }
  const pools = {};
  const mk = (key, geo, cap, material = mat, shadow = true) => {
    const im = new THREE.InstancedMesh(geo, material, cap);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.setColorAt(0, new THREE.Color(1, 1, 1));
    im.instanceColor.setUsage(THREE.DynamicDrawUsage);
    im.castShadow = shadow; im.receiveShadow = true; im.frustumCulled = false; im.count = 0;
    scene.add(im);
    pools[key] = { im, cap, n: 0, geo, material, shadow };
    return pools[key];
  };
  const CAP = { stoneWall: 1600, palisade: 1600, door: 200, scaffold: 40, timberKeep: 40, stoneKeep: 40, stairsW: 200, stairsS: 200 };
  for (const k in geos) mk(k, geos[k], CAP[k] || 400);
  // pennants: a little flag plane, coloured per instance
  const penGeo = new THREE.PlaneGeometry(1.1, 0.5, 6, 1); penGeo.translate(0.55, 0, 0);
  mk('pennant', penGeo, 400, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.8 }), false);
  // ghosts for blueprints
  const ghostMat = new THREE.MeshStandardMaterial({ color: 0xbfd8ff, transparent: true, opacity: 0.38, depthWrite: false, roughness: 0.6, emissive: 0x1a3a6a, emissiveIntensity: 0.6 });
  const ghosts = {};
  for (const k of ['palisade', 'stakes', 'stoneWall', 'gate', 'tower', 'stoneGate', 'stoneTower', 'caltrops', 'stairsW', 'stairsS', 'timberKeep', 'stoneKeep']) {
    const im = new THREE.InstancedMesh(geos[k], ghostMat, 300); im.frustumCulled = false; im.count = 0; im.renderOrder = 4; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(im); ghosts[k] = { im, n: 0, cap: 300 };
  }
  const pegGeo = new THREE.BoxGeometry(0.12, 1.0, 0.12); pegGeo.translate(0, 0.5, 0);
  const pegs = new THREE.InstancedMesh(pegGeo, new THREE.MeshStandardMaterial({ color: 0xe8d8a8, emissive: 0x332a10 }), 2000);
  pegs.frustumCulled = false; pegs.count = 0; pegs.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(pegs);
  let pegN = 0;

  // far away a wall is a plain block, a tower a plain block with a roof (one draw call each)
  const lowBox = new THREE.BoxGeometry(1, 1, 1); lowBox.translate(0, 0.5, 0);
  const colGeo = (g, hex) => { const c = new THREE.Color(hex).convertSRGBToLinear(), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
  mk('lowStone', colGeo(lowBox.clone(), 0xa9a191), 3000, mat, false);
  mk('lowWood', colGeo(lowBox.clone(), 0x7a5a3a), 3000, mat, false);
  const frustum = new THREE.Frustum(), pmx = new THREE.Matrix4();
  const dress = createTrenchDressing(scene, world, mat);
  const state = new Map();     // id -> { shake, lastHit, burnt, open }
  const rubble = [];           // { type, m: Float32Array(16) }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
  const WHITE = new THREE.Color(1, 1, 1), BURN = new THREE.Color(1.35, 0.55, 0.3), CHAR = new THREE.Color(0.42, 0.36, 0.33);
  const teamCol = (t) => new THREE.Color(teamHex(t).main);
  const push = (key, mtx, c) => { const P = pools[key]; if (!P || P.n >= P.cap) return; P.im.setMatrixAt(P.n, mtx); P.im.setColorAt(P.n, c || WHITE); P.n++; };
  const pushG = (key, mtx) => { const P = ghosts[key]; if (!P || P.n >= P.cap) return; P.im.setMatrixAt(P.n++, mtx); };
  let sv = -1, tv = -1;
  const known = new Set();
  function update(dt, t, digging, heightAt, camera) {
    let cam = null;
    if (camera) { camera.updateMatrixWorld(); pmx.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(pmx); cam = camera.position; }
    const sphere = new THREE.Sphere();
    if (world.terrain.version !== tv && !digging) { tv = world.terrain.version; dress.dressTrenches(heightAt); }
    // fallen pieces become rubble (once)
    if (world.structVersion !== sv) {
      sv = world.structVersion;
      for (const s of world.structures.values()) {
        if (s.alive) { known.add(s.id); continue; }
        if (!known.has(s.id)) continue;
        known.delete(s.id);
        if (s.kind === 'caltrops' || s.kind === 'obstacle' || world.phase === 'prepare') continue;
        if (s.kind === 'tower') { e.set(0, 0, 0); q.setFromEuler(e); m4.compose(v.set(s.pos[0], s.base, s.pos[1]), q, sc.set(1.4, 1.6, 2.2)); }
        else { const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1]; e.set(0, Math.atan2(-dz, dx), 0); q.setFromEuler(e); m4.compose(v.set((s.a[0] + s.b[0]) / 2, s.base, (s.a[1] + s.b[1]) / 2), q, sc.set(Math.hypot(dx, dz) / 4, s.wood ? 1 : 1.2, s.wood ? 1 : 1.3)); }
        rubble.push({ key: s.wood ? 'rubbleW' : 'rubbleS', m: m4.toArray(new Float32Array(16)) });
      }
    }
    for (const k in pools) pools[k].n = 0;
    for (const k in ghosts) ghosts[k].n = 0;
    pegN = 0;
    for (const s of world.structures.values()) {
      if (!s.alive) continue;
      let st = state.get(s.id);
      if (!st) { st = { shake: 0, lastHit: s.hitT, burnt: false, open: 0, rise: s.raisedT ? 0 : 1 }; state.set(s.id, st); }
      // cull, and pick the cheap block far away
      let far = false;
      if (cam) {
        const cx = s.pos ? s.pos[0] : (s.a[0] + s.b[0]) / 2, cz = s.pos ? s.pos[1] : (s.a[1] + s.b[1]) / 2;
        const rad = s.pos ? 8 : Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) / 2 + 4;
        sphere.center.set(cx, s.base + (s.height || 4) / 2, cz); sphere.radius = rad + (s.height || 4);
        if (!frustum.intersectsSphere(sphere)) continue;
        const d = sphere.center.distanceTo(cam);
        if (d > 3000) continue;
        far = d > 420;
      }
      if (far && s.kind !== 'caltrops') {
        if (s.kind === 'tower' || s.kind === 'keep') { m4.compose(v.set(s.pos[0], s.base, s.pos[1]), q.identity(), sc.set(s.kind === 'keep' ? s.size * 0.7 : s.size, s.height + 1.5, s.kind === 'keep' ? s.size * 0.7 : s.size)); push(s.wood ? 'lowWood' : 'lowStone', m4, s.burning > 0 ? BURN : WHITE); continue; }
        if (s.kind === 'stairs') continue;
        if (s.kind === 'obstacle') continue;
        const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], L = Math.hypot(dx, dz) || 1;
        e.set(0, Math.atan2(-dz, dx), 0); q.setFromEuler(e);
        m4.compose(v.set((s.a[0] + s.b[0]) / 2, s.base, (s.a[1] + s.b[1]) / 2), q, sc.set(L, s.height + (s.kind === 'gate' ? 1 : 0.6), s.thick || 0.7));
        push(s.wood ? 'lowWood' : 'lowStone', m4, s.burning > 0 ? BURN : WHITE);
        continue;
      }
      if (s.hitT !== st.lastHit) { st.lastHit = s.hitT; st.shake = 0.25; }
      if (st.shake > 0) st.shake -= dt;
      if (st.rise < 1) st.rise = Math.min(1, st.rise + dt * 1.5);
      const jit = st.shake > 0 ? Math.sin(t * 70) * 0.05 * st.shake * 4 : 0;
      if (s.burning > 0) st.burnt = true;
      const c = s.burning > 0 ? col.copy(BURN).multiplyScalar(0.85 + Math.sin(t * 13 + s.base) * 0.15) : st.burnt ? CHAR : WHITE;
      const riseY = 0.2 + 0.8 * (1 - Math.pow(1 - st.rise, 3));
      if (s.kind === 'tower') {
        e.set(0, 0, 0); q.setFromEuler(e);
        m4.compose(v.set(s.pos[0] + jit, s.base, s.pos[1]), q, sc.set(1, riseY, 1));
        push(s.type === 'stoneTower' ? 'stoneTower' : 'tower', m4, c);
        e.set(0, Math.sin(t * 2 + s.base) * 0.4, 0); q.setFromEuler(e);
        m4.compose(v.set(s.pos[0], s.base + (s.height + (s.type === 'stoneTower' ? 3.2 : 6.2)) * riseY, s.pos[1]), q, sc.set(1, 1, 1));
        push('pennant', m4, teamCol(s.team));
        continue;
      }
      if (s.kind === 'keep') {
        e.set(0, s.rot || 0, 0); q.setFromEuler(e);
        m4.compose(v.set(s.pos[0] + jit, s.base - 0.4, s.pos[1]), q, sc.set(1, riseY, 1));
        push(s.type === 'outpost' ? 'timberKeep' : 'stoneKeep', m4, c);
        e.set(0, Math.sin(t * 2 + s.base) * 0.4, 0); q.setFromEuler(e);
        m4.compose(v.set(s.pos[0], s.base + (s.type === 'outpost' ? 16.2 : 25.5) * riseY, s.pos[1]), q, sc.set(2, 2, 2));
        push('pennant', m4, teamCol(s.team));
        continue;
      }
      if (s.kind === 'stairs') {
        const r = s.rot || 0, hs = (s.height || 3.5) / 6;
        e.set(0, r + Math.PI, 0); q.setFromEuler(e);
        m4.compose(v.set(s.pos[0] - Math.sin(r) * 1.4, s.base - 0.05, s.pos[1] - Math.cos(r) * 1.4), q, sc.set(1, hs * riseY, Math.max(0.6, hs)));
        push(s.wood ? 'stairsW' : 'stairsS', m4, c);
        continue;
      }
      if (s.kind === 'caltrops') { e.set(0, 0, 0); q.setFromEuler(e); m4.compose(v.set(s.pos[0], s.base, s.pos[1]), q, sc.set(1, 1, 1)); push('caltrops', m4, c); continue; }
      const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], L = Math.hypot(dx, dz) || 1;
      const ang = Math.atan2(-dz, dx);
      // braces face home (inward), as in the v1 renderer
      const flip = s.inward ? (s.inward[0] * (-dz / L) + s.inward[1] * (dx / L) > 0 ? Math.PI : 0) : ((s.team === 0 ? -1 : 1) * (-dx) < 0 ? Math.PI : 0);
      const dmg = 1 - s.hp / s.maxHp;
      const lean = s.wood && dmg > 0.4 ? (dmg - 0.4) * 0.25 : 0;
      if (s.kind === 'gate') {
        const mx = (s.a[0] + s.b[0]) / 2, mz = (s.a[1] + s.b[1]) / 2;
        // open when friends are near
        let near = false;
        if (world.hash) forNear(world, mx, mz, 7, (so) => { if (!near && so.alive && so.sq.team === s.team && (so.x - mx) ** 2 + (so.z - mz) ** 2 < 42) near = true; });
        st.open += ((near ? 1 : 0) - st.open) * Math.min(1, dt * 3);
        e.set(0, ang + flip, 0); q.setFromEuler(e);
        const base = new THREE.Matrix4().compose(v.set(mx + jit, s.base, mz), q, sc.set(L / MOD[s.type], riseY, 1));
        push(s.type, base, c);
        if (s.type === 'gate') {
          for (const [ox, sx, a] of [[-1.95, 1, 1.5], [1.95, -1, -1.5]]) {
            m4.copy(base).multiply(new THREE.Matrix4().compose(v.set(ox, 0, 0), q.setFromEuler(e.set(0, st.open * a, 0)), sc.set(sx, 1, 1)));
            push('door', m4, c);
          }
          m4.copy(base).multiply(new THREE.Matrix4().makeTranslation(0, 5.5, 0)); push('pennant', m4, teamCol(s.team));
        } else {
          m4.copy(base).multiply(new THREE.Matrix4().makeTranslation(0, st.open * 3.9, 0)); push('portcullis', m4, c);
          m4.copy(base).multiply(new THREE.Matrix4().compose(v.set(2.4, 9.8, 0), q.identity(), sc.set(1.4, 1.4, 1.4))); push('pennant', m4, teamCol(s.team));
        }
        continue;
      }
      // a run of modules along the piece
      const key = s.type === 'stakes' ? 'stakes' : s.type === 'stoneWall' ? 'stoneWall' : 'palisade';
      const mod = MOD[key];
      const n = Math.max(1, Math.round(L / mod));
      const sx = L / (n * mod);
      e.set(lean, ang + flip, 0, 'YXZ'); q.setFromEuler(e);
      for (let k = 0; k < n; k++) {
        const u = (k + 0.5) / n;
        m4.compose(v.set(s.a[0] + dx * u + jit, s.base, s.a[1] + dz * u), q, sc.set(sx, riseY, 1));
        push(key, m4, c);
      }
    }
    for (const r of rubble) { m4.fromArray(r.m); push(r.key, m4, WHITE); }
    // blueprints: ghosts that grow with the work done
    if (world.blueprints) for (const bp of world.blueprints.values()) {
      const k = Math.max(0.08, Math.min(1, bp.wp / bp.need));
      if (bp.pts) {
        for (let i = 0; i < bp.pts.length && pegN < 2000; i++) {
          const p = bp.pts[i];
          m4.compose(v.set(p[0], heightAt ? heightAt(p[0], p[1]) : 0, p[1]), q.identity(), sc.set(1, 0.6 + (1 - k) * 0.6, 1));
          pegs.setMatrixAt(pegN++, m4);
        }
        continue;
      }
      if (bp.at) {
        const y = heightAt ? heightAt(bp.at[0], bp.at[1]) : 0;
        m4.compose(v.set(bp.at[0], y, bp.at[1]), q.identity(), sc.set(1, k, 1));
        if (bp.type === 'outpost' || bp.type === 'castleKeep') {
          // scaffolding rises around a ghost of the finished keep
          const sz = bp.type === 'outpost' ? 9 : 15, hh = bp.type === 'outpost' ? 13 : 22;
          e.set(0, bp.rot || 0, 0); q.setFromEuler(e);
          m4.compose(v.set(bp.at[0], y, bp.at[1]), q, sc.set(1, Math.max(0.15, k), 1));
          pushG(bp.type === 'outpost' ? 'timberKeep' : 'stoneKeep', m4);
          m4.compose(v.set(bp.at[0], y + (bp.type === 'outpost' ? 1.8 : 0), bp.at[1]), q, sc.set(sz, hh * Math.min(1, k + 0.12), sz));
          push('scaffold', m4, WHITE);
          continue;
        }
        if (bp.type === 'stairs') {
          const w2 = world.structures.get(bp.wallId), hs = (w2 ? w2.height : 3.5) / 6, r = bp.rot || 0;
          e.set(0, r + Math.PI, 0); q.setFromEuler(e);
          m4.compose(v.set(bp.at[0] - Math.sin(r) * 1.4, y, bp.at[1] - Math.cos(r) * 1.4), q, sc.set(1, hs * k, Math.max(0.6, hs)));
          pushG(w2 && !w2.wood ? 'stairsS' : 'stairsW', m4);
          continue;
        }
        pushG(bp.type === 'stoneTower' ? 'stoneTower' : bp.type === 'caltrops' ? 'caltrops' : 'tower', m4);
        continue;
      }
      const dx = bp.b[0] - bp.a[0], dz = bp.b[1] - bp.a[1], L = Math.hypot(dx, dz) || 1;
      const y = heightAt ? Math.min(heightAt(bp.a[0], bp.a[1]), heightAt(bp.b[0], bp.b[1])) : 0;
      e.set(0, Math.atan2(-dz, dx), 0); q.setFromEuler(e);
      const key = bp.type === 'stoneWall' ? 'stoneWall' : bp.type === 'stakes' ? 'stakes' : bp.type === 'gate' ? 'gate' : bp.type === 'stoneGate' ? 'stoneGate' : 'palisade';
      m4.compose(v.set((bp.a[0] + bp.b[0]) / 2, y, (bp.a[1] + bp.b[1]) / 2), q, sc.set(L / (MOD[key] || 4), k, 1));
      pushG(key, m4);
      for (const p of [bp.a, bp.b]) if (pegN < 2000) { m4.compose(v.set(p[0], heightAt ? heightAt(p[0], p[1]) : 0, p[1]), q.identity(), sc.set(1, 1.4, 1)); pegs.setMatrixAt(pegN++, m4); }
    }
    for (const k in pools) { const P = pools[k]; P.im.count = P.n; P.im.visible = P.n > 0; P.im.instanceMatrix.needsUpdate = true; if (P.im.instanceColor) P.im.instanceColor.needsUpdate = true; }
    for (const k in ghosts) { const P = ghosts[k]; P.im.count = P.n; P.im.visible = P.n > 0; P.im.instanceMatrix.needsUpdate = true; }
    pegs.count = pegN; pegs.visible = pegN > 0; pegs.instanceMatrix.needsUpdate = true;
  }
  return { update, pools, dressTrenches: dress.dressTrenches, counts: dress.counts, meshes: new Map() };
}
