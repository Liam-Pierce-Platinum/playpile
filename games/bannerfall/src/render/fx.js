// BANNERFALL :: render/fx.js - arrows in flight with trails, arrows stuck in the ground,
// hit sparks, shield tinks, dust, dirt sprays from digging, healing motes, rally rings, debris.
// No blood: hits are star flashes and dust.
import * as THREE from '../../vendor/three.module.js';
import { part, merge, cyl, cone, box, rbox } from './geo.js';

const MAXP = 2600;

function particleMesh(scene, additive) {
  const g = new THREE.PlaneGeometry(1, 1);
  const col = new THREE.InstancedBufferAttribute(new Float32Array(MAXP * 4), 4);
  const siz = new THREE.InstancedBufferAttribute(new Float32Array(MAXP * 2), 2);
  col.setUsage(THREE.DynamicDrawUsage); siz.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('aCol', col); g.setAttribute('aSize', siz);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: false, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
    vertexShader: `
      attribute vec4 aCol; attribute vec2 aSize; varying vec4 vCol; varying vec2 vUv; varying float vKind;
      #include <fog_pars_vertex>
      void main(){
        vCol = aCol; vUv = position.xy; vKind = aSize.y;
        vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        vec4 mvPosition = viewMatrix * vec4(ip, 1.0);
        mvPosition.xy += position.xy * aSize.x;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      varying vec4 vCol; varying vec2 vUv; varying float vKind;
      #include <common>
      #include <fog_pars_fragment>
      void main(){
        float d = length(vUv) * 2.0;
        float a;
        if (vKind > 1.5) { // star flash
          float ang = atan(vUv.y, vUv.x);
          float star = pow(abs(cos(ang * 2.0)), 18.0) * (1.0 - d) + (1.0 - smoothstep(0.0, 0.45, d));
          a = clamp(star, 0.0, 1.0);
        } else if (vKind > 0.5) { a = 1.0 - smoothstep(0.55, 1.0, d); }   // solid clod
        else a = (1.0 - smoothstep(0.1, 1.0, d)) * 0.85;                 // soft puff
        gl_FragColor = vec4(vCol.rgb, vCol.a * a);
        #include <fog_fragment>
      }`,
  });
  const im = new THREE.InstancedMesh(g, mat, MAXP);
  im.frustumCulled = false; im.count = 0; im.renderOrder = additive ? 6 : 5;
  scene.add(im);
  return { im, col, siz };
}

