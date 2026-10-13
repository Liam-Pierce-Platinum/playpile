// Monster + boss behaviour. Every attack that can hurt you is telegraphed on the floor first.
import * as THREE from '../vendor/three.module.js';
import { TS, rnd, pick, clamp, d2, angDiff, damp, lerp } from './util.js';
import { collide, los, tileAt, solidTile, T } from './dungeon.js';
import { G, C } from './state.js';
import { sfx } from './audio.js';
import { hurtPlayer, spawnEProj, spawnMonster, damage, shakeIt, hitStop, randomRoomSpot } from './game.js';

// ---------------------------------------------------------------- movement helpers
function stepToward(m, tx, tz, speed, dt) {
  const F = G.F;
  let dx = tx - m.x, dz = tz - m.z;
  if (!los(F, m.x, m.z, tx, tz) && G.flow) {
    // follow the BFS field toward the wizard
    const mx = Math.floor(m.x / TS), my = Math.floor(m.z / TS);
    let best = G.flow[my * F.W + mx], bx = mx, by = my;
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = mx + ox, ny = my + oy;
      if (nx < 0 || ny < 0 || nx >= F.W || ny >= F.H) continue;
      const v = G.flow[ny * F.W + nx];
      if (v >= 0 && (best < 0 || v < best)) { best = v; bx = nx; by = ny; }
    }
    dx = (bx + 0.5) * TS - m.x; dz = (by + 0.5) * TS - m.z;
  }
  const d = Math.hypot(dx, dz);
  if (d < 0.01) return;
  m.x += (dx / d) * speed * dt; m.z += (dz / d) * speed * dt;
  m.face = Math.atan2(dx, dz);
}
// telegraph time multiplier: early floors give a human more time to read and step out of every attack
export function teleK() { const f = G.run ? G.run.floorNum : 1; return f <= 3 ? 1.3 : f <= 6 ? 1.12 : 1; }
function faceP(m) { const P = G.P; m.face = Math.atan2(P.x - m.x, P.z - m.z); }
function distP(m) { const P = G.P; return Math.hypot(P.x - m.x, P.z - m.z); }
function aimAt(m) { const P = G.P; return Math.atan2(P.x - m.x, P.z - m.z); }
function fire(m, a, speed, dmg, o = {}) {
  if (G.run && G.run.floorNum <= 3) speed *= 0.82; // early floors: slower shots a human can step around
  spawnEProj(Object.assign({ x: m.x + Math.sin(a) * (m.r + 0.2), z: m.z + Math.cos(a) * (m.r + 0.2), vx: Math.sin(a) * speed, vz: Math.cos(a) * speed, dmg }, o));
}
function roomSpot(m, minFromP) {
  const r = G.F.rooms[m.room];
  return r ? randomRoomSpot(r, minFromP) : { x: m.x, z: m.z };
}

