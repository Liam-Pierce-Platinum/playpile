// VINCENT ROURKE, the final boss: an engine Enemy (thug_sword, two katanas) with a boss layer wrapped round it from
// this file (enemy.js is not touched). What the layer adds:
// - his own move table with LEFT-hand mirrors (the offhand katana swings too) and per-phase combos, windup speed and
//   damage; every swing still glints and winds up, so every one can be blocked or parried (150 ms window)
// - a telegraphed DASH: he drops low, the blade glints twice, a whistle, then a straight lunge along a locked line
//   (side-step it and he stumbles: an opening)
// - a parry-heavy defence: from the front, while he is on guard, most of your strikes are DEFLECTED (sparks, you are
//   pushed back, he counters). Openings: right after his combo, after a dash miss, after you parry him (on his knees),
//   from behind, or a slam from above. A chain of hits is capped (he breaks out after 4-5)
// - 3 phases: I measured, II faster + the helicopter's rotor wash pushes you toward the open edge while he goes for
//   kicks near it, III desperate: long fast strings, dash chains, fewer deflects, bleeding
// - he cannot be one-shot (no head kills, no limb loss, no takedown or finisher kills). A full finisher bar on him
//   is a CLAW BURST (impale, heavy damage). At the end he kneels: double-click LMB = RECKONING, the final finisher.
import * as THREE from 'three';
import { registerScript, Script } from '../finisher.js';
import { dropToken } from '../enemy.js';
import { sfx } from '../audio.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const A = (x, y, z, bend, k = 40) => ({ dir: V(x, y, z), bend, k });
const ease = t => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const seg = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));
const lerp = (a, b, k) => a + (b - a) * k;
const rnd = (a, b) => a + Math.random() * (b - a);

// sword moves (numbers from enemy.js MOVES) + left-hand mirrors with the offhand blade
const MV = {
  sweep: { base: 'sweep', w: 0.48, a: 0.18, r: 0.42, reach: 2.9, arc: -0.1, dmg: 17, arm: 'R', wp: V(-1, 0.4, -0.3), sp: V(0.9, 0.1, 0.6), bend0: 0.3, bend1: 0.1 },
  back: { base: 'back', w: 0.32, a: 0.16, r: 0.4, reach: 2.8, arc: -0.1, dmg: 15, arm: 'R', wp: V(0.8, 0.5, 0.2), sp: V(-0.9, 0.2, 0.6), bend0: 0.6, bend1: 0.1 },
  chop: { base: 'chop', w: 0.6, a: 0.16, r: 0.55, reach: 2.5, arc: 0.6, dmg: 20, arm: 'R', wp: V(-0.2, 1.2, -0.5), sp: V(-0.05, -0.7, 1), bend0: 1.2, bend1: 0.1, guardBreak: true },
  thrust: { base: 'thrust', w: 0.55, a: 0.14, r: 0.5, reach: 3.4, arc: 0.75, dmg: 22, arm: 'R', wp: V(-0.3, 0.3, -0.6), sp: V(0, 0.15, 1), bend0: 1.6, bend1: 0.02, lunge: 9 },
  kick: { base: 'kick', w: 0.5, a: 0.16, r: 0.5, reach: 2.3, arc: 0.5, dmg: 15, kick: true, guardBreak: true },
};
MV.sweepL = { ...MV.sweep, base: 'sweep', arm: 'L', wp: V(1, 0.4, -0.3), sp: V(-0.9, 0.1, 0.6) };
MV.backL = { ...MV.back, base: 'back', arm: 'L', wp: V(-0.8, 0.5, 0.2), sp: V(0.9, 0.2, 0.6) };
const KITS = [
  [['sweep', 'backL'], ['thrust'], ['sweepL', 'back', 'chop'], ['back', 'sweepL']],
  [['sweep', 'backL', 'sweep', 'thrust'], ['chop', 'kick'], ['sweepL', 'sweep', 'backL'], ['kick', 'thrust'], ['backL', 'back', 'chop']],
  [['sweep', 'sweepL', 'back', 'backL', 'thrust'], ['chop', 'sweepL', 'kick', 'thrust'], ['backL', 'sweep', 'backL', 'sweep'], ['kick', 'chop', 'chop']],
];
// per phase I / II / III
const WIND = [1, 0.85, 0.72], DMG = [0.9, 1, 1.12], DEFLECT = [0.7, 0.6, 0.35], RECOVER = [1.05, 0.85, 0.6], CIRCLE = [0.9, 0.55, 0.3];
const DASH_CD = [7, 5, 3.2], DASH_WIND = [0.62, 0.5, 0.4], SPEED = [5, 5.6, 6.3], STREAK = [4, 4, 5], DOWN = [2.0, 1.7, 1.4], FEINT = [0.15, 0.25, 0.3];
export const PAD = 11.3;        // he never leaves the pad (|x|, |z| <= PAD)
export const OPEN_EDGE = 12;    // east and west edges of the pad have no lip

