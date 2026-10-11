// Tornado funnel (custom shader), ground suction ring, and a pooled sprite
// particle system (dust, leaves, embers, fish, candy, snow, stars, chips).
import * as THREE from 'three';

// ---- funnel shape shared with the simulation (ring placement) ----
export const funnelH = (s) => 4.5 + s * 3.3;
export const funnelR = (s, f) => s * (0.3 + 1.1 * Math.pow(f, 1.5));

const NOISE = `
float hash(vec3 p){ p = fract(p*0.3183099+0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float noise(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x), mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x), mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y), f.z); }`;

const VS = `
uniform float uTime, uS, uH, uR0, uR1, uSpin, uSeed;
uniform vec2 uLean;
varying vec2 vUv; varying float vFres; varying float vShade;
void main(){
  float h = uv.y;
  float ang = uv.x*6.2831853 + uTime*uSpin*(1.7 - h*0.7) + h*1.4;
  float wob = 1.0 + 0.07*sin(h*17.0 - uTime*5.0 + uv.x*12.566 + uSeed);
  float r = uS*(uR0 + uR1*pow(h, 1.5))*wob;
  vec3 p = vec3(cos(ang)*r, h*uH, sin(ang)*r);
  p.xz += uLean*h*h + vec2(sin(uTime*1.7+h*3.5+uSeed), cos(uTime*1.3+h*3.0+uSeed))*uS*0.16*h;
  vec4 wp = modelMatrix*vec4(p,1.0);
  vec3 n = normalize(vec3(cos(ang), -0.3, sin(ang)));
  vec3 vd = normalize(cameraPosition - wp.xyz);
  vFres = 1.0 - abs(dot(n, vd));
  vShade = 0.74 + 0.38*max(0.0, dot(n, normalize(vec3(-0.5,0.55,0.65))));
  vUv = uv;
  gl_Position = projectionMatrix*viewMatrix*wp;
}`;
const FS = `
uniform float uTime, uAlpha, uFlash, uSeed, uBack, uBoost, uDustMix, uDark;
uniform vec3 uDust, uSkin;
varying vec2 vUv; varying float vFres; varying float vShade;
${NOISE}
void main(){
  float h = vUv.y;
  float a = (vUv.x + h*0.4)*6.2831853;
  vec3 q = vec3(cos(a)*2.4, sin(a)*2.4, h*5.5 - uTime*1.8 + uSeed);
  float n = noise(q)*0.6 + noise(q*2.3 + 7.0)*0.3 + noise(q*5.1 + 3.0)*0.1;
  float streak = smoothstep(0.32, 0.78, n);
  float ring = smoothstep(0.1, 0.55, 0.5 + 0.5*sin((h*7.5 - uTime*0.9)*6.2831853));
  float band = 0.5 + 0.5*ring;
  float al = uAlpha*(0.22 + 0.95*streak)*band*smoothstep(0.0, 0.07, h)*(1.0 - smoothstep(0.8, 1.0, h))*(0.42 + 0.9*vFres)*(1.0 - 0.4*h);
  vec3 col = mix(uDust, uSkin, smoothstep(0.0, 0.8, h));
  col = mix(col, uDust*0.92*uDark, uDustMix*(1.0 - h*0.6));
  col *= vShade*(0.82 + 0.34*n)*(1.0 - uBack*0.22);
  col = mix(col, vec3(1.0), vFres*0.18*(1.0-uBack));
  col += uFlash*vec3(0.8, 0.88, 1.0)*(0.6 + n);
  gl_FragColor = vec4(col, clamp(al*uBoost, 0.0, 0.92));
}`;

let funnelGeo = null;
// inner layer is denser and darker so the core reads as a solid column even
// at Category 1 (Hole.io's hole is the highest-contrast thing on screen)
const LAYERS = [
  { r0: 0.34, r1: 1.12, spin: 2.2, alpha: 0.48, dust: 0.0, dark: 1 },
  { r0: 0.25, r1: 0.84, spin: 3.1, alpha: 0.5, dust: 0.25, dark: 0.95 },
  { r0: 0.13, r1: 0.42, spin: 4.6, alpha: 0.92, dust: 0.85, dark: 0.85 },
];
let eyeGeo = null;

