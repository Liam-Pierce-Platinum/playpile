// The crowd: people data, AI (roles, behaviours, panic, events) and instanced rendering.
// Every body part type is one InstancedMesh, so 170 animated people cost ~30 draw calls.
import * as THREE from '../vendor/three.module.js';
import { COLORS, HAIR, angDiff, clamp } from './util.js';
import { makeLook } from './clues.js';

const PI = Math.PI;
const ROLE_W = {
  market: { walk: 42, shop: 28, chat: 16, sit: 10, stand: 4 },
  station: { walk: 52, stand: 24, sit: 12, chat: 8, shop: 4 },
  harbour: { walk: 44, stand: 18, chat: 18, sit: 10, shop: 10 },
  festival: { dance: 34, walk: 30, chat: 18, shop: 10, sit: 8 },
  party: { chat: 38, dance: 24, walk: 14, sit: 12, shop: 12 },
};

// ---------- geometry helpers
function capsule(r, len, seg = 8) { return new THREE.CapsuleGeometry(r, len, 3, seg); }
function mergeGeos(list) {
  const pos = [], nor = [];
  for (const { g, m } of list) {
    const gg = g.index ? g.toNonIndexed() : g.clone();
    if (m) gg.applyMatrix4(m);
    pos.push(...gg.attributes.position.array); nor.push(...gg.attributes.normal.array);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}
const mT = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
const mTR = (x, y, z, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));

function torsoGeo() {
  // lathe profile: hips -> waist -> chest -> rounded shoulders -> neck base
  const pts = [[0.0, -0.33], [0.13, -0.32], [0.165, -0.26], [0.16, -0.12], [0.15, -0.02], [0.175, 0.12], [0.185, 0.2], [0.17, 0.26], [0.12, 0.3], [0.06, 0.32], [0.0, 0.325]].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, 14); g.computeVertexNormals(); return g;
}
function buildGeos() {
  const hairG = new THREE.SphereGeometry(0.122, 12, 6, 0, PI * 2, 0, PI * 0.56);
  return {
    torso: torsoGeo(),
    head: mergeGeos([{ g: new THREE.SphereGeometry(0.112, 14, 10), m: new THREE.Matrix4().makeScale(0.94, 1.04, 1) }, { g: new THREE.CylinderGeometry(0.045, 0.05, 0.12, 10), m: mT(0, -0.12, -0.005) }, { g: new THREE.SphereGeometry(0.018, 6, 4), m: mT(0, -0.01, 0.108) }]),
    hair: mergeGeos([{ g: hairG, m: mTR(0, 0.01, -0.012, -0.25) }]),
    uarm: capsule(0.052, 0.2, 7),
    farm: capsule(0.045, 0.2, 6),
    hand: new THREE.SphereGeometry(0.047, 8, 6),
    thigh: capsule(0.074, 0.3, 7),
    shin: capsule(0.058, 0.32, 6),
    shoe: mergeGeos([{ g: new THREE.BoxGeometry(0.088, 0.07, 0.17), m: mT(0, 0, -0.025) }, { g: new THREE.SphereGeometry(0.046, 8, 5, 0, PI * 2, 0, PI / 2), m: new THREE.Matrix4().makeTranslation(0, -0.035, 0.06).multiply(new THREE.Matrix4().makeScale(0.96, 1.5, 1.2)) }]),
    skirt: new THREE.CylinderGeometry(0.17, 0.29, 0.46, 14, 1, true),
    cap: mergeGeos([{ g: new THREE.SphereGeometry(0.13, 14, 6, 0, PI * 2, 0, PI / 2) }, { g: new THREE.CylinderGeometry(0.1, 0.1, 0.014, 12, 1, false, -PI / 2, PI), m: mTR(0, 0.0, 0.11) }]),
    fedora: mergeGeos([{ g: new THREE.CylinderGeometry(0.1, 0.12, 0.13, 14), m: mT(0, 0.06, 0) }, { g: new THREE.CylinderGeometry(0.21, 0.21, 0.015, 18), m: mT(0, 0, 0) }]),
    beanie: mergeGeos([{ g: new THREE.SphereGeometry(0.133, 14, 8, 0, PI * 2, 0, PI / 2), m: mT(0, -0.01, 0) }, { g: new THREE.SphereGeometry(0.03, 6, 4), m: mT(0, 0.12, 0) }]),
    sunhat: mergeGeos([{ g: new THREE.SphereGeometry(0.13, 14, 6, 0, PI * 2, 0, PI / 2) }, { g: new THREE.CylinderGeometry(0.27, 0.28, 0.012, 20), m: mT(0, 0.01, 0) }]),
    police: mergeGeos([{ g: new THREE.CylinderGeometry(0.135, 0.11, 0.09, 14), m: mT(0, 0.05, 0) }, { g: new THREE.CylinderGeometry(0.1, 0.1, 0.012, 12, 1, false, -PI / 2, PI), m: mTR(0, 0.005, 0.08, 0.2) }]),
    eyes: mergeGeos([{ g: new THREE.SphereGeometry(0.016, 6, 4), m: mT(0.038, 0.012, 0.098) }, { g: new THREE.SphereGeometry(0.016, 6, 4), m: mT(-0.038, 0.012, 0.098) }, { g: new THREE.BoxGeometry(0.05, 0.008, 0.01), m: mT(0, -0.045, 0.1) }]),
    glasses: mergeGeos([{ g: new THREE.BoxGeometry(0.2, 0.045, 0.03) }]),
    backpack: new THREE.BoxGeometry(0.3, 0.4, 0.16),
    shoulder: new THREE.BoxGeometry(0.08, 0.22, 0.3),
    briefcase: new THREE.BoxGeometry(0.1, 0.3, 0.42),
    phone: new THREE.BoxGeometry(0.05, 0.11, 0.015),
    coffee: new THREE.CylinderGeometry(0.04, 0.032, 0.12, 8),
    newspaper: new THREE.BoxGeometry(0.02, 0.3, 0.22),
    watch: new THREE.BoxGeometry(0.1, 0.03, 0.1),
    parcel: new THREE.BoxGeometry(0.34, 0.24, 0.26),
    strap: new THREE.BoxGeometry(0.03, 0.5, 0.03),
    vest: (() => { const g = torsoGeo(); g.scale(1.07, 0.75, 1.1); g.translate(0, 0.03, 0); return g; })(),
    tag: new THREE.OctahedronGeometry(0.16, 0),
  };
}

// part name -> { geo key, count per person, material options }
const PART_DEFS = [
  ['torso', 1], ['head', 1], ['hair', 1], ['uarm', 2], ['farm', 2], ['hand', 2], ['thigh', 2], ['shin', 2], ['shoe', 2],
  ['skirt', 1], ['eyes', 1], ['cap', 1], ['fedora', 1], ['beanie', 1], ['sunhat', 1], ['police', 1], ['glasses', 1],
  ['backpack', 1], ['shoulder', 1], ['briefcase', 1], ['phone', 1], ['coffee', 1], ['newspaper', 1], ['watch', 1], ['parcel', 1], ['strap', 1], ['vest', 1],
];

export class Crowd {
  constructor(scene, V, L, r) {
    this.scene = scene; this.V = V; this.L = L; this.r = r;
    this.people = []; this.t = 0;
    this.geos = buildGeos();
    this.spawn();
  }

