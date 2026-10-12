// The ballpark at night: field, wall, stands, crowd, light towers, scoreboard, sky.
import * as THREE from '../vendor/three.module.js';
import { fenceDist, standHeight, WALL_H } from './physics.js';

const deg = Math.PI / 180;

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}

// ---- field ---------------------------------------------------------------
const FX0 = -150, FX1 = 150, FZ0 = -262, FZ1 = 38;     // world area covered by the field texture
function fieldTexture(maxAniso) {
  const N = 2048;
  const tex = canvasTex(N, N, (g) => {
    const sx = N / (FX1 - FX0), sz = N / (FZ1 - FZ0);
    const P = (x, z) => [(x - FX0) * sx, (z - FZ0) * sz];
    g.fillStyle = '#1f5f2c'; g.fillRect(0, 0, N, N);
    // mowing pattern: diagonal checkerboard, two greens
    g.save();
    const [hx, hz] = P(0, 0);
    g.translate(hx, hz); g.rotate(45 * deg);
    const band = 7 * sx;
    for (let i = -40; i < 40; i++) for (let j = -40; j < 40; j++) {
      const a = (i + j) & 1;
      g.fillStyle = a ? '#2f8a3a' : '#287a33';
      g.fillRect(i * band, j * band, band + 1, band + 1);
    }
    g.restore();
    // soft lengthwise sheen so it is not a flat checker
    for (let i = 0; i < 26; i++) {
      const [x0] = P(-150 + i * 12, 0);
      g.fillStyle = i & 1 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.03)';
      g.fillRect(x0, 0, 12 * sx, N);
    }
    // warning track + everything beyond the wall
    g.fillStyle = '#9b5d36';
    g.beginPath();
    for (let a = -64; a <= 64; a += 1) {
      const r = (Math.abs(a) <= 45 ? fenceDist(a) : 98) - 5;
      const [x, z] = P(Math.sin(a * deg) * r, -Math.cos(a * deg) * r);
      a === -64 ? g.moveTo(x, z) : g.lineTo(x, z);
    }
    for (let a = 64; a >= -64; a -= 1) {
      const [x, z] = P(Math.sin(a * deg) * 220, -Math.cos(a * deg) * 220);
      g.lineTo(x, z);
    }
    g.closePath(); g.fill();
    // infield dirt arc
    const dirt = '#b8704a';
    g.fillStyle = dirt;
    g.beginPath();
    const [mx, mz] = P(0, -18.4);
    g.arc(mx, mz, 29 * sx, 0, Math.PI * 2); g.fill();
    // clip the dirt back to grass in foul territory near home (cut the wedge below the lines)
    g.fillStyle = '#287a33';
    g.beginPath();
    { const [a, b] = P(0, 0), [c, d] = P(-60, 60), [e, f] = P(60, 60); g.moveTo(a, b); g.lineTo(c, d); g.lineTo(e, f); g.closePath(); }
    g.fill();
    g.beginPath();
    { const [a, b] = P(0, 0), [c, d] = P(-70, -70), [e, f] = P(-90, -40); g.moveTo(a, b); g.lineTo(c, d); g.lineTo(e, f); g.lineTo(...P(-60, 60)); g.closePath(); }
    g.fill();
    g.beginPath();
    { const [a, b] = P(0, 0), [c, d] = P(70, -70), [e, f] = P(90, -40); g.moveTo(a, b); g.lineTo(c, d); g.lineTo(e, f); g.lineTo(...P(60, 60)); g.closePath(); }
    g.fill();
    // infield grass diamond (inset from the base paths)
    g.fillStyle = '#2f8a3a';
    g.beginPath();
    const ins = 3.2, B = 19.4;
    g.moveTo(...P(0, -ins * 1.414)); g.lineTo(...P(B - ins * 1.414, -B)); g.lineTo(...P(0, -2 * B + ins * 1.414)); g.lineTo(...P(-B + ins * 1.414, -B));
    g.closePath(); g.fill();
    // dirt cutouts round home and mound
    g.fillStyle = dirt;
    g.beginPath(); g.arc(...P(0, -18.4), 2.8 * sx, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(...P(0, 0), 4.2 * sx, 0, Math.PI * 2); g.fill();
    for (const [bx, bz] of [[B, -B], [0, -2 * B], [-B, -B]]) { g.beginPath(); g.arc(...P(bx, bz), 3 * sx, 0, Math.PI * 2); g.fill(); }
    // chalk: foul lines to the wall
    g.strokeStyle = '#f4f1e8'; g.lineWidth = 2.6; g.lineCap = 'round';
    for (const s of [-1, 1]) {
      g.beginPath(); g.moveTo(...P(0, 0)); g.lineTo(...P(s * 69.3, -69.3)); g.stroke();
    }
    // bases
    g.fillStyle = '#ffffff';
    for (const [bx, bz] of [[B, -B], [0, -2 * B], [-B, -B]]) { const [x, z] = P(bx, bz); g.save(); g.translate(x, z); g.rotate(45 * deg); g.fillRect(-3, -3, 6, 6); g.restore(); }
    g.fillRect(...P(-0.3, -18.5), 0.6 * sx, 0.3 * sz);   // rubber
    // subtle grain
    const img = g.getImageData(0, 0, N, N), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 10; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    g.putImageData(img, 0, 0);
  });
  tex.anisotropy = maxAniso;
  return tex;
}

