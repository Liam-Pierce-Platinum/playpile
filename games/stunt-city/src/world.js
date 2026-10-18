// STUNT CITY world: vaporwave sky, mirror grid floor, chrome stunt pieces, palms, mountains.
import * as THREE from 'three';
import { Reflector } from '../vendor/Reflector.js';

export const SUN = new THREE.Vector3(0, 0.1, -1).normalize();
export const FOG = new THREE.Color(0.75, 0.22, 0.5);
const fogGLSL = `uniform vec3 fogC; uniform float fogD;
vec3 applyFog(vec3 c, vec3 wp){ float d = length(wp - cameraPosition); float f = 1.0 - exp(-pow(d*fogD,1.6)); return mix(c, fogC, clamp(f,0.0,1.0)); }`;
export const U = { time: { value: 0 }, fogC: { value: FOG }, fogD: { value: 0.0021 } };

// ---------- sky ----------
function skyMat() {
  return new THREE.ShaderMaterial({
    uniforms: { time: U.time, sun: { value: SUN } }, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `varying vec3 vD; uniform vec3 sun; uniform float time;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164)))*43758.5453); }
      void main(){ vec3 d = normalize(vD); float y = d.y;
        vec3 top = vec3(0.04,0.01,0.12), mid = vec3(0.38,0.06,0.42), hor = vec3(1.0,0.38,0.42);
        vec3 c = mix(hor, mid, smoothstep(0.0,0.16,y)); c = mix(c, top, smoothstep(0.12,0.55,y));
        if (y < 0.0) c = mix(hor*0.8, vec3(0.12,0.02,0.16), smoothstep(0.0,-0.25,y));
        float a = acos(clamp(dot(d, sun), -1.0, 1.0)); float R = 0.17;
        vec3 sd = normalize(sun - d*0.0);
        float sy = (d.y - sun.y)/R;
        if (a < R) { vec3 sc = mix(vec3(1.0,0.16,0.55), vec3(1.0,0.92,0.35), clamp(sy*0.5+0.6,0.0,1.0));
          float band = fract(sy*5.0 + time*0.15); float gap = (sy < 0.25) ? step(band, (0.25 - sy)*0.45) : 0.0;
          float edge = smoothstep(R, R-0.004, a); c = mix(c, sc*1.25, edge*(1.0-gap)); }
        c += vec3(1.0,0.35,0.5) * exp(-a*6.0) * 0.45;
        if (y > 0.08) { vec3 q = floor(d*380.0); float s = step(0.996, h(q)); c += s * smoothstep(0.08,0.4,y) * (0.6+0.4*sin(time*3.0+h(q+1.0)*40.0)); }
        gl_FragColor = vec4(c,1.0); }`,
  });
}

