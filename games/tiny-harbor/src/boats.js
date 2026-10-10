// Boats: who visits, what they trade, how they sail, and the harbour
// traffic control that brings them in by day or waits for the lamp at night.
import * as THREE from 'three';
import { mat, mesh } from './props.js';
import { MOOR, BAY_ROCKS, heightAt } from './terrain.js';
import { clamp, damp, angleDiff, rand, pick } from './util.js';

export const BOAT_TYPES = {
  puffin: {
    name: 'The Puffin', who: 'Captain Wren', kind: 'Fishing boat', likes: 'fish',
    hull: '#e0523f', stripe: '#f4efe6', trim: '#f4efe6',
    hello: ['Mornin\'! Any fish for an old sailor?', 'Fish, fish, fish. I pay well for fish.', 'Smells like a good catch on this island.'],
    goods: [
      { id: 'bait', name: 'Bait ×5', price: 10, desc: 'Fish bite twice as fast for your next 5 casts.' },
      { id: 'rod', name: 'Sturdy Rod', price: 60, once: true, desc: 'A much bigger catch zone when reeling.' },
      { id: 'lure', name: 'Golden Lure', price: 120, once: true, desc: 'Rare fish turn up far more often.' },
    ],
  },
  marigold: {
    name: 'Marigold', who: 'Auntie Pim', kind: 'Trading sloop', likes: 'shells',
    hull: '#f2c14e', stripe: '#34507a', trim: '#f4efe6',
    hello: ['Paint, trinkets and treasures, dear!', 'Shells! I adore shells. And clams.', 'Let\'s make that little house sing.'],
    goods: 'shop',
  },
  oak: {
    name: 'Old Oak', who: 'Big Bo', kind: 'Timber barge', likes: 'wood',
    hull: '#5b8c5a', stripe: '#f2c14e', trim: '#3e3a3a',
    hello: ['Got timber? I\'ll take it off your hands.', 'Bo buys wood. Bo sells tools.', 'Nice trees you got here. Not too many, mind.'],
    goods: [
      { id: 'axe', name: 'Steel Axe', price: 70, once: true, desc: 'Trees fall in 3 chops instead of 4.' },
      { id: 'saw', name: 'Bucksaw', price: 90, once: true, desc: '+1 wood from every tree.' },
      { id: 'crate', name: 'Lumber Crate', price: 30, desc: '12 wood, ready cut.' },
    ],
  },
};
export const BASE_PRICE = { wood: 2, clams: 3, shells: 3 };

const DAY_IN = [[18, 112], [18, 96], [18, 84], [15, 68], [13, 52], [12, 42], [11.2, 35.5]];
const DAY_OUT = [[13.5, 36], [15, 46], [15, 60], [17, 76], [18, 92], [18, 118]];
const WAITS = [[46, 50], [18, 92], [-14, 84], [44, 80]];
export const APPROACH = { x: 12, z: 42 };

export function hullGeo(L, W, H) {
  const s = new THREE.Shape();
  s.moveTo(-W / 2, L / 2);
  s.lineTo(W / 2, L / 2);
  s.lineTo(W / 2, -L * 0.12);
  s.quadraticCurveTo(W / 2, -L * 0.4, 0, -L / 2);
  s.quadraticCurveTo(-W / 2, -L * 0.4, -W / 2, -L * 0.12);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: H, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.14, bevelSegments: 1 });
  g.rotateX(-Math.PI / 2);   // bow ends up at +z, extrusion goes up
  return g;
}

