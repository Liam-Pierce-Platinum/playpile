// BANNERFALL :: render/realmMap.js - the Long War's war-table diorama (DESIGN.md 19.13).
// A painted relief on a dark oak table: biome colours per province, the main river, snow on the
// northern peaks, ink borders between provinces and the owner's colour washed over its land
// (hatched where an enemy occupies it). Forests are clumps of instanced trees, every seat is a
// miniature (the stone keep for capitals and castles, the timber motte for forts), villages are
// little house clusters, and armies are painted figurines on plinths: a rider with the army's
// banner, the plinth's rim in its kingdom's colour, its size by its men, sliding along the roads
// as it marches. Sieges ring a seat with tents; battles show crossed swords. The season lights it:
// spring green, summer warm, autumn gold, winter blue-white with snow on the relief.
// Budget: well under 150 draw calls, everything instanced, one shadow map.
import * as THREE from '../../vendor/three.module.js';
import { part, merge, rbox, sphere, cyl, cone, box, lin, teamMaterial } from './geo.js';
import { makeProp, TREE_GEO } from './props.js';
import { STRUCT_GEO } from './structureMeshes.js';

const BIOME_COL = {
  spring: 0x8fae5c, forest: 0x5f8a46, river: 0x92b064, farmland: 0xb8b062, marsh: 0x7d8f5a, autumn: 0xb69a52,
  snow: 0xdfe4e8, highland: 0x9a8e70, dusk: 0xa09862, royal: 0x9aa85e,
};
const SEASON_TINT = { Spring: [1.0, 1.04, 0.96], Summer: [1.06, 1.02, 0.9], Autumn: [1.12, 0.96, 0.78], Winter: [0.92, 0.96, 1.04] };
const SEASON_SNOW = { Spring: 0.86, Summer: 0.95, Autumn: 0.82, Winter: 0.55 };
const HS = 560;                         // relief height scale (m): the diorama is exaggerated so it reads