// ---------- materials ----------
export function makeMats(envMap) {
  const chrome = (color, rough = 0.12) => new THREE.MeshStandardMaterial({ color, metalness: 1, roughness: rough, envMap, envMapIntensity: 1.3 });
  const deck = new THREE.ShaderMaterial({
    uniforms: { time: U.time, fogC: U.fogC, fogD: U.fogD, tint: { value: new THREE.Color(1, 0.25, 0.7) } }, side: THREE.DoubleSide,
    vertexShader: `attribute vec2 uvu; varying vec2 vU; varying vec3 vW; void main(){ vU = uvu; vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `${fogGLSL} uniform float time; uniform vec3 tint; varying vec2 vU; varying vec3 vW;
      void main(){ float u = vU.x, v = vU.y; // u = metres along, v = -1..1 across
        float chev = fract((u - abs(v)*1.6)*0.25 - time*0.9); float arrow = smoothstep(0.0,0.06,chev)*smoothstep(0.32,0.24,chev);
        float rail = smoothstep(0.86,0.95,abs(v));
        vec3 base = mix(vec3(0.07,0.02,0.13), vec3(0.16,0.04,0.24), 0.5+0.5*v*v);
        vec3 c = base + tint*arrow*0.55 + vec3(0.4,1.0,1.0)*rail*1.2;
        if (!gl_FrontFacing) c = vec3(0.1,0.03,0.16);
        gl_FragColor = vec4(applyFog(c, vW),1.0); }`,
  });
  const neon = (c) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
  return { chrome, deck, neon, cyan: neon(0x66ffff), pink: neon(0xff4fc0), gold: neon(0xffe66b) };
}

function floor(scene, w, h) {
  const shader = {
    uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, time: U.time, fogC: U.fogC, fogD: U.fogD },
    vertexShader: `uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vW;
      void main(){ vUv = textureMatrix*vec4(position,1.0); vW = (modelMatrix*vec4(position,1.0)).xyz; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `${fogGLSL} uniform sampler2D tDiffuse; uniform float time; varying vec4 vUv; varying vec3 vW;
      float grid(vec2 p, float s, float w){ vec2 q = p/s; vec2 g = abs(fract(q-0.5)-0.5)/fwidth(q); return 1.0 - min(min(g.x,g.y)/w,1.0); }
      void main(){ vec4 uv = vUv; uv.xy += vec2(sin(vW.z*0.35+time*1.3), cos(vW.x*0.3+time))*0.006*uv.w;
        vec3 r = texture2DProj(tDiffuse, uv).rgb;
        float d = length(vW.xz - cameraPosition.xz);
        float g1 = grid(vW.xz, 8.0, 1.0), g2 = grid(vW.xz, 64.0, 1.6);
        float pulse = 0.5 + 0.5*sin(length(vW.xz)*0.05 - time*2.0);
        vec3 base = vec3(0.045,0.0,0.08);
        vec3 c = base + r*vec3(0.75,0.6,0.85);
        c += vec3(1.0,0.2,0.75) * g1 * 0.55 * exp(-d*0.004);
        c += vec3(0.3,0.95,1.0) * g2 * (0.6 + 0.4*pulse);
        gl_FragColor = vec4(applyFog(c, vW),1.0); }`,
  };
  const pr = Math.min(window.devicePixelRatio || 1, 1.5);
  const m = new Reflector(new THREE.PlaneGeometry(w, h), { shader, textureWidth: Math.floor(innerWidth * pr * 0.5), textureHeight: Math.floor(innerHeight * pr * 0.5), clipBias: 0.003, multisample: 0 });
  m.rotation.x = -Math.PI / 2; scene.add(m); return m;
}

function mountains(scene) {
  const segA = 220, segR = 14, geo = new THREE.BufferGeometry(), pos = [], idx = [];
  for (let j = 0; j <= segR; j++) for (let i = 0; i <= segA; i++) {
    const a = (i / segA) * Math.PI * 2, r = 900 + j * 45;
    const ridge = Math.sin(j / segR * Math.PI);
    const n = Math.abs(Math.sin(a * 7.0 + j * 0.4) + 0.6 * Math.sin(a * 17.0 + j) + 0.3 * Math.sin(a * 41.0));
    const front = Math.max(0, Math.cos(a - Math.PI * 1.5)); // dip in front of the sun
    pos.push(Math.cos(a) * r, ridge * (40 + n * 120) * (1 - 0.7 * Math.pow(front, 6)), Math.sin(a) * r);
  }
  for (let j = 0; j < segR; j++) for (let i = 0; i < segA; i++) { const a = j * (segA + 1) + i, b = a + segA + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    uniforms: { fogC: U.fogC, time: U.time }, side: THREE.DoubleSide,
    vertexShader: `varying vec3 vW; void main(){ vW = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 fogC; varying vec3 vW;
      void main(){ vec2 q = vec2(atan(vW.z, vW.x)*120.0, vW.y*0.12); vec2 g = abs(fract(q-0.5)-0.5)/fwidth(q); float l = 1.0 - min(min(g.x,g.y),1.0);
        vec3 c = mix(vec3(0.1,0.02,0.18), vec3(0.3,0.05,0.35), clamp(vW.y/150.0,0.0,1.0)) + vec3(1.0,0.3,0.85)*l*0.7;
        c = mix(c, fogC, 0.35); gl_FragColor = vec4(c,1.0); }`,
  });
  scene.add(new THREE.Mesh(geo, mat));
}

// tiny geometry merge (positions + normals) for instanced palms
function merge(list) {
  const P = [], N = [];
  for (const [g, m] of list) { const n = g.index ? g.toNonIndexed() : g; n.applyMatrix4(m); n.computeVertexNormals(); P.push(...n.attributes.position.array); N.push(...n.attributes.normal.array); }
  const o = new THREE.BufferGeometry(); o.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); o.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); return o;
}
function palmGeo() {
  const parts = [], M = (x, y, z, rx, ry, rz, s = [1, 1, 1]) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(...s));
  let x = 0, y = 0;
  for (let i = 0; i < 8; i++) { const nx = x + 0.12 * i * 0.25; parts.push([new THREE.CylinderGeometry(0.28 - i * 0.02, 0.32 - i * 0.02, 1.7, 6), M(nx, y + 0.85, 0, 0, 0, -0.04 * i)]); x = nx + 0.07 * i; y += 1.65; }
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; parts.push([new THREE.ConeGeometry(0.5, 6, 4), M(x + Math.cos(a) * 2.6, y - 0.7, Math.sin(a) * 2.6, 0, -a, Math.PI / 2 + 0.45, [1, 1, 0.25]).premultiply(new THREE.Matrix4())]); }
  return merge(parts);
}

