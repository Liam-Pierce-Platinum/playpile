// Scripted kills and the combo impale. A script owns the hero and one enemy for its length: it places the enemy in
// the hero's frame, poses both rigs, fires timed events (stabs, cuts, slams), and hands the camera a shot.
import * as THREE from 'three';
import { animate } from './rig.js';
import { nearestWall, groundBelow } from './world.js';
import { aimZone } from './aim.js';
import { sfx } from './audio.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const A = (x, y, z, bend, k = 40) => ({ dir: V(x, y, z), bend, k });
const ease = t => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const seg = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));
const lerp = (a, b, k) => a + (b - a) * k;
const limp = { armL: A(0.25, -1, 0.1, 0.3, 8), armR: A(-0.25, -1, 0.1, 0.3, 8), headX: 0.5 };

// --- context: which finisher fits this enemy right now ---
export function canFinish(hero, e) {
  if (!e.alive || e.spawnT > 0 || !hero.clawsOut) return false;
  const d = Math.hypot(e.pos.x - hero.pos.x, e.pos.z - hero.pos.z);
  // the meter is the gate now (checked by the hero); any enemy in reach works
  return d < 3.4 && Math.abs(e.pos.y - hero.pos.y) < 2.2;
}
export function pickFinisher(hero, e, btn) {
  const G = hero.G, to = V(e.pos.x - hero.pos.x, 0, e.pos.z - hero.pos.z).normalize();
  const ef = V(Math.sin(e.yaw), 0, Math.cos(e.yaw)), behind = ef.dot(to) > 0.3;
  const zone = G.camera ? aimZone(G, e).zone : 'chest';
  let c;
  if (e.mode !== undefined && e.mode !== 'alert' && behind) c = ['silent'];
  else if (e.parriedT > 0) c = ['counter', 'execution'];
  else if (Math.hypot(hero.vel.x, hero.vel.z) > 7) c = ['sprint', 'kneespin'];
  else if (!hero.grounded || !e.grounded) c = ['skewer'];
  else if (e.type === 'thrower') c = ['ranged', 'chinlift'];
  else if (e.state === 'down') c = ['execution', 'harvest', 'butcher'];
  else {
    const w = nearestWall(e.pos, 0.38, 1.85, 2.4);
    if (w && w.normal.dot(to) < -0.6) c = ['bladepin', 'wallpin'];
    else if (behind) c = ['decapitate', 'backthrow'];
    else if (zone === 'head' || zone === 'neck') c = ['xcross', 'chinlift', 'decapitate'];
    else if (/arm/.test(zone)) c = ['harvest', 'butcher', 'scissor'];
    else if (/thigh|shin/.test(zone)) c = ['kneespin', 'harvest'];
    else c = ['barrage', 'impale', 'scissor'];
  }
  const pick = c.find(n => n !== G.lastFin && SCRIPTS[n].ok?.(hero, e) !== false) || c[0];
  G.lastFin = pick; return pick;
}
// Stealth takedowns (key E): from a wall onto him, from a ledge, dropping from above, or from behind on the ground.
export function takedownFor(hero, e) {
  if (!e.alive || e.held || e.mode === undefined || e.spawnT > 0) return null;
  const dx = e.pos.x - hero.pos.x, dz = e.pos.z - hero.pos.z, flat = Math.hypot(dx, dz), dy = hero.pos.y - e.pos.y;
  if (hero.climbing) { // from the wall: unaware, or alert but not looking up at you
    if (dy < 0.6 || Math.hypot(flat, dy) > 6.5) return null;
    if (e.mode === 'alert' && e.canSeePoint(hero.center)) return null;
    if (flat < 2.4 && dy < 3.6) return 'hoist';
    return hero.G.lastFin === 'pounce' ? 'ambush' : 'pounce';
  }
  if (e.mode === 'alert') return null;
  if (hero.grounded && dy > 1.2 && dy < 3.6 && flat < 2.3) return 'ledgepull';
  if (dy > 1.2 && flat < 5 && dy < 12) return 'pounce';
  if (Math.abs(dy) < 0.6 && flat < 1.9) { const ef = V(Math.sin(e.yaw), 0, Math.cos(e.yaw)); if (ef.dot(V(dx, 0, dz).normalize()) > 0.25) return 'silent'; }
  return null;
}

