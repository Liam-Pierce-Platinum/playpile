// BANNERFALL :: render/warProps.js - forests, rocks and every building on a huge war map.
//
// FORESTS (tens of thousands of trees) in three LODs chosen per 64 m cell every few frames:
//   LOD0 near (full lumpy canopies, cast shadows), LOD1 mid (one low canopy, about 90 triangles),
//   LOD2 far (crossed painted billboards); beyond that the terrain's forest-floor tint is the forest.
//   Every tree's matrix is computed once, so a LOD pass only copies 16 floats per visible tree.
// BUILDINGS (village houses, mills, chapels, keeps, tents, wells, bridges, fences) are built with
//   the v1 prop kit, then merged into one mesh per 512 m block (a handful of draw calls for a whole
//   map); windmill sails stay separate so they turn.
import * as THREE from '../../vendor/three.module.js';
import { mergeGeometries } from '../../vendor/jsm/utils/BufferGeometryUtils.js';
import { part, merge, mergeSmooth, lumpy, cyl, cone, lin } from './geo.js';
import { makeProp, TREE_GEO } from './props.js';

const CELL = 64;

function lowOak(env) {
  const g = lumpy(new THREE.IcosahedronGeometry(2.6, 1), 0.4, 0.9, 3);
  g.scale(1.15, 1, 1.15); g.translate(0, 4.7, 0);
  const c = new Float32Array(g.attributes.position.count * 3);
  const top = lin(env.oak[0]), under = lin(env.oak[1]), tc = new THREE.Color(), n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) { const k = Math.max(0, Math.min(1, n.getY(i) * 0.5 + 0.5)); tc.copy(under).lerp(top, k * k); if (env.snowCaps && n.getY(i) > 0.6) tc.lerp(lin(0xf4f7fa), (n.getY(i) - 0.6) * 2); c[i * 3] = tc.r; c[i * 3 + 1] = tc.g; c[i * 3 + 2] = tc.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.deleteAttribute('uv');
  const trunk = part(cyl(0.22, 0.36, 3.4, 5), 0x5a4330, { pos: [0, 1.6, 0] });
  trunk.deleteAttribute('aTeam');
  return mergeGeometries([g.toNonIndexed(), trunk.index ? trunk.toNonIndexed() : trunk], false);
}
function lowPine(env) {
  const P = [];
  const lit = lin(env.pine[0]), dark = lin(env.pine[1]);
  for (const [r, h, y, k] of [[3.0, 3.2, 2.0, 0.2], [2.2, 3.0, 4.0, 0.5], [1.3, 2.6, 5.9, 0.85]]) {
    const g = cone(r, h, 7); g.translate(0, y, 0);
    const c = new Float32Array(g.attributes.position.count * 3); const tc = new THREE.Color();
    for (let i = 0; i < g.attributes.position.count; i++) { tc.copy(dark).lerp(lit, k * 0.7 + Math.max(0, g.attributes.normal.getY(i)) * 0.3); if (env.snowCaps && g.attributes.normal.getY(i) > 0.4) tc.lerp(lin(0xf2f5f8), 0.7); c[i * 3] = tc.r; c[i * 3 + 1] = tc.g; c[i * 3 + 2] = tc.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.deleteAttribute('uv');
    P.push(g.toNonIndexed());
  }
  const t = part(cyl(0.14, 0.28, 2.2, 5), 0x5b4535, { pos: [0, 0.9, 0] }); t.deleteAttribute('aTeam');
  P.push(t.index ? t.toNonIndexed() : t);
  return mergeGeometries(P, false);
}
// painted billboard sprites (oak, pine) on one canvas
function treeSprites(env) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  const hx = (h) => '#' + h.toString(16).padStart(6, '0');
  // oak (left half)
  g.fillStyle = '#5a4330'; g.fillRect(28, 78, 8, 50);
  const blob = (x, y, r, col) => { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
  for (const [x, y, r] of [[32, 52, 24], [18, 62, 15], [46, 60, 16], [30, 34, 16], [40, 44, 14]]) blob(x, y, r, hx(env.oak[1]));
  for (const [x, y, r] of [[30, 46, 18], [40, 40, 12], [22, 52, 11]]) blob(x, y, r, hx(env.oak[0]));
  // pine (right half)
  g.fillStyle = '#5b4535'; g.fillRect(92, 104, 6, 24);
  for (const [w, y0, y1, col] of [[30, 112, 70, env.pine[1]], [24, 84, 44, env.pine[1]], [16, 58, 16, env.pine[0]], [20, 96, 60, env.pine[0]]]) { g.fillStyle = hx(col); g.beginPath(); g.moveTo(95 - w, y0); g.lineTo(95, y1); g.lineTo(95 + w, y0); g.closePath(); g.fill(); }
  if (env.snowCaps) { g.fillStyle = 'rgba(240,244,248,0.85)'; g.beginPath(); g.moveTo(95, 16); g.lineTo(84, 40); g.lineTo(106, 40); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 2;
  return t;
}
// IMPOSTORS: the real tree meshes are rendered once at load into a 512 x 512 atlas (side and top
// views of an oak and a pine); far trees are two crossed side quads plus a top quad, so they read
// as trees from a low RTS camera and as canopies from the strategic view.
function bakeImpostors(renderer, env, oakG, oakT, pineG, pineT) {
  const rt = new THREE.WebGLRenderTarget(512, 512, { depthBuffer: true });
  rt.texture.generateMipmaps = true; rt.texture.minFilter = THREE.LinearMipmapLinearFilter; rt.texture.magFilter = THREE.LinearFilter;
  const sc = new THREE.Scene();
  sc.add(new THREE.AmbientLight(0xffffff, 1.6));
  const dl = new THREE.DirectionalLight(0xfff2dd, 1.4); dl.position.set(-0.4, 1, 0.8); sc.add(dl);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const oak = new THREE.Group(); oak.add(new THREE.Mesh(oakG, mat), new THREE.Mesh(oakT, mat));
  const pine = new THREE.Group(); pine.add(new THREE.Mesh(pineG, mat), new THREE.Mesh(pineT, mat)); pine.scale.set(1, 1.15, 1);
  const prevTarget = renderer.getRenderTarget(), prevClear = new THREE.Color(); renderer.getClearColor(prevClear);
  const prevAlpha = renderer.getClearAlpha(), prevTone = renderer.toneMapping;
  // transparent texels carry the foliage colour so mipmaps fade to green, not to black
  renderer.setClearColor(new THREE.Color(env.oak[1]).lerp(new THREE.Color(env.oak[0]), 0.5), 0); renderer.toneMapping = THREE.NoToneMapping;
  renderer.setRenderTarget(rt); renderer.clear(true, true, true);
  const views = [
    [oak, 0, 0, 'side', 4.4, 4.0], [pine, 256, 0, 'side', 4.4, 4.6],
    [oak, 0, 256, 'top', 4.4, 0], [pine, 256, 256, 'top', 4.4, 0],
  ];
  for (const [obj, x, y, kind, half, cy] of views) {
    sc.add(obj);
    const cam = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, 60);
    if (kind === 'side') { cam.top = cy + half; cam.bottom = cy - half; cam.position.set(0, cy, 30); cam.lookAt(0, cy, 0); }
    else { cam.position.set(0, 40, 0); cam.up.set(0, 0, -1); cam.lookAt(0, 0, 0); }
    cam.updateProjectionMatrix();
    rt.viewport.set(x, y, 256, 256); rt.scissor.set(x, y, 256, 256); rt.scissorTest = true;
    renderer.setRenderTarget(rt);
    renderer.render(sc, cam);
    sc.remove(obj);
  }
  rt.scissorTest = false; rt.viewport.set(0, 0, 512, 512);
  renderer.setRenderTarget(prevTarget); renderer.setClearColor(prevClear, prevAlpha); renderer.toneMapping = prevTone;
  return rt.texture;
}
// crossed side quads + a top quad; u0 = 0 (oak) or 0.5 (pine)
function impostorGeo(pine) {
  const P = [];
  const H = pine ? 8.8 * 1.15 : 8.8, W = 8.8, cy = pine ? 4.6 * 1.15 : 4.0;
  const u0 = pine ? 0.5 : 0;
  for (const ry of [0, Math.PI / 2]) {
    const g = new THREE.PlaneGeometry(W, H);
    g.translate(0, cy, 0); g.rotateY(ry);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * 0.5, uv.getY(i) * 0.5);
    const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
    P.push(g.toNonIndexed());
  }
  const t = new THREE.PlaneGeometry(W, W); t.rotateX(-Math.PI / 2); t.translate(0, pine ? 5.2 : 4.9, 0);
  const uv = t.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * 0.5, 0.5 + (1 - uv.getY(i)) * 0.5);
  P.push(t.toNonIndexed());
  return mergeGeometries(P, false);
}
function billboardGeo(left) {
  // two crossed quads, 9 m tall, uv into one half of the sprite sheet
  const P = [];
  for (const ry of [0, Math.PI / 2]) {
    const g = new THREE.PlaneGeometry(7.5, 9.5);
    g.translate(0, 4.75, 0); g.rotateY(ry);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, (left ? 0 : 0.5) + uv.getX(i) * 0.5);
    const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
    P.push(g.toNonIndexed());
  }
  return mergeGeometries(P, false);
}