// ---------- stunt pieces ----------
// ramp/box: local u along yaw forward, v across. loop: vertical circle along forward with a lateral corkscrew offset W.
export const PIECES = [];
const P = (o) => (PIECES.push(o), o);
function hAt(p, u) { if (p.type === 'box') return p.h; const t = u / p.len; return p.curve === 'quad' ? p.h * t * t : p.h * t; }
export function toLocal(p, x, z) { const dx = x - p.x, dz = z - p.z, s = Math.sin(p.yaw), c = Math.cos(p.yaw); return [dx * s + dz * c, dx * c - dz * s]; }
export function toWorld(p, u, v) { const s = Math.sin(p.yaw), c = Math.cos(p.yaw); return [p.x + u * s + v * c, p.z + u * c - v * s]; }
function inside(p, u, v) { if (p.type === 'loop') return false; return Math.abs(v) <= p.w / 2 && (p.type === 'box' ? Math.abs(u) <= p.len / 2 : u >= 0 && u <= p.len); }
// highest walkable surface under (x,z) not more than STEP above y. wall=true if a piece top blocks us.
export function surface(x, z, y) {
  let h = 0, piece = null, wall = false;
  for (const p of PIECES) { if (p.type === 'loop') continue; const [u, v] = toLocal(p, x, z); if (!inside(p, u, v)) continue; const hp = pieceH(p, u); if (hp <= y + 1.0) { if (hp > h) { h = hp; piece = p; } } else wall = true; }
  return { h, piece, wall };
}