function buildBoatMesh(type) {
  const T = BOAT_TYPES[type];
  const g = new THREE.Group();
  const rig = new THREE.Group();   // rolls/pitches on the waves
  g.add(rig);
  const L = type === 'oak' ? 6 : 5.2, W = type === 'oak' ? 2.6 : 2.0;
  const hull = mesh(hullGeo(L, W, 0.9), mat(T.hull)); hull.position.y = -0.55; rig.add(hull);
  const stripe = mesh(hullGeo(L, W, 0.14), mat(T.stripe), false); stripe.scale.set(1.035, 1, 1.02); stripe.position.y = 0.05; rig.add(stripe);
  const deck = mesh(hullGeo(L * 0.92, W * 0.86, 0.05), mat('#c4925f'), false); deck.position.y = 0.32; rig.add(deck);
  const lanternMat = new THREE.MeshLambertMaterial({ color: '#fff0c0', emissive: '#ffb84a', emissiveIntensity: 0 });
  let lanternY = 2;
  if (type === 'puffin') {
    const wh = mesh(new THREE.BoxGeometry(1.3, 1.1, 1.3), mat(T.trim)); wh.position.set(0, 0.9, -0.9); rig.add(wh);
    const whr = mesh(new THREE.BoxGeometry(1.55, 0.14, 1.6), mat(T.hull)); whr.position.set(0, 1.52, -0.9); rig.add(whr);
    const wwin = mesh(new THREE.BoxGeometry(1.0, 0.35, 0.05), mat('#9fd0e8'), false); wwin.position.set(0, 1.1, -0.24); rig.add(wwin);
    const mast = mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.2, 6), mat('#7a5236')); mast.position.set(0, 2.2, -1.2); rig.add(mast);
    const boom = mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 5), mat('#7a5236')); boom.rotation.x = 1.1; boom.position.set(0, 2.0, 0.0); rig.add(boom);
    const net = mesh(new THREE.BoxGeometry(0.9, 0.5, 0.8), mat('#4e8a6a'), false); net.position.set(0, 0.6, 1.4); rig.add(net);
    const buoy = mesh(new THREE.IcosahedronGeometry(0.14, 0), mat('#ff9a3c'), false); buoy.position.set(0.4, 0.9, 1.3); rig.add(buoy);
    lanternY = 3.35;
  } else if (type === 'marigold') {
    const cab = mesh(new THREE.BoxGeometry(1.2, 0.7, 1.4), mat(T.trim)); cab.position.set(0, 0.7, -1.2); rig.add(cab);
    const cabr = mesh(new THREE.BoxGeometry(1.35, 0.12, 1.55), mat(T.stripe)); cabr.position.set(0, 1.1, -1.2); rig.add(cabr);
    const mast = mesh(new THREE.CylinderGeometry(0.06, 0.08, 4.6, 6), mat('#7a5236')); mast.position.set(0, 2.6, 0.3); rig.add(mast);
    const sailGeo = new THREE.BufferGeometry();
    sailGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.6, 0.15, 0, 4.6, 0.25, 0, 0.6, -2.4], 3));
    sailGeo.computeVertexNormals();
    const sail = new THREE.Mesh(sailGeo, new THREE.MeshLambertMaterial({ color: '#fbf3e2', side: THREE.DoubleSide }));
    sail.castShadow = true; rig.add(sail);
    const jibGeo = new THREE.BufferGeometry();
    jibGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.7, 0.45, 0, 4.2, 0.4, 0, 0.7, 2.4], 3));
    jibGeo.computeVertexNormals();
    const jib = new THREE.Mesh(jibGeo, new THREE.MeshLambertMaterial({ color: '#ff9a8a', side: THREE.DoubleSide }));
    rig.add(jib);
    for (let k = 0; k < 3; k++) { const cr = mesh(new THREE.BoxGeometry(0.45, 0.4, 0.45), mat(['#c08a52', '#7fbbe0', '#f2a0b3'][k])); cr.position.set(-0.4 + k * 0.4, 0.55, 1.4 - (k % 2) * 0.3); cr.rotation.y = k; rig.add(cr); }
    const pennant = mesh(new THREE.ConeGeometry(0.12, 0.6, 3), mat('#e0523f'), false); pennant.rotation.z = Math.PI / 2; pennant.position.set(0.3, 4.9, 0.3); rig.add(pennant);
    lanternY = 1.4;
  } else {
    const cab = mesh(new THREE.BoxGeometry(1.6, 1.2, 1.3), mat('#f4efe6')); cab.position.set(0, 0.95, -2.0); rig.add(cab);
    const cabr = mesh(new THREE.BoxGeometry(1.8, 0.14, 1.5), mat(T.stripe)); cabr.position.set(0, 1.62, -2.0); rig.add(cabr);
    const stack = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.9, 7), mat('#3e3a3a')); stack.position.set(0.5, 2.1, -2.2); rig.add(stack);
    const band = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.15, 7), mat('#e0523f'), false); band.position.y = 0.3; stack.add(band);
    for (let row = 0; row < 3; row++) for (let k = 0; k < 4 - row; k++) {
      const log = mesh(new THREE.CylinderGeometry(0.22, 0.22, 2.6, 7), mat(k % 2 ? '#a8693c' : '#9a5e35'));
      log.rotation.x = Math.PI / 2;
      log.position.set(-0.66 + k * 0.44 + row * 0.22, 0.6 + row * 0.38, 0.8);
      rig.add(log);
    }
    g.userData.stack = new THREE.Vector3(0.5, 2.6, -2.2);
    lanternY = 1.9;
  }
  const lantern = mesh(new THREE.BoxGeometry(0.22, 0.28, 0.22), lanternMat, false);
  lantern.position.set(0, lanternY, type === 'puffin' ? -1.2 : type === 'marigold' ? 0.3 : -2.0);
  if (type === 'marigold') lantern.position.set(0, lanternY, -1.2);
  rig.add(lantern);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: '#ffcf7a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  glow.scale.setScalar(3);
  glow.position.copy(lantern.position);
  rig.add(glow);
  g.userData.rig = rig;
  g.userData.lanternMat = lanternMat;
  g.userData.glow = glow;
  g.userData.radius = type === 'oak' ? 1.5 : 1.2;
  g.userData.len = L;
  return g;
}

