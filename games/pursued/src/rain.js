// Rain streaks that wrap around the camera, lit by the nearest light sources (drops glow
// inside lamp light and when backlit), plus splashes where they land.
import * as THREE from 'three';
import { LAYER_RAIN } from './wet.js';

const MAXL = 16;

const LIGHT_GLSL = /* glsl */`
  uniform vec4 uLights[${MAXL}];   // xyz position, w strength
  uniform vec3 uLightCols[${MAXL}];
  uniform vec3 uAmbient;
  vec3 dropLight(vec3 p, vec3 toCam){
    vec3 c = uAmbient;
    for (int i = 0; i < ${MAXL}; i++) {
      vec3 L = uLights[i].xyz - p;
      float d2 = dot(L, L);
      float att = uLights[i].w / (d2 + 0.6);
      // drops scatter strongly forward: brightest when the light is behind them
      float fwd = max(dot(normalize(L), -toCam), 0.0);
      att *= 0.4 + 2.2*fwd*fwd*fwd*fwd;
      c += uLightCols[i] * att;
    }
    return c;
  }
`;

// streak / splash exist only outside the building blocks; y is ground height
// PURSUED: a top-down mask of the neighbourhood (1 texel / metre): r = roofed, g = kerb height / 0.15
const GROUND_GLSL = /* glsl */`
  uniform sampler2D tMask; uniform vec4 uMaskXf;
  vec4 maskAt(vec2 xz){ return texture2D(tMask, (xz - uMaskXf.xy) * uMaskXf.zw); }
  float groundY(vec2 xz){ return maskAt(xz).g * 0.15; }
  float inBuilding(vec2 xz){ return step(0.5, maskAt(xz).r); }
`;

