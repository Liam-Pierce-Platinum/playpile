// The neighbourhood. A 3 x 3 grid of blocks between wet streets; every block has a back alley
// down the middle, a row of buildings facing each street, and fenced yards between the backs of
// the buildings and the alley. Lots are row houses, walk-through apartment buildings (stoop,
// corridor, stairwell, upper corridor, fire escape down the back), narrow gaps between
// buildings, vacant lots, parking lots with half-shut roll gates and corner stores.
// Everything solid is also written into the collision boxes, so the monster's nav grid and the
// player's collision are generated from the same source as the pictures.
import * as THREE from 'three';
import { pbr, rng as makeRng } from './assets.js';
import { Bucket, Frame, beam } from './geo.js';
import { makeWet } from './wet.js';
import { interiorMaterial } from './interiors.js';
import { signMaterial } from './signs.js';
import { Statics, SOLID, VAULT, LOW } from './collide.js';
import * as TX from './textures.js';

export const CURB = 0.15, FH = 3.4;
const RD = 3.6, SWK = 2.4, SH = RD + SWK;
const BW = 60, BD = 46, AL = 1.8;
export const XS = [-108, -36, 36, 108], ZS = [-87, -29, 29, 87];
export const BOUNDS = { x0: -128, x1: 128, z0: -107, z1: 107 };
const CH = 40;

