// Fishing: cast, wait for the bobber to go under, then a reel-in tug of war.
import * as THREE from 'three';
import { clamp, rand } from './util.js';

export const FISH = [
  { id: 'sardine', name: 'Sardine', price: 4, color: '#9fb8c8', w: 30, diff: 0.55, where: 'Anywhere, any time' },
  { id: 'herring', name: 'Herring', price: 5, color: '#b8c8d6', w: 24, diff: 0.65, where: 'Anywhere, any time' },
  { id: 'mackerel', name: 'Mackerel', price: 7, color: '#4f9a86', w: 20, diff: 0.85, where: 'Anywhere, any time' },
  { id: 'flounder', name: 'Flounder', price: 9, color: '#c2a272', w: 16, diff: 0.75, where: 'Shallow water at low tide', cond: (c) => c.lowTide && c.depth < 1.6 },
  { id: 'cod', name: 'Cod', price: 11, color: '#a8a07a', w: 13, diff: 1.0, where: 'Deep water, like the end of the dock', cond: (c) => c.depth > 1.5 },
  { id: 'bass', name: 'Sea Bass', price: 13, color: '#7088a8', w: 10, diff: 1.1, where: 'Anywhere at high tide', cond: (c) => c.highTide },
  { id: 'salmon', name: 'Salmon', price: 18, color: '#ff9a7a', w: 8, diff: 1.3, where: 'At dawn or dusk', cond: (c) => c.dawnDusk },
  { id: 'snapper', name: 'Red Snapper', price: 16, color: '#e0523f', w: 6, diff: 1.25, where: 'The deepest water you can reach', cond: (c) => c.depth > 1.9 },
  { id: 'octopus', name: 'Octopus', price: 22, color: '#c47ab0', w: 6, diff: 1.4, where: 'Only at night', cond: (c) => c.night },
  { id: 'eel', name: 'Storm Eel', price: 30, color: '#5a6a8a', w: 7, diff: 1.5, where: 'Only during a storm', cond: (c) => c.storm },
  { id: 'lantern', name: 'Lantern Fish', price: 60, color: '#ffd75e', w: 1.6, diff: 1.75, where: 'Deep water, at night, at high tide', cond: (c) => c.night && c.depth > 1.5 && c.highTide, legendary: true },
];
export const FISH_BY_ID = Object.fromEntries(FISH.map((f) => [f.id, f]));

export function rollFish(ctx, lure) {
  const pool = FISH.filter((f) => !f.cond || f.cond(ctx));
  const weights = pool.map((f) => f.w * (lure && f.price >= 13 ? 2.6 : 1));
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) return pool[i]; }
  return pool[0];
}

