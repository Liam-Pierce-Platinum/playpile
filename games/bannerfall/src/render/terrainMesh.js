// BANNERFALL :: render/terrainMesh.js - the battlefield: painted ground, live trench digging,
// water with shore foam, and wind-blown grass tufts.
// It keeps its own DISPLAYED heights and eases them toward the sim's heights, so a fresh
// trench sinks in over two seconds instead of popping.
import * as THREE from '../../vendor/three.module.js';
import { MAT } from '../sim/terrain.js';

const col = (hex) => new THREE.Color(hex).convertSRGBToLinear();
let C = {};
let ENV = null;
// the ground palette of the battlefield's biome (data/envs.js)
export function setPalette(env) {
  ENV = env;
  C = {};
  for (const k in env.ground) C[k] = col(env.ground[k]);
}

function hash(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}

export function buildTerrain(scene, world, opts = {}) {
  if (opts.env) setPalette(opts.env);
  const hf = world.terrain;
  const n = hf.n, res = hf.res, size = hf.size;
  const shown = hf.h.slice();
  // global arrays hold every sample; the GPU gets them as 4 x 4 chunk meshes so a dig only
  // re-uploads the chunks it touched
  const pos = new Float32Array(n * n * 3), nor = new Float32Array(n * n * 3), colr = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i;
    pos[k * 3] = i * res; pos[k * 3 + 1] = shown[k]; pos[k * 3 + 2] = j * res;
  }
  const CH = 4, cs = (n - 1) / CH, cn = cs + 1;
  const chunks = [];
  const cidx = new Uint32Array(cs * cs * 6);
  { let q = 0;
    for (let j = 0; j < cs; j++) for (let i = 0; i < cs; i++) {
      const a = j * cn + i, b = a + 1, c = a + cn, d = c + 1;
      if ((i + j) & 1) { cidx[q++] = a; cidx[q++] = c; cidx[q++] = b; cidx[q++] = b; cidx[q++] = c; cidx[q++] = d; }
      else { cidx[q++] = a; cidx[q++] = c; cidx[q++] = d; cidx[q++] = a; cidx[q++] = d; cidx[q++] = b; }
    } }
  for (let cj = 0; cj < CH; cj++) for (let ci = 0; ci < CH; ci++) {
    const g = new THREE.BufferGeometry();
    g.setIndex(new THREE.BufferAttribute(cidx, 1));
    const P = new THREE.BufferAttribute(new Float32Array(cn * cn * 3), 3), N = new THREE.BufferAttribute(new Float32Array(cn * cn * 3), 3), Cc = new THREE.BufferAttribute(new Float32Array(cn * cn * 3), 3);
    for (const A of [P, N, Cc]) A.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', P); g.setAttribute('normal', N); g.setAttribute('color', Cc);
    chunks.push({ g, P, N, Cc, i0: ci * cs, j0: cj * cs });
  }
  function upload(i0, j0, i1, j1) {
    for (const ch of chunks) {
      if (i1 < ch.i0 || i0 > ch.i0 + cs || j1 < ch.j0 || j0 > ch.j0 + cs) continue;
      const P = ch.P.array, N = ch.N.array, Cc = ch.Cc.array;
      for (let j = 0; j < cn; j++) {
        const src = ((ch.j0 + j) * n + ch.i0) * 3, dst = j * cn * 3;
        P.set(pos.subarray(src, src + cn * 3), dst); N.set(nor.subarray(src, src + cn * 3), dst); Cc.set(colr.subarray(src, src + cn * 3), dst);
      }
      ch.P.needsUpdate = ch.N.needsUpdate = ch.Cc.needsUpdate = true;
      if (!ch.g.boundingSphere) ch.g.computeBoundingSphere(); else ch.g.boundingSphere.radius += 0;
    }
  }

  const tmp = new THREE.Color();
  const raw = new Float32Array(n * n * 3);
  const W5 = []; for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) W5.push(Math.exp(-(di * di + dj * dj) / 2.2));
  function shade(i0, j0, i1, j1, blurOnly) {
    i0 = Math.max(0, i0); j0 = Math.max(0, j0); i1 = Math.min(n - 1, i1); j1 = Math.min(n - 1, j1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * n + i;
      const hl = shown[i > 0 ? k - 1 : k], hr = shown[i < n - 1 ? k + 1 : k];
      const hd = shown[j > 0 ? k - n : k], hu = shown[j < n - 1 ? k + n : k];
      let nx = (hl - hr) / (2 * res), nz = (hd - hu) / (2 * res), ny = 1;
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      nor[k * 3] = nx; nor[k * 3 + 1] = ny; nor[k * 3 + 2] = nz;
      pos[k * 3 + 1] = shown[k];
      // colour
      const x = i * res, z = j * res;
      const m = hf.mat[k];
      const n1 = vnoise(x / 9, z / 9), n2 = vnoise(x / 31 + 7, z / 31 + 3), n3 = vnoise(x / 2.3, z / 2.3);
      if (m === MAT.GRASS) {
        tmp.copy(C.grassM).lerp(C.grassL, n1 * 0.9).lerp(C.dry, Math.max(0, n2 - 0.55) * 1.5).lerp(C.grassD, Math.max(0, 0.35 - n3) * 0.8);
      } else if (m === MAT.DIRT) {
        const road = hf.parapet[k] < 0.05 && hf.trench[k] === 0;
        tmp.copy(road ? C.road : C.dirt).lerp(C.grassM, Math.max(0, n3 - 0.7) * 1.2);
        if (hf.parapet[k] > 0) tmp.lerp(C.parapet, Math.min(1, hf.parapet[k] * 1.4));
      } else if (m === MAT.MUD) {
        const depth = hf.base ? hf.base[k] - shown[k] : 0;
        tmp.copy(C.mud).lerp(C.mudWet, Math.min(1, Math.max(0, (depth - 0.8) / 0.6))).multiplyScalar(0.92 + n3 * 0.16);
      } else if (m === MAT.FIELD) {
        // crop rows: golden stripes with darker furrows
        const row = 0.5 + 0.5 * Math.sin(x * 1.7 + Math.sin(z * 0.045) * 2.2);
        tmp.copy(C.fieldD).lerp(C.field, 0.45 + row * 0.55).lerp(C.dry, Math.max(0, n2 - 0.6) * 0.8).multiplyScalar(0.94 + n3 * 0.12);
      } else if (m === MAT.ROCK) {
        tmp.copy(C.rock).lerp(C.rockD, n3 * 0.7);
        if (ENV && ENV.snowCaps && ny > 0.8) tmp.lerp(C.grassL, (ny - 0.8) * 4);
      } else {
        tmp.copy(C.bed).lerp(C.dirt, n1 * 0.4);
      }
      // wet, darker ground near the water line
      const wl = shown[k] - hf.waterLevel;
      if (wl < 0.9 && m !== MAT.BED) tmp.lerp(C.mudWet, Math.max(0, Math.min(0.55, (0.9 - wl) / 0.9 * 0.55)));
      const slope = 1 - ny;
      if (slope > 0.22 && m !== MAT.MUD) tmp.lerp(C.rockD, Math.min(1, (slope - 0.22) * 2.2));
      // cavity: darken hollows, lighten ridges a touch
      const lap = (hl + hr + hd + hu) / 4 - shown[k];
      const cav = Math.max(-0.12, Math.min(0.3, lap * 1.8));
      tmp.multiplyScalar(1 - cav * 0.9);
      raw[k * 3] = tmp.r; raw[k * 3 + 1] = tmp.g; raw[k * 3 + 2] = tmp.b;
    }
    // soften material borders over about a metre so mud, dirt and grass blend instead of zig-zagging
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      let r = 0, g = 0, b = 0, w = 0;
      for (let dj = -2; dj <= 2; dj++) { const jj = j + dj; if (jj < 0 || jj >= n) continue;
        for (let di = -2; di <= 2; di++) { const ii = i + di; if (ii < 0 || ii >= n) continue;
          const wt = W5[(dj + 2) * 5 + di + 2], q = (jj * n + ii) * 3; r += raw[q] * wt; g += raw[q + 1] * wt; b += raw[q + 2] * wt; w += wt; } }
      const k = (j * n + i) * 3; colr[k] = r / w; colr[k + 1] = g / w; colr[k + 2] = b / w;
    }
  }
  shade(0, 0, n - 1, n - 1);
  upload(0, 0, n - 1, n - 1);

  // zone + overlays texture (2 px per metre): R dashed edge, G fill, B flag ring
  const zc = document.createElement('canvas');
  zc.width = zc.height = 1024;
  const zx = zc.getContext('2d');
  function paintZone() {
    zx.clearRect(0, 0, 1024, 1024);
    const P = world.def.zones.player;
    const sc = 1024 / size;
    zx.beginPath(); P.forEach((p, i) => (i ? zx.lineTo(p[0] * sc, p[1] * sc) : zx.moveTo(p[0] * sc, p[1] * sc))); zx.closePath();
    zx.fillStyle = 'rgb(0,255,0)'; zx.fill();
    zx.globalCompositeOperation = 'lighter';
    zx.setLineDash([12, 10]); zx.lineWidth = 2.5; zx.strokeStyle = 'rgb(255,0,0)'; zx.stroke();
    const F = world.def.zones.flag;
    zx.setLineDash([9, 7]); zx.lineWidth = 2.5; zx.strokeStyle = 'rgb(0,0,255)';
    if (world.flagActive !== false) { zx.beginPath(); zx.arc(F.pos[0] * sc, F.pos[1] * sc, F.r * sc, 0, Math.PI * 2); zx.stroke(); }
    zx.setLineDash([5, 6]); zx.lineWidth = 2;
    for (const o of world.objectives || []) { if (o.taken) continue; zx.beginPath(); zx.arc(o.pos[0] * sc, o.pos[1] * sc, o.r * sc, 0, Math.PI * 2); zx.stroke(); }
    zx.globalCompositeOperation = 'source-over';
  }
  paintZone();
  const zoneTex = new THREE.CanvasTexture(zc);
  zoneTex.flipY = false;
  zoneTex.colorSpace = THREE.NoColorSpace;
  zoneTex.minFilter = THREE.LinearFilter;

  const MAXA = 12;
  const uniforms = {
    uZoneTex: { value: zoneTex }, uZone: { value: 1 }, uSize: { value: size }, uTime: { value: 0 },
    uAura: { value: Array.from({ length: MAXA }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uAuraCount: { value: 0 }, uFlagHot: { value: 0 },
  };
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWorldP;
        uniform sampler2D uZoneTex; uniform float uZone, uSize, uTime, uFlagHot;
        uniform vec4 uAura[${MAXA}]; uniform int uAuraCount;
        float th(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float tn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(th(i),th(i+vec2(1,0)),f.x), mix(th(i+vec2(0,1)),th(i+vec2(1,1)),f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec2 wp = vWorldP.xz;
          float b1 = tn(wp * 0.55), b2 = tn(wp * 2.7), b3 = tn(wp * 0.09);
          float b4 = tn(wp * 9.0);
          diffuseColor.rgb *= 0.84 + 0.2 * b1 + 0.08 * b2 + 0.07 * b4 + 0.22 * (b3 - 0.5);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.08, 1.04, 0.86), smoothstep(0.55, 0.8, tn(wp * 0.035 + 3.0)) * 0.6);
          vec4 z = texture2D(uZoneTex, wp / uSize);
          float lum = dot(diffuseColor.rgb, vec3(0.3, 0.55, 0.15));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lum) * vec3(0.8, 0.95, 1.25), z.g * 0.32 * uZone);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55, 0.72, 1.0), z.r * 0.6 * uZone);
          diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.85, 0.6, 0.12), vec3(1.0, 0.2, 0.1), uFlagHot), z.b * 0.85);
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        for (int i = 0; i < ${MAXA}; i++) {
          if (i >= uAuraCount) break;
          vec4 a = uAura[i];
          float d = length(vWorldP.xz - a.xy);
          float ring = smoothstep(a.z - 0.55, a.z - 0.15, d) * (1.0 - smoothstep(a.z - 0.1, a.z + 0.2, d));
          float fillA = (1.0 - smoothstep(0.0, a.z, d)) * 0.22;
          float pulse = 0.75 + 0.25 * sin(uTime * 2.4 - d * 0.6);
          float ang = atan(vWorldP.z - a.y, vWorldP.x - a.x);
          float dash = step(0.35, fract(ang * 9.549 + uTime * 0.25));
          vec3 gc = mix(vec3(0.25, 0.6, 0.08), vec3(0.75, 0.55, 0.1), smoothstep(a.z * 0.5, a.z, d));
          totalEmissiveRadiance += gc * (ring * 0.6 * dash + fillA * 0.5 * pulse) * a.w;
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.05, 1.12, 0.85), fillA * 2.0 * a.w);
        }`);
  };
  const mesh = new THREE.Group();
  for (const ch of chunks) { const m = new THREE.Mesh(ch.g, mat); m.receiveShadow = true; m.castShadow = true; mesh.add(m); }
  scene.add(mesh);

  // ---- water ----
  const water = buildWater(scene, world);
  // ---- grass ----
  const grass = opts.noGrass || (ENV && !ENV.grass) ? null : buildGrass(scene, world, shown);

  // dig animation bookkeeping
  const anims = [];
  let lastV = hf.version;
  function update(dt, t) {
    uniforms.uTime.value = t;
    if (water) water.uniforms.uTime.value = t;
    if (grass) grass.uniforms.uTime.value = t;
    if (hf.dirty.length) {
      for (const b of hf.dirty) anims.push({ ...b, t: 0, dur: b.x1 - b.x0 > size * 0.9 ? 0.01 : 2.0 });
      hf.dirty.length = 0;
    }
    if (!anims.length) return;
    let j0 = n, j1 = 0, ii0 = n, ii1 = 0;
    for (let a = anims.length - 1; a >= 0; a--) {
      const A = anims[a];
      A.t += dt;
      const k = Math.min(1, A.t / A.dur);
      const ease = 1 - Math.pow(1 - k, 3);
      const i0 = Math.max(0, Math.floor(A.x0 / res)), i1 = Math.min(n - 1, Math.ceil(A.x1 / res));
      const jj0 = Math.max(0, Math.floor(A.z0 / res)), jj1 = Math.min(n - 1, Math.ceil(A.z1 / res));
      for (let j = jj0; j <= jj1; j++) for (let i = i0; i <= i1; i++) {
        const kk = j * n + i;
        const target = hf.h[kk];
        shown[kk] = k >= 1 ? target : shown[kk] + (target - shown[kk]) * Math.min(1, ease * 0.35 + dt * 3);
      }
      shade(i0 - 1, jj0 - 1, i1 + 1, jj1 + 1);
      j0 = Math.min(j0, jj0 - 1); j1 = Math.max(j1, jj1 + 1); ii0 = Math.min(ii0, i0 - 1); ii1 = Math.max(ii1, i1 + 1);
      if (k >= 1) anims.splice(a, 1);
    }
    j0 = Math.max(0, j0); j1 = Math.min(n - 1, j1);
    upload(Math.max(0, ii0), j0, Math.min(n - 1, ii1), j1);
    if (grass && hf.version !== lastV && !anims.length) { lastV = hf.version; grass.refresh(); }
  }
  function heightShown(x, z) {
    const fx = x / res, fz = z / res;
    let i = Math.floor(fx), j = Math.floor(fz);
    i = Math.max(0, Math.min(n - 2, i)); j = Math.max(0, Math.min(n - 2, j));
    const tx = fx - i, tz = fz - j, k = j * n + i;
    return (shown[k] + (shown[k + 1] - shown[k]) * tx) * (1 - tz) + (shown[k + n] + (shown[k + n + 1] - shown[k + n]) * tx) * tz;
  }
  return {
    mesh, uniforms, update, heightShown, shown, digging: () => anims.length > 0, _anims: anims,
    repaintZone() { paintZone(); zoneTex.needsUpdate = true; },
    setAuras(list) {
      const u = uniforms.uAura.value; let c = 0;
      for (const a of list) { if (c >= MAXA) break; u[c++].set(a[0], a[1], a[2], a[3]); }
      uniforms.uAuraCount.value = c;
    },
    refreshGrass() { if (grass) grass.refresh(); },
    grass,
  };
}

function buildWater(scene, world) {
  const hf = world.terrain;
  const river = world.def.terrain.river, pools = world.def.terrain.pools;
  if (!river && !(pools && pools.length)) return null;
  let z0 = Infinity, z1 = -Infinity;
  if (river) for (const p of river.path) { z0 = Math.min(z0, p[1] - river.width - 10); z1 = Math.max(z1, p[1] + river.width + 10); }
  for (const p of pools || []) { z0 = Math.min(z0, p[1] - p[2] * 1.4); z1 = Math.max(z1, p[1] + p[2] * 1.4); }
  z0 = Math.max(0, z0); z1 = Math.min(hf.size, z1);
  const W = hf.size, step = 1;
  const nx = Math.ceil(W / step) + 1, nz = Math.ceil((z1 - z0) / step) + 1;
  const g = new THREE.PlaneGeometry(W, z1 - z0, nx - 1, nz - 1);
  g.rotateX(-Math.PI / 2);
  g.translate(W / 2, hf.waterLevel, (z0 + z1) / 2);
  const p = g.attributes.position;
  const depth = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) depth[i] = hf.waterLevel - hf.height(p.getX(i), p.getZ(i));
  g.setAttribute('aDepth', new THREE.BufferAttribute(depth, 1));
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 }, uSun: { value: (world.sunDir || new THREE.Vector3(-0.62, 0.46, -0.64)).clone().normalize() },
    uShallow: { value: new THREE.Color(ENV ? ENV.water[0] : 0x5f9aa3) }, uDeep: { value: new THREE.Color(ENV ? ENV.water[1] : 0x2f5f7c) }, uFoam: { value: new THREE.Color(0xeef3ec) },
  }]);
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, fog: true, depthWrite: false,
    vertexShader: `
      attribute float aDepth; varying float vDepth; varying vec3 vW;
      #include <fog_pars_vertex>
      void main(){ vDepth = aDepth; vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uSun, uShallow, uDeep, uFoam; varying float vDepth; varying vec3 vW;
      #include <common>
      #include <fog_pars_fragment>
      float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h2(i),h2(i+vec2(1,0)),f.x), mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x), f.y); }
      void main(){
        if (vDepth < -0.02) discard;
        vec2 p = vW.xz;
        float t = uTime;
        float w1 = n2(p * 0.35 + vec2(t * 0.25, t * 0.08)), w2 = n2(p * 0.9 - vec2(t * 0.1, t * 0.3));
        vec3 nrm = normalize(vec3((w1 - 0.5) * 0.5, 1.0, (w2 - 0.5) * 0.5));
        vec3 V = normalize(cameraPosition - vW);
        vec3 H = normalize(uSun + V);
        float spec = pow(max(dot(nrm, H), 0.0), 90.0) * 1.4;
        float fres = pow(1.0 - max(dot(V, nrm), 0.0), 3.0);
        float dk = smoothstep(0.0, 1.8, vDepth);
        vec3 c = mix(uShallow, uDeep, dk);
        c = mix(c, vec3(0.85, 0.82, 0.72), fres * 0.22);
        float foam = smoothstep(0.0, 0.05, vDepth) * (1.0 - smoothstep(0.05, 0.16 + 0.08 * w1, vDepth)) * (0.5 + 0.5 * n2(p * 2.0 + t * 0.6));
        c = mix(c, uFoam, foam * 0.55);
        c += vec3(1.0, 0.85, 0.6) * spec;
        float a = (mix(0.62, 0.9, dk) + foam * 0.25) * smoothstep(-0.02, 0.12, vDepth);
        gl_FragColor = vec4(c, clamp(a, 0.0, 0.95));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = 2;
  m.receiveShadow = false;
  scene.add(m);
  return { mesh: m, uniforms };
}

