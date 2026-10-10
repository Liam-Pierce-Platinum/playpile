// Day and night: sky dome, sun/moon light, stars, clouds, and the palette
// every other part of the scene reads from.
import * as THREE from 'three';
import { lerp, smooth } from './util.js';

// t = time of day 0..1 (0 = midnight). Keyframes of the whole palette.
const KEYS = [
  { t: 0.00, top: '#0a1838', hor: '#25396a', sun: '#8fa6e0', sunI: 0.8, sky: '#4a5fa0', gnd: '#1e2840', hemiI: 1.15, sh: '#2b5a7a', dp: '#0c2848', fog: '#1f3260' },
  { t: 0.20, top: '#0d1d42', hor: '#2c3f70', sun: '#8fa6e0', sunI: 0.75, sky: '#4a5fa0', gnd: '#1e2840', hemiI: 1.15, sh: '#2b5a7a', dp: '#0c2848', fog: '#24386a' },
  { t: 0.255, top: '#5d86c4', hor: '#ffc29a', sun: '#ffb37f', sunI: 1.6, sky: '#a9b8e0', gnd: '#5a4a4a', hemiI: 1.3, sh: '#58c2c0', dp: '#2a6aa0', fog: '#f2c3a8' },
  { t: 0.33, top: '#5fb4ec', hor: '#c4e9f6', sun: '#fff1d8', sunI: 2.7, sky: '#cfeaff', gnd: '#8a7a5a', hemiI: 1.7, sh: '#62d9cb', dp: '#1c78b0', fog: '#c4e9f6' },
  { t: 0.68, top: '#5fb4ec', hor: '#c4e9f6', sun: '#fff1d8', sunI: 2.7, sky: '#cfeaff', gnd: '#8a7a5a', hemiI: 1.7, sh: '#62d9cb', dp: '#1c78b0', fog: '#c4e9f6' },
  { t: 0.765, top: '#4d6aa8', hor: '#ff9f78', sun: '#ff8d5c', sunI: 1.8, sky: '#c8a6c8', gnd: '#5a4040', hemiI: 1.3, sh: '#5ab8b8', dp: '#25609a', fog: '#f0a88c' },
  { t: 0.83, top: '#0d1d42', hor: '#2c3f70', sun: '#8fa6e0', sunI: 0.75, sky: '#4a5fa0', gnd: '#1e2840', hemiI: 1.15, sh: '#2b5a7a', dp: '#0c2848', fog: '#24386a' },
  { t: 1.00, top: '#0a1838', hor: '#25396a', sun: '#8fa6e0', sunI: 0.8, sky: '#4a5fa0', gnd: '#1e2840', hemiI: 1.15, sh: '#2b5a7a', dp: '#0c2848', fog: '#1f3260' },
].map((k) => {
  const o = { t: k.t };
  for (const [key, v] of Object.entries(k)) o[key] = typeof v === 'string' ? new THREE.Color(v) : v;
  return o;
});

