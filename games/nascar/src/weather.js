// =====================================================================
// NASCAR :: weather.js - RAIN, AND WHAT THE ROAD DOES WHEN IT IS WET
// =====================================================================
//
// Liam: "I want rain reflections ... reflection textures".
//
// Three separate things, and only one of them is the rain itself:
//
//   THE RAIN is twelve thousand line segments in a box that travels with
//   the camera. Each one falls, and each one is SLANTED BY YOUR OWN
//   SPEED - at a hundred and ninety miles an hour rain does not fall, it
//   comes at you almost horizontally, and that single detail is most of
//   what makes a wet race feel fast. When a drop leaves the box it wraps
//   round to the other side, so twelve thousand segments cover the
//   entire visible world forever.
//
//   THE WET ROAD is not "the same road, darker". Water fills the texture
//   of the asphalt, so a wet racing surface goes dark AND smooth: the
//   albedo drops by half and the roughness falls from 0.94 to about
//   0.10, which turns the environment map from something you cannot see
//   into a mirror. That one material change does most of the work.
//
//   THE REFLECTION is a real planar mirror. A camera is placed mirrored
//   through the plane of the road under the player's car, renders the
//   world into a half-resolution target, and the road samples it
//   projectively. On a flat circuit this is textbook; on a BANKED oval
//   the road is not a plane at all, so the mirror is the plane TANGENT to
//   the road where you are - tilted by the local banking angle - which is
//   right where you are looking and wrong a quarter of a mile away, where
//   there is nothing to see anyway.
//
// And the racing line dries first. Forty cars running over the same two
// metres of road push the water out of it, so a drying track has a dark
// wet band and a pale dry groove, and the whole field moves down onto it.
// `dry` below is that, per sample, and it is why a wet race is worth
// running rather than just worth looking at.
import * as THREE from '../vendor/three.module.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const SKIES = {
  dry: { cloud: 0.30, storm: 0.0, rain: 0, name: 'DRY' },
  cloudy: { cloud: 0.75, storm: 0.15, rain: 0, name: 'OVERCAST' },
  light: { cloud: 0.88, storm: 0.45, rain: 0.35, name: 'LIGHT RAIN' },
  heavy: { cloud: 1.0, storm: 0.80, rain: 1.0, name: 'HEAVY RAIN' },
};