  spawn() {
    const { V, L, r } = this;
    const weights = ROLE_W[V.kind];
    const P = this.people;
    const mk = (role, civ = true) => {
      const look = makeLook(r, V.kind);
      const p = { id: P.length, role, civ, look, behave: {}, x: 0, z: 0, yaw: r() * PI * 2, vx: 0, vz: 0, goal: null, speed: r.range(1.1, 1.45), phase: r() * 6, timer: r.range(0, 6), act: null, actT: 0, pose: {}, down: 0, fallen: false, tagged: false, mode: role, nextWatch: r.range(4, 12), nextCam: r.range(3, 10), nextIdle: r.range(5, 20), longSleeve: r.chance(0.55), stuck: 0, nerv: 0, headYaw: 0, headPitch: 0 };
      P.push(p); return p;
    };
    // vendors
    for (const s of V.spots.vendor) { const p = mk('vendor'); p.spot = s; p.x = s.x; p.z = s.z; p.yaw = s.yaw; p.look.hat = 'none'; p.look.bag = 'none'; p.look.handItem = 'none'; p.look.parcel = false; }
    // police
    const nPol = 2 + Math.min(2, Math.floor(L.crowd / 50));
    for (let i = 0; i < nPol; i++) {
      const p = mk('police', false);
      Object.assign(p.look, { top: 'lime', bottom: 'navy', bottomType: 'pants', hat: 'police', hatColor: 'navy', glasses: false, bag: 'none', handItem: 'none', parcel: false, h: r.range(1.76, 1.9) });
      p.speed = 0.95;
      const q = V.randomFree(r, 1); p.x = q.x; p.z = q.z;
    }
    // civilians
    for (let i = 0; i < L.crowd; i++) {
      const role = r.weighted(weights);
      const p = mk(role);
      if (role === 'dance' && !V.spots.dance) p.role = p.mode = 'walk';
    }
    // initial placement
    this.occ = new Map();
    const chatGroups = [];
    for (const p of P) {
      if (p.role === 'vendor' || p.role === 'police') continue;
      this.placeForRole(p, true, chatGroups);
    }
    this.N = P.length; this.groups = chatGroups;
  }

  claim(list, p, key) {
    const free = list.filter((s) => !this.occ.get(s) || this.occ.get(s) === p);
    if (!free.length) return null;
    const s = this.r.pick(free); this.release(p); this.occ.set(s, p); p.claimed = s; return s;
  }
  release(p) { if (p.claimed && this.occ.get(p.claimed) === p) this.occ.delete(p.claimed); p.claimed = null; }

  placeForRole(p, initial, groups) {
    const { V, r } = this;
    const at = (x, z) => { if (initial) { p.x = x; p.z = z; } };
    p.goal = null; p.act = null; p.mode = p.role;
    switch (p.role) {
      case 'shop': { const s = this.claim(V.spots.shop, p); if (!s) { p.role = p.mode = 'walk'; return this.placeForRole(p, initial, groups); } p.spot = s; if (initial) { at(s.x, s.z); p.yaw = s.yaw; p.sub = 'idle'; p.timer = r.range(2, 14); } else { p.goal = { x: s.x, z: s.z }; p.sub = 'go'; } break; }
      case 'sit': { const s = this.claim(V.spots.sit, p); if (!s) { p.role = p.mode = 'walk'; return this.placeForRole(p, initial, groups); } p.spot = s; if (initial) { at(s.x, s.z); p.yaw = s.yaw; p.sub = 'idle'; p.timer = r.range(20, 80); } else { p.goal = { x: s.x, z: s.z }; p.sub = 'go'; } break; }
      case 'stand': { const s = this.claim(V.spots.stand.length ? V.spots.stand : V.spots.chat, p); if (!s) { p.role = p.mode = 'walk'; return this.placeForRole(p, initial, groups); } p.spot = s; if (initial) { at(s.x, s.z); p.yaw = s.yaw ?? r() * 6; p.sub = 'idle'; p.timer = r.range(10, 50); } else { p.goal = { x: s.x, z: s.z }; p.sub = 'go'; } break; }
      case 'dance': { const d = V.spots.dance; const a = r() * PI * 2, rr = Math.sqrt(r()) * d.r; const x = d.x + Math.cos(a) * rr, z = d.z + Math.sin(a) * rr; p.spot = { x, z, yaw: Math.atan2(V.kind === 'party' ? 12 - x : -x, (V.kind === 'party' ? 14 : 18) - z) }; if (initial) { at(x, z); p.yaw = p.spot.yaw; p.sub = 'idle'; } else { p.goal = { x, z }; p.sub = 'go'; } p.danceStyle = r.int(0, 2); break; }
      case 'chat': {
        // join a group with space or start one
        let g = groups && groups.find((g) => g.members.length < g.max);
        if (!g || r.chance(0.25)) {
          const c = V.randomFree(r, 1.4);
          g = { x: c.x, z: c.z, members: [], max: r.int(2, 4) };
          (groups || (this.groups = this.groups || [])).push(g);
        }
        g.members.push(p); p.group = g;
        const k = g.members.length - 1, a = (k / g.max) * PI * 2 + r() * 0.3, rad = 0.55 + g.max * 0.08;
        const x = g.x + Math.cos(a) * rad, z = g.z + Math.sin(a) * rad;
        p.spot = { x, z, yaw: Math.atan2(g.x - x, g.z - z) };
        if (initial) { at(x, z); p.yaw = p.spot.yaw; p.sub = 'idle'; p.timer = r.range(25, 70); } else { p.goal = { x, z }; p.sub = 'go'; }
        break;
      }
      case 'pacer': {
        const c = initial ? V.randomFree(r, 2.5) : { x: p.x, z: p.z };
        const a = r() * PI; const A = { x: c.x, z: c.z }; const B = { x: c.x + Math.cos(a) * 4.5, z: c.z + Math.sin(a) * 4.5 };
        if (!V.isFree(B.x, B.z, 0.4)) { B.x = c.x - Math.cos(a) * 4.5; B.z = c.z - Math.sin(a) * 4.5; }
        if (!V.isFree(B.x, B.z, 0.4)) { B.x = c.x + 3; B.z = c.z; }
        p.paceA = A; p.paceB = B; p.paceToB = true; at(A.x, A.z); p.goal = { ...B }; p.sub = 'go'; p.speed = 1.0;
        break;
      }
      default: { // walk
        if (initial) { const q = V.randomFree(r, 0.6); at(q.x, q.z); }
        const q = V.randomFree(r, 0.8); p.goal = q; p.sub = 'go';
      }
    }
  }

