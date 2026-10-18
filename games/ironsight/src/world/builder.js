// Map construction kit: world-space-UV boxes batched per material (one draw per material),
// Poly Haven props with auto colliders, instanced foliage, grime/stain decals, light lists.
import * as THREE from 'three';
import { safeMerge as mergeGeometries } from '../core/geom.js';
import { pbr, gltf, tex, rng } from '../core/assets.js';

const PROP_LO = new Set(['fir_tree_01', 'pine_tree_01']);
// decimated copies of the heavy Poly Haven props (tools/decimate.py -> props_lo/)
const PROP_DEC = new Set(["barrel_stove","boulder_01","cardboard_box_01","classic_laptop","concrete_road_barrier","covered_car","dead_tree_trunk","drawer_cabinet","exterior_aircon_unit","fire_hydrant","hand_truck","metal_jerrycan","metal_trash_can","modern_arm_chair_01","mounted_fluorescent_lights","namaqualand_boulder_02","ocean_buoy","old_military_crate","plastic_crate_01","portable_generator","potted_plant_01","street_lamp_01","street_lamp_02","tree_stump_01","wooden_military_crate"]);
export function propUrl(name) { return PROP_LO.has(name) ? `lo/${name}.glb` : PROP_DEC.has(name) ? `props_lo/${name}.glb` : `props/${name}/${name}.gltf`; }

