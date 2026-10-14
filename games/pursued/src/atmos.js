// Sky dome (overcast, lit orange from below by the city), manhole steam.
import * as THREE from 'three';

export function makeSky() {
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uHorizon: { value: new THREE.Color(0.075, 0.07, 0.075) }, uZenith: { value: new THREE.Color(0.008, 0.01, 0.016) }, uGlow: { value: new THREE.Color(0.16, 0.09, 0.05) } },
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */`
      varying vec3 vD; uniform float uTime; uniform vec3 uHorizon, uZenith, uGlow;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
      float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<6;i++){ s+=a*n(p); p*=2.03; a*=0.5; } return s; }
      void main(){
        float y = max(vD.y, 0.0);
        vec3 col = mix(uHorizon, uZenith, pow(y, 0.45));
        col += uGlow * exp(-y*7.0) * 0.8;                      // light pollution under the cloud deck
        vec2 uv = vD.xz/(vD.y + 0.12) * 1.6 + vec2(uTime*0.012, uTime*0.004);
        float c = fbm(uv);
        col *= 0.65 + 0.7*c;                                   // heavy rain clouds catching the city glow
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const s = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), m);
  s.renderOrder = -10;
  s.frustumCulled = false;
  return s;
}

function smokeTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const img = g.createImageData(128, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const dx = (x - 64) / 64, dy = (y - 64) / 64;
    const r = Math.sqrt(dx * dx + dy * dy);
    let v = 0, a = 1, f = 3;
    for (let o = 0; o < 4; o++) { v += a * (Math.sin(x / 128 * f * 6.28 + o * 1.7) * Math.sin(y / 128 * f * 5.1 + o * 2.3) * 0.5 + 0.5); a *= 0.5; f *= 2; }
    const al = Math.max(0, 1 - r) ** 1.1 * (0.55 + 0.45 * v / 1.9);
    const i = (y * 128 + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = al * 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  return t;
}

export class Steam {
  constructor(scene, vents) {
    this.parts = [];
    const tex = smokeTexture();
    for (const v of vents) {
      for (let i = 0; i < 26; i++) {
        const m = new THREE.SpriteMaterial({ map: tex, color: 0x9aa0a8, transparent: true, depthWrite: false, opacity: 0, fog: true });
        const s = new THREE.Sprite(m);
        s.renderOrder = 6;
        scene.add(s);
        this.parts.push({ s, v, age: i / 26 * 6, life: 6, rot: Math.random() * 6.28, drift: Math.random() });
      }
    }
  }
  update(dt, lightAt) {
    for (const p of this.parts) {
      p.age += dt;
      if (p.age > p.life) { p.age -= p.life; p.drift = Math.random(); }
      const k = p.age / p.life;
      const y = 0.1 + k * 4.5 + k * k * 1.5;
      p.s.position.set(p.v.x + k * 2.2 + Math.sin(p.age * 0.7 + p.drift * 6) * 0.3, y, p.v.z + k * 1.1 + (p.drift - 0.5) * k * 1.5);
      const sz = 0.8 + k * 3.8;
      p.s.scale.set(sz, sz, 1);
      p.s.material.rotation = p.rot + p.age * 0.15;
      p.s.material.opacity = Math.min(1, k * 6) * (1 - k) * 0.85;
      const c = lightAt(p.s.position);
      p.s.material.color.copy(c).multiplyScalar(2.6);
    }
  }
}
