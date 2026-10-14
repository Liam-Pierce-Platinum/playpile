// Street lamps (with their spot lights, halos and light shafts), wall lanterns, parked cars,
// hydrants, trash bags, AC units and dumpsters: everything static that comes from a model.
// Flickering and dead lamps live here too, because a dark stretch of street is a game decision.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SOLID, VAULT } from './collide.js';
import * as TX from './textures.js';

const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

function underNamed(o, root, test) { for (let p = o; p && p !== root; p = p.parent) if (test(p.name || '')) return true; return false; }
export function instance(scene, root, placements, { filter = () => true, offset = null, wet = 0.7, shadow = true } = {}) {
  if (!placements.length) return [];
  root.updateMatrixWorld(true);
  if (!offset) {
    const bb = new THREE.Box3();
    root.traverse(o => { if (o.isMesh && (underNamed(o, root, filter) || filter(o.name || ''))) bb.expandByObject(o); });
    offset = new THREE.Vector3(0, bb.isEmpty() ? 0 : bb.min.y, 0);
  }
  const pre = new THREE.Matrix4().makeTranslation(-offset.x, -offset.y, -offset.z);
  const made = [];
  // one instanced mesh per 64 m chunk so the far plane and the frustum can cull them
  const chunks = new Map();
  for (const p of placements) { const k = Math.floor(p.pos.x / 64) + ':' + Math.floor(p.pos.z / 64); if (!chunks.has(k)) chunks.set(k, []); chunks.get(k).push(p); }
  root.traverse(o => {
    if (!o.isMesh || !underNamed(o, root, filter) && !filter(o.name || '')) return;
    const mat = o.material.clone();
    if (mat.roughness !== undefined) mat.roughness = Math.min(mat.roughness, 1) * wet;
    for (const list of chunks.values()) {
      const im = new THREE.InstancedMesh(o.geometry, mat, list.length);
      list.forEach((p, i) => {
        _q.setFromAxisAngle(_up, p.rot || 0);
        _m.compose(p.pos, _q, _s.setScalar(p.scale || 1));
        _m2.multiplyMatrices(_m, pre).multiply(o.matrixWorld);
        im.setMatrixAt(i, _m2);
      });
      im.castShadow = shadow; im.receiveShadow = true;
      im.computeBoundingSphere();
      im.matrixAutoUpdate = false;
      scene.add(im);
      made.push(im);
    }
  });
  return made;
}