export function buildRealmMap(scene, R) {
  const S = R.size, GN = R.GN;
  const root = new THREE.Group(); scene.add(root);
  const hAt = (x, z) => {
    const fx = Math.max(0, Math.min(GN - 1.001, x / S * GN - 0.5)), fz = Math.max(0, Math.min(GN - 1.001, z / S * GN - 0.5));
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, k = j * GN + i, H = R.height;
    const h = (H[k] * (1 - tx) + H[k + 1] * tx) * (1 - tz) + (H[k + GN] * (1 - tx) + H[k + GN + 1] * tx) * tz;
    return Math.max(0, (h - 0.25)) * HS;
  };
  const cellAt = (x, z) => { const i = Math.max(0, Math.min(GN - 1, Math.floor(x / S * GN))), j = Math.max(0, Math.min(GN - 1, Math.floor(z / S * GN))); return R.grid[j * GN + i]; };

  // ---------------------------------------------------------------- the oak table and its frame
  const tableMat = new THREE.MeshStandardMaterial({ color: 0x4a3222, roughness: 0.75 });
  const table = new THREE.Mesh(new THREE.BoxGeometry(S * 1.5, 60, S * 1.5), tableMat);
  table.position.set(S / 2, -48, S / 2); table.receiveShadow = true; root.add(table);
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x2e1e14, roughness: 0.6 });
  for (const [x, z, w, d] of [[S / 2, -60, S + 240, 120], [S / 2, S + 60, S + 240, 120], [-60, S / 2, 120, S + 240], [S + 60, S / 2, 120, S + 240]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 70, d), frameMat); m.position.set(x, -8, z); m.castShadow = true; m.receiveShadow = true; root.add(m);
  }
  // a parchment skirt the relief sits on (it shows at the map's edge)
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(S, 24, S), new THREE.MeshStandardMaterial({ color: 0xd9c6a0, roughness: 0.9 }));
  skirt.position.set(S / 2, -40, S / 2); skirt.receiveShadow = true; root.add(skirt);

  // ---------------------------------------------------------------- the relief
  const SEG = 300;
  const geo = new THREE.PlaneGeometry(S, S, SEG, SEG);
  geo.rotateX(-Math.PI / 2); geo.translate(S / 2, 0, S / 2);
  const P = geo.attributes.position, NV = P.count;
  for (let i = 0; i < NV; i++) P.setY(i, hAt(P.getX(i), P.getZ(i)));
  // the river bed, cut in
  const river = R.river;
  const segD = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L)); return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); };
  const riverD = new Float32Array(NV);
  for (let i = 0; i < NV; i++) { const x = P.getX(i), z = P.getZ(i); let d = Infinity; for (let k = 1; k < river.length; k++) d = Math.min(d, segD(x, z, river[k - 1], river[k])); riverD[i] = d; if (d < 34) P.setY(i, P.getY(i) - (1 - d / 34) * 9); }
  geo.computeVertexNormals();
  const colors = new Float32Array(NV * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const reliefMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, flatShading: false });
  const relief = new THREE.Mesh(geo, reliefMat);
  relief.receiveShadow = true; relief.castShadow = false;
  root.add(relief);
  const vCell = new Int16Array(NV);
  for (let i = 0; i < NV; i++) vCell[i] = cellAt(P.getX(i), P.getZ(i));
  // a province border lies where a nearby sample belongs to another province
  const vEdge = new Float32Array(NV), vOther = new Int16Array(NV).fill(-1);
  const step = S / SEG;
  for (let i = 0; i < NV; i++) {
    const x = P.getX(i), z = P.getZ(i), c = vCell[i];
    let e = 0;
    for (const [dx, dz, w] of [[step * 0.7, 0, 1], [-step * 0.7, 0, 1], [0, step * 0.7, 1], [0, -step * 0.7, 1], [step * 0.5, step * 0.5, 1], [-step * 0.5, step * 0.5, 1], [step * 0.5, -step * 0.5, 1], [-step * 0.5, -step * 0.5, 1], [step * 1.7, 0, 0.5], [-step * 1.7, 0, 0.5], [0, step * 1.7, 0.5], [0, -step * 1.7, 0.5]]) {
      const o = cellAt(x + dx, z + dz);
      if (o !== c) { e = Math.max(e, w); vOther[i] = o; }
    }
    vEdge[i] = e;
  }
  const hatch = (x, z) => ((Math.floor((x + z) / 26) & 1) === 0);
  let colourKey = '';
  const tmp = new THREE.Color(), tint = new THREE.Color();
  const N = new THREE.Vector3();
  function paint(sel = -1) {
    const tn = SEASON_TINT[R.season] || [1, 1, 1], snowAt = SEASON_SNOW[R.season] || 0.9;
    const owners = R.provinces.map((p) => p.owner);
    const key = R.season + '|' + owners.join(',') + '|' + sel + '|' + R.provinces.map((p) => (p.siegedBy && p.siegedBy !== -1 ? 1 : 0)).join('');
    if (key === colourKey) return;
    colourKey = key;
    const Nn = geo.attributes.normal;
    for (let i = 0; i < NV; i++) {
      const c = vCell[i], Pv = R.provinces[c];
      tmp.setHex(BIOME_COL[Pv.biome] || 0x8fae5c).convertSRGBToLinear();
      const y = P.getY(i), x = P.getX(i), z = P.getZ(i);
      // slope and height: rock on steep faces, snow on the peaks (lower in winter)
      N.set(Nn.getX(i), Nn.getY(i), Nn.getZ(i));
      const slope = 1 - N.y;
      if (slope > 0.22) tmp.lerp(tint.setHex(0x8a8070).convertSRGBToLinear(), Math.min(1, (slope - 0.22) * 3));
      const hn = y / HS;
      if (hn > snowAt * 0.95 || (R.season === 'Winter' && (Pv.biome === 'snow' || Pv.biome === 'highland' || z / S > 0.7))) tmp.lerp(tint.setHex(0xf2f5f8).convertSRGBToLinear(), Math.min(1, R.season === 'Winter' ? 0.85 : (hn - snowAt * 0.95) * 6));
      // fields: farmland is a patchwork
      if (Pv.biome === 'farmland' && slope < 0.15) { const f = (Math.floor(x / 70) * 7 + Math.floor(z / 52) * 13) % 4; tmp.multiplyScalar([0.92, 1.05, 0.98, 1.1][f]); }
      // hill shading from the north-west, so the relief reads like a painted map
      const shade = 0.62 + 0.55 * Math.max(0, N.x * -0.45 + N.y * 0.75 + N.z * 0.48);
      tmp.multiplyScalar(Math.min(1.25, shade));
      // a little noise so it reads as painted, not flat
      tmp.multiplyScalar(0.94 + ((i * 2654435761) >>> 0) % 1000 / 1000 * 0.1);
      tmp.r *= tn[0]; tmp.g *= tn[1]; tmp.b *= tn[2];
      // the river
      if (riverD[i] < 26) tmp.lerp(tint.setHex(R.season === 'Winter' ? 0xb8cad8 : 0x5f8fa8).convertSRGBToLinear(), Math.min(1, (1 - riverD[i] / 26) * 1.6));
      // the owner's wash, hatched over a besieged province; the selected province glows
      if (Pv.owner >= 0) {
        const K = R.kingdoms[Pv.owner];
        tint.setHex(K.main).convertSRGBToLinear();
        let k = 0.3;
        if (Pv.siegedBy && Pv.siegedBy !== -1 && hatch(x, z)) k = 0.55;
        tmp.lerp(tint, k);
      }
      if (c === sel) tmp.multiplyScalar(1.25);
      // ink borders: thin between provinces, heavier and in colour between kingdoms
      if (vEdge[i] > 0) {
        const o = vOther[i] >= 0 ? R.provinces[vOther[i]] : null;
        const realmBorder = o && o.owner !== Pv.owner;
        if (realmBorder && Pv.owner >= 0) { tint.setHex(R.kingdoms[Pv.owner].main).convertSRGBToLinear().multiplyScalar(0.75); tmp.lerp(tint, 0.85 * vEdge[i]); }
        else tmp.lerp(tint.setRGB(0.06, 0.045, 0.03), (realmBorder ? 0.75 : 0.42) * vEdge[i]);
      }
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    geo.attributes.color.needsUpdate = true;
  }

  // ---------------------------------------------------------------- forests: instanced tree clumps
  const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const { oakCanopy, oakTrunk, pineCanopy, pineTrunk } = TREE_GEO;
  const env = { oak: [0x7fa04a, 0x34512a], pine: [0x5f8a46, 0x223d26] };
  const oakG = merge([oakCanopy(1, env), oakTrunk()]), pineG = merge([pineCanopy(env), pineTrunk()]);
  const trees = { oak: [], pine: [] };
  let seed = R.seed;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let t = 0; t < 11000; t++) {
    const x = 40 + rnd() * (S - 80), z = 40 + rnd() * (S - 80);
    const c = cellAt(x, z), Pv = R.provinces[c];
    const dens = { forest: 0.55, autumn: 0.16, spring: 0.12, highland: 0.1, snow: 0.12, marsh: 0.08, river: 0.08, dusk: 0.1, farmland: 0.03 }[Pv.biome] || 0.05;
    if (rnd() > dens) continue;
    // clumps: thin out where low-frequency noise says "clearing"
    if (Math.sin(x / 140 + Math.cos(z / 170) * 2) + Math.cos(z / 120) < -0.4 && Pv.biome !== 'forest') continue;
    let d = Infinity; for (let k = 1; k < river.length; k++) d = Math.min(d, segD(x, z, river[k - 1], river[k])); if (d < 40) continue;
    if (Math.hypot(x - Pv.pos[0], z - Pv.pos[1]) < 90) continue;
    const pine = Pv.biome === 'snow' || Pv.biome === 'highland' || (Pv.biome === 'forest' && rnd() < 0.4) || z / S > 0.7;
    (pine ? trees.pine : trees.oak).push([x, hAt(x, z), z, 6.5 + rnd() * 3.5, rnd() * 6.28]);
  }
  const treeMeshes = [];
  for (const [k, g] of [['oak', oakG], ['pine', pineG]]) {
    const list = trees[k]; if (!list.length) continue;
    const im = new THREE.InstancedMesh(g, treeMat, list.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    list.forEach((t, i) => { q.setFromAxisAngle(up, t[4]); m4.compose(new THREE.Vector3(t[0], t[1] - 1, t[2]), q, new THREE.Vector3(t[3], t[3] * (k === 'pine' ? 1.25 : 1), t[3])); im.setMatrixAt(i, m4); });
    im.castShadow = true; im.receiveShadow = true;
    root.add(im); treeMeshes.push(im);
  }

  // ---------------------------------------------------------------- seats and villages
  const seatGroup = new THREE.Group(); root.add(seatGroup);
  const stoneKeep = (() => { const k = makeProp({ type: 'keep', pos: [0, 0], small: false }, {}, { height: () => 0 }); return k.geometry.clone(); })();
  const timberKeep = STRUCT_GEO.timberKeepGeo();
  const seatMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  const flagGeo = new THREE.PlaneGeometry(1, 0.62, 6, 1); flagGeo.translate(0.5, 0, 0);
  const poleGeo = cyl(0.06, 0.08, 1, 6); poleGeo.translate(0, 0.5, 0);
  const flagMat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.8 });
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1c });
  const flags = new THREE.InstancedMesh(flagGeo, flagMat, 64); flags.count = 0; flags.castShadow = true; root.add(flags);
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, 64); poles.count = 0; root.add(poles);
  const houseG = merge([part(box(1, 0.8, 1.3), 0xe8dcc0, { pos: [0, 0.4, 0] }), part(new THREE.ConeGeometry(0.95, 0.7, 4), 0x8e4a34, { pos: [0, 1.15, 0], rot: [0, Math.PI / 4, 0], scale: [1, 1, 1.3] })]);
  const houseMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  let nHouses = 0; for (const Pv of R.provinces) nHouses += Pv.villages.length * 4;
  const houses = new THREE.InstancedMesh(houseG, houseMat, nHouses); houses.castShadow = true; houses.receiveShadow = true; root.add(houses);
  houses.setColorAt(0, new THREE.Color(1, 1, 1));
  const tentG = merge([part(cone(1, 1.4, 6), 0xe6dcc4, { pos: [0, 0.7, 0] })]);
  const tents = new THREE.InstancedMesh(tentG, teamMaterial({ roughness: 0.85 }), 400); tents.count = 0; root.add(tents);
  const villagePos = [];
  {
    const m4 = new THREE.Matrix4(); let n = 0;
    for (const Pv of R.provinces) {
      Pv.villages.forEach((v, vi) => {
        const a = vi * 2.4 + Pv.id, d = 230 + (vi % 2) * 80;
        const cx = Pv.pos[0] + Math.cos(a) * d, cz = Pv.pos[1] + Math.sin(a) * d;
        villagePos.push({ p: Pv.id, vi, x: cx, z: cz });
        for (let h = 0; h < 4; h++) {
          const x = cx + Math.cos(h * 1.7 + a) * 24 * (h ? 1 : 0), z = cz + Math.sin(h * 1.7 + a) * 24 * (h ? 1 : 0);
          m4.compose(new THREE.Vector3(x, hAt(x, z), z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a + h), new THREE.Vector3(17, 17, 17));
          houses.setMatrixAt(n++, m4);
        }
      });
    }
    houses.count = n;
  }
  const seatMeshes = new Map();
  let camYaw = 0, camDist = 2600;
  function syncSeats() {
    const want = new Set();
    for (const Pv of R.provinces) {
      if (Pv.seat === 'none') continue;
      const keyS = Pv.id + Pv.seat;
      want.add(keyS);
      if (seatMeshes.has(keyS)) continue;
      const m = new THREE.Mesh(Pv.seat === 'stronghold' || Pv.seat === 'outpost' ? timberKeep : stoneKeep, seatMat);
      const sc = Pv.seat === 'capital' ? 6.2 : Pv.seat === 'castle' ? 4.6 : 5.2;
      m.scale.setScalar(sc);
      m.position.set(Pv.pos[0], hAt(Pv.pos[0], Pv.pos[1]) - 2, Pv.pos[1]);
      m.rotation.y = Pv.id * 0.7;
      m.castShadow = true; m.receiveShadow = true;
      seatGroup.add(m); seatMeshes.set(keyS, m);
    }
    for (const [k, m] of seatMeshes) if (!want.has(k)) { seatGroup.remove(m); seatMeshes.delete(k); }
  }
  function syncFlags(t) {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    let n = 0;
    for (const Pv of R.provinces) {
      if (Pv.seat === 'none' || Pv.owner < 0) continue;
      const K = R.kingdoms[Pv.owner];
      const top = (Pv.seat === 'capital' ? 30 * 6.2 : Pv.seat === 'castle' ? 30 * 4.6 : 20 * 5.2) + hAt(Pv.pos[0], Pv.pos[1]);
      const px = Pv.pos[0] + 40, pz = Pv.pos[1];
      m4.compose(new THREE.Vector3(px, top - 60, pz), q.identity(), new THREE.Vector3(8, 110, 8)); poles.setMatrixAt(n, m4);
      // the flag turns broadside to the viewer and ripples a little
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), camYaw + Math.sin(t * 1.3 + Pv.id) * 0.25);
      m4.compose(new THREE.Vector3(px, top + 32, pz), q, new THREE.Vector3(Pv.seat === 'capital' ? 92 : 70, Pv.seat === 'capital' ? 92 : 70, 1));
      flags.setMatrixAt(n, m4); flags.setColorAt(n, col.setHex(K.main).convertSRGBToLinear());
      n++;
    }
    flags.count = poles.count = n;
    flags.instanceMatrix.needsUpdate = poles.instanceMatrix.needsUpdate = true;
    if (flags.instanceColor) flags.instanceColor.needsUpdate = true;
    // villages: burnt ones go dark
    let h = 0;
    for (const v of villagePos) {
      const st = R.provinces[v.p].villages[v.vi].state;
      for (let k = 0; k < 4; k++) houses.setColorAt(h++, col.setScalar(st === 'ravaged' ? 0.32 : 1));
    }
    if (houses.instanceColor) houses.instanceColor.needsUpdate = true;
  }

  // ---------------------------------------------------------------- armies: figurines on plinths
  const figMat = teamMaterial({ roughness: 0.6 });
  const plinthG = merge([
    part(cyl(1.15, 1.25, 0.32, 24), 0x3a2a1c, { pos: [0, 0.16, 0] }),
    part(cyl(1.18, 1.18, 0.1, 24), 1, { pos: [0, 0.34, 0], team: 1 }),
    part(cyl(1.0, 1.0, 0.04, 24), 1, { pos: [0, 0.41, 0], team: 1, shade: 1.25 }),
  ]);
  const riderG = merge([
    // horse
    part(rbox(0.42, 0.42, 1.1, 0.14), 0x6a4a30, { pos: [0, 0.95, 0] }),
    part(rbox(0.22, 0.42, 0.26, 0.08), 0x6a4a30, { pos: [0, 1.25, 0.55], rot: [-0.5, 0, 0] }),
    ...[[-0.15, -0.38], [0.15, -0.38], [-0.15, 0.38], [0.15, 0.38]].map(([x, z]) => part(cyl(0.06, 0.05, 0.62, 6), 0x5a3e28, { pos: [x, 0.55, z] })),
    part(rbox(0.46, 0.18, 0.5, 0.05), 1, { pos: [0, 1.18, -0.05], team: 1 }),
    // rider
    part(rbox(0.3, 0.46, 0.24, 0.08), 1, { pos: [0, 1.55, -0.05], team: 1 }),
    part(sphere(0.13, 10, 8), 0xb8b8bc, { pos: [0, 1.9, -0.05] }),
    part(cyl(0.025, 0.025, 1.3, 5), 0x4a3424, { pos: [0.22, 1.85, 0.1], rot: [0.25, 0, 0] }),
  ]);
  const bannerG = merge([
    part(cyl(0.03, 0.03, 2.2, 5), 0x3a2a1c, { pos: [-0.75, 1.45, -0.3] }),
    part(box(0.7, 0.9, 0.03), 1, { pos: [-0.38, 2.15, -0.3], team: 1 }),
    part(box(0.7, 0.12, 0.035), 0xd8b048, { pos: [-0.38, 2.6, -0.3] }),
  ]);
  const AC = 80;
  const plinths = new THREE.InstancedMesh(plinthG, figMat, AC), riders = new THREE.InstancedMesh(riderG, figMat, AC), banners = new THREE.InstancedMesh(bannerG, figMat, AC);
  for (const im of [plinths, riders, banners]) { im.count = 0; im.castShadow = true; im.setColorAt(0, new THREE.Color(1, 1, 1)); root.add(im); }
  const armyPos = new Map();
  function armyWorld(A) {
    if (!A.edge) return R.provinces[A.prov].pos;
    const a = R.provinces[A.edge.from].pos, b = R.provinces[A.edge.to].pos, k = Math.min(1, A.edge.t / A.edge.days);
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  }
  function syncArmies(dt, t, visible) {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    let n = 0;
    const byProv = new Map();
    for (const A of R.armies) {
      if (!A.squads.length || (visible && !visible(A))) continue;
      const w = armyWorld(A);
      // armies standing in one province spread out around its seat
      const k = A.edge ? 0 : (byProv.get(A.prov) || 0);
      if (!A.edge) byProv.set(A.prov, k + 1);
      const off = A.edge ? [0, 0] : [Math.cos(k * 2.1 + 0.6) * (170 + k * 40), Math.sin(k * 2.1 + 0.6) * (170 + k * 40)];
      const target = [w[0] + off[0], w[1] + off[1]];
      let p = armyPos.get(A.id);
      if (!p) { p = { x: target[0], z: target[1], f: 0 }; armyPos.set(A.id, p); }
      p.x += (target[0] - p.x) * Math.min(1, dt * 3); p.z += (target[1] - p.z) * Math.min(1, dt * 3);
      const dir = A.edge ? Math.atan2(R.provinces[A.edge.to].pos[0] - R.provinces[A.edge.from].pos[0], R.provinces[A.edge.to].pos[1] - R.provinces[A.edge.from].pos[1]) : p.f;
      p.f = dir;
      let men = 0; for (const s of A.squads) men += s.men;
      const sc = (38 + Math.min(46, Math.sqrt(men) * 1.6)) * Math.max(1, camDist / 2600);
      const bob = A.edge ? Math.abs(Math.sin(t * 4 + p.x)) * 2.5 : 0;
      const y = hAt(p.x, p.z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), dir);
      col.setHex(R.kingdoms[A.kingdom].main).convertSRGBToLinear();
      m4.compose(new THREE.Vector3(p.x, y, p.z), q, new THREE.Vector3(sc, sc, sc)); plinths.setMatrixAt(n, m4); plinths.setColorAt(n, col);
      // the rider and his banner stand tall on the plinth so the figurine reads from the war table's height
      m4.compose(new THREE.Vector3(p.x, y + bob, p.z), q, new THREE.Vector3(sc * 1.25, sc * 1.6, sc * 1.25)); riders.setMatrixAt(n, m4); riders.setColorAt(n, col); banners.setMatrixAt(n, m4); banners.setColorAt(n, col);
      p.n = n; p.sc = sc; p.y = y;
      n++;
      if (n >= AC) break;
    }
    for (const im of [plinths, riders, banners]) { im.count = n; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
    for (const id of [...armyPos.keys()]) if (!R.armies.some((A) => A.id === id)) armyPos.delete(id);
    // siege camps: a ring of tents around every besieged seat
    let nt = 0;
    for (const Pv of R.provinces) {
      if (!Pv.siegedBy || Pv.siegedBy === -1) continue;
      const A = R.armies.find((x) => x.id === Pv.siegedBy); if (!A) continue;
      col.setHex(R.kingdoms[A.kingdom].main).convertSRGBToLinear();
      for (let i = 0; i < 9 && nt < 400; i++) {
        const a = i / 9 * Math.PI * 2, r = 210 + (i % 2) * 30, x = Pv.pos[0] + Math.cos(a) * r, z = Pv.pos[1] + Math.sin(a) * r;
        m4.compose(new THREE.Vector3(x, hAt(x, z), z), q.identity(), new THREE.Vector3(22, 22, 22)); tents.setMatrixAt(nt, m4); tents.setColorAt(nt, col); nt++;
      }
    }
    tents.count = nt; tents.instanceMatrix.needsUpdate = true; if (tents.instanceColor) tents.instanceColor.needsUpdate = true;
  }

  // ---------------------------------------------------------------- the marching path preview
  const pathMat = new THREE.LineDashedMaterial({ color: 0xfff1c4, dashSize: 26, gapSize: 16, transparent: true, opacity: 0.95, depthTest: false });
  let pathLine = null;
  function showPath(from, path, color = 0xfff1c4) {
    if (pathLine) { root.remove(pathLine); pathLine.geometry.dispose(); pathLine = null; }
    if (!path || !path.length) return;
    const pts = [];
    const ids = [from, ...path];
    for (let i = 1; i < ids.length; i++) {
      const a = R.provinces[ids[i - 1]].pos, b = R.provinces[ids[i]].pos;
      for (let k = 0; k <= 12; k++) { const x = a[0] + (b[0] - a[0]) * k / 12, z = a[1] + (b[1] - a[1]) * k / 12; pts.push(new THREE.Vector3(x, hAt(x, z) + 14, z)); }
    }
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    pathLine = new THREE.Line(g, pathMat); pathLine.computeLineDistances(); pathLine.renderOrder = 9;
    pathMat.color.setHex(color);
    root.add(pathLine);
  }

  // ---------------------------------------------------------------- picking and labels
  function provinceAt(x, z) { if (x < 0 || z < 0 || x > S || z > S) return -1; return cellAt(x, z); }
  function armyAt(x, z) {
    let best = null, bd = Infinity;
    for (const A of R.armies) { const p = armyPos.get(A.id); if (!p) continue; const d = Math.hypot(p.x - x, p.z - z); if (d < Math.max(60, (p.sc || 30) * 1.6) && d < bd) { bd = d; best = A; } }
    return best;
  }
  paint(); syncSeats();
  return {
    root, heightAt: hAt, provinceAt, armyAt, armyPos, showPath, paint,
    update(dt, t, opts = {}) { camYaw = opts.yaw || 0; camDist = opts.dist || 2600; paint(opts.sel ?? -1); syncSeats(); syncFlags(t); syncArmies(dt, t, opts.visible); },
    dispose() { scene.remove(root); root.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); },
    stats() { return { trees: trees.oak.length + trees.pine.length, seats: seatMeshes.size, houses: houses.count }; },
  };
}
