// BLOCK ROYALE - the 8x8 block puzzle with a Balatro-style scoring engine.
// main.js: layout, input (drag / tap / keys), the scoring animation, effects and HUD.
import * as E from './engine.js';
import { COLORS, byId, glyphById, bossById, deckById, ROUND_NAMES, ANTES, RARITY, CHIP_BLUE, MULT_RED, ACHIEVEMENTS, DECKS, XP_PER_LEVEL, STAKES } from './data.js';
import { FONT, UIFONT, background, block, ghostBlock, boardWell, panel, otext, fmt, short, rrect, charmCard, glyphStone, emptySlot, pieceShape, rgba, mix } from './draw.js';
import { Sound } from './audio.js';
import { UI } from './ui.js';

const SAVE_KEY = 'pd.block-royale';
const N = E.N;
const params = new URLSearchParams(location.search);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);
const ease = t => 1 - Math.pow(1 - t, 3);
const STREAK_COLS = ['#2fd3c5', '#4cc3ff', '#a66bff', '#ff7ad9', '#ff4d6d', '#ffb020', '#ffe066'];
// praise ladder keyed on the streak after a clear (Block Blast grades every combo step)
const PRAISE = ['', '', 'NICE!', 'GREAT!', 'AMAZING!', 'FANTASTIC!', 'UNBELIEVABLE!'];
const SPEEDS = [1, 1.5, 2];
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

