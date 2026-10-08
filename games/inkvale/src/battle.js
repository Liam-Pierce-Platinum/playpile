// battle.js - the battle screen: draws the Game, runs the HUD and all the
// clicking (build rings, upgrades, spells, hero orders, wave calls).

import { Game, TOWERS, ABILITIES, BUILD, PIGMENT_OF, PIGMENTS, MIXES } from './game.js';
import { pack, unpack, easeUnits } from './coop.js';
import { PATHS } from './data/towers.js';
import { ENEMIES } from './data/enemies.js';
import { HEROES, heroLevel, XP_LEVELS } from './data/heroes.js';
import { paintMap } from './mapart.js';
import { unitSheet, towerSprite, towerTop, icon } from './sprites.js';
import { FX, splatTex, burstTex, puffTex, scorchTex } from './fx.js';
import { SHADOW } from './mapart.js';
import { makeCanvas } from './paint.js';
import { text, para, card, button, hit, hitCircle, drawGlyph, cooldownWipe, hpBar, bannerText, measure, wrap, FONT, INKC } from './ui.js';
import { inRange } from './geo.js';
import { sfx, setMood } from './audio.js';
import { writeSave } from './save.js';
import { heroOwned } from './data/heroes.js';

// What a battle pays in coins, win or lose: the currency the Hall of
// Warriors takes. A loss pays a little for every wave you held.
export function battleCoins(L, won, stars, wave, diff) {
  const base = won ? 20 + L.id * 8 + stars * 12 : 5 + wave * 3;
  return Math.round(base * ({ casual: 0.75, normal: 1, veteran: 1.5 }[diff] ?? 1));
}

const STEP = 1 / 60;
const TOPS = { archer1: 'bowman', marks2: 'bowman', marks3: 'bowman', marks4: 'musketeer', venom2: 'ranger', venom3: 'ranger', venom4: 'ranger' };
const LINE_COL = { archer: '#6a8a4a', barracks: '#a84a3a', mage: '#5a4a96', artillery: '#8a6a3a', beast: '#7a5a8a' };

export class Battle {
  constructor(app, levelId, o = {}) {
    this.app = app;
    this.save = app.save;
    this.L = app.levels.find(l => l.id === levelId);
    // CO-OP: { net, role: 'host'|'guest', me: 0|1, heroes: [[id, xp], [id, xp]], seed, diff }
    this.coop = o.coop || null;
    this.me = this.coop ? this.coop.me : 0;
    this.reset();
    this.state = o.skipBrief || this.coop?.role === 'guest' ? 'play' : 'brief';
    if (this.coop) this.wireNet();
  }
  get guest() { return this.coop?.role === 'guest'; }
  get host() { return this.coop?.role === 'host'; }
  myHero() { return this.game.heroes[this.me] || null; }

  // ------------------------------------------------------------------ co-op wiring
  wireNet() {
    const N = this.coop.net;
    this.fxOut = []; this.sfxOut = []; this.sendT = 0; this.inbox = null;
    N.on('cmd', c => { if (this.host) { this.exec(c, 1); } });
    N.on('snap', snap => { if (this.guest) this.inbox = snap; });
    N.on('leave', () => {
      this.partnerGone = true;
      this.banner(this.guest ? 'The host has left' : 'Your partner has left', 3, { tint: '#5a1e22' });
      // the partner's towers become yours, so nothing on the field is orphaned
      if (this.host) for (const t of this.game.towers) t.owner = 0;
    });
  }
  /** every change to the battle goes through here: run it, or ask the host to */
  cmd(c) {
    if (this.guest) { if (!this.partnerGone) this.coop.net.send({ cmd: c }); return 'sent'; }
    return this.exec(c, this.me);
  }
  exec(c, who) {
    const G = this.game;
    const tw = id => G.towers.find(t => t.id === id);
    const out = G.as(who, () => {
      switch (c.k) {
        case 'build': return G.build(c.slot, c.id);
        case 'up': { const t = tw(c.t); return t && G.upgrade(t, c.id); }
        case 'ab': { const t = tw(c.t); return t && G.buyAbility(t, c.ab); }
        case 'sell': { const t = tw(c.t); return t && G.sell(t); }
        case 'rally': { const t = tw(c.t); return t && G.mine(t) && G.setRally(t, c.x, c.y); }
        case 'hero': return G.moveHero(c.x, c.y, who);
        case 'wash': return G.castWash(c.x1, c.y1, c.x2, c.y2);
        case 'wall': return G.castWall(c.x1, c.y1, c.x2, c.y2);
        case 'wave': return G.callWave();
        case 'pause': if (this.state === 'play') this.state = 'paused'; return true;
        case 'resume': if (this.state === 'paused') this.state = 'play'; return true;
      }
      return false;
    });
    this.drain();
    return out;
  }

  reset() {
    const s = this.save;
    const hero = heroOwned(s, s.hero) ? s.hero : 'wren';
    const C = this.coop;
    this.game = C
      ? new Game(this.L, { coop: true, difficulty: C.diff, upgrades: s.upgrades, hero: C.heroes[0][0], heroXp: C.heroes[0][1], hero2: C.heroes[1][0], heroXp2: C.heroes[1][1], seed: C.seed })
      : new Game(this.L, { difficulty: s.difficulty, upgrades: s.upgrades, hero, heroXp: s.heroXp[hero] || 0, seed: (Math.random() * 1e6) | 0 });
    // the guest's copy reads its own purse; it never runs a command itself
    if (this.guest) this.game.actor = this.me;
    for (const k of s.seen) this.game.seen.add(k);
    this.stroke = null;
    this.fx = new FX();
    this.sel = null; this.mode = null; this.pending = null;
    this.banners = []; this.cards = [];
    this.acc = 0; this.time = 0;
    this.speed = s.speed || 1;
    this.mouse = { x: -100, y: -100 };
    this.endT = 0;
    this.result = null;
    if (!this.mapCanvas || this.mapScale !== this.app.mapScale) {
      this.mapScale = this.app.mapScale;
      this.mapCanvas = paintMap(this.L, this.game.paths, this.game.slots, this.mapScale);
    }
    this.newKinds = [...new Set(this.L.waves.flat().map(g => g.kind))].filter(k => !s.seen.includes(k));
    setMood(this.L.boss ? (this.L.act === 3 ? 'dark' : 'battle') : this.L.act === 3 ? 'dark' : 'battle');
  }

  // ================================================================== update
  update(dt) {
    this.time += dt;
    this.frameDt = dt;
    for (const b of this.banners) b.t += dt;
    this.banners = this.banners.filter(b => b.t < b.life);
    // new-foe notes: two at a time, the rest wait their turn
    this.cards.slice(0, 2).forEach(c => c.t += dt);
    this.cards = this.cards.filter(c => c.t < c.life);
    if (this.guest) { this.guestUpdate(dt); return; }
    if (this.host) {
      this.sendT -= dt;
      if (this.sendT <= 0 && this.coop.net.live) {
        this.sendT = 1 / 12;
        const snap = pack(this.game, this.fxOut, this.sfxOut);
        snap.bs = this.state; snap.sp2 = this.speed;
        this.coop.net.send({ s: snap });
        this.fxOut = []; this.sfxOut = [];
      }
    }
    if (this.state === 'play') {
      this.acc += Math.min(0.1, dt) * this.speed;
      let n = 0;
      while (this.acc >= STEP && n < 12) { this.game.update(STEP); this.acc -= STEP; n++; this.drain(); }
      this.fx.update(dt * this.speed);
      for (const t of this.game.towers) if (t.recoil > 0) t.recoil -= dt * this.speed;
      if (this.game.state !== 'play') this.finish();
      // keep selection valid
      if (this.sel?.kind === 'enemy' && !this.sel.ref.alive) this.sel = null;
      if (this.sel?.kind === 'tower' && !this.game.towers.includes(this.sel.ref)) this.sel = null;
    } else if (this.state === 'won' || this.state === 'lost') {
      this.endT += dt;
      this.fx.update(dt);
    }
  }

  // the guest: the host's battle arrives in packets; between them, ease
  guestUpdate(dt) {
    const G = this.game;
    if (this.inbox) {
      const snap = this.inbox; this.inbox = null;
      const { fx, sfx: sounds } = unpack(G, snap);
      for (const f of fx) this.onFx(f);
      for (const k of sounds) sfx(k);
      if (snap.bs === 'paused' || snap.bs === 'play') { if (this.state === 'play' || this.state === 'paused') this.state = snap.bs; }
      this.speed = snap.sp2 || 1;
      if (this.sel?.kind === 'tower') { const t = G.towers.find(x => x.id === this.sel.ref.id); this.sel = t ? { kind: 'tower', ref: t } : null; }
      if (this.sel?.kind === 'enemy') { const e = G.enemies.find(x => x.id === this.sel.ref.id); this.sel = e ? { kind: 'enemy', ref: e } : null; }
      if (this.sel?.kind === 'hero') { const h = this.myHero(); this.sel = h ? { kind: 'hero', ref: h.b } : null; }
    }
    easeUnits(G, dt);
    this.fx.update(dt * this.speed);
    for (const t of G.towers) if (t.recoil > 0) t.recoil -= dt * this.speed;
    if (G.state !== 'play' && !this.result) this.finish();
    if (this.state === 'won' || this.state === 'lost') { this.endT += dt; }
  }

