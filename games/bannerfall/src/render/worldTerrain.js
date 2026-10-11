// BANNERFALL :: render/worldTerrain.js - the huge war map (DESIGN.md 3.3, 3.6, 16.2).
//
// The sim's WorldTerrain is a coarse 2 m field plus 64 m detail tiles at 0.5 m wherever something
// was dug. This draws it as:
//  - 128 m CHUNKS at 2 m or 4 m spacing near the camera, and 512 m MACRO chunks at 8 m or 16 m
//    spacing far away (each with a skirt so LOD seams never show a crack). One draw call each;
//    only chunks in the view frustum are drawn.
//  - painted vertex colours baked once from the ground materials (the v1 palette and rules), box-
//    filtered for the coarse LODs so roads and fields still read from 1 km up.
//  - DETAIL TILES (the v1 0.5 m path: trench cross-sections, parapets, revetments, the two-second
//    dig animation). The coarse chunk under a detail tile discards its pixels (a tile mask).
//  - TERRITORY: a blurred owner-colour texture; the shader washes owned land in its kingdom's colour
//    and draws a soft ink border where the colour changes. In FOUNDING your land glows blue.
//  - rivers and pools as water sheets, the land beyond the map edge, and a grass ring that follows
//    the camera.
import * as THREE from '../../vendor/three.module.js';
import { MAT } from '../sim/terrain.js';