// ---------------------------------------------------------------- per-type AI
const AI = {
  slime(m, dt, sp) {
    m.t += dt;
    const cyc = m.type === 'slimelet' ? 0.7 : 0.95;
    const ph = (m.t % cyc) / cyc;
    if (ph < 0.55) { stepToward(m, G.P.x, G.P.z, m.speed * 1.8 * sp, dt); m.y = Math.sin((ph / 0.55) * Math.PI) * 0.5; }
    else m.y = 0;
    m.squash = ph < 0.55 ? 0.85 + Math.sin((ph / 0.55) * Math.PI) * 0.3 : 1 - Math.sin(((ph - 0.55) / 0.45) * Math.PI) * 0.18;
  },
  skeleton(m, dt, sp) {
    const d = distP(m), P = G.P;
    if (m.state === 'aim') {
      m.t -= dt; m.face = m.aimA;
      if (m.t <= 0) {
        fire(m, m.aimA, 15, m.dmg, { kind: 'arrow', hex: 0xff6040, r: 0.22 }); sfx('arrow');
        if (m.elite) { fire(m, m.aimA - 0.2, 15, m.dmg, { kind: 'arrow', r: 0.22 }); fire(m, m.aimA + 0.2, 15, m.dmg, { kind: 'arrow', r: 0.22 }); }
        m.state = 'idle'; m.cd = rnd(1.7, 2.6);
      }
      return;
    }
    const sight = los(G.F, m.x, m.z, P.x, P.z);
    if (d < 5.5) { const a = aimAt(m) + Math.PI + Math.sin(m.anim) * 0.6; stepToward(m, m.x + Math.sin(a) * 3, m.z + Math.cos(a) * 3, m.speed * sp, dt); }
    else if (d > 11 || !sight) stepToward(m, P.x, P.z, m.speed * sp, dt);
    else { const a = aimAt(m) + Math.PI / 2; m.x += Math.sin(a) * Math.sin(m.anim * 0.5) * m.speed * 0.5 * dt * sp; m.z += Math.cos(a) * Math.sin(m.anim * 0.5) * m.speed * 0.5 * dt * sp; faceP(m); }
    m.cd -= dt;
    if (m.cd <= 0 && sight && d < 15) {
      m.state = 'aim'; m.t = 0.65 * teleK(); m.aimA = aimAt(m);
      C.ground.teleLine(m.x, m.z, m.aimA, Math.min(15, d + 3), 0.3, m.t, 0xff5030);
    }
  },
  bat(m, dt, sp) {
    const P = G.P;
    m.y = 1.3 + Math.sin(m.anim * 3) * 0.2;
    if (m.state === 'tell') { m.t -= dt; faceP(m); if (m.t <= 0) { m.state = 'swoop'; m.t = 0.5; m.sa = aimAt(m); sfx('dash'); } return; }
    if (m.state === 'swoop') {
      m.t -= dt; m.x += Math.sin(m.sa) * 13 * dt * sp; m.z += Math.cos(m.sa) * 13 * dt * sp; m.face = m.sa; m.y = 0.9;
      if (m.t <= 0) { m.state = 'idle'; m.cd = rnd(1.8, 3); }
      return;
    }
    m.orb = (m.orb ?? Math.random() * 6.28) + dt * 1.4 * (m.dir || (m.dir = Math.random() < 0.5 ? -1 : 1));
    const R = 4.2 + Math.sin(m.anim * 0.7) * 1;
    stepToward(m, P.x + Math.sin(m.orb) * R, P.z + Math.cos(m.orb) * R, m.speed * sp, dt);
    m.cd -= dt;
    if (m.cd <= 0 && distP(m) < 9 && los(G.F, m.x, m.z, P.x, P.z)) { m.state = 'tell'; m.t = 0.45 * teleK(); C.ground.teleLine(m.x, m.z, aimAt(m), 6.8, 0.8, m.t, 0xff4040); }
  },
  goblin(m, dt, sp) {
    const P = G.P;
    if (m.state === 'tell') { m.t -= dt; m.face = m.ca; if (m.t <= 0) { m.state = 'charge'; m.t = m.clen / 15; sfx('charge'); } return; }
    if (m.state === 'charge') {
      m.t -= dt; m.charging = true;
      const ox = m.x, oz = m.z;
      m.x += Math.sin(m.ca) * 15 * dt; m.z += Math.cos(m.ca) * 15 * dt;
      if (Math.random() < 0.6) C.fx.emit(m.x, 0.2, m.z, rnd(-1, 1), 1, rnd(-1, 1), 0x8a7a60, 0.8, 0.5);
      if (collide(G.F, m, m.r) && Math.hypot(m.x - ox, m.z - oz) < 15 * dt * 0.5) { m.state = 'stun'; m.t = 1.2; m.charging = false; shakeIt(0.2); sfx('slam'); C.fx.burst(m.x, 1.6, m.z, 0xffe080, 10, 3, 0.4, 0.6); return; }
      if (m.t <= 0) { m.state = 'idle'; m.cd = rnd(2, 3); m.charging = false; }
      return;
    }
    if (m.state === 'stun') { m.t -= dt; if (Math.random() < 0.2) C.fx.emit(m.x + rnd(-0.3, 0.3), 1.8, m.z + rnd(-0.3, 0.3), 0, 0.5, 0, 0xffe080, 0.3, 0.4); if (m.t <= 0) { m.state = 'idle'; m.cd = 1; } return; }
    stepToward(m, P.x, P.z, m.speed * sp, dt);
    m.cd -= dt;
    const d = distP(m);
    if (m.cd <= 0 && d < 10 && d > 2 && los(G.F, m.x, m.z, P.x, P.z)) {
      m.state = 'tell'; m.t = 0.65 * teleK(); m.ca = aimAt(m); m.clen = Math.min(14, d + 4);
      C.ground.teleLine(m.x, m.z, m.ca, m.clen, 1.3, m.t, 0xff3030);
    }
  },
  ghost(m, dt, sp) {
    const P = G.P;
    m.y = 0.25 + Math.sin(m.anim * 2) * 0.2;
    if (m.state === 'cast') {
      m.t -= dt; faceP(m);
      if (Math.random() < 0.6) C.fx.emit(m.x + rnd(-0.4, 0.4), 1.2, m.z + rnd(-0.4, 0.4), 0, 1, 0, 0x88aaff, 0.5, 0.5);
      if (m.t <= 0) {
        const a = aimAt(m), n = m.elite ? 5 : 3;
        for (let i = 0; i < n; i++) fire(m, a + (i - (n - 1) / 2) * 0.45, 5.5, m.dmg, { hex: 0x88aaff, turn: 1.3, life: 4, r: 0.3, y: 1.1 });
        sfx('shoot'); m.state = 'idle'; m.cd = rnd(2.6, 3.4);
      }
      return;
    }
    const d = distP(m);
    m.tp = (m.tp ?? 2) - dt;
    if (d < 3.2 && m.tp <= 0) {
      C.fx.burst(m.x, 1, m.z, 0xaad0ff, 20, 4, 0.6, 0.5);
      const s = roomSpot(m, 6); m.x = s.x; m.z = s.z; m.tp = 4;
      C.fx.burst(m.x, 1, m.z, 0xaad0ff, 20, 4, 0.6, 0.5); sfx('blink');
      return;
    }
    if (d > 8) stepToward(m, P.x, P.z, m.speed * sp, dt);
    else if (d < 5) { const a = aimAt(m) + Math.PI; stepToward(m, m.x + Math.sin(a) * 2, m.z + Math.cos(a) * 2, m.speed * sp, dt); }
    else faceP(m);
    m.cd -= dt;
    if (m.cd <= 0 && d < 13) { m.state = 'cast'; m.t = 0.6; }
  },
  knight(m, dt, sp) {
    const P = G.P;
    if (m.state === 'wind') {
      m.t -= dt;
      if (m.t <= 0) {
        m.state = 'swing'; m.t = 0.25;
        const d = distP(m), a = aimAt(m);
        if (d < m.reach + G.P.r && Math.abs(angDiff(m.sa, a)) < 1.0) hurtPlayer(m.dmg, m.x, m.z);
        sfx('slam'); shakeIt(0.15);
        for (let i = 0; i < 12; i++) { const aa = m.sa + rnd(-1, 1); C.fx.emit(m.x + Math.sin(aa) * 2, 1, m.z + Math.cos(aa) * 2, Math.sin(aa) * 3, 0.5, Math.cos(aa) * 3, 0xdfe6f0, 0.5, 0.3); }
      }
      return;
    }
    if (m.state === 'swing') { m.t -= dt; if (m.t <= 0) { m.state = 'idle'; m.cd = rnd(1.2, 1.8); } return; }
    const d = distP(m);
    if (d > 2.0) stepToward(m, P.x, P.z, m.speed * sp, dt); else faceP(m);
    m.cd -= dt;
    if (m.cd <= 0 && d < 3.0) {
      m.state = 'wind'; m.t = 0.7 * teleK(); m.sa = aimAt(m); m.face = m.sa; m.reach = 3.2 * (m.elite ? 1.3 : 1);
      C.ground.teleArc(m.x, m.z, m.sa, m.reach, 2.0, m.t, 0xff3030);
    }
  },
  spider(m, dt, sp) {
    const P = G.P;
    if (m.state === 'crouch') { m.t -= dt; m.squash = 0.7; if (m.t <= 0) { m.state = 'leap'; m.t = 0; m.sx = m.x; m.sz = m.z; } return; }
    if (m.state === 'leap') {
      m.t += dt / 0.45;
      const p = Math.min(1, m.t);
      m.x = lerp(m.sx, m.lx, p); m.z = lerp(m.sz, m.lz, p); m.y = Math.sin(p * Math.PI) * 1.8;
      if (p >= 1) {
        m.y = 0; m.state = 'idle'; m.cd = rnd(2, 3);
        if (Math.hypot(P.x - m.x, P.z - m.z) < 1.4 + P.r) hurtPlayer(m.dmg * 1.3, m.x, m.z);
        C.fx.burst(m.x, 0.2, m.z, 0x8a7a60, 12, 3, 0.6, 0.5, { flat: true });
      }
      return;
    }
    m.zig = (m.zig || 0) + dt * 6;
    const a = aimAt(m) + Math.sin(m.zig) * 0.9;
    const d = distP(m);
    if (los(G.F, m.x, m.z, P.x, P.z)) { m.x += Math.sin(a) * m.speed * sp * dt; m.z += Math.cos(a) * m.speed * sp * dt; m.face = a; }
    else stepToward(m, P.x, P.z, m.speed * sp, dt);
    m.cd -= dt;
    if (m.cd <= 0 && d < 7 && d > 2.5) {
      if (Math.random() < 0.35) { fire(m, aimAt(m), 11, m.dmg * 0.5, { hex: 0xeeeeff, slow: 1.8, r: 0.3, y: 0.6 }); sfx('shoot'); m.cd = rnd(1.5, 2.2); }
      else {
        m.state = 'crouch'; m.t = 0.42 * teleK(); m.lx = P.x; m.lz = P.z;
        C.ground.teleCircle(m.lx, m.lz, 1.4, m.t + 0.45, 0xff3030);
      }
    }
  },
  mimic(m, dt, sp) {
    const P = G.P;
    if (m.state === 'disguised') {
      if (distP(m) < 2.6) {
        m.state = 'reveal'; m.t = 0.6; m.room = G.room; sfx('roar'); shakeIt(0.35);
        m.model.reveal();
        C.ui.toast('It was a MIMIC!', '#ff6a6a', 1.5);
      }
      return;
    }
    if (m.state === 'reveal') { m.t -= dt; m.model.lid.rotation.x = -0.9 * (1 - m.t / 0.6); faceP(m); if (m.t <= 0) { m.state = 'idle'; m.cd = 0.6; } return; }
    if (m.state === 'tell') { m.t -= dt; m.face = m.la; if (m.t <= 0) { m.state = 'lunge'; m.t = 0.38; sfx('charge'); } return; }
    if (m.state === 'lunge') { m.t -= dt; m.charging = true; m.x += Math.sin(m.la) * 13 * dt; m.z += Math.cos(m.la) * 13 * dt; m.y = Math.sin((m.t / 0.38) * Math.PI) * 0.6; if (m.t <= 0) { m.state = 'idle'; m.cd = rnd(1.2, 1.8); m.charging = false; m.y = 0; } return; }
    m.t += dt;
    stepToward(m, P.x, P.z, m.speed * sp, dt);
    m.y = Math.abs(Math.sin(m.t * 8)) * 0.25;
    m.cd -= dt;
    if (m.cd <= 0 && distP(m) < 7) { m.state = 'tell'; m.t = 0.45 * teleK(); m.la = aimAt(m); C.ground.teleLine(m.x, m.z, m.la, 5.5, 1.6, m.t, 0xff3030); }
  },
};
AI.slimelet = AI.slime;