// =====================================================================
// THE RAIN
// =====================================================================
const RAIN_VERT = `
attribute float aSeed;
uniform vec3 uCam;
uniform vec3 uWind;      // UNIT vector: the way the drop is travelling
                         // relative to the camera
uniform float uTime;
uniform vec3 uBox;
uniform float uLen;
uniform float uHole;   // metres of nothing round the camera
varying float vFade;
void main() {
  // position.y is 0 for the head of the streak and 1 for the tail
  vec3 base = vec3(position.x, 0.0, position.z);
  // fall, and wrap inside a box that travels with the camera
  float fall = uTime * 9.5 + aSeed * 190.0;
  vec3 p = base;
  p.y = uBox.y - mod(fall, uBox.y * 2.0);
  p += uCam;
  p.x = uCam.x + mod(p.x - uCam.x + uBox.x, uBox.x * 2.0) - uBox.x;
  p.z = uCam.z + mod(p.z - uCam.z + uBox.z, uBox.z * 2.0) - uBox.z;
  // the streak: the tail is displaced BACK along the way the drop is
  // travelling relative to the camera, which at 190 mph is very nearly
  // straight at your face
  // THE STREAK. uLen is metres, and it has to stay metres: the first
  // version multiplied the length by the wind SPEED as well, so at 190 mph
  // every drop became a five-metre white spear and the screen filled with
  // a starburst you could not see the racetrack through.
  // THE HOLE ROUND THE CAMERA. Tested on the head of the streak, before
  // the tail is displaced, so the two ends of one line always agree.
  vec3 head = p;
  p -= uWind * uLen * position.y;
  vFade = 1.0 - position.y * 0.85;
  if (distance(head, uCam) < uHole) {
    // off the end of clip space: no fragment, no branch in the fragment
    // shader, no sorted-transparency surprise
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const RAIN_FRAG = `
precision mediump float;
uniform vec3 uColour;
uniform float uOpacity;
varying float vFade;
void main() { gl_FragColor = vec4(uColour, vFade * uOpacity); }`;

function makeRain(count = 9000) {
  const pos = new Float32Array(count * 6);
  const seed = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const x = (Math.random() - 0.5) * 2, z = (Math.random() - 0.5) * 2;
    const s = Math.random();
    // head
    pos[i * 6] = x; pos[i * 6 + 1] = 0; pos[i * 6 + 2] = z;
    // tail
    pos[i * 6 + 3] = x; pos[i * 6 + 4] = 1; pos[i * 6 + 5] = z;
    seed[i * 2] = s; seed[i * 2 + 1] = s;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  return g;
}

// =====================================================================
// THE PLANAR MIRROR
// =====================================================================
//
// Mirror the camera through a plane, render, and hand the result back as
// a texture the road samples projectively. The `textureMatrix` is the
// usual bias * projection * view of the mirrored camera, which turns a
// world position straight into a UV.
class Mirror {
  constructor(renderer, scale = 0.5) {
    this.renderer = renderer;
    this.scale = scale;
    this.cam = new THREE.PerspectiveCamera();
    this.textureMatrix = new THREE.Matrix4();
    this.plane = new THREE.Plane();
    this.normal = new THREE.Vector3(0, 1, 0);
    this.point = new THREE.Vector3();
    this.rt = null;
    this.size = new THREE.Vector2();
    // the one clipping plane, installed on the renderer for the whole
    // session and parked underground when it is not in use
    this.clip = new THREE.Plane(new THREE.Vector3(0, 1, 0), 10000);
    renderer.clippingPlanes = [this.clip];
    renderer.localClippingEnabled = true;
  }

  setSize(w, h) {
    const rw = Math.max(2, Math.floor(w * this.scale)), rh = Math.max(2, Math.floor(h * this.scale));
    if (this.rt) this.rt.dispose();
    this.rt = new THREE.WebGLRenderTarget(rw, rh, {
      type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    });
    this.size.set(rw, rh);
  }

  /**
   * @param point   a point on the road under the car
   * @param normal  the road's up vector there (tilted by the banking)
   */
  render(scene, camera, point, normal, hide) {
    if (!this.rt) return null;
    this.plane.setFromNormalAndCoplanarPoint(normal, point);
    // reflect the camera through the plane
    const n = this.plane.normal, d = this.plane.constant;
    const refl = new THREE.Matrix4().set(
      1 - 2 * n.x * n.x, -2 * n.x * n.y, -2 * n.x * n.z, -2 * n.x * d,
      -2 * n.y * n.x, 1 - 2 * n.y * n.y, -2 * n.y * n.z, -2 * n.y * d,
      -2 * n.z * n.x, -2 * n.z * n.y, 1 - 2 * n.z * n.z, -2 * n.z * d,
      0, 0, 0, 1,
    );
    this.cam.copy(camera);
    this.cam.matrixWorld.copy(camera.matrixWorld).premultiply(refl);
    this.cam.matrixWorldInverse.copy(this.cam.matrixWorld).invert();
    this.cam.projectionMatrix.copy(camera.projectionMatrix);
    this.cam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    // ...and flip the winding, because a mirrored view turns every
    // triangle inside out
    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(this.cam.projectionMatrix);
    this.textureMatrix.multiply(this.cam.matrixWorldInverse);

    const r = this.renderer;
    const wasShadow = r.shadowMap.enabled;
    r.shadowMap.enabled = false;

    // ---- CLIP EVERYTHING BELOW THE ROAD ---------------------------------
    //
    // The first version HID the road meshes during the mirror pass, which
    // is the obvious thing and is wrong: underneath the racetrack there is
    // a kilometre-wide disc of infield grass, so hiding the road simply
    // showed the grass instead and the entire racing surface reflected
    // bright green.
    //
    // A clipping plane is the right tool. three keeps whatever is on the
    // POSITIVE side, which is everything above the road, so the road
    // itself, the grass beneath it and anything else down there all
    // vanish from the reflection together.
    //
    // The plane object is the SAME one every frame and it is installed on
    // the renderer once at startup, because changing the NUMBER of
    // clipping planes recompiles every shader in the scene and doing that
    // twice a frame is a slideshow. Between mirror passes it is pushed a
    // kilometre underground, where it clips nothing.
    this.clip.copy(this.plane);
    const hidden = [];
    for (const o of hide) { if (o && o.visible) { o.visible = false; hidden.push(o); } }
    const flip = r.getRenderTarget();
    r.setRenderTarget(this.rt);
    r.state.buffers.color.setMask(true);
    r.clear();
    r.render(scene, this.cam);
    r.setRenderTarget(flip);
    for (const o of hidden) o.visible = true;
    // park the plane where it cannot clip anything
    this.clip.set(new THREE.Vector3(0, 1, 0), 10000);
    r.shadowMap.enabled = wasShadow;
    return this.rt.texture;
  }
}

// =====================================================================
export class Weather {
  constructor(renderer, scene, camera, sky) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.sky = sky;
    this.kind = 'dry';
    this.rain = 0;              // how hard it is coming down
    this.dryLine = 0;           // how far the groove has dried out
    this.water = 0;             // how much is ON the road, which lags both ways
    this.time = 0;

    const g = makeRain(7000);
    this.rainUniforms = {
      uCam: { value: new THREE.Vector3() },
      uWind: { value: new THREE.Vector3(0, 1, 0) },
      uTime: { value: 0 },
      uBox: { value: new THREE.Vector3(34, 22, 34) },
      uHole: { value: 0.9 },
      uLen: { value: 0.55 },
      uColour: { value: new THREE.Color(0xc9d6e2) },
      uOpacity: { value: 0 },
    };
    this.rainMesh = new THREE.LineSegments(g, new THREE.ShaderMaterial({
      uniforms: this.rainUniforms,
      vertexShader: RAIN_VERT,
      fragmentShader: RAIN_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    }));
    this.rainMesh.frustumCulled = false;
    this.rainMesh.name = 'rain';
    this.rainMesh.visible = false;
    this.rainMesh.renderOrder = 900;
    scene.add(this.rainMesh);

    this.mirror = new Mirror(renderer, 0.45);
    this.roadMats = [];
    this.roadMeshes = [];
    this.uniforms = {
      tReflect: { value: null },
      uTexMatrix: { value: new THREE.Matrix4() },
      uWet: { value: 0 },
      uDryLine: { value: 0 },
      uGroove: { value: new THREE.Vector2(0, 3.4) },
    };
  }

  setSize(w, h) { this.mirror.setSize(w, h); }

  /**
   * Find the road surfaces in a freshly built speedway and teach their
   * materials to reflect. Called once per session.
   */
  attach(trackArt) {
    this.roadMats = [];
    this.roadMeshes = [];
    this.art = trackArt;
    // where the groove runs: at the bottom in the turns and a metre and
    // a half further out on the straights, so one band covers both
    this.uniforms.uGroove.value.set(trackArt.oval.halfWidth - 2.6, 3.4);
    const want = new Set(['road', 'apron', 'pitroad', 'groove', 'startline', 'lines']);
    trackArt.group.traverse((o) => {
      if (!o.isMesh || !want.has(o.name)) return;
      this.roadMeshes.push(o);
      const m = o.material;
      if (m.userData.wetted) { this.roadMats.push(m); return; }
      m.userData.wetted = true;
      m.userData.dryRough = m.roughness;
      m.userData.dryColour = m.color.clone();
      m.userData.u = this.uniforms;
      // ---- THE REFLECTION, injected into a stock material ---------------
      // Everything three gives a MeshStandardMaterial is wanted; all this
      // adds is one projective texture lookup blended over the top by a
      // fresnel term, so a wet road reflects hard at a glancing angle and
      // barely at all straight down, which is what water does.
      m.onBeforeCompile = (sh) => {
        sh.uniforms.tReflect = this.uniforms.tReflect;
        sh.uniforms.uTexMatrix = this.uniforms.uTexMatrix;
        sh.uniforms.uWet = this.uniforms.uWet;
        sh.uniforms.uDryLine = this.uniforms.uDryLine;
        sh.uniforms.uGroove = this.uniforms.uGroove;
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', `#include <common>
            uniform mat4 uTexMatrix;
            varying vec4 vReflCoord;
            varying vec3 vWorldPos;
            varying vec2 vRoadUv;`)
          .replace('#include <project_vertex>', `#include <project_vertex>
            vec4 wp = modelMatrix * vec4(transformed, 1.0);
            vWorldPos = wp.xyz;
            vReflCoord = uTexMatrix * wp;
            // the road's own u is metres ACROSS the track over eight. It
            // is read straight off the attribute rather than out of
            // three's vMapUv, whose name moves between versions.
            vRoadUv = uv;`);
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', `#include <common>
            uniform sampler2D tReflect;
            uniform float uWet;
            uniform float uDryLine;
            uniform vec2 uGroove;
            varying vec4 vReflCoord;
            varying vec3 vWorldPos;
            varying vec2 vRoadUv;`)
          .replace('#include <opaque_fragment>', `#include <opaque_fragment>
            // THE DRYING LINE. onLine is 1 in the middle of the groove
            // and 0 outside it; the water comes off there first.
            float lat = vRoadUv.x * 8.0;
            float onLine = 1.0 - smoothstep(uGroove.y * 0.45, uGroove.y, abs(lat - uGroove.x));
            float wetHere = uWet * (1.0 - uDryLine * onLine * 0.92);
            // a drying line is visibly PALER than the wet road round it,
            // which is how you find it from the cockpit
            gl_FragColor.rgb *= 1.0 + uDryLine * onLine * uWet * 0.42;
            if (wetHere > 0.01) {
              float uWet = wetHere;
              vec3 V = normalize(cameraPosition - vWorldPos);
              float fres = pow(1.0 - clamp(dot(V, normalize(vNormal)), 0.0, 1.0), 3.0);
              vec2 ruv = vReflCoord.xy / max(vReflCoord.w, 0.0001);
              // FADE OUT AT THE EDGE OF THE MIRROR'S FRUSTUM. Cutting the
              // reflection off with an if() drew a hard diagonal line
              // across the racing surface where the mirrored camera
              // stopped seeing - half the road a mirror, half of it dry
              // asphalt, with a straight edge between them.
              vec2 e = smoothstep(vec2(0.0), vec2(0.09), ruv)
                     * (1.0 - smoothstep(vec2(0.91), vec2(1.0), ruv));
              float edge = e.x * e.y * step(0.0, vReflCoord.w);
              vec3 refl = texture2D(tReflect, clamp(ruv, 0.0, 1.0)).rgb;
              gl_FragColor.rgb = mix(gl_FragColor.rgb, refl,
                clamp(uWet * (0.10 + fres * 0.62) * edge, 0.0, 0.80));
            }`);
      };
      m.needsUpdate = true;
      this.roadMats.push(m);
    });
  }

  set(kind) {
    this.kind = kind;
    const s = SKIES[kind] || SKIES.dry;
    this.sky.setWeather({ hour: 14, cloud: s.cloud, storm: s.storm });
    this.targetRain = s.rain;
    return this;
  }

  /**
   * @param player  the Runner whose road plane the mirror uses
   * @param oval    for the local banking
   */
  step(dt, player, oval) {
    //  is used by the rain slant and the streak length below
    this.time += dt;
    const target = this.targetRain === undefined ? 0 : this.targetRain;
    this.rain += clamp(target - this.rain, -dt * 0.3, dt * 0.3);
    // the WATER ON THE ROAD lags the rain both ways: it takes a minute to
    // puddle and several to dry, which is the whole drama of a changeable
    // afternoon
    const wantWater = clamp(this.rain * 1.1, 0, 1);
    this.water += clamp(wantWater - this.water, -dt * 0.035, dt * 0.09);

    // THE DRYING LINE. While it is coming down there is no dry line and
    // the whole road is the same; the moment it eases off, the cars
    // start picking the water up off the groove they are running and a
    // strip opens down the middle of it. Wet again in five seconds, dry
    // in about forty, which is roughly the real ratio and is what makes
    // a changeable afternoon worth driving.
    const wantDry = clamp(1.0 - this.rain * 5.0, 0, 1) * clamp(this.water * 3, 0, 1);
    const rate = wantDry > this.dryLine ? 0.026 : 0.22;
    this.dryLine += clamp(wantDry - this.dryLine, -dt * 0.22, dt * rate);

    // ---- the rain itself --------------------------------------------------
    const u = this.rainUniforms;
    this.rainMesh.visible = this.rain > 0.01;
    u.uTime.value = this.time;
    u.uOpacity.value = this.rain * 0.30;
    // a real rain streak on a 1/60 s exposure is a couple of hand-spans,
    // and it gets longer as the car goes faster because the drop crosses
    // more of the frame - but it is bounded, not unbounded
    const v = player ? Math.min(player.car.speed, 95) : 0;
    u.uLen.value = 0.16 + this.rain * 0.16 + v * 0.0055;
    this.camera.getWorldPosition(u.uCam.value);
    // SLANTED BY YOUR OWN SPEED. Rain falls at about 9 m/s; a Cup car does
    // 85. Relative to the car the drops are travelling almost horizontally
    // and almost straight at the windscreen, and drawing them falling
    // vertically is the single most obvious way to get rain wrong.
    if (player) {
      const c = player.car;
      u.uWind.value.set(-c.vx * 0.55, 9.5, -c.vz * 0.55).normalize();
    } else {
      u.uWind.value.set(0.6, 9.5, 0).normalize();
    }

    // ---- what the water does to the road ----------------------------------
    for (const m of this.roadMats) {
      if (m.userData.dryRough === undefined) continue;
      // WET, NOT BLACK. Water fills the texture of the asphalt so the
      // surface goes dark and smooth - but a wet racetrack under a grey
      // sky is a MIRROR, and a mirror full of grey sky is mid-grey, not
      // black. Taking 55% of the albedo away and leaving it there made the
      // racing surface disappear out of the picture entirely.
      m.roughness = m.userData.dryRough * (1 - this.water) + 0.11 * this.water;
      m.color.copy(m.userData.dryColour).multiplyScalar(1 - this.water * 0.32);
      m.envMapIntensity = 1 + this.water * 2.2;
      m.metalness = this.water * 0.30;
    }
    this.uniforms.uWet.value = this.water;
    this.uniforms.uDryLine.value = this.dryLine;
    this.player = player;
    this.oval = oval;
  }

  /**
   * The mirror pass. Called every frame BEFORE the main render, and only
   * when there is water to reflect in.
   */
  render() {
    if (this.water < 0.03 || !this.player || !this.oval) {
      this.uniforms.tReflect.value = null;
      return;
    }
    const p = this.player;
    const oval = this.oval;
    const pt = oval.points[p.i];
    // the road's own up vector: straight up, tilted by the banking about
    // the track's forward axis. On a banked oval the reflecting plane is
    // NOT horizontal and using a horizontal one puts the reflection of the
    // grandstand out in the infield.
    const fwd = new THREE.Vector3(Math.sin(pt.h), 0, Math.cos(pt.h));
    const up = new THREE.Vector3(0, 1, 0);
    // A RAMP RISING TO THE RIGHT HAS A NORMAL LEANING LEFT. Rotating +Y
    // about the track's forward axis by +bank leans it toward +X, which is
    // the car's left and the inside of the corner - which is where the
    // road's normal actually points on a left-hand banking. With the sign
    // the other way the mirror was sixty degrees out and reflected the
    // infield into the racing surface.
    up.applyAxisAngle(fwd, p.bank);
    const point = new THREE.Vector3(p.car.x, p.y + 0.02, p.car.z);
    // only the rain is hidden: the clipping plane deals with the road and
    // everything under it
    const tex = this.mirror.render(this.scene, this.camera, point, up, [this.rainMesh]);
    this.uniforms.tReflect.value = tex;
    this.uniforms.uTexMatrix.value.copy(this.mirror.textureMatrix);
  }

  /** for the HUD */
  get label() { return (SKIES[this.kind] || SKIES.dry).name; }
}
