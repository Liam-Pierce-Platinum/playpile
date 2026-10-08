// screens.js - everything outside a battle: title, story, world map, the
// Royal Atelier (star upgrades), the hero hall and the encyclopaedia.

import { text, para, card, button, hit, hitCircle, drawGlyph, wrap, measure, INKC } from './ui.js';
import { titleArt, storyPanel, worldMapArt } from './scenes.js';
import { unitSheet, towerSprite, icon } from './sprites.js';
import { PROLOGUE, ACT_INTROS, ENDING } from './data/story.js';
import { LEVELS, ACT_NAMES } from './data/levels.js';
import { HEROES, HERO_ORDER, heroLevel, heroStats, XP_LEVELS, heroOwned } from './data/heroes.js';
import { Net } from './net.js';
import { ENEMIES, ENEMY_ORDER } from './data/enemies.js';
import { TOWERS, ABILITIES } from './data/towers.js';
import { PIGMENT_OF, PIGMENTS } from './game.js';
import { UPGRADES, UPGRADE_ORDER, UPGRADE_COSTS } from './data/upgrades.js';
import { totalStars, spentStars, unlockedLevel, writeSave, blankSave } from './save.js';
import { sfx, setMood } from './audio.js';

// ================================================================== title
export class Title {
  constructor(app) { this.app = app; this.mouse = { x: 0, y: 0 }; this.t = 0; setMood('map'); }
  update(dt) { this.t += dt; }
  drawWorld(g) {
    const a = titleArt(this.app.artScale);
    g.drawImage(a.c, 0, 0, 1280, 720);
  }
  draw(g) {
    const bob = Math.sin(this.t * 1.2) * 3;
    text(g, 'INKVALE', 640, 170 + bob, { size: 128, align: 'center', title: true, color: '#2a2230', shadow: 'rgba(243,233,210,0.8)' });
    text(g, 'a tower defence in ink & watercolour, where the colours mix', 640, 214, { size: 26, align: 'center', color: '#4a3a40' });
    const has = Object.keys(this.app.save.stars).length > 0;
    this.btns = [
      { k: 'play', x: 540, y: 300, w: 200, h: 58, label: has ? 'Continue' : 'Begin' },
      { k: 'together', x: 540, y: 370, w: 200, h: 50, label: 'Play Together' },
      { k: 'ency', x: 540, y: 430, w: 200, h: 50, label: 'Encyclopaedia' },
      ...(has ? [{ k: 'new', x: 540, y: 492, w: 200, h: 44, label: 'New Game' }] : []),
    ];
    for (const b of this.btns) button(g, b, hit(b, this.mouse.x, this.mouse.y), { size: b.k === 'play' ? 28 : 22, tint: b.k === 'play' ? '#a8352e' : b.k === 'together' ? '#3e64a8' : '#8a6a3a' });
    if (this.confirmNew) {
      card(g, 440, 300, 400, 180, { tint: '#5a1e22', seed: 5 });
      para(g, 'Start over? Your stars, upgrades and hero levels will be wiped.', 470, 340, 340, { size: 20 });
      this.cBtns = [{ k: 'yes', x: 470, y: 410, w: 160, h: 48, label: 'Wipe it' }, { k: 'no', x: 650, y: 410, w: 160, h: 48, label: 'Keep it' }];
      for (const b of this.cBtns) button(g, b, hit(b, this.mouse.x, this.mouse.y), { size: 22 });
    }
    text(g, 'Click to place towers - right-click or Esc to cancel', 640, 700, { size: 16, align: 'center', color: 'rgba(243,233,210,0.85)' });
  }
  pointerMove(x, y) { this.mouse = { x, y }; }
  pointerDown(x, y) {
    if (this.confirmNew) {
      for (const b of this.cBtns) if (hit(b, x, y)) { sfx('click'); if (b.k === 'yes') { const s = blankSave(); s.sfx = this.app.save.sfx; s.music = this.app.save.music; this.app.save = s; writeSave(s); } this.confirmNew = false; }
      return;
    }
    for (const b of this.btns || []) if (hit(b, x, y)) {
      sfx('click');
      if (b.k === 'play') {
        if (!this.app.save.story.prologue) this.app.go('story', { panels: PROLOGUE, then: () => { this.app.save.story.prologue = 1; writeSave(this.app.save); this.app.go('worldmap'); } });
        else this.app.go('worldmap');
      }
      if (b.k === 'ency') this.app.go('ency', { back: 'title' });
      if (b.k === 'together') this.app.go('lobby');
      if (b.k === 'new') this.confirmNew = true;
    }
  }
}