function rampMesh(p, M) {
  const g = new THREE.Group(), N = p.type === 'box' ? 1 : 16, hw = p.w / 2;
  const top = [], uvu = [], idx = [], side = [];
  const U0 = p.type === 'box' ? -p.len / 2 : 0;
  for (let i = 0; i <= N; i++) { const u = U0 + (i / N) * p.len, h = hAt(p, u); for (const v of [-hw, hw]) { top.push(v, h, u); uvu.push(u - U0, v / hw); } }
  for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(top, 3)); tg.setAttribute('uvu', new THREE.Float32BufferAttribute(uvu, 2)); tg.setIndex(idx);
  g.add(new THREE.Mesh(tg, M.deck));
  // sides + back as chrome
  const sp = [], si = [];
  const quad = (a, b, c, d) => { const o = sp.length / 3; sp.push(...a, ...b, ...c, ...d); si.push(o, o + 1, o + 2, o, o + 2, o + 3); };
  for (let i = 0; i < N; i++) {
    const u0 = U0 + (i / N) * p.len, u1 = U0 + ((i + 1) / N) * p.len, h0 = hAt(p, u0), h1 = hAt(p, u1);
    quad([hw, 0, u0], [hw, 0, u1], [hw, h1, u1], [hw, h0, u0]); quad([-hw, 0, u1], [-hw, 0, u0], [-hw, h0, u0], [-hw, h1, u1]);
  }
  const ue = U0 + p.len, he = hAt(p, ue); quad([hw, 0, ue], [-hw, 0, ue], [-hw, he, ue], [hw, he, ue]);
  if (p.type === 'box') quad([-hw, 0, U0], [hw, 0, U0], [hw, p.h, U0], [-hw, p.h, U0]);
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); sg.setIndex(si); sg.computeVertexNormals();
  g.add(new THREE.Mesh(sg, M.side));
  // neon lip
  const lip = new THREE.Mesh(new THREE.BoxGeometry(p.w + 0.3, 0.18, 0.3), M.cyan); lip.position.set(0, he + 0.05, ue); g.add(lip);
  for (const sx of [-1, 1]) { const pts = []; for (let i = 0; i <= N; i++) { const u = U0 + (i / N) * p.len; pts.push(new THREE.Vector3(sx * (hw + 0.05), hAt(p, u) + 0.05, u)); } g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), N * 2, 0.1, 4), M.pink)); }
  g.position.set(p.x, 0, p.z); g.rotation.y = p.yaw; return g;
}
export function loopPoint(p, th) { return { u: p.R * Math.sin(th), y: p.R * (1 - Math.cos(th)), v: (th / (Math.PI * 2)) * p.W }; }
function loopMesh(p, M) {
  const g = new THREE.Group(), N = 180, hw = 2.8, pos = [], uvu = [], idx = [];
  for (let i = 0; i <= N; i++) { const th = (i / N) * Math.PI * 2, q = loopPoint(p, th), nu = -Math.sin(th) * 0.18, ny = Math.cos(th) * 0.18; for (const s of [-1, 1]) { pos.push(q.v + s * hw, q.y - ny, q.u - nu); uvu.push(th * p.R, s); } }
  for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); tg.setAttribute('uvu', new THREE.Float32BufferAttribute(uvu, 2)); tg.setIndex(idx);
  g.add(new THREE.Mesh(tg, M.deck));
  for (const s of [-1, 1]) { const pts = []; for (let i = 0; i <= 90; i++) { const th = (i / 90) * Math.PI * 2, q = loopPoint(p, th); pts.push(new THREE.Vector3(q.v + s * hw, q.y, q.u)); } g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 180, 0.16, 5), s < 0 ? M.cyan : M.pink)); }
  const outer = []; for (let i = 0; i <= 90; i++) { const th = (i / 90) * Math.PI * 2, q = loopPoint(p, th); outer.push(new THREE.Vector3(q.v, q.y - Math.cos(th) * 0.8, q.u + Math.sin(th) * 0.8)); }
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(outer), 180, 0.5, 8), M.side));
  for (const v of [-5, p.W + 5]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.7, p.R * 2 + 2, 12), M.side); c.position.set(v, p.R + 1, 0); g.add(c); }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(p.W + 10, 0.6, 0.6), M.side); bar.position.set(p.W / 2, p.R * 2 + 1.6, 0); g.add(bar);
  g.position.set(p.x, 0, p.z); g.rotation.y = p.yaw; return g;
}

// layout. yaw = PI means "faces -Z" (toward the sun).
const PI = Math.PI;
export const L = {
  kick1: P({ type: 'ramp', x: 0, z: -10, yaw: PI, w: 10, len: 18, h: 4.5, curve: 'quad' }),
  kick2: P({ type: 'ramp', x: -30, z: 30, yaw: PI, w: 9, len: 14, h: 3, curve: 'quad' }),
  kick3: P({ type: 'ramp', x: 30, z: 30, yaw: PI, w: 9, len: 14, h: 3, curve: 'quad' }),
  loop1: P({ type: 'loop', x: 60, z: -40, yaw: PI, R: 11, W: 7 }),
  loop2: P({ type: 'loop', x: -160, z: 40, yaw: 0, R: 17, W: 8 }),
  mega: P({ type: 'ramp', x: -90, z: -40, yaw: PI, w: 14, len: 55, h: 15, curve: 'quad' }),
  towerRamp: P({ type: 'ramp', x: 120, z: 35, yaw: 0, w: 12, len: 30, h: 10 }),
  tower: P({ type: 'box', x: 120, z: 80, yaw: 0, w: 26, len: 30, h: 10 }),
  towerKick: P({ type: 'ramp', x: 120, z: 85, yaw: 0, w: 10, len: 8, h: 2.5, curve: 'quad' }),
  gapKick: P({ type: 'ramp', x: -75, z: 140, yaw: PI / 2, w: 10, len: 18, h: 5, curve: 'quad' }),
  gapLand: P({ type: 'ramp', x: 19, z: 140, yaw: -PI / 2, w: 16, len: 40, h: 8 }),
  flip: P({ type: 'ramp', x: 180, z: 220, yaw: PI, w: 12, len: 24, h: 8, curve: 'quad' }),
};
// sky gauntlet: five kickers in a row toward -Z
export const GAUNT = [];
for (let i = 0; i < 5; i++) GAUNT.push(P({ type: 'ramp', x: -230, z: 170 - i * 75, yaw: PI, w: 10, len: 16, h: 4, curve: 'quad' }));
// tower kicker = ramp riding on the tower top
L.towerKick.base = 10;
const _hAt = hAt;
export function pieceH(p, u) { return (p.base || 0) + _hAt(p, u); }