export function createFX(scene, world, opts = {}) {
  const soft = particleMesh(scene, false), glow = particleMesh(scene, true);
  const P = [];   // {x,y,z,vx,vy,vz,life,max,size,grow,r,g,b,a,add,kind,grav,drag}
  const spawn = (o) => { if (P.length < MAXP * 2 - 10) P.push(o); };
  const rnd = Math.random;

  // ---- arrows
  const arrowGeo = merge([
    part(cyl(0.012, 0.012, 0.78, 5), 0xd8c9a0, { rot: [Math.PI / 2, 0, 0] }),
    part(cone(0.025, 0.09, 5), 0x8a8f96, { pos: [0, 0, 0.43], rot: [Math.PI / 2, 0, 0] }),
    part(box(0.002, 0.06, 0.14), 0xf3efe6, { pos: [0, 0.02, -0.34] }),
    part(box(0.06, 0.002, 0.14), 0xf3efe6, { pos: [0, 0, -0.34] }),
  ]);
  const boltGeo = merge([
    part(cyl(0.018, 0.018, 0.42, 5), 0x6a4b30, { rot: [Math.PI / 2, 0, 0] }),
    part(cone(0.035, 0.08, 4), 0x7c8288, { pos: [0, 0, 0.24], rot: [Math.PI / 2, 0, 0] }),
    part(box(0.07, 0.003, 0.08), 0x5a3a24, { pos: [0, 0, -0.18] }),
  ]);
  const amat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
  const arrows = new THREE.InstancedMesh(arrowGeo, amat, 1600); arrows.count = 0; arrows.frustumCulled = false; arrows.castShadow = true;
  const bolts = new THREE.InstancedMesh(boltGeo, amat, 600); bolts.count = 0; bolts.frustumCulled = false; bolts.castShadow = true;
  scene.add(arrows, bolts);
  // trails: a tapered additive streak behind each arrow
  const trailGeo = new THREE.CylinderGeometry(0.0, 0.035, 2.4, 4, 1, true);
  trailGeo.rotateX(Math.PI / 2); trailGeo.translate(0, 0, -1.3);
  const tcol = new Float32Array(trailGeo.attributes.position.count * 3);
  for (let i = 0; i < trailGeo.attributes.position.count; i++) { const k = 1 + trailGeo.attributes.position.getZ(i) / 2.5; tcol[i * 3] = tcol[i * 3 + 1] = tcol[i * 3 + 2] = Math.max(0, k) * 0.55; }
  trailGeo.setAttribute('color', new THREE.BufferAttribute(tcol, 3));
  const trailMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xfff1d6, toneMapped: false });
  const trails = new THREE.InstancedMesh(trailGeo, trailMat, 1600); trails.count = 0; trails.frustumCulled = false; trails.renderOrder = 6;
  scene.add(trails);
  // stuck arrows
  const stuck = new THREE.InstancedMesh(arrowGeo, amat, 900); stuck.count = 0; stuck.frustumCulled = false; stuck.castShadow = false;
  scene.add(stuck);
  const stuckList = [];
  // debris chunks
  const debGeo = rbox(0.5, 0.35, 0.9, 0.06);
  const debMat = new THREE.MeshStandardMaterial({ color: 0x7a5838, roughness: 0.9 });
  const debris = new THREE.InstancedMesh(debGeo, debMat, 200); debris.count = 0; debris.frustumCulled = false; debris.castShadow = true;
  scene.add(debris);
  const debList = [];
  // rally / sanctuary rings
  const rings = [];
  const ringGeo = new THREE.RingGeometry(0.9, 1.0, 64); ringGeo.rotateX(-Math.PI / 2);

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1), fwd = new THREE.Vector3(0, 0, 1), dir = new THREE.Vector3();
  const dustCol = [0.62, 0.52, 0.38], dirtCol = [0.4, 0.29, 0.19];

  function puff(x, y, z, n, size, col, opts2 = {}) {
    for (let i = 0; i < n; i++) spawn({ x: x + (rnd() - 0.5) * (opts2.spread || 0.6), y: y + rnd() * 0.3, z: z + (rnd() - 0.5) * (opts2.spread || 0.6), vx: (rnd() - 0.5) * (opts2.v || 1.5), vy: (opts2.up || 0.6) + rnd() * 0.8, vz: (rnd() - 0.5) * (opts2.v || 1.5), life: 0, max: (opts2.life || 1.4) * (0.7 + rnd() * 0.6), size: size * (0.7 + rnd() * 0.6), grow: opts2.grow ?? 1.4, r: col[0], g: col[1], b: col[2], a: opts2.a || 0.5, add: false, kind: 0, grav: -0.3, drag: 1.6 });
  }
  function sparks(x, y, z, n, col, opts2 = {}) {
    spawn({ x, y, z, vx: 0, vy: 0, vz: 0, life: 0, max: 0.12, size: opts2.flash || 0.9, grow: 0.5, r: col[0] * 2, g: col[1] * 2, b: col[2] * 2, a: 1, add: true, kind: 2, grav: 0, drag: 0 });
    for (let i = 0; i < n; i++) spawn({ x, y, z, vx: (rnd() - 0.5) * 6, vy: rnd() * 4 + 1, vz: (rnd() - 0.5) * 6, life: 0, max: 0.25 + rnd() * 0.2, size: 0.09, grow: -0.6, r: col[0] * 2.2, g: col[1] * 2.2, b: col[2] * 2, a: 1, add: true, kind: 1, grav: 12, drag: 0.5 });
  }
  function clods(x, y, z, n) {
    for (let i = 0; i < n; i++) spawn({ x, y, z, vx: (rnd() - 0.5) * 3, vy: 3 + rnd() * 4, vz: (rnd() - 0.5) * 3, life: 0, max: 0.9 + rnd() * 0.4, size: 0.12 + rnd() * 0.12, grow: 0, r: dirtCol[0] * (0.8 + rnd() * 0.4), g: dirtCol[1], b: dirtCol[2], a: 1, add: false, kind: 1, grav: 13, drag: 0.2 });
  }
  function ring(x, y, z, col, max, dur) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide }));
    m.position.set(x, y + 0.3, z); m.renderOrder = 7;
    scene.add(m);
    rings.push({ m, t: 0, max, dur });
  }
  const digQueue = [];

  function consume(events, heightAt) {
    for (const e of events) {
      switch (e.type) {
        case 'hit':
          if (e.melee) sparks(e.x, e.y, e.z, e.big ? 6 : 3, [1, 0.9, 0.6], { flash: e.big ? 1.4 : 0.8 });
          else puff(e.x, e.y - 0.3, e.z, 2, 0.4, dustCol, { life: 0.6, a: 0.4 });
          break;
        case 'tink': sparks(e.x, e.y, e.z, 5, [1, 0.95, 0.75], { flash: 0.5 }); break;
        case 'brace': sparks(e.x, e.y, e.z, 10, [1, 0.8, 0.4], { flash: 1.8 }); break;
        case 'charge': puff(e.x, e.y + 0.2, e.z, 8, 1.2, dustCol, { spread: 3, v: 3, life: 1.8, a: 0.55 }); break;
        case 'death': puff(e.x, e.y + 0.2, e.z, 4, 0.9, dustCol, { spread: 1, life: 1.2, a: 0.45 }); break;
        case 'stakeHit': sparks(e.x, 1, e.z, 6, [1, 0.8, 0.5], { flash: 1.2 }); break;
        case 'structHit': puff(e.x, e.y, e.z, 2, 0.5, [0.55, 0.45, 0.32], { life: 0.7 }); break;
        case 'splash': for (let i = 0; i < 5; i++) spawn({ x: e.x, y: e.y, z: e.z, vx: (rnd() - 0.5) * 1.5, vy: 2 + rnd() * 2, vz: (rnd() - 0.5) * 1.5, life: 0, max: 0.5, size: 0.12, grow: 0, r: 0.9, g: 0.95, b: 1, a: 0.9, add: false, kind: 1, grav: 10, drag: 0 }); break;
        case 'stick': {
          if (e.kind === 'bolt') break;
          const len = Math.hypot(e.vx, e.vy, e.vz) || 1;
          stuckList.push({ x: e.x, y: e.y, z: e.z, dx: e.vx / len, dy: e.vy / len, dz: e.vz / len, t: 0, wood: e.wood });
          if (stuckList.length > 900) stuckList.shift();
          if (!e.wood) puff(e.x, e.y, e.z, 1, 0.3, dustCol, { life: 0.5, a: 0.35, up: 0.3 });
          break;
        }
        case 'destroyed': {
          const cx = e.pos ? e.pos[0] : (e.a[0] + e.b[0]) / 2, cz = e.pos ? e.pos[1] : (e.a[1] + e.b[1]) / 2;
          const cy = heightAt ? heightAt(cx, cz) : 0;
          for (let i = 0; i < 9; i++) debList.push({ x: cx + (rnd() - 0.5) * 3, y: cy + 1 + rnd() * 2, z: cz + (rnd() - 0.5) * 2, vx: (rnd() - 0.5) * 6, vy: 3 + rnd() * 5, vz: (rnd() - 0.5) * 6, rx: rnd() * 6, ry: rnd() * 6, w: (rnd() - 0.5) * 8, t: 0 });
          puff(cx, cy + 1, cz, 12, 2.2, [0.6, 0.52, 0.42], { spread: 4, v: 3, life: 2.4, a: 0.55 });
          break;
        }
        case 'dig':
          for (const run of e.runs) for (let i = 0; i < run.length; i += 1) digQueue.push({ p: run[i], at: (i / run.length) * 1.8 });
          break;
        case 'ability':
          if (e.ability === 'rally') ring(e.x, heightAt ? heightAt(e.x, e.z) : 0, e.z, 0xffd36a, 30, 1.2);
          if (e.ability === 'sanctuary') ring(e.x, heightAt ? heightAt(e.x, e.z) : 0, e.z, 0xc8ff9a, 12, 0.9);
          if (e.ability === 'charge') puff(e.x, (heightAt ? heightAt(e.x, e.z) : 0) + 0.3, e.z, 10, 1.4, dustCol, { spread: 6, life: 1.6 });
          break;
        case 'rallied': break;
        case 'loot': {
          // a burst of gold: coins flash and float up from the place that paid (a pillaged village,
          // a raided treasury, a castle's vault)
          if (!e.gold || (!e.x && !e.z)) break;
          const y = heightAt ? heightAt(e.x, e.z) : 0;
          const n = Math.min(60, 12 + e.gold / 500);
          sparks(e.x, y + 3, e.z, 6, [1.0, 0.82, 0.3], { flash: 3 });
          for (let i = 0; i < n; i++) spawn({ x: e.x + (rnd() - 0.5) * 8, y: y + 1 + rnd() * 3, z: e.z + (rnd() - 0.5) * 8, vx: (rnd() - 0.5) * 2, vy: 4 + rnd() * 5, vz: (rnd() - 0.5) * 2, life: 0, max: 1.4 + rnd() * 0.8, size: 0.35 + rnd() * 0.25, grow: -0.4, r: 1.6, g: 1.2, b: 0.35, a: 1, add: true, kind: 2, grav: 3, drag: 0.6 });
          break;
        }
        case 'founded': {
          const y = heightAt ? heightAt(e.x, e.z) : 0;
          ring(e.x, y, e.z, 0xffd36a, 60, 2.2);
          puff(e.x, y + 1, e.z, 16, 3, [0.7, 0.62, 0.5], { spread: 14, v: 4, life: 2.6, a: 0.5 });
          break;
        }
        case 'docked': sparks(e.x, (heightAt ? heightAt(e.x, e.z) : 0) + 6, e.z, 14, [1, 0.8, 0.5], { flash: 2.4 }); break;
      }
    }
  }

  let digT = 0;
  function update(dt, t, alpha, cam, heightAt) {
    // dig time-lapse: dirt sprays march along the new trench
    if (digQueue.length) {
      digT += dt;
      for (let i = digQueue.length - 1; i >= 0; i--) {
        const d = digQueue[i];
        d.at -= dt;
        if (d.at <= 0) {
          const y = heightAt ? heightAt(d.p[0], d.p[1]) : 0;
          clods(d.p[0], y + 0.2, d.p[1], 3);
          if (rnd() < 0.5) puff(d.p[0], y + 0.3, d.p[1], 1, 1.0, dustCol, { life: 1.2, a: 0.4 });
          digQueue.splice(i, 1);
        }
      }
    }
    // ambient: dust at running feet, motes over the healed
    for (const so of world.soldiers) {
      if (!so.alive) continue;
      const cav = so.sq.def.tags.includes('cavalry');
      if (so.spd > (cav ? 4 : 3.5) && rnd() < dt * (cav ? 7 : 1.5)) puff(so.x, so.y + 0.1, so.z, 1, cav ? 1.3 : 0.6, dustCol, { life: 1.3, a: cav ? 0.4 : 0.28, up: 0.3 });
      if (world.t - so.healedT < 0.2 && rnd() < dt * 5) spawn({ x: so.x + (rnd() - 0.5) * 0.6, y: so.y + 0.6 + rnd() * 0.8, z: so.z + (rnd() - 0.5) * 0.6, vx: 0, vy: 0.9 + rnd() * 0.4, vz: 0, life: 0, max: 1.3, size: 0.16, grow: -0.05, r: 0.8, g: 1.2, b: 0.55, a: 0.9, add: true, kind: 0, grav: 0, drag: 0 });
      if (so.sq.type === 'healer' && so.act === 'heal' && rnd() < dt * 4) spawn({ x: so.x + (rnd() - 0.5) * 0.4, y: so.y + 1.7 + rnd() * 0.4, z: so.z + (rnd() - 0.5) * 0.4, vx: 0, vy: 0.6, vz: 0, life: 0, max: 1, size: 0.14, grow: 0, r: 1.3, g: 1.1, b: 0.5, a: 0.9, add: true, kind: 0, grav: 0, drag: 0 });
      if (so.burnT > world.t && rnd() < dt * 8) spawn({ x: so.x, y: so.y + 1.2, z: so.z, vx: 0, vy: 1.5, vz: 0, life: 0, max: 0.5, size: 0.3, grow: -0.3, r: 1.6, g: 0.7, b: 0.2, a: 1, add: true, kind: 0, grav: 0, drag: 0 });
    }
    // villages put to the torch and razed forts: a fire that dies down and a smoke column that lasts
    if (world.war && cam) {
      for (const st of world.war.settlements) {
        if (st.state !== 'ravaged' && st.state !== 'razed') continue;
        const dx = st.pos[0] - cam.position.x, dz = st.pos[1] - cam.position.z;
        if (dx * dx + dz * dz > 1600 * 1600) continue;
        const since = world.t - (st.burnT ?? world.t);
        const fire = Math.max(0, 1 - since / 150), smoke = Math.max(0.25, 1 - since / 480);
        const hs = st.houses && st.houses.length ? st.houses : [st.pos];
        for (let sm = dt * Math.min(18, 2 + hs.length * 1.5) * smoke; sm > 0; sm -= 1) { if (rnd() > sm) break;
          const h = hs[(rnd() * hs.length) | 0], hx = h.pos ? h.pos[0] : h[0], hz = h.pos ? h.pos[1] : h[1];
          const y = heightAt ? heightAt(hx, hz) : 0;
          spawn({ x: hx + (rnd() - 0.5) * 3, y: y + 3, z: hz + (rnd() - 0.5) * 3, vx: 0.6 + rnd() * 0.4, vy: 2.2 + rnd(), vz: (rnd() - 0.5) * 0.6, life: 0, max: 7 + rnd() * 4, size: 3 + rnd() * 2, grow: 3.5, r: 0.2, g: 0.18, b: 0.17, a: 0.5 * smoke, add: false, kind: 0, grav: -0.1, drag: 0.05 });
        }
        for (let fl = fire > 0 ? dt * Math.min(60, 8 + hs.length * 5) * fire : 0; fl > 0; fl -= 1) { if (rnd() > fl) break;
          const h = hs[(rnd() * hs.length) | 0], hx = h.pos ? h.pos[0] : h[0], hz = h.pos ? h.pos[1] : h[1];
          const y = heightAt ? heightAt(hx, hz) : 0;
          spawn({ x: hx + (rnd() - 0.5) * 4, y: y + 1 + rnd() * 3, z: hz + (rnd() - 0.5) * 4, vx: 0, vy: 2.5 + rnd() * 2, vz: 0, life: 0, max: 0.7 + rnd() * 0.5, size: 1.4 + rnd(), grow: -0.5, r: 1.7, g: 0.75, b: 0.22, a: 0.9 * fire, add: true, kind: 0, grav: 0, drag: 0 });
        }
      }
      // builders at work: dust, chips and the odd spark from a chisel
      for (const sq of world.squads.values()) {
        if (!sq.building || sq.alive <= 0) continue;
        const so = sq.soldiers[(rnd() * sq.soldiers.length) | 0];
        if (!so || !so.alive || rnd() > dt * 10) continue;
        const ddx = so.x - cam.position.x, ddz = so.z - cam.position.z;
        if (ddx * ddx + ddz * ddz > 500 * 500) continue;
        if (rnd() < 0.5) clods(so.x, so.y + 0.6, so.z, 2); else puff(so.x, so.y + 0.4, so.z, 1, 0.9, dustCol, { life: 1.1, a: 0.35 });
        if (rnd() < 0.2) sparks(so.x, so.y + 1.0, so.z, 3, [1, 0.85, 0.6], { flash: 0.4 });
      }
    }
    // simulate particles
    let ns = 0, ng = 0;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.life += dt;
      if (p.life >= p.max) { P[i] = P[P.length - 1]; P.pop(); continue; }
      p.vy -= p.grav * dt;
      const dr = Math.max(0, 1 - p.drag * dt);
      p.vx *= dr; p.vz *= dr; if (p.drag) p.vy *= dr;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.kind === 1 && heightAt) { const gy = heightAt(p.x, p.z); if (p.y < gy) { p.y = gy; p.vy *= -0.2; p.vx *= 0.5; p.vz *= 0.5; } }
      const k = p.life / p.max;
      const size = Math.max(0.01, p.size * (1 + p.grow * k));
      const a = p.a * (p.kind === 2 ? 1 - k : k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85);
      const M = p.add ? glow : soft;
      const idx = p.add ? ng++ : ns++;
      if (idx >= MAXP) continue;
      m4.makeTranslation(p.x, p.y, p.z);
      M.im.setMatrixAt(idx, m4);
      M.col.setXYZW(idx, p.r, p.g, p.b, a);
      M.siz.setXY(idx, size, p.kind);
    }
    for (const [M, n] of [[soft, ns], [glow, ng]]) {
      M.im.count = Math.min(MAXP, n);
      M.im.instanceMatrix.needsUpdate = true; M.col.needsUpdate = true; M.siz.needsUpdate = true;
    }
    // projectiles
    let na = 0, nb = 0;
    for (const pr of world.projectiles) {
      if (!pr.alive) continue;
      const px = pr.x - pr.vx * (1 - alpha) * 0.05, py = pr.y - pr.vy * (1 - alpha) * 0.05, pz = pr.z - pr.vz * (1 - alpha) * 0.05;
      dir.set(pr.vx, pr.vy, pr.vz).normalize();
      q.setFromUnitVectors(fwd, dir);
      v.set(px, py, pz);
      m4.compose(v, q, s.set(1, 1, 1));
      if (pr.kind === 'bolt') { if (nb < 600) bolts.setMatrixAt(nb++, m4); }
      else if (na < 1600) {
        arrows.setMatrixAt(na, m4);
        const tl = Math.min(1, pr.age * 3);
        m4.compose(v, q, s.set(1, 1, tl));
        trails.setMatrixAt(na, m4);
        na++;
      }
    }
    arrows.count = na; trails.count = na; bolts.count = nb;
    arrows.instanceMatrix.needsUpdate = true; trails.instanceMatrix.needsUpdate = true; bolts.instanceMatrix.needsUpdate = true;
    // stuck arrows, fade by sinking after 8 s
    let nk = 0;
    for (let i = stuckList.length - 1; i >= 0; i--) {
      const a = stuckList[i];
      a.t += dt;
      if (a.t > 9) { stuckList.splice(i, 1); continue; }
      dir.set(a.dx, a.dy, a.dz);
      q.setFromUnitVectors(fwd, dir);
      const sink = a.t > 8 ? (a.t - 8) * 0.6 : 0;
      v.set(a.x - a.dx * (0.18 + sink), a.y - a.dy * (0.18 + sink), a.z - a.dz * (0.18 + sink));
      m4.compose(v, q, s.set(1, 1, 1));
      if (nk < 900) stuck.setMatrixAt(nk++, m4);
    }
    stuck.count = nk; stuck.instanceMatrix.needsUpdate = true;
    // debris
    let nd = 0;
    for (let i = debList.length - 1; i >= 0; i--) {
      const d = debList[i];
      d.t += dt;
      if (d.t > 7) { debList.splice(i, 1); continue; }
      d.vy -= 14 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt; d.rx += d.w * dt;
      const gy = heightAt ? heightAt(d.x, d.z) + 0.15 : 0;
      if (d.y < gy) { d.y = gy; d.vy *= -0.25; d.vx *= 0.6; d.vz *= 0.6; d.w *= 0.5; }
      q.setFromEuler(new THREE.Euler(d.rx, d.ry, 0));
      m4.compose(v.set(d.x, d.y - (d.t > 6 ? (d.t - 6) * 0.6 : 0), d.z), q, s.set(1, 1, 1));
      if (nd < 200) debris.setMatrixAt(nd++, m4);
    }
    debris.count = nd; debris.instanceMatrix.needsUpdate = true;
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.t += dt;
      const k = r.t / r.dur;
      if (k >= 1) { scene.remove(r.m); r.m.material.dispose(); rings.splice(i, 1); continue; }
      const sc = 1 + (r.max - 1) * (1 - Math.pow(1 - k, 3));
      r.m.scale.set(sc, 1, sc);
      r.m.material.opacity = (1 - k) * 0.9;
    }
  }
  return { consume, update, puff, sparks };
}
