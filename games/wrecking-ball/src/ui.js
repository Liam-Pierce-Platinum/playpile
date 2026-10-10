// HTML menus: title, block select, garage (upgrades), results, pause, how to play.
import { LEVELS, DISTRICTS, UPG } from './levels.js';
import { money } from './fx.js';

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const starRow = (n, big) => [0, 1, 2].map((i) => `<i class="st ${i < n ? 'on' : ''} ${big ? 'big' : ''}">★</i>`).join('');

export class UI {
  constructor(g) {
    this.g = g;
    this.root = document.getElementById('ui');
    this.el = null; this.panel = null;
    this.pauseBtn = h('button', 'pausebtn', '<span></span><span></span>');
    this.pauseBtn.setAttribute('aria-label', 'Pause');
    this.pauseBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (this.g.mode === 'play' && !this.open) { this.g.audio.play('click'); this.show('pause'); } });
    this.root.appendChild(this.pauseBtn);
    // cable slider for touch screens (keyboard uses W/S, mouse wheel also works)
    this.cable = h('div', 'cable', '<b>CABLE</b><input type="range" min="0" max="1000" value="300" aria-label="Cable length"><span>▲ up<br>▼ down</span>');
    this.slider = this.cable.querySelector('input');
    this.slider.addEventListener('input', () => { this.g.cableInput(this.slider.value / 1000); });
    this.slider.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.g.audio.unlock(); });
    this.root.appendChild(this.cable);
    this.hud(false);
  }
  get open() { return !!this.el; }
  hud(on) { this.pauseBtn.style.display = on ? '' : 'none'; this.cable.style.display = on ? '' : 'none'; }
  setCable(k) { if (document.activeElement !== this.slider) this.slider.value = Math.round(k * 1000); }
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
    el.addEventListener('input', (e) => {
      const k = e.target.dataset.set; if (!k) return;
      this.g.audio[k] = +e.target.value / 100; this.g.save[k] = this.g.audio[k]; this.g.audio.apply(); this.g.persist();
    });
    this.root.appendChild(el);
    if (kind === 'result') this.animateResult(data);
  }
  back() {
    const p = this.panel;
    if (this.g.mode === 'title') this.show('title');
    else if (p === 'howto' || p === 'levels' || p === 'garage') this.show(this.g.mode === 'play' && this.g.phase !== 'done' ? 'pause' : this.prev || 'pause', this.prevData);
    else if (p === 'pause') this.close();
  }
  primary() { const b = this.el && this.el.querySelector('[data-primary]'); if (b) b.click(); }
  act(a, arg) {
    const g = this.g;
    switch (a) {
      case 'play': g.start(this.nextLevel()); break;
      case 'level': g.start(+arg); break;
      case 'levels': this.remember(); this.show('levels'); break;
      case 'garage': this.remember(); this.show('garage'); break;
      case 'howto': this.remember(); this.show('howto'); break;
      case 'back': this.back(); break;
      case 'resume': this.close(); break;
      case 'restart': g.start(g.levelN); break;
      case 'next': g.start(Math.min(LEVELS.length, g.levelN + 1)); break;
      case 'title': g.toTitle(); break;
      case 'buy': if (g.buy(arg)) { this.g.audio.play('cash'); this.show('garage'); } else this.g.audio.play('deny'); break;
      case 'use': g.save.use[arg] = !g.save.use[arg]; g.persist(); this.show('garage'); break;
      case 'mute': g.audio.muted = !g.audio.muted; g.save.muted = g.audio.muted; g.audio.apply(); g.persist(); this.show(this.panel); break;
    }
  }
  remember() { if (this.panel === 'result' || this.panel === 'title' || this.panel === 'pause') { this.prev = this.panel; this.prevData = this.data; } }
  nextLevel() { const s = this.g.save; for (let n = 1; n <= LEVELS.length; n++) if (!s.stars[n] && n <= s.unlocked) return n; return Math.min(s.unlocked, LEVELS.length); }
  totalStars() { return Object.values(this.g.save.stars).reduce((a, b) => a + b, 0); }

  p_title() {
    const s = this.g.save, n = this.nextLevel(), any = Object.keys(s.stars).length > 0;
    return `<div class="title">
      <div class="logo"><div class="hz"></div><h1>WRECKING<br><span>BALL</span></h1><p>30 seconds. One crane. Knock the whole block down.</p></div>
      <div class="menu">
        <button class="btn y big" data-act="play" data-primary>${any ? `Continue <small>Block ${n}</small>` : 'Play'}</button>
        <div class="row2"><button class="btn" data-act="levels">Blocks <small>${this.totalStars()}/${LEVELS.length * 3}★</small></button>
        <button class="btn" data-act="garage">Garage <small>${money(s.bank)}</small></button></div>
        <button class="btn ghost" data-act="howto">How to play</button>
      </div>
      <div class="credit">a PLAYPILE game · ${matchMedia('(pointer: coarse)').matches ? 'drag to swing · slider for the cable' : 'A/D move · W/S cable'}</div></div>`;
  }
  p_levels() {
    const s = this.g.save;
    let html = `<div class="card wide"><header><h2>City blocks</h2><span class="hdr-r">${this.totalStars()}/${LEVELS.length * 3}★</span><button class="btn x" data-act="back">✕</button></header><div class="body">`;
    DISTRICTS.forEach((D, di) => {
      html += `<h3><span class="tag d${di}">${di + 1}</span>${D.name} <small>${D.sub}</small></h3><div class="grid">`;
      for (const lv of LEVELS.filter((l) => l.d === di)) {
        const lock = lv.n > s.unlocked, st = s.stars[lv.n] || 0, best = s.best[lv.n];
        html += `<button class="lvl d${di} ${lock ? 'locked' : ''} ${st ? 'done' : ''}" data-act="level" data-arg="${lv.n}" ${lock ? 'disabled' : ''}>
          <b>${lv.n}</b><em>${lv.name}</em><span>${lock ? '🔒' : starRow(st)}</span><small>${best ? money(best) : lock ? 'locked' : 'not played'}</small></button>`;
      }
      html += `</div>`;
    });
    return html + `<p class="note">Hit a block's target to open the next one. Damage money goes to the bank for upgrades.</p></div></div>`;
  }
  p_garage() {
    const s = this.g.save;
    let html = `<div class="card wide"><header><h2>Garage</h2><span class="hdr-r bank">${money(s.bank)}</span><button class="btn x" data-act="back">✕</button></header><div class="body"><div class="upgs">`;
    for (const [k, U] of Object.entries(UPG)) {
      const lvl = s.upg[k] || 0, max = U.tiers.length - 1, nx = U.tiers[lvl + 1];
      const can = nx && s.bank >= nx.cost;
      const pips = U.tiers.slice(1).map((_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('');
      const toggle = U.toggle && lvl > 0 ? `<button class="btn small ${s.use[k] ? 'y' : ''}" data-act="use" data-arg="${k}">${s.use[k] ? 'Equipped' : 'Equip'}</button>` : '';
      html += `<div class="upg"><div class="ic ic-${k}"></div><div class="info"><b>${U.name}</b><p>${U.desc}</p><div class="pips">${pips}</div></div>
        <div class="buy">${nx ? `<button class="btn small ${can ? 'y' : 'no'}" data-act="buy" data-arg="${k}">${money(nx.cost)}</button>` : '<span class="maxed">MAX</span>'}${toggle}</div></div>`;
    }
    return html + `</div><p class="note">Every dollar of damage you do goes in the bank, hit or miss.</p></div></div>`;
  }
  p_howto() {
    const row = (k, t) => `<div class="how"><span class="hk">${k}</span><span>${t}</span></div>`;
    return `<div class="card"><header><h2>How to play</h2><button class="btn x" data-act="back">✕</button></header><div class="body">
      ${row('A D', 'Move the trolley along the jib. On a phone or with the mouse, drag anywhere.')}
      ${row('W S', 'Raise and lower the cable. Mouse wheel works too; phones get a slider.')}
      ${row('⟲', 'The ball is a real pendulum. Rock the trolley back and forth in time with it to build a big swing, then smash.')}
      ${row('$', 'Every block has a price. Knock things over, crack them, drop floors on floors. Chains of hits build the multiplier.')}
      ${row('💥', 'Gas tanks explode. Water towers burst. Cars crumple. Level a whole building for a bonus.')}
      ${row('R', 'Instant retry. Esc pauses.')}
      <button class="btn y" data-act="back" data-primary>Got it</button></div></div>`;
  }
  p_pause() {
    const a = this.g.audio;
    return `<div class="card small"><header><h2>Paused</h2><button class="btn x" data-act="resume">✕</button></header><div class="body menu">
      <button class="btn y" data-act="resume" data-primary>Resume</button>
      <div class="row2"><button class="btn small" data-act="restart">Restart</button><button class="btn small" data-act="levels">Blocks</button></div>
      <div class="set"><span>Music</span><input type="range" min="0" max="100" value="${Math.round(a.music * 100)}" data-set="music"></div>
      <div class="set"><span>Effects</span><input type="range" min="0" max="100" value="${Math.round(a.sfx * 100)}" data-set="sfx"></div>
      <div class="row2"><button class="btn small" data-act="mute">${a.muted ? 'Sound: OFF' : 'Sound: ON'}</button><button class="btn small" data-act="howto">How to play</button></div>
      <button class="btn small ghost" data-act="title">Quit to title</button></div></div>`;
  }
  p_result(r) {
    const pass = r.stars > 0, last = r.n >= LEVELS.length;
    return `<div class="card result"><header class="${pass ? 'pass' : 'fail'}"><h2>${pass ? (r.stars === 3 ? 'TOTAL WRECK!' : 'BLOCK CLEARED!') : 'NOT ENOUGH DAMAGE'}</h2></header><div class="body">
      <div class="dmg"><small>Damage</small><b class="count" data-to="${r.damage}">$0</b>${r.newBest ? '<span class="nb">NEW BEST</span>' : ''}</div>
      <div class="bar"><i style="width:${Math.min(100, (r.damage / r.thr[2]) * 100)}%"></i>${r.thr.map((t, i) => `<em style="left:${(t / r.thr[2]) * 100}%"><u class="${r.stars > i ? 'on' : ''}">★</u><span>${money(t)}</span></em>`).join('')}</div>
      <div class="stats"><div><b>${r.chain}</b><small>best chain</small></div><div><b>${r.levelled}/${r.blds}</b><small>buildings levelled</small></div><div><b>${money(r.damage)}</b><small>to the bank</small></div></div>
      <div class="btns">
        <button class="btn" data-act="garage">Garage</button>
        <button class="btn" data-act="levels">Blocks</button>
        <button class="btn ${pass && !last ? '' : 'y'}" data-act="restart" ${pass && !last ? '' : 'data-primary'}>Retry <small>R</small></button>
        ${pass && !last ? `<button class="btn y" data-act="next" data-primary>Next block</button>` : ''}
      </div>
      ${!pass ? `<p class="note">Target ${money(r.thr[0])}. Tip: ${r.tip}</p>` : last && r.stars ? '<p class="note">That was the last block in the city. Go back for three stars everywhere.</p>' : ''}
      </div></div>`;
  }
  animateResult(r) {
    const el = this.el.querySelector('.count');
    const t0 = performance.now(), dur = 900;
    const tick = () => {
      if (!this.el || !el.isConnected) return;
      const k = Math.min(1, (performance.now() - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = money(r.damage * e);
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    this.el.querySelectorAll('.bar u.on').forEach((u, i) => { u.style.animationDelay = (0.5 + i * 0.25) + 's'; setTimeout(() => this.g.audio.play('star'), 500 + i * 250); });
  }
}
