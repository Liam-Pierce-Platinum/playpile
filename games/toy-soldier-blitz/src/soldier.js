// A plastic army man: glossy moulded plastic, foot stands, helmet, rifle.
// Physics = an AABB capsule-ish body vs the world's boxes with step-up.
import * as THREE from '../vendor/three.module.js';
import { roundedBox, clamp, angDiff } from './util.js';
import { plastic } from './world.js';

export const TEAM_COL = [0x4f7a32, 0xc9a66b];
export const R = 0.34, H = 1.8, STEP = 0.56, GRAV = 24, JUMP = 8.2, SPEED = 6.4, SPRINT = 9.2;
export const MAXHP = 100, MAG = 24, GREN = 2;
const mats = {};
function teamMat(t) { return mats[t] || (mats[t] = plastic(TEAM_COL[t])); }
function darkMat(t) { return mats['d' + t] || (mats['d' + t] = plastic(new THREE.Color(TEAM_COL[t]).multiplyScalar(0.72))); }

function capsule(r, len, m) { const o = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 14), m); o.castShadow = true; o.receiveShadow = true; return o; }
function part(geo, m) { const o = new THREE.Mesh(geo, m); o.castShadow = true; o.receiveShadow = true; return o; }

export function buildModel(team) {
  const m = teamMat(team), d = darkMat(team);
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body); // tips over on death
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(0.13 * s, 0.95, 0); body.add(hip);
    const thigh = capsule(0.11, 0.32, m); thigh.position.y = -0.22; hip.add(thigh);
    const knee = new THREE.Group(); knee.position.y = -0.45; hip.add(knee);
    const shin = capsule(0.1, 0.3, m); shin.position.y = -0.2; knee.add(shin);
    const boot = part(roundedBox(0.2, 0.14, 0.32, 0.05, 2), m); boot.position.set(0, -0.42, 0.05); knee.add(boot);
    const stand = part(new THREE.CylinderGeometry(0.17, 0.19, 0.05, 20), m); stand.scale.z = 1.35; stand.position.set(0, -0.48, 0.05); knee.add(stand);
    legs.push({ hip, knee });
  }
  const torso = new THREE.Group(); torso.position.y = 0.95; body.add(torso);
  const chest = capsule(0.22, 0.32, m); chest.scale.set(1.15, 1, 0.8); chest.position.y = 0.3; torso.add(chest);
  const belt = part(new THREE.TorusGeometry(0.2, 0.045, 8, 24), d); belt.rotation.x = Math.PI / 2; belt.scale.set(1.15, 0.85, 1); belt.position.y = 0.06; torso.add(belt);
  const pack = part(roundedBox(0.36, 0.38, 0.18, 0.06, 2), d); pack.position.set(0, 0.36, -0.22); torso.add(pack);
  const roll = capsule(0.07, 0.3, d); roll.rotation.z = Math.PI / 2; roll.position.set(0, 0.6, -0.22); torso.add(roll);
  for (const s of [-1, 1]) { const p = part(roundedBox(0.1, 0.12, 0.08, 0.03, 1), d); p.position.set(0.12 * s, 0.1, 0.17); torso.add(p); }
  const upper = new THREE.Group(); upper.position.y = 0.55; torso.add(upper); // pitches with aim
  const neck = capsule(0.07, 0.06, m); neck.position.y = 0.06; upper.add(neck);
  const head = part(new THREE.SphereGeometry(0.13, 20, 14), m); head.position.y = 0.2; upper.add(head);
  const helmet = part(new THREE.SphereGeometry(0.17, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), m); helmet.position.y = 0.23; helmet.scale.set(1, 0.9, 1.08); upper.add(helmet);
  const brim = part(new THREE.CylinderGeometry(0.2, 0.2, 0.025, 24), m); brim.position.set(0, 0.23, 0.01); brim.scale.z = 1.12; upper.add(brim);
  const strap = part(new THREE.TorusGeometry(0.125, 0.014, 6, 20, Math.PI), d); strap.position.set(0, 0.2, 0); strap.rotation.set(0, Math.PI / 2, Math.PI); upper.add(strap);
  // arms + rifle in a firing pose
  const gun = new THREE.Group(); gun.position.set(-0.1, 0.0, 0.18); upper.add(gun);
  const stock = part(roundedBox(0.07, 0.11, 0.3, 0.03, 2), d); stock.position.set(0, -0.04, -0.08); gun.add(stock);
  const recv = part(roundedBox(0.075, 0.09, 0.32, 0.025, 2), d); recv.position.set(0, 0, 0.2); gun.add(recv);
  const barrel = part(new THREE.CylinderGeometry(0.022, 0.022, 0.42, 10), d); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.02, 0.55); gun.add(barrel);
  const magz = part(roundedBox(0.05, 0.14, 0.07, 0.02, 1), d); magz.position.set(0, -0.1, 0.24); magz.rotation.x = 0.25; gun.add(magz);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.02, 0.78); gun.add(muzzle);
  const armR = capsule(0.07, 0.3, m); armR.position.set(-0.2, -0.02, 0.05); armR.rotation.set(1.25, 0, -0.35); upper.add(armR);
  const armL = capsule(0.07, 0.38, m); armL.position.set(0.0, -0.02, 0.22); armL.rotation.set(1.45, 0, 0.9); upper.add(armL);
  root.traverse((o) => { if (o.isMesh) o.userData.team = team; });
  return { root, body, legs, torso, upper, muzzle, gun };
}