export function buildWarProps(scene, world, opts = {}) {
  const env = opts.env;
  const T = world.terrain, S = T.size;
  const uniforms = { uTime: { value: 0 } };
  const { oakCanopy, oakTrunk, pineCanopy, pineTrunk, windify, vmat } = TREE_GEO;
  // ---------------------------------------------------------------- forest
  const trees = world.trees;
  const N = trees.length;
  const mats = new Float32Array(N * 16);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const pine = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const t = trees[i];
    q.setFromAxisAngle(up, t.rot); p.set(t.x, T.height(t.x, t.z) - 0.15, t.z);
    const isPine = t.kind === 'pine'; pine[i] = isPine ? 1 : 0;
    s.set(t.s, isPine ? t.s * 1.15 : t.s, t.s);
    m4.compose(p, q, s); m4.toArray(mats, i * 16);
  }
  const NCx = Math.ceil(S / CELL);
  const cells = Array.from({ length: NCx * NCx }, () => []);
  for (let i = 0; i < N; i++) { const t = trees[i]; const ci = Math.min(NCx - 1, Math.floor(t.x / CELL)), cj = Math.min(NCx - 1, Math.floor(t.z / CELL)); cells[cj * NCx + ci].push(i); }
  const cellBox = cells.map((list, k) => {
    const ci = k % NCx, cj = Math.floor(k / NCx);
    let h0 = Infinity, h1 = -Infinity; for (const i of list) { const y = mats[i * 16 + 13]; h0 = Math.min(h0, y); h1 = Math.max(h1, y); }
    return list.length ? new THREE.Box3(new THREE.Vector3(ci * CELL, h0, cj * CELL), new THREE.Vector3(ci * CELL + CELL, h1 + 12, cj * CELL + CELL)) : null;
  });
  const canMat = vmat({ roughness: 0.9 }); windify(canMat, uniforms, 0.05);
  const pineMat = vmat({ roughness: 0.9 }); windify(pineMat, uniforms, 0.035);
  const trunkMat = vmat({ roughness: 0.95 });
  const lowMat = vmat({ roughness: 0.92 }); windify(lowMat, uniforms, 0.03);
  const oakGeo0 = oakCanopy(1, env), oakT0 = oakTrunk(), pineGeo0 = pineCanopy(env), pineT0 = pineTrunk();
  const atlas = opts.renderer ? bakeImpostors(opts.renderer, env, oakGeo0, oakT0, pineGeo0, pineT0) : treeSprites(env);
  const billMat = new THREE.MeshStandardMaterial({ map: atlas, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.95 });
  function pool(geo, mat, cap, shadow) {
    const im = new THREE.InstancedMesh(geo, mat, cap);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.frustumCulled = false; im.castShadow = !!shadow; im.receiveShadow = true; im.count = 0;
    scene.add(im);
    return { im, cap, n: 0, arr: im.instanceMatrix.array };
  }
  const P0 = { oakC: pool(oakGeo0, canMat, 3500, true), oakT: pool(oakT0, trunkMat, 3500, true), pineC: pool(pineGeo0, pineMat, 3500, true), pineT: pool(pineT0, trunkMat, 3500, true) };
  const P1 = { oak: pool(lowOak(env), lowMat, 14000, false), pine: pool(lowPine(env), lowMat, 14000, false) };
  const P2 = opts.renderer ? { oak: pool(impostorGeo(false), billMat, 40000, false), pine: pool(impostorGeo(true), billMat, 40000, false) } : { oak: pool(billboardGeo(true), billMat, 40000, false), pine: pool(billboardGeo(false), billMat, 40000, false) };
  const all = [...Object.values(P0), ...Object.values(P1), ...Object.values(P2)];
  const put = (P, i) => { if (P.n >= P.cap) return; P.arr.set(mats.subarray(i * 16, i * 16 + 16), P.n * 16); P.n++; };
  const frustum = new THREE.Frustum(), pm = new THREE.Matrix4();
  let last = null, lodScale = opts.lodScale || 1;
  const stats = { lod0: 0, lod1: 0, lod2: 0 };
  function updateForest(camera, force) {
    const c = camera.position;
    const key = [c.x, c.y, c.z, camera.quaternion.x, camera.quaternion.y, camera.quaternion.z, camera.quaternion.w];
    if (!force && last && Math.hypot(key[0] - last[0], key[1] - last[1], key[2] - last[2]) < 6 && Math.abs(key[3] - last[3]) + Math.abs(key[4] - last[4]) + Math.abs(key[5] - last[5]) + Math.abs(key[6] - last[6]) < 0.01) return;
    last = key;
    camera.updateMatrixWorld();
    pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(pm);
    for (const P of all) P.n = 0;
    const r0 = 115 * lodScale, r1 = 430 * lodScale, r2 = Math.min(camera.far, 2100);
    const r0s = r0 * r0, r1s = r1 * r1, r2s = r2 * r2;
    for (let k = 0; k < cells.length; k++) {
      const B = cellBox[k]; if (!B) continue;
      const dc = B.distanceToPoint(c);
      if (dc > r2 || !frustum.intersectsBox(B)) continue;
      const list = cells[k];
      for (const i of list) {
        const o = i * 16, dx = mats[o + 12] - c.x, dy = mats[o + 13] - c.y, dz = mats[o + 14] - c.z, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < r0s) { if (pine[i]) { put(P0.pineC, i); put(P0.pineT, i); } else { put(P0.oakC, i); put(P0.oakT, i); } }
        else if (d2 < r1s) put(pine[i] ? P1.pine : P1.oak, i);
        else if (d2 < r2s) put(pine[i] ? P2.pine : P2.oak, i);
      }
    }
    for (const P of all) { P.im.count = P.n; P.im.visible = P.n > 0; P.im.instanceMatrix.needsUpdate = true; }
    stats.lod0 = P0.oakC.n + P0.pineC.n; stats.lod1 = P1.oak.n + P1.pine.n; stats.lod2 = P2.oak.n + P2.pine.n;
  }

  // ---------------------------------------------------------------- rocks (instanced, static)
  const rockMat = vmat({ roughness: 0.92 });
  const rockVar = [1, 2, 3].map((k) => {
    const g = lumpy(new THREE.IcosahedronGeometry(1, 2), 0.28, 1.3, k * 10);
    g.scale(1.1, 0.68, 0.9); g.translate(0, 0.25, 0); g.computeVertexNormals();
    const n = g.attributes.position.count, cc = new Float32Array(n * 3), base = lin(env.ground.rock), moss = lin(env.snowCaps ? 0xf2f5f8 : 0x7f8f4c), dark = lin(env.ground.rockD), tc = new THREE.Color(), nr = g.attributes.normal;
    for (let i = 0; i < n; i++) { const u = nr.getY(i); tc.copy(dark).lerp(base, Math.max(0, u * 0.5 + 0.5)); if (u > 0.7) tc.lerp(moss, Math.min(1, (u - 0.7) * (env.snowCaps ? 3.5 : 2.2))); cc[i * 3] = tc.r; cc[i * 3 + 1] = tc.g; cc[i * 3 + 2] = tc.b; }
    g.setAttribute('color', new THREE.BufferAttribute(cc, 3)); g.deleteAttribute('uv');
    return g;
  });
  for (let v = 0; v < 3; v++) {
    const list = world.boulders.filter((b, i) => i % 3 === v);
    if (!list.length) continue;
    const im = new THREE.InstancedMesh(rockVar[v], rockMat, list.length);
    list.forEach((b, i) => { q.setFromEuler(new THREE.Euler((b.seed - 0.5) * 0.4, b.rot, (b.seed * 7 % 1 - 0.5) * 0.4)); p.set(b.x, T.height(b.x, b.z) - b.s * 0.2, b.z); s.set(b.s, b.s, b.s); m4.compose(p, q, s); im.setMatrixAt(i, m4); });
    im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere();
    scene.add(im);
  }

  // ---------------------------------------------------------------- buildings, merged per 512 m block
  const BLK = 512, NB = Math.ceil(S / BLK);
  const buckets = new Map();
  const anim = [];
  // burnable pieces: every vertex range a settlement owns inside a merged block, so a pillaged
  // village chars and its roofs sag, and a rebuilt one comes back (no extra draw calls)
  const BURNABLE = { house: 1, cottage: 1, hay: 1, windmill: 1, abbeySmall: 1, tent: 1, well: 1, campfire: 1 };
  const burnRanges = [];
  const tmpM = new THREE.Matrix4();
  const strip = (g) => {
    let ng = g.index ? g.toNonIndexed() : g.clone();
    for (const k of Object.keys(ng.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') ng.deleteAttribute(k);
    if (!ng.attributes.color) { const c = new Float32Array(ng.attributes.position.count * 3).fill(0.8); ng.setAttribute('color', new THREE.BufferAttribute(c, 3)); }
    if (!ng.attributes.normal) ng.computeVertexNormals();
    return ng;
  };
  for (const pr of world.props) {
    const obj = makeProp(pr, env, T);
    if (!obj) continue;
    obj.updateMatrixWorld(true);
    const px = pr.pos ? pr.pos[0] : pr.a[0], pz = pr.pos ? pr.pos[1] : pr.a[1];
    const key = Math.min(NB - 1, Math.max(0, Math.floor(pz / BLK))) * NB + Math.min(NB - 1, Math.max(0, Math.floor(px / BLK)));
    const sails = obj.userData.sails;
    obj.traverse((o) => {
      if (!o.isMesh) return;
      if (sails && (o.parent === sails)) return;
      const mt = o.material;
      if (!mt || !mt.vertexColors) return;
      const g = strip(o.geometry);
      tmpM.copy(o.matrixWorld);
      g.applyMatrix4(tmpM);
      const side = mt.side === THREE.DoubleSide ? 'd' : 's';
      const bk = key + side;
      if (!buckets.has(bk)) buckets.set(bk, { side, list: [], verts: 0 });
      const B = buckets.get(bk);
      if (pr.settle !== undefined && BURNABLE[pr.type]) burnRanges.push({ bk, start: B.verts, count: g.attributes.position.count, settle: pr.settle });
      B.list.push(g); B.verts += g.attributes.position.count;
    });
    if (sails) { scene.add(obj); obj.traverse((o) => { if (o.isMesh && o.parent !== sails) o.visible = false; }); anim.push(sails); }
  }
  const bmatS = vmat({ roughness: 0.86 }), bmatD = vmat({ roughness: 0.86, side: THREE.DoubleSide });
  let nBatches = 0;
  for (const [, B] of buckets) {
    const g = mergeGeometries(B.list, false);
    if (!g) continue;
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, B.side === 'd' ? bmatD : bmatS);
    B.mesh = m;
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    nBatches++;
    for (const x of B.list) x.dispose();
  }

  // settle id -> its ranges, with the original colours and heights kept for the rebuild
  const bySettle = new Map();
  for (const r of burnRanges) {
    const B = buckets.get(r.bk); if (!B || !B.mesh) continue;
    const g = B.mesh.geometry, P = g.attributes.position, Cc = g.attributes.color;
    r.geo = g; r.col0 = Cc.array.slice(r.start * 3, (r.start + r.count) * 3); r.y0 = new Float32Array(r.count);
    let base = Infinity, top = -Infinity;
    for (let i = 0; i < r.count; i++) { const y = P.getY(r.start + i); r.y0[i] = y; if (y < base) base = y; if (y > top) top = y; }
    r.base = base; r.top = top;
    if (!bySettle.has(r.settle)) bySettle.set(r.settle, []);
    bySettle.get(r.settle).push(r);
  }
  const burnState = new Map();
  let burnCheck = 0;
  function applyBurn(list, burnt) {
    const dirty = new Set();
    for (const r of list) {
      const P = r.geo.attributes.position, Cc = r.geo.attributes.color;
      const h = Math.max(0.1, r.top - r.base);
      for (let i = 0; i < r.count; i++) {
        const j = (r.start + i) * 3;
        if (burnt) {
          // soot over everything, the timber ends glowing faintly; the roof sags into the walls
          const k = (r.y0[i] - r.base) / h, n = ((i * 2654435761) >>> 0) / 4294967296;
          const lum = 0.05 + 0.07 * n + (k < 0.25 ? 0.05 : 0);
          Cc.array[j] = lum * 1.25 + (n > 0.93 ? 0.25 : 0); Cc.array[j + 1] = lum * 1.05; Cc.array[j + 2] = lum * 0.95;
          P.setY(r.start + i, k > 0.45 ? r.base + h * (0.45 + (k - 0.45) * 0.35) : r.y0[i]);
        } else {
          Cc.array[j] = r.col0[i * 3]; Cc.array[j + 1] = r.col0[i * 3 + 1]; Cc.array[j + 2] = r.col0[i * 3 + 2];
          P.setY(r.start + i, r.y0[i]);
        }
      }
      dirty.add(r.geo);
    }
    for (const g of dirty) { g.attributes.color.needsUpdate = true; g.attributes.position.needsUpdate = true; }
  }
  function updateBurn(t) {
    if (!world.war || t - burnCheck < 0.5) return;
    burnCheck = t;
    for (const st of world.war.settlements) {
      const list = bySettle.get(st.id); if (!list) continue;
      const burnt = st.state === 'ravaged' || st.state === 'razed';
      if ((burnState.get(st.id) || false) !== burnt) { burnState.set(st.id, burnt); applyBurn(list, burnt); }
    }
  }

  return {
    uniforms, stats, batches: nBatches,
    burntCount: () => [...burnState.values()].filter(Boolean).length,
    setLodScale(k) { lodScale = k; last = null; },
    update(dt, t, camera) {
      uniforms.uTime.value = t;
      for (const sl of anim) sl.rotation.z -= dt * 0.35;
      updateBurn(t);
      if (camera) updateForest(camera);
    },
    refresh() { last = null; },
  };
}
