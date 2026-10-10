// HTML menus: title, gardens, garage, how to play, settings, pause, results.
import { LEVELS, MOWERS } from './levels.js';
import { drawMower, fmtTime } from './render.js';

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const starRow = (st, cls = '') => (st || [false, false, false]).map((on) => `<i class="${on ? 'on' : ''} ${cls}">★</i>`).join('');

export class UI {
  constructor(g) {
    this.g = g;
    this.root = document.getElementById('ui');
    this.el = null; this.panel = null;
    this.pauseBtn = h('button', 'pausebtn', '<span></span><span></span>');
    this.pauseBtn.setAttribute('aria-label', 'Pause');
    this.pauseBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (this.g.mode === 'play' && !this.open && this.g.phase !== 'end') this.g.pause(); });
    this.root.appendChild(this.pauseBtn);
    this.boostBtn = h('button', 'boostbtn', '<b>BOOST</b><small>uses fuel</small>');
    const on = (e) => { e.preventDefault(); e.stopPropagation(); this.g.audio.unlock(); this.g.boostHeld = true; this.boostBtn.classList.add('down'); };
    const off = () => { this.g.boostHeld = false; this.boostBtn.classList.remove('down'); };
    this.boostBtn.addEventListener('pointerdown', on);
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) this.boostBtn.addEventListener(ev, off);
    this.root.appendChild(this.boostBtn);
    this.hud(false);
  }
  get open() { return !!this.el; }
  hud(on) { this.pauseBtn.style.display = on ? '' : 'none'; this.boostBtn.style.display = on && this.g.touchUI ? '' : 'none'; }
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
      const k = e.target.dataset.set, a = this.g.audio, s = this.g.save;
      if (!k) return;
      if (k === 'muted') { a.muted = s.muted = e.target.checked; }
      else if (k === 'musicOn') { a.musicOn = s.musicOn = e.target.checked; }
      else { a[k] = s[k] = +e.target.value / 100; }
      a.apply(); this.g.persist();
    });
    this.root.appendChild(el);
    if (kind === 'result') this.animateStars(data);
    if (kind === 'garage') this.paintGarage();
  }
  back() {
    const g = this.g;
    if (g.mode === 'title') this.show('title');
    else if (['settings', 'howto', 'gardens'].includes(this.panel) && g.phase !== 'end') this.show('pause');
    else if ((this.panel === 'gardens' || this.panel === 'garage') && ['result', 'fail'].includes(this.prev)) this.show(this.prev, this.prevData);
    else this.close();
  }
  primary() { const b = this.el && this.el.querySelector('[data-primary]'); if (b) b.click(); }
  act(a, arg) {
    const g = this.g;
    switch (a) {
      case 'play': g.start(this.nextLevel()); break;
      case 'level': g.start(+arg); break;
      case 'gardens': if (!['gardens', 'garage'].includes(this.panel)) { this.prev = this.panel; this.prevData = this.data; } this.show('gardens'); break;
      case 'garage': if (!['gardens', 'garage'].includes(this.panel)) { this.prev = this.panel; this.prevData = this.data; } this.show('garage'); break;
      case 'mower': g.save.mower = arg; g.persist(); this.show('garage'); break;
      case 'howto': this.show('howto'); break;
      case 'settings': this.show('settings'); break;
      case 'back': this.back(); break;
      case 'resume': this.close(); break;
      case 'restart': g.restart(); break;
      case 'next': g.start(Math.min(LEVELS.length, g.n + 1)); break;
      case 'title': g.toTitle(); break;
    }
  }
  nextLevel() {
    const s = this.g.save;
    for (let n = 1; n <= Math.min(LEVELS.length, s.unlocked); n++) if (!s.stars[n]) return n;
    return Math.min(LEVELS.length, s.unlocked);
  }

  p_title() {
    const g = this.g, n = this.nextLevel(), any = Object.keys(g.save.stars).length > 0;
    return `<div class="title"><div class="logo"><h1><span class="w1">MOWER</span><span class="w2">MADNESS</span></h1><p>Cut the lawn · Draw the stripes · Dodge the gnomes</p></div>
      <div class="menu"><button class="btn go" data-act="play" data-primary>${any ? `Continue <small>Garden ${n}</small>` : 'Play'}</button>
      <div class="row2"><button class="btn" data-act="gardens">Gardens <small>${g.totalStars()}/${LEVELS.length * 3}★</small></button><button class="btn" data-act="garage">Garage</button></div>
      <div class="row2"><button class="btn small" data-act="howto">How to play</button><button class="btn small" data-act="settings">Settings</button></div></div>
      <div class="credit">a PLAYPILE game</div></div>`;
  }
  p_gardens() {
    const s = this.g.save;
    let html = '<div class="grid">';
    LEVELS.forEach((lv, i) => {
      const n = i + 1, locked = n > s.unlocked, st = s.stars[n];
      html += `<button class="lvl ${locked ? 'locked' : ''} ${st ? 'done' : ''} th-${lv.theme}" data-act="level" data-arg="${n}" ${locked ? 'disabled' : ''}>
        <b>${locked ? '🔒' : n}</b><em>${lv.name}</em><span class="stars">${starRow(st)}</span><small>${s.best[n] ? s.best[n].toLocaleString('en-US') : `${lv.time}s · ${Math.round(lv.target * 100)}%`}</small></button>`;
    });
    html += '</div>';
    return `<div class="card wide"><header><h2>Gardens</h2><span class="hstars">${this.g.totalStars()} / ${LEVELS.length * 3} ★</span><button class="btn x" data-act="back">✕</button></header><div class="body">${html}
      <p class="note">★ Time: finish with time to spare &nbsp; ★ Stripes: straight, parallel passes &nbsp; ★ Flowers: do not mow a single one</p></div></div>`;
  }
  p_garage() {
    const g = this.g, total = g.totalStars();
    const bar = (v) => `<span class="bar"><span style="width:${Math.round(v * 100)}%"></span></span>`;
    const rows = MOWERS.map((mw) => {
      const locked = total < mw.need, sel = g.save.mower === mw.id;
      return `<div class="mow ${locked ? 'locked' : ''} ${sel ? 'sel' : ''}"><canvas width="150" height="110" data-mower="${mw.id}"></canvas>
        <div class="info"><b>${mw.name}</b><p>${mw.desc}</p>
        <div class="stats"><label>Speed ${bar((mw.speed - 200) / 130)}</label><label>Deck ${bar((mw.deck - 30) / 40)}</label><label>Grip ${bar((mw.grip - 4) / 5)}</label></div></div>
        ${locked ? `<button class="btn small" disabled>🔒 ${mw.need}★</button>` : sel ? '<button class="btn small on" disabled>Driving</button>' : `<button class="btn small" data-act="mower" data-arg="${mw.id}">Choose</button>`}</div>`;
    }).join('');
    return `<div class="card wide"><header><h2>Garage</h2><span class="hstars">${total} ★</span><button class="btn x" data-act="back">✕</button></header><div class="body garage">${rows}
      <p class="note">Earn stars in the gardens to unlock new mowers.</p></div></div>`;
  }
  paintGarage() {
    for (const cv of this.el.querySelectorAll('canvas[data-mower]')) {
      const mw = MOWERS.find((m) => m.id === cv.dataset.mower), x = cv.getContext('2d');
      const dpr = Math.min(devicePixelRatio || 1, 2); cv.width = 150 * dpr; cv.height = 110 * dpr; x.scale(dpr, dpr);
      x.fillStyle = '#7cc04a'; x.fillRect(0, 0, 150, 110);
      for (let i = 0; i < 4; i++) { x.fillStyle = i % 2 ? '#6aae43' : '#8acb57'; x.fillRect(0, i * 27.5, 150, 27.5); }
      x.save(); x.translate(80, 55); x.scale(1.7, 1.7);
      drawMower(x, { x: 0, y: 0, a: -Math.PI / 2 + 0.5, sx: 1, sy: 1, roll: 0, blades: true, flash: 0, hatX: 0, hatY: 0, steerVis: 0 }, 1, mw);
      x.restore();
    }
  }
  p_result(d) {
    const lv = d.lv;
    const rows = [
      ['Time left', fmtTime(d.timeLeft), `need ${fmtTime(lv.starLeft)}`],
      ['Stripes', `${Math.round(d.stripe * 100)}%`, `need ${Math.round(lv.stripeT * 100)}%`],
      ['Flowers mowed', `${d.flowers}`, 'need 0'],
    ];
    const unlock = d.newMowers.length ? `<div class="unlock">NEW MOWER UNLOCKED: <b>${d.newMowers.map((m) => m.name).join(', ')}</b> <button class="btn small" data-act="garage">Garage</button></div>` : '';
    const last = d.n >= LEVELS.length;
    return `<div class="card result"><header><h2>Lawn done!</h2><span class="sub">${d.n}. ${lv.name}</span></header><div class="body">
      <div class="starrow">${d.stars.map((on, i) => `<div class="st" data-i="${i}"><i class="big">★</i><b>${rows[i][0]}</b><span>${rows[i][1]}</span><small>${rows[i][2]}</small></div>`).join('')}</div>
      <div class="tally"><div><span>Mowing &amp; tricks</span><b>${d.mow.toLocaleString('en-US')}</b></div><div><span>Time bonus</span><b>+${d.timeBonus.toLocaleString('en-US')}</b></div><div><span>Stripe bonus</span><b>+${d.stripeBonus.toLocaleString('en-US')}</b></div>
      <div class="tot"><span>Score</span><b>${d.total.toLocaleString('en-US')}</b>${d.newBest ? '<em class="nb">NEW BEST!</em>' : `<small>best ${d.best.toLocaleString('en-US')}</small>`}</div></div>
      ${unlock}
      <div class="btns"><button class="btn" data-act="restart">↺ Retry</button><button class="btn" data-act="gardens">Gardens</button>${last ? '<button class="btn go" data-act="title" data-primary>Finish</button>' : '<button class="btn go" data-act="next" data-primary>Next ▶</button>'}</div>
      <p class="note">${d.stars.every(Boolean) ? 'Perfect lawn! The neighbours are jealous.' : !d.stars[1] ? 'Tip: go straight, turn round at the end, and come back right next to your last pass.' : !d.stars[0] ? 'Tip: boost on the long straights and grab the fuel cans.' : 'Tip: keep the deck off the flower beds.'} · Space for next · R retry</p></div></div>`;
  }
  animateStars(d) {
    d.stars.forEach((on, i) => {
      if (!on) return;
      setTimeout(() => {
        const st = this.el && this.el.querySelector(`.st[data-i="${i}"] .big`);
        if (!st) return;
        st.classList.add('on', 'pop');
        this.g.audio.play('star');
      }, 300 + i * 300);
    });
  }
  p_fail(d) {
    return `<div class="card result small"><header><h2>Out of time!</h2><span class="sub">${d.n}. ${LEVELS[d.n - 1].name}</span></header><div class="body">
      <div class="failbar"><span style="width:${Math.min(100, d.pct * 100)}%"></span><i style="left:${d.target * 100}%"></i></div>
      <p class="big">You cut <b>${Math.floor(d.pct * 100)}%</b>. The target was <b>${Math.round(d.target * 100)}%</b>.</p>
      <div class="btns"><button class="btn" data-act="gardens">Gardens</button><button class="btn go" data-act="restart" data-primary>↺ Try again</button></div>
      <p class="note">Gnomes, the dog and the cats all cost you time. Boost on the straights. · Space to retry</p></div></div>`;
  }
  p_pause() {
    const a = this.g.audio;
    return `<div class="card small"><header><h2>Paused</h2><span class="sub">${this.g.n}. ${this.g.lv.name}</span></header><div class="body menu">
      <button class="btn go" data-act="resume">Resume</button><button class="btn" data-act="restart">Restart (R)</button>
      <div class="row2"><label class="tog"><input type="checkbox" data-set="musicOn" ${a.musicOn ? 'checked' : ''}> Music</label><label class="tog"><input type="checkbox" data-set="muted" ${a.muted ? 'checked' : ''}> Mute all</label></div>
      <div class="row2"><button class="btn small" data-act="gardens">Gardens</button><button class="btn small" data-act="settings">Settings</button></div>
      <button class="btn small" data-act="howto">How to play</button>
      <button class="btn small" data-act="title">Quit to title</button></div></div>`;
  }
  p_settings() {
    const a = this.g.audio;
    return `<div class="card small"><header><h2>Settings</h2><button class="btn x" data-act="back">✕</button></header><div class="body">
      <label class="set">Music volume <input type="range" min="0" max="100" value="${Math.round(a.music * 100)}" data-set="music"></label>
      <label class="set">Sound volume <input type="range" min="0" max="100" value="${Math.round(a.sfx * 100)}" data-set="sfx"></label>
      <label class="set">Music on <input type="checkbox" data-set="musicOn" ${a.musicOn ? 'checked' : ''}></label>
      <label class="set">Mute everything <input type="checkbox" data-set="muted" ${a.muted ? 'checked' : ''}></label>
      <button class="btn" data-act="back">Back</button></div></div>`;
  }
  p_howto() {
    const r = (k, t) => `<div class="how"><span class="hk">${k}</span><span>${t}</span></div>`;
    return `<div class="card small"><header><h2>How to play</h2><button class="btn x" data-act="back">✕</button></header><div class="body">
      ${r('⇄', '<b>WASD / arrows</b> drive the way you press. On a phone, <b>drag anywhere</b> to steer. <b>Space</b> (or the BOOST button) boosts but burns fuel.')}
      ${r('%', 'Cut the lawn up to the <b>target flag</b> on the meter before the clock runs out.')}
      ${r('▤', 'Drive <b>straight</b>, turn round, and come back <b>right next to</b> your last pass. Each parallel pass grows your <b>STRIPE CHAIN</b> multiplier.')}
      ${r('!', '<b>Gnomes</b>, the <b>dog</b> and sleeping <b>cats</b> (slow down near them) cost seconds. <b>Toys</b> clog the blades. <b>Mud</b> is slippery. <b>Slopes</b> push you downhill.')}
      ${r('✿', 'Never mow the <b>flower beds</b>. Grab <b>fuel cans</b>. Spin a full circle for a <b>DONUT</b>.')}
      ${r('★', 'Stars: finish with time to spare, stripe the lawn, mow no flowers. Stars unlock new mowers in the <b>Garage</b>. <b>R</b> restarts, <b>Esc</b> pauses.')}
      <button class="btn go" data-act="back">Got it</button></div></div>`;
  }
}
