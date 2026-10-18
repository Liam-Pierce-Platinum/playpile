// Throwables. Lethal: FRAG (2.6 s fuse, bounces) and SEMTEX (sticks to the first surface, 1.8 s).
// Tactical: FLASHBANG (1.5 s, white-out + ringing that scale with distance and view angle; soldiers in
// sight are blinded) and SMOKE (a ~15 s cloud of lit soft puffs that also blocks soldiers' sight lines).
// Anyone can throw: the player, bots (throwAt solves the arc onto a point) and online players (replicated
// through game.net, the thrower's client owns the damage).
import * as THREE from 'three';

const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _f = new THREE.Vector3();
const RADIUS = 8, LETHAL = 3.2, G = 9.8;
export const THROWABLES = {
  frag: { name: 'Frag grenade', kind: 'lethal', fuse: 2.6, color: 0x3a4430 },
  semtex: { name: 'Semtex', kind: 'lethal', fuse: 1.8, color: 0x8a6a3a, sticky: true },
  flash: { name: 'Flashbang', kind: 'tactical', fuse: 1.5, color: 0x6c7076 },
  smoke: { name: 'Smoke grenade', kind: 'tactical', fuse: 1.4, color: 0x4f6a48 },
};
const SMOKE_LIFE = 15;

function puffTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  // break the disc up so overlapping puffs read as billowing smoke, not balls
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 60; i++) { const a = Math.random() * 6.28, r = 20 + Math.random() * 44; g.fillStyle = `rgba(0,0,0,${0.08 + Math.random() * 0.15})`; g.beginPath(); g.arc(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 6 + Math.random() * 14, 0, 6.28); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Grenades {
  constructor(game) {
    this.game = game; this.list = []; this.smokes = [];
    this.geo = { frag: new THREE.SphereGeometry(0.035, 12, 8).scale(1, 1.25, 1), can: new THREE.CylinderGeometry(0.03, 0.03, 0.11, 12) };
    this.capGeo = new THREE.CylinderGeometry(0.013, 0.016, 0.03, 8).translate(0, 0.05, 0);
    this.mats = {}; for (const k in THROWABLES) this.mats[k] = new THREE.MeshStandardMaterial({ color: THROWABLES[k].color, roughness: 0.6, metalness: 0.3 });
    this.capMat = new THREE.MeshStandardMaterial({ color: 0x777b80, roughness: 0.35, metalness: 0.9 });
    this.light = new THREE.PointLight(0xffa860, 0, 22, 2); game.scene.add(this.light); this.lightT = 0;
    this.puffTex = puffTexture();
  }
  clear() {
    for (const g of this.list) this.game.scene.remove(g.mesh);
    for (const s of this.smokes) for (const p of s.puffs) this.game.scene.remove(p);
    this.list = []; this.smokes = []; this.light.intensity = 0;
  }
  // a thrown grenade: from + velocity. Local throws (player / bots this client simulates) deal damage;
  // replicated ones (remote: true) only play out visually.
  launch(type, from, vel, owner, remote = false) {
    const T = THROWABLES[type] || THROWABLES.frag;
    const mesh = new THREE.Group();
    if (type === 'frag') mesh.add(new THREE.Mesh(this.geo.frag, this.mats.frag), new THREE.Mesh(this.capGeo, this.capMat));
    else mesh.add(new THREE.Mesh(type === 'semtex' ? this.geo.frag : this.geo.can, this.mats[type]), new THREE.Mesh(this.capGeo, this.capMat));
    mesh.position.copy(from); this.game.scene.add(mesh);
    this.list.push({ type, mesh, p: from.clone(), v: vel.clone(), t: T.fuse, owner, remote, spin: new THREE.Vector3(Math.random() * 12, Math.random() * 12, 0), bounces: 0, stuck: false });
    if (!remote && this.game.net) this.game.net.sendNade(type, from, vel, owner);
  }
  throw(type, from, dir, inherit, owner) {
    const v = dir.clone().multiplyScalar(17).add(new THREE.Vector3(0, 3.2, 0)).addScaledVector(inherit, 0.6);
    this.launch(type, from, v, owner);
  }
  // bots: an arc that lands on `to` (flight time grows with distance)
  throwAt(type, from, to, owner) {
    const dx = to.x - from.x, dz = to.z - from.z, dy = (to.y || 0) + 0.2 - from.y, d = Math.hypot(dx, dz);
    const t = THREE.MathUtils.clamp(d / 14, 0.45, 1.7);
    this.launch(type, from, new THREE.Vector3(dx / t, (dy + 0.5 * G * t * t) / t, dz / t), owner);
  }
  // does a smoke cloud cut the sight line a-b?
  blocks(a, b) {
    for (const s of this.smokes) {
      if (s.r < 0.8) continue;
      _d.subVectors(b, a); const L = _d.length(); _d.divideScalar(L || 1);
      _v.subVectors(s.c, a); const t = THREE.MathUtils.clamp(_v.dot(_d), 0, L);
      if (_v.addScaledVector(_d, -t).length() < s.r * 0.85) return true;
    }
    return false;
  }
  update(dt) {
    const W = this.game.world;
    for (const g of this.list) {
      g.t -= dt;
      if (!g.stuck) {
        g.v.y -= G * dt;
        const L = g.v.length() * dt;
        if (L > 1e-5) {
          _d.copy(g.v).normalize();
          const hit = W.raycast(g.p, _d, L + 0.04, b => b.solid);
          if (hit) {
            g.p.copy(hit.point).addScaledVector(hit.normal, 0.04);
            if (THROWABLES[g.type].sticky) { g.stuck = true; g.v.set(0, 0, 0); this.game.audio.impact(g.p, 'flesh', 0.4); }
            else {
              const vn = g.v.dot(hit.normal); g.v.addScaledVector(hit.normal, -1.4 * vn).multiplyScalar(0.5);
              if (g.bounces++ < 4 && Math.abs(vn) > 1.5) this.game.audio.impact(g.p, 'metal', 0.35);
              if (hit.normal.y > 0.6 && g.v.length() < 0.6) g.v.set(0, 0, 0);
              g.spin.multiplyScalar(0.5);
            }
          } else g.p.addScaledVector(g.v, dt);
        }
        g.mesh.rotation.x += g.spin.x * dt; g.mesh.rotation.z += g.spin.y * dt;
      }
      g.mesh.position.copy(g.p);
      if (g.t <= 0) { this.game.scene.remove(g.mesh); this[g.type === 'flash' ? 'flashbang' : g.type === 'smoke' ? 'smoke' : 'explode'](g); }
    }
    this.list = this.list.filter(g => g.t > 0);
    if (this.lightT > 0) { this.lightT -= dt; this.light.intensity = Math.max(0, this.lightT / 0.25) * this.lightPeak; }
    this.updateSmoke(dt);
  }
  // everyone this client resolves damage for: the local player plus soldiers it simulates (bots on the
  // host, puppets of online players / remote bots get hits reported through game.dealDamage)
  victims() { const G = this.game; return [G.player, ...G.npcs.list.filter(n => n.alive && n.state !== 'dummy')]; }
  explode(g) {
    const G = this.game, p = g.p.clone();
    const eye = p.clone().setY(p.y + 0.25), F = G.fx;
    this.light.position.copy(eye); this.lightT = 0.25; this.lightPeak = 60; this.light.color.set(0xffa860);
    for (let i = 0; i < 14; i++) F.add.emit({ pos: eye, vel: new THREE.Vector3((Math.random() - 0.5) * 5, Math.random() * 4, (Math.random() - 0.5) * 5), size: 0.5 + Math.random() * 0.5, grow: 2, life: 0.22 + Math.random() * 0.15, color: [6, 3.2, 1.2], drag: 4 });
    for (let i = 0; i < 40; i++) F.add.emit({ pos: eye, vel: new THREE.Vector3((Math.random() - 0.5) * 26, Math.random() * 16, (Math.random() - 0.5) * 26), size: 0.02, life: 0.4 + Math.random() * 0.5, color: [5, 2.8, 1], grav: 9, drag: 1.2, stretch: 0.03 });
    for (let i = 0; i < 24; i++) F.alpha.emit({ pos: eye, vel: new THREE.Vector3((Math.random() - 0.5) * 9, 2 + Math.random() * 7, (Math.random() - 0.5) * 9), size: 0.04, life: 1.2, color: [0.25, 0.22, 0.2], grav: 9.8, drag: 0.5, floor: 0.01, spin: 12 });
    for (let i = 0; i < 12; i++) F.alpha.emit({ pos: eye, vel: new THREE.Vector3((Math.random() - 0.5) * 3, 0.6 + Math.random() * 2.2, (Math.random() - 0.5) * 3), size: 0.9 + Math.random() * 0.7, grow: 1.4, life: 2.5 + Math.random() * 2, color: [0.32, 0.3, 0.29], alpha: 0.55, drag: 1.6 });
    const floor = G.world.raycast(eye, _v.set(0, -1, 0), 1.2, b => b.solid);
    if (floor) for (let i = 0; i < 3; i++) F.decal(floor.point, floor.normal, 'dirt', 0.5 + i * 0.25);
    G.audio.explosion?.(p);
    G.npcs.noise(p, 120, 'gunshot', p.clone(), g.owner);
    const P = G.player;
    { const d = P.camPos.distanceTo(eye), shake = Math.max(0, 1 - d / 30); P.shake.p += 0.05 * shake; P.shake.r += (Math.random() - 0.5) * 0.12 * shake; G.hud.suppress(shake * 1.2); }
    if (g.remote) return;
    // damage: falloff, lethal core, cover blocks (los from just above the blast to the chest); no team damage
    const ot = g.owner?.team;
    for (const v of this.victims()) {
      if (!v.alive || (v !== g.owner && ot != null && v.team === ot)) continue;
      const c = v.isPlayer ? _v.copy(v.camPos).setY(v.camPos.y - 0.5) : _v.copy(v.pos).setY(v.pos.y + 1.1), d = c.distanceTo(eye); if (d > RADIUS) continue;
      if (!G.world.los(eye, c)) continue;
      const dmg = d < LETHAL ? 999 : 160 * (1 - (d - LETHAL) / (RADIUS - LETHAL));
      const dir = c.clone().sub(eye).normalize(); dir.y = Math.max(dir.y, 0.4); dir.normalize();
      G.dealDamage(v, v === g.owner ? dmg * 0.6 : dmg, 'chest', dir, c.clone(), g.owner, 2.2, THROWABLES[g.type].name);
    }
  }
  flashbang(g) {
    const G = this.game, p = g.p.clone(), eye = p.clone().setY(p.y + 0.2);
    this.light.position.copy(eye); this.lightT = 0.12; this.lightPeak = 400; this.light.color.set(0xffffff);
    for (let i = 0; i < 30; i++) G.fx.add.emit({ pos: eye, vel: new THREE.Vector3((Math.random() - 0.5) * 18, Math.random() * 10, (Math.random() - 0.5) * 18), size: 0.015, life: 0.3 + Math.random() * 0.4, color: [8, 8, 8], grav: 6, drag: 1.5, stretch: 0.02 });
    G.fx.add.emit({ pos: eye, vel: new THREE.Vector3(), size: 2.5, grow: 1.5, life: 0.12, color: [20, 20, 20], drag: 0 });
    G.audio.explosion?.(p, 0.6);
    G.npcs.noise(p, 60, 'gunshot', p.clone(), g.owner);
    // local player: white-out + ringing from distance and how directly they look at it
    const P = G.player;
    if (!P.dead) {
      const d = P.camPos.distanceTo(eye);
      if (d < 22 && G.world.los(eye, P.camPos)) {
        const facing = P.aimDir(_f).dot(_d.subVectors(eye, P.camPos).normalize());
        const k = THREE.MathUtils.clamp(1 - d / 22, 0, 1) * (0.25 + 0.75 * THREE.MathUtils.smoothstep(facing, -0.3, 0.85));
        if (k > 0.04) G.flashbanged(k);
      }
    }
    // soldiers (bots / puppets this client simulates): blinded by the same rule
    for (const n of G.npcs.list) {
      if (!n.alive || n.state === 'puppet' || n.state === 'dummy') continue;
      const e = n.eye.clone(), d = e.distanceTo(eye); if (d > 18 || !G.world.los(eye, e)) continue;
      const facing = Math.sin(n.aimYaw) * (eye.x - e.x) / d + Math.cos(n.aimYaw) * (eye.z - e.z) / d;
      n.blindT = Math.max(n.blindT || 0, (1 - d / 18) * (1.5 + 3 * THREE.MathUtils.smoothstep(facing, -0.3, 0.8)));
      n.suppression = 1; n.say?.('hurt');
    }
  }
  smoke(g) {
    const G = this.game, c = g.p.clone().setY(g.p.y + 0.1);
    G.audio.impact(c, 'metal', 0.5);
    const s = { c: c.clone().setY(c.y + 1.4), base: c, t: 0, r: 0, puffs: [] };
    for (let i = 0; i < 34; i++) {
      const m = new THREE.SpriteMaterial({ map: this.puffTex, color: new THREE.Color().setHSL(0.1, 0.04, 0.62 + Math.random() * 0.12), transparent: true, opacity: 0, depthWrite: false, fog: true, rotation: Math.random() * 6.28 });
      const sp = new THREE.Sprite(m);
      const a = Math.random() * 6.28, r = Math.sqrt(Math.random()), h = Math.random();
      sp.userData = { a, r, h, rot: (Math.random() - 0.5) * 0.25, size: 2.2 + Math.random() * 1.6, delay: Math.random() * 1.2 };
      sp.position.copy(c); G.scene.add(sp); s.puffs.push(sp);
    }
    this.smokes.push(s);
  }
  updateSmoke(dt) {
    const sun = this.game.env?.sun;
    for (const s of this.smokes) {
      s.t += dt;
      const grow = THREE.MathUtils.smoothstep(s.t, 0, 3), fade = 1 - THREE.MathUtils.smoothstep(s.t, SMOKE_LIFE - 3, SMOKE_LIFE);
      s.r = (1 + 3.6 * grow) * (0.6 + 0.4 * fade) * (fade > 0.15 ? 1 : 0);
      for (const sp of s.puffs) {
        const u = sp.userData, k = THREE.MathUtils.clamp((s.t - u.delay) / 2.5, 0, 1);
        const R = s.r * u.r * 1.05, y = 0.3 + u.h * (1.2 + 2.2 * grow) + s.t * 0.04;
        sp.position.set(s.base.x + Math.cos(u.a + s.t * 0.03) * R, s.base.y + y, s.base.z + Math.sin(u.a + s.t * 0.03) * R);
        const sz = u.size * (0.4 + 0.9 * grow) * (1 + s.t * 0.02); sp.scale.set(sz, sz, 1);
        sp.material.rotation += u.rot * dt; sp.material.opacity = 0.82 * k * fade;
        if (sun) sp.material.color.setHSL(0.1, 0.04, 0.5 + 0.25 * u.h + Math.min(0.1, sun.intensity * 0.02));
      }
    }
    for (const s of this.smokes) if (s.t > SMOKE_LIFE) for (const p of s.puffs) { this.game.scene.remove(p); p.material.dispose(); }
    this.smokes = this.smokes.filter(s => s.t <= SMOKE_LIFE);
  }
}
