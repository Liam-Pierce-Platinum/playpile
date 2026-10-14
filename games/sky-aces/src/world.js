// The world: sky dome, shader sea, low-poly islands (one analytic height function shared by the
// meshes and the crash test), puffy instanced clouds, a harbour town and a lighthouse.
import * as THREE from '../vendor/three.module.js';
import { rng } from './util.js';

export const ARENA = 3200;            // soft boundary radius (m)
export const CEILING = 1500;
export const SUN_DIR = new THREE.Vector3(-0.45, 0.62, -0.64).normalize();
export const HORIZON = new THREE.Color(0xc2ddf2);
export const HARBOR = new THREE.Vector3(420, 0, 380);

// islands: x, z, radius, height
const R = rng(1977);
export const ISLANDS = [
  { x: 380, z: 300, r: 520, h: 120 },   // home island with the harbour on its edge
  { x: -1300, z: -700, r: 640, h: 300 },
  { x: 1500, z: -1200, r: 420, h: 180 },
  { x: -600, z: 1600, r: 380, h: 140 },
  { x: 1900, z: 1300, r: 300, h: 90 },
  { x: -2300, z: 900, r: 330, h: 200 },
  { x: 300, z: -2300, r: 360, h: 230 },
];
for (let i = 0; i < 9; i++) ISLANDS.push({ x: (R() - 0.5) * 5600, z: (R() - 0.5) * 5600, r: 80 + R() * 140, h: 20 + R() * 60 });
for (const I of ISLANDS) { I.s1 = R() * 10; I.s2 = R() * 10; }

function islandH(I, x, z) {
  const dx = x - I.x, dz = z - I.z;
  const ang = Math.atan2(dz, dx);
  // wobbly coastline + ridges
  const rr = I.r * (1 + 0.16 * Math.sin(ang * 3 + I.s1) + 0.09 * Math.sin(ang * 7 + I.s2));
  const d = Math.sqrt(dx * dx + dz * dz) / rr;
  if (d >= 1.25) return -60;
  const base = d < 1 ? Math.pow(1 - d * d, 1.6) : 0;
  const ridge = 0.18 * Math.sin(x * 0.011 + I.s1) * Math.sin(z * 0.013 + I.s2) + 0.1 * Math.sin(x * 0.031 + z * 0.027 + I.s1);
  return base * I.h * (0.85 + ridge) + (1 - Math.min(1, d)) * 6 - 14 * Math.max(0, d - 0.92) / 0.33 - 1;
}
/** ground height at x,z (sea floor counts as the sea surface 0 for collisions) */
export function heightAt(x, z) {
  let h = -60;
  for (const I of ISLANDS) {
    const dx = x - I.x, dz = z - I.z;
    if (dx * dx + dz * dz > I.r * I.r * 1.7) continue;
    const v = islandH(I, x, z);
    if (v > h) h = v;
  }
  return h;
}
export const groundAt = (x, z) => Math.max(0, heightAt(x, z));

export function makeRenderer(canvas, lowq) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: !lowq, powerPreference: 'high-performance' });
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowq ? 1 : 1.75));
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.05;
  return r;
}