// ================================================================== story
export class Story {
  constructor(app, o) { this.app = app; this.panels = o.panels; this.then = o.then; this.i = 0; this.t = 0; this.mouse = { x: 0, y: 0 }; sfx('page'); }
  update(dt) { this.t += dt; }
  drawWorld(g) {
    g.fillStyle = '#2b2320'; g.fillRect(0, 0, 1280, 720);
    const P = this.panels[this.i];
    const art = storyPanel(P.scene, this.app.artScale);
    const fade = Math.min(1, this.t * 2.5);
    g.save(); g.globalAlpha = fade;
    card(g, 250, 36, 780, 420, { tint: '#8a6a3a', seed: 1, fill: '#efe2c4' });
    g.drawImage(art.c, 260, 46, 760, 400);
    g.restore();
  }
  draw(g) {
    const P = this.panels[this.i];
    card(g, 200, 480, 880, 190, { tint: '#8a6a3a', seed: 2 });
    let y = 524;
    if (P.title) { text(g, P.title, 640, y, { size: 34, align: 'center', title: true, color: '#5a1e22' }); y += 36; }
    // typewriter
    const n = Math.floor(this.t * 60);
    const shown = P.text.slice(0, n);
    para(g, shown, 240, y, 800, { size: 22, lh: 28 });
    text(g, `${this.i + 1} / ${this.panels.length}   click to continue`, 1060, 656, { size: 15, align: 'right', color: '#8a7a6a' });
    this.skip = { x: 1150, y: 670, w: 110, h: 38, label: 'Skip' };
    button(g, this.skip, hit(this.skip, this.mouse.x, this.mouse.y), { size: 18 });
  }
  pointerMove(x, y) { this.mouse = { x, y }; }
  pointerDown(x, y) {
    if (hit(this.skip, x, y)) { sfx('click'); this.then(); return; }
    const P = this.panels[this.i];
    if (this.t * 60 < P.text.length) { this.t = 99; return; }
    sfx('page');
    this.i++; this.t = 0;
    if (this.i >= this.panels.length) this.then();
  }
  key(k) { if (k === 'Escape') this.then(); else if (k === ' ' || k === 'Enter') this.pointerDown(-1, -1); }
}