let _glow;
export function glowTex() {
  if (_glow) return _glow;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  _glow = new THREE.CanvasTexture(c);
  return _glow;
}

class Boat {
  constructor(type, scene, start) {
    this.type = type;
    this.T = BOAT_TYPES[type];
    this.mesh = buildBoatMesh(type);
    this.pos = new THREE.Vector3(start[0], 0, start[1]);
    this.heading = Math.PI;      // facing -z (towards the island)
    this.speed = 0;
    this.damage = 0;
    this.path = [];
    this.state = 'in';
    this.timer = 0;
    this.guided = false;
    this.hornT = rand(2, 5);
    this.bumpCd = 0;
    this.mesh.position.copy(this.pos);
    scene.add(this.mesh);
    this.r = this.mesh.userData.radius;
  }
  forward() { return new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading)); }
  steer(tx, tz, maxSpeed, dt, turn = 0.9) {
    const want = Math.atan2(tx - this.pos.x, tz - this.pos.z);
    const d = angleDiff(this.heading, want);
    this.heading += clamp(d, -turn * dt, turn * dt);
    const align = clamp(Math.cos(d), 0.15, 1);
    this.speed = damp(this.speed, maxSpeed * align, 1.6, dt);
    this.pos.addScaledVector(this.forward(), this.speed * dt);
    return Math.hypot(tx - this.pos.x, tz - this.pos.z);
  }
  followPath(dt, maxSpeed) {
    if (!this.path.length) return true;
    const [tx, tz] = this.path[0];
    const last = this.path.length === 1;
    const d = this.steer(tx, tz, last ? clamp(this.distTo(tx, tz) * 0.6, 0.5, maxSpeed) : maxSpeed, dt, last ? 1.4 : 0.9);
    if (d < (last ? 0.6 : 2.2)) this.path.shift();
    return !this.path.length;
  }
  distTo(x, z) { return Math.hypot(x - this.pos.x, z - this.pos.z); }
}

export class Harbor {
  constructor(scene, game) {
    this.scene = scene;
    this.game = game;
    this.boats = [];
    this.nextIn = 40;
    this.order = ['puffin', 'oak', 'marigold'];
    this.orderIdx = 0;
  }
  get berth() { return this.boats.find((b) => ['berthing', 'mooring', 'moored'].includes(b.state)) || null; }
  get waiting() { return this.boats.filter((b) => b.state === 'waiting' || b.state === 'guided'); }