  // ---------------------------------------------------------------- rendering setup
  buildMeshes() {
    const N = this.N;
    this.meshes = {};
    const root = this.group = new THREE.Group(); this.scene.add(root);
    for (const [name, per] of PART_DEFS) {
      const isAcc = !['torso', 'head', 'uarm', 'farm', 'hand', 'thigh', 'shin'].includes(name);
      const mat = new THREE.MeshStandardMaterial({ roughness: name === 'glasses' || name === 'phone' ? 0.2 : name === 'briefcase' || name === 'shoe' ? 0.45 : 0.78, metalness: name === 'watch' ? 0.6 : 0 });
      if (name === 'skirt') mat.side = THREE.DoubleSide;
      const m = new THREE.InstancedMesh(this.geos[name], mat, N * per);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.castShadow = !['glasses', 'watch', 'phone', 'hand', 'eyes'].includes(name); m.receiveShadow = false;
      m.frustumCulled = false;
      root.add(m); this.meshes[name] = m;
      if (isAcc) for (let i = 0; i < N * per; i++) m.setMatrixAt(i, ZERO);
    }
    const tagMat = new THREE.MeshBasicMaterial({ color: 0xff3030, depthTest: false, transparent: true, opacity: 0.9 });
    this.tagMesh = new THREE.InstancedMesh(this.geos.tag, tagMat, N); this.tagMesh.renderOrder = 10; this.tagMesh.frustumCulled = false; root.add(this.tagMesh);
    // mark reveal ring
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 32), new THREE.MeshBasicMaterial({ color: 0xff2a2a, side: THREE.DoubleSide, depthTest: false, transparent: true }));
    ring.rotation.x = -PI / 2; ring.visible = false; ring.renderOrder = 11; root.add(ring); this.ring = ring;
    // dropped parcels
    this.dropped = [];
    for (const p of this.people) this.applyColors(p);
  }

  applyColors(p) {
    const c = new THREE.Color(), L = p.look, i = p.id;
    p.colors = p.colors || {};
    const set = (name, k, hex) => { if (ACC_PARTS.includes(name)) { p.colors[name] = hex; return; } this.meshes[name].setColorAt(k, c.setHex(hex)); };
    const top = COLORS[L.top], bot = COLORS[L.bottom], skin = L.skin;
    set('torso', i, top); set('vest', i, COLORS.lime); set('head', i, skin); set('hair', i, HAIR[L.hair]);
    for (const s of [0, 1]) {
      set('uarm', i * 2 + s, top); set('farm', i * 2 + s, p.longSleeve || p.role === 'police' ? top : skin); set('hand', i * 2 + s, skin);
      set('thigh', i * 2 + s, L.bottomType === 'skirt' ? skin : bot); set('shin', i * 2 + s, L.bottomType === 'skirt' ? skin : bot);
      set('shoe', i * 2 + s, L.bottomType === 'skirt' ? 0x5a2a2a : 0x26221f);
    }
    if (p.role === 'police') set('torso', i, COLORS.navy);
    set('skirt', i, bot);
    for (const h of ['cap', 'fedora', 'beanie', 'sunhat']) set(h, i, COLORS[L.hatColor]);
    set('police', i, 0xf2f2f2);
    set('glasses', i, 0x101014); set('eyes', i, 0x1a1410);
    for (const b of ['backpack', 'shoulder', 'briefcase']) set(b, i, b === 'briefcase' && L.bagColor === 'beige' ? 0x2a2a2a : COLORS[L.bagColor]);
    set('strap', i, 0x222222);
    set('phone', i, 0x15161a); set('coffee', i, 0xf2efe8); set('newspaper', i, 0xe8e4d8); set('watch', i, 0xc8c8cc); set('parcel', i, 0xa57a4a);
    for (const m of Object.values(this.meshes)) if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  // ---------------------------------------------------------------- AI
  nearestCam(p) { let b = null, bd = 1e9; for (const c of this.V.cams) { const d = (c.x - p.x) ** 2 + (c.z - p.z) ** 2; if (d < bd) { bd = d; b = c; } } return b; }
  police() { return this.people.filter((q) => q.role === 'police' && !q.down); }

  update(dt, ctx) {
    this.t += dt;
    const { V, r } = this, P = this.people, t = this.t;
    // spatial hash for separation
    const cell = 1.5, grid = new Map();
    for (const p of P) { if (p.fallen) continue; const k = ((p.x / cell) | 0) * 1000 + ((p.z / cell) | 0); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(p); }
    const cops = this.police();
    for (const p of P) {
      if (p.down > 0) { p.down = Math.min(1, p.down + dt * 1.6); p.fallen = p.down >= 1; continue; }
      this.think(p, dt, cops, ctx);
      // ----- movement
      let dvx = 0, dvz = 0, want = 0;
      if (p.goal && !p.frozen) {
        const dx = p.goal.x - p.x, dz = p.goal.z - p.z, d = Math.hypot(dx, dz);
        if (d < (p.goalTol || 0.25)) { const g = p.goal; p.goal = null; this.arrive(p, g, ctx); }
        else { const sp = p.runSpeed || p.speed * (p.nerv > 0 ? 1.35 : 1) * (p.hurry > 0 ? 1.6 : 1); want = sp; dvx = (dx / d) * sp; dvz = (dz / d) * sp; if (d < 0.8) { dvx *= d / 0.8; dvz *= d / 0.8; } }
      }
      // obstacle look-ahead steering
      if (want > 0) {
        const lx = p.x + dvx * 0.8, lz = p.z + dvz * 0.8;
        for (const o of V.obstacles) {
          if (lx > o.x0 && lx < o.x1 && lz > o.z0 && lz < o.z1) {
            const cx = (o.x0 + o.x1) / 2, cz = (o.z0 + o.z1) / 2;
            const px = -dvz, pz = dvx; const side = (p.x - cx) * px + (p.z - cz) * pz > 0 ? 1 : -1;
            dvx += px * side * 1.2; dvz += pz * side * 1.2; break;
          }
        }
      }
      // separation
      if (!p.sitting) {
        const kx = (p.x / cell) | 0, kz = (p.z / cell) | 0;
        for (let ix = -1; ix <= 1; ix++) for (let iz = -1; iz <= 1; iz++) {
          const a = grid.get((kx + ix) * 1000 + kz + iz); if (!a) continue;
          for (const q of a) {
            if (q === p || q.sitting) continue;
            const dx = p.x - q.x, dz = p.z - q.z, d2 = dx * dx + dz * dz;
            if (d2 < 0.36 && d2 > 1e-5) { const d = Math.sqrt(d2), f = (0.6 - d) * (want > 0 ? 3 : 1.2); dvx += (dx / d) * f; dvz += (dz / d) * f; }
          }
        }
      }
      const k = Math.min(1, dt * 6);
      p.vx += (dvx - p.vx) * k; p.vz += (dvz - p.vz) * k;
      const ox = p.x, oz = p.z;
      p.x += p.vx * dt; p.z += p.vz * dt;
      // push out of obstacles & clamp to the plaza (fleeing people may leave through exits)
      if (!p.sitting) for (const o of V.obstacles) {
        if (p.x > o.x0 && p.x < o.x1 && p.z > o.z0 && p.z < o.z1) {
          const a = p.x - o.x0, b = o.x1 - p.x, c = p.z - o.z0, e = o.z1 - p.z, m = Math.min(a, b, c, e);
          if (m === a) p.x = o.x0; else if (m === b) p.x = o.x1; else if (m === c) p.z = o.z0; else p.z = o.z1;
        }
      }
      if (!p.leaving) { p.x = clamp(p.x, V.walk.x0, V.walk.x1); p.z = clamp(p.z, V.walk.z0, V.walk.z1); }
      const moved = Math.hypot(p.x - ox, p.z - oz) / Math.max(dt, 1e-4);
      p.spd = moved;
      // stuck detection
      if (want > 0.3 && moved < want * 0.25) { p.stuck += dt; if (p.stuck > 1.2) { p.stuck = 0; this.unstick(p); } } else p.stuck = Math.max(0, p.stuck - dt);
      // facing
      if (moved > 0.25 && p.goal) p.yaw += angDiff(p.yaw, Math.atan2(p.vx, p.vz)) * Math.min(1, dt * 8);
      else if (p.faceYaw !== undefined) p.yaw += angDiff(p.yaw, p.faceYaw) * Math.min(1, dt * 4);
      p.phase += moved * dt * 3.6;
    }
  }

  unstick(p) {
    const { V, r } = this;
    if (p.mode === 'flee' || p.mode === 'leave' || p.mode === 'swap') {
      // detour: step sideways a few metres, then resume
      const g = p.finalGoal || p.goal; if (!g) return;
      p.finalGoal = g;
      const dx = g.x - p.x, dz = g.z - p.z, d = Math.hypot(dx, dz) || 1;
      for (let tries = 0; tries < 8; tries++) {
        const s = r.chance(0.5) ? 1 : -1, L = 3 + r() * 4;
        const x = p.x + (-dz / d) * s * L + (dx / d) * 1.5, z = p.z + (dx / d) * s * L + (dz / d) * 1.5;
        if (V.isFree(x, z, 0.4)) { p.goal = { x, z, detour: true }; return; }
      }
    } else if (p.goal) { p.goal = V.randomFree(r, 0.8); }
  }

  arrive(p, g, ctx) {
    const { r } = this;
    if (g.detour && p.finalGoal) { p.goal = p.finalGoal; return; }
    if (p.mode === 'flee' || p.mode === 'leave') { p.escaped = true; p.runSpeed = 0; p.mode = 'gone'; ctx && ctx.onEscape && ctx.onEscape(p); return; }
    if (p.mode === 'panic') { p.mode = 'cower'; p.timer = r.range(4, 8); p.runSpeed = 0; return; }
    if (p.mode === 'swap') { p.sub = 'meet'; p.timer = 3.2; return; }
    if (p.mode === 'away') { p.mode = p.role; this.placeForRole(p, false); return; }
    if (p.role === 'pacer') { p.sub = 'turn'; p.timer = 0.8; return; }
    if (p.spot && p.sub === 'go' && Math.hypot(p.spot.x - p.x, p.spot.z - p.z) < 0.5) {
      p.sub = 'idle'; p.faceYaw = p.spot.yaw; p.timer = p.role === 'sit' ? r.range(25, 70) : p.role === 'shop' ? r.range(6, 16) : p.role === 'chat' ? r.range(25, 60) : r.range(10, 40);
      return;
    }
    p.sub = 'pause'; p.timer = r.range(0.8, 3.5); p.faceYaw = undefined;
  }

  think(p, dt, cops, ctx) {
    const { V, r } = this, t = this.t;
    p.timer -= dt; p.actT -= dt; p.nerv -= dt; p.hurry -= dt;
    if (p.act && p.actT <= 0) p.act = null;
    p.sitting = p.role === 'sit' && p.sub === 'idle' && p.mode === 'sit' && p.spot && Math.hypot(p.spot.x - p.x, p.spot.z - p.z) < 0.5;
    if (p.sitting) { p.x += (p.spot.x - p.x) * Math.min(1, dt * 5); p.z += (p.spot.z - p.z) * Math.min(1, dt * 5); }

    // ---- special modes first
    if (p.mode === 'cower') { p.act = 'cower'; p.actT = 0.2; if (p.timer <= 0) { p.mode = p.role; p.nerv = 20; p.act = null; this.placeForRole(p, false); } return; }
    if (p.mode === 'panic' || p.mode === 'flee' || p.mode === 'leave') return;
    if (p.mode === 'gone') { p.goal = null; p.act = 'lookaround'; p.actT = 0.2; return; }
    if (p.mode === 'away') return;
    if (p.mode === 'siren') {
      if (p.sub === 'look') { p.act = 'lookaround'; p.actT = 0.2; p.goal = null; if (p.timer <= 0) { p.sub = 'hurry'; const s = V.sirenAt; let best = null, bd = -1; for (let i = 0; i < 12; i++) { const q = V.randomFree(r, 1); const d = Math.hypot(q.x - s.x, q.z - s.z); if (d > bd) { bd = d; best = q; } } p.goal = best; p.hurry = 8; p.timer = 8; } }
      else if (p.timer <= 0 || !p.goal) { p.mode = p.role; this.placeForRole(p, false); }
      return;
    }
    if (p.mode === 'parcel') {
      if (p.sub === 'drop') { p.act = 'crouch'; p.actT = 0.2; p.goal = null; if (p.timer <= 0) { p.look.parcel = false; this.dropParcel(p); p.sub = 'walkoff'; const q = V.randomFree(r, 1); p.goal = q; p.timer = 10; p.mode = 'away'; } }
      return;
    }
    if (p.mode === 'swap') {
      if (p.sub === 'meet') {
        p.goal = null; p.act = 'chat'; p.actT = 0.2;
        if (p.partner) p.faceYaw = Math.atan2(p.partner.x - p.x, p.partner.z - p.z);
        if (p.timer <= 0 && p.isMarkSide) { ctx && ctx.onSwap && ctx.onSwap(); }
      }
      return;
    }

    // ---- behaviours (the clues you can observe)
    if (p.behave.watch && !p.act && p.look.watch) { p.nextWatch -= dt; if (p.nextWatch <= 0) { p.act = 'watch'; p.actT = 2.2; p.nextWatch = r.range(8, 14); } }
    if (p.behave.cams && !p.act) { p.nextCam -= dt; if (p.nextCam <= 0) { p.act = 'lookcam'; p.actT = 1.8; p.camT = this.nearestCam(p); p.nextCam = r.range(7, 12); } }
    if (p.behave.eyes && !p.act) {
      p.nextEye = (p.nextEye ?? r.range(1, 3)) - dt;
      if (p.nextEye <= 0) {
        p.nextEye = 0.35; let q = null, qd = 2.8;
        for (const o2 of this.people) { if (o2 === p || o2.down || o2.sitting || o2.mode === 'gone') continue; const d = Math.hypot(o2.x - p.x, o2.z - p.z); if (d < qd) { qd = d; q = o2; } }
        if (q) { p.act = 'avert'; p.actT = 1.6; p.avertFrom = q; p.nextEye = r.range(4, 7); }
      }
    }
    if (p.behave.police && cops.length) {
      let near = null, nd = 1e9;
      for (const c of cops) { const d = Math.hypot(c.x - p.x, c.z - p.z); if (d < nd) { nd = d; near = c; } }
      if (nd < 7 && (p.avoidCd || 0) <= 0) {
        // turn away from the officer and walk off
        const ax = p.x - near.x, az = p.z - near.z, d = Math.hypot(ax, az) || 1;
        let gx = p.x + (ax / d) * 7, gz = p.z + (az / d) * 7;
        if (!V.isFree(gx, gz, 0.5)) { const q = V.randomFree(r, 1); gx = q.x; gz = q.z; }
        this.release(p); p.mode = 'away'; p.goal = { x: gx, z: gz }; p.avoidCd = 6; p.act = 'glanceback'; p.actT = 1.2; p.glanceAt = near;
        return;
      }
    }
    p.avoidCd = (p.avoidCd || 0) - dt;

    // ---- roles
    switch (p.role) {
      case 'police': if (!p.goal) { if (p.timer <= 0) { const q = V.randomFree(r, 1.5); p.goal = q; p.timer = r.range(3, 7); } } break;
      case 'vendor': p.faceYaw = p.spot.yaw; if (!p.act && p.timer <= 0) { p.act = 'gesture'; p.actT = r.range(1, 2.5); p.timer = r.range(3, 9); } break;
      case 'pacer':
        if (p.sub === 'turn' && p.timer <= 0) { p.paceToB = !p.paceToB; p.goal = { ...(p.paceToB ? p.paceB : p.paceA) }; p.sub = 'go'; }
        break;
      case 'walk':
        if (!p.goal && p.timer <= 0) { p.goal = r.chance(0.2) && V.spots.shop.length ? (() => { const s = r.pick(V.spots.shop); return { x: s.x + r.range(-1, 1), z: s.z - 0.8 }; })() : V.randomFree(r, 0.8); p.sub = 'go'; p.faceYaw = undefined; }
        break;
      case 'dance':
        if (!p.goal) { p.act = 'dance'; p.actT = 0.2; p.faceYaw = p.spot.yaw; }
        break;
      default: // shop, sit, chat, stand
        if (p.sub === 'idle') {
          if (p.role === 'chat' && !p.act && r.chance(dt * 0.5)) { p.act = 'chat'; p.actT = r.range(1, 3); }
          if (p.role === 'shop' && !p.act && r.chance(dt * 0.3)) { p.act = 'browse'; p.actT = r.range(1, 2.5); }
          if (p.timer <= 0) {
            if (p.role === 'chat') { this.leaveGroup(p); p.timer = 0; }
            this.release(p);
            if (p.role === 'chat') { p.mode = 'walk'; const q = V.randomFree(r, 1); p.goal = q; p.sub = 'go'; p.rejoin = r.range(8, 20); p.tmpWalk = true; }
            else this.placeForRole(p, false);
          }
        } else if (!p.goal && p.sub === 'pause' && p.timer <= 0) this.placeForRole(p, false);
        if (p.tmpWalk) { p.rejoin -= dt; if (p.rejoin <= 0 && !p.goal) { p.tmpWalk = false; this.placeForRole(p, false, this.groups); } else if (!p.goal && p.timer <= 0) { p.goal = V.randomFree(r, 0.8); } }
    }
    // idle flavour actions
    if (!p.act && !p.goal) {
      p.nextIdle -= dt;
      if (p.nextIdle <= 0) { p.nextIdle = r.range(6, 20); const opts = ['lookaround']; if (p.look.handItem === 'phone') opts.push('phonecall', 'phonecall'); if (p.look.handItem === 'coffee') opts.push('sip', 'sip'); if (p.look.handItem === 'newspaper') opts.push('read', 'read'); p.act = r.pick(opts); p.actT = p.act === 'phonecall' ? r.range(3, 7) : p.act === 'read' ? r.range(3, 6) : r.range(1, 2.2); }
    }
  }

  leaveGroup(p) { if (p.group) { p.group.members = p.group.members.filter((q) => q !== p); p.group = null; } }

  dropParcel(p) {
    const m = new THREE.Mesh(this.geos.parcel, new THREE.MeshStandardMaterial({ color: 0xa57a4a, roughness: 0.8 }));
    const fx = Math.sin(p.yaw) * 0.35, fz = Math.cos(p.yaw) * 0.35;
    m.position.set(p.x + fx, 0.12 * (p.look.h / 1.75), p.z + fz); m.rotation.y = p.yaw; m.castShadow = true;
    this.group.add(m); this.dropped.push(m);
    this.parcelAt = { x: m.position.x, z: m.position.z };
  }

  // ---------------------------------------------------------------- events
  panic(px, pz, mark) {
    const { r, V } = this;
    for (const p of this.people) {
      if (p.down || p.escaped) continue;
      if (p === mark) continue;
      if (p.mode === 'flee' || p.mode === 'leave') continue;
      this.release(p); this.leaveGroup(p); p.sitting = false; p.tmpWalk = false;
      const d = Math.hypot(p.x - px, p.z - pz);
      if (d < 30) {
        const ax = (p.x - px) / (d || 1), az = (p.z - pz) / (d || 1);
        let gx = p.x + ax * r.range(6, 12), gz = p.z + az * r.range(6, 12);
        gx = clamp(gx, V.walk.x0 + 1, V.walk.x1 - 1); gz = clamp(gz, V.walk.z0 + 1, V.walk.z1 - 1);
        if (!V.isFree(gx, gz, 0.3)) { const q = V.randomFree(r, 0.6); gx = q.x; gz = q.z; }
        p.mode = 'panic'; p.goal = { x: gx, z: gz }; p.runSpeed = r.range(3.2, 4.4); p.act = null; p.timer = 6; p.goalTol = 0.8;
      } else { p.mode = 'cower'; p.timer = r.range(3, 6); p.goal = null; }
    }
    if (mark && !mark.down && mark.mode !== 'flee') this.flee(mark, px, pz);
  }
  flee(mark, px = 0, pz = 0) {
    // run for the exit that is close but not toward the shot
    let best = null, bs = 1e9;
    // prefer an exit 15-30 m away (gives the shooter a fair window) and not past the shot
    for (const e of this.V.exits) { const d = Math.hypot(e.x - mark.x, e.z - mark.z); const toward = Math.hypot(e.x - px, e.z - pz) < 6 ? 30 : 0; const s = Math.abs(d - 20) + toward + this.r() * 4; if (s < bs) { bs = s; best = e; } }
    this.release(mark); this.leaveGroup(mark);
    mark.mode = 'flee'; mark.leaving = true; mark.goal = { x: best.x, z: best.z }; mark.finalGoal = mark.goal; mark.runSpeed = 2.3; mark.act = null; mark.goalTol = 1.3; mark.sitting = false; mark.exit = best;
  }
  leave(mark) {
    if (mark.mode === 'flee' || mark.down) return;
    let best = null, bs = 1e9;
    for (const e of this.V.exits) { const d = Math.hypot(e.x - mark.x, e.z - mark.z); if (d < bs) { bs = d; best = e; } }
    this.release(mark); this.leaveGroup(mark);
    mark.mode = 'leave'; mark.leaving = true; mark.goal = { x: best.x, z: best.z }; mark.finalGoal = mark.goal; mark.runSpeed = 1.45; mark.act = null; mark.goalTol = 1.3; mark.sitting = false; mark.exit = best;
  }
  siren(mark) {
    for (const p of this.people) {
      if (p.down || p.mode === 'panic' || p.mode === 'flee' || p.mode === 'leave') continue;
      if (p === mark) { this.release(p); this.leaveGroup(p); p.mode = 'siren'; p.sub = 'look'; p.timer = 2.6; p.goal = null; p.sitting = false; continue; }
      if (this.r.chance(0.3) && !p.act) { p.act = 'glancesiren'; p.actT = this.r.range(0.8, 1.6); }
    }
  }
  startParcel(mark) {
    if (mark.down || !mark.look.parcel || ['flee', 'leave', 'panic'].includes(mark.mode)) return false;
    this.release(mark); this.leaveGroup(mark); mark.sitting = false;
    mark.mode = 'parcel'; mark.sub = 'drop'; mark.timer = 1.6; mark.goal = null; return true;
  }
  startSwap(mark, contact) {
    if (mark.down || contact.down || ['flee', 'leave'].includes(mark.mode)) return false;
    const { V, r } = this;
    let mx = (mark.x + contact.x) / 2, mz = (mark.z + contact.z) / 2;
    if (!V.isFree(mx, mz, 0.8)) { const q = V.randomFree(r, 1); mx = q.x; mz = q.z; }
    for (const [p, s] of [[mark, -1], [contact, 1]]) {
      this.release(p); this.leaveGroup(p); p.sitting = false;
      p.mode = 'swap'; p.sub = 'go'; p.goal = { x: mx + s * 0.35, z: mz }; p.finalGoal = p.goal; p.hurry = 30; p.goalTol = 0.3; p.act = null;
    }
    mark.partner = contact; contact.partner = mark; mark.isMarkSide = true;
    return true;
  }
  finishSwap(mark, contact) {
    const a = mark.look, b = contact.look;
    [a.bag, b.bag] = [b.bag, a.bag]; [a.bagColor, b.bagColor] = [b.bagColor, a.bagColor];
    if (a.bag === 'briefcase') a.handItem = 'none'; if (b.bag === 'briefcase') b.handItem = 'none';
    this.applyColors(mark); this.applyColors(contact);
    for (const p of [mark, contact]) { if (p.mode === 'swap') { p.mode = 'away'; p.goal = this.V.randomFree(this.r, 1); p.hurry = 0; } p.partner = null; }
    mark.isMarkSide = false;
  }

  hit(p, fromX, fromZ) {
    this.release(p); this.leaveGroup(p);
    p.down = 0.001; p.goal = null; p.act = null; p.vx = p.vz = 0;
    p.fallDir = 1; // backwards
    p.fallYaw = Math.atan2(p.x - fromX, p.z - fromZ); // fall away from the shooter
  }

  // ---------------------------------------------------------------- picking
  pick(ray, maxDist = 400) {
    let best = null, bt = maxDist;
    const o = ray.origin, d = ray.direction;
    for (const p of this.people) {
      if (p.escaped) continue;
      const s = p.look.h / 1.75;
      let ax, ay, az, bx, by, bz, rad = 0.26 * s * (p.look.wx || 1);
      if (p.fallen || p.down > 0.5) { const fx = Math.sin(p.fallYaw ?? p.yaw), fz = Math.cos(p.fallYaw ?? p.yaw); ax = p.x; ay = 0.15; az = p.z; bx = p.x + fx * 1.6 * s; by = 0.15; bz = p.z + fz * 1.6 * s; }
      else { const y0 = p.rootY || 0; ax = p.x; ay = y0 + 0.1; az = p.z; bx = p.x; by = y0 + (p.sitting ? 1.25 : p.act === 'cower' ? 1.0 : 1.7) * s; bz = p.z; }
      const tt = raySegment(o, d, ax, ay, az, bx, by, bz, rad);
      if (tt !== null && tt < bt) { bt = tt; best = p; }
    }
    return best ? { person: best, t: bt } : null;
  }

  // ---------------------------------------------------------------- pose + matrices
  render(time) {
    const P = this.people, M = this.meshes;
    this.cnt = this.cnt || {}; for (const n of ACC_PARTS) this.cnt[n] = 0;
    for (const p of P) {
      if (p.escaped && !p.isMark) { this.hide(p); continue; }
      const pose = this.computePose(p, time);
      this.writeMatrices(p, pose);
      this.tagMesh.setMatrixAt(p.id, p.tagged && !p.fallen ? _m.makeTranslation(p.x, (p.look.h + 0.45 + Math.sin(time * 3 + p.id) * 0.06) + (p.rootY || 0), p.z).multiply(_r.makeRotationY(time * 2)) : ZERO);
    }
    for (const n of ACC_PARTS) { M[n].count = this.cnt[n]; if (M[n].instanceColor) M[n].instanceColor.needsUpdate = true; }
    for (const m of Object.values(M)) m.instanceMatrix.needsUpdate = true;
    this.tagMesh.instanceMatrix.needsUpdate = true;
  }
  hide(p) {
    for (const [name, per] of PART_DEFS) if (!ACC_PARTS.includes(name)) for (let s = 0; s < per; s++) this.meshes[name].setMatrixAt(p.id * per + s, ZERO);
    this.tagMesh.setMatrixAt(p.id, ZERO);
  }

  computePose(p, time) {
    const o = p.pose;
    const spd = p.spd || 0, walkK = Math.min(1, spd / 1.3), run = Math.max(0, Math.min(1, (spd - 2) / 1.5));
    const ph = p.phase, sw = Math.sin(ph);
    o.rootY = Math.abs(Math.cos(ph)) * 0.035 * walkK + run * 0.03; o.lean = 0.03 + run * 0.25;
    o.headYaw = 0; o.headPitch = 0.05;
    const amp = 0.42 + run * 0.4;
    o.lHip = -sw * amp * walkK; o.rHip = sw * amp * walkK;
    o.lKnee = Math.max(0, Math.sin(ph - 1.4)) * (0.9 + run * 0.6) * walkK + 0.05; o.rKnee = Math.max(0, Math.sin(ph + PI - 1.4)) * (0.9 + run * 0.6) * walkK + 0.05;
    o.lArm = sw * 0.35 * walkK * (1 + run); o.rArm = -sw * 0.35 * walkK * (1 + run); o.lRoll = 0.08; o.rRoll = 0.08;
    o.lElb = -0.15 - run * 1.2; o.rElb = -0.15 - run * 1.2;
    // breathing/idle sway
    if (walkK < 0.2) { const b = Math.sin(time * 1.6 + p.id); o.rootY += b * 0.004; o.headYaw = Math.sin(time * 0.3 + p.id * 1.7) * 0.25; o.lArm = 0.04; o.rArm = 0.04; }
    // held item arm (hand side)
    const H = p.look.hand === 'L' ? 'l' : 'r';
    const item = p.look.handItem;
    if (item === 'phone') { o[H + 'Arm'] = -0.25; o[H + 'Elb'] = -1.5; }
    else if (item === 'coffee') { o[H + 'Arm'] = -0.1; o[H + 'Elb'] = -1.1; }
    else if (item === 'newspaper') { o[H + 'Arm'] = -0.05; o[H + 'Elb'] = -0.6; }
    else if (p.look.bag === 'briefcase') { o[H + 'Arm'] = sw * 0.12 * walkK; o[H + 'Elb'] = -0.05; o[H + 'Roll'] = 0.12; }
    if (p.look.parcel) { o.lArm = o.rArm = -0.55; o.lElb = o.rElb = -1.0; o.lRoll = o.rRoll = -0.12; }
    if (p.role === 'police') { o.lElb = o.rElb = -0.35; }
    o.sit = 0; o.crouch = 0;
    if (p.sitting) { o.sit = 1; o.lHip = o.rHip = -1.5; o.lKnee = o.rKnee = 1.5; o.lean = -0.08; }
    // actions
    const a = p.act;
    if (a === 'watch') { o.lArm = -0.85; o.lRoll = -0.55; o.lElb = -1.75; o.headPitch = 0.6; o.headYaw = 0.35; }
    else if (a === 'lookcam' && p.camT) {
      const c = p.camT; const dx = c.x - p.x, dz = c.z - p.z; const yawTo = angDiff(p.yaw, Math.atan2(dx, dz));
      o.headYaw = clamp(yawTo, -1.3, 1.3); o.headPitch = -0.75;
    } else if (a === 'glanceback' && p.glanceAt) { o.headYaw = clamp(angDiff(p.yaw, Math.atan2(p.glanceAt.x - p.x, p.glanceAt.z - p.z)), -1.4, 1.4); }
    else if (a === 'lookaround') { o.headYaw = Math.sin(time * (p.mode === 'siren' ? 7 : 2.4)) * (p.mode === 'siren' ? 1.1 : 0.8); o.headPitch = p.mode === 'siren' ? -0.15 : 0; if (p.mode === 'siren') { o.lArm = o.rArm = -0.25; o.lRoll = o.rRoll = 0.3; } }
    else if (a === 'avert' && p.avertFrom) {
      // turn the face away from whoever is passing, chin down, free hand up to shield the face
      const f = p.avertFrom; const yawTo = angDiff(p.yaw, Math.atan2(f.x - p.x, f.z - p.z));
      const k = Math.min(1, (1.6 - (p.actT || 0)) * 5, (p.actT || 0) * 5);
      o.headYaw = clamp(-Math.sign(yawTo || 1) * 1.25, -1.3, 1.3) * k; o.headPitch = 0.55 * k;
      const S = item !== 'none' ? (H === 'l' ? 'r' : 'l') : (yawTo > 0 ? 'l' : 'r');
      if (!p.look.parcel) { o[S + 'Arm'] = -1.45 * k; o[S + 'Roll'] = 0.2 * k; o[S + 'Elb'] = -2.45 * k; }
    }
    else if (a === 'glancesiren') { const s = this.V.sirenAt; o.headYaw = clamp(angDiff(p.yaw, Math.atan2(s.x - p.x, s.z - p.z)), -1.3, 1.3); }
    else if (a === 'phonecall' && item === 'phone') { o[H + 'Arm'] = -0.35; o[H + 'Roll'] = 0.35; o[H + 'Elb'] = -2.5; o.headPitch = 0.1; }
    else if (a === 'sip' && item === 'coffee') { o[H + 'Arm'] = -0.5; o[H + 'Elb'] = -2.3; o.headPitch = -0.15; }
    else if (a === 'read' && item === 'newspaper') { o.lArm = o.rArm = -0.55; o.lElb = o.rElb = -1.3; o.headPitch = 0.45; }
    else if (a === 'chat') { const k = Math.sin(time * 5 + p.id); const S = (p.id & 1) ? 'l' : 'r'; if (!(S === H && item !== 'none')) { o[S + 'Arm'] = -0.5 - k * 0.2; o[S + 'Elb'] = -1.2 + k * 0.3; } o.headPitch = 0.02 + Math.sin(time * 3 + p.id) * 0.06; }
    else if (a === 'gesture') { const k = Math.sin(time * 4 + p.id); o.rArm = -0.7 - k * 0.3; o.rElb = -0.9; o.rRoll = 0.3; }
    else if (a === 'browse') { o.lean = 0.25; o.headPitch = 0.5; o.rArm = -0.8; o.rElb = -0.4; }
    else if (a === 'dance') {
      const b = time * (6 + (p.danceStyle || 0)) + p.id;
      o.rootY = Math.abs(Math.sin(b)) * 0.07; o.lean = Math.sin(b * 0.5) * 0.08;
      if (p.danceStyle === 0) { o.lArm = -2.6 + Math.sin(b) * 0.3; o.rArm = -2.6 - Math.sin(b) * 0.3; o.lElb = o.rElb = -0.3; o.lRoll = o.rRoll = 0.3; }
      else if (p.danceStyle === 1) { o.lArm = -1.2 + Math.sin(b) * 0.6; o.rArm = -1.2 - Math.sin(b) * 0.6; o.lElb = o.rElb = -1.4; }
      else { o.lArm = -0.4; o.rArm = -2.7 + Math.sin(b) * 0.25; o.rElb = -0.2; o.lElb = -1.5; }
      o.lKnee = 0.25 + Math.max(0, Math.sin(b)) * 0.3; o.rKnee = 0.25 + Math.max(0, -Math.sin(b)) * 0.3; o.lHip = -o.lKnee * 0.5; o.rHip = -o.rKnee * 0.5;
      o.headPitch = Math.sin(b) * 0.15; o.headYaw = Math.sin(b * 0.5) * 0.3;
      if (item !== 'none') { o[H + 'Arm'] = -0.4; o[H + 'Elb'] = -1.3; }
    } else if (a === 'cower') {
      o.crouch = 1; o.lHip = o.rHip = -1.6; o.lKnee = o.rKnee = 2.3; o.lean = 0.55; o.lArm = o.rArm = -2.5; o.lElb = o.rElb = -1.9; o.lRoll = o.rRoll = 0.4; o.headPitch = 0.6;
    } else if (a === 'crouch') {
      o.crouch = 1; o.lHip = o.rHip = -1.5; o.lKnee = o.rKnee = 2.2; o.lean = 0.6; o.lArm = o.rArm = -0.9; o.lElb = o.rElb = -0.4; o.headPitch = 0.4;
    }
    if (p.mode === 'panic' || p.mode === 'flee') { o.headPitch = -0.05; if (p.mode === 'panic' && run < 0.3 && walkK < 0.2) { o.lArm = o.rArm = -0.4; } }
    // root height (sit / crouch)
    const s = p.look.h / 1.75;
    o.yBase = 0;
    if (o.sit) o.yBase = (p.spot?.h ?? 0.46) - 0.93 * s + 0.06;
    if (o.crouch) o.yBase = -0.42 * s;
    p.rootY = o.yBase;
    return o;
  }

  writeMatrices(p, o) {
    const M = this.meshes, i = p.id, L = p.look, s = L.h / 1.75;
    // root
    const root = _root.makeTranslation(p.x, o.yBase + o.rootY * (o.sit ? 0 : 1), p.z);
    if (p.down > 0) {
      const f = easeOutBounce(Math.min(1, p.down));
      root.multiply(_r.makeRotationY(p.fallYaw ?? p.yaw)).multiply(_r.makeRotationX(f * PI * 0.5)).multiply(_r.makeRotationY(-(p.fallYaw ?? p.yaw)));
      root.premultiply(_t.makeTranslation(0, f * 0.14 * s, 0));
      o.lHip = o.rHip = -0.1; o.lKnee = o.rKnee = 0.2; o.lArm = -0.4; o.rArm = -0.3; o.lRoll = o.rRoll = 0.8; o.lElb = o.rElb = -0.2; o.headYaw = 0.3; o.headPitch = 0;
    }
    root.multiply(_r.makeRotationY(p.yaw)).multiply(_t.makeScale(s, s, s));
    // pelvis & torso
    const pelvis = _pel.copy(root).multiply(_t.makeTranslation(0, 0.93, 0));
    const chestBase = _a.copy(pelvis).multiply(_r.makeRotationX(o.lean));
    const wx = L.wx || 1;
    M.torso.setMatrixAt(i, _m.copy(chestBase).multiply(_t.makeTranslation(0, 0.25, 0)).multiply(_s.makeScale(wx, 1, 0.78 * wx)));
    this.acc('vest', p, p.role === 'police' ? _m.copy(chestBase).multiply(_t.makeTranslation(0, 0.25, 0)).multiply(_s.makeScale(wx, 1, 0.8 * wx)) : ZERO);
    const chest = _ch.copy(chestBase).multiply(_t.makeTranslation(0, 0.47, 0));
    // head
    const head = _h.copy(chest).multiply(_t.makeTranslation(0, 0.18, 0.01)).multiply(_r.makeRotationY(o.headYaw)).multiply(_r.makeRotationX(o.headPitch));
    M.head.setMatrixAt(i, head);
    this.acc('hair', p, L.hat === 'beanie' || L.hat === 'police' ? ZERO : L.hat !== 'none' ? _m.copy(head).multiply(_t.makeTranslation(0, -0.004, 0.004)).multiply(_s.makeScale(0.93, 0.9, 0.93)) : _m.copy(head).multiply(_t.makeTranslation(0, 0.012, -0.004)));
    for (const ht of ['cap', 'fedora', 'beanie', 'sunhat', 'police']) this.acc(ht, p, L.hat === ht ? _m.copy(head).multiply(_t.makeTranslation(0, ht === 'fedora' ? 0.075 : ht === 'police' ? 0.06 : 0.02, 0)).multiply(_r.makeRotationX(ht === 'cap' ? -0.08 : 0)) : ZERO);
    M.eyes.setMatrixAt(i, head);
    this.acc('glasses', p, L.glasses ? _m.copy(head).multiply(_t.makeTranslation(0, 0.014, 0.108)) : ZERO);
    // arms
    let handL = null, handR = null;
    for (const side of [0, 1]) {
      const sg = side === 0 ? 1 : -1; // left = +x
      const pre = side === 0 ? 'l' : 'r';
      const sh = _b.copy(chest).multiply(_t.makeTranslation(0.205 * sg * wx, -0.04, 0)).multiply(_r.makeRotationX(o[pre + 'Arm'])).multiply(_r.makeRotationZ(o[pre + 'Roll'] * sg));
      M.uarm.setMatrixAt(i * 2 + side, _m.copy(sh).multiply(_t.makeTranslation(0, -0.14, 0)));
      const el = _c.copy(sh).multiply(_t.makeTranslation(0, -0.28, 0)).multiply(_r.makeRotationX(o[pre + 'Elb']));
      M.farm.setMatrixAt(i * 2 + side, _m.copy(el).multiply(_t.makeTranslation(0, -0.13, 0)));
      const hand = _m.copy(el).multiply(_t.makeTranslation(0, -0.28, 0));
      M.hand.setMatrixAt(i * 2 + side, hand);
      if (side === 0) { handL = _hl.copy(hand); this.acc('watch', p, L.watch ? _m2.copy(el).multiply(_t.makeTranslation(0, -0.22, 0)).multiply(_s.makeScale(0.9, 1, 0.9)) : ZERO); }
      else handR = _hr.copy(hand);
    }
    // held items
    const hm = L.hand === 'L' ? handL : handR;
    const it = L.handItem;
    this.acc('phone', p, it === 'phone' ? _m.copy(hm).multiply(_t.makeTranslation(0, -0.04, 0.03)).multiply(_r.makeRotationX(-0.4)) : ZERO);
    this.acc('coffee', p, it === 'coffee' ? _m.copy(hm).multiply(_t.makeTranslation(0, -0.03, 0.04)).multiply(_r.makeRotationX(-(o[(L.hand === 'L' ? 'l' : 'r') + 'Arm'] + o[(L.hand === 'L' ? 'l' : 'r') + 'Elb']))) : ZERO);
    this.acc('newspaper', p, it === 'newspaper' ? _m.copy(hm).multiply(_t.makeTranslation(0, -0.08, 0.05)) : ZERO);
    this.acc('briefcase', p, L.bag === 'briefcase' ? _m.copy(hm).multiply(_t.makeTranslation(0, -0.2, 0)).multiply(_r.makeRotationY(0)) : ZERO);
    // bags on body
    this.acc('backpack', p, L.bag === 'backpack' ? _m.copy(chest).multiply(_t.makeTranslation(0, -0.2, -0.2 * wx)) : ZERO);
    this.acc('shoulder', p, L.bag === 'shoulder' ? _m.copy(pelvis).multiply(_t.makeTranslation(-0.24 * wx, 0.02, 0.02)) : ZERO);
    this.acc('strap', p, L.bag === 'shoulder' || L.bag === 'backpack' ? _m.copy(chest).multiply(_t.makeTranslation(L.bag === 'shoulder' ? 0 : 0.12, -0.2, L.bag === 'shoulder' ? 0.13 * wx : 0.12 * wx)).multiply(_r.makeRotationZ(L.bag === 'shoulder' ? 0.7 : 0)) : ZERO);
    this.acc('parcel', p, L.parcel && p.down <= 0 ? _m.copy(chest).multiply(_t.makeTranslation(0, -0.33, 0.27)) : ZERO);
    // legs
    for (const side of [0, 1]) {
      const sg = side === 0 ? 1 : -1, pre = side === 0 ? 'l' : 'r';
      const hip = _b.copy(pelvis).multiply(_t.makeTranslation(0.095 * sg, 0, 0)).multiply(_r.makeRotationX(o[pre + 'Hip']));
      M.thigh.setMatrixAt(i * 2 + side, _m.copy(hip).multiply(_t.makeTranslation(0, -0.22, 0)));
      const knee = _c.copy(hip).multiply(_t.makeTranslation(0, -0.44, 0)).multiply(_r.makeRotationX(o[pre + 'Knee']));
      M.shin.setMatrixAt(i * 2 + side, _m.copy(knee).multiply(_t.makeTranslation(0, -0.22, 0)));
      const foot = _m.copy(knee).multiply(_t.makeTranslation(0, -0.45, 0.05)).multiply(_r.makeRotationX(-(o[pre + 'Hip'] + o[pre + 'Knee']) * (o.sit ? 0.5 : 0.8)));
      M.shoe.setMatrixAt(i * 2 + side, foot);
    }
    this.acc('skirt', p, L.bottomType === 'skirt' ? _m.copy(pelvis).multiply(_t.makeTranslation(0, -0.16, o.sit ? 0.12 : 0)).multiply(_r.makeRotationX(o.sit ? -0.9 : 0)) : ZERO);
  }

  // accessories are packed: only people who have one are drawn (mesh.count), colour written per frame
  acc(name, p, m) {
    if (m === ZERO) return;
    const mesh = this.meshes[name], k = this.cnt[name]++;
    mesh.setMatrixAt(k, m); mesh.setColorAt(k, _col.setHex(p.colors[name] ?? 0xffffff));
  }
  showRing(p) { this.ring.visible = !!p; if (p) this.ring.position.set(p.fallen ? p.x + Math.sin(p.fallYaw ?? 0) * 0.8 : p.x, 0.05, p.fallen ? p.z + Math.cos(p.fallYaw ?? 0) * 0.8 : p.z); }

  dispose() { this.scene.remove(this.group); for (const m of Object.values(this.meshes)) { m.dispose(); m.material.dispose(); } for (const g of Object.values(this.geos)) g.dispose(); }
}

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _col = new THREE.Color();
const ACC_PARTS = ["vest","hair","glasses","watch","phone","coffee","newspaper","briefcase","backpack","shoulder","strap","parcel","skirt","cap","fedora","beanie","sunhat","police"];
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _t = new THREE.Matrix4(), _r = new THREE.Matrix4(), _s = new THREE.Matrix4();
const _root = new THREE.Matrix4(), _pel = new THREE.Matrix4(), _a = new THREE.Matrix4(), _b = new THREE.Matrix4(), _c = new THREE.Matrix4(), _ch = new THREE.Matrix4(), _h = new THREE.Matrix4(), _hl = new THREE.Matrix4(), _hr = new THREE.Matrix4();