// ---------------------------------------------------------------- bosses
const BOSS_ATT = {
  gloop: ['slam', 'ring', 'slam', 'summon', 'volley'],
  warden: ['charge', 'sweep', 'shock', 'volley', 'charge', 'sweep'],
  matriarch: ['spiral', 'beam', 'volley', 'summon', 'teleport', 'beam', 'ring'],
  crown: ['spiral', 'beam', 'slam', 'ring', 'summon', 'charge', 'volley', 'shock'],
};
const BOSS_MINION = { gloop: ['slime', 'slime', 'slimelet'], warden: ['goblin', 'knight'], matriarch: ['skeleton', 'bat', 'ghost'], crown: ['ghost', 'skeleton', 'spider', 'knight', 'bat'] };
const BOSS_HEX = { gloop: 0x7aff6a, warden: 0xff6040, matriarch: 0x9dff6a, crown: 0xc070ff };

function ringBullets(m, n, speed, dmg, off = 0, hex) {
  for (let i = 0; i < n; i++) fire(m, off + (i / n) * Math.PI * 2, speed, dmg, { hex, r: 0.38, y: 1.0 });
}

function bossBegin(m, name) {
  const P = G.P, k = (m.p2 ? 0.8 : 1) * teleK(), hex = BOSS_HEX[m.type];
  const A = { t: 0, name };
  m.state = 'act'; m.A = A;
  switch (name) {
    case 'slam': {
      const tx = P.x, tz = P.z, R = m.type === 'gloop' ? 3.6 : 3.2, dur = 1.05 * k, sx = m.x, sz = m.z;
      C.ground.teleCircle(tx, tz, R, dur);
      A.up = (dt) => {
        A.t += dt; const p = Math.min(1, A.t / dur);
        m.x = lerp(sx, tx, p); m.z = lerp(sz, tz, p); m.y = Math.sin(p * Math.PI) * 6;
        if (p >= 1) {
          m.y = 0; sfx('slam'); shakeIt(0.9); hitStop(0.06);
          C.ground.ring(tx, tz, R * 1.3, hex, 0.5);
          C.fx.burst(tx, 0.3, tz, hex, 50, 10, 1, 0.7, { flat: true, up: 2 });
          if (Math.hypot(P.x - tx, P.z - tz) < R + P.r) hurtPlayer(m.dmg * 1.2, tx, tz);
          if (m.p2) ringBullets(m, 14, 7, m.dmg * 0.6, Math.random(), hex);
          return true;
        }
      };
      break;
    }
    case 'ring': {
      const dur = 0.7 * k;
      C.ground.teleCircle(m.x, m.z, m.r + 1.2, dur, 0xff3030);
      A.up = (dt) => {
        A.t += dt;
        if (A.t >= dur && !A.f1) { A.f1 = true; ringBullets(m, m.type === 'gloop' ? (m.p2 ? 16 : 12) : m.p2 ? 22 : 16, m.type === 'gloop' ? 6 : 7, m.dmg * 0.7, Math.random(), hex); sfx('shoot'); shakeIt(0.2); }
        if (m.p2 && A.t >= dur + 0.4 && !A.f2) { A.f2 = true; ringBullets(m, 22, 6, m.dmg * 0.7, Math.random(), hex); sfx('shoot'); }
        return A.t >= dur + (m.p2 ? 0.6 : 0.3);
      };
      break;
    }
    case 'summon': {
      A.up = (dt) => {
        A.t += dt;
        if (Math.random() < 0.8) C.fx.emit(m.x + rnd(-1, 1), 2 + rnd(0, 2), m.z + rnd(-1, 1), 0, 2, 0, hex, 0.8, 0.6);
        if (A.t >= 0.8 && !A.done) {
          A.done = true;
          const alive = G.monsters.filter((o) => !o.dead && o.minion).length;
          const n = Math.max(0, Math.min(m.p2 ? 4 : 3, 7 - alive));
          for (let i = 0; i < n; i++) { const s = roomSpot(m, 4); spawnMonster(pick(BOSS_MINION[m.type]), s.x, s.z, { room: m.room, minion: true }); }
          sfx('summon');
        }
        return A.t >= 1.1;
      };
      break;
    }
    case 'charge': {
      const a = aimAt(m), len = 18, dur = 0.85 * k;
      C.ground.teleLine(m.x, m.z, a, len, m.r * 2 + 0.6, dur);
      m.face = a;
      A.up = (dt) => {
        A.t += dt;
        if (A.t < dur) return false;
        if (!A.go) { A.go = true; A.dist = 0; sfx('charge'); }
        m.charging = true;
        const step = 22 * dt;
        const ox = m.x, oz = m.z;
        m.x += Math.sin(a) * step; m.z += Math.cos(a) * step; A.dist += step;
        if (Math.random() < 0.8) C.fx.emit(m.x, 0.3, m.z, rnd(-2, 2), 1.5, rnd(-2, 2), 0x8a7a60, 1.2, 0.6);
        const hit = collide(G.F, m, m.r) && Math.hypot(m.x - ox, m.z - oz) < step * 0.5;
        if (hit || A.dist >= len) {
          m.charging = false;
          if (hit) { shakeIt(0.8); sfx('slam'); ringBullets(m, m.p2 ? 12 : 8, 6, m.dmg * 0.6, a, hex); }
          return true;
        }
      };
      break;
    }
    case 'sweep': {
      const a = aimAt(m), R = 6, dur = 0.8 * k;
      C.ground.teleArc(m.x, m.z, a, R, 3.4, dur);
      m.face = a;
      A.up = (dt) => {
        A.t += dt;
        if (A.t >= dur && !A.hit) {
          A.hit = true; sfx('slam'); shakeIt(0.5);
          const d = Math.hypot(P.x - m.x, P.z - m.z);
          if (d < R + P.r && Math.abs(angDiff(a, aimAt(m))) < 1.7) hurtPlayer(m.dmg * 1.1, m.x, m.z);
          for (let i = 0; i < 30; i++) { const aa = a + rnd(-1.7, 1.7), rr = rnd(1, R); C.fx.emit(m.x + Math.sin(aa) * rr, 1, m.z + Math.cos(aa) * rr, Math.sin(aa) * 4, 1, Math.cos(aa) * 4, 0xffd0a0, 0.7, 0.35); }
        }
        return A.t >= dur + 0.35;
      };
      break;
    }
    case 'shock': {
      const dur = 0.7 * k;
      C.ground.teleCircle(m.x, m.z, m.r + 1.5, dur);
      A.up = (dt) => {
        A.t += dt;
        const waves = m.p2 ? 3 : 2;
        for (let w = 0; w < waves; w++) {
          if (A.t >= dur + w * 0.55 && !(A['w' + w])) {
            A['w' + w] = true; sfx('slam'); shakeIt(0.5);
            G.hazards.push({ x: m.x, z: m.z, rad: m.r, speed: 8, max: 18, dmg: m.dmg * 0.8 });
            C.ground.ring(m.x, m.z, 18, hex, (18 - m.r) / 8, 0.1, true);
          }
        }
        return A.t >= dur + waves * 0.55 + 0.3;
      };
      break;
    }
    case 'volley': {
      const dur = 0.5 * k, a = aimAt(m);
      C.ground.teleLine(m.x, m.z, a, 12, 0.5, dur, 0xff5030);
      A.up = (dt) => {
        A.t += dt;
        if (A.t >= dur && !A.f) {
          A.f = true; const n = m.p2 ? 9 : 6, a2 = aimAt(m);
          for (let i = 0; i < n; i++) fire(m, a2 + (i - (n - 1) / 2) * 0.16, 11, m.dmg * 0.6, { hex, r: 0.32, y: 1.2 });
          sfx('shoot');
        }
        return A.t >= dur + 0.3;
      };
      break;
    }
    case 'spiral': {
      const dur = 3.0;
      A.spin = Math.random() * 6.28; A.e = 0;
      A.up = (dt) => {
        A.t += dt;
        if (A.t < 0.5) { if (Math.random() < 0.7) C.fx.emit(m.x, 2, m.z, rnd(-3, 3), 1, rnd(-3, 3), hex, 0.8, 0.4); return false; }
        A.e -= dt;
        if (A.e <= 0) {
          A.e = 0.11;
          const arms = m.p2 ? 4 : 3;
          for (let i = 0; i < arms; i++) fire(m, A.spin + (i / arms) * Math.PI * 2, 6.5, m.dmg * 0.55, { hex, r: 0.32, y: 1.2, life: 4 });
          A.spin += 0.28; sfx('shoot');
        }
        return A.t >= dur;
      };
      break;
    }
    case 'beam': {
      const dur = 1.0 * k, n = m.p2 ? 3 : 1, a0 = aimAt(m), len = 24;
      const angs = []; for (let i = 0; i < n; i++) angs.push(a0 + (i - (n - 1) / 2) * 0.5);
      for (const a of angs) C.ground.teleLine(m.x, m.z, a, len, 1.6, dur);
      A.up = (dt) => {
        A.t += dt;
        if (A.t >= dur && !A.f) {
          A.f = true; sfx('zap'); shakeIt(0.5);
          C.flash.flash(m.x, 2, m.z, hex, 10, 20, 0.4);
          for (const a of angs) {
            for (let s = 0; s < len; s += 0.3) C.fx.emit(m.x + Math.sin(a) * s, 1.2, m.z + Math.cos(a) * s, rnd(-0.5, 0.5), rnd(0, 1), rnd(-0.5, 0.5), Math.random() < 0.3 ? 0xffffff : hex, 1.0, 0.5);
            // distance from wizard to the beam segment
            const ux = Math.sin(a), uz = Math.cos(a), px = P.x - m.x, pz = P.z - m.z;
            const along = px * ux + pz * uz, perp = Math.abs(px * uz - pz * ux);
            if (along > 0 && along < len && perp < 0.8 + P.r) hurtPlayer(m.dmg * 1.1, m.x, m.z);
          }
        }
        return A.t >= dur + 0.4;
      };
      break;
    }
    case 'teleport': {
      A.up = (dt) => {
        A.t += dt;
        if (A.t < 0.4) { m.model.root.scale.setScalar(Math.max(0.01, 1 - A.t / 0.4) * (m.baseScale || 1)); return false; }
        if (!A.moved) { A.moved = true; C.fx.burst(m.x, 2, m.z, hex, 40, 6, 0.8, 0.6); const s = roomSpot(m, 7); m.x = s.x; m.z = s.z; sfx('blink'); C.fx.burst(m.x, 2, m.z, hex, 40, 6, 0.8, 0.6); }
        m.model.root.scale.setScalar(Math.min(1, (A.t - 0.4) / 0.4) * (m.baseScale || 1));
        return A.t >= 0.8;
      };
      break;
    }
  }
}
function bossAI(m, dt, sp) {
  if (!m.p2 && m.hp < m.maxHp * 0.5) {
    m.p2 = true; sfx('roar'); shakeIt(0.8);
    C.ui.toast(`${m.def.name} is enraged!`, '#ff6a6a', 2);
    C.ground.ring(m.x, m.z, 8, BOSS_HEX[m.type], 0.6);
  }
  if (m.state === 'act') {
    const done = m.A.up(dt);
    if (done) { m.state = 'idle'; m.charging = false; m.t = rnd(0.7, 1.3) * (m.p2 ? 0.7 : 1); m.y = m.def.fly ? m.y : 0; }
    return;
  }
  const P = G.P;
  const d = distP(m);
  if (d > 5) stepToward(m, P.x, P.z, m.speed * sp, dt); else faceP(m);
  if (m.type === 'gloop') m.y = Math.abs(Math.sin(m.anim * 3)) * 0.4;
  m.t -= dt;
  if (m.t <= 0) {
    const list = BOSS_ATT[m.type];
    let a = pick(list);
    if (a === m.lastAtt) a = pick(list);
    m.lastAtt = a;
    bossBegin(m, a);
  }
}