const GREY = new THREE.Color('#7d8794'), GREY_N = new THREE.Color('#161b24'), SEA_G = new THREE.Color('#5a8c94'), SEA_D = new THREE.Color('#2a4a64'), WHITE = new THREE.Color('#eef3ff');
export const isNightT = (t) => t < 0.235 || t > 0.8;

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.pal = {};
    for (const k of Object.keys(KEYS[0])) if (k !== 't') this.pal[k] = KEYS[0][k] instanceof THREE.Color ? new THREE.Color() : 0;

    this.domeMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() } },
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uTop, uHor; varying vec3 vP;
        void main(){ float h = clamp(vP.y, 0.0, 1.0); gl_FragColor = vec4(mix(uHor, uTop, pow(h, 0.55)), 1.0);
        #include <colorspace_fragment>
        }`,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(380, 24, 12), this.domeMat);
    this.dome.renderOrder = -10;
    scene.add(this.dome);

    // stars
    const sp = [];
    for (let i = 0; i < 500; i++) {
      const th = Math.random() * Math.PI * 2, y = 0.12 + Math.random() * 0.88;
      const r = Math.sqrt(1 - y * y);
      sp.push(Math.cos(th) * r * 360, y * 360, Math.sin(th) * r * 360);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.starMat = new THREE.PointsMaterial({ color: '#ffffff', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    this.stars = new THREE.Points(sg, this.starMat);
    scene.add(this.stars);

    this.moon = new THREE.Mesh(new THREE.SphereGeometry(9, 16, 12), new THREE.MeshBasicMaterial({ color: '#fdf6dc', fog: false, transparent: true }));
    scene.add(this.moon);

    this.hemi = new THREE.HemisphereLight('#cfeaff', '#8a7a5a', 1.6);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff1d8', 2.6);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -48; sc.right = 48; sc.top = 48; sc.bottom = -48; sc.near = 1; sc.far = 160;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun, this.sun.target);
    this.sun.target.position.set(-4, 0, 6);

    scene.fog = new THREE.Fog('#c4e9f6', 90, 210);

    // clouds: puffy clumps drifting in a ring
    this.clouds = [];
    const cm = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true, transparent: true, opacity: 0.95 });
    for (let i = 0; i < 20; i++) {
      const g = new THREE.Group();
      const n = 3 + Math.floor(Math.random() * 3);
      for (let k = 0; k < n; k++) {
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(2 + Math.random() * 1.8, 0), cm);
        b.position.set((k - n / 2) * 2.4, Math.random() * 1.2, (Math.random() - 0.5) * 2);
        b.scale.y = 0.65;
        g.add(b);
      }
      g.userData = { a: (i / 20) * Math.PI * 2 + Math.random(), r: 50 + Math.random() * 40, y: 26 + Math.random() * 10, s: 0.01 + Math.random() * 0.012 };
      scene.add(g);
      this.clouds.push(g);
    }
    this.cloudMat = cm;
    this.night = 0;
  }

  update(t, dt, focus, wx) {
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1].t <= t) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const f = smooth(0, 1, (t - a.t) / (b.t - a.t));
    for (const k of Object.keys(this.pal)) {
      if (this.pal[k] instanceof THREE.Color) this.pal[k].copy(a[k]).lerp(b[k], f);
      else this.pal[k] = lerp(a[k], b[k], f);
    }
    const p = this.pal;
    const oc = wx ? wx.cloud : 0;
    if (oc > 0.01) {
      const nightAmt = 1 - smooth(0.0, 0.12, Math.sin((t - 0.25) * Math.PI * 2) + 0.05);
      const grey = GREY.clone().lerp(GREY_N, nightAmt);
      p.top.lerp(grey, oc * 0.75); p.hor.lerp(grey, oc * 0.65); p.fog.lerp(grey, oc * 0.7); p.sky.lerp(grey, oc * 0.5);
      p.sh.lerp(SEA_G.clone().lerp(GREY_N, nightAmt), oc * 0.45); p.dp.lerp(SEA_D.clone().lerp(GREY_N, nightAmt), oc * 0.4); p.sun.lerp(grey, oc * 0.5);
      p.sunI *= 1 - 0.75 * oc; p.hemiI *= 1 - 0.38 * oc;
    }
    if (wx && wx.flash > 0) { p.top.lerp(WHITE, wx.flash * 0.5); p.hor.lerp(WHITE, wx.flash * 0.45); p.fog.lerp(WHITE, wx.flash * 0.3); p.hemiI += wx.flash * 2.5; }
    this.domeMat.uniforms.uTop.value.copy(p.top);
    this.domeMat.uniforms.uHor.value.copy(p.hor);
    this.scene.fog.color.copy(p.fog);
    this.hemi.color.copy(p.sky); this.hemi.groundColor.copy(p.gnd); this.hemi.intensity = p.hemiI;

    // sun arc; at night the same light becomes the moon
    const ang = (t - 0.25) * Math.PI * 2;
    const sunUp = Math.sin(ang);
    const dir = new THREE.Vector3(Math.cos(ang) * 0.8, Math.max(0.18, Math.abs(sunUp)), 0.45).normalize();
    if (sunUp < 0) dir.x = -dir.x;
    this.sunDir = dir;
    this.sun.position.copy(this.sun.target.position).addScaledVector(dir, 70);
    this.sun.color.copy(p.sun); this.sun.intensity = p.sunI;

    this.night = 1 - smooth(0.0, 0.12, sunUp + 0.05);
    this.starMat.opacity = this.night * 0.9 * (1 - oc);
    this.moon.material.opacity = this.night * (1 - oc * 0.9);
    this.moon.position.set(-dir.x * 300, 160, -220);
    this.moon.visible = this.night > 0.01;
    this.cloudMat.color.setRGB(1, 1, 1).lerp(p.hor, 0.35).lerp(p.top, this.night * 0.5).lerp(GREY_N, oc * 0.55);
    const nShow = 7 + Math.round(oc * 13), wind = wx ? wx.wind : 0.15;

    this.sun.target.position.set(Math.round(focus.x / 8) * 8, 0, Math.round(focus.z / 8) * 8);
    this.sun.target.updateMatrixWorld();
    this.sun.position.copy(this.sun.target.position).addScaledVector(dir, 70);
    this.dome.position.copy(focus);
    this.stars.position.copy(focus);
    this.clouds.forEach((c, i) => {
      const u = c.userData;
      c.visible = i < nShow;
      u.a += u.s * dt * (1 + wind * 4);
      c.position.set(focus.x + Math.cos(u.a) * u.r, u.y - oc * 8, focus.z + Math.sin(u.a) * u.r + 10);
      c.rotation.y = -u.a;
    });
  }
}