let CUR = null; // the live boss controller (the final finisher flings his blades through it)

// RECKONING: a hand on his throat lifts him off his knees, his blades fall, claws through the gut, both arms that
// held the blades come off, then he is thrown away with everything left
registerScript('reckoning', {
  dur: 3.3, f: t => {
    const grab = ease(seg(t, 0, 0.3)), lift = ease(seg(t, 0.35, 0.9)), stab = ease(seg(t, 1.0, 1.1)), tw = Math.sin(seg(t, 1.2, 1.75) * Math.PI * 2) * 0.25;
    const x1 = ease(seg(t, 1.95, 2.08)), x2 = ease(seg(t, 2.28, 2.4)), thr = ease(seg(t, 2.72, 2.92));
    const armR = x2 > 0 ? A(lerp(0.9, -0.9, x2), lerp(0.8, 0.1, x2), 0.8, 0.15, 70)
      : x1 > 0 ? A(lerp(-0.9, 0.9, x1), lerp(0.2, 0.8, x1), 0.9, 0.15, 70)
        : stab > 0 ? A(-0.1 + tw * 0.3, 0.15, 1, lerp(1.4, 0.05, stab), 70) : A(-0.7, 0.25, -0.5, 1.5, 25);
    const armL = thr > 0 ? A(0.2, 0.6 - thr * 0.4, 1, 0.1, 60) : A(0.12, lerp(0.05, 0.95, lift), 1, lerp(1.1, 0.35, grab), 40);
    return {
      hero: { armL, armR, crouch: 0.2 * (1 - lift) + 0.1 * thr, torsoX: 0.15 - lift * 0.25 + thr * 0.4, twist: tw + (x1 - x2) * 0.4 },
      en: [lerp(0.95, 0.72, grab) + thr * 1.8, lift * 0.75 - thr * 0.3, 0], ry: Math.PI + tw * 0.5, px: thr * -0.6, air: lift > 0.1,
      pose: {
        crouch: 0.9 * (1 - lift), headX: lift > 0.2 ? -0.6 : 0.4, scramble: lift * (1 - stab) * 0.8,
        legs: { tl: lerp(-1.5, -0.15, lift), tr: lerp(-1.5, 0.1, lift), kl: lerp(2.3, 0.35, lift), kr: lerp(2.3, 0.2, lift) },
        armL: A(0.3, 0.8, 0.6, 1.3, 14), armR: A(-0.3, 0.8, 0.6, 1.3, 14),
      },
      cam: t < 1.0 ? { yaw: 1.35, pitch: 0.02, dist: 3.1, fov: 52 } : t < 2.6 ? { yaw: -1.15, pitch: 0.14, dist: 2.9, fov: 58 } : { yaw: 2.7, pitch: 0.3, dist: 5.6, fov: 72 },
    };
  },
  ev: [
    [0.22, s => { sfx.grunt(); s.kick(0.35); }],
    [0.55, s => { CUR?.dropBlades(s.fwd); sfx.clang(); }],
    [1.05, s => { s.stop(0.16); s.slow(0.22, 0.8); s.stab(['R'], 'torso', 1.5); s.kick(0.9); }],
    [1.45, s => { s.wet('torso', 0.9); s.geyser(); }],
    [2.02, s => { s.stop(0.1); s.cut('uarmR', V(4, 4, 1)); }],
    [2.34, s => { s.stop(0.12); s.cut('uarmL', V(-4, 4, 1)); s.bleedOut('torso', 3); }],
    [2.82, s => { s.slow(0.2, 1.3); s.kick(1); s.kill([], 1.5); s.G.banner?.('RECKONING', 2.2); }],
  ],
});