// --- the scripts. f(t) returns {hero pose, enemy placement, cam}; ev = timed events ---
// Enemy placement: [forward, up, side] in the hero frame, ry = yaw relative to the hero, px/rz = pitch/roll, pose.
const SCRIPTS = {
  impale: { // drive both claws into the chest, lift overhead, twist, tear him in half
    dur: 1.75, f: t => {
      const lift = ease(seg(t, 0.2, 0.7)), rip = ease(seg(t, 0.95, 1.05)), tw = Math.sin(seg(t, 0.55, 0.9) * Math.PI * 3) * 0.35;
      return {
        hero: { armL: A(0.12 + rip * 0.9, 0.05 + lift * 1.4, 1 - lift * 0.4, 0.15, 45), armR: A(-0.12 - rip * 0.9, 0.05 + lift * 1.4, 1 - lift * 0.4, 0.15, 45), crouch: 0.25 - lift * 0.15, torsoX: -0.2 * lift, twist: tw * 0.6 },
        en: [lerp(0.95, 0.75, lift), lift * 1.25, 0], ry: Math.PI + tw, px: -0.25 * lift, rz: tw * 0.5, air: lift > 0.1,
        pose: { ...limp, armL: A(0.5, -0.4, 0.9, 0.6, 12), armR: A(-0.5, -0.4, 0.9, 0.6, 12), scramble: lift * (1 - rip), headX: -0.4 },
        cam: t < 0.9 ? { yaw: 1.25, pitch: 0.12, dist: 3.4 - lift * 0.6, fov: 60 } : { yaw: 2.5, pitch: 0.32, dist: 4.4, fov: 74 },
      };
    },
    ev: [
      [0.11, (s) => s.stab(['L', 'R'], 'torso', 1.2)],
      [0.6, (s) => s.wet('torso', 0.6)],
      [0.98, (s) => { s.slow(0.18, 0.9); s.stop(0.16); s.kick(1); s.cut('torso', V(0, 7, 0), true); s.bleedOut('pelvis', 4); }],
      [1.75, (s) => s.kill([])],
    ],
  },
  butcher: { // left arm, right arm, then the head
    dur: 1.6, f: t => {
      const s1 = ease(seg(t, 0.12, 0.24)), s2 = ease(seg(t, 0.46, 0.58)), s3 = ease(seg(t, 0.85, 0.98));
      const L = s3 > 0 ? A(lerp(0.9, -0.6, s3), lerp(0.7, 0.2, s3), lerp(-0.2, 1, s3), 0.15, 60) : A(lerp(-0.7, 0.9, s1), lerp(1, -0.3, s1) + s2 * 0.9, lerp(0.5, 0.8, s1) - s2, 0.3, 60);
      const R = A(lerp(0.7, -0.6, s2) * (s2 > 0 ? 1 : 0) + (s2 > 0 ? 0 : -0.4), s2 > 0 ? lerp(0.9, -0.3, s2) : 0.6, s2 > 0 ? 0.9 : -0.2, s2 > 0 ? 0.2 : 1.4, 60);
      return {
        hero: { armL: L, armR: R, twist: (s1 - s2) * 0.6 + s3 * 0.7, crouch: 0.15, torsoX: 0.15 },
        en: [1.05, 0, 0], ry: Math.PI, pose: { armL: s1 > 0.5 ? undefined : A(0.6, 0.6, 0.6, 1, 10), armR: s2 > 0.5 ? undefined : A(-0.6, 0.6, 0.6, 1, 10), headX: 0.2, crouch: 0.1 * s2, torsoX: -0.2 * s1 },
        cam: t < 0.8 ? { yaw: -1.1, pitch: 0.1, dist: 3.3, fov: 62 } : { yaw: 1.9, pitch: 0.18, dist: 2.8, fov: 56 },
      };
    },
    ev: [
      [0.2, (s) => { s.stop(0.08); s.cut('uarmL', V(-3, 5, 1)); s.kick(0.5); }],
      [0.54, (s) => { s.stop(0.08); s.cut('uarmR', V(3, 5, 1)); s.kick(0.5); }],
      [0.93, (s) => { s.slow(0.15, 0.8); s.stop(0.15); s.cut('head', V(1.5, 8, -1), true); s.kick(1); }],
      [1.6, (s) => s.kill([])],
    ],
  },
  decapitate: { // grab from behind, claws across the throat
    dur: 1.9, f: t => {
      const grab = ease(seg(t, 0, 0.15)), cut = ease(seg(t, 0.5, 0.6)), sink = ease(seg(t, 1.0, 1.6));
      return {
        hero: { armL: A(-0.35, 0.35, 1, lerp(0.3, 1.7, grab) * (1 - cut * 0.6), 40), armR: cut > 0 ? A(lerp(-0.9, 0.9, cut), lerp(0.6, 0.45, cut), lerp(-0.3, 0.9, cut), 0.15, 70) : A(-0.9, 0.6, -0.3, 1.2, 25), twist: lerp(-0.4, 0.5, cut), torsoX: 0.1 },
        en: [lerp(0.9, 0.55, grab), 0, 0], ry: 0, px: -0.15 * grab * (1 - cut) + sink * 0.3,
        pose: cut > 0.5 ? { ...limp, crouch: sink * 0.9, legs: sink > 0.3 ? { tl: -1.4 * sink, tr: -1.4 * sink, kl: 2.2 * sink, kr: 2.2 * sink } : undefined } : { armL: A(0.2, 1, 0.5, 1.6, 14), armR: A(-0.2, 1, 0.5, 1.6, 14), headX: -0.5, scramble: 0.4 },
        cam: t < 0.45 ? { yaw: 2.6, pitch: 0.08, dist: 2.6, fov: 58 } : { yaw: 2.2, pitch: 0.28, dist: 3.8, fov: 70 },
      };
    },
    ev: [
      [0.12, (s) => { sfx.grunt(); s.kick(0.3); }],
      [0.56, (s) => { s.slow(0.14, 1.0); s.stop(0.18); s.cut('head', V(0.5, 9, 1.5), true); s.geyser(); s.kick(1); }],
      [1.9, (s) => s.kill([], 0.3)],
    ],
  },
  execution: { // he is on his knees: claws down through the collarbones, lift, tear both arms off
    dur: 1.8, f: t => {
      const up = ease(seg(t, 0, 0.25)), drive = ease(seg(t, 0.28, 0.36)), lift = ease(seg(t, 0.5, 0.85)), rip = ease(seg(t, 1.0, 1.1));
      const y = drive > 0 ? lerp(1, -0.55, drive) + lift * 0.5 : lerp(-0.2, 1, up);
      return {
        hero: { armL: A(0.2 + rip * 1.1, y + rip * 0.6, 0.25 + drive * 0.6 - rip * 0.4, 0.2, 55), armR: A(-0.2 - rip * 1.1, y + rip * 0.6, 0.25 + drive * 0.6 - rip * 0.4, 0.2, 55), crouch: drive * 0.3 * (1 - lift), torsoX: drive * 0.4 - lift * 0.3 },
        en: [0.85, lift * 0.55, 0], ry: Math.PI, rz: drive > 0 && rip === 0 ? Math.sin(t * 60) * 0.04 : 0, air: lift > 0.2,
        pose: { ...limp, crouch: 0.9 * (1 - lift), legs: { tl: -1.5 * (1 - lift), tr: -1.5 * (1 - lift), kl: 2.3 * (1 - lift * 0.6), kr: 2.3 * (1 - lift * 0.6) }, headX: drive > 0 ? 0.6 : -0.7 },
        cam: t < 0.4 ? { yaw: 2.4, pitch: -0.2, dist: 3.2, fov: 64 } : { yaw: -1.3, pitch: 0.1, dist: 3.0, fov: 60 },
      };
    },
    ev: [
      [0.33, (s) => { s.stop(0.15); s.slow(0.3, 0.4); s.stab(['L', 'R'], 'torso', 1.4, V(0, 1, 0)); s.kick(0.8); }],
      [0.7, (s) => s.wet('torso', 0.8)],
      [1.04, (s) => { s.slow(0.16, 0.9); s.stop(0.14); s.cut('uarmL', V(5, 4, 0)); s.cut('uarmR', V(-5, 4, 0)); s.kick(1); }],
      [1.8, (s) => s.kill(['head'], 0.2)],
    ],
  },
  skewer: { // impale in the air, ride him down and slam him into the floor
    dur: 1.6, f: (t, F) => {
      const st = ease(seg(t, 0, 0.12)), rise = ease(seg(t, 0.12, 0.34)), fall = Math.pow(seg(t, 0.34, 0.52), 2), rip = ease(seg(t, 1.05, 1.15));
      const hy = lerp(F.y0, F.y0 + 1.3, rise) * (1 - fall) + F.g * fall;
      const flat = ease(seg(t, 0.12, 0.45));
      const down = fall > 0 ? 1 : 0;
      return {
        heroY: hy, grounded: fall >= 1,
        hero: fall >= 1 ? { armL: A(0.15 + rip * 0.5, -0.9 + rip * 1.8, 0.45, 0.2, 50), armR: A(-0.15 - rip * 0.5, -0.9 + rip * 1.8, 0.45, 0.2, 50), crouch: 0.75 * (1 - rip * 0.5), torsoX: 0.6 - rip * 0.5 }
          : { armL: A(0.15, 0.1 - flat * 0.6 - down * 0.4, 1, 0.15, 45), armR: A(-0.15, 0.1 - flat * 0.6 - down * 0.4, 1, 0.15, 45), torsoX: 0.2 + down * 0.4, legs: { tl: -1.2, tr: -0.3, kl: 1.6, kr: 0.8 } },
        en: [lerp(0.85, 1.15, flat) /* held where this body's arms + claws reach */, (fall >= 1 ? 0.12 - 0.12 : lerp(0, 0.9, flat)) + (hy - F.y0) - (fall >= 1 ? 0.0 : 0), 0], abs: true, ry: Math.PI * (1 - flat), px: -Math.PI / 2 * flat, air: true,
        pose: { ...limp, scramble: 1 - fall, armL: A(0.6, 0.6, 0.4, 0.8, 10), armR: A(-0.6, 0.6, 0.4, 0.8, 10) },
        cam: fall < 1 ? { yaw: 1.5, pitch: -0.15, dist: 4.2, fov: 76 } : { yaw: 0.9, pitch: 0.55, dist: 4.6, fov: 66 },
      };
    },
    ev: [
      [0.1, (s) => s.stab(['L', 'R'], 'torso', 1)],
      [0.52, (s) => { s.slam(); }],
      [1.1, (s) => { s.stop(0.1); s.geyser('torso'); s.kick(0.6); }],
      [1.6, (s) => s.kill([], 0.1)],
    ],
  },
  wallpin: { // drive him into the wall on the claws, cut his arms off, punch through the head
    dur: 2.0, f: t => {
      const drive = ease(seg(t, 0, 0.2)), lift = ease(seg(t, 0.2, 0.5)), s1 = ease(seg(t, 0.42, 0.5)), s2 = ease(seg(t, 0.62, 0.7)), pun = ease(seg(t, 0.95, 1.02)), out = ease(seg(t, 1.3, 1.4)), slide = seg(t, 1.4, 2.0);
      const R = pun > 0 ? A(-0.15, lerp(0.3, 0.75, pun), 1, lerp(1.2, 0.05, pun), 70) : s2 > 0 ? A(lerp(-0.9, 0.7, s2), lerp(0.8, -0.2, s2), 0.8, 0.2, 70) : s1 > 0 ? A(lerp(0.7, -0.9, s1), lerp(0.6, 0.8, s1), 0.8, 0.2, 70) : A(-0.6, 0.5, 0.2, 1.3, 30);
      return {
        hero: { armL: A(0.15, 0.2 + lift * 0.35 - out * 0.6, 1 - out * 0.5, 0.12, 45), armR: R, torsoX: 0.25 * drive, twist: (s1 - s2) * 0.5, crouch: 0.1 },
        en: [0, lift * 0.55 * (1 - slide) - slide * 0.2, 0], wall: true, ry: Math.PI, px: 0.1 * lift, air: lift > 0.2,
        pose: { ...limp, scramble: lift * (1 - out), armL: s2 > 0.5 ? undefined : A(0.9, 0.3, -0.4, 0.5, 10), armR: s1 > 0.5 ? undefined : A(-0.9, 0.3, -0.4, 0.5, 10), headX: pun > 0 ? -0.5 : 0.3, crouch: slide * 0.8 },
        cam: t < 0.9 ? { yaw: 1.45, pitch: 0.12, dist: 3.6, fov: 64 } : { yaw: -1.2, pitch: 0.2, dist: 3.0, fov: 58 },
      };
    },
    ev: [
      [0.19, (s) => { s.stop(0.15); s.stab(['L'], 'torso', 1.2); s.wallHit(); s.kick(0.9); }],
      [0.47, (s) => { s.stop(0.06); s.cut('uarmR', null, false, true); }],
      [0.67, (s) => { s.stop(0.06); s.cut('uarmL', null, false, true); }],
      [1.0, (s) => { s.slow(0.15, 0.9); s.stop(0.16); s.cut('head', null, true, true); s.wallHit(1.4); s.kick(1); }],
      [1.35, (s) => { s.geyser('torso'); s.stop(0.06); }],
      [2.0, (s) => s.kill([], 0.1)],
    ],
  },
  // ====== stealth takedowns (silent: no noise, quiet camera) ======
  silent: { silent: true, behind: true, dur: 1.5, f: t => { // hand over the mouth, claws through the back and out the chest, lowered down
    const grab = ease(seg(t, 0, 0.15)), push = ease(seg(t, 0.2, 0.3)), low = ease(seg(t, 0.75, 1.4));
    return { hero: { armL: A(-0.3, 0.45, 1, lerp(0.4, 1.8, grab), 40), armR: A(-0.1, 0.05, lerp(0.4, 1, push), lerp(1.4, 0.1, push), 60), crouch: low * 0.5, torsoX: 0.1 + low * 0.3 },
      en: [lerp(0.9, 0.6, grab), 0, 0], ry: 0, px: low * 0.5, pose: { ...limp, crouch: low * 0.6, headX: -0.5, armL: A(0.3, 0.8, 0.5, 1.5, 10), armR: A(-0.3, 0.8, 0.5, 1.5, 10), scramble: (1 - low) * 0.5 * (push > 0 ? 1 : 0) },
      cam: { yaw: 1.3, pitch: 0.05, dist: 2.6, fov: 58 } };
  }, ev: [[0.27, (s) => { s.stab(['R'], 'torso', 0.8); s.slow(0.4, 0.4); }], [1.5, (s) => s.kill([], 0)]] },
  pounce: { silent: true, behind: true, dur: 1.55, f: (t, F) => { // drop from above, pin him face down, claws into the neck
    const fall = Math.pow(seg(t, 0, 0.42), 1.6), pin = ease(seg(t, 0.38, 0.5)), stab = ease(seg(t, 0.75, 0.82));
    const land = F.ePos0.clone().addScaledVector(F.eFwd, -0.2);
    const hp = F.base.clone().lerp(land, fall); hp.y = lerp(F.y0, F.ePos0.y, fall) + Math.sin(fall * Math.PI) * 0.6;
    return { heroPos: hp, grounded: fall >= 1, heroYaw: F.eYaw0,
      hero: fall < 1 ? { armL: A(0.3, 1, 0.5, 0.3, 30), armR: A(-0.3, 1, 0.5, 0.3, 30), legs: { tl: -1.3, tr: -1.3, kl: 1.8, kr: 1.8 }, torsoX: -0.2 }
        : { armL: A(0.2, -0.9, 0.5, 0.3, 40), armR: A(-0.15, lerp(0.6, -1, stab), 0.5, 0.2, 60), crouch: 0.85, torsoX: 0.7 },
      enAbs: F.ePos0, ry: 0, eyaw: F.eYaw0, px: Math.PI / 2 * pin * 0.97, pose: { ...limp, armL: A(0.9, 0.2, 0.2, 0.3, 12), armR: A(-0.9, 0.2, 0.2, 0.3, 12) },
      cam: fall < 1 ? { yaw: 1.6, pitch: 0.35, dist: 4.4, fov: 72 } : { yaw: 2.2, pitch: 0.4, dist: 3.4, fov: 60 } };
  }, ev: [[0.45, (s) => { s.stop(0.1); s.kick(0.5); s.G.fx.blood(s.e.center.clone(), V(0, 1, 0), 30, 4, 0.8); }], [0.8, (s) => { s.slow(0.3, 0.5); s.cut('head', V(0, 2, 1)); }], [1.55, (s) => s.kill([], 0)]] },
  airdrop: { dur: 1.35, f: (t, F) => { // mid-air: stab down into him and ride him into the floor
    const fall = Math.pow(seg(t, 0, 0.3), 1.4), ride = ease(seg(t, 0.3, 0.5)), rip = ease(seg(t, 0.95, 1.05));
    const land = F.ePos0.clone().addScaledVector(F.fwd, -0.25);
    const hp = F.base.clone().lerp(land, fall); hp.y = lerp(F.y0, F.ePos0.y + 0.9, fall) - ride * 0.9;
    return { heroPos: hp, grounded: ride >= 1,
      hero: ride < 1 ? { armL: A(0.15, lerp(1, -0.3, fall), 0.6, 0.2, 50), armR: A(-0.15, lerp(1, -0.3, fall), 0.6, 0.2, 50), legs: { tl: -1.4, tr: -1.2, kl: 1.9, kr: 1.7 }, torsoX: 0.3 }
        : { armL: A(0.2, -0.9 + rip * 1.6, 0.45, 0.2, 50), armR: A(-0.2, -0.9 + rip * 1.6, 0.45, 0.2, 50), crouch: 0.8, torsoX: 0.6 - rip * 0.4 },
      enAbs: F.ePos0, ry: Math.PI, px: -Math.PI / 2 * ride * 0.95, pose: { ...limp, scramble: 1 - ride },
      cam: ride < 1 ? { yaw: 1.4, pitch: 0.3, dist: 4.4, fov: 74 } : { yaw: 0.8, pitch: 0.5, dist: 3.8, fov: 64 } };
  }, ev: [[0.29, (s) => { s.stop(0.1); s.stab(['L', 'R'], 'torso', 1.3); }], [0.5, (s) => { s.slam(); }], [1.0, (s) => { s.geyser('torso'); s.kick(0.6); }], [1.35, (s) => s.kill([], 0)]] },
  ledgepull: { silent: true, dur: 1.6, f: (t, F) => { // reach down off the ledge, yank him up and over, throw him behind
    const grab = ease(seg(t, 0, 0.2)), up = ease(seg(t, 0.3, 0.7)), over = ease(seg(t, 0.7, 1.05));
    const below = F.ePos0.clone(), top = F.base.clone().addScaledVector(F.fwd, 0.4).add(V(0, 0.3, 0)), behind = F.base.clone().addScaledVector(F.fwd, -1.8).add(V(0, 0.4, 0));
    const p = below.clone().lerp(top, up).lerp(behind, over); p.y += Math.sin(over * Math.PI) * 1.2;
    return { hero: { armL: A(0.2, lerp(-1, 0.6, up) + over * 0.6, lerp(0.8, 0.3, over), 0.3, 40), armR: A(-0.2, lerp(-1, 0.6, up) + over * 0.6, lerp(0.8, 0.3, over), 0.3, 40), crouch: lerp(0.8, 0.2, up), torsoX: lerp(0.9, -0.3, over), twist: over * 0.6 },
      enAbs: p, ry: Math.PI, px: -over * 2.5, air: true, pose: { ...limp, armL: A(0.5, 1, 0.3, 0.5, 12), armR: A(-0.5, 1, 0.3, 0.5, 12), scramble: up * (1 - over) },
      cam: t < 0.6 ? { yaw: 1.4, pitch: -0.3, dist: 3.4, fov: 62 } : { yaw: 2.6, pitch: 0.1, dist: 3.8, fov: 70 } };
  }, ev: [[0.2, (s) => s.stab(['L', 'R'], 'torso', 0.7, V(0, -1, 0))], [0.95, (s) => { s.slow(0.25, 0.6); s.cut('head', V(0, 6, -3), true); }], [1.6, (s) => s.kill([], 0.6)]] },
  ambush: { silent: true, behind: true, dur: 1.7, f: (t, F) => { // leap off the wall onto his back, claws on both sides of the head, twist, rip
    const leap = ease(seg(t, 0, 0.4)), tw = ease(seg(t, 0.6, 0.9));
    const land = F.ePos0.clone().addScaledVector(F.eFwd, -0.55);
    const hp = F.base.clone().lerp(land, leap); hp.y = lerp(F.y0, F.ePos0.y, leap) + Math.sin(leap * Math.PI) * 0.9;
    return { heroPos: hp, grounded: leap >= 1, heroYaw: F.eYaw0,
      hero: leap < 1 ? { armL: A(0.5, 0.8, 0.8, 0.4, 30), armR: A(-0.5, 0.8, 0.8, 0.4, 30), legs: { tl: -1.4, tr: -0.6, kl: 1.9, kr: 1.2 } } : { armL: A(-0.05 + tw * 0.4, 0.75, 1, 1.4, 50), armR: A(0.05 - tw * 0.4, 0.75, 1, 1.4, 50), twist: tw * 0.9, torsoX: 0.1 },
      enAbs: F.ePos0, ry: 0, eyaw: F.eYaw0, pose: { ...limp, headX: -0.6 * (1 - tw), armL: A(0.3, 0.9, 0.5, 1.5, 12), armR: A(-0.3, 0.9, 0.5, 1.5, 12), crouch: leap >= 1 ? 0.25 : 0 },
      cam: leap < 1 ? { yaw: 1.5, pitch: 0.3, dist: 4.6, fov: 74 } : { yaw: 2.7, pitch: 0.12, dist: 2.7, fov: 58 } };
  }, ev: [[0.42, (s) => { s.stop(0.08); s.stab(['L', 'R'], 'head', 0.6); }], [0.9, (s) => { s.slow(0.2, 0.7); s.cut('head', V(0, 7, -1), true); }], [1.7, (s) => s.kill([], 0.1)]] },

  hoist: { silent: true, pinned: true, dur: 1.6, f: (t, F) => { // from the wall: reach down, haul him up, pin him to the wall
    const grab = ease(seg(t, 0, 0.2)), up = ease(seg(t, 0.25, 0.75)), pin = ease(seg(t, 0.8, 0.9));
    const side = F.base.clone().addScaledVector(F.fwd, 0.15).addScaledVector(F.right, 0.7); side.y = F.y0 - 0.2;
    const p = F.ePos0.clone().lerp(side, up);
    return { heroPos: F.base, grounded: false, heroYaw: 0,
      hero: { armR: A(-0.3, lerp(-1, 0.1, up), 0.5, 0.3, 40), armL: A(0.3, 1, 0.55, 0.3, 30), legs: { tl: -0.7, tr: -0.4, kl: 1, kr: 0.8 }, torsoX: lerp(0.5, 0.1, up) },
      enAbs: p, eyaw: F.yaw + Math.PI, air: true, pose: { ...limp, scramble: up * (1 - pin), armL: A(0.4, 1, 0.3, 0.5, 12), armR: A(-0.4, 1, 0.3, 0.5, 12) },
      cam: { yaw: t < 0.8 ? 0.7 : -0.6, pitch: 0.3, dist: 3.8, fov: 66 } };
  }, ev: [[0.2, (s) => s.stab(['R'], 'torso', 0.8)], [0.86, (s) => { s.slow(0.25, 0.6); s.stop(0.12); s.stab(['R'], 'torso', 1.3); s.wet('torso', 1); }], [1.6, (s) => s.pinKill()]] },
  // ====== combat finishers ======
  bladepin: { pinned: true, dur: 1.5, f: t => { // claws through him and into the wall: he stays hanging there
    const drive = ease(seg(t, 0, 0.18)), lift = ease(seg(t, 0.2, 0.45)), back = ease(seg(t, 1.0, 1.3));
    return { hero: { armL: A(0.18, 0.25 + lift * 0.4, 1, 0.1 + back * 1.4, 50), armR: A(-0.18, 0.25 + lift * 0.4, 1, 0.1 + back * 1.4, 50), torsoX: 0.3 * drive - back * 0.2, crouch: 0.15 },
      en: [0, lift * 0.65, 0], wall: true, ry: Math.PI, px: 0.08, air: true, pose: { ...limp, scramble: lift * (1 - back) * 0.8, headX: 0.7 * back },
      cam: t < 0.9 ? { yaw: -1.4, pitch: 0.1, dist: 3.4, fov: 62 } : { yaw: 2.9, pitch: 0.15, dist: 4.2, fov: 66 } };
  }, ev: [[0.17, (s) => { s.stop(0.16); s.stab(['L', 'R'], 'torso', 1.5); s.wallHit(1.2); s.kick(1); }], [0.6, (s) => { s.slow(0.2, 0.7); s.wet('torso', 1.2); }], [1.5, (s) => s.pinKill()]] },
  harvest: { dur: 1.55, f: t => { // limbs off one after another, then the head
    const ph = Math.floor(seg(t, 0.1, 1.0) * 5), sub = (seg(t, 0.1, 1.0) * 5) % 1, sw = Math.sin(sub * Math.PI), sgn = ph % 2 ? -1 : 1;
    const low = ph === 2 || ph === 3;
    return { hero: { armL: sgn > 0 ? A(lerp(0.9, -0.5, sub), low ? -0.6 : 0.4, 0.8, 0.2, 80) : A(0.5, -0.3, 0.6, 1.3, 20), armR: sgn < 0 ? A(lerp(-0.9, 0.5, sub), low ? -0.6 : 0.4, 0.8, 0.2, 80) : A(-0.5, -0.3, 0.6, 1.3, 20), crouch: low ? 0.7 : 0.1, twist: sgn * (0.6 - sub * 1.2), torsoX: low ? 0.5 : 0.15 },
      en: [1.05, 0, 0], ry: Math.PI, pose: { ...limp, crouch: ph >= 3 ? 0.9 : 0, legs: ph >= 3 ? { tl: -1.5, tr: -1.5, kl: 2.3, kr: 2.3 } : undefined, headX: 0.3 + sw * 0.2 },
      cam: { yaw: [1.1, -1.1, 1.6, -1.6, 2.4][Math.min(4, ph)], pitch: ph >= 4 ? 0.25 : 0.08, dist: 3.2, fov: 60 } };
  }, ev: [[0.2, (s) => { s.stop(0.05); s.cut('uarmL', V(-4, 4, 1)); }], [0.38, (s) => { s.stop(0.05); s.cut('uarmR', V(4, 4, 1)); }], [0.56, (s) => { s.stop(0.05); s.cut('thighL', V(-3, 3, 2)); }], [0.74, (s) => { s.stop(0.05); s.cut('thighR', V(3, 3, 2)); }],
    [0.93, (s) => { s.slow(0.15, 0.8); s.stop(0.14); s.cut('head', V(0, 8, 1), true); s.kick(1); }], [1.55, (s) => s.kill([], 0.1)]] },
  barrage: { dur: 1.55, f: t => { // stomach barrage: alternating stabs, faster and faster, then the rip-out
    const T = [0.1, 0.24, 0.36, 0.46, 0.54, 0.61, 0.67, 0.72, 0.76, 0.8, 0.84, 0.88];
    let n = T.findIndex(x => x > t); if (n < 0) n = T.length; const prev = T[n - 1] ?? 0, next = T[n] ?? prev + 0.1;
    const k = Math.min(1, (t - prev) / Math.max(0.03, (next - prev))), thrust = Math.sin(Math.min(1, k * 1.6) * Math.PI);
    const L = n % 2 === 0, rip = ease(seg(t, 1.0, 1.1));
    const stabArm = (on, sg) => rip > 0 ? A(sg * 0.3, lerp(-0.2, 1.2, rip), 0.6, 0.2, 70) : A(sg * 0.1, -0.25, 1, on ? lerp(1.4, 0.05, thrust) : 1.5, 90);
    return { hero: { armL: stabArm(L, 1), armR: stabArm(!L, -1), crouch: 0.3, torsoX: 0.3 + thrust * 0.1, twist: (L ? 1 : -1) * 0.25 * thrust },
      en: [0.95, 0, 0], ry: Math.PI, rz: Math.sin(t * 50) * 0.03 * (1 - rip), pose: { ...limp, torsoX: 0.4 + thrust * 0.15, crouch: 0.15, headX: 0.5 },
      cam: t < 1.0 ? { yaw: 1.5 + t * 0.6, pitch: 0.0, dist: 2.6 - t * 0.5, fov: 56 } : { yaw: 2.6, pitch: 0.2, dist: 3.6, fov: 70 } };
  }, ev: [...[0.1, 0.24, 0.36, 0.46, 0.54, 0.61, 0.67, 0.72, 0.76, 0.8, 0.84, 0.88].map((x, i) => [x + 0.02, (s) => { s.gutStab(i % 2 ? 'R' : 'L', i); }]),
    [1.03, (s) => { s.slow(0.15, 0.8); s.stop(0.16); s.cut('torso', V(0, 6, -1), true); s.kick(1); s.bleedOut('pelvis', 4); }], [1.55, (s) => s.kill([], 0)]] },
  chinlift: { dur: 1.6, f: t => { // claws up under the chin, lift him off his feet, rip up through the head
    const stab = ease(seg(t, 0.05, 0.16)), lift = ease(seg(t, 0.2, 0.6)), rip = ease(seg(t, 0.95, 1.05));
    return { hero: { armR: A(-0.08, lerp(-0.3, 0.6, stab) + lift * 0.9 + rip * 0.4, lerp(0.6, 1, stab) - lift * 0.3, lerp(1.2, 0.1, stab), 60), armL: A(0.5, -0.4, 0.5, 1.4, 20), torsoX: -0.2 * lift, twist: -0.3 },
      en: [lerp(1.0, 0.85, stab), lift * 0.9 * (1 - rip * 0.3), 0], ry: Math.PI, px: -0.3 * lift, air: lift > 0.1, pose: { ...limp, headX: -0.9, scramble: lift * (1 - rip), armL: A(0.3, 0.6, 0.8, 1, 10), armR: A(-0.3, 0.6, 0.8, 1, 10) },
      cam: t < 0.9 ? { yaw: 1.7, pitch: -0.25, dist: 3.0, fov: 60 } : { yaw: 2.8, pitch: -0.15, dist: 3.4, fov: 68 } };
  }, ev: [[0.15, (s) => { s.stop(0.12); s.stab(['R'], 'head', 1.2, V(0, 1, 0)); s.kick(0.6); }], [1.0, (s) => { s.slow(0.15, 0.8); s.cut('head', V(0, 10, 0), true); s.geyser(); s.kick(1); }], [1.6, (s) => s.kill([], 0.2)]] },
  backthrow: { dur: 1.45, f: t => { // stab in the back, lift, hurl him away
    const stab = ease(seg(t, 0.05, 0.15)), lift = ease(seg(t, 0.2, 0.55)), thr = ease(seg(t, 0.8, 0.95));
    return { hero: { armL: A(0.15, 0.1 + lift * 1.1 - thr * 0.8, 1, 0.2, 50), armR: A(-0.15, 0.1 + lift * 1.1 - thr * 0.8, 1, 0.2, 50), torsoX: -0.3 * lift + thr * 0.7, crouch: 0.2 },
      en: [0.85 + thr * 0.6, lift * 1.1, 0], ry: 0, px: 0.3 * lift, air: true, pose: { ...limp, scramble: lift * (1 - thr) },
      cam: t < 0.7 ? { yaw: 1.2, pitch: 0.1, dist: 3.3, fov: 62 } : { yaw: 0.4, pitch: 0.2, dist: 4.6, fov: 74 } };
  }, ev: [[0.13, (s) => { s.stop(0.12); s.stab(['L', 'R'], 'torso', 1.2); }], [0.88, (s) => { s.slow(0.25, 0.6); s.kick(0.8); s.wet('torso', 1); }], [0.95, (s) => s.kill([], 2.2)]] },
  xcross: { dur: 1.4, f: t => { // both claws cross through the neck in an X
    const cock = ease(seg(t, 0, 0.3)), cut = ease(seg(t, 0.5, 0.6));
    return { hero: { armL: A(lerp(0.9, -0.7, cut), lerp(0.8, 0.45, cut) + cock * 0.2, lerp(0.2, 1, cut), 0.15, 80), armR: A(lerp(-0.9, 0.7, cut), lerp(0.8, 0.45, cut) + cock * 0.2, lerp(0.2, 1, cut), 0.15, 80), torsoX: -0.2 * cock + 0.4 * cut },
      en: [1.0, 0, 0], ry: Math.PI, pose: { ...limp, headX: -0.3 },
      cam: t < 0.45 ? { yaw: 0.2, pitch: 0.05, dist: 2.6, fov: 54 } : { yaw: 2.9, pitch: 0.12, dist: 3.0, fov: 64 } };
  }, ev: [[0.56, (s) => { s.slow(0.12, 1.0); s.stop(0.18); s.cut('head', V(0, 9, -2), true); s.geyser(); s.kick(1.2); }], [1.4, (s) => s.kill([], 0)]] },
  kneespin: { dur: 1.6, f: t => { // spin low through both knees, then rise through the neck
    const spin = ease(seg(t, 0.05, 0.45)), rise = ease(seg(t, 0.85, 0.97));
    return { heroYaw: spin * Math.PI * 2, hero: rise > 0 ? { armR: A(lerp(-0.6, 0.4, rise), lerp(-0.4, 1.1, rise), 0.8, 0.15, 80), armL: A(0.5, -0.3, 0.5, 1.3, 20), crouch: 0.3 * (1 - rise), torsoX: -0.2 * rise }
      : { armL: A(0.95, -0.55, 0.3, 0.1, 50), armR: A(-0.95, -0.55, 0.3, 0.1, 50), crouch: 0.9, torsoX: 0.4 },
      en: [1.0, spin >= 1 ? -0.42 : 0, 0], ry: Math.PI, pose: { ...limp, crouch: spin >= 1 ? 0.4 : 0, headX: -0.3 },
      cam: t < 0.6 ? { yaw: 1.8, pitch: -0.3, dist: 3.4, fov: 70 } : { yaw: -1.2, pitch: 0.05, dist: 2.8, fov: 58 } };
  }, ev: [[0.22, (s) => { s.stop(0.06); s.cut('shinL', V(-3, 2, 1)); }], [0.36, (s) => { s.stop(0.06); s.cut('shinR', V(3, 2, 1)); s.kick(0.5); }], [0.93, (s) => { s.slow(0.15, 0.8); s.stop(0.15); s.cut('head', V(0, 8, 0), true); s.kick(1); }], [1.6, (s) => s.kill([], 0)]] },
  counter: { dur: 1.5, f: (t, F) => { // after a parry: through the guard arm, around behind him, through the back
    const cut = ease(seg(t, 0.05, 0.15)), round = ease(seg(t, 0.25, 0.6)), stab = ease(seg(t, 0.7, 0.8));
    const ang = round * Math.PI, hp = F.ePos0.clone().add(V(-Math.sin(F.yaw + ang) * 0.95, 0, -Math.cos(F.yaw + ang) * 0.95));
    return { heroPos: F.base.clone().lerp(hp, round), heroYaw: ang,
      hero: stab > 0 ? { armL: A(0.15, 0.05, 1, lerp(1.4, 0.05, stab), 70), armR: A(-0.15, 0.05, 1, lerp(1.4, 0.05, stab), 70), torsoX: 0.3 } : { armR: A(lerp(-0.8, 0.6, cut), 0.4, 0.8, 0.2, 70), armL: A(0.5, -0.2, 0.6, 1.2, 20), twist: 0.4 - cut },
      enAbs: F.ePos0, ry: Math.PI, pose: { ...limp, crouch: 0.2, headX: 0.4 }, cam: { yaw: 1.2 + round * 1.6, pitch: 0.1, dist: 3.3, fov: 62 } };
  }, ev: [[0.12, (s) => { s.stop(0.08); s.cut('larmR', V(3, 4, 1)); }], [0.77, (s) => { s.slow(0.18, 0.7); s.stop(0.15); s.stab(['L', 'R'], 'torso', 1.5); s.kick(1); }], [1.5, (s) => s.kill([], 0.6)]] },
  sprint: { dur: 1.4, f: (t, F) => { // slide through his legs cutting both thighs, then spike him as he falls
    const slide = ease(seg(t, 0, 0.35)), spike = ease(seg(t, 0.7, 0.8));
    const hp = F.base.clone().lerp(F.ePos0.clone().addScaledVector(F.fwd, 1.2), slide);
    return { heroPos: hp, heroYaw: slide > 0.5 ? Math.PI : 0,
      hero: spike > 0 ? { armL: A(0.15, lerp(0.9, -0.6, spike), 0.6, 0.2, 70), armR: A(-0.15, lerp(0.9, -0.6, spike), 0.6, 0.2, 70), crouch: 0.4, torsoX: 0.5 } : { armL: A(0.95, -0.4, 0.2, 0.1, 50), armR: A(-0.95, -0.4, 0.2, 0.1, 50), crouch: 1, torsoX: -0.4, legs: { tl: -1.4, tr: -0.2, kl: 0.3, kr: 1.6 } },
      enAbs: F.ePos0, ry: Math.PI, px: -0.5 * ease(seg(t, 0.3, 0.7)), pose: { ...limp, headX: -0.4 }, cam: { yaw: t < 0.4 ? 1.6 : 0.3, pitch: -0.15, dist: 3.8, fov: 76 } };
  }, ev: [[0.15, (s) => { s.stop(0.06); s.cut('thighL', V(-2, 2, -2)); }], [0.22, (s) => { s.stop(0.06); s.cut('thighR', V(2, 2, -2)); s.kick(0.7); }], [0.77, (s) => { s.slow(0.2, 0.6); s.stab(['L', 'R'], 'torso', 1.4); s.kick(1); }], [1.4, (s) => s.kill(['head'], 0)]] },
  ranged: { dur: 1.5, f: t => { // catch the throwing arm, tear it off, claws through his head
    const grab = ease(seg(t, 0, 0.15)), tear = ease(seg(t, 0.3, 0.42)), stab = ease(seg(t, 0.85, 0.95));
    return { hero: { armL: A(-0.5, lerp(0.3, 0.6, grab) - tear * 0.9, lerp(0.8, 0.3, tear), 0.3, 50), armR: stab > 0 ? A(-0.05, 0.6, 1, lerp(1.4, 0.05, stab), 80) : A(-0.6, 0.4, 0.2, 1.5, 30), twist: tear * 0.6 - stab * 0.4 },
      en: [1.0, 0, 0], ry: Math.PI, pose: { ...limp, armR: tear > 0.5 ? undefined : A(-0.6, 0.9, 0.3, 0.4, 14), headX: -0.2 }, cam: t < 0.6 ? { yaw: -1.3, pitch: 0.12, dist: 3.0, fov: 60 } : { yaw: 2.5, pitch: 0.05, dist: 2.8, fov: 58 } };
  }, ev: [[0.36, (s) => { s.stop(0.1); s.cut('uarmR', V(-4, 5, -2)); s.kick(0.6); }], [0.92, (s) => { s.slow(0.15, 0.7); s.stop(0.16); s.stab(['R'], 'head', 1.6); s.kick(1); s.geyser('torso'); }], [1.5, (s) => s.kill([], 0.3)]] },
  scissor: { dur: 1.45, f: t => { // both claws from both sides through the waist: cut in half
    const wide = ease(seg(t, 0, 0.3)), cut = ease(seg(t, 0.48, 0.58));
    return { hero: { armL: A(lerp(0.4, 1, wide) - cut * 1.6, -0.25, lerp(0.6, 0.2, wide) + cut * 0.7, 0.15, 80), armR: A(lerp(-0.4, -1, wide) + cut * 1.6, -0.25, lerp(0.6, 0.2, wide) + cut * 0.7, 0.15, 80), crouch: 0.35, torsoX: 0.2 },
      en: [1.0, 0, 0], ry: Math.PI, pose: { ...limp, headX: 0.2 }, cam: t < 0.45 ? { yaw: 0.1, pitch: 0.3, dist: 3.2, fov: 60 } : { yaw: 1.7, pitch: 0.05, dist: 3.4, fov: 66 } };
  }, ev: [[0.54, (s) => { s.slow(0.14, 0.9); s.stop(0.18); s.cut('torso', V(0, 4, -2), true); s.bleedOut('pelvis', 4); s.kick(1.2); }], [1.45, (s) => s.kill([], 0)]] },

  stab: { // combo impale: drive in, lift and twist, rip out with a burst (not a finisher, not lethal by itself)
    dur: 0.72, combo: true, f: t => {
      const lift = ease(seg(t, 0.12, 0.38)), rip = ease(seg(t, 0.5, 0.58)), tw = Math.sin(seg(t, 0.25, 0.5) * Math.PI * 2) * 0.45;
      return {
        hero: { armR: A(-0.12, 0.05 + lift * 0.6 * (1 - rip), 1 - rip * 0.8, 0.12 + rip * 1.2, 50, tw * 2), armL: A(0.5, -0.4, 0.6, 1.3, 20), twist: -0.35 + tw * 0.5 + rip * 0.6, torsoX: 0.2 },
        en: [0.92 + rip * 0.3, lift * 0.45 * (1 - rip), 0], ry: Math.PI + tw * 0.6, rz: tw * 0.4, air: lift > 0.1 && rip < 1,
        pose: { ...limp, armL: A(0.4, 0.2, 0.8, 1, 12), armR: A(-0.4, 0.2, 0.8, 1, 12), scramble: lift * (1 - rip), headX: 0.6 },
      };
    },
    ev: [
      [0.1, (s) => s.stab(['R'], 'torso', 0.8)],
      [0.54, (s) => { s.release(); }],
    ],
  },
};
export const FINISHERS = Object.keys(SCRIPTS).filter(k => !SCRIPTS[k].combo);
export const SCRIPT_NAMES = FINISHERS;
// campaign scripts (vent takedowns etc.): run through the same Script machinery and helpers, but never picked as a
// combat finisher (FINISHERS is fixed above)
export function registerScript(name, def) { SCRIPTS[name] = def; }