  // turn game events into effects and sounds
  drain() {
    const G = this.game;
    for (const s of G.sfx) sfx(s);
    if (this.host) this.sfxOut.push(...G.sfx);
    G.sfx.length = 0;
    for (const f of G.fx) this.onFx(f);
    if (this.host) this.fxOut.push(...G.fx);
    G.fx.length = 0;
  }
  onFx(f) {
    const X = this.fx, R = Math.random;
    switch (f.t) {
      case 'die': {
        const def = ENEMIES[f.kind];
        if (!def.boss) X.add({ k: 'corpse', spr: unitSheet(f.kind).walk[(f.frame || 0) % 12], x: f.x, y: f.fly ? f.y : f.y, face: f.face || 1, kk: UNIT_K, fly: f.fly, life: 0.75, layer: 'top' });
        const col = def.boss ? '#1e1828' : def.col;
        X.decal({ tex: splatTex(col, (R() * 4) | 0), x: f.x, y: f.fly ? f.y + 34 : f.y, life: 14, s: Math.max(0.7, f.size), alpha: 0.85 });
        const n = Math.round(6 + f.size * 4);
        for (let i = 0; i < n; i++) {
          const a = -Math.PI / 2 + (R() - 0.5) * 2.6, v = 40 + R() * 90 * f.size;
          X.add({ k: 'drop', x: f.x, y: f.y - 10 * f.size, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 320, drag: 1.5, r: 1 + R() * 2 * f.size, col: R() < 0.6 ? col : def.accent, life: 0.5 + R() * 0.3 });
        }
        X.add({ k: 'tex', tex: burstTex('ink', (R() * 3) | 0), x: f.x, y: f.y - 8 * f.size, s0: 0.2 * f.size, s1: 0.55 * f.size, life: 0.45, a: 0.8 });
        if (def.boss) { X.shake = 10; for (let i = 0; i < 4; i++) X.add({ k: 'tex', tex: burstTex('ink', i), x: f.x + (R() - 0.5) * 60, y: f.y - R() * 60, s0: 0.5, s1: 1.6, life: 1.2 + i * 0.2 }); }
        break;
      }
      case 'boom': {
        const s = f.big ? 1.5 : f.small ? 0.6 : 1;
        X.add({ k: 'tex', tex: burstTex(f.meteor ? 'ink' : 'fire', (R() * 3) | 0), x: f.x, y: f.y - 6, s0: 0.3 * s, s1: (f.r / 32) * 1.1, life: 0.55, a: 0.95 });
        X.add({ k: 'tex', tex: puffTex('#b8b0a4', (R() * 3) | 0), x: f.x, y: f.y - 14 * s, vx: 0, vy: -18, s0: 0.6 * s, s1: 1.6 * s, life: 1.1, a: 0.6, fade: 1.5 });
        X.decal({ tex: scorchTex((R() * 3) | 0), x: f.x, y: f.y, life: 8, s: f.r / 28, alpha: 0.6 });
        for (let i = 0; i < 10 * s; i++) { const a = R() * Math.PI * 2, v = 60 + R() * 120; X.add({ k: 'drop', x: f.x, y: f.y - 4, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 - 60, g: 260, r: 0.8 + R() * 1.3, col: R() < 0.5 ? '#5a4a3a' : '#8a7a62', life: 0.6 }); }
        if (f.big) X.shake = Math.max(X.shake, f.meteor ? 6 : 4);
        break;
      }
      case 'rainhit': X.add({ k: 'tex', tex: puffTex('#b8a888', (R() * 3) | 0), x: f.x, y: f.y - 3, s0: 0.2, s1: 0.6, life: 0.4, a: 0.7 }); break;
      case 'hit': {
        const kind = f.k === 'bolt' || f.k === 'frostbolt' ? (f.color === 'poly' ? 'green' : f.color === 'frost' ? 'frost' : 'magic') : null;
        if (kind) {
          X.add({ k: 'tex', tex: burstTex(f.color === 'poly' ? ['fire', 'magic', 'green'][(R() * 3) | 0] : 'magic', (R() * 3) | 0), x: f.x, y: f.y, s0: 0.15, s1: 0.45, life: 0.35 });
        } else for (let i = 0; i < 3; i++) { const a = R() * Math.PI * 2; X.add({ k: 'spark', x: f.x, y: f.y, vx: Math.cos(a) * 80, vy: Math.sin(a) * 80, col: '#fff2c0', life: 0.15 }); }
        break;
      }
      case 'stuck': X.decal({ tex: arrowTex(), x: f.x, y: f.y, life: 3, s: 1 }); break;
      case 'shot': {
        X.add({ k: 'line', x: f.x, y: f.y, x2: f.x2, y2: f.y2, col: f.big ? '#fff6c0' : 'rgba(255,240,200,0.9)', w: f.big ? 2.5 : 1.2, life: 0.12 });
        X.add({ k: 'tex', tex: puffTex('#d8d0c4', 1), x: f.x + (f.x2 > f.x ? 8 : -8), y: f.y, vy: -10, vx: 0, s0: 0.3, s1: 0.9, life: 0.8, a: 0.7 });
        break;
      }
      case 'bolt': X.add({ k: 'bolt', pts: f.pts, life: 0.22 }); X.add({ k: 'tex', tex: burstTex('magic', 1), x: f.pts[1].x, y: f.pts[1].y, s0: 0.2, s1: 0.5, life: 0.3 }); break;
      case 'static': X.add({ k: 'ring', x: f.x, y: f.y, r0: 20, r1: 85, col: '#8ac0ff', w: 2, life: 0.35 }); break;
      case 'grape': for (let i = 0; i < 10; i++) { const a = f.ang + (R() - 0.5) * 0.9; X.add({ k: 'spark', x: f.x, y: f.y, vx: Math.cos(a) * 520, vy: Math.sin(a) * 520, col: '#3a3640', w: 1.6, life: f.r / 520 }); } X.add({ k: 'tex', tex: puffTex('#d8d0c4', 2), x: f.x + Math.cos(f.ang) * 20, y: f.y + Math.sin(f.ang) * 20, vx: 0, vy: -6, s0: 0.5, s1: 1.4, life: 1, a: 0.7 }); break;
      case 'glare': X.add({ k: 'ring', x: f.x, y: f.y + 60, r0: 10, r1: f.r, col: '#fff0a0', w: 4, life: 0.6, a: 0.8 }); X.add({ k: 'tex', tex: burstTex('holy', 0), x: f.x, y: f.y, s0: 0.3, s1: 1.2, life: 0.5 }); break;
      case 'heal': for (let i = 0; i < 6; i++) X.add({ k: 'text', text: '+', x: f.x + (R() - 0.5) * f.r, y: f.y - 10 - R() * 20, col: '#5aa040', size: 14, life: 0.8 }); break;
      case 'holy': X.add({ k: 'tex', tex: burstTex('holy', (R() * 3) | 0), x: f.x, y: f.y - 8, s0: 0.3, s1: 1.1, life: 0.5 }); X.add({ k: 'line', x: f.x, y: f.y - 120, x2: f.x, y2: f.y, col: 'rgba(255,240,180,0.8)', w: 5, life: 0.25 }); break;
      case 'whirl': X.add({ k: 'ring', x: f.x, y: f.y - 6, r0: 10, r1: 45, col: '#c8d0d8', w: 2.5, life: 0.35 }); break;
      case 'bash': X.add({ k: 'tex', tex: burstTex('holy', 2), x: f.x, y: f.y - 14, s0: 0.2, s1: 0.7, life: 0.35 }); X.shake = Math.max(X.shake, 2); break;
      case 'roots': X.add({ k: 'roots', x: f.x, y: f.y, r: f.r, n: f.r > 30 ? 14 : 5, seed: R() * 6, life: f.dur }); break;
      case 'silence': X.add({ k: 'line', x: f.x, y: f.y - 20, x2: f.tx, y2: f.ty - 40, col: 'rgba(224,90,138,0.7)', w: 2, life: 0.5 }); X.add({ k: 'tex', tex: burstTex('ink', 2), x: f.tx, y: f.ty - 46, s0: 0.3, s1: 0.8, life: 0.6 }); break;
      case 'douse': for (let i = 0; i < 12; i++) X.add({ k: 'drop', x: f.x + (f.tx - f.x) * (i / 12), y: f.y + (f.ty - 40 - f.y) * (i / 12), vx: (R() - 0.5) * 30, vy: 10 + R() * 20, r: 1.5, col: '#c9b7e8', life: 0.8 + i * 0.03 }); break;
      case 'stomp': X.add({ k: 'ring', x: f.x, y: f.y, r0: 10, r1: f.r, col: '#6a5a40', w: 4, life: 0.5 }); X.shake = Math.max(X.shake, 7); for (let i = 0; i < 4; i++) X.add({ k: 'tex', tex: puffTex('#b0a080', i % 3), x: f.x + (R() - 0.5) * f.r, y: f.y, s0: 0.4, s1: 1.2, life: 0.8, a: 0.7 }); break;
      case 'blink': for (const [x, y] of [[f.x, f.y], [f.x2, f.y2]]) X.add({ k: 'tex', tex: burstTex('ink', 0), x, y: y - 20, s0: 0.5, s1: 1.8, life: 0.7 }); break;
      case 'summon': X.add({ k: 'tex', tex: burstTex('ink', 1), x: f.x, y: f.y - 30, s0: 0.4, s1: 1.4, life: 0.6 }); break;
      case 'phase': X.shake = 10; this.banner(['', 'The Hollow King is wounded!', 'The Hollow King rages!'][f.phase], 2.2, { tint: '#5a1e22' }); break;
      case 'spawnpuff': X.add({ k: 'tex', tex: puffTex('#8a7060', 1), x: f.x, y: f.y - 8, s0: 0.3, s1: 0.8, life: 0.5, a: 0.6 }); break;
      case 'levelup': X.add({ k: 'text', text: `Level ${f.level}!`, x: f.x, y: f.y - 46, col: '#b8862a', size: 18, life: 1.6 }); X.add({ k: 'tex', tex: burstTex('holy', 1), x: f.x, y: f.y - 16, s0: 0.3, s1: 1, life: 0.6 }); break;
      case 'heroback': X.add({ k: 'tex', tex: burstTex('holy', 0), x: f.x, y: f.y - 16, s0: 0.3, s1: 0.9, life: 0.5 }); break;
      case 'fall': X.add({ k: 'corpse', spr: unitSheet(f.look).walk[0], x: f.x, y: f.y, face: f.face || 1, kk: UNIT_K, life: 0.7, layer: 'top' }); X.add({ k: 'tex', tex: puffTex('#c8c0b0', 2), x: f.x, y: f.y - 6, s0: 0.3, s1: 0.8, life: 0.5, a: 0.6 }); break;
      case 'poof': X.add({ k: 'tex', tex: puffTex('#e0d8c8', (R() * 3) | 0), x: f.x, y: f.y - 8, s0: 0.3, s1: 1, life: 0.5, a: 0.8 }); break;
      case 'build': for (let i = 0; i < 5; i++) X.add({ k: 'tex', tex: puffTex('#c8b898', i % 3), x: f.x + (R() - 0.5) * 50, y: f.y - R() * 10, vx: (R() - 0.5) * 20, vy: -8, s0: 0.4, s1: 1.1, life: 0.8, a: 0.7 }); break;
      case 'sell': X.add({ k: 'text', text: 'sold', x: f.x, y: f.y - 30, col: '#b8862a', size: 16, life: 1 }); for (let i = 0; i < 5; i++) X.add({ k: 'tex', tex: puffTex('#c8b898', i % 3), x: f.x + (R() - 0.5) * 40, y: f.y - R() * 10, s0: 0.4, s1: 1, life: 0.7, a: 0.7 }); break;
      case 'sparkle': for (let i = 0; i < 8; i++) { const a = R() * Math.PI * 2; X.add({ k: 'spark', x: f.x, y: f.y, vx: Math.cos(a) * 70, vy: Math.sin(a) * 70, col: '#f0c040', life: 0.4 }); } break;
      case 'burnzone': X.decal({ tex: burstTex('fire', 2), x: f.x, y: f.y, life: f.dur, s: f.r / 30, alpha: 0.55 }); break;
      case 'charge': X.add({ k: 'ring', x: f.x, y: f.y, r0: 6, r1: 34, col: '#e8d8b0', w: 3, life: 0.3 }); X.shake = Math.max(X.shake, 1.5); break;
      case 'breath': {
        for (let i = 0; i < 9; i++) {
          const t = i / 8, x = f.x + (f.x2 - f.x) * t, y = f.y + (f.y2 - f.y) * t;
          X.add({ k: 'tex', tex: burstTex('fire', i % 3), x: x + (R() - 0.5) * 8 * t, y: y + (R() - 0.5) * 8 * t, s0: 0.12 + t * 0.2, s1: 0.25 + t * f.r / 40, life: 0.35 + t * 0.15, a: 0.9 });
        }
        break;
      }
      case 'petrify': X.add({ k: 'tex', tex: puffTex('#a8a29a', 1), x: f.x, y: f.y - 12, s0: 0.4, s1: 1.2, life: 0.6, a: 0.8 }); break;
      case 'freeze': X.add({ k: 'tex', tex: burstTex('frost', (R() * 3) | 0), x: f.x, y: f.y - 10, s0: 0.3, s1: 0.9, life: 0.5 }); break;
      case 'plague': X.add({ k: 'tex', tex: puffTex('#8ac060', 0), x: f.x, y: f.y - 6, s0: 0.5, s1: 2.2, life: 2.6, a: 0.55, fade: 0.7 }); break;
      case 'leak': X.shake = Math.max(X.shake, 3); this.leakFlash = 0.5; break;
      // ---- pigments: a bloom of the mixed colour, and its name
      case 'mix': {
        const M = Object.values(MIXES).find(m => m.k === f.k);
        X.add({ k: 'tex', tex: puffTex(M.col, (R() * 3) | 0), x: f.x, y: f.y, s0: 0.3, s1: f.k === 'flash' ? 2.4 : 1.6, life: 0.7, a: 0.85 });
        X.add({ k: 'ring', x: f.x, y: f.y + 8, r0: 6, r1: f.k === 'flash' ? 48 : 30, col: M.col, w: 3, life: 0.4 });
        X.decal({ tex: splatTex(M.col, (R() * 4) | 0), x: f.x, y: f.y + 10, life: 6, s: f.k === 'flash' ? 1.4 : 1, alpha: 0.6 });
        for (let i = 0; i < 8; i++) { const a = R() * Math.PI * 2, v = 40 + R() * 70; X.add({ k: 'drop', x: f.x, y: f.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, g: 240, r: 1.2 + R() * 1.6, col: M.col, life: 0.6 }); }
        if (f.k === 'bloom') X.add({ k: 'roots', x: f.x, y: f.y + 10, r: 16, n: 6, seed: R() * 6, life: 1.3 });
        X.add({ k: 'text', text: M.name, x: f.x, y: f.y - 22, col: M.col, size: 15, life: 0.9 });
        if (!this.save.mixSeen) { this.save.mixSeen = 1; writeSave(this.save); this.banner('Colours mix! ' + M.name, 2.4, { size: 30, tint: M.col }); }
        break;
      }
      case 'wash': {
        const n = Math.max(6, Math.round(Math.hypot(f.x2 - f.x1, f.y2 - f.y1) / 14));
        for (let i = 0; i <= n; i++) {
          const t = i / n, x = f.x1 + (f.x2 - f.x1) * t, y = f.y1 + (f.y2 - f.y1) * t;
          X.add({ k: 'tex', tex: puffTex(PIGMENTS.ultra.col, i % 3), x, y: y - 4, vx: (f.x2 - f.x1) / n * 2, vy: -6, s0: 0.3, s1: f.w / 28, life: 0.5 + t * 0.4, a: 0.55 });
          for (let k = 0; k < 2; k++) X.add({ k: 'drop', x: x + (R() - 0.5) * f.w, y, vx: (R() - 0.5) * 50, vy: -60 - R() * 60, g: 300, r: 1.4, col: R() < 0.5 ? '#9fc4f0' : '#e8f4ff', life: 0.6 });
        }
        X.decal({ tex: splatTex(PIGMENTS.ultra.col, 1), x: (f.x1 + f.x2) / 2, y: (f.y1 + f.y2) / 2, life: 3, s: 1.2, alpha: 0.35 });
        break;
      }
      case 'wall': for (let i = 0; i < 6; i++) { const t = i / 5; X.add({ k: 'tex', tex: burstTex('ink', i % 3), x: f.x1 + (f.x2 - f.x1) * t, y: f.y1 + (f.y2 - f.y1) * t - 6, s0: 0.2, s1: 0.6, life: 0.4 }); } break;
      case 'wallbreak': case 'wallfade':
        for (let i = 0; i < 10; i++) { const a = R() * Math.PI * 2; X.add({ k: 'drop', x: f.x, y: f.y - 6, vx: Math.cos(a) * 90, vy: Math.sin(a) * 60 - 50, g: 280, r: 1.6, col: '#2a2232', life: 0.7 }); }
        X.add({ k: 'tex', tex: puffTex('#3a3448', 1), x: f.x, y: f.y - 8, s0: 0.4, s1: 1.4, life: 0.6, a: 0.6 });
        break;
      case 'flurry': for (let i = 0; i < 5; i++) X.add({ k: 'line', x: f.x - 14 + i * 6, y: f.y - 12, x2: f.x + 10 - i * 4, y2: f.y + 10, col: 'rgba(255,250,235,0.95)', w: 2, life: 0.12 + i * 0.04 }); X.shake = Math.max(X.shake, 2); break;
      case 'hook': X.add({ k: 'line', x: f.x, y: f.y, x2: f.x2, y2: f.y2, col: '#6a5040', w: 1.6, life: 0.35 }); X.add({ k: 'tex', tex: puffTex('#a8c8e0', 1), x: f.x3, y: f.y3 - 6, s0: 0.3, s1: 1, life: 0.5, a: 0.7 }); break;
      case 'redwash': X.add({ k: 'tex', tex: puffTex(PIGMENTS.verm.col, (R() * 3) | 0), x: f.x, y: f.y - 6, s0: 0.4, s1: f.r / 24, life: 0.8, a: 0.7 }); X.decal({ tex: splatTex(PIGMENTS.verm.col, 2), x: f.x, y: f.y, life: 4, s: f.r / 30, alpha: 0.45 }); break;
      case 'curse': X.add({ k: 'ring', x: f.x, y: f.y, r0: 10, r1: f.r, col: '#6a4a2a', w: 3, life: 0.6 }); X.add({ k: 'tex', tex: puffTex('#6a4a2a', 2), x: f.x, y: f.y - 8, s0: 0.4, s1: f.r / 26, life: 1, a: 0.5 }); break;
      case 'towerSeen': {
        if (f.owner !== this.me) break;
        const seen = this.save.towersSeen || (this.save.towersSeen = []);
        if (!seen.includes(f.id)) { seen.push(f.id); writeSave(this.save); if (seen.length > 1) this.fx.add({ k: 'text', text: 'New in the Encyclopaedia', x: 166, y: 104, col: '#5a4a96', size: 17, life: 1.8 }); }
        break;
      }
      case 'wave': this.banner(`Wave ${f.n} of ${this.game.totalWaves()}`, 1.8, { size: 30 }); break;
      case 'boss': this.banner(ENEMIES[f.kind].name, 3.2, { size: 48, tint: '#5a1e22' }); break;
      case 'newEnemy': {
        if (!this.save.seen.includes(f.kind)) { this.save.seen.push(f.kind); writeSave(this.save); }
        this.cards.push({ kind: f.kind, t: 0, life: 6 });
        break;
      }
    }
  }
  banner(s, life = 2, o = {}) { this.banners.push({ s, t: 0, life, o }); }