function plateTexture() {
  // 8 x 8 m decal round home plate, high res
  return canvasTex(1024, 1024, (g, N) => {
    const s = N / 8, C = N / 2;
    const grd = g.createRadialGradient(C, C, 0, C, C, 4.2 * s);
    grd.addColorStop(0, '#c07a52'); grd.addColorStop(0.9, '#b8704a'); grd.addColorStop(1, 'rgba(184,112,74,0)');
    g.fillStyle = grd; g.fillRect(0, 0, N, N);
    for (let i = 0; i < 9000; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 3.9 * s;
      g.fillStyle = Math.random() < 0.5 ? 'rgba(90,45,25,0.18)' : 'rgba(255,220,180,0.12)';
      g.fillRect(C + Math.cos(a) * r, C + Math.sin(a) * r, 2, 2);
    }
    g.strokeStyle = 'rgba(250,248,240,0.92)'; g.lineWidth = 0.07 * s;
    // batter's boxes (x = world x, y = world z)
    for (const side of [-1, 1]) g.strokeRect(C + side * 0.45 * s - (side < 0 ? 1.22 * s : 0), C - 0.9 * s, 1.22 * s, 1.83 * s);
    g.strokeRect(C - 0.55 * s, C + 0.95 * s, 1.1 * s, 1.6 * s);      // catcher's box
    // plate: pentagon, point toward the catcher (+z)
    g.fillStyle = '#ffffff';
    g.beginPath();
    const w = 0.216 * s;
    g.moveTo(C - w, C - 0.1 * s); g.lineTo(C + w, C - 0.1 * s); g.lineTo(C + w, C + 0.1 * s); g.lineTo(C, C + 0.32 * s); g.lineTo(C - w, C + 0.1 * s);
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 3; g.stroke();
  });
}

