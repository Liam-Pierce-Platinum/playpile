// The town in the scene: painted ground, raised block slabs, one InstancedMesh
// per object type (and per peelable part), a spatial grid for "what is near
// this storm", and per-object state for lifting / orbiting / flying / falling.
import * as THREE from 'three';
import { makeTypes, rbox } from './geo.js';
import { genTown, paintGround, SLAB } from './town.js';

export const S = { GROUND: 0, LIFT: 1, RING: 2, GONE: 3, FLY: 4, FALL: 5, EAT: 6 };
// What a storm can lift: its own category and below, plus (for a Category-1
// storm) people-sized things at a slow rip, so no block is ever dead food.
export const canLift = (o, st) => o.def.tier <= st.tier || (o.def.tier === 1 && st.tier === 0);
const CELL = 6;

let TYPES = null, TYPE_INDEX = null;
export function types() {
  if (!TYPES) {
    TYPES = makeTypes();
    TYPE_INDEX = {};
    TYPES.forEach((t, i) => {
      TYPE_INDEX[t.key] = i;
      t.index = i;
      t.mats = t.parts.map(() => new THREE.MeshLambertMaterial({ vertexColors: true, side: t.double ? THREE.DoubleSide : THREE.FrontSide }));
    });
  }
  return TYPES;
}

