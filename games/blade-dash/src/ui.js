// Menus in HTML: title, stage select, results (auto-advance), pause, settings,
// how to play, wardrobe, toasts.
import { CHAPTERS, STAGES } from './levels.js';
import { SLOTS, ITEMS, ACHIEVEMENTS, outfitOf, affordable, totalStars } from './wardrobe.js';
import { drawFigure, drawScarf, drawCoin, pose, lerpPose } from './draw.js';

const AUTO_NEXT = 1.6;   // seconds the results stamp stays before the next stage
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const hanko = (ch, on, big) => `<span class="hanko ${on ? 'on' : ''} ${big ? 'big' : ''}">${ch}</span>`;
const coin = '<i class="coin"></i>';

export class UI {
  constructor(g) {
    this.g = g;
    this.root = document.getElementById('ui');
    this.el = null;
    this.panel = null;
    this.pauseBtn = h('button', 'pausebtn', 'II');
    this.pauseBtn.setAttribute('aria-label', 'Pause');
    this.pauseBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (this.g.mode === 'play' && !this.open) { this.g.audio.play('click'); this.show('pause'); } });
    this.root.appendChild(this.pauseBtn);
    // hold-to-slow button for touch screens (the keyboard uses Space)
    this.focusBtn = h('button', 'focusbtn', '<b>集中</b><span>hold: slow-mo</span>');
    const on = (e) => { e.preventDefault(); e.stopPropagation(); this.g.audio.unlock(); this.g.setFocus(true); this.focusBtn.classList.add('down'); };
    const off = () => { this.g.setFocus(false); this.focusBtn.classList.remove('down'); };
    this.focusBtn.addEventListener('pointerdown', on);
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) this.focusBtn.addEventListener(ev, off);
    this.root.appendChild(this.focusBtn);
    this.toasts = h('div', 'toasts'); this.root.appendChild(this.toasts);
    this.hud(false);
  }
  get open() { return !!this.el; }
  layout(band) { document.body.classList.toggle('portrait', !!band); }
  hud(on) { this.pauseBtn.style.display = on ? '' : 'none'; this.focusBtn.style.display = on ? '' : 'none'; }
  close() {
    clearTimeout(this.autoT); this.autoT = null;
    if (this.raf) { cancelAnimationFrame(this.raf); this.raf = null; }
    if (this.el) { this.el.remove(); this.el = null; this.panel = null; }
  }
  show(kind, data = {}) {
    this.close();
    this.panel = kind; this.data = data;
    const el = this.el = h('div', 'scrim ' + kind);
    el.innerHTML = this['p_' + kind](data);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (kind === 'result' && !b) { this.g.audio.play('click'); this.act('next'); return; }   // tap anywhere: next stage
      if (!b || b.disabled) return;
      this.g.audio.unlock(); this.g.audio.play('click');
      this.act(b.dataset.act, b.dataset.arg);
    });
    el.addEventListener('input', (e) => { const k = e.target.dataset.set; if (k) { this.g.audio[k] = +e.target.value / 100; this.g.save[k] = this.g.audio[k]; this.g.audio.apply(); this.g.persist(); } });
    this.root.appendChild(el);
    if (kind === 'result' || kind === 'finale') this.afterResult(data);
    if (kind === 'wardrobe') this.mountWardrobe();
  }
  back() {
    if (this.panel === 'wardrobe') { const r = this.wardrobeFrom; if (r === 'next') this.act('next'); else if (r === 'pause') this.show('pause'); else this.show('title'); return; }
    if (this.g.mode === 'title') this.show('title');
    else if (this.panel === 'settings' || this.panel === 'howto' || this.panel === 'stages') this.show(this.g.mode === 'play' ? 'pause' : 'title');
    else this.close();
  }
  primary() { const b = this.el && this.el.querySelector('[data-primary]'); if (b) b.click(); }
  act(a, arg) {
    const g = this.g;
    switch (a) {
      case 'play': g.startStage(this.nextStage()); break;
      case 'stage': g.startStage(+arg); break;
      case 'stages': this.show('stages'); break;
      case 'endless': g.startEndless(); break;
      case 'howto': this.show('howto'); break;
      case 'settings': this.show('settings'); break;
      case 'wardrobe': this.wardrobeFrom = this.panel === 'result' ? 'next' : this.panel === 'pause' ? 'pause' : 'title'; this.show('wardrobe'); break;
      case 'back': this.back(); break;
      case 'resume': this.close(); break;
      case 'restart': g.restart(); break;
      case 'next': g.startStage(Math.min(STAGES, g.stageN + 1)); break;
      case 'title': g.mode = 'title'; this.hud(false); this.show('title'); break;
      case 'slot': this.wSlot = arg; this.wSel = g.save.equip[arg]; this.renderWardrobe(); break;
      case 'pick': this.wSel = arg; this.renderWardrobe(); break;
      case 'buy': this.buy(); break;
      case 'equip': g.save.equip[this.wSlot] = this.wSel; g.setOutfit(g.save.equip); g.persist(); this.renderWardrobe(); break;
    }
  }
  nextStage() {
    const s = this.g.save;
    for (let n = 1; n <= STAGES; n++) if (!s.stars[n]) return n;
    return STAGES;
  }
  totalStars() { return totalStars(this.g.save); }
  toast(html) {
    const t = h('div', 'toast', html);
    this.toasts.appendChild(t);
    setTimeout(() => t.classList.add('out'), 2600);
    setTimeout(() => t.remove(), 3100);
  }

  p_title() {
    const n = this.nextStage(), any = Object.keys(this.g.save.stars).length > 0;
    const nudge = affordable(this.g.save);
    return `<div class="title"><div class="logo"><div class="bigk">刃</div><h1>BLADE<br><span>DASH</span></h1><p>Tap to slash · Chain them all</p></div>
      <div class="menu"><button class="btn red" data-act="play" data-primary>${any ? `Continue · Stage ${n}` : 'Play'}</button>
      <button class="btn" data-act="stages">Stages <small>${this.totalStars()}/${STAGES * 3} ★</small></button>
      <button class="btn" data-act="wardrobe">Wardrobe <small>${coin}${this.g.save.coins}</small>${nudge ? '<b class="dot">!</b>' : ''}</button>
      <button class="btn" data-act="endless">Endless <small>best ${this.g.save.endless}</small></button>
      <div class="row2"><button class="btn small" data-act="howto">How to play</button><button class="btn small" data-act="settings">Settings</button></div></div>
      <div class="credit">a PLAYPILE game</div></div>`;
  }
  p_stages() {
    const s = this.g.save;
    let html = '';
    for (let c = 0; c < CHAPTERS.length; c++) {
      html += `<h3><span class="ck">${CHAPTERS[c].kanji}</span>${CHAPTERS[c].name}</h3><div class="grid">`;
      for (let n = c * 10 + 1; n <= c * 10 + 10; n++) {
        const st = s.stars[n] || [false, false, false], locked = n > s.unlocked;
        html += `<button class="stage ${locked ? 'locked' : ''} ${s.stars[n] ? 'done' : ''} ${n >= 40 && n % 10 === 0 ? 'bossst' : ''}" data-act="stage" data-arg="${n}" ${locked ? 'disabled' : ''}><b>${locked ? '🔒' : n}</b><span>${st.map((x) => (x ? '★' : '☆')).join('')}</span>${s.best[n] ? `<small>${s.best[n].toFixed(2)}s</small>` : ''}</button>`;
      }
      html += '</div>';
    }
    return `<div class="card wide"><header><h2>Stages</h2><span class="stars">${this.totalStars()} / ${STAGES * 3} ★</span><button class="btn x" data-act="back">✕</button></header><div class="body">${html}
      <p class="note">★ Clear it · ★ Beat the par time · ★ One unbroken chain: kill everything without landing</p></div></div>`;
  }
  p_result(d) {
    const labels = ['Cleared', `Under ${d.par.toFixed(1)}s`, 'One chain'];
    const nudge = affordable(this.g.save);
    return `<div class="card result"><div class="head">${hanko('斬', true, true)}<div><h2>${d.boss ? d.boss.name + ' falls' : `Stage ${d.n} cleared`}</h2><p>${d.time.toFixed(2)}s ${d.newBest ? '<b class="nb">NEW BEST</b>' : `· best ${d.best.toFixed(2)}s`} · chain ${d.chain}/${d.total}</p></div></div>
      <div class="starrow">${d.stars.map((on, i) => `<div class="st" data-i="${i}">${hanko('★', false)}<small>${labels[i]}</small></div>`).join('')}</div>
      <div class="coinrow">${coin}<b class="earn">+0</b><span>${d.perfect ? 'perfect chain bonus!' : ''}${d.bonus.boss ? ' boss bounty!' : ''}</span><span class="tot">${coin}<b class="have">${d.coins - d.bonusTotal}</b></span></div>
      <div class="btns"><button class="btn" data-act="restart">↺ Retry</button><button class="btn" data-act="wardrobe">Wardrobe${nudge ? '<b class="dot">!</b>' : ''}</button><button class="btn" data-act="title">Menu</button><button class="btn red" data-act="next" data-primary>Next ▶</button></div>
      <div class="autobar"><i style="animation-duration:${AUTO_NEXT}s"></i></div><p class="note">tap anywhere for the next stage</p></div>`;
  }
  p_finale(d) {
    return `<div class="card result"><div class="head">${hanko('将', true, true)}<div><h2>The Shogun has fallen</h2><p>All ${STAGES} stages cleared. ${d.time.toFixed(2)}s · ${this.totalStars()}/${STAGES * 3} ★</p></div></div>
      <div class="coinrow">${coin}<b class="earn">+0</b><span>boss bounty!</span><span class="tot">${coin}<b class="have">${d.coins - d.bonusTotal}</b></span></div>
      <p class="note">Chase three stars on every stage, dress up in the wardrobe, or see how long you last in Endless.</p>
      <div class="btns"><button class="btn" data-act="stages">Stages</button><button class="btn" data-act="wardrobe">Wardrobe</button><button class="btn red" data-act="endless" data-primary>Endless ▶</button></div></div>`;
  }
  afterResult(d) {
    d.stars && d.stars.forEach((on, i) => {
      if (!on) return;
      setTimeout(() => {
        const st = this.el && this.el.querySelector(`.st[data-i="${i}"] .hanko`);
        if (!st) return;
        st.classList.add('on', 'pop');
        this.g.audio.play('star');
      }, 200 + i * 220);
    });
    // count the coin bonus up, chiming as it goes
    const earn = this.el.querySelector('.earn'), have = this.el.querySelector('.have'), total = d.bonusTotal + d.killCoins;
    const steps = Math.min(12, Math.max(1, Math.ceil(d.bonusTotal / 5)));
    const el = this.el;
    for (let k = 1; k <= steps; k++) setTimeout(() => {
      if (this.el !== el) return;
      const add = Math.round(d.bonusTotal * k / steps);
      earn.textContent = `+${d.killCoins + add}`; have.textContent = d.coins - d.bonusTotal + add;
      this.g.audio.play('coin', 1 + k * 0.04);
    }, 150 + k * 60);
    earn.textContent = `+${d.killCoins}`;
    void total;
    for (const u of d.unlocks || []) this.toast(`<b>UNLOCKED</b> ${u.item.name} · in your wardrobe`);
    if (this.panel === 'result') this.autoT = setTimeout(() => { if (this.panel === 'result') this.act('next'); }, AUTO_NEXT * 1000);
  }
  p_endless(d) {
    for (const u of d.unlocks || []) setTimeout(() => this.toast(`<b>UNLOCKED</b> ${u.item.name} · in your wardrobe`), 50);
    return `<div class="card result"><div class="head">${hanko('戦', true, true)}<div><h2>Fallen on wave ${Math.max(1, d.wave)}</h2><p>Score <b>${d.score}</b> ${d.best ? '<b class="nb">NEW BEST</b>' : `· best ${d.top}`} · longest chain ${d.chain} · ${coin}+${d.coins}</p></div></div>
      <div class="btns"><button class="btn" data-act="title">Menu</button><button class="btn" data-act="wardrobe">Wardrobe</button><button class="btn red" data-act="endless" data-primary>↺ Again</button></div></div>`;
  }
  p_pause() {
    return `<div class="card small"><header><h2>Paused</h2></header><div class="body menu">
      <button class="btn red" data-act="resume">Resume</button><button class="btn" data-act="restart">Restart (R)</button>
      <button class="btn" data-act="wardrobe">Wardrobe <small>${coin}${this.g.save.coins}</small></button>
      ${this.g.endless ? '' : '<button class="btn" data-act="stages">Stages</button>'}<button class="btn" data-act="settings">Settings</button><button class="btn" data-act="title">Main menu</button></div></div>`;
  }
  p_settings() {
    const a = this.g.audio;
    return `<div class="card small"><header><h2>Settings</h2><button class="btn x" data-act="back">✕</button></header><div class="body">
      <label class="set">Music <input type="range" min="0" max="100" value="${Math.round(a.music * 100)}" data-set="music"></label>
      <label class="set">Sound <input type="range" min="0" max="100" value="${Math.round(a.sfx * 100)}" data-set="sfx"></label>
      <button class="btn" data-act="back">Back</button></div></div>`;
  }
  p_howto() {
    const r = (k, t) => `<div class="how"><span class="hk">${k}</span><span>${t}</span></div>`;
    return `<div class="card small"><header><h2>How to play</h2><button class="btn x" data-act="back">✕</button></header><div class="body">
      ${r('斬', '<b>Tap or click</b> anywhere to dash-slash that way. Your aim snaps onto nearby enemies.')}
      ${r('連', '<b>Every kill refills your dash.</b> Chain from enemy to enemy without landing.')}
      ${r('死', 'Enemies flash a red <b>!</b> and raise their weapon before they swing. Dash at them first, or dash clear. Arrows, gaps, spikes and fire vents are deadly too. Lanterns are harmless.')}
      ${r('盾', 'Shield guards block from the front. Hit them from behind or from above. Ninja leap between ledges.')}
      ${r('爆', 'Barrel carriers explode, taking out everyone near them.')}
      ${r('衣', 'Kills, stars and clears earn <b>coins</b>. Spend them in the <b>Wardrobe</b>.')}
      ${r('⌨', '<b>Hold Space</b> (or the 集中 button) for slow-mo while the red focus meter lasts. Keyboard dash: point with the mouse and press <b>J</b>, <b>K</b> or <b>Enter</b>, or hold arrows + J. <b>R</b> restarts, <b>Esc</b> pauses.')}
      <button class="btn red" data-act="back">Got it</button></div></div>`;
  }

  // ------------------------------------------------------------ wardrobe
  p_wardrobe() {
    if (!this.wSlot) this.wSlot = 'hat';
    this.wSel = this.g.save.equip[this.wSlot];
    return `<div class="card wide wardrobe"><header><h2>Wardrobe</h2><span class="stars wcoins">${coin}<b>${this.g.save.coins}</b></span><button class="btn x" data-act="back">${this.wardrobeFrom === 'next' ? '▶' : '✕'}</button></header>
      <div class="body wbody"><div class="wprev"><canvas width="220" height="260"></canvas><div class="wdetail"></div></div>
      <div class="wright"><div class="tabs"></div><div class="items"></div></div></div></div>`;
  }
  mountWardrobe() {
    this.wCanvas = this.el.querySelector('.wprev canvas');
    this.wScarf = null;
    this.renderWardrobe();
    let last = performance.now(), t = 0;
    const tick = (now) => {
      if (this.panel !== 'wardrobe') return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
      this.drawPreview(t, dt);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }
  trial() { const e = { ...this.g.save.equip }; e[this.wSlot] = this.wSel; return e; }
  renderWardrobe() {
    const s = this.g.save, el = this.el;
    el.querySelector('.wcoins b').textContent = s.coins;
    el.querySelector('.tabs').innerHTML = SLOTS.map((sl) => `<button class="tab ${sl.id === this.wSlot ? 'on' : ''}" data-act="slot" data-arg="${sl.id}"><b>${sl.kanji}</b>${sl.name}</button>`).join('');
    const items = el.querySelector('.items');
    items.innerHTML = '';
    for (const it of ITEMS[this.wSlot]) {
      const owned = s.owned[this.wSlot].includes(it.id), eq = s.equip[this.wSlot] === it.id;
      const b = h('button', `item ${it.id === this.wSel ? 'sel' : ''} ${eq ? 'eq' : owned ? 'own' : it.ach ? 'lock' : ''}`);
      b.dataset.act = 'pick'; b.dataset.arg = it.id;
      const cv = h('canvas'); cv.width = 84; cv.height = 84;
      b.appendChild(cv);
      b.appendChild(h('span', 'nm', it.name));
      b.appendChild(h('span', 'tag', eq ? 'equipped' : owned ? 'owned' : it.ach ? '🔒' : `${coin}${it.price}`));
      items.appendChild(b);
      const e = { ...s.equip }; e[this.wSlot] = it.id;
      this.drawThumb(cv, e);
    }
    // the selected item's action
    const it = ITEMS[this.wSlot].find((i) => i.id === this.wSel);
    const owned = s.owned[this.wSlot].includes(it.id), eq = s.equip[this.wSlot] === it.id;
    let btn;
    if (eq) btn = '<button class="btn" disabled>Equipped ✓</button>';
    else if (owned) btn = '<button class="btn red" data-act="equip">Equip</button>';
    else if (it.ach) btn = `<button class="btn" disabled>🔒 ${ACHIEVEMENTS[it.ach].label}</button>`;
    else if (s.coins >= it.price) btn = `<button class="btn red" data-act="buy">Buy ${coin}${it.price}</button>`;
    else btn = `<button class="btn" disabled>Need ${coin}${it.price - s.coins} more</button>`;
    el.querySelector('.wdetail').innerHTML = `<b>${it.name}</b>${btn}`;
  }
  buy() {
    const s = this.g.save, it = ITEMS[this.wSlot].find((i) => i.id === this.wSel);
    if (!it || it.ach || s.owned[this.wSlot].includes(it.id) || s.coins < it.price) return;
    s.coins -= it.price;
    s.owned[this.wSlot].push(it.id);
    s.equip[this.wSlot] = it.id;
    this.g.setOutfit(s.equip);
    this.g.persist();
    this.g.audio.play('buy');
    this.toast(`<b>NEW</b> ${it.name} equipped`);
    this.renderWardrobe();
  }
  drawThumb(cv, equip) {
    const x = cv.getContext('2d'), pal = CHAPTERS[0], fit = outfitOf(equip);
    x.fillStyle = '#f6eedd'; x.fillRect(0, 0, 84, 84);
    x.save();
    const head = this.wSlot === 'hat';
    if (head) { x.translate(32, 200); x.scale(1.9, 1.9); } else { x.translate(46, 78); x.scale(0.78, 0.78); }
    if (!head) { const pts = Array.from({ length: fit.scarf.len }, (_, i) => ({ x: -1 - i * 6.4, y: -70 + i * 2.2 + Math.sin(i * 0.9) * 2 })); drawScarf(x, pts, fit.scarf, pal.ink); }
    drawFigure(x, 0, 0, { pose: this.wSlot === 'blade' ? pose('slash') : pose('idle'), face: 1, ink: pal.ink, paper: pal.paper, accent: pal.accent, kind: 'player', t: 0, outfit: fit });
    x.restore();
  }
  drawPreview(t, dt) {
    const cv = this.wCanvas; if (!cv) return;
    const x = cv.getContext('2d'), pal = CHAPTERS[0], fit = outfitOf(this.trial());
    x.setTransform(1, 0, 0, 1, 0, 0);
    const g = x.createLinearGradient(0, 0, 0, 260); g.addColorStop(0, pal.paper); g.addColorStop(1, pal.paper2);
    x.fillStyle = g; x.fillRect(0, 0, 220, 260);
    x.fillStyle = pal.sun; x.globalAlpha = 0.8; x.beginPath(); x.arc(160, 70, 42, 0, 7); x.fill(); x.globalAlpha = 1;
    x.fillStyle = pal.ink; x.fillRect(0, 222, 220, 40);
    // a little loop: stand, dash across, slash
    const cyc = t % 2.4, dashing = cyc > 1.2 && cyc < 1.7;
    const P = dashing ? pose('dash') : cyc >= 1.7 && cyc < 1.95 ? pose('slash') : lerpPose(pose('idle'), pose('aim'), (Math.sin(t * 2) + 1) * 0.08);
    const px = 104, py = 222 - (dashing ? 30 : 0), sc = 1.7;
    // scarf verlet in preview space
    const n = fit.scarf.len;
    if (!this.wScarf || this.wScarf.length !== n) this.wScarf = Array.from({ length: n }, () => ({ x: px, y: py - 70 * sc, px: px, py: py - 70 * sc }));
    const sf = this.wScarf, nk = { x: px + (dashing ? 22 : 5) * sc, y: py - (dashing ? 62 : 70) * sc };
    sf[0].x = nk.x; sf[0].y = nk.y;
    for (let i = 1; i < n; i++) { const q = sf[i], vx = (q.x - q.px) * 0.9, vy = (q.y - q.py) * 0.9; q.px = q.x; q.py = q.y; q.x += vx - (dashing ? 5 : 1.6) + Math.sin(t * 7 + i) * 0.3; q.y += vy + (dashing ? 0.2 : 0.8); }
    for (let k = 0; k < 3; k++) for (let i = 1; i < n; i++) { const a = sf[i - 1], b = sf[i], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, f = (d - 7 * sc) / d; b.x -= dx * f; b.y -= dy * f; }
    x.save(); x.lineCap = 'round';
    const wide = { ...fit.scarf, w: fit.scarf.w * sc };
    drawScarf(x, sf, wide, pal.ink);
    x.restore();
    if (dashing) { x.globalAlpha = 0.25; drawFigure(x, px - 30, py + 8, { pose: P, face: 1, scale: sc, ink: pal.ink, paper: pal.paper, accent: pal.accent, kind: 'player', t, outfit: fit }); x.globalAlpha = 1; }
    drawFigure(x, px, py, { pose: P, face: 1, scale: sc, ink: pal.ink, paper: pal.paper, accent: pal.accent, kind: 'player', t, outfit: fit });
    void dt; void drawCoin;
  }
}
