// Particles (sparks, fireworks, dust), the ball trail, and the stand targets.
import * as THREE from '../vendor/three.module.js';
import { fenceDist, standHeight } from './physics.js';

const MAX = 2400;

export function buildFx(scene) {
  const pos = new Float32Array(MAX * 3), col = new Float32Array(MAX * 3), size = new Float32Array(MAX), alpha = new Float32Array(MAX);
  const vel = new Float32Array(MAX * 3), life = new Float32Array(MAX), maxLife = new Float32Array(MAX), drag = new Float32Array(MAX), grav = new Float32Array(MAX);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('size', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uScale: { value: 600 } },
    vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; uniform float uScale;
      varying vec3 vC; varying float vA;
      void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0);
        gl_PointSize = clamp(size * uScale / -mv.z, 1.0, 64.0); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vC; varying float vA;
      void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
        float k = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vC * (0.6 + k), vA * k); }`,
  });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.renderOrder = 5;
  scene.add(pts);
  let next = 0;
  const c = new THREE.Color();

  function spawn(x, y, z, vx, vy, vz, color, sz, lf, dr = 0.5, gr = 9.8) {
    const i = next; next = (next + 1) % MAX;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
    c.set(color); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    size[i] = sz; life[i] = lf; maxLife[i] = lf; drag[i] = dr; grav[i] = gr; alpha[i] = 1;
  }
  const rnd = (a) => (Math.random() * 2 - 1) * a;

  function sparks(p, n, power) {
    for (let i = 0; i < n; i++) {
      const s = 3 + Math.random() * 9 * power;
      spawn(p.x, p.y, p.z, rnd(1) * s, rnd(1) * s * 0.7 + 1.5, -Math.random() * s * 0.8, i % 3 ? 0xffe9a8 : 0xffffff, 0.035 + Math.random() * 0.03, 0.25 + Math.random() * 0.3, 3, 6);
    }
  }
  function dust(p, n, colr = 0xc8936a) {
    for (let i = 0; i < n; i++) spawn(p.x + rnd(0.5), p.y + 0.1, p.z + rnd(0.5), rnd(2.5), Math.random() * 3, rnd(2.5), colr, 0.5 + Math.random() * 0.6, 0.7 + Math.random() * 0.5, 2.5, 2);
  }
  const FW = [0xff3d7f, 0xffd23a, 0x3ad6ff, 0x7dff7a, 0xff8a3a, 0xc77dff, 0xffffff];
  function firework(p, big = 1) {
    const colr = FW[(Math.random() * FW.length) | 0], colr2 = FW[(Math.random() * FW.length) | 0];
    const n = Math.floor(90 * big);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      const s = 14 + Math.random() * 4;
      spawn(p.x, p.y, p.z, Math.cos(a) * r * s, u * s, Math.sin(a) * r * s, i & 1 ? colr : colr2, 1.6, 1.3 + Math.random() * 0.6, 1.4, 5);
    }
    spawn(p.x, p.y, p.z, 0, 0, 0, 0xffffff, 9, 0.25, 0, 0);
  }
  // little celebration burst at a world point (target hit)
  function burst(p, colr) {
    for (let i = 0; i < 60; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u), s = 6 + Math.random() * 6;
      spawn(p.x, p.y, p.z, Math.cos(a) * r * s, u * s, Math.sin(a) * r * s, colr, 1.0, 0.8 + Math.random() * 0.4, 1.5, 3);
    }
  }

  function update(dt) {
    for (let i = 0; i < MAX; i++) {
      if (life[i] <= 0) { if (alpha[i] !== 0) alpha[i] = 0; continue; }
      life[i] -= dt;
      const k = Math.max(0, 1 - drag[i] * dt);
      vel[i * 3] *= k; vel[i * 3 + 1] = vel[i * 3 + 1] * k - grav[i] * dt; vel[i * 3 + 2] *= k;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      alpha[i] = Math.max(0, life[i] / maxLife[i]);
    }
    g.attributes.position.needsUpdate = true; g.attributes.alpha.needsUpdate = true;
    g.attributes.color.needsUpdate = true; g.attributes.size.needsUpdate = true;
  }

  // ---- ball trail: a camera-facing ribbon through recent positions ----
  const TN = 48;
  const tPos = new Float32Array(TN * 2 * 3), tA = new Float32Array(TN * 2);
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.BufferAttribute(tPos, 3).setUsage(THREE.DynamicDrawUsage));
  tg.setAttribute('a', new THREE.BufferAttribute(tA, 1).setUsage(THREE.DynamicDrawUsage));
  const tIdx = [];
  for (let i = 0; i < TN - 1; i++) { const k = i * 2; tIdx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  tg.setIndex(tIdx);
  const tMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uCol: { value: new THREE.Color(0xfff3c4) } },
    vertexShader: `attribute float a; varying float vA; void main(){ vA = a; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uCol; varying float vA; void main(){ gl_FragColor = vec4(uCol, vA * 0.7); }`,
  });
  const trail = new THREE.Mesh(tg, tMat); trail.frustumCulled = false; trail.renderOrder = 4; scene.add(trail);
  const hist = [];
  const side = new THREE.Vector3(), dir = new THREE.Vector3(), toCam = new THREE.Vector3();
  function trailPush(p) { hist.unshift({ x: p.x, y: p.y, z: p.z }); if (hist.length > TN) hist.pop(); }
  function trailClear() { hist.length = 0; tA.fill(0); tg.attributes.a.needsUpdate = true; }
  function trailUpdate(cam, width) {
    for (let i = 0; i < TN; i++) {
      const h = hist[Math.min(i, hist.length - 1)];
      if (!h) { tA[i * 2] = tA[i * 2 + 1] = 0; continue; }
      const h2 = hist[Math.min(i + 1, hist.length - 1)];
      dir.set(h.x - h2.x, h.y - h2.y, h.z - h2.z);
      if (dir.lengthSq() < 1e-8) dir.set(0, 0, 1);
      toCam.set(cam.position.x - h.x, cam.position.y - h.y, cam.position.z - h.z);
      side.crossVectors(dir, toCam).normalize();
      const w = width * (1 - i / TN) * Math.max(0, Math.min(1, (toCam.length() - 3) / 14));
      tPos.set([h.x + side.x * w, h.y + side.y * w, h.z + side.z * w], i * 6);
      tPos.set([h.x - side.x * w, h.y - side.y * w, h.z - side.z * w], i * 6 + 3);
      const a = i < hist.length ? 1 - i / TN : 0;
      tA[i * 2] = tA[i * 2 + 1] = a;
    }
    tg.attributes.position.needsUpdate = true; tg.attributes.a.needsUpdate = true;
  }

  // ---- targets in the stands ----
  const targets = [];
  const ringMat = (col) => new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.6, roughness: 0.3, metalness: 0.2 });
  const TCOL = [0xff3d7f, 0x3ad6ff, 0xffd23a];
  for (let i = 0; i < 3; i++) {
    const grp = new THREE.Group();
    const torus = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.38, 14, 48), ringMat(TCOL[i]));
    const inner = new THREE.Mesh(new THREE.CircleGeometry(3.0, 40), new THREE.MeshBasicMaterial({ color: TCOL[i], transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
    const bull = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.2, 10, 32), ringMat(0xffffff));
    grp.add(torus, inner, bull);
    scene.add(grp);
    grp.visible = false;
    grp.children.forEach((m) => { m.material.transparent = true; });
    targets.push({ grp, col: TCOL[i], pos: new THREE.Vector3(), hitT: -1, spin: Math.random() * 6, fade: 1 });
  }
  function placeTarget(t, rand = Math.random) {
    const a = -36 + rand() * 72, r = fenceDist(a) + 10 + rand() * 18;
    const h = standHeight(a, r) + 4 + rand() * 4;
    t.pos.set(Math.sin(a * Math.PI / 180) * r, h, -Math.cos(a * Math.PI / 180) * r);
    t.grp.position.copy(t.pos);
    t.grp.lookAt(0, h * 0.6, 0);
    t.grp.scale.setScalar(1); t.hitT = -1; t.grp.visible = true;
  }
  // show = 0..1: targets fade back while a pitch is coming so they never hide the ball
  function updateTargets(dt, time, show = 1) {
    for (const t of targets) {
      t.fade += (show - t.fade) * Math.min(1, dt * 6);
      if (t.hitT < 0) t.grp.children.forEach((m, j) => { m.material.opacity = (j === 1 ? 0.18 : 1) * t.fade; });
      t.grp.position.y = t.pos.y + Math.sin(time * 1.5 + t.spin) * 0.6;
      t.grp.children[2].rotation.z = time * 2;
      if (t.hitT >= 0) {
        t.hitT += dt;
        const k = t.hitT / 0.5;
        t.grp.scale.setScalar(1 + k * 1.5);
        t.grp.children.forEach((m) => { m.material.transparent = true; m.material.opacity = Math.max(0, 1 - k); });
        if (k >= 1) { placeTarget(t); t.grp.children.forEach((m, j) => { m.material.opacity = j === 1 ? 0.18 : 1; }); }
      }
    }
  }

  return { spawn, sparks, dust, firework, burst, update, trailPush, trailClear, trailUpdate, tMat, targets, placeTarget, updateTargets, mat };
}