export function lipWorld(p, up = 2.6, fwd = 3) { const [x, z] = toWorld(p, p.len + fwd, 0); return new THREE.Vector3(x, (p.base || 0) + p.h + up, z); }

export function buildWorld(scene, renderer) {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2400, 48, 24), skyMat()); sky.renderOrder = -1; scene.add(sky);
  // env map from sky + a grid floor so chrome reflects the sunset and the grid
  const envScene = new THREE.Scene(); envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 48, 24), skyMat()));
  const eg = new THREE.Mesh(new THREE.PlaneGeometry(400, 400, 1, 1), new THREE.ShaderMaterial({ vertexShader: `varying vec3 vW; void main(){ vW = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`, fragmentShader: `varying vec3 vW; void main(){ vec2 q = vW.xy/6.0; vec2 g = abs(fract(q-0.5)-0.5)/fwidth(q); float l = 1.0-min(min(g.x,g.y),1.0); gl_FragColor = vec4(vec3(0.06,0.0,0.1)+vec3(1.0,0.25,0.8)*l, 1.0); }` }));
  eg.rotation.x = -PI / 2; eg.position.y = -2; envScene.add(eg);
  const pm = new THREE.PMREMGenerator(renderer); const env = pm.fromScene(envScene, 0.02).texture; pm.dispose();
  scene.environment = null;
  const M = makeMats(env); M.side = M.chrome(0xd8c8ff, 0.18); M.env = env;
  floor(scene, 2400, 2400);
  mountains(scene);
  scene.add(new THREE.HemisphereLight(0xff9ad5, 0x30104a, 1.1));
  const dl = new THREE.DirectionalLight(0xffb070, 2.2); dl.position.copy(SUN).multiplyScalar(100).add(new THREE.Vector3(0, 60, 0)); scene.add(dl);
  const back = new THREE.DirectionalLight(0x66e0ff, 1.0); back.position.set(0, 50, 100); scene.add(back);
  for (const p of PIECES) { const m = p.type === 'loop' ? loopMesh(p, M) : rampMesh(p, M); if (p.base) m.position.y = p.base; scene.add(m); }
  // palms (instanced silhouettes) + chrome columns
  const pg = palmGeo(), palmMat = new THREE.MeshStandardMaterial({ color: 0x1a0626, roughness: 0.6, metalness: 0.4, envMap: env, envMapIntensity: 0.6 });
  const spots = []; for (let i = 0; i < 70; i++) { const a = i / 70 * PI * 2 + Math.sin(i * 7.3) * 0.05, r = 300 + (i % 3) * 18; spots.push([Math.cos(a) * r, Math.sin(a) * r, i]); }
  for (let i = 0; i < 14; i++) spots.push([-120 + i * 18 * (i % 2 ? 1 : -1) * 0.3 + (i % 2 ? 140 : -40), -200 - (i * 37) % 60, i]);
  const pal = new THREE.InstancedMesh(pg, palmMat, spots.length), mm = new THREE.Matrix4();
  spots.forEach(([x, z, i], k) => { const s = 0.8 + ((i * 37) % 10) / 15; mm.compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, i * 2.1, 0)), new THREE.Vector3(s, s, s)); pal.setMatrixAt(k, mm); });
  scene.add(pal);
  const colG = new THREE.CylinderGeometry(1.2, 1.4, 14, 16), cap = new THREE.SphereGeometry(2.2, 24, 16), colM = M.chrome(0xffffff, 0.05), capM = M.chrome(0xff7ad9, 0.08);
  for (let i = 0; i < 10; i++) { const a = i / 10 * PI * 2 + 0.3, r = 255; const c = new THREE.Mesh(colG, colM); c.position.set(Math.cos(a) * r, 7, Math.sin(a) * r); scene.add(c); const s = new THREE.Mesh(cap, capM); s.position.set(c.position.x, 16, c.position.z); scene.add(s); }
  return { sky, M, env };
}