// a pinned body sliding down a wall: friction with stutter, a vertical blood smear, then slumped sitting at the base.
// Authored (no physics), so it can't jitter or sink into the wall; it stays as a corpse.
export function updateSlump(G, s, dt) {
  const e = s.e; s.t += dt;
  if (e.pos.y > s.g + 0.001) {
    const stick = Math.sin(s.t * 23) > 0.55 ? 0.15 : 1;                    // grabs and lets go: stutter
    s.v = Math.min(3.2, s.v + 7 * dt) * (stick < 1 ? 0.7 : 1);
    const dy = Math.min(e.pos.y - s.g, s.v * stick * dt); e.pos.y -= dy; s.smear += dy;
    if (s.smear > 0.09) { // smear the wall behind his back
      s.smear = 0; const p = e.pos.clone().add(V(0, 1.15, 0)).addScaledVector(s.n, -0.24);
      G.fx.smear?.(p, s.n, 0.22 + Math.random() * 0.08);
    }
  } else s.sit = Math.min(1, s.sit + dt * 2.5);
  const k = s.sit, slide = 1 - k;
  e.rig.root.rotation.set(0, e.yaw, 0, 'YXZ'); e.time += dt;
  animate(e.rig, { speed: 0, grounded: true, vy: 0, t: e.time, dt, squash: 0, legK: 8, torsoK: 8,
    armL: A(0.35, -1, 0.15 - k * 0.1, 0.25, 6), armR: A(-0.35, -1, 0.15 - k * 0.1, 0.25, 6),
    crouch: k * 0.95, torsoX: -0.1 * slide + k * 0.25, headX: 0.35 + k * 0.45, headY: s.lol * k,
    legs: k > 0 ? { tl: -1.45 * k, tr: -1.2 * k, kl: 0.35 * k, kr: 0.9 * k } : { tl: -0.1, tr: 0.05, kl: 0.15, kr: 0.1 } });
  if (k > 0) e.rig.j.pelvis.position.y = lerp(e.rig.j.pelvis.position.y, 0.2, k); // sat down on the floor, back to the wall
  e.rig.skin?.update(dt);
  return s.t < 30;
}