export function buildWorld(scene) {
  scene.background = HORIZON.clone();
  scene.fog = new THREE.Fog(HORIZON.clone(), 1400, 7800);

  const hemi = new THREE.HemisphereLight(0xe6f2ff, 0x6a8a74, 1.7);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d8, 2.1);
  sun.position.copy(SUN_DIR).multiplyScalar(1000);
  scene.add(sun);

  const world = { scene, update: null, clouds: [], cloudMesh: null };

  // ------------------------------------------------------------ sky dome
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sunDir: { value: SUN_DIR } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*p; gl_Position.z = gl_Position.w*0.99999; }`,
    fragmentShader: `uniform vec3 sunDir; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float h = clamp(d.y, -1.0, 1.0);
        vec3 zen = vec3(0.10,0.36,0.85), mid = vec3(0.36,0.63,0.95), hor = vec3(0.76,0.87,0.95), low = vec3(0.55,0.72,0.84);
        vec3 c = h > 0.0 ? mix(hor, mid, smoothstep(0.0,0.18,h)) : mix(hor, low, smoothstep(0.0,-0.2,h));
        c = mix(c, zen, smoothstep(0.12, 0.6, h));
        float s = max(dot(d, sunDir), 0.0);
        c += vec3(1.0,0.9,0.7)*pow(s, 9.0)*0.35 + vec3(1.0,0.97,0.88)*smoothstep(0.9975,0.999,s)*1.6;
        gl_FragColor = vec4(c,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(11000, 32, 16), skyMat);
  sky.frustumCulled = false; sky.renderOrder = -10;
  scene.add(sky);

  // ------------------------------------------------------------ sea
  const seaMat = new THREE.ShaderMaterial({
    fog: false,
    uniforms: { t: { value: 0 }, sunDir: { value: SUN_DIR }, camPos: { value: new THREE.Vector3() }, fogCol: { value: HORIZON }, fogNear: { value: 1400 }, fogFar: { value: 9000 } },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform float t; uniform vec3 sunDir, camPos, fogCol; uniform float fogNear, fogFar; varying vec3 vW;
      vec2 wv(vec2 p, vec2 dir, float f, float sp, float a){ float ph = dot(p, dir)*f + t*sp; return dir * cos(ph) * a * f; }
      void main(){
        vec2 p = vW.xz;
        vec2 g = wv(p, normalize(vec2(1.0,0.3)), 0.045, 1.3, 1.0) + wv(p, normalize(vec2(-0.4,1.0)), 0.07, 1.7, 0.6)
               + wv(p, normalize(vec2(0.7,-0.8)), 0.16, 2.3, 0.25) + wv(p, normalize(vec2(-0.9,-0.2)), 0.33, 3.1, 0.1);
        vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
        vec3 v = normalize(camPos - vW);
        float dist = length(camPos - vW);
        float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
        vec3 deep = vec3(0.04,0.27,0.45), shallow = vec3(0.10,0.52,0.62);
        vec3 c = mix(deep, shallow, 0.5 + 0.5*n.x);
        c = mix(c, vec3(0.68,0.84,0.95), fres*0.75);
        vec3 h = normalize(sunDir + v);
        float spec = pow(max(dot(n, h), 0.0), 180.0);
        c += vec3(1.0,0.95,0.85)*spec*2.2;
        float f = smoothstep(fogNear, fogFar, dist);
        c = mix(c, fogCol, f);
        gl_FragColor = vec4(c,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(24000, 24000, 1, 1), seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.frustumCulled = false; sea.renderOrder = -5;
  scene.add(sea);

  // ------------------------------------------------------------ islands
  const landMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 });
  const cSand = new THREE.Color(0xe9d39b), cGrass = new THREE.Color(0x6fb14a), cGrass2 = new THREE.Color(0x4f9440), cRock = new THREE.Color(0x8d8578), cSnow = new THREE.Color(0xf4f6f8), cWet = new THREE.Color(0xc2a974);
  const treeSpots = [];
  for (const I of ISLANDS) {
    const size = I.r * 2.7;
    const seg = Math.max(16, Math.min(56, Math.round(I.r / 13)));
    const g = new THREE.PlaneGeometry(size, size, seg, seg);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    const cols = [];
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + I.x, z = pos.getZ(i) + I.z;
      const h = islandH(I, x, z);
      pos.setY(i, h);
      const hn = h / I.h;
      if (h < 0.5) tmp.copy(cWet);
      else if (h < 4.5) tmp.copy(cSand);
      else if (hn < 0.55) tmp.copy(cGrass).lerp(cGrass2, (Math.sin(x * 0.05) * Math.sin(z * 0.04) + 1) / 2);
      else if (hn < 0.82 || I.h < 160) tmp.copy(cRock).lerp(cGrass2, Math.max(0, 0.7 - hn) * 2);
      else tmp.copy(cSnow);
      cols.push(tmp.r, tmp.g, tmp.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const ng = g.toNonIndexed(); ng.computeVertexNormals();
    const m = new THREE.Mesh(ng, landMat);
    m.position.set(I.x, 0, I.z);
    scene.add(m);
    const rr = rng(Math.floor(I.x * 7 + I.z));
    const nTrees = Math.floor(I.r * I.r / 2600);
    for (let k = 0; k < nTrees; k++) {
      const a = rr() * Math.PI * 2, d = Math.sqrt(rr()) * I.r * 0.85;
      const x = I.x + Math.cos(a) * d, z = I.z + Math.sin(a) * d;
      const h = islandH(I, x, z);
      if (h > 6 && h / I.h < 0.6) treeSpots.push([x, h, z, 0.7 + rr() * 0.8, rr()]);
    }
  }
  // trees: instanced cones + trunks
  {
    const n = treeSpots.length;
    const crown = new THREE.InstancedMesh(new THREE.ConeGeometry(5, 14, 6), new THREE.MeshStandardMaterial({ color: 0x3f7f3a, flatShading: true, roughness: 0.9 }), n);
    const crown2 = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(5.5, 0), new THREE.MeshStandardMaterial({ color: 0x5c9a3e, flatShading: true, roughness: 0.9 }), n);
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.7, 1, 5, 5), new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 1 }), n);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    let c1 = 0, c2 = 0;
    treeSpots.forEach(([x, h, z, sc, kind], i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), kind * 6);
      s.set(sc, sc, sc);
      p.set(x, h + 2.5 * sc, z); M.compose(p, q, s); trunk.setMatrixAt(i, M);
      if (kind < 0.55) { p.set(x, h + 11 * sc, z); M.compose(p, q, s); crown.setMatrixAt(c1++, M); }
      else { p.set(x, h + 8.5 * sc, z); M.compose(p, q, s); crown2.setMatrixAt(c2++, M); }
    });
    crown.count = c1; crown2.count = c2;
    scene.add(crown, crown2, trunk);
  }

  // ------------------------------------------------------------ harbour town + lighthouse
  const town = new THREE.Group();
  const wall = new THREE.MeshStandardMaterial({ color: 0xf3ead8, roughness: 0.9, flatShading: true });
  const roofs = [0xd9534f, 0x3b7dd8, 0xe8a33d, 0x4fa36b].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, flatShading: true }));
  const hr = rng(42);
  for (let i = 0; i < 26; i++) {
    const a = hr() * Math.PI * 2, d = 30 + hr() * 150;
    const x = HARBOR.x - 120 + Math.cos(a) * d * 0.9, z = HARBOR.z - 140 + Math.sin(a) * d * 0.6;
    const h = heightAt(x, z);
    if (h < 3) continue;
    const w = 10 + hr() * 8, dd = 10 + hr() * 8, hh = 7 + hr() * 8;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, hh, dd), wall);
    b.position.set(x, h + hh / 2 - 1, z); b.rotation.y = hr() * 3;
    const r = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, dd) * 0.78, 6, 4), roofs[i % 4]);
    r.position.set(0, hh / 2 + 3, 0); r.rotation.y = Math.PI / 4;
    b.add(r); town.add(b);
  }
  // pier + boats
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a6a46, roughness: 1 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(14, 2, 120), wood);
  pier.position.set(HARBOR.x + 40, 1.5, HARBOR.z + 30); pier.rotation.y = 0.7;
  town.add(pier);
  const hull = new THREE.MeshStandardMaterial({ color: 0x2e4a7a, roughness: 0.7, flatShading: true });
  const deck = new THREE.MeshStandardMaterial({ color: 0xf1ede4, roughness: 0.7, flatShading: true });
  world.boats = [];
  for (let i = 0; i < 6; i++) {
    const b = new THREE.Group();
    const hb = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 26), hull); hb.position.y = 1; b.add(hb);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 8), deck); cab.position.set(0, 5, -3); b.add(cab);
    b.position.set(HARBOR.x + 80 + i * 35 * Math.cos(i), 0, HARBOR.z + 120 + i * 30);
    b.rotation.y = i * 1.3;
    b.userData.ph = i;
    town.add(b); world.boats.push(b);
  }
  // lighthouse on the point
  {
    // walk out from the home island centre to the last dry spot facing the harbour side
    let lx = 380, lz = 300;
    for (let d = 0; d < 900; d += 5) { const x = 380 + d * 0.8, z = 300 - d * 0.6; if (heightAt(x, z) > 4) { lx = x; lz = z; } }
    const h = heightAt(lx, lz);
    const lh = new THREE.Group();
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(5, 8, 40, 10), new THREE.MeshStandardMaterial({ color: 0xf6f6f2, roughness: 0.7 }));
    tower.position.y = 20; lh.add(tower);
    for (let k = 0; k < 3; k++) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(5.3 + (2 - k) * 0.95, 5.3 + (2 - k + 1) * 0.95 - 0.95 * 0.3, 5, 10), new THREE.MeshStandardMaterial({ color: 0xd9433a, roughness: 0.7 }));
      band.position.y = 6 + k * 13; lh.add(band);
    }
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 6, 10), new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xffd76a, emissiveIntensity: 0.8 }));
    lamp.position.y = 43; lh.add(lamp);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(6.5, 6, 10), new THREE.MeshStandardMaterial({ color: 0x2b3a67 }));
    cap.position.y = 49; lh.add(cap);
    lh.position.set(lx, h - 1, lz);
    town.add(lh);
  }
  scene.add(town);
  // a big painted target ring at the harbour (what the bombers are after)
  world.town = town;

  // ------------------------------------------------------------ clouds
  const cr = rng(7);
  const puffs = [];
  for (let c = 0; c < 70; c++) {
    const a = cr() * Math.PI * 2, d = Math.sqrt(cr()) * ARENA * 1.25;
    const cx = Math.cos(a) * d, cz = Math.sin(a) * d, cy = 260 + cr() * 520;
    const big = 0.6 + cr() * 1.1;
    const n = 5 + Math.floor(cr() * 5);
    const cloud = { x: cx, y: cy, z: cz, r: 70 * big + 20, puffs: [] };
    for (let k = 0; k < n; k++) {
      const s = (22 + cr() * 26) * big;
      const off = (k / (n - 1) - 0.5) * 120 * big;
      const pf = [cx + off + (cr() - 0.5) * 20, cy + (cr() - 0.3) * 18 * big, cz + (cr() - 0.5) * 50 * big, s, s * (0.7 + cr() * 0.2)];
      puffs.push(pf); cloud.puffs.push(pf);
    }
    world.clouds.push(cloud);
  }
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xd4e2f0, emissiveIntensity: 0.62, roughness: 1, flatShading: false, transparent: true, opacity: 0.96 });
  const cm = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), cloudMat, puffs.length);
  {
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    puffs.forEach(([x, y, z, sx, sy], i) => { p.set(x, y, z); s.set(sx, sy, sx * 0.9); M.compose(p, q, s); cm.setMatrixAt(i, M); });
  }
  world.puffs = puffs;
  scene.add(cm);
  world.cloudMesh = cm;

  /** 0..1 how deep inside a cloud a point is (for the white-out overlay) */
  world.cloudAt = (v) => {
    let best = 0;
    for (const c of world.clouds) {
      const dx = v.x - c.x, dy = v.y - c.y, dz = v.z - c.z;
      if (dx * dx + dy * dy + dz * dz > (c.r + 120) * (c.r + 120)) continue;
      for (const pf of c.puffs) {
        const ex = v.x - pf[0], ey = (v.y - pf[1]) * pf[3] / pf[4], ez = v.z - pf[2];
        const d = Math.sqrt(ex * ex + ey * ey + ez * ez) / pf[3];
        if (d < 1.1) best = Math.max(best, Math.min(1, (1.1 - d) * 2.2));
      }
    }
    return best;
  };

  world.update = (dt, t, camera) => {
    seaMat.uniforms.t.value = t;
    seaMat.uniforms.camPos.value.copy(camera.position);
    sky.position.copy(camera.position);
    sea.position.x = Math.round(camera.position.x / 100) * 100;
    sea.position.z = Math.round(camera.position.z / 100) * 100;
    for (const b of world.boats) { b.position.y = Math.sin(t * 1.2 + b.userData.ph) * 0.5; b.rotation.z = Math.sin(t * 0.9 + b.userData.ph) * 0.04; }
  };
  return world;
}
