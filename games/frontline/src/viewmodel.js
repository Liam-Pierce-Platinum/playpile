// First-person viewmodel: gun + gloved arms in their own scene/camera so they never clip
// into walls. Handles sway, bob, recoil kick, ADS alignment, reload/switch/sprint poses,
// knife slash, grenade toss and ejected shell casings.
import * as THREE from '../vendor/three.module.js';
import { buildGun, MAT, TEAM_LOOK } from './models.js';
import { WEAPONS } from './weapons.js';
import { lerp, clamp } from './util.js';

const Y = new THREE.Vector3(0, 1, 0);
const VS = 0.62; // viewmodel scale

export class ViewModel {
  constructor(renderer) {
    this.R = renderer;
    this.scene = renderer.vmScene; this.cam = renderer.vmCamera;
    this.root = new THREE.Group();
    this.cam.add(this.root);
    this.pivot = new THREE.Group(); this.root.add(this.pivot);
    this.inner = new THREE.Group(); this.inner.scale.setScalar(VS); this.pivot.add(this.inner);
    const hemi = new THREE.HemisphereLight('#dfe8ff', '#5a4a3a', 1.3);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight('#fff0dd', 1.8); this.sun.position.set(-1, 2, 1); this.scene.add(this.sun);
    this.flashLight = new THREE.PointLight(0xffb050, 0, 2.5, 2); this.root.add(this.flashLight);
    this.t = 0; this.kick = 0; this.kickRot = 0; this.swayX = 0; this.swayY = 0; this.bob = 0;
    this.switchK = 1; this.id = null;
    this.casings = [];
    const cg = new THREE.CylinderGeometry(0.0035, 0.0035, 0.016, 5);
    const cm = new THREE.MeshLambertMaterial({ color: 0xc8a040, emissive: 0x302000 });
    for (let i = 0; i < 12; i++) { const m = new THREE.Mesh(cg, cm); m.visible = false; this.root.add(m); this.casings.push({ m, v: new THREE.Vector3(), life: 0 }); }
    this.ci = 0;
  }
  setWeapon(slot, team) {
    if (this.gun) this.inner.remove(this.gun);
    if (this.arms) this.inner.remove(this.arms);
    const w = WEAPONS[slot.id];
    this.w = w; this.id = slot.id;
    this.gun = buildGun(slot.id, slot.att, MAT.world);
    this.gun.traverse((o) => { o.castShadow = false; });
    this.inner.add(this.gun);
    this.sightY = this.gun.userData.sightY * VS;
    this.scoped = this.gun.userData.scoped;
    // arms
    const L = TEAM_LOOK[team];
    this.arms = new THREE.Group();
    const mk = (a, b, col, th) => {
      const len = a.distanceTo(b);
      const m = new THREE.Mesh(new THREE.BoxGeometry(th, th, len), new THREE.MeshLambertMaterial({ color: col, flatShading: true }));
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.lookAt(b);
      this.arms.add(m);
      return m;
    };
    const ga = w.hold === 'pistol' || w.hold === 'knife';
    const grip = new THREE.Vector3(0, -0.07, ga ? 0.03 : 0.06);
    const fore = w.gripAt ? new THREE.Vector3(w.gripAt[0], w.gripAt[1] - 0.04, w.gripAt[2]) : new THREE.Vector3(0, -0.05, -0.08);
    if (slot.att.includes('grip') && w.gripAt) fore.y -= 0.07;
    // right arm: hand at grip, elbow low right/back
    const rElbow = new THREE.Vector3(0.09, -0.22, 0.28), rShoulder = new THREE.Vector3(0.22, -0.32, 0.65);
    mk(grip, rElbow, L.uniform2, 0.07); mk(rElbow, rShoulder, L.uniform, 0.085);
    const rh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.09), new THREE.MeshLambertMaterial({ color: 0x2a2a28, flatShading: true }));
    rh.position.copy(grip).add(new THREE.Vector3(0, 0.0, 0.0)); this.arms.add(rh);
    // left arm: hand on the handguard (or supporting the pistol)
    const lHand = ga ? new THREE.Vector3(-0.025, -0.08, 0.04) : fore;
    const lElbow = new THREE.Vector3(-0.17, -0.2, lHand.z + 0.26), lShoulder = new THREE.Vector3(-0.3, -0.3, 0.62);
    mk(lHand, lElbow, L.uniform2, 0.07); mk(lElbow, lShoulder, L.uniform, 0.085);
    const lh = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.1), new THREE.MeshLambertMaterial({ color: 0x2a2a28, flatShading: true }));
    lh.position.copy(lHand); this.arms.add(lh);
    // team cuff stripe
    const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.03, 0.03), new THREE.MeshBasicMaterial({ color: L.accent }));
    cuff.position.copy(rElbow).lerp(grip, 0.55); cuff.lookAt(grip); this.arms.add(cuff);
    this.inner.add(this.arms);
    this.magHome = this.gun.userData.mag ? this.gun.userData.mag.position.clone() : null;
    this.switchK = 0;
  }
  shot(st) {
    this.kick = Math.min(1.4, this.kick + st.recoil.kick * 10);
    this.kickRot = Math.min(1.5, this.kickRot + st.recoil.v * 0.12);
    this.flashT = st.suppressed ? 0 : 0.05;
    if (st.id !== 'shotgun' && st.id !== 'rocket' && st.id !== 'knife') this.eject();
  }
  eject() {
    const c = this.casings[this.ci]; this.ci = (this.ci + 1) % this.casings.length;
    c.m.position.set(this.pivot.position.x + 0.02, this.pivot.position.y + 0.03, this.pivot.position.z - 0.12);
    c.v.set(1.6 + Math.random() * 0.6, 1.0 + Math.random() * 0.5, -0.1);
    c.m.rotation.set(Math.random() * 3, 0, 1.5);
    c.life = 0.28; c.m.visible = true;
  }
  update(dt, p, look) {
    // p: player soldier; look: {dx, dy} mouse delta this frame
    this.t += dt;
    if (!this.gun) return;
    const ads = p.adsK;
    const sprint = p.sprinting ? 1 : 0;
    this.sprintK = lerp(this.sprintK || 0, sprint, dt * 9);
    this.switchK = Math.min(1, this.switchK + dt / 0.35);
    const sw = 1 - this.switchK;
    // sway (lags behind look), bob
    this.swayX = lerp(this.swayX, clamp(-look.dx * 0.0016, -0.06, 0.06), dt * 10);
    this.swayY = lerp(this.swayY, clamp(look.dy * 0.0016, -0.06, 0.06), dt * 10);
    const sp = p.onGround ? clamp(p.speedNow / 4.7, 0, 1.6) : 0;
    this.bob += dt * (6 + sp * 4) * (sp > 0.05 ? 1 : 0);
    const bobA = sp * (1 - ads * 0.85) * (sprint ? 1.6 : 1);
    const bx = Math.sin(this.bob) * 0.012 * bobA, by = -Math.abs(Math.cos(this.bob)) * 0.014 * bobA;
    const breathe = Math.sin(this.t * 1.6) * 0.0025 * (1 - ads * 0.8);
    this.kick = Math.max(0, this.kick - dt * 9);
    this.kickRot = Math.max(0, this.kickRot - dt * 7);
    // poses
    const hip = new THREE.Vector3(this.w.hold === 'pistol' ? 0.1 : 0.12, this.w.hold === 'pistol' ? -0.11 : -0.125, this.w.hold === 'pistol' ? -0.3 : -0.3);
    if (this.w.hold === 'rocket') hip.set(0.17, -0.13, -0.2);
    if (this.w.hold === 'knife') hip.set(0.12, -0.12, -0.22);
    // aimed: far enough forward that the receiver does not swallow the bottom of the screen
    const adsPos = new THREE.Vector3(0, -this.sightY, this.scoped ? -0.2 : this.w.hold === 'pistol' ? -0.34 : -0.33);
    const pos = hip.clone().lerp(adsPos, ads);
    pos.x += bx + this.swayX * (1 - ads * 0.7); pos.y += by + this.swayY * (1 - ads * 0.7) + breathe;
    pos.z += this.kick * 0.045 * (1 - ads * 0.4);
    pos.y -= sw * 0.35;
    let rx = this.kickRot * 0.09 * (1 - ads * 0.5) + this.swayY * 1.5, ry = this.swayX * 2, rz = this.swayX * 1.5;
    // sprint pose
    const sk = this.sprintK;
    pos.x += sk * 0.04; pos.y -= sk * 0.04; rx += -sk * 0.25; ry += sk * 0.7; rz += sk * 0.2;
    // reload pose: dip + roll, mag drops
    const rl = p.reloadT > 0 && !p.w.s.reloadPer ? 1 - p.reloadT / p.w.s.reload : 0;
    const shellLoad = p.reloadT > 0 && p.w.s.reloadPer;
    if (rl > 0) {
      const k = Math.sin(clamp(rl, 0, 1) * Math.PI);
      pos.y -= k * 0.06; rz += k * 0.55; rx += k * 0.2;
      const mag = this.gun.userData.mag;
      if (mag && this.magHome) {
        const out = rl < 0.5 ? Math.min(1, rl / 0.25) : Math.max(0, 1 - (rl - 0.5) / 0.25);
        mag.position.copy(this.magHome); mag.position.y -= out * 0.25; mag.position.z += out * 0.05;
        mag.visible = !(rl > 0.3 && rl < 0.55);
      }
    } else if (this.gun.userData.mag && this.magHome) { this.gun.userData.mag.position.copy(this.magHome); this.gun.userData.mag.visible = true; }
    if (shellLoad) { const k = 0.5 + Math.sin(this.t * 12) * 0.5; rz += 0.35; rx += 0.12 + k * 0.05; pos.y -= 0.03; }
    // grenade throw: gun drops away
    if (p.throwT > 0) { const k = Math.sin((p.throwT / 0.9) * Math.PI); pos.y -= k * 0.25; rx -= k * 0.4; }
    // knife slash
    if (p.meleeT > 0) { const k = 1 - p.meleeT / 0.55; const s = Math.sin(k * Math.PI); pos.x -= s * 0.15; pos.z -= s * 0.12; ry += s * 1.0; rz -= s * 0.6; }
    this.pivot.position.copy(pos);
    this.pivot.rotation.set(rx, ry, rz);
    // hide when looking through a high-power scope
    this.root.visible = !(this.scoped && ads > 0.9);
    // muzzle flash
    const fl = this.gun.userData.flash;
    this.flashT = Math.max(0, (this.flashT || 0) - dt);
    fl.visible = this.flashT > 0;
    if (fl.visible) { fl.rotation.z = Math.random() * 6; fl.scale.setScalar(0.8 + Math.random() * 0.6); }
    this.flashLight.intensity = this.flashT > 0 ? 2 : 0;
    this.flashLight.position.copy(pos).add(new THREE.Vector3(0, 0.05, -0.5));
    for (const c of this.casings) {
      if (c.life <= 0) continue;
      c.life -= dt; c.v.y -= 6 * dt;
      c.m.position.addScaledVector(c.v, dt * 0.35);
      c.m.rotation.x += dt * 20;
      if (c.life <= 0) c.m.visible = false;
    }
  }
  // world position of the muzzle as seen by the main camera (for tracers)
  muzzleWorld(mainCam, out) {
    if (!this.gun) return out.copy(mainCam.position);
    this.root.updateMatrixWorld(true);
    const m = this.gun.userData.muzzle.getWorldPosition(out);
    // vm camera space -> main camera space (same orientation, different fov: close enough)
    this.cam.worldToLocal(m);
    m.multiplyScalar(1.0);
    return mainCam.localToWorld(m);
  }
}
export { Y };
