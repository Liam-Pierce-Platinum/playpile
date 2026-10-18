// Map environments: sky (physical day sky, overcast, night cloud deck, HDRI backdrop), sun with a
// shadow camera that follows the player, hemisphere fill, image-based lighting from Poly Haven
// HDRIs, fog, and weather particles (rain streaks lit by nearby lamps, snowfall, drifting dust).
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { hdr } from '../core/assets.js';

export function nightSky() {
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
        col += uGlow * exp(-y*7.0) * 0.8;
        vec2 uv = vD.xz/(vD.y + 0.12) * 1.6 + vec2(uTime*0.012, uTime*0.004);
        col *= 0.65 + 0.7*fbm(uv);
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const s = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), m); s.renderOrder = -10; s.frustumCulled = false;
  return s;
}
export function gradientSky(top, horizon, bottom) {
  const m = new THREE.ShaderMaterial({
    uniforms: { uTop: { value: new THREE.Color(top) }, uHor: { value: new THREE.Color(horizon) }, uBot: { value: new THREE.Color(bottom) } },
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `varying vec3 vD; uniform vec3 uTop, uHor, uBot; void main(){ float y = vD.y; vec3 c = y > 0.0 ? mix(uHor, uTop, pow(y, 0.6)) : mix(uHor, uBot, pow(-y, 0.4)); gl_FragColor = vec4(c, 1.0); }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const s = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), m); s.renderOrder = -10; s.frustumCulled = false;
  return s;
}

// ---------------------------------------------------------------- weather particles
export class Weather {
  constructor(scene, kind, { count, box = [50, 26, 50], indoor = [] } = {}) {
    this.kind = kind;
    const snow = kind === 'snow', dust = kind === 'dust';
    count = count || (snow ? 16000 : dust ? 2500 : 70000);
    this.u = {
      uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(...box) },
      uVel: { value: snow ? new THREE.Vector3(0.4, -1.1, 0.2) : dust ? new THREE.Vector3(0.6, 0.05, 0.25) : new THREE.Vector3(1.1, -9.5, 0.5) },
      uLen: { value: snow ? 0 : dust ? 0 : 0.7 }, uSize: { value: snow ? 0.018 : dust ? 0.01 : 0.0022 }, uOpacity: { value: snow ? 0.8 : dust ? 0.3 : 0.32 },
      uCol: { value: snow ? new THREE.Color(0.9, 0.92, 0.96) : dust ? new THREE.Color(1.0, 0.9, 0.72) : new THREE.Color(0.55, 0.6, 0.7) },
      uIndoor: { value: Array.from({ length: 8 }, (_, i) => indoor[i] ? new THREE.Vector4(...indoor[i]) : new THREE.Vector4(0, 0, -1, -1)) },
      uLights: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, -999, 0, 0)) },
      uLightCols: { value: Array.from({ length: 8 }, () => new THREE.Color()) },
    };
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const seeds = new Float32Array(count * 4); for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4)); g.instanceCount = count;
    const streak = kind === 'rain';
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.u,
      vertexShader: /* glsl */`
        attribute vec4 aSeed; uniform float uTime, uLen, uSize; uniform vec3 uCam, uBox, uVel; uniform vec4 uIndoor[8];
        uniform vec4 uLights[8]; uniform vec3 uLightCols[8];
        varying vec2 vQ; varying float vA; varying vec3 vL;
        void main(){
          vec3 vel = uVel * (0.8 + 0.4*aSeed.w);
          ${streak ? '' : 'vel.xz += vec2(sin(uTime*0.7 + aSeed.x*30.0), cos(uTime*0.6 + aSeed.z*30.0)) * 0.35;'}
          vec3 ctr = vec3(uCam.x, uCam.y + ${streak ? '6.0' : '2.0'}, uCam.z);
          vec3 p = aSeed.xyz*uBox + vel*uTime + vec3(${streak ? '0.0' : 'sin(uTime*0.5+aSeed.y*20.0)*0.4'}, 0.0, 0.0);
          p = ctr + (fract((p - ctr)/uBox + 0.5) - 0.5)*uBox;
          float inside = 0.0;
          for (int i = 0; i < 8; i++) { vec4 b = uIndoor[i]; if (p.x > b.x && p.x < b.z && p.z > b.y && p.z < b.w) inside = 1.0; }
          vec3 toCam = normalize(p - cameraPosition);
          float dist = distance(p, cameraPosition);
          vec3 wp;
          ${streak ? `
            vec3 dir = normalize(vel); float len = uLen * length(vel) / 9.5;
            vec3 side = normalize(cross(toCam, dir)); float w = max(uSize, dist*0.0006);
            wp = p + dir*(position.y - 0.5)*len + side*position.x*w;
            vA = uSize / w;` : `
            vec3 side = normalize(cross(toCam, vec3(0.0,1.0,0.0))); vec3 up = normalize(cross(side, toCam));
            float w = max(uSize, dist*0.0012);
            wp = p + side*position.x*w + up*(position.y-0.5)*2.0*w;
            vA = uSize / w;`}
          vQ = position.xy;
          vA *= smoothstep(${streak ? '1.0, 3.0' : '0.3, 1.2'}, dist) * smoothstep(uBox.x*0.5, uBox.x*0.25, dist) * (1.0 - inside) * step(0.02, p.y);
          vec3 L = vec3(0.0);
          for (int i = 0; i < 8; i++) { vec3 d = uLights[i].xyz - p; float d2 = dot(d,d); float fwd = max(dot(normalize(d), -toCam), 0.0); L += uLightCols[i] * uLights[i].w / (d2 + 0.6) * (0.4 + 2.0*fwd*fwd*fwd); }
          vL = L;
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform float uOpacity; uniform vec3 uCol; varying vec2 vQ; varying float vA; varying vec3 vL;
        void main(){
          ${streak ? 'float a = (1.0 - abs(vQ.x)) * smoothstep(0.0, 0.3, vQ.y) * smoothstep(1.0, 0.7, vQ.y);' : 'vec2 c = vec2(vQ.x, vQ.y*2.0-1.0); float a = smoothstep(1.0, 0.2, length(c));'}
          gl_FragColor = vec4(uCol + vL, a * vA * uOpacity);
        }`,
      transparent: true, depthWrite: false, blending: streak ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 6;
    scene.add(this.mesh);
  }
  setLights(sources, camPos) {
    const L = this.u.uLights.value, C = this.u.uLightCols.value;
    const near = sources.map(s => [s, s.pos.distanceToSquared(camPos)]).sort((a, b) => a[1] - b[1]).slice(0, 8);
    for (let i = 0; i < 8; i++) { const n = near[i]; if (!n) { L[i].set(0, -999, 0, 0); continue; } L[i].set(n[0].pos.x, n[0].pos.y, n[0].pos.z, n[0].strength); C[i].copy(n[0].color); }
  }
  update(t, cam) { this.u.uTime.value = t; this.u.uCam.value.copy(cam.position); }
  dispose(scene) { scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mat.dispose(); }
}

// ---------------------------------------------------------------- environment setup
export async function applyEnvironment(G, env) {
  const { scene, renderer } = G;
  const out = { objects: [], sun: null, sky: null, weather: null };
  // IBL
  const hdrTex = await hdr('hdri/' + (env.hdri || 'street_night') + '.hdr');
  hdrTex.mapping = THREE.EquirectangularReflectionMapping;
  if (!G.pmrem) G.pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = G.pmrem.fromEquirectangular(hdrTex).texture;
  scene.environment = envMap; scene.environmentIntensity = env.envI ?? 1; scene.environmentRotation.y = env.envRot || 0;
  out.envMap = envMap; out.hdr = hdrTex;
  // sky / background
  if (env.bg === 'sky') {
    const sky = new Sky(); sky.scale.setScalar(4000);
    const u = sky.material.uniforms; u.turbidity.value = env.turbidity ?? 4; u.rayleigh.value = env.rayleigh ?? 1.2; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.85;
    u.sunPosition.value.set(...env.sun.dir).normalize();
    scene.add(sky); out.sky = sky; scene.background = null;
  } else if (env.bg === 'night') { const s = nightSky(); scene.add(s); out.sky = s; scene.background = null; }
  else if (env.bg === 'gradient') { const s = gradientSky(...env.gradient); scene.add(s); out.sky = s; scene.background = null; }
  else if (env.bg === 'hdri') { scene.background = hdrTex; scene.backgroundIntensity = env.bgI ?? 1; scene.backgroundBlurriness = env.bgBlur ?? 0; scene.backgroundRotation.y = env.envRot || 0; }
  else scene.background = new THREE.Color(env.fog?.color || 0x202020);
  // fog
  scene.fog = env.fog ? new THREE.FogExp2(new THREE.Color(env.fog.color), env.fog.density) : null;
  // sun + hemi
  const hemi = new THREE.HemisphereLight(env.hemi?.sky ?? 0x8899aa, env.hemi?.ground ?? 0x443322, env.hemi?.i ?? 0.4);
  scene.add(hemi); out.objects.push(hemi);
  if (env.sun) {
    const sun = new THREE.DirectionalLight(env.sun.color, env.sun.intensity);
    sun.castShadow = true;
    const sz = env.sun.shadowSize ?? 45, Q = G.quality;
    sun.shadow.mapSize.set(Q >= 2 ? 4096 : Q === 1 ? 2048 : 1024, Q >= 2 ? 4096 : Q === 1 ? 2048 : 1024);
    sun.shadow.camera.left = -sz; sun.shadow.camera.right = sz; sun.shadow.camera.top = sz; sun.shadow.camera.bottom = -sz;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 400; sun.shadow.bias = -0.0002; sun.shadow.normalBias = 0.035;
    sun.userData.dir = new THREE.Vector3(...env.sun.dir).normalize();
    scene.add(sun, sun.target); out.sun = sun; out.objects.push(sun, sun.target);
  }
  renderer.toneMappingExposure = env.exposure ?? 1;
  if (env.weather) out.weather = new Weather(scene, env.weather, { indoor: env.indoor || [] });
  return out;
}
// keep the sun's shadow frustum centred on the player (texel-snapped to stop shimmering)
export function followSun(sun, center) {
  if (!sun) return;
  const d = sun.userData.dir, sz = sun.shadow.camera.right * 2, tex = sz / sun.shadow.mapSize.x;
  const c = center.clone(); c.x = Math.round(c.x / tex) * tex; c.z = Math.round(c.z / tex) * tex;
  sun.target.position.copy(c); sun.position.copy(c).addScaledVector(d, 150);
  sun.target.updateMatrixWorld(); sun.updateMatrixWorld();
}