// e: the Enemy. hooks: { onPhase(ph), onBeaten(), gust(state: 'warn'|'on'|'off'), windDir: Vector3 (push direction) }
export function makeBoss(L, e, hooks = {}) {
  const G = L.G;
  const B = { e, ph: 0, beaten: false, finished: false, inv: 0, streak: 0, streakT: 0, dashCD: 3, time: 0, gustT: 7, gust: null, bleedT: 0, dir: V(0, 0, 1) };
  CUR = B;
  e.ring = 3.6; e.circleT = 0.8; e.speed = SPEED[0]; e.boss = true;
  e.rig.root.rotation.order = 'YXZ';
  const upd0 = e.update.bind(e), hit0 = e.hit.bind(e), par0 = e.parried.bind(e);
  const scaled = n => { const m = MV[n] || MV.sweep; return { ...m, w: m.w * WIND[B.ph], dmg: m.dmg * DMG[B.ph], r: m.r * [1.3, 1, 0.8][B.ph], _b: true }; };
  const toHero = () => V(G.hero.pos.x - e.pos.x, 0, G.hero.pos.z - e.pos.z);
  const facing = () => { const f = V(Math.sin(e.yaw), 0, Math.cos(e.yaw)), t = toHero().normalize(); return f.dot(t); };
  const nearEdge = () => OPEN_EDGE - Math.abs(G.hero.pos.x) < 3.6;

  e.startCombo = (fast = false) => {
    const kit = KITS[B.ph];
    let c = kit[Math.floor(Math.random() * kit.length)];
    if (B.ph >= 1 && nearEdge() && Math.random() < 0.6) c = B.ph === 2 ? ['sweep', 'kick'] : ['kick']; // the edge
    e._names = c; e.combo = c.map(n => MV[n].base); e.ci = 0; e._ci = 0; e.move = scaled(c[0]);
    e.feint = !fast && Math.random() < FEINT[B.ph]; e.feinted = false;
    e.state = 'windup'; e.t = e.move.w * (fast ? 0.6 : 1); e.glint(); sfx.grunt();
  };
  e.zoneHit = (zone, dmg) => { // no head kills, no lost limbs: damage by where it lands
    e.zoneSever = undefined;
    if (zone === 'head' || zone === 'neck') return dmg * 1.8 + 6;
    if (zone === 'gut') { G.fx.bleed?.(e.rig.m.torso, V(0, -0.15, 0.14), V(0, -0.6, 1), 2, 12, false, 0.4); return dmg * 1.25; }
    if (/arm/.test(zone)) { e.guardT = 0.6; return dmg; }
    return dmg;
  };
  e.parried = () => { par0(); e.t = DOWN[B.ph]; B.streak = 0; };
  e.hit = (dir, dmg, kind, hitPos, zone) => {
    if (!e.alive) return false;
    if (B.beaten || B.inv > 0) { if (hitPos) G.fx.blood(hitPos, dir.clone().setY(0.3), 10, 3); return false; }
    let k = e.state === 'down' ? 1.6 : 1;
    if (kind === 'dive') dmg += 25;                       // a slam from height
    if (kind === 'impale' && B.burst) { dmg += 40; B.burst = false; }
    if (kind === 'uppercut') kind = 'heavy';              // no juggling the boss
    const before = e.hp; e.hp += 1e5;
    hit0(dir, dmg * k, kind, hitPos, zone);
    const taken = before + 1e5 - e.hp; e.hp = Math.max(1, before - taken);
    e.vel.y = Math.min(e.vel.y, 2);
    B.streak++; B.streakT = 1.3;
    const r = e.hp / e.maxHp, np = r <= 0.33 ? 2 : r <= 0.66 ? 1 : 0;
    if (e.hp <= 1) beaten();
    else if (np > B.ph) phase(np);
    return false;
  };
  function phase(n) {
    B.ph = n; B.inv = 1.6; B.streak = 0; e.speed = SPEED[n];
    const away = toHero().normalize().multiplyScalar(-9); e.vel.set(away.x, 6, away.z); e.grounded = false;
    dropToken(G, e); e.state = 'recover'; e.t = 1.4; e.recT = 0;
    G.fx.sparksAt(e.center.clone(), V(0, 1, 0), 20, 1.1); sfx.clang(); sfx.whoosh?.();
    hooks.onPhase?.(n);
  }
  function beaten() {
    B.beaten = true; e.hp = 1; dropToken(G, e); e.state = 'down'; e.t = 99; e.vel.set(0, 0, 0);
    hooks.gust?.('off'); B.gust = null;
    hooks.onBeaten?.();
  }
  // a strike that he deflects: sparks between blade and claws, you are shoved back, he answers
  B.deflects = () => {
    if (!e.alive || B.beaten || e.held) return false;
    if (B.inv > 0) return true;
    if (B.streak >= STREAK[B.ph]) return true; // he breaks the chain
    if (facing() < 0.2) return false;          // from behind: it lands
    if (!['circle', 'chase', 'approach', 'dashwind'].includes(e.state)) return false;
    return Math.random() < DEFLECT[B.ph];
  };
  B.deflect = () => {
    const h = G.hero, d = V(h.pos.x - e.pos.x, 0, h.pos.z - e.pos.z).normalize();
    const p = e.center.clone().lerp(h.center, 0.5).add(V(0, 0.35, 0));
    G.fx.sparksAt(p, d, 28, 1.3); sfx.clang(); sfx.block(); G.hitstop(0.06); G.shake(0.22); G.banner?.('DEFLECTED', 0.5);
    h.vel.x += d.x * 6; h.vel.z += d.z * 6; h.atk = null; h.queued = null; h.comboStep = 0;
    B.streak = 0; e.yaw = Math.atan2(-d.x, -d.z);
    if (e.state !== 'down') { e.state = 'counter'; e.t = [0.3, 0.22, 0.16][B.ph]; G.meleeToken = e; e.token = 'melee'; }
  };
  B.dropBlades = fwd => {
    for (const m of [e.wmesh, e.offMesh]) if (m && m.parent) L.fling(m, V(fwd.x * 1.5 + rnd(-1, 1), 2.5, fwd.z * 1.5 + rnd(-1, 1)), 10);
  };

  e.update = dt => {
    const h = G.hero; B.time += dt; B.inv -= dt; B.dashCD -= dt; B.streakT -= dt; if (B.streakT <= 0) B.streak = 0;
    if (B.beaten) { e.state = 'down'; e.t = 99; upd0(dt); clamp(); e.rig.root.rotation.x = 0; G.finMeter = 1; return; }
    const prev = e.state, hp0 = h.hp;
    if (e.state === 'dash') { e.vel.x = B.dir.x * 18; e.vel.z = B.dir.z * 18; }
    upd0(dt);
    let lean = 0;
    const d = toHero(), dist = d.length();
    // moves from this file's table, scaled by phase (the engine swaps in its own between combo steps)
    if (e.move && !e.move._b && e._names) { e.move = scaled(e._names[Math.min(e.ci, e._names.length - 1)]); if (e.state === 'windup') e.t = e.move.w * 0.7; }
    if (prev !== 'recover' && e.state === 'recover') { e.t = RECOVER[B.ph] + rnd(0, 0.25); if (B.ph === 2 && Math.random() < 0.35) B.dashCD = Math.min(B.dashCD, 0.4); }
    if (prev !== 'circle' && e.state === 'circle') e.t = Math.min(e.t, CIRCLE[B.ph]);
    // the dash
    if (e.state === 'circle' && B.dashCD <= 0 && dist > 4 && dist < 11.5 && !h.dead && (!G.meleeToken || G.meleeToken === e || !G.meleeToken.alive)) {
      e.state = 'dashwind'; e.t = DASH_WIND[B.ph]; B.dashCD = DASH_CD[B.ph] + rnd(0, 2); G.meleeToken = e; e.token = 'melee';
      e.glint(); sfx.whistle(); B.glint2 = true;
    }
    if (e.state === 'dashwind') {
      lean = 0.35; e.vel.x *= 0.8; e.vel.z *= 0.8;
      if (B.glint2 && e.t < DASH_WIND[B.ph] * 0.45) { B.glint2 = false; e.glint(); }
      if (e.t <= 0) { B.dir.copy(d).normalize(); e.state = 'dash'; e.t = 0.34; B.dashHit = false; sfx.swoosh(1.5); }
    } else if (e.state === 'dash') {
      lean = 0.2; e.yaw = Math.atan2(B.dir.x, B.dir.z); e.rig.root.rotation.y = e.yaw;
      if (!B.dashHit && dist < 1.5 && Math.abs(h.pos.y - e.pos.y) < 1.4 && !h.dead) {
        B.dashHit = true; const r = h.damage(21 * DMG[B.ph], d.clone().normalize(), e, {});
        if (r === 'block') G.fx.sparksAt(e.center.clone().lerp(h.center, 0.5), B.dir.clone().negate(), 12, 1);
      }
      if (e.state === 'dash' && (e.t <= 0 || B.dashHit)) { e.state = 'recover'; e.t = B.dashHit ? RECOVER[B.ph] * 0.8 : RECOVER[B.ph] + 0.4; e.recT = 0; e.vel.multiplyScalar(0.3); if (!B.dashHit) sfx.grunt(); dropToken(G, e); }
    }
    // kicks near the edge shove harder
    if (h.hp < hp0 && e.move?.kick && (e.state === 'strike' || e.state === 'recover')) { const n = d.clone().normalize(); h.vel.x += n.x * 6; h.vel.z += n.z * 6; }
    // the rotor wash (phase II): warned, then it pushes you toward the far open edge
    if (B.ph === 1 && !h.dead) {
      if (!B.gust) { B.gustT -= dt; if (B.gustT <= 0) { B.gust = { s: 'warn', t: 1.1 }; hooks.gust?.('warn'); } }
      else {
        B.gust.t -= dt;
        if (B.gust.s === 'on' && !h.climbing && !h.fin && !h.dead) { const w = hooks.windDir || V(-1, 0, 0); h.pos.x += w.x * 3.1 * dt; h.pos.z += w.z * 3.1 * dt; }
        if (B.gust.t <= 0) { if (B.gust.s === 'warn') { B.gust = { s: 'on', t: 1.9 }; hooks.gust?.('on'); } else { B.gust = null; B.gustT = rnd(6, 9); hooks.gust?.('off'); } }
      }
    } else if (B.gust) { B.gust = null; hooks.gust?.('off'); }
    if (B.ph === 2) { B.bleedT -= dt; if (B.bleedT <= 0) { B.bleedT = 2.2; G.fx.bleed?.(e.rig.m.torso, V(0.05, -0.1, 0.14), V(0, -0.7, 1), 1.4, 9, false, 0.4); } }
    e.rig.root.rotation.x = lean;
    clamp();
  };
  function clamp() {
    e.pos.x = Math.max(-PAD, Math.min(PAD, e.pos.x)); e.pos.z = Math.max(-PAD, Math.min(PAD, e.pos.z));
    if (e.pos.y < (B.padY ?? 56) - 1.5) { e.pos.set(0, B.padY ?? 56, 0); e.vel.set(0, 0, 0); }
  }
  return B;
}