// ================================================================== world map
export class WorldMap {
  constructor(app) { this.app = app; this.mouse = { x: 0, y: 0 }; this.t = 0; this.pick = null; setMood('map'); }
  update(dt) { this.t += dt; }
  drawWorld(g) {
    const s = this.app.save;
    g.drawImage(worldMapArt(LEVELS, this.app.artScale).c, 0, 0, 1280, 720);
    const open = unlockedLevel(s);
    // route
    g.save(); g.strokeStyle = 'rgba(90,60,40,0.65)'; g.lineWidth = 3; g.setLineDash([2, 9]); g.lineCap = 'round';
    g.beginPath();
    LEVELS.forEach((L, i) => { if (L.id > open) return; const [x, y] = L.map; i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.stroke(); g.restore();
  }
  draw(g) {
    const s = this.app.save;
    const open = unlockedLevel(s);
    this.flags = [];
    for (const L of LEVELS) {
      if (L.id > open) continue;
      const [x, y] = L.map;
      const st = s.stars[L.id] || 0;
      const hov = hitCircle(x, y - 16, 24, this.mouse.x, this.mouse.y);
      const fresh = L.id === open && !st;
      const bob = fresh ? Math.sin(this.t * 4) * 3 : 0;
      g.save(); g.translate(x, y + bob); if (hov) g.scale(1.12, 1.12);
      // flag on a pole
      g.strokeStyle = '#4a3424'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -40); g.stroke();
      g.fillStyle = L.boss ? '#5a1e22' : fresh ? '#c8443a' : '#3e64a8';
      g.beginPath(); g.moveTo(0, -40); g.quadraticCurveTo(14, -38, 26, -32); g.quadraticCurveTo(14, -28, 0, -24); g.fill();
      g.strokeStyle = INKC; g.lineWidth = 1; g.stroke();
      g.fillStyle = 'rgba(40,30,30,0.25)'; g.beginPath(); g.ellipse(0, 1, 10, 3.5, 0, 0, 7); g.fill();
      g.restore();
      text(g, `${L.id}`, x + 12, y - 28 + bob, { size: 14, align: 'center', color: '#f3e9d2', title: true });
      for (let i = 0; i < 3; i++) drawGlyph(g, i < st ? 'star' : 'starEmpty', x - 14 + i * 14, y + 14, 13);
      if (hov) { const w = measure(g, L.name, 20, true) + 24; card(g, x - w / 2, y - 76, w, 30, { tint: '#8a6a3a', seed: 7, shadow: false }); text(g, L.name, x, y - 55, { size: 20, align: 'center', title: true }); }
      this.flags.push({ L, x, y });
    }
    // top bar
    card(g, 10, 10, 360, 50, { tint: '#8a6a3a', seed: 3 });
    const tot = totalStars(s), spent = spentStars(s);
    drawGlyph(g, 'star', 36, 35, 26); text(g, `${tot} / 36`, 54, 44, { size: 24, title: true });
    text(g, `Difficulty: ${s.difficulty}`, 176, 43, { size: 19, color: '#5a4a3a' });
    this.btnDiff = { x: 170, y: 18, w: 190, h: 34 };
    const free = tot - spent;
    this.btns = [
      { k: 'up', x: 1010, y: 650, w: 120, h: 50, label: 'Atelier' },
      { k: 'heroes', x: 880, y: 650, w: 120, h: 50, label: 'Heroes' },
      { k: 'ency', x: 1140, y: 650, w: 130, h: 50, label: 'Encyclop.' },
      { k: 'title', x: 10, y: 660, w: 110, h: 44, label: 'Title' },
    ];
    for (const b of this.btns) button(g, b, hit(b, this.mouse.x, this.mouse.y), { size: 20 });
    if (free > 0) { drawGlyph(g, 'star', 1124, 652, 22); text(g, `${free}`, 1124, 657, { size: 13, align: 'center', title: true }); }
    // current hero badge
    const H = HEROES[heroOwned(s, s.hero) ? s.hero : 'wren'];
    text(g, `Hero: ${H.name}, level ${heroLevel(s.heroXp[s.hero] || 0)}`, 870, 642, { size: 16, color: '#4a3a2a', align: 'left' });
    drawGlyph(g, 'coin', 396, 35, 22); text(g, `${s.coins || 0}`, 412, 43, { size: 22, title: true });
    // together: who you are playing with, and that you are the one choosing
    const C = this.app.coop;
    if (C && C.role === 'host') {
      card(g, 470, 10, 420, 50, { tint: '#3e64a8', seed: 9 });
      const p = C.net.partner;
      text(g, C.net.live && p ? `Together with ${HEROES[p.hero]?.name || 'a partner'}. Pick a battle.` : 'Your partner has left.', 680, 42, { size: 18, align: 'center' });
    }
    if (this.pick) this.drawPick(g);
  }
  drawPick(g) {
    const L = this.pick, s = this.app.save;
    g.fillStyle = 'rgba(30,20,25,0.4)'; g.fillRect(0, 0, 1280, 720);
    card(g, 360, 150, 560, 400, { tint: L.boss ? '#5a1e22' : '#8a6a3a', seed: 17 });
    text(g, `${ACT_NAMES[L.act]}`, 640, 190, { size: 18, align: 'center', color: '#8a6a3a' });
    text(g, L.name, 640, 236, { size: 44, align: 'center', title: true });
    const st = s.stars[L.id] || 0;
    for (let i = 0; i < 3; i++) drawGlyph(g, i < st ? 'star' : 'starEmpty', 600 + i * 40, 272, 30);
    para(g, L.brief, 400, 316, 480, { size: 18, lh: 23 });
    text(g, `${L.waves.length} waves   -   starting gold ${L.gold}`, 640, 470, { size: 16, align: 'center', color: '#6a5a4a' });
    this.pBtns = [{ k: 'go', x: 660, y: 490, w: 200, h: 54, label: 'To Battle!' }, { k: 'back', x: 420, y: 490, w: 200, h: 54, label: 'Back' }];
    for (const b of this.pBtns) button(g, b, hit(b, this.mouse.x, this.mouse.y), { tint: b.k === 'go' ? '#a8352e' : '#8a6a3a' });
  }
  pointerMove(x, y) { this.mouse = { x, y }; }
  pointerDown(x, y) {
    const s = this.app.save;
    if (this.pick) {
      for (const b of this.pBtns) if (hit(b, x, y)) { sfx('click'); if (b.k === 'go') this.startBattle(this.pick); this.pick = null; }
      return;
    }
    if (hit(this.btnDiff, x, y)) { sfx('click'); const D = ['casual', 'normal', 'veteran']; s.difficulty = D[(D.indexOf(s.difficulty) + 1) % 3]; writeSave(s); return; }
    for (const b of this.btns) if (hit(b, x, y)) {
      sfx('click');
      if (b.k === 'up') this.app.go('atelier');
      if (b.k === 'heroes') this.app.go('heroes');
      if (b.k === 'ency') this.app.go('ency', { back: 'worldmap' });
      if (b.k === 'title') this.app.go('title');
      return;
    }
    for (const f of this.flags || []) if (hitCircle(f.x, f.y - 16, 26, x, y)) { sfx('click'); this.pick = f.L; return; }
  }
  key(k) { if (k === 'Escape') this.pick = null; }
  startBattle(L) {
    const C = this.app.coop, s = this.app.save;
    if (!C || C.role !== 'host' || !C.net.live || !C.net.partner) { this.app.coop = null; this.app.go('battle', { level: L.id }); return; }
    const mine = heroOwned(s, s.hero) ? s.hero : 'wren';
    const heroes = [[mine, s.heroXp[mine] || 0], [C.net.partner.hero, C.net.partner.xp || 0]];
    const start = { level: L.id, diff: s.difficulty, seed: (Math.random() * 1e6) | 0, heroes };
    C.net.send({ start });
    this.app.go('battle', { level: L.id, coop: { net: C.net, role: 'host', me: 0, ...start } });
  }
}

// ================================================================== lobby (play together)
// Two wardens, one battle. Host or join; the host picks the battle from their
// own map. Everything about the connection is in net.js.
export class Lobby {
  constructor(app, o = {}) {
    this.app = app; this.mouse = { x: 0, y: 0 }; this.t = 0;
    this.mode = app.coop ? app.coop.role : null;    // null | 'host' | 'guest' | 'join' (typing a code)
    this.code = '';
    this.err = '';
    setMood('map');
    if (app.coop) this.listen(app.coop.net);
  }
  update(dt) { this.t += dt; }
  drawWorld(g) {
    g.drawImage(worldMapArt(LEVELS, this.app.artScale).c, 0, 0, 1280, 720);
    g.fillStyle = 'rgba(30,20,25,0.35)'; g.fillRect(0, 0, 1280, 720);
  }
  listen(net) {
    net.on('status', () => {});
    net.on('hi', () => sfx('levelup'));
    net.on('leave', () => { this.err = net.role === 'guest' ? 'The host left.' : 'Your partner left.'; });
    net.on('start', st => {
      // the host picked a battle: go
      this.app.go('battle', { level: st.level, coop: { net, role: 'guest', me: 1, ...st } });
    });
  }
  myHero() { const s = this.app.save; return heroOwned(s, s.hero) ? s.hero : 'wren'; }
  draw(g) {
    const C = this.app.coop, s = this.app.save;
    card(g, 290, 60, 700, 600, { tint: '#3e64a8', seed: 61 });
    text(g, 'Play Together', 640, 120, { size: 46, align: 'center', title: true });
    para(g, 'Two wardens, one battle. One of you hosts and picks the battle from their own map; the other joins with a four-letter code. You each have your own gold, your own towers and your own hero - the lives are shared, and colours mix across both your towers.', 340, 160, 600, { size: 18, lh: 23 });
    this.btns = [];
    const H = HEROES[this.myHero()];
    text(g, `You will bring ${H.name} (level ${heroLevel(s.heroXp[this.myHero()] || 0)})`, 640, 290, { size: 18, align: 'center', color: '#3a5a2a' });
    if (!C && this.mode !== 'join') {
      this.btns.push({ k: 'host', x: 380, y: 330, w: 240, h: 60, label: 'Host a game' }, { k: 'join', x: 660, y: 330, w: 240, h: 60, label: 'Join a game' });
    }
    if (C && C.role === 'host') {
      text(g, 'Your room code', 640, 340, { size: 20, align: 'center', color: '#6a5a4a' });
      text(g, C.net.code || '....', 640, 410, { size: 72, align: 'center', title: true, color: '#3e64a8' });
      const p = C.net.partner;
      text(g, C.net.live && p ? `Your partner is here, with ${HEROES[p.hero]?.name || 'a hero'}.` : 'Waiting for your partner to type it in...', 640, 460, { size: 20, align: 'center' });
      if (C.net.live && p) this.btns.push({ k: 'choose', x: 520, y: 490, w: 240, h: 58, label: 'Choose a battle' });
    }
    if (C && C.role === 'guest') {
      text(g, 'Connected to room ' + C.net.code, 640, 370, { size: 26, align: 'center', title: true });
      text(g, C.net.live ? 'The host is choosing a battle...' : 'Not connected.', 640, 410, { size: 20, align: 'center' });
    }
    if (!C && this.mode === 'join') {
      text(g, 'Type the code your partner gave you', 640, 340, { size: 20, align: 'center', color: '#6a5a4a' });
      this.box = { x: 500, y: 360, w: 280, h: 80 };
      card(g, 500, 360, 280, 80, { tint: '#8a6a3a', seed: 63, fill: '#f6ecd0' });
      const shown = this.code + (Math.floor(this.t * 2) % 2 && this.code.length < 4 ? '_' : '');
      text(g, shown, 640, 420, { size: 56, align: 'center', title: true, color: '#2a2230' });
      if (this.code.length === 4) this.btns.push({ k: 'go', x: 540, y: 460, w: 200, h: 54, label: this.connecting ? 'Joining...' : 'Join' });
    }
    if (this.err) text(g, this.err, 640, 580, { size: 19, align: 'center', color: '#a8352e' });
    this.btns.push({ k: 'back', x: 330, y: 600, w: 160, h: 46, label: C ? 'Leave' : 'Back' });
    for (const b of this.btns) button(g, b, hit(b, this.mouse.x, this.mouse.y), { size: 22, tint: b.k === 'back' ? '#8a6a3a' : '#3e64a8' });
  }
  pointerMove(x, y) { this.mouse = { x, y }; }
  async pointerDown(x, y) {
    if (this.box && this.mode === 'join' && hit(this.box, x, y) && matchMedia('(pointer: coarse)').matches) {
      // a phone has no keyboard for a canvas: ask the browser for one
      const v = prompt('Room code');
      if (v) this.code = v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
      return;
    }
    for (const b of this.btns || []) if (hit(b, x, y)) {
      sfx('click');
      if (b.k === 'back') { if (this.app.coop) { this.app.coop.net.close(); this.app.coop = null; } this.app.go('title'); return; }
      if (b.k === 'host') {
        const net = new Net();
        this.app.coop = { net, role: 'host' };
        this.mode = 'host'; this.err = '';
        this.listen(net);
        try { await net.host(); } catch (e) { this.err = net.status || 'Could not open a room.'; this.app.coop = null; this.mode = null; }
      }
      if (b.k === 'join') { this.mode = 'join'; this.err = ''; }
      if (b.k === 'choose') this.app.go('worldmap');
      if (b.k === 'go' && !this.connecting) this.join();
      return;
    }
  }
  async join() {
    const net = new Net();
    this.connecting = true; this.err = '';
    const s = this.app.save, hero = this.myHero();
    this.listen(net);
    try {
      await net.join(this.code, { hero, xp: s.heroXp[hero] || 0 });
      this.app.coop = { net, role: 'guest' };
      this.mode = 'guest';
    } catch (e) { this.err = net.status || e.message; net.close(); }
    this.connecting = false;
  }
  key(k) {
    if (k === 'Escape') { this.pointerDown(-999, -999); if (!this.app.coop) this.app.go('title'); return; }
    if (this.mode !== 'join' || this.app.coop) return;
    if (k === 'Backspace') this.code = this.code.slice(0, -1);
    else if (k === 'Enter' && this.code.length === 4) this.join();
    else if (/^[a-zA-Z0-9]$/.test(k) && this.code.length < 4) this.code += k.toUpperCase();
  }
}

// ================================================================== atelier (star upgrades)
export class Atelier {
  constructor(app) { this.app = app; this.mouse = { x: 0, y: 0 }; }
  update() {}
  drawWorld(g) {
    g.drawImage(worldMapArt(LEVELS, this.app.artScale).c, 0, 0, 1280, 720);
    g.fillStyle = 'rgba(30,20,25,0.35)'; g.fillRect(0, 0, 1280, 720);
  }
  draw(g) {
    const s = this.app.save;
    card(g, 60, 40, 1160, 640, { tint: '#8a6a3a', seed: 23 });
    text(g, 'The Royal Atelier', 640, 96, { size: 46, align: 'center', title: true });
    const free = totalStars(s) - spentStars(s);
    drawGlyph(g, 'star', 590, 132, 26); text(g, `${free} to spend`, 608, 140, { size: 22, title: true });
    this.cells = [];
    let hov = null;
    UPGRADE_ORDER.forEach((col, ci) => {
      const U = UPGRADES[col];
      const x = 150 + ci * 172;
      text(g, U.name, x + 40, 190, { size: 22, align: 'center', title: true });
      const have = s.upgrades[col] || 0;
      U.tiers.forEach((t, ti) => {
        const y = 220 + ti * 80;
        const owned = ti < have, next = ti === have;
        const cost = UPGRADE_COSTS[ti];
        const can = next && free >= cost;
        const b = { col, ti, x: x + 10, y, w: 60, h: 60, can, next, owned, t, cost };
        this.cells.push(b);
        const h = hit(b, this.mouse.x, this.mouse.y);
        if (h) hov = b;
        const ic = icon(upIcon(col, ti), 60);
        g.save();
        if (!owned) g.filter = can ? 'none' : 'grayscale(1) brightness(0.85)';
        if (!owned && !can) g.globalAlpha = 0.55;
        g.drawImage(ic.c, x + 10, y, 60, 60);
        g.restore();
        if (owned) drawGlyph(g, 'star', x + 66, y + 8, 18);
        else { drawGlyph(g, 'starEmpty', x + 66, y + 8, 16); text(g, `${cost}`, x + 66, y + 13, { size: 12, align: 'center' }); }
        if (ti < 4) { g.strokeStyle = owned ? '#b8862a' : 'rgba(90,70,50,0.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x + 40, y + 62); g.lineTo(x + 40, y + 78); g.stroke(); }
      });
    });
    if (hov) {
      const w = 300, x = Math.min(hov.x + 70, 1200 - w), y = hov.y;
      card(g, x, y, w, 86, { tint: '#b8862a', seed: 29 });
      text(g, hov.t.name, x + 12, y + 26, { size: 21, title: true });
      para(g, hov.t.desc, x + 12, y + 48, w - 24, { size: 16 });
      text(g, hov.owned ? 'Owned' : hov.next ? `${hov.cost} star${hov.cost > 1 ? 's' : ''}` : 'Buy the ones above first', x + w - 12, y + 26, { size: 15, align: 'right', color: hov.can || hov.owned ? '#3a5a2a' : '#8a3a30' });
    }
    this.btns = [{ k: 'back', x: 90, y: 610, w: 150, h: 50, label: 'Back' }, { k: 'reset', x: 1040, y: 610, w: 150, h: 50, label: 'Refund all' }];
    for (const b of this.btns) button(g, b, hit(b, this.mouse.x, this.mouse.y), { size: 22 });
  }
  pointerMove(x, y) { this.mouse = { x, y }; }
  pointerDown(x, y) {
    const s = this.app.save;
    for (const b of this.btns) if (hit(b, x, y)) { sfx('click'); if (b.k === 'back') this.app.go('worldmap'); if (b.k === 'reset') { s.upgrades = {}; writeSave(s); } return; }
    for (const c of this.cells || []) if (hit(c, x, y)) {
      if (c.can) { s.upgrades[c.col] = (s.upgrades[c.col] || 0) + 1; writeSave(s); sfx('upgrade'); } else sfx('click');
      return;
    }
  }
  key(k) { if (k === 'Escape') this.app.go('worldmap'); }
}
function upIcon(col, ti) {
  const map = {
    archer: ['archer:archer1', 'ability:bramble', 'archer:archer2', 'archer:archer3', 'ability:deadeye'],
    barracks: ['ability:heal', 'barracks:barracks1', 'barracks:barracks2', 'ability:holystrike', 'barracks:barracks3'],
    mage: ['mage:mage1', 'mage:mage2', 'mage:mage3', 'ability:glare', 'ability:curse'],
    artillery: ['ability:cluster', 'artillery:artillery1', 'artillery:artillery2', 'artillery:artillery3', 'ability:static'],
    meteor: ['ui:wash', 'ui:wash', 'ability:overcharge', 'ui:wash', 'ui:wash'],
    militia: ['ui:wall', 'ability:thornroot', 'ui:wall', 'ui:wall', 'ability:overcharge'],
  };
  return map[col][ti];
}

// ================================================================== heroes
export class Heroes {
  // THE HALL OF WARRIORS (2026-10-07). Eight heroes now: three who join
  // through the story and five who can be hired with the coins every
  // battle pays. Click one to see it; choose it, or buy it.
  constructor(app) { this.app = app; this.mouse = { x: 0, y: 0 }; this.t = 0; this.sel = app.save.hero; }
  update(dt) { this.t += dt; }
  drawWorld(g) {
    g.drawImage(worldMapArt(LEVELS, this.app.artScale).c, 0, 0, 1280, 720);
    g.fillStyle = 'rgba(30,20,25,0.4)'; g.fillRect(0, 0, 1280, 720);
  }
  draw(g) {
    const s = this.app.save;
    text(g, 'The Hall of Warriors', 420, 64, { size: 44, align: 'center', title: true, color: '#f3e9d2', shadow: 'rgba(0,0,0,0.5)' });
    card(g, 830, 26, 210, 52, { tint: '#b8862a', seed: 35 });
    drawGlyph(g, 'coin', 858, 52, 26); text(g, `${s.coins || 0} coins`, 878, 61, { size: 24, title: true });
    this.cards = [];
    HERO_ORDER.forEach((id, i) => {
      const H = HEROES[id], own = heroOwned(s, id);
      const col = i % 4, row = Math.floor(i / 4);
      const x = 30 + col * 196, y = 100 + row * 280, w = 184, h = 268;
      const chosen = s.hero === id, picked = this.sel === id;
      card(g, x, y, w, h, { tint: picked ? '#a8352e' : chosen ? '#b8862a' : '#8a6a3a', seed: 33 + i, fill: own ? undefined : '#ddd2bc' });
      const fr = unitSheet(H.look).walk[picked ? Math.floor(this.t * 12) % 12 : 0];
      g.save(); if (!own && !H.cost) g.filter = 'brightness(0.2)';
      const k = 1.9;
      g.drawImage(fr.c, x + w / 2 - fr.ax * k, y + 150 - fr.ay * k, fr.w * k, fr.h * k);
      g.restore();
      const hidden = !own && !H.cost;
      text(g, hidden ? '???' : H.name, x + w / 2, y + 182, { size: 18, align: 'center', title: true });
      text(g, hidden ? `Joins after battle ${H.unlock}` : H.title, x + w / 2, y + 202, { size: 13, align: 'center', color: '#6a5a4a' });
      if (own) text(g, chosen ? 'In your party' : `Level ${heroLevel(s.heroXp[id] || 0)}`, x + w / 2, y + 236, { size: 16, align: 'center', color: chosen ? '#a8352e' : '#3a5a2a', title: true });
      else if (H.cost) { drawGlyph(g, 'coin', x + w / 2 - 30, y + 230, 18); text(g, `${H.cost}`, x + w / 2 - 16, y + 237, { size: 18, title: true, color: (s.coins || 0) >= H.cost ? '#6a4a10' : '#9a3a30' }); }
      this.cards.push({ id, x, y, w, h });
    });
    // the one you are looking at
    const id = this.sel, H = HEROES[id], own = heroOwned(s, id), hidden = !own && !H.cost;
    const dx = 820, dy = 100, dw = 430, dh = 548;
    card(g, dx, dy, dw, dh, { tint: '#8a6a3a', seed: 39 });
    if (hidden) {
      text(g, 'Not yet met', dx + dw / 2, dy + 240, { size: 30, align: 'center', title: true, color: '#8a7a6a' });
      para(g, `They join you after battle ${H.unlock}.`, dx + 40, dy + 290, dw - 80, { size: 18 });
    } else {
      const fr = unitSheet(H.look).walk[Math.floor(this.t * 12) % 12];
      const k = 3;
      g.drawImage(fr.c, dx + dw / 2 - fr.ax * k, dy + 190 - fr.ay * k, fr.w * k, fr.h * k);
      text(g, H.name, dx + dw / 2, dy + 226, { size: 28, align: 'center', title: true });
      text(g, H.title, dx + dw / 2, dy + 250, { size: 16, align: 'center', color: '#6a5a4a' });
      const L = own ? heroLevel(s.heroXp[id] || 0) : 1, st = heroStats(id, L);
      const yy = dy + 290;
      drawGlyph(g, 'heart', dx + 40, yy - 6, 18); text(g, `${st.hp}`, dx + 54, yy, { size: 18 });
      drawGlyph(g, 'sword', dx + 120, yy - 6, 18); text(g, `${st.dmg[0]}-${st.dmg[1]}`, dx + 134, yy, { size: 18 });
      drawGlyph(g, 'shield', dx + 214, yy - 6, 18); text(g, `${Math.round(st.armor * 100)}%`, dx + 228, yy, { size: 18 });
      if (st.range) { drawGlyph(g, 'range', dx + 296, yy - 6, 18); text(g, `${st.range}`, dx + 310, yy, { size: 18 }); }
      text(g, H.skill.name, dx + 40, yy + 36, { size: 20, title: true, color: '#5a1e22' });
      para(g, H.skill.desc(L), dx + 40, yy + 56, dw - 80, { size: 16, lh: 19 });
      text(g, H.passive.name, dx + 40, yy + 112, { size: 18, title: true, color: '#3a5a2a' });
      para(g, H.passive.desc, dx + 40, yy + 130, dw - 80, { size: 15, lh: 18 });
      para(g, H.lore, dx + 40, yy + 172, dw - 80, { size: 15, lh: 18, color: '#6a5a4a' });
      const chosen = s.hero === id;
      this.act = own
        ? { k: 'choose', x: dx + dw / 2 - 110, y: dy + dh - 66, w: 220, h: 50, label: chosen ? 'In your party' : 'Take into battle' }
        : { k: 'buy', x: dx + dw / 2 - 110, y: dy + dh - 66, w: 220, h: 50, label: `Hire for ${H.cost} coins` };
      const can = own ? !chosen : (s.coins || 0) >= H.cost;
      button(g, this.act, hit(this.act, this.mouse.x, this.mouse.y) && can, { size: 20, disabled: !can, tint: own ? '#b8862a' : '#a8352e' });
      if (!own && !can) text(g, 'Every battle pays coins - win or lose.', dx + dw / 2, dy + dh - 76, { size: 14, align: 'center', color: '#6a5a4a' });
    }
    this.back = { x: 30, y: 660, w: 140, h: 46, label: 'Back' };
    button(g, this.back, hit(this.back, this.mouse.x, this.mouse.y), { size: 22 });
  }
  pointerMove(x, y) { this.mouse = { x, y }; }
  pointerDown(x, y) {
    const s = this.app.save;
    if (hit(this.back, x, y)) { sfx('click'); this.app.go(this.app.coop?.role === 'guest' ? 'lobby' : 'worldmap'); return; }
    for (const c of this.cards) if (hit(c, x, y)) { sfx('click'); this.sel = c.id; this.act = null; return; }
    if (this.act && hit(this.act, x, y)) {
      const H = HEROES[this.sel];
      if (this.act.k === 'choose' && heroOwned(s, this.sel)) { s.hero = this.sel; writeSave(s); sfx('levelup'); }
      if (this.act.k === 'buy' && (s.coins || 0) >= H.cost && !heroOwned(s, this.sel)) {
        s.coins -= H.cost;
        (s.owned || (s.owned = [])).push(this.sel);
        s.hero = this.sel;
        s.heroXp[this.sel] = s.heroXp[this.sel] || 0;
        writeSave(s); sfx('star');
      }
    }
  }
  key(k) { if (k === 'Escape') this.app.go('worldmap'); }
}

// ================================================================== encyclopaedia
export class Ency {
  constructor(app, o = {}) { this.app = app; this.backTo = o.back || 'worldmap'; this.tab = 'enemies'; this.sel = null; this.mouse = { x: 0, y: 0 }; this.t = 0; }
  update(dt) { this.t += dt; }
  drawWorld(g) {
    g.drawImage(worldMapArt(LEVELS, this.app.artScale).c, 0, 0, 1280, 720);
    g.fillStyle = 'rgba(30,20,25,0.35)'; g.fillRect(0, 0, 1280, 720);
  }
  draw(g) {
    const s = this.app.save;
    card(g, 40, 30, 1200, 660, { tint: '#5a4a96', seed: 43 });
    text(g, 'Encyclopaedia', 640, 82, { size: 44, align: 'center', title: true });
    this.tabs = [{ k: 'enemies', x: 70, y: 46, w: 150, h: 44, label: 'Foes' }, { k: 'towers', x: 230, y: 46, w: 150, h: 44, label: 'Towers' }];
    for (const b of this.tabs) button(g, b, hit(b, this.mouse.x, this.mouse.y) || this.tab === b.k, { size: 22, tint: this.tab === b.k ? '#a8352e' : '#8a6a3a' });
    this.items = [];
    // TOWERS APPEAR ONCE YOU HAVE BUILT OR UPGRADED TO THEM (Liam,
    // 2026-10-07) - the encyclopaedia is a record of what you have found,
    // not a catalogue of everything there is.
    const tseen = s.towersSeen || [];
    const list = this.tab === 'enemies' ? ENEMY_ORDER : Object.keys(TOWERS).filter(k => tseen.includes(k));
    if (this.tab === 'towers') {
      text(g, `${list.length} of ${Object.keys(TOWERS).length} towers discovered`, 1180, 82, { size: 17, align: 'right', color: '#6a5a4a' });
      if (!list.length) {
        para(g, 'Nothing here yet. Every tower you build, and every tower you upgrade to, is written in here - its path, its abilities and what it is for.', 90, 160, 520, { size: 20, lh: 26 });
        this.items = [];
        this.back = { x: 70, y: 630, w: 140, h: 46, label: 'Back' };
        button(g, this.back, hit(this.back, this.mouse.x, this.mouse.y), { size: 22 });
        return;
      }
      if (this.sel && !list.includes(this.sel)) this.sel = null;
    }
    list.forEach((k, i) => {
      const T = this.tab === 'towers', cols = T ? 10 : 6, cw = T ? 58 : 96, chh = T ? 52 : 104, cs = T ? 54 : 86, chg = T ? 48 : 94;
      const col = i % cols, row = Math.floor(i / cols);
      const x = 70 + col * cw, y = 116 + row * chh;
      const b = { k, x, y, w: cs, h: chg };
      this.items.push(b);
      const known = this.tab === 'towers' || s.seen.includes(k);
      const h = hit(b, this.mouse.x, this.mouse.y) || this.sel === k;
      card(g, x, y, cs, chg, { tint: h ? '#b8862a' : '#8a7a6a', seed: 47 + (i % 5), shadow: false });
      g.save(); g.beginPath(); g.rect(x + 3, y + 3, cs - 6, chg - 6); g.clip();
      if (!known) g.filter = 'brightness(0)';
      if (this.tab === 'enemies') {
        const fr = unitSheet(k).walk[0];
        const sc = Math.min(1.6, 70 / fr.h * 1.15);
        g.drawImage(fr.c, x + 43 - fr.ax * sc, y + 84 - fr.ay * sc, fr.w * sc, fr.h * sc);
      } else {
        const t = towerSprite(k);
        g.drawImage(t.c, x + cs / 2 - t.ax * 0.46, y + chg - 4 - t.ay * 0.46, t.w * 0.46, t.h * 0.46);
      }
      g.restore();
      if (!known) text(g, '?', x + 43, y + 58, { size: 34, align: 'center', color: '#f3e9d2', title: true });
    });
    // details
    const k = this.tab === 'towers' ? (this.sel && list.includes(this.sel) ? this.sel : list[0]) : (this.sel ?? list[0]);
    const dx = 680, dy = 120;
    card(g, dx, dy, 520, 540, { tint: '#8a6a3a', seed: 53 });
    if (this.tab === 'enemies') {
      const d = ENEMIES[k];
      const known = s.seen.includes(k);
      if (!known) { text(g, 'Not yet met.', dx + 260, dy + 260, { size: 26, align: 'center', title: true, color: '#8a7a6a' }); }
      else {
        const fr = unitSheet(k).walk[Math.floor(this.t * 12) % 12];
        const sc = Math.min(4, 200 / fr.h * 1.3);
        g.drawImage(fr.c, dx + 260 - fr.ax * sc, dy + 250 - fr.ay * sc, fr.w * sc, fr.h * sc);
        text(g, d.name, dx + 260, dy + 290, { size: 34, align: 'center', title: true });
        const st = [['heart', `${d.hp} health`], ['shield', `armour ${Math.round(d.armor * 100)}%`], ['magicshield', `magic resist ${Math.round(d.mr * 100)}%`], ['boot', `speed ${d.speed}`], ['coin', `${d.gold} gold`], ['heart', `costs ${d.lives} ${d.lives > 1 ? 'lives' : 'life'}`]];
        st.forEach(([gl, s2], i) => { const x = dx + 40 + (i % 3) * 160, y = dy + 330 + Math.floor(i / 3) * 34; drawGlyph(g, gl, x, y - 6, 20); text(g, s2, x + 16, y, { size: 17 }); });
        const tags = [d.fly && 'Flies', d.ranged && 'Shoots soldiers', d.heal && 'Heals friends', d.split && 'Splits on death', d.spawn && 'Lays young', d.silence && 'Silences towers', d.boss && 'BOSS'].filter(Boolean);
        text(g, tags.join('   '), dx + 260, dy + 410, { size: 17, align: 'center', color: '#a8352e' });
        para(g, d.lore, dx + 40, dy + 446, 440, { size: 18, lh: 22, color: '#3a3040' });
      }
    } else {
      const d = TOWERS[k];
      const t = towerSprite(k);
      g.drawImage(t.c, dx + 260 - t.ax * 2, dy + 230 - t.ay * 2, t.w * 2, t.h * 2);
      text(g, d.name, dx + 260, dy + 280, { size: 32, align: 'center', title: true });
      text(g, `${d.line[0].toUpperCase() + d.line.slice(1)} - level ${d.level}   cost ${d.cost}`, dx + 260, dy + 306, { size: 17, align: 'center', color: '#6a5a4a' });
      let y = dy + 344;
      para(g, d.desc, dx + 40, y, 440, { size: 18, lh: 22 }); y += 52;
      const pg = PIGMENT_OF[d.line];
      if (pg) { g.fillStyle = PIGMENTS[pg].col; g.beginPath(); g.arc(dx + 48, y - 8, 7, 0, 7); g.fill(); text(g, `Paints foes ${PIGMENTS[pg].name.toLowerCase()}`, dx + 62, y - 2, { size: 16, color: '#3a3040' }); y += 26; }
      const st = d.beast ? `${d.beast.name}: ${d.beast.hp} health, ${d.beast.dmg[0]}-${d.beast.dmg[1]} damage${d.beast.fly ? ', flies and breathes fire' : ''}. Roams the whole map.` : d.soldier?.ranged ? `${d.soldier.n || 3} ${d.soldier.name}s: ${d.soldier.hp} health, arrows ${d.soldier.ranged.dmg[0]}-${d.soldier.ranged.dmg[1]}` : d.soldier ? `Soldiers: ${d.soldier.hp} health, ${d.soldier.dmg[0]}-${d.soldier.dmg[1]} damage, ${Math.round(d.soldier.armor * 100)}% armour`
        : d.beam ? `Beam: ${d.beam.start} rising to ${d.beam.max} magic damage a second` : `${d.dmg[0]}-${d.dmg[1]} ${d.dtype === 'magic' ? 'magic' : 'physical'} damage every ${d.rate}s${d.splash ? ', in an area' : ''}`;
      para(g, st, dx + 40, y, 440, { size: 17, lh: 20, color: '#3a3040' }); y += 30;
      if (!d.beast) text(g, `Range ${d.range}${d.air ? '' : ' - cannot hit flyers'}`, dx + 40, y + 6, { size: 17, color: '#3a3040' }); y += 30;
      for (const ab of d.abilities || []) {
        const A = ABILITIES[ab];
        const ic = icon(`ability:${ab}`, 40);
        g.drawImage(ic.c, dx + 40, y, 40, 40);
        text(g, A.name, dx + 90, y + 16, { size: 19, title: true });
        para(g, A.desc(2) + ' (rank 3)', dx + 90, y + 34, 380, { size: 14, lh: 15, color: '#3a3040' });
        y += 62;
      }
    }
    this.back = { x: 70, y: 630, w: 140, h: 46, label: 'Back' };
    button(g, this.back, hit(this.back, this.mouse.x, this.mouse.y), { size: 22 });
  }
  pointerMove(x, y) { this.mouse = { x, y }; }
  pointerDown(x, y) {
    if (hit(this.back, x, y)) { sfx('click'); this.app.go(this.backTo); return; }
    for (const b of this.tabs) if (hit(b, x, y)) { sfx('click'); this.tab = b.k; this.sel = null; return; }
    for (const b of this.items) if (hit(b, x, y)) { sfx('click'); this.sel = b.k; return; }
  }
  key(k) { if (k === 'Escape') this.app.go(this.backTo); }
}

export { PROLOGUE, ACT_INTROS, ENDING };