  finish() {
    if (this.result) return;
    const G = this.game;
    this.state = G.state;
    this.endT = 0;
    const s = this.save;
    const H = this.myHero();
    const xpGained = H ? Math.round(H.xp - H.xpStart + (G.state === 'won' ? 150 + this.L.id * 40 : 40)) : 0;
    if (H) s.heroXp[H.id] = Math.min(XP_LEVELS[9] + 1, (s.heroXp[H.id] || 0) + xpGained);
    let stars = 0, first = false;
    if (G.state === 'won') {
      stars = G.stars();
      // co-op stars count for the host's map only; the guest is a visitor
      if (!this.guest) {
        first = !s.stars[this.L.id];
        s.stars[this.L.id] = Math.max(s.stars[this.L.id] || 0, stars);
      }
      setMood('map');
    }
    const coins = battleCoins(this.L, G.state === 'won', stars, G.wave, this.coop ? this.coop.diff : s.difficulty);
    s.coins = (s.coins || 0) + coins;
    writeSave(s);
    this.result = { stars, first, xpGained, coins, heroLevel: H ? heroLevel(s.heroXp[H.id]) : 0 };
  }

  // ================================================================== drawing
  // the painted layer: goes through the painting filter
  drawWorld(g) {
    const G = this.game;
    this.shakeX = this.fx.shake > 0 ? (Math.random() - 0.5) * this.fx.shake : 0;
    this.shakeY = this.fx.shake > 0 ? (Math.random() - 0.5) * this.fx.shake : 0;
    g.save();
    g.translate(this.shakeX, this.shakeY);
    g.drawImage(this.mapCanvas, 0, 0, 1280, 720);
    this.fx.drawDecals(g);

    // empty plots
    const slotS = towerSprite('slot');
    for (const s of G.slots) {
      if (s.tower) continue;
      const hov = this.sel?.kind === 'slot' && this.sel.ref === s || (!this.sel && !this.mode && hitCircle(s.x, s.y - 4, 24, this.mouse.x, this.mouse.y));
      if (hov) { g.save(); g.globalAlpha = 0.5; g.fillStyle = '#fff6d8'; g.beginPath(); g.ellipse(s.x, s.y, 28, 12, 0, 0, 7); g.fill(); g.restore(); }
      g.drawImage(slotS.c, s.x - slotS.ax, s.y - slotS.ay, slotS.w, slotS.h);
    }

    // ink walls lie on the ground, under everyone
    for (const w of G.walls) this.drawWall(g, w);

    // all cast shadows for this frame, unioned into one mask
    this.beginShadows(g);
    for (const t of G.towers) this.shadowOf(towerSprite(t.type), t.x, t.y, false, TOWER_K, 0, 1);
    for (const e of G.enemies) { const fr = this.frameOf(e, true); this.shadowOf(fr, e.x, e.y, (e.face || 1) < 0, UNIT_K, e.fly ? 34 : 0, e.fly ? 0.45 : 1); }
    for (const b of G.blockers) if (b.alive) { const fr = this.frameOf(b, false); this.shadowOf(fr, b.x, b.y, (b.face || 1) < 0, UNIT_K, 0, 1); }

    // everything that stands, back to front
    const items = [];
    for (const t of G.towers) items.push({ y: t.y, f: () => this.drawTower(g, t) });
    for (const e of G.enemies) if (!e.fly) items.push({ y: e.y, f: () => this.drawUnit(g, e, true) });
    for (const b of G.blockers) if (b.alive) items.push({ y: b.y, f: () => this.drawUnit(g, b, false) });
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.f();
    // shadows fall on the ground and on whoever is standing in them
    this.endShadows(g);

    this.fx.draw(g, 'top');
    // flyers above everything on the ground
    const fliers = G.enemies.filter(e => e.fly).sort((a, b) => a.y - b.y);
    for (const e of fliers) this.drawUnit(g, e, true);
    this.drawProjectiles(g);
    this.drawBeams(g);
    this.drawClouds(g);
    g.restore();
    this.drawLight(g);
  }

  // LIGHT AND THE PAGE (2026-10-07). A warm wash from the upper left where
  // the sun is, and the edges of the sheet going down into shadow, so the
  // battlefield sits on the page like a painting instead of being flat
  // colour to the edges of the screen. Made once per battle and laid over
  // the painted layer, so the painting filter blends it into the paint.
  drawLight(g) {
    if (!this.lightC) {
      const c = makeCanvas(1280, 720), x = c.getContext('2d');
      const dark = ['throne', 'waste', 'darkwood'].includes(this.L.theme);
      const v = x.createRadialGradient(640, 380, 260, 640, 380, 820);
      v.addColorStop(0, 'rgba(40,26,40,0)'); v.addColorStop(1, dark ? 'rgba(20,12,28,0.55)' : 'rgba(60,40,48,0.38)');
      x.fillStyle = v; x.fillRect(0, 0, 1280, 720);
      const sun = x.createRadialGradient(140, 40, 0, 140, 40, 760);
      sun.addColorStop(0, dark ? 'rgba(200,160,255,0.10)' : 'rgba(255,236,190,0.24)'); sun.addColorStop(1, 'rgba(255,236,190,0)');
      x.fillStyle = sun; x.fillRect(0, 0, 1280, 720);
      this.lightC = c;
    }
    g.drawImage(this.lightC, 0, 0, 1280, 720);
  }

  // the crisp layer on top: health bars, rings, HUD, menus
  draw(g) {
    const G = this.game;
    g.save();
    g.translate(this.shakeX || 0, this.shakeY || 0);
    this.drawRanges(g);
    for (const e of G.enemies) this.drawUnitUI(g, e, true);
    for (const b of G.blockers) if (b.alive) this.drawUnitUI(g, b, false);
    for (const t of G.towers) if (t.silenced > 0 || t.doused > 0) text(g, t.silenced > 0 ? 'silenced' : 'doused', t.x, t.y + (t.def.top ?? -40) - 14, { size: 13, align: 'center', color: '#f3e9d2', stroke: 'rgba(40,20,50,0.8)', strokeW: 3 });
    this.drawWaveFlags(g);
    if (this.sel?.kind === 'tower' && (this.sel.ref.def.soldier || this.sel.ref.def.beast)) this.drawRally(g, this.sel.ref);
    g.restore();

    if (this.leakFlash > 0) {
      this.leakFlash -= 1 / 60;
      g.save(); g.globalAlpha = this.leakFlash * 0.5;
      const gr = g.createRadialGradient(640, 360, 300, 640, 360, 760);
      gr.addColorStop(0, 'rgba(160,30,30,0)'); gr.addColorStop(1, 'rgba(160,30,30,1)');
      g.fillStyle = gr; g.fillRect(0, 0, 1280, 720); g.restore();
    }

    if (this.L.id === 1 && this.state === 'play' && this.game.towers.length === 0 && !this.sel) {
      const s = this.game.slots[0];
      const bob = Math.sin(this.time * 4) * 4;
      card(g, s.x - 70, s.y - 86 + bob, 140, 40, { tint: '#3e64a8', seed: 101 });
      text(g, 'Build here!', s.x, s.y - 60 + bob, { size: 20, align: 'center', title: true });
      g.fillStyle = '#3e64a8'; g.beginPath(); g.moveTo(s.x - 8, s.y - 44 + bob); g.lineTo(s.x + 8, s.y - 44 + bob); g.lineTo(s.x, s.y - 30 + bob); g.fill();
    }
    if (this.L.id === 1 && this.state === 'play' && this.game.towers.length > 0 && this.game.wave === 0 && !this.sel) {
      const e = this.game.entries[0];
      const fx = clamp(e.x, 36, 1244) - 150, fy = clamp(e.y, 96, 690) + 40;
      card(g, fx - 80, fy, 200, 46, { tint: '#5a1e22', seed: 102 });
      para(g, 'Click the skull when ready to start the first wave.', fx - 70, fy + 20, 180, { size: 15, lh: 16 });
    }
    this.drawRing(g);
    this.drawCursor(g);
    this.drawHUD(g);
    this.drawInfo(g);
    this.drawCards(g);
    for (const b of this.banners) {
      const a = Math.min(1, b.t * 4, (b.life - b.t) * 2.5);
      bannerText(g, b.s, 150, a, b.o);
    }
    if (this.state === 'brief') this.drawBrief(g);
    if (this.state === 'paused') this.drawPause(g);
    if (this.state === 'won' || this.state === 'lost') this.drawEnd(g);
  }

  // An ink wall: a fat brush stroke with a dry edge, lighter as it is
  // hacked at and fading in its last seconds
  drawWall(g, w) {
    const a = Math.min(1, w.t / 2) * (0.55 + 0.45 * w.hp / w.maxHp);
    const dx = w.x2 - w.x1, dy = w.y2 - w.y1, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    const R = mulberry(w.id * 977);
    g.save();
    g.globalAlpha = a;
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (let pass = 0; pass < 3; pass++) {
      g.strokeStyle = pass === 0 ? 'rgba(20,16,30,0.35)' : pass === 1 ? '#231c2e' : '#3a3150';
      g.lineWidth = pass === 0 ? 16 : pass === 1 ? 11 : 4;
      g.beginPath();
      const n = Math.max(4, Math.round(L / 10));
      for (let i = 0; i <= n; i++) {
        const t = i / n, wob = (R() - 0.5) * (pass === 2 ? 3 : 2);
        const x = w.x1 + dx * t + nx * wob, y = w.y1 + dy * t + ny * wob - (pass === 2 ? 2 : 0);
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
    }
    // splatter at the ends, where the brush went down and came up
    g.fillStyle = '#231c2e';
    for (const [x, y] of [[w.x1, w.y1], [w.x2, w.y2]]) for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(x + (R() - 0.5) * 14, y + (R() - 0.5) * 10, 1 + R() * 2.4, 0, 7); g.fill(); }
    if (w.hitT > 0) { g.globalAlpha = 0.5; g.strokeStyle = '#fff6e0'; g.lineWidth = 2; g.beginPath(); g.moveTo(w.x1, w.y1); g.lineTo(w.x2, w.y2); g.stroke(); }
    g.restore();
  }

  drawClouds(g) {
    if (this.L.theme === 'throne') return;
    if (!this.clouds) this.clouds = [0, 1, 2].map(i => ({ tex: puffTex('#3a3448', i), x: Math.random() * 1600 - 160, y: 120 + i * 210 + Math.random() * 60, s: 9 + Math.random() * 4, v: 7 + Math.random() * 5 }));
    for (const c of this.clouds) {
      c.x += c.v / 60 * (this.state === 'play' ? this.speed : 1);
      if (c.x > 1280 + c.s * 22) c.x = -c.s * 22;
      g.globalAlpha = 0.07;
      g.drawImage(c.tex.c, c.x - c.tex.w * c.s / 2, c.y - c.tex.h * c.s * 0.3, c.tex.w * c.s, c.tex.h * c.s * 0.6);
    }
    g.globalAlpha = 1;
  }