// ---- crowd shader: instanced little people that jump when excited ---------
function crowdMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uExcite: { value: 0 }, uFogColor: { value: new THREE.Color(0x0b1028) } },
    vertexShader: `
      attribute float aPhase;
      uniform float uTime; uniform float uExcite;
      varying vec2 vUv; varying vec3 vCol; varying float vFog;
      void main() {
        vUv = uv;
        vCol = instanceColor;
        vec3 p = position;
        float jump = max(0.0, sin(uTime * (7.0 + aPhase * 3.0) + aPhase * 40.0));
        p.y += jump * uExcite * 0.55 + sin(uTime * 1.3 + aPhase * 20.0) * 0.04;
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
        vFog = smoothstep(120.0, 320.0, -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uFogColor;
      varying vec2 vUv; varying vec3 vCol; varying float vFog;
      void main() {
        vec2 u = vUv;
        float head = length((u - vec2(0.5, 0.8)) * vec2(1.0, 1.25));
        vec2 b = abs(u - vec2(0.5, 0.33)) - vec2(0.3, 0.3);
        float body = length(max(b, 0.0)) - 0.1;
        if (head > 0.17 && body > 0.0) discard;
        vec3 c = head < 0.17 ? vec3(0.95, 0.78, 0.62) * 0.75 : vCol;
        gl_FragColor = vec4(mix(c, uFogColor, vFog * 0.6), 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

function glowTexture() {
  return canvasTex(128, 128, (g, N) => {
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.15, 'rgba(255,250,230,0.85)');
    r.addColorStop(0.4, 'rgba(255,240,200,0.25)'); r.addColorStop(1, 'rgba(255,240,200,0)');
    g.fillStyle = r; g.fillRect(0, 0, N, N);
  });
}

export function buildPark(renderer) {
  const scene = new THREE.Scene();
  const fogCol = new THREE.Color(0x0b1028);
  scene.fog = new THREE.Fog(fogCol, 160, 420);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const glowTex = glowTexture();

  // sky dome: gradient + stars
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x050818) }, mid: { value: new THREE.Color(0x1b2a55) }, glow: { value: new THREE.Color(0x6a4a8a) } },
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 glow; varying vec3 vP;
      void main(){ float h = vP.y; vec3 c = mix(mid, top, smoothstep(0.05, 0.6, h));
        c = mix(c, glow, (1.0 - smoothstep(-0.02, 0.18, h)) * 0.7);
        gl_FragColor = vec4(c,1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), skyMat);
  scene.add(sky);
  {
    const n = 900, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, y = 0.12 + Math.random() * 0.88, r = Math.sqrt(1 - y * y);
      pos.set([Math.cos(a) * r * 850, y * 850, Math.sin(a) * r * 850], i * 3);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcfd8ff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.7 })));
  }

  // lights: soft fill + two banks from the light towers
  scene.add(new THREE.HemisphereLight(0x9fb4ff, 0x1d3a1d, 0.9));
  const key = new THREE.DirectionalLight(0xfff4e0, 2.2); key.position.set(-60, 90, 40); scene.add(key);
  const key2 = new THREE.DirectionalLight(0xe8eeff, 1.3); key2.position.set(70, 80, -60); scene.add(key2);
  const rim = new THREE.DirectionalLight(0xffffff, 0.8); rim.position.set(0, 40, -120); scene.add(rim);

  // field
  const field = new THREE.Mesh(new THREE.PlaneGeometry(FX1 - FX0, FZ1 - FZ0),
    new THREE.MeshStandardMaterial({ map: fieldTexture(maxAniso), roughness: 0.9, metalness: 0 }));
  field.rotation.x = -Math.PI / 2;
  field.position.set((FX0 + FX1) / 2, 0, (FZ0 + FZ1) / 2);
  scene.add(field);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(8, 8),
    new THREE.MeshStandardMaterial({ map: plateTexture(), transparent: true, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2 }));
  plate.rotation.x = -Math.PI / 2; plate.position.y = 0.01; scene.add(plate);
  // mound
  const mound = new THREE.Mesh(new THREE.SphereGeometry(2.8, 32, 12, 0, Math.PI * 2, 0, 0.5),
    new THREE.MeshStandardMaterial({ color: 0xb8704a, roughness: 0.95 }));
  mound.scale.y = 0.38 / (2.8 * (1 - Math.cos(0.5))); mound.position.set(0, -2.8 * Math.cos(0.5) * mound.scale.y, -18.4);
  scene.add(mound);

  // outfield wall: padded, with a yellow line on top
  {
    const A0 = -64, A1 = 64, seg = 128;
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= seg; i++) {
      const a = A0 + (A1 - A0) * i / seg, r = Math.abs(a) <= 45 ? fenceDist(a) : 98;
      const x = Math.sin(a * deg) * r, z = -Math.cos(a * deg) * r;
      pos.push(x, 0, z, x, WALL_H, z); uv.push(i / seg * 40, 0, i / seg * 40, 1);
      if (i < seg) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const padTex = canvasTex(256, 128, (c, w, h) => {
      c.fillStyle = '#123a5a'; c.fillRect(0, 0, w, h);
      c.fillStyle = 'rgba(255,255,255,0.05)'; for (let i = 0; i < w; i += 32) c.fillRect(i, 0, 2, h);
      c.fillStyle = '#ffcc33'; c.fillRect(0, 0, w, 7);
      c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, h - 10, w, 10);
    }, true);
    const wall = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: padTex, roughness: 0.55, side: THREE.DoubleSide }));
    wall.material.map.flipY = true;
    scene.add(wall);
    // distance markers
    for (const a of [-45, -25, 0, 25, 45]) {
      const r = fenceDist(a) - 0.05;
      const t = canvasTex(256, 128, (c) => {
        c.font = 'bold 84px Arial Black, Arial'; c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(String(Math.round(fenceDist(a))), 128, 70);
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), new THREE.MeshBasicMaterial({ map: t, transparent: true }));
      const W = (aa) => { const rr = fenceDist(aa); return new THREE.Vector3(Math.sin(aa * deg) * rr, 1.6, -Math.cos(aa * deg) * rr); };
      const p1 = W(a - 1), p2 = W(a + 1), tan = p2.clone().sub(p1).normalize();
      const nrm = new THREE.Vector3(-tan.z, 0, tan.x); if (nrm.dot(W(a)) > 0) nrm.negate();
      m.position.copy(W(a)).addScaledVector(nrm, 0.12);
      m.lookAt(m.position.clone().add(nrm));
      scene.add(m);
    }
    // foul poles
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xffd23a, emissive: 0x664400, roughness: 0.4 });
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 26, 12), poleMat);
      p.position.set(s * Math.sin(45 * deg) * 98.3, 13, -Math.cos(45 * deg) * 98.3); scene.add(p);
    }
  }

  // stands: a curved bowl behind the wall, upper deck facade + roof lip
  const crowdMat = crowdMaterial();
  {
    const A0 = -66, A1 = 66, seg = 132, rows = 24;
    const pos = [], col = [], idx = [];
    const H = (a, r) => standHeight(Math.max(-45, Math.min(45, a)), r);
    for (let i = 0; i <= seg; i++) {
      const a = A0 + (A1 - A0) * i / seg, R = (Math.abs(a) <= 45 ? fenceDist(a) : 98) + 3;
      for (let j = 0; j <= rows; j++) {
        const r = R + j * (46 / rows);
        const h = j === 0 ? 0 : Math.min(1.2 + (r - R) * 0.55, 26);
        pos.push(Math.sin(a * deg) * r, h, -Math.cos(a * deg) * r);
        const shade = j % 2 ? 0.75 : 0.9;
        col.push(0.09 * shade, 0.12 * shade, 0.26 * shade);
        if (i < seg && j < rows) {
          const k = i * (rows + 1) + j;
          idx.push(k, k + rows + 1, k + 1, k + 1, k + rows + 1, k + rows + 2);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    scene.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide })));
    // the front face of the stands (the gap between wall and first row) - a low dark wall
    // roof lip + glowing ribbon board along the top
    const rib = [], ribIdx = [], ribUv = [];
    for (let i = 0; i <= seg; i++) {
      const a = A0 + (A1 - A0) * i / seg, R = (Math.abs(a) <= 45 ? fenceDist(a) : 98) + 3 + 46;
      const x = Math.sin(a * deg) * R, z = -Math.cos(a * deg) * R;
      rib.push(x, 26, z, x, 31, z); ribUv.push(i / seg * 12, 0, i / seg * 12, 1);
      if (i < seg) { const k = i * 2; ribIdx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(rib, 3));
    rg.setAttribute('uv', new THREE.Float32BufferAttribute(ribUv, 2));
    rg.setIndex(ribIdx); rg.computeVertexNormals();
    const ribTex = canvasTex(512, 64, (c, w, h) => {
      const gr = c.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, '#ff3d7f'); gr.addColorStop(0.5, '#ffb03a'); gr.addColorStop(1, '#3ad6ff');
      c.fillStyle = '#0a0f26'; c.fillRect(0, 0, w, h);
      c.fillStyle = gr; c.fillRect(0, 18, w, 26);
      c.font = 'bold 22px Arial Black, Arial'; c.fillStyle = '#0a0f26'; c.textBaseline = 'middle';
      // fit a whole number of copies so the words never overlap or get cut at the seam
      const word = 'MOONSHOT SLUGGER  ★  ';
      const n = Math.max(1, Math.floor(w / c.measureText(word).width));
      c.save(); c.scale(w / (n * c.measureText(word).width), 1);
      for (let i = 0; i < n; i++) c.fillText(word, i * c.measureText(word).width, 32);
      c.restore();
    }, true);
    const ribbon = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ map: ribTex, side: THREE.DoubleSide }));
    scene.add(ribbon);

    // crowd
    // phones get ~55% of the people, a bit bigger: same full look, about half the fill cost
    const lite = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    const seats = [], aStep = lite ? 0.62 : 0.42, gap = lite ? 0.2 : 0.12, big = lite ? 1.15 : 1;
    for (let a = A0 + 1; a <= A1 - 1; a += aStep) {
      const R = (Math.abs(a) <= 45 ? fenceDist(a) : 98) + 3;
      for (let j = 0; j < 44; j += 1) {
        if (Math.random() < gap) continue;
        const r = R + 1.2 + j + Math.random() * 0.3;
        const aa = a + (Math.random() - 0.5) * 0.3;
        seats.push([aa, r, H(aa, r)]);
      }
    }
    const geo = new THREE.PlaneGeometry(0.62, 0.95); geo.translate(0, 0.47, 0);
    const crowd = new THREE.InstancedMesh(geo, crowdMat, seats.length);
    const phase = new Float32Array(seats.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    const shirt = [0xe8e8f0, 0x2b59c3, 0xd8343c, 0xffc83a, 0x1d1d2a, 0x3cb371, 0xff7f3a, 0x9b59b6, 0xf0f0f0, 0x203a74];
    const c = new THREE.Color();
    seats.forEach(([a, r, h], i) => {
      const x = Math.sin(a * deg) * r, z = -Math.cos(a * deg) * r;
      p.set(x, h, z);
      e.set(0, Math.atan2(-x, -z), 0); q.setFromEuler(e);
      const k = (0.9 + Math.random() * 0.3) * big; s.set(k, k, k);
      m.compose(p, q, s); crowd.setMatrixAt(i, m);
      c.setHex(shirt[(Math.random() * shirt.length) | 0]).multiplyScalar(0.55 + Math.random() * 0.35);
      crowd.setColorAt(i, c);
      phase[i] = Math.random();
    });
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    crowd.frustumCulled = false;
    scene.add(crowd);
  }

  // light towers: tall poles with a bank of lamps + big glow sprites
  const glows = [];
  {
    const towerMat = new THREE.MeshStandardMaterial({ color: 0x3a4466, roughness: 0.5, metalness: 0.6 });
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xfffbea });
    for (const a of [-58, -30, 30, 58, -8, 12]) {
      const r = (Math.abs(a) <= 45 ? fenceDist(a) : 98) + 52;
      const x = Math.sin(a * deg) * r, z = -Math.cos(a * deg) * r;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.1, 58, 10), towerMat);
      pole.position.set(x, 29, z); scene.add(pole);
      const bank = new THREE.Group();
      const frame = new THREE.Mesh(new THREE.BoxGeometry(14, 7, 1), towerMat); bank.add(frame);
      for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) {
        const l = new THREE.Mesh(new THREE.CircleGeometry(0.9, 16), lampMat);
        l.position.set(-5.6 + i * 2.8, -2.2 + j * 2.2, 0.55); bank.add(l);
      }
      bank.position.set(x, 60, z); bank.lookAt(0, 0, -10); scene.add(bank);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff1d0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      sp.position.set(x, 60, z).addScaledVector(new THREE.Vector3(-x, -60, -10 - z).normalize(), 2);
      sp.scale.set(70, 70, 1); scene.add(sp); glows.push(sp);
    }
  }

  // scoreboard in centre field
  const sbCanvas = document.createElement('canvas'); sbCanvas.width = 1024; sbCanvas.height = 512;
  const sbTex = new THREE.CanvasTexture(sbCanvas); sbTex.colorSpace = THREE.SRGBColorSpace;
  {
    const a = -14, r = 190;
    const x = Math.sin(a * deg) * r, z = -Math.cos(a * deg) * r;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(46, 26, 2), new THREE.MeshStandardMaterial({ color: 0x1a2040, roughness: 0.5, metalness: 0.4 }));
    frame.position.set(x, 40, z); frame.lookAt(0, 40, 0); scene.add(frame);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(43, 21.5), new THREE.MeshBasicMaterial({ map: sbTex, fog: false }));
    screen.position.copy(frame.position).addScaledVector(new THREE.Vector3(-x, 0, -z).normalize(), 1.05);
    screen.lookAt(0, 40, 0); scene.add(screen);
    const legs = new THREE.Mesh(new THREE.BoxGeometry(4, 28, 4), frame.material);
    legs.position.set(x, 14, z); scene.add(legs);
  }
  function drawScoreboard(info) {
    const g = sbCanvas.getContext('2d'), W = 1024, H = 512;
    g.fillStyle = '#06091a'; g.fillRect(0, 0, W, H);
    // LED dot texture
    g.fillStyle = 'rgba(255,255,255,0.03)';
    for (let y = 0; y < H; y += 8) g.fillRect(0, y, W, 1);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (info.big) {
      g.font = 'bold 150px Arial Black, Arial';
      g.fillStyle = info.bigCol || '#ffd23a';
      g.fillText(info.big, W / 2, 210);
      g.font = 'bold 70px Arial Black, Arial'; g.fillStyle = '#fff';
      g.fillText(info.sub || '', W / 2, 380);
    } else {
      g.font = 'bold 64px Arial Black, Arial'; g.fillStyle = '#3ad6ff';
      g.fillText(info.title || 'MOONSHOT', W / 2, 80);
      g.font = 'bold 44px Arial Black, Arial'; g.fillStyle = '#9aa6d8';
      g.fillText('HR', W * 0.25, 190); g.fillText('OUTS', W * 0.5, 190); g.fillText('SCORE', W * 0.75, 190);
      g.font = 'bold 130px Arial Black, Arial'; g.fillStyle = '#ffd23a';
      g.fillText(String(info.hr ?? 0), W * 0.25, 320);
      g.fillStyle = '#ff5a6a'; g.fillText(String(info.outs ?? 0), W * 0.5, 320);
      g.fillStyle = '#ffffff'; g.font = 'bold 96px Arial Black, Arial'; g.fillText(String(info.score ?? 0), W * 0.75, 320);
      g.font = 'bold 40px Arial Black, Arial'; g.fillStyle = '#9aa6d8';
      g.fillText(info.foot || '', W / 2, 450);
    }
    sbTex.needsUpdate = true;
  }
  drawScoreboard({ title: 'MOONSHOT', foot: 'TONIGHT UNDER THE LIGHTS' });

  // environment map for glossy highlights on the players and ball
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 16, 8), new THREE.MeshBasicMaterial({ color: 0x1b2448, side: THREE.BackSide })));
  const lampBox = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const a of [0, 60, 120, 180, 240, 300]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 1), lampBox);
    b.position.set(Math.cos(a * deg) * 40, 25, Math.sin(a * deg) * 40); b.lookAt(0, 0, 0); envScene.add(b);
  }
  const grassDisc = new THREE.Mesh(new THREE.CircleGeometry(45, 24), new THREE.MeshBasicMaterial({ color: 0x1d5a26 }));
  grassDisc.rotation.x = -Math.PI / 2; grassDisc.position.y = -10; envScene.add(grassDisc);
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(envScene, 0.02).texture;
  scene.environmentIntensity = 0.6;

  return { scene, skyMat, crowdMat, glows, drawScoreboard, glowTex };
}