export class Fishing {
  constructor(scene) {
    this.state = 'idle';
    this.bobber = new THREE.Group();
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#e0523f' }));
    const bot = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#ffffff' }));
    this.bobber.add(top, bot);
    this.bobber.visible = false;
    scene.add(this.bobber);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(10 * 3), 3));
    this.line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: '#f4efe6', transparent: true, opacity: 0.8 }));
    this.line.frustumCulled = false;
    this.line.visible = false;
    scene.add(this.line);
    this.spot = new THREE.Vector3();
    this.from = new THREE.Vector3();
  }

  start(spot, ctx, opts) {
    this.state = 'cast';
    this.t = 0;
    this.spot.copy(spot);
    this.ctx = ctx;
    this.opts = opts;
    this.bobber.visible = true;
    this.line.visible = true;
  }

  newWait() {
    this.state = 'wait';
    this.t = 0;
    this.biteAt = rand(2.5, 6.5) * (this.opts.bait ? 0.5 : 1) * (this.opts.rain ? 0.65 : 1);
    this.nibbles = [];
    for (let k = 0; k < 3; k++) if (Math.random() < 0.6) this.nibbles.push(rand(0.8, this.biteAt - 0.4));
  }

  stop() {
    this.state = 'idle';
    this.bobber.visible = false;
    this.line.visible = false;
  }

  // returns an event string or null
  update(dt, tip, level, time, holding, pressed) {
    this.t += dt;
    let ev = null;
    const restY = level + 0.04 + Math.sin(time * 2.2) * 0.03;
    if (this.state === 'cast') {
      const k = clamp(this.t / 0.55, 0, 1);
      if (k === 0 || this.t < dt * 1.5) this.from.copy(tip);
      this.bobber.position.lerpVectors(this.from, this.spot, k);
      this.bobber.position.y = THREE.MathUtils.lerp(this.from.y, restY, k) + Math.sin(k * Math.PI) * 1.4;
      if (k >= 1) { this.newWait(); ev = 'splash'; }
    } else if (this.state === 'wait') {
      let dip = 0;
      for (const n of this.nibbles) if (this.t > n && this.t < n + 0.18) dip = 0.07;
      this.bobber.position.set(this.spot.x, restY - dip, this.spot.z);
      if (this.nibbles.some((n) => Math.abs(this.t - n) < dt)) ev = 'nibble';
      if (pressed) { this.stop(); return 'reelEmpty'; }
      if (this.t > this.biteAt) {
        this.state = 'bite'; this.t = 0;
        this.fish = rollFish(this.ctx, this.opts.lure);
        ev = 'bite';
      }
    } else if (this.state === 'bite') {
      this.bobber.position.set(this.spot.x, restY - 0.2 + Math.sin(this.t * 30) * 0.04, this.spot.z);
      if (pressed) {
        this.state = 'reel'; this.t = 0;
        this.zone = 0.35; this.zoneV = 0;
        this.fishY = 0.5; this.fishTarget = 0.5; this.fishT = 0;
        this.progress = 0.3;
        this.zoneH = this.opts.rod ? 0.36 : 0.26;
        ev = 'hook';
      } else if (this.t > (this.opts.rod ? 1.0 : 0.8)) { this.newWait(); ev = 'missed'; }
    } else if (this.state === 'reel') {
      const f = this.fish;
      // the fish darts between targets; harder fish dart further and faster
      this.fishT -= dt;
      if (this.fishT <= 0) {
        this.fishTarget = clamp(this.fishY + (Math.random() - 0.5) * 0.9 * f.diff, 0.04, 0.96);
        this.fishT = rand(0.35, 1.1) / f.diff;
      }
      this.fishY += (this.fishTarget - this.fishY) * Math.min(1, dt * 3.2 * f.diff);
      this.zoneV += (holding ? 2.6 : -2.2) * dt;
      this.zoneV = clamp(this.zoneV, -1.4, 1.4);
      this.zone += this.zoneV * dt;
      if (this.zone < 0) { this.zone = 0; this.zoneV = Math.max(0, this.zoneV) * -0.3; }
      if (this.zone > 1 - this.zoneH) { this.zone = 1 - this.zoneH; this.zoneV = Math.min(0, this.zoneV) * -0.3; }
      const inside = this.fishY > this.zone && this.fishY < this.zone + this.zoneH;
      this.inside = inside;
      this.progress += (inside ? 0.34 : -0.22) * dt;
      this.bobber.position.set(this.spot.x + Math.sin(time * 9) * 0.15, restY - 0.03, this.spot.z + Math.cos(time * 7) * 0.15);
      if (this.progress >= 1) { this.stop(); return 'caught'; }
      if (this.progress <= 0) { this.stop(); return 'escaped'; }
    }
    // line from rod tip to bobber, sagging a little
    const p = this.line.geometry.attributes.position;
    const b = this.bobber.position;
    const sag = this.state === 'reel' || this.state === 'bite' ? 0.05 : 0.5;
    for (let i = 0; i < 10; i++) {
      const k = i / 9;
      p.setXYZ(i, tip.x + (b.x - tip.x) * k, tip.y + (b.y - tip.y) * k - Math.sin(k * Math.PI) * sag, tip.z + (b.z - tip.z) * k);
    }
    p.needsUpdate = true;
    return ev;
  }
}