  drawRanges(g) {
    const show = (x, y, r, col) => {
      g.save();
      g.fillStyle = col + '22'; g.strokeStyle = col + 'aa'; g.lineWidth = 1.6; g.setLineDash([7, 5]);
      g.beginPath(); g.ellipse(x, y, r, r * 0.78, 0, 0, 7); g.fill(); g.stroke();
      g.restore();
    };
    const G = this.game;
    if (this.sel?.kind === 'tower') {
      const t = this.sel.ref;
      const opt = this.hoverOpt();
      let r = G.towerRange(t);
      if (opt?.towerId && TOWERS[opt.towerId].range) r = TOWERS[opt.towerId].range * (G.towerRange(t) / t.def.range);
      if (t.def.soldier) r = t.def.range;
      if (t.def.beast) return;
      show(t.x, t.y, r, LINE_COL[t.def.line]);
    } else if (this.sel?.kind === 'slot') {
      const opt = this.hoverOpt();
      if (opt?.towerId) {
        const d = TOWERS[opt.towerId];
        const r = G.towerRange({ def: d });
        show(this.sel.ref.x, this.sel.ref.y, r, LINE_COL[d.line]);
      }
    } else if (this.sel?.kind === 'hero' && this.myHero()?.b?.ranged) {
      const b = this.myHero().b;
      show(b.x, b.y, b.ranged.range, '#b8862a');
    }
    if (this.mode === 'rally') { const t = this.sel?.ref; if (t) show(t.x, t.y, t.def.range, '#a84a3a'); }
  }

  drawTower(g, t) {
    const sp = towerSprite(t.type);
    const d = t.def;
    g.save();
    if (t.buildT > 0) {
      const f = 1 - t.buildT / 0.8;
      const s = 0.4 + 0.6 * easeOutBack(Math.min(1, f));
      g.translate(t.x, t.y); g.scale(1, s); g.translate(-t.x, -t.y);
    }
    const hov = this.sel?.ref === t || (!this.sel && !this.mode && this.towerAt(this.mouse.x, this.mouse.y) === t);
    // towers a size up from how they were painted, grown from the plot
    g.translate(t.x, t.y); g.scale(TOWER_K, TOWER_K); g.translate(-t.x, -t.y);
    g.drawImage(sp.c, t.x - sp.ax, t.y - sp.ay, sp.w, sp.h);
    if (hov) { g.globalAlpha = 0.18; g.globalCompositeOperation = 'lighter'; g.drawImage(sp.c, t.x - sp.ax, t.y - sp.ay, sp.w, sp.h); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; }
    g.restore();
    const topY = t.y + (d.top ?? -40) * TOWER_K;
    const active = t.silenced <= 0 && t.doused <= 0;
    // shooters
    if (TOPS[t.type]) {
      const s = towerTop(TOPS[t.type]);
      const face = Math.cos(t.aim) >= 0 ? 1 : -1;
      if (t.fireT > 0) t.fireT -= this.frameDt || 0.016;
      for (const ox of [-8, 8]) {
        const kick = (t.fireT > 0 && (ox > 0) === !!t.shooter) ? Math.sin((t.fireT / 0.18) * Math.PI) * 1.6 : 0;
        g.save(); g.translate(t.x + ox - face * kick, topY + 4 + kick * 0.4); g.scale(face, 1);
        g.drawImage(s.c, -s.ax, -s.ay, s.w, s.h); g.restore();
      }
    }
    if (d.line === 'artillery' && (!d.path || d.path === 'bomb')) {
      const s = towerTop(d.big ? 'bigmortar' : 'mortar');
      const rc = Math.max(0, t.recoil || 0);
      g.save(); g.translate(t.x, topY + 4); g.scale(1 + rc * 0.4, 1 - rc * 0.7);
      g.drawImage(s.c, -s.ax, -s.ay, s.w, s.h); g.restore();
    }
    // magic glows
    if (d.path === 'fire') {
      // the cauldron bubbles
      if (Math.random() < 0.15) this.fx.add({ k: 'drop', x: t.x + (Math.random() - 0.5) * 16, y: t.y + d.top + 6, vx: (Math.random() - 0.5) * 10, vy: -30 - Math.random() * 20, g: 60, r: 1.6, col: Math.random() < 0.5 ? '#6a3a8a' : '#ff9a40', life: 0.6 });
    }
    if (active && (d.line === 'mage' || d.path === 'spark')) {
      const pulse = 0.5 + Math.sin(this.time * 3 + t.x) * 0.2 + (t.cd > d.rate - 0.25 ? 0.4 : 0);
      const col = d.path === 'lens' ? '230,245,255' : d.path === 'sorc' ? '255,200,120' : d.path === 'spark' ? '150,200,255' : d.path === 'frost' ? '190,235,255' : '170,190,255';
      const gr = g.createRadialGradient(t.x, topY, 0, t.x, topY, 16);
      gr.addColorStop(0, `rgba(${col},${0.55 * pulse})`); gr.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = gr; g.beginPath(); g.arc(t.x, topY, 16, 0, 7); g.fill();
      if (d.path === 'spark' && Math.random() < 0.08) this.fx.add({ k: 'bolt', pts: [{ x: t.x - 20, y: t.y - 53 }, { x: t.x, y: t.y - 61 }, { x: t.x + 20, y: t.y - 53 }], life: 0.08 });
    }
    // silenced / doused
    if (t.silenced > 0 || t.doused > 0) {
      const col = t.silenced > 0 ? 'rgba(40,20,50,0.55)' : 'rgba(150,130,190,0.45)';
      g.fillStyle = col;
      for (let i = 0; i < 4; i++) { g.beginPath(); g.ellipse(t.x + Math.sin(this.time * 2 + i * 1.7) * 12, topY - 4 + Math.cos(this.time * 1.5 + i) * 5, 13, 8, 0, 0, 7); g.fill(); }
    }
    // ability rank pips on spec towers
    if (d.abilities) {
      const ranks = d.abilities.map(a => t.ranks[a] || 0);
      if (ranks.some(r => r > 0)) {
        g.fillStyle = '#f0c040';
        let i = 0;
        for (const r of ranks) for (let k = 0; k < r; k++) { g.beginPath(); g.arc(t.x - 12 + i * 4.2, t.y + 8, 1.6, 0, 7); g.fill(); i++; }
      }
    }
  }

  frameOf(u, enemy) {
    const sh = unitSheet(enemy ? u.kind : u.look);
    // strike and follow-through right after the blow lands...
    if (u.swing > 0) return sh.atk[2 + Math.min(2, Math.floor((1 - u.swing / 0.25) * 3))];
    // ...and the wind-up in the moment before it
    if (u.engaged && u.atkT > 0 && u.atkT < 0.24) return sh.atk[u.atkT > 0.12 ? 0 : 1];
    return sh.walk[Math.floor((u.walk || 0) * 2) % sh.walk.length];
  }

  // ---- shadow layer
  beginShadows(g) {
    const cw = g.canvas.width, ch = g.canvas.height;
    if (!this.shadowC || this.shadowC.width !== cw || this.shadowC.height !== ch) { this.shadowC = makeCanvas(cw, ch); }
    const sg = this.shadowC.getContext('2d');
    sg.setTransform(1, 0, 0, 1, 0, 0);
    sg.globalCompositeOperation = 'source-over';
    sg.globalAlpha = 1;
    sg.clearRect(0, 0, cw, ch);
    sg.setTransform(g.getTransform());
    if (this.mapCanvas.shadow) sg.drawImage(this.mapCanvas.shadow, 0, 0, 1280, 720);
    this.sg = sg;
  }
  shadowOf(spr, x, y, flip, k = 1, lift = 0, a = 1) {
    if (!spr?.sh) return;
    const sg = this.sg;
    sg.save();
    sg.globalAlpha = a;
    sg.translate(x - lift * SHADOW.dx * 0.7, y - lift * SHADOW.dy * 0.6);
    sg.transform(1, 0, SHADOW.dx, SHADOW.dy, 0, 0);
    sg.scale(flip ? -k : k, k);
    sg.drawImage(spr.sh, -spr.ax, -spr.ay, spr.w, spr.h);
    sg.restore();
  }
  endShadows(g) {
    const sg = this.sg;
    sg.setTransform(1, 0, 0, 1, 0, 0);
    sg.globalCompositeOperation = 'source-in';
    const dark = ['throne', 'waste', 'darkwood'].includes(this.L.theme);
    sg.fillStyle = dark ? 'rgb(40,34,70)' : 'rgb(62,58,104)';
    sg.fillRect(0, 0, this.shadowC.width, this.shadowC.height);
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'multiply';
    g.globalAlpha = dark ? 0.4 : 0.5;
    g.drawImage(this.shadowC, 0, 0);
    g.restore();
  }

