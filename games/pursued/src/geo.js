// Geometry buckets: everything that shares a material is appended into one buffer and becomes
// one draw call. Facade helpers work in a local frame (u along the wall, v up, d out of the wall).
import * as THREE from 'three';

export class Bucket {
  constructor(material, extra = null) {
    this.material = material;
    this.pos = []; this.nor = []; this.uv = []; this.idx = [];
    this.extra = extra; // { name: itemSize } extra per-vertex attributes
    this.ex = {};
    if (extra) for (const k in extra) this.ex[k] = [];
  }
  get count() { return this.pos.length / 3; }
  // four corners CCW seen from the front; uvs: array of 4 [u,v]; ex: per-quad extra values
  quad(a, b, c, d, uvs, ex) {
    const base = this.count;
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a)).normalize();
    for (const [p, t] of [[a, uvs[0]], [b, uvs[1]], [c, uvs[2]], [d, uvs[3]]]) {
      this.pos.push(p.x, p.y, p.z); this.nor.push(n.x, n.y, n.z); this.uv.push(t[0], t[1]);
    }
    if (this.extra) for (const k in this.extra) {
      const v = ex[k];
      for (let i = 0; i < 4; i++) { if (Array.isArray(v)) this.ex[k].push(...v); else this.ex[k].push(v); }
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  // append an arbitrary (indexed or not) BufferGeometry after transforming it
  geometry(g, matrix) {
    const gg = g.index ? g : g;
    const p = gg.attributes.position, n = gg.attributes.normal, t = gg.attributes.uv;
    const base = this.count;
    const v = new THREE.Vector3(), nm = new THREE.Matrix3().getNormalMatrix(matrix);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(matrix); this.pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); this.nor.push(v.x, v.y, v.z);
      if (t) this.uv.push(t.getX(i), t.getY(i)); else this.uv.push(0, 0);
    }
    if (gg.index) for (let i = 0; i < gg.index.count; i++) this.idx.push(base + gg.index.getX(i));
    else for (let i = 0; i < p.count; i++) this.idx.push(base + i);
  }
  build() {
    if (!this.count) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.extra) for (const k in this.extra) g.setAttribute(k, new THREE.Float32BufferAttribute(this.ex[k], this.extra[k]));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, this.material);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }
}

// A facade frame: world = o + t*u + up*v + n*d
export class Frame {
  constructor(origin, tangent, normal) {
    this.o = origin.clone(); this.t = tangent.clone(); this.n = normal.clone();
    this.up = new THREE.Vector3(0, 1, 0);
  }
  p(u, v, d = 0) {
    return new THREE.Vector3().copy(this.o).addScaledVector(this.t, u).addScaledVector(this.up, v).addScaledVector(this.n, d);
  }
  // flat quad on the wall plane at depth d, world-scaled uv (ts = metres per texture tile)
  wall(b, u0, v0, u1, v1, d, ts, uoff = 0) {
    if (u1 - u0 < 1e-4 || v1 - v0 < 1e-4) return;
    const U = x => (x + uoff) / ts, V = y => y / ts;
    b.quad(this.p(u0, v0, d), this.p(u1, v0, d), this.p(u1, v1, d), this.p(u0, v1, d),
      [[U(u0), V(v0)], [U(u1), V(v0)], [U(u1), V(v1)], [U(u0), V(v1)]]);
  }
  // axis-aligned box in facade space; skips the back face (against the wall)
  box(b, u0, u1, v0, v1, d0, d1, ts = 1, skipBack = true) {
    const P = (u, v, d) => this.p(u, v, d);
    const T = (a, c) => [a / ts, c / ts];
    // front
    b.quad(P(u0, v0, d1), P(u1, v0, d1), P(u1, v1, d1), P(u0, v1, d1), [T(u0, v0), T(u1, v0), T(u1, v1), T(u0, v1)]);
    // top
    b.quad(P(u0, v1, d1), P(u1, v1, d1), P(u1, v1, d0), P(u0, v1, d0), [T(u0, d1), T(u1, d1), T(u1, d0), T(u0, d0)]);
    // bottom
    b.quad(P(u0, v0, d0), P(u1, v0, d0), P(u1, v0, d1), P(u0, v0, d1), [T(u0, d0), T(u1, d0), T(u1, d1), T(u0, d1)]);
    // left
    b.quad(P(u0, v0, d0), P(u0, v0, d1), P(u0, v1, d1), P(u0, v1, d0), [T(d0, v0), T(d1, v0), T(d1, v1), T(d0, v1)]);
    // right
    b.quad(P(u1, v0, d1), P(u1, v0, d0), P(u1, v1, d0), P(u1, v1, d1), [T(d1, v0), T(d0, v0), T(d0, v1), T(d1, v1)]);
    if (!skipBack) b.quad(P(u1, v0, d0), P(u0, v0, d0), P(u0, v1, d0), P(u1, v1, d0), [T(u1, v0), T(u0, v0), T(u0, v1), T(u1, v1)]);
  }
  // the four inner faces of a rectangular hole of depth dep (window reveal)
  reveal(b, u0, u1, v0, v1, dep, ts) {
    const P = (u, v, d) => this.p(u, v, d);
    const T = (a, c) => [a / ts, c / ts];
    // left jamb faces +t
    b.quad(P(u0, v0, 0), P(u0, v0, -dep), P(u0, v1, -dep), P(u0, v1, 0), [T(0, v0), T(dep, v0), T(dep, v1), T(0, v1)]);
    // right jamb faces -t
    b.quad(P(u1, v0, -dep), P(u1, v0, 0), P(u1, v1, 0), P(u1, v1, -dep), [T(dep, v0), T(0, v0), T(0, v1), T(dep, v1)]);
    // head faces down
    b.quad(P(u0, v1, 0), P(u0, v1, -dep), P(u1, v1, -dep), P(u1, v1, 0), [T(u0, 0), T(u0, dep), T(u1, dep), T(u1, 0)]);
    // sill faces up
    b.quad(P(u0, v0, -dep), P(u0, v0, 0), P(u1, v0, 0), P(u1, v0, -dep), [T(u0, dep), T(u0, 0), T(u1, 0), T(u1, dep)]);
  }
}

// oriented beam between two world points
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _y = new THREE.Vector3(0, 1, 0);
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitCyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 10, 1);
export function beam(b, a, c, w, h = w, round = false) {
  const dir = new THREE.Vector3().subVectors(c, a);
  const len = dir.length();
  _q.setFromUnitVectors(_y, dir.clone().normalize());
  _m.compose(new THREE.Vector3().addVectors(a, c).multiplyScalar(0.5), _q, _s.set(w, len, h));
  b.geometry(round ? unitCyl : unitBox, _m);
}
export function worldBox(b, center, size, rotY = 0) {
  _q.setFromAxisAngle(_y, rotY);
  _m.compose(center, _q, _s.copy(size));
  b.geometry(unitBox, _m);
}