  spawn(night) {
    const type = this.orderIdx < 3 ? this.order[this.orderIdx] : pick(this.order);
    this.orderIdx++;
    let b;
    if (night) {
      const w = pick(WAITS.filter((wp) => !this.boats.some((o) => o.distTo(wp[0], wp[1]) < 8)));
      if (!w) return;
      const out = new THREE.Vector2(w[0] - 12, w[1] - 42).normalize().multiplyScalar(30);
      b = new Boat(type, this.scene, [w[0] + out.x, w[1] + out.y]);
      b.heading = Math.atan2(-out.x, -out.y);
      b.path = [w];
      b.night = true;
    } else {
      b = new Boat(type, this.scene, DAY_IN[0]);
      b.path = DAY_IN.slice(1, -1);
    }
    b.state = 'in';
    this.boats.push(b);
    this.game.onBoat('spawn', b);
  }

  update(dt, ctx) {
    // schedule
    if (this.boats.length < 2 && !ctx.noSpawn) {
      this.nextIn -= dt;
      if (this.nextIn <= 0) { this.spawn(ctx.night); this.nextIn = rand(55, 85); }
    }
    for (const b of [...this.boats]) this.updateBoat(b, dt, ctx);
  }

  updateBoat(b, dt, ctx) {
    b.timer -= dt;
    b.bumpCd -= dt;
    const berth = this.berth;
    switch (b.state) {
      case 'in': {
        const done = b.followPath(dt, 3.2);
        if (done) {
          if (b.night && ctx.night) { b.state = 'waiting'; b.timer = 150; this.game.onBoat('waiting', b); }
          else this.toApproach(b, berth);
        }
        break;
      }
      case 'waiting': {
        b.speed = damp(b.speed, 0, 1.5, dt);
        b.pos.addScaledVector(b.forward(), b.speed * dt);
        b.hornT -= dt;
        if (b.hornT <= 0) { b.hornT = 12; this.game.onBoat('horn', b); }
        if (!ctx.night) { b.path = [[18, 92], [18, 84], [15, 68], [13, 52], [12, 42]]; b.state = 'in'; b.night = false; break; }
        if (b.timer <= 0) { this.loseBoat(b, 'gave up waiting'); break; }
        if (this.beamNear(b, ctx)) { b.state = 'guided'; this.game.onBoat('guided', b); }
        break;
      }
      case 'guided': {
        b.stun = Math.max(0, (b.stun || 0) - dt);
        if (this.beamNear(b, ctx, 13) && b.stun <= 0) {
          const d = b.distTo(ctx.beam.x, ctx.beam.z);
          b.steer(ctx.beam.x, ctx.beam.z, clamp(d * 0.55, 0, 3.6), dt, 1.3);
        } else {
          b.speed = damp(b.speed, 0, 1.2, dt);
          b.pos.addScaledVector(b.forward(), b.speed * dt);
        }
        this.collide(b, ctx);
        if (b.state !== 'guided') break;
        if (b.distTo(APPROACH.x, APPROACH.z) < 6) { b.guided = true; this.game.onBoat('safe', b); this.toApproach(b, berth); }
        break;
      }
      case 'queue': {
        b.speed = damp(b.speed, 0, 1.5, dt);
        b.pos.addScaledVector(b.forward(), b.speed * dt);
        if (!this.berth) this.toApproach(b, null);
        break;
      }
      case 'berthing': {
        const done = b.followPath(dt, 2.2);
        if (done) {
          b.heading += angleDiff(b.heading, Math.PI) * Math.min(1, dt * 2);
          b.pos.x = damp(b.pos.x, MOOR.x, 3, dt); b.pos.z = damp(b.pos.z, MOOR.z, 3, dt);
          b.speed = 0;
          if (Math.abs(angleDiff(b.heading, Math.PI)) < 0.05) {
            b.state = 'mooring'; b.timer = 45; this.game.onBoat('arrived', b);
          }
        }
        break;
      }
      case 'mooring':
        if (b.timer <= 0) { b.state = 'leaving'; b.path = DAY_OUT.slice(); this.game.onBoat('untied', b); }
        break;
      case 'moored':
        if (b.timer <= 0) { b.state = 'leaving'; b.path = DAY_OUT.slice(); this.game.onBoat('departing', b); }
        break;
      case 'leaving':
      case 'lost':
        if (b.followPath(dt, 3.4)) this.remove(b);
        break;
    }
    // bob on the swell
    const rig = b.mesh.userData.rig;
    const t = ctx.time;
    b.mesh.position.set(b.pos.x, ctx.level + Math.sin(t * 1.4 + b.pos.x) * 0.06, b.pos.z);
    b.mesh.rotation.y = b.heading;
    rig.rotation.z = Math.sin(t * 1.1 + b.pos.z) * 0.05 + (b.shake > 0 ? Math.sin(t * 40) * 0.08 : 0);
    rig.rotation.x = Math.sin(t * 0.9 + b.pos.x) * 0.03 - b.speed * 0.01;
    b.shake = Math.max(0, (b.shake || 0) - dt);
    const lit = ctx.nightAmt;
    const blink = b.state === 'waiting' ? (Math.sin(t * 5) > 0 ? 1 : 0.25) : 1;
    b.mesh.userData.lanternMat.emissiveIntensity = lit * 1.6 * blink;
    b.mesh.userData.glow.material.opacity = lit * 0.9 * blink;
    if (b.speed > 0.8 && Math.random() < dt * 14) {
      const back = b.forward().multiplyScalar(-b.mesh.userData.len * 0.5);
      this.game.particles.spawn('foam', new THREE.Vector3(b.pos.x + back.x, ctx.level + 0.05, b.pos.z + back.z), 1, 0.6, 0);
    }
  }

