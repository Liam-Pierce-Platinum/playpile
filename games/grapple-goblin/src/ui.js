// HTML menus: title, cave select, pause, results, deep-dive results, how to play.
import { LEVELS, THEMES } from './levels.js';

const N = LEVELS.length;
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const fmt = (t) => { const m = Math.floor(t / 60), s = t - m * 60; return (m ? m + ':' + (s < 10 ? '0' : '') : '') + s.toFixed(1) + (m ? '' : 's'); };
export { fmt };
const ICON = { 0: '🍄', 1: '💎', 2: '🔥', 3: '❄️' };

export class UI {
  constructor(g) {
    this.g = g;
    this.root = document.getElementById('ui');
    this.el = null; this.panel = null;
    this.pauseBtn = h('button', 'pausebtn', '<span></span><span></span>');
    this.pauseBtn.setAttribute('aria-label', 'Pause');
    this.pauseBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); if (this.g.mode === 'play' && !this.open) { this.g.audio.play('click'); this.show('pause'); } });
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
      if (!b || b.disabled) return;
      this.g.audio.unlock(); this.g.audio.play('click');
      this.act(b.dataset.act, b.dataset.arg);
    });
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    // tap the empty background to take the main action (play / next / dive again)
    if (kind === 'result' || kind === 'deep' || kind === 'title') el.addEventListener('click', (e) => { if (e.target === el || e.target.classList.contains('title')) { this.g.audio.unlock(); this.primary(); } });
    this.root.appendChild(el);
    if (kind === 'result') this.animateStars(data);
  }
  back() {
    if (this.g.mode === 'title' || this.g.mode === 'attract') this.show('title');
    else if (this.panel === 'howto' || this.panel === 'levels') this.show(this.g.mode === 'play' ? 'pause' : 'title');
    else this.close();
  }
  primary() { const b = this.el && this.el.querySelector('[data-primary]'); if (b) b.click(); }
  act(a, arg) {
    const g = this.g;
    switch (a) {
      case 'play': g.startLevel(this.nextLevel()); break;
      case 'level': g.startLevel(+arg); break;
      case 'levels': this.show('levels'); break;
      case 'deep': g.startDeep(); break;
      case 'howto': this.show('howto'); break;
      case 'back': this.back(); break;
      case 'resume': this.close(); break;
      case 'restart': g.restart(); break;
      case 'next': g.startLevel(Math.min(N, g.levelN + 1)); break;
      case 'title': g.toTitle(); break;
      case 'music': g.audio.musicOn = !g.audio.musicOn; g.save.music = g.audio.musicOn; g.audio.apply(); g.persist(); this.show(this.panel); break;
      case 'sfx': g.audio.sfxOn = !g.audio.sfxOn; g.save.sfx = g.audio.sfxOn; g.audio.apply(); g.persist(); this.show(this.panel); break;
    }
  }
  nextLevel() {
    const s = this.g.save;
    for (let n = 1; n <= Math.min(N, s.unlocked); n++) if (!s.stars[n]) return n;
    return Math.min(N, s.unlocked);
  }
  totalStars() { return Object.values(this.g.save.stars).reduce((a, st) => a + st.filter(Boolean).length, 0); }
  toggles() {
    const a = this.g.audio;
    return `<div class="row2"><button class="btn small ${a.musicOn ? '' : 'off'}" data-act="music">♪ Music ${a.musicOn ? 'on' : 'off'}</button><button class="btn small ${a.sfxOn ? '' : 'off'}" data-act="sfx">🔊 Sound ${a.sfxOn ? 'on' : 'off'}</button></div>`;
  }

  p_title() {
    const n = this.nextLevel(), any = Object.keys(this.g.save.stars).length > 0;
    return `<div class="title"><div class="logo"><h1><span class="l1">GRAPPLE</span><span class="l2">GOBLIN</span></h1><p>Hold to hook · Let go to fling</p></div>
      <div class="menu"><button class="btn gold big" data-act="play" data-primary>${any ? `▶ Play · Cave ${n}` : '▶ Play'}</button>
      <div class="row2"><button class="btn small" data-act="levels">Caves <small>${this.totalStars()}/${N * 3}★</small></button>
      <button class="btn small" data-act="deep">Deep Dive <small>${this.g.save.deep}m</small></button></div>
      <button class="btn small" data-act="howto">How to play</button></div>
      <div class="credit">a PLAYPILE game</div></div>`;
  }
  p_levels() {
    const s = this.g.save;
    let html = '';
    for (let w = 0; w < 4; w++) {
      html += `<h3 class="w${w}"><span class="wk">${ICON[w]}</span>${THEMES[w].name}</h3><div class="grid">`;
      for (let n = w * 5 + 1; n <= w * 5 + 5; n++) {
        const st = s.stars[n] || [false, false, false], locked = n > s.unlocked;
        html += `<button class="lvl w${w} ${locked ? 'locked' : ''} ${s.stars[n] ? 'done' : ''}" data-act="level" data-arg="${n}" ${locked ? 'disabled' : ''}><b>${locked ? '🔒' : n}</b><span>${locked ? '&nbsp;' : st.map((x) => (x ? '★' : '☆')).join('')}</span><small class="nm">${locked ? 'locked' : LEVELS[n - 1].name}</small><small class="tm">${s.best[n] ? fmt(s.best[n]) : '&nbsp;'}</small></button>`;
      }
      html += '</div>';
    }
    return `<div class="card wide"><header><h2>Caves</h2><span class="stars">${this.totalStars()} / ${N * 3} ★</span><button class="btn x" data-act="back">✕</button></header><div class="body">${html}
      <p class="note">★ Reach the chest · ★ Grab 70% of the gold · ★ Find the hidden big gem</p></div></div>`;
  }
  p_result(d) {
    const labels = ['Finished', `${d.need}+ gold`, 'Big gem'];
    const last = d.n >= N;
    return `<div class="card result"><div class="head"><div class="chesticon">💰</div><div><h2>${d.name}</h2><p>${fmt(d.time)} ${d.newBest ? '<b class="nb">NEW BEST</b>' : `· best ${fmt(d.best)}`}</p><p class="sub">🪙 ${d.coins}/${d.total} · 💎 ${d.gems}/${d.gemTotal} · ${d.deaths} ${d.deaths === 1 ? 'fall' : 'falls'}</p></div></div>
      <div class="starrow">${d.stars.map((on, i) => `<div class="st" data-i="${i}"><span class="bigstar">★</span><small>${labels[i]}</small></div>`).join('')}</div>
      <div class="btns stack">${last ? '<button class="btn gold wide" data-act="title" data-primary>Finish ▶</button>' : '<button class="btn gold wide" data-act="next" data-primary>Next cave ▶</button>'}<div class="row2"><button class="btn" data-act="restart">↺ Retry</button><button class="btn" data-act="levels">Caves</button></div></div>
      <p class="note">${d.stars[2] ? (d.stars[1] ? 'A perfect haul!' : 'Big gem found! Grab more gold for the last star.') : 'The big gem hides behind rocks in the foreground. Look for a twinkle.'}  ·  Space / tap for next</p></div>`;
  }
  animateStars(d) {
    d.stars.forEach((on, i) => {
      if (!on) return;
      setTimeout(() => {
        const st = this.el && this.el.querySelector(`.st[data-i="${i}"] .bigstar`);
        if (!st) return;
        st.classList.add('on');
        this.g.audio.play('star', 1 + i * 0.12);
      }, 300 + i * 260);
    });
  }
  p_deep(d) {
    return `<div class="card result"><div class="head"><div class="chesticon">⛏️</div><div><h2>${d.dist} m deep</h2><p>${d.best ? '<b class="nb">NEW BEST</b>' : `best ${d.top} m`}</p><p class="sub">🪙 ${d.coins} · 💎 ${d.gems}</p></div></div>
      <div class="btns stack"><button class="btn gold wide" data-act="deep" data-primary>↺ Dive again</button><div class="row2"><button class="btn" data-act="title">Title</button></div></div>
      <p class="note">Every 7 sections the cave changes. Space / tap to go again.</p></div>`;
  }
  p_pause() {
    return `<div class="card small"><header><h2>Paused</h2></header><div class="body menu">
      <button class="btn gold" data-act="resume" data-primary>▶ Resume</button><button class="btn" data-act="restart">↺ Restart</button>
      ${this.g.deep ? '' : '<button class="btn" data-act="levels">Caves</button>'}${this.toggles()}<button class="btn" data-act="title">Quit to title</button></div></div>`;
  }
  p_howto() {
    const r = (k, t) => `<div class="how"><span class="hk">${k}</span><span>${t}</span></div>`;
    return `<div class="card small"><header><h2>How to play</h2><button class="btn x" data-act="back">✕</button></header><div class="body">
      ${r('👆', '<b>Hold</b> (mouse, Space or touch) to fire your hook at the anchor ahead. The dotted circle shows which one.')}
      ${r('🪢', '<b>Let go</b> to fling. Release on the upswing to fly far and high. The faint dots show where you will go.')}
      ${r('🪙', 'Gold sits along the best swing lines. Gems hide in risky spots, and one <b>big gem</b> per cave hides behind rocks in front.')}
      ${r('💀', 'Spikes, lava, pits and bats pop you back to the last flag instantly. Cracked anchors break after one swing.')}
      ${r('🍄', 'Mushrooms bounce you, carts launch you, updrafts lift you, and icy gusts push you back.')}
      ${r('⌨', '<b>R</b> restarts, <b>Esc</b> pauses.')}
      <button class="btn gold" data-act="back">Got it</button></div></div>`;
  }
}