// ---------------------------------------------------------------- main monster loop
export function updateMonsters(dt) {
  const P = G.P;
  const list = G.monsters;
  for (const m of list) {
    if (m.dead) continue;
    m.anim += dt;
    if (m.spawnT > 0) {
      m.spawnT -= dt;
      if (m.boss) { if (Math.random() < 0.8) C.fx.emit(m.x + rnd(-2, 2), 0.3, m.z + rnd(-2, 2), 0, 3, 0, 0x8a5cff, 1, 0.8); }
      if (m.spawnT <= 0) { m.t = m.boss ? 1.2 : 0; }
      continue;
    }
    m.flash -= dt; m.slowT -= dt; m.freezeT -= dt; m.contactCd -= dt; m.hpShow -= dt;
    if (m.stunT > 0) m.stunT -= dt;
    if (m.burnT > 0) {
      m.burnT -= dt; m.burnTick -= dt;
      if (Math.random() < 0.5) C.fx.emit(m.x + rnd(-0.3, 0.3), 0.8 + (m.y || 0), m.z + rnd(-0.3, 0.3), 0, 1.5, 0, 0xff7a2a, 0.5, 0.4);
      if (m.burnTick <= 0) { m.burnTick = 0.5; damage(m, m.burnDps * 0.5, { dot: true, hex: 0xff7a2a }); if (m.dead) continue; }
    }
    const frozen = m.freezeT > 0;
    const sp = m.slowT > 0 ? 0.5 : 1;
    if (!frozen && !(m.stunT > 0)) {
      if (m.boss) bossAI(m, dt, sp);
      else AI[m.type](m, dt, sp);
    }
    if (m.dead) continue;
    // knockback
    if (Math.abs(m.kx) + Math.abs(m.kz) > 0.01) { m.x += m.kx * dt; m.z += m.kz * dt; m.kx = damp(m.kx, 0, 8, dt); m.kz = damp(m.kz, 0, 8, dt); }
    // separation
    if (m.state !== 'disguised') for (const o of list) {
      if (o === m || o.dead || o.state === 'disguised' || o.spawnT > 0) continue;
      const dx = m.x - o.x, dz = m.z - o.z, rr = m.r + o.r, q = dx * dx + dz * dz;
      if (q < rr * rr && q > 1e-6) {
        const d = Math.sqrt(q), push = (rr - d) * (o.boss ? 1 : 0.5);
        if (!m.boss) { m.x += (dx / d) * push; m.z += (dz / d) * push; }
      }
    }
    collide(G.F, m, m.r);
    // contact damage
    if (!P.dead && m.state !== 'disguised' && m.state !== 'reveal' && m.contactCd <= 0 && !frozen) {
      const rr = m.r + P.r + 0.05;
      if (d2(m.x, m.z, P.x, P.z) < rr * rr && (m.y || 0) < 1.4) {
        const base = m.type === 'skeleton' || m.type === 'ghost' ? 0.5 : 1;
        const mult = m.charging ? 1.3 : m.boss ? 0.6 : base;
        if (hurtPlayer(m.dmg * mult, m.x, m.z)) m.contactCd = 0.8;
      }
    }
    if (m.boss) C.ui.bossHp(m.hp / m.maxHp);
  }
  // drop dead ones from the list (their meshes are removed by killMonster)
  for (let i = list.length - 1; i >= 0; i--) if (list[i].dead) list.splice(i, 1);
}