export function buildWorld(scene, ctx) {
  const R = makeRng(ctx.seed || 4417);
  const S = new Statics(4);
  const W = {
    statics: S, doors: [], propSpots: [], lampVirtuals: [], pointVirtuals: [], lightSources: [],
    flicker: [], roadRects: [], walkRects: [], spawns: [], lanterns: [], interiorZones: [],
    lampSpots: [], cars: [], hydrants: [], acs: [], bags: [], cans: [], deadEnds: [], buildings: [],
  };
  const envTex = ctx.envEquirect;
  const signs = [];

  // ---------------- materials ----------------
  const M = {};
  M.asphalt = makeWet(pbr('asphalt_02', { envMapIntensity: 0.3 }), { puddle: 0.585 });
  M.walk = makeWet(pbr('concrete_pavement', { envMapIntensity: 0.35, color: 0xb0ada6 }), { puddle: 0.64 });
  M.curb = makeWet(pbr('concrete_floor_worn_001', { color: 0xa8a49c, envMapIntensity: 0.35 }), { puddle: 0.9 });
  M.alley = makeWet(pbr('concrete_floor_worn_001', { color: 0x8c877e, envMapIntensity: 0.35 }), { puddle: 0.5, rippleScale: 0.5 });
  M.mud = makeWet(pbr('concrete_floor_worn_001', { color: 0x4f4232, envMapIntensity: 0.25 }), { puddle: 0.5 });
  M.yard = makeWet(pbr('concrete_pavement', { color: 0x8e8b84, envMapIntensity: 0.3 }), { puddle: 0.58 });
  const wear = ctx.puddleTex.clone();
  const paint = (c) => makeWet(new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, alphaMap: wear, alphaTest: 0.36, envMapIntensity: 0.4 }), { puddle: 0.6 });
  M.white = paint(0xcfccc2); M.yellow = paint(0xc8961c);
  const wallDefs = { red_brick: 1.4, brick_wall_10: 1.9, red_bricks_04: 2.5, concrete_wall_006: 2.0, plastered_wall_04: 3.2 };
  const walls = {};
  for (const k in wallDefs) walls[k] = makeWet(pbr(k, { envMapIntensity: 0.4 }), { puddle: 9, wet: 0.35, grime: true });
  walls.plaster_cream = makeWet(pbr('plastered_wall_04', { color: 0xc9b998, envMapIntensity: 0.4 }), { puddle: 9, wet: 0.35, grime: true });
  walls.plaster_green = makeWet(pbr('plastered_wall_04', { color: 0x8fa08c, envMapIntensity: 0.4 }), { puddle: 9, wet: 0.35, grime: true });
  walls.plaster_grey = makeWet(pbr('plastered_wall_04', { color: 0x868b90, envMapIntensity: 0.4 }), { puddle: 9, wet: 0.35, grime: true });
  const TS = { ...wallDefs, plaster_cream: 3.2, plaster_green: 3.2, plaster_grey: 3.2 };
  M.trim = makeWet(pbr('concrete_floor_worn_001', { color: 0xb9b3a6, envMapIntensity: 0.4 }), { puddle: 9, wet: 0.35, grime: true });
  M.roof = pbr('concrete_floor_worn_001', { color: 0x34322f });
  M.frameDark = new THREE.MeshStandardMaterial({ color: 0x141617, roughness: 0.38, metalness: 0.35 });
  M.frameLight = new THREE.MeshStandardMaterial({ color: 0xa9a499, roughness: 0.45 });
  M.frameGreen = new THREE.MeshStandardMaterial({ color: 0x1b2b22, roughness: 0.4, metalness: 0.2 });
  M.metal = new THREE.MeshStandardMaterial({ color: 0x1c1d1e, roughness: 0.42, metalness: 0.75 });
  M.galv = new THREE.MeshStandardMaterial({ color: 0x7d8186, roughness: 0.35, metalness: 0.8 });
  const wood = TX.woodPlanks();
  M.wood = makeWet(new THREE.MeshStandardMaterial({ map: wood.map, normalMap: wood.normalMap, roughness: 0.75, side: THREE.DoubleSide, envMapIntensity: 0.3 }), { puddle: 9, wet: 0.6 });
  M.chain = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, map: TX.chainLink(), alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.85, roughness: 0.35, envMapIntensity: 0.8 });
  const sh = TX.paintedMetal(0x6f7378, { rust: 0.35, ribs: 24, seed: 4 });
  M.shutter = new THREE.MeshStandardMaterial({ map: sh.map, normalMap: sh.normalMap, roughness: 0.42, metalness: 0.6 });
  const dmp = TX.paintedMetal(0x1f4a2e, { rust: 0.6, ribs: 6, seed: 9 });
  M.dumpster = new THREE.MeshStandardMaterial({ map: dmp.map, normalMap: dmp.normalMap, roughness: 0.5, metalness: 0.4 });
  const dmp2 = TX.paintedMetal(0x23395c, { rust: 0.5, ribs: 6, seed: 2 });
  M.dumpster2 = new THREE.MeshStandardMaterial({ map: dmp2.map, normalMap: dmp2.normalMap, roughness: 0.5, metalness: 0.4 });
  M.glass = interiorMaterial(envTex);
  M.stoop = makeWet(pbr('concrete_floor_worn_001', { color: 0x9c968c, envMapIntensity: 0.4 }), { puddle: 9, wet: 0.7 });
  // inside
  M.intWall = makeWet(pbr('plastered_wall_04', { color: 0x9aa58c, envMapIntensity: 0.15 }), { puddle: 9, wet: 0, grime: true });
  M.intWall2 = makeWet(pbr('plastered_wall_04', { color: 0xb3a689, envMapIntensity: 0.15 }), { puddle: 9, wet: 0, grime: true });
  M.intCeil = pbr('plastered_wall_04', { color: 0x9c988e, envMapIntensity: 0.1 });
  M.lino = new THREE.MeshStandardMaterial({ map: TX.linoleum(), roughness: 0.32, envMapIntensity: 0.35 });
  M.stair = pbr('concrete_floor_worn_001', { color: 0x77736c, envMapIntensity: 0.2 });
  M.fixture = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xe8f0dc, emissiveIntensity: 3.5, roughness: 0.4 });
  M.fixtureOff = new THREE.MeshStandardMaterial({ color: 0x3a3a38, roughness: 0.5 });
  M.rail = new THREE.MeshStandardMaterial({ color: 0x2b2420, roughness: 0.5, metalness: 0.3 });
  const doorCols = [0x3b1f16, 0x1e3326, 0x5a1c17, 0x23272d, 0x4a3a22];
  M.unitDoors = doorCols.map((c, i) => new THREE.MeshStandardMaterial({ map: TX.doorTexture(c, String(1 + i) + String.fromCharCode(65 + i)), roughness: 0.55 }));
  M.extDoors = doorCols.map(c => makeWet(new THREE.MeshStandardMaterial({ map: TX.doorTexture(c), roughness: 0.4 }), { puddle: 9, wet: 0.5 }));
  M.graffiti = [1, 2, 3, 4, 5, 6].map(s => new THREE.MeshStandardMaterial({ map: TX.graffiti(s), transparent: true, depthWrite: false, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, envMapIntensity: 0.3 }));
  W.M = M;

  // ---------------- buckets (one per material per 40 m chunk, for culling) ----------------
  const B = new Map();
  let chunk = '0';
  const setChunk = (x, z) => { chunk = Math.floor((x + 200) / CH) + ':' + Math.floor((z + 200) / CH); };
  const bucket = (mat, extra) => {
    const k = mat.uuid + '|' + chunk;
    let b = B.get(k); if (!b) B.set(k, b = new Bucket(mat, extra)); return b;
  };
  const glassB = () => bucket(M.glass, { aTan: 3, aInfo: 4, aKind: 1 });
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

  // horizontal quad facing up (or down)
  const flat = (mat, x0, x1, z0, z1, y, ts, down = false) => {
    const b = bucket(mat);
    const a = V3(x0, y, z1), bb = V3(x1, y, z1), c = V3(x1, y, z0), d = V3(x0, y, z0);
    const uv = [[x0 / ts, -z1 / ts], [x1 / ts, -z1 / ts], [x1 / ts, -z0 / ts], [x0 / ts, -z0 / ts]];
    if (down) b.quad(d, c, bb, a, [uv[3], uv[2], uv[1], uv[0]]); else b.quad(a, bb, c, d, uv);
  };
  const flatTiled = (mat, x0, x1, z0, z1, y, ts, step = 10) => {
    const nx = Math.max(1, Math.ceil((x1 - x0) / step)), nz = Math.max(1, Math.ceil((z1 - z0) / step));
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const ax = x0 + (x1 - x0) * i / nx, bx = x0 + (x1 - x0) * (i + 1) / nx, az = z0 + (z1 - z0) * j / nz, bz = z0 + (z1 - z0) * (j + 1) / nz;
      setChunk((ax + bx) / 2, (az + bz) / 2);
      flat(mat, ax, bx, az, bz, y, ts);
    }
  };
  // vertical quad: x-facing (normal +x or -x) or z-facing
  const vquad = (mat, axis, c, a0, a1, y0, y1, nsign, ts, uoff = 0) => {
    if (a1 - a0 < 1e-4 || y1 - y0 < 1e-4) return;
    const b = bucket(mat);
    const U = (v) => (v + uoff) / ts, Vv = (v) => v / ts;
    if (axis === 'x') {   // plane x = c, spans z a0..a1
      const p = [V3(c, y0, a0), V3(c, y0, a1), V3(c, y1, a1), V3(c, y1, a0)];
      const uv = [[U(a0), Vv(y0)], [U(a1), Vv(y0)], [U(a1), Vv(y1)], [U(a0), Vv(y1)]];
      if (nsign > 0) b.quad(p[1], p[0], p[3], p[2], [uv[1], uv[0], uv[3], uv[2]]); else b.quad(p[0], p[1], p[2], p[3], uv);
    } else {              // plane z = c, spans x a0..a1
      const p = [V3(a0, y0, c), V3(a1, y0, c), V3(a1, y1, c), V3(a0, y1, c)];
      const uv = [[U(a0), Vv(y0)], [U(a1), Vv(y0)], [U(a1), Vv(y1)], [U(a0), Vv(y1)]];
      if (nsign > 0) b.quad(p[0], p[1], p[2], p[3], uv); else b.quad(p[1], p[0], p[3], p[2], [uv[1], uv[0], uv[3], uv[2]]);
    }
  };
  // world-aligned box with chosen faces: px nx py ny pz nz
  const ALL = 'px nx py ny pz nz';
  const vbox = (mat, x0, x1, y0, y1, z0, z1, ts = 1, faces = ALL) => {
    if (faces.includes('px')) vquad(mat, 'x', x1, z0, z1, y0, y1, 1, ts);
    if (faces.includes('nx')) vquad(mat, 'x', x0, z0, z1, y0, y1, -1, ts);
    if (faces.includes('pz')) vquad(mat, 'z', z1, x0, x1, y0, y1, 1, ts);
    if (faces.includes('nz')) vquad(mat, 'z', z0, x0, x1, y0, y1, -1, ts);
    if (faces.includes('py')) flat(mat, x0, x1, z0, z1, y1, ts);
    if (faces.includes('ny')) flat(mat, x0, x1, z0, z1, y0, ts, true);
  };

  // ---------------- lights ----------------
  const warm = new THREE.Color(1.0, 0.66, 0.34);        // sodium
  const lantern = (pos, n, opts = {}) => {
    W.lanterns.push({ pos: pos.clone(), n: n.clone() });
    const c = pos.clone().addScaledVector(n, 0.4).add(V3(0, -0.35, 0));
    const fl = opts.flick ?? (R() < 0.18 ? 1 : 0);
    const v = { pos: c.clone().addScaledVector(n, 0.2), color: new THREE.Color(0xffa860), intensity: 7, distance: 9, flick: fl, seed: R() * 100, glow: [] };
    W.pointVirtuals.push(v);
    W.lightSources.push({ pos: c, color: new THREE.Color(0xffb070), strength: 0.7, v });
    v.glowPos = c;
    return v;
  };
  const ceilingLight = (x, y, z, alongX) => {
    const r = R(); const fl = r < 0.25 ? 1 : r < 0.33 ? 2 : 0;
    const L = 1.2, w = 0.16;
    const b0 = alongX ? [x - L / 2, x + L / 2, z - w / 2, z + w / 2] : [x - w / 2, x + w / 2, z - L / 2, z + L / 2];
    vbox(fl === 2 ? M.fixtureOff : M.fixture, b0[0], b0[1], y - 0.06, y, b0[2], b0[3], 1, 'ny px nx pz nz');
    const v = { pos: V3(x, y - 0.25, z), color: new THREE.Color(0.86, 0.95, 0.8), intensity: fl === 2 ? 0 : 9, distance: 9, flick: fl, seed: R() * 100, indoor: true };
    if (fl !== 2) W.pointVirtuals.push(v);
    return v;
  };

  // ---------------- streets ----------------
  const X0 = XS[0] - SH, X1 = XS[3] + SH, Z0 = ZS[0] - SH, Z1 = ZS[3] + SH;
  for (const z of ZS) W.roadRects.push([X0, X1, z - RD, z + RD]);
  for (const x of XS) for (let j = 0; j < 3; j++) W.roadRects.push([x - RD, x + RD, ZS[j] + RD, ZS[j + 1] - RD]);
  for (const r of W.roadRects) { flatTiled(M.asphalt, r[0], r[1], r[2], r[3], 0, 3.2, 12); S.box(r[0], r[1], -1, 0, r[2], r[3], SOLID, { road: true }); }
  // markings: double yellow centre lines, crosswalks
  for (const z of ZS) for (let i = 0; i < 4; i++) {
    const xa = (i === 0 ? X0 : XS[i - 1] + SH + 2), xb = (i === 3 ? X1 : XS[i] - SH - 2);
    if (i > 0) { setChunk((xa + xb) / 2, z); flat(M.yellow, xa, xb, z + 0.08, z + 0.2, 0.006, 4); flat(M.yellow, xa, xb, z - 0.2, z - 0.08, 0.006, 4); }
  }
  for (const x of XS) for (let j = 0; j < 3; j++) {
    const za = ZS[j] + SH + 2, zb = ZS[j + 1] - SH - 2;
    setChunk(x, (za + zb) / 2); flat(M.yellow, x + 0.08, x + 0.2, za, zb, 0.006, 4); flat(M.yellow, x - 0.2, x - 0.08, za, zb, 0.006, 4);
  }
  for (const x of XS) for (const z of ZS) {
    setChunk(x, z);
    for (const s of [-1, 1]) {
      const cx = x + s * (RD + 1.3), cz = z + s * (RD + 1.3);
      for (let o = -RD + 0.35; o < RD - 0.5; o += 1.1) {
        if (cx > X0 && cx < X1) flat(M.white, cx - 1.1, cx + 1.1, z + o, z + o + 0.55, 0.006, 4);     // across the E-W street
        if (cz > Z0 && cz < Z1) flat(M.white, x + o, x + o + 0.55, cz - 1.1, cz + 1.1, 0.006, 4);     // across the N-S street
      }
    }
  }
  // sidewalks: a ring around every block, plus the outer sidewalks along the edge buildings
  const walk = (x0, x1, z0, z1) => {
    W.walkRects.push([x0, x1, z0, z1]);
    flatTiled(M.walk, x0, x1, z0, z1, CURB, 1.8, 10);
    S.box(x0, x1, 0, CURB, z0, z1, SOLID, { walk: true });
  };
  const curbFaces = (x0, x1, z0, z1, which) => {   // vertical curb faces facing the road
    setChunk((x0 + x1) / 2, (z0 + z1) / 2);
    if (which.includes('nz')) vquad(M.curb, 'z', z0, x0, x1, 0, CURB, -1, 2);
    if (which.includes('pz')) vquad(M.curb, 'z', z1, x0, x1, 0, CURB, 1, 2);
    if (which.includes('nx')) vquad(M.curb, 'x', x0, z0, z1, 0, CURB, -1, 2);
    if (which.includes('px')) vquad(M.curb, 'x', x1, z0, z1, 0, CURB, 1, 2);
  };
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const bx0 = XS[i] + SH, bx1 = XS[i + 1] - SH, bz0 = ZS[j] + SH, bz1 = ZS[j + 1] - SH;
    const zc = (bz0 + bz1) / 2;
    walk(bx0 - SWK, bx1 + SWK, bz0 - SWK, bz0); walk(bx0 - SWK, bx1 + SWK, bz1, bz1 + SWK);
    walk(bx0 - SWK, bx0, bz0, zc - AL); walk(bx0 - SWK, bx0, zc + AL, bz1);
    walk(bx1, bx1 + SWK, bz0, zc - AL); walk(bx1, bx1 + SWK, zc + AL, bz1);
    // alley mouths drop to road level: a short ramp of sidewalk at 0 height
    flatTiled(M.alley, bx0 - SWK, bx0, zc - AL, zc + AL, 0.003, 2.5); flatTiled(M.alley, bx1, bx1 + SWK, zc - AL, zc + AL, 0.003, 2.5);
    curbFaces(bx0 - SWK, bx1 + SWK, bz0 - SWK, bz1 + SWK, 'nz pz nx px');
    setChunk(bx0 - SWK, zc); vquad(M.curb, 'z', zc - AL, bx0 - SWK, bx0, 0, CURB, 1, 2); vquad(M.curb, 'z', zc + AL, bx0 - SWK, bx0, 0, CURB, -1, 2);
    setChunk(bx1 + SWK, zc); vquad(M.curb, 'z', zc - AL, bx1, bx1 + SWK, 0, CURB, 1, 2); vquad(M.curb, 'z', zc + AL, bx1, bx1 + SWK, 0, CURB, -1, 2);
  }
  // outer sidewalks + edge buildings that close the world
  const OX0 = X0 - SWK, OX1 = X1 + SWK, OZ0 = Z0 - SWK, OZ1 = Z1 + SWK;
  walk(OX0, OX1, OZ0, Z0); walk(OX0, OX1, Z1, OZ1); walk(OX0, X0, Z0, Z1); walk(X1, OX1, Z0, Z1);
  curbFaces(X0, X1, Z0, Z1, '');
  setChunk(0, Z0); vquad(M.curb, 'z', Z0, X0, X1, 0, CURB, 1, 2);
  setChunk(0, Z1); vquad(M.curb, 'z', Z1, X0, X1, 0, CURB, -1, 2);
  setChunk(X0, 0); vquad(M.curb, 'x', X0, Z0, Z1, 0, CURB, 1, 2);
  setChunk(X1, 0); vquad(M.curb, 'x', X1, Z0, Z1, 0, CURB, -1, 2);

  // ---------------- facades ----------------
  const STYLES = [
    { wall: 'red_brick', winW: 1.12, winH: 1.75, bay: 2.5, lintel: true, frame: M.frameDark, cornice: true },
    { wall: 'brick_wall_10', winW: 1.15, winH: 1.8, bay: 2.6, lintel: true, frame: M.frameGreen, cornice: true },
    { wall: 'red_bricks_04', winW: 1.2, winH: 1.8, bay: 2.7, lintel: true, frame: M.frameDark, cornice: true },
    { wall: 'plaster_cream', winW: 1.1, winH: 1.85, bay: 2.4, lintel: false, frame: M.frameLight, cornice: true },
    { wall: 'plaster_grey', winW: 1.2, winH: 1.8, bay: 2.6, lintel: false, frame: M.frameLight, cornice: true },
    { wall: 'plaster_green', winW: 1.1, winH: 1.85, bay: 2.4, lintel: false, frame: M.frameLight, cornice: false },
    { wall: 'concrete_wall_006', winW: 1.6, winH: 1.7, bay: 3.0, lintel: false, frame: M.frameDark, cornice: false },
  ];
  // Frame for a wall whose outward normal is n, spanning world points a..b along it (a = left seen from outside)
  const frameAt = (ax, az, nx, nz, y = 0) => {
    const n = V3(nx, 0, nz), t = V3(0, 1, 0).cross(n);
    return new Frame(V3(ax, y, az), t, n);
  };
  // fu (facade u) of a world point on this frame
  const fuOf = (fr, x, z) => (x - fr.o.x) * fr.t.x + (z - fr.o.z) * fr.t.z;

  function facade(fr, Wd, o) {
    const st = o.st, wm = walls[st.wall], ts = TS[st.wall], uoff = R() * 10;
    const wb = () => bucket(wm);
    const nb = Math.max(1, Math.round((Wd - 0.6) / st.bay)), bw = (Wd - 0.6) / nb;
    for (let f = 0; f < o.F; f++) {
      const vlo = f === 0 ? o.vb : o.y0 + f * FH, vhi = o.y0 + (f + 1) * FH;
      const ops = (o.openings || []).filter(op => op.v0 >= vlo - 0.01 && op.v0 < vhi - 0.01).map(op => ({ ...op }));
      if (f > 0 || o.groundWin) {
        for (let b = 0; b < nb; b++) {
          const uc = 0.3 + (b + 0.5) * bw, u0 = uc - st.winW / 2, u1 = uc + st.winW / 2;
          if ((o.skip || []).some(z => f >= z.f0 && f <= z.f1 && u1 > z.u0 - 0.15 && u0 < z.u1 + 0.15)) continue;
          if (ops.some(op => u1 > op.u0 - 0.3 && u0 < op.u1 + 0.3)) continue;
          if (o.sparse && R() < o.sparse) continue;
          const vs = o.y0 + f * FH + 0.9;
          ops.push({ kind: 'win', u0, u1, v0: vs, v1: vs + st.winH });
        }
      }
      ops.sort((a, b) => a.u0 - b.u0);
      let last = 0;
      for (const op of ops) {
        fr.wall(wb(), last, vlo, op.u0, vhi, 0, ts, uoff);
        fr.wall(wb(), op.u0, vlo, op.u1, op.v0, 0, ts, uoff);
        fr.wall(wb(), op.u0, op.v1, op.u1, vhi, 0, ts, uoff);
        last = op.u1;
        opening(fr, op, st, wm, ts, o, f);
      }
      fr.wall(wb(), last, vlo, Wd, vhi, 0, ts, uoff);
      if (f === 0 && !o.noBand) fr.box(bucket(M.trim), 0, Wd, vhi - 0.25, vhi, 0, 0.12, 3);
    }
    const top = o.y0 + o.F * FH;
    fr.wall(wb(), 0, top, Wd, o.H, 0, ts, uoff);
    if (st.cornice) {
      fr.box(bucket(M.trim), -0.05, Wd + 0.05, o.H - 0.75, o.H - 0.45, 0, 0.22, 3);
      fr.box(bucket(M.trim), -0.1, Wd + 0.1, o.H - 0.45, o.H - 0.15, 0, 0.45, 3);
      for (let u = 0.2; u < Wd - 0.1; u += 0.5) fr.box(bucket(M.trim), u, u + 0.2, o.H - 0.75, o.H - 0.45, 0.22, 0.34, 3);
    }
    fr.box(bucket(M.trim), -0.02, Wd + 0.02, o.H - 0.15, o.H + 0.05, -0.3, 0.08, 3);
    if (o.graffiti && R() < 0.55) {
      const gw = 3.2 + R() * 2.5, gu = 0.5 + R() * Math.max(0.1, Wd - gw - 1);
      if (!(o.openings || []).some(op => gu + gw > op.u0 && gu < op.u1)) {
        bucket(M.graffiti[Math.floor(R() * M.graffiti.length)]).quad(fr.p(gu, o.vb + 0.3, 0.01), fr.p(gu + gw, o.vb + 0.3, 0.01), fr.p(gu + gw, o.vb + 0.3 + gw / 2, 0.01), fr.p(gu, o.vb + 0.3 + gw / 2, 0.01), [[0, 0], [1, 0], [1, 1], [0, 1]]);
      }
    }
    if (o.fire && o.F >= 3 && Wd > 8) fireEscapeDeco(fr, Wd, nb, bw, o.F, o.y0);
    // AC units under some upper windows
  }

  function opening(fr, op, st, wm, ts, o, f) {
    const wb = bucket(wm);
    const { u0, u1, v0, v1 } = op;
    if (op.kind === 'win') {
      fr.reveal(wb, u0, u1, v0, v1, 0.22, ts);
      const seed = R() * 1000;
      glassB().quad(fr.p(u0, v0, -0.17), fr.p(u1, v0, -0.17), fr.p(u1, v1, -0.17), fr.p(u0, v1, -0.17),
        [[0, 0], [1, 0], [1, 1], [0, 1]], { aTan: [fr.t.x, fr.t.y, fr.t.z], aInfo: [seed, 4 + R() * 1.5, u1 - u0, v1 - v0], aKind: o.kind || 0 });
      const fb = bucket(st.frame), fw = 0.055;
      fr.box(fb, u0, u0 + fw, v0, v1, -0.2, -0.13); fr.box(fb, u1 - fw, u1, v0, v1, -0.2, -0.13);
      fr.box(fb, u0, u1, v0, v0 + fw, -0.2, -0.13); fr.box(fb, u0, u1, v1 - fw, v1, -0.2, -0.13);
      const mv = v0 + (v1 - v0) * 0.52; fr.box(fb, u0, u1, mv - 0.03, mv + 0.03, -0.19, -0.1);
      fr.box(bucket(M.trim), u0 - 0.08, u1 + 0.08, v0 - 0.07, v0, -0.05, 0.08, 3);
      if (st.lintel) fr.box(bucket(M.trim), u0 - 0.1, u1 + 0.1, v1, v1 + 0.2, 0, 0.03, 3);
      if (f > 0 && R() < 0.06) W.acs.push({ pos: fr.p((u0 + u1) / 2, v0 - 0.02, 0), n: fr.n.clone() });
      // security bars on some ground floor windows
      if (f === 0 && R() < 0.5) for (let u = u0 + 0.12; u < u1 - 0.05; u += 0.14) fr.box(bucket(M.metal), u - 0.012, u + 0.012, v0, v1, 0.02, 0.05);
    } else if (op.kind === 'door') {   // a hole for a real, swinging door
      fr.reveal(wb, u0, u1, v0, v1, 0.3, ts);
      fr.box(bucket(M.trim), u0 - 0.15, u1 + 0.15, v1, v1 + 0.22, 0, 0.2, 3);
      fr.box(bucket(M.metal), u0 - 0.06, u0, v0, v1, -0.3, 0.02); fr.box(bucket(M.metal), u1, u1 + 0.06, v0, v1, -0.3, 0.02);
    } else if (op.kind === 'deco') {   // a locked door
      fr.reveal(wb, u0, u1, v0, v1, 0.25, ts);
      bucket(M.extDoors[Math.floor(R() * M.extDoors.length)]).quad(fr.p(u0, v0, -0.22), fr.p(u1, v0, -0.22), fr.p(u1, v1, -0.22), fr.p(u0, v1, -0.22), [[0, 0], [1, 0], [1, 1], [0, 1]]);
      fr.box(bucket(M.trim), u0 - 0.15, u1 + 0.15, v1, v1 + 0.22, 0, 0.2, 3);
    } else if (op.kind === 'shop') {
      fr.reveal(wb, u0, u1, v0, v1, 0.3, ts);
      const seed = R() * 1000, d = -0.26;
      fr.box(bucket(M.trim), u0, u1, v0, v0 + 0.45, -0.3, -0.18);
      glassB().quad(fr.p(u0 + 0.05, v0 + 0.45, d), fr.p(u1 - 0.05, v0 + 0.45, d), fr.p(u1 - 0.05, v1 - 0.2, d), fr.p(u0 + 0.05, v1 - 0.2, d),
        [[0, 0], [1, 0], [1, 1], [0, 1]], { aTan: [fr.t.x, fr.t.y, fr.t.z], aInfo: [seed, 5 + R() * 3, u1 - u0 - 0.1, v1 - v0 - 0.65], aKind: 1 });
      const nm = Math.max(1, Math.round((u1 - u0) / 2.2));
      for (let i = 0; i <= nm; i++) { const u = u0 + (u1 - u0) * i / nm; fr.box(bucket(M.frameDark), u - 0.04, u + 0.04, v0 + 0.45, v1 - 0.2, -0.3, -0.2); }
      fr.box(bucket(M.frameDark), u0, u1, v1 - 0.2, v1, -0.3, -0.2);
      W.pointVirtuals.push({ pos: fr.p((u0 + u1) / 2, 2.2, 1.0), color: new THREE.Color(0.85, 0.92, 1.0), intensity: 10, distance: 10, flick: 0, seed: R() * 99 });
      W.lightSources.push({ pos: fr.p((u0 + u1) / 2, 2.0, 1.2), color: new THREE.Color(0.85, 0.92, 1.0), strength: 0.9 });
    } else if (op.kind === 'shutter') {
      fr.reveal(wb, u0, u1, v0, v1, 0.3, ts);
      bucket(M.shutter).quad(fr.p(u0, v0, -0.26), fr.p(u1, v0, -0.26), fr.p(u1, v1, -0.26), fr.p(u0, v1, -0.26), [[0, 0], [(u1 - u0) / 2, 0], [(u1 - u0) / 2, (v1 - v0) / 2], [0, (v1 - v0) / 2]]);
      fr.box(bucket(M.metal), u0, u1, v1 - 0.3, v1, -0.28, -0.12);
    }
  }

  function fireEscapeDeco(fr, Wd, nb, bw, F, y0) {
    const mb = bucket(M.metal);
    const b0 = Math.max(0, Math.floor(nb / 2) - 1), b1 = Math.min(nb, b0 + 2);
    const ua = 0.3 + b0 * bw - 0.25, ub = 0.3 + b1 * bw + 0.25, D = 1.15;
    for (let f = 1; f < F; f++) {
      const pv = y0 + f * FH + 0.02;
      fr.box(mb, ua, ub, pv, pv + 0.05, 0.02, D);
      for (let d = 0.12; d < D; d += 0.1) fr.box(mb, ua, ub, pv - 0.04, pv, d, d + 0.02);
      for (const rv of [0.5, 0.98]) {
        fr.box(mb, ua, ub, pv + rv, pv + rv + 0.035, D - 0.035, D);
        fr.box(mb, ua, ua + 0.035, pv + rv, pv + rv + 0.035, 0, D);
        fr.box(mb, ub - 0.035, ub, pv + rv, pv + rv + 0.035, 0, D);
      }
      for (let u = ua; u <= ub + 1e-3; u += 0.12) fr.box(mb, u - 0.01, u + 0.01, pv + 0.05, pv + 0.98, D - 0.03, D - 0.01);
      for (const u of [ua + 0.2, (ua + ub) / 2, ub - 0.2]) beam(mb, fr.p(u, pv - 0.7, 0.02), fr.p(u, pv - 0.02, D - 0.1), 0.05, 0.05);
      if (f < F - 1) {
        const dir = f % 2 === 0 ? 1 : -1, run = 2.3;
        const s0 = dir > 0 ? ua + 0.35 : ub - 0.35, s1 = s0 + dir * run;
        for (const d of [0.35, 0.95]) beam(mb, fr.p(s0, pv + 0.05, d), fr.p(s1, pv + FH + 0.05, d), 0.05, 0.14);
        for (let i = 1; i < 11; i++) { const k = i / 11, u = s0 + (s1 - s0) * k, v = pv + 0.05 + FH * k; fr.box(mb, Math.min(u, u + dir * 0.2), Math.max(u, u + dir * 0.2), v - 0.02, v + 0.02, 0.38, 0.92); }
        beam(mb, fr.p(s0, pv + 0.95, 0.95), fr.p(s1, pv + FH + 0.95, 0.95), 0.035, 0.035, true);
      }
    }
    const lv = y0 + FH + 0.02;
    for (const u of [ub - 0.9, ub - 0.45]) beam(mb, fr.p(u, lv - 1.9, D - 0.1), fr.p(u, lv, D - 0.1), 0.04, 0.04);
    for (let v = lv - 1.8; v < lv; v += 0.3) fr.box(mb, ub - 0.9, ub - 0.45, v, v + 0.03, D - 0.12, D - 0.08);
  }

  function waterTank(x, y, z) {
    const b = bucket(M.roof), mb = bucket(M.metal), m = new THREE.Matrix4();
    const legH = 2.6, r = 1.7, h = 3.0;
    b.geometry(new THREE.CylinderGeometry(r, r * 1.03, h, 18, 1), m.makeTranslation(x, y + legH + h / 2, z));
    b.geometry(new THREE.ConeGeometry(r * 1.12, 1.2, 18, 1), m.makeTranslation(x, y + legH + h + 0.6, z));
    for (const [a, c] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) beam(mb, V3(x + a * r * 0.7, y, z + c * r * 0.7), V3(x + a * r * 0.7, y + legH, z + c * r * 0.7), 0.14, 0.14);
  }

  // ---------------- fences ----------------
  // along x (z = const) or along z (x = const). type 'wood' | 'chain'. gaps: [[a0,a1]] openings
  function fence(type, axis, c, a0, a1, gaps = [], opts = {}) {
    const h = type === 'wood' ? 1.85 : 2.05;
    const segs = []; let a = a0;
    for (const g of gaps.slice().sort((p, q) => p[0] - q[0])) { if (g[0] > a) segs.push([a, g[0]]); a = Math.max(a, g[1]); }
    if (a < a1) segs.push([a, a1]);
    for (const [s0, s1] of segs) {
      if (s1 - s0 < 0.2) continue;
      const th = type === 'wood' ? 0.07 : 0.05;
      if (axis === 'x') { setChunk((s0 + s1) / 2, c); S.box(s0, s1, 0, h, c - th, c + th, VAULT, { see: type === 'chain', fence: type }); }
      else { setChunk(c, (s0 + s1) / 2); S.box(c - th, c + th, 0, h, s0, s1, VAULT, { see: type === 'chain', fence: type }); }
      const mat = type === 'wood' ? M.wood : M.chain;
      const ts = type === 'wood' ? 2.0 : 0.6;
      if (axis === 'x') { vquad(mat, 'z', c, s0, s1, 0, h, 1, ts); if (type === 'chain') {} }
      else vquad(mat, 'x', c, s0, s1, 0, h, 1, ts);
      // posts and rails
      const pm = type === 'wood' ? M.wood : M.galv;
      const step = type === 'wood' ? 2.0 : 2.5;
      const n = Math.max(1, Math.round((s1 - s0) / step));
      for (let i = 0; i <= n; i++) {
        const p = s0 + (s1 - s0) * i / n;
        const pw = type === 'wood' ? 0.09 : 0.035;
        if (axis === 'x') { if (type === 'wood') vbox(pm, p - pw, p + pw, 0, h + 0.05, c - 0.1, c + 0.1, 1); else beam(bucket(pm), V3(p, 0, c), V3(p, h + 0.05, c), pw * 2, pw * 2, true); }
        else { if (type === 'wood') vbox(pm, c - 0.1, c + 0.1, 0, h + 0.05, p - pw, p + pw, 1); else beam(bucket(pm), V3(c, 0, p), V3(c, h + 0.05, p), pw * 2, pw * 2, true); }
      }
      if (type === 'chain') {
        if (axis === 'x') beam(bucket(M.galv), V3(s0, h, c), V3(s1, h, c), 0.045, 0.045, true);
        else beam(bucket(M.galv), V3(c, h, s0), V3(c, h, s1), 0.045, 0.045, true);
        if (opts.barbed) {
          for (let k = 0; k < 3; k++) {
            const off = 0.08 + k * 0.1;
            if (axis === 'x') beam(bucket(M.metal), V3(s0, h + off, c - 0.08 * k), V3(s1, h + off, c - 0.08 * k), 0.012, 0.012, true);
            else beam(bucket(M.metal), V3(c - 0.08 * k, h + off, s0), V3(c - 0.08 * k, h + off, s1), 0.012, 0.012, true);
          }
        }
      } else {
        for (const ry of [0.35, h - 0.3]) {
          if (axis === 'x') vbox(pm, s0, s1, ry, ry + 0.09, c - 0.12, c - 0.06, 1, 'py ny nz pz px nx');
          else vbox(pm, c - 0.12, c - 0.06, ry, ry + 0.09, s0, s1, 1, 'py ny nz pz px nx');
        }
      }
    }
  }

  // ---------------- doors ----------------
  // hinge (hx,hz), closed panel direction (ax,az), floor y. Builds a pivot group; logic in doors.js
  function door(hx, hz, ax, az, y, opts = {}) {
    const w = opts.w || 1.1, h = opts.h || 2.25;
    const d = { hx, hz, ax, az, y, w, h, ang: 0, vel: 0, target: 0, locked: !!opts.locked, broken: false, latched: false, id: W.doors.length, mat: opts.mat };
    // nav footprint: the doorway
    const ex = hx + ax * w, ez = hz + az * w;
    d.rect = [Math.min(hx, ex) - 0.15, Math.min(hz, ez) - 0.15, Math.max(hx, ex) + 0.15, Math.max(hz, ez) + 0.15];
    d.cx = (hx + ex) / 2; d.cz = (hz + ez) / 2;
    W.doors.push(d);
    return d;
  }

  // ---------------- lots ----------------
  const blocks = [];
  const lotTypes = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const bx0 = XS[i] + SH, bx1 = XS[i + 1] - SH, bz0 = ZS[j] + SH, bz1 = ZS[j + 1] - SH, zc = (bz0 + bz1) / 2;
    const blk = { i, j, bx0, bx1, bz0, bz1, zc, rows: [] };
    blocks.push(blk);
    // alley floor
    flatTiled(M.alley, bx0, bx1, zc - AL, zc + AL, 0, 2.5, 8);
    S.box(bx0, bx1, -1, 0, zc - AL, zc + AL, SOLID, { alley: true });
    W.spawns.push({ x: (bx0 + bx1) / 2 + (R() - 0.5) * 20, z: zc, dx: R() < 0.5 ? 1 : -1, dz: 0, where: 'alley' });
    for (const s of [1, -1]) {
      const zf = s > 0 ? bz0 : bz1, depth = (bz1 - bz0) / 2 - AL;
      const row = { s, zf, depth, lots: layoutRow(bx0, bx1) };
      blk.rows.push(row);
      for (let k = 0; k < row.lots.length; k++) buildLot(blk, row, row.lots[k], k);
      rowFences(blk, row);
    }
    alleyDressing(blk);
  }

  function layoutRow(x0, x1) {
    const lots = []; let x = x0;
    const total = x1 - x0;
    let haveApt = 0, haveGap = 0;
    while (x < x1 - 0.01) {
      const rem = x1 - x;
      let type, w;
      const first = lots.length === 0;
      if (rem < 11) { type = rem > 6.5 ? 'house' : (lots.length && lots[lots.length - 1].type !== 'gap' ? 'house' : 'house'); w = rem; }
      else {
        const r = R();
        if (first) { type = R() < 0.45 ? 'store' : 'house'; }
        else if (!haveApt && (r < 0.5 || rem < 30)) type = 'apt';
        else if (!haveGap && r < 0.6 && lots[lots.length - 1].type !== 'gap') type = 'gap';
        else if (r < 0.62) type = 'house';
        else if (r < 0.74) type = 'apt';
        else if (r < 0.86) type = 'vacant';
        else type = 'garage';
        w = type === 'store' ? 11 + R() * 3 : type === 'apt' ? 15.5 + R() * 2 : type === 'gap' ? 1.7 : type === 'vacant' ? 10 + R() * 4 : type === 'garage' ? 11 + R() * 2 : 7 + R() * 2.2;
        if (rem - w < 6.5 && rem - w > 0.01) w = rem;   // never leave a sliver
        if (type === 'gap' && rem - w < 7) { type = 'house'; w = rem; }
      }
      if (type === 'apt') haveApt++;
      if (type === 'gap') haveGap++;
      lots.push({ type, u0: x, u1: Math.min(x1, x + w) });
      x += w;
    }
    // the last lot is a corner: make it a building
    const last = lots[lots.length - 1];
    if (last.type === 'gap' || last.type === 'vacant' || last.type === 'garage') last.type = 'house';
    if (!haveGap && lots.length > 3) { const k = 1 + Math.floor(R() * (lots.length - 2)); const L = lots[k]; if (L.type === 'house' && L.u1 - L.u0 > 8) { lots.splice(k + 1, 0, { type: 'gap', u0: L.u1 - 1.7, u1: L.u1 }); L.u1 -= 1.7; } }
    for (const L of lots) L.D = L.type === 'store' ? 15 : L.type === 'apt' ? 13.5 : L.type === 'house' ? 11 + R() * 1.5 : 0;
    return lots;
  }

  // local (u along x, d into the lot from the street facade) -> world helpers per row
  function rowHelpers(row) {
    const s = row.s, zf = row.zf;
    const Z = (d) => zf + s * d;
    return {
      Z,
      box: (u0, u1, y0, y1, d0, d1, k = SOLID, extra) => S.box(u0, u1, y0, y1, Z(d0), Z(d1), k, extra),
      // visual box with faces named in local terms: F (street side, d0), K (back, d1), L (u0), R (u1), T, Bt
      vis: (mat, u0, u1, y0, y1, d0, d1, ts, faces) => {
        const f = [];
        if (faces.includes('F')) f.push(s > 0 ? 'nz' : 'pz');
        if (faces.includes('K')) f.push(s > 0 ? 'pz' : 'nz');
        if (faces.includes('L')) f.push('nx');
        if (faces.includes('R')) f.push('px');
        if (faces.includes('T')) f.push('py');
        if (faces.includes('B')) f.push('ny');
        const za = Math.min(Z(d0), Z(d1)), zb = Math.max(Z(d0), Z(d1));
        vbox(mat, u0, u1, y0, y1, za, zb, ts, f.join(' '));
      },
      // a facade frame on the plane d = dPlane, facing outward (-d if street side else +d)
      frame: (u0, u1, dPlane, outward, y = 0) => {
        // outward = -1 -> facing the street (normal -s in z); +1 -> facing the back (normal +s)
        const nz = outward * s;
        const t = V3(0, 1, 0).cross(V3(0, 0, nz));
        const ax = t.x > 0 ? u0 : u1;
        return frameAt(ax, Z(dPlane), 0, nz, y);
      },
      sideFrame: (u, d0, d1, nxSign, y = 0) => {
        const t = V3(0, 1, 0).cross(V3(nxSign, 0, 0));       // nx=+1 -> t=(0,0,-1)
        const za = Z(d0), zb = Z(d1);
        const az = t.z > 0 ? Math.min(za, zb) : Math.max(za, zb);
        return frameAt(u, az, nxSign, 0, y);
      },
    };
  }

  function pickStyle(type) {
    if (type === 'store') return STYLES[R() < 0.5 ? 3 : 4];
    if (type === 'apt') return STYLES[Math.floor(R() * 3)];
    return STYLES[Math.floor(R() * 6)];
  }

  function buildLot(blk, row, lot, k) {
    const H = rowHelpers(row);
    const u0 = lot.u0, u1 = lot.u1, Wd = u1 - u0, s = row.s;
    setChunk((u0 + u1) / 2, H.Z(row.depth / 2));
    const first = k === 0, lastLot = k === row.lots.length - 1;
    if (lot.type === 'house' || lot.type === 'store') {
      const st = pickStyle(lot.type);
      const F = lot.type === 'store' ? 2 + (R() < 0.5 ? 1 : 0) : 2 + (R() < 0.6 ? 1 : 0);
      const D = lot.D;
      const y0 = lot.type === 'store' ? CURB : 0.6;
      const Ht = y0 + F * FH + 0.8;
      lot.H = Ht;
      H.box(u0, u1, 0, Ht, 0, D, SOLID, { building: true });
      W.buildings.push({ x0: u0, x1: u1, z0: Math.min(H.Z(0), H.Z(D)), z1: Math.max(H.Z(0), H.Z(D)), h: Ht });
      H.vis(M.roof, u0, u1, Ht, Ht, 0, D, 4, 'T');
      // front
      const fr = H.frame(u0, u1, 0, -1);
      const ops = [];
      if (lot.type === 'store') {
        const shopW = Math.min(Wd - 1.2, 8);
        const su0 = (Wd - shopW) / 2;
        ops.push({ kind: R() < 0.6 ? 'shop' : 'shutter', u0: su0, u1: su0 + shopW, v0: CURB, v1: 3.4 });
        signs.push({ fr, u: Wd / 2, w: Math.min(Wd - 1.4, 6.5), v: 3.6, h: 0.6 });
      } else {
        const dc = Wd * (R() < 0.5 ? 0.3 : 0.7);
        ops.push({ kind: 'deco', u0: dc - 0.55, u1: dc + 0.55, v0: 0.6, v1: 2.85 });
        // stoop
        const xs = fr.o.x + fr.t.x * dc;
        stoop(H, xs, 0, -1, 0.6);
        lantern(fr.p(dc + 0.85, 2.4, 0.02), fr.n, {});
      }
      facade(fr, Wd, { st, vb: 0, y0, F, H: Ht, openings: ops, groundWin: true, fire: R() < 0.35, kind: 0, graffiti: lot.type === 'store' });
      // back
      const bk = H.frame(u0, u1, D, 1);
      const bops = [];
      if (lot.type === 'house') { const dc = Wd * 0.5; bops.push({ kind: 'deco', u0: dc - 0.5, u1: dc + 0.5, v0: 0.6, v1: 2.75 }); stoop(H, bk.o.x + bk.t.x * dc, D, 1, 0.6, 2); lantern(bk.p(dc + 0.8, 2.3, 0.02), bk.n, {}); }
      facade(bk, Wd, { st, vb: 0, y0, F, H: Ht, openings: bops, groundWin: true, sparse: 0.3, kind: 0, noBand: true, graffiti: true });
      // exposed side walls (row ends and next to gaps / vacant / garage lots)
      sideWalls(row, lot, k, st, y0, F, Ht, D);
      if (Ht > 10 && R() < 0.35) waterTank((u0 + u1) / 2, Ht, H.Z(D / 2));
      if (lot.type === 'store') {
        // corner store lit sign light
        W.pointVirtuals.push({ pos: fr.p(Wd / 2, 4.2, 0.8), color: new THREE.Color(1, 0.4, 0.3), intensity: 6, distance: 9, flick: R() < 0.3 ? 1 : 0, seed: R() * 50 });
      }
    } else if (lot.type === 'apt') {
      buildApartment(blk, row, lot, k, H);
    } else if (lot.type === 'gap') {
      lot.D = 0;
      flatTiled(M.alley, u0, u1, Math.min(H.Z(0), H.Z(row.depth)), Math.max(H.Z(0), H.Z(row.depth)), 0, 2.5);
      // chain-link gate at the street end, sometimes
      if (R() < 0.45) fence('chain', 'x', H.Z(0.15), u0, u1, R() < 0.4 ? [[u0 + 0.1, u1 - 0.1]] : []);
      W.spawns.push({ x: (u0 + u1) / 2, z: H.Z(row.depth * 0.5), dx: 0, dz: s, where: 'gap' });
    } else if (lot.type === 'vacant') {
      lot.D = 0;
      flatTiled(M.mud, u0, u1, Math.min(H.Z(0), H.Z(row.depth)), Math.max(H.Z(0), H.Z(row.depth)), 0.0, 3);
      const hole = u0 + 1 + R() * (Wd - 3);
      fence('chain', 'x', H.Z(0.1), u0, u1, R() < 0.6 ? [[hole, hole + 1.3]] : [], { barbed: true });
      for (let n = 0; n < 4; n++) W.propSpots.push({ type: R() < 0.5 ? 'pallet' : R() < 0.5 ? 'can' : 'box', x: u0 + 1 + R() * (Wd - 2), z: H.Z(3 + R() * (row.depth - 6)), rot: R() * 6.28 });
      if (R() < 0.6) W.cars.push({ x: (u0 + u1) / 2, z: H.Z(row.depth * 0.45), rot: R() * 0.6 + (R() < 0.5 ? 0 : Math.PI / 2), kind: 'covered' });
    } else if (lot.type === 'garage') {
      lot.D = 0;
      flatTiled(M.asphalt, u0, u1, Math.min(H.Z(0), H.Z(row.depth)), Math.max(H.Z(0), H.Z(row.depth)), 0.0, 3.2);
      // a low wall at the street with a car entrance
      const ent = u0 + 1.5 + R() * (Wd - 6);
      for (const [a, b] of [[u0, ent], [ent + 4, u1]]) if (b - a > 0.3) { H.box(a, b, 0, 1.0, 0.1, 0.45, VAULT); H.vis(M.trim, a, b, 0, 1.0, 0.1, 0.45, 2, 'F K T L R'); }
      for (let n = 0; n < 2; n++) if (R() < 0.8) W.cars.push({ x: u0 + 2.5 + n * 4.5, z: H.Z(row.depth * 0.45), rot: Math.PI / 2 + (R() - 0.5) * 0.1, kind: R() < 0.5 ? 'sedan' : 'covered' });
      W.propSpots.push({ type: 'dumpster', x: u1 - 1.4, z: H.Z(row.depth - 2.2), rot: 0, static: true });
    }
  }

  function stoop(H, x, d, outward, top, n = 4) {
    // steps from the facade at depth d going outward (toward the street for outward=-1)
    const stepH = top / n, run = 0.32;
    for (let i = 0; i < n; i++) {
      const y1 = top - i * stepH;
      const da = d + outward * (i * run), db = d + outward * ((i + 1) * run);
      const d0 = Math.min(da, db), d1 = Math.max(da, db);
      H.box(x - 0.85, x + 0.85, 0, y1, d0, d1, SOLID, { stoop: true });
      H.vis(M.stoop, x - 0.85, x + 0.85, 0, y1, d0, d1, 1, 'T F K L R');
    }
    // railings
    const dEnd = d + outward * n * run;
    for (const sx of [-0.9, 0.9]) beam(bucket(M.metal), V3(x + sx, top + 0.95, H.Z(d)), V3(x + sx, 0.95, H.Z(dEnd)), 0.04, 0.04, true);
  }

  function sideWalls(row, lot, k, st, y0, F, Ht, D) {
    const H = rowHelpers(row);
    const prev = row.lots[k - 1], next = row.lots[k + 1];
    const exposedL = !prev || ['gap', 'vacant', 'garage'].includes(prev.type) || (prev.D || 0) < D - 0.5;
    const exposedR = !next || ['gap', 'vacant', 'garage'].includes(next.type) || (next.D || 0) < D - 0.5;
    for (const [side, ex] of [['L', exposedL], ['R', exposedR]]) {
      if (!ex) continue;
      const u = side === 'L' ? lot.u0 : lot.u1, nx = side === 'L' ? -1 : 1;
      const nb = side === 'L' ? prev : next;
      const fullyExposed = !nb || ['gap', 'vacant', 'garage'].includes(nb.type);
      const d0 = fullyExposed ? 0 : (nb.D || 0);
      const fr = H.sideFrame(u, d0, D, nx);
      const Wd = D - d0;
      if (Wd < 0.3) continue;
      facade(fr, Wd, { st, vb: 0, y0, F, H: Ht, openings: [], groundWin: !nb, sparse: 0.55, kind: 0, noBand: true, graffiti: true });
    }
  }

  // ---------------- the walk-through apartment building ----------------
  function buildApartment(blk, row, lot, k, H) {
    const u0 = lot.u0, u1 = lot.u1, Wd = u1 - u0, s = row.s;
    const st = pickStyle('apt');
    const F = 4 + (R() < 0.4 ? 1 : 0), y0 = 0.6, D = 13.5;
    const Ht = y0 + F * FH + 0.8;
    lot.D = D; lot.H = Ht; lot.apt = true;
    W.buildings.push({ x0: u0, x1: u1, z0: Math.min(H.Z(0), H.Z(D)), z1: Math.max(H.Z(0), H.Z(D)), h: Ht, apt: true });
    // corridor centre in world x (u == world x)
    const uc = (u0 + u1) / 2 - 0.6;
    const cL = uc - 1.1, cR = uc + 1.1, sR = uc + 2.4;   // corridor left/right, stair band outer edge
    const RISE = FH / 20, RUN = 0.28, NST = 19, sd0 = 3.0, sEnd = sd0 + NST * RUN; // stairs from d=3.0 up to the landing
    const L1 = y0 + FH;           // upper floor level (4.0)
    const C0 = L1 - 0.25, C1 = L1 + FH - 0.25;   // ceilings
    const lockedBack = R() < 0.4, lockedFront = !lockedBack && R() < 0.15;
    lot.apt = { uc, cL, cR, sR, D, L1 };
    W.interiorZones.push({ x0: cL, x1: sR, z0: Math.min(H.Z(0.3), H.Z(D - 0.3)), z1: Math.max(H.Z(0.3), H.Z(D - 0.3)), y0: 0, y1: C1 });

    // ---- collision ----
    H.box(u0, cL, 0, Ht, 0, D, SOLID, { building: true });             // sealed flats, left
    H.box(sR, u1, 0, Ht, 0, D, SOLID, { building: true });             // sealed flats, right
    // front wall (door hole on the ground floor)
    H.box(cL, uc - 0.6, 0, Ht, 0, 0.3); H.box(uc + 0.6, sR, 0, Ht, 0, 0.3); H.box(uc - 0.6, uc + 0.6, 2.9, Ht, 0, 0.3);
    if (lockedFront) H.box(uc - 0.6, uc + 0.6, 0, 2.9, 0, 0.3);
    // back wall: ground door, upper door to the fire escape
    H.box(cL, uc - 0.6, 0, Ht, D - 0.3, D); H.box(uc + 0.6, sR, 0, Ht, D - 0.3, D);
    H.box(uc - 0.6, uc + 0.6, 2.9, L1, D - 0.3, D); H.box(uc - 0.6, uc + 0.6, L1 + 2.3, Ht, D - 0.3, D);
    if (lockedBack) H.box(uc - 0.6, uc + 0.6, 0, 2.9, D - 0.3, D);
    // ground slab, stairs, store room under the landing
    H.box(cL, sR, 0, y0, 0.3, D - 0.3);
    for (let i = 1; i <= NST; i++) H.box(cR, sR, 0, y0 + i * RISE, sd0 + (i - 1) * RUN, sd0 + i * RUN, SOLID, { stair: true });
    H.box(cR, sR, y0, C0, sEnd, D - 0.3);
    // upper slab with the stair hole
    H.box(cL, cR, C0, L1, 0.3, D - 0.3); H.box(cR, sR, C0, L1, 0.3, sd0); H.box(cR, sR, C0, L1, sEnd, D - 0.3);
    // upper floor blocks either side of the landing, banister over the stairwell
    H.box(cR, sR, L1, C1, 0.3, sd0); H.box(cR, sR, L1, C1, sEnd + 1.3, D - 0.3);
    H.box(cR - 0.03, cR + 0.03, L1, L1 + 1.0, sd0, sEnd, SOLID, { rail: true });
    // roof over the enterable part
    H.box(cL, sR, C1, Ht, 0.3, D - 0.3);

    // ---- outside ----
    setChunk((u0 + u1) / 2, H.Z(D / 2));
    H.vis(M.roof, u0, u1, Ht, Ht, 0, D, 4, 'T');
    const fr = H.frame(u0, u1, 0, -1);
    const fuC = fuOf(fr, uc, H.Z(0));
    const fu1 = fuOf(fr, cL, H.Z(0)), fu2 = fuOf(fr, sR, H.Z(0));
    const hall = { u0: Math.min(fu1, fu2), u1: Math.max(fu1, fu2), f0: 0, f1: 1 };
    facade(fr, Wd, { st, vb: 0, y0, F, H: Ht, openings: [{ kind: lockedFront ? 'deco' : 'door', u0: fuC - 0.6, u1: fuC + 0.6, v0: y0, v1: 2.9 }], skip: [hall], groundWin: true, fire: false, kind: 0, graffiti: true });
    stoop(H, uc, 0, -1, y0);
    lantern(fr.p(fuC - 1.0, 2.6, 0.02), fr.n, {});
    lantern(fr.p(fuC + 1.0, 2.6, 0.02), fr.n, { flick: R() < 0.3 ? 1 : 0 });
    // address over the door
    signs.push({ fr, u: fuC, w: 1.6, v: 3.05, h: 0.32, text: String(100 + Math.floor(R() * 800)), kind: 'paint', color: '#1b1a18' });
    const bk = H.frame(u0, u1, D, 1);
    const bC = fuOf(bk, uc, H.Z(D)), b1 = fuOf(bk, cL, H.Z(D)), b2 = fuOf(bk, sR, H.Z(D));
    facade(bk, Wd, { st, vb: 0, y0, F, H: Ht, openings: [{ kind: lockedBack ? 'deco' : 'door', u0: bC - 0.6, u1: bC + 0.6, v0: y0, v1: 2.9 }, { kind: 'door', u0: bC - 0.6, u1: bC + 0.6, v0: L1, v1: L1 + 2.3 }], skip: [{ u0: Math.min(b1, b2), u1: Math.max(b1, b2), f0: 0, f1: 1 }], groundWin: true, sparse: 0.25, kind: 0, noBand: true, graffiti: true });
    stoop(H, uc, D, 1, y0, 3);
    lantern(bk.p(bC + 1.0, 2.6, 0.02), bk.n, {});
    sideWalls(row, lot, k, st, y0, F, Ht, D);
    if (R() < 0.5) waterTank((u0 + u1) / 2 + 3, Ht, H.Z(D / 2));

    // ---- fire escape (real) down the back ----
    const pz0 = D, pz1 = D + 1.3, pu0 = uc - 1.0, pu1 = uc + 1.2;
    H.box(pu0, pu1, L1 - 0.06, L1, pz0, pz1, SOLID, { fire: true, see: true });
    H.box(pu0, pu1, L1, L1 + 1.0, pz1 - 0.05, pz1, SOLID, { see: true, rail: true });
    H.box(pu1 - 0.05, pu1, L1, L1 + 1.0, pz0, pz1, SOLID, { see: true, rail: true });
    const mb = () => bucket(M.metal);
    H.vis(M.metal, pu0, pu1, L1 - 0.06, L1, pz0, pz1, 1, 'T B F K L R');
    // rails
    beam(mb(), V3(pu0, L1 + 1.0, H.Z(pz1 - 0.02)), V3(pu1, L1 + 1.0, H.Z(pz1 - 0.02)), 0.04, 0.04, true);
    beam(mb(), V3(pu1 - 0.02, L1 + 1.0, H.Z(pz0)), V3(pu1 - 0.02, L1 + 1.0, H.Z(pz1)), 0.04, 0.04, true);
    for (let u = pu0; u <= pu1; u += 0.15) beam(mb(), V3(u, L1, H.Z(pz1 - 0.02)), V3(u, L1 + 1.0, H.Z(pz1 - 0.02)), 0.015, 0.015);
    for (const u of [pu0 + 0.2, pu1 - 0.2]) beam(mb(), V3(u, L1 - 0.9, H.Z(pz0 + 0.02)), V3(u, L1 - 0.05, H.Z(pz1 - 0.1)), 0.05, 0.05);
    const FR = 0.2, FRun = 0.24, FN = Math.round(L1 / FR);
    for (let i = 1; i < FN; i++) {
      const top = L1 - i * FR;
      const ua = pu0 - i * FRun, ub = pu0 - (i - 1) * FRun;
      H.box(ua, ub, top - 0.05, top, pz0 + 0.15, pz1 - 0.1, SOLID, { fire: true, see: true, step: true });
      H.vis(M.metal, ua, ub, top - 0.04, top, pz0 + 0.15, pz1 - 0.1, 1, 'T B L R');
    }
    const fEnd = pu0 - (FN - 1) * FRun;
    for (const dd of [pz0 + 0.12, pz1 - 0.08]) beam(mb(), V3(pu0, L1, H.Z(dd)), V3(fEnd, 0.0, H.Z(dd)), 0.05, 0.16);
    beam(mb(), V3(pu0, L1 + 0.95, H.Z(pz1 - 0.05)), V3(fEnd, 0.95, H.Z(pz1 - 0.05)), 0.035, 0.035, true);
    // outer stringer rail is solid so you cannot step off the side
    const railBoxN = 8;
    for (let i = 0; i < railBoxN; i++) {
      const ua = pu0 - (pu0 - fEnd) * (i + 1) / railBoxN, ub = pu0 - (pu0 - fEnd) * i / railBoxN;
      const yTop = L1 * (1 - (i + 0.5) / railBoxN) + 1.0;
      H.box(ua, ub, Math.max(0, yTop - 1.3), yTop, pz1 - 0.08, pz1, SOLID, { see: true, rail: true, noFloor: true });
    }
    lantern(bk.p(fuOf(bk, uc + 0.1, H.Z(D)), L1 + 2.5, 0.02), bk.n, {});

    // ---- inside: surfaces ----
    setChunk(uc, H.Z(D / 2));
    const wallM = R() < 0.5 ? M.intWall : M.intWall2;
    // floors
    H.vis(M.lino, cL, sR, 0, y0, 0.3, sd0, 2, 'T');
    H.vis(M.lino, cL, cR, 0, y0, sd0, D - 0.3, 2, 'T');
    H.vis(M.lino, cL, cR, C0, L1, 0.3, D - 0.3, 2, 'T');
    H.vis(M.lino, cR, sR, C0, L1, sEnd, sEnd + 1.3, 2, 'T');
    // ceilings
    H.vis(M.intCeil, cL, cR, C0, C0, 0.3, D - 0.3, 3, 'B');
    H.vis(M.intCeil, cR, sR, C0, C0, 0.3, sd0, 3, 'B');
    H.vis(M.intCeil, cL, sR, C1, C1, 0.3, D - 0.3, 3, 'B');
    // left wall (both floors)
    H.vis(wallM, cL - 0.01, cL, y0, C0, 0.3, D - 0.3, 3.2, 'R');
    H.vis(wallM, cL - 0.01, cL, L1, C1, 0.3, D - 0.3, 3.2, 'R');
    // stairwell outer wall (double height over the stairs)
    H.vis(wallM, sR, sR + 0.01, y0, C0, 0.3, sd0, 3.2, 'L');
    H.vis(wallM, sR, sR + 0.01, y0, C1, sd0, sEnd + 1.3, 3.2, 'L');
    // store room under the landing, faces toward the corridor and the stairs
    H.vis(wallM, cR, cR + 0.01, y0, C0, sEnd, D - 0.3, 3.2, 'L');
    H.vis(wallM, cR, sR, y0, C0, sEnd, sEnd + 0.01, 3.2, 'F');
    // upper blocks either side of the landing
    H.vis(wallM, cR, cR + 0.01, L1, C1, 0.3, sd0, 3.2, 'L');
    H.vis(wallM, cR, sR, C0, C1, sd0 - 0.01, sd0, 3.2, 'K');
    H.vis(wallM, cR, cR + 0.01, L1, C1, sEnd + 1.3, D - 0.3, 3.2, 'L');
    H.vis(wallM, cR, sR, L1, C1, sEnd + 1.3, sEnd + 1.31, 3.2, 'F');
    H.vis(M.intCeil, cR, sR, C0, L1, sEnd, sEnd + 0.01, 3.2, 'F');
    // front and back inner wall faces with holes
    const frontInner = (y0f, y1f, holeTop, hole) => {
      if (hole) { H.vis(wallM, cL, uc - 0.6, y0f, y1f, 0.3, 0.31, 3.2, 'K'); H.vis(wallM, uc + 0.6, (y0f < L1 - 0.5 ? sR : cR), y0f, y1f, 0.3, 0.31, 3.2, 'K'); H.vis(wallM, uc - 0.6, uc + 0.6, holeTop, y1f, 0.3, 0.31, 3.2, 'K'); }
      else H.vis(wallM, cL, cR, y0f, y1f, 0.3, 0.31, 3.2, 'K');
    };
    frontInner(y0, C0, 2.9, !lockedFront);
    if (lockedFront) H.vis(M.extDoors[0], uc - 0.6, uc + 0.6, y0, 2.9, 0.31, 0.32, 1, 'K');
    frontInner(L1, C1, 0, false);
    const backInner = (y0f, y1f, holeTop, hole) => {
      if (hole) { H.vis(wallM, cL, uc - 0.6, y0f, y1f, D - 0.31, D - 0.3, 3.2, 'F'); H.vis(wallM, uc + 0.6, cR, y0f, y1f, D - 0.31, D - 0.3, 3.2, 'F'); H.vis(wallM, uc - 0.6, uc + 0.6, holeTop, y1f, D - 0.31, D - 0.3, 3.2, 'F'); }
      else H.vis(wallM, cL, cR, y0f, y1f, D - 0.31, D - 0.3, 3.2, 'F');
    };
    backInner(y0, C0, 2.9, !lockedBack);
    backInner(L1, C1, L1 + 2.3, true);
    // stairs
    for (let i = 1; i <= NST; i++) {
      const top = y0 + i * RISE, da = sd0 + (i - 1) * RUN, db = sd0 + i * RUN;
      H.vis(M.stair, cR, sR, top - RISE, top, da, db, 1, 'T F');
      H.vis(wallM, cR, cR + 0.001, y0, top, da, db, 3.2, 'L');
    }
    // banister + handrail
    beam(bucket(M.rail), V3(cR, L1 + 1.0, H.Z(sd0)), V3(cR, L1 + 1.0, H.Z(sEnd)), 0.06, 0.06);
    for (let d = sd0 + 0.1; d < sEnd; d += 0.25) beam(bucket(M.rail), V3(cR, L1, H.Z(d)), V3(cR, L1 + 1.0, H.Z(d)), 0.025, 0.025);
    beam(bucket(M.rail), V3(sR - 0.06, y0 + 0.95, H.Z(sd0)), V3(sR - 0.06, L1 + 0.95, H.Z(sEnd)), 0.05, 0.05, true);
    // flat doors along the corridor
    const unit = (u, d, faceR, y) => {
      const mat = M.unitDoors[Math.floor(R() * M.unitDoors.length)];
      if (faceR) H.vis(mat, u, u + 0.02, y, y + 2.2, d - 0.5, d + 0.5, 1, 'R'); else H.vis(mat, u - 0.02, u, y, y + 2.2, d - 0.5, d + 0.5, 1, 'L');
      // UVs of vis() are world-tiled; door texture wants 0..1: patch by using the dedicated quad instead
    };
    unitDoorQuad(H, cL + 0.01, 4.5, 1, y0); unitDoorQuad(H, cL + 0.01, 9.5, 1, y0);
    unitDoorQuad(H, cL + 0.01, 4.5, 1, L1); unitDoorQuad(H, cL + 0.01, 10.0, 1, L1);
    unitDoorQuad(H, cR - 0.01, 11.5, -1, y0); unitDoorQuad(H, cR - 0.01, 1.7, -1, L1);
    // ceiling lights
    for (const d of [2.2, 6.4, 10.6]) ceilingLight(uc, C0, H.Z(d), false);
    for (const d of [2.2, 6.4, 10.6]) ceilingLight(uc, C1, H.Z(d), false);
    ceilingLight(uc + 1.75, C1, H.Z(sEnd - 1.5), false);
    // things to knock over
    const sp = (type, u, d, rot, y = y0) => W.propSpots.push({ type, x: u, y, z: H.Z(d), rot, indoor: true });
    sp('shelf', cL + 0.3, 3.5 + R() * 1.5, Math.PI / 2);
    sp(R() < 0.5 ? 'chair' : 'cart', uc + 0.4, 8 + R() * 2, R() * 6);
    sp('box', cL + 0.4, 11.5, R());
    sp('shelf', cL + 0.3, 7.5 + R() * 2, Math.PI / 2, L1);
    sp('chair', uc + 0.5, 4.0, R() * 6, L1);
    sp('box', cR - 0.4, 11.8, R(), L1);
    if (R() < 0.6) sp('cart', uc - 0.3, 2.0, R(), L1);

    // ---- doors ----
    const dz = (d) => H.Z(d);
    if (!lockedFront) door(uc - 0.6, dz(0.15), 1, 0, y0, { w: 1.18 });
    if (!lockedBack) door(uc - 0.6, dz(D - 0.15), 1, 0, y0, { w: 1.18 });
    door(uc - 0.6, dz(D - 0.15), 1, 0, L1, { w: 1.18, h: 2.2 });
    W.spawns.push({ x: uc, z: H.Z(6), dx: 0, dz: s, where: 'apt', y: y0 });
  }

  function unitDoorQuad(H, u, d, faceSign, y) {
    const mat = M.unitDoors[Math.floor(R() * M.unitDoors.length)];
    const b = bucket(mat);
    const za = H.Z(d - 0.5), zb = H.Z(d + 0.5);
    // faceSign +1: facing +x
    const a = V3(u, y, za), c = V3(u, y, zb);
    if ((faceSign > 0) === (zb > za)) b.quad(c.clone(), a.clone(), V3(u, y + 2.2, za), V3(u, y + 2.2, zb), [[0, 0], [1, 0], [1, 1], [0, 1]]);
    else b.quad(a.clone(), c.clone(), V3(u, y + 2.2, zb), V3(u, y + 2.2, za), [[0, 0], [1, 0], [1, 1], [0, 1]]);
    // frame
    vbox(M.rail, u - 0.03, u + 0.03, y + 2.2, y + 2.3, Math.min(za, zb) - 0.08, Math.max(za, zb) + 0.08, 1, faceSign > 0 ? 'px py ny pz nz' : 'nx py ny pz nz');
  }

  // ---------------- yards and fences behind each row ----------------
  function rowFences(blk, row) {
    const H = rowHelpers(row);
    const s = row.s, depth = row.depth, lots = row.lots;
    for (let k = 0; k < lots.length; k++) {
      const L = lots[k];
      const D = L.D || 0;
      if (D > 0) {
        setChunk((L.u0 + L.u1) / 2, H.Z((D + depth) / 2));
        const za = Math.min(H.Z(D), H.Z(depth)), zb = Math.max(H.Z(D), H.Z(depth));
        flatTiled(L.apt ? M.yard : M.mud, L.u0, L.u1, za, zb, 0, L.apt ? 1.8 : 3, 10);
        // alley fence
        const gate = L.apt ? [[L.u0 + 1.0, L.u0 + 3.6]] : (R() < 0.55 ? [[L.u0 + 1 + R() * Math.max(0.1, L.u1 - L.u0 - 3), 0]] : []);
        if (gate.length && gate[0][1] === 0) gate[0][1] = gate[0][0] + 1.15;
        fence('chain', 'x', H.Z(depth - 0.05), L.u0, L.u1, gate);
        // yard clutter
        if (L.apt) {
          W.propSpots.push({ type: 'dumpster', x: L.u1 - 1.6, z: H.Z(depth - 1.4), rot: 0, static: true });
          W.propSpots.push({ type: 'bin', x: L.u1 - 3.4, z: H.Z(depth - 0.9), rot: R() });
        } else {
          if (R() < 0.6) W.propSpots.push({ type: R() < 0.5 ? 'chair' : 'bin', x: L.u0 + 1 + R() * (L.u1 - L.u0 - 2), z: H.Z(D + 1.5 + R() * Math.max(0.5, depth - D - 3)), rot: R() * 6 });
          if (R() < 0.4) W.propSpots.push({ type: 'can', x: L.u0 + 0.8, z: H.Z(D + 1.2), rot: 0 });
        }
      } else if (L.type === 'vacant') {
        fence('chain', 'x', H.Z(depth - 0.05), L.u0, L.u1, R() < 0.7 ? [[L.u0 + 2, L.u0 + 3.4]] : [], { barbed: true });
      } else if (L.type === 'garage') {
        // alley side: chain-link with a half-shut roll gate you slide under
        const g0 = L.u0 + 2 + R() * (L.u1 - L.u0 - 6), g1 = g0 + 3.2;
        fence('chain', 'x', H.Z(depth - 0.05), L.u0, L.u1, [[g0, g1]], { barbed: true });
        const zg = H.Z(depth - 0.05);
        S.box(g0, g1, 1.05, 2.4, zg - 0.06, zg + 0.06, LOW);
        setChunk((g0 + g1) / 2, zg);
        vquad(M.shutter, 'z', zg, g0, g1, 1.05, 2.4, 1, 2); vquad(M.shutter, 'z', zg, g0, g1, 1.05, 2.4, -1, 2);
        vbox(M.metal, g0, g1, 1.0, 1.1, zg - 0.07, zg + 0.07, 1);
        vbox(M.metal, g0 - 0.12, g0, 0, 2.6, zg - 0.1, zg + 0.1, 1); vbox(M.metal, g1, g1 + 0.12, 0, 2.6, zg - 0.1, zg + 0.1, 1);
        S.box(g0 - 0.12, g0, 0, 2.6, zg - 0.1, zg + 0.1); S.box(g1, g1 + 0.12, 0, 2.6, zg - 0.1, zg + 0.1);
        W.slides = W.slides || []; W.slides.push({ x: (g0 + g1) / 2, z: zg });
      } else if (L.type === 'gap') {
        // the passage runs all the way through; fence-free at the alley
      }
      // wooden fences between neighbouring yards (and against gaps / vacant / garage lots)
      if (k < lots.length - 1) {
        const N2 = lots[k + 1];
        const dA = Math.max(D, N2.D || 0);
        const both0 = D === 0 && (N2.D || 0) === 0;
        if (!both0 || L.type === 'gap' || N2.type === 'gap') {
          const from = Math.max(dA, 0.0), to = depth - 0.1;
          if (to - from > 0.5) fence(L.type === 'garage' || N2.type === 'garage' || L.type === 'vacant' || N2.type === 'vacant' ? 'chain' : 'wood', 'z', L.u1, Math.min(H.Z(from), H.Z(to)), Math.max(H.Z(from), H.Z(to)), []);
        }
      }
    }
    // row ends: yards that meet the cross street get a fence along the sidewalk
    for (const [L, u] of [[lots[0], lots[0].u0 + 0.06], [lots[lots.length - 1], lots[lots.length - 1].u1 - 0.06]]) {
      const D = L.D || 0;
      if (depth - D > 0.5) fence('wood', 'z', u, Math.min(H.Z(D), H.Z(depth - 0.1)), Math.max(H.Z(D), H.Z(depth - 0.1)), R() < 0.3 ? [[Math.min(H.Z(D), H.Z(depth)) + 1.5, Math.min(H.Z(D), H.Z(depth)) + 2.6]] : []);
    }
  }

  // ---------------- alleys ----------------
  function alleyDressing(blk) {
    const { bx0, bx1, zc } = blk;
    setChunk((bx0 + bx1) / 2, zc);
    // dead end: a tall brick wall across the alley
    if (R() < 0.38) {
      const xw = bx0 + 15 + R() * 30;
      S.box(xw - 0.2, xw + 0.2, 0, 3.6, zc - AL, zc + AL, SOLID, { deadEnd: true });
      vbox(walls.red_brick, xw - 0.2, xw + 0.2, 0, 3.6, zc - AL, zc + AL, 1.4, 'px nx py');
      for (let k = 0; k < 3; k++) beam(bucket(M.metal), V3(xw, 3.7 + k * 0.1, zc - AL), V3(xw, 3.7 + k * 0.1, zc + AL), 0.012, 0.012, true);
      W.deadEnds.push({ x: xw, z: zc });
      bucket(M.graffiti[4]).quad(V3(xw + 0.21, 0.6, zc - 1.6), V3(xw + 0.21, 0.6, zc + 1.6), V3(xw + 0.21, 2.2, zc + 1.6), V3(xw + 0.21, 2.2, zc - 1.6), [[0, 0], [1, 0], [1, 1], [0, 1]]);
    } else if (R() < 0.6) {
      // scaffold boards across the alley at chest height: slide under
      const xs = bx0 + 12 + R() * 36;
      S.box(xs - 0.6, xs + 0.6, 1.0, 1.35, zc - AL, zc + AL, LOW);
      for (const zz of [zc - AL + 0.1, zc + AL - 0.1]) for (const xx of [xs - 0.5, xs + 0.5]) { beam(bucket(M.galv), V3(xx, 0, zz), V3(xx, 3.2, zz), 0.05, 0.05, true); S.box(xx - 0.04, xx + 0.04, 0, 3.2, zz - 0.04, zz + 0.04); }
      vbox(M.wood, xs - 0.6, xs + 0.6, 1.0, 1.08, zc - AL, zc + AL, 2);
      vbox(M.wood, xs - 0.6, xs + 0.6, 1.25, 1.33, zc - AL, zc + AL, 2);
      vbox(M.wood, xs - 0.6, xs + 0.6, 3.1, 3.18, zc - AL, zc + AL, 2);
      W.slides = W.slides || []; W.slides.push({ x: xs, z: zc });
    }
    // clutter against the alley fences
    for (let x = bx0 + 4; x < bx1 - 4; x += 5 + R() * 8) {
      const side = R() < 0.5 ? -1 : 1, z = zc + side * (AL - 0.55);
      if (W.deadEnds.some(d => Math.abs(d.x - x) < 3 && Math.abs(d.z - zc) < 3)) continue;
      if ((W.slides || []).some(d => Math.abs(d.x - x) < 3 && Math.abs(d.z - zc) < 3)) continue;
      const r = R();
      if (r < 0.25) W.propSpots.push({ type: 'dumpster', x, z: zc + side * (AL - 0.6), rot: 0, static: true, alley: true });
      else if (r < 0.55) W.propSpots.push({ type: 'can', x, z, rot: R() * 6 });
      else if (r < 0.75) W.propSpots.push({ type: 'bin', x, z, rot: R() * 6 });
      else if (r < 0.88) W.propSpots.push({ type: 'pallet', x, z, rot: R() * 6 });
      else W.propSpots.push({ type: 'trolley', x, z, rot: R() * 6 });
      if (R() < 0.5) for (let n = 0; n < 2 + R() * 3; n++) W.bags.push({ pos: V3(x + (R() - 0.5) * 1.4, 0, z + side * (R() - 0.5) * 0.4), rot: R() * 6, scale: 0.8 + R() * 0.4 });
    }
    // a couple of bare bulbs over back gates
    for (let n = 0; n < 4; n++) {
      const x = bx0 + 5 + (n + R() * 0.8) * (bx1 - bx0 - 10) / 4, side = R() < 0.5 ? -1 : 1;
      const v = { pos: V3(x, 3.2, zc + side * (AL - 0.2)), color: new THREE.Color(1, 0.72, 0.42), intensity: 6, distance: 10, flick: R() < 0.5 ? 1 : 0, seed: R() * 100 };
      W.pointVirtuals.push(v);
      W.lightSources.push({ pos: v.pos, color: v.color, strength: 0.6, v });
      v.glowPos = v.pos; v.bare = true;
      beam(bucket(M.metal), V3(x, 3.2, zc + side * AL), V3(x, 3.4, zc + side * (AL - 0.25)), 0.03, 0.03, true);
    }
  }

  // ---------------- edge buildings (the world's walls) ----------------
  const edge = (x0, x1, z0, z1, nx, nz) => {
    const st = STYLES[Math.floor(R() * STYLES.length)];
    const F = 4 + Math.floor(R() * 3), Ht = CURB + F * FH + 0.8;
    S.box(x0, x1, 0, Ht, z0, z1, SOLID, { building: true, edge: true });
    setChunk((x0 + x1) / 2, (z0 + z1) / 2);
    const len = nx ? z1 - z0 : x1 - x0;
    const n = V3(nx, 0, nz), t = V3(0, 1, 0).cross(n);
    let ox, oz;
    if (nx) { ox = nx > 0 ? x1 : x0; oz = t.z > 0 ? z0 : z1; } else { oz = nz > 0 ? z1 : z0; ox = t.x > 0 ? x0 : x1; }
    const fr = frameAt(ox, oz, nx, nz, 0);
    const ops = [];
    if (len > 9 && R() < 0.5) { const c = 2 + R() * (len - 9); ops.push({ kind: R() < 0.5 ? 'shutter' : 'shop', u0: c, u1: c + 6, v0: CURB, v1: 3.4 }); }
    else { const c = len / 2; ops.push({ kind: 'deco', u0: c - 0.55, u1: c + 0.55, v0: CURB, v1: 2.4 }); lantern(fr.p(c + 0.9, 2.5, 0.02), fr.n, {}); }
    facade(fr, len, { st, vb: 0, y0: CURB, F, H: Ht, openings: ops, groundWin: true, fire: R() < 0.4, kind: 0, graffiti: true });
    vbox(M.roof, x0, x1, Ht, Ht, z0, z1, 4, 'py');
  };
  const segs = (a0, a1, fn) => { let a = a0; while (a < a1 - 0.5) { const w = Math.min(a1 - a, 10 + R() * 12); fn(a, a + w); a += w; } };
  segs(OX0, OX1, (a, b) => edge(a, b, OZ0 - 12, OZ0, 0, 1));
  segs(OX0, OX1, (a, b) => edge(a, b, OZ1, OZ1 + 12, 0, -1));
  segs(OZ0, OZ1, (a, b) => edge(OX0 - 12, OX0, a, b, 1, 0));
  segs(OZ0, OZ1, (a, b) => edge(OX1, OX1 + 12, a, b, -1, 0));

  // ---------------- street furniture: lamps, cars, hydrants, cans ----------------
  // lamps along every street, alternating sides, some flickering, some dead
  const lampAt = (x, z, dx, dz) => {
    const r = R();
    W.lampSpots.push({ pos: V3(x, CURB, z), dir: V3(dx, 0, dz), flick: r < 0.2 ? 1 : r < 0.3 ? 2 : 0, seed: R() * 100 });
  };
  for (const z of ZS) for (let i = 0; i < 4; i++) {
    const xa = (i === 0 ? X0 : XS[i - 1] + SH + 4), xb = (i === 3 ? X1 : XS[i] - SH - 4);
    let side = R() < 0.5 ? 1 : -1;
    for (let x = xa + 4; x < xb - 2; x += 20 + R() * 8) { lampAt(x, z + side * (RD + 0.45), 0, -side); side = -side; }
  }
  for (const x of XS) for (let j = 0; j < 3; j++) {
    const za = ZS[j] + SH + 4, zb = ZS[j + 1] - SH - 4;
    let side = R() < 0.5 ? 1 : -1;
    for (let z = za + 3; z < zb - 2; z += 20 + R() * 8) { lampAt(x + side * (RD + 0.45), z, -side, 0); side = -side; }
  }
  for (const l of W.lampSpots) { S.box(l.pos.x - 0.14, l.pos.x + 0.14, 0, 4, l.pos.z - 0.14, l.pos.z + 0.14, SOLID, { lamp: true }); }
  // parked cars along the kerbs (vaultable)
  const park = (x, z, rot) => {
    if (W.lampSpots.some(l => Math.abs(l.pos.x - x) < 3.2 && Math.abs(l.pos.z - z) < 3.2)) return;
    const r = R();
    W.cars.push({ x, z, rot, kind: r < 0.45 ? 'sedan' : r < 0.75 ? 'covered' : 'van' });
  };
  for (const z of ZS) for (let i = 0; i < 4; i++) {
    const xa = (i === 0 ? X0 : XS[i - 1] + SH + 6), xb = (i === 3 ? X1 : XS[i] - SH - 6);
    for (const side of [-1, 1]) for (let x = xa + 3 + R() * 6; x < xb - 3; x += 6.5 + R() * 9) if (R() < 0.6) park(x, z + side * (RD - 1.15), side > 0 ? Math.PI / 2 : -Math.PI / 2);
  }
  for (const x of XS) for (let j = 0; j < 3; j++) {
    const za = ZS[j] + SH + 6, zb = ZS[j + 1] - SH - 6;
    for (const side of [-1, 1]) for (let z = za + 3 + R() * 6; z < zb - 3; z += 6.5 + R() * 9) if (R() < 0.55) park(x + side * (RD - 1.15), z, side > 0 ? 0 : Math.PI);
  }
  // street spawns: mid-block on each street
  for (const z of ZS.slice(1, 3)) for (let i = 0; i < 3; i++) W.spawns.push({ x: (XS[i] + XS[i + 1]) / 2 + (R() - 0.5) * 10, z: z + (R() - 0.5) * 2, dx: R() < 0.5 ? 1 : -1, dz: 0, where: 'street' });
  for (const x of XS.slice(1, 3)) for (let j = 0; j < 3; j++) W.spawns.push({ x: x + (R() - 0.5) * 2, z: (ZS[j] + ZS[j + 1]) / 2 + (R() - 0.5) * 8, dx: 0, dz: R() < 0.5 ? 1 : -1, where: 'street' });
  // hydrants and trash cans on the sidewalks
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const bx0 = XS[i] + SH, bx1 = XS[i + 1] - SH, bz0 = ZS[j] + SH, bz1 = ZS[j + 1] - SH;
    for (const [z, dzs] of [[bz0 - SWK + 0.5, -1], [bz1 + SWK - 0.5, 1]]) {
      for (let x = bx0 + 3 + R() * 6; x < bx1 - 3; x += 7 + R() * 10) {
        if (W.lampSpots.some(l => Math.abs(l.pos.x - x) < 1.5 && Math.abs(l.pos.z - z) < 1.5)) continue;
        const r = R();
        if (r < 0.15) { W.hydrants.push({ pos: V3(x, CURB, z), rot: R() * 6 }); S.box(x - 0.2, x + 0.2, 0, 0.9, z - 0.2, z + 0.2); }
        else if (r < 0.55) W.propSpots.push({ type: 'can', x, y: CURB, z, rot: R() * 6 });
        else if (r < 0.7) { for (let n = 0; n < 3 + R() * 4; n++) W.bags.push({ pos: V3(x + (R() - 0.5) * 1.6, CURB, z + dzs * (R() - 0.2) * 0.6), rot: R() * 6, scale: 0.85 + R() * 0.4 }); W.propSpots.push({ type: 'box', x: x + 0.5, y: CURB, z, rot: R() * 6 }); }
        else if (r < 0.78) W.propSpots.push({ type: 'cone', x, y: CURB, z, rot: R() * 6 });
      }
    }
  }

  // ---------------- signs ----------------
  const SHOPS = [['DELI & GROCERY', 'box', '#b3261e'], ['LAUNDROMAT', 'box', '#1f5fa8'], ['LIQUORS', 'neon', '#ff5ec4'], ['PHARMACY', 'neon', '#3cff8a'], ['PIZZA', 'neon', '#ff3b30'], ['CHECK CASHING', 'box', '#d9a21b'], ['24 HR', 'neon', '#ffe45c'], ['BODEGA', 'paint', '#3b2a4a'], ['TAILOR', 'paint', '#2a2a2a']];
  let si = 0;
  for (const sg of signs) {
    const info = sg.text ? [sg.text, sg.kind, sg.color] : SHOPS[si++ % SHOPS.length];
    const { material } = signMaterial(info[0], info[1], info[2]);
    if (info[1] === 'neon' && R() < 0.35) material.userData.flick = true;
    const g = new THREE.PlaneGeometry(sg.w, sg.h);
    const m = new THREE.Mesh(g, material);
    m.position.copy(sg.fr.p(sg.u, sg.v + sg.h / 2, 0.06));
    m.lookAt(m.position.clone().add(sg.fr.n));
    scene.add(m);
    if (info[1] === 'neon') W.lightSources.push({ pos: sg.fr.p(sg.u, sg.v, 0.8), color: new THREE.Color(info[2]), strength: 0.8 });
    (W.signMeshes = W.signMeshes || []).push(m);
  }

  // ---------------- build buckets into meshes ----------------
  W.meshes = [];
  for (const b of B.values()) {
    const m = b.build(); if (!m) continue;
    // only things that throw a shadow worth seeing cast one (ground, glass, trims and frames do not)
    const noCast = [M.glass, M.asphalt, M.walk, M.curb, M.alley, M.mud, M.yard, M.white, M.yellow, M.frameDark, M.frameLight, M.frameGreen, M.trim, M.roof, M.lino, M.intCeil, M.fixture, M.fixtureOff, ...M.graffiti, ...M.unitDoors, ...M.extDoors];
    if (noCast.includes(b.material)) m.castShadow = false;
    // small detail is left out of the wet-street reflection
    m.userData.reflect = ![M.frameDark, M.frameLight, M.frameGreen, M.trim, M.white, M.yellow, M.curb, M.lino, M.intCeil, M.stair, M.rail, ...M.unitDoors, ...M.graffiti].includes(b.material);
    scene.add(m); W.meshes.push(m);
  }

  // ---------------- rain mask (1 texel / m): r roofed, g kerb ----------------
  {
    const mx0 = BOUNDS.x0 - 20, mz0 = BOUNDS.z0 - 20, MW = 300, MH = 260;
    const data = new Uint8Array(MW * MH * 4);
    const put = (x0, x1, z0, z1, ch, v) => {
      for (let z = Math.floor(z0 - mz0); z < Math.ceil(z1 - mz0); z++) for (let x = Math.floor(x0 - mx0); x < Math.ceil(x1 - mx0); x++) {
        if (x < 0 || z < 0 || x >= MW || z >= MH) continue; data[(z * MW + x) * 4 + ch] = v;
      }
    };
    for (const r of W.walkRects) put(r[0], r[1], r[2], r[3], 1, 255);
    for (const b of S.boxes) if (b.building) put(b.x0 + 0.5, b.x1 - 0.5, b.z0 + 0.5, b.z1 - 0.5, 0, 255);
    const t = new THREE.DataTexture(data, MW, MH);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.needsUpdate = true;
    W.mask = { tex: t, xf: new THREE.Vector4(mx0, mz0, 1 / MW, 1 / MH) };
  }
  W.blocks = blocks;
  W.glassMaterial = M.glass;
  return W;
}

// inside a building? (for audio muffling, rain, monster pathing hints)
export function insideZone(W, x, y, z) {
  for (const zn of W.interiorZones) if (x > zn.x0 && x < zn.x1 && z > zn.z0 && z < zn.z1 && y < zn.y1) return zn;
  return null;
}