let NEXT = 1;
export class Soldier {
  constructor(team, scene, name) {
    this.id = NEXT++; this.team = team; this.name = name || (team ? 'Tan' : 'Green');
    this.m = buildModel(team); scene.add(this.m.root); this.scene = scene;
    this.x = 0; this.y = 0; this.z = 0; this.vx = 0; this.vy = 0; this.vz = 0;
    this.yaw = team ? Math.PI : 0; this.pitch = 0; this.hp = MAXHP; this.alive = true; this.ground = true;
    this.ammo = MAG; this.reloadT = 0; this.fireT = 0; this.gren = GREN; this.grenT = 0; this.hurtT = 0; this.respawnT = 0; this.spawnProt = 0;
    this.kills = 0; this.deaths = 0; this.walk = 0; this.deadT = 0; this.tip = { ax: 0, az: 0 }; this.inWater = false;
    this.input = { mx: 0, mz: 0, fire: false, jump: false, sprint: false, aim: false, gren: false, reload: false };
    this.bot = null; this.local = false; this.remote = false; this.flash = 0; this.recoil = 0; this.lastHitBy = null;
  }
  spawn(x, z) {
    this.x = x; this.y = 0.02; this.z = z; this.vx = this.vy = this.vz = 0; this.yaw = this.team ? Math.PI : 0; this.pitch = 0;
    this.hp = MAXHP; this.alive = true; this.ammo = MAG; this.reloadT = 0; this.gren = GREN; this.spawnProt = 1.5; this.deadT = 0;
    this.m.body.rotation.set(0, 0, 0); this.m.body.position.set(0, 0, 0); this.m.root.visible = true;
  }
  eye() { return [this.x, this.y + 1.62, this.z]; }
  dir() { const cp = Math.cos(this.pitch); return [Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp]; }

