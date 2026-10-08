// One frame of the fight: arena, ring, fighters and ref sorted by depth, the
// near ropes and the front row over them, effects, then the HUD. Also turns
// the fight's events into sparks, popups, screen shake and sound.

import { text } from './font.js';
import { P, mix, shade, light } from './palette.js';
import { getArena, proj, drawRingBack, drawRingFront, drawCrowd, drawFrontRow, drawBackdropFx, drawLighting, W, H } from './arena.js';
import { drawBoxer, drawRef, framed } from './boxer.js';
import { modeOf } from './modes.js';
import { lockMeter } from './wrestle.js';
import { play, setCrowd } from './sfx.js';

const COL = { hot: P.hot, good: P.good, bad: P.bad, cool: P.ui3 };

export function createRenderer() {
  const R = {
    parts: [], pops: [], banner: null, shake: 0, zoom: null, ghost: [0, 0], lastHp: [0, 0],
    comboShow: [null, null], countShow: null, now: 0, flashT: 0, tip: '',
  };

  // ------------------------------------------------------------- events
  R.consume = function (fight, events, viewer = 0) {
    for (const e of events) {
      const f = e.side != null ? fight.f[e.side] : null;
      switch (e.type) {
        case 'hit': {
          const [sx, sy] = proj(e.x, e.z); const y = sy - e.y;
          const n = 6 + Math.round(e.dmg);
          for (let i = 0; i < n; i++) {
            const a = (Math.random() - 0.5) * Math.PI * 1.3 + (e.face > 0 ? 0 : Math.PI);
            const sp = 60 + Math.random() * 140 * (e.big ? 1.5 : 1);
            R.parts.push({ k: 'spark', x: sx, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20, life: 0.18 + Math.random() * 0.15, max: 0.33, col: [P.spark1, P.spark2, P.spark3][i % 3] });
          }
          // sweat flies off the far side of the head
          for (let i = 0; i < (e.big ? 10 : 4); i++) {
            R.parts.push({ k: 'drop', x: sx + e.face * 4, y: y - 2, vx: e.face * (40 + Math.random() * 90), vy: -60 - Math.random() * 80, life: 0.6, max: 0.6, col: '#d8f0ff' });
          }
          R.parts.push({ k: 'ring', x: sx, y, r: 2, vr: e.big ? 160 : 90, life: 0.16, max: 0.16, col: e.counter ? P.hot : '#ffffff' });
          if (e.big) {
            R.shake = Math.max(R.shake, e.counter ? 5 : 4);
            R.parts.push({ k: 'burst', x: sx, y, life: 0.2, max: 0.2, col: e.counter ? P.hot : '#fff8ea' });
          } else R.shake = Math.max(R.shake, 1.5);
          if (e.big && e.target === 'head' && Math.random() < 0.5) R.parts.push({ k: 'guard', x: sx, y: y + 2, vx: e.face * 70, vy: -110, life: 1.2, max: 1.2, col: (fight.f[e.side].look.gloves || ['#f2f2f2'])[0] });
          play('hit', { dmg: e.dmg, big: e.big, body: e.target === 'body' });
          if (e.big) play('roar', { k: 0.5 });
          break;
        }
        case 'block': {
          const [sx, sy] = proj(e.x, e.z); const y = sy - e.y;
          for (let i = 0; i < 6; i++) {
            const a = Math.random() * Math.PI * 2;
            R.parts.push({ k: 'puff', x: sx, y, vx: Math.cos(a) * 30, vy: Math.sin(a) * 30 - 10, life: 0.25, max: 0.25, col: '#d8d0e0' });
          }
          R.pops.push(pop('BLOCK', sx, y - 10, '#b8c8e0', 0.5, 1));
          play('block');
          break;
        }
        case 'dodge': {
          const [sx, sy] = proj(e.x, e.z); const y = sy - e.y;
          R.pops.push(pop(e.kind === 'duck' ? 'DUCK!' : 'SLIP!', sx, y - 12, P.ui3, 0.6, 1));
          for (let i = 0; i < 4; i++) R.parts.push({ k: 'line', x: sx - 6, y: y - 6 + i * 4, vx: -fight.f[e.by].face * -70, vy: 0, life: 0.18, max: 0.18, col: '#ffffff' });
          play('dodge');
          break;
        }
        case 'whiff': play('whiff'); break;
        case 'swing': if (Math.random() < 0.6) play('swing'); break;
        case 'combo': {
          R.comboShow[e.side] = { name: e.name, t: 0, n: e.n };
          play('combo', { n: e.n });
          break;
        }
        case 'text': {
          const g = fight.f[e.side];
          const [sx, sy] = proj(g.x, g.z);
          R.pops.push(pop(e.text, sx, sy - 66, COL[e.col] || P.hot, 1.1, 1));
          break;
        }
        case 'special': {
          const g = fight.f[e.side];
          const [sx, sy] = proj(g.x, g.z);
          R.pops.push(pop(e.name, sx, sy - 70, P.bad, 1.3, 1));
          play('tell');
          break;
        }
        case 'banner': R.banner = { text: e.text, t: 0, big: e.big, col: COL[e.col] || P.ui1 }; break;
        case 'bell': play('bell', { n: e.end ? 3 : 1 }); break;
        case 'kd': {
          R.shake = 7; play('kd');
          const [sx, sy] = proj(e.x, e.z);
          R.zoom = { x: sx, y: sy - 24, t: 0, dur: 1.4, z: 1.5 };
          for (let i = 0; i < 16; i++) R.parts.push({ k: 'drop', x: sx, y: sy - 40, vx: (Math.random() - 0.5) * 200, vy: -80 - Math.random() * 120, life: 0.8, max: 0.8, col: '#d8f0ff' });
          break;
        }
        case 'count': R.countShow = { n: e.n, t: 0 }; play('count'); break;
        case 'getup': play('roar', { k: 0.8 }); break;
        case 'over': {
          const w = e.result.winner;
          if (e.result.method === 'KO' || e.result.method === 'TKO') play('roar', { k: 1.2 });
          if (w === viewer) play('win'); else if (w >= 0) play('lose');
          break;
        }
        case 'guardBreak': R.shake = 3; play('block'); break;
        case 'taunt': {
          const g = fight.f[e.side]; const [sx, sy] = proj(g.x, g.z);
          R.pops.push(pop(['COME ON!', 'TOO SLOW!', 'IS THAT IT?'][Math.floor(Math.random() * 3)], sx, sy - 66, '#ffffff', 1.1, 1));
          break;
        }
        case 'rest': break;
        case 'rebound': { play('block'); R.shake = Math.max(R.shake, 1.5); break; }
        case 'slam': {
          const [sx2, sy2] = proj(e.x, e.z);
          R.shake = e.big ? 6 : 4; play('kd');
          for (let i = 0; i < 14; i++) { const a2 = Math.PI + Math.random() * Math.PI; R.parts.push({ k: 'puff', x: sx2 + (Math.random() - 0.5) * 30, y: sy2, vx: Math.cos(a2) * 60, vy: Math.sin(a2) * 30, life: 0.5, max: 0.5, col: '#d8d0c0' }); }
          break;
        }
        case 'lock': play('block'); break;
        case 'holdWon': play('combo', { n: 2 }); break;
        case 'whip': play('swing'); break;
        case 'pin': play('roar', { k: 0.6 }); R.countShow = null; break;
        case 'clash': {
          R.shake = 6; play('kd');
          const [sx2, sy2] = proj(e.x, e.z);
          for (let i = 0; i < 18; i++) { const a2 = Math.random() * Math.PI * 2; R.parts.push({ k: 'puff', x: sx2, y: sy2 - 4, vx: Math.cos(a2) * 80, vy: Math.sin(a2) * 30 - 10, life: 0.6, max: 0.6, col: '#e8d0a0' }); }
          break;
        }
      }
    }
  };

  function pop(str, x, y, col, life, scale) {
    // stack instead of overprinting when two land on the same spot
    for (let k = 0; k < 4; k++) if (R.pops.some((p) => Math.abs(p.x - x) < 40 && Math.abs(p.y - y) < 9)) y -= 9;
    return { str, x, y, col, life, max: life, scale, vy: -24 };
  }

  // ---------------------------------------------------------------- draw
  R.draw = function (v, hv, fight, now, dt, ui = {}) {
    R.now = now;
    const A = getArena(fight.arena);
    R.shake = Math.max(0, R.shake - dt * 18);
    const sx = R.shake > 0.3 ? Math.round((Math.random() - 0.5) * R.shake * 2) : 0;
    const sy = R.shake > 0.3 ? Math.round((Math.random() - 0.5) * R.shake * 2) : 0;
    setCrowd(fight.crowd || 0);

    const g = v.g;
    g.setTransform(1, 0, 0, 1, sx, sy);
    g.drawImage(A.bg, 0, 0);
    drawBackdropFx(v, A, fight, now);
    drawCrowd(v, A, fight, now);
    drawRingBack(v, A, fight, now);

    // shadows first, all of them, so no one stands on someone else's
    const ents = [];
    for (const f of fight.f) ents.push({ z: f.z, f });
    ents.push({ z: fight.ref.z, ref: true });
    for (const e of ents) {
      const x = e.ref ? fight.ref.x : e.f.x;
      const [px, py] = proj(x, e.z);
      const lying = e.f && (e.f.state === 'down' || e.f.state === 'ko');
      const w = lying ? 22 : 11;
      g.globalAlpha = 0.35;
      for (let r = 0; r < 3; r++) v.rect(px - w + r * 2 - (lying ? e.f.face * 4 : 0), py - 1 + r - 1, (w - r * 2) * 2, 1, '#000');
      g.globalAlpha = 1;
    }
    // the man on top of a pin, or doing the throwing, draws over the other one
    const lay = (e) => (e.f && (e.f.state === 'pinning' || e.f.state === 'move' || e.f.state === 'lifting') ? -0.5 : 0);
    ents.sort((a, b) => (b.z + lay(b)) - (a.z + lay(a)));
    const marks = [];
    for (const e of ents) {
      if (e.ref) {
        const [px, py] = proj(fight.ref.x, fight.ref.z);
        if (fight.phase !== 'rest') {
          const rr = drawRef(v, fight.ref, px, py, now, fight, A.th.light);
          if (fight.kind === 'sumo' && rr.hand) {
            // the gyoji's war fan
            const [hx, hy] = rr.hand;
            v.disc(hx + fight.ref.face * 3, hy - 3, 4, P.ink); v.disc(hx + fight.ref.face * 3, hy - 3, 3, '#e8c040'); v.rect(hx + fight.ref.face * 2, hy - 4, 2, 1, '#c8282c');
          }
        }
      } else {
        const f = e.f;
        const [px, py] = proj(f.x, f.z);
        const M = modeOf(fight);
        const pose = M.pose ? M.pose(framed(f), fight, Math.floor(now * 10) / 10) : undefined;
        const m = drawBoxer(v, f, px, py, now, { phase: fight.phase, rim: A.th.light, pose });
        marks.push({ f, m, px, py });
      }
    }
    drawRingFront(v, A, fight, now);

    // over-the-fighter marks: telegraphs, dizzy stars, openings
    for (const { f, m, px, py } of marks) {
      if (f.state === 'punch' && f.act && f.act.tell && f.act.t < f.act.start) {
        const on = Math.sin(now * 40) > 0;
        const G = f.act.hand === 'lead' ? m.gF : m.gB;
        if (on) { v.ring(G[0], G[1], 7, P.hot); v.ring(G[0], G[1], 8, P.ui2); }
        text(v, '!', m.head[0], m.head[1] - 18, on ? P.bad : P.hot, { scale: 2, align: 'center', outline: P.ink });
      }
      if (f.state === 'stagger' || f.state === 'ko' || (f.state === 'down')) {
        for (let i = 0; i < 3; i++) {
          const a = now * 5 + i * 2.09;
          const x = m.head[0] + Math.cos(a) * 8, y = m.head[1] - 8 + Math.sin(a) * 2.5;
          star(v, x, y, i === 0 ? P.hot : '#ffffff');
        }
      }
      if (f.open > 0 && fight.phase === 'fight' && Math.sin(now * 14) > -0.3) {
        text(v, 'OPEN', m.head[0], m.head[1] - 18, P.good, { align: 'center', outline: P.ink });
      }
    }

    drawFrontRow(v, A, fight, now);
    drawLighting(v, A, now);

    // particles
    for (let i = R.parts.length - 1; i >= 0; i--) {
      const p = R.parts[i];
      p.life -= dt;
      if (p.life <= 0) { R.parts.splice(i, 1); continue; }
      const k = p.life / p.max;
      if (p.k === 'spark') {
        const x0 = p.x, y0 = p.y;
        p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.9; p.vy *= 0.9;
        v.line(x0, y0, p.x, p.y, p.col, k > 0.5 ? 2 : 1);
      } else if (p.k === 'drop' || p.k === 'guard') {
        p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 420 * dt;
        if (p.k === 'guard') { v.rect(p.x - 2, p.y - 1, 5, 3, P.ink); v.rect(p.x - 1, p.y, 3, 1, p.col); }
        else v.rect(p.x, p.y, 1, 2, p.col);
      } else if (p.k === 'ring') {
        p.r += p.vr * dt;
        v.ring(p.x, p.y, p.r, p.col);
      } else if (p.k === 'burst') {
        const r = (1 - k) * 18 + 4;
        for (let a = 0; a < 8; a++) {
          const t = a / 8 * Math.PI * 2 + 0.2;
          v.line(p.x + Math.cos(t) * r * 0.4, p.y + Math.sin(t) * r * 0.4, p.x + Math.cos(t) * r, p.y + Math.sin(t) * r, p.col, 2);
        }
      } else if (p.k === 'puff') {
        p.x += p.vx * dt; p.y += p.vy * dt;
        v.disc(p.x, p.y, 1 + (1 - k) * 2, p.col);
      } else if (p.k === 'line') {
        p.x += p.vx * dt;
        v.rect(p.x, p.y, 6, 1, p.col);
      }
    }
    // popups (none behind the menus)
    if (ui.noHud) R.pops.length = 0;
    for (let i = R.pops.length - 1; i >= 0; i--) {
      const p = R.pops[i];
      p.life -= dt;
      if (p.life <= 0) { R.pops.splice(i, 1); continue; }
      p.y += p.vy * dt; p.vy *= 0.92;
      if (p.life < 0.15 && Math.sin(now * 60) > 0) continue;
      text(v, p.str, p.x, p.y, p.col, { align: 'center', outline: P.ink, scale: p.scale });
    }

    g.setTransform(1, 0, 0, 1, 0, 0);
    hv.g.setTransform(1, 0, 0, 1, 0, 0);
    hv.g.clearRect(0, 0, W, H);
    if (!ui.noHud) drawHUD(hv, fight, now, dt, ui);
  };

  function star(v, x, y, c) {
    x = Math.round(x); y = Math.round(y);
    v.rect(x - 1, y, 3, 1, c); v.rect(x, y - 1, 1, 3, c);
  }

  // ----------------------------------------------------------------- HUD
  function drawHUD(v, fight, now, dt, ui) {
    const [a, b] = fight.f;
    for (let i = 0; i < 2; i++) {
      const f = fight.f[i];
      // the white "damage just taken" bar slides down after the real one
      if (R.ghost[i] < f.hp || R.lastHp[i] === 0) R.ghost[i] = f.hp;
      else R.ghost[i] = Math.max(f.hp, R.ghost[i] - dt * 30 * (f.hp < R.lastHp[i] ? 0 : 1));
      R.lastHp[i] = f.hp;
    }
    R.kind = fight.kind || 'box';
    bars(v, a, 0, now);
    bars(v, b, 1, now);
    if (fight.kind === 'sumo') boutPips(v, fight);

    // the round and the clock
    v.rect(170, 2, 44, 25, P.ink); v.rect(171, 3, 42, 23, '#2a2131');
    v.rect(171, 3, 42, 1, '#4a3a53');
    if (fight.kind === 'sumo') {
      text(v, 'BOUT ' + fight.round, 192, 5, P.ui3, { align: 'center' });
      text(v, fight.wins[0] + ' - ' + fight.wins[1], 192, 14, P.cream, { align: 'center' });
    }
    text(v, fight.kind === 'wrestle' ? 'ONE FALL' : fight.kind === 'sumo' ? '' : 'ROUND ' + fight.round, 192, 5, P.ui3, { align: 'center' });
    const c = Math.max(0, Math.ceil(fight.clock));
    const cs = Math.floor(c / 60) + ':' + String(c % 60).padStart(2, '0');
    if (fight.kind !== 'sumo') text(v, cs, 192, 14, c <= 10 && fight.phase === 'fight' && Math.sin(now * 10) > 0 ? P.bad : P.cream, { align: 'center', scale: 1 });

    // combo names, each on its own fighter's side
    for (let i = 0; i < 2; i++) {
      const s = R.comboShow[i];
      if (!s) continue;
      s.t += dt;
      if (s.t > 1.4) { R.comboShow[i] = null; continue; }
      const x = i === 0 ? 8 : W - 8, al = i === 0 ? 'left' : 'right';
      const pop = Math.min(1, s.t * 10);
      const y = 44 + (1 - pop) * -6;
      text(v, s.n + ' HIT', x, y, P.cream, { align: al, outline: P.ink });
      text(v, s.name, x, y + 9, P.hot, { align: al, outline: P.ink, scale: 1 });
    }

    // ---- WRESTLING: the lock-up meter, the move menu, the pin count
    const me = ui.human != null ? fight.f[ui.human] : null;
    if (fight.kind === 'wrestle' && me) {
      if (fight.lock && me.state === 'lock') {
        const k = lockMeter(fight.lock.t);
        v.rect(152, 150, 80, 12, P.ink); v.rect(153, 151, 78, 10, '#2a2131');
        v.rect(153 + 62, 151, 16, 10, '#3a6a2a');
        v.rect(153 + Math.round(k * 74), 149, 3, 14, me.lockQ >= 0 ? P.cream : P.hot);
        text(v, me.lockQ >= 0 ? 'LOCKED IN' : 'PRESS AN ARROW IN THE GREEN!', 192, 138, P.hot, { align: 'center', outline: P.ink });
      }
      if (me.state === 'hold') {
        const opts = [['left', 'SUPLEX'], ['up', 'SLAM'], ['right', 'WHIP'], ['down', 'DDT']];
        v.rect(92, 140, 200, 26, P.ink); v.rect(93, 141, 198, 24, '#2a2131');
        opts.forEach(([d, n], i) => { arrow(v, 104 + i * 49, 149, d, P.hot); text(v, n, 110 + i * 49, 146, P.cream); });
        if (me.stars >= 1) text(v, 'F  POWERBOMB!', 192, 156, Math.sin(now * 12) > 0 ? P.bad : P.hot, { align: 'center' });
        else text(v, 'PICK A MOVE', 192, 156, '#b9a48c', { align: 'center' });
      }
      const opp = fight.f[1 - ui.human];
      if (fight.phase === 'fight' && opp.state === 'down' && me.state === 'idle' && Math.sin(now * 8) > -0.2) {
        const [ox, oy] = proj(opp.x, opp.z);
        text(v, 'SPACE: PIN', ox, oy - 26, P.good, { align: 'center', outline: P.ink });
      }
    }
    if (fight.phase === 'pin' && fight.pin) {
      const n = fight.pin.count;
      if (n > 0) text(v, n >= 3 ? '3!' : String(n), 192, 60, n >= 2 ? P.bad : '#ffffff', { align: 'center', scale: 4, outline: P.ink });
      if (me && fight.pin.on === ui.human) {
        const k2 = Math.min(1, me.mash / Math.max(1, me.mashNeed));
        text(v, 'MASH THE ARROWS TO KICK OUT!', 192, 150, Math.sin(now * 16) > 0 ? P.hot : '#ffffff', { align: 'center', outline: P.ink });
        v.rect(132, 160, 120, 8, P.ink); v.rect(133, 161, 118, 6, '#2a2131'); v.rect(133, 161, Math.round(118 * k2), 6, P.good);
      }
    }
    // ---- SUMO: the charge
    if (fight.kind === 'sumo' && me && fight.phase === 'intro' && fight.pt > 0.5) {
      if (!fight.called) text(v, 'WAIT FOR IT...', 192, 150, P.cream, { align: 'center', outline: P.ink });
      else if (me.state === 'shikiri') text(v, 'CHARGE! ANY ARROW', 192, 150, Math.sin(now * 20) > 0 ? P.hot : '#ffffff', { align: 'center', outline: P.ink, scale: 2 });
    }

    // the ref's count, big, over the downed man
    if (fight.phase === 'kd' && R.countShow && R.countShow.n > 0) {
      R.countShow.t += dt;
      const d = fight.f[fight.downIdx];
      const [px, py] = proj(d.x, d.z);
      const sc = R.countShow.t < 0.1 ? 4 : 3;
      text(v, String(R.countShow.n), Math.max(30, Math.min(W - 30, px)), py - 80, R.countShow.n >= 8 ? P.bad : '#ffffff', { align: 'center', scale: sc, outline: P.ink });
    }
    // mash to get up
    if (fight.phase === 'kd' && ui.human != null && fight.f[ui.human].state === 'down' && fight.downIdx === ui.human) {
      const d = fight.f[ui.human];
      const k = Math.min(1, d.mash / Math.max(1, d.mashNeed));
      const on = Math.sin(now * 16) > 0;
      text(v, 'MASH THE ARROW KEYS!', 192, 150, on ? P.hot : '#ffffff', { align: 'center', outline: P.ink, scale: 1 });
      v.rect(132, 160, 120, 8, P.ink); v.rect(133, 161, 118, 6, '#2a2131'); v.rect(133, 161, Math.round(118 * k), 6, P.good);
    }

    // banner text in the middle of the screen
    if (R.banner) {
      R.banner.t += dt;
      const t = R.banner.t;
      if (t > 1.5) R.banner = null;
      else {
        const sc = R.banner.big ? (t < 0.08 ? 5 : 4) : 2;
        const y = 76 - (t < 0.08 ? 4 : 0);
        if (!(t > 1.3 && Math.sin(now * 50) > 0)) text(v, R.banner.text, 192, y, R.banner.col, { align: 'center', scale: sc, outline: P.ink });
      }
    }

    // your controls feedback: aim mode and the gesture you are drawing
    if (ui.aim) {
      v.rect(166, 196, 52, 16, P.ink); v.rect(167, 197, 50, 14, '#2a2131');
      text(v, 'LOW', 192, 200, P.hot, { align: 'center' });
      if (ui.lastGesture && ui.gestureT < 0.8) text(v, ui.lastGesture, 192, 186, P.hot, { align: 'center', outline: P.ink });
    }

    // between rounds: the corner
    if (fight.phase === 'rest') {
      v.g.globalAlpha = 0.75; v.rect(0, 0, W, H, '#120e16'); v.g.globalAlpha = 1;
      text(v, 'END OF ROUND ' + fight.round, 192, 40, P.ui1, { align: 'center', scale: 2, outline: P.ink });
      const tot = (f) => Math.round(f.stats.landed) + ' / ' + f.stats.thrown;
      const rows = [['PUNCHES LANDED', tot(a), tot(b)], ['POWER SHOTS', a.stats.power, b.stats.power], ['BLOCKED', a.stats.blocked, b.stats.blocked], ['DODGED', a.stats.dodged, b.stats.dodged], ['KNOCKDOWNS', b.kds, a.kds]];
      text(v, a.name, 110, 66, '#ff8a7a', { align: 'center' }); text(v, b.name, 274, 66, '#7ab0ff', { align: 'center' });
      rows.forEach((r, i) => {
        text(v, r[0], 192, 80 + i * 11, P.ink3 === r ? P.cream : '#b9a48c', { align: 'center' });
        text(v, String(r[1]), 110, 80 + i * 11, P.cream, { align: 'center' }); text(v, String(r[2]), 274, 80 + i * 11, P.cream, { align: 'center' });
      });
      if (R.tip) {
        v.rect(40, 146, 304, 30, P.ink); v.rect(41, 147, 302, 28, '#2a2131');
        text(v, 'YOUR CORNER:', 50, 151, P.ui3);
        text(v, R.tip, 50, 162, P.cream);
      }
      text(v, 'ROUND ' + (fight.round + 1) + ' IN ' + Math.max(0, Math.ceil(4.2 - fight.pt)), 192, 190, P.ui1, { align: 'center' });
    }
    if (fight.phase === 'decision' || (fight.phase === 'over' && fight.cards)) {
      if (fight.cards) {
        v.rect(120, 96, 144, 44, P.ink); v.rect(121, 97, 142, 42, '#2a2131');
        text(v, 'SCORECARDS', 192, 100, P.ui3, { align: 'center' });
        fight.cards.forEach((c, j) => text(v, 'JUDGE ' + (j + 1) + '   ' + c[0] + ' - ' + c[1], 192, 111 + j * 9, P.cream, { align: 'center' }));
      }
    }
    if (ui.netNote) text(v, ui.netNote, 192, 206, P.ui3, { align: 'center', outline: P.ink });
  }

  function bars(v, f, side, now) {
    const w = 140, x = side === 0 ? 6 : W - 6 - w;
    const nameCol = side === 0 ? '#ff8a7a' : '#7ab0ff';
    text(v, f.name, side === 0 ? x : x + w, 3, nameCol, { align: side === 0 ? 'left' : 'right', outline: P.ink });
    const y = 12;
    v.rect(x - 1, y - 1, w + 2, 8, P.ink);
    v.rect(x, y, w, 6, '#4a1c22');
    const sumo = R.kind === 'sumo';
    const max = sumo ? 100 : f.st.hpMax;
    if (sumo) { f = Object.assign({}, f, { hp: Math.max(0, f.bal), rec: 0 }); R.ghost[side] = Math.max(f.hp, Math.min(R.ghost[side], 100)); }
    const hpW = Math.round(w * Math.max(0, f.hp) / max);
    const ghW = Math.round(w * Math.max(0, R.ghost[side]) / max);
    const recW = Math.round(w * Math.min(max, Math.max(0, f.hp) + f.rec) / max);
    // bars drain toward the middle of the screen
    const at = (ww) => (side === 0 ? x : x + w - ww);
    v.rect(at(recW), y, recW, 6, '#c8c0a0');
    v.rect(at(ghW), y, ghW, 6, '#ffffff');
    const k = f.hp / max;
    const c1 = k > 0.5 ? P.hp1 : k > 0.25 ? '#ffd23d' : (Math.sin(now * 12) > 0 ? P.bad : '#c83a3a');
    v.rect(at(hpW), y, hpW, 6, c1);
    v.rect(at(hpW), y, hpW, 2, light(c1, 0.35));
    v.rect(at(hpW), y + 5, hpW, 1, shade(c1, 0.3));
    // stamina
    const sw = Math.round(w * 0.7 * Math.max(0, f.stam) / f.st.stamMax), sx = side === 0 ? x : x + w - Math.round(w * 0.7);
    v.rect(sx - 1, y + 7, Math.round(w * 0.7) + 2, 4, P.ink);
    v.rect(sx, y + 8, Math.round(w * 0.7), 2, '#3a2a1a');
    v.rect(side === 0 ? sx : sx + Math.round(w * 0.7) - sw, y + 8, sw, 2, f.stam < 20 && Math.sin(now * 10) > 0 ? P.bad : P.st1);
    if (sumo) { text(v, 'BALANCE', side === 0 ? x : x + w, y + 13, P.cream, { align: side === 0 ? 'left' : 'right', outline: P.ink }); return; }
    // stars: the third one glows
    for (let i = 0; i < 3; i++) {
      const full = f.stars >= i + 1, part = f.stars - i;
      const cx = side === 0 ? x + w * 0.7 + 10 + i * 9 : x + w - w * 0.7 - 10 - i * 9;
      bigStar(v, cx, y + 9, full ? (Math.sin(now * 8 + i) > 0 ? P.hot : P.ui1) : part > 0 ? mix('#4a3a53', P.ui1, part) : '#4a3a53');
    }
    // knockdown pips
    for (let i = 0; i < f.kds; i++) v.rect(side === 0 ? x + i * 5 : x + w - 4 - i * 5, y + 13, 3, 3, P.bad);
  }
  function boutPips(v, fight) {
    for (let s2 = 0; s2 < 2; s2++) for (let i = 0; i < 2; i++) {
      const x = s2 === 0 ? 6 + i * 8 : W - 12 - i * 8;
      v.rect(x, 31, 6, 6, P.ink); v.rect(x + 1, 32, 4, 4, fight.wins[s2] > i ? P.hot : '#3a2c44');
    }
  }
  function bigStar(v, x, y, c) {
    x = Math.round(x); y = Math.round(y);
    v.rect(x - 1, y - 3, 3, 7, P.ink); v.rect(x - 3, y - 1, 7, 3, P.ink);
    v.rect(x, y - 2, 1, 5, c); v.rect(x - 2, y, 5, 1, c); v.rect(x - 1, y - 1, 3, 3, c);
  }
  function arrow(v, x, y, d, c) {
    const m = { up: [[0, -3], [-2, -1], [2, -1], [0, 3]], down: [[0, 3], [-2, 1], [2, 1], [0, -3]], left: [[-3, 0], [-1, -2], [-1, 2], [3, 0]], right: [[3, 0], [1, -2], [1, 2], [-3, 0]] }[d];
    if (!m) return;
    v.line(x + m[3][0], y + m[3][1], x + m[0][0], y + m[0][1], c, 1);
    v.line(x + m[0][0], y + m[0][1], x + m[1][0], y + m[1][1], c, 1);
    v.line(x + m[0][0], y + m[0][1], x + m[2][0], y + m[2][1], c, 1);
  }

  // ------------------------------------------------------- presentation
  // A slow zoom onto the canvas when someone goes down.
  R.present = function (v, hv, canvas, dt) {
    const out = canvas.getContext('2d');
    out.imageSmoothingEnabled = false;
    let z = 1, cx = W / 2, cy = H / 2;
    if (R.zoom) {
      R.zoom.t += dt;
      const t = R.zoom.t / R.zoom.dur;
      if (t >= 1) R.zoom = null;
      else {
        const k = t < 0.2 ? t / 0.2 : t > 0.75 ? (1 - t) / 0.25 : 1;
        z = 1 + (R.zoom.z - 1) * k * (2 - k) * (k < 1 ? 1 : 1);
        cx = W / 2 + (R.zoom.x - W / 2) * k; cy = H / 2 + (R.zoom.y - H / 2) * k;
      }
    }
    const sw = W / z, sh = H / z;
    const sx = Math.max(0, Math.min(W - sw, cx - sw / 2)), sy = Math.max(0, Math.min(H - sh, cy - sh / 2));
    out.drawImage(v.g.canvas, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    out.drawImage(hv.g.canvas, 0, 0, W, H, 0, 0, canvas.width, canvas.height);
  };

  R.reset = function () { R.parts.length = 0; R.pops.length = 0; R.banner = null; R.zoom = null; R.ghost = [0, 0]; R.lastHp = [0, 0]; R.comboShow = [null, null]; R.shake = 0; };
  return R;
}
