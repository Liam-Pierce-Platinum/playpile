// game.js - the battle simulation. No DOM: the renderer reads this state, and
// test/sim.mjs runs it headless for balance.
//
// The game emits two queues the outside world drains each frame:
//   game.fx   visual events  {t:'splat'|'boom'|'zap'|..., ...}
//   game.sfx  sound names

import { TOWERS, ABILITIES, BUILD, SELL_BACK, towerSpent } from './data/towers.js';
import { ENEMIES } from './data/enemies.js';
import { HEROES, heroStats, heroLevel } from './data/heroes.js';
import { upgradeMods } from './data/upgrades.js';
import { buildPath, pointAt, placeSlots, nearestOnPath, inRange } from './geo.js';
import { rng } from './paint.js';

// HARDER (2026-10-07, Liam: "balancing for inkvale so that it is more
// difficult"). The balance bot used to clear all twelve battles on Normal
// with every life intact; see test/sim.mjs for where these landed.
const DIFF = {
  casual: { hp: 0.8, gold: 1.1 },
  normal: { hp: 1, gold: 0.95 },
  veteran: { hp: 1.2, gold: 0.9 },
};
// How much tougher each battle's foes are than they were before. Set by
// hand, level by level, against the balance bot: a flat multiplier made the
// open battles still free and Moth Hollow and the Throne impossible.
const LEVEL_HP = { 1: 2, 2: 2, 3: 2.2, 4: 1.4, 5: 1.55, 6: 1.6, 7: 1.85, 8: 1.2, 9: 1.35, 10: 2, 11: 1.3, 12: 1.3 };
const WAVE_GAP = 22;        // seconds between one wave finishing spawning and the next auto-starting
const LIVES = 20;

let UID = 1;

// =====================================================================
// PIGMENTS - the thing Inkvale does that no other tower defence does.
// =====================================================================
// Three of the five tower lines paint what they hit. Archers stain foes
// OCHRE, mages ULTRAMARINE, artillery VERMILION. A stain lasts a few
// seconds; if a second, DIFFERENT colour lands on a foe while it is still
// wet, the two mix on the spot and something happens:
//
//   ultramarine + vermilion = VIOLET  - a hex: +35% damage from everything
//   ochre + ultramarine     = GREEN   - an overgrowth: rooted, and thorns
//   ochre + vermilion       = ORANGE  - a flashfire that spills onto its neighbours
//
// So where towers stand is a palette: two colours covering the same stretch
// of road is worth more than either alone. Barracks and beast dens carry no
// colour - they hold and brawl. The Wash spell paints ultramarine too.
export const PIGMENT_OF = { archer: 'ochre', mage: 'ultra', artillery: 'verm' };
export const PIGMENTS = {
  ochre: { name: 'Ochre', col: '#e0a830' },
  ultra: { name: 'Ultramarine', col: '#3a5ec8' },
  verm: { name: 'Vermilion', col: '#d8402c' },
};
export const MIXES = {
  'ochre+ultra': { k: 'bloom', name: 'Overgrowth', col: '#4f9a3a', desc: 'roots the foe and cuts it with thorns' },
  'ochre+verm': { k: 'flash', name: 'Flashfire', col: '#f08a2a', desc: 'bursts into fire that spills onto nearby foes' },
  'ultra+verm': { k: 'hex', name: 'Hex', col: '#8a4ab8', desc: 'the foe takes 35% more damage from everything for 4s' },
};
const STAIN_T = 4, MIX_COOL = 1.4;
const segDist = (px, py, x1, y1, x2, y2) => {
  const dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / L));
  return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
};

export class Game {
  constructor(level, opt = {}) {
    this.level = level;
    this.R = rng(opt.seed ?? level.seed * 7 + 1);
    this.diff = DIFF[opt.difficulty || 'normal'];
    this.mods = upgradeMods(opt.upgrades || {});
    this.paths = level.paths.map(p => Object.assign(buildPath(p.pts), { air: !!p.air }));
    this.slots = placeSlots(level, this.paths).map((s, i) => ({ ...s, i, tower: null }));
    // TWO WARDENS (co-op). Each player has a purse; `actor` says whose
    // command is being run, and `gold` reads and writes that purse, so every
    // existing build/upgrade/sell path works for either player unchanged.
    this.players = opt.coop ? 2 : 1;
    this.actor = 0;
    const g0 = Math.round(level.gold * this.diff.gold * (opt.coop ? 0.65 : 1));
    this.purse = opt.coop ? [g0, g0] : [g0];
    this.walls = [];
    this.lives = LIVES;
    this.time = 0;
    this.hpMul = this.diff.hp * (1 + (level.id - 1) * 0.035) * (LEVEL_HP[level.id] ?? 1.3);
    this.enemies = []; this.blockers = []; this.towers = []; this.proj = []; this.zones = [];
    this.fx = []; this.sfx = [];
    this.wave = 0;               // waves started
    this.spawning = [];          // active spawn groups
    this.nextIn = -1;            // countdown to next wave (-1 = waiting for the player to start)
    this.state = 'play';         // play | won | lost
    this.stats = { kills: 0, leaks: 0, goldEarned: 0, heroDmg: 0, mixes: 0 };
    this.seen = new Set();
    // spells
    this.spells = {
      wash: { cd: 0, max: this.mods.washCd },
      wall: { cd: 0, max: this.mods.wallCd },
    };
    // hero
    // heroes[0] is the first player's, heroes[1] the partner's in co-op.
    // `hero` stays as the first one so the single-player code reads as before.
    this.heroes = [];
    this.hero = null;
    if (opt.hero) this.spawnHero(opt.hero, opt.heroXp ?? 0, 0);
    if (opt.hero2) this.spawnHero(opt.hero2, opt.heroXp2 ?? 0, 1);
    // where each road enters the screen (for the call-wave flags)
    this.entries = this.paths.map((p, i) => {
      if (p.air) return null;
      let d = 0;
      while (d < p.length) { const q = pointAt(p, d); if (q.x > 24 && q.x < 1256 && q.y > 24 && q.y < 696) return { path: i, x: q.x, y: q.y, ang: q.ang }; d += 6; }
      return null;
    }).filter(Boolean);
    // Nudge flags that would sit under the HUD
    for (const e of this.entries) { if (e.y < 90) e.y = 90; if (e.x > 1080 && e.y < 80) e.y = 84; }
  }

  get gold() { return this.purse[this.actor] ?? 0; }
  set gold(v) { this.purse[this.actor] = v; }
  get heroXp() { return this.heroes[0]?.xp ?? 0; }
  get heroXpStart() { return this.heroes[0]?.xpStart ?? 0; }
  /** run fn as player i (co-op commands), and put the actor back */
  as(i, fn) { const a = this.actor; this.actor = i; try { return fn(); } finally { this.actor = a; } }
  mine(t) { return this.players === 1 || t.owner === this.actor; }

  // ------------------------------------------------------------------ helpers
  rand(a, b) { return a + this.R() * (b - a); }
  roll([a, b]) { return a + this.R() * (b - a); }
  emit(f) { this.fx.push(f); }
  play(s) { this.sfx.push(s); }

  totalWaves() { return this.level.waves.length; }
  get waveActive() { return this.spawning.length > 0; }

  // ------------------------------------------------------------------ waves
  canCallWave() { return this.state === 'play' && this.wave < this.totalWaves() && (this.nextIn > 0 || this.wave === 0) && !this.waveActive; }
  // which roads the next wave uses (to light up only those flags)
  nextWavePaths() {
    const w = this.level.waves[this.wave];
    if (!w) return new Set();
    const s = new Set();
    for (const g of w) {
      const p = this.paths[g.path];
      if (p && p.air) {
        // flyers: light the flag of the road that ends at the same place
        s.add(this.entries[0]?.path ?? 0);
      } else s.add(g.path);
    }
    return s;
  }
  callWave() {
    if (!this.canCallWave()) return 0;
    let bonus = 0;
    if (this.wave > 0 && this.nextIn > 0) {
      bonus = Math.round(this.nextIn * 1.4);
      this.gold += bonus;
      for (const s of Object.values(this.spells)) s.cd = Math.max(0, s.cd - this.nextIn * 0.5);
    }
    this.startWave();
    return bonus;
  }
  startWave() {
    const w = this.level.waves[this.wave];
    this.wave++;
    this.nextIn = -2;
    this.spawning = w.map(g => ({ ...g, left: g.n, t: g.delay }));
    this.play('horn');
    this.emit({ t: 'wave', n: this.wave });
    for (const H of this.heroes) this.gainXp(25 + this.level.id * 5, H);
  }

  // ------------------------------------------------------------------ enemies
  spawnEnemy(kind, pathIdx, d = 0, lane = null) {
    const def = ENEMIES[kind];
    const path = this.paths[pathIdx] || this.paths[0];
    const hp = Math.round(def.hp * this.hpMul);
    const e = {
      id: UID++, kind, def, path: pathIdx, d, lane: lane ?? (def.boss ? 0 : (this.R() - 0.5) * 22),
      hp, maxHp: hp, x: 0, y: 0, fly: !!def.fly, alive: true, blockers: [], atkT: 0,
      slow: 0, slowT: 0, root: 0, stun: 0, poison: 0, poisonT: 0, shred: 0, shredT: 0, burn: 0,
      walk: this.R() * 10, face: 1, abT: {}, hurtT: 0, size: def.size, phase: 0,
      stain: null, stainT: 0, stainLv: 1, mixT: 0, hex: 0, hexT: 0, noHeal: 0,
    };
    if (path.air && !def.fly) e.path = 0;
    if (def.heal) e.abT.heal = def.heal.every * this.R();
    if (def.spawn) e.abT.spawn = def.spawn.every;
    if (def.silence) e.abT.silence = def.silence.every * 0.6;
    if (def.summon) e.abT.summon = def.summon.every;
    if (def.douse) e.abT.douse = def.douse.every * 0.7;
    if (def.blink) e.abT.blink = def.blink.every;
    if (def.stomp) e.abT.stomp = def.stomp.every;
    if (def.ranged) e.abT.shoot = 0;
    this.placeEnemy(e);
    this.enemies.push(e);
    if (!this.seen.has(kind)) { this.seen.add(kind); this.emit({ t: 'newEnemy', kind }); }
    if (def.boss) { this.emit({ t: 'boss', kind }); this.play('bossroar'); }
    return e;
  }
  placeEnemy(e) {
    const p = pointAt(this.paths[e.path], e.d);
    const nx = p.x + p.nx * e.lane, ny = p.y + p.ny * e.lane;
    if (Math.abs(nx - e.x) > 0.05) e.face = nx > e.x ? 1 : -1;
    e.x = nx; e.y = ny;
  }
  // distance left to the gate, used for "first" targeting
  remaining(e) { return this.paths[e.path].length - e.d; }