  drawUnit(g, u, enemy) {
    const look = enemy ? u.kind : u.look;
    const fr = this.frameOf(u, enemy);
    const size = enemy ? u.size : 1;
    let y = u.y;
    if (enemy && u.fly) y = u.y - 34 + Math.sin(this.time * 4 + u.id) * 3;
    if (!enemy && u.fly) y = u.y - 30 + Math.sin(this.time * 3 + u.id) * 3;
    // contact shadow + a long cast shadow away from the light (upper left)
    g.fillStyle = 'rgba(40,30,40,0.2)';
    g.beginPath(); g.ellipse(u.x + 1, u.y + 1, 8 * size, 2.8 * size, 0, 0, 7); g.fill();
    // turning round is a quick squash through the middle, not a snap
    const want = (u.face || 1) < 0 ? -1 : 1;
    u._fs = u._fs === undefined ? want : u._fs + (want - u._fs) * Math.min(1, (this.frameDt || 0.016) * 14);
    const fs = Math.sign(u._fs || want) * Math.max(0.25, Math.abs(u._fs));
    // squash when hit, breathe when standing still
    let sx = 1, sy = 1;
    if (u.hurtT > 0) { sx = 1.07; sy = 0.94; }
    else if (!enemy && !u.target && !u.moving) sy = 1 + Math.sin(this.time * 2.2 + u.id) * 0.018;
    g.save();
    g.translate(u.x, y);
    g.scale(UNIT_K * fs * sx, UNIT_K * sy);
    if (enemy && u.stun > 0) g.rotate(Math.sin(this.time * 20) * 0.05);
    if (u.stone > 0) g.filter = 'grayscale(1) brightness(1.15)';
    else if (u.frozen > 0) g.filter = 'saturate(0.3) hue-rotate(170deg) brightness(1.25)';
    g.drawImage(fr.c, -fr.ax, -fr.ay, fr.w, fr.h);
    g.filter = 'none';
    // A STAIN IS PAINT ON THEM: the pigment washed over the figure itself,
    // fading as it dries. Clipped to the figure by drawing it source-atop on
    // a copy, so it never colours the grass around them.
    if (enemy && (u.stain || u.hexT > 0)) {
      const col = u.stain ? PIGMENTS[u.stain].col : '#8a4ab8';
      const k = u.stain ? Math.min(1, (u.stainT || 0) / 1.5) : 0.7;
      g.globalAlpha = 0.42 * k;
      g.drawImage(tinted(fr, col), -fr.ax, -fr.ay, fr.w, fr.h);
      g.globalAlpha = 1;
    }
    if (u.hurtT > 0) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.35; g.drawImage(fr.c, -fr.ax, -fr.ay, fr.w, fr.h); }
    g.restore();
  }

  drawUnitUI(g, u, enemy) {
    const sh = unitSheet(enemy ? u.kind : u.look);
    const fr = sh.walk[0];
    const size = enemy ? u.size : 1;
    let y = u.y;
    if (enemy && u.fly) y = u.y - 34 + Math.sin(this.time * 4 + u.id) * 3;
    const top = y - (fr.ay - 6) * UNIT_K * (enemy && ENEMIES[u.kind]?.boss ? 0.92 : 0.9);
    // hp bar
    if (u.hp < u.maxHp && u.hp > 0) hpBar(g, u.x, top - 4, enemy && u.def.boss ? 60 : Math.min(30, 16 + size * 6), u.hp / u.maxHp, enemy ? '#c8443a' : '#4a7ac8');
    if (enemy) {
      if (u.slowT > 0) { g.fillStyle = 'rgba(120,170,230,0.8)'; for (let i = 0; i < 2; i++) { g.beginPath(); g.arc(u.x - 4 + i * 8, y - 4 + ((this.time * 30 + i * 9) % 10), 1.4, 0, 7); g.fill(); } }
      if (u.poisonT > 0) { g.fillStyle = 'rgba(110,190,70,0.85)'; for (let i = 0; i < 3; i++) { const k = (this.time * 1.2 + i * 0.33) % 1; g.beginPath(); g.arc(u.x - 6 + i * 6, top + 4 - k * 14, 1.6 * (1 - k) + 0.4, 0, 7); g.fill(); } }
      if (u.stun > 0 && !u.def.boss) { g.fillStyle = '#f0c040'; for (let i = 0; i < 3; i++) { const a = this.time * 6 + i * 2.1; g.beginPath(); g.arc(u.x + Math.cos(a) * 8, top + 2 + Math.sin(a) * 3, 1.6, 0, 7); g.fill(); } }
      if (u.shredT > 0) { g.strokeStyle = 'rgba(200,100,200,0.7)'; g.lineWidth = 1; g.beginPath(); g.ellipse(u.x, u.y, 11 * size, 4 * size, 0, 0, 7); g.stroke(); }
      // the colour it is carrying, as a drop of paint over its head
      if (u.stain) {
        const col = PIGMENTS[u.stain].col;
        g.fillStyle = col; g.strokeStyle = 'rgba(40,30,40,0.7)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(u.x, top - 16); g.quadraticCurveTo(u.x + 5, top - 9, u.x, top - 6); g.quadraticCurveTo(u.x - 5, top - 9, u.x, top - 16); g.fill(); g.stroke();
      }
      if (u.hexT > 0) { g.strokeStyle = 'rgba(138,74,184,0.85)'; g.lineWidth = 1.4; g.setLineDash([3, 3]); g.beginPath(); g.ellipse(u.x, u.y, 13 * size, 5 * size, this.time, 0, 7); g.stroke(); g.setLineDash([]); }
    }
    if (this.sel?.ref === u) { g.strokeStyle = enemy ? '#c8443a' : '#b8862a'; g.lineWidth = 1.6; g.beginPath(); g.ellipse(u.x, u.y + 1, 14 * size, 5 * size, 0, 0, 7); g.stroke(); }
    if (!enemy && u.kind === 'hero') {
      // a gold ring under the hero so he's easy to find
      g.strokeStyle = 'rgba(216,178,74,0.8)'; g.lineWidth = 1.3; g.setLineDash([4, 3]);
      g.beginPath(); g.ellipse(u.x, u.y + 1, 15, 5.5, 0, 0, 7); g.stroke(); g.setLineDash([]);
    }
  }

  drawProjectiles(g) {
    for (const p of this.game.proj) {
      g.save();
      switch (p.k) {
        case 'arrow': case 'nib': {
          const a = p.ang ?? 0;
          (p.trail ||= []).push(p.x, p.y);
          if (p.trail.length > 10) p.trail.splice(0, 2);
          g.strokeStyle = 'rgba(250,245,230,0.35)'; g.lineWidth = 1.2; g.beginPath();
          for (let i = 0; i < p.trail.length; i += 2) i ? g.lineTo(p.trail[i], p.trail[i + 1]) : g.moveTo(p.trail[i], p.trail[i + 1]);
          g.stroke();
          g.translate(p.x, p.y); g.rotate(a);
          g.strokeStyle = p.k === 'nib' ? '#3a2e40' : '#5a4030'; g.lineWidth = 1.1;
          g.beginPath(); g.moveTo(-7, 0); g.lineTo(5, 0); g.stroke();
          g.fillStyle = p.k === 'nib' ? '#d4a04a' : '#8a96a3';
          g.beginPath(); g.moveTo(5, -1.6); g.lineTo(8.5, 0); g.lineTo(5, 1.6); g.fill();
          if (p.k === 'arrow') { g.strokeStyle = p.poison ? '#6ab040' : '#e8e0d0'; g.lineWidth = 1; g.beginPath(); g.moveTo(-7, 0); g.lineTo(-9, -2); g.moveTo(-7, 0); g.lineTo(-9, 2); g.stroke(); }
          break;
        }
        case 'axe': case 'spear': {
          g.translate(p.x, p.y); g.rotate(p.k === 'axe' ? p.t * 18 : (p.ang ?? 0));
          g.strokeStyle = '#6b4a2f'; g.lineWidth = 1.3;
          g.beginPath(); g.moveTo(-6, 0); g.lineTo(6, 0); g.stroke();
          g.fillStyle = '#b9c2c9'; g.beginPath(); g.moveTo(6, -2.5); g.lineTo(9, 0); g.lineTo(6, 2.5); g.fill();
          break;
        }
        case 'bolt': {
          const col = p.color === 'poly' ? `hsl(${(this.time * 400 + p.sx) % 360},80%,65%)` : '#a8c4ff';
          const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, 9);
          gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.3, col); gr.addColorStop(1, 'rgba(120,140,255,0)');
          g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, 9, 0, 7); g.fill();
          if (Math.random() < 0.5) this.fx.add({ k: 'drop', x: p.x, y: p.y, vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 20, r: 1.4, col: p.color === 'poly' ? col : '#8aa0ff', life: 0.3 });
          break;
        }
        case 'frostbolt': {
          const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, 8);
          gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.35, '#bfe8ff'); gr.addColorStop(1, 'rgba(150,210,255,0)');
          g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, 8, 0, 7); g.fill();
          if (Math.random() < 0.5) this.fx.add({ k: 'drop', x: p.x, y: p.y, vx: (Math.random() - 0.5) * 16, vy: 10, r: 1.2, col: '#e8f8ff', life: 0.4 });
          break;
        }
        case 'firepot': {
          const f = Math.min(1, p.t / p.dur);
          g.fillStyle = `rgba(40,30,30,${0.12 + f * 0.2})`;
          g.beginPath(); g.ellipse(p.gx, p.gy, 5 + f * 4, 2 + f * 1.5, 0, 0, 7); g.fill();
          g.fillStyle = '#2a2230'; g.beginPath(); g.arc(p.x, p.y, 4, 0, 7); g.fill();
          const gr = g.createRadialGradient(p.x, p.y - 3, 0, p.x, p.y - 3, 7);
          gr.addColorStop(0, 'rgba(255,200,120,0.9)'); gr.addColorStop(1, 'rgba(255,90,40,0)');
          g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y - 3, 7, 0, 7); g.fill();
          if (Math.random() < 0.6) this.fx.add({ k: 'drop', x: p.x, y: p.y, vx: (Math.random() - 0.5) * 20, vy: -10, r: 1.4, col: '#ff9a40', life: 0.35 });
          break;
        }
        case 'bomb': case 'meteor': {
          // ground shadow where it will land
          const f = Math.min(1, p.t / p.dur);
          g.fillStyle = `rgba(40,30,30,${0.12 + f * 0.2})`;
          g.beginPath(); g.ellipse(p.gx, p.gy, 6 + f * 4, 2.5 + f * 1.5, 0, 0, 7); g.fill();
          const r = p.k === 'meteor' ? 7 : p.small ? 3 : p.big ? 6 : 4.5;
          if (p.k === 'meteor') {
            this.fx.add({ k: 'tex', tex: puffTex('#e08040', (Math.random() * 3) | 0), x: p.x, y: p.y, s0: 0.4, s1: 0.1, life: 0.4, a: 0.8 });
            const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.4);
            gr.addColorStop(0, 'rgba(255,220,140,0.9)'); gr.addColorStop(1, 'rgba(255,120,40,0)');
            g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, r * 2.4, 0, 7); g.fill();
            g.fillStyle = '#2a2236';
          } else g.fillStyle = '#2e2a30';
          g.beginPath(); g.arc(p.x, p.y, r, 0, 7); g.fill();
          g.strokeStyle = INKC; g.lineWidth = 0.8; g.stroke();
          if (p.k === 'bomb') { g.fillStyle = Math.random() < 0.5 ? '#ffd060' : '#ff8040'; g.beginPath(); g.arc(p.x + r * 0.7, p.y - r * 0.9, 1.4, 0, 7); g.fill(); }
          break;
        }
        case 'rocket': {
          g.translate(p.x, p.y); g.rotate(p.ang ?? 0);
          g.fillStyle = '#c4433a'; g.fillRect(-5, -1.8, 9, 3.6);
          g.fillStyle = '#e8d8b0'; g.beginPath(); g.moveTo(4, -1.8); g.lineTo(7.5, 0); g.lineTo(4, 1.8); g.fill();
          g.restore(); g.save();
          this.fx.add({ k: 'tex', tex: puffTex('#d8d0c4', (Math.random() * 3) | 0), x: p.x, y: p.y, s0: 0.25, s1: 0.6, life: 0.5, a: 0.6 });
          break;
        }
        case 'rain': {
          g.translate(p.x, p.y); g.rotate(1.35);
          g.strokeStyle = '#4a6a3a'; g.lineWidth = 1; g.beginPath(); g.moveTo(-6, 0); g.lineTo(5, 0); g.stroke();
          break;
        }
      }
      g.restore();
    }
  }

  drawBeams(g) {
    for (const t of this.game.towers) {
      const b = t.beam;
      if (!b || !b.tgt?.alive || t.silenced > 0 || t.doused > 0) continue;
      const sx = t.x, sy = t.y + (t.def.top ?? -70);
      const draw = (e, w) => {
        const ex = e.x, ey = e.fly ? e.y - 38 : e.y - 12 * e.size;
        g.save(); g.lineCap = 'round';
        g.strokeStyle = `rgba(255,${200 - b.heat * 120},${200 + b.heat * 55},${0.25})`; g.lineWidth = w * 3.2;
        g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.stroke();
        g.strokeStyle = `hsla(${(this.time * 120) % 360},90%,75%,0.75)`; g.lineWidth = w * 1.4;
        g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.stroke();
        g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = w * 0.5;
        g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.stroke();
        const gr = g.createRadialGradient(ex, ey, 0, ex, ey, 6 + w * 2);
        gr.addColorStop(0, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,200,255,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(ex, ey, 6 + w * 2, 0, 7); g.fill();
        g.restore();
      };
      draw(b.tgt, 1.2 + b.heat * 2.6);
      for (const o of b.extra || []) if (o.alive) draw(o, 0.8 + b.heat);
    }
  }

  drawWaveFlags(g) {
    const G = this.game;
    if (!G.canCallWave()) return;
    const ps = G.nextWavePaths();
    for (const e of G.entries) {
      if (!ps.has(e.path)) continue;
      const fx = clamp(e.x, 36, 1244), fy = clamp(e.y, 96, 690);
      const hov = hitCircle(fx, fy - 6, 22, this.mouse.x, this.mouse.y);
      const pulse = 1 + Math.sin(this.time * 5) * 0.08;
      g.save();
      g.translate(fx, fy);
      g.scale(pulse * (hov ? 1.15 : 1), pulse * (hov ? 1.15 : 1));
      const ic = icon('ui:skull', 40);
      // countdown ring
      if (G.wave > 0 && G.nextIn > 0) {
        g.strokeStyle = '#c8443a'; g.lineWidth = 3;
        g.beginPath(); g.arc(0, -6, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (G.nextIn / 22)); g.stroke();
      }
      g.drawImage(ic.c, -20, -26, 40, 40);
      g.restore();
      if (G.wave === 0) text(g, 'Start!', fx, fy + 28, { size: 16, align: 'center', color: '#5a1e22', stroke: '#f3e9d2', strokeW: 3 });
      if (hov) this.waveTip = { x: fx, y: fy };
    }
  }

  drawRally(g, t) {
    const r = t.rally;
    if (!r) return;
    g.save();
    g.strokeStyle = '#5a4030'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(r.x, r.y); g.lineTo(r.x, r.y - 20); g.stroke();
    g.fillStyle = '#c4433a'; g.beginPath(); g.moveTo(r.x, r.y - 20); g.lineTo(r.x + 11, r.y - 16); g.lineTo(r.x, r.y - 12); g.fill();
    g.restore();
  }

  drawCursor(g) {
    const m = this.mouse;
    if (this.mode === 'wash' || this.mode === 'wall') {
      const st = this.stroke;
      const wash = this.mode === 'wash';
      const max = wash ? 220 : 110 * this.game.mods.wallLen;
      g.save();
      g.lineCap = 'round';
      if (st) {
        let x2 = st.x2, y2 = st.y2;
        const L = Math.hypot(x2 - st.x1, y2 - st.y1);
        if (L > max) { x2 = st.x1 + (x2 - st.x1) * max / L; y2 = st.y1 + (y2 - st.y1) * max / L; }
        g.strokeStyle = wash ? 'rgba(58,94,200,0.35)' : 'rgba(35,28,46,0.45)';
        g.lineWidth = wash ? 68 * this.game.mods.washWide : 14;
        g.beginPath(); g.moveTo(st.x1, st.y1); g.lineTo(x2, y2); g.stroke();
        g.strokeStyle = wash ? '#3a5ec8' : '#231c2e'; g.lineWidth = 2; g.setLineDash([6, 4]);
        g.beginPath(); g.moveTo(st.x1, st.y1); g.lineTo(x2, y2); g.stroke();
      } else {
        g.strokeStyle = wash ? '#3a5ec8' : '#231c2e'; g.lineWidth = 2; g.setLineDash([4, 4]);
        g.beginPath(); g.arc(m.x, m.y, 10, 0, 7); g.stroke();
        text(g, wash ? 'drag along the road' : 'drag across the road', m.x, m.y - 18, { size: 14, align: 'center', color: '#f3e9d2', stroke: 'rgba(40,30,40,0.8)', strokeW: 3 });
      }
      g.restore();
    } else if (this.mode === 'rally') {
      const t = this.sel?.ref;
      const ok = t && inRange(t.x, t.y, m.x, m.y, t.def.range);
      g.save(); g.strokeStyle = ok ? '#5a7a3a' : '#c8443a'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(m.x, m.y); g.lineTo(m.x, m.y - 20); g.stroke();
      g.fillStyle = ok ? '#5a7a3a' : '#c8443a'; g.beginPath(); g.moveTo(m.x, m.y - 20); g.lineTo(m.x + 11, m.y - 16); g.lineTo(m.x, m.y - 12); g.fill(); g.restore();
    } else if (this.sel?.kind === 'hero') {
      g.save(); g.strokeStyle = 'rgba(216,178,74,0.8)'; g.lineWidth = 1.6; g.setLineDash([3, 3]);
      g.beginPath(); g.ellipse(m.x, m.y, 12, 5, 0, 0, 7); g.stroke(); g.restore();
    }
  }

  // ------------------------------------------------------------------ ring menu
  ringOptions() {
    const G = this.game, sel = this.sel;
    if (!sel) return [];
    const opts = [];
    if (sel.kind === 'slot') {
      const s = sel.ref, cx = s.x, cy = s.y - 18;
      const pos = [[-46, -30], [0, -60], [46, -30], [-36, 40], [36, 40]];
      BUILD.forEach((id, i) => {
        const d = TOWERS[id], cost = G.costOf(id);
        opts.push({ key: id, x: cx + pos[i][0], y: cy + pos[i][1], r: 21, icon: `${d.line}:${id}`, cost, can: G.gold >= cost, towerId: id,
          act: () => this.cmd({ k: 'build', slot: s.i, id }), tip: this.towerTip(id), pig: PIGMENT_OF[d.line] });
      });
    } else if (sel.kind === 'tower') {
      const t = sel.ref, cx = t.x, cy = t.y - 30, d = t.def;
      // in co-op a partner's tower is theirs to change - show whose it is
      if (G.players > 1 && t.owner !== this.me) {
        opts.push({ key: 'theirs', x: cx, y: cy - 50, r: 20, icon: `${d.line}:${t.type}`, can: false, act: () => 0, tip: { title: d.name, lines: [(this.guest ? 'The host' : 'Your partner') + ' built this one. Only they can upgrade or sell it.'] } });
        return opts;
      }
      const next = d.next || [];
      if (next.length === 1) {
        const id = next[0], cost = G.costOf(id);
        opts.push({ key: 'up', x: cx, y: cy - 50, r: 21, icon: `${TOWERS[id].line}:${id}`, cost, can: G.gold >= cost, towerId: id, act: () => this.cmd({ k: 'up', t: t.id, id }), tip: this.towerTip(id, t) });
      } else if (next.length >= 2) {
        const P3 = [[-54, -26], [0, -58], [54, -26]];
        next.forEach((id, i) => {
          const cost = G.costOf(id);
          opts.push({ key: id, x: cx + P3[i][0], y: cy + P3[i][1], r: 22, icon: `${TOWERS[id].line}:${id}`, cost, can: G.gold >= cost, towerId: id, path: TOWERS[id].path, act: () => this.cmd({ k: 'up', t: t.id, id }), tip: this.towerTip(id, t) });
        });
      }
      if (d.abilities) {
        d.abilities.forEach((ab, i) => {
          const r = t.ranks[ab] || 0, A = ABILITIES[ab];
          const cost = r < 3 ? A.cost[r] : 0;
          opts.push({ key: ab, x: cx + (i ? 52 : -52), y: cy - 14, r: 20, icon: `ability:${ab}`, cost: r < 3 ? cost : null, can: r < 3 && G.gold >= cost, rank: r,
            act: () => this.cmd({ k: 'ab', t: t.id, ab }), tip: { title: A.name + (r ? ` (rank ${r}/3)` : ''), lines: [r < 3 ? (r ? 'Next rank: ' : '') + A.desc(r) : A.desc(2), r < 3 ? '' : 'Fully trained.'] } });
        });
      }
      opts.push({ key: 'sell', x: cx, y: cy + 52, r: 16, icon: 'sell:sell', label: `${G.sellValue(t)}`, can: true, act: () => { this.cmd({ k: 'sell', t: t.id }); this.sel = null; }, tip: { title: 'Sell', lines: [`Refunds ${G.sellValue(t)} gold.`] } });
      if (d.soldier || d.beast) opts.push({ key: 'rally', x: cx + 42, y: cy + 40, r: 16, icon: 'ui:rally', can: true, act: () => { this.mode = 'rally'; return 'keep'; }, tip: { title: d.beast ? 'Home ground' : 'Rally point', lines: [d.beast ? 'Where the beast rests when there is nothing to hunt.' : d.field ? 'Send the wardens anywhere inside the circle.' : 'Choose where the soldiers stand.'] } });
    }
    return opts;
  }
  hoverOpt() {
    for (const o of this.ringOptions()) if (hitCircle(o.x, o.y, o.r + 3, this.mouse.x, this.mouse.y)) return o;
    if (this.pending) return this.ringOptions().find(o => o.key === this.pending);
    return null;
  }
  towerTip(id, from) {
    const d = TOWERS[id], G = this.game;
    const lines = [d.desc];
    const stat = [];
    if (d.beast) stat.push(`${d.beast.name}: ${d.beast.hp} hp, ${d.beast.dmg[0]}-${d.beast.dmg[1]} dmg${d.beast.fly ? ', flies' : ''}${d.beast.heads ? ', ' + d.beast.heads + ' heads' : ''}. Roams the whole map.`);
    else if (d.soldier?.ranged) stat.push(`${d.soldier.n || 3} ${d.soldier.name}s: ${d.soldier.hp} hp, arrows ${d.soldier.ranged.dmg[0]}-${d.soldier.ranged.dmg[1]}`);
    else if (d.soldier) stat.push(`Soldiers: ${d.soldier.hp} hp, ${d.soldier.dmg[0]}-${d.soldier.dmg[1]} dmg, armour ${Math.round(d.soldier.armor * 100)}%`);
    else if (d.beam) stat.push(`Beam: ${d.beam.start} to ${d.beam.max} damage a second, magic`);
    else if (d.dmg) stat.push(`Damage ${d.dmg[0]}-${d.dmg[1]} ${d.dtype === 'magic' ? 'magic' : ''}  every ${d.rate}s${d.splash ? '  (area)' : ''}`);
    if (!d.beast) stat.push(`Range ${Math.round(G.towerRange({ def: d }))}${d.air ? '' : '   - can\'t hit flyers'}`);
    if (d.abilities) stat.push('Abilities: ' + d.abilities.map(a => ABILITIES[a].name).join(', '));
    const pig = PIGMENT_OF[d.line];
    if (pig) {
      const others = Object.keys(PIGMENTS).filter(k => k !== pig);
      stat.push(`Paints foes ${PIGMENTS[pig].name.toUpperCase()}. ` + others.map(o => `+ ${PIGMENTS[o].name} = ${MIXES[[pig, o].sort().join('+')].name}`).join(',  ') + '.');
    }
    // choosing a path: say what it is for, first
    const P = d.path && d.level === 2 ? PATHS[d.path] : null;
    return { title: P ? `${P.name} path: ${d.name}` : d.name, lines: P ? [P.focus, ...lines, ...stat] : [...lines, ...stat] };
  }

  drawRing(g) {
    const opts = this.ringOptions();
    if (!opts.length) return;
    const sel = this.sel.ref;
    const cx = sel.x, cy = sel.y - (this.sel.kind === 'slot' ? 18 : 30);
    g.save();
    g.strokeStyle = 'rgba(42,34,48,0.45)'; g.lineWidth = 1.5;
    g.beginPath(); g.ellipse(cx, cy, 56, 52, 0, 0, 7); g.stroke();
    g.restore();
    const hov = this.hoverOpt();
    for (const o of opts) {
      const ic = icon(o.icon, 44);
      const h = hov === o;
      const s = (o.r * 2 + 4) * (h ? 1.12 : 1);
      g.save();
      if (!o.can) g.filter = 'grayscale(0.85) brightness(0.9)';
      g.drawImage(ic.c, o.x - s / 2, o.y - s / 2, s, s);
      g.restore();
      if (o.pig) {
        g.fillStyle = PIGMENTS[o.pig].col; g.strokeStyle = INKC; g.lineWidth = 1;
        g.beginPath(); g.arc(o.x + o.r * 0.7, o.y - o.r * 0.7, 5.5, 0, 7); g.fill(); g.stroke();
      }
      if (o.cost != null) {
        const lbl = `${o.cost}`;
        const w = measure(g, lbl, 15) + 14;
        card(g, o.x - w / 2, o.y + o.r - 3, w, 17, { tint: '#b8862a', fill: o.can ? '#f6ecd0' : '#e0d6c0', seed: 3, shadow: false });
        text(g, lbl, o.x, o.y + o.r + 10, { size: 15, align: 'center', color: o.can ? '#6a4a10' : '#9a3a30' });
      }
      if (o.label) text(g, o.label, o.x, o.y + o.r + 12, { size: 14, align: 'center', color: '#6a4a10', stroke: '#f3e9d2', strokeW: 3 });
      if (o.rank != null) for (let k = 0; k < 3; k++) { g.fillStyle = k < o.rank ? '#f0c040' : 'rgba(60,50,40,0.35)'; g.beginPath(); g.arc(o.x - 8 + k * 8, o.y - o.r - 4, 2.6, 0, 7); g.fill(); g.strokeStyle = INKC; g.lineWidth = 0.6; g.stroke(); }
      if (this.pending === o.key) { g.strokeStyle = '#5a7a3a'; g.lineWidth = 2.5; g.beginPath(); g.arc(o.x, o.y, o.r + 4, 0, 7); g.stroke(); text(g, 'tap again', o.x, o.y - o.r - 10, { size: 12, align: 'center', color: '#3a5a2a', stroke: '#f3e9d2', strokeW: 3 }); }
    }
    if (hov?.tip) this.tooltip(g, hov.tip, hov.x, hov.y);
  }

  tooltip(g, tip, ax, ay) {
    const w = 290;
    const lines = [];
    for (const l of tip.lines) if (l) lines.push(...wrap(g, l, w - 24, 15));
    const h = 34 + lines.length * 18;
    let x = ax + 40, y = ay - h / 2;
    if (x + w > 1270) x = ax - 40 - w;
    y = clamp(y, 70, 620 - h);
    card(g, x, y, w, h, { tint: '#5a4a96', seed: 11 });
    text(g, tip.title, x + 12, y + 24, { size: 20, title: true });
    lines.forEach((l, i) => text(g, l, x + 12, y + 44 + i * 18, { size: 15, color: '#3a3040' }));
  }

  // ------------------------------------------------------------------ HUD
  drawHUD(g) {
    const G = this.game;
    card(g, 10, 8, 312, 50, { tint: '#8a6a3a', seed: 21 });
    drawGlyph(g, 'heart', 34, 33, 26); text(g, `${G.lives}`, 52, 41, { size: 26, title: true, color: G.lives <= 5 ? '#a8352e' : INKC });
    drawGlyph(g, 'coin', 112, 33, 24); text(g, `${G.gold}`, 128, 41, { size: 26, title: true });
    if (G.players > 1) {
      card(g, 10, 60, 230, 30, { tint: '#3e64a8', seed: 22, shadow: false });
      const other = 1 - this.me;
      text(g, `${this.guest ? 'Host' : 'Partner'}: ${G.purse[other]} gold${this.partnerGone ? ' (left)' : ''}`, 22, 81, { size: 16, color: '#3a3040' });
    }
    drawGlyph(g, 'flag', 210, 33, 24); text(g, `${Math.max(1, G.wave)}/${G.totalWaves()}`, 226, 41, { size: 24, title: true });

    // speed + pause
    this.btnSpeed = { x: 1176, y: 10, w: 44, h: 44 };
    this.btnPause = { x: 1226, y: 10, w: 44, h: 44 };
    const ic1 = icon('ui:fast', 44), ic2 = icon('ui:menu', 44);
    g.drawImage(ic1.c, 1176, 10, 44, 44); g.drawImage(ic2.c, 1226, 10, 44, 44);
    text(g, `x${this.speed}`, 1198, 68, { size: 16, align: 'center', color: this.speed > 1 ? '#a8352e' : '#3a3040', stroke: '#f3e9d2', strokeW: 3, title: true });

    // hero portrait
    const H = this.myHero();
    if (H && H.b) {
      const b = H.b, hx = 46, hy = 676;
      this.btnHero = { x: hx - 30, y: hy - 30, w: 60, h: 60 };
      card(g, hx - 32, hy - 32, 64, 64, { tint: '#b8862a', seed: 31 });
      g.save(); g.beginPath(); g.arc(hx, hy, 27, 0, 7); g.clip();
      g.fillStyle = '#e8dcc0'; g.fillRect(hx - 30, hy - 30, 60, 60);
      const fr = unitSheet(b.look).walk[0];
      g.drawImage(fr.c, hx - fr.ax * 1.2 + 2, hy - fr.ay * 1.2 + 40, fr.w * 1.2, fr.h * 1.2);
      g.restore();
      if (!b.alive) { cooldownWipe(g, hx, hy, 27, b.respawnT / HEROES[H.id].respawn); text(g, `${Math.ceil(b.respawnT)}`, hx, hy + 8, { size: 24, align: 'center', color: '#f3e9d2', title: true }); }
      // hp arc
      g.strokeStyle = 'rgba(40,30,40,0.3)'; g.lineWidth = 4; g.beginPath(); g.arc(hx, hy, 29, 0, 7); g.stroke();
      g.strokeStyle = '#7aa84a'; g.beginPath(); g.arc(hx, hy, 29, Math.PI / 2, Math.PI / 2 + Math.PI * 2 * (b.hp / b.maxHp)); g.stroke();
      if (this.sel?.kind === 'hero') { g.strokeStyle = '#d8b24a'; g.lineWidth = 2.5; g.beginPath(); g.arc(hx, hy, 33, 0, 7); g.stroke(); }
      card(g, hx + 14, hy + 10, 24, 20, { tint: '#b8862a', fill: '#f6e6b0', seed: 4, shadow: false });
      text(g, `${H.level}`, hx + 26, hy + 26, { size: 16, align: 'center', title: true });
      // skill cooldown pip
      const sk = HEROES[H.id].skill;
      const frac = Math.max(0, b.abT.skill) / sk.every;
      g.fillStyle = frac <= 0 ? '#f0c040' : 'rgba(60,50,40,0.4)';
      g.beginPath(); g.arc(hx - 24, hy + 22, 5, 0, 7); g.fill();
    }
    // spells
    const spells = [['wash', 'ui:wash', 'The Wash', 'Drag along the road: a wave that shoves foes back and paints them blue.'], ['wall', 'ui:wall', 'Ink Wall', 'Drag across the road: a wall of ink they must hack through.']];
    this.btnSpells = [];
    spells.forEach(([key, ic, name], i) => {
      const x = 126 + i * 64, y = 676;
      const s = G.spells[key];
      const b = { key, x: x - 27, y: y - 27, w: 54, h: 54, name };
      this.btnSpells.push(b);
      const im = icon(ic, 54);
      g.drawImage(im.c, x - 27, y - 27, 54, 54);
      if (s.cd > 0) { cooldownWipe(g, x, y, 23, s.cd / s.max); text(g, `${Math.ceil(s.cd)}`, x, y + 7, { size: 20, align: 'center', color: '#f3e9d2', title: true }); }
      if (this.mode === key) { g.strokeStyle = '#c8443a'; g.lineWidth = 3; g.beginPath(); g.arc(x, y, 28, 0, 7); g.stroke(); }
      text(g, `${i + 1}`, x + 18, y + 26, { size: 13, color: '#6a5a4a' });
    });

    this.drawPalette(g);
    // wave tooltip
    if (this.waveTip) {
      const w = this.L.waves[G.wave];
      if (w) {
        const counts = {};
        for (const grp of w) counts[grp.kind] = (counts[grp.kind] || 0) + grp.n;
        const ks = Object.keys(counts);
        const bw = Math.max(330, 60 + ks.length * 64), bh = 92;
        let x = clamp(this.waveTip.x - bw / 2, 10, 1270 - bw), y = this.waveTip.y + 30;
        if (y + bh > 710) y = this.waveTip.y - 30 - bh;
        card(g, x, y, bw, bh, { tint: '#5a1e22', seed: 41 });
        text(g, G.wave === 0 ? 'Click to begin the battle' : `Call wave ${G.wave + 1} early: +${Math.round(G.nextIn * 1.4)} gold`, x + 12, y + 22, { size: 16 });
        ks.forEach((k, i) => {
          const fr = unitSheet(k).walk[0];
          const sc = Math.min(1, 34 / fr.h * 1.4);
          g.drawImage(fr.c, x + 30 + i * 64 - fr.ax * sc, y + 74 - fr.ay * sc, fr.w * sc, fr.h * sc);
          text(g, `x${counts[k]}`, x + 46 + i * 64, y + 82, { size: 16, title: true });
          if (ENEMIES[k].fly) drawGlyph(g, 'wing', x + 52 + i * 64, y + 46, 14);
        });
      }
      this.waveTip = null;
    }
  }

  // THE PALETTE: the three mixes, always in view, bottom right. It is the
  // rule that makes this game itself, so it is never more than a glance away.
  drawPalette(g) {
    const x = 1012, y = 640, w = 258, h = 70;
    card(g, x, y, w, h, { tint: '#8a6a3a', seed: 27 });
    const P = PIGMENTS;
    const rows = [['ochre', 'ultra'], ['ochre', 'verm'], ['ultra', 'verm']];
    rows.forEach(([a, b], i) => {
      const yy = y + 16 + i * 19, M = MIXES[[a, b].sort().join('+')];
      for (const [k, cx] of [[a, x + 16], [b, x + 34]]) { g.fillStyle = P[k].col; g.beginPath(); g.arc(cx, yy, 6, 0, 7); g.fill(); }
      text(g, '=', x + 46, yy + 5, { size: 14, color: '#6a5a4a' });
      g.fillStyle = M.col; g.beginPath(); g.arc(x + 64, yy, 7, 0, 7); g.fill(); g.strokeStyle = INKC; g.lineWidth = 0.8; g.stroke();
      text(g, M.name, x + 76, yy + 5, { size: 14, title: true });
      text(g, M.k === 'hex' ? '+35% dmg' : M.k === 'bloom' ? 'root + thorns' : 'fire burst', x + w - 10, yy + 5, { size: 12, align: 'right', color: '#6a5a4a' });
    });
  }

  drawInfo(g) {
    const s = this.sel;
    if (!s || !['enemy', 'hero', 'soldier'].includes(s.kind)) return;
    const u = s.ref;
    const x = 420, y = 640, w = 440, h = 72;
    card(g, x, y, w, h, { tint: s.kind === 'enemy' ? '#5a1e22' : '#3e64a8', seed: 51 });
    const fr = unitSheet(s.kind === 'enemy' ? u.kind : u.look).walk[0];
    const sc = Math.min(1.2, 56 / fr.h * 1.3);
    g.save(); g.beginPath(); g.rect(x + 6, y + 4, 60, h - 8); g.clip();
    g.drawImage(fr.c, x + 36 - fr.ax * sc, y + h - 8 - fr.ay * sc + fr.ay * sc * 0.0, fr.w * sc, fr.h * sc);
    g.restore();
    if (s.kind === 'enemy') {
      const d = u.def;
      text(g, d.name, x + 74, y + 24, { size: 21, title: true });
      drawGlyph(g, 'heart', x + 84, y + 44, 16); text(g, `${Math.ceil(u.hp)}/${u.maxHp}`, x + 96, y + 50, { size: 16 });
      drawGlyph(g, 'shield', x + 190, y + 44, 16); text(g, word(d.armor), x + 202, y + 50, { size: 16 });
      drawGlyph(g, 'magicshield', x + 280, y + 44, 16); text(g, word(d.mr), x + 292, y + 50, { size: 16 });
      drawGlyph(g, 'heart', x + 370, y + 44, 14); text(g, `-${d.lives}`, x + 381, y + 50, { size: 16, color: '#a8352e' });
      text(g, d.fly ? 'Flying' : d.ranged ? 'Ranged' : d.boss ? 'Boss' : '', x + 84, y + 66, { size: 13, color: '#6a5a4a' });
    } else {
      const name = s.kind === 'hero' ? HEROES[u.H.id].name : (u.owner?.def.beast?.name || u.owner?.def.soldier?.name || 'Farmer');
      text(g, name, x + 74, y + 24, { size: 21, title: true });
      drawGlyph(g, 'heart', x + 84, y + 44, 16); text(g, `${Math.ceil(u.hp)}/${Math.round(u.maxHp)}`, x + 96, y + 50, { size: 16 });
      drawGlyph(g, 'sword', x + 190, y + 44, 16); text(g, `${Math.round(u.dmg[0])}-${Math.round(u.dmg[1])}`, x + 202, y + 50, { size: 16 });
      drawGlyph(g, 'shield', x + 280, y + 44, 16); text(g, word(u.armor), x + 292, y + 50, { size: 16 });
      if (s.kind === 'hero') text(g, `${HEROES[u.H.id].skill.name}: ${HEROES[u.H.id].skill.desc(u.H.level)}`, x + 84, y + 66, { size: 13, color: '#6a5a4a' });
    }
  }

  drawCards(g) {
    // "new enemy" notes slide in from the right
    let y = 90;
    for (const c of this.cards.slice(0, 2)) {
      const d = ENEMIES[c.kind];
      const k = Math.min(1, c.t * 3, (c.life - c.t) * 2);
      const x = 1280 - 290 * easeOutBack(Math.max(0, k));
      card(g, x, y, 280, 96, { tint: '#5a1e22', seed: 61 });
      const fr = unitSheet(c.kind).walk[0];
      const sc = Math.min(1.4, 64 / fr.h * 1.3);
      g.save(); g.beginPath(); g.rect(x + 4, y + 4, 70, 88); g.clip();
      g.drawImage(fr.c, x + 40 - fr.ax * sc, y + 86 - fr.ay * sc, fr.w * sc, fr.h * sc);
      g.restore();
      text(g, 'New foe!', x + 80, y + 20, { size: 14, color: '#a8352e' });
      text(g, d.name, x + 80, y + 40, { size: 20, title: true });
      para(g, d.lore, x + 80, y + 58, 192, { size: 13, lh: 14, color: '#3a3040' });
      y += 104;
    }
  }

  // ------------------------------------------------------------------ overlays
  overlayDim(g, a = 0.45) { g.fillStyle = `rgba(30,20,25,${a})`; g.fillRect(0, 0, 1280, 720); }

  drawBrief(g) {
    this.overlayDim(g, 0.35);
    const x = 300, y = 120, w = 680, h = 470;
    card(g, x, y, w, h, { tint: '#8a6a3a', seed: 71 });
    text(g, `Act ${['I', 'II', 'III'][this.L.act - 1]} - Battle ${this.L.id}`, 640, y + 40, { size: 18, align: 'center', color: '#8a6a3a' });
    text(g, this.L.name, 640, y + 86, { size: 46, align: 'center', title: true });
    para(g, this.L.brief, x + 50, y + 130, w - 100, { size: 19, lh: 25 });
    if (this.newKinds.length) {
      text(g, 'New foes on this road:', x + 50, y + 300, { size: 16, color: '#a8352e' });
      this.newKinds.slice(0, 7).forEach((k, i) => {
        const fr = unitSheet(k).walk[0];
        const sc = Math.min(1.2, 40 / fr.h * 1.4);
        g.drawImage(fr.c, x + 80 + i * 82 - fr.ax * sc, y + 366 - fr.ay * sc, fr.w * sc, fr.h * sc);
        text(g, ENEMIES[k].name, x + 80 + i * 82, y + 384, { size: 13, align: 'center' });
      });
    }
    text(g, this.L.tip, 640, y + 418, { size: 15, align: 'center', color: '#6a5a4a' });
    this.btnBegin = button(g, { x: 640 - 110, y: y + h - 36, w: 220, h: 54, label: 'To Battle!' }, hit({ x: 530, y: y + h - 36, w: 220, h: 54 }, this.mouse.x, this.mouse.y), { tint: '#a8352e' });
  }

  drawPause(g) {
    this.overlayDim(g);
    if (this.coop) {
      // no restart or quitting to the map from one side of a shared battle
      const x = 470, y = 220, w = 340, h = 230;
      card(g, x, y, w, h, { tint: '#3e64a8', seed: 81 });
      text(g, 'Paused', 640, y + 56, { size: 40, align: 'center', title: true });
      this.pauseBtns = [{ k: 'resume', x: 520, y: y + 90, w: 240, h: 46, label: 'Resume' }, { k: 'leave', x: 520, y: y + 146, w: 240, h: 46, label: 'Leave the battle' }];
      for (const b of this.pauseBtns) button(g, b, hit(b, this.mouse.x, this.mouse.y), { size: 22 });
      return;
    }
    const x = 470, y = 150, w = 340, h = 430;
    card(g, x, y, w, h, { tint: '#3e64a8', seed: 81 });
    text(g, 'Paused', 640, y + 56, { size: 40, align: 'center', title: true });
    const s = this.save;
    const labels = [['resume', 'Resume'], ['restart', 'Restart'], ['map', 'World Map'], ['sfx', `Sound: ${s.sfx ? 'on' : 'off'}`], ['music', `Music: ${s.music ? 'on' : 'off'}`], ['paint', `Painting: ${(s.paint ?? true) ? 'on' : 'off'}`]];
    this.pauseBtns = labels.map(([k, l], i) => {
      const b = { k, x: 640 - 120, y: y + 86 + i * 56, w: 240, h: 46, label: l };
      button(g, b, hit(b, this.mouse.x, this.mouse.y), { size: 22 });
      return b;
    });
  }

  drawEnd(g) {
    const won = this.state === 'won';
    const t = this.endT;
    this.overlayDim(g, Math.min(0.5, t));
    if (t < 0.4) return;
    const x = 380, y = 140, w = 520, h = 420;
    card(g, x, y, w, h, { tint: won ? '#b8862a' : '#5a1e22', seed: 91 });
    text(g, won ? 'Victory!' : 'The gate has fallen', 640, y + 66, { size: won ? 56 : 42, align: 'center', title: true, color: won ? '#6a4a10' : '#5a1e22' });
    const r = this.result;
    if (won) {
      for (let i = 0; i < 3; i++) {
        const show = t > 0.8 + i * 0.35;
        if (show && !this['starSfx' + i]) { this['starSfx' + i] = true; if (i < r.stars) sfx('star'); }
        const sz = i === 1 ? 74 : 60;
        const pop = show ? easeOutBack(Math.min(1, (t - 0.8 - i * 0.35) * 3)) : 0;
        drawGlyph(g, i < r.stars && show ? 'star' : 'starEmpty', 640 + (i - 1) * 90, y + 140 + (i === 1 ? -10 : 0), sz * Math.max(0.01, pop || (show ? 1 : 0.6)));
      }
      text(g, `Lives remaining: ${this.game.lives} / 20`, 640, y + 220, { size: 20, align: 'center' });
    } else {
      para(g, 'The Inklings poured through the gate. Regroup, rethink the build, and try again.', x + 60, y + 130, w - 120, { size: 20, align: 'left' });
      text(g, `You reached wave ${this.game.wave} of ${this.game.totalWaves()}.`, 640, y + 220, { size: 20, align: 'center' });
    }
    if (this.myHero()) {
      const H = HEROES[this.myHero().id];
      text(g, `${H.name}: +${r.xpGained} experience  (level ${r.heroLevel})`, 640, y + 256, { size: 18, align: 'center', color: '#3a5a2a' });
    }
    drawGlyph(g, 'coin', 600, y + 316, 22);
    text(g, `+${r.coins} coins   (${this.save.coins} to spend in the Hall)`, 616, y + 323, { size: 18, color: '#6a4a10' });
    if (won && r.first && this.L.id === 3) text(g, 'Ysolde Fenwhistle will join you!', 640, y + 288, { size: 18, align: 'center', color: '#3e64a8' });
    if (won && r.first && this.L.id === 7) text(g, 'Moss Maurice will join you!', 640, y + 288, { size: 18, align: 'center', color: '#3e64a8' });
    let b1 = { k: won ? 'continue' : 'retry', x: 640 - 230, y: y + h - 90, w: 210, h: 54, label: won ? 'Continue' : 'Try Again' };
    let b2 = { k: won ? 'replay' : 'map', x: 640 + 20, y: y + h - 90, w: 210, h: 54, label: won ? 'Replay' : 'World Map' };
    if (this.coop) {
      // together: the host picks what happens next; the guest waits for it
      b1 = { k: 'lobby', x: 640 - 105, y: y + h - 90, w: 210, h: 54, label: this.guest ? 'Back to the lobby' : 'Choose the next battle' };
      this.endBtns = [b1];
    } else this.endBtns = [b1, b2];
    for (const b of this.endBtns) button(g, b, hit(b, this.mouse.x, this.mouse.y), { tint: won ? '#b8862a' : '#5a1e22' });
  }

  // ================================================================== input
  towerAt(x, y) {
    for (const t of this.game.towers) if (Math.abs(x - t.x) < 26 && y > t.y - 70 && y < t.y + 12) return t;
    return null;
  }
  slotAt(x, y) { return this.game.slots.find(s => !s.tower && hitCircle(s.x, s.y - 4, 26, x, y)) || null; }
  unitAt(x, y) {
    let best = null, bd = 1e9;
    for (const e of this.game.enemies) {
      const ey = e.fly ? e.y - 34 : e.y - 12 * e.size;
      const d = Math.hypot(e.x - x, ey - y);
      if (d < 16 * Math.max(1, e.size) && d < bd) { bd = d; best = { kind: 'enemy', ref: e }; }
    }
    for (const b of this.game.blockers) {
      if (!b.alive) continue;
      const d = Math.hypot(b.x - x, b.y - 14 - y);
      if (d < 16 && d < bd) { bd = d; best = { kind: b.kind === 'hero' ? 'hero' : 'soldier', ref: b }; }
    }
    return best;
  }

  pointerMove(x, y) {
    this.mouse.x = x; this.mouse.y = y;
    if (this.stroke) { this.stroke.x2 = x; this.stroke.y2 = y; }
  }
  pointerUp(x, y) {
    const st = this.stroke;
    if (!st || !(this.mode === 'wash' || this.mode === 'wall')) { this.stroke = null; return; }
    st.x2 = x; st.y2 = y;
    let { x1, y1, x2, y2 } = st;
    this.stroke = null;
    // a click rather than a drag: the wash runs along the road there, the
    // wall lies across it (the game works out which way the road goes)
    if (Math.hypot(x2 - x1, y2 - y1) < 18 && this.mode === 'wash') {
      let best = null;
      for (const p of this.game.paths) { if (p.air) continue; for (const q of p.pts) { const d = Math.hypot(q.x - x1, q.y - y1); if (!best || d < best.d) best = { d, q }; } }
      if (best) { const a = best.q.ang || 0; x1 = best.q.x - Math.cos(a) * 70; y1 = best.q.y - Math.sin(a) * 70; x2 = best.q.x + Math.cos(a) * 70; y2 = best.q.y + Math.sin(a) * 70; }
    }
    const ok = this.cmd({ k: this.mode, x1, y1, x2, y2 });
    if (ok) this.mode = null; else sfx('click');
  }

  pointerDown(x, y, e) {
    this.mouse.x = x; this.mouse.y = y;
    const touch = e?.pointerType === 'touch' || e?.pointerType === 'pen';
    const right = e?.button === 2;
    if (this.state === 'brief') { if (hit(this.btnBegin, x, y)) { sfx('click'); this.state = 'play'; } return; }
    if (this.state === 'paused') {
      for (const b of this.pauseBtns || []) if (hit(b, x, y)) {
        sfx('click');
        if (b.k === 'resume') { if (this.coop) this.cmd({ k: 'resume' }); this.state = 'play'; }
        if (b.k === 'leave') { this.coop.net.close(); this.app.coop = null; this.app.go('title'); return; }
        if (b.k === 'restart') { this.reset(); this.state = 'play'; }
        if (b.k === 'map') this.app.go('worldmap');
        if (b.k === 'sfx') this.app.toggleSfx();
        if (b.k === 'music') this.app.toggleMusic();
        if (b.k === 'paint') this.app.togglePaint();
      }
      return;
    }
    if (this.state === 'won' || this.state === 'lost') {
      if (this.endT < 1) return;
      for (const b of this.endBtns || []) if (hit(b, x, y)) {
        sfx('click');
        if (b.k === 'lobby') { this.app.go(this.guest ? 'lobby' : 'worldmap', { keep: true }); return; }
        if (b.k === 'continue') this.app.afterVictory(this.L.id, this.result.first);
        if (b.k === 'replay' || b.k === 'retry') { this.reset(); this.state = 'play'; }
        if (b.k === 'map') this.app.go('worldmap');
      }
      return;
    }
    const G = this.game;
    if (right) { this.cancel(); if (this.sel?.kind === 'hero') { this.cmd({ k: 'hero', x, y }); this.sel = null; } return; }

    // HUD buttons
    if (hit(this.btnPause, x, y)) { sfx('click'); this.state = 'paused'; if (this.coop) this.cmd({ k: 'pause' }); return; }
    if (hit(this.btnSpeed, x, y) && this.guest) { sfx('click'); return; }   // the host keeps the clock
    if (hit(this.btnSpeed, x, y)) { sfx('click'); this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 3 : 1; this.save.speed = this.speed; writeSave(this.save); return; }
    if (hit(this.btnHero, x, y) && this.myHero()) { sfx('click'); this.mode = null; this.sel = this.sel?.kind === 'hero' ? null : { kind: 'hero', ref: this.myHero().b }; return; }
    for (const b of this.btnSpells || []) if (hit(b, x, y)) { this.toggleSpell(b.key); return; }

    // a spell: the stroke starts here and is cast when the pointer comes up
    if (this.mode === 'wash' || this.mode === 'wall') {
      if (y > 620 && x < 360) { this.cancel(); return; }
      this.stroke = { x1: x, y1: y, x2: x, y2: y };
      return;
    }
    if (this.mode === 'rally') {
      const t = this.sel?.ref;
      if (t && inRange(t.x, t.y, x, y, t.def.range)) { this.cmd({ k: 'rally', t: t.id, x, y }); sfx('rally'); this.mode = null; this.sel = null; }
      else { sfx('click'); this.mode = null; }
      return;
    }

    // ring options
    for (const o of this.ringOptions()) {
      if (!hitCircle(o.x, o.y, o.r + 3, x, y)) continue;
      if (!o.can) { sfx('click'); return; }
      if (touch && this.pending !== o.key && o.key !== 'rally') { this.pending = o.key; sfx('click'); return; }
      const r = o.act();
      this.drain();
      this.pending = null;
      if (r !== 'keep' && o.key !== 'sell') {
        // stay on the tower after upgrading so you can keep buying
        if (this.sel?.kind === 'slot') { const t = this.sel.ref.tower; this.sel = t ? { kind: 'tower', ref: t } : null; this.sel = null; }
      }
      return;
    }

    // wave flags
    if (G.canCallWave()) {
      const ps = G.nextWavePaths();
      for (const en of G.entries) {
        if (!ps.has(en.path)) continue;
        const fx = clamp(en.x, 36, 1244), fy = clamp(en.y, 96, 690);
        if (hitCircle(fx, fy - 6, 24, x, y)) {
          const bonus = this.cmd({ k: 'wave' });
          if (bonus > 0) { this.fx.add({ k: 'text', text: `+${bonus} gold`, x: fx, y: fy - 30, col: '#8a6a10', size: 20, life: 1.6 }); sfx('coin'); }
          return;
        }
      }
    }

    // hero ordered to move
    if (this.sel?.kind === 'hero') {
      const u = this.unitAt(x, y);
      if (u?.kind === 'hero') { this.sel = null; return; }
      if (this.cmd({ k: 'hero', x, y })) { sfx('rally'); this.fx.add({ k: 'ring', x, y, r0: 4, r1: 18, col: '#d8b24a', w: 2, life: 0.4 }); }
      this.sel = null;
      return;
    }

    // world clicks
    this.pending = null;
    const t = this.towerAt(x, y);
    if (t) { sfx('click'); this.sel = this.sel?.ref === t ? null : { kind: 'tower', ref: t }; return; }
    // a click on your own hero picks them up (a partner's hero is theirs)
    const hu = this.unitAt(x, y);
    if (hu?.kind === 'hero' && hu.ref.H && hu.ref.H.idx !== this.me) { sfx('click'); this.sel = { kind: 'soldier', ref: hu.ref }; return; }
    const s = this.slotAt(x, y);
    if (s) { sfx('click'); this.sel = this.sel?.ref === s ? null : { kind: 'slot', ref: s }; return; }
    const u = this.unitAt(x, y);
    if (u) { sfx('click'); this.sel = u; return; }
    this.sel = null;
  }
  toggleSpell(key) {
    const s = this.game.spells[key];
    if (s.cd > 0) { sfx('click'); return; }
    sfx('click');
    this.sel = null;
    this.stroke = null;
    this.mode = this.mode === key ? null : key;
  }
  cancel() { this.mode = null; this.pending = null; this.stroke = null; }

  key(k) {
    if (k === 'Escape') {
      if (this.mode || this.sel) { this.cancel(); this.sel = null; }
      else if (this.state === 'play') { this.state = 'paused'; if (this.coop) this.cmd({ k: 'pause' }); }
      else if (this.state === 'paused') { this.state = 'play'; if (this.coop) this.cmd({ k: 'resume' }); }
      return;
    }
    if (this.state !== 'play') { if ((k === 'Enter' || k === ' ') && this.state === 'brief') this.state = 'play'; return; }
    if (k === '1') this.toggleSpell('wash');
    if (k === '2') this.toggleSpell('wall');
    if (k === 'h' || k === 'H') { if (this.myHero()) this.sel = { kind: 'hero', ref: this.myHero().b }; }
    if ((k === 'f' || k === 'F') && this.guest) return;
    if (k === 'f' || k === 'F') { this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 3 : 1; this.save.speed = this.speed; }
    if (k === ' ' || k === 'w' || k === 'W') { const b = this.cmd({ k: 'wave' }); if (b > 0) sfx('coin'); }
    if (k === 'p' || k === 'P') { this.state = 'paused'; if (this.coop) this.cmd({ k: 'pause' }); }
  }
}

