// =====================================================================
// NASCAR :: sky.js - THE SKY, AND THE LIGHT THAT COMES OUT OF IT
// =====================================================================
//
// Liam: "no cartoon lines but real motion blur like a high quality
// racing game with metal reflecting and everything".
//
// Metal reflecting is the whole reason this file exists. A
// MeshPhysicalMaterial with metalness on it and NOTHING TO REFLECT comes
// out black - it is a mirror in an empty room. So before any of the paint
// can look like paint, there has to be a world for it to reflect, and
// that world is this:
//
//   THE DOME is a shader, not a texture. A gradient from zenith to
//   horizon in real-ish colours, a sun disc with a glow round it, and
//   CLOUDS made of four octaves of value noise on the view direction
//   projected up onto a plane at two thousand metres. They drift. They
//   are what makes a still frame look like a photograph rather than a
//   diagram, because a plain blue gradient reads as paper.
//
//   THE ENVIRONMENT MAP is that same dome, plus a ground plane and a band
//   of grandstand grey at the horizon, baked through three.js's PMREM
//   into the pre-filtered cube every PBR material in the game samples.
//   That is why the cars have a sky in their roofs, a horizon line down
//   their flanks and a dark ground in their lower panels - which is all
//   that "it looks like metal" actually is.
//
//   IT IS REBUILT WHEN THE WEATHER CHANGES and at no other time. A PMREM
//   bake is about ten milliseconds; doing it per frame would be mad and
//   doing it never would leave a sunny reflection in a car driving
//   through a rainstorm.
import * as THREE from '../vendor/three.module.js';

const SKY_VERT = `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
}`;

// ---------------------------------------------------------------------
// The sky fragment shader.
//
// Three things stacked: the gradient, the sun, the clouds. The gradient
// is two mixes (zenith to sky to haze) rather than one, because a single
// mix from blue to white gives that airbrushed poster look and real sky
// has a distinctly pale, slightly warm band sitting on the horizon under
// a much deeper blue.
// ---------------------------------------------------------------------
const SKY_FRAG = `
precision highp float;
varying vec3 vDir;
uniform vec3 uSun;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uHaze;
uniform float uTime;
uniform float uCloud;      // 0 clear .. 1 overcast
uniform float uDark;       // how much the storm has taken the light away
uniform float uSunSize;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int k = 0; k < 5; k++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}

void main() {
  vec3 d = normalize(vDir);
  float up = clamp(d.y, -1.0, 1.0);

  // ---- the gradient --------------------------------------------------
  float t = pow(max(up, 0.0), 0.42);
  vec3 col = mix(uHorizon, uZenith, t);
  // the pale warm band that sits ON the horizon, which is what sells it
  col = mix(uHaze, col, smoothstep(-0.02, 0.22, up));

  // ---- the sun, and the glow that comes off it -------------------------
  float sd = max(dot(d, uSun), 0.0);
  col += vec3(1.0, 0.86, 0.68) * pow(sd, 900.0 / max(uSunSize, 0.05)) * 12.0;
  col += vec3(1.0, 0.80, 0.58) * pow(sd, 8.0) * 0.28 * (1.0 - uCloud * 0.7);

  // ---- clouds ----------------------------------------------------------
  // The view direction projected up onto a flat deck. Near the horizon
  // that projection runs away to infinity, which is exactly right: cloud
  // detail compresses into a band as it recedes, the way it does outside.
  if (up > 0.002) {
    vec2 uv = d.xz / max(up, 0.06) * 0.35;
    uv += vec2(uTime * 0.0035, uTime * 0.0012);
    float f = fbm(uv);
    float f2 = fbm(uv * 2.7 + 19.0);
    float cover = mix(0.72, 0.30, uCloud);
    float m = smoothstep(cover, cover + 0.22, f * 0.72 + f2 * 0.28);
    // lit on top, grey underneath - the sun is up there and we are not
    float lit = 0.55 + 0.45 * smoothstep(0.0, 0.4, f2);
    vec3 cloud = mix(vec3(0.52, 0.55, 0.60), vec3(1.02, 1.00, 0.97), lit);
    cloud = mix(cloud, cloud * 0.55, uDark);
    // fade them out into the haze at the horizon rather than cutting them off
    m *= smoothstep(0.0, 0.16, up);
    col = mix(col, cloud, m * (0.55 + 0.45 * uCloud));
  }

  col *= mix(1.0, 0.42, uDark);
  gl_FragColor = vec4(col, 1.0);
}`;

