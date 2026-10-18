// Endless track: a twisting, descending ribbon of grid cells built chunk by chunk.
import * as THREE from '../vendor/three.module.js';
export const CH = 30, ROW = 1.5, ROWS = 20, COLS = 6, SECTOR = 400, R = 0.42;
export const PALETTES = [
  { name: 'NEON DRIVE', a: [1.0, 0.18, 0.82], b: [0.18, 0.95, 1.0], sky: [0.26, 0.03, 0.32] },
  { name: 'ULTRAVIOLET', a: [0.62, 0.36, 1.0], b: [1.0, 0.36, 0.88], sky: [0.12, 0.02, 0.34] },
  { name: 'MIAMI DUSK', a: [1.0, 0.48, 0.18], b: [1.0, 0.18, 0.5], sky: [0.34, 0.05, 0.16] },
  { name: 'ICE GRID', a: [0.18, 1.0, 0.84], b: [0.25, 0.55, 1.0], sky: [0.02, 0.10, 0.30] },
  { name: 'ACID LINE', a: [0.78, 1.0, 0.18], b: [0.18, 1.0, 0.55], sky: [0.04, 0.18, 0.10] },
  { name: 'CRIMSON', a: [1.0, 0.2, 0.25], b: [1.0, 0.7, 0.2], sky: [0.30, 0.03, 0.05] },
];
export function rng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

const VERT = `attribute float kind; varying vec2 vUv; varying float vKind; varying vec3 vW; varying float vDist;
void main(){ vUv=uv; vKind=kind; vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; vec4 mv=viewMatrix*w; vDist=-mv.z; gl_Position=projectionMatrix*mv; }`;
const TRACK_FRAG = `uniform vec3 uA,uB,uFog,uBall; uniform float uTime; varying vec2 vUv; varying float vKind; varying vec3 vW; varying float vDist;
void main(){ vec3 col;
 if(vKind<0.5){
  vec2 g=vec2(vUv.x, vUv.y/1.5); vec2 f=abs(fract(g-0.5)-0.5)/max(fwidth(g),vec2(1e-4));
  float line=1.0-min(min(f.x,f.y)*0.7,1.0);
  vec2 g2=g*4.0; vec2 f2=abs(fract(g2-0.5)-0.5)/max(fwidth(g2),vec2(1e-4));
  float sub=1.0-min(min(f2.x,f2.y),1.0);
  float pulse=smoothstep(0.9,1.0,fract(vUv.y*0.012-uTime*0.7));
  col=vec3(0.03,0.012,0.06)+uB*sub*0.10+uA*line*(1.5+pulse*2.5)+uB*pulse*0.10;
  float d=length(vW.xz-uBall.xz); col+=uB*exp(-d*d*0.4)*1.1+uA*exp(-d*0.45)*0.12;
  float e=min(vUv.x,6.0-vUv.x); col+=uB*(1.0-smoothstep(0.0,0.1,e))*3.0;
 } else {
  col=mix(uB*0.03,uA*0.45,vUv.y*vUv.y)+uA*smoothstep(0.86,1.0,vUv.y)*2.4;
 }
 col=mix(col,uFog,1.0-exp(-vDist*0.0085)); gl_FragColor=vec4(col,1.0); }`;
const OBS_FRAG = `uniform vec3 uFog; uniform float uTime; varying vec2 vUv; varying float vDist;
void main(){ vec2 e2=min(vUv,1.0-vUv); float e=min(e2.x,e2.y); float fw=fwidth(e);
 float line=1.0-smoothstep(fw*0.8,fw*2.4,e); float inner=1.0-smoothstep(fw*0.5,fw*1.8,abs(e-0.2));
 vec3 col=vec3(0.14,0.0,0.03)+vec3(3.2,0.28,0.4)*line+vec3(1.4,0.1,0.25)*inner*(0.55+0.45*sin(uTime*7.0));
 col=mix(col,uFog,1.0-exp(-vDist*0.0085)); gl_FragColor=vec4(col,1.0); }`;