const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export class World {
  constructor(scene, seed, opt = {}) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    const T = types();
    this.town = genTown(seed, opt);
    const t = this.town;
    this.bounds = t.bounds;
    // ---- ground ----
    const span = Math.max(t.bounds.maxX - t.bounds.minX, t.bounds.maxZ - t.bounds.minZ) + 30;
    const cxm = 0, czm = (t.bounds.minZ + t.bounds.maxZ) / 2;
    const ext = { minX: -span / 2, minZ: czm - span / 2, size: span };
    const cv = paintGround(t, ext, 2048);
    this.tex = new THREE.CanvasTexture(cv);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    const groundMat = new THREE.MeshLambertMaterial({ map: this.tex });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(span, span), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(cxm, 0, czm);
    ground.receiveShadow = true;
    this.group.add(ground);
    // far meadow so the edge never shows
    const far = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshLambertMaterial({ color: t.harbour ? '#86cc62' : '#86cc62' }));
    far.rotation.x = -Math.PI / 2; far.position.y = -0.05; far.receiveShadow = true;
    this.group.add(far);
    if (t.harbour) {
      const sea = new THREE.Mesh(new THREE.PlaneGeometry(2000, 1000), new THREE.MeshLambertMaterial({ color: '#4cc9ff' }));
      sea.rotation.x = -Math.PI / 2; sea.position.set(0, -0.04, t.waterZ - 500 - 0.1);
      this.group.add(sea);
      this.water = makeWater(t, span);
      this.group.add(this.water);
    }
    // raised block slabs share the ground texture via planar UVs
    const slabGeos = [];
    const addSlab = (x, z, w, d) => {
      const g = rbox(w, SLAB * 2, d, 0.45, 2);
      g.translate(x, 0, z);
      const p = g.attributes.position, uv = g.attributes.uv;
      for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - ext.minX) / span, 1 - (p.getZ(i) - ext.minZ) / span);
      slabGeos.push(g);
    };
    for (const b of t.blocks) addSlab(b.x, b.z, b.w, b.d);
    if (t.light) { addSlab(t.light.x, (t.waterZ + t.light.z) / 2, 3.2, t.waterZ - t.light.z); addSlab(t.light.x, t.light.z, 7, 7); }
    if (t.harbour) addSlab(0, t.waterZ + 1.7, span, 4.6);
    const slab = new THREE.Mesh(mergeSimple(slabGeos), groundMat);
    slab.receiveShadow = true; slab.castShadow = false;
    this.group.add(slab);

    // ---- objects ----
    const byType = T.map(() => []);
    this.objs = [];
    let id = 0;
    for (const o of t.objs) {
      const ti = TYPE_INDEX[o.key];
      const def = T[ti];
      const ob = { id: id++, def, x: o.x, z: o.z, rot: o.rot, base: def.water ? -0.12 : o.base, y: 0, rx: 0, rz: 0, sc: 1, peel: 0, state: S.GROUND, rip: 0, ripBy: null, ripTouched: false, owner: null, inst: byType[ti].length, orig: true, cell: -1, t: 0 };
      ob.y = ob.base;
      byType[ti].push(ob);
      this.objs.push(ob);
    }
    this.meshes = T.map((def, ti) => {
      const list = byType[ti];
      if (!list.length) return null;
      return def.parts.map((g, pi) => {
        const m = new THREE.InstancedMesh(g, def.mats[pi], list.length);
        m.castShadow = def.tier >= 2; m.receiveShadow = def.tier >= 3;
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.frustumCulled = false;
        this.group.add(m);
        return m;
      });
    });
    // foundation pads stay behind when buildings are ripped out
    const padList = this.objs.filter((o) => o.def.tier >= 4 && o.def.key !== 'stadium' && o.def.key !== 'lighthouse');
    if (padList.length) {
      const pads = new THREE.InstancedMesh(rbox(1, 0.12, 1, 0.05, 1), new THREE.MeshLambertMaterial({ color: '#d6d0c5' }), padList.length);
      padList.forEach((o, i) => {
        const w = o.def.key.startsWith('tower') ? 5.4 : o.def.key === 'silo' ? 2.6 : o.def.key === 'watertower' ? 3 : o.def.key === 'warehouse' ? 5.4 : 4.4;
        const d = o.def.key.startsWith('tower') ? 5.4 : o.def.key === 'silo' ? 2.6 : o.def.key === 'watertower' ? 3 : 3.8;
        _m.compose(_p.set(o.x, o.base + 0.04, o.z), _q.setFromEuler(_e.set(0, o.rot, 0)), _s.set(w, 1, d));
        pads.setMatrixAt(i, _m);
      });
      pads.receiveShadow = true;
      this.group.add(pads);
    }
    this.dirty = new Set();
    this.totalMass = 0;
    for (const o of this.objs) { this.writeMatrix(o); this.totalMass += o.def.mass; }
    // ---- grid ----
    const b = this.bounds;
    this.gx0 = b.minX - 20; this.gz0 = b.minZ - 20;
    this.gw = Math.ceil((b.maxX - b.minX + 40) / CELL); this.gh = Math.ceil((b.maxZ - b.minZ + 40) / CELL);
    this.cells = Array.from({ length: this.gw * this.gh }, () => []);
    for (const o of this.objs) this.gridAdd(o);
    this.active = new Set();
    this.groundCount = this.objs.length;
  }
  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => { if (o.isInstancedMesh) o.dispose(); else if (o.geometry && o.isMesh && !o.isInstancedMesh) { o.geometry.dispose(); } });
    this.tex.dispose();
  }
  cellOf(x, z) {
    const cx = Math.max(0, Math.min(this.gw - 1, ((x - this.gx0) / CELL) | 0));
    const cz = Math.max(0, Math.min(this.gh - 1, ((z - this.gz0) / CELL) | 0));
    return cz * this.gw + cx;
  }
  gridAdd(o) { o.cell = this.cellOf(o.x, o.z); this.cells[o.cell].push(o); }
  gridRemove(o) {
    if (o.cell < 0) return;
    const c = this.cells[o.cell], i = c.indexOf(o);
    if (i >= 0) { c[i] = c[c.length - 1]; c.pop(); }
    o.cell = -1;
  }
  near(x, z, r, fn) {
    const x0 = Math.max(0, ((x - r - this.gx0) / CELL) | 0), x1 = Math.min(this.gw - 1, ((x + r - this.gx0) / CELL) | 0);
    const z0 = Math.max(0, ((z - r - this.gz0) / CELL) | 0), z1 = Math.min(this.gh - 1, ((z + r - this.gz0) / CELL) | 0);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      const c = this.cells[cz * this.gw + cx];
      for (let i = 0; i < c.length; i++) fn(c[i]);
    }
  }
  writeMatrix(o) {
    const ms = this.meshes[o.def.index];
    if (o.state === S.GONE || o.sc <= 0.001) {
      for (const m of ms) m.setMatrixAt(o.inst, ZERO);
    } else {
      _e.set(o.rx, o.rot, o.rz, 'YXZ');
      _m.compose(_p.set(o.x, o.y, o.z), _q.setFromEuler(_e), _s.set(o.sc, o.sc * (o.sy || 1), o.sc));
      ms[0].setMatrixAt(o.inst, _m);
      if (ms.length > 1) {
        if (o.peel > 0.001) {
          _e.set(-o.peel * 0.9, 0, o.peel * 0.25);
          _m2.compose(_p.set(0, o.peel * 2.2, -o.peel * 0.8), _q.setFromEuler(_e), _s.set(1, 1, 1));
          _m2.premultiply(_m);
          ms[1].setMatrixAt(o.inst, _m2);
        } else ms[1].setMatrixAt(o.inst, _m);
      }
    }
    this.dirty.add(o.def.index);
  }
  flush() {
    for (const ti of this.dirty) for (const m of this.meshes[ti]) m.instanceMatrix.needsUpdate = true;
    this.dirty.clear();
  }
}

function mergeSimple(geos) {
  let n = 0;
  const flat = geos.map((g) => { const x = g.index ? g.toNonIndexed() : g; n += x.attributes.position.count; return x; });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const g of flat) {
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}

function makeWater(t, span) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec2 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uTime; varying vec2 vW;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec2 p = vW*0.18;
        float a = n(p + vec2(uTime*0.25, uTime*0.11)) + n(p*2.1 - vec2(uTime*0.18, -uTime*0.2))*0.5;
        float line = smoothstep(0.86, 0.95, fract(a*2.2));
        gl_FragColor = vec4(1.0,1.0,1.0, line*0.38);
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(span + 600, 400), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(0, 0.03, t.waterZ - 200 - 0.6);
  m.renderOrder = 1;
  return m;
}