export class Funnel {
  constructor(scene, dust, skin, seed) {
    if (!funnelGeo) funnelGeo = new THREE.CylinderGeometry(1, 1, 1, 34, 22, true);
    this.group = new THREE.Group();
    this.mats = [];
    this.u = { uTime: { value: 0 }, uS: { value: 1 }, uH: { value: 6 }, uLean: { value: new THREE.Vector2() }, uDust: { value: new THREE.Color(dust) }, uSkin: { value: new THREE.Color(skin) }, uFlash: { value: 0 }, uSeed: { value: seed }, uBoost: { value: 1 } };
    LAYERS.forEach((L, li) => {
      for (const back of [1, 0]) {
        const mat = new THREE.ShaderMaterial({
          vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false,
          side: back ? THREE.BackSide : THREE.FrontSide,
          uniforms: { ...this.u, uR0: { value: L.r0 }, uR1: { value: L.r1 }, uSpin: { value: L.spin }, uAlpha: { value: L.alpha * (back ? 0.7 : 1) }, uBack: { value: back }, uDustMix: { value: L.dust }, uSeed: { value: seed + li * 3.1 }, uDark: { value: L.dark } },
        });
        const m = new THREE.Mesh(funnelGeo, mat);
        m.frustumCulled = false;
        m.renderOrder = 10 + li * 2 + (back ? 0 : 1);
        this.group.add(m);
        this.mats.push(mat);
      }
    });
    // ground suction ring (solid rim in the skin colour, dashed swirl inside);
    // uDanger pulses it red when a bigger storm is about to drag us in
    this.ringMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTime: this.u.uTime, uCol: { value: new THREE.Color(skin) }, uA: { value: 0.3 }, uDanger: { value: 0 } },
      vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform float uTime, uA, uDanger; uniform vec3 uCol; varying vec2 vP;
        void main(){ float r = length(vP); float a = atan(vP.y, vP.x);
          float rim = smoothstep(0.84, 0.92, r)*(1.0 - smoothstep(0.97, 1.0, r));
          float dash = step(0.5, fract(a*4.774 + uTime*1.2 + r*1.5));
          float fill = (1.0 - smoothstep(0.0, 0.95, r))*0.3;
          float swirl = smoothstep(0.55, 0.88, r)*(1.0-smoothstep(0.88,0.95,r))*dash*0.45;
          vec3 col = mix(mix(vec3(0.15,0.17,0.22), uCol, 0.8), vec3(1.0,0.16,0.14), min(1.0, uDanger*1.8));
          float al = (rim*1.0 + swirl + fill)*uA + (rim + fill*1.5)*uDanger*0.9;
          gl_FragColor = vec4(col, min(al, 1.0)); }`,
    });
    this.ring = new THREE.Mesh(new THREE.CircleGeometry(1, 48), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.06;
    this.ring.renderOrder = 2;
    scene.add(this.ring);
    // the "eye": a dark disc at the funnel base, so the storm's position and
    // size read at a glance at every category (Hole.io's black disc)
    if (!eyeGeo) eyeGeo = new THREE.CircleGeometry(1, 36);
    this.eyeMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTime: this.u.uTime, uCol: { value: new THREE.Color(skin) } },
      vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform float uTime; uniform vec3 uCol; varying vec2 vP;
        void main(){ float r = length(vP); float a = atan(vP.y, vP.x);
          float body = 1.0 - smoothstep(0.78, 1.0, r);
          float spiral = 0.5 + 0.5*sin(a*3.0 - r*9.0 + uTime*6.0);
          vec3 col = mix(vec3(0.15,0.19,0.27), uCol*0.55, spiral*(1.0-r)*0.5);
          gl_FragColor = vec4(col, body*(0.62 - r*0.12)); }`,
    });
    this.eye = new THREE.Mesh(eyeGeo, this.eyeMat);
    this.eye.rotation.x = -Math.PI / 2;
    this.eye.position.y = 0.09;
    this.eye.renderOrder = 3;
    scene.add(this.eye);
    scene.add(this.group);
  }
  setSkin(dust, skin) { this.u.uDust.value.set(dust); this.u.uSkin.value.set(skin); this.ringMat.uniforms.uCol.value.set(skin); this.eyeMat.uniforms.uCol.value.set(skin); }
  update(x, z, s, leanX, leanZ, time, flash, suctionR, visible, danger = 0) {
    this.group.visible = this.ring.visible = this.eye.visible = visible;
    this.group.position.set(x, 0, z);
    this.u.uTime.value = time;
    this.u.uS.value = s;
    this.u.uH.value = funnelH(s);
    this.u.uLean.value.set(leanX, leanZ);
    this.u.uFlash.value = flash;
    this.u.uBoost.value = 1 + 0.7 * Math.max(0, Math.min(1, (3.5 - s) / 2.4));
    this.ring.position.x = x; this.ring.position.z = z;
    this.ring.scale.setScalar(suctionR);
    this.ringMat.uniforms.uDanger.value = danger;
    this.eye.position.x = x; this.eye.position.z = z;
    this.eye.scale.setScalar(Math.max(0.9, s * 0.5));
  }
  dispose(scene) {
    scene.remove(this.group); scene.remove(this.ring); scene.remove(this.eye);
    for (const m of this.mats) m.dispose();
    this.ringMat.dispose(); this.ring.geometry.dispose(); this.eyeMat.dispose();
  }
}

