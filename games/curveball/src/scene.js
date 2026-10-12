// The floodlit stadium, the goal, the players and every visual effect.
// Physics lives in physics.js; this file only draws what the world says.
import * as THREE from '../vendor/three.module.js';
import { R, GW, GH, NET_D, POST_R, keeperSeg } from './physics.js';

const TAU = Math.PI * 2;

function canvasTex(w, h, draw, opts = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = opts.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(opts.repeat[0], opts.repeat[1]); }
  return t;
}

export class Stage {
  constructor(canvas) {
    const lowEnd = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    this.lowEnd = lowEnd;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowEnd ? 1.6 : 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x0b1630, 70, 190);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
    this.clock = 0;
    this.uniforms = { uTime: { value: 0 }, uHype: { value: 0 } };
    this.buildSky();
    this.buildLights();
    this.buildPitch();
    this.buildGoal();
    this.buildStands();
    this.buildFloodlights();
    this.buildBoards();
    this.buildBall();
    this.buildPlayers();
    this.buildTargets();
    this.buildFx();
    this.shake = 0;
  }

  // ------------------------------------------------------------ environment
  buildSky() {
    const g = new THREE.SphereGeometry(300, 32, 16);
    const m = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {},
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `varying vec3 vP;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
        void main(){
          float y = vP.y;
          vec3 top = vec3(0.012,0.02,0.07), mid = vec3(0.05,0.08,0.2), hor = vec3(0.16,0.17,0.32);
          vec3 c = mix(hor, mid, smoothstep(0.0, 0.18, y));
          c = mix(c, top, smoothstep(0.18, 0.7, y));
          vec2 sp = floor(vP.xz / max(0.2, y) * 160.0);
          float s = step(0.997, h(sp)) * smoothstep(0.2, 0.5, y);
          c += s * 0.6;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.scene.add(new THREE.Mesh(g, m));
  }

  buildLights() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0xb9d4ff, 0x1d3a1a, 0.9));
    const key = this.key = new THREE.DirectionalLight(0xfff4e6, 2.6);
    key.position.set(-18, 34, 30);
    key.target.position.set(0, 0, 10);
    key.castShadow = true;
    key.shadow.mapSize.set(this.lowEnd ? 1024 : 2048, this.lowEnd ? 1024 : 2048);
    const sc = key.shadow.camera; sc.left = -22; sc.right = 22; sc.top = 26; sc.bottom = -26; sc.near = 5; sc.far = 90;
    key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
    s.add(key, key.target);
    const fill = new THREE.DirectionalLight(0xcfe0ff, 0.9);
    fill.position.set(24, 26, 20); s.add(fill);
    const back = new THREE.DirectionalLight(0xffffff, 0.7);
    back.position.set(0, 20, -40); s.add(back);
  }

  buildPitch() {
    // canvas covers x [-40, 40], z [-12, 68]; 25.6 px per metre
    const S = 2048, M = 80, ppm = S / M;
    const X = (x) => (x + 40) * ppm, Z = (z) => (z + 12) * ppm;
    const tex = canvasTex(S, S, (g) => {
      for (let i = 0; i < 16; i++) {
        g.fillStyle = i % 2 ? '#2f8a3a' : '#38a043';
        g.fillRect(0, Z(-12 + i * 5.5), S, 5.5 * ppm + 1);
      }
      // fine grain
      const img = g.getImageData(0, 0, S, S), d = img.data;
      for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 14; d[i] += n; d[i + 1] += n * 1.2; d[i + 2] += n * 0.6; }
      g.putImageData(img, 0, 0);
      g.strokeStyle = 'rgba(250,250,245,0.92)'; g.lineWidth = 0.12 * ppm; g.lineCap = 'round';
      const line = (pts) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(X(p[0]), Z(p[1])) : g.moveTo(X(p[0]), Z(p[1])))); g.stroke(); };
      line([[-34, 0], [34, 0]]);
      line([[-34, 0], [-34, 68]]); line([[34, 0], [34, 68]]);
      line([[-20.16, 0], [-20.16, 16.5], [20.16, 16.5], [20.16, 0]]);
      line([[-9.16, 0], [-9.16, 5.5], [9.16, 5.5], [9.16, 0]]);
      g.fillStyle = 'rgba(250,250,245,0.95)';
      g.beginPath(); g.arc(X(0), Z(11), 0.18 * ppm, 0, TAU); g.fill();
      g.beginPath();
      const a = Math.acos(5.5 / 9.15);
      g.arc(X(0), Z(11), 9.15 * ppm, Math.PI / 2 - a, Math.PI / 2 + a); g.stroke();
      // corner arcs
      g.beginPath(); g.arc(X(-34), Z(0), 1 * ppm, 0, Math.PI / 2); g.stroke();
      g.beginPath(); g.arc(X(34), Z(0), 1 * ppm, Math.PI / 2, Math.PI); g.stroke();
      line([[-34, 52.5], [34, 52.5]]);
      g.beginPath(); g.arc(X(0), Z(52.5), 9.15 * ppm, 0, TAU); g.stroke();
    });
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const pitch = new THREE.Mesh(new THREE.PlaneGeometry(M, M), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.82, metalness: 0 }));
    pitch.rotation.x = -Math.PI / 2; pitch.position.set(0, 0, 28);
    pitch.receiveShadow = true;
    this.scene.add(pitch);
    const around = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x1c4a24, roughness: 1 }));
    around.rotation.x = -Math.PI / 2; around.position.y = -0.02; this.scene.add(around);
    // grass blades near the ball: subtle tufts as instanced crossed quads
  }

  buildGoal() {
    const grp = this.goal = new THREE.Group();
    const white = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 });
    const post = new THREE.CylinderGeometry(POST_R, POST_R, GH + POST_R * 2, 24);
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(post, white); m.position.set(s * (GW + POST_R), (GH + POST_R * 2) / 2, 0); m.castShadow = true; grp.add(m);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(POST_R, POST_R, GW * 2 + POST_R * 4, 24), white);
    bar.rotation.z = Math.PI / 2; bar.position.set(0, GH + POST_R, 0); bar.castShadow = true; grp.add(bar);
    // rear frame
    const grey = new THREE.MeshStandardMaterial({ color: 0xd8dde4, roughness: 0.4, metalness: 0.3 });
    const thin = 0.03;
    const tube = (a, b) => {
      const d = new THREE.Vector3().subVectors(b, a); const L = d.length();
      const m = new THREE.Mesh(new THREE.CylinderGeometry(thin, thin, L, 10), grey);
      m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); grp.add(m);
    };
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    for (const s of [-1, 1]) { tube(V(s * GW, GH, 0), V(s * GW, GH, -NET_D)); tube(V(s * GW, GH, -NET_D), V(s * GW, 0, -NET_D)); tube(V(s * GW, 0, 0), V(s * GW, 0, -NET_D)); }
    tube(V(-GW, GH, -NET_D), V(GW, GH, -NET_D)); tube(V(-GW, 0, -NET_D), V(GW, 0, -NET_D));
    // net
    const netTex = canvasTex(128, 128, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = 7;
      g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w / 2, 0); g.lineTo(w, h / 2); g.lineTo(w / 2, h); g.closePath(); g.stroke();
    }, { repeat: [1, 1] });
    netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping;
    const netMat = (rx, ry) => {
      const t = netTex.clone(); t.needsUpdate = true; t.repeat.set(rx, ry);
      return new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.7, color: 0xf2f4f8 });
    };
    const D = 0.16; // mesh hole size in metres
    const back = new THREE.PlaneGeometry(GW * 2, GH, 36, 14);
    this.netBack = new THREE.Mesh(back, netMat(GW * 2 / D, GH / D));
    this.netBack.position.set(0, GH / 2, -NET_D); this.netBack.castShadow = true; grp.add(this.netBack);
    this.netBase = back.attributes.position.array.slice();
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(GW * 2, NET_D), netMat(GW * 2 / D, NET_D / D));
    roof.rotation.x = Math.PI / 2; roof.position.set(0, GH, -NET_D / 2); grp.add(roof);
    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(NET_D, GH), netMat(NET_D / D, GH / D));
      side.rotation.y = Math.PI / 2; side.position.set(s * GW, GH / 2, -NET_D / 2); grp.add(side);
    }
    this.netPulse = null;
    this.scene.add(grp);
  }

  buildStands() {
    // tiered concrete + seats, with a billboard crowd that bobs in a shader
    const tierMat = new THREE.MeshStandardMaterial({ color: 0x1b2440, roughness: 0.8 });
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x24345f, roughness: 0.6 });
    const rows = 16, rowH = 0.75, rowD = 1.05;
    const stands = [
      { cx: 0, cz: -9, w: 96, rot: 0 },            // behind the goal
      { cx: -40, cz: 30, w: 84, rot: Math.PI / 2 }, // left side
      { cx: 40, cz: 30, w: 84, rot: -Math.PI / 2 }, // right side
    ];
    const people = [];
    for (const st of stands) {
      const g = new THREE.Group(); g.position.set(st.cx, 0, st.cz); g.rotation.y = st.rot;
      for (let i = 0; i < rows; i++) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(st.w, rowH * (i + 1) + 1.2, rowD), i % 2 ? tierMat : seatMat);
        step.position.set(0, (rowH * (i + 1) + 1.2) / 2, -i * rowD - 1.5);
        g.add(step);
        for (let x = -st.w / 2 + 0.4; x < st.w / 2; x += 0.62) {
          if (Math.random() < 0.08) continue;
          const p = new THREE.Vector3(x + (Math.random() - 0.5) * 0.1, rowH * (i + 1) + 1.2 + 0.32, -i * rowD - 1.4);
          p.applyAxisAngle(new THREE.Vector3(0, 1, 0), st.rot).add(new THREE.Vector3(st.cx, 0, st.cz));
          people.push([p, st.rot]);
        }
      }
      // back wall + roof canopy with a light strip
      const wall = new THREE.Mesh(new THREE.BoxGeometry(st.w + 2, rows * rowH + 10, 1), tierMat);
      wall.position.set(0, (rows * rowH + 10) / 2, -rows * rowD - 2.2); g.add(wall);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(st.w + 4, 0.6, rows * rowD * 0.75), new THREE.MeshStandardMaterial({ color: 0x24305a, roughness: 0.6, emissive: 0x141c38 }));
      roof.position.set(0, rows * rowH + 9, -rows * rowD * 0.62); g.add(roof);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(st.w + 4, 0.25, 0.25), new THREE.MeshBasicMaterial({ color: 0xdfe8ff }));
      strip.position.set(0, rows * rowH + 8.6, -rows * rowD * 0.62 + rows * rowD * 0.375); g.add(strip);
      this.scene.add(g);
    }
    // crowd billboards
    const tex = canvasTex(64, 64, (g) => {
      g.clearRect(0, 0, 64, 64); g.fillStyle = '#fff';
      g.beginPath(); g.arc(32, 18, 11, 0, TAU); g.fill();
      g.beginPath(); g.moveTo(10, 64); g.quadraticCurveTo(10, 32, 32, 31); g.quadraticCurveTo(54, 32, 54, 64); g.fill();
    });
    const geo = new THREE.PlaneGeometry(0.62, 0.62);
    const N = people.length;
    const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, roughness: 0.9, side: THREE.DoubleSide });
    const U = this.uniforms;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = U.uTime; sh.uniforms.uHype = U.uHype;
      sh.vertexShader = 'uniform float uTime; uniform float uHype; attribute float aPhase;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        `#include <begin_vertex>
         float bob = sin(uTime * (2.0 + aPhase * 3.0) + aPhase * 40.0);
         transformed.y += (0.04 + uHype * 0.5 * step(0.35, aPhase)) * max(bob, -0.3);`);
    };
    const crowd = this.crowd = new THREE.InstancedMesh(geo, mat, N);
    const phase = new Float32Array(N);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), col = new THREE.Color();
    const palette = [0xe8463b, 0xf2f2f2, 0x2a64d6, 0xffc53a, 0xe8463b, 0x2a64d6, 0x1a1a1a, 0xf07a2a];
    for (let i = 0; i < N; i++) {
      const [p, rot] = people[i];
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
      const s = 0.9 + Math.random() * 0.25; sc.set(s, s, s);
      m4.compose(p, q, sc); crowd.setMatrixAt(i, m4);
      col.setHex(palette[(Math.random() * palette.length) | 0]).multiplyScalar(0.55 + Math.random() * 0.45);
      crowd.setColorAt(i, col);
      phase[i] = Math.random();
    }
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    this.scene.add(crowd);
    // camera flashes
    this.flashes = [];
    const fgeo = new THREE.PlaneGeometry(0.5, 0.5);
    const fmat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 24; i++) {
      const f = new THREE.Mesh(fgeo, fmat.clone()); f.visible = false; this.scene.add(f);
      this.flashes.push({ m: f, t: 0, pos: people[(Math.random() * N) | 0][0] });
    }
    this.people = people;
  }

  buildFloodlights() {
    const glowTex = canvasTex(128, 128, (g) => {
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.15, 'rgba(255,250,235,0.85)');
      gr.addColorStop(0.4, 'rgba(255,240,210,0.22)'); gr.addColorStop(1, 'rgba(255,240,210,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    });
    this.glowTex = glowTex;
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a4256, roughness: 0.5, metalness: 0.6 });
    const panelTex = canvasTex(256, 128, (g) => {
      g.fillStyle = '#20263a'; g.fillRect(0, 0, 256, 128);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 8; x++) {
        const gr = g.createRadialGradient(16 + x * 32, 16 + y * 32, 0, 16 + x * 32, 16 + y * 32, 14);
        gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.6, '#fff4d6'); gr.addColorStop(1, '#b8a070');
        g.fillStyle = gr; g.beginPath(); g.arc(16 + x * 32, 16 + y * 32, 12, 0, TAU); g.fill();
      }
    });
    for (const [x, z] of [[-46, -16], [46, -16], [-46, 70], [46, 70]]) {
      const h = 42;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, h, 16), poleMat);
      pole.position.set(x, h / 2, z); this.scene.add(pole);
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(10, 5), new THREE.MeshBasicMaterial({ map: panelTex, fog: false }));
      panel.position.set(x * 0.97, h + 2, z);
      panel.lookAt(0, 0, 20); this.scene.add(panel);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff1d8, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      glow.scale.set(34, 34, 1); glow.position.copy(panel.position); this.scene.add(glow);
    }
  }

  buildBoards() {
    const msgs = ['CURVEBALL', 'BEND IT', 'PLAYPILE', 'TOP BINS', 'NET BUSTER', 'FREE KICK FC'];
    const tex = canvasTex(2048, 64, (g, w, h) => {
      const cols = ['#ff3d5a', '#1f6bff', '#ffcc29', '#11c48a', '#ff7a1a', '#9b5cff'];
      const seg = w / msgs.length;
      msgs.forEach((m, i) => {
        g.fillStyle = cols[i]; g.fillRect(i * seg, 0, seg, h);
        g.fillStyle = '#fff'; g.font = 'bold 40px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(m, i * seg + seg / 2, h / 2 + 2);
      });
    }, { repeat: [3, 1] });
    tex.wrapS = THREE.RepeatWrapping;
    this.boardTex = tex;
    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    const b = new THREE.Mesh(new THREE.BoxGeometry(70, 0.9, 0.2), mat);
    b.position.set(0, 0.45, -5); this.scene.add(b);
    for (const s of [-1, 1]) {
      const sb = new THREE.Mesh(new THREE.BoxGeometry(60, 0.9, 0.2), mat);
      sb.rotation.y = Math.PI / 2; sb.position.set(s * 36.5, 0.45, 28); this.scene.add(sb);
    }
  }

  buildBall() {
    // original panel pattern drawn straight onto an equirectangular map
    const tex = canvasTex(512, 256, (g, w, h) => {
      const img = g.createImageData(w, h), d = img.data;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const lon = x / w * TAU, lat = (y / h - 0.5) * Math.PI;
        const v = [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)];
        // six swooshes around the cube axes
        let c = [246, 247, 250];
        const axes = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
        for (let i = 0; i < 6; i++) {
          const a = axes[i];
          const dot = v[0] * a[0] + v[1] * a[1] + v[2] * a[2];
          const tw = Math.atan2(v[(i + 1) % 3 === 0 ? 1 : 2], v[(i + 2) % 3 === 0 ? 1 : 0]);
          const band = dot + 0.12 * Math.sin(tw * 3);
          if (band > 0.82) c = i % 2 ? [20, 34, 72] : [255, 74, 74];
          else if (band > 0.78) c = [255, 205, 60];
        }
        const k = (y * w + x) * 4; d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    });
    const mat = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08 });
    const ball = this.ball = new THREE.Mesh(new THREE.SphereGeometry(R, 48, 32), mat);
    ball.castShadow = true; this.scene.add(ball);
    // contact shadow blob (helps read height)
    const blobTex = canvasTex(64, 64, (g) => {
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    });
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
    this.blob.rotation.x = -Math.PI / 2; this.scene.add(this.blob);
    // trail ribbon
    const TN = 40;
    this.trailN = TN; this.trailPts = [];
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TN * 2 * 3), 3));
    tg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TN * 2 * 3), 3));
    const idx = [];
    for (let i = 0; i < TN - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    tg.setIndex(idx);
    this.trail = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    this.trail.frustumCulled = false; this.scene.add(this.trail);
    this.ballGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: null, color: 0xfff2c8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.ballGlow.scale.set(0.9, 0.9, 1); this.scene.add(this.ballGlow);
    // aim marker ring under the ball
    this.spot = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.26, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }));
    this.spot.rotation.x = -Math.PI / 2; this.scene.add(this.spot);
  }

  // ------------------------------------------------------------ players
  figure(shirt, shorts, socks, skin, hair, keeper = false) {
    const M = (c, r = 0.45) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
    const mShirt = M(shirt, 0.4), mShorts = M(shorts, 0.5), mSock = M(socks, 0.5), mSkin = M(skin, 0.55), mHair = M(hair, 0.7), mBoot = M(0x111111, 0.3);
    const root = new THREE.Group();
    const cap = (r, l, m) => { const x = new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 6, 16), m); x.castShadow = true; return x; };
    const legs = [];
    for (const s of [-1, 1]) {
      const leg = new THREE.Group(); leg.position.set(s * 0.11, 0.92, 0);
      const thigh = cap(0.085, 0.32, mShorts); thigh.position.y = -0.2; leg.add(thigh);
      const shin = cap(0.07, 0.36, mSock); shin.position.y = -0.58; leg.add(shin);
      const boot = cap(0.06, 0.12, mBoot); boot.rotation.x = Math.PI / 2; boot.position.set(0, -0.86, 0.05); leg.add(boot);
      root.add(leg); legs.push(leg);
    }
    const torso = cap(0.19, 0.42, mShirt); torso.position.y = 1.2; torso.scale.set(1, 1, 0.72); root.add(torso);
    const neck = cap(0.06, 0.06, mSkin); neck.position.y = 1.52; root.add(neck);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 24, 16), mSkin); head.position.y = 1.66; head.scale.set(1, 1.1, 1); head.castShadow = true; root.add(head);
    const hairM = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 12, 0, TAU, 0, Math.PI * 0.55), mHair); hairM.position.y = 1.68; hairM.rotation.x = -0.25; root.add(hairM);
    const arms = [];
    for (const s of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(s * 0.25, 1.43, 0);
      const up = cap(0.055, 0.26, mShirt); up.position.y = -0.17; sh.add(up);
      const fore = cap(0.048, 0.24, keeper ? mShirt : mSkin); fore.position.y = -0.44; sh.add(fore);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(keeper ? 0.085 : 0.05, 16, 12), keeper ? M(0xf6f7fb, 0.35) : mSkin); hand.position.y = -0.6; hand.castShadow = true; sh.add(hand);
      root.add(sh); arms.push(sh);
    }
    root.userData = { legs, arms, torso };
    return root;
  }

  buildPlayers() {
    this.wallMen = [];
    for (let i = 0; i < 6; i++) {
      const f = this.figure(0x1f6bff, 0xffffff, 0x1f6bff, [0xe0b08a, 0x8d5a3b, 0xc68d62, 0x5a3a26][i % 4], [0x1b1410, 0x3b2a1a, 0x101010][i % 3]);
      // arms crossed low, protective
      f.userData.arms.forEach((a, k) => { a.rotation.z = (k ? 1 : -1) * -0.35; a.rotation.x = -0.35; });
      f.visible = false; this.scene.add(f); this.wallMen.push(f);
    }
    const k = this.keeper = new THREE.Group();
    const body = this.keeperBody = this.figure(0xffd21f, 0x1b1b1b, 0xffd21f, 0xd7a47c, 0x2a1d14, true);
    k.add(body); k.visible = false; this.scene.add(k);
  }

  buildTargets() {
    this.targetObjs = [];
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd23a, toneMapped: false, transparent: true });
    const discTex = canvasTex(128, 128, (g) => {
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,220,90,0.05)'); gr.addColorStop(0.75, 'rgba(255,210,60,0.35)'); gr.addColorStop(1, 'rgba(255,210,60,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    });
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 12, 48), ringMat.clone());
      const disc = new THREE.Mesh(new THREE.CircleGeometry(1.3, 40), new THREE.MeshBasicMaterial({ map: discTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      g.add(disc, ring);
      const lab = this.textSprite('+150', '#fff');
      lab.position.set(0, 0, 0.02); g.add(lab);
      g.userData = { ring, disc, lab, pts: 0 };
      g.visible = false; this.scene.add(g); this.targetObjs.push(g);
    }
  }

  textSprite(text, color) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }));
    s.userData.set = (txt) => {
      const g = c.getContext('2d'); g.clearRect(0, 0, 256, 128);
      g.font = '900 72px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 10; g.strokeStyle = 'rgba(0,0,0,0.55)'; g.strokeText(txt, 128, 66);
      g.fillStyle = color; g.fillText(txt, 128, 66); t.needsUpdate = true;
    };
    s.userData.set(text);
    return s;
  }

  buildFx() {
    // confetti / sparks: one instanced mesh, simple CPU particles
    const N = 600;
    this.pN = N; this.parts = [];
    const geo = new THREE.PlaneGeometry(1, 0.5);
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false });
    this.pMesh = new THREE.InstancedMesh(geo, mat, N);
    this.pMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pMesh.frustumCulled = false;
    const col = new THREE.Color(1, 1, 1);
    for (let i = 0; i < N; i++) this.pMesh.setColorAt(i, col);
    this.scene.add(this.pMesh);
    // glow sprite for kicks and hits
    this.pop = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.pop.visible = false; this.scene.add(this.pop); this.popT = 0;
  }

  burst(pos, n, colors, opts = {}) {
    for (let i = 0; i < n; i++) {
      if (this.parts.length >= this.pN) this.parts.shift();
      const sp = (opts.speed || 6) * (0.4 + Math.random() * 0.8);
      const th = Math.random() * TAU, ph = Math.acos(Math.random() * 2 - 1);
      const dir = opts.dir;
      let v = [Math.sin(ph) * Math.cos(th) * sp, Math.abs(Math.cos(ph)) * sp * (opts.up || 1), Math.sin(ph) * Math.sin(th) * sp];
      if (dir) v = [v[0] * 0.5 + dir[0], v[1] * 0.5 + dir[1], v[2] * 0.5 + dir[2]];
      this.parts.push({
        p: [pos[0], pos[1], pos[2]], v, life: (opts.life || 1.6) * (0.6 + Math.random() * 0.6), age: 0,
        size: (opts.size || 0.08) * (0.6 + Math.random() * 0.8), col: new THREE.Color(colors[(Math.random() * colors.length) | 0]),
        rot: Math.random() * TAU, spin: (Math.random() - 0.5) * 16, drag: opts.drag ?? 1.2, g: opts.g ?? 6, flutter: opts.flutter || 0,
      });
    }
  }

  flash(pos, size = 1.5) { this.pop.position.set(pos[0], pos[1], pos[2]); this.pop.scale.set(size, size, 1); this.popT = 0.18; this.popSize = size; this.pop.visible = true; }

  // ------------------------------------------------------------ per level
  setLevel(setup, world) {
    this.setup = setup;
    this.wallMen.forEach((f, i) => { f.visible = i < world.wall.length; });
    this.keeper.visible = !!world.keeper;
    const tg = setup.targets || [];
    this.targetObjs.forEach((g, i) => {
      const t = tg[i]; g.visible = !!t;
      if (!t) return;
      g.position.set(t.x, t.y, 0.03);
      g.scale.setScalar(t.r);
      g.userData.lab.scale.set(0.9 / t.r * 0.9, 0.45 / t.r * 0.9, 1);
      g.userData.lab.userData.set('+' + t.pts);
      g.userData.hit = 0;
    });
    this.trailPts.length = 0;
    this.netPulse = null;
    this.resetNet();
  }

  resetNet() {
    const a = this.netBack.geometry.attributes.position;
    a.array.set(this.netBase); a.needsUpdate = true;
  }

  hitTarget(i) {
    const g = this.targetObjs[i]; if (!g) return;
    g.userData.hit = 1;
    this.burst([g.position.x, g.position.y, 0.1], 70, ['#ffd23a', '#ffffff', '#ff9a2a'], { speed: 5, size: 0.07, life: 1.0, g: 3, drag: 2 });
  }

  // ------------------------------------------------------------ frame
  sync(w, dt, tReal) {
    this.clock += dt;
    this.uniforms.uTime.value = tReal;
    this.uniforms.uHype.value = Math.max(0, this.uniforms.uHype.value - dt * 0.35);
    const b = w.ball;
    this.ball.position.set(b.p[0], b.p[1], b.p[2]);
    if (w.kicked) {
      const sp = Math.hypot(b.v[0], b.v[1], b.v[2]);
      this.ball.rotation.x -= dt * sp / R * 0.5;
      this.ball.rotation.y += dt * b.spin[1] * 1.5;
    }
    if (!this.ballGlow.material.map) { this.ballGlow.material.map = this.glowTex; this.ballGlow.material.needsUpdate = true; }
    this.ballGlow.position.copy(this.ball.position);
    this.ballGlow.material.opacity = w.kicked && !w.result ? 0.55 : Math.max(0, this.ballGlow.material.opacity - dt * 2);
    this.blob.position.set(b.p[0], 0.012, b.p[2]);
    const hb = Math.max(0, b.p[1] - R);
    this.blob.scale.setScalar(1 + hb * 0.3); this.blob.material.opacity = Math.max(0, 1 - hb * 0.5);
    this.spot.visible = !w.kicked; this.spot.position.set(w.start[0], 0.015, w.start[2]);
    this.spot.material.opacity = 0.35 + 0.25 * Math.sin(tReal * 5);
    // trail
    const tp = this.trailPts;
    if (w.kicked && !w.result) { tp.push([b.p[0], b.p[1], b.p[2]]); if (tp.length > this.trailN) tp.shift(); }
    else if (tp.length) tp.shift();
    this.updateTrail(w);
    // wall
    w.wall.forEach((d, i) => {
      const f = this.wallMen[i];
      f.position.set(d.x, d.y, d.z);
      f.rotation.y = Math.atan2(w.start[0] - d.x, w.start[2] - d.z);
      const j = d.y / 0.42;
      f.userData.legs.forEach((l, k) => { l.rotation.x = -j * 0.5 * (k ? 1 : 0.7); });
      f.userData.arms.forEach((a, k) => { a.rotation.z = (k ? 1 : -1) * (-0.35 + j * 0.25); });
    });
    // keeper
    const k = w.keeper;
    if (k) {
      const [a] = keeperSeg(k);
      this.keeper.position.set(a[0], a[1] - 0.12, a[2]);
      this.keeper.rotation.set(0, 0, -k.theta);
      const body = this.keeperBody, ud = body.userData;
      const dive = Math.min(1, Math.abs(k.theta) / 1.1);
      const ready = k.phase === 'set' ? 1 : 1 - Math.min(1, k.diveT / 0.12);
      // set: crouched, gloves out; dive: arms stretched overhead
      const bounce = k.phase === 'set' ? Math.sin(tReal * 9) * 0.02 : 0;
      body.position.y = (k.phase === 'set' ? -0.06 + bounce : 0);
      ud.arms.forEach((arm, i) => {
        const s = i ? 1 : -1;
        const setZ = s * 1.0, diveZ = s * 2.9 - (k.theta > 0 ? 0.25 : -0.25);
        arm.rotation.z = setZ * ready + diveZ * (1 - ready) * (0.5 + dive * 0.5) + (1 - ready) * (1 - dive) * s * 1.2;
        arm.rotation.x = ready * -0.5;
      });
      ud.legs.forEach((l, i) => { l.rotation.z = (i ? 1 : -1) * (0.12 * ready + dive * 0.25); l.rotation.x = ready * 0.15; });
      body.rotation.y = 0;
    }
    // targets
    this.targetObjs.forEach((g, i) => {
      if (!g.visible) return;
      const u = g.userData;
      if (u.hit) { u.hit += dt; const s = 1 + u.hit * 2; u.ring.scale.setScalar(s); u.ring.material.opacity = Math.max(0, 1 - u.hit * 2); u.disc.material.opacity = Math.max(0, 1 - u.hit * 2); u.lab.material.opacity = 0; }
      else {
        const p = 1 + Math.sin(tReal * 4 + i) * 0.05; u.ring.scale.setScalar(p);
        u.ring.material.opacity = 1; u.disc.material.opacity = 1; u.lab.material.opacity = 1;
      }
    });
    // net bulge
    this.updateNet(w, dt);
    // particles
    this.updateParts(dt);
    if (this.popT > 0) { this.popT -= dt; const u = Math.max(0, this.popT / 0.18); this.pop.material.opacity = u; this.pop.scale.setScalar(this.popSize * (1.6 - u * 0.6)); if (this.popT <= 0) this.pop.visible = false; }
    // boards scroll
    this.boardTex.offset.x = (tReal * 0.02) % 1;
    // camera flashes in the crowd
    for (const f of this.flashes) {
      if (f.t > 0) { f.t -= dt; f.m.material.opacity = Math.max(0, f.t / 0.12); if (f.t <= 0) f.m.visible = false; }
      else if (Math.random() < dt * (0.15 + this.uniforms.uHype.value * 6)) {
        const p = this.people[(Math.random() * this.people.length) | 0][0];
        f.m.position.set(p.x, p.y + 0.2, p.z); f.m.lookAt(this.camera.position); f.m.visible = true; f.t = 0.12;
      }
    }
  }

  updateTrail(w) {
    const tp = this.trailPts, n = tp.length;
    const pos = this.trail.geometry.attributes.position, col = this.trail.geometry.attributes.color;
    const cam = this.camera.position;
    const pa = pos.array, ca = col.array;
    const sp = w.ball.v0 || 20;
    const hot = Math.min(1, Math.max(0, (sp - 18) / 14));
    for (let i = 0; i < this.trailN; i++) {
      const j = Math.min(i, n - 1);
      const p = n ? tp[j] : [0, -10, 0];
      const q = n ? tp[Math.min(j + 1, n - 1)] : p, o = n ? tp[Math.max(j - 1, 0)] : p;
      const dx = q[0] - o[0], dy = q[1] - o[1], dz = q[2] - o[2];
      const vx = cam.x - p[0], vy = cam.y - p[1], vz = cam.z - p[2];
      let sx = dy * vz - dz * vy, sy = dz * vx - dx * vz, sz = dx * vy - dy * vx;
      const L = Math.hypot(sx, sy, sz) || 1;
      const f = n > 1 ? j / (n - 1) : 0;
      const wdt = R * 0.95 * f;
      sx = sx / L * wdt; sy = sy / L * wdt; sz = sz / L * wdt;
      pa.set([p[0] + sx, p[1] + sy, p[2] + sz, p[0] - sx, p[1] - sy, p[2] - sz], i * 6);
      const a = f * f * 0.9;
      const r = (0.55 + 0.45 * hot) * a, g = (0.85 - 0.25 * hot) * a, bb = (1 - 0.7 * hot) * a;
      ca.set([r, g, bb, r, g, bb], i * 6);
    }
    pos.needsUpdate = true; col.needsUpdate = true;
  }

  updateNet(w, dt) {
    if (w.netHit && (!this.netPulse || this.netPulse.t0 !== w.netHit.t)) {
      this.netPulse = { t0: w.netHit.t, x: w.netHit.x, y: w.netHit.y, s: Math.min(1.4, w.netHit.s / 14), age: 0, back: w.netHit.z < -NET_D + 0.3 };
    }
    const np = this.netPulse;
    if (!np) return;
    np.age += dt;
    const a = this.netBack.geometry.attributes.position, arr = a.array, base = this.netBase;
    // damped spring: pushed out then wobbling back
    const amp = np.s * 0.55 * Math.exp(-np.age * 3.2) * Math.cos(np.age * 14) * (np.back ? 1 : 0.4);
    for (let i = 0; i < arr.length; i += 3) {
      const x = base[i], y = base[i + 1] + GH / 2;
      const d2 = (x - np.x) ** 2 + (y - np.y) ** 2;
      arr[i + 2] = base[i + 2] - amp * Math.exp(-d2 / 0.7);
    }
    a.needsUpdate = true;
    if (np.age > 2.5) { this.netPulse = null; this.resetNet(); }
  }

  updateParts(dt) {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
    const P = this.parts;
    for (let i = P.length - 1; i >= 0; i--) {
      const o = P[i]; o.age += dt;
      if (o.age > o.life) { P.splice(i, 1); continue; }
      o.v[1] -= o.g * dt;
      const d = Math.exp(-o.drag * dt); o.v[0] *= d; o.v[1] *= d; o.v[2] *= d;
      if (o.flutter) { o.v[0] += Math.sin(o.age * 7 + o.rot) * o.flutter * dt; }
      o.p[0] += o.v[0] * dt; o.p[1] += o.v[1] * dt; o.p[2] += o.v[2] * dt;
      if (o.p[1] < 0.01) { o.p[1] = 0.01; o.v[1] *= -0.2; o.v[0] *= 0.5; o.v[2] *= 0.5; }
      o.rot += o.spin * dt;
    }
    const n = Math.min(P.length, this.pN);
    const camQ = this.camera.quaternion;
    for (let i = 0; i < n; i++) {
      const o = P[i];
      const fade = Math.min(1, (o.life - o.age) * 3);
      e.set(o.rot, o.rot * 0.7, 0); q.setFromEuler(e).premultiply(camQ);
      p.set(o.p[0], o.p[1], o.p[2]); s.setScalar(o.size * fade);
      m4.compose(p, q, s); this.pMesh.setMatrixAt(i, m4); this.pMesh.setColorAt(i, o.col);
    }
    this.pMesh.count = n;
    this.pMesh.instanceMatrix.needsUpdate = true;
    if (this.pMesh.instanceColor) this.pMesh.instanceColor.needsUpdate = true;
  }

  resize(w, h) {
    this.renderer.setSize(w, h, false);
    const asp = w / h;
    this.camera.aspect = asp;
    // keep ~50 deg vertical in landscape, widen in portrait so the goal still fits
    const hf = 36 * Math.PI / 180;
    this.baseFov = asp >= 1.25 ? 40 : Math.min(80, 2 * Math.atan(Math.tan(hf / 2) / asp) * 180 / Math.PI);
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
  }

  render() { this.renderer.render(this.scene, this.camera); }
  // Compile every material up front (hidden ones too: keeper, wall men, flash, targets)
  // so the first goal / save / post hit never stalls on a shader compile mid-celebration.
  warmup() {
    const hidden = [];
    this.scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    try { this.renderer.compile(this.scene, this.camera); } catch (e) { /* compile is an optimisation only */ }
    for (const o of hidden) o.visible = false;
  }
}