  damage(e, amt, dtype, src = null) {
    if (!e.alive) return 0;
    let mult = 1;
    const shred = e.shredT > 0 ? e.shred : 0;
    if (dtype === 'phys') {
      let a = e.def.armor * (1 - shred);
      if (src && src.pierce) a *= (1 - src.pierce);
      mult = 1 - a;
    } else if (dtype === 'magic') {
      let r = e.def.mr * (1 - shred);
      if (src && src.unbind) r *= (1 - src.unbind);
      mult = 1 - r;
    }
    if (e.hexT > 0) mult *= 1 + e.hex;
    // a real hit always does at least 1; damage-over-time ticks are fractions and stay that way
    const dealt = amt >= 1 ? Math.max(1, amt * mult) : amt * mult;
    e.hp -= dealt;
    e.hurtT = 0.12;
    if (src && src.hero) { this.stats.heroDmg += dealt; this.gainXp(dealt * 0.35, src.H); }
    if (e.hp <= 0) { this.kill(e, src); return dealt; }
    // a hit from a coloured tower (or a coloured spell or hero) stains
    const pig = src && (src.pigment || (src.tower && PIGMENT_OF[src.tower.def.line]));
    // (a beam's hit is a sliver of damage every frame, so a tower hit stains
    // whatever its size; it is the DoT ticks with no source that do not)
    if (pig && (amt >= 1 || src.tower)) this.stain(e, pig, src.tower ? src.tower.def.level : (src.lv || 2));
    return dealt;
  }

  // ------------------------------------------------------------------ pigments
  stain(e, pig, lv = 1) {
    if (!e.alive || e.mixT > 0) return;
    if (!e.stain || e.stainT <= 0) { e.stain = pig; e.stainT = STAIN_T; e.stainLv = lv; return; }
    if (e.stain === pig) { e.stainT = STAIN_T; e.stainLv = Math.max(e.stainLv, lv); return; }
    this.mix(e, e.stain, pig, Math.max(lv, e.stainLv));
  }
  mix(e, a, b, lv) {
    const M = MIXES[[a, b].sort().join('+')];
    e.stain = null; e.stainT = 0; e.mixT = MIX_COOL;
    this.stats.mixes++;
    // power grows with the battle and with the better of the two towers
    const pow = (10 + this.level.id * 3) * (1 + 0.3 * (lv - 1)) * (this.mods.pigment ?? 1);
    if (M.k === 'hex') {
      e.hex = 0.35; e.hexT = 4;
    } else if (M.k === 'bloom') {
      if (e.fly || e.def.boss) { e.slow = Math.max(e.slow, 0.5); e.slowT = Math.max(e.slowT, 2); }
      else e.root = Math.max(e.root, 1.3);
      this.damage(e, pow * 1.2, 'true');
    } else if (M.k === 'flash') {
      for (const o of this.enemies) {
        if (!o.alive || o.fly !== e.fly) continue;
        const d = Math.hypot(o.x - e.x, (o.y - e.y) / 0.8);
        if (d < 48) this.damage(o, pow * (o === e ? 1.6 : 1.1), 'true');
      }
    }
    this.emit({ t: 'mix', k: M.k, x: e.x, y: e.fly ? e.y - 34 : e.y - 10 * e.size, col: M.col });
    this.play(M.k === 'flash' ? 'pop' : M.k === 'bloom' ? 'roots' : 'zap');
  }
  kill(e, src) {
    e.alive = false;
    e.hp = 0;
    this.stats.kills++;
    const gold = e.def.gold;
    // in co-op both purses get most of the bounty: two players are building
    const share = this.players > 1 ? 0.6 : 1;
    for (let i = 0; i < this.purse.length; i++) this.purse[i] += Math.round(gold * share);
    this.stats.goldEarned += gold;
    for (const b of e.blockers) if (b.target === e) b.target = null;
    e.blockers.length = 0;
    this.emit({ t: 'die', x: e.x, y: e.y - (e.fly ? 34 : 0), kind: e.kind, size: e.size, fly: e.fly, gold, face: e.face, frame: Math.floor(e.walk * 2) });
    this.play(e.def.boss ? 'bossdie' : (e.size > 1.4 ? 'bigdie' : 'die'));
    if (src && src.hero) this.gainXp(e.def.gold * 2, src.H);
    // Plague Bloom: a poisoned foe bursts into a cloud
    const pt = e.poisonT > 0 && e.poisonSrc;
    if (pt && pt.ranks?.plague && this.towers.includes(pt)) {
      this.zones.push({ x: e.x, y: e.y, r: 52, t: 3, dps: [20, 35, 50][pt.ranks.plague - 1], kind: 'poison' });
      this.emit({ t: 'plague', x: e.x, y: e.y });
    }
    const sp = e.def.split;
    if (sp) for (let i = 0; i < sp.n; i++) {
      const c = this.spawnEnemy(sp.into, e.path, Math.max(0, e.d + (i - 1) * 14), (i - 1) * 10);
      c.stun = 0.3;
    }
  }
  leak(e) {
    e.alive = false;
    this.lives -= e.def.lives;
    this.stats.leaks += e.def.lives;
    this.stats.leakBy = this.stats.leakBy || {};
    this.stats.leakBy[e.kind] = (this.stats.leakBy[e.kind] || 0) + e.def.lives;
    for (const b of e.blockers) if (b.target === e) b.target = null;
    this.emit({ t: 'leak', lives: e.def.lives });
    this.play('leak');
    if (this.lives <= 0) { this.lives = 0; this.state = 'lost'; this.play('lose'); }
  }