  // ---- physics
  overlaps(boxes, x, y, z) {
    for (const b of boxes) if (x + R > b.x0 && x - R < b.x1 && z + R > b.z0 && z - R < b.z1 && y + H > b.y0 && y < b.y1) return b;
    return null;
  }
  move(dt, boxes, water) {
    const inp = this.input;
    this.inWater = !!(water && this.z > water.z0 && this.z < water.z1 && this.y < 0.4);
    let sp = (inp.sprint && !inp.aim ? SPRINT : SPEED) * (inp.aim ? 0.6 : 1) * (this.inWater ? 0.55 : 1);
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    let wx = -inp.mx * c + inp.mz * s, wz = inp.mx * s + inp.mz * c;
    const l = Math.hypot(wx, wz); if (l > 1) { wx /= l; wz /= l; }
    const acc = this.ground ? 14 : 4;
    this.vx += (wx * sp - this.vx) * Math.min(1, acc * dt);
    this.vz += (wz * sp - this.vz) * Math.min(1, acc * dt);
    if (inp.jump && this.ground) { this.vy = JUMP; this.ground = false; this.jumped = true; }
    this.vy -= GRAV * dt;
    // horizontal with step-up
    for (const ax of ['x', 'z']) {
      const d = (ax === 'x' ? this.vx : this.vz) * dt; if (!d) continue;
      this[ax] += d;
      const b = this.overlaps(boxes, this.x, this.y, this.z);
      if (b) {
        const up = b.y1 - this.y;
        if (up > 0 && up <= STEP && (this.ground || this.vy < 2) && !this.overlaps(boxes, this.x, b.y1 + 0.001, this.z)) { this.y = b.y1 + 0.001; this.vy = Math.max(this.vy, 0); this.stepped = true; }
        else {
          if (ax === 'x') { this.x = d > 0 ? b.x0 - R - 0.001 : b.x1 + R + 0.001; this.vx = 0; }
          else { this.z = d > 0 ? b.z0 - R - 0.001 : b.z1 + R + 0.001; this.vz = 0; }
          if (this.overlaps(boxes, this.x, this.y, this.z)) this[ax] -= d; // safety
          this.blocked = true;
        }
      }
    }
    const wasGround = this.ground;
    this.y += this.vy * dt; this.ground = false;
    const b = this.overlaps(boxes, this.x, this.y, this.z);
    if (b) {
      if (this.vy <= 0) { this.y = b.y1 + 0.001; if (!wasGround && this.vy < -8) this.landed = true; this.vy = 0; this.ground = true; }
      else { this.y = b.y0 - H - 0.001; this.vy = 0; }
    } else if (this.vy <= 0 && this.overlaps(boxes, this.x, this.y - 0.06, this.z)) { this.ground = true; }
    if (this.y < -20) { this.y = 0; this.hp = 0; }
  }

  // ---- visuals
  render(dt, now) {
    const m = this.m;
    m.root.position.set(this.x, this.y, this.z);
    m.root.rotation.y = this.yaw;
    if (!this.alive) {
      this.deadT += dt;
      const k = Math.min(1, this.deadT * 3.2);
      const e = 1 - Math.pow(1 - k, 3);
      m.body.rotation.x = this.tip.ax * e * 1.5; m.body.rotation.z = this.tip.az * e * 1.5;
      m.body.position.y = e * 0.12 - Math.max(0, this.deadT - 1.6) * 0.8;
      if (this.deadT > 2.6) m.root.visible = false;
      return;
    }
    const sp = Math.hypot(this.vx, this.vz);
    this.walk += dt * sp * 1.9;
    const a = Math.min(1, sp / 5) * 0.75 * (this.ground ? 1 : 0.3);
    for (let i = 0; i < 2; i++) {
      const ph = this.walk + i * Math.PI;
      m.legs[i].hip.rotation.x = Math.sin(ph) * a + (this.ground ? 0 : -0.5);
      m.legs[i].knee.rotation.x = Math.max(0, -Math.cos(ph)) * a * 1.2 + (this.ground ? 0 : 0.8);
    }
    m.torso.position.y = 0.95 + Math.abs(Math.sin(this.walk)) * 0.05 * a;
    m.upper.rotation.x = -this.pitch * 0.8;
    this.recoil = Math.max(0, this.recoil - dt * 8);
    m.gun.position.z = 0.18 - this.recoil * 0.06;
    const flashOn = this.spawnProt > 0 && Math.floor(now * 12) % 2 === 0;
    m.body.visible = !flashOn;
  }
  dispose() { this.scene.remove(this.m.root); }
}