// ---------------------------------------------------------------- per-frame looks
const barGeo = new THREE.PlaneGeometry(1, 0.12);
const barBg = new THREE.MeshBasicMaterial({ color: 0x1a0a0a, transparent: true, opacity: 0.75, depthTest: false });
const barFg = new THREE.MeshBasicMaterial({ color: 0xff4a4a, depthTest: false });
const barFgE = new THREE.MeshBasicMaterial({ color: 0xffc040, depthTest: false });
export function monsterAnimate(m, dt, camera) {
  const md = m.model, root = md.root;
  if (m.dead && !m.boss) return;
  if (m.spawnT > 0) { const p = 1 - m.spawnT / (m.boss ? 1.4 : 0.7); root.scale.setScalar(Math.max(0.01, p) * m.baseScale); }
  else if (!(m.A && m.A.name === 'teleport' && m.state === 'act')) root.scale.setScalar(m.baseScale);
  root.position.set(m.x, m.y || 0, m.z);
  const cur = root.rotation.y;
  root.rotation.y = cur + angDiff(cur, m.face) * Math.min(1, dt * 10);
  const t = m.anim;
  const b = md.body;
  // how fast it is actually moving (drives walk cycles)
  const sp = dt > 0 && m._px != null ? Math.hypot(m.x - m._px, m.z - m._pz) / dt : 0;
  m._px = m.x; m._pz = m.z;
  m._mv = damp(m._mv || 0, Math.min(1, sp / 3), 8, dt);
  m._ph = (m._ph || 0) + dt * (4 + sp * 2.2);
  const mv = m._mv, ph = m._ph, breathe = Math.sin(t * 2.4);
  const act = m.state === 'act' && m.A ? m.A : null;
  // hit squash: set by damage() through m.flash; decays smoothly
  if (m.flash > 0) m._hit = 1;
  m._hit = Math.max(0, (m._hit || 0) - dt * 6);
  const hk = m._hit;
  let sx = 1, sy = 1;
  const legs = (amp) => { if (md.legL) { md.legL.rotation.x = Math.sin(ph) * amp * mv; md.legR.rotation.x = -Math.sin(ph) * amp * mv; } };
  const arms = (amp) => { if (md.armL) { md.armL.rotation.x = -Math.sin(ph) * amp * mv; md.armR.rotation.x = Math.sin(ph) * amp * mv; } };
  switch (m.type) {
    case 'slime': case 'slimelet': case 'gloop': {
      const s = m.squash || 1 + Math.sin(t * 4) * 0.05;
      sx = 1 / Math.sqrt(s); sy = s;
      if (md.crown) { md.crown.rotation.z = Math.sin(t * 3) * 0.08; md.crown.position.y = 1.0 + (s - 1) * 0.4; }
      if (m.type === 'gloop' && act && act.name === 'slam') { sy *= 1 + Math.sin(Math.min(1, act.t) * Math.PI) * 0.15; }
      break;
    }
    case 'skeleton': {
      legs(0.7); md.body.position.y = 0.86 + Math.abs(Math.sin(ph)) * 0.04 * mv;
      md.torso.rotation.x = 0.05 + breathe * 0.03; md.torso.rotation.y = Math.sin(ph) * 0.12 * mv;
      md.head.rotation.y = Math.sin(t * 0.9) * 0.25;
      if (m.state === 'aim') {
        const k = Math.min(1, (0.65 - m.t) / 0.3);
        md.armL.rotation.set(-0.15 * k, 0, -0.1 * k); md.armR.rotation.set(-1.25 * k, 0.4 * k, 0.5 * k);
        md.jaw.rotation.x = 0.1 + Math.abs(Math.sin(t * 22)) * 0.25; md.torso.rotation.y = -0.3 * k;
      } else {
        md.armL.rotation.set(-Math.sin(ph) * 0.3 * mv, 0, 0); md.armR.rotation.set(Math.sin(ph) * 0.4 * mv, 0, 0);
        md.jaw.rotation.x = 0.05 + Math.max(0, Math.sin(t * 3)) * 0.1;
      }
      break;
    }
    case 'bat': {
      const fr = m.state === 'swoop' ? 30 : m.state === 'tell' ? 8 : 16;
      const f = Math.sin(t * fr), f2 = Math.sin(t * fr - 0.9);
      md.wl.rotation.z = f * 0.75; md.wr.rotation.z = -f * 0.75;
      md.wlo.rotation.z = f2 * 0.6; md.wro.rotation.z = -f2 * 0.6;
      if (m.state === 'swoop') { md.wl.rotation.z = 0.5; md.wr.rotation.z = -0.5; md.wlo.rotation.z = -0.3; md.wro.rotation.z = 0.3; md.wl.rotation.y = 0.5; md.wr.rotation.y = -0.5; }
      else { md.wl.rotation.y = 0; md.wr.rotation.y = 0; }
      b.rotation.x = m.state === 'swoop' ? 0.7 : m.state === 'tell' ? -0.4 : 0.1;
      b.position.y = -f * 0.05;
      break;
    }
    case 'goblin': {
      const run = m.state === 'charge' ? 2.2 : 1;
      md.legL.rotation.x = Math.sin(ph * run) * 0.8 * Math.max(mv, m.state === 'charge' ? 1 : 0); md.legR.rotation.x = -md.legL.rotation.x;
      b.position.y = 0.5 + Math.abs(Math.sin(ph * run)) * 0.06 * mv + breathe * 0.01;
      b.rotation.x = m.state === 'charge' ? 0.5 : m.state === 'tell' ? -0.25 : 0.08;
      md.armL.rotation.x = -Math.sin(ph) * 0.6 * mv; md.armL.rotation.z = m.state === 'charge' ? -0.6 : 0;
      md.armR.rotation.x = m.state === 'tell' ? -2.5 : m.state === 'charge' ? -1.2 : Math.sin(ph) * 0.4 * mv + Math.sin(t * 2) * 0.1;
      md.head.rotation.z = m.state === 'stun' ? Math.sin(t * 10) * 0.35 : Math.sin(t * 1.7) * 0.06;
      md.head.rotation.x = m.state === 'tell' ? -0.25 : 0;
      b.rotation.z = m.state === 'stun' ? Math.sin(t * 10) * 0.12 : 0;
      break;
    }
    case 'ghost': {
      b.rotation.z = Math.sin(t * 1.5) * 0.08; b.rotation.x = 0.1 + mv * 0.25;
      const cast = m.state === 'cast';
      md.hand.position.set(0.42, cast ? 1.35 : 0.86 + Math.sin(t * 2.3) * 0.05, cast ? 0.5 : 0.36);
      md.handL.position.set(-0.42, cast ? 1.25 : 0.86 + Math.sin(t * 2.3 + 1) * 0.05, cast ? 0.45 : 0.36);
      for (const mt of md.swayMats) mt.userData.sd.uSway.value.set(0, -0.12 * mv, t * 3, 0.05);
      break;
    }
    case 'knight': case 'warden': {
      legs(0.55); md.body.position.y = 0.9 + Math.abs(Math.sin(ph)) * 0.03 * mv;
      md.torso.rotation.x = breathe * 0.025; md.torso.scale.set(1 + breathe * 0.01, 1, 1 + breathe * 0.015);
      const wind = m.state === 'wind' || (act && act.name === 'sweep' && act.t < (0.8 * (m.p2 ? 0.75 : 1)));
      const swing = m.state === 'swing' || (act && act.name === 'sweep' && !wind);
      if (wind) { md.armR.rotation.set(-2.5, 0, -0.5); md.torso.rotation.y = 0.45; }
      else if (swing) { md.armR.rotation.set(-0.5, 0, 0.9); md.torso.rotation.y = -0.6; }
      else { md.armR.rotation.set(Math.sin(ph) * 0.3 * mv - 0.15, 0, 0); md.torso.rotation.y = Math.sin(ph) * 0.06 * mv; }
      md.armL.rotation.set(-0.35 - Math.sin(ph) * 0.15 * mv, 0.2, 0.15); // shield held forward (it blocks from the front)
      md.sword.rotation.x = wind ? -0.3 : swing ? 0.6 : -0.25;
      b.rotation.x = m.charging ? 0.4 : 0;
      md.head.rotation.y = Math.sin(t * 0.7) * 0.15;
      if (md.swayMats.length) for (const mt of md.swayMats) mt.userData.sd.uSway.value.set(0, -0.25 * mv - (m.charging ? 0.3 : 0), t * 2.5, 0.03);
      break;
    }
    case 'spider': {
      const gait = 3 + mv * 12;
      for (let i = 0; i < 8; i++) {
        const lp = t * gait + (i % 2) * Math.PI + (i < 4 ? 0 : Math.PI / 2);
        const L = md.legs[i];
        L.rotation.x = Math.sin(lp) * 0.3 * (0.2 + mv);
        L.rotation.z = (i < 4 ? 1 : -1) * Math.max(0, Math.cos(lp)) * 0.25 * (0.2 + mv);
        if (m.state === 'crouch') L.rotation.z = (i < 4 ? -1 : 1) * 0.3;
        if (m.state === 'leap') L.rotation.z = (i < 4 ? 1 : -1) * 0.45;
      }
      sy = m.squash || 1; m.squash = 1;
      b.rotation.x = m.state === 'leap' ? -0.3 : 0;
      b.position.y = Math.sin(t * 2.4) * 0.015;
      break;
    }
    case 'mimic': {
      if (m.state !== 'disguised') {
        if (m.state !== 'reveal') md.lid.rotation.x = -0.55 - Math.abs(Math.sin(t * 9)) * 0.55 - (m.state === 'tell' ? 0.5 : 0);
        md.tongue.rotation.x = Math.sin(t * 6) * 0.25; md.tongue.rotation.y = Math.sin(t * 4.3) * 0.3;
        b.rotation.z = Math.sin(t * 14) * 0.04 * mv;
      }
      break;
    }
    case 'matriarch': {
      b.position.y = 0.4 + Math.sin(t * 1.5) * 0.2;
      const casting = !!act;
      md.staff.rotation.z = casting ? -0.35 : Math.sin(t * 0.8) * 0.05;
      md.hands[0].position.y = 1.55 + (casting ? 0.6 : Math.sin(t * 1.3) * 0.08); md.hands[0].rotation.x = casting ? -1.0 : 0;
      md.hands[1].position.y = 1.55 + Math.sin(t * 1.3 + 1) * 0.08;
      md.shards.rotation.y += dt * (m.p2 ? 1.6 : 0.6); md.shards.position.y = 1.6 + Math.sin(t * 0.9) * 0.15;
      md.head.rotation.y = Math.sin(t * 0.6) * 0.2; md.head.rotation.x = casting ? -0.2 : 0;
      md.orb.scale.setScalar(1 + Math.sin(t * 5) * 0.1 + (casting ? 0.3 : 0));
      for (const mt of md.swayMats) mt.userData.sd.uSway.value.set(0, -0.15 * mv, t * 2, 0.06);
      break;
    }
    case 'crown': {
      b.position.y = Math.sin(t * 1.3) * 0.3; md.runes.rotation.y += dt * (m.p2 ? 2.4 : 1.2); md.crown.rotation.y -= dt * 0.4;
      md.tendrils.rotation.y = Math.sin(t * 0.7) * 0.4; md.tendrils.rotation.x = Math.sin(t * 1.1) * 0.08;
      const P = G.P; const a = Math.atan2(P.x - m.x, P.z - m.z) - root.rotation.y;
      md.pupil.rotation.y = clamp(angDiff(0, a), -0.5, 0.5) * 0.6;
      const blink = (t % 4.3) < 0.12 ? 0.1 : 1; md.pupil.scale.y = blink;
      break;
    }
  }
  // hit flash squash + a little recoil, layered on top of the per-type scale
  sx *= 1 + hk * 0.14; sy *= 1 - hk * 0.14;
  b.scale.set(sx, sy, sx);
  root.rotation.x = m.boss ? 0 : -hk * 0.18;
  // hit flash, freeze tint, burning
  const frozen = m.freezeT > 0;
  for (const mm of md.mats) {
    if (m.flash > 0) { mm.m.emissive.setHex(0xffffff); mm.m.emissiveIntensity = m.boss ? 0.22 : 0.55; }
    else if (frozen) { mm.m.emissive.setHex(0x3080ff); mm.m.emissiveIntensity = 0.8; }
    else { mm.m.emissive.copy(mm.e); mm.m.emissiveIntensity = mm.ei; }
  }
  if (m.state === 'tell' || m.state === 'wind' || m.state === 'crouch' || m.state === 'aim') {
    // pulse red while winding up
    if (Math.floor(t * 12) % 2 === 0) for (const mm of md.mats) { mm.m.emissive.setHex(0xff2020); mm.m.emissiveIntensity = 0.55; }
  }
  // health bar
  if (!m.boss && m.hpShow > 0 && !m.dead) {
    if (!md.bar) {
      const g = new THREE.Group();
      const bg = new THREE.Mesh(barGeo, barBg); bg.renderOrder = 10;
      const fg = new THREE.Mesh(barGeo, m.elite ? barFgE : barFg); fg.renderOrder = 11; fg.position.z = 0.001;
      g.add(bg, fg); md.bar = g; md.barFg = fg; C.scene.add(g);
      root.userData.bar = g;
    }
    md.bar.visible = true;
    md.bar.position.set(m.x, (m.y || 0) + (m.type === 'knight' ? 2.6 : 2.0) * (m.elite ? 1.3 : 1), m.z);
    md.bar.quaternion.copy(camera.quaternion);
    const f = Math.max(0, m.hp / m.maxHp);
    md.barFg.scale.x = f; md.barFg.position.x = -(1 - f) / 2;
  } else if (md.bar) md.bar.visible = false;
}
export function removeMonsterBar(m) { if (m.model.bar) C.scene.remove(m.model.bar); }