export class Script {
  constructor(G, hero, e, name) {
    const S = SCRIPTS[name];
    this.G = G; this.hero = hero; this.e = e; this.name = name; this.S = S; this.t = 0; this.i = 0; this.done = false;
    this.combo = !!S.combo;
    // frame: face the enemy (wall pin: face the wall behind him)
    const to = V(e.pos.x - hero.pos.x, 0, e.pos.z - hero.pos.z); if (to.lengthSq() < 1e-4) to.copy(hero.forward()); to.normalize();
    this.yaw = Math.atan2(to.x, to.z);
    if (name === 'wallpin' || name === 'bladepin') {
      const w = nearestWall(e.pos, 0.38, 1.85, 2.6);
      if (w) {
        const n = w.normal, b = w.box; this.yaw = Math.atan2(-n.x, -n.z);
        const face = e.pos.clone(); if (n.x) face.x = n.x > 0 ? b.max.x : b.min.x; else face.z = n.z > 0 ? b.max.z : b.min.z;
        this.pin = face.addScaledVector(n, 0.2); this.pin.y = e.pos.y; this.wallN = n.clone(); this.wallBox = b;
        this.heroTo = this.pin.clone().addScaledVector(n, 0.95);
      }
    }
    if (name === 'hoist' && hero.wallSave) this.wallKeep = hero.wallSave;
    this.base = hero.pos.clone(); this.y0 = hero.pos.y; this.g = groundBelow(hero.pos.x, hero.pos.z, hero.pos.y + 0.2);
    this.ePos0 = e.pos.clone(); this.eYaw0 = e.yaw; this.eFwd = V(Math.sin(e.yaw), 0, Math.cos(e.yaw));
    if (S.behind) { this.yaw = e.yaw; }
    if (name === 'hoist') this.yaw = hero.yaw; // stays facing the wall // takedowns keep his heading; we come from behind/above
    this.fwd = V(Math.sin(this.yaw), 0, Math.cos(this.yaw)); this.right = V(-this.fwd.z, 0, this.fwd.x);
    hero.yaw = this.yaw; hero.vel.set(0, 0, 0); hero.atk = null; hero.queued = null;
    e.held = true; const k = G.enemies.indexOf(e); if (k >= 0) G.enemies.splice(k, 1);
    hero.silent = !!S.silent;
    if (!this.combo) {
      hero.iframes = S.dur + 0.6; G.cine = { shot: null, t: 0 };
      if (S.silent) { G.slowmo(0.6, 0.3); } else { G.slowmo(0.35, 0.25); G.fovKick(-8); G.blurKick(0.6); sfx.whoosh(); G.noise?.(hero.pos, 12, true); }
      if (!S.silent) for (const o of G.enemies) if (o.state !== 'down' && o.mode === 'alert') { o.state = 'recover'; o.t = Math.max(o.t, S.dur * 0.8); } // they flinch back and watch
    }
  }
  // world position for a frame offset
  at(f, u, s) { return this.base.clone().addScaledVector(this.fwd, f).addScaledVector(this.right, s).add(V(0, u, 0)); }

