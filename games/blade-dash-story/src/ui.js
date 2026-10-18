// Menus in HTML: title, floor select, wardrobe, results, pause, settings, how to play.
import { CHAPTERS, FLOORS, ROOF, chapterOf } from './levels.js';
import { SLOTS, item } from './outfit.js';

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const hanko = (ch, on, big) => `<span class="hanko ${on ? 'on' : ''} ${big ? 'big' : ''}">${ch}</span>`;

export class UI {
  constructor(g) {
    this.g = g;
    this.root = document.getElementById('ui');
    this.el = null;
    this.panel = null;
    this.slot = 'hat';
    this.pauseBtn = h('button', 'pausebtn', 'II');
    this.pauseBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (this.g.mode === 'play' && !this.open) { this.g.audio.play('click'); this.show('pause'); } });
    this.root.appendChild(this.pauseBtn);
    this.focusBtn = h('button', 'focusbtn', '<b>集中</b><span>hold: slow-mo</span>');
    const on = (e) => { e.preventDefault(); e.stopPropagation(); this.g.audio.unlock(); this.g.setFocus(true); this.focusBtn.classList.add('down'); };
    const off = () => { this.g.setFocus(false); this.focusBtn.classList.remove('down'); };
    this.focusBtn.addEventListener('pointerdown', on);
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) this.focusBtn.addEventListener(ev, off);
    this.root.appendChild(this.focusBtn);
    this.skipBtn = h('button', 'skipbtn', 'Skip ▶▶');
    this.skipBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation(); this.g.audio.unlock(); this.g.audio.play('click');
      if (this.g.mode === 'scene') this.g.skipScene();
      else if (this.g.mode === 'climb') this.g.climb.t = 99;
    });
    this.root.appendChild(this.skipBtn);
    this.hud(false); this.skip(false);
  }
  get open() { return !!this.el; }
  hud(on) { this.pauseBtn.style.display = on ? '' : 'none'; this.focusBtn.style.display = on ? '' : 'none'; }
  skip(on) { this.skipBtn.style.display = on ? '' : 'none'; }
  close() { if (this.el) { this.el.remove(); this.el = null; this.panel = null; } clearInterval(this.anim); }
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
    el.addEventListener('input', (e) => { const k = e.target.dataset.set; if (k) { this.g.audio[k] = +e.target.value / 100; this.g.save[k] = this.g.audio[k]; this.g.audio.apply(); this.g.persist(); } });
    this.root.appendChild(el);
    if (kind === 'result') this.animateStars(data);
    if (kind === 'wardrobe') { const cv = el.querySelector('canvas'); const draw = () => this.g.drawPreview(cv, this.g.save.outfit); draw(); this.anim = setInterval(draw, 50); }
    if (kind === 'pause') this.g.persist();
  }
  back() {
    if (this.g.mode === 'title') this.show('title');
    else if (['settings', 'howto', 'floors', 'wardrobe'].includes(this.panel)) {
      if (this.from === 'result' && this.panel === 'wardrobe') this.show('result', this.g.result);
      else this.show(this.g.mode === 'play' ? 'pause' : 'title');
    } else this.close();
  }
  primary() { const b = this.el && this.el.querySelector('[data-primary]'); if (b) b.click(); }
  act(a, arg) {
    const g = this.g;
    switch (a) {
      case 'play': g.save.seenIntro ? g.goFloor(this.nextFloor()) : g.newGame(); break;
      case 'story': g.newGame(); break;
      case 'floor': g.goFloor(+arg); break;
      case 'floors': this.show('floors'); break;
      case 'wardrobe': this.from = this.panel; this.show('wardrobe'); break;
      case 'slot': this.slot = arg; this.show('wardrobe'); break;
      case 'wear': this.wear(arg); break;
      case 'howto': this.show('howto'); break;
      case 'settings': this.show('settings'); break;
      case 'back': this.back(); break;
      case 'resume': this.close(); break;
      case 'restart': g.restartFloor(); break;
      case 'checkpoint': this.close(); g.respawn(); break;
      case 'next': this.close(); g.afterFloor(); break;
      case 'title': g.persist(); g.toTitle(); break;
    }
  }
  wear(id) {
    const g = this.g, key = this.slot + ':' + id, it = item(this.slot, id);
    if (!g.save.owned.includes(key)) {
      if (g.save.coins < it.price) {
        const b = this.el.querySelector(`[data-arg="${id}"]`);
        if (b) { b.classList.remove('nope'); void b.offsetWidth; b.classList.add('nope'); }
        g.audio.play('thud');
        return;
      }
      g.save.coins -= it.price;
      g.save.owned.push(key);
      g.audio.play('coin');
    }
    g.save.outfit[this.slot] = id;
    g.persist();
    const sc = this.el.querySelector('.body').scrollTop;
    this.show('wardrobe');
    this.el.querySelector('.body').scrollTop = sc;
  }
  nextFloor() {
    const s = this.g.save;
    for (let n = 1; n <= ROOF; n++) if (!s.stars[n]) return Math.min(n, s.unlocked);
    return ROOF;
  }
  totalStars() { return Object.values(this.g.save.stars).reduce((a, st) => a + st.filter(Boolean).length, 0); }

  p_title() {
    const s = this.g.save, n = this.nextFloor(), any = Object.keys(s.stars).length > 0;
    return `<div class="title"><div class="logo"><div class="bigk">城</div><h1>BLADE<br><span>DASH</span></h1><div class="sub">CASTLE</div><p>Break in · Cut your way up · Save the princess</p></div>
      <div class="menu"><button class="btn red" data-act="play" data-primary>${any ? `Continue · ${n >= ROOF ? 'The Roof' : 'Floor ' + n}` : 'Play'}</button>
      <button class="btn" data-act="floors">Floors <small>${this.totalStars()}/${ROOF * 3} ★</small></button>
      <button class="btn" data-act="wardrobe">Wardrobe <small>銭 ${s.coins}</small></button>
      <div class="row2"><button class="btn small" data-act="story">Story</button><button class="btn small" data-act="howto">How to play</button><button class="btn small" data-act="settings">Settings</button></div></div>
      <div class="credit">a PLAYPILE game</div></div>`;
  }
  p_floors() {
    const s = this.g.save;
    let html = '';
    for (let c = 0; c < 4; c++) {
      const list = [];
      for (let n = 1; n <= ROOF; n++) if (chapterOf(n) === c) list.push(n);
      html += `<h3><span class="ck">${CHAPTERS[c].kanji}</span>${CHAPTERS[c].name}</h3><div class="grid">`;
      for (const n of list) {
        const st = s.stars[n] || [false, false, false], locked = n > s.unlocked;
        html += `<button class="stage ${locked ? 'locked' : ''} ${s.stars[n] ? 'done' : ''}" data-act="floor" data-arg="${n}" ${locked ? 'disabled' : ''}><b>${locked ? '🔒' : n === ROOF ? '影' : n}</b><span>${st.map((x) => (x ? '★' : '☆')).join('')}</span>${s.best[n] ? `<small>${s.best[n].toFixed(2)}s</small>` : ''}</button>`;
      }
      html += '</div>';
    }
    return `<div class="card wide"><header><h2>The castle</h2><span class="stars">${this.totalStars()} / ${ROOF * 3} ★</span><button class="btn x" data-act="back">✕</button></header><div class="body">${html}
      <p class="note">★ Clear it · ★ Beat the par time · ★ No deaths on that floor. On the roof: ★ beat Kage · ★ no deaths · ★ never get parried.</p></div></div>`;
  }
  p_wardrobe() {
    const s = this.g.save, slot = SLOTS.find((q) => q.key === this.slot);
    const tabs = SLOTS.map((q) => `<button class="tab ${q.key === this.slot ? 'on' : ''}" data-act="slot" data-arg="${q.key}">${q.name}</button>`).join('');
    const items = slot.items.map((it) => {
      const owned = s.owned.includes(slot.key + ':' + it.id), worn = s.outfit[slot.key] === it.id;
      const sw = it.c ? `<i class="sw" style="background:${it.c}"></i>` : it.c === null ? '<i class="sw ink"></i>' : '';
      return `<button class="item ${worn ? 'worn' : ''} ${owned ? 'owned' : ''}" data-act="wear" data-arg="${it.id}">${sw}<b>${it.name}</b><small>${worn ? 'WORN' : owned ? 'owned' : `銭 ${it.price}`}</small></button>`;
    }).join('');
    return `<div class="card wide wardrobe"><header><h2>Wardrobe</h2><span class="stars coins">銭 ${s.coins}</span><button class="btn x" data-act="back">✕</button></header>
      <div class="body"><div class="wr"><canvas width="220" height="280"></canvas><div class="wr-r"><div class="tabs">${tabs}</div><div class="items">${items}</div></div></div>
      <p class="note">Coins (銭) come from every kill (more on a long chain), every floor you clear and new stars. What you wear is what you fight in.</p></div></div>`;
  }
  p_result(d) {
    const labels = ['Cleared', `Under ${d.par.toFixed(1)}s`, 'No deaths'];
    const next = d.n >= FLOORS ? 'The roof ▶' : 'Climb ▶';
    return `<div class="card result"><div class="head">${hanko('斬', true, true)}<div><h2>Floor ${d.n} cleared</h2><p>${d.time.toFixed(2)}s ${d.newBest ? '<b class="nb">NEW BEST</b>' : `· best ${d.best.toFixed(2)}s`} · ${d.deaths} death${d.deaths === 1 ? '' : 's'} · <b class="gold">+${d.coins} 銭</b></p></div></div>
      <div class="starrow">${d.stars.map((on, i) => `<div class="st" data-i="${i}">${hanko('★', false)}<small>${labels[i]}</small></div>`).join('')}</div>
      <div class="btns"><button class="btn" data-act="restart">↺ Retry</button><button class="btn" data-act="wardrobe">Wardrobe</button><button class="btn red" data-act="next" data-primary>${next}</button></div>
      <p class="note">${d.stars[2] && d.stars[1] ? 'Flawless. 完璧' : d.stars[1] ? 'Clear it without dying for the third star.' : 'Faster! Chain kills to skip the walking.'}  ·  Space to climb</p></div>`;
  }
  animateStars(d) {
    d.stars.forEach((on, i) => {
      if (!on) return;
      setTimeout(() => {
        const st = this.el && this.el.querySelector(`.st[data-i="${i}"] .hanko`);
        if (!st) return;
        st.classList.add('on', 'pop');
        this.g.audio.play('star');
      }, 350 + i * 280);
    });
  }
  p_pause() {
    return `<div class="card small"><header><h2>Paused</h2></header><div class="body menu">
      <button class="btn red" data-act="resume">Resume</button><button class="btn" data-act="checkpoint">Back to room start (R)</button><button class="btn" data-act="restart">Restart ${this.g.boss ? 'the fight' : 'floor'}</button>
      <button class="btn" data-act="wardrobe">Wardrobe</button><button class="btn" data-act="settings">Settings</button><button class="btn" data-act="title">Quit to title</button></div></div>`;
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
      ${r('封', 'Each room is <b>sealed</b> until its guards are down. Then dash through the paper door. The stairs up are at the far end.')}
      ${r('死', 'Enemies flash a red <b>!</b> before they swing. Arrows, pits and spring spikes (they flash red first) kill too. Die and you restart the room you are in.')}
      ${r('影', '<b>Kage</b> on the roof dashes too. Red line, then he goes. <b>Dash to dodge</b>, then dash at him while he staggers (隙). Hit him any other time and he parries.')}
      ${r('⌨', '<b>Hold Space</b> (or 集中) for slow-mo. Keyboard dash: mouse + <b>J</b>/<b>K</b>/<b>Enter</b>, or arrows + J. <b>R</b> restarts the room, <b>Esc</b> pauses.')}
      <button class="btn red" data-act="back">Got it</button></div></div>`;
  }
}