// The hero's side: deflects, no one-shot kills on the boss, a full bar = CLAW BURST, the end = RECKONING.
// Per-instance overrides (a retry builds a fresh hero; call this every frame, it patches once).
export function patchHero(L, B) {
  const G = L.G, h = G.hero; if (!h || h._bossPatch === B) return; h._bossPatch = B;
  const P = Object.getPrototypeOf(h), e = B.e;
  const near = r => e.alive && !e.held && Math.hypot(e.pos.x - h.pos.x, e.pos.z - h.pos.z) < r && Math.abs(e.pos.y - h.pos.y) < 2.2;
  const shield = fn => { const s = e.spawnT; e.spawnT = 1e-3; try { return fn(); } finally { e.spawnT = s; } }; // engine reads spawnT > 0 as "not takeable"
  h.tryFinisher = btn => {
    if (near(3.4) && h.clawsOut && !h.climbing) {
      if (B.beaten) {
        G.finMeter = 0; h.atk = null; h.queued = null; h.finReadyAt = h.time + 999; h.lock = e; B.finished = true;
        h.fin = new Script(G, h, e, 'reckoning'); return true;
      }
      if (G.finMeter < 1 || h.time < (h.finReadyAt || 0) || B.inv > 0) return false;
      G.finMeter = 0; h.finReadyAt = h.time + 2.5; h.atk = null; h.queued = null; h.comboStep = 0; h.lock = e; B.burst = true;
      h.fin = new Script(G, h, e, 'stab'); G.banner?.('CLAW BURST', 0.8); return true;
    }
    return P.tryFinisher.call(h, btn);
  };
  h.hitZone = a => { if (a.target === e && B.deflects()) { B.deflect(); return true; } return P.hitZone.call(h, a); };
  h.doHits = (radius, cone, dmg, kind) => {
    const one = h.atk && h.atk.target;
    if (kind !== 'dive' && one === e && near(radius + 0.3) && B.deflects()) { B.deflect(); return 1; }
    return P.doHits.call(h, radius, cone, dmg, kind);
  };
  h.attack = hand => shield(() => P.attack.call(h, hand));            // no auto-impale on him
  h.airTakedown = () => shield(() => P.airTakedown.call(h));          // no aerial one-shot (a slam still lands)
  h.takedownTarget = fromWall => shield(() => P.takedownTarget.call(h, fromWall));
}
