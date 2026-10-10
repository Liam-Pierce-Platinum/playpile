// Menus in HTML: title, shifts, buns, how to play, pause, results.
import { SHIFTS, SKINS, FOOD } from './levels.js';
import { drawFood } from './draw.js';

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const stars = (n, of = 3) => Array.from({ length: of }, (_, i) => `<i class="${i < n ? 'on' : ''}">★</i>`).join('');

export class UI {
  constructor(g) {
    this.g = g;
    this.root = document.getElementById('ui');
    this.el = null; this.panel = null;
    this.pauseBtn = h('button', 'pausebtn', '<span></span><span></span>');
    this.pauseBtn.setAttribute('aria-label', 'Pause');
    this.pauseBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (this.g.mode === 'play' && !this.open) { this.g.audio.play('click'); this.show('pause'); } });
    this.root.appendChild(this.pauseBtn);
    this.hud(false);
  }
  get open() { return !!this.el; }
  hud(on) { this.pauseBtn.style.display = on ? '' : 'none'; }
  close() { if (this.el) { this.el.remove(); this.el = null; this.panel = null; } }
  show(kind, data = {}) {
    this.close();
    this.panel = kind; this.data = data;
    const el = this.el = h('div', 'scrim ' + kind);
    el.innerHTML = this['p_' + kind](data);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b || b.disabled) { if (kind === 'title' && !e.target.closest('.card, .btn')) { this.g.audio.unlock(); this.act('play'); } return; }
      this.g.audio.unlock(); this.g.audio.play('click');
      this.act(b.dataset.act, b.dataset.arg);
    });
    el.addEventListener('input', (e) => { const k = e.target.dataset.set; if (k) { this.g.audio[k] = +e.target.value / 100; this.g.save[k] = this.g.audio[k]; this.g.audio.apply(); this.g.persist(); } });
    this.root.appendChild(el);
    if (kind === 'result') this.animateStars(data);
    if (kind === 'buns' || kind === 'title') this.paintBuns();
  }
  back() {
    if (this.g.mode === 'title') this.show('title');
    else if (this.g.mode === 'over' && this.lastResult) this.show(this.lastResult.kind, this.lastResult.data);
    else if (this.g.mode === 'play') this.show('pause');
    else this.close();
  }
  primary() { const b = this.el && this.el.querySelector('[data-primary]'); if (b) b.click(); }
  act(a, arg) {
    const g = this.g;
    switch (a) {
      case 'play': g.startShift(g.nextShift()); break;
      case 'shift': g.startShift(+arg); break;
      case 'shifts': this.show('shifts'); break;
      case 'rush': g.startRush(); break;
      case 'buns': this.show('buns'); break;
      case 'skin': if (!this.skinLocked(arg)) { g.save.skin = arg; g.persist(); this.show('buns'); } break;
      case 'howto': this.show('howto'); break;
      case 'back': this.back(); break;
      case 'resume': this.close(); break;
      case 'restart': g.restart(); break;
      case 'next': g.startShift(Math.min(SHIFTS.length, g.shiftN + 1)); break;
      case 'title': this.close(); g.toTitle(); break;
      case 'toggle': {
        const k = arg; g.audio[k] = !g.audio[k]; g.save[k] = g.audio[k]; g.audio.apply(); g.persist(); this.show(this.panel, this.data); break;
      }
    }
  }
  skinLocked(id) { const s = SKINS.find((k) => k.id === id); return !s || this.g.totalStars() < s.need; }

  p_title() {
    const g = this.g, s = g.save, n = g.nextShift();
    const rushLocked = !s.rushUnlocked;
    return `<div class="logo"><h1><span class="l1">STACK</span><span class="l2">ATTACK!</span></h1><p>Catch the order. Mind the wobble.</p></div>
      <div class="titlebar">
        <button class="btn big red" data-act="play" data-primary>▶ ${n === 1 && !s.stars[1] ? 'Start your first shift' : 'Shift ' + n + ': ' + SHIFTS[n - 1].name}</button>
        <div class="row">
          <button class="btn" data-act="shifts">Shifts <small>${g.totalStars()}/30 ★</small></button>
          <button class="btn ${rushLocked ? 'locked' : ''}" data-act="rush" ${rushLocked ? 'disabled' : ''}>${rushLocked ? '🔒 ' : ''}Rush Hour ${s.rush ? `<small>best $${s.rush.toFixed(2)}</small>` : rushLocked ? '<small>clear shift 2</small>' : ''}</button>
          <button class="btn" data-act="buns"><canvas class="bunprev mini" data-skin="${g.skin.id}" width="88" height="56"></canvas>Buns</button>
          <button class="btn" data-act="howto">How to play</button>
        </div>
        <p class="hint">Mouse, A/D or arrows, or drag with a finger · Esc pauses</p>
      </div>`;
  }
  p_shifts() {
    const s = this.g.save;
    let html = '<div class="grid">';
    SHIFTS.forEach((sh, i) => {
      const n = i + 1, locked = n > s.unlocked, st = s.stars[n] || 0;
      html += `<button class="shift ${locked ? 'locked' : ''} ${st ? 'done' : ''}" data-act="shift" data-arg="${n}" ${locked ? 'disabled' : ''}>
        <b>${locked ? '🔒' : n}</b><em>${sh.name}</em><span class="st">${stars(st)}</span><small>${s.best[n] ? 'best $' + s.best[n].toFixed(2) : locked ? 'earn ★ on shift ' + (n - 1) : sh.time + 's shift'}</small></button>`;
    });
    html += '</div>';
    return `<div class="card wide"><header><h2>Shifts</h2><span class="tot">${this.g.totalStars()} / 30 ★</span><button class="btn x" data-act="back">✕</button></header><div class="body">${html}
      <p class="note">Earn cash to earn stars. Stars unlock new shifts and new buns.</p></div></div>`;
  }
  p_buns() {
    const g = this.g, total = g.totalStars();
    const cells = SKINS.map((k) => {
      const locked = total < k.need, on = g.save.skin === k.id;
      return `<button class="bun ${locked ? 'locked' : ''} ${on ? 'on' : ''}" data-act="skin" data-arg="${k.id}" ${locked ? 'disabled' : ''}>
        <canvas class="bunprev" data-skin="${k.id}" width="176" height="128"></canvas><b>${k.name}</b><small>${locked ? '🔒 ' + k.need + ' ★' : on ? 'Equipped' : 'Tap to use'}</small></button>`;
    }).join('');
    return `<div class="card wide"><header><h2>Buns</h2><span class="tot">${total} ★</span><button class="btn x" data-act="back">✕</button></header><div class="body"><div class="grid buns">${cells}</div>
      <p class="note">Unlock buns with stars from your shifts.</p></div></div>`;
  }
  paintBuns() {
    if (!this.el) return;
    for (const c of this.el.querySelectorAll('canvas.bunprev')) {
      const skin = SKINS.find((k) => k.id === c.dataset.skin);
      const x = c.getContext('2d'), W = c.width, H = c.height, sc = W / 220;
      x.clearRect(0, 0, W, H);
      x.save(); x.translate(W / 2, H - 6 * sc); x.scale(sc, sc);
      drawFood(x, 'bun', FOOD.bun.w, FOOD.bun.h, { skin });
      x.translate(0, -FOOD.bun.h); drawFood(x, 'patty', FOOD.patty.w, FOOD.patty.h, { seed: 2 });
      x.translate(0, -FOOD.patty.h); drawFood(x, 'cheese', FOOD.cheese.w, FOOD.cheese.h, {});
      x.translate(0, -FOOD.cheese.h); drawFood(x, 'lettuce', FOOD.lettuce.w, FOOD.lettuce.h, { seed: 4 });
      x.translate(0, -FOOD.lettuce.h); drawFood(x, 'top', FOOD.top.w, FOOD.top.h, { skin });
      x.restore();
    }
  }
  p_howto() {
    const r = (k, t) => `<div class="how"><span class="hk">${k}</span><span>${t}</span></div>`;
    return `<div class="card small"><header><h2>How to play</h2><button class="btn x" data-act="back">✕</button></header><div class="body">
      ${r('🍔', 'Slide your bun with the <b>mouse</b>, <b>A/D</b> or <b>arrows</b>, or <b>drag</b> a finger anywhere.')}
      ${r('🧾', 'The <b>ticket</b> shows the order, bottom first. Catch the glowing piece next, then the <b>top bun</b> to serve.')}
      ${r('🤸', 'Every piece sits where it lands. Off-centre catches make the tower <b>lean</b>; catch the next one on the other side to balance it. Jerky moves make it sway. Lean too far and it topples.')}
      ${r('🥾', '<b>Junk</b> (boots, fish, socks) ruins the burger. Wrong ingredients cost you accuracy and tip.')}
      ${r('💨', 'Later shifts add <b>wind</b>, a thieving <b>seagull</b> (slide away when you see the red !) and <b>sauce</b> that makes the stack slippery.')}
      ${r('⭐', 'Serve fast for a bigger <b>tip</b>. Earn cash for stars, stars unlock shifts, Rush Hour and buns.')}
      <button class="btn red" data-act="back" data-primary>Got it</button></div></div>`;
  }
  p_pause() {
    const a = this.g.audio;
    return `<div class="card small"><header><h2>Paused</h2></header><div class="body menu">
      <button class="btn red" data-act="resume" data-primary>Resume</button>
      <button class="btn" data-act="restart">Restart shift (R)</button>
      <div class="toggles">
        <button class="btn tog ${a.mutedMusic ? 'off' : ''}" data-act="toggle" data-arg="mutedMusic">♪ Music ${a.mutedMusic ? 'off' : 'on'}</button>
        <button class="btn tog ${a.mutedSfx ? 'off' : ''}" data-act="toggle" data-arg="mutedSfx">🔊 Sound ${a.mutedSfx ? 'off' : 'on'}</button>
      </div>
      <label class="set">Music <input type="range" min="0" max="100" value="${Math.round(a.music * 100)}" data-set="music"></label>
      <label class="set">Sound <input type="range" min="0" max="100" value="${Math.round(a.sfx * 100)}" data-set="sfx"></label>
      <button class="btn" data-act="howto">How to play</button>
      <button class="btn" data-act="title">Quit to title</button></div></div>`;
  }
  p_result(d) {
    this.lastResult = { kind: 'result', data: d };
    const labels = d.th.map((t) => '$' + t);
    const msg = d.stars === 3 ? 'Diner legend! ★★★' : d.stars === 0 ? `Earn $${d.th[0]} for a star to unlock the next shift.` : `$${d.th[d.stars]} for the next star.`;
    const extra = [];
    if (d.newSkins.length) extra.push(`<div class="unlock">New bun unlocked: <b>${d.newSkins.map((k) => k.name).join(', ')}</b></div>`);
    if (d.newRush) extra.push('<div class="unlock">Rush Hour unlocked! <b>Endless mode</b></div>');
    const next = d.last ? '<button class="btn red" data-act="title" data-primary>Finish</button>' : d.unlockedNext ? '<button class="btn red" data-act="next" data-primary>Next shift ▶</button>' : '';
    return `<div class="card result"><div class="head"><div class="badge">${d.n}</div><div><h2>${SHIFTS[d.n - 1].name}</h2><p>Shift over</p></div></div>
      <div class="cash">$${d.cash.toFixed(2)} ${d.newBest ? '<b class="nb">NEW BEST</b>' : d.best > d.cash ? `<small>best $${d.best.toFixed(2)}</small>` : ''}</div>
      <div class="starrow">${[0, 1, 2].map((i) => `<div class="st" data-i="${i}"><i>★</i><small>${labels[i]}</small></div>`).join('')}</div>
      <div class="stats"><span><b>${d.served}</b> served</span><span><b>${d.perfects}</b> perfect</span><span><b>${d.streak}</b> best streak</span></div>
      ${extra.join('')}
      <div class="btns"><button class="btn" data-act="restart" ${next ? '' : 'data-primary'}>↺ Retry</button><button class="btn" data-act="shifts">Shifts</button>${next}</div>
      <p class="note">${msg}</p></div>`;
  }
  animateStars(d) {
    for (let i = 0; i < d.stars; i++) {
      setTimeout(() => {
        const st = this.el && this.el.querySelector(`.st[data-i="${i}"]`);
        if (!st) return;
        st.classList.add('on');
        this.g.audio.play('star', 1 + i * 0.12);
      }, 400 + i * 320);
    }
  }
  p_rushover(d) {
    this.lastResult = { kind: 'rushover', data: d };
    return `<div class="card result"><div class="head"><div class="badge">⏱</div><div><h2>Rush Hour over</h2><p>Out of plates after ${Math.floor(d.time)}s</p></div></div>
      <div class="cash">$${d.cash.toFixed(2)} ${d.best ? '<b class="nb">NEW BEST</b>' : `<small>best $${d.top.toFixed(2)}</small>`}</div>
      <div class="stats"><span><b>${d.served}</b> served</span><span><b>${d.perfects}</b> perfect</span></div>
      <div class="btns"><button class="btn" data-act="title">Title</button><button class="btn red" data-act="rush" data-primary>↺ Again</button></div></div>`;
  }
}
