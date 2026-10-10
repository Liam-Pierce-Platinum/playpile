// Menus in HTML: title, stage select, results, pause, settings, how to play.
import { CHAPTERS } from './levels.js';

const STAGES = 30;
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const hanko = (ch, on, big) => `<span class="hanko ${on ? 'on' : ''} ${big ? 'big' : ''}">${ch}</span>`;

export class UI {
  constructor(g) {
    this.g = g;
    this.root = document.getElementById('ui');
    this.el = null;
    this.panel = null;
    this.pauseBtn = h('button', 'pausebtn', 'II');
    this.pauseBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (this.g.mode === 'play' && !this.open) { this.g.audio.play('click'); this.show('pause'); } });
    this.root.appendChild(this.pauseBtn);
    // hold-to-slow button for touch screens (the keyboard uses Space)
    this.focusBtn = h('button', 'focusbtn', '<b>集中</b><span>hold: slow-mo</span>');
    const on = (e) => { e.preventDefault(); e.stopPropagation(); this.g.audio.unlock(); this.g.setFocus(true); this.focusBtn.classList.add('down'); };
    const off = () => { this.g.setFocus(false); this.focusBtn.classList.remove('down'); };
    this.focusBtn.addEventListener('pointerdown', on);
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) this.focusBtn.addEventListener(ev, off);
    this.root.appendChild(this.focusBtn);
    this.hud(false);
  }
  get open() { return !!this.el; }
  hud(on) { this.pauseBtn.style.display = on ? '' : 'none'; this.focusBtn.style.display = on ? '' : 'none'; }
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
    el.addEventListener('input', (e) => { const k = e.target.dataset.set; if (k) { this.g.audio[k] = +e.target.value / 100; this.g.save[k] = this.g.audio[k]; this.g.audio.apply(); this.g.persist(); } });
    this.root.appendChild(el);
    if (kind === 'result') this.animateStars(data);
  }
  back() {
    if (this.g.mode === 'title') this.show('title');
    else if (this.panel === 'settings' || this.panel === 'howto' || this.panel === 'stages') this.show(this.g.mode === 'play' ? 'pause' : 'title');
    else this.close();
  }
  primary() { const b = this.el && this.el.querySelector('[data-primary]'); if (b) b.click(); }
  act(a, arg) {
    const g = this.g;
    switch (a) {
      case 'play': g.startStage(Math.min(STAGES, this.nextStage())); break;
      case 'stage': g.startStage(+arg); break;
      case 'stages': this.show('stages'); break;
      case 'endless': g.startEndless(); break;
      case 'howto': this.show('howto'); break;
      case 'settings': this.show('settings'); break;
      case 'back': this.back(); break;
      case 'resume': this.close(); break;
      case 'restart': g.restart(); break;
      case 'next': g.startStage(Math.min(STAGES, g.stageN + 1)); break;
      case 'title': g.mode = 'title'; this.hud(false); this.show('title'); break;
    }
  }
  nextStage() {
    const s = this.g.save;
    for (let n = 1; n <= STAGES; n++) if (!s.stars[n]) return n;
    return STAGES;
  }
  totalStars() { return Object.values(this.g.save.stars).reduce((a, st) => a + st.filter(Boolean).length, 0); }

  p_title() {
    const n = this.nextStage(), any = Object.keys(this.g.save.stars).length > 0;
    return `<div class="title"><div class="logo"><div class="bigk">刃</div><h1>BLADE<br><span>DASH</span></h1><p>Tap to slash · Chain them all</p></div>
      <div class="menu"><button class="btn red" data-act="play" data-primary>${any ? `Continue · Stage ${n}` : 'Play'}</button>
      <button class="btn" data-act="stages">Stages <small>${this.totalStars()}/90 ★</small></button>
      <button class="btn" data-act="endless">Endless <small>best ${this.g.save.endless}</small></button>
      <div class="row2"><button class="btn small" data-act="howto">How to play</button><button class="btn small" data-act="settings">Settings</button></div></div>
      <div class="credit">a PLAYPILE game</div></div>`;
  }
  p_stages() {
    const s = this.g.save;
    let html = '';
    for (let c = 0; c < 3; c++) {
      html += `<h3><span class="ck">${CHAPTERS[c].kanji}</span>${CHAPTERS[c].name}</h3><div class="grid">`;
      for (let n = c * 10 + 1; n <= c * 10 + 10; n++) {
        const st = s.stars[n] || [false, false, false], locked = n > s.unlocked;
        html += `<button class="stage ${locked ? 'locked' : ''} ${s.stars[n] ? 'done' : ''}" data-act="stage" data-arg="${n}" ${locked ? 'disabled' : ''}><b>${locked ? '🔒' : n}</b><span>${st.map((x) => (x ? '★' : '☆')).join('')}</span>${s.best[n] ? `<small>${s.best[n].toFixed(2)}s</small>` : ''}</button>`;
      }
      html += '</div>';
    }
    return `<div class="card wide"><header><h2>Stages</h2><span class="stars">${this.totalStars()} / 90 ★</span><button class="btn x" data-act="back">✕</button></header><div class="body">${html}
      <p class="note">★ Clear it · ★ Beat the par time · ★ One unbroken chain: kill everything without landing</p></div></div>`;
  }
  p_result(d) {
    const labels = ['Cleared', `Under ${d.par.toFixed(1)}s`, 'One chain'];
    const last = d.n >= STAGES;
    return `<div class="card result"><div class="head">${hanko('斬', true, true)}<div><h2>Stage ${d.n} cleared</h2><p>${d.time.toFixed(2)}s ${d.newBest ? '<b class="nb">NEW BEST</b>' : `· best ${d.best.toFixed(2)}s`} · chain ${d.chain}/${d.total}</p></div></div>
      <div class="starrow">${d.stars.map((on, i) => `<div class="st" data-i="${i}">${hanko('★', false)}<small>${labels[i]}</small></div>`).join('')}</div>
      <div class="btns"><button class="btn" data-act="restart">↺ Retry</button><button class="btn" data-act="stages">Stages</button>${last ? '<button class="btn red" data-act="title" data-primary>Finish</button>' : '<button class="btn red" data-act="next" data-primary>Next ▶</button>'}</div>
      <p class="note">${d.stars[2] ? 'Perfect chain! 連' : d.stars[1] ? 'Try to chain every enemy without landing for the third star.' : 'Faster! Chain kills to skip the walking.'}  ·  Space for next</p></div>`;
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
  p_endless(d) {
    return `<div class="card result"><div class="head">${hanko('戦', true, true)}<div><h2>Fallen on wave ${Math.max(1, d.wave)}</h2><p>Score <b>${d.score}</b> ${d.best ? '<b class="nb">NEW BEST</b>' : `· best ${d.top}`} · longest chain ${d.chain}</p></div></div>
      <div class="btns"><button class="btn" data-act="title">Title</button><button class="btn red" data-act="endless" data-primary>↺ Again</button></div></div>`;
  }
  p_pause() {
    return `<div class="card small"><header><h2>Paused</h2></header><div class="body menu">
      <button class="btn red" data-act="resume">Resume</button><button class="btn" data-act="restart">Restart (R)</button>
      ${this.g.endless ? '' : '<button class="btn" data-act="stages">Stages</button>'}<button class="btn" data-act="settings">Settings</button><button class="btn" data-act="title">Quit to title</button></div></div>`;
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
      ${r('死', 'Enemies flash a red <b>!</b> and raise their weapon before they swing. Dash at them first, or dash clear. Arrows, gaps and spikes are deadly too. Lanterns are harmless.')}
      ${r('盾', 'Shield guards block from the front. Hit them from behind or from above.')}
      ${r('爆', 'Barrel carriers explode, taking out everyone near them.')}
      ${r('⌨', '<b>Hold Space</b> (or the 集中 button) for slow-mo while the red focus meter lasts. Kills top it up. Keyboard dash: point with the mouse and press <b>J</b>, <b>K</b> or <b>Enter</b>, or hold arrows + J. <b>R</b> restarts, <b>Esc</b> pauses.')}
      <button class="btn red" data-act="back">Got it</button></div></div>`;
  }
}