// grass tufts: several bent blades per tuft, tinted to the ground beneath, swaying in the wind
function buildGrass(scene, world, shown) {
  const hf = world.terrain;
  const blades = [];
  const B = 5;
  const posL = [], colL = [], hgtL = [];
  for (let b = 0; b < B; b++) {
    const a = (b / B) * Math.PI * 2 + Math.random() * 0.6;
    const r = 0.06 + Math.random() * 0.12;
    const ox = Math.cos(a) * r, oz = Math.sin(a) * r;
    const lean = 0.08 + Math.random() * 0.16;
    const h = 0.2 + Math.random() * 0.18;
    const w = 0.045;
    const segs = 2;
    const px = Math.cos(a + 1.57) * w, pz = Math.sin(a + 1.57) * w;
    const pts = [];
    for (let s = 0; s <= segs; s++) {
      const u = s / segs;
      const bend = lean * u * u;
      const cx = ox + Math.cos(a) * bend, cz = oz + Math.sin(a) * bend, cy = h * u;
      const ww = 1 - u * 0.92;
      pts.push([[cx - px * ww, cy, cz - pz * ww], [cx + px * ww, cy, cz + pz * ww], u]);
    }
    for (let s = 0; s < segs; s++) {
      const [a0, a1, u0] = pts[s], [b0, b1, u1] = pts[s + 1];
      for (const [v, u] of [[a0, u0], [a1, u0], [b0, u1], [a1, u0], [b1, u1], [b0, u1]]) {
        posL.push(v[0], v[1], v[2]); hgtL.push(u);
        const shade = 0.85 + u * 0.45;
        colL.push(shade, shade, shade);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(posL, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colL, 3));
  g.setAttribute('aH', new THREE.Float32BufferAttribute(hgtL, 1));
  g.computeVertexNormals();
  // point the normals up so tufts light like the ground they stand on
  const nn = g.attributes.normal; for (let i = 0; i < nn.count; i++) nn.setXYZ(i, 0, 1, 0);
  const uniforms = { uTime: { value: 0 } };
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.9 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aH; uniform float uTime;');
    // light both faces of a blade like the ground under it
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', 'float faceDirection = 1.0; vec3 normal = normalize(vNormal); vec3 nonPerturbedNormal = normal;');
    sh.vertexShader = sh.vertexShader
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        float wv = sin(uTime * 1.7 + ip.x * 0.21 + ip.z * 0.13) * 0.6 + sin(uTime * 3.1 + ip.x * 0.7) * 0.25;
        transformed.x += wv * aH * aH * 0.16;
        transformed.z += wv * aH * aH * 0.08;`);
  };
  const COUNT = Math.round(19000 * (ENV ? ENV.grass : 1));
  const im = new THREE.InstancedMesh(g, mat, COUNT);
  im.receiveShadow = true;
  im.castShadow = false;
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const spots = [];
  let tries = 0;
  const rnd = mulberry(4242);
  while (spots.length < COUNT && tries++ < COUNT * 4) {
    // cluster tufts in patches
    const x = 2 + rnd() * (hf.size - 4), z = 2 + rnd() * (hf.size - 4);
    const patch = vnoise(x / 14, z / 14);
    if (rnd() > 0.25 + patch * 0.9) continue;
    spots.push([x, z, 0.8 + rnd() * 0.6 + patch * 0.35, rnd() * 6.28]);
  }
  const m4 = new THREE.Matrix4(), qn = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const cc = new THREE.Color();
  function refresh() {
    let c = 0;
    const ss = [...world.structures.values()].filter((s) => s.alive);
    for (const [x, z, s, r] of spots) {
      const k = Math.round(z / hf.res) * hf.n + Math.round(x / hf.res);
      const ok = hf.mat[k] === 0 && hf.trench[k] === 0 && hf.parapet[k] < 0.15 && hf.height(x, z) > hf.waterLevel + 0.15 && hf.slope(x, z) < 0.6;
      let hide = !ok;
      if (!hide) for (const st of ss) { if (Math.abs(st.a[0] - x) < 6 && Math.abs(st.a[1] - z) < 6) { hide = true; break; } }
      if (!hide) for (const p of world.props) { if (p.pos && Math.abs(p.pos[0] - x) < 5 && Math.abs(p.pos[1] - z) < 5) { hide = true; break; } }
      if (hide) continue;
      qn.setFromAxisAngle(up, r);
      ps.set(x, shown[k] - 0.03, z);
      sc.set(s, s * (0.8 + 0.4 * vnoise(x * 0.3, z * 0.3)), s);
      m4.compose(ps, qn, sc);
      im.setMatrixAt(c, m4);
      // tint from the ground colour so tufts sit in the field
      const n1 = vnoise(x / 9, z / 9), n2 = vnoise(x / 31 + 7, z / 31 + 3);
      cc.copy(C.grassM).lerp(C.grassL, n1 * 0.9).lerp(C.dry, Math.max(0, n2 - 0.55) * 1.5).multiplyScalar(0.98);
      im.setColorAt(c, cc);
      c++;
    }
    im.count = c;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }
  refresh();
  scene.add(im);
  return { mesh: im, uniforms, refresh };
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// The land beyond the battlefield: a skirt that carries the edge heights outward and rolls
// up into soft distant hills, so the field never ends in a hard edge.
export function buildSkirt(scene, world) {
  const hf = world.terrain, S = hf.size;
  const coords = [];
  for (let v = -700; v <= S + 700;) {
    coords.push(v);
    const d = v < 0 ? -v : v > S ? v - S : 0;
    v += d < 1 ? (v < 0 || v >= S ? 2 : 16) : Math.min(60, 2 + d * 0.12);
  }
  // make sure the exact edges are present
  const xs = [...new Set(coords.concat([0, S]))].sort((a, b) => a - b);
  const n = xs.length;
  const height = (x, z) => {
    const cx = Math.max(0, Math.min(S, x)), cz = Math.max(0, Math.min(S, z));
    const d = Math.hypot(x - cx, z - cz);
    const edge = hf.height(cx, cz);
    if (d <= 0) return edge - 2.5;
    const k = 1 - Math.pow(1 - Math.min(1, d / 70), 2);
    const hills = (vnoise(x / 120, z / 120) * 0.7 + vnoise(x / 47, z / 47) * 0.3) * (6 + d * 0.09) + Math.max(0, d - 200) * 0.06;
    return edge * (1 - k) + (Math.max(edge, 1.5) + hills) * k - Math.min(0.05, d * 0.01);
  };
  const pos = new Float32Array(n * n * 3), col = new Float32Array(n * n * 3);
  const SK = ENV ? ENV.skirt : [0x8aa156, 0x6f8a48, 0x9aa88a];
  const g1 = col1(SK[0]), g2 = col1(SK[1]), haze = col1(SK[2]);
  const c = new THREE.Color();
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = xs[i], z = xs[j], k = (j * n + i) * 3;
    const h = height(x, z);
    pos[k] = x; pos[k + 1] = h; pos[k + 2] = z;
    const d = Math.hypot(x - Math.max(0, Math.min(S, x)), z - Math.max(0, Math.min(S, z)));
    c.copy(g1).lerp(g2, vnoise(x / 30, z / 30)).lerp(haze, Math.min(0.6, d / 900));
    if (hf.waterLevel > h - 0.2 && d < 40) c.lerp(col1(0x5f7a4a), 0.4);
    col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
  }
  const idx = [];
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const x0 = xs[i], x1 = xs[i + 1], z0 = xs[j], z1 = xs[j + 1];
    // skip cells fully inside the battlefield
    if (x0 >= 2 && x1 <= S - 2 && z0 >= 2 && z1 <= S - 2) continue;
    const a = j * n + i, b = a + 1, cc = a + n, dd = cc + 1;
    idx.push(a, cc, b, b, cc, dd);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97 }));
  m.receiveShadow = true;
  scene.add(m);
  // the river runs on out of the map in both directions
  const river = world.def.terrain.river;
  if (river) {
    const p0 = river.path[0], p1 = river.path[river.path.length - 1];
    for (const [p, dir] of [[p0, -1], [p1, 1]]) {
      const wg = new THREE.PlaneGeometry(700, river.width * 0.9);
      wg.rotateX(-Math.PI / 2);
      const wm = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ color: ENV ? ENV.water[1] : 0x4f86a0, roughness: 0.25, metalness: 0.1 }));
      wm.position.set(dir < 0 ? -350 : S + 350, hf.waterLevel + 0.02, p[1]);
      scene.add(wm);
    }
  }
  return { mesh: m, height };
}
const col1 = (hex) => new THREE.Color(hex).convertSRGBToLinear();

// little wildflowers: white, butter yellow and violet clusters scattered over the grass
export function buildFlowers(scene, world) {
  const hf = world.terrain;
  const P = [];
  const petal = new THREE.OctahedronGeometry(0.055, 0);
  for (let k = 0; k < 3; k++) {
    const g = petal.clone();
    g.translate(Math.cos(k * 2.1) * 0.12, 0.16 + k * 0.03, Math.sin(k * 2.1) * 0.12);
    P.push(g);
  }
  let geo = P[0];
  { const arr = []; for (const g of P) arr.push(...(g.index ? g.toNonIndexed() : g).attributes.position.array); geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); geo.computeVertexNormals(); }
  const COUNT = 7000;
  const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.6, emissive: 0x111108 }), COUNT);
  const rnd = (() => { let a = 777; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
  const cols = (ENV ? ENV.flowerCols : [0xf4f0e6, 0xf2d35a, 0xb59ad8, 0xf0f0f0, 0xe8a0b0]).map((h) => new THREE.Color(h));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const spots = [];
  for (let t = 0; spots.length < COUNT && t < COUNT * 6; t++) {
    const x = 2 + rnd() * (hf.size - 4), z = 2 + rnd() * (hf.size - 4);
    if (vnoise(x / 22 + 9, z / 22) < 0.58) continue;   // flowers grow in drifts
    spots.push([x, z, rnd(), Math.floor(rnd() * cols.length)]);
  }
  function refresh() {
    let c = 0;
    for (const [x, z, r, ci] of spots) {
      const k = Math.round(z / hf.res) * hf.n + Math.round(x / hf.res);
      if (hf.mat[k] !== 0 || hf.trench[k] > 0 || hf.parapet[k] > 0.1 || hf.height(x, z) < hf.waterLevel + 0.3) continue;
      q.setFromAxisAngle(up, r * 6.28);
      m4.compose(p.set(x, hf.height(x, z), z), q, s.set(1, 0.8 + r * 0.6, 1));
      im.setMatrixAt(c, m4); im.setColorAt(c, cols[ci]); c++;
    }
    im.count = c;
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }
  refresh();
  im.receiveShadow = true;
  scene.add(im);
  return { refresh };
}