class Game {
  constructor() {
    this.canvas = document.getElementById('c');
    this.g = this.canvas.getContext('2d');
    this.snd = new Sound();
    this.save = { xp: 0, level: 1, ach: {}, decks: ['jewel'], stakes: { jewel: 0 }, deck: 'jewel', stake: 0, seen: [], best: { ante: 0, hand: 0, zen: 0 }, daily: {}, runs: 0, wins: 0, music: 0.55, sfx: 0.85, musicOn: true, tut: 0, tut2: 0, tut3: 0, speed: 1, run: null };
    try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}'); Object.assign(this.save, s); this.save.best = { ante: 0, hand: 0, zen: 0, ...(s.best || {}) }; } catch (e) { /* storage blocked */ }
    this.snd.music = this.save.music; this.snd.sfx = this.save.sfx; this.snd.musicOn = this.save.musicOn;
    this.t = 0; this.scene = 'title';
    this.run = null; this.demo = null;
    this.parts = []; this.pops = []; this.flashes = []; this.ghosts = []; this.landT = new Map();
    this.shake = 0; this.wiggle = []; this.anim = null; this.banner = null; this.tip = null;
    this.drag = null; this.sel = null; this.glyphMode = null; this.hover = null; this.tipCharm = null;
    this.ret = null; this.lostT = 0; this.pv = null;
    this.fps = params.has('fps') ? { n: 0, t: 0, v: 0, worst: 0 } : null;
    this.disp = { score: 0, chips: 0, mult: 0, gold: 0, slam: null };
    this.ui = new UI(this);
    this.resize();
    addEventListener('resize', () => this.resize());
    this.input();
    this.startDemo();
    window.__G = this; this.E = E; this.speed = 1;
    if (params.has('play')) this.start(params.get('mode') || 'run', { seed: params.get('seed') || undefined, deckId: params.get('deck') || undefined });
    else this.ui.show('title');
    this.last = performance.now();
    requestAnimationFrame(t => this.loop(t));
  }
  persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch (e) { /* storage blocked */ } }
  saveRun() {
    if (!this.run || this.run.mode === 'zen' || this.run.over) { this.save.run = null; }
    else this.save.run = JSON.stringify(this.run);
    this.persist();
  }

  // ------------------------------------------------------------ runs
  start(mode = 'run', o = {}) {
    this.snd.unlock();
    const deckId = mode === 'run' ? (o.deckId && this.save.decks.includes(o.deckId) ? o.deckId : this.save.deck) : 'jewel';
    const stake = mode === 'run' ? (o.stake ?? this.save.stake) : 0;
    const seed = mode === 'daily' ? 'daily-' + today() : o.seed;
    this.run = E.newRun({ mode, seed, deckId, stake });
    this.save.runs++;
    this.resetFx();
    this.scene = 'play';
    this.ui.hide();
    this.layout();
    this.roundIntro();
    this.saveRun();
    if (!this.save.tut) this.tip = { text: 'Drag a piece onto the board. Fill a row or column to clear it!', t: 0, step: 0 };
  }
  continueRun() {
    try {
      const r = JSON.parse(this.save.run);
      if (r.round && r.round.left === null) r.round.left = Infinity;
      this.run = r;
    } catch (e) { this.save.run = null; return; }
    this.resetFx();
    this.ui.hide();
    this.layout();
    if (this.run.shop) { this.scene = 'shop'; this.ui.show('shop'); }
    else { this.scene = 'play'; this.roundIntro(); }
  }
  resetFx() {
    this.parts = []; this.pops = []; this.flashes = []; this.ghosts = []; this.landT.clear(); this.anim = null;
    this.drag = null; this.sel = null; this.glyphMode = null; this.pending = null; this.wiggle = []; this.ret = null; this.lostT = 0;
    this.disp = { score: this.run?.round?.score || 0, chips: 0, mult: 0, gold: this.run?.gold || 0, slam: null };
  }
  roundIntro() {
    const r = this.run.round, run = this.run;
    this.disp.score = r.score; this.disp.chips = 0; this.disp.mult = 0;
    if (run.mode === 'zen') { this.banner = { title: 'ZEN', sub: 'No targets. No rush. Just clears.', col: '#2fd3c5', t: 0, dur: 1.8 }; this.snd.play('round'); return; }
    const boss = r.boss && bossById[r.boss];
    // the ante's boss is known from the Small round on (Balatro shows all three blinds), so you shop with it in mind
    const ahead = bossById[E.bossFor(run)];
    this.banner = boss
      ? { title: boss.name.toUpperCase(), sub: boss.d, col: boss.col, t: 0, dur: 2.6, kicker: `ANTE ${run.ante} · BOSS ROUND`, target: r.target }
      : { title: ROUND_NAMES[run.ri].toUpperCase(), sub: `Score ${fmt(r.target)} in ${r.max} placements`, col: run.ri ? '#ffb020' : '#2fd3c5', t: 0, dur: 2.1, kicker: `ANTE ${run.ante} / ${ANTES} · BOSS AHEAD: ${ahead.name.toUpperCase()}` };
    this.snd.play(boss ? 'boss' : 'round');
    // landing animation for pre-placed stone
    r.board.cells.forEach((v, i) => { if (v) this.landT.set(i, this.t + i * 0.01); });
    // first time you hold a glyph: say how it is used, once
    if (!this.save.tut3 && run.glyphs.length && !this.tip) {
      this.save.tut3 = 1; this.persist();
      this.tip = { text: `You hold a ${glyphById[run.glyphs[0]].name} glyph. Tap it, then a piece or the board.`, t: 0, step: 3, dur: 6 };
    }
  }

  // ------------------------------------------------------------ demo board on the title screen
  startDemo() { this.demo = E.newRun({ mode: 'zen', seed: 'attract' + Math.floor(Math.random() * 1000) }); this.demoT = 0.6; }
  stepDemo(dt) {
    this.demoT -= dt;
    if (this.demoT > 0) return;
    this.demoT = 0.55;
    const run = this.demo;
    if (run.round.lost) { this.startDemo(); return; }
    const m = E.botMove(run);
    if (!m) { this.startDemo(); return; }
    const res = E.place(run, m.ti, m.x, m.y);
    if (res) this.placeFx(res, true);
  }

  // ------------------------------------------------------------ layout
  resize() {
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.w = innerWidth; this.h = innerHeight;
    this.canvas.width = Math.round(this.w * this.dpr); this.canvas.height = Math.round(this.h * this.dpr);
    this.layout();
  }
  layout() {
    const w = this.w, h = this.h, m = 14;
    const run = this.run || this.demo;
    const slots = run ? Math.max(5, E.charmSlots(run)) : 5;
    const L = this.L = { land: w > h * 1.05 };
    if (L.land && h < 560) {
      // phone landscape: [HUD + charms] [board] [tray + glyphs]
      let B = h - 24;
      const cell = Math.floor(B / N); B = cell * N;
      const lw = clamp(w * 0.27, 180, 300), gap = 12;
      const bx = Math.round(Math.max(lw + 20 + cell * 0.3, (w - B) / 2 - 40)), by = Math.round((h - B) / 2);
      L.board = { x: bx, y: by, s: B, cell };
      L.hud = { x: 8, y: 8, w: lw, h: 136, compact: true };
      const cw = Math.min((lw - gap * 2) / 3, (h - 8 - 136 - 12 - 26) / 2 / 1.4);
      L.charms = [];
      for (let k = 0; k < slots; k++) L.charms.push({ x: 8 + (k % 3) * (cw + gap), y: 8 + 136 + 12 + Math.floor(k / 3) * (cw * 1.4 + 14), w: cw, h: cw * 1.4 });
      const rx = bx + B + cell * 0.3 + 10, rw = w - rx - 8;
      const gh = 58, sh = (h - 16 - gh) / 3;
      L.tray = [0, 1, 2].map(k => ({ x: rx, y: 8 + k * sh, w: rw, h: sh - 6 }));
      L.glyphs = [0, 1].map(k => ({ cx: rx + 26 + k * 56, cy: h - 8 - gh / 2, r: 23 }));
      L.side = { short: true };
      L.pause = { cx: w - 28, cy: h - 8 - gh / 2, r: 20 };
      L.help = null; // no room beside the glyphs; How to play lives in the pause menu here
      this.placeToasts();
      return;
    }
    if (L.land) {
      const short = false;
      const trayH = short ? 0 : clamp(h * 0.19, 96, 170);
      let B = Math.min(h - trayH - (short ? 28 : 64), w * (short ? 0.44 : 0.42), 600);
      const cell = Math.floor(B / N); B = cell * N;
      const bx = Math.round((w - B) / 2 + (short ? -w * 0.04 : 0));
      const by = Math.round(short ? (h - B) / 2 : Math.max(30, (h - B - trayH - 24) / 2 + 6));
      L.board = { x: bx, y: by, s: B, cell };
      const sideW = Math.min(300, bx - cell * 0.6 - m * 2);
      L.hud = { x: bx - cell * 0.6 - m - sideW, y: by - cell * 0.22, w: sideW, h: B + cell * 0.44, tall: true };
      if (short) {
        const tw = Math.min(w - (bx + B + cell * 0.6) - m, B * 0.42);
        const tx = bx + B + cell * 0.5, sh = (B + cell * 0.44) / 3;
        L.tray = [0, 1, 2].map(k => ({ x: tx, y: by - cell * 0.22 + k * sh, w: tw, h: sh - 6 }));
        // charms + glyphs inside the HUD column on short screens
        L.hud.h = 112; L.hud.tall = false; L.side = { short: true };
        const cw = Math.min((sideW - 4 * 5) / 5, 62);
        L.charms = this.cardRow(L.hud.x, L.hud.y + L.hud.h + 10, sideW, cw, slots);
        const gy = L.hud.y + L.hud.h + 10 + cw * 1.4 + 34;
        L.glyphs = [0, 1].map(k => ({ cx: L.hud.x + 26 + k * 58, cy: gy, r: 22 }));
      } else {
        const ty = by + B + cell * 0.55;
        L.tray = [0, 1, 2].map(k => ({ x: bx - cell * 0.3 + k * (B + cell * 0.6) / 3, y: ty, w: (B + cell * 0.6) / 3 - 6, h: trayH - 10 }));
        const rx = bx + B + cell * 0.6 + m, rw = Math.min(300, w - rx - m);
        // charm column(s) on the right. The grid must fit in the space that is really
        // there above the glyph row (on a 1280x720 laptop the old 2-column grid wrapped
        // into the GLYPHS label), so try 2 and 3 columns and keep whichever gives wider cards.
        const gap = 10, gr = 26;
        L.side = { x: rx, y: by - cell * 0.22, w: rw, h: B + cell * 0.44 };
        const glyphCy = L.side.y + L.side.h - gr - 14;
        const avail = (glyphCy - gr - 34) - (by + 22);
        const fit = cols => {
          const rows = Math.ceil(slots / cols);
          return Math.min(96, (rw - 24 - gap * (cols - 1)) / cols, (avail - gap * (rows - 1)) / rows / 1.4);
        };
        let cols = rw > 210 ? 2 : 1, cw = fit(cols);
        if (rw > 210 && fit(3) > cw) { cols = 3; cw = fit(3); }
        const ch = cw * 1.4;
        L.charms = [];
        for (let k = 0; k < slots; k++) {
          const c = k % cols, rr = Math.floor(k / cols);
          L.charms.push({ x: rx + 12 + c * (cw + gap), y: by + 22 + rr * (ch + gap), w: cw, h: ch });
        }
        L.glyphs = [0, 1].map(k => ({ cx: rx + 12 + gr + k * (gr * 2 + 14), cy: glyphCy, r: gr }));
      }
    } else {
      const top = 8;
      const hudH = clamp(h * 0.13, 92, 116);
      L.hud = { x: m, y: top, w: w - m * 2, h: hudH, tall: false };
      const gw = 46;
      const cw = Math.min(70, (w - m * 2 - gw - 6 * slots) / slots);
      const ch = cw * 1.4;
      const cy = top + hudH + 10;
      L.charms = this.cardRow(m, cy, w - m * 2 - gw - 6, cw, slots);
      L.glyphs = [0, 1].map(k => ({ cx: w - m - gw / 2 + 2, cy: cy + ch * (k ? 0.74 : 0.26), r: Math.min(gw / 2, ch * 0.24) }));
      const trayH = clamp(h * 0.17, 90, 150);
      let B = Math.min(w - 34, h - (cy + ch + 22) - trayH - 18, 560);
      const cell = Math.floor(B / N); B = cell * N;
      const bx = Math.round((w - B) / 2), by = Math.round(cy + ch + 22 + Math.max(0, (h - (cy + ch + 22) - trayH - 18 - B) * 0.35));
      L.board = { x: bx, y: by, s: B, cell };
      const ty = by + B + cell * 0.5;
      L.tray = [0, 1, 2].map(k => ({ x: m + k * (w - m * 2) / 3, y: ty, w: (w - m * 2) / 3 - 6, h: Math.min(trayH * 1.3, h - ty - 10) }));
    }
    L.pause = { cx: w - 30, cy: 30, r: 20 };
    L.help = { cx: w - 82, cy: 30, r: 18 };
    if (!L.land) { L.pause = { cx: w - 26, cy: L.hud.y + 22, r: 17 }; L.help = { cx: w - 64, cy: L.hud.y + 22, r: 15 }; }
    this.placeToasts();
  }
  // transient toasts never sit over the board: on phones they sit over the charm row
  placeToasts() {
    const L = this.L, el = this.ui && this.ui.toasts; if (!el || !L.charms) return;
    const st = el.style;
    if (this.w <= 700 && !L.land) { st.top = Math.round(L.charms[0].y + 6) + 'px'; st.bottom = 'auto'; st.left = '50%'; st.transform = 'translateX(-50%)'; st.width = 'auto'; st.maxWidth = (this.w - 24) + 'px'; }
    else if (L.side && L.side.short && L.hud.compact) { st.top = Math.round(L.charms[0].y) + 'px'; st.bottom = 'auto'; st.left = L.hud.x + 'px'; st.transform = 'none'; st.width = L.hud.w + 'px'; st.maxWidth = ''; }
    else { st.top = '12px'; st.bottom = 'auto'; st.left = '50%'; st.transform = 'translateX(-50%)'; st.width = 'auto'; st.maxWidth = ''; }
  }
  cardRow(x, y, wTot, cw, n) {
    const gap = Math.min(8, (wTot - cw * n) / Math.max(1, n - 1));
    return [...Array(n)].map((_, k) => ({ x: x + k * (cw + gap), y, w: cw, h: cw * 1.4 }));
  }

  // ------------------------------------------------------------ input
  input() {
    const cv = this.canvas;
    const pos = e => ({ x: e.clientX, y: e.clientY });
    cv.addEventListener('pointerdown', e => {
      this.snd.unlock();
      if (this.scene !== 'play' || this.ui.open) return;
      const p = pos(e);
      this.ptr = { x: p.x, y: p.y, sx: p.x, sy: p.y, type: e.pointerType, moved: false, id: e.pointerId };
      try { cv.setPointerCapture(e.pointerId); } catch (er) { /* fine */ }
      this.pointerDown(p, e.pointerType);
    });
    cv.addEventListener('pointermove', e => {
      const p = pos(e);
      this.hover = p;
      if (this.ptr && this.ptr.id === e.pointerId) {
        this.ptr.x = p.x; this.ptr.y = p.y;
        if (Math.hypot(p.x - this.ptr.sx, p.y - this.ptr.sy) > 8) this.ptr.moved = true;
      }
    });
    const up = e => {
      if (!this.ptr || this.ptr.id !== e.pointerId) return;
      this.pointerUp(pos(e));
      this.ptr = null;
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', e => { if (this.drag) this.drop(false); this.ptr = null; });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('keydown', e => this.key(e));
    addEventListener('blur', () => { if (this.scene === 'play' && !this.ui.open && this.run && !this.run.over) this.ui.show('pause'); });
  }
  hitCharm(p) { return (this.L.charms || []).findIndex(c => p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h); }
  hitGlyph(p) { return (this.L.glyphs || []).findIndex(c => Math.hypot(p.x - c.cx, p.y - c.cy) <= c.r + 6); }
  hitTray(p) { return this.L.tray.findIndex(s => p.x >= s.x && p.x <= s.x + s.w && p.y >= s.y && p.y <= s.y + s.h); }
  cellAt(p) {
    const b = this.L.board; const x = Math.floor((p.x - b.x) / b.cell), y = Math.floor((p.y - b.y) / b.cell);
    return x >= 0 && y >= 0 && x < N && y < N ? { x, y } : null;
  }
  pointerDown(p, type) {
    const r = this.run.round;
    const P = this.L.pause, Hb = this.L.help;
    if (Math.hypot(p.x - P.cx, p.y - P.cy) < P.r + 8) { this.ui.show('pause'); return; }
    if (Hb && Math.hypot(p.x - Hb.cx, p.y - Hb.cy) < Hb.r + 8) { this.ui.prev = 'play'; this.ui.show('how'); this.snd.play('click'); return; }
    const gi = this.hitGlyph(p);
    if (gi >= 0 && this.run.glyphs[gi]) { this.glyphTap(gi); return; }
    const ci = this.hitCharm(p);
    if (ci >= 0 && this.run.charms[ci]) { this.tipCharm = { i: ci, t: 2.6 }; this.snd.play('click'); return; }
    if (this.glyphMode && glyphById[this.run.glyphs[this.glyphMode.gi]].t === 'board') {
      const c = this.cellAt(p);
      if (c) { this.applyGlyph(this.glyphMode.gi, E.idx(c.x, c.y)); return; }
    }
    const ti = this.hitTray(p);
    if (ti >= 0 && r.tray[ti]) {
      if (this.glyphMode) { this.applyGlyph(this.glyphMode.gi, ti); return; }
      if (r.won || r.lost) return;
      this.flushAnim();
      const s = this.L.tray[ti];
      this.drag = { ti, x: p.x, y: p.y, touch: type !== 'mouse', scale: 0, sx: s.x + s.w / 2, sy: s.y + s.h / 2, grab: this.t };
      this.sel = null; if (this.ret && this.ret.ti === ti) this.ret = null;
      this.snd.play('pick', ti);
      return;
    }
    // tap on board with a keyboard/tap selection: place the selected piece there
    if (this.sel && r.tray[this.sel.ti]) {
      const c = this.cellAt(p);
      if (c) {
        const d = E.dims(r.tray[this.sel.ti].cells);
        const x = clamp(c.x - Math.floor((d.w - 1) / 2), 0, N - d.w), y = clamp(c.y - Math.floor((d.h - 1) / 2), 0, N - d.h);
        this.sel.x = x; this.sel.y = y; this.tryPlace(this.sel.ti, x, y);
        return;
      }
    }
    if (this.glyphMode) { this.glyphMode = null; }
  }
  pointerUp(p) {
    if (!this.drag) return;
    const d = this.drag;
    const r = this.run.round, piece = r.tray[d.ti];
    if (!this.ptr.moved && piece) {
      // a tap: rotate a rotatable piece, otherwise select it for keyboard / tap placement
      this.drag = null;
      if (piece.rot) { E.rotatePiece(this.run, d.ti, 1); this.snd.play('click'); return; }
      this.selectPiece(d.ti);
      return;
    }
    this.drop(true);
  }
  dragTarget() {
    const d = this.drag, b = this.L.board, piece = this.run.round.tray[d.ti];
    if (!piece) return null;
    const dm = E.dims(piece.cells);
    const lift = d.touch ? b.cell * (1.3 + dm.h * 0.5) : 0;
    const left = d.x - dm.w * b.cell / 2, top = d.y - dm.h * b.cell / 2 - lift;
    const fx = (left - b.x) / b.cell, fy = (top - b.y) / b.cell;
    let best = null;
    const rx = Math.round(fx), ry = Math.round(fy);
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const x = rx + ox, y = ry + oy;
      if (!E.canPlace(this.run.round.board, piece.cells, x, y)) continue;
      const dist = Math.hypot(x - fx, y - fy);
      if (dist < 0.85 && (!best || dist < best.dist)) best = { x, y, dist };
    }
    return { left, top, best, piece, dm };
  }
  drop(commit) {
    const d = this.drag; this.drag = null;
    if (!d) return;
    const tg = this.dragTarget.call({ drag: d, L: this.L, run: this.run });
    if (commit && tg && tg.best) { this.tryPlace(d.ti, tg.best.x, tg.best.y); return; }
    if (!tg) return;
    // no legal spot: the piece eases back to its tray slot with a little squash on landing
    const b = this.L.board, k = ease(d.scale), cell = b.cell * (0.62 + 0.38 * k);
    const left = tg.left + (tg.dm.w * (b.cell - cell)) / 2, top = tg.top + (tg.dm.h * (b.cell - cell)) / 2;
    const s = this.L.tray[d.ti];
    this.ret = { ti: d.ti, piece: tg.piece, fx: left + tg.dm.w * cell / 2, fy: top + tg.dm.h * cell / 2, fc: cell, tx: s.x + s.w / 2, ty: s.y + s.h / 2, tc: this.trayCell(s, tg.piece), t: 0, dur: 0.16 };
    if (commit && this.cellAt({ x: tg.left + tg.dm.w * b.cell / 2, y: tg.top + tg.dm.h * b.cell / 2 })) this.snd.play('bad');
  }
  trayCell(s, p) { const dm = E.dims(p.cells); return Math.min(this.L.board.cell * 0.62, (s.w - 12) / Math.max(dm.w, 3.4), (s.h - 12) / Math.max(dm.h, 3.4)); }
  selectPiece(ti) {
    const r = this.run.round;
    if (!r.tray[ti]) return;
    const piece = r.tray[ti], dm = E.dims(piece.cells);
    let x = Math.floor((N - dm.w) / 2), y = Math.floor((N - dm.h) / 2);
    if (this.sel) { x = clamp(this.sel.x, 0, N - dm.w); y = clamp(this.sel.y, 0, N - dm.h); }
    this.sel = { ti, x, y };
    if (this.glyphMode && glyphById[this.run.glyphs[this.glyphMode.gi]]?.t === 'piece') this.applyGlyph(this.glyphMode.gi, ti);
    this.snd.play('pick');
  }
  key(e) {
    this.snd.unlock();
    const k = e.code;
    if (this.ui.open) { this.ui.key(e); return; }
    if (this.scene !== 'play' || !this.run) return;
    const r = this.run.round;
    if (k === 'Escape' || k === 'KeyP') { if (this.glyphMode) { this.glyphMode = null; return; } this.ui.show('pause'); return; }
    if (['Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3'].includes(k)) {
      const ti = +k.slice(-1) - 1;
      if (r.boss === 'drip') { if (r.tray[1]) this.selectPiece(1); } else this.selectPiece(ti);
      return;
    }
    if (k === 'Digit4' || k === 'Digit5') { const gi = +k.slice(-1) - 4; if (this.run.glyphs[gi]) this.glyphTap(gi); return; }
    if (k === 'KeyZ') { const gi = this.run.glyphs.indexOf('undo'); if (gi >= 0) this.applyGlyph(gi); else this.snd.play('bad'); return; }
    const mv = { ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0], ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1] }[k];
    if (mv) {
      e.preventDefault();
      if (!this.sel) { const ti = r.tray.findIndex(Boolean); if (ti < 0) return; this.selectPiece(ti); return; }
      const p = r.tray[this.sel.ti]; if (!p) return;
      const dm = E.dims(p.cells);
      this.sel.x = clamp(this.sel.x + mv[0], 0, N - dm.w); this.sel.y = clamp(this.sel.y + mv[1], 0, N - dm.h);
      this.snd.play('tick');
      return;
    }
    if (k === 'KeyQ' || k === 'KeyE') {
      if (this.sel && E.rotatePiece(this.run, this.sel.ti, k === 'KeyE' ? 1 : -1)) {
        const dm = E.dims(r.tray[this.sel.ti].cells); this.sel.x = clamp(this.sel.x, 0, N - dm.w); this.sel.y = clamp(this.sel.y, 0, N - dm.h);
        this.snd.play('click');
      } else this.snd.play('bad');
      return;
    }
    if (k === 'Space' || k === 'Enter' || k === 'NumpadEnter') {
      e.preventDefault();
      if (this.glyphMode && glyphById[this.run.glyphs[this.glyphMode.gi]].t === 'board' && this.sel) {
        const p = r.tray[this.sel.ti]; const dm = p ? E.dims(p.cells) : { w: 1, h: 1 };
        this.applyGlyph(this.glyphMode.gi, E.idx(this.sel.x + Math.floor(dm.w / 2), this.sel.y + Math.floor(dm.h / 2)));
        return;
      }
      if (this.sel) this.tryPlace(this.sel.ti, this.sel.x, this.sel.y);
    }
  }

  // ------------------------------------------------------------ glyphs
  glyphTap(gi) {
    const g = this.run.glyphs[gi], def = glyphById[g], r = this.run.round;
    if (!def || r.won || r.lost) return;
    if (def.t === 'now') { this.applyGlyph(gi); return; }
    if (def.t === 'piece' && this.sel && r.tray[this.sel.ti]) { this.applyGlyph(gi, this.sel.ti); return; }
    if (def.t === 'piece' && r.tray.filter(Boolean).length === 1) { this.applyGlyph(gi, r.tray.findIndex(Boolean)); return; }
    this.glyphMode = this.glyphMode?.gi === gi ? null : { gi };
    this.snd.play('click');
  }
  applyGlyph(gi, target) {
    const g = this.run.glyphs[gi];
    if (g === 'undo') this.flushAnim();
    const res = E.useGlyph(this.run, gi, target);
    this.glyphMode = null;
    if (!res) { this.snd.play('bad'); return; }
    this.snd.play(g === 'bomb' ? 'bomb' : 'glyph');
    const b = this.L.board;
    if (g === 'bomb') {
      for (const v of res.hit) this.shatter(v.i, v.c, v.m, 0);
      this.shake = Math.max(this.shake, 14);
    }
    if (g === 'undo') { this.disp.score = this.run.round.score; this.ghosts = []; this.toast('Undone'); }
    if (g === 'redeal') this.toast('Fresh pieces');
    if (g === 'extend') this.toast('+3 placements');
    if (this.sel && !this.run.round.tray[this.sel.ti]) this.sel = null;
    this.pops.push({ x: b.x + b.s / 2, y: b.y + b.s / 2, text: glyphById[g].name.toUpperCase() + '!', col: glyphById[g].col, size: 34, life: 0.9, max: 0.9 });
    if (res.secondWind) this.secondWind();
    this.saveRun();
    if (res.lost) this.queueEnd(false);
  }
  secondWind() {
    this.dealT = this.t; this.sel = null;
    this.banner = { title: 'SECOND WIND', sub: 'No piece fit, so your tray was reshuffled. Once per run.', col: '#7ee05a', t: 0, dur: 2.8, kicker: 'A FREE RESCUE' };
    this.snd.play('wind'); this.snd.buzz([20, 40, 20]);
  }

  // ------------------------------------------------------------ placing
  tryPlace(ti, x, y) {
    if (this.pending) return;
    this.flushAnim();
    const run = this.run;
    const res = E.place(run, ti, x, y);
    if (!res) { this.snd.play('bad'); return; }
    if (this.sel) { if (!run.round.tray[this.sel.ti]) { const n = run.round.tray.findIndex(Boolean); this.sel = n >= 0 && !this.ptrUsed ? { ti: n, x: this.sel.x, y: this.sel.y } : null; if (this.sel) { const dm = E.dims(run.round.tray[n].cells); this.sel.x = clamp(this.sel.x, 0, N - dm.w); this.sel.y = clamp(this.sel.y, 0, N - dm.h); } } }
    this.placeFx(res, false);
    if (this.tip && this.tip.step === 0) { this.tip = { text: 'Clears score Chips x Mult. Hit the target before your placements run out.', t: 0, step: 1 }; }
    else if (this.tip && this.tip.step === 1 && res.lines) { this.tip = null; this.save.tut = 1; }
    if (res.secondWind) this.secondWind();
    this.achievements();
    this.saveRun();
    if (res.won) this.pending = { kind: 'win', t: 0 };
    else if (res.lost) this.queueEnd(false);
    else if (res.stuck) this.toast('No room! Use a glyph', '#ff4d6d');
  }
  queueEnd(victory) { this.pending = { kind: victory ? 'victory' : 'lose', t: 0 }; }
  placeFx(res, demo) {
    const b = this.layoutBoard(demo);
    for (const i of res.placedIdx) this.landT.set(i, this.t);
    if (!demo) this.snd.play('place', res.x + Math.floor(E.dims(res.piece.cells).w / 2));
    this.shake = Math.max(this.shake, 2);
    if (res.lines) {
      const px = res.x + E.dims(res.piece.cells).w / 2, py = res.y + E.dims(res.piece.cells).h / 2;
      for (const v of res.cleared) {
        const cx = v.i % N, cy = Math.floor(v.i / N);
        const delay = Math.hypot(cx + 0.5 - px, cy + 0.5 - py) * 0.022;
        this.ghosts.push({ i: v.i, c: v.c, m: v.m, t: -delay, demo });
      }
      for (const i of res.cracked) this.shards(i, '#9a98aa', 5, demo);
      for (const i of res.broken) this.shards(i, '#9a98aa', 12, demo);
      for (const y of res.rows) this.flashes.push({ row: y, t: 0, demo, col: COLORS[res.piece.c].h });
      for (const x of res.cols) this.flashes.push({ cx: x, t: 0, demo, col: COLORS[res.piece.c].h });
      if (!demo) {
        this.snd.play('clear', res.lines);
        this.snd.play('note', Math.min(14, res.streakAfter - 1 + (res.lines - 1)));
        if (res.cracked.length || res.broken.length) this.snd.play('stone');
        this.shake = Math.max(this.shake, 4 + res.lines * 2);
        this.snd.buzz(res.lines >= 2 ? [20, 30, 40] : 25);
        this.startAnim(res);
        const sk = Math.min(6, res.streakAfter);
        if (res.lines >= 2) this.pops.push({ x: b.x + b.s / 2, y: b.y + b.s * 0.2, text: ['', '', 'DOUBLE!', 'TRIPLE!', 'QUAD!!', 'MEGA!!!'][Math.min(5, res.lines)], col: '#ffe066', size: 30 + res.lines * 6, y2: true, life: 1.1, max: 1.1 });
        // every streak step gets a graded word, single-line clears included
        if (res.streakAfter >= 2) {
          this.pops.push({ x: b.x + b.s / 2, y: b.y + b.s * (res.lines >= 2 ? 0.34 : 0.28), text: PRAISE[sk], col: STREAK_COLS[sk - 1], size: 24 + sk * 3, life: 1.05, max: 1.05 });
          this.pops.push({ x: b.x + b.s / 2, y: b.y + b.s * (res.lines >= 2 ? 0.44 : 0.38), text: `STREAK x${res.streakAfter}`, col: '#fff', size: 15, life: 1, max: 1 });
        }
        if (res.boardEmpty) this.pops.push({ x: b.x + b.s / 2, y: b.y + b.s * 0.68, text: 'ALL CLEAR!', col: '#7ee05a', size: 40, life: 1.4, max: 1.4 });
        if (res.extra) this.toast(`+${res.extra} placement`, '#7ee05a');
      } else this.shake = 0;
    } else if (!demo && this.run.round.streak === 0 && res.streak > 0) {
      // losing a streak is a beat of its own: the glow drains, a thud, a small shake
      this.pops.push({ x: b.x + b.s / 2, y: b.y + b.s * 0.3, text: `STREAK LOST`, col: '#ff4d6d', size: 22, life: 0.9, max: 0.9 });
      this.lostT = 0.4; this.shake = Math.max(this.shake, 3); this.snd.play('thud');
    }
    if (res.shrunk) { for (const i of res.shrunk) this.shards(i, '#ff4d6d', 4, demo); if (!demo) { this.snd.play('bomb'); this.toast('The Vise tightens', '#ff4d6d'); this.shake = 12; } }
    if (res.dealt) this.dealT = this.t;
  }
  layoutBoard(demo) { return this.L.board; }
  shards(i, col, n, demo) {
    const b = this.L.board, cx = b.x + (i % N + 0.5) * b.cell, cy = b.y + (Math.floor(i / N) + 0.5) * b.cell;
    const light = mix(col, 0.25), dark = mix(col, -0.15);
    for (let k = 0; k < n; k++) {
      const a = rand(0, Math.PI * 2), sp = rand(60, 360) * (b.cell / 50);
      this.parts.push({ x: cx + rand(-b.cell / 3, b.cell / 3), y: cy + rand(-b.cell / 3, b.cell / 3), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 220, r: rand(0.08, 0.2) * b.cell, rot: rand(0, 6), vr: rand(-14, 14), col: k % 2 ? light : dark, life: rand(0.45, 0.8), max: 0.8, demo });
    }
    for (let k = 0; k < Math.ceil(n / 3); k++) {
      const a = rand(0, Math.PI * 2), sp = rand(40, 200);
      this.parts.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80, r: rand(1.5, 3.5), rot: 0, vr: 0, col: '#ffffff', life: rand(0.3, 0.6), max: 0.6, spark: true, glow: light, demo });
    }
  }
  shatter(i, c, m, delay) {
    const col = m === 'gold' ? '#ffc23a' : m === 'stone' ? '#9a98aa' : COLORS[c % 7].h;
    this.shards(i, col, 9);
    if (Math.random() < 0.5) this.shards(i, '#ffffff', 2);
  }

  // ------------------------------------------------------------ scoring animation (Balatro-style)
  startAnim(res) {
    const sc = res.score;
    const n = sc.events.length;
    this.anim = { res, i: 0, timer: 0.12, step: clamp(1.1 / n, 0.09, 0.2), phase: 'ev', chips: 0, mult: 0, total: sc.total, slamT: 0, k: 0 };
    this.disp.chips = 0; this.disp.mult = 0;
  }
  flushAnim() {
    const a = this.anim; if (!a) return;
    this.disp.chips = a.res.score.chips; this.disp.mult = a.res.score.mult;
    this.disp.score = this.run.round.score;
    this.anim = null;
  }
  updateAnim(dt) {
    const a = this.anim; if (!a) return;
    a.timer -= dt;
    if (a.phase === 'ev') {
      if (a.timer > 0) return;
      const ev = a.res.score.events[a.i++];
      if (!ev) { a.phase = 'slam'; a.slamT = 0; this.slam(a); return; }
      a.timer = a.step;
      this.disp.chips = ev.chips; this.disp.mult = ev.mult;
      const b = this.L.board;
      const amt = ev.kind === 'chips' ? `+${fmt(ev.amt)}` : ev.kind === 'mult' ? `+${fmt(ev.amt)} Mult` : ev.kind === 'x' ? `x${+ev.amt.toFixed(2)} Mult` : ev.kind === 'xchips' ? `x${ev.amt} Chips` : ev.kind === 'money' ? `+$${ev.amt}` : '';
      const col = ev.kind === 'chips' || ev.kind === 'xchips' ? CHIP_BLUE : ev.kind === 'money' ? '#ffcc33' : MULT_RED;
      if (ev.src === 'charm') {
        this.wiggle[ev.slot] = 1;
        const c = this.L.charms[ev.slot];
        if (c) this.pops.push({ x: c.x + c.w / 2, y: c.y + c.h * 0.55, text: amt, col, size: clamp(c.w * 0.26, 15, 24), life: 0.85, max: 0.85, card: true });
      } else if (ev.src === 'mat') {
        a.mk = (a.mk || 0) + 1;
        this.pops.push({ x: b.x + b.s / 2, y: b.y + b.s * 0.48 + a.mk * 30, text: amt, col, size: 24, life: 0.9, max: 0.9 });
      }
      a.k++;
      if (ev.kind === 'chips' || ev.kind === 'xchips') this.snd.play('chips', a.k);
      else if (ev.kind === 'mult') this.snd.play('mult', a.k);
      else if (ev.kind === 'x') { this.snd.play('xmult'); this.shake = Math.max(this.shake, 6); }
      else if (ev.kind === 'money') this.snd.play('money');
      else if (ev.kind === 'base') this.snd.play('chips', 0);
    } else if (a.phase === 'slam') {
      a.slamT += dt;
      if (a.slamT > 0.9) { this.anim = null; }
    }
  }
  slam(a) {
    const total = a.total, b = this.L.board;
    const mag = clamp(Math.log10(Math.max(10, total)) - 1.5, 0, 4.5); // 0 (~30) .. 4.5 (~1M)
    this.shake = Math.max(this.shake, 5 + mag * 5);
    this.snd.play('slam', mag / 4); this.snd.buzz(60);
    this.disp.slam = { total, t: 0, mag, x: b.x + b.s / 2, y: b.y + b.s / 2 };
    // sparks
    for (let k = 0; k < 14 + mag * 10; k++) {
      const an = rand(0, Math.PI * 2), sp = rand(150, 520) * (1 + mag * 0.2);
      this.parts.push({ x: b.x + b.s / 2, y: b.y + b.s / 2, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, r: rand(3, 6), rot: 0, vr: 0, col: k % 2 ? CHIP_BLUE : MULT_RED, life: rand(0.4, 0.8), max: 0.8, spark: true });
    }
  }

  // ------------------------------------------------------------ meta
  achievements() {
    const run = this.run; if (!run || run.mode === 'zen') return;
    const s = run.stats, got = [];
    const give = id => { if (!this.save.ach[id]) { this.save.ach[id] = 1; got.push(id); } };
    if (run.ante >= 4) give('ante4');
    if (s.quad) give('quad');
    if (s.bestHand >= 5000) give('bighand');
    if (run.gold >= 30) give('rich');
    if (s.sweep) give('sweep');
    if (s.maxStreak >= 8) give('streak8');
    if (run.won) give('ante8');
    for (const id of run.seen) if (!this.save.seen.includes(id)) this.save.seen.push(id);
    if (this.save.seen.length >= 30) give('collector');
    for (const id of got) {
      const a = ACHIEVEMENTS.find(x => x.id === id);
      const deck = DECKS.find(d => d.unlock === id);
      this.ui.toast(`Achievement: ${a.name}` + (deck && !this.save.decks.includes(deck.id) ? ` · ${deck.name} unlocked!` : ''), '#ffcc33');
      if (deck && !this.save.decks.includes(deck.id)) { this.save.decks.push(deck.id); this.save.stakes[deck.id] = 0; }
    }
    this.save.best.hand = Math.max(this.save.best.hand, s.bestHand);
    if (got.length) this.persist();
  }
  endRun(victory) {
    const run = this.run; run.over = true;
    const zen = run.mode === 'zen';
    const xp = zen ? Math.min(60, Math.floor(run.round.score / 400)) : run.ante * 25 + run.stats.rounds * 8 + (victory ? 200 : 0);
    const before = this.save.level;
    this.save.xp += xp;
    while (this.save.xp >= this.save.level * XP_PER_LEVEL) { this.save.xp -= this.save.level * XP_PER_LEVEL; this.save.level++; }
    const unlocked = [];
    // levels unlock decks in order too, so even failed runs move you forward
    for (let L = before + 1; L <= this.save.level; L++) {
      const d = DECKS[L - 1]; if (d && !this.save.decks.includes(d.id)) { this.save.decks.push(d.id); this.save.stakes[d.id] = 0; unlocked.push(d.name); }
    }
    if (victory) {
      this.save.wins++;
      const cur = this.save.stakes[run.deckId] ?? 0;
      if (run.stake >= cur && run.stake < STAKES.length - 1) { this.save.stakes[run.deckId] = run.stake + 1; unlocked.push(`${STAKES[run.stake + 1].n} Stake`); }
    }
    if (zen) this.save.best.zen = Math.max(this.save.best.zen, run.round.score);
    else this.save.best.ante = Math.max(this.save.best.ante, run.ante + (victory ? 1 : 0));
    if (run.mode === 'daily') {
      if (!this.save.ach.daily) { this.save.ach.daily = 1; this.ui.toast('Achievement: Daily Grind', '#ffcc33'); }
      const prev = this.save.daily[today()];
      const rec = { ante: run.ante, ri: run.ri, won: victory, hand: run.stats.bestHand };
      if (!prev || rec.ante * 3 + rec.ri > prev.ante * 3 + prev.ri) this.save.daily[today()] = rec;
    }
    // every mode gets a share card (seeded runs can be replayed by anyone who gets the seed)
    const share = zen ? null : this.shareText(run, victory);
    // after the first win most players want Balatro's "2x": promote to 1.5x once, they can change it in pause
    if (victory && !this.save.speedSet) { this.save.speedSet = 1; this.save.speed = 1.5; this.ui.toast('Game speed is now 1.5x (change it in the pause menu)', '#7ee05a'); }
    this.achievements();
    this.save.run = null;
    this.persist();
    this.scene = 'over';
    this.snd.play(victory ? 'win' : 'lose');
    this.ui.show('over', { victory, xp, levelUp: this.save.level > before, unlocked, share });
  }
  shareText(run, victory) {
    let row = '';
    for (let a = 1; a <= ANTES; a++) row += a < run.ante || victory ? '🟩' : a === run.ante ? ['🟥', '🟧', '🟨'][run.ri] : '⬛';
    const head = run.mode === 'daily' ? `Daily ${today()}` : `${deckById[run.deckId].name} · ${STAKES[run.stake].n} Stake · seed ${run.seed}`;
    return `💎 BLOCK ROYALE · ${head}\n${row} ${victory ? '👑 WON' : `Ante ${run.ante}`}\nBest hand: ${fmt(run.stats.bestHand)} 💥\nLines: ${run.stats.lines}`;
  }

  // ------------------------------------------------------------ flow after a round
  afterRound() {
    const run = this.run;
    const copper = run.charms.filter(s => byId[s.id].r === 0).length;
    if (run.ri === 2 && copper >= 5 && !this.save.ach.copper5) { this.save.ach.copper5 = 1; if (!this.save.decks.includes('tinker')) { this.save.decks.push('tinker'); this.save.stakes.tinker = 0; } this.ui.toast('Achievement: Penny Pincher · Tinker Deck unlocked!', '#ffcc33'); }
    const rew = E.finishRound(run);
    this.disp.gold = run.gold - rew.total;
    if (run.won) { this.endRun(true); return; }
    this.scene = 'shop';
    this.saveRun();
    this.snd.play('win');
    this.ui.show('cash', rew);
  }
  nextRound() {
    E.nextRound(this.run);
    this.resetFx();
    this.scene = 'play';
    this.ui.hide();
    this.layout();
    this.roundIntro();
    this.saveRun();
  }
  toast(text, col = '#fff') { this.pops.push({ x: this.L.board.x + this.L.board.s / 2, y: this.L.board.y + this.L.board.s * 0.82, text, col, size: 22, life: 1.3, max: 1.3, toast: true }); }

  // ------------------------------------------------------------ loop
  loop(now) {
    requestAnimationFrame(t => this.loop(t));
    const raw = (now - this.last) / 1000;
    const dt = Math.min(0.05, raw); this.last = now;
    this.t += dt;
    if (this.fps) { const f = this.fps; f.n++; f.t += raw; f.worst = Math.max(f.worst, raw * 1000); if (f.t >= 0.5) { f.v = Math.round(f.n / f.t); f.n = 0; f.t = 0; f.shownWorst = f.worst; f.worst = 0; } }
    this.update(dt);
    this.render();
  }
  update(dt) {
    // this.speed is the test hook; save.speed is the player's 1x / 1.5x / 2x setting
    dt *= this.speed * (this.scene === 'play' ? (this.save.speed || 1) : 1);
    this.snd.update();
    const playing = this.scene === 'play' && this.run;
    this.snd.intensity = playing ? clamp(this.run.round.streak / 5, 0, 1) : 0.2;
    if (!this.run || this.scene === 'title') this.stepDemo(dt);
    if (this.drag && this.ptr) { this.drag.x = this.ptr.x; this.drag.y = this.ptr.y; }
    if (this.drag) this.drag.scale = Math.min(1, this.drag.scale + dt * 9);
    this.updateAnim(dt);
    if (this.disp.slam) { this.disp.slam.t += dt; if (this.disp.slam.t > 1.0) this.disp.slam = null; }
    // round score counts up toward the real score once the slam lands
    const target = this.run ? this.run.round.score - (this.anim ? this.anim.total : 0) : 0;
    if (this.run) { const d = target - this.disp.score; this.disp.score += clamp(d * Math.min(1, dt * 7) + Math.sign(d) * dt * 30, -Math.abs(d), Math.abs(d)); }
    if (this.run) this.disp.gold += (this.run.gold - this.disp.gold) * Math.min(1, dt * 8);
    for (const p of this.parts) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.spark ? 300 : 1300) * dt; p.vx *= 0.99; p.rot += p.vr * dt; }
    this.parts = this.parts.filter(p => p.life > 0);
    for (const p of this.pops) { p.life -= dt; }
    this.pops = this.pops.filter(p => p.life > 0);
    for (const f of this.flashes) f.t += dt;
    this.flashes = this.flashes.filter(f => f.t < 0.5);
    for (const gh of this.ghosts) { const was = gh.t; gh.t += dt; if (was < 0 && gh.t >= 0) this.shatter(gh.i, gh.c, gh.m); }
    this.ghosts = this.ghosts.filter(gh => gh.t < 0.22);
    this.wiggle = this.wiggle.map(v => Math.max(0, (v || 0) - dt * 3));
    this.shake = Math.max(0, this.shake - dt * 40);
    if (this.banner) { this.banner.t += dt; if (this.banner.t > this.banner.dur) this.banner = null; }
    if (this.tipCharm) { this.tipCharm.t -= dt; if (this.tipCharm.t <= 0) this.tipCharm = null; }
    if (this.tip) { this.tip.t += dt; if (this.tip.dur && this.tip.t > this.tip.dur) this.tip = null; }
    if (this.ret) { this.ret.t += dt; if (this.ret.t > this.ret.dur + 0.14) this.ret = null; }
    this.lostT = Math.max(0, this.lostT - dt);
    if (this.pending && !this.anim) {
      if (this.pending.kind === 'win' && !this.pending.shown) {
        // the payoff beat: the target falls before the cash-out panel appears
        this.pending.shown = true;
        const b = this.L.board, r = this.run.round;
        this.pops.push({ x: b.x + b.s / 2, y: b.y + b.s * 0.42, text: r.boss ? 'BOSS BEATEN!' : 'TARGET HIT!', col: '#ffe066', size: clamp(b.s * 0.09, 30, 50), life: 1.1, max: 1.1 });
        this.shake = Math.max(this.shake, 9);
        this.snd.play('target');
        for (let k = 0; k < 40; k++) {
          const an = rand(0, Math.PI * 2), sp = rand(120, 420);
          this.parts.push({ x: b.x + b.s / 2, y: b.y + b.s * 0.42, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp - 120, r: rand(3, 6), rot: 0, vr: 0, col: k % 3 ? '#ffe066' : '#fff', life: rand(0.5, 0.9), max: 0.9, spark: true });
        }
      }
      this.pending.t += dt;
      if (this.pending.t > (this.pending.kind === 'win' ? 1.05 : 0.9)) {
        const k = this.pending.kind; this.pending = null;
        if (k === 'win') this.afterRound(); else this.endRun(k === 'victory');
      }
    }
  }

  // ------------------------------------------------------------ render
  render() {
    const g = this.g, w = this.w, h = this.h, dpr = this.dpr, t = this.t;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const run = this.scene === 'title' || !this.run ? this.demo : this.run;
    const streak = run?.round?.streak || 0;
    background(g, w, h, t, dpr, clamp(streak / 6, 0, 1));
    if (!run) return;
    const sh = this.shake;
    g.save();
    if (sh > 0.3) g.translate(rand(-sh, sh) * 0.5, rand(-sh, sh) * 0.5);
    const titleMode = this.scene === 'title' || run === this.demo;
    this.drawBoard(run, titleMode);
    if (!titleMode) {
      this.drawHud(run);
      this.drawCharms(run);
      this.drawGlyphs(run);
      this.drawTray(run);
    }
    this.drawParts();
    if (!titleMode) {
      this.drawDrag(run);
      this.drawSlam();
      this.drawPops();
      this.drawBanner();
      this.drawTip();
      this.drawCharmTip(run);
      this.drawPause();
    }
    g.restore();
    if (this.fps) { g.font = `800 12px ${UIFONT}`; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillStyle = '#7ee05a'; g.fillText(`${this.fps.v} fps · worst ${Math.round(this.fps.shownWorst || 0)} ms`, 8, h - 18); }
  }
  drawBoard(run, demo) {
    const g = this.g, b = this.L.board, r = run.round, t = this.t, cell = b.cell;
    const streak = r.streak || 0;
    // the streak glow drains to grey for 0.4 s when a streak is lost
    const lost = !demo && this.lostT > 0;
    const glowCol = lost ? '#8a8aa0' : STREAK_COLS[Math.min(STREAK_COLS.length - 1, Math.max(0, streak - 1))];
    boardWell(g, b.x, b.y, b.s, cell, N, glowCol, demo ? 0.15 : lost ? this.lostT / 0.4 * 0.5 : clamp(streak / 5, 0, 1) * (0.75 + 0.25 * Math.sin(t * 6)), this.dpr);
    this.pv = null;
    // near-full hint glow
    const B = r.board.cells;
    const hint = [];
    for (let y = 0; y < N; y++) { let n = 0; for (let x = 0; x < N; x++) if (B[E.idx(x, y)]) n++; if (n === N - 1) hint.push({ row: y }); }
    if (r.boss !== 'pillar') for (let x = 0; x < N; x++) { let n = 0; for (let y = 0; y < N; y++) if (B[E.idx(x, y)]) n++; if (n === N - 1) hint.push({ col: x }); }
    // preview of what the dragged / selected piece would clear
    let pv = null;
    if (!demo) {
      if (this.drag) { const tg = this.dragTarget(); if (tg?.best) pv = { piece: tg.piece, x: tg.best.x, y: tg.best.y }; }
      else if (this.sel && r.tray[this.sel.ti] && !this.glyphMode) pv = { piece: r.tray[this.sel.ti], x: this.sel.x, y: this.sel.y, kb: true };
    }
    let clearSet = null;
    if (pv && E.canPlace(r.board, pv.piece.cells, pv.x, pv.y)) {
      const fl = E.linesWithPiece(r.board, pv.piece.cells, pv.x, pv.y, r.boss === 'pillar');
      if (fl.rows.length || fl.cols.length) {
        clearSet = new Set();
        for (const y of fl.rows) for (let x = 0; x < N; x++) clearSet.add(E.idx(x, y));
        for (const x of fl.cols) for (let y = 0; y < N; y++) clearSet.add(E.idx(x, y));
      }
    }
    if (!clearSet) for (const hh of hint) {
      const pulse = 0.12 + 0.08 * Math.sin(t * 4);
      g.fillStyle = `rgba(255,240,200,${pulse})`;
      if (hh.row !== undefined) { rrect(g, b.x + 2, b.y + hh.row * cell + 2, b.s - 4, cell - 4, cell * 0.2); g.fill(); }
      else { rrect(g, b.x + hh.col * cell + 2, b.y + 2, cell - 4, b.s - 4, cell * 0.2); g.fill(); }
    }
    // blocks
    for (let i = 0; i < N * N; i++) {
      const v = B[i]; if (!v) continue;
      const x = b.x + (i % N) * cell, y = b.y + Math.floor(i / N) * cell;
      const lt = this.landT.get(i);
      let s = cell;
      if (lt !== undefined) { const k = (t - lt) / 0.18; if (k < 0) continue; if (k < 1) s = cell * (1 + 0.16 * Math.sin(k * Math.PI) * (1 - k)); else this.landT.delete(i); }
      const o = (cell - s) / 2;
      if (clearSet && clearSet.has(i) && v.m !== 'void' && v.m !== 'stone') block(g, x + o, y + o, s, pv.piece.c, pv.piece.mat || 'n', t, this.dpr);
      else block(g, x + o, y + o, s, v.c, v.m, t, this.dpr, { hp: v.m === 'stone' ? v.hp : 0 });
      if (clearSet && clearSet.has(i)) { g.fillStyle = `rgba(255,255,255,${0.12 + 0.1 * Math.sin(t * 10)})`; rrect(g, x + 2, y + 2, cell - 4, cell - 4, cell * 0.2); g.fill(); }
    }
    // ghost of the piece where it would land
    if (pv && E.canPlace(r.board, pv.piece.cells, pv.x, pv.y)) {
      const col = COLORS[pv.piece.c].h;
      for (const [cx, cy] of pv.piece.cells) {
        const i = E.idx(pv.x + cx, pv.y + cy);
        const x = b.x + (pv.x + cx) * cell, y = b.y + (pv.y + cy) * cell;
        if (clearSet || pv.kb) { g.globalAlpha = pv.kb ? 0.85 : 0.6; block(g, x, y, cell, pv.piece.c, pv.piece.mat || 'n', t, this.dpr); g.globalAlpha = 1; }
        else ghostBlock(g, x, y, cell, col, 0.9);
        if (pv.kb) { g.strokeStyle = '#fff'; g.lineWidth = 2; rrect(g, x + 3, y + 3, cell - 6, cell - 6, cell * 0.2); g.stroke(); }
      }
    } else if (pv && pv.kb) {
      for (const [cx, cy] of pv.piece.cells) {
        const X = pv.x + cx, Y = pv.y + cy; if (X >= N || Y >= N) continue;
        ghostBlock(g, b.x + X * cell, b.y + Y * cell, cell, '#ff4d4d', 0.8);
      }
    }
    // score preview: what this placement would be worth (Chips x Mult = total)
    if (clearSet && pv && !this.anim) {
      const ps = E.preview(run, this.drag ? this.drag.ti : this.sel.ti, pv.x, pv.y);
      if (ps) { this.drawPreview(ps, pv, b, cell); this.pv = ps; }
    }
    // bomb targeting preview
    if (!demo && this.glyphMode && run.glyphs[this.glyphMode.gi] === 'bomb') {
      let c = this.hover ? this.cellAt(this.hover) : null;
      if (!c && this.sel) c = { x: this.sel.x, y: this.sel.y };
      if (c) { g.fillStyle = `rgba(255,77,77,${0.25 + 0.12 * Math.sin(t * 12)})`; rrect(g, b.x + (c.x - 1) * cell, b.y + (c.y - 1) * cell, cell * 3, cell * 3, cell * 0.3); g.fill(); g.strokeStyle = '#ff4d4d'; g.lineWidth = 2; g.stroke(); }
    }
    // cleared blocks pop and vanish
    for (const gh of this.ghosts) {
      if (!!gh.demo !== demo) continue;
      const x = b.x + (gh.i % N) * cell, y = b.y + Math.floor(gh.i / N) * cell;
      if (gh.t < 0) { block(g, x, y, cell, gh.c, gh.m, t, this.dpr); continue; }
      const k = gh.t / 0.22, s = cell * (1 + k * 0.35);
      g.globalAlpha = 1 - k;
      block(g, x - (s - cell) / 2, y - (s - cell) / 2, s, gh.c, gh.m, t, this.dpr);
      g.fillStyle = `rgba(255,255,255,${(1 - k) * 0.8})`; rrect(g, x - (s - cell) / 2, y - (s - cell) / 2, s, s, s * 0.2); g.fill();
      g.globalAlpha = 1;
    }
    // line flashes
    for (const f of this.flashes) {
      const k = f.t / 0.5, a = (1 - k);
      g.save(); g.globalCompositeOperation = 'lighter';
      const col = f.col || '#ffffff';
      if (f.row !== undefined) {
        const y = b.y + f.row * cell + cell / 2, hh = cell * (0.9 + k * 0.6);
        const gr = g.createLinearGradient(0, y - hh / 2, 0, y + hh / 2);
        gr.addColorStop(0, rgba(col, 0)); gr.addColorStop(0.5, `rgba(255,255,255,${a * 0.9})`); gr.addColorStop(1, rgba(col, 0));
        g.fillStyle = gr; g.fillRect(b.x - cell * 0.3 - k * 30, y - hh / 2, b.s + cell * 0.6 + k * 60, hh);
      } else {
        const x = b.x + f.cx * cell + cell / 2, ww = cell * (0.9 + k * 0.6);
        const gr = g.createLinearGradient(x - ww / 2, 0, x + ww / 2, 0);
        gr.addColorStop(0, rgba(col, 0)); gr.addColorStop(0.5, `rgba(255,255,255,${a * 0.9})`); gr.addColorStop(1, rgba(col, 0));
        g.fillStyle = gr; g.fillRect(x - ww / 2, b.y - cell * 0.3 - k * 30, ww, b.s + cell * 0.6 + k * 60);
      }
      g.restore();
    }
  }
  // floating "320 x 5 = 1,600" pill inside the board, on whichever half the piece is not in
  drawPreview(ps, pv, b, cell) {
    const g = this.g, t = this.t;
    const dm = E.dims(pv.piece.cells);
    const pieceMid = pv.y + dm.h / 2;
    const y = pieceMid < N / 2 ? b.y + b.s - cell * 0.95 : b.y + cell * 0.95;
    const fs = clamp(cell * 0.42, 15, 26), small = fs * 0.78;
    const chips = short(ps.chips), mult = ps.mult % 1 ? (+ps.mult.toFixed(1)).toString() : short(ps.mult), total = '+' + short(ps.total);
    g.font = `${fs}px ${FONT}`;
    const wT = g.measureText(total).width;
    g.font = `${small}px ${FONT}`;
    const wC = g.measureText(chips).width, wM = g.measureText(mult).width, wX = g.measureText(' × ').width, wE = g.measureText(' = ').width;
    const W = wC + wX + wM + wE + wT + fs * 1.6, H = fs * 1.75;
    const x0 = b.x + b.s / 2 - W / 2;
    const k = 0.5 + 0.5 * Math.sin(t * 5);
    g.save();
    rrect(g, x0, y - H / 2, W, H, H / 2);
    g.fillStyle = 'rgba(10,5,24,.9)'; g.fill();
    g.strokeStyle = ps.won ? `rgba(255,224,102,${0.6 + 0.4 * k})` : 'rgba(255,255,255,.25)'; g.lineWidth = ps.won ? 2.5 : 1.5; g.stroke();
    let x = x0 + fs * 0.8;
    const put = (s, size, col) => { otext(g, s, x, y + 1, size, col, { align: 'left', lw: Math.max(3, size * 0.16), shadow: false }); g.font = `${size}px ${FONT}`; x += g.measureText(s).width; };
    put(chips, small, CHIP_BLUE); put(' × ', small, '#fff'); put(mult, small, MULT_RED); put(' = ', small, '#fff'); put(total, fs, ps.won ? '#ffe066' : '#fff');
    if (ps.won) otext(g, 'TARGET!', b.x + b.s / 2, y - H / 2 - fs * 0.55, small, '#ffe066', { lw: 3 });
    else if (ps.money) otext(g, `+$${ps.money}`, x0 + W + fs * 0.9, y + 1, small, '#ffcc33', { align: 'left', lw: 3 });
    g.restore();
  }
  drawParts() {
    const g = this.g;
    for (const p of this.parts) {
      const a = clamp(p.life / p.max, 0, 1);
      g.globalAlpha = a;
      if (p.spark) {
        g.save(); g.globalCompositeOperation = 'lighter';
        if (p.glow) { g.fillStyle = rgba(p.glow.startsWith('#') ? p.glow : '#ffffff', 0.35 * a); g.beginPath(); g.arc(p.x, p.y, p.r * 3, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = p.col; g.beginPath(); g.arc(p.x, p.y, p.r * a + 1, 0, Math.PI * 2); g.fill(); g.restore(); continue;
      }
      g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
      g.fillStyle = p.col;
      g.beginPath(); g.moveTo(-p.r, -p.r * 0.6); g.lineTo(p.r, -p.r * 0.2); g.lineTo(-p.r * 0.2, p.r); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,.45)'; g.beginPath(); g.moveTo(-p.r, -p.r * 0.6); g.lineTo(p.r * 0.2, -p.r * 0.35); g.lineTo(-p.r * 0.5, 0); g.closePath(); g.fill();
      g.restore();
    }
    g.globalAlpha = 1;
  }

  // ------------------------------------------------------------ HUD
  drawHud(run) {
    const g = this.g, H = this.L.hud, r = run.round, zen = run.mode === 'zen';
    const boss = r.boss && bossById[r.boss];
    if (H.compact) { /* drawn below */ }
    const hh = H.tall ? Math.min(H.h, (boss ? 392 : 376) - (zen ? 50 : 0)) : H.h;
    if (!H.compact) panel(g, H.x, H.y, H.w, hh, 16);
    const rcol = zen ? '#2fd3c5' : boss ? boss.col : run.ri ? '#ffb020' : '#2fd3c5';
    const prog = zen ? 0 : clamp(this.disp.score / r.target, 0, 1);
    if (H.compact) {
      panel(g, H.x, H.y, H.w, H.h, 14);
      const x = H.x + 10, W = H.w - 20, top = H.y + 8;
      g.textBaseline = 'middle'; g.textAlign = 'left';
      g.font = `800 10px ${UIFONT}`; g.fillStyle = 'rgba(255,255,255,.55)';
      g.fillText(zen ? 'ZEN MODE' : `ANTE ${run.ante}/${ANTES}`, x, top + 7);
      g.font = `900 11px ${UIFONT}`; g.fillStyle = rcol; g.textAlign = 'right';
      g.fillText(zen ? 'ENDLESS' : boss ? boss.name.toUpperCase() : ROUND_NAMES[run.ri].toUpperCase(), x + W, top + 7);
      g.textAlign = 'left'; g.font = `800 10px ${UIFONT}`; g.fillStyle = 'rgba(255,255,255,.55)';
      if (boss) { g.font = `700 10px ${UIFONT}`; g.fillStyle = 'rgba(255,255,255,.8)'; g.fillText(boss.d, x, top + 21); }
      else if (!zen) { g.fillText('TARGET', x, top + 21); otext(g, fmt(r.target), x + 46, top + 22, 14, '#ffd166', { align: 'left', lw: 3, shadow: false }); }
      else g.fillText(`BEST ${short(Math.max(this.save.best.zen, r.score))}`, x, top + 21);
      otext(g, short(this.disp.score), x + W, top + 40, 28, '#fff', { align: 'right', lw: 5 });
      if (!zen) this.progBar(x, top + 58, W, 7, prog, rcol);
      const y2 = top + 72, bh = H.h - 80;
      const cmW = W * 0.56;
      this.chipsMult(x, y2, cmW, bh);
      const sx = x + cmW + 6, sw = (W - cmW - 6 - 4) / 2;
      this.statBox(sx, y2, sw, bh, 'LEFT', zen ? '∞' : `${r.left}`, r.left <= 3 && !zen ? '#ff4d4d' : '#fff');
      this.statBox(sx + sw + 4, y2, sw, bh, zen ? 'LINES' : 'GOLD', zen ? `${r.lines}` : `$${Math.round(this.disp.gold)}`, zen ? '#fff' : '#ffcc33');
      return;
    }
    if (H.tall) {
      const x = H.x + 16, W = H.w - 32;
      const used = Math.min(H.h, (boss ? 392 : 376) - (zen ? 50 : 0));
      if (!this.L.side?.short && used < H.h - 110) {
        this.runInfo(run, H.x, H.y + used + 12, H.w, H.h - used - 12);
      }
      let y = H.y + 18;
      // round pill
      g.font = `13px ${UIFONT}`; g.textBaseline = 'middle'; g.textAlign = 'left';
      g.fillStyle = 'rgba(255,255,255,.55)'; g.font = `800 12px ${UIFONT}`;
      g.fillText(zen ? 'ZEN MODE' : run.mode === 'daily' ? `DAILY · ANTE ${run.ante} / ${ANTES}` : `ANTE ${run.ante} / ${ANTES}`, x, y + 2);
      y += 14;
      const pillH = 34;
      rrect(g, x, y, W, pillH, 10); g.fillStyle = rgba(rcol, 0.18); g.fill(); g.strokeStyle = rgba(rcol, 0.7); g.lineWidth = 1.5; g.stroke();
      otext(g, zen ? 'ENDLESS' : boss ? boss.name.toUpperCase() : ROUND_NAMES[run.ri].toUpperCase(), x + W / 2, y + pillH / 2 + 1, 19, rcol, { lw: 4 });
      y += pillH + 6;
      if (boss) { g.font = `700 12px ${UIFONT}`; g.fillStyle = 'rgba(255,255,255,.8)'; g.textAlign = 'center'; g.fillText(boss.d, x + W / 2, y + 7); y += 16; }
      y += 6;
      if (!zen) {
        g.font = `800 11px ${UIFONT}`; g.fillStyle = 'rgba(255,255,255,.5)'; g.textAlign = 'left'; g.fillText('TARGET', x, y + 6);
        otext(g, fmt(r.target), x + W, y + 8, 22, '#ffd166', { align: 'right', lw: 4 });
        y += 26;
      }
      // score
      g.font = `800 11px ${UIFONT}`; g.fillStyle = 'rgba(255,255,255,.5)'; g.textAlign = 'left'; g.fillText(zen ? 'SCORE' : 'ROUND SCORE', x, y + 6);
      if (zen) { g.textAlign = 'right'; g.fillText(`BEST ${short(Math.max(this.save.best.zen, r.score))}`, x + W, y + 6); }
      y += 14;
      otext(g, short(this.disp.score), x + W / 2, y + 24, Math.min(46, W * 0.2), '#fff', { lw: 6 });
      y += 52;
      if (!zen) { this.progBar(x, y, W, 12, prog, rcol); y += 24; }
      // chips x mult
      y = this.chipsMult(x, y, W, 52) + 12;
      // placements + gold
      const half = (W - 10) / 2;
      this.statBox(x, y, half, 54, 'PLACEMENTS', zen ? '∞' : `${r.left}`, r.left <= 3 && !zen ? '#ff4d4d' : '#fff', zen ? '' : `/ ${r.max}`);
      this.statBox(x + half + 10, y, half, 54, zen ? 'LINES' : 'GOLD', zen ? `${r.lines}` : `$${Math.round(this.disp.gold)}`, zen ? '#fff' : '#ffcc33');
      y += 64;
      // streak
      if (y + 30 < H.y + H.h) this.streakMeter(x, y, W, r.streak);
    } else {
      const x = H.x + 12, W = H.w - 24, top = H.y + 10;
      g.textBaseline = 'middle';
      g.font = `800 11px ${UIFONT}`; g.fillStyle = 'rgba(255,255,255,.55)'; g.textAlign = 'left';
      g.fillText(zen ? 'ZEN MODE' : `ANTE ${run.ante}/${ANTES} · ${boss ? boss.name.toUpperCase() : ROUND_NAMES[run.ri].toUpperCase()}`, x, top + 6);
      if (boss) { g.font = `700 11px ${UIFONT}`; g.fillStyle = rcol; g.fillText(boss.d, x, top + 21); }
      else if (!zen) { g.font = `800 11px ${UIFONT}`; g.fillStyle = 'rgba(255,255,255,.55)'; g.fillText('TARGET', x, top + 21); otext(g, fmt(r.target), x + 52, top + 22, 16, '#ffd166', { align: 'left', lw: 3, shadow: false }); }
      else { g.fillText(`BEST ${short(Math.max(this.save.best.zen, r.score))}`, x, top + 21); }
      otext(g, short(this.disp.score), x + W - 70, top + 16, 30, '#fff', { align: 'right', lw: 5 });
      if (!zen) this.progBar(x, top + 36, W, 8, prog, rcol);
      const y2 = top + 50, bh = H.h - 60;
      const cmW = Math.min(W * 0.52, 230);
      this.chipsMult(x, y2, cmW, bh);
      const sx = x + cmW + 8, sw = (W - cmW - 8 - 6) / 2;
      this.statBox(sx, y2, sw, bh, 'LEFT', zen ? '∞' : `${r.left}`, r.left <= 3 && !zen ? '#ff4d4d' : '#fff');
      this.statBox(sx + sw + 6, y2, sw, bh, zen ? 'LINES' : 'GOLD', zen ? `${r.lines}` : `$${Math.round(this.disp.gold)}`, zen ? '#fff' : '#ffcc33');
    }
  }
  runInfo(run, x, y, w, h) {
    const g = this.g, st = run.stats;
    panel(g, x, y, w, h, 16, 0.7);
    const rows = run.mode === 'zen'
      ? [['Best streak', String(st.maxStreak)], ['Blocks placed', String(st.placed)], ['Best hand', short(st.bestHand)]]
      : [['Deck', deckById[run.deckId].name], ['Stake', STAKES[run.stake].n], ['Best hand', short(st.bestHand)], ['Lines cleared', String(st.lines)], [run.mode === 'daily' ? 'Daily seed' : 'Seed', run.mode === 'daily' ? run.seed.slice(6) : run.seed]];
    g.textBaseline = 'middle';
    const lh = Math.min(26, (h - 20) / rows.length);
    rows.forEach(([k, v], i) => {
      const yy = y + 18 + i * lh;
      if (yy > y + h - 10) return;
      g.font = `800 11px ${UIFONT}`; g.fillStyle = 'rgba(255,255,255,.45)'; g.textAlign = 'left'; g.fillText(k.toUpperCase(), x + 16, yy);
      g.font = `800 13px ${UIFONT}`; g.fillStyle = k === 'Best hand' ? MULT_RED : '#e8e0ff'; g.textAlign = 'right'; g.fillText(v, x + w - 16, yy);
    });
  }
  progBar(x, y, w, h, p, col) {
    const g = this.g;
    rrect(g, x, y, w, h, h / 2); g.fillStyle = 'rgba(0,0,0,.4)'; g.fill();
    if (p > 0) {
      rrect(g, x, y, Math.max(h, w * p), h, h / 2);
      const gr = g.createLinearGradient(x, 0, x + w, 0);
      gr.addColorStop(0, mix(col, -0.2)); gr.addColorStop(1, p >= 1 ? '#ffe066' : mix(col, 0.25));
      g.fillStyle = gr; g.fill();
      g.fillStyle = 'rgba(255,255,255,.35)'; rrect(g, x + 2, y + 1.5, Math.max(0, w * p - 4), h * 0.3, h * 0.15); g.fill();
    }
  }
  // Chips x Mult boxes. Like Balatro's panel they always show a value: the live count while
  // scoring, the held placement's preview while you aim, otherwise a dimmed "next clear" base.
  chipsMult(x, y, w, h) {
    const gp = w < 170 ? 14 : 24;
    const g = this.g, bw = (w - gp) / 2, a = this.anim, r = this.run.round;
    const pulseC = a && a.phase === 'ev' ? 1 : 0;
    let ch = this.disp.chips, mu = this.disp.mult, label = '', dim = false;
    if (!a && !this.disp.slam) {
      if (this.pv) { ch = this.pv.chips; mu = this.pv.mult; label = 'THIS DROP'; }
      else if (!r.won && !r.lost) {
        ch = 80; mu = 1 + 1 + (r.boss === 'chill' ? 0 : r.streak) + (deckById[this.run.deckId].baseMult || 0);
        label = 'NEXT CLEAR'; dim = true;
      }
    }
    for (const [k, val, col] of [[0, ch, CHIP_BLUE], [1, mu, MULT_RED]]) {
      const bx = x + k * (bw + gp);
      rrect(g, bx, y, bw, h, 10);
      const gr = g.createLinearGradient(0, y, 0, y + h);
      gr.addColorStop(0, mix(col, dim ? -0.4 : -0.1)); gr.addColorStop(1, mix(col, dim ? -0.65 : -0.45));
      g.fillStyle = gr; g.fill();
      g.strokeStyle = dim ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.3)'; g.lineWidth = 1.5; g.stroke();
      const txt = val ? (k && val % 1 ? (+val.toFixed(1)).toString() : short(val)) : '0';
      otext(g, txt, bx + bw / 2, y + h / 2 + (label ? 3 : 1), Math.min(h * (label ? 0.5 : 0.55), bw / Math.max(2.4, txt.length * 0.62)) * (1 + pulseC * 0.04 * Math.sin(this.t * 40)), dim ? 'rgba(255,255,255,.72)' : '#fff', { lw: 4 });
    }
    otext(g, '×', x + w / 2, y + h / 2, 22, '#fff', { lw: 4 });
    if (label) { // a small tag on the top edge of the pair
      g.font = `800 9px ${UIFONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      const tw = g.measureText(label).width + 14;
      rrect(g, x + w / 2 - tw / 2, y - 7, tw, 14, 7); g.fillStyle = dim ? '#1d1338' : '#3a2a10'; g.fill(); g.strokeStyle = dim ? 'rgba(255,255,255,.18)' : '#ffe066'; g.lineWidth = 1; g.stroke();
      g.fillStyle = dim ? 'rgba(255,255,255,.5)' : '#ffe066'; g.fillText(label, x + w / 2, y + 0.5);
    }
    return y + h;
  }
  statBox(x, y, w, h, label, val, col, sub) {
    const g = this.g;
    rrect(g, x, y, w, h, 10); g.fillStyle = 'rgba(0,0,0,.28)'; g.fill();
    g.font = `800 ${h < 44 ? 9 : 10}px ${UIFONT}`; g.fillStyle = 'rgba(255,255,255,.5)'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(label, x + w / 2, y + Math.min(11, h * 0.24));
    otext(g, val, x + w / 2 - (sub ? 10 : 0), y + h * 0.62, Math.min(26, h * 0.48), col, { lw: 4, shadow: false });
    if (sub) { g.font = `800 11px ${UIFONT}`; g.fillStyle = 'rgba(255,255,255,.45)'; g.textAlign = 'left'; g.fillText(sub, x + w / 2 + g.measureText(val).width * 0.6, y + h * 0.66); }
  }
  streakMeter(x, y, w, s) {
    const g = this.g;
    g.font = `800 11px ${UIFONT}`; g.fillStyle = 'rgba(255,255,255,.5)'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText('STREAK', x, y + 8);
    const n = 8, pw = (w - 60) / n;
    for (let k = 0; k < n; k++) {
      const on = k < s;
      rrect(g, x + 60 + k * pw, y + 2, pw - 4, 12, 4);
      g.fillStyle = on ? STREAK_COLS[Math.min(6, k)] : 'rgba(255,255,255,.08)'; g.fill();
    }
    if (s > n) otext(g, `x${s}`, x + w, y + 8, 14, '#ffe066', { align: 'right', lw: 3 });
  }
  drawCharms(run) {
    const g = this.g, L = this.L, t = this.t;
    if (L.side && !L.side.short) {
      panel(g, L.side.x, L.side.y, L.side.w, L.side.h, 16);
      g.font = `800 11px ${UIFONT}`; g.fillStyle = 'rgba(255,255,255,.5)'; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText(`CHARMS ${run.charms.length}/${E.charmSlots(run)}` + (run.charms.length ? '' : ' · BUY IN THE SHOP'), L.side.x + 14, L.side.y + 16);
      const gy = L.glyphs[0].cy - L.glyphs[0].r - 14;
      g.fillText(`GLYPHS ${run.glyphs.length}/${run.glyphSlots}` + (run.glyphs.length ? '' : ' · ONE-SHOT TRICKS'), L.side.x + 14, gy);
      // deck count
      g.textAlign = 'right';
      g.fillText(deckById[run.deckId].name.toUpperCase(), L.side.x + L.side.w - 14, gy);
    } else if (!run.charms.length && run.mode !== 'zen' && !(this.tip && this.tip.step <= 1)) {
      // empty rows get a name until the first purchase, so the dashed boxes are not a mystery
      const c0 = L.charms[0], cl = L.charms[Math.min(L.charms.length, 5) - 1];
      g.font = `800 11px ${UIFONT}`; g.fillStyle = 'rgba(255,255,255,.4)'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('CHARMS · buy them in the shop after this round', (c0.x + cl.x + cl.w) / 2, c0.y + c0.h / 2);
      if (!run.glyphs.length && L.glyphs[0] && !L.hud.compact) { const G0 = L.glyphs[0], G1 = L.glyphs[1]; g.font = `800 9px ${UIFONT}`; g.fillText('GLYPHS', (G0.cx + G1.cx) / 2, (G0.cy + G1.cy) / 2); }
    }
    L.charms.forEach((c, k) => {
      const s = run.charms[k];
      if (!s) { emptySlot(g, c.x, c.y, c.w, c.h, c.w * 0.12, ''); return; }
      const def = byId[s.id];
      const wg = this.wiggle[k] || 0;
      const hover = this.hover && this.hitCharm(this.hover) === k;
      g.save();
      g.translate(c.x + c.w / 2, c.y + c.h / 2);
      g.rotate(Math.sin(wg * 22) * wg * 0.18);
      const sc = 1 + wg * 0.18 + (hover ? 0.05 : 0);
      g.scale(sc, sc);
      g.translate(0, Math.sin(t * 1.6 + k) * 1.5);
      const silenced = run.round.boss === 'hush' && k === 0;
      charmCard(g, -c.w / 2, -c.h / 2, c.w, c.h, def, { t, glow: wg, dim: silenced ? 0.6 : 0, name: c.w > 74 });
      g.restore();
      if (silenced) otext(g, 'HUSHED', c.x + c.w / 2, c.y + c.h / 2, Math.max(10, c.w * 0.16), '#a66bff', { lw: 3 });
      if (def.show) { const txt = def.show(s); otext(g, txt, c.x + c.w / 2, c.y + c.h - 2, Math.max(10, c.w * 0.15), txt.includes('Chips') ? CHIP_BLUE : MULT_RED, { lw: 3, shadow: false }); }
      // order number
      g.font = `800 ${Math.max(9, c.w * 0.13)}px ${UIFONT}`; g.fillStyle = 'rgba(255,255,255,.35)'; g.textAlign = 'center';
      if (!L.land || L.side) g.fillText(String(k + 1), c.x + c.w / 2, c.y + c.h + (L.land ? 9 : 8));
    });
  }
  drawGlyphs(run) {
    const g = this.g;
    this.L.glyphs.forEach((G, k) => {
      const id = run.glyphs[k];
      if (!id) { g.beginPath(); g.arc(G.cx, G.cy, G.r, 0, Math.PI * 2); g.setLineDash([4, 4]); g.strokeStyle = 'rgba(255,255,255,.15)'; g.lineWidth = 1.5; g.stroke(); g.setLineDash([]); return; }
      const active = this.glyphMode?.gi === k;
      const stuckGlow = run.round.stuck && E.RESCUE.includes(id);
      glyphStone(g, G.cx, G.cy, G.r * (active ? 1.12 : 1), glyphById[id], { glow: active || stuckGlow ? 0.8 + 0.4 * Math.sin(this.t * 8) : 0 });
      g.font = `800 10px ${UIFONT}`; g.fillStyle = 'rgba(255,255,255,.4)'; g.textAlign = 'center'; g.textBaseline = 'middle';
      if (this.L.land) g.fillText(`${k + 4}`, G.cx + G.r * 0.85, G.cy - G.r * 0.85);
    });
    if (this.glyphMode) {
      const def = glyphById[run.glyphs[this.glyphMode.gi]];
      if (def) { const b = this.L.board; otext(this.g, def.t === 'board' ? 'Tap a spot on the board to blast' : `Tap a piece to ${def.name.toLowerCase()} it`, b.x + b.s / 2, b.y - b.cell * 0.55, 16, def.col, { lw: 4 }); }
    }
  }
  drawTray(run) {
    const g = this.g, r = run.round, b = this.L.board, t = this.t;
    this.L.tray.forEach((s, k) => {
      const p = r.tray[k];
      const hot = this.sel?.ti === k || (this.glyphMode && glyphById[run.glyphs[this.glyphMode.gi]]?.t === 'piece' && p);
      rrect(g, s.x + 3, s.y + 3, s.w - 6, s.h - 6, 16); g.fillStyle = 'rgba(255,255,255,.025)'; g.fill();
      if (hot) { rrect(g, s.x, s.y, s.w, s.h, 14); g.fillStyle = 'rgba(255,255,255,.06)'; g.fill(); g.strokeStyle = this.glyphMode ? '#ffcc33' : 'rgba(255,255,255,.4)'; g.lineWidth = 2; g.stroke(); }
      if (!p || (this.drag && this.drag.ti === k)) return;
      const ret = this.ret && this.ret.ti === k ? this.ret : null;
      if (ret) { this.drawReturn(ret); return; }
      const pc = this.trayCell(s, p);
      const fitsNow = E.pieceFits(r.board, p);
      let cy = s.y + s.h / 2;
      if (this.dealT && t - this.dealT < 0.35) { const k2 = clamp((t - this.dealT - k * 0.06) / 0.28, 0, 1); cy += (1 - ease(k2)) * 60; g.globalAlpha = k2; }
      pieceShape(g, p.cells, s.x + s.w / 2, cy, pc, p.c, p.mat, t, this.dpr, p.gem, fitsNow ? (g.globalAlpha) : 0.32);
      g.globalAlpha = 1;
      if (p.rot) { g.save(); g.translate(s.x + s.w - 14, s.y + 14); g.rotate(t * 1.5); g.strokeStyle = '#4cc3ff'; g.lineWidth = 2.5; g.beginPath(); g.arc(0, 0, 7, 0.3, Math.PI * 1.7); g.stroke(); g.restore(); }
      if (this.L.land && !this.L.side?.short) { g.font = `800 10px ${UIFONT}`; g.fillStyle = 'rgba(255,255,255,.28)'; g.textAlign = 'center'; g.fillText(r.boss === 'drip' ? '1' : String(k + 1), s.x + 10, s.y + 10); }
    });
    // stuck banner
    if (r.stuck && !r.lost) otext(g, 'NO ROOM — USE A GLYPH', b.x + b.s / 2, b.y + b.s + b.cell * 0.3, 16, '#ff4d6d', { lw: 4 });
  }
  // an invalid drop eases the piece back to its slot (Block Blast's ~150 ms return + squash)
  drawReturn(ret) {
    const g = this.g, p = ret.piece, dm = E.dims(p.cells);
    const k = ease(clamp(ret.t / ret.dur, 0, 1));
    const cx = ret.fx + (ret.tx - ret.fx) * k, cy = ret.fy + (ret.ty - ret.fy) * k, cell = ret.fc + (ret.tc - ret.fc) * k;
    const sq = ret.t > ret.dur ? Math.sin(Math.PI * clamp((ret.t - ret.dur) / 0.14, 0, 1)) * 0.12 : 0;
    g.save(); g.translate(cx, cy); g.scale(1 + sq, 1 - sq);
    if (k < 1) { g.shadowColor = 'rgba(0,0,0,.4)'; g.shadowBlur = 14 * (1 - k); g.shadowOffsetY = 8 * (1 - k); }
    p.cells.forEach(([x, y], kk) => block(g, (x - dm.w / 2) * cell, (y - dm.h / 2) * cell, cell, p.c, kk === p.gem ? 'gem' : (p.mat || 'n'), this.t, this.dpr));
    g.restore();
  }
  drawDrag(run) {
    if (!this.drag) return;
    const g = this.g, b = this.L.board, tg = this.dragTarget();
    if (!tg) return;
    const k = ease(this.drag.scale), cell = b.cell * (0.62 + 0.38 * k);
    const p = tg.piece;
    const left = tg.left + (tg.dm.w * (b.cell - cell)) / 2, top = tg.top + (tg.dm.h * (b.cell - cell)) / 2;
    // over the board with nowhere to land: the piece goes translucent so it reads as "floating, not placed"
    const overBoard = !tg.best && this.cellAt({ x: tg.left + tg.dm.w * b.cell / 2, y: tg.top + tg.dm.h * b.cell / 2 });
    g.save(); g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 20; g.shadowOffsetY = 10;
    if (overBoard) g.globalAlpha = 0.72;
    p.cells.forEach(([x, y], kk) => block(g, left + x * cell, top + y * cell, cell, p.c, kk === p.gem ? 'gem' : (p.mat || 'n'), this.t, this.dpr));
    g.restore();
    if (overBoard) { // outline the board cells the piece collides with, on top of the piece
      const B = run.round.board.cells, rx = Math.round((tg.left - b.x) / b.cell), ry = Math.round((tg.top - b.y) / b.cell);
      g.strokeStyle = `rgba(255,77,77,${0.75 + 0.25 * Math.sin(this.t * 14)})`; g.lineWidth = 3;
      for (const [cx, cy] of p.cells) {
        const X = rx + cx, Y = ry + cy;
        if (X < 0 || Y < 0 || X >= N || Y >= N || !B[E.idx(X, Y)]) continue;
        rrect(g, b.x + X * b.cell + 3, b.y + Y * b.cell + 3, b.cell - 6, b.cell - 6, b.cell * 0.2); g.stroke();
      }
    }
  }
  drawSlam() {
    const s = this.disp.slam; if (!s) return;
    const g = this.g, k = s.t;
    const intro = clamp(k / 0.14, 0, 1), out = clamp((k - 0.65) / 0.35, 0, 1);
    const scale = (2.2 - 1.2 * ease(intro)) * (1 + out * 0.2);
    g.save(); g.globalAlpha = 1 - out;
    g.translate(s.x, s.y - out * 40); g.scale(scale, scale);
    const size = 34 + s.mag * 9;
    const col = s.mag > 3 ? `hsl(${(this.t * 300) % 360},100%,70%)` : s.mag > 2 ? '#ffe066' : '#fff';
    otext(g, '+' + fmt(s.total), 0, 0, size, col, { lw: size * 0.16 });
    g.restore();
  }
  drawPops() {
    const g = this.g;
    for (const p of this.pops) {
      const k = 1 - p.life / p.max;
      const sc = k < 0.15 ? 0.6 + k / 0.15 * 0.6 : 1.2 - Math.min(0.2, (k - 0.15) * 1.5);
      g.save(); g.globalAlpha = clamp(p.life / (p.max * 0.35), 0, 1);
      g.translate(p.x, p.y - (p.toast ? k * 16 : k * 34)); g.scale(sc, sc);
      otext(g, p.text, 0, 0, p.size, p.col, { lw: Math.max(3, p.size * 0.18) });
      g.restore();
    }
  }
  drawBanner() {
    const bn = this.banner; if (!bn) return;
    const g = this.g, b = this.L.board;
    const inK = ease(clamp(bn.t / 0.3, 0, 1)), outK = clamp((bn.t - bn.dur + 0.35) / 0.35, 0, 1);
    const y = b.y + b.s / 2, hh = Math.min(130, b.s * 0.4);
    g.save();
    g.globalAlpha = 1 - outK;
    const wB = b.s + b.cell * 1.2;
    g.translate(b.x + b.s / 2 + (1 - inK) * -60 + outK * 60, y);
    rrect(g, -wB / 2, -hh / 2, wB, hh, 18);
    g.fillStyle = 'rgba(12,6,28,.88)'; g.fill();
    g.strokeStyle = rgba(bn.col, 0.8); g.lineWidth = 2; g.stroke();
    g.font = `800 12px ${UIFONT}`; g.fillStyle = 'rgba(255,255,255,.6)'; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (bn.kicker) g.fillText(bn.kicker, 0, -hh * 0.3);
    otext(g, bn.title, 0, -hh * 0.02, Math.min(40, b.s * 0.1), bn.col, { lw: 6 });
    g.font = `700 ${Math.min(16, b.s * 0.04)}px ${UIFONT}`; g.fillStyle = '#fff';
    g.fillText(bn.sub + (bn.target ? ` · Score ${fmt(bn.target)}` : ''), 0, hh * 0.3);
    g.restore();
  }
  drawTip() {
    const tp = this.tip; if (!tp || this.banner) return;
    const g = this.g, b = this.L.board, s = this.L.tray[1];
    const a = clamp(tp.t / 0.4, 0, 1);
    g.save(); g.globalAlpha = a;
    const maxW = Math.min(this.w - 32, 460, this.L.side?.short ? b.s + b.cell * 0.4 : 1e9);
    g.font = `800 14px ${UIFONT}`;
    const words = tp.text.split(' '), lines = []; let cur = '';
    for (const wd of words) { const tt = cur ? cur + ' ' + wd : wd; if (g.measureText(tt).width > maxW - 28 && cur) { lines.push(cur); cur = wd; } else cur = tt; }
    lines.push(cur);
    const hh = 14 + lines.length * 18, y = this.L.side?.short ? b.y + b.s - hh - 6 : this.L.land ? b.y - hh - b.cell * 0.4 : b.y - hh - 6;
    const ty = Math.max(4, y);
    rrect(g, this.w / 2 - maxW / 2, ty, maxW, hh, 12); g.fillStyle = 'rgba(255,204,51,.95)'; g.fill();
    g.fillStyle = '#1a0f2e'; g.textAlign = 'center'; g.textBaseline = 'middle';
    lines.forEach((l, k) => g.fillText(l, this.w / 2, ty + 16 + k * 18));
    // pointing hand animation for the first step
    if (tp.step === 0 && !this.drag) {
      const ph = (this.t % 2.2) / 2.2, k = ease(clamp(ph / 0.7, 0, 1));
      const fx = s.x + s.w / 2, fy = s.y + s.h / 2, tx = b.x + b.s / 2, tyy = b.y + b.s * 0.75;
      const hx = fx + (tx - fx) * k, hy = fy + (tyy - fy) * k;
      g.globalAlpha = a * (ph < 0.85 ? 1 : 1 - (ph - 0.85) / 0.15);
      g.beginPath(); g.arc(hx, hy, 14, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,.85)'; g.fill();
      g.lineWidth = 3; g.strokeStyle = '#1a0f2e'; g.stroke();
    }
    g.restore();
  }
  drawCharmTip(run) {
    let i = -1;
    if (this.tipCharm) i = this.tipCharm.i;
    else if (this.hover && !this.drag) i = this.hitCharm(this.hover);
    const s = run.charms[i]; if (!s) return;
    const def = byId[s.id], c = this.L.charms[i], g = this.g;
    const W = 230;
    g.font = `700 13px ${UIFONT}`;
    const words = def.d.split(' '), lines = []; let cur = '';
    for (const wd of words) { const tt = cur ? cur + ' ' + wd : wd; if (g.measureText(tt).width > W - 24 && cur) { lines.push(cur); cur = wd; } else cur = tt; }
    lines.push(cur);
    const H = 52 + lines.length * 17 + (def.show ? 18 : 0);
    let x = c.x + c.w / 2 - W / 2, y = c.y + c.h + 10;
    // desktop: a fixed lane in the gap left of the side panel, aligned to the card, never over another card
    if (this.L.side && !this.L.side.short) { const S = this.L.side; x = S.x - W - 10; y = Math.min(c.y, S.y + S.h - H - 8); }
    x = clamp(x, 8, this.w - W - 8); y = clamp(y, 8, this.h - H - 8);
    rrect(g, x, y, W, H, 12); g.fillStyle = 'rgba(14,8,30,.96)'; g.fill(); g.strokeStyle = RARITY[def.r].h; g.lineWidth = 2; g.stroke();
    otext(g, def.name, x + 12, y + 18, 18, '#fff', { align: 'left', lw: 4, shadow: false });
    g.font = `800 10px ${UIFONT}`; g.fillStyle = RARITY[def.r].h; g.textAlign = 'right'; g.textBaseline = 'middle'; g.fillText(RARITY[def.r].n.toUpperCase(), x + W - 12, y + 18);
    g.font = `700 13px ${UIFONT}`; g.fillStyle = '#e8e0ff'; g.textAlign = 'left';
    lines.forEach((l, k) => g.fillText(l, x + 12, y + 42 + k * 17));
    if (def.show) { g.font = `800 12px ${UIFONT}`; g.fillStyle = def.show(s).includes('Chips') ? CHIP_BLUE : MULT_RED; g.fillText('Now: ' + def.show(s), x + 12, y + 42 + lines.length * 17 + 2); }
  }
  drawPause() {
    const g = this.g, P = this.L.pause, Hb = this.L.help;
    g.beginPath(); g.arc(P.cx, P.cy, P.r, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,.08)'; g.fill(); g.strokeStyle = 'rgba(255,255,255,.2)'; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = 'rgba(255,255,255,.8)'; g.fillRect(P.cx - P.r * 0.3, P.cy - P.r * 0.35, P.r * 0.2, P.r * 0.7); g.fillRect(P.cx + P.r * 0.1, P.cy - P.r * 0.35, P.r * 0.2, P.r * 0.7);
    if (Hb) { // "?" is always one tap away (Dragonsweeper's manual button)
      g.beginPath(); g.arc(Hb.cx, Hb.cy, Hb.r, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,.08)'; g.fill(); g.strokeStyle = 'rgba(255,255,255,.2)'; g.lineWidth = 1.5; g.stroke();
      g.font = `${Hb.r * 1.25}px ${FONT}`; g.fillStyle = 'rgba(255,255,255,.85)'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', Hb.cx, Hb.cy + 1);
    }
  }

  // ------------------------------------------------------------ test hooks
  botStep() {
    if (this.scene === 'shop' || this.scene === 'over' || !this.run) return 'idle';
    const r = this.run.round;
    if (r.won || r.lost || this.pending) return 'wait';
    if (r.stuck) { const gi = this.run.glyphs.findIndex(g => E.RESCUE.includes(g) && g !== 'undo'); if (gi >= 0) { this.applyGlyph(gi, this.run.glyphs[gi] === 'bomb' ? 27 : r.tray.findIndex(Boolean)); return 'glyph'; } return 'stuck'; }
    const m = E.botMove(this.run); if (!m) return 'none';
    this.tryPlace(m.ti, m.x, m.y);
    return 'placed';
  }
}

window.addEventListener('load', () => {
  const f = document.fonts && document.fonts.load ? document.fonts.load("20px 'Lilita One'").catch(() => 0) : Promise.resolve();
  Promise.race([f, new Promise(r => setTimeout(r, 1500))]).then(() => new Game());
});