  beamNear(b, ctx, r = 10) {
    return ctx.beam.on && b.distTo(ctx.beam.x, ctx.beam.z) < r;
  }

  collide(b, ctx) {
    if (b.bumpCd > 0) return;
    const f = b.forward();
    const bow = { x: b.pos.x + f.x * 2.2, z: b.pos.z + f.z * 2.2 };
    let hit = false;
    for (const [x, z, r] of BAY_ROCKS) {
      if (Math.hypot(bow.x - x, bow.z - z) < r + 0.5 || Math.hypot(b.pos.x - x, b.pos.z - z) < r + b.r) { hit = true; break; }
    }
    if (!hit && heightAt(bow.x, bow.z) > ctx.level - 0.7) hit = true;
    if (!hit) return;
    b.damage++;
    b.bumpCd = 2.0;
    b.stun = 1.6;
    b.shake = 0.5;
    b.pos.addScaledVector(f, -2.2);
    b.speed = 0;
    this.game.onBoat('bump', b);
    if (b.damage >= 3) this.loseBoat(b, 'hit the rocks');
  }

  loseBoat(b, why) {
    b.state = 'lost';
    const out = new THREE.Vector2(b.pos.x - 12, b.pos.z - 42).normalize().multiplyScalar(60);
    b.path = [[b.pos.x + out.x, b.pos.z + out.y]];
    this.game.onBoat('lost', b, why);
  }

  toApproach(b, berth) {
    if (berth && berth !== b) {
      b.state = 'queue';
      return;
    }
    b.state = 'berthing';
    b.path = b.distTo(APPROACH.x, APPROACH.z) > 3 ? [[APPROACH.x, APPROACH.z], [11.2, 35.5], [MOOR.x, MOOR.z]] : [[11.2, 35.5], [MOOR.x, MOOR.z]];
  }

  tie(b) {
    b.state = 'moored';
    b.timer = 110;
  }

  remove(b) {
    this.scene.remove(b.mesh);
    this.boats.splice(this.boats.indexOf(b), 1);
    this.game.onBoat('gone', b);
  }
}