function shaftMaterial(color, strength) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uStrength: { value: strength }, uTime: { value: 0 } },
    vertexShader: /* glsl */`
      varying vec3 vN, vV; varying float vH; varying vec3 vW;
      void main(){
        vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz;
        vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - w.xyz);
        vH = uv.y;
        gl_Position = projectionMatrix*viewMatrix*w;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uStrength, uTime;
      varying vec3 vN, vV; varying float vH; varying vec3 vW;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
      float n3(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
      void main(){
        float facing = abs(dot(normalize(vN), normalize(vV)));
        float a = pow(facing, 2.5) * pow(vH, 1.6);
        float mist = 0.6 + 0.4*n3(vW*1.3 + vec3(0.0, -uTime*1.5, uTime*0.3));
        float d = length(cameraPosition - vW);
        a *= mist * uStrength * smoothstep(0.5, 3.0, d);
        gl_FragColor = vec4(uColor*a, 1.0);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
}

// lamp flicker: 0 steady, 1 failing (buzz, drop-outs), 2 dead
export function flicker(v, t) {
  if (!v.flick) return 1;
  if (v.flick === 2) return 0;
  const k = Math.floor(t * 14 + v.seed * 7), h = Math.abs(Math.sin(k * 12.9898 + v.seed * 78.233) * 43758.5453) % 1;
  const slow = Math.sin(t * 0.35 + v.seed) > 0.55 ? 0.05 : 1;   // long dark spells
  const buzz = 0.9 + 0.1 * Math.sin(t * 120 + v.seed);
  return (h < 0.1 ? 0.04 : h < 0.2 ? 0.45 : 1) * slow * buzz;
}

export function placeFurniture(scene, W, P, glows, contact) {
  const S = W.statics;
  const out = { lampVirtuals: [], flickers: [], shafts: [], update: () => {} };

  // ---------- street lamps ----------
  const lampRoot = P.street_lamp_01.scene;
  lampRoot.traverse(o => {
    if (!o.isMesh) return;
    const n = o.material.name || '';
    if (n.includes('bulb')) { o.material = o.material.clone(); o.material.emissive = new THREE.Color(1, 0.68, 0.36); o.material.emissiveIntensity = 18; }
    else if (n.includes('glass')) o.material = new THREE.MeshStandardMaterial({ color: 0x302820, emissive: new THREE.Color(1, 0.66, 0.34), emissiveIntensity: 2.2, roughness: 0.15, transparent: true, opacity: 0.55, depthWrite: false });
  });
  const bulbBox = new THREE.Box3();
  lampRoot.updateMatrixWorld(true);
  lampRoot.traverse(o => { if (o.isMesh && (o.material.name || '').includes('bulb')) bulbBox.expandByObject(o); });
  const bulbLocal = bulbBox.isEmpty() ? new THREE.Vector3(0, 3.5, 0) : bulbBox.getCenter(new THREE.Vector3());
  const LS = 1.25;
  const armAng = Math.atan2(bulbLocal.x, bulbLocal.z);
  const live = W.lampSpots.filter(l => l.flick !== 2), dead = W.lampSpots.filter(l => l.flick === 2);
  const toPl = (l) => ({ pos: l.pos, rot: Math.atan2(l.dir.x, l.dir.z) - armAng, scale: LS });
  instance(scene, lampRoot, W.lampSpots.map(toPl), { wet: 0.6 });
  const warm = new THREE.Color(1.0, 0.68, 0.38);
  const coneGeo = new THREE.CylinderGeometry(0.12, 2.4, 1, 20, 1, true);
  const shaftGeos = [];
  for (const l of W.lampSpots) {
    const pl = toPl(l);
    const bulb = bulbLocal.clone().multiplyScalar(LS).applyAxisAngle(_up, pl.rot).add(l.pos);
    l.bulb = bulb;
    if (l.flick === 2) continue;
    const v = { pos: bulb.clone().add(new THREE.Vector3(0, -0.15, 0)), target: new THREE.Vector3(bulb.x, 0, bulb.z), color: warm, intensity: 210, flick: l.flick, seed: l.seed, priority: 1 };
    out.lampVirtuals.push(v);
    const g1 = glows.add(bulb, warm, 1.5, 0.7), g2 = glows.add(bulb, warm, 0.35, 3);
    const ls = { pos: bulb, color: warm.clone(), strength: 2.4, v };
    W.lightSources.push(ls);
    const h = bulb.y - 0.05;
    const geo = coneGeo.clone().applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(bulb.x, h / 2, bulb.z), new THREE.Quaternion(), new THREE.Vector3(1, h, 1)));
    if (l.flick === 1) {
      const sh = new THREE.Mesh(geo, shaftMaterial(warm, 0.06)); sh.renderOrder = 3; sh.frustumCulled = false; scene.add(sh);
      out.flickers.push({ v, glow: [[g1, 0.7, 1.5], [g2, 3, 0.35]], shaft: sh, pos: bulb, color: warm, ls });
      out.shafts.push(sh);
    } else shaftGeos.push(geo);
  }
  if (shaftGeos.length) { const shaft = new THREE.Mesh(mergeGeometries(shaftGeos), shaftMaterial(warm, 0.06)); shaft.renderOrder = 3; shaft.frustumCulled = false; scene.add(shaft); out.shafts.push(shaft); }
  if (contact) for (const l of W.lampSpots) contact.add(l.pos.x, l.pos.y, l.pos.z, 0.8);

  // ---------- wall lanterns ----------
  const lanRoot = P.street_lamp_02.scene;
  lanRoot.traverse(o => {
    if (!o.isMesh) return;
    const n = o.material.name || '';
    if (n.includes('bulb')) { o.material = o.material.clone(); o.material.emissive = new THREE.Color(1, 0.75, 0.45); o.material.emissiveIntensity = 30; }
    else if (n.includes('glass')) o.material = new THREE.MeshStandardMaterial({ color: 0x302820, emissive: new THREE.Color(1, 0.7, 0.4), emissiveIntensity: 1.6, roughness: 0.15, transparent: true, opacity: 0.55, depthWrite: false });
  });
  const lb = new THREE.Box3().setFromObject(lanRoot);
  const lanOffset = new THREE.Vector3((lb.min.x + lb.max.x) / 2, lb.max.y - 0.3, lb.min.z);
  instance(scene, lanRoot, W.lanterns.map(l => ({ pos: l.pos, rot: Math.atan2(l.n.x, l.n.z), scale: 0.75 })), { offset: lanOffset, wet: 0.6, shadow: false });
  // halos for lanterns and bare bulbs
  for (const v of W.pointVirtuals) {
    if (!v.glowPos) continue;
    const c = v.bare ? new THREE.Color(1, 0.72, 0.42) : new THREE.Color(0xffb070);
    const g = glows.add(v.glowPos, c, v.bare ? 0.6 : 0.9, v.bare ? 3 : 2.2);
    if (v.flick) out.flickers.push({ v, glow: [[g, v.bare ? 3 : 2.2, v.bare ? 0.6 : 0.9]], pos: v.glowPos, color: c });
  }
  for (const v of W.pointVirtuals) if (v.indoor && v.flick === 1) out.flickers.push({ v, glow: [] });

  // ---------- small static things ----------
  instance(scene, P.fire_hydrant.scene, W.hydrants, { filter: n => /^fire_hydrant/.test(n) && !/aged|rust/.test(n), offset: new THREE.Vector3(-0.3, 0, 0), wet: 0.55, shadow: false });
  out.small = [];
  out.small.push(...instance(scene, P.trashbag.scene, W.bags, { wet: 0.45, shadow: false }));
  if (contact) { W.bags.forEach(b => contact.add(b.pos.x, b.pos.y, b.pos.z, 0.8 * (b.scale || 1))); W.hydrants.forEach(h => contact.add(h.pos.x, h.pos.y, h.pos.z, 0.6)); }
  const ab = new THREE.Box3().setFromObject(P.exterior_aircon_unit.scene);
  out.small.push(...instance(scene, P.exterior_aircon_unit.scene, W.acs.map(a => ({ pos: a.pos, rot: Math.atan2(a.n.x, a.n.z), scale: 0.7 })), { filter: n => n === 'exterior_aircon_unit', offset: new THREE.Vector3(-0.5, ab.max.y, ab.min.z), wet: 0.7, shadow: false }));

  // ---------- dumpsters (static, vaultable) ----------
  const dm = TX.paintedMetal(0x1f4a2e, { rust: 0.6, ribs: 8, seed: 3 });
  const dMat = new THREE.MeshStandardMaterial({ map: dm.map, normalMap: dm.normalMap, roughness: 0.5, metalness: 0.4 });
  const lidMat = new THREE.MeshStandardMaterial({ color: 0x141614, roughness: 0.35 });
  const dGeo = [], lGeo = [];
  for (const sp of W.propSpots.filter(p => p.type === 'dumpster')) {
    // 1.9 x 1.25 x 1.1 m, long side along x (alleys run along x)
    const w = 1.9, h = 1.25, d = 1.1, y = 0;
    const box = new THREE.BoxGeometry(w, h, d); box.translate(sp.x, y + h / 2 + 0.08, sp.z);
    dGeo.push(box);
    const lid = new THREE.BoxGeometry(w + 0.08, 0.06, d + 0.12); lid.rotateX(0.06).translate(sp.x, y + h + 0.12, sp.z); lGeo.push(lid);
    for (const sx of [-0.8, 0.8]) for (const sz of [-0.42, 0.42]) { const wh = new THREE.CylinderGeometry(0.07, 0.07, 0.05, 10).rotateX(Math.PI / 2).translate(sp.x + sx, 0.07, sp.z + sz); lGeo.push(wh); }
    S.box(sp.x - w / 2, sp.x + w / 2, 0, h + 0.15, sp.z - d / 2, sp.z + d / 2, VAULT, { dumpster: true });
    if (contact) contact.add(sp.x, 0, sp.z, 2.4, 1.5);
  }
  if (dGeo.length) {
    const m1 = new THREE.Mesh(mergeGeometries(dGeo), dMat); m1.castShadow = m1.receiveShadow = true; scene.add(m1);
    const m2 = new THREE.Mesh(mergeGeometries(lGeo.map(g => g.index ? g.toNonIndexed() : g)), lidMat); m2.castShadow = true; scene.add(m2);
  }

  // ---------- parked cars ----------
  const models = {};
  const carModel = (glb, wheelGlb) => {
    const root = glb.scene; root.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(root), size = bb.getSize(new THREE.Vector3()), ctr = bb.getCenter(new THREE.Vector3());
    const longX = size.x > size.z;
    const g = new THREE.Group();
    const inner = root.clone();
    inner.position.set(-ctr.x, -bb.min.y, -ctr.z);
    const holder = new THREE.Group(); holder.add(inner);
    if (longX) holder.rotation.y = Math.PI / 2;     // long axis -> local z
    g.add(holder);
    const L = longX ? size.x : size.z, Wd = longX ? size.z : size.x;
    if (wheelGlb) {
      const wr = wheelGlb.scene;
      const wb = new THREE.Box3().setFromObject(wr), wsize = wb.getSize(new THREE.Vector3()), wc = wb.getCenter(new THREE.Vector3());
      const r = Math.max(wsize.y, wsize.z) / 2;
      for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const w = wr.clone(); w.position.set(-wc.x, -wc.y, -wc.z);
        const h = new THREE.Group(); h.add(w);
        h.position.set(sx * (Wd / 2 - wsize.x / 2 - 0.02), r, sz * L * 0.3);
        if (sx < 0) h.rotation.y = Math.PI;
        g.add(h);
      }
    }
    g.updateMatrixWorld(true);
    const byMat = new Map();
    g.traverse(o => {
      if (!o.isMesh) return;
      let geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
      if (geo.index) geo = geo.toNonIndexed();
      for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
      if (!geo.attributes.normal) geo.computeVertexNormals();
      if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
      const m = o.material;
      if (!byMat.has(m.uuid)) { const mm = m.clone(); if (mm.roughness !== undefined) mm.roughness *= 0.6; byMat.set(m.uuid, { mat: mm, geos: [] }); }
      byMat.get(m.uuid).geos.push(geo);
    });
    const parts = [...byMat.values()].map(v => ({ mat: v.mat, geo: mergeGeometries(v.geos) }));
    return { parts, L, Wd, H: size.y };
  };
  if (P.crownvic_sedan) models.sedan = carModel(P.crownvic_sedan, P.crownvic_wheel_sedan);
  if (P.savana_plain) models.van = carModel(P.savana_plain, P.savana_wheel);
  if (P.covered_car) models.covered = carModel(P.covered_car, null);
  const carChunks = new Map();
  for (const c of W.cars) {
    const md = models[c.kind] || models.covered; if (!md) continue;
    const kind = models[c.kind] ? c.kind : 'covered';
    const key = kind + '|' + Math.floor(c.x / 64) + ':' + Math.floor(c.z / 64);
    if (!carChunks.has(key)) carChunks.set(key, { md, list: [] });
    carChunks.get(key).list.push(c);
    // collision: the footprint (axis-aligned enough at 0/90 degrees)
    const along = Math.abs(Math.sin(c.rot)) > 0.7;
    const hx = along ? md.L / 2 : md.Wd / 2, hz = along ? md.Wd / 2 : md.L / 2;
    const tall = md.H > 1.8;
    S.box(c.x - hx, c.x + hx, 0, Math.min(md.H, tall ? md.H : 1.5), c.z - hz, c.z + hz, tall ? SOLID : VAULT, { car: true });
    if (contact) contact.add(c.x, 0, c.z, (along ? md.L : md.Wd) * 1.1, (along ? md.Wd : md.L) * 1.1);
  }
  for (const { md, list } of carChunks.values()) {
    for (const part of md.parts) {
      const im = new THREE.InstancedMesh(part.geo, part.mat, list.length);
      list.forEach((c, i) => { _q.setFromAxisAngle(_up, c.rot); _m.compose(new THREE.Vector3(c.x, 0, c.z), _q, _s.set(1, 1, 1)); im.setMatrixAt(i, _m); });
      im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); im.matrixAutoUpdate = false;
      scene.add(im);
    }
  }

  out.update = (t) => {
    for (const s of out.shafts) s.material.uniforms.uTime.value = t;
    for (const f of out.flickers) {
      const k = flicker(f.v, t);
      for (const [gi, inten, size] of f.glow) glows.set(gi, null, f.color, null, inten * k);
      if (f.shaft) f.shaft.material.uniforms.uStrength.value = 0.06 * k;
      if (f.ls) f.ls.strength = 2.4 * k;
    }
  };
  return out;
}