  updateEnemies(dt) {
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const def = e.def;
      e.hurtT -= dt;
      // statuses
      if (e.poisonT > 0) { e.poisonT -= dt; this.damage(e, e.poison * dt, 'true'); if (!e.alive) continue; }
      if (e.burnT > 0) { e.burnT -= dt; this.damage(e, e.burn * dt, 'true'); if (!e.alive) continue; }
      if (e.slowT > 0) e.slowT -= dt; else e.slow = 0;
      if (e.shredT > 0) e.shredT -= dt;
      if (e.frozen > 0) e.frozen -= dt;
      if (e.stainT > 0) { e.stainT -= dt; if (e.stainT <= 0) e.stain = null; }
      if (e.mixT > 0) e.mixT -= dt;
      if (e.hexT > 0) e.hexT -= dt;
      if (e.noHeal > 0) e.noHeal -= dt;
      if (e.stone > 0) e.stone -= dt;
      if (def.regen && e.hp < e.maxHp && !(e.noHeal > 0)) e.hp = Math.min(e.maxHp, e.hp + def.regen * dt);
      if (e.stun > 0) { e.stun -= dt; continue; }

      // abilities
      this.enemyAbilities(e, dt);
      if (!e.alive) continue;

      // fighting a blocker?
      e.blockers = e.blockers.filter(b => b.alive && (b.target === e || (b.holds && b.holds.includes(e))));
      const fighting = !e.fly && e.blockers.length > 0;
      if (fighting) {
        const b = e.blockers[0];
        const close = Math.hypot(b.x - e.x, b.y - e.y) < 30;
        e.engaged = close;
        if (close) {
          e.face = b.x > e.x ? 1 : -1;
          e.atkT -= dt;
          if (e.atkT <= 0) {
            e.atkT = def.rate;
            this.hurtBlocker(b, this.roll(def.dmg), e);
            e.swing = 0.25;
          }
        }
        if (e.swing > 0) e.swing -= dt;
        continue;
      }
      // ranged enemies stop to shoot nearby soldiers
      if (def.ranged) {
        e.abT.shoot -= dt;
        const tgt = this.nearestBlocker(e.x, e.y, def.ranged.range);
        if (tgt) {
          e.face = tgt.x > e.x ? 1 : -1;
          if (e.abT.shoot <= 0) {
            e.abT.shoot = def.ranged.rate;
            this.proj.push({ k: 'nib', x: e.x, y: e.y - 16, sx: e.x, sy: e.y - 16, tgt, t: 0, dur: 0.45, dmg: this.roll(def.ranged.dmg), enemyShot: true });
            this.play('nib');
          }
          // STAND AND SHOOT, BUT NOT FOR EVER. A soldier inside its reach that
          // never came over to fight (rallied somewhere else, or a hero parked
          // out of the way) used to hold an archer in place for the rest of
          // the battle - the level could never end. Five seconds, then it
          // walks on and shoots on the move.
          e.abT.stand = (e.abT.stand || 0) + dt;
          if (e.abT.stand < 5) continue;
        } else e.abT.stand = 0;
      }
      if (e.root > 0) { e.root -= dt; continue; }
      // AN INK WALL in the way: stop and hack at it
      if (!e.fly && this.walls.length) {
        const w = this.walls.find(w => w.hp > 0 && segDist(e.x, e.y, w.x1, w.y1, w.x2, w.y2) < 11);
        if (w) {
          e.engaged = true;
          e.atkT -= dt;
          if (e.atkT <= 0) {
            e.atkT = def.rate;
            e.swing = 0.25;
            w.hp -= this.roll(def.dmg) * (def.boss ? 4 : 1.5);
            w.hitT = 0.15;
            if (w.thorns) this.damage(e, 6 + this.level.id * 1.5, 'true');
            if (w.hp <= 0) { this.emit({ t: 'wallbreak', x: (w.x1 + w.x2) / 2, y: (w.y1 + w.y2) / 2 }); this.play('thud'); }
          }
          if (e.swing > 0) e.swing -= dt;
          continue;
        }
      }
      e.engaged = false;
      const sp = def.speed * (1 - e.slow);
      e.d += sp * dt;
      e.walk += dt * sp / 14;
      if (e.d >= this.paths[e.path].length) { this.leak(e); continue; }
      this.placeEnemy(e);
    }
    this.enemies = this.enemies.filter(e => e.alive);
  }

  enemyAbilities(e, dt) {
    const def = e.def, T = e.abT;
    if (def.heal) {
      T.heal -= dt;
      if (T.heal <= 0) {
        T.heal = def.heal.every;
        let any = false;
        for (const o of this.enemies) if (o.alive && o !== e && o.hp < o.maxHp && Math.hypot(o.x - e.x, o.y - e.y) < def.heal.radius) { o.hp = Math.min(o.maxHp, o.hp + def.heal.amount); any = true; }
        if (any) { this.emit({ t: 'heal', x: e.x, y: e.y, r: def.heal.radius }); this.play('heal'); }
      }
    }
    if (def.spawn) {
      T.spawn -= dt;
      if (T.spawn <= 0) {
        T.spawn = def.spawn.every;
        for (let i = 0; i < def.spawn.n; i++) this.spawnEnemy(def.spawn.kind, e.path, Math.max(0, e.d - 10 - i * 12));
        this.emit({ t: 'spawnpuff', x: e.x, y: e.y });
      }
    }
    if (def.silence) {
      T.silence -= dt;
      if (T.silence <= 0) {
        const tw = this.towers.filter(t => t.silenced <= 0 && Math.hypot(t.x - e.x, t.y - e.y) < def.silence.range).sort((a, b) => b.def.level - a.def.level)[0];
        if (tw) {
          T.silence = def.silence.every;
          tw.silenced = def.silence.dur;
          this.emit({ t: 'silence', x: e.x, y: e.y, tx: tw.x, ty: tw.y });
          this.play('silence');
        } else T.silence = 1;
      }
    }
    if (def.summon) {
      T.summon -= dt;
      if (T.summon <= 0) {
        T.summon = def.summon.every * (e.phase >= 2 ? 0.6 : 1);
        for (let i = 0; i < def.summon.n; i++) this.spawnEnemy(def.summon.kind, e.path, Math.max(0, e.d - 20 - i * 10));
        this.emit({ t: 'summon', x: e.x, y: e.y, kind: def.summon.kind });
        this.play('summon');
      }
    }
    if (def.douse) {
      T.douse -= dt;
      if (T.douse <= 0) {
        T.douse = def.douse.every;
        const near = this.towers.filter(t => t.doused <= 0 && Math.hypot(t.x - e.x, t.y - e.y) < 320).sort((a, b) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y));
        for (const t of near.slice(0, def.douse.n + (e.phase >= 2 ? 1 : 0))) {
          t.doused = def.douse.dur;
          this.emit({ t: 'douse', x: e.x, y: e.y - 40, tx: t.x, ty: t.y });
        }
        if (near.length) this.play('douse');
      }
    }
    if (def.stomp) {
      T.stomp -= dt;
      if (T.stomp <= 0 && e.blockers.length) {
        T.stomp = def.stomp.every;
        for (const b of this.blockers) if (b.alive && Math.hypot(b.x - e.x, b.y - e.y) < def.stomp.radius) { this.hurtBlocker(b, def.stomp.dmg, e); b.stun = def.stomp.stun; }
        this.emit({ t: 'stomp', x: e.x, y: e.y, r: def.stomp.radius });
        this.play('stomp');
      }
    }
    if (def.blink) {
      T.blink -= dt;
      if (T.blink <= 0) {
        T.blink = def.blink.every * (e.phase >= 2 ? 0.7 : 1);
        const from = { x: e.x, y: e.y };
        for (const b of e.blockers) b.target = null;
        e.blockers.length = 0;
        e.d = Math.min(this.paths[e.path].length - 160, e.d + def.blink.dist);
        this.placeEnemy(e);
        this.emit({ t: 'blink', x: from.x, y: from.y, x2: e.x, y2: e.y });
        this.play('blink');
      }
    }
    if (def.phases) {
      const f = e.hp / e.maxHp;
      const ph = f < 0.33 ? 2 : f < 0.66 ? 1 : 0;
      if (ph > e.phase) {
        e.phase = ph;
        for (let i = 0; i < (ph === 2 ? 3 : 4); i++) this.spawnEnemy(ph === 2 ? 'hknight' : 'shade', e.path, Math.max(0, e.d - 30 - i * 16));
        this.emit({ t: 'phase', x: e.x, y: e.y, phase: ph });
        this.play('bossroar');
      }
    }
  }

  // ------------------------------------------------------------------ blockers (soldiers, hero, militia, elemental)
  makeBlocker(o) {
    const b = {
      id: UID++, alive: true, x: o.x, y: o.y, hx: o.x, hy: o.y, target: null, atkT: 0, stun: 0, face: 1, walk: 0,
      hp: o.hp, maxHp: o.hp, dmg: o.dmg, armor: o.armor ?? 0, rate: o.rate ?? 1, speed: o.speed ?? 60, engage: o.engage ?? 60,
      kind: o.kind, look: o.look, owner: o.owner || null, life: o.life ?? -1, ranged: o.ranged || null, maxFoes: 1, abT: {},
      respawnT: 0, slot: o.slot ?? 0, magic: !!o.magic,
    };
    this.blockers.push(b);
    return b;
  }
  hurtBlocker(b, amt, src) {
    if (!b.alive) return;
    const dealt = amt * (1 - b.armor) * (b.guardT > 0 ? 0.5 : 1);
    b.hp -= dealt;
    b.hurtT = 0.12;
    if (b.hp <= 0) {
      b.alive = false;
      b.hp = 0;
      if (b.target) b.target = null;
      this.emit({ t: 'fall', x: b.x, y: b.y, look: b.look, face: b.face });
      if (b.kind === 'soldier') b.respawnT = b.respawn;
      if (b.kind === 'hero') { b.respawnT = HEROES[b.H.id].respawn; this.play('herodown'); }
      if (b.kind === 'elemental') b.respawnT = 15;
      if (b.kind === 'beast') { b.respawnT = b.respawn; if (b.holds) b.holds.length = 0; }
    }
  }
  nearestBlocker(x, y, r) {
    let best = null, bd = r;
    for (const b of this.blockers) {
      if (!b.alive) continue;
      const d = Math.hypot(b.x - x, b.y - y);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }
  // capacity: how many blockers may gang up on one enemy
  foeCap(e) { return e.size >= 1.6 ? 3 : e.size >= 1.25 ? 2 : 2; }

  findFoe(b) {
    if (b.noBlock) return null;
    let best = null, bs = 1e9;
    for (const e of this.enemies) {
      if (!e.alive || e.fly) continue;
      const d = Math.hypot(e.x - b.hx, e.y - b.hy);
      if (d > b.engage) continue;
      const n = e.blockers.length;
      if (n >= this.foeCap(e)) continue;
      const s = d + n * 60 - (this.remaining(e) < 300 ? 30 : 0);
      if (s < bs) { bs = s; best = e; }
    }
    return best;
  }

  updateBlockers(dt) {
    for (const b of this.blockers) {
      if (!b.alive) {
        if (b.respawnT > 0) {
          b.respawnT -= dt;
          if (b.respawnT <= 0) {
            if (b.kind === 'soldier' && b.owner && this.towers.includes(b.owner)) {
              b.alive = true; b.hp = b.maxHp;
              b.x = b.owner.x; b.y = b.owner.y + 10;
            } else if (b.kind === 'hero') {
              b.alive = true; b.hp = b.maxHp;
              b.x = b.hx; b.y = b.hy;
              this.emit({ t: 'heroback', x: b.x, y: b.y });
            } else if (b.kind === 'beast' && b.owner && this.towers.includes(b.owner)) {
              b.alive = true; b.hp = b.maxHp; b.x = b.owner.x; b.y = b.owner.y + 8;
              this.emit({ t: 'poof', x: b.x, y: b.y });
            } else if (b.kind === 'elemental' && b.owner && this.towers.includes(b.owner)) {
              b.alive = true; b.hp = b.maxHp; b.x = b.owner.x; b.y = b.owner.y + 10;
            }
          }
        }
        continue;
      }
      if (b.life > 0) { b.life -= dt; if (b.life <= 0) { b.alive = false; this.emit({ t: 'poof', x: b.x, y: b.y }); continue; } }
      if (b.hurtT > 0) b.hurtT -= dt;
      if (b.swing > 0) b.swing -= dt;
      if (b.stun > 0) { b.stun -= dt; continue; }
      if (b.roam) { this.updateBeast(b, dt); continue; }
      // the hero being ordered somewhere ignores fights until he gets there
      if (b.moving) {
        if (b.target) { b.target.blockers = b.target.blockers.filter(x => x !== b); b.target = null; }
        if (this.moveTo(b, b.hx, b.hy, dt)) b.moving = false;
        continue;
      }
      // abilities
      if (b.kind === 'hero') this.heroSkill(b, dt);
      if (b.owner && b.kind === 'soldier') this.soldierAbilities(b, dt);
      if (b.guardT > 0) b.guardT -= dt;
      if (b.kind === 'hero' && !b.target && b.hp < b.maxHp && b.H.id === 'wren') b.hp = Math.min(b.maxHp, b.hp + 6 * dt);

      // drop target if it wandered off / died
      const t = b.target;
      if (t && (!t.alive || Math.hypot(t.x - b.hx, t.y - b.hy) > b.engage + 50)) {
        t.blockers = t.blockers.filter(x => x !== b);
        b.target = null;
      }
      if (!b.target) {
        const f = this.findFoe(b);
        if (f) { b.target = f; f.blockers.push(b); }
      }
      if (b.target) {
        const e = b.target;
        const idx = e.blockers.indexOf(b);
        const side = idx % 2 === 0 ? (b.x <= e.x ? -1 : 1) : (b.x <= e.x ? 1 : -1);
        const gx = e.x + side * (14 + e.size * 6), gy = e.y + (idx >= 2 ? 8 : 0);
        b.engaged = false;
        if (this.moveTo(b, gx, gy, dt, 2)) {
          b.engaged = true;
          b.face = e.x > b.x ? 1 : -1;
          b.atkT -= dt;
          if (b.atkT <= 0) {
            b.atkT = b.rate;
            b.swing = 0.25;
            let dmg = this.roll(b.dmg);
            if (b.charge && b.chargedOn !== e) {
              // the first blow of a charge
              const r = b.owner?.ranks?.charge || 0;
              dmg *= r ? [4, 5, 6][r - 1] : b.charge;
              if (!e.def.boss && (r || e.size <= 1.15)) e.stun = Math.max(e.stun, r ? [1, 1.5, 2][r - 1] : 0.6);
              b.chargedOn = e;
              this.emit({ t: 'charge', x: e.x, y: e.y });
              this.play('bash');
            }
            this.damage(e, dmg, b.magic ? 'magic' : 'phys', b.kind === 'hero' ? this.heroSrc(b) : null);
            this.play(b.kind === 'hero' ? 'heroslash' : 'clank');
            if (b.owner && b.owner.ranks?.holystrike) this.holyStrike(b, e);
          }
        }
      } else {
        // ranged blockers shoot while idle
        if (b.ranged) {
          b.atkT -= dt;
          const tgt = this.pickTarget(b.x, b.y, b.ranged.range, b.ranged.air);
          if (tgt && b.atkT <= 0) {
            b.atkT = b.ranged.rate;
            b.face = tgt.x > b.x ? 1 : -1;
            b.swing = 0.25;
            this.proj.push({ k: b.ranged.proj, x: b.x, y: b.y - 18, sx: b.x, sy: b.y - 18, tgt, t: 0, dur: b.ranged.proj === 'arrow' ? 0.3 + Math.hypot(tgt.x - b.x, tgt.y - b.y) / 900 : 0.35, dmg: this.roll(b.ranged.dmg) * (b.owner?.def.line === 'archer' ? this.mods.archerDmg : 1), dtype: b.ranged.dtype || 'phys', src: b.kind === 'hero' ? this.heroSrc(b) : (b.owner ? this.srcOf(b.owner) : null) });
            this.play(b.ranged.proj === 'bolt' ? 'zap' : 'bow');
            if (!tgt) continue;
          }
        }
        this.moveTo(b, b.hx + (b.ox || 0), b.hy + (b.oy || 0), dt);
      }
    }
    // remove expired summons
    this.blockers = this.blockers.filter(b => b.alive || b.respawnT > 0 || b.kind === 'hero');
  }
  moveTo(b, x, y, dt, tol = 1.5) {
    const dx = x - b.x, dy = y - b.y, d = Math.hypot(dx, dy);
    if (d <= tol) return true;
    const s = Math.min(d, b.speed * dt);
    b.x += dx / d * s; b.y += dy / d * s;
    if (Math.abs(dx) > 0.5) b.face = dx > 0 ? 1 : -1;
    b.walk += dt * b.speed / 12;
    return d - s <= tol;
  }

  // ------------------------------------------------------------------ hero
  spawnHero(id, xp = 0, idx = 0) {
    const lvl = heroLevel(xp);
    const st = heroStats(id, lvl);
    const H = HEROES[id];
    // start near the middle of the road, a bit before the gate (the partner a
    // little further up it)
    const p = this.paths.find(p => !p.air);
    const q = pointAt(p, p.length * (idx ? 0.45 : 0.6));
    const b = this.makeBlocker({
      x: q.x, y: q.y + 26, hp: st.hp, dmg: st.dmg, armor: st.armor, rate: st.rate, speed: st.speed, engage: 70,
      kind: 'hero', look: H.look, magic: !!H.magic,
      ranged: st.range ? { range: st.range, dmg: st.dmg, rate: st.rate, proj: H.magic ? 'bolt' : H.harpoon ? 'spear' : 'arrow', air: !!H.air, dtype: H.magic ? 'magic' : 'phys' } : null,
    });
    b.abT.skill = 4;
    const rec = { id, b, level: lvl, xp, xpStart: xp, idx };
    b.H = rec;
    this.heroes[idx] = rec;
    if (idx === 0) this.hero = rec;
  }
  /** what a hero's blow counts as: whose xp, and any colour it paints */
  heroSrc(b) {
    const id = b.H.id;
    return { hero: true, H: b.H, unbind: id === 'moss' ? 0.3 : 0, pigment: id === 'vermilia' ? 'verm' : null, lv: 2 };
  }
  gainXp(x, H = this.heroes[0]) {
    if (!H) return;
    const before = heroLevel(H.xp);
    H.xp += x;
    const after = heroLevel(H.xp);
    if (after > before) {
      const st = heroStats(H.id, after);
      const b = H.b;
      const f = b.hp / b.maxHp;
      b.maxHp = st.hp; b.hp = b.alive ? Math.max(b.hp, st.hp * f) : 0;
      b.dmg = st.dmg; b.armor = st.armor;
      if (b.ranged) b.ranged.dmg = st.dmg;
      H.level = after;
      this.emit({ t: 'levelup', x: b.x, y: b.y, level: after });
      this.play('levelup');
    }
  }
  moveHero(x, y, idx = this.actor) {
    const b = this.heroes[idx]?.b;
    if (!b || !b.alive) return false;
    b.hx = x; b.hy = y; b.moving = true;
    return true;
  }
  heroSkill(b, dt) {
    b.abT.skill -= dt;
    if (b.abT.skill > 0) return;
    const id = b.H.id, L = b.H.level;
    if (id === 'wren') {
      if (!b.target) return;
      const foes = this.enemies.filter(e => e.alive && !e.fly && Math.hypot(e.x - b.x, e.y - b.y) < 55).slice(0, 3);
      for (const e of foes) { this.damage(e, 40 + L * 12, 'phys', { hero: true }); if (!e.def.boss) e.stun = 2; }
      this.emit({ t: 'bash', x: b.x + b.face * 14, y: b.y });
      this.play('bash');
    } else if (id === 'ysolde') {
      const tgt = this.pickTarget(b.x, b.y, 170, true, 'crowd');
      if (!tgt) return;
      for (let i = 0; i < 8; i++) {
        this.proj.push({ k: 'rain', x: tgt.x + this.rand(-40, 40), y: tgt.y - 260 - i * 18, sx: 0, sy: 0, gx: tgt.x + this.rand(-34, 34), gy: tgt.y + this.rand(-20, 20), t: 0, dur: 0.5 + i * 0.05, dmg: 18 + L * 5, splash: 22, dtype: 'phys', src: { hero: true }, ground: true });
      }
      this.play('volley');
    } else if (id === 'moss') {
      const tgt = this.pickTarget(b.x, b.y, 160, false, 'crowd');
      if (!tgt) return;
      const dur = 2 + (L * 0.2 | 0);
      for (const e of this.enemies) if (e.alive && !e.fly && Math.hypot(e.x - tgt.x, e.y - tgt.y) < 70 && !e.def.boss) e.root = Math.max(e.root, dur);
      for (const s of this.blockers) if (s.alive && Math.hypot(s.x - b.x, s.y - b.y) < 120) s.hp = Math.min(s.maxHp, s.hp + 40 + L * 10);
      this.emit({ t: 'roots', x: tgt.x, y: tgt.y, r: 70, dur });
      this.emit({ t: 'heal', x: b.x, y: b.y, r: 120 });
      this.play('roots');
    } else if (id === 'tamsin') {
      const e = b.target;
      if (!e || !b.engaged) return;
      this.damage(e, 150 + L * 45, 'phys', this.heroSrc(b));
      this.emit({ t: 'flurry', x: e.x, y: e.y - 12 });
      this.play('heroslash');
    } else if (id === 'hob') {
      const tgt = this.enemies.filter(e => e.alive && !e.fly && !e.def.boss && Math.hypot(e.x - b.x, e.y - b.y) < 210)
        .sort((a, c) => this.remaining(a) - this.remaining(c))[0];
      if (!tgt) return;
      const from = { x: tgt.x, y: tgt.y };
      this.release(tgt);
      for (const o of tgt.blockers) if (o.target === tgt) o.target = null;
      tgt.blockers.length = 0;
      tgt.d = Math.max(0, tgt.d - 120);
      this.placeEnemy(tgt);
      tgt.stun = Math.max(tgt.stun, 1);
      this.damage(tgt, 40 + L * 10, 'phys', this.heroSrc(b));
      this.emit({ t: 'hook', x: b.x, y: b.y - 16, x2: from.x, y2: from.y - 12, x3: tgt.x, y3: tgt.y });
      this.play('bash');
    } else if (id === 'vermilia') {
      const tgt = this.pickTarget(b.x, b.y, 170, true, 'crowd');
      if (!tgt) return;
      for (const e of this.enemies) {
        if (!e.alive || Math.hypot(e.x - tgt.x, e.y - tgt.y) > 70) continue;
        this.damage(e, 30 + L * 8, 'magic', this.heroSrc(b));
        if (e.alive) this.stain(e, 'verm', 3);
      }
      this.emit({ t: 'redwash', x: tgt.x, y: tgt.y, r: 70 });
      this.play('zap');
    } else if (id === 'bramwell') {
      const near = this.enemies.filter(e => e.alive && !e.fly && Math.hypot(e.x - b.x, e.y - b.y) < 70);
      if (!near.length) return;
      for (const e of near) if (!e.def.boss) e.root = Math.max(e.root, 2);
      b.guardT = 5;
      this.emit({ t: 'bash', x: b.x, y: b.y });
      this.emit({ t: 'stomp', x: b.x, y: b.y, r: 70, small: true });
      this.play('bash');
    } else if (id === 'umber') {
      const tgt = this.pickTarget(b.x, b.y, 160, true, 'crowd');
      if (!tgt) return;
      for (const e of this.enemies) {
        if (!e.alive || Math.hypot(e.x - tgt.x, e.y - tgt.y) > 75) continue;
        e.hex = Math.max(e.hex, 0.35 + L * 0.02); e.hexT = Math.max(e.hexT, 5);
        e.slow = Math.max(e.slow, 0.3); e.slowT = Math.max(e.slowT, 5);
        e.noHeal = 5;
      }
      this.emit({ t: 'curse', x: tgt.x, y: tgt.y, r: 75 });
      this.play('glare');
    }
    b.abT.skill = HEROES[id].skill.every;
  }

  // ------------------------------------------------------------------ towers
  costOf(id) {
    const d = TOWERS[id];
    const m = this.mods;
    const f = d.line === 'archer' ? m.archerCost : d.line === 'mage' ? m.mageCost : d.line === 'artillery' ? m.artCost : 1;
    return Math.round(d.cost * f);
  }
  build(slotIdx, id) {
    const s = this.slots[slotIdx];
    if (!s || s.tower || !BUILD.includes(id)) return false;
    const cost = this.costOf(id);
    if (this.gold < cost) return false;
    this.gold -= cost;
    const t = {
      id: UID++, slot: s, x: s.x, y: s.y, type: id, def: TOWERS[id], cd: 0.6, ranks: {}, abT: {}, aim: 0, owner: this.actor,
      silenced: 0, doused: 0, buildT: 0.8, soldiers: [], rally: null, shooter: 0, beam: null, spent: cost,
    };
    s.tower = t;
    this.towers.push(t);
    if (t.def.soldier) this.initBarracks(t);
    if (t.def.beast) this.refreshBeast(t);
    this.play('build');
    this.emit({ t: 'build', x: s.x, y: s.y });
    this.emit({ t: 'towerSeen', id, owner: this.actor });
    return true;
  }
  upgrade(t, id) {
    if (!(t.def.next || []).includes(id) || !this.mine(t)) return false;
    const cost = this.costOf(id);
    if (this.gold < cost) return false;
    this.gold -= cost;
    t.spent += cost;
    t.type = id; t.def = TOWERS[id]; t.buildT = 0.6;
    if (t.def.soldier) { if (!t.rally) t.rally = this.defaultRally(t); this.refreshSoldiers(t); }
    if (t.def.beast) this.refreshBeast(t);
    this.play('upgrade');
    this.emit({ t: 'build', x: t.x, y: t.y });
    this.emit({ t: 'towerSeen', id, owner: this.actor });
    return true;
  }
  buyAbility(t, ab) {
    if (!t.def.abilities?.includes(ab) || !this.mine(t)) return false;
    const r = t.ranks[ab] || 0;
    if (r >= 3) return false;
    const cost = ABILITIES[ab].cost[r];
    if (this.gold < cost) return false;
    this.gold -= cost;
    t.spent += cost;
    t.ranks[ab] = r + 1;
    if (ab === 'elemental') this.summonElemental(t);
    if (t.def.soldier) this.refreshSoldiers(t);
    if (t.def.beast) this.refreshBeast(t);
    this.play('upgrade');
    this.emit({ t: 'sparkle', x: t.x, y: t.y - 40 });
    return true;
  }
  sellValue(t) { return Math.round(t.spent * SELL_BACK); }
  sell(t) {
    if (!this.mine(t)) return false;
    this.gold += this.sellValue(t);
    t.slot.tower = null;
    this.towers = this.towers.filter(x => x !== t);
    for (const b of this.blockers) if (b.owner === t) { b.alive = false; b.respawnT = 0; if (b.target) b.target = null; }
    this.play('sell');
    this.emit({ t: 'sell', x: t.x, y: t.y });
  }

  // ---- barracks
  defaultRally(t) {
    let best = null;
    for (const p of this.paths) {
      if (p.air) continue;
      const n = nearestOnPath(p, t.x, t.y);
      if (!best || n.dist < best.dist) best = n;
    }
    return { x: best.x, y: best.y };
  }
  initBarracks(t) {
    t.rally = this.defaultRally(t);
    this.refreshSoldiers(t);
  }
  soldierStats(t) {
    const s = t.def.soldier, m = this.mods;
    return {
      hp: Math.round(s.hp * m.soldierHp), dmg: [s.dmg[0] * m.soldierDmg, s.dmg[1] * m.soldierDmg],
      armor: Math.min(0.85, s.armor + m.soldierArmor), rate: s.rate, respawn: s.respawn * m.respawn,
    };
  }
  refreshSoldiers(t) {
    const st = this.soldierStats(t);
    const S = t.def.soldier;
    const n = (S.n ?? 3) + (this.mods.soldiers > 3 ? 1 : 0);
    const off = [[-13, -7], [13, -7], [0, 9], [0, -20], [-14, 10]];
    t.soldiers = t.soldiers.filter(s => this.blockers.includes(s) && s.kind === 'soldier');
    while (t.soldiers.length < n) {
      const i = t.soldiers.length;
      const b = this.makeBlocker({ x: t.x, y: t.y + 10, hp: st.hp, dmg: st.dmg, armor: st.armor, rate: st.rate, speed: 62, engage: 62, kind: 'soldier', look: S.look, owner: t, slot: i });
      b.ox = off[i][0]; b.oy = off[i][1];
      t.soldiers.push(b);
    }
    for (const b of t.soldiers) {
      const f = b.alive ? b.hp / b.maxHp : 1;
      b.maxHp = st.hp; b.hp = b.alive ? Math.max(b.hp, st.hp * f) : 0;
      b.dmg = st.dmg; b.armor = st.armor; b.rate = st.rate; b.respawn = st.respawn; b.look = t.def.soldier.look;
      b.hx = t.rally.x; b.hy = t.rally.y;
      b.speed = S.speed ?? 62; b.engage = S.engage ?? 62; b.charge = S.charge || 0;
      b.noBlock = !!t.def.field;
      const ax = t.ranks.axes;
      b.ranged = ax ? { range: 120, dmg: [[18, 30, 42][ax - 1] * 0.8, [18, 30, 42][ax - 1] * 1.2], rate: 1.6, proj: 'axe', air: true } : (S.ranged ? { ...S.ranged } : null);
    }
    // a smaller squad after switching path: retire the extras
    while (t.soldiers.length > n) { const b = t.soldiers.pop(); b.alive = false; b.respawnT = 0; if (b.target) b.target = null; }
  }
  setRally(t, x, y) {
    if (!t.def.soldier && !t.def.beast) return false;
    if (t.def.beast) { t.rally = { x, y }; this.play('rally'); return true; }
    if (!inRange(t.x, t.y, x, y, t.def.range)) return false;
    t.rally = { x, y };
    for (const b of t.soldiers) {
      b.hx = x; b.hy = y;
      if (b.target) { b.target.blockers = b.target.blockers.filter(z => z !== b); b.target = null; }
    }
    if (t.elemental) { t.elemental.hx = x; t.elemental.hy = y + 18; }
    this.play('rally');
    return true;
  }
  soldierAbilities(b, dt) {
    const t = b.owner, R = t.ranks;
    if (R.heal && b.hp < b.maxHp * 0.5) {
      b.abT.heal = (b.abT.heal || 0) - dt;
      if (b.abT.heal <= 0) {
        b.abT.heal = 10;
        b.hp = Math.min(b.maxHp, b.hp + [40, 80, 120][R.heal - 1]);
        this.emit({ t: 'heal', x: b.x, y: b.y, r: 20 });
        this.play('heal');
      }
    }
    if (R.whirlwind && b.target) {
      b.abT.whirl = (b.abT.whirl ?? 3) - dt;
      if (b.abT.whirl <= 0) {
        b.abT.whirl = 6;
        const dmg = [25, 45, 65][R.whirlwind - 1];
        for (const e of this.enemies) if (e.alive && !e.fly && Math.hypot(e.x - b.x, e.y - b.y) < 45) this.damage(e, dmg, 'phys');
        this.emit({ t: 'whirl', x: b.x, y: b.y });
        this.play('whirl');
      }
    }
  }
  holyStrike(b, e) {
    const r = b.owner.ranks.holystrike;
    if (this.R() > [0.15, 0.2, 0.25][r - 1]) return;
    const dmg = [30, 55, 80][r - 1];
    for (const o of this.enemies) if (o.alive && !o.fly && Math.hypot(o.x - e.x, o.y - e.y) < 50) this.damage(o, dmg, 'magic');
    this.emit({ t: 'holy', x: e.x, y: e.y });
    this.play('holy');
  }
  summonElemental(t) {
    const r = t.ranks.elemental;
    const hp = [300, 450, 600][r - 1], dmg = [[14, 22], [20, 32], [28, 44]][r - 1];
    if (!t.rally) t.rally = this.defaultRally(t);
    if (t.elemental && this.blockers.includes(t.elemental)) {
      const b = t.elemental;
      b.maxHp = hp; b.hp = b.alive ? hp : 0; b.dmg = dmg;
      return;
    }
    const b = this.makeBlocker({ x: t.x, y: t.y + 10, hp, dmg, armor: 0.2, rate: 1.2, speed: 45, engage: 70, kind: 'elemental', look: 'elemental', owner: t });
    b.hx = t.rally.x; b.hy = t.rally.y;
    b.maxFoes = 2;
    t.elemental = b;
  }

  // ---- inkfire
  firePot(t, tgt, dmg, src, spread = 0) {
    const d = t.def;
    const flight = 0.8 + Math.hypot(tgt.x - t.x, tgt.y - t.y) / 650;
    const lead = this.predict(tgt, flight);
    const a = Math.random() * Math.PI * 2;
    const scorch = t.ranks.scorch ? [0.15, 0.25, 0.35][t.ranks.scorch - 1] : 0;
    this.proj.push({ k: 'firepot', x: t.x, y: t.y + d.top, sx: t.x, sy: t.y + d.top, gx: lead.x + Math.cos(a) * spread, gy: lead.y + Math.sin(a) * spread * 0.7, t: 0, dur: flight, dmg, dtype: 'phys', splash: d.splash, src, ground: true, burn: d.burn, shred: scorch });
    this.play('mortar');
  }

  // ---- beasts: one creature per den that roams the whole map
  beastStats(t) {
    const B = t.def.beast, R = t.ranks;
    let hp = B.hp, armor = B.armor;
    if (R.scales) hp *= 1 + [0.25, 0.5, 0.75][R.scales - 1];
    if (R.thickhide) { hp *= 1 + [0.2, 0.4, 0.6][R.thickhide - 1]; armor += [0.1, 0.2, 0.3][R.thickhide - 1]; }
    return { hp: Math.round(hp), armor: Math.min(0.85, armor), heads: (B.heads || 1) + (R.heads || 0) };
  }
  refreshBeast(t) {
    const B = t.def.beast, st = this.beastStats(t);
    if (!t.rally) t.rally = { x: t.x, y: t.y + 30 };
    let b = t.beastUnit && this.blockers.includes(t.beastUnit) ? t.beastUnit : null;
    if (!b) {
      b = this.makeBlocker({ x: t.x, y: t.y + 8, hp: st.hp, dmg: B.dmg, armor: st.armor, rate: B.rate, speed: B.speed, engage: 9999, kind: 'beast', look: B.look, owner: t });
      t.beastUnit = b;
      this.emit({ t: 'poof', x: b.x, y: b.y });
    }
    const f = b.alive ? b.hp / b.maxHp : 1;
    b.maxHp = st.hp; b.hp = b.alive ? Math.max(b.hp, st.hp * f) : 0;
    b.dmg = B.dmg; b.armor = st.armor; b.rate = B.rate; b.speed = B.speed; b.look = B.look; b.respawn = B.respawn;
    b.roam = true; b.fly = !!B.fly; b.noBlock = !!B.fly; b.heads = st.heads; b.blocks = B.blocks || 1;
    b.venom = B.venom || 0; b.stomp = B.stomp || 0; b.gazeSlow = B.gazeSlow || 0; b.breath = B.breath || null;
    b.holds = b.holds || [];
  }
  updateBeast(b, dt) {
    const t = b.owner, R = t.ranks;
    if (R.scales && b.hp < b.maxHp) b.hp = Math.min(b.maxHp, b.hp + [5, 10, 15][R.scales - 1] * dt);
    // the basilisk's gaze slows everything near it
    if (b.gazeSlow) for (const e of this.enemies) if (e.alive && Math.hypot(e.x - b.x, e.y - b.y) < 70) { e.slow = Math.max(e.slow, b.gazeSlow); e.slowT = Math.max(e.slowT, 0.3); }
    this.beastAbilities(b, dt);
    // pick prey: the nearest foe it can reach (flyers only for things that fly)
    let e = b.target;
    if (e && (!e.alive || (e.fly && !b.fly))) { this.release(b); e = null; }
    if (!e || (b.retarget = (b.retarget || 0) - dt) <= 0) {
      b.retarget = 0.6;
      let best = null, bd = 1e9;
      for (const o of this.enemies) {
        if (!o.alive || (o.fly && !b.fly)) continue;
        const oy = o.fly ? o.y - 34 : o.y;
        const d = Math.hypot(o.x - b.x, oy - b.y) - (this.remaining(o) < 250 ? 80 : 0);
        if (d < bd) { bd = d; best = o; }
      }
      if (best !== e) { this.release(b); e = best; if (e) { b.target = e; if (!b.noBlock) e.blockers.push(b); } }
    }
    b.engaged = false;
    if (!e) {
      // nothing to hunt: amble around the den
      b.wanderT = (b.wanderT || 0) - dt;
      if (b.wanderT <= 0) { b.wanderT = 2 + this.R() * 3; b.wx = t.rally.x + (this.R() - 0.5) * 70; b.wy = t.rally.y + (this.R() - 0.5) * 40; }
      this.moveTo(b, b.wx ?? t.rally.x, b.wy ?? t.rally.y, dt * 0.5);
      return;
    }
    const ey = e.fly ? e.y - 34 : e.y;
    if (b.breath) {
      // flyers keep their distance and breathe fire
      const d = Math.hypot(e.x - b.x, ey - b.y);
      if (d > b.breath.range * 0.85) { this.moveTo(b, e.x - Math.sign(e.x - b.x || 1) * b.breath.range * 0.6, ey - 24, dt); return; }
      b.engaged = true;
      b.face = e.x > b.x ? 1 : -1;
      b.atkT -= dt;
      if (b.atkT <= 0) {
        b.atkT = b.rate; b.swing = 0.25;
        const dmg = this.roll(b.dmg);
        for (const o of this.enemies) {
          if (!o.alive) continue;
          const oy = o.fly ? o.y - 34 : o.y;
          if (Math.hypot(o.x - e.x, oy - ey) < b.breath.splash) { this.damage(o, o === e ? dmg : dmg * 0.6, 'magic'); if (o.alive) { o.burn = Math.max(o.burn || 0, dmg * 0.15); o.burnT = 2; } }
        }
        this.emit({ t: 'breath', x: b.x + b.face * 12, y: b.y - 34, x2: e.x, y2: ey, r: b.breath.splash });
        this.play('breath');
      }
      return;
    }
    // ground beasts close in and fight like soldiers
    const side = b.x <= e.x ? -1 : 1;
    const gx = e.x + side * (16 + e.size * 7), gy = e.y;
    if (!this.moveTo(b, gx, gy, dt, 2)) return;
    b.engaged = true;
    b.face = e.x > b.x ? 1 : -1;
    // big beasts hold several foes at once
    b.holds.length = 0;
    if (b.blocks > 1) for (const o of this.enemies) {
      if (b.holds.length >= b.blocks - 1) break;
      if (o !== e && o.alive && !o.fly && Math.hypot(o.x - b.x, o.y - b.y) < 34) { b.holds.push(o); if (!o.blockers.includes(b)) o.blockers.push(b); }
    }
    b.atkT -= dt;
    if (b.atkT <= 0) {
      b.atkT = b.rate; b.swing = 0.25;
      const victims = [e, ...b.holds.filter(o => o.alive)];
      if (b.heads > 1) for (const o of this.enemies) { if (victims.length >= b.heads) break; if (o.alive && !o.fly && !victims.includes(o) && Math.hypot(o.x - b.x, o.y - b.y) < 46) victims.push(o); }
      const bites = victims.slice(0, Math.max(1, b.heads));
      for (const o of bites) {
        this.damage(o, this.roll(b.dmg), 'phys');
        if (b.venom && o.alive) { o.poison = Math.max(o.poison || 0, b.venom); o.poisonT = 3; o.poisonStacks = 1; }
      }
      if (b.stomp) {
        for (const o of this.enemies) if (o.alive && !o.fly && !bites.includes(o) && Math.hypot(o.x - e.x, o.y - e.y) < b.stomp) this.damage(o, this.roll(b.dmg) * 0.6, 'phys');
        this.emit({ t: 'stomp', x: e.x, y: e.y, r: b.stomp, small: true });
      }
      this.play(b.look === 'bear' || b.look === 'direbear' || b.look === 'mammoth' ? 'bash' : 'heroslash');
    }
  }
  release(b) {
    if (b.target) b.target.blockers = b.target.blockers.filter(x => x !== b);
    b.target = null;
    for (const o of b.holds || []) o.blockers = o.blockers.filter(x => x !== b);
    if (b.holds) b.holds.length = 0;
  }
  beastAbilities(b, dt) {
    const R = b.owner.ranks, T = b.abT;
    if (R.inferno && b.target?.alive) {
      T.inferno = (T.inferno ?? 3) - dt;
      if (T.inferno <= 0) {
        T.inferno = 10;
        const e = b.target, ey = e.fly ? e.y - 34 : e.y;
        for (const o of this.enemies) if (o.alive && Math.hypot(o.x - e.x, (o.fly ? o.y - 34 : o.y) - ey) < 70) this.damage(o, [70, 110, 150][R.inferno - 1], 'magic');
        if (!e.fly) this.zones.push({ x: e.x, y: e.y, r: 55, t: 4, dps: 25, kind: 'fire' });
        this.emit({ t: 'boom', x: e.x, y: e.y, r: 70, big: true });
        this.emit({ t: 'burnzone', x: e.x, y: e.y, r: 55, dur: 4 });
        this.play('boom');
      }
    }
    if (R.roar && b.engaged) {
      T.roar = (T.roar ?? 4) - dt;
      if (T.roar <= 0) {
        T.roar = 12;
        for (const o of this.enemies) if (o.alive && !o.fly && !o.def.boss && Math.hypot(o.x - b.x, o.y - b.y) < 90) o.stun = Math.max(o.stun, [1.5, 2, 2.5][R.roar - 1]);
        this.emit({ t: 'stomp', x: b.x, y: b.y, r: 90 });
        this.play('bossroar');
      }
    }
    if (R.petrify) {
      T.petrify = (T.petrify ?? 3) - dt;
      if (T.petrify <= 0) {
        let best = null;
        for (const o of this.enemies) if (o.alive && !o.def.boss && Math.hypot(o.x - b.x, o.y - b.y) < 110 && (!best || o.hp > best.hp)) best = o;
        if (best) { T.petrify = [10, 8, 6][R.petrify - 1]; best.stun = Math.max(best.stun, 3); best.stone = 3; this.emit({ t: 'petrify', x: best.x, y: best.y }); this.play('roots'); }
        else T.petrify = 0.5;
      }
    }
  }

  // ---- targeting
  // mode: 'first' (nearest the gate), 'strong' (most hp), 'crowd' (most neighbours)
  pickTarget(x, y, range, air, mode = 'first', exclude = null) {
    let best = null, bs = -1e9;
    for (const e of this.enemies) {
      if (!e.alive || (e.fly && !air) || e === exclude) continue;
      const ey = e.fly ? e.y - 34 : e.y;
      if (!inRange(x, y, e.x, ey, range)) continue;
      let s;
      if (mode === 'strong') s = e.hp;
      else if (mode === 'crowd') { s = 0; for (const o of this.enemies) if (o.alive && Math.hypot(o.x - e.x, o.y - e.y) < 50) s++; }
      else s = -this.remaining(e);
      if (s > bs) { bs = s; best = e; }
    }
    return best;
  }

  towerRange(t) {
    const d = t.def, m = this.mods;
    const f = d.line === 'archer' ? m.archerRange : d.line === 'mage' ? m.mageRange : d.line === 'artillery' ? m.artRange : 1;
    return d.range * f;
  }
  towerDmg(t) {
    const d = t.def, m = this.mods;
    const f = d.line === 'archer' ? m.archerDmg : d.line === 'mage' ? m.mageDmg : d.line === 'artillery' ? m.artDmg : 1;
    return this.roll(d.dmg) * f;
  }
  srcOf(t) {
    const m = this.mods, l = t.def.line;
    return { tower: t, pierce: Math.max(l === 'archer' ? m.archerPierce : 0, t.def.pierce || 0), unbind: l === 'mage' ? m.mageUnbind : 0 };
  }

  updateTowers(dt) {
    for (const t of this.towers) {
      if (t.buildT > 0) { t.buildT -= dt; continue; }
      if (t.silenced > 0) { t.silenced -= dt; t.beam = null; continue; }
      if (t.doused > 0) { t.doused -= dt; t.beam = null; continue; }
      const d = t.def;
      if (d.soldier || d.beast) { this.towerAbilities(t, dt, this.towerRange(t)); continue; }
      const range = this.towerRange(t);
      t.cd -= dt;
      this.towerAbilities(t, dt, range);

      if (d.proj === 'beam') { this.updateBeam(t, dt, range); continue; }
      if (t.cd > 0) continue;
      const tgt = this.pickTarget(t.x, t.y - 30, range, d.air);
      if (!tgt) continue;
      t.cd = d.rate;
      const top = { x: t.x, y: t.y + (d.top ?? -40) };
      const ty = tgt.fly ? tgt.y - 34 : tgt.y;
      t.aim = Math.atan2(ty - top.y, tgt.x - top.x);
      const dmg = this.towerDmg(t);
      const src = this.srcOf(t);
      if (d.proj === 'arrow') {
        t.shooter = 1 - t.shooter;
        t.fireT = 0.18;
        const sx = top.x + (t.shooter ? 8 : -8);
        let dd = dmg;
        if (this.mods.archerCrit && this.R() < this.mods.archerCrit) dd *= 2;
        this.proj.push({ k: 'arrow', x: sx, y: top.y, sx, sy: top.y, tgt, t: 0, dur: 0.3 + Math.hypot(tgt.x - sx, ty - top.y) / 900, dmg: dd, dtype: 'phys', src, poison: d.poison || null });
        this.play('bow');
      } else if (d.proj === 'shot') {
        t.shooter = 1 - t.shooter;
        t.fireT = 0.18;
        this.damage(tgt, dmg, 'phys', src);
        this.emit({ t: 'shot', x: top.x + (t.shooter ? 8 : -8), y: top.y, x2: tgt.x, y2: ty });
        this.play('musket');
      } else if (d.proj === 'bolt' || d.proj === 'frostbolt') {
        this.proj.push({ k: d.proj, x: top.x, y: top.y, sx: top.x, sy: top.y, tgt, t: 0, dur: 0.45, dmg, dtype: 'magic', src, curse: t.ranks.curse || 0, slow: d.slow || (this.mods.mageSlow ? { f: 0.25, dur: 1 } : null), color: d.poly ? 'poly' : d.proj === 'frostbolt' ? 'frost' : 'blue' });
        this.play('zap');
      } else if (d.proj === 'firepot') {
        this.firePot(t, tgt, dmg, src);
      } else if (d.proj === 'bomb') {
        const flight = 0.9 + Math.hypot(tgt.x - t.x, tgt.y - t.y) / 600;
        const lead = this.predict(tgt, flight);
        this.proj.push({ k: 'bomb', x: top.x, y: top.y, sx: top.x, sy: top.y, gx: lead.x, gy: lead.y, t: 0, dur: flight, dmg, dtype: 'phys', splash: d.splash * this.mods.splash, src, ground: true, big: !!d.big });
        this.play('mortar');
        t.recoil = 0.3;
      } else if (d.proj === 'lightning') {
        this.chainLightning(t, tgt, dmg, range);
      }
    }
  }
  predict(e, t) {
    if (e.blockers.length || e.root > 0 || e.stun > 0) return { x: e.x, y: e.y };
    const p = pointAt(this.paths[e.path], Math.min(this.paths[e.path].length, e.d + e.def.speed * (1 - e.slow) * t));
    return { x: p.x + p.nx * e.lane, y: p.y + p.ny * e.lane };
  }
  chainLightning(t, first, dmg, range) {
    const oc = t.ranks.overcharge || 0;
    const jumps = t.def.chain + oc;
    const mult = 1 + [0, 0.1, 0.2, 0.3][oc];
    const hit = [first];
    const pts = [{ x: t.x, y: t.y + (t.def.top ?? -60) }];
    let cur = first;
    for (let i = 0; i < jumps && cur; i++) {
      pts.push({ x: cur.x, y: cur.fly ? cur.y - 34 : cur.y - 10 });
      this.damage(cur, dmg * mult * (i === 0 ? 1 : 0.8), 'magic', this.srcOf(t));
      let nxt = null, nd = 90;
      for (const e of this.enemies) {
        if (!e.alive || hit.includes(e)) continue;
        const d = Math.hypot(e.x - cur.x, e.y - cur.y);
        if (d < nd) { nd = d; nxt = e; }
      }
      if (nxt) hit.push(nxt);
      cur = nxt;
    }
    this.emit({ t: 'bolt', pts });
    this.play('thunder');
    if (t.ranks.static) {
      const sd = [14, 26, 38][t.ranks.static - 1];
      let any = false;
      for (const e of this.enemies) if (e.alive && Math.hypot(e.x - t.x, e.y - t.y) < 65 * 1.3) { this.damage(e, sd, 'magic'); any = true; }
      if (any) this.emit({ t: 'static', x: t.x, y: t.y });
    }
  }
  updateBeam(t, dt, range) {
    const d = t.def;
    let tgt = t.beam?.tgt;
    if (!tgt || !tgt.alive || !inRange(t.x, t.y - 30, tgt.x, tgt.fly ? tgt.y - 34 : tgt.y, range)) {
      tgt = this.pickTarget(t.x, t.y - 30, range, true);
      t.beam = tgt ? { tgt, heat: 0, extra: [] } : null;
      if (!tgt) return;
    }
    const b = t.beam;
    b.heat = Math.min(1, b.heat + dt / d.beam.ramp / 2.5);
    const dps = (d.beam.start + (d.beam.max - d.beam.start) * b.heat) * this.mods.mageDmg;
    const src = this.srcOf(t);
    this.damage(tgt, dps * dt, 'magic', src);
    // refraction
    const rr = t.ranks.refract || 0;
    b.extra = [];
    if (rr && tgt.alive) {
      const others = this.enemies.filter(e => e.alive && e !== tgt && inRange(t.x, t.y - 30, e.x, e.fly ? e.y - 34 : e.y, range))
        .sort((a, c) => Math.hypot(a.x - tgt.x, a.y - tgt.y) - Math.hypot(c.x - tgt.x, c.y - tgt.y)).slice(0, rr);
      for (const o of others) { this.damage(o, dps * 0.5 * dt, 'magic', src); b.extra.push(o); }
    }
    t.beamSfx = (t.beamSfx || 0) - dt;
    if (t.beamSfx <= 0) { t.beamSfx = 0.5; this.play('beam'); }
  }

  towerAbilities(t, dt, range) {
    const R = t.ranks, T = t.abT;
    if (R.volley) {
      T.volley = (T.volley ?? 3) - dt;
      if (T.volley <= 0) {
        let any = false;
        for (const b of t.soldiers) {
          if (!b.alive || !b.ranged) continue;
          const tg = this.pickTarget(b.x, b.y, b.ranged.range, true);
          if (!tg) continue;
          any = true;
          for (let i = 0; i < [3, 4, 5][R.volley - 1]; i++) {
            const o = this.enemies.filter(e => e.alive && Math.hypot(e.x - tg.x, e.y - tg.y) < 50)[i] || tg;
            this.proj.push({ k: 'arrow', x: b.x, y: b.y - 18, sx: b.x, sy: b.y - 18, tgt: o, t: -i * 0.06, dur: 0.4, dmg: this.roll(b.ranged.dmg), dtype: 'phys', src: this.srcOf(t) });
          }
        }
        T.volley = any ? 8 : 0.5;
        if (any) this.play('volley');
      }
    }
    if (R.snare) {
      T.snare = (T.snare ?? 3) - dt;
      if (T.snare <= 0) {
        const tg = t.rally && this.pickTarget(t.rally.x, t.rally.y, 160, false);
        if (tg) { T.snare = [10, 8, 6][R.snare - 1]; if (!tg.def.boss) tg.root = Math.max(tg.root, 2.5); this.damage(tg, [40, 70, 100][R.snare - 1], 'phys', this.srcOf(t)); this.emit({ t: 'roots', x: tg.x, y: tg.y, r: 16, dur: 2.5 }); this.play('roots'); }
        else T.snare = 0.5;
      }
    }
    if (R.trample) {
      for (const b of t.soldiers) {
        if (!b.alive || !b.engaged) continue;
        b.abT.trample = (b.abT.trample ?? 3) - dt;
        if (b.abT.trample <= 0) {
          b.abT.trample = 6;
          for (const e of this.enemies) if (e.alive && !e.fly && Math.hypot(e.x - b.x, e.y - b.y) < 45) this.damage(e, [30, 50, 70][R.trample - 1], 'phys');
          this.emit({ t: 'stomp', x: b.x, y: b.y, r: 45, small: true });
        }
      }
    }
    if (R.freeze) {
      T.freeze = (T.freeze ?? 3) - dt;
      if (T.freeze <= 0) {
        const foes = this.enemies.filter(e => e.alive && !e.def.boss && inRange(t.x, t.y, e.x, e.y, range)).sort((a, b) => this.remaining(a) - this.remaining(b)).slice(0, [3, 5, 7][R.freeze - 1]);
        if (foes.length) {
          T.freeze = 9;
          for (const e of foes) { e.stun = Math.max(e.stun, [1.5, 2, 2.5][R.freeze - 1]); e.frozen = [1.5, 2, 2.5][R.freeze - 1]; this.emit({ t: 'freeze', x: e.x, y: e.y }); }
          this.play('glare');
        } else T.freeze = 0.5;
      }
    }
    if (R.rewind) {
      T.rewind = (T.rewind ?? 4) - dt;
      if (T.rewind <= 0) {
        const tg = this.enemies.filter(e => e.alive && !e.def.boss && inRange(t.x, t.y, e.x, e.y, range)).sort((a, b) => this.remaining(a) - this.remaining(b))[0];
        if (tg) {
          T.rewind = [12, 10, 8][R.rewind - 1];
          const from = { x: tg.x, y: tg.y };
          this.release(tg);
          for (const b of tg.blockers) if (b.target === tg) b.target = null;
          tg.blockers.length = 0;
          tg.d = Math.max(0, tg.d - [110, 170, 230][R.rewind - 1]);
          this.placeEnemy(tg);
          this.emit({ t: 'blink', x: from.x, y: from.y, x2: tg.x, y2: tg.y, rewind: true });
          this.play('blink');
        } else T.rewind = 0.5;
      }
    }
    if (R.firestorm) {
      T.storm = (T.storm ?? 4) - dt;
      if (T.storm <= 0) {
        const tg = this.pickTarget(t.x, t.y, range, false, 'crowd');
        if (tg) { T.storm = 10; for (let i = 0; i < [3, 5, 7][R.firestorm - 1]; i++) this.firePot(t, tg, this.roll(t.def.dmg), this.srcOf(t), 30 + i * 8); }
        else T.storm = 0.5;
      }
    }
    if (R.thornroot) {
      T.root = (T.root ?? 3) - dt;
      if (T.root <= 0) {
        const n = [2, 4, 6][R.thornroot - 1], dmg = [30, 60, 90][R.thornroot - 1];
        const foes = this.enemies.filter(e => e.alive && !e.fly && inRange(t.x, t.y, e.x, e.y, range)).sort((a, b) => this.remaining(a) - this.remaining(b)).slice(0, n);
        if (foes.length) {
          T.root = 10;
          for (const e of foes) { if (!e.def.boss) e.root = Math.max(e.root, 2); this.damage(e, dmg, 'phys', this.srcOf(t)); this.emit({ t: 'roots', x: e.x, y: e.y, r: 16, dur: 2 }); }
          this.play('roots');
        } else T.root = 0.5;
      }
    }
    if (R.deadeye) {
      T.dead = (T.dead ?? 4) - dt;
      if (T.dead <= 0) {
        const tgt = this.pickTarget(t.x, t.y - 30, range, true, 'strong');
        if (tgt && tgt.maxHp >= 150) {
          T.dead = [14, 12, 10][R.deadeye - 1];
          this.damage(tgt, [260, 420, 580][R.deadeye - 1], 'true', this.srcOf(t));
          this.emit({ t: 'shot', x: t.x, y: t.y - 46, x2: tgt.x, y2: tgt.fly ? tgt.y - 34 : tgt.y, big: true });
          this.emit({ t: 'crit', x: tgt.x, y: tgt.y - 30 });
          this.play('deadeye');
        } else T.dead = 0.5;
      }
    }
    if (R.grapeshot) {
      T.grape = (T.grape ?? 3) - dt;
      if (T.grape <= 0) {
        const tgt = this.pickTarget(t.x, t.y, range * 0.55, false);
        if (tgt) {
          T.grape = 9;
          const n = [6, 8, 10][R.grapeshot - 1];
          const ang = Math.atan2(tgt.y - t.y, tgt.x - t.x);
          const near = this.enemies.filter(e => e.alive && !e.fly && Math.hypot(e.x - t.x, e.y - t.y) < range * 0.6 && Math.abs(angDiff(Math.atan2(e.y - t.y, e.x - t.x), ang)) < 0.5);
          for (let i = 0; i < n; i++) { const e = near[i % Math.max(1, near.length)]; if (e) this.damage(e, this.rand(20, 35), 'phys', this.srcOf(t)); }
          this.emit({ t: 'grape', x: t.x, y: t.y - 40, ang, r: range * 0.6 });
          this.play('grape');
        } else T.grape = 0.5;
      }
    }
    if (R.glare) {
      T.glare = (T.glare ?? 3) - dt;
      if (T.glare <= 0) {
        const foes = this.enemies.filter(e => e.alive && inRange(t.x, t.y, e.x, e.y, range));
        if (foes.length >= 2) {
          T.glare = 10;
          const dur = [2, 3, 4][R.glare - 1];
          for (const e of foes) { e.slow = Math.max(e.slow, 0.45); e.slowT = Math.max(e.slowT, dur); }
          this.emit({ t: 'glare', x: t.x, y: t.y - 60, r: range });
          this.play('glare');
        } else T.glare = 0.5;
      }
    }
    if (R.cluster) {
      T.cluster = (T.cluster ?? 4) - dt;
      if (T.cluster <= 0) {
        const tgt = this.pickTarget(t.x, t.y, range, false, 'crowd');
        if (tgt) {
          T.cluster = 10;
          const n = [4, 6, 8][R.cluster - 1];
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2, rr = 30 + this.R() * 30;
            this.proj.push({ k: 'bomb', x: t.x, y: t.y - 40, sx: t.x, sy: t.y - 40, gx: tgt.x + Math.cos(a) * rr, gy: tgt.y + Math.sin(a) * rr * 0.7, t: 0, dur: 1.2 + i * 0.06, dmg: this.rand(30, 50), dtype: 'phys', splash: 40, src: this.srcOf(t), ground: true, small: true });
          }
          this.play('mortar');
        } else T.cluster = 0.5;
      }
    }
    if (R.rockets) {
      T.rocket = (T.rocket ?? 2) - dt;
      if (T.rocket <= 0) {
        const tgt = this.pickTarget(t.x, t.y, range * 1.1, true, 'strong');
        if (tgt) {
          T.rocket = 9;
          for (let i = 0; i < R.rockets; i++) {
            const tg = i === 0 ? tgt : (this.pickTarget(t.x, t.y, range * 1.1, true, 'first', tgt) || tgt);
            this.proj.push({ k: 'rocket', x: t.x + (i - 1) * 8, y: t.y - 50, sx: t.x, sy: t.y - 50, tgt: tg, t: 0, dur: 1.1 + i * 0.15, dmg: this.rand(120, 200), dtype: 'phys', splash: 35, src: this.srcOf(t), wob: this.R() * 6 });
          }
          this.play('rocket');
        } else T.rocket = 0.5;
      }
    }
  }

  // ------------------------------------------------------------------ projectiles
  updateProj(dt) {
    for (const p of this.proj) {
      p.t += dt;
      const f = Math.min(1, p.t / p.dur);
      if (p.ground) {
        // lobbed at a point
        p.x = p.sx + (p.gx - p.sx) * f;
        p.y = p.sy + (p.gy - p.sy) * f - Math.sin(f * Math.PI) * (p.k === 'rain' ? 0 : 90);
        if (p.k === 'rain') { p.y = p.gy - (1 - f) * 260; p.x = p.gx - (1 - f) * 40; }
        if (f >= 1) { p.done = true; this.explode(p); }
        continue;
      }
      const tg = p.tgt;
      if (tg && (tg.alive !== false)) { p.lx = tg.x; p.ly = tg.fly ? tg.y - 34 : tg.y - 12 * (tg.size || 1); }
      if (p.lx === undefined) { p.done = true; continue; }
      const arc = p.k === 'arrow' || p.k === 'axe' ? 40 : p.k === 'nib' ? 20 : 0;
      const px = p.x, py = p.y;
      p.x = p.sx + (p.lx - p.sx) * f;
      p.y = p.sy + (p.ly - p.sy) * f - Math.sin(f * Math.PI) * arc;
      if (p.k === 'rocket') { p.x += Math.sin(p.t * 9 + p.wob) * 10 * (1 - f); p.y -= Math.sin(f * Math.PI) * 70; }
      p.ang = Math.atan2(p.y - py, p.x - px);
      if (f >= 1) {
        p.done = true;
        if (p.enemyShot) { if (tg.alive) this.hurtBlocker(tg, p.dmg); continue; }
        if (tg.alive) {
          if (p.splash) { this.explode({ ...p, gx: tg.x, gy: tg.y }); continue; }
          this.damage(tg, p.dmg, p.dtype, p.src);
          if (p.poison && tg.alive) {
            const st = tg.poisonT > 0 ? (tg.poisonStacks || 1) : 0;
            tg.poisonStacks = Math.min(p.poison.stacks, st + 1);
            tg.poison = p.poison.dps * tg.poisonStacks;
            tg.poisonT = p.poison.dur;
            tg.poisonSrc = p.src?.tower || null;
          }
          if (p.curse && tg.alive) { tg.shred = Math.max(tg.shred, [0.2, 0.35, 0.5][p.curse - 1]); tg.shredT = 5; }
          if (p.slow && tg.alive && !tg.def.boss) { tg.slow = Math.max(tg.slow, p.slow.f); tg.slowT = Math.max(tg.slowT, p.slow.dur); }
          else if (p.slow && tg.alive) { tg.slow = Math.max(tg.slow, p.slow.f * 0.5); tg.slowT = Math.max(tg.slowT, p.slow.dur); }
          this.emit({ t: 'hit', k: p.k, x: p.lx, y: p.ly, color: p.color });
        } else if (p.k === 'arrow') this.emit({ t: 'stuck', x: p.lx, y: p.ly + 12, ang: p.ang });
      }
    }
    this.proj = this.proj.filter(p => !p.done);
  }
  explode(p) {
    if (p.burn) {
      this.zones.push({ x: p.gx, y: p.gy, r: p.burn.r, t: p.burn.dur, dps: p.burn.dps, kind: 'fire', shred: p.shred || 0 });
      this.emit({ t: 'burnzone', x: p.gx, y: p.gy, r: p.burn.r, dur: p.burn.dur });
    }
    const r = p.splash || 30;
    for (const e of this.enemies) {
      if (!e.alive || e.fly && p.k !== 'rocket') continue;
      const d = Math.hypot(e.x - p.gx, (e.y - p.gy) / 0.8);
      if (d < r) {
        this.damage(e, p.dmg * (d < r * 0.4 ? 1 : 0.6), p.dtype, p.src);
        if (p.k === 'bomb' && this.mods.artStun && e.alive && e.size <= 1.15) e.stun = Math.max(e.stun, 0.5);
      }
    }
    if (p.k === 'rocket' && p.tgt?.alive && p.tgt.fly) this.damage(p.tgt, p.dmg, p.dtype, p.src);
    if (p.meteor && this.mods.meteorBurn) { this.zones.push({ x: p.gx, y: p.gy, r: 40, t: 4, dps: 18 }); this.emit({ t: 'burnzone', x: p.gx, y: p.gy, r: 40, dur: 4 }); }
    this.emit({ t: p.k === 'rain' ? 'rainhit' : 'boom', x: p.gx, y: p.gy, r, big: p.big, small: p.small || p.k === 'rain', meteor: !!p.meteor });
    this.play(p.k === 'rain' ? 'thud' : p.small ? 'pop' : 'boom');
  }

  // ------------------------------------------------------------------ spells
  // THE SPELLS ARE DRAWN. Both take a stroke - where the pointer went down
  // and where it came up - rather than a point to click. (They replaced
  // Kingdom Rush's meteor shower and reinforcements on 2026-10-07.)

  /** The Wash: a sweep of water along a stroke. Shoves foes back down the
   *  road, slows them, and stains them ultramarine - so it mixes with ochre
   *  archers into an overgrowth, or with vermilion artillery into a hex. */
  castWash(x1, y1, x2, y2, second = false) {
    const s = this.spells.wash;
    if (!second && s.cd > 0) return false;
    if (!second) s.cd = s.max;
    const m = this.mods;
    const L = Math.hypot(x2 - x1, y2 - y1);
    if (L > 220) { const k = 220 / L; x2 = x1 + (x2 - x1) * k; y2 = y1 + (y2 - y1) * k; }
    const wide = 34 * m.washWide;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const ey = e.fly ? e.y - 34 : e.y;
      if (segDist(e.x, ey, x1, y1, x2, y2) > wide) continue;
      if (!e.def.boss && !e.fly) {
        this.release(e);
        for (const o of e.blockers) if (o.target === e) o.target = null;
        e.blockers.length = 0;
        e.d = Math.max(0, e.d - 60 * m.washPush);
        this.placeEnemy(e);
        e.stun = Math.max(e.stun, 0.35);
      }
      e.slow = Math.max(e.slow, 0.4); e.slowT = Math.max(e.slowT, 3);
      this.damage(e, this.rand(25, 45) * m.washDmg * (1 + this.level.id * 0.06), 'magic', { pigment: 'ultra', lv: 2 });
    }
    this.emit({ t: 'wash', x1, y1, x2, y2, w: wide });
    this.play('wash');
    if (m.washTwin && !second) this.pendingWash = { t: 0.9, x1, y1, x2, y2 };
    return true;
  }

  /** Ink Wall: a stroke of ink across the road. Ground foes cannot pass it
   *  until they have hacked through it. Flyers go over. */
  castWall(x1, y1, x2, y2) {
    const s = this.spells.wall;
    if (s.cd > 0) return false;
    const m = this.mods;
    let L = Math.hypot(x2 - x1, y2 - y1);
    const max = 110 * m.wallLen;
    if (L < 24) {
      // a click, not a stroke: lay one across the nearest road
      let best = null;
      for (const pth of this.paths) { if (pth.air) continue; const n = nearestOnPath(pth, x1, y1); if (!best || n.dist < best.dist) best = { ...n, pth }; }
      if (!best || best.dist > 60) return false;
      const q = pointAt(best.pth, best.d);
      const nx = q.nx ?? 0, ny = q.ny ?? 1;
      x1 = best.x - nx * 34; y1 = best.y - ny * 34; x2 = best.x + nx * 34; y2 = best.y + ny * 34;
      L = 68;
    }
    if (L > max) { const k = max / L; x2 = x1 + (x2 - x1) * k; y2 = y1 + (y2 - y1) * k; }
    s.cd = s.max;
    const hp = (240 + this.level.id * 45) * m.wallHp;
    this.walls.push({ id: UID++, x1, y1, x2, y2, hp, maxHp: hp, t: 14 * m.wallLife, life: 14 * m.wallLife, thorns: !!m.wallThorns, hitT: 0 });
    this.emit({ t: 'wall', x1, y1, x2, y2 });
    this.play('build');
    return true;
  }

  // ------------------------------------------------------------------ main tick
  update(dt) {
    if (this.state !== 'play') return;
    this.time += dt;
    for (const s of Object.values(this.spells)) if (s.cd > 0) s.cd = Math.max(0, s.cd - dt);
    // spawning
    for (const g of this.spawning) {
      g.t -= dt;
      while (g.left > 0 && g.t <= 0) {
        this.spawnEnemy(g.kind, g.path);
        g.left--;
        g.t += g.gap;
      }
    }
    if (this.spawning.length && this.spawning.every(g => g.left <= 0)) {
      this.spawning = [];
      if (this.wave < this.totalWaves()) this.nextIn = WAVE_GAP;
    }
    if (this.nextIn > 0) {
      this.nextIn -= dt;
      if (this.nextIn <= 0) { this.nextIn = 0; this.startWave(); }
    }
    if (this.pendingWash) {
      this.pendingWash.t -= dt;
      if (this.pendingWash.t <= 0) { const w = this.pendingWash; this.pendingWash = null; this.castWash(w.x1, w.y1, w.x2, w.y2, true); }
    }
    for (const w of this.walls) { w.t -= dt; if (w.hitT > 0) w.hitT -= dt; if (w.t <= 0 && w.hp > 0) { w.hp = 0; this.emit({ t: 'wallfade', x: (w.x1 + w.x2) / 2, y: (w.y1 + w.y2) / 2 }); } }
    this.walls = this.walls.filter(w => w.hp > 0);
    this.updateEnemies(dt);
    this.updateBlockers(dt);
    this.updateTowers(dt);
    this.updateProj(dt);
    // burn puddles
    for (const z of this.zones) {
      z.t -= dt;
      if (z.shred) for (const e of this.enemies) if (e.alive && !e.fly && Math.hypot(e.x - z.x, (e.y - z.y) / 0.8) < z.r) { e.shred = Math.max(e.shred, z.shred); e.shredT = Math.max(e.shredT, 0.5); }
      for (const e of this.enemies) if (e.alive && !e.fly && Math.hypot(e.x - z.x, (e.y - z.y) / 0.8) < z.r) { e.burn = z.dps; e.burnT = 0.4; }
    }
    this.zones = this.zones.filter(z => z.t > 0);
    // win?
    if (this.state === 'play' && this.wave >= this.totalWaves() && !this.spawning.length && this.enemies.length === 0) {
      this.state = 'won';
      this.play('win');
    }
  }

  stars() {
    if (this.state !== 'won') return 0;
    return this.lives >= 18 ? 3 : this.lives >= 6 ? 2 : 1;
  }
}

function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export { TOWERS, ABILITIES, BUILD, towerSpent, segDist };
