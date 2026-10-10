// Menus: title, garage (car / paint / arena), pause, how to play, wrecked, results.
import { CARS, CAR_KEYS, PAINTS, ARENAS, DRIVERS } from './data.js';
import { Car, drawCar } from './car.js';

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const ord = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10] || 'th');
const coin = (n) => `<span class="cn"><span class="coin"></span>${n.toLocaleString()}</span>`;

export class UI {
  constructor(g) {
    this.g = g;
    this.root = document.getElementById('ui');
    this.el = null; this.panel = null;
    this.gi = Math.max(0, CAR_KEYS.indexOf(g.save.car));
    this.pauseBtn = h('button', 'pausebtn', 'II');
    this.pauseBtn.setAttribute('aria-label', 'Pause');
    this.pauseBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (this.g.mode === 'play' && !this.open) this.show('pause'); });
    this.root.appendChild(this.pauseBtn);
    this.hud(false);
  }
  get open() { return !!this.el; }
  get blocking() { return this.panel === 'pause' || this.panel === 'howto'; }
  hud(on) { this.pauseBtn.style.display = on ? '' : 'none'; }
  close() { if (this.el) { this.el.remove(); this.el = null; this.panel = null; } }
  show(kind, data = {}) {
    this.close();
    this.panel = kind; this.data = data;
    const el = this.el = h('div', 'scrim ' + kind);
    el.innerHTML = this['p_' + kind](data);
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (!b || b.disabled) return; this.g.audio.unlock(); this.g.audio.click(); this.act(b.dataset.act, b.dataset.v); });
    el.addEventListener('input', (e) => {
      if (e.target.dataset.set === 'vol') { const a = this.g.audio; a.vol = +e.target.value / 100; this.g.save.vol = a.vol; a.apply(); this.g.persist(); }
    });
    this.root.appendChild(el);
    if (kind === 'garage') this.drawPreview();
  }
  back() {
    if (this.panel === 'howto' && this.g.mode === 'play') this.show('pause');
    else if (this.g.mode === 'title') this.show('title');
    else this.close();
  }
  primary() { const b = this.el && this.el.querySelector('[data-primary]'); if (b) b.click(); }
  act(a, v) {
    const g = this.g, s = g.save;
    switch (a) {
      case 'quick': g.startRound(s.arena); break;
      case 'garage': this.gi = Math.max(0, CAR_KEYS.indexOf(s.car)); this.show('garage'); break;
      case 'prev': this.gi = (this.gi + CAR_KEYS.length - 1) % CAR_KEYS.length; this.show('garage'); break;
      case 'next': this.gi = (this.gi + 1) % CAR_KEYS.length; this.show('garage'); break;
      case 'buy': {
        const k = CAR_KEYS[this.gi], M = CARS[k];
        if (!s.owned.includes(k) && s.coins >= M.price) { s.coins -= M.price; s.owned.push(k); s.car = k; g.persist(); g.audio.pickup(); }
        else if (s.owned.includes(k)) { s.car = k; g.persist(); }
        this.show('garage'); break;
      }
      case 'paint': {
        const i = +v, P = PAINTS[i];
        if (!s.paints.includes(i)) { if (s.coins < P.price) break; s.coins -= P.price; s.paints.push(i); g.audio.pickup(); }
        s.paint = i; g.persist(); this.show('garage'); break;
      }
      case 'arena': if (+v < s.unlocked) { s.arena = +v; g.persist(); this.show('garage'); } break;
      case 'start': {
        const k = CAR_KEYS[this.gi];
        if (s.owned.includes(k)) s.car = k;
        g.persist(); g.startRound(s.arena); break;
      }
      case 'resume': this.close(); break;
      case 'restart': g.startRound(g.arenaIdx); break;
      case 'mute': g.audio.muted = !g.audio.muted; s.muted = g.audio.muted; g.audio.apply(); g.persist(); this.show(this.panel, this.data); break;
      case 'howto': this.show('howto'); break;
      case 'back': this.back(); break;
      case 'title': g.toTitle(); break;
      case 'watch': g.spectateFast = true; this.close(); break;
      case 'results': g.showResults(); break;
      case 'again': g.startRound(g.arenaIdx); break;
    }
  }
  p_title() {
    const s = this.g.save, M = CARS[s.car], A = ARENAS[s.arena] || ARENAS[0];
    return `<div class="tbox"><div class="logo"><div class="hz"></div><h1><span class="a">DEMOLITION</span><span class="b">DERBY</span></h1><div class="hz"></div></div>
      <p class="tag">Eight cars · One dirt arena · Last one running wins</p>
      <div class="menu"><button class="btn hot" data-act="quick" data-primary>Smash! <small>${M.name} · ${A.name}</small></button>
      <button class="btn" data-act="garage">Garage <small>${coin(s.coins)}</small></button>
      <div class="row"><button class="btn sm" data-act="howto">How to play</button><button class="btn sm" data-act="mute">${this.g.audio.muted ? 'Sound off' : 'Sound on'}</button></div></div>
      <div class="keys">${this.g.isTouch ? 'Drag the left side to steer · gas is automatic · BOOST and REV on the right' : '<b>WASD</b> drive · <b>Space</b> handbrake · <b>Shift</b> boost · <b>R</b> restart · <b>Esc</b> pause'}</div>
      <div class="credit">a PLAYPILE game · ${s.wins} wins · ${s.wrecks} wrecks</div></div>`;
  }
  p_garage() {
    const s = this.g.save, k = CAR_KEYS[this.gi], M = CARS[k], owned = s.owned.includes(k);
    const bar = (label, f) => `<div class="stat"><span>${label}</span><i><b style="width:${Math.round(Math.max(0.08, Math.min(1, f)) * 100)}%"></b></i></div>`;
    const armour = (M.zone * 4 + M.engine * 2) / (175 * 4 + 150 * 2);
    const buyBtn = owned ? (s.car === k ? '<button class="btn sm sel" disabled>Driving this</button>' : '<button class="btn sm" data-act="buy">Drive this</button>')
      : `<button class="btn sm ${s.coins >= M.price ? 'hot' : ''}" data-act="buy" ${s.coins >= M.price ? '' : 'disabled'}><span class="cn">Buy&nbsp;&nbsp;${coin(M.price)}</span></button>`;
    const paints = PAINTS.map((P, i) => {
      const have = s.paints.includes(i);
      return `<button class="sw ${s.paint === i ? 'on' : ''} ${have ? '' : 'lock'}" data-act="paint" data-v="${i}" title="${P.name}${have ? '' : ' - ' + P.price}" style="--c:${P.top};--s:${P.stripe}" ${have || s.coins >= P.price ? '' : 'disabled'}>${have ? '' : `<em>${P.price}</em>`}</button>`;
    }).join('');
    const arenas = ARENAS.map((A, i) => {
      const lock = i >= s.unlocked;
      return `<button class="arena a${i} ${s.arena === i ? 'on' : ''} ${lock ? 'lock' : ''}" data-act="arena" data-v="${i}" ${lock ? 'disabled' : ''}><b>${A.name}</b><span>${lock ? '🔒 ' + A.unlock : A.blurb}</span></button>`;
    }).join('');
    return `<div class="card garage"><div class="ghead"><h2>Garage</h2><div class="coins">${coin(s.coins)}</div></div>
      <div class="carpick"><button class="arrow" data-act="prev" aria-label="Previous car">&#9664;</button>
        <div class="preview"><canvas width="360" height="200"></canvas>${owned ? '' : '<div class="tagl">FOR SALE</div>'}</div>
        <button class="arrow" data-act="next" aria-label="Next car">&#9654;</button></div>
      <div class="cinfo"><h3>${M.name}</h3><p>${M.blurb}</p>
        <div class="stats2">${bar('Speed', (M.top - 480) / 270)}${bar('Accel', (M.accel - 620) / 500)}${bar('Armour', armour)}${bar('Weight', M.mass / 2.8)}${bar('Handling', (M.turn - 1.5) / 1.45)}</div>
        <div class="buy">${buyBtn}</div></div>
      <div class="sub">Paint</div><div class="paints">${paints}</div>
      <div class="sub">Arena</div><div class="arenas">${arenas}</div>
      <div class="menu row"><button class="btn sm" data-act="title">Back</button><button class="btn hot" data-act="start" data-primary>Start ▶ <small>${CARS[s.car].name} · ${(ARENAS[s.arena] || ARENAS[0]).name}</small></button></div></div>`;
  }
  drawPreview() {
    const cv = this.el.querySelector('.preview canvas');
    if (!cv) return;
    const k = CAR_KEYS[this.gi], s = this.g.save, P = PAINTS[s.paint] || PAINTS[0];
    const car = new Car(k, { top: P.top, stripe: P.stripe, num: 7, name: 'YOU' });
    const x = cv.getContext('2d'), sc = k === 'bus' ? 2.9 : 3.6;
    x.clearRect(0, 0, cv.width, cv.height);
    x.save(); x.translate(cv.width / 2, cv.height / 2); x.scale(sc, sc);
    car.x = 0; car.y = 0; car.h = 0;
    x.fillStyle = 'rgba(0,0,0,0.25)'; x.beginPath(); x.roundRect(-car.L + 3, -car.W + 4, car.L * 2, car.W * 2, 7); x.fill();
    drawCar(x, car, 0);
    x.restore();
  }
  p_pause() {
    const a = this.g.audio;
    return `<div class="card"><h2>Paused</h2><div class="menu"><button class="btn hot" data-act="resume" data-primary>Resume</button><button class="btn" data-act="restart">Restart (R)</button>
      <label class="set">Volume <input type="range" min="0" max="100" value="${Math.round(a.vol * 100)}" data-set="vol"></label>
      <button class="btn sm" data-act="mute">${a.muted ? 'Sound: OFF' : 'Sound: ON'}</button>
      <button class="btn sm" data-act="howto">How to play</button><button class="btn sm" data-act="title">Quit to title</button></div></div>`;
  }
  p_howto() {
    const r = (k, t) => `<div class="how"><span class="k">${k}</span><span>${t}</span></div>`;
    return `<div class="card"><h2>How to play</h2>
      ${r(this.g.isTouch ? 'STICK' : 'WASD', this.g.isTouch ? 'Drag on the left side: the car turns to face where you point. Gas is automatic. <b>REV</b> reverses, <b>BOOST</b> boosts.' : '<b>W</b> gas, <b>S</b> brake and reverse, <b>A D</b> steer. <b>Space</b> handbrake, <b>Shift</b> boost.')}
      ${r('LAST', 'Eight cars. Wreck the others. The last car still running wins.')}
      ${r('FRONT', 'Your front bumper is armoured. Hit them in the side (<b>T-BONE</b>) or the back. Getting hit in the side hurts you the most.')}
      ${r('SMOKE', 'Grey smoke, then black smoke, then fire. When the engine dies you are out.')}
      ${r('+', 'Pickups: <b style="color:#1d9a50">wrench</b> fixes your worst side, <b style="color:#1d78c8">nitro</b> refills boost, <b style="color:#d8402a">spikes</b> double your hits for 10 s.')}
      ${r('RING', 'After 75 seconds a ring of fire closes in. Stay inside it.')}
      <div class="menu"><button class="btn hot" data-act="back" data-primary>Got it</button></div></div>`;
  }
  p_out(d) {
    return `<div class="card out"><h2>You're wrecked</h2><div class="big">${ord(d.place).toUpperCase()}</div><div class="sub">${this.g.alive().length} cars still running</div>
      <div class="menu row"><button class="btn" data-act="watch">Watch</button><button class="btn hot" data-act="results" data-primary>Results</button></div></div>`;
  }
  p_results(d) {
    const win = d.place === 1;
    const rows = d.order.map((c) => `<div class="st ${c.isPlayer ? 'me' : ''}"><b>${c.alive && !this.g.over ? 'IN' : ord(c.place || 1)}</b><i style="background:${c.livery.top}"></i><span>${c.isPlayer ? 'YOU' : c.name}</span><em>${Math.round(c.stats.dealt)} dmg · ${c.stats.wrecks} wr</em></div>`).join('');
    return `<div class="card res ${win ? 'win' : ''}"><h2>${win ? 'WINNER!' : 'Round over'}</h2><div class="big">${win ? '1ST' : ord(d.place).toUpperCase()}</div><div class="sub">${d.arena}</div>
      <div class="stats"><div><b>${d.dealt}</b><span>damage dealt</span></div><div><b>${d.wrecks}</b><span>wrecks</span></div><div><b>${Math.floor(d.survived / 60)}:${String(Math.floor(d.survived % 60)).padStart(2, '0')}</b><span>survived</span></div></div>
      <div class="pay"><div><span>${ord(d.place)} place</span>${coin(d.coins.place)}</div><div><span>Damage dealt</span>${coin(d.coins.damage)}</div><div><span>Wrecks</span>${coin(d.coins.wrecks)}</div><div><span>Survival</span>${coin(d.coins.time)}</div><div class="tot"><span>Total</span>${coin(d.total)}</div></div>
      ${d.unlocked ? `<div class="nb">NEW ARENA UNLOCKED: ${d.unlocked.toUpperCase()}</div>` : ''}
      <div class="standings">${rows}</div>
      <div class="menu row"><button class="btn" data-act="garage">Garage</button><button class="btn hot" data-act="again" data-primary>Again <small>R / Space</small></button></div></div>`;
  }
}
void DRIVERS;