function quad(P, UV, K, a, b, c, d, ua, ub, uc, ud, k) {
  P.push(...a, ...b, ...c, ...a, ...c, ...d); UV.push(...ua, ...ub, ...uc, ...ua, ...uc, ...ud); for (let i = 0; i < 6; i++) K.push(k);
}
function box(P, UV, x, y, z, hx, hy, hz) {
  const v = (sx, sy, sz) => [x + sx * hx, y + sy * hy, z + sz * hz];
  const F = [[[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]],
    [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]], [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]],
    [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]]];
  const K = [];
  for (const f of F) quad(P, UV, K, v(...f[0]), v(...f[1]), v(...f[2]), v(...f[3]), [0, 0], [1, 0], [1, 1], [0, 1], 0);
}

export class Track {
  constructor(scene, U) {
    this.scene = scene;
    this.matT = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: TRACK_FRAG, uniforms: { uA: U.colA, uB: U.colB, uFog: U.fog, uBall: U.ball, uTime: U.time }, side: THREE.DoubleSide });
    this.matO = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: OBS_FRAG, uniforms: { uFog: U.fog, uTime: U.time } });
    this.pGeo = new THREE.OctahedronGeometry(0.32);
    this.pMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.0, 2.5, 0.6) });
    this.pWire = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.0, 0.2), wireframe: true });
    this.chunks = new Map();
    this.reset(1);
  }
  reset(seed) {
    for (const c of this.chunks.values()) this.dispose(c);
    this.chunks.clear(); this.prefix = [0]; this.seed = seed; this.gen = 0; this.nextFree = 0;
    const r = rng(seed * 7919 + 13); this.p = [r() * 6.28, r() * 6.28, r() * 6.28];
  }
  amp(s) { return Math.min(1, Math.max(0, (s - 60) / 700)); }
  cx(s) { const a = this.amp(s), p = this.p; return a * (9 * Math.sin(s * 0.011 + p[0]) + 4 * Math.sin(s * 0.027 + p[1]) + 1.6 * Math.sin(s * 0.05 + p[2])); }
  cxd(s) { return (this.cx(s + 0.5) - this.cx(s - 0.5)); }
  hwSec(sec) { return Math.max(1.85, 3.3 - sec * 0.2); }
  hw(s) {
    const sec = Math.floor(s / SECTOR), t = Math.min(1, Math.max(0, (s - sec * SECTOR) / 40));
    const base = sec > 0 ? this.hwSec(sec - 1) + (this.hwSec(sec) - this.hwSec(sec - 1)) * t : this.hwSec(0);
    return base + 0.35 * Math.sin(s * 0.037);
  }
  gy(s) {
    const k = Math.floor(s / CH); let d = this.prefix[Math.min(Math.max(k, 0), this.prefix.length - 1)];
    const c = this.chunks.get(k); if (c) for (const dr of c.drops) if (s >= dr.s) d += dr.d;
    return -0.2 * s + 1.6 * Math.sin(s * 0.017) - d;
  }
  gyd(s) { return -0.2 + 1.6 * 0.017 * Math.cos(s * 0.017); }
  cell(s, u) {
    const k = Math.floor(s / CH), c = this.chunks.get(k); if (!c) return null;
    const r = Math.floor((s - k * CH) / ROW), hw = this.hw(s);
    if (Math.abs(u) > hw) return { c, r, col: -1 };
    return { c, r, col: Math.min(COLS - 1, Math.floor((u + hw) / (2 * hw) * COLS)) };
  }
  solidAt(s, u) { const q = this.cell(s, u); if (!q) return s < 0; return q.col >= 0 && q.c.solid[q.r * COLS + q.col] === 1; }
  rowEmpty(s) { const q = this.cell(s, 0); if (!q) return false; for (let i = 0; i < COLS; i++) if (q.c.solid[q.r * COLS + i]) return false; return true; }
  cellU(s, c) { return ((c + 0.5) / COLS * 2 - 1) * this.hw(s); }
  // obstacle test: returns {o, hit, clear} for obstacles near s
  obstacles(s, fn) {
    const k = Math.floor(s / CH);
    for (const kk of [k - 1, k, k + 1]) { const c = this.chunks.get(kk); if (c) for (const o of c.obs) fn(o); }
  }
  obsAt(s, u, yRel = 0) {
    let hit = false;
    this.obstacles(s, (o) => {
      if (Math.abs(s - o.s) < o.hz + R * 0.8 && Math.abs(u - o.u) < o.hx + R * 0.85 && yRel < o.h + R) hit = true;
    });
    return hit;
  }
  generate(k) {
    const rand = rng(this.seed * 1000003 + k * 7907 + 1), s0 = k * CH, d = Math.min(1, s0 / 3200);
    const solid = new Uint8Array(ROWS * COLS).fill(1), obs = [], picks = [], drops = [];
    const clear = (r, c) => { if (r >= 0 && r < ROWS && c >= 0 && c < COLS) solid[r * COLS + c] = 0; };
    const spd = Math.min(46, 17 + s0 * 0.0065);
    const space = () => Math.ceil(spd * (0.5 - 0.14 * d) / ROW) + Math.floor(rand() * 3);
    if (k >= 3) {
      let r = Math.max(0, Math.ceil((this.nextFree - s0) / ROW));
      while (r < ROWS) {
        const p = rand(); let gapAfter = space();
        if (p < 0.12 + 0.1 * d && r <= ROWS - 2) {
          const len = rand() < 0.3 + 0.5 * d ? 2 : 1;
          for (let i = 0; i < len; i++) for (let c = 0; c < COLS; c++) clear(r + i, c);
          drops.push({ s: s0 + (r + 0.5) * ROW, d: 1.2 + rand() * 1.4 });
          r += len; gapAfter = Math.max(gapAfter, 8);
        } else if (p < 0.45) {
          const ww = Math.min(4, 1 + Math.floor(rand() * (1.5 + 2.5 * d))), c0 = Math.floor(rand() * (COLS - ww + 1));
          const len = 1 + Math.floor(rand() * (2 + 2 * d));
          for (let i = 0; i < len; i++) for (let c = c0; c < c0 + ww; c++) clear(r + i, c);
          r += len;
        } else if (p < 0.72) {
          const o = Math.floor(rand() * (COLS - 1)), n = 1 + Math.floor(rand() * (1 + 3 * d)), h = 0.7 + rand() * (0.6 + 1.6 * d);
          const cand = []; for (let c = 0; c < COLS; c++) if (c !== o && c !== o + 1) cand.push(c);
          for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
          for (let i = 0; i < Math.min(n, cand.length); i++) if (r < ROWS) obs.push({ r, c: cand[i], h });
          r += 1;
        } else if (p < 0.85 && d > 0.12) {
          let c = Math.floor(rand() * (COLS - 1)); const len = 4 + Math.floor(rand() * 5);
          for (let i = 0; i < len; i++) {
            if (i > 0 && i % 3 === 0) c = Math.min(COLS - 2, Math.max(0, c + (rand() < 0.5 ? -1 : 1)));
            for (let cc = 0; cc < COLS; cc++) if (cc !== c && cc !== c + 1) clear(r + i, cc);
          }
          r += len;
        } else {
          const c = Math.floor(rand() * COLS); for (let i = 0; i < 4 && r + i < ROWS; i++) picks.push({ r: r + i, c }); r += 4;
        }
        this.nextFree = s0 + (r + gapAfter) * ROW; r += gapAfter;
      }
      for (let r2 = 0; r2 < ROWS; r2++) if (rand() < 0.06) { const c = Math.floor(rand() * COLS); if (solid[r2 * COLS + c] && !obs.some((o) => o.r === r2)) picks.push({ r: r2, c }); }
    }
    const chunk = { k, solid, obs, picks, drops, group: new THREE.Group() };
    this.chunks.set(k, chunk);
    this.prefix[k + 1] = this.prefix[k] + drops.reduce((a, b) => a + b.d, 0);
    this.build(chunk);
    this.gen = k + 1;
  }
  build(ch) {
    const P = [], UV = [], K = [], s0 = ch.k * CH, DEPTH = 0.9;
    const pt = (s, u, dy = 0) => [this.cx(s) + u, this.gy(s) + dy, -s];
    const S = (r, c) => r < 0 || r >= ROWS ? 1 : (c < 0 || c >= COLS ? 0 : ch.solid[r * COLS + c]);
    for (let r = 0; r < ROWS; r++) {
      const sa = s0 + r * ROW + 0.0001, sb = s0 + (r + 1) * ROW - 0.0001, ha = this.hw(sa), hb = this.hw(sb);
      for (let c = 0; c < COLS; c++) {
        if (!ch.solid[r * COLS + c]) continue;
        const ua0 = (c / COLS * 2 - 1) * ha, ua1 = ((c + 1) / COLS * 2 - 1) * ha, ub0 = (c / COLS * 2 - 1) * hb, ub1 = ((c + 1) / COLS * 2 - 1) * hb;
        const A = pt(sa, ua0), B = pt(sa, ua1), C = pt(sb, ub1), D = pt(sb, ub0);
        quad(P, UV, K, A, B, C, D, [c, sa], [c + 1, sa], [c + 1, sb], [c, sb], 0);
        const dn = (p) => [p[0], p[1] - DEPTH, p[2]];
        if (!S(r, c - 1)) quad(P, UV, K, dn(A), dn(D), D, A, [0, 0], [1, 0], [1, 1], [0, 1], 1);
        if (!S(r, c + 1)) quad(P, UV, K, dn(C), dn(B), B, C, [0, 0], [1, 0], [1, 1], [0, 1], 1);
        if (!S(r - 1, c)) quad(P, UV, K, dn(B), dn(A), A, B, [0, 0], [1, 0], [1, 1], [0, 1], 1);
        if (!S(r + 1, c)) quad(P, UV, K, dn(D), dn(C), C, D, [0, 0], [1, 0], [1, 1], [0, 1], 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.setAttribute('kind', new THREE.Float32BufferAttribute(K, 1));
    const m = new THREE.Mesh(g, this.matT); m.frustumCulled = false; ch.group.add(m);
    if (ch.obs.length) {
      const OP = [], OU = [];
      for (const o of ch.obs) {
        o.s = s0 + (o.r + 0.5) * ROW; o.u = this.cellU(o.s, o.c); o.hx = (2 * this.hw(o.s) / COLS) * 0.38; o.hz = ROW * 0.38;
        box(OP, OU, this.cx(o.s) + o.u, this.gy(o.s) + o.h / 2 - 0.15, -o.s, o.hx, o.h / 2 + 0.15, o.hz);
      }
      const og = new THREE.BufferGeometry(); og.setAttribute('position', new THREE.Float32BufferAttribute(OP, 3)); og.setAttribute('uv', new THREE.Float32BufferAttribute(OU, 2));
      og.setAttribute('kind', new THREE.Float32BufferAttribute(new Float32Array(OP.length / 3), 1));
      const om = new THREE.Mesh(og, this.matO); om.frustumCulled = false; ch.group.add(om);
    }
    for (const p of ch.picks) {
      p.s = s0 + (p.r + 0.5) * ROW; p.u = this.cellU(p.s, p.c);
      p.mesh = new THREE.Mesh(this.pGeo, this.pMat); p.mesh.add(new THREE.Mesh(this.pGeo, this.pWire)); p.mesh.children[0].scale.setScalar(1.6);
      p.mesh.position.set(this.cx(p.s) + p.u, this.gy(p.s) + 0.75, -p.s); ch.group.add(p.mesh);
    }
    this.scene.add(ch.group);
  }
  dispose(c) { this.scene.remove(c.group); c.group.traverse((o) => { if (o.geometry && o.geometry !== this.pGeo) o.geometry.dispose(); }); }
  update(s, t) {
    const k = Math.floor(s / CH);
    while (this.gen <= k + 9) this.generate(this.gen);
    for (const [kk, c] of this.chunks) if (kk < k - 1) { this.dispose(c); this.chunks.delete(kk); }
    for (const c of this.chunks.values()) for (const p of c.picks) if (p.mesh.visible) { p.mesh.rotation.y = t * 3 + p.s; p.mesh.position.y = this.gy(p.s) + 0.75 + Math.sin(t * 4 + p.s) * 0.12; }
  }
  take(s, u, yRel) {
    let n = 0; const out = [];
    this.obstacles(s, () => {});
    for (const kk of [Math.floor(s / CH) - 1, Math.floor(s / CH), Math.floor(s / CH) + 1]) {
      const c = this.chunks.get(kk); if (!c) continue;
      for (const p of c.picks) if (p.mesh.visible && Math.abs(p.s - s) < 0.9 && Math.abs(p.u - u) < 0.85 && yRel < 2) { p.mesh.visible = false; n++; out.push(p.mesh.position.clone()); }
    }
    return out;
  }
}
