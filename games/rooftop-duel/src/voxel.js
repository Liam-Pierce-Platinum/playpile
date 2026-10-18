// Voxel mesher with baked per-vertex ambient occlusion + the "chunky voxel" shader.
import * as THREE from 'three';
THREE.ColorManagement.enabled = false; // colours are authored as display values; post pass writes them raw

export const U = {
  sunDir: { value: new THREE.Vector3(0.4, 0.7, 0.6).normalize() },
  sunCol: { value: new THREE.Color(1, 0.9, 0.8) },
  skyCol: { value: new THREE.Color(0.5, 0.5, 0.7) },
  gndCol: { value: new THREE.Color(0.3, 0.2, 0.2) },
  fogCol: { value: new THREE.Color(0.8, 0.6, 0.5) },
  fogNear: { value: 30 }, fogFar: { value: 150 },
  glow: { value: 0.5 }, time: { value: 0 },
};

export class Vox {
  constructor(x, y, z) { this.sx = x; this.sy = y; this.sz = z; this.c = new Int32Array(x * y * z).fill(-1); this.e = new Uint8Array(x * y * z); }
  in(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < this.sx && y < this.sy && z < this.sz; }
  set(x, y, z, c, e = 0) { if (this.in(x, y, z)) { const i = x + this.sx * (y + this.sy * z); this.c[i] = c; this.e[i] = e; } }
  get(x, y, z) { return this.in(x, y, z) ? this.c[x + this.sx * (y + this.sy * z)] : -1; }
  box(x0, y0, z0, x1, y1, z1, c, e = 0) {
    for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const v = typeof c === 'function' ? c(x, y, z) : c;
      if (Array.isArray(v)) this.set(x, y, z, v[0], v[1]); else this.set(x, y, z, v, e);
    }
  }
}

const AO = [0.42, 0.64, 0.83, 1];
const hash = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };

export function voxGeo(v, s = 1, o = [0, 0, 0], jit = 0.045) {
  const P = [], N = [], C = [], T = [], I = [];
  const solid = (p) => v.get(p[0], p[1], p[2]) >= 0;
  for (let z = 0; z < v.sz; z++) for (let y = 0; y < v.sy; y++) for (let x = 0; x < v.sx; x++) {
    const col = v.get(x, y, z); if (col < 0) continue;
    const em = v.e[x + v.sx * (y + v.sy * z)] / 255;
    const k = 1 + (hash(x, y, z) - 0.5) * 2 * jit;
    const r = ((col >> 16) & 255) / 255 * k, g = ((col >> 8) & 255) / 255 * k, b = (col & 255) / 255 * k;
    for (let d = 0; d < 3; d++) for (const sg of [1, -1]) {
      const q = [x, y, z]; q[d] += sg; if (solid(q)) continue;
      const u = (d + 1) % 3, w = (d + 2) % 3, base = P.length / 3, aos = [];
      const corners = sg > 0 ? [[0, 0], [1, 0], [1, 1], [0, 1]] : [[0, 0], [0, 1], [1, 1], [1, 0]];
      for (const [cu, cw] of corners) {
        const pos = [x, y, z]; pos[d] += sg > 0 ? 1 : 0; pos[u] += cu; pos[w] += cw;
        const du = cu ? 1 : -1, dw = cw ? 1 : -1;
        const a = [...q]; a[u] += du; const bb = [...q]; bb[w] += dw; const c = [...q]; c[u] += du; c[w] += dw;
        const s1 = solid(a), s2 = solid(bb), s3 = solid(c);
        const ao = s1 && s2 ? 0 : 3 - (s1 + s2 + s3); aos.push(ao);
        P.push((pos[0] - o[0]) * s, (pos[1] - o[1]) * s, (pos[2] - o[2]) * s);
        const n = [0, 0, 0]; n[d] = sg; N.push(...n);
        C.push(r * AO[ao], g * AO[ao], b * AO[ao], em); T.push(cu, cw);
      }
      if (aos[0] + aos[2] < aos[1] + aos[3]) I.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
      else I.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  geo.setAttribute('vcol', new THREE.Float32BufferAttribute(C, 4));
  geo.setAttribute('fuv', new THREE.Float32BufferAttribute(T, 2));
  geo.setIndex(I); geo.computeBoundingSphere();
  return geo;
}

const VS = /* glsl */`
attribute vec4 vcol; attribute vec2 fuv;
varying vec4 vC; varying vec3 vN; varying vec3 vW; varying vec2 vUv;
void main(){
  vec4 p = vec4(position, 1.0); vec3 n = normal; vC = vcol;
  #ifdef USE_INSTANCING
    p = instanceMatrix * p; n = mat3(instanceMatrix) * n;
  #endif
  #ifdef USE_INSTANCING_COLOR
    vC.rgb *= min(instanceColor, vec3(1.0));
    vC.a = max(vC.a, clamp(max(instanceColor.r, max(instanceColor.g, instanceColor.b)) - 1.0, 0.0, 1.0));
  #endif
  vec4 w = modelMatrix * p; vW = w.xyz; vN = normalize(mat3(modelMatrix) * n); vUv = fuv;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const FS = /* glsl */`
uniform vec3 sunDir, sunCol, skyCol, gndCol, fogCol; uniform float fogNear, fogFar, glow, flash;
varying vec4 vC; varying vec3 vN; varying vec3 vW; varying vec2 vUv;
void main(){
  vec3 n = normalize(vN);
  float ndl = dot(n, sunDir);
  float l = smoothstep(-0.04, 0.10, ndl) * (0.55 + 0.45 * max(ndl, 0.0));
  vec3 hemi = mix(gndCol, skyCol, n.y * 0.5 + 0.5);
  vec3 c = vC.rgb * (hemi + sunCol * l);
  vec2 e = min(vUv, 1.0 - vUv);
  c *= mix(0.8, 1.0, smoothstep(0.0, 0.08, min(e.x, e.y)));      // chiselled voxel edge
  vec3 V = normalize(cameraPosition - vW);
  c += vC.rgb * pow(1.0 - max(dot(n, V), 0.0), 3.0) * skyCol * 0.35; // sky rim
  c = mix(c, vC.rgb * 1.6 + 0.08, vC.a * glow);
  c = mix(c, vec3(1.0, 0.97, 0.9), flash);
  float f = smoothstep(fogNear, fogFar, length(vW - cameraPosition));
  f = max(f, smoothstep(-6.0, -40.0, vW.y) * 0.85);               // haze in the street canyons
  gl_FragColor = vec4(mix(c, fogCol, f), 1.0);
}`;

export function makeMat(extra = {}) {
  return new THREE.ShaderMaterial({ uniforms: { ...U, flash: { value: 0 }, ...extra }, vertexShader: VS, fragmentShader: FS });
}

export function skyMat() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, sun: { value: new THREE.Vector3(0.3, 0.1, -1).normalize() }, sunCol: U.sunCol, stars: { value: 0 } },
    vertexShader: `varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top, hor, sun, sunCol; uniform float stars; varying vec3 vD;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
      void main(){ vec3 d = normalize(vD); float y = clamp(d.y, -0.2, 1.0);
        vec3 c = mix(hor, top, pow(max(y, 0.0), 0.55));
        float s = max(dot(d, sun), 0.0);
        c += sunCol * (smoothstep(0.9975, 0.999, s) * 1.4 + pow(s, 10.0) * 0.3);
        c += step(0.9975, h(floor(d * 260.0))) * stars * smoothstep(0.05, 0.35, y);
        gl_FragColor = vec4(c, 1.0); }`,
  });
}

export function postMat(tex) {
  return new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false,
    uniforms: { t: { value: tex }, time: { value: 0 }, hit: { value: 0 }, res: { value: new THREE.Vector2(1, 1) } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `uniform sampler2D t; uniform float time, hit; uniform vec2 res; varying vec2 vUv;
      void main(){ vec2 c = vUv - 0.5; float ca = 0.002 + hit * 0.012;
        vec3 col = vec3(texture2D(t, vUv + c * ca).r, texture2D(t, vUv).g, texture2D(t, vUv - c * ca).b);
        col = mix(col, col * col * (3.0 - 2.0 * col), 0.4);           // gentle S-curve
        col *= mix(0.7, 1.0, smoothstep(0.9, 0.25, length(c * vec2(1.0, 0.85))));
        float g = fract(sin(dot(floor(vUv * res) + fract(time) * 97.0, vec2(12.9898, 78.233))) * 43758.5453);
        col += (g - 0.5) * 0.03 + vec3(1.0, 0.9, 0.8) * hit * 0.12;
        gl_FragColor = vec4(col, 1.0); }`,
  });
}