export class Rain {
  constructor(scene, { count = 90000, splashes = 7000 } = {}) {
    this.uniforms = {
      uTime: { value: 0 }, uCam: { value: new THREE.Vector3() },
      uBox: { value: new THREE.Vector3(56, 30, 56) },
      uVel: { value: new THREE.Vector3(1.2, -9.5, 0.6) },
      uLen: { value: 0.75 }, uWidth: { value: 0.004 }, uPix: { value: 0.001 },
      uDensity: { value: 1 }, uOpacity: { value: 0.5 },
      uLights: { value: Array.from({ length: MAXL }, () => new THREE.Vector4(0, -999, 0, 0)) },
      uLightCols: { value: Array.from({ length: MAXL }, () => new THREE.Color(0, 0, 0)) },
      uAmbient: { value: new THREE.Color(0.12, 0.13, 0.155) },
      tMask: { value: null }, uMaskXf: { value: new THREE.Vector4(0, 0, 1, 1) },
    };

    // ---- streaks ----
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    g.instanceCount = count;
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */`
        attribute vec4 aSeed;
        uniform float uTime, uLen, uWidth, uPix, uDensity;
        uniform vec3 uCam, uBox, uVel;
        varying vec2 vQ; varying vec3 vCol; varying float vA;
        ${LIGHT_GLSL}
        ${GROUND_GLSL}
        void main(){
          vec3 vel = uVel * (0.85 + 0.3*aSeed.w);
          vec3 ctr = vec3(uCam.x, max(uCam.y, 1.7) + 9.0, uCam.z);
          vec3 p = aSeed.xyz*uBox + vel*uTime;
          p = ctr + (fract((p - ctr)/uBox + 0.5) - 0.5)*uBox;
          vec3 dir = normalize(vel);
          float len = uLen * length(vel) / 9.5;
          vec3 toCam = normalize(p - cameraPosition);
          float dist = distance(p, cameraPosition);
          vec3 side = normalize(cross(toCam, dir));            // winding must face the camera
          float w = max(uWidth, dist*uPix*0.8);
          vec3 wp = p + dir*(position.y - 0.5)*len + side*position.x*w;
          vQ = position.xy;
          float a = uWidth / w;                                   // keep energy constant once sub-pixel
          a *= smoothstep(0.35, 1.2, dist) * smoothstep(42.0, 16.0, dist);
          a *= step(aSeed.w, uDensity);
          a *= step(groundY(p.xz), p.y) * (1.0 - inBuilding(p.xz));
          vA = a;
          vCol = dropLight(p, toCam);
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }`,
      fragmentShader: /* glsl */`
        varying vec2 vQ; varying vec3 vCol; varying float vA;
        uniform float uOpacity;
        void main(){
          float across = 1.0 - vQ.x*vQ.x;
          float along = sin(3.14159*vQ.y);
          float a = across*along*vA*uOpacity;
          if (a < 0.002) discard;
          gl_FragColor = vec4(vCol, a);
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    this.streaks = new THREE.Mesh(g, mat);
    this.streaks.frustumCulled = false;
    this.streaks.layers.set(LAYER_RAIN);
    this.streaks.renderOrder = 5;
    scene.add(this.streaks);

    // ---- splashes: tiny crowns of droplets on the ground ----
    const sg = new THREE.InstancedBufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0], 3));
    sg.setIndex([0, 1, 2, 0, 2, 3]);
    const ss = new Float32Array(splashes * 4);
    for (let i = 0; i < ss.length; i++) ss[i] = Math.random();
    sg.setAttribute('aSeed', new THREE.InstancedBufferAttribute(ss, 4));
    sg.instanceCount = splashes;
    const smat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */`
        attribute vec4 aSeed;
        uniform float uTime, uDensity; uniform vec3 uCam;
        varying vec2 vQ; varying vec3 vCol; varying float vLife, vA; varying vec4 vS;
        ${LIGHT_GLSL}
        ${GROUND_GLSL}
        float h11(float n){ return fract(sin(n*91.345)*47453.5453); }
        void main(){
          float rate = 2.2 + 1.5*aSeed.w;
          float ph = uTime*rate + aSeed.z*10.0;
          float cyc = floor(ph); vLife = fract(ph);
          float r = sqrt(h11(cyc + aSeed.x*100.0))*24.0;
          float ang = h11(cyc*1.7 + aSeed.y*100.0)*6.2832;
          vec3 p = vec3(uCam.x + cos(ang)*r, 0.0, uCam.z + sin(ang)*r);
          p.y = groundY(p.xz) + 0.003;
          vec3 toCam = normalize(p - cameraPosition);
          vec3 side = normalize(vec3(-toCam.z, 0.0, toCam.x));
          float s = 0.07 + 0.05*aSeed.y;
          vec3 wp = p + side*position.x*s + vec3(0.0, position.y*s*1.1, 0.0);
          vQ = position.xy; vS = aSeed;
          float dist = distance(p, cameraPosition);
          vA = step(aSeed.x, uDensity) * (1.0 - inBuilding(p.xz)) * smoothstep(24.0, 10.0, dist) * smoothstep(0.5, 1.5, dist);
          vCol = dropLight(p + vec3(0.0, 0.1, 0.0), toCam);
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }`,
      fragmentShader: /* glsl */`
        varying vec2 vQ; varying vec3 vCol; varying float vLife, vA; varying vec4 vS;
        uniform float uOpacity;
        void main(){
          float t = vLife;
          if (t > 0.45) discard;
          float tt = t/0.45;
          float a = 0.0;
          for (int k = 0; k < 7; k++) {
            float fk = float(k);
            float dx = (fract(sin((fk+1.0)*12.9898 + vS.z*78.2)*43758.5)*2.0-1.0);
            float vy = 0.55 + 0.45*fract(sin((fk+3.0)*4.1414 + vS.w*31.7)*23421.6);
            vec2 d = vec2(dx*tt*0.95, (vy*tt*2.2 - tt*tt*2.2)*1.0);
            float r = length(vQ - d);
            a += smoothstep(0.075, 0.02, r);
          }
          // the thin sheet of the crown at the base
          a += smoothstep(0.12, 0.0, vQ.y) * smoothstep(0.9, 0.2, abs(vQ.x)) * (1.0 - tt) * 0.8;
          a *= (1.0 - tt) * vA;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vCol*1.3, min(a, 1.0)*uOpacity);
        }`,
      transparent: true, depthWrite: false,
    });
    this.splashes = new THREE.Mesh(sg, smat);
    this.splashes.frustumCulled = false;
    this.splashes.layers.set(LAYER_RAIN);
    this.splashes.renderOrder = 5;
    scene.add(this.splashes);
  }

  setLights(list, camPos) {
    // list: [{pos: Vector3, color: Color, strength}] -> nearest MAXL to the camera
    const sorted = list.slice().sort((a, b) => a.pos.distanceToSquared(camPos) - b.pos.distanceToSquared(camPos));
    for (let i = 0; i < MAXL; i++) {
      const L = sorted[i];
      if (L) {
        this.uniforms.uLights.value[i].set(L.pos.x, L.pos.y, L.pos.z, L.strength);
        this.uniforms.uLightCols.value[i].copy(L.color);
      } else this.uniforms.uLights.value[i].set(0, -999, 0, 0);
    }
  }

  update(time, camera, height) {
    const u = this.uniforms;
    u.uTime.value = time;
    u.uCam.value.copy(camera.position);
    u.uPix.value = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / height;
  }
}

// Water shed by umbrella rims and kicked up by footsteps: CPU-simulated droplets drawn as short
// lit streaks, sharing the rain's light list.
export class Drips {
  constructor(scene, uniforms, max = 3000) {
    this.max = max; this.n = 0;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3); this.life = new Float32Array(max); this.floor = new Float32Array(max);
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aVel = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aPos', this.aPos); g.setAttribute('aVel', this.aVel);
    g.instanceCount = 0;
    this.geo = g;
    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: /* glsl */`
        attribute vec4 aPos; attribute vec3 aVel;
        uniform float uPix;
        varying vec2 vQ; varying vec3 vCol; varying float vA;
        ${LIGHT_GLSL}
        void main(){
          vec3 p = aPos.xyz;
          float sp = length(aVel) + 1e-4;
          vec3 dir = aVel / sp;
          float len = clamp(sp * 0.022, 0.012, 0.16);
          vec3 toCam = normalize(p - cameraPosition);
          vec3 side = normalize(cross(toCam, dir));
          float dist = distance(p, cameraPosition);
          float w = max(0.0035, dist*uPix*0.8);
          vec3 wp = p - dir*position.y*len + side*position.x*w;
          vQ = position.xy;
          vA = (0.0035 / w) * smoothstep(0.2, 0.6, dist) * min(1.0, aPos.w * 6.0);
          vCol = dropLight(p, toCam) * 1.3;
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }`,
      fragmentShader: /* glsl */`
        varying vec2 vQ; varying vec3 vCol; varying float vA;
        void main(){
          float a = (1.0 - vQ.x*vQ.x) * sin(3.14159*vQ.y) * vA * 0.8;
          if (a < 0.003) discard;
          gl_FragColor = vec4(vCol, a);
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.layers.set(LAYER_RAIN);
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
  }
  spawn(x, y, z, vx, vy, vz, floorY, life = 2) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.life[i] = life; this.floor[i] = floorY;
  }
  update(dt) {
    const P = this.p, V = this.v, L = this.life;
    for (let i = 0; i < this.n; i++) {
      V[i * 3 + 1] -= 9.8 * dt;
      P[i * 3] += V[i * 3] * dt; P[i * 3 + 1] += V[i * 3 + 1] * dt; P[i * 3 + 2] += V[i * 3 + 2] * dt;
      L[i] -= dt;
      if (L[i] <= 0 || P[i * 3 + 1] < this.floor[i]) {           // swap-remove
        const j = --this.n;
        P[i * 3] = P[j * 3]; P[i * 3 + 1] = P[j * 3 + 1]; P[i * 3 + 2] = P[j * 3 + 2];
        V[i * 3] = V[j * 3]; V[i * 3 + 1] = V[j * 3 + 1]; V[i * 3 + 2] = V[j * 3 + 2];
        L[i] = L[j]; this.floor[i] = this.floor[j];
        i--;
      }
    }
    const ap = this.aPos.array, av = this.aVel.array;
    for (let i = 0; i < this.n; i++) {
      ap[i * 4] = P[i * 3]; ap[i * 4 + 1] = P[i * 3 + 1]; ap[i * 4 + 2] = P[i * 3 + 2]; ap[i * 4 + 3] = L[i];
      av[i * 3] = V[i * 3]; av[i * 3 + 1] = V[i * 3 + 1]; av[i * 3 + 2] = V[i * 3 + 2];
    }
    this.aPos.needsUpdate = this.aVel.needsUpdate = true;
    this.aPos.clearUpdateRanges(); this.aPos.addUpdateRange(0, this.n * 4);
    this.aVel.clearUpdateRanges(); this.aVel.addUpdateRange(0, this.n * 3);
    this.geo.instanceCount = this.n;
  }
}