  // watchdog wrapper: any exception, or running past its length + 1 s (game time, or 3x that in real time while
  // slowed), ends the script cleanly so the hero, camera and slow motion can never stay locked
  update(dt) {
    this.real0 = this.real0 || performance.now();
    try {
      const r = this.step(dt);
      if (!this.done && (this.t > this.S.dur + 1 || performance.now() - this.real0 > (this.S.dur + 1) * 3000)) this.abort('overran');
      return r;
    } catch (err) { console.warn('[finisher] ' + this.name + ' aborted: ' + err.message); this.abort('error'); return {}; }
  }
  abort(why) {
    const G = this.G, e = this.e; this.aborted = why;
    try { if (!this.killed && e && e.alive && !this.combo) this.kill([], 0); } catch (_) { try { G.scene.remove(e.rig.root); e.alive = false; } catch (__) {} }
    try { this.end(); } catch (_) {}
    this.done = true; this.hero.finReadyAt = this.hero.time + 2; this.hero.fin = null; this.hero.lastAbort = this.name + ':' + why; G.cine = null; G.slowT = 0; G.stopT = 0; this.hero.silent = false;
  }
  step(dt) {
    const G = this.G, h = this.hero, e = this.e, S = this.S;
    this.t += dt;
    const k = S.f(this.t, this);
    // hero placement
    if (this.heroTo) { const d = ease(Math.min(1, this.t / 0.2)); h.pos.lerpVectors(this.base, this.heroTo, d); }
    if (k.heroY !== undefined) h.pos.y = k.heroY;
    if (k.heroPos) h.pos.copy(k.heroPos);
    h.grounded = k.grounded !== undefined ? k.grounded : !this.base || this.y0 <= this.g + 0.05;
    h.yaw = (k.heroYaw !== undefined && this.S.behind ? 0 : this.yaw) + (k.heroYaw || 0);
    // enemy placement
    if (!this.released) {
      let p;
      if (k.enAbs) p = k.enAbs.clone();
      else if (k.en && this.pin) { const d = ease(Math.min(1, this.t / 0.2)); p = this.ePos0.clone().lerp(this.pin, d); p.y += k.en[1]; }
      else if (k.abs) p = this.at(k.en[0], 0, k.en[2]).setY(h.pos.y + k.en[1] - (h.pos.y - this.y0) * 0 + (this.y0 - this.y0));
      else p = this.at(k.en[0], k.en[1], k.en[2]);
      if (k.abs) p.y = h.pos.y + (k.en[1] - (h.pos.y - this.y0)) + (h.pos.y - this.y0) * 0; // skewer: rides with the hero
      if (this.t < 0.12 && !this.pin && !k.enAbs) p.lerpVectors(this.ePos0, p, ease(this.t / 0.12)); // pulled onto the claws
      e.pos.copy(p);
      e.yaw = k.eyaw !== undefined ? k.eyaw : this.yaw + (k.ry || 0);
      e.rig.root.rotation.set(k.px || 0, e.yaw, k.rz || 0, 'YXZ');
      e.time += dt;
      animate(e.rig, { speed: 0, grounded: !k.air, vy: -1, t: e.time, dt, squash: 0, legK: 14, torsoK: 22, ...k.pose });
    }
    if (G.cine && k.cam) G.cine.shot = k.cam;
    // events
    while (this.i < S.ev.length && this.t >= S.ev[this.i][0]) { S.ev[this.i][1](this); this.i++; }
    if (this.t >= S.dur && !this.done) this.end();
    return k.hero;
  }
  end() {
    if (this.done) return; this.done = true;
    const G = this.G, e = this.e;
    if (!this.killed && e.alive) { // combo stab let go: back into the fight
      e.held = false; e.rig.root.rotation.set(0, e.yaw, 0); G.enemies.push(e);
    }
    this.hero.silent = false;
    if (this.name === 'hoist' && this.wallKeep) { const h = this.hero; h.climbing = true; h.wall = this.wallKeep.wall; h.grip.L = this.wallKeep.L; h.grip.R = this.wallKeep.R; h.yaw = this.yaw; }
    if (!this.combo) { G.cine = null; this.hero.iframes = Math.max(this.hero.iframes, 0.5); this.hero.finReadyAt = this.hero.time + 2; }
    this.hero.fin = null;
  }

