// Everything that makes the ground read as wet: a tiling puddle mask, animated rain ripples,
// a material patch for wet PBR surfaces, and a planar reflection overlay for the street.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

export const LAYER_MAIN = 0, LAYER_REFLECTOR = 2, LAYER_RAIN = 3;

// ---------- tiling fbm puddle texture (R: big puddles, G: detail, B: grime) ----------
function periodicNoise(size, cells, seed) {
  const g = new Float32Array(cells * cells);
  let s = seed;
  for (let i = 0; i < g.length; i++) { s = (s * 16807) % 2147483647; g[i] = s / 2147483647; }
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const fx = x / size * cells, fy = y / size * cells;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const at = (i, j) => g[((j % cells) * cells) + (i % cells)];
    const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
    out[y * size + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  return out;
}
function fbm(size, base, oct, seed) {
  const acc = new Float32Array(size * size); let amp = 0.5, norm = 0;
  for (let o = 0; o < oct; o++) {
    const n = periodicNoise(size, base << o, seed + o * 131);
    for (let i = 0; i < acc.length; i++) acc[i] += n[i] * amp;
    norm += amp; amp *= 0.5;
  }
  for (let i = 0; i < acc.length; i++) acc[i] /= norm;
  return acc;
}
export function makePuddleTexture() {
  const S = 512;
  const r = fbm(S, 4, 5, 11), g = fbm(S, 8, 4, 977), b = fbm(S, 32, 3, 4441);
  const data = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) {
    data[i * 4] = r[i] * 255; data[i * 4 + 1] = g[i] * 255; data[i * 4 + 2] = b[i] * 255; data[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(data, S, S);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}

// ---------- animated ripple normal map ----------
export class Ripples {
  constructor(size = 512) {
    const opt = { type: THREE.HalfFloatType, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping };
    this.height = new THREE.WebGLRenderTarget(size, size, opt);
    this.normal = new THREE.WebGLRenderTarget(size, size, { ...opt, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    this.texture = this.normal.texture;
    this.hQuad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uRain: { value: 1 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`,
      fragmentShader: /* glsl */`
        varying vec2 vUv; uniform float uTime, uRain;
        float h12(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
        void main(){
          const float N = 9.0;
          vec2 uv = vUv*N; vec2 id = floor(uv); float h = 0.0;
          for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){
            vec2 c = id + vec2(float(i), float(j));
            vec2 cw = mod(c, N);
            for(int k=0;k<3;k++){
              float fk = float(k);
              float s = h12(cw*1.31 + fk*17.13);
              if (s > 0.35 + 0.65*uRain) continue;
              float ph = uTime*(0.8 + 0.7*s) + s*9.0;
              float life = fract(ph), cyc = floor(ph);
              vec2 ctr = c + vec2(h12(cw + cyc*0.173 + fk*3.1), h12(cw.yx + cyc*0.291 + fk*7.7));
              float d = length(uv - ctr);
              float x = d - life*1.05;
              float env = (1.0-life); env *= env;
              h += sin(x*30.0) * exp(-x*x*55.0) * env;
            }
          }
          gl_FragColor = vec4(h, 0.0, 0.0, 1.0);
        }`,
    }));
    this.nQuad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tH: { value: this.height.texture }, uTexel: { value: 1 / size } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`,
      fragmentShader: /* glsl */`
        varying vec2 vUv; uniform sampler2D tH; uniform float uTexel;
        void main(){
          float l = texture2D(tH, vUv - vec2(uTexel,0.)).r, r = texture2D(tH, vUv + vec2(uTexel,0.)).r;
          float d = texture2D(tH, vUv - vec2(0.,uTexel)).r, u = texture2D(tH, vUv + vec2(0.,uTexel)).r;
          vec3 n = normalize(vec3((l-r)*1.6, (d-u)*1.6, 1.0));
          gl_FragColor = vec4(n*0.5+0.5, 1.0);
        }`,
    }));
  }
  update(renderer, time, rain) {
    const prev = renderer.getRenderTarget();
    this.hQuad.material.uniforms.uTime.value = time;
    this.hQuad.material.uniforms.uRain.value = rain;
    renderer.setRenderTarget(this.height); this.hQuad.render(renderer);
    renderer.setRenderTarget(this.normal); this.nQuad.render(renderer);
    renderer.setRenderTarget(prev);
  }
}

// Shared uniforms for every wet surface so rain strength etc. can change live.
export const wetUniforms = {
  tPuddle: { value: null },
  tRipple: { value: null },
  uRain: { value: 1 },
};

// The puddle mask. Road puddles gather in the gutters along the curbs.
export const PUDDLE_GLSL = /* glsl */`
  uniform sampler2D tPuddle, tRipple;
  uniform float uRain, uPudTh, uGutter;
  float pudMask(vec2 xz){
    float m = texture2D(tPuddle, xz*0.031).r*0.72 + texture2D(tPuddle, xz*0.117 + 0.31).g*0.28;
    if (uGutter > 0.5) {
      float ax = abs(xz.x), az = abs(xz.y), g = 10.0;
      if (az < 6.0 && ax > 6.0) g = 6.0 - az;
      else if (ax < 6.0 && az > 6.0) g = 6.0 - ax;
      m += 0.26 * smoothstep(1.3, 0.0, g);
    }
    return smoothstep(uPudTh, uPudTh + 0.045, m);
  }
`;

// Patch a MeshStandardMaterial into a wet surface: darker, glossier, puddles with rain ripples.
export function makeWet(mat, { puddle = 0.6, gutter = false, wet = 1, rippleScale = 0.42, grime = false } = {}) {
  const local = { uPudTh: { value: puddle }, uGutter: { value: gutter ? 1 : 0 }, uWet: { value: wet } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, wetUniforms, local);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix*vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;\nuniform float uWet;\n' + PUDDLE_GLSL)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float pud = pudMask(vWP.xz) * smoothstep(0.5, 0.9, uWet);
        diffuseColor.rgb *= mix(1.0, 0.45, uWet);
        diffuseColor.rgb *= mix(1.0, 0.35, pud);
        float splashZ = 0.0;
        ${grime ? `
        // facade weathering: soot streaks running down from sills, a darker, wetter splash band at street level
        float along = vWP.x + vWP.z;
        float streak = smoothstep(0.5, 0.85, texture2D(tPuddle, vec2(along * 1.3, vWP.y * 0.018)).b)
                     * smoothstep(0.35, 0.7, texture2D(tPuddle, vec2(along * 0.21, vWP.y * 0.01 + 0.4)).r);
        float band = texture2D(tPuddle, vec2(along * 0.4, 0.3)).g;
        splashZ = 1.0 - smoothstep(0.25, 0.75 + band * 0.5, vWP.y - 0.15);
        diffuseColor.rgb *= mix(1.0, 0.62, streak) * mix(1.0, 0.58, splashZ);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.9, 0.86, 0.8), splashZ);` : ''}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor * mix(1.0, 0.5, uWet), 0.03, pud);
        roughnessFactor *= mix(1.0, 0.5, splashZ);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec3 rpl = texture2D(tRipple, vWP.xz * ${rippleScale.toFixed(3)}).xyz*2.0-1.0;
        vec3 rpw = normalize(vec3(rpl.x*uRain*0.9, 1.0, rpl.y*uRain*0.9));
        normal = normalize(mix(normal, normalize((viewMatrix*vec4(rpw,0.0)).xyz), pud));`);
  };
  mat.customProgramCacheKey = () => 'wet' + (gutter ? 'g' : '') + rippleScale + (grime ? 'G' : '');
  mat.userData.wet = local;
  return mat;
}

// ---------- planar reflection for a horizontal plane at height h ----------
export class PlanarReflection {
  constructor(h, scale = 0.5) {
    this.h = h; this.scale = scale;
    this.rt = new THREE.WebGLRenderTarget(4, 4, {
      type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter,
    });
    this.cam = new THREE.PerspectiveCamera();
    this.cam.layers.set(LAYER_MAIN);
    this.texMat = new THREE.Matrix4();
    this._v = new THREE.Vector3(); this._t = new THREE.Vector3(); this._la = new THREE.Vector3();
    this._p = new THREE.Plane(); this._q = new THREE.Vector4(); this._cp = new THREE.Vector4();
    this._rot = new THREE.Matrix4();
  }
  setSize(w, h) { this.rt.setSize(Math.max(4, Math.round(w * this.scale)), Math.max(4, Math.round(h * this.scale))); }
  update(renderer, scene, camera) {
    const N = new THREE.Vector3(0, 1, 0), P = new THREE.Vector3(camera.position.x, this.h, camera.position.z);
    const camPos = this._v.setFromMatrixPosition(camera.matrixWorld);
    if (camPos.y <= this.h + 0.01) return;
    const view = new THREE.Vector3().subVectors(P, camPos).reflect(N).negate().add(P);
    this._rot.extractRotation(camera.matrixWorld);
    const look = this._la.set(0, 0, -1).applyMatrix4(this._rot).add(camPos);
    const target = this._t.subVectors(P, look).reflect(N).negate().add(P);
    const rc = this.cam;
    rc.position.copy(view);
    rc.up.set(0, 1, 0).applyMatrix4(this._rot).reflect(N);
    rc.lookAt(target);
    rc.far = camera.far;
    rc.updateMatrixWorld();
    rc.projectionMatrix.copy(camera.projectionMatrix);
    this.texMat.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.texMat.multiply(rc.projectionMatrix).multiply(rc.matrixWorldInverse);
    // oblique near plane so nothing under the water line leaks into the reflection
    this._p.setFromNormalAndCoplanarPoint(N, P).applyMatrix4(rc.matrixWorldInverse);
    const cp = this._cp.set(this._p.normal.x, this._p.normal.y, this._p.normal.z, this._p.constant);
    const pm = rc.projectionMatrix, e = pm.elements, q = this._q;
    q.x = (Math.sign(cp.x) + e[8]) / e[0];
    q.y = (Math.sign(cp.y) + e[9]) / e[5];
    q.z = -1; q.w = (1 + e[10]) / e[14];
    cp.multiplyScalar(2 / cp.dot(q));
    e[2] = cp.x; e[6] = cp.y; e[10] = cp.z + 1 - 0.003; e[14] = cp.w;
    rc.projectionMatrixInverse.copy(pm).invert();
    const prev = renderer.getRenderTarget();
    // reuse this frame's shadow maps: re-rendering five of them for a 40% reflection was most of its cost
    const au = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(scene, rc);
    renderer.setRenderTarget(prev);
    renderer.shadowMap.autoUpdate = au;
  }
}

// Additive overlay that lays the reflection over a wet surface: blurred and streaked on
// wet asphalt, mirror-sharp and rippling inside puddles.
export function reflectionOverlay(reflection, geometry, { puddle = 0.6, gutter = false, wetRefl = 0.45, fog, planeY = null }) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      ...wetUniforms,
      tReflect: { value: reflection.rt.texture },
      uTexMat: { value: reflection.texMat },
      uPudTh: { value: puddle }, uGutter: { value: gutter ? 1 : 0 },
      uWetRefl: { value: wetRefl }, uStrength: { value: 1 },
      uFogDensity: { value: fog.density },
      uPlaneY: { value: planeY === null ? -999 : planeY },
    },
    vertexShader: /* glsl */`
      varying vec3 vW; varying vec4 vRC; uniform mat4 uTexMat; uniform float uPlaneY;
      void main(){
        vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz;
        // surfaces slightly above the mirror plane borrow its reflection (small, blurred error)
        vec4 wr = w; if (uPlaneY > -900.0) wr.y = uPlaneY;
        vRC = uTexMat*wr; gl_Position = projectionMatrix*viewMatrix*w;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vW; varying vec4 vRC;
      uniform sampler2D tReflect; uniform float uWetRefl, uStrength, uFogDensity;
      ${PUDDLE_GLSL}
      void main(){
        vec3 V = normalize(cameraPosition - vW);
        float pud = pudMask(vW.xz);
        vec3 rn = texture2D(tRipple, vW.xz*0.42).xyz*2.0-1.0;
        vec2 grain = (texture2D(tPuddle, vW.xz*1.9).bg - 0.5);
        vec2 uv = vRC.xy / vRC.w + rn.xy*uRain*0.01*pud + grain*0.018*(1.0-pud);
        float rough = 1.0 - pud;
        vec3 acc = vec3(0.0); float ws = 0.0;
        for (int i = -7; i <= 7; i++) {
          float o = float(i)/7.0; float w = exp(-o*o*2.2);
          acc += textureLod(tReflect, uv + vec2(o*0.005, o*0.065)*rough, rough*2.2).rgb * w; ws += w;
        }
        vec3 refl = acc/ws;
        float cosT = clamp(V.y, 0.0, 1.0);
        float F = 0.02 + 0.98*pow(1.0 - cosT, 5.0);
        float k = mix(uWetRefl, 1.0, pud);
        float d = length(cameraPosition - vW);
        float fogF = 1.0 - exp(-uFogDensity*uFogDensity*d*d);
        gl_FragColor = vec4(refl * F * k * uStrength * (1.0 - fogF), 1.0);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.layers.set(LAYER_REFLECTOR);
  mesh.renderOrder = 1;
  mesh.frustumCulled = false;
  return mesh;
}