function easeOutBounce(x) { const n = 7.5625, d = 2.75; if (x < 1 / d) return n * x * x; if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75; if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375; return n * (x -= 2.625 / d) * x + 0.984375; }

// distance-based ray vs capsule (segment a-b, radius rad); returns ray t or null
function raySegment(o, d, ax, ay, az, bx, by, bz, rad) {
  const ux = bx - ax, uy = by - ay, uz = bz - az;
  const wx = o.x - ax, wy = o.y - ay, wz = o.z - az;
  const a = d.x * d.x + d.y * d.y + d.z * d.z, b = d.x * ux + d.y * uy + d.z * uz, c = ux * ux + uy * uy + uz * uz;
  const dd = d.x * wx + d.y * wy + d.z * wz, e = ux * wx + uy * wy + uz * wz;
  const den = a * c - b * b;
  let sc, tc;
  if (den < 1e-8) { sc = 0; tc = e / c; } else { sc = (b * e - c * dd) / den; tc = (a * e - b * dd) / den; }
  tc = clamp(tc, 0, 1);
  sc = (b * tc - dd) / a; if (sc < 0) return null;
  const px = o.x + d.x * sc - (ax + ux * tc), py = o.y + d.y * sc - (ay + uy * tc), pz = o.z + d.z * sc - (az + uz * tc);
  return px * px + py * py + pz * pz <= rad * rad ? sc : null;
}