const CH = 128, MACRO = 512;
const lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();
function hash(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}
function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function buildWorldTerrain(scene, world, opts = {}) {
  const env = opts.env;
  const C = {}; for (const k in env.ground) C[k] = lin(env.ground[k]);
  C.sand = lin(0xc9b98a); C.snow = lin(0xeef2f6); C.snowD = lin(0xc8d2dc); C.pave = lin(0xa8a090); C.marsh = lin(0x5f6a3e); C.forestFloor = lin(0x4d5a30);
  const snowy = !!env.snowCaps;
  const T = world.terrain, CF = T.coarse, n = CF.n, res = CF.res, S = T.size;
  const H = CF.h;

  // ---------------------------------------------------------------- colour bake (2 m)
  const colU8 = new Uint8Array(n * n * 3);     // gamma-2 encoded linear colour
  const tmp = new THREE.Color();
  const raw = new Float32Array(n * 3 * 3);     // three rows of raw colour for the blur
  function rawColour(i, j, out, o) {
    const k = j * n + i;
    const x = i * res, z = j * res;
    const h = H[k];
    const hl = H[i > 0 ? k - 1 : k], hr = H[i < n - 1 ? k + 1 : k], hd = H[j > 0 ? k - n : k], hu = H[j < n - 1 ? k + n : k];
    const nx = (hl - hr) / (2 * res), nz = (hd - hu) / (2 * res);
    const ny = 1 / Math.hypot(nx, 1, nz);
    const m = CF.mat[k];
    const n1 = vnoise(x / 9, z / 9), n2 = vnoise(x / 31 + 7, z / 31 + 3), n3 = vnoise(x / 2.3, z / 2.3), n4 = vnoise(x / 90 + 3, z / 90 + 11);
    const fo = T.forest[k] / 255;
    if (m === MAT.GRASS) {
      tmp.copy(C.grassM).lerp(C.grassL, n1 * 0.9).lerp(C.dry, Math.max(0, n2 - 0.55) * 1.5).lerp(C.grassD, Math.max(0, 0.35 - n3) * 0.8);
      tmp.lerp(C.grassD, Math.max(0, n4 - 0.6) * 0.8).lerp(C.dry, Math.max(0, 0.32 - n4) * 0.7);
    } else if (m === MAT.DIRT) tmp.copy(C.dirt).lerp(C.grassM, Math.max(0, n3 - 0.7) * 1.2);
    else if (m === MAT.ROAD) tmp.copy(C.road).lerp(C.dirt, n1 * 0.35).lerp(C.grassM, Math.max(0, n3 - 0.82) * 1.5);
    else if (m === MAT.MUD) tmp.copy(C.mud).lerp(C.mudWet, n1 * 0.5).multiplyScalar(0.92 + n3 * 0.16);
    else if (m === MAT.FIELD) {
      const row = 0.5 + 0.5 * Math.sin(x * 1.1 + Math.sin(z * 0.045) * 2.2);
      tmp.copy(C.fieldD).lerp(C.field, 0.45 + row * 0.55).lerp(C.dry, Math.max(0, n2 - 0.6) * 0.8).multiplyScalar(0.94 + n3 * 0.12);
    } else if (m === MAT.ROCK) {
      tmp.copy(C.rock).lerp(C.rockD, n3 * 0.7 + Math.max(0, 0.6 - ny) * 0.5);
      if (snowy && ny > 0.7) tmp.lerp(C.snow, Math.min(1, (ny - 0.7) * 3));
      else if (h > 45 && ny > 0.75) tmp.lerp(C.snow, Math.min(0.85, (h - 45) / 25) * (ny - 0.75) * 4);
    } else if (m === MAT.SAND) tmp.copy(C.sand).lerp(C.bed, n1 * 0.4);
    else if (m === MAT.SNOW) tmp.copy(C.snow).lerp(C.snowD, n1 * 0.5 + Math.max(0, 0.85 - ny) * 1.2);
    else if (m === MAT.PAVE) tmp.copy(C.pave).lerp(C.rockD, n3 * 0.3);
    else if (m === MAT.MARSH) tmp.copy(C.marsh).lerp(C.mudWet, n1 * 0.4);
    else tmp.copy(C.bed).lerp(C.dirt, n1 * 0.4);
    // forest floor: darker, mossier under canopy (far away this IS the forest)
    if (fo > 0.05 && m !== MAT.ROAD) tmp.lerp(snowy ? C.snowD : C.forestFloor, Math.min(0.75, fo * 0.85));
    const wl = h - T.waterLevel;
    if (wl < 0.9 && m !== MAT.BED && m !== MAT.SAND) tmp.lerp(C.mudWet, Math.max(0, Math.min(0.5, (0.9 - wl) / 0.9 * 0.5)));
    const slope = 1 - ny;
    if (slope > 0.2 && m !== MAT.MUD) tmp.lerp(C.rockD, Math.min(1, (slope - 0.2) * 1.8));
    const lap = (hl + hr + hd + hu) / 4 - h;
    const cav = Math.max(-0.12, Math.min(0.3, lap * 0.6));
    tmp.multiplyScalar(1 - cav * 0.9);
    out[o] = tmp.r; out[o + 1] = tmp.g; out[o + 2] = tmp.b;
  }
  {
    // two passes in rows: raw colour, then a 3 x 3 blur so material borders blend
    const rows = [new Float32Array(n * 3), new Float32Array(n * 3), new Float32Array(n * 3)];
    const fill = (j, R) => { for (let i = 0; i < n; i++) rawColour(i, Math.max(0, Math.min(n - 1, j)), R, i * 3); };
    fill(-1, rows[0]); fill(0, rows[1]);
    for (let j = 0; j < n; j++) {
      fill(j + 1, rows[2]);
      for (let i = 0; i < n; i++) {
        let r = 0, g = 0, b = 0, w = 0;
        for (let dj = 0; dj < 3; dj++) for (let di = -1; di <= 1; di++) {
          const ii = Math.max(0, Math.min(n - 1, i + di)); const wt = di === 0 && dj === 1 ? 4 : di === 0 || dj === 1 ? 2 : 1;
          const R = rows[dj]; r += R[ii * 3] * wt; g += R[ii * 3 + 1] * wt; b += R[ii * 3 + 2] * wt; w += wt;
        }
        const o = (j * n + i) * 3;
        colU8[o] = Math.round(Math.sqrt(Math.min(1, r / w)) * 255); colU8[o + 1] = Math.round(Math.sqrt(Math.min(1, g / w)) * 255); colU8[o + 2] = Math.round(Math.sqrt(Math.min(1, b / w)) * 255);
      }
      const t = rows[0]; rows[0] = rows[1]; rows[1] = rows[2]; rows[2] = t;
    }
  }
  const dec = (v) => (v / 255) * (v / 255);

  // ---------------------------------------------------------------- shared material
  const NT = T.NT;
  const maskData = new Uint8Array(NT * NT * 4);
  const maskTex = new THREE.DataTexture(maskData, NT, NT, THREE.RGBAFormat);
  maskTex.magFilter = maskTex.minFilter = THREE.NearestFilter; maskTex.needsUpdate = true;
  // territory: owner colours painted per 8 m region cell, smoothed up to 1024 px
  const W = world.war;
  const tc = document.createElement('canvas'); tc.width = W.GW; tc.height = W.GW;
  const tx = tc.getContext('2d');
  const big = document.createElement('canvas'); big.width = big.height = 1024;
  const bx = big.getContext('2d');
  const terrTex = new THREE.CanvasTexture(big);
  terrTex.colorSpace = THREE.NoColorSpace; terrTex.flipY = false; terrTex.minFilter = THREE.LinearFilter; terrTex.magFilter = THREE.LinearFilter; terrTex.generateMipmaps = false;
  const hex = (c) => '#' + c.toString(16).padStart(6, '0');
  function paintTerritory(zoneTeam) {
    const img = tx.createImageData(W.GW, W.GW);
    const cols = {};
    for (const s in W.factions) { const c = new THREE.Color(W.factions[s].main); cols[s] = [c.r * 255, c.g * 255, c.b * 255]; }
    for (let k = 0; k < W.GW * W.GW; k++) {
      const r = W.regGrid[k]; const o = k * 4;
      if (r === 65535) { img.data[o + 3] = 0; continue; }
      const own = W.regions[r].owner;
      if (own < 0 || !cols[own]) { img.data[o + 3] = 0; continue; }
      const c = cols[own];
      img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2];
      img.data[o + 3] = own === zoneTeam ? 255 : 170;
    }
    tx.putImageData(img, 0, 0);
    bx.clearRect(0, 0, 1024, 1024);
    bx.imageSmoothingEnabled = true;
    bx.filter = 'blur(1px)';
    bx.drawImage(tc, 0, 0, 1024, 1024);
    bx.filter = 'none';
    terrTex.needsUpdate = true;
  }
  paintTerritory(0);
  // fog of war: land outside your sight is drawn a little darker (sim/vision.js, 16 m cells)
  const VW = world.vision ? world.vision.W : 2;
  const visData = new Uint8Array(VW * VW).fill(255);
  const visTex = new THREE.DataTexture(visData, VW, VW, THREE.RedFormat);
  visTex.magFilter = visTex.minFilter = THREE.LinearFilter; visTex.needsUpdate = true;
  let visT = -1;
  const MAXA = 12;
  const uniforms = {
    uVis: { value: visTex }, uVisSize: { value: VW * 16 }, uFog: { value: world.vision && !opts.reveal ? 1 : 0 },
    uTerr: { value: terrTex }, uMask: { value: maskTex }, uSize: { value: S }, uNT: { value: NT }, uTime: { value: 0 },
    uZone: { value: 0 }, uStrat: { value: 0 }, uFlagHot: { value: 0 }, uHazeCol: { value: new THREE.Color(env.fog) },
    uAura: { value: Array.from({ length: MAXA }, () => new THREE.Vector4(0, 0, 0, 0)) }, uAuraCount: { value: 0 },
  };
  function makeMat(detail) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 });
    // both variants share one onBeforeCompile source, so they need their own program keys
    mat.customProgramCacheKey = () => (detail ? 'wt-detail' : 'wt-coarse');
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vWorldP;
          uniform sampler2D uTerr, uMask, uVis; uniform float uSize, uNT, uTime, uZone, uStrat, uFlagHot, uVisSize, uFog; uniform vec3 uHazeCol;
          uniform vec4 uAura[${MAXA}]; uniform int uAuraCount;
          float th(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
          float tn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(th(i),th(i+vec2(1,0)),f.x), mix(th(i+vec2(0,1)),th(i+vec2(1,1)),f.x), f.y); }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          {
            vec2 wp = vWorldP.xz;
            ${detail ? '' : `{
              // under a detail tile the coarse ground steps aside, except for a 1.2 m lip along the
              // outer edge of the tile cluster: the coarse LOD there is not at the tile's height, and
              // without the overlap a crack opened onto the sky (Liam: "the ground can go white")
              vec2 tcl = floor(wp / 64.0);
              if (texture2D(uMask, (tcl + 0.5) / uNT).r > 0.5) {
                vec2 f = wp - tcl * 64.0; const float LIP = 1.2; bool keep = false;
                if (f.x < LIP && texture2D(uMask, (tcl + vec2(-1.0, 0.0) + 0.5) / uNT).r < 0.5) keep = true;
                if (f.x > 64.0 - LIP && texture2D(uMask, (tcl + vec2(1.0, 0.0) + 0.5) / uNT).r < 0.5) keep = true;
                if (f.y < LIP && texture2D(uMask, (tcl + vec2(0.0, -1.0) + 0.5) / uNT).r < 0.5) keep = true;
                if (f.y > 64.0 - LIP && texture2D(uMask, (tcl + vec2(0.0, 1.0) + 0.5) / uNT).r < 0.5) keep = true;
                if (!keep) discard;
              }
            }`}
            float camD = length(cameraPosition - vWorldP);
            float near = 1.0 - smoothstep(250.0, 700.0, camD);
            float b1 = tn(wp * 0.55), b2 = tn(wp * 2.7), b3 = tn(wp * 0.09), b4 = tn(wp * 9.0);
            diffuseColor.rgb *= mix(1.0, 0.84 + 0.2 * b1 + 0.08 * b2 + 0.07 * b4, near) + 0.22 * (b3 - 0.5);
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.08, 1.04, 0.86), smoothstep(0.55, 0.8, tn(wp * 0.035 + 3.0)) * 0.6);
            // broad meadow patches: lighter and darker, greener and drier, so open land is never flat
            float m1 = tn(wp * 0.011 + 5.0), m2 = tn(wp * 0.0045 + 11.0), m3 = tn(wp * 0.05 + 2.0);
            diffuseColor.rgb *= 0.86 + 0.26 * m1 + 0.06 * (m3 - 0.5);
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.82, 1.06, 0.78), smoothstep(0.5, 0.78, m2) * 0.45);
            // territory wash and ink borders
            vec2 uv = wp / uSize;
            float e = 2.2 / uSize;
            vec4 t0 = texture2D(uTerr, uv);
            vec4 ta = texture2D(uTerr, uv + vec2(e, 0.0)), tb = texture2D(uTerr, uv - vec2(e, 0.0)), tc = texture2D(uTerr, uv + vec2(0.0, e)), td = texture2D(uTerr, uv - vec2(0.0, e));
            float grad = length(ta - tb) + length(tc - td);
            vec3 own = t0.rgb;
            float lum = dot(diffuseColor.rgb, vec3(0.3, 0.55, 0.15));
            // a wash that keeps the ground's light: the land is tinted, not painted over
            float wash = smoothstep(0.05, 0.6, t0.a) * (0.08 + 0.2 * uStrat);
            vec3 tint = own * (0.55 + lum * 2.2);
            diffuseColor.rgb = mix(diffuseColor.rgb, tint, wash);
            // FOUNDING: your land glows a cool blue, like the v1 deploy zone
            float mine = smoothstep(0.75, 0.95, t0.a) * uZone;
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lum) * vec3(0.85, 1.0, 1.3), mine * 0.3);
            // a thin painted line: dark ink of the owner's colour, a touch brighter far away
            float border = smoothstep(0.42, 0.75, grad);
            vec3 ink = mix(own * 0.75, own * 1.5 + 0.12, uStrat);
            diffuseColor.rgb = mix(diffuseColor.rgb, ink, border * (0.75 + 0.2 * uStrat));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.8, 1.0), border * mine * 0.5);
            if (uFog > 0.5) { float vis = texture2D(uVis, wp / uVisSize).r; diffuseColor.rgb *= mix(0.72, 1.0, smoothstep(0.15, 0.85, vis)); }
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
          }`);
    };
    return mat;
  }
  const mat = makeMat(false), detailMat = makeMat(true);
  // where the detail tile and the coarse lip overlap, the tile wins the depth test
  detailMat.polygonOffset = true; detailMat.polygonOffsetFactor = -1; detailMat.polygonOffsetUnits = -2;

  // ---------------------------------------------------------------- chunk geometry
  const idxCache = {};
  function indexFor(N) {
    // (N+1)^2 grid + a skirt ring of 4N vertices
    if (idxCache[N]) return idxCache[N];
    const V = N + 1, idx = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = j * V + i, b = a + 1, c = a + V, d = c + 1;
      if ((i + j) & 1) idx.push(a, c, b, b, c, d); else idx.push(a, c, d, a, d, b);
    }
    // skirt: border vertices in order around the edge, each with a copy hanging below
    const ring = [];
    for (let i = 0; i < N; i++) ring.push(i);                       // south edge, west to east
    for (let j = 0; j < N; j++) ring.push(j * V + N);               // east edge
    for (let i = N; i > 0; i--) ring.push(N * V + i);               // north edge
    for (let j = N; j > 0; j--) ring.push(j * V);                   // west edge
    const base = V * V;
    for (let k = 0; k < ring.length; k++) {
      const a = ring[k], b = ring[(k + 1) % ring.length], a2 = base + k, b2 = base + (k + 1) % ring.length;
      idx.push(a, b, a2, b, b2, a2);
      idx.push(a, a2, b, b, a2, b2);
    }
    idxCache[N] = { idx: new THREE.Uint32BufferAttribute(idx, 1), ring };
    return idxCache[N];
  }
  function chunkGeo(x0, z0, size, step) {
    const N = Math.round(size / step), V = N + 1;
    const { idx, ring } = indexFor(N);
    const cnt = V * V + ring.length;
    const pos = new Float32Array(cnt * 3), nor = new Float32Array(cnt * 3), col = new Float32Array(cnt * 3);
    const si = Math.round(step / res);
    const i0 = Math.round(x0 / res), j0 = Math.round(z0 / res);
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
      const gi = Math.min(n - 1, i0 + i * si), gj = Math.min(n - 1, j0 + j * si), k = gj * n + gi, o = (j * V + i) * 3;
      pos[o] = gi * res; pos[o + 1] = H[k]; pos[o + 2] = gj * res;
      const l = gj * n + Math.max(0, gi - si), r = gj * n + Math.min(n - 1, gi + si), d = Math.max(0, gj - si) * n + gi, u = Math.min(n - 1, gj + si) * n + gi;
      let nx = (H[l] - H[r]) / (2 * step), nz = (H[d] - H[u]) / (2 * step); const L = Math.hypot(nx, 1, nz);
      nor[o] = nx / L; nor[o + 1] = 1 / L; nor[o + 2] = nz / L;
      // box-filter the colour over the cell this vertex stands for
      let r0 = 0, g0 = 0, b0 = 0, w = 0;
      const half = si > 1 ? Math.floor(si / 2) : 0, stp = Math.max(1, Math.floor(si / 4));
      for (let dj = -half; dj <= half; dj += stp) for (let di = -half; di <= half; di += stp) {
        const ii = Math.max(0, Math.min(n - 1, gi + di)), jj = Math.max(0, Math.min(n - 1, gj + dj)), q = (jj * n + ii) * 3;
        r0 += dec(colU8[q]); g0 += dec(colU8[q + 1]); b0 += dec(colU8[q + 2]); w++;
      }
      col[o] = r0 / w; col[o + 1] = g0 / w; col[o + 2] = b0 / w;
    }
    const base = V * V;
    for (let k = 0; k < ring.length; k++) {
      const src = ring[k] * 3, o = (base + k) * 3;
      pos[o] = pos[src]; pos[o + 1] = pos[src + 1] - 2 - step * 0.6; pos[o + 2] = pos[src + 2];
      nor[o] = nor[src]; nor[o + 1] = nor[src + 1]; nor[o + 2] = nor[src + 2];
      col[o] = col[src] * 0.9; col[o + 1] = col[src + 1] * 0.9; col[o + 2] = col[src + 2] * 0.9;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
  const root = new THREE.Group();
  scene.add(root);
  const NC = Math.ceil(S / CH), NM = Math.ceil(S / MACRO);
  const chunks = [];
  for (let cj = 0; cj < NC; cj++) for (let ci = 0; ci < NC; ci++) {
    const m = new THREE.Mesh(undefined, mat);
    m.receiveShadow = true; m.castShadow = false; m.visible = false; m.matrixAutoUpdate = false;
    m.frustumCulled = false;
    root.add(m);
    let hmin = Infinity, hmax = -Infinity;
    for (let j = cj * CH; j <= Math.min(S, cj * CH + CH); j += 8) for (let i = ci * CH; i <= Math.min(S, ci * CH + CH); i += 8) { const h = CF.height(i, j); hmin = Math.min(hmin, h); hmax = Math.max(hmax, h); }
    chunks.push({ ci, cj, x0: ci * CH, z0: cj * CH, mesh: m, geos: {}, lod: -1, box: new THREE.Box3(new THREE.Vector3(ci * CH, hmin - 8, cj * CH), new THREE.Vector3(ci * CH + CH, hmax + 2, cj * CH + CH)) });
  }
  const macros = [];
  for (let mj = 0; mj < NM; mj++) for (let mi = 0; mi < NM; mi++) {
    const m = new THREE.Mesh(undefined, mat);
    m.receiveShadow = true; m.visible = false; m.matrixAutoUpdate = false; m.frustumCulled = false;
    root.add(m);
    const kids = chunks.filter((c) => Math.floor(c.ci * CH / MACRO) === mi && Math.floor(c.cj * CH / MACRO) === mj);
    const box = new THREE.Box3(); for (const k of kids) box.union(k.box);
    macros.push({ mi, mj, x0: mi * MACRO, z0: mj * MACRO, mesh: m, geos: {}, lod: -1, kids, box });
  }
  const frustum = new THREE.Frustum(), pm = new THREE.Matrix4(), cp = new THREE.Vector3();
  let lodScale = opts.lodScale || 1;
  const stats = { chunks: 0, macros: 0, tris: 0 };
  function geoFor(c, step, size) {
    if (!c.geos[step]) c.geos[step] = chunkGeo(c.x0, c.z0, Math.min(size, S - c.x0, S - c.z0) >= size ? size : size, step);
    return c.geos[step];
  }
  function updateView(camera) {
    camera.updateMatrixWorld();
    pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(pm);
    cp.copy(camera.position);
    stats.chunks = stats.macros = stats.tris = 0;
    const far = camera.far;
    for (const M of macros) {
      const dM = M.box.distanceToPoint(cp);
      const vis = dM < far && frustum.intersectsBox(M.box);
      const split = dM < 720 * lodScale;
      if (!vis) { M.mesh.visible = false; for (const c of M.kids) c.mesh.visible = false; continue; }
      if (!split) {
        for (const c of M.kids) c.mesh.visible = false;
        const step = dM < 1700 * lodScale ? 8 : 16;
        if (M.lod !== step) { M.mesh.geometry = geoFor(M, step, MACRO); M.lod = step; }
        M.mesh.visible = true; stats.macros++;
        stats.tris += M.mesh.geometry.index.count / 3;
        continue;
      }
      M.mesh.visible = false;
      for (const c of M.kids) {
        const d = c.box.distanceToPoint(cp);
        if (!frustum.intersectsBox(c.box)) { c.mesh.visible = false; continue; }
        const step = d < 300 * lodScale ? 2 : d < 640 * lodScale ? 4 : 8;
        if (c.lod !== step) { c.mesh.geometry = geoFor(c, step, CH); c.lod = step; }
        c.mesh.visible = true; c.mesh.castShadow = step === 2 && d < 200;
        stats.chunks++; stats.tris += c.mesh.geometry.index.count / 3;
      }
    }
    // detail tiles only near the camera; far away the coarse ground shows through
    let maskChanged = false;
    for (const D of tiles.values()) {
      const t = D.tile;
      const d = Math.hypot(t.ox + 32 - cp.x, t.oz + 32 - cp.z, (D.shown[0] || 0) - cp.y);
      const show = d < 650 * lodScale;
      if (D.mesh.visible !== show) { D.mesh.visible = show; maskData[(t.j * NT + t.i) * 4] = show ? 255 : 0; maskChanged = true; }
    }
    if (maskChanged) maskTex.needsUpdate = true;
    // free far geometry now and then
    if ((updateView.n = (updateView.n || 0) + 1) % 240 === 0) {
      for (const c of chunks) for (const st in c.geos) if (+st !== c.lod && (+st <= 4)) { const d = c.box.distanceToPoint(cp); if (d > 1100) { c.geos[st].dispose(); delete c.geos[st]; } }
    }
  }

  // ---------------------------------------------------------------- detail tiles (the v1 0.5 m path)
  const tiles = new Map();     // key -> { tile, mesh, shown, P, N, Cc, anims }
  function shadeTile(D, i0, j0, i1, j1) {
    const t = D.tile, tn = t.n, tr = t.res, shown = D.shown;
    const P = D.P.array, N = D.N.array, Cc = D.Cc.array;
    i0 = Math.max(0, i0); j0 = Math.max(0, j0); i1 = Math.min(tn - 1, i1); j1 = Math.min(tn - 1, j1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * tn + i;
      const hl = shown[i > 0 ? k - 1 : k], hr = shown[i < tn - 1 ? k + 1 : k], hd = shown[j > 0 ? k - tn : k], hu = shown[j < tn - 1 ? k + tn : k];
      let nx = (hl - hr) / (2 * tr), nz = (hd - hu) / (2 * tr), ny = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      N[k * 3] = nx; N[k * 3 + 1] = ny; N[k * 3 + 2] = nz;
      P[k * 3 + 1] = shown[k];
      const x = t.ox + i * tr, z = t.oz + j * tr;
      const m = t.mat[k];
      const n3 = vnoise(x / 2.3, z / 2.3);
      // start from the baked coarse colour so a tile blends into the land around it
      const ci = Math.min(n - 1, Math.round(x / res)), cj = Math.min(n - 1, Math.round(z / res)), q = (cj * n + ci) * 3;
      tmp.setRGB(dec(colU8[q]), dec(colU8[q + 1]), dec(colU8[q + 2]));
      if (t.parapet[k] > 0) tmp.lerp(C.parapet, Math.min(1, t.parapet[k] * 1.4));
      if (m === MAT.MUD || t.trench[k] > 0) {
        const depth = t.base ? t.base[k] - shown[k] : 0;
        tmp.copy(C.mud).lerp(C.mudWet, Math.min(1, Math.max(0, (depth - 0.8) / 0.6))).multiplyScalar(0.92 + n3 * 0.16);
      }
      const slope = 1 - ny;
      if (slope > 0.3 && m !== MAT.MUD) tmp.lerp(C.rockD, Math.min(0.6, (slope - 0.3) * 1.5));
      const lap = (hl + hr + hd + hu) / 4 - shown[k];
      tmp.multiplyScalar(1 - Math.max(-0.12, Math.min(0.3, lap * 1.8)) * 0.9);
      Cc[k * 3] = tmp.r; Cc[k * 3 + 1] = tmp.g; Cc[k * 3 + 2] = tmp.b;
    }
    // the skirt hangs 2.5 m below the tile's edge (covers any gap to a lower coarse LOD)
    if (i0 === 0 || j0 === 0 || i1 === tn - 1 || j1 === tn - 1) {
      const base = tn * tn, ring = D.ring;
      for (let r = 0; r < ring.length; r++) {
        const s = ring[r] * 3, o = (base + r) * 3;
        P[o + 1] = shown[ring[r]] - 2.5;
        N[o] = N[s]; N[o + 1] = N[s + 1]; N[o + 2] = N[s + 2];
        Cc[o] = Cc[s] * 0.8; Cc[o + 1] = Cc[s + 1] * 0.8; Cc[o + 2] = Cc[s + 2] * 0.8;
      }
    }
    D.P.needsUpdate = D.N.needsUpdate = D.Cc.needsUpdate = true;
  }
  function addTile(t) {
    const tn = t.n;
    const g = new THREE.BufferGeometry();
    // the edge ring (for the skirt), in order around the tile
    const ring = [];
    for (let i = 0; i < tn - 1; i++) ring.push(i);
    for (let j = 0; j < tn - 1; j++) ring.push(j * tn + tn - 1);
    for (let i = tn - 1; i > 0; i--) ring.push((tn - 1) * tn + i);
    for (let j = tn - 1; j > 0; j--) ring.push(j * tn);
    const nv = tn * tn + ring.length;
    const pos = new Float32Array(nv * 3);
    // the tile starts at the coarse height and eases down as it is dug
    const shown = new Float32Array(tn * tn);
    for (let j = 0; j < tn; j++) for (let i = 0; i < tn; i++) { const k = j * tn + i; pos[k * 3] = t.ox + i * t.res; pos[k * 3 + 2] = t.oz + j * t.res; shown[k] = t.base ? t.base[k] : t.h[k]; }
    for (let r = 0; r < ring.length; r++) { const o = (tn * tn + r) * 3, s = ring[r] * 3; pos[o] = pos[s]; pos[o + 2] = pos[s + 2]; }
    const idx = [];
    for (let j = 0; j < tn - 1; j++) for (let i = 0; i < tn - 1; i++) { const a = j * tn + i, b = a + 1, c = a + tn, d = c + 1; if ((i + j) & 1) idx.push(a, c, b, b, c, d); else idx.push(a, c, d, a, d, b); }
    for (let r = 0; r < ring.length; r++) {
      const a = ring[r], b = ring[(r + 1) % ring.length], a2 = tn * tn + r, b2 = tn * tn + (r + 1) % ring.length;
      idx.push(a, b, a2, b, b2, a2, a, a2, b, b, a2, b2);   // both faces: seen from in or out
    }
    const P = new THREE.BufferAttribute(pos, 3), N = new THREE.BufferAttribute(new Float32Array(nv * 3), 3), Cc = new THREE.BufferAttribute(new Float32Array(nv * 3), 3);
    for (const A of [P, N, Cc]) A.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', P); g.setAttribute('normal', N); g.setAttribute('color', Cc); g.setIndex(idx);
    const mesh = new THREE.Mesh(g, detailMat);
    mesh.receiveShadow = true; mesh.castShadow = true;
    const D = { tile: t, mesh, shown, P, N, Cc, ring, anims: [{ x0: 0, z0: 0, x1: 64, z1: 64, t: 0, dur: opts.instantDig ? 0.01 : 2 }] };
    shadeTile(D, 0, 0, tn - 1, tn - 1);
    g.computeBoundingSphere();
    root.add(mesh);
    tiles.set(t.key, D);
    maskData[(t.j * NT + t.i) * 4] = 255; maskTex.needsUpdate = true;
  }
  function syncTiles() {
    for (const [k, t] of T.tiles) if (!tiles.has(k)) addTile(t);
    for (const [k, D] of tiles) if (!T.tiles.has(k)) { root.remove(D.mesh); D.mesh.geometry.dispose(); tiles.delete(k); maskData[(D.tile.j * NT + D.tile.i) * 4] = 0; maskTex.needsUpdate = true; }
  }
  let tilesV = -1;
  function updateTiles(dt) {
    if (T.tilesV !== tilesV) { tilesV = T.tilesV; syncTiles(); }
    if (T.dirty.length) {
      for (const b of T.dirty) for (const D of tiles.values()) {
        const t = D.tile;
        if (b.x1 < t.ox || b.x0 > t.ox + 64 || b.z1 < t.oz || b.z0 > t.oz + 64) continue;
        D.anims.push({ x0: b.x0 - t.ox, z0: b.z0 - t.oz, x1: b.x1 - t.ox, z1: b.z1 - t.oz, t: 0, dur: b.x1 - b.x0 > 300 || opts.instantDig ? 0.01 : 2 });
      }
      T.dirty.length = 0;
    }
    for (const D of tiles.values()) {
      if (!D.anims.length) continue;
      const t = D.tile, tn = t.n, tr = t.res;
      let a0 = tn, a1 = 0, b0 = tn, b1 = 0;
      for (let a = D.anims.length - 1; a >= 0; a--) {
        const A = D.anims[a];
        A.t += dt;
        const k = Math.min(1, A.t / A.dur), ease = 1 - Math.pow(1 - k, 3);
        const i0 = Math.max(0, Math.floor(A.x0 / tr)), i1 = Math.min(tn - 1, Math.ceil(A.x1 / tr));
        const j0 = Math.max(0, Math.floor(A.z0 / tr)), j1 = Math.min(tn - 1, Math.ceil(A.z1 / tr));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const q = j * tn + i; D.shown[q] = k >= 1 ? t.h[q] : D.shown[q] + (t.h[q] - D.shown[q]) * Math.min(1, ease * 0.35 + dt * 3); }
        a0 = Math.min(a0, i0 - 1); a1 = Math.max(a1, i1 + 1); b0 = Math.min(b0, j0 - 1); b1 = Math.max(b1, j1 + 1);
        if (k >= 1) D.anims.splice(a, 1);
      }
      shadeTile(D, a0, b0, a1, b1);
    }
  }
  function digging() { for (const D of tiles.values()) if (D.anims.length) return true; return false; }

  function heightShown(x, z) {
    const i = Math.floor(x / 64), j = Math.floor(z / 64);
    if (i >= 0 && j >= 0 && i < NT && j < NT) {
      const D = tiles.get(j * NT + i);
      if (D) {
        const t = D.tile, tn = t.n;
        const fx = (x - t.ox) / t.res, fz = (z - t.oz) / t.res;
        const ii = Math.max(0, Math.min(tn - 2, Math.floor(fx))), jj = Math.max(0, Math.min(tn - 2, Math.floor(fz)));
        const ax = fx - ii, az = fz - jj, k = jj * tn + ii, sh = D.shown;
        return (sh[k] + (sh[k + 1] - sh[k]) * ax) * (1 - az) + (sh[k + tn] + (sh[k + tn + 1] - sh[k + tn]) * ax) * az;
      }
    }
    return CF.height(Math.max(0, Math.min(S, x)), Math.max(0, Math.min(S, z)));
  }

  // ---------------------------------------------------------------- water
  const water = buildWater(root, world, env, res, CF);
  // ---------------------------------------------------------------- the land beyond the edge
  const skirt = buildFarLand(scene, world, env);
  // ---------------------------------------------------------------- grass ring
  const grass = opts.noGrass ? null : buildGrassRing(scene, world, env, C, heightShown);

  let terrV = -1, zoneOn = -1;
  function update(dt, t, camera, look) {
    uniforms.uTime.value = t;
    if (world.vision && world.vision.t !== visT && uniforms.uFog.value > 0.5) {
      visT = world.vision.t;
      const g = world.vision.grid[0];
      for (let k = 0; k < g.length; k++) visData[k] = g[k] ? 255 : 0;
      visTex.needsUpdate = true;
    }
    if (water) water.uniforms.uTime.value = t;
    if (grass) grass.uniforms.uTime.value = t;
    updateTiles(dt);
    const z = uniforms.uZone.value > 0.5 ? 0 : -1;
    if (W.territoryV !== terrV || zoneOn !== z) { terrV = W.territoryV; zoneOn = z; paintTerritory(0); }
    if (camera) updateView(camera);
    if (grass && look) grass.follow(look, camera);
  }
  return {
    mesh: root, uniforms, update, heightShown, digging, stats, chunks, macros, tiles,
    setLodScale(k) { lodScale = k; },
    repaintZone() { terrV = -1; },
    setAuras(list) { const u = uniforms.uAura.value; let c = 0; for (const a of list) { if (c >= MAXA) break; u[c++].set(a[0], a[1], a[2], a[3]); } uniforms.uAuraCount.value = c; },
    refreshGrass() { if (grass) grass.refresh(); },
    grass, water, skirt, colourAt(x, z) { const i = Math.max(0, Math.min(n - 1, Math.round(x / res))), j = Math.max(0, Math.min(n - 1, Math.round(z / res))), q = (j * n + i) * 3; return [dec(colU8[q]), dec(colU8[q + 1]), dec(colU8[q + 2])]; },
  };
}

// ------------------------------------------------------------------ water sheets over every wet chunk
function buildWater(parent, world, env, res, CF) {
  const T = world.terrain, S = T.size, step = 4, CHW = 128;
  const pos = [], depth = [], idx = [];
  for (let cj = 0; cj < S / CHW; cj++) for (let ci = 0; ci < S / CHW; ci++) {
    let wet = false;
    for (let z = cj * CHW; z <= cj * CHW + CHW && !wet; z += 4) for (let x = ci * CHW; x <= ci * CHW + CHW; x += 4) if (CF.height(x, z) < T.waterLevel + 0.15) { wet = true; break; }
    if (!wet) continue;
    const N = CHW / step, V = N + 1, base = pos.length / 3;
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
      const x = ci * CHW + i * step, z = cj * CHW + j * step;
      pos.push(x, T.waterLevel, z); depth.push(T.waterLevel - CF.height(Math.min(S, x), Math.min(S, z)));
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = base + j * V + i, b = a + 1, c = a + V, d = c + 1;
      if (depth[a - 0] < -0.6 && depth[b] < -0.6 && depth[c] < -0.6 && depth[d] < -0.6) continue;
      idx.push(a, c, b, b, c, d);
    }
  }
  if (!idx.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aDepth', new THREE.Float32BufferAttribute(depth, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 }, uSun: { value: new THREE.Vector3(-0.62, 0.46, -0.64).normalize() },
    uShallow: { value: new THREE.Color(env.water[0]) }, uDeep: { value: new THREE.Color(env.water[1]) }, uFoam: { value: new THREE.Color(0xeef3ec) },
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
  parent.add(m);
  return { mesh: m, uniforms };
}

// ------------------------------------------------------------------ mountains and hills past the map edge
function buildFarLand(scene, world, env) {
  const T = world.terrain, S = T.size, E = 2200;
  const coords = [];
  for (let v = -E; v <= S + E;) {
    coords.push(v);
    const d = v < 0 ? -v : v > S ? v - S : 0;
    v += v < -2 || v > S + 2 ? Math.min(160, 16 + d * 0.08) : (v >= 0 && v < S ? 64 : 16);
  }
  const xs = [...new Set(coords.concat([0, S]))].sort((a, b) => a - b);
  const n = xs.length;
  const ridge = (x, z) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < 4; i++) { s += a * (1 - Math.abs(2 * vnoise(x * f / 520, z * f / 520) - 1)); a *= 0.5; f *= 2.1; } return s; };
  const height = (x, z) => {
    const cx = Math.max(0, Math.min(S, x)), cz = Math.max(0, Math.min(S, z));
    const d = Math.hypot(x - cx, z - cz);
    const edge = T.height(cx, cz);
    if (d <= 0) return edge - 3;
    const k = Math.min(1, d / 160);
    const mtn = 40 + ridge(x, z) * 120 + d * 0.035;
    return edge * (1 - k) + Math.max(edge, mtn) * k;
  };
  const pos = new Float32Array(n * n * 3), col = new Float32Array(n * n * 3);
  const SK = env.skirt || [0x8aa156, 0x6f8a48, 0x9aa88a];
  const g1 = lin(SK[0]), g2 = lin(SK[1]), haze = lin(SK[2]), rock = lin(env.ground.rock), rockD = lin(env.ground.rockD), snow = lin(0xf2f5f8), pine = lin(env.pine ? env.pine[1] : 0x2a4429);
  const c = new THREE.Color();
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = xs[i], z = xs[j], k = (j * n + i) * 3;
    const h = height(x, z);
    pos[k] = x; pos[k + 1] = h; pos[k + 2] = z;
    const d = Math.hypot(x - Math.max(0, Math.min(S, x)), z - Math.max(0, Math.min(S, z)));
    c.copy(g1).lerp(g2, vnoise(x / 60, z / 60)).lerp(pine, Math.min(0.7, Math.max(0, (h - 20) / 50)) * vnoise(x / 140, z / 140) * 1.4);
    c.lerp(rock, Math.min(1, Math.max(0, (h - 70) / 40))).lerp(rockD, vnoise(x / 30, z / 30) * 0.3 * Math.min(1, Math.max(0, (h - 70) / 40)));
    c.lerp(snow, Math.min(0.95, Math.max(0, (h - 120 - vnoise(x / 90, z / 90) * 30) / 30)));
    c.lerp(haze, Math.min(0.45, d / 4000));
    col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
  }
  const idx = [];
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const x0 = xs[i], x1 = xs[i + 1], z0 = xs[j], z1 = xs[j + 1];
    if (x0 >= 0 && x1 <= S && z0 >= 0 && z1 <= S) continue;
    const a = j * n + i, b = a + 1, cc = a + n, dd = cc + 1;
    idx.push(a, cc, b, b, cc, dd);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97 }));
  m.receiveShadow = false;
  scene.add(m);
  return { mesh: m, height };
}

// ------------------------------------------------------------------ grass tufts in a ring around the camera
function buildGrassRing(scene, world, env, C, heightShown) {
  const T = world.terrain, CF = T.coarse;
  const posL = [], colL = [], hgtL = [];
  const rr = mulberry(77);
  for (let b = 0; b < 5; b++) {
    const a = (b / 5) * Math.PI * 2 + rr() * 0.6, r = 0.06 + rr() * 0.12;
    const ox = Math.cos(a) * r, oz = Math.sin(a) * r, lean = 0.08 + rr() * 0.16, h = 0.2 + rr() * 0.18, w = 0.045;
    const px = Math.cos(a + 1.57) * w, pz = Math.sin(a + 1.57) * w;
    const pts = [];
    for (let s = 0; s <= 2; s++) { const u = s / 2, bend = lean * u * u, cx = ox + Math.cos(a) * bend, cz = oz + Math.sin(a) * bend, ww = 1 - u * 0.92; pts.push([[cx - px * ww, h * u, cz - pz * ww], [cx + px * ww, h * u, cz + pz * ww], u]); }
    for (let s = 0; s < 2; s++) {
      const [a0, a1, u0] = pts[s], [b0, b1, u1] = pts[s + 1];
      for (const [v, u] of [[a0, u0], [a1, u0], [b0, u1], [a1, u0], [b1, u1], [b0, u1]]) { posL.push(v[0], v[1], v[2]); hgtL.push(u); const sh = 0.85 + u * 0.45; colL.push(sh, sh, sh); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(posL, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colL, 3));
  g.setAttribute('aH', new THREE.Float32BufferAttribute(hgtL, 1));
  const nn = new Float32Array(posL.length); for (let i = 1; i < nn.length; i += 3) nn[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nn, 3));
  const uniforms = { uTime: { value: 0 } };
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.9 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aH; uniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        float wv = sin(uTime * 1.7 + ip.x * 0.21 + ip.z * 0.13) * 0.6 + sin(uTime * 3.1 + ip.x * 0.7) * 0.25;
        transformed.x += wv * aH * aH * 0.16; transformed.z += wv * aH * aH * 0.08;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', 'float faceDirection = 1.0; vec3 normal = normalize(vNormal); vec3 nonPerturbedNormal = normal;');
  };
  const CAP = 26000;
  const im = new THREE.InstancedMesh(g, mat, CAP);
  im.receiveShadow = true; im.castShadow = false; im.frustumCulled = false; im.count = 0;
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  im.setColorAt(0, new THREE.Color());
  scene.add(im);
  const m4 = new THREE.Matrix4(), qn = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), cc = new THREE.Color();
  const PATCH = 24, R = 150;
  let at = null, force = false;
  function refresh() { force = true; }
  function follow(look, camera) {
    const far = look.dist > 260;
    im.visible = !far;
    if (far) return;
    if (!force && at && Math.hypot(at[0] - look.x, at[1] - look.z) < 18) return;
    force = false;
    at = [look.x, look.z];
    let c = 0;
    const blocked = (x, z) => {
      for (const st of world.structures.values()) { if (!st.alive) continue; const ax = st.pos ? st.pos[0] : (st.a[0] + st.b[0]) / 2, az = st.pos ? st.pos[1] : (st.a[1] + st.b[1]) / 2; if (Math.abs(ax - x) < 8 && Math.abs(az - z) < 8) return true; }
      return false;
    };
    const p0i = Math.floor((look.x - R) / PATCH), p1i = Math.floor((look.x + R) / PATCH), p0j = Math.floor((look.z - R) / PATCH), p1j = Math.floor((look.z + R) / PATCH);
    for (let pj = p0j; pj <= p1j && c < CAP; pj++) for (let pi = p0i; pi <= p1i && c < CAP; pi++) {
      const px = pi * PATCH, pz = pj * PATCH;
      const dd = Math.hypot(px + PATCH / 2 - look.x, pz + PATCH / 2 - look.z);
      if (dd > R) continue;
      const rnd = mulberry((pi * 73856093) ^ (pj * 19349663));
      const dens = 10 + 150 * Math.pow(Math.max(0, 1 - dd / R), 1.6);
      for (let k = 0; k < dens && c < CAP; k++) {
        const x = px + rnd() * PATCH, z = pz + rnd() * PATCH, s = rnd(), r = rnd();
        if (x < 1 || z < 1 || x > T.size - 1 || z > T.size - 1) continue;
        const patch = vnoise(x / 14, z / 14);
        if (s > 0.25 + patch * 0.9) continue;
        const m = T.matAt(x, z);
        if (m !== MAT.GRASS || T.forestAt(x, z) > 0.55 || T.trenchAmt(x, z) > 0 || T.parapetAmt(x, z) > 0.15) continue;
        const h = heightShown(x, z);
        if (h < T.waterLevel + 0.15 || T.slope(x, z) > 0.6) continue;
        qn.setFromAxisAngle(up, r * 6.28);
        ps.set(x, h - 0.03, z);
        const sz = 0.8 + s * 0.6 + patch * 0.35;
        sc.set(sz, sz * (0.8 + 0.4 * vnoise(x * 0.3, z * 0.3)), sz);
        m4.compose(ps, qn, sc);
        im.setMatrixAt(c, m4);
        const n1 = vnoise(x / 9, z / 9), n2 = vnoise(x / 31 + 7, z / 31 + 3);
        cc.copy(C.grassM).lerp(C.grassL, n1 * 0.9).lerp(C.dry, Math.max(0, n2 - 0.55) * 1.5).multiplyScalar(0.98);
        im.setColorAt(c, cc);
        c++;
      }
    }
    // structures flatten their grass (cheap pass over what was placed)
    im.count = c;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    void blocked;
  }
  return { mesh: im, uniforms, refresh, follow };
}