export class Sky {
  /**
   * @param renderer  needed to bake the environment map
   */
  constructor(renderer) {
    this.renderer = renderer;
    this.uniforms = {
      uSun: { value: new THREE.Vector3(0.42, 0.62, -0.66).normalize() },
      uZenith: { value: new THREE.Color(0x2a5fa8) },
      uHorizon: { value: new THREE.Color(0x9cc2de) },
      uHaze: { value: new THREE.Color(0xdfe2dd) },
      uTime: { value: 0 },
      uCloud: { value: 0.35 },
      uDark: { value: 0 },
      uSunSize: { value: 1 },
    };
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      toneMapped: true,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), this.mat);
    this.mesh.scale.setScalar(9000);
    this.mesh.renderOrder = -1000;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'sky';

    // ---- the little scene the environment map is baked from -------------
    // The dome on its own would give every car a bright sky underneath it
    // as well as above. A ground disc and a grey band where the grandstands
    // are cost nothing and are the difference between a car that looks like
    // a chrome bauble and one that looks like it is standing on a racetrack.
    this.envScene = new THREE.Scene();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), this.mat);
    dome.scale.setScalar(500);
    this.envScene.add(dome);
    const ground = new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 12, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5),
      new THREE.MeshBasicMaterial({ color: 0x3b4436, side: THREE.BackSide, fog: false }),
    );
    ground.scale.setScalar(499);
    this.envScene.add(ground);
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(460, 460, 90, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x5a6068, side: THREE.BackSide, fog: false }),
    );
    band.position.y = 30;
    this.envScene.add(band);
    this.envGround = ground;
    this.envBand = band;

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.pmrem.compileEquirectangularShader();
    this.target = null;
    this.bake();
  }

  /** the sun direction, as the renderer's directional light wants it */
  get sunDir() { return this.uniforms.uSun.value; }

  /**
   * Set the light. `hour` runs 8 (low morning sun) to 17 (low evening),
   * `cloud` 0 to 1, `wet` 0 to 1 for a storm.
   */
  setWeather({ hour = 14, cloud = 0.35, storm = 0 } = {}) {
    const t = THREE.MathUtils.clamp((hour - 8) / 9, 0, 1);
    const el = Math.sin(t * Math.PI) * 0.86 + 0.06;          // sun elevation, 0..0.92
    const az = -0.9 + t * 1.8;
    this.uniforms.uSun.value.set(Math.sin(az) * Math.sqrt(1 - el * el), el,
      -Math.cos(az) * Math.sqrt(1 - el * el)).normalize();
    this.uniforms.uCloud.value = cloud;
    this.uniforms.uDark.value = storm;
    // a low sun turns the horizon warm and the zenith deep
    const low = 1 - el;
    this.uniforms.uZenith.value.setHSL(0.60 - low * 0.02, 0.55 - storm * 0.35, 0.34 + el * 0.12 - storm * 0.14);
    this.uniforms.uHorizon.value.setHSL(0.57 - low * 0.05, 0.36 - storm * 0.26, 0.63 + el * 0.06 - storm * 0.26);
    this.uniforms.uHaze.value.setHSL(0.10 + (1 - low) * 0.4, 0.22 - storm * 0.18, 0.82 - storm * 0.36);
    this.envBand.material.color.setHSL(0.6, 0.04, 0.34 - storm * 0.12);
    this.envGround.material.color.setHSL(0.26, 0.20 - storm * 0.1, 0.22 - storm * 0.08);
    this.bake();
    return this;
  }

  /** bake the dome into the pre-filtered cube the PBR materials sample */
  bake() {
    if (this.target) this.target.dispose();
    this.target = this.pmrem.fromScene(this.envScene, 0.04, 1, 600);
    this.envMap = this.target.texture;
    return this.envMap;
  }

  /** the clouds drift; nothing else moves */
  step(dt) { this.uniforms.uTime.value += dt; }

  /** the colour to fog the world out to, so the horizon joins up */
  get fogColour() {
    const c = this.uniforms.uHaze.value.clone();
    return c.lerp(this.uniforms.uHorizon.value, 0.45);
  }

  dispose() {
    if (this.target) this.target.dispose();
    this.pmrem.dispose();
  }
}
