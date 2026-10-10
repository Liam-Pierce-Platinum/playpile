// HTML menus: title, day select, shop, results, pause, settings, how to play.
import { DAYS, PLACES, UPGRADES } from './data.js';

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const starsHtml = (n, of = 3) => Array.from({ length: of }, (_, i) => `<i class="${i < n ? 'on' : ''}">★</i>`).join('');
const coinHtml = (v) => `<span class="coinv"><b class="cn"></b>${v}</span>`;

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
  hud(on) { this.pauseBtn.style.display = on ? '' : 'none'; this.place(); }
  place() {
    const v = this.g.view, L = this.g.L;
    if (!v || !L) return;
    const sz = Math.max(38, 46 * v.s);
    Object.assign(this.pauseBtn.style, { left: `${v.ox + 10 * v.s}px`, top: `${v.oy + L.hudY * v.s - sz / 2}px`, width: `${sz}px`, height: `${sz}px` });
  }
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
      const k = e.target.dataset.set;
      if (!k) return;
      this.g.audio[k] = +e.target.value / 100; this.g.save[k] = this.g.audio[k]; this.g.audio.apply(); this.g.persist();
    });
    this.root.appendChild(el);
    if (kind === 'result') this.animateStars(data);
  }
  back() {
    if (this.g.mode === 'play') this.show('pause');
    else if (this.g.mode === 'result' && this.g.lastResult) this.show('result', this.g.lastResult);
    else this.show('title');
  }
  primary() { const b = this.el && this.el.querySelector('[data-primary]'); if (b) b.click(); }
  act(a, arg) {
    const g = this.g, s = g.save;
    switch (a) {
      case 'play': g.startDay(this.nextDay()); break;
      case 'day': g.startDay(+arg); break;
      case 'days': this.show('days'); break;
      case 'shop': this.show('shop'); break;
      case 'buy': {
        const u = UPGRADES.find((x) => x.id === arg), lv = s.upg[u.id];
        if (lv >= u.max || s.coins < u.cost[lv]) return;
        s.coins -= u.cost[lv]; s.upg[u.id] = lv + 1; g.persist();
        g.audio.play('buy');
        this.show('shop');
        const card = this.el.querySelector(`[data-up="${u.id}"]`); if (card) card.classList.add('bought');
        break;
      }
      case 'howto': this.show('howto'); break;
      case 'settings': this.show('settings'); break;
      case 'back': this.back(); break;
      case 'resume': this.close(); break;
      case 'restart': g.restart(); break;
      case 'next': g.startDay(Math.min(DAYS.length, g.S.n + 1)); break;
      case 'toggle': {
        const k = arg; s[k] = !s[k]; g.audio[k] = s[k]; g.audio.apply(); g.persist();
        this.show(this.panel === 'pause' ? 'pause' : 'settings');
        break;
      }
      case 'title': g.startAttract(); this.hud(false); this.show('title'); break;
    }
  }
  nextDay() {
    const s = this.g.save;
    for (let n = 1; n <= DAYS.length; n++) if (!s.stars[n] && n <= s.unlocked) return n;
    return Math.min(s.unlocked, DAYS.length);
  }
  totalStars() { return Object.values(this.g.save.stars).reduce((a, b) => a + b, 0); }

  p_title() {
    const s = this.g.save, n = this.nextDay(), any = Object.keys(s.stars).length > 0;
    return `<div class="title"><div class="logo"><div class="sun"></div><h1><span class="l1">SUSHI</span><span class="l2">CONVEYOR</span></h1><p>Grab the right plate · Feed the right face</p></div>
      <div class="menu"><button class="btn red big" data-act="play" data-primary>${any ? `Continue · Day ${n}` : 'Play'} <small>▶</small></button>
      <div class="row2"><button class="btn" data-act="days">Days <small>${this.totalStars()}/36 ★</small></button><button class="btn" data-act="shop">Shop <small>${coinHtml(s.coins)}</small></button></div>
      <div class="row2"><button class="btn small" data-act="howto">How to play</button><button class="btn small" data-act="settings">Settings</button></div></div>
      <div class="credit">a PLAYPILE game</div></div>`;
  }
  p_days() {
    const s = this.g.save;
    let html = '';
    PLACES.forEach((P, pi) => {
      html += `<h3><span class="ck" style="background:${P.accent}">${P.kanji}</span>${P.name}</h3><div class="grid">`;
      DAYS.forEach((d, i) => {
        if (d.place !== pi) return;
        const n = i + 1, locked = n > s.unlocked, st = s.stars[n] || 0;
        html += `<button class="dayb ${locked ? 'locked' : ''} ${st ? 'done' : ''}" data-act="day" data-arg="${n}" ${locked ? 'disabled' : ''}>
          <b>${locked ? '🔒' : 'Day ' + n}</b><span class="stars">${starsHtml(st)}</span><small>${s.best[n] ? coinHtml(s.best[n]) : d.len + ' s'}</small></button>`;
      });
      html += '</div>';
    });
    return `<div class="card wide"><header><h2>Days</h2><span class="hstars">${this.totalStars()} / 36 ★</span><button class="btn x" data-act="back">✕</button></header><div class="body">${html}
      <p class="note">Earn tips to get stars. One star opens the next day. Every tip also goes in your wallet for the shop.</p></div></div>`;
  }
  p_shop() {
    const s = this.g.save;
    const cards = UPGRADES.map((u) => {
      const lv = s.upg[u.id], maxed = lv >= u.max, cost = u.cost[lv];
      const pips = Array.from({ length: u.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
      return `<div class="up" data-up="${u.id}"><div class="ui ic-${u.icon}"></div><div class="ut"><b>${u.name}</b><span class="pips">${pips}</span><small>${maxed ? 'Fully upgraded!' : u.desc(lv)}</small></div>
        <button class="btn ${maxed ? '' : s.coins >= cost ? 'green' : ''} buy" data-act="buy" data-arg="${u.id}" ${maxed || s.coins < cost ? 'disabled' : ''}>${maxed ? 'MAX' : coinHtml(cost)}</button></div>`;
    }).join('');
    return `<div class="card wide"><header><h2>Shop</h2><span class="wallet">${coinHtml(s.coins)}</span><button class="btn x" data-act="back">✕</button></header><div class="body"><div class="ups">${cards}</div>
      <p class="note">Your wallet fills with every tip you earn, even on days that go wrong.</p></div></div>`;
  }
  p_result(d) {
    const head = d.failed ? 'Closed early!' : d.passed ? `Day ${d.n} done!` : 'Not enough tips';
    const sub = d.failed ? 'Three angry customers stormed out.' : d.passed ? (d.stars === 3 ? 'A perfect service!' : `Next star at ${d.targets[d.stars]} tips`) : `You need ${d.targets[0]} tips for a star.`;
    const last = d.n >= DAYS.length;
    const canNext = d.passed && !last;
    return `<div class="card result ${d.passed ? 'win' : 'lose'}"><div class="rhead"><div class="face ${d.passed ? 'happy' : 'sad'}"></div><div><h2>${head}</h2><p>${sub}</p></div></div>
      <div class="starrow">${[0, 1, 2].map((i) => `<div class="st" data-i="${i}"><span class="bigstar">★</span><small>${d.targets[i]}</small></div>`).join('')}</div>
      <div class="stats"><div><small>Tips</small><b>${coinHtml(d.tips)}</b>${d.newBest ? '<em>NEW BEST</em>' : ''}</div><div><small>Served</small><b>${d.served}</b></div><div><small>Best combo</small><b>${d.maxCombo}</b></div><div><small>Perfect</small><b>${d.perfect}</b></div></div>
      <p class="walletline">Wallet ${coinHtml(d.coins)}</p>
      <div class="btns"><button class="btn" data-act="restart" ${canNext ? '' : 'data-primary'}>↺ Retry</button><button class="btn" data-act="shop">Shop</button>
      ${canNext ? '<button class="btn red" data-act="next" data-primary>Next day ▶</button>' : last && d.passed ? '<button class="btn red" data-act="title" data-primary>Finish</button>' : '<button class="btn" data-act="days">Days</button>'}</div>
      <p class="note">${d.failed ? 'Tip: tap the chef to cook for whoever is closest to snapping.' : 'Space for ' + (canNext ? 'the next day' : 'retry')}</p></div>`;
  }
  animateStars(d) {
    for (let i = 0; i < d.stars; i++) {
      setTimeout(() => {
        const st = this.el && this.el.querySelector(`.st[data-i="${i}"]`);
        if (!st) return;
        st.classList.add('on');
        this.g.audio.play('star');
      }, 380 + i * 300);
    }
  }
  p_pause() {
    const s = this.g.save;
    return `<div class="card small"><header><h2>Paused</h2></header><div class="body menu">
      <button class="btn red" data-act="resume" data-primary>Resume</button>
      <button class="btn" data-act="restart">Restart day (R)</button>
      <div class="row2"><button class="btn small ${s.musicOn ? 'on' : 'off'}" data-act="toggle" data-arg="musicOn">Music: ${s.musicOn ? 'ON' : 'OFF'}</button>
      <button class="btn small ${s.muted ? 'off' : 'on'}" data-act="toggle" data-arg="muted">Sound: ${s.muted ? 'OFF' : 'ON'}</button></div>
      <div class="row2"><button class="btn small" data-act="howto">How to play</button><button class="btn small" data-act="settings">Volume</button></div>
      <button class="btn" data-act="title">Quit to title</button></div></div>`;
  }
  p_settings() {
    const a = this.g.audio, s = this.g.save;
    return `<div class="card small"><header><h2>Settings</h2><button class="btn x" data-act="back">✕</button></header><div class="body">
      <label class="set">Music <input type="range" min="0" max="100" value="${Math.round(a.music * 100)}" data-set="music"></label>
      <label class="set">Sound <input type="range" min="0" max="100" value="${Math.round(a.sfx * 100)}" data-set="sfx"></label>
      <div class="row2"><button class="btn small ${s.musicOn ? 'on' : 'off'}" data-act="toggle" data-arg="musicOn">Music: ${s.musicOn ? 'ON' : 'OFF'}</button>
      <button class="btn small ${s.muted ? 'off' : 'on'}" data-act="toggle" data-arg="muted">All sound: ${s.muted ? 'OFF' : 'ON'}</button></div>
      <button class="btn" data-act="back" style="margin-top:14px;width:100%">Back</button></div></div>`;
  }
  p_howto() {
    const r = (k, t) => `<div class="how"><span class="hk ${k}"></span><span>${t}</span></div>`;
    return `<div class="card small"><header><h2>How to play</h2><button class="btn x" data-act="back">✕</button></header><div class="body">
      ${r('k-drag', '<b>Drag a plate</b> off the belt onto the customer who wants it, or <b>flick</b> it up at them.')}
      ${r('k-tap', '<b>Or tap</b> a plate to hold it, then tap the customer. Tapping a customer first works too.')}
      ${r('k-bubble', 'Bubbles show the order: a dish, <b>any plate of a colour</b>, a colour <b>under a price</b> (the coin on each plate), or "any roll".')}
      ${r('k-angry', 'The bar in the bubble is their patience. Wrong food makes them grumpy. <b>Three walkouts</b> closes the shop.')}
      ${r('k-chef', '<b>Tap the chef</b> (C) to cook for whoever is closest to snapping. <b>SLOW</b> lever (Space) slows the belts.')}
      ${r('k-gold', 'Gold plates: anyone takes one, for a big tip. Shoo the cat before it pinches a plate! Fast serves build a tip <b>combo</b>.')}
      <button class="btn red" data-act="back" style="margin-top:14px;width:100%">Got it</button></div></div>`;
  }
}