  // --- event helpers ---
  segPoint(name) { const m = this.e.rig.m[name]; return m ? m.getWorldPosition(V(0, 0, 0)) : this.e.center.clone(); }
  stab(hands, segName, power = 1, dir) { // claws punch into a body cube: gashes, burst, wet claws
    const G = this.G, h = this.hero, m = this.e.rig.m[segName];
    this.stuck = {}; if (m) for (const hd of hands) this.stuck[hd] = segName; // the claws stay IN him until the next cut/stab/kill (src/hero.js holdStuck)
    this.e.rig.root.updateMatrixWorld(true); h.rig.root.updateMatrixWorld(true);
    for (const hd of hands) {
      const tip = h.clawTip(hd, 0.75), dd = dir || this.fwd;
      if (m) G.fx.gash(m, tip, dir ? this.right : V(0, 1, 0));
      G.fx.slashBlood(tip, dd.clone().negate().add(V(0, 0.5, 0)).normalize(), 0.7 * power);
      for (let i = 0; i < 3; i++) h.bloodyClaws(hd);
    }
    if (m) G.fx.bleed(m, V(0, 0, 0.14), V(0, -0.3, 1), 2.5, 18, true);
    this.e.hp -= this.combo ? 12 : 0;
    sfx.hit(true); G.shake(0.35 * power); G.hitstop(this.combo ? 0.07 : 0.1); G.punch(0.6 * power);
    G.combo++; G.comboT = 2.2; G.maxCombo = Math.max(G.maxCombo, G.combo);
  }
  wet(segName, power) { const m = this.e.rig.m[segName]; if (m) this.G.fx.blood(m.getWorldPosition(V(0, 0, 0)), V(0, -0.2, 0).addScaledVector(this.fwd, -1), 30 * power, 3, 0.7); sfx.hit(false); }
  cut(segName, vel, big = false, alongWall = false) {
    const G = this.G, e = this.e; this.stuck = null;
    let v = vel ? vel.clone() : V(0, 3, 0);
    if (vel) v = this.fwd.clone().multiplyScalar(vel.z).addScaledVector(this.right, vel.x).add(V(0, vel.y, 0));
    if (alongWall && this.wallN) v = this.right.clone().multiplyScalar((Math.random() < 0.5 ? -1 : 1) * 5).add(V(0, 4, 0)).addScaledVector(this.wallN, 2);
    const p = this.segPoint(segName);
    e.sever(segName, v);
    G.fx.slashBlood(p, v.clone().normalize(), big ? 2.4 : 1.4);
    if (big) G.fx.blood(p, V(0, 1, 0), 120, 9, 1.0, 1.3);
    G.combo++; G.comboT = 2.2; G.maxCombo = Math.max(G.maxCombo, G.combo);
    sfx.hit(true); sfx.clang(); G.shake(big ? 0.8 : 0.45);
  }
  gutStab(hand, i) { // one hit of the barrage: wet burst every time, harder as it speeds up
    const G = this.G, m = this.e.rig.m.torso; if (!m) return;
    const p = m.localToWorld(V((Math.random() - 0.5) * 0.2, -0.18 + Math.random() * 0.1, 0.13));
    G.fx.gash(m, p, V(Math.random() - 0.5, 1, 0)); G.fx.slashBlood(p, this.fwd.clone().negate().add(V((Math.random() - 0.5), 0.3, 0)).normalize(), 0.5 + i * 0.06);
    this.hero.bloodyClaws(hand); sfx.hit(i > 6); G.shake(0.12 + i * 0.03); G.hitstop(0.025); G.punch(0.3 + i * 0.05);
  }
  pinKill() { // stays hanging on the wall: the rig is left posed, no ragdoll
    const G = this.G, e = this.e; this.stuck = null; this.killed = true; e.alive = false; e.held = true; e.mark && (e.mark.visible = false);
    G.kills++; G.slowmo(0.3, 0.4); G.fx.bleed(e.rig.m.torso, V(0, -0.2, 0.14), V(0, -1, 0.3), 6, 16, false, 0.3);
    G.pinned = G.pinned || []; G.pinned.push(e.rig); if (G.pinned.length > 6) { const o = G.pinned.shift(); G.scene.remove(o.root); o.skin?.dispose(); }
    G.banner?.('PINNED');
    // the claws come out: he slides down the wall on his back, smearing it, and ends slumped at the base
    const n = this.wallN || (this.wallKeep && this.wallKeep.wall.normal) || this.fwd.clone().negate();
    G.slumps = G.slumps || []; G.slumps.push({ e, n: n.clone(), t: 0, y: e.pos.y, g: groundBelow(e.pos.x, e.pos.z, e.pos.y + 0.2), v: 0, smear: 0, sit: 0, lol: (Math.random() - 0.5) * 1.2 });
  }
  geyser(segName = 'torso') { const m = this.e.rig.m[segName]; if (m) this.G.fx.bleed(m, V(0, 0.27, 0), V(0, 1, 0.15), 4, 90); }
  bleedOut(segName, dur) { const m = this.e.rig.m[segName]; if (m) this.G.fx.bleed(m, V(0, 0.1, 0), V(0, 1, 0), dur, 70); }
  slow(scale, dur) { this.G.slowmo(scale, dur); }
  stop(s) { this.G.hitstop(s); }
  kick(a) { const G = this.G; G.shake(0.5 + a * 0.5); G.blurKick(a); G.punch(a); G.fovKick(-6 * a); }
  slam() { // through the floor: crater, ring, chunks, radial blood, limbs off
    this.stuck = null; const G = this.G, h = this.hero, p = V(h.pos.x, this.g + 0.01, h.pos.z).addScaledVector(this.fwd, 0.9);
    G.fx.crater(p, 5); G.fx.crater(p, 2.4); G.fx.shockwave(p, 10); G.fx.debris(p, V(0, 1, 0), 60, 9);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; G.fx.gouge(p.clone().add(V(Math.cos(a) * 0.9, 0, Math.sin(a) * 0.9)), V(0, 1, 0), 0.8, V(Math.cos(a), 0, Math.sin(a)), 0.8); }
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; G.fx.blood(p.clone().setY(p.y + 0.3), V(Math.cos(a), 0.35, Math.sin(a)), 22, 9, 0.25); }
    this.cut('uarmL', V(-5, 6, 1)); this.cut('uarmR', V(5, 6, 1)); this.cut('thighL', V(-3, 5, 3));
    G.slowmo(0.2, 0.8); G.hitstop(0.2); G.shake(1); G.blurKick(1.4); G.punch(1.2); G.fovKick(14); sfx.land(1.5); sfx.hit(true);
  }
  wallHit(power = 1) { // crack and splatter the wall behind him
    if (!this.wallN) return;
    const G = this.G, n = this.wallN, p = this.e.center.clone(); const b = this.wallBox;
    if (n.x) p.x = n.x > 0 ? b.max.x : b.min.x; else p.z = n.z > 0 ? b.max.z : b.min.z;
    G.fx.crater(p, 2.2 * power, n); G.fx.debris(p, n, Math.round(24 * power), 6);
    G.fx.blood(p.clone().addScaledVector(n, 0.4), n.clone().negate().add(V(0, 0.2, 0)), Math.round(90 * power), 8, 0.7, 1.3);
    for (let i = 0; i < 3; i++) G.fx.gouge(p.clone().add(V(0, -0.2 + i * 0.25, 0)).addScaledVector(this.right, (i - 1) * 0.3), n, 0.5, V(0, -1, 0), 0.6);
  }
  release() { // combo stab: rip out and throw him off
    const G = this.G, e = this.e; this.stuck = null; this.released = true;
    e.rig.root.rotation.set(0, e.yaw, 0);
    G.fx.slashBlood(e.center.clone(), this.fwd.clone().add(V(0, 0.4, 0)).normalize(), 1.6);
    e.held = false; G.enemies.push(e); this.e = e;
    const killed = e.hit(this.fwd.clone(), 14, 'impale', e.center.clone());
    G.onHit(e, killed, 'impale'); this.killed = true; // ownership handed back either way
  }
  kill(severs, push = 0) {
    const G = this.G, e = this.e; this.stuck = null; this.killed = true;
    e.rig.root.updateMatrixWorld(true);
    e.vel.set(0, 0, 0);
    const rd = e.die(this.fwd.clone(), 'finisher', e.center.clone(), severs);
    if (push) rd.push(this.fwd.x * 60 * push, 30 * push, this.fwd.z * 60 * push);
    G.kills++; G.slowmo(0.3, 0.4);
    if (!this.S.silent) G.banner?.(({ impale: 'SPLIT', butcher: 'BUTCHERED', decapitate: 'HEADLESS', execution: 'EXECUTED', skewer: 'FLOORED', wallpin: 'NAILED', harvest: 'HARVESTED', barrage: 'GUTTED', chinlift: 'LIFTED', backthrow: 'THROWN AWAY', xcross: 'X-CUT', kneespin: 'CUT DOWN', counter: 'COUNTERED', sprint: 'RUN THROUGH', ranged: 'DISARMED', scissor: 'HALVED' })[this.name] || 'KILLED');
  }
}