// Light comes from the upper left, so everything throws a soft shadow down
// and to the right, flattened onto the ground.
const TOWER_K = 1.14;
const UNIT_K = 1.28; // characters are drawn larger than they were painted (1.15 until 2026-10-07: too small to read)
function castShadow(g, spr, x, y, flip, alpha = 1, lift = 0, a0 = 0.26, k = 1) {
  if (!spr.sh) return;
  g.save();
  g.globalAlpha = a0 * alpha;
  g.translate(x + lift * 0.6, y + lift * 0.25);
  g.transform(1, 0, -0.85, -0.42, 0, 0);
  if (k !== 1) g.scale(k, k);
  if (flip) g.scale(-1, 1);
  g.drawImage(spr.sh, -spr.ax, -spr.ay, spr.w, spr.h);
  g.restore();
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// a unit frame flooded with one colour, keeping its shape: the stain overlay
const _tint = new Map();
function tinted(fr, col) {
  const key = col;
  let m = _tint.get(fr);
  if (!m) { m = {}; _tint.set(fr, m); }
  if (m[key]) return m[key];
  const c = makeCanvas(fr.c.width, fr.c.height);
  const g = c.getContext('2d');
  g.drawImage(fr.c, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = col; g.fillRect(0, 0, c.width, c.height);
  m[key] = c;
  return c;
}
function easeOutBack(t) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
function word(v) { return v <= 0 ? 'none' : v < 0.3 ? 'low' : v < 0.6 ? 'medium' : v < 0.8 ? 'high' : 'great'; }

let _arrow = null;
function arrowTex() {
  if (_arrow) return _arrow;
  const c = document.createElement('canvas'); c.width = 30; c.height = 30;
  const g = c.getContext('2d'); g.translate(15, 15); g.rotate(-0.9);
  g.strokeStyle = '#5a4030'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-8, 0); g.lineTo(2, 0); g.stroke();
  g.strokeStyle = '#e8e0d0'; g.beginPath(); g.moveTo(-8, 0); g.lineTo(-10, -2.5); g.moveTo(-8, 0); g.lineTo(-10, 2.5); g.stroke();
  _arrow = { c, w: 15, h: 15 };
  return _arrow;
}