// box faces with world-space UVs (metres / tile) so neighbouring boxes tile seamlessly
export function boxGeometry(x0, y0, z0, x1, y1, z1, tile = 2, { bottom = false, top = true, uvRot = false } = {}) {
  const P = [], N = [], U = [], I = [];
  const face = (a, b, c, d, n, uvf) => {
    const k = P.length / 3;
    for (const v of [a, b, c, d]) { P.push(...v); N.push(...n); const uv = uvf(v); U.push(uv[0] / tile, uv[1] / tile); }
    I.push(k, k + 1, k + 2, k, k + 2, k + 3);
  };
  face([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], v => [-v[2], v[1]]);
  face([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], v => [v[2], v[1]]);
  face([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], v => [v[0], v[1]]);
  face([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], v => [-v[0], v[1]]);
  if (top) face([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], v => uvRot ? [v[2], v[0]] : [v[0], -v[2]]);
  if (bottom) face([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], v => [v[0], v[2]]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex(I);
  return g;
}

let stainTex = null;
function stainTexture() {
  if (stainTex) return stainTex;
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S * 2;
  const g = c.getContext('2d');
  const R = rng(91);
  // 4 variants in a 2x2 atlas: oil/water stain, soot splash, scattered grime, cracked patch
  for (let v = 0; v < 4; v++) {
    const ox = (v % 2) * S, oy = Math.floor(v / 2) * S;
    for (let k = 0; k < 40; k++) {
      const r = R.range(10, v === 2 ? 30 : 70), x = ox + S / 2 + R.range(-60, 60) * (v === 2 ? 1.6 : 0.8), y = oy + S / 2 + R.range(-60, 60) * (v === 2 ? 1.6 : 0.8);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      const a = v === 1 ? 0.14 : 0.09;
      gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
    if (v === 3) { g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 1.5; for (let k = 0; k < 14; k++) { g.beginPath(); let x = ox + S / 2, y = oy + S / 2; g.moveTo(x, y); for (let s = 0; s < 8; s++) { x += R.range(-18, 18); y += R.range(-18, 18); g.lineTo(x, y); } g.stroke(); } }
  }
  stainTex = new THREE.CanvasTexture(c);
  return stainTex;
}

export class MapBuilder {
  constructor(scene, world, seed = 1) {
    this.scene = scene; this.world = world; this.R = rng(seed);
    this.batches = new Map();   // matKey -> geometries[]
    this.mats = new Map();      // matKey -> { material, tile }
    this.group = new THREE.Group(); this.group.name = 'map';
    scene.add(this.group);
    this.propJobs = [];
    this.stains = [];
    this.lamps = []; this.points = []; this.rects = [];
    this.lightSources = [];
    this.contactList = [];
    this.emissive = [];
    this.windows = [];   // interior-mapped panes: {o (bottom-left), t (right), w, h, n (outward), seed, depth, kind}
    this.lods = [];
    this.finishHooks = [];   // async jobs that need the whole map placed first (instanced vehicles)
  }
  updateLods(cam) {
    for (const L of this.lods) {
      const ni = [], fi = [];
      L.list.forEach(([x, , z], i) => ((x - cam.x) ** 2 + (z - cam.z) ** 2 < L.dist2 ? ni : fi).push(i));
      const key = ni.join(','); if (key === L.key) continue; L.key = key;
      L.fill(L.near, ni); L.fill(L.far, fi);
    }
  }
  // an interior-mapped window pane on a facade. o = bottom-left corner seen from outside
  window(o, t, n, w, h, kind = 0, depth = 4) { this.windows.push({ o, t, n, w, h, kind, depth, seed: this.R() * 1000 }); }
  windowMesh(material) {
    const W = this.windows; if (!W.length) return null;
    const N = W.length * 6, pos = new Float32Array(N * 3), nor = new Float32Array(N * 3), uv = new Float32Array(N * 2), tan = new Float32Array(N * 3), info = new Float32Array(N * 4), kind = new Float32Array(N);
    let k = 0;
    const up = new THREE.Vector3(0, 1, 0), c = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    for (const q of W) {
      c[0].copy(q.o); c[1].copy(q.o).addScaledVector(q.t, q.w); c[2].copy(c[1]).addScaledVector(up, q.h); c[3].copy(q.o).addScaledVector(up, q.h);
      const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
      for (const i of [0, 1, 2, 0, 2, 3]) {
        pos.set([c[i].x, c[i].y, c[i].z], k * 3); nor.set([q.n.x, q.n.y, q.n.z], k * 3); uv.set(uvs[i], k * 2);
        tan.set([q.t.x, q.t.y, q.t.z], k * 3); info.set([q.seed, q.depth, q.w, q.h], k * 4); kind[k] = q.kind; k++;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('aTan', new THREE.BufferAttribute(tan, 3)); g.setAttribute('aInfo', new THREE.BufferAttribute(info, 4)); g.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
    const m = new THREE.Mesh(g, material); m.frustumCulled = false; m.name = 'windows';
    this.group.add(m);
    return m;
  }
  // register a material. src: Poly Haven texture name or a THREE.Material
  mat(key, src, { tile = 2, ...opts } = {}) {
    const m = (src && src.isMaterial) ? src : pbr(src, opts);
    this.mats.set(key, { material: m, tile });
    return m;
  }
  _push(key, geo) { let a = this.batches.get(key); if (!a) this.batches.set(key, a = []); a.push(geo); }
  // axis-aligned box from min to max corners
  box(x0, y0, z0, x1, y1, z1, key, { surf = 'concrete', collide = true, nav, shoot, see, top = true, bottom = false, uvRot = false, visible = true } = {}) {
    if (visible) {
      const M = this.mats.get(key); if (!M) throw new Error('no material ' + key);
      this._push(key, boxGeometry(x0, y0, z0, x1, y1, z1, M.tile, { top, bottom, uvRot }));
    }
    if (collide) return this.world.add(x0, y0, z0, x1, y1, z1, surf, { nav, shoot, see });
    return null;
  }
  // centred in x/z, standing on y
  boxC(cx, y, cz, w, h, d, key, o) { return this.box(cx - w / 2, y, cz - d / 2, cx + w / 2, y + h, cz + d / 2, key, o); }
  // arbitrary geometry already in world space
  geo(geometry, key) { this._push(key, geometry); }
  // wall from (ax,az) to (bx,bz) along an axis, with optional openings [{at: distance along, w, h, y}]
  wall(ax, az, bx, bz, y0, y1, thick, key, opts = {}, openings = []) {
    const horiz = Math.abs(bz - az) < 1e-6; const L = horiz ? bx - ax : bz - az; const s = Math.sign(L) || 1; const len = Math.abs(L);
    const seg = (a, b, ya, yb) => {
      if (b - a < 0.01 || yb - ya < 0.01) return;
      if (horiz) this.box(Math.min(ax + s * a, ax + s * b), ya, az - thick / 2, Math.max(ax + s * a, ax + s * b), yb, az + thick / 2, key, opts);
      else this.box(ax - thick / 2, ya, Math.min(az + s * a, az + s * b), ax + thick / 2, yb, Math.max(az + s * a, az + s * b), key, opts);
    };
    const ops = openings.slice().sort((p, q) => p.at - q.at);
    let cur = 0;
    for (const o of ops) {
      const a = o.at - o.w / 2, b = o.at + o.w / 2, oy = o.y || 0;
      seg(cur, a, y0, y1);
      seg(a, b, y0, y0 + oy);              // sill
      seg(a, b, y0 + oy + o.h, y1);        // lintel
      cur = b;
    }
    seg(cur, len, y0, y1);
  }
  // Poly Haven prop. collider: 'auto' (AABB of the placed model), null, or [w,h,d]
  prop(name, x, y, z, rot = 0, scale = 1, { collider = 'auto', surf = 'wood', shadow = true, contact = true, nav, onLoad } = {}) {
    const job = gltf(propUrl(name)).then(g => {
      const o = g.scene.clone(true);
      o.position.set(x, y, z); o.rotation.y = rot; o.scale.setScalar(scale);
      o.traverse(m => { if (m.isMesh) { m.castShadow = shadow; m.receiveShadow = true; if (m.material) m.material.envMapIntensity = 1; } });
      this.group.add(o);
      o.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(o);
      if (collider === 'auto') this.world.add(bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z, surf, { nav });
      else if (Array.isArray(collider)) this.world.add(x - collider[0] / 2, y, z - collider[2] / 2, x + collider[0] / 2, y + collider[1], z + collider[2] / 2, surf, { nav });
      if (contact) this.contactList.push([x, y, z, (bb.max.x - bb.min.x) * 1.5, (bb.max.z - bb.min.z) * 1.5, 0]);
      if (onLoad) onLoad(o, bb);
      return o;
    }).catch(e => console.warn('[map] prop failed', name, e.message));
    this.propJobs.push(job);
    return job;
  }
  // many copies of one prop as instanced meshes. list: [[x,y,z,rot,scale], ...]
  // instanced copies of a model. lod: { far: url, dist } adds a far version; updateLods() moves each
  // instance between the near and far sets as the camera moves
  instances(name, list, { collider = null, surf = 'wood', shadow = true, lod = null } = {}) {
    const mk = (g, share) => {
      const meshes = [], out = [];
      g.scene.updateMatrixWorld(true);
      g.scene.traverse(m => { if (m.isMesh) meshes.push(m); });
      for (const m of meshes) {
        const mat = (share && share.get(m.material?.name)) || m.material;   // far LOD reuses the near textures
        const im = new THREE.InstancedMesh(m.geometry, mat, list.length);
        im.userData.local = m.matrixWorld.clone();
        im.castShadow = shadow; im.receiveShadow = true; im.frustumCulled = false;
        if (m.material) { m.material.side = THREE.DoubleSide; if (m.material.transparent) { m.material.alphaTest = 0.5; m.material.transparent = false; } }
        // foliage cards: the packed GLB lost the twig alpha (JPEG); use Poly Haven's own alpha mask
        if (lod?.alpha && /twig|leaf|leaves/.test(mat.name) && !mat.alphaMap) {
          const t = new THREE.TextureLoader().load(lod.alpha); t.flipY = false; t.colorSpace = THREE.NoColorSpace;
          mat.alphaMap = t; mat.alphaTest = 0.45; mat.transparent = false; mat.alphaToCoverage = false; mat.needsUpdate = true;
        }
        this.group.add(im); out.push(im);
      }
      return out;
    };
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3();
    const mats = list.map(([x, y, z, r, s]) => { Q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, r); return new THREE.Matrix4().compose(P.set(x, y, z), Q, S.setScalar(s)); });
    const fill = (set, idx) => { for (const im of set) { idx.forEach((k, i) => im.setMatrixAt(i, M.multiplyMatrices(mats[k], im.userData.local))); im.count = idx.length; im.instanceMatrix.needsUpdate = true; } };
    const job = Promise.all([gltf(propUrl(name)), lod ? gltf(lod.far) : null]).then(([g, gf]) => {
      const near = mk(g), far = gf ? mk(gf, new Map(near.map(im => [im.material.name, im.material]))) : null;
      const all = list.map((_, i) => i);
      fill(near, all);
      if (far) { fill(far, []); this.lods.push({ list, near, far, fill, dist2: (lod.dist || 30) ** 2, key: '' }); }
      if (collider) for (const [x, y, z, , s] of list) this.world.add(x - collider[0] * s / 2, y, z - collider[2] * s / 2, x + collider[0] * s / 2, y + collider[1] * s, z + collider[2] * s / 2, surf);
    }).catch(e => console.warn('[map] instances failed', name, e.message));
    this.propJobs.push(job);
    return job;
  }
  // flat grime / stain decal lying on a surface (variant 0..3)
  stain(x, y, z, size, rot = 0, variant = 0, dark = 0.6, n = [0, 1, 0]) { this.stains.push({ x, y, z, size, rot, variant, dark, n }); }
  lamp(pos, target, color, intensity, opts = {}) { const v = { pos: new THREE.Vector3(...pos), target: new THREE.Vector3(...target), color: new THREE.Color(color), intensity, ...opts }; this.lamps.push(v); this.lightSources.push({ pos: v.pos, color: v.color, strength: intensity / 40 }); return v; }
  point(pos, color, intensity, distance = 12, opts = {}) { const v = { pos: new THREE.Vector3(...pos), color: new THREE.Color(color), intensity, distance, ...opts }; this.points.push(v); this.lightSources.push({ pos: v.pos, color: v.color, strength: intensity / 20 }); return v; }
  rect(pos, look, w, h, color, intensity = 3) { const v = { pos: new THREE.Vector3(...pos), look: new THREE.Vector3(...look), w, h, color: new THREE.Color(color), intensity }; this.rects.push(v); return v; }
  // glowing panel (lamp lens, window, screen) in world space
  glow(x0, y0, z0, x1, y1, z1, color, intensity = 3) {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), toneMapped: true });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.01, x1 - x0), Math.max(0.01, y1 - y0), Math.max(0.01, z1 - z0)), m);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.group.add(mesh); this.emissive.push(mesh);
    return mesh;
  }
  async finish(contact) {
    for (const [key, geos] of this.batches) {
      const M = this.mats.get(key);
      const g = mergeGeometries(geos, false);
      geos.forEach(x => x.dispose());
      const mesh = new THREE.Mesh(g, M.material);
      mesh.castShadow = !M.material.transparent; mesh.receiveShadow = true; mesh.name = 'batch:' + key;
      this.group.add(mesh);
    }
    this.batches.clear();
    if (this.stains.length) {
      const st = this.stains;
      const geo = new THREE.PlaneGeometry(1, 1);
      // atlas offset per instance
      const off = new Float32Array(st.length * 3);
      const im = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: stainTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), st.length);
      const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Q2 = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1);
      st.forEach((s, i) => {
        Q.setFromUnitVectors(Z, new THREE.Vector3(...s.n)); Q2.setFromAxisAngle(Z, s.rot); Q.multiply(Q2);
        M.compose(P.set(s.x + s.n[0] * 0.004, s.y + s.n[1] * 0.004, s.z + s.n[2] * 0.004), Q, S.set(s.size, s.size, 1));
        im.setMatrixAt(i, M); off[i * 3] = (s.variant % 2) * 0.5; off[i * 3 + 1] = Math.floor(s.variant / 2) * 0.5; off[i * 3 + 2] = s.dark;
      });
      geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 3));
      im.material.onBeforeCompile = sh => {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aOff; varying float vDark;')
          .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_ALPHAMAP\nvAlphaMapUv = uv*0.5 + aOff.xy;\n#endif\nvDark = aOff.z;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vDark;')
          .replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\ndiffuseColor.a *= vDark;');
      };
      im.renderOrder = 1; im.frustumCulled = false; im.receiveShadow = false;
      this.group.add(im);
    }
    for (const h of this.finishHooks) this.propJobs.push(h());
    await Promise.all(this.propJobs);
    if (contact) for (const c of this.contactList) contact.add(...c);
  }
}