// ---- particles ----
export const SPR = { PUFF: 0, LEAF: 1, EMBER: 2, FISH: 3, CANDY: 4, SNOW: 5, STAR: 6, CHIP: 7 };
function atlas() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  const cell = (i, fn) => { g.save(); g.translate((i % 4) * 64 + 32, ((i / 4) | 0) * 64 + 32); fn(); g.restore(); };
  cell(0, () => { const r = g.createRadialGradient(0, 0, 0, 0, 0, 30); r.addColorStop(0, 'rgba(255,255,255,0.9)'); r.addColorStop(0.5, 'rgba(255,255,255,0.45)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(-32, -32, 64, 64); });
  cell(1, () => { g.rotate(0.6); g.fillStyle = '#6cc24a'; g.beginPath(); g.ellipse(0, 0, 24, 12, 0, 0, 7); g.fill(); g.strokeStyle = '#4f9a35'; g.lineWidth = 3; g.beginPath(); g.moveTo(-22, 0); g.lineTo(22, 0); g.stroke(); });
  cell(2, () => { const r = g.createRadialGradient(0, 0, 0, 0, 0, 30); r.addColorStop(0, 'rgba(255,255,220,1)'); r.addColorStop(0.3, 'rgba(255,180,60,0.9)'); r.addColorStop(1, 'rgba(255,80,20,0)'); g.fillStyle = r; g.fillRect(-32, -32, 64, 64); });
  cell(3, () => { g.fillStyle = '#4f9dff'; g.beginPath(); g.ellipse(-2, 0, 20, 11, 0, 0, 7); g.fill(); g.beginPath(); g.moveTo(14, 0); g.lineTo(28, -12); g.lineTo(28, 12); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(-12, -3, 4, 0, 7); g.fill(); g.fillStyle = '#123'; g.beginPath(); g.arc(-12, -3, 2, 0, 7); g.fill(); g.fillStyle = '#9fd0ff'; g.beginPath(); g.ellipse(0, 4, 10, 3, 0, 0, 7); g.fill(); });
  cell(4, () => { g.fillStyle = '#ff7fb0'; g.beginPath(); g.arc(0, 0, 18, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 5; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(0, 0, 18, i * 2.1, i * 2.1 + 0.9); g.stroke(); } g.fillStyle = '#ff7fb0'; g.beginPath(); g.moveTo(16, 0); g.lineTo(28, -9); g.lineTo(28, 9); g.fill(); g.beginPath(); g.moveTo(-16, 0); g.lineTo(-28, -9); g.lineTo(-28, 9); g.fill(); });
  cell(5, () => { g.strokeStyle = '#ffffff'; g.lineWidth = 4; g.lineCap = 'round'; for (let i = 0; i < 6; i++) { g.rotate(Math.PI / 3); g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 24); g.moveTo(0, 14); g.lineTo(7, 20); g.moveTo(0, 14); g.lineTo(-7, 20); g.stroke(); } });
  cell(6, () => { g.fillStyle = '#ffffff'; g.beginPath(); for (let i = 0; i < 8; i++) { const r = i % 2 ? 6 : 28, a = (i * Math.PI) / 4; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.fill(); const r = g.createRadialGradient(0, 0, 0, 0, 0, 14); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(-14, -14, 28, 28); });
  cell(7, () => { g.fillStyle = '#ffffff'; g.beginPath(); g.roundRect(-14, -10, 28, 20, 5); g.fill(); });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Particles {
  constructor(scene, max = 5000) {
    this.max = max; this.n = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max); this.alpha = new Float32Array(max); this.spr = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('spr', new THREE.BufferAttribute(this.spr, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { map: { value: atlas() }, uScale: { value: 600 } },
      vertexShader: `attribute float size; attribute float alpha; attribute float spr; attribute vec3 color;
        uniform float uScale; varying vec3 vC; varying float vA; varying float vS;
        void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = size*uScale/(-mv.z); vC = color; vA = alpha; vS = spr; gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec3 vC; varying float vA; varying float vS;
        void main(){ vec2 pc = gl_PointCoord; float c = mod(vS, 4.0), r = floor(vS/4.0);
          vec2 uv = vec2((c + pc.x)/4.0, 1.0 - (r + pc.y)/2.0);
          vec4 t = texture2D(map, uv); if (t.a*vA < 0.01) discard; gl_FragColor = vec4(t.rgb*vC, t.a*vA); }`,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 30;
    scene.add(this.points);
    // sim data
    this.d = Array.from({ length: max }, () => ({ vx: 0, vy: 0, vz: 0, life: 0, max: 1, s0: 1, s1: 1, a0: 1, drag: 0, grav: 0, storm: null, ang: 0, rad: 0, av: 0, rv: 0, yv: 0, y: 0 }));
  }
  // free particle
  emit(x, y, z, vx, vy, vz, o) {
    if (this.n >= this.max) return;
    const i = this.n++;
    const d = this.d[i];
    d.storm = null; d.vx = vx; d.vy = vy; d.vz = vz; d.life = 0; d.max = o.life || 1; d.s0 = o.size || 1; d.s1 = o.size1 ?? d.s0; d.a0 = o.alpha ?? 1; d.drag = o.drag || 0; d.grav = o.grav || 0;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    const c = o.color || [1, 1, 1];
    this.col[i * 3] = c[0]; this.col[i * 3 + 1] = c[1]; this.col[i * 3 + 2] = c[2];
    this.spr[i] = o.spr || 0; this.size[i] = d.s0; this.alpha[i] = d.a0;
  }
  // particle orbiting a storm (polar coords around its moving centre)
  swirl(storm, ang, rad, y, av, rv, yv, o) {
    if (this.n >= this.max) return;
    const i = this.n++;
    const d = this.d[i];
    d.storm = storm; d.ang = ang; d.rad = rad; d.y = y; d.av = av; d.rv = rv; d.yv = yv; d.life = 0; d.max = o.life || 1; d.s0 = o.size || 1; d.s1 = o.size1 ?? d.s0; d.a0 = o.alpha ?? 1;
    const c = o.color || [1, 1, 1];
    this.col[i * 3] = c[0]; this.col[i * 3 + 1] = c[1]; this.col[i * 3 + 2] = c[2];
    this.spr[i] = o.spr || 0; this.size[i] = d.s0; this.alpha[i] = 0;
    this.pos[i * 3] = storm.x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = storm.z;
  }
  update(dt) {
    let i = 0;
    while (i < this.n) {
      const d = this.d[i];
      d.life += dt;
      if (d.life >= d.max) { this.kill(i); continue; }
      const k = d.life / d.max;
      if (d.storm) {
        d.ang += d.av * dt; d.rad = Math.max(0.1, d.rad + d.rv * dt); d.y += d.yv * dt;
        const st = d.storm;
        const f = Math.min(1, d.y / (st.h || 6));
        this.pos[i * 3] = st.x + Math.cos(d.ang) * d.rad + st.leanX * f * f;
        this.pos[i * 3 + 1] = d.y;
        this.pos[i * 3 + 2] = st.z + Math.sin(d.ang) * d.rad + st.leanZ * f * f;
        this.alpha[i] = d.a0 * Math.min(1, k * 6) * (1 - k);
      } else {
        d.vy -= d.grav * dt;
        const dr = Math.exp(-d.drag * dt);
        d.vx *= dr; d.vy *= dr; d.vz *= dr;
        this.pos[i * 3] += d.vx * dt; this.pos[i * 3 + 1] += d.vy * dt; this.pos[i * 3 + 2] += d.vz * dt;
        if (this.pos[i * 3 + 1] < 0.05) { this.pos[i * 3 + 1] = 0.05; d.vy *= -0.3; d.vx *= 0.7; d.vz *= 0.7; }
        this.alpha[i] = d.a0 * (1 - k * k);
      }
      this.size[i] = d.s0 + (d.s1 - d.s0) * k;
      i++;
    }
    const g = this.geo;
    g.setDrawRange(0, this.n);
    for (const a of ['position', 'color', 'size', 'alpha', 'spr']) { g.attributes[a].needsUpdate = true; g.attributes[a].updateRanges = []; }
  }
  kill(i) {
    const j = --this.n;
    if (i !== j) {
      const a = this.d[i]; this.d[i] = this.d[j]; this.d[j] = a;
      for (let c = 0; c < 3; c++) { this.pos[i * 3 + c] = this.pos[j * 3 + c]; this.col[i * 3 + c] = this.col[j * 3 + c]; }
      this.size[i] = this.size[j]; this.alpha[i] = this.alpha[j]; this.spr[i] = this.spr[j];
    }
  }
  clear() { this.n = 0; }
}
