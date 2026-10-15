// Snow spray particles and ski/board tracks.
import * as THREE from '../vendor/three.module.js';

export function makeFx(scene) {
  // ---------- powder particles ----------
  const N = 1800;
  const pos = new Float32Array(N * 3), size = new Float32Array(N), alpha = new Float32Array(N);
  const vel = new Float32Array(N * 3), life = new Float32Array(N), maxl = new Float32Array(N).fill(1), s0 = new Float32Array(N);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('size', new THREE.BufferAttribute(size, 1)); g.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { scale: { value: 400 } },
    vertexShader: 'attribute float size; attribute float alpha; varying float va; uniform float scale; void main(){ va = alpha; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = size*scale/max(0.5,-mv.z); gl_Position = projectionMatrix*mv; }',
    fragmentShader: 'varying float va; void main(){ vec2 d = gl_PointCoord-0.5; float r = dot(d,d)*4.0; if(r>1.0) discard; gl_FragColor = vec4(0.96,0.98,1.0, va*(1.0-r)); }',
  });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; scene.add(pts);
  let head = 0;
  const emit = (p, v, spread, n, sz = 0.35, lf = 0.8, up = 1) => {
    for (let k = 0; k < n; k++) {
      const i = head; head = (head + 1) % N;
      pos[i * 3] = p.x + (Math.random() - 0.5) * 0.3; pos[i * 3 + 1] = p.y + 0.1; pos[i * 3 + 2] = p.z + (Math.random() - 0.5) * 0.3;
      vel[i * 3] = v.x + (Math.random() - 0.5) * spread; vel[i * 3 + 1] = v.y + Math.random() * spread * 0.6 * up; vel[i * 3 + 2] = v.z + (Math.random() - 0.5) * spread;
      life[i] = maxl[i] = lf * (0.6 + Math.random() * 0.7); s0[i] = sz * (0.6 + Math.random() * 0.8);
    }
  };
  const updParticles = (dt) => {
    const drag = Math.exp(-2.2 * dt);
    for (let i = 0; i < N; i++) {
      if (life[i] <= 0) { alpha[i] = 0; continue; }
      life[i] -= dt; const t = life[i] / maxl[i];
      vel[i * 3] *= drag; vel[i * 3 + 1] = vel[i * 3 + 1] * drag - 3.5 * dt; vel[i * 3 + 2] *= drag;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      size[i] = s0[i] * (1.8 - t * 0.8); alpha[i] = Math.min(1, t * 1.6) * 0.85;
    }
    g.attributes.position.needsUpdate = true; g.attributes.size.needsUpdate = true; g.attributes.alpha.needsUpdate = true;
  };

  // ---------- tracks (ribbons in the snow) ----------
  const ribbon = (width) => {
    const M = 500, P = new Float32Array(M * 2 * 3), C = new Float32Array(M * 2 * 4), idx = [];
    for (let i = 0; i < M; i++) { const a = i * 2, b = ((i + 1) % M) * 2; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('color', new THREE.BufferAttribute(C, 4)); geo.setIndex(idx);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    m.frustumCulled = false; scene.add(m);
    let h = 0, last = null, broken = true;
    const write = (x, y, z, sx, sz, a) => {
      const o = h * 2;
      P[o * 3] = x + sx * width; P[o * 3 + 1] = y; P[o * 3 + 2] = z + sz * width; P[o * 3 + 3] = x - sx * width; P[o * 3 + 4] = y; P[o * 3 + 5] = z - sz * width;
      for (let k = 0; k < 2; k++) { C[(o + k) * 4] = 0.6; C[(o + k) * 4 + 1] = 0.7; C[(o + k) * 4 + 2] = 0.86; C[(o + k) * 4 + 3] = a; }
      h = (h + 1) % M;
    };
    const cap = () => { const o = h * 2; for (let k = 0; k < 6; k++) P[o * 3 + k] = P[((h + M - 1) % M) * 2 * 3 + k]; C[o * 4 + 3] = 0; C[(o + 1) * 4 + 3] = 0; const n2 = ((h + 1) % M) * 2; C[n2 * 4 + 3] = 0; C[(n2 + 1) * 4 + 3] = 0; };
    return {
      add(x, y, z, sx, sz) {
        if (last && !broken && (x - last[0]) ** 2 + (z - last[2]) ** 2 < 0.5) return;
        if (broken && last) { write(last[0], last[1], last[2], sx, sz, 0); write(x, y, z, sx, sz, 0); }
        else write(x, y, z, sx, sz, 0.32);
        broken = false; last = [x, y, z]; cap();
        geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
      },
      brk() { broken = true; },
      clear() { C.fill(0); geo.attributes.color.needsUpdate = true; last = null; broken = true; },
    };
  };
  const tracks = [ribbon(0.13), ribbon(0.045), ribbon(0.045)];

  return { emit, update: updParticles, tracks };
}
