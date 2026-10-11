// HTML menus over the canvas: title, worlds, shop, missions, pause, results.
import { WORLDS, levelInfo, dailyInfo } from './levels.js';
import { SHOP, ARROWS } from './cosmetics.js';
import { activeMissions } from './meta.js';
import { hexToRgb, dayKey } from './util.js';
import { START_TIER } from './game.js';

const $ = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const STAR = '<svg viewBox="0 0 24 24" class="star"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z"/></svg>';
const SPARK = '<svg viewBox="0 0 24 24" class="spk"><path d="M12 1l2.6 8.4L23 12l-8.4 2.6L12 23l-2.6-8.4L1 12l8.4-2.6z"/></svg>';
const fmt = (n) => Math.round(n).toLocaleString('en-US');

export class UI {
  constructor(app) {
    this.app = app;
    this.root = document.getElementById('ui');
    this.panel = null;
    this.tab = 'arrow';
    this.practice = false;
    this.toasts = $('<div class="toasts"></div>');
    this.pauseBtn = $('<button class="pausebtn" aria-label="Pause"><i></i><i></i></button>');
    this.pauseBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
    this.pauseBtn.addEventListener('click', (e) => { e.stopPropagation(); this.app.pause(); });
    document.body.append(this.toasts, this.pauseBtn);
    this.setHud(false);
  }
  setHud(on) { this.pauseBtn.style.display = on ? 'flex' : 'none'; }
  get open() { return !!this.panel; }
  // the pause button hides while any card is open (it was showing through card headers on phones)
  close() { this.root.innerHTML = ''; this.panel = null; if (this.app.state === 'play') this.setHud(true); }
  click() { this.app.audio.play('click'); }
  mount(name, el, cls = '') {
    this.root.innerHTML = '';
    this.setHud(false);
    const scrim = $(`<div class="scrim ${cls}"></div>`);
    scrim.append(el);
    this.root.append(scrim);
    this.panel = name;
    el.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); this.click(); this.act(b.dataset.a, b.dataset); }));
    const first = el.querySelector('.btn.primary'); if (first && matchMedia('(pointer: fine)').matches) first.focus({ preventScroll: true });
  }
  act(a, d) {
    const app = this.app;
    switch (a) {
      case 'run': app.startRun(); break;
      case 'run3': app.startRun(START_TIER); break;
      case 'daily': app.startDaily(); break;
      case 'worlds': this.worlds(); break;
      case 'shop': this.shop(); break;
      case 'missions': this.missions(); break;
      case 'settings': this.settings(); break;
      case 'title': app.toTitle(); break;
      case 'back': this.title(); break;
      case 'level': app.startLevel(+d.w, +d.l, this.practice); break;
      case 'practice': this.practice = !this.practice; this.worlds(); break;
      case 'tab': this.tab = d.t; this.shop(); break;
      case 'item': app.shopItem(d.k, d.id); this.shop(); break;
      case 'resume': app.resume(); break;
      case 'restart': app.restartFromMenu(); break;
      case 'next': app.nextLevel(); break;
      case 'retry': app.retryLevel(false); break;
      case 'retryPractice': app.retryLevel(true); break;
      case 'real': app.retryLevel(false); break;
      case 'copy': app.copyShare(); break;
      case 'shake': app.save.set.shake = !app.save.set.shake; app.applySettings(); this.app.paused ? this.pause() : this.settings(); break;
    }
  }

  // ---------------------------------------------------------------- title
  title() {
    const s = this.app.save, di = dailyInfo(), dd = s.daily[di.key];
    const stars = Object.values(s.levels).reduce((n, l) => n + l.stars.filter(Boolean).length, 0);
    const ready = activeMissions(s).length;
    let coarse = false; try { coarse = matchMedia('(pointer: coarse)').matches; } catch (e) { /* none */ }
    const tier3 = this.app.tier3Unlocked();
    const top = (s.run.top || []).slice(0, 5);
    const today = dayKey();
    const el = $(`<div class="title">
      <div class="sparks">${SPARK}<b>${fmt(s.sparks)}</b></div>
      <div class="logo"><h1>GRAZE</h1><p>hold to climb &middot; let go to dive<br>scrape the edges</p></div>
      <div class="menu">
        <div class="playrow ${tier3 ? 'two' : ''}">
          <button class="btn primary big" data-a="run"><span class="lbl">PLAY</span><small>${s.run.best ? 'BEST ' + fmt(s.run.best) : 'ENDLESS RUN'}</small></button>
          ${tier3 ? `<button class="btn tier" data-a="run3"><span class="lbl">TIER ${START_TIER + 1}</span><small>START FAST</small></button>` : ''}
        </div>
        ${top.length ? `<div class="top5"><b>TOP RUNS</b>${top.map((r, i) => `<span><i>${i + 1}</i>${fmt(r.s)}<em>T${r.t}${r.d === today ? ' · today' : ''}</em></span>`).join('')}</div>` : ''}
        <div class="row2">
          <button class="btn daily" data-a="daily"><span class="lbl">DAILY #${di.num}</span><small>${dd ? (dd.finished ? 'CLEARED &middot; ' + fmt(dd.bestScore) : 'BEST ' + dd.best + '%') : '90 s &middot; same for everyone'}</small></button>
          <button class="btn" data-a="worlds"><span class="lbl">WORLDS</span><small>${STAR} ${stars} / 72</small></button>
        </div>
        <div class="row3">
          <button class="btn ghost" data-a="shop">SHOP</button>
          <button class="btn ghost" data-a="missions">MISSIONS <em>${ready}</em></button>
          <button class="btn ghost" data-a="settings">SOUND</button>
        </div>
      </div>
      <div class="hint">${coarse ? 'TAP AND HOLD anywhere to climb' : 'SPACE / CLICK &mdash; hold to climb'}</div>
      ${coarse ? '<div class="rotate"><i></i>Turn your phone sideways for a wider view</div>' : ''}
    </div>`);
    this.mount('title', el, 'clear');
  }

  worlds() {
    const s = this.app.save;
    const rows = WORLDS.map((W, w) => {
      const unlocked = this.app.worldUnlocked(w);
      const tiles = W.levels.map((L, l) => {
        const rec = s.levels[`${w}-${l}`];
        const open = unlocked && this.app.levelUnlocked(w, l);
        const st = rec ? rec.stars : [0, 0, 0];
        const info = levelInfo(w, l);
        return `<button class="lvl ${open ? '' : 'locked'} ${rec && rec.stars[0] ? 'done' : ''}" ${open ? `data-a="level" data-w="${w}" data-l="${l}"` : 'disabled'} title="${L.name} (${info.secs}s, ${info.diff.toLowerCase()})" style="--dc:${info.diffCol}">
          <b>${w + 1}-${l + 1}</b><span class="st">${st.map((x) => `<i class="${x ? 'on' : ''}">${STAR}</i>`).join('')}</span><small>${rec ? (rec.stars[0] ? info.secs + 's' : rec.best + '%') : open ? info.secs + 's' : '&#128274;'}</small><i class="diff"></i></button>`;
      }).join('');
      const rgb = hexToRgb(W.accent).join(',');
      return `<div class="world ${unlocked ? '' : 'locked'}" style="--wc:${W.accent};--wcr:${rgb}"><div class="wname"><b>${w + 1}</b><span>${W.name}<small>${unlocked ? W.blurb : 'Clear any ' + WORLDS[w - 1].name + ' level to unlock'}</small></span></div><div class="lvls">${tiles}</div></div>`;
    }).join('');
    const el = $(`<div class="card wide"><header><h2>WORLDS</h2>
      <button class="toggle ${this.practice ? 'on' : ''}" data-a="practice"><i></i>PRACTICE</button>
      <button class="btn x" data-a="back" aria-label="Back">&#10005;</button></header>
      <div class="body">${rows}<p class="note"><span class="dk"><i style="background:#5dff9b"></i>easy <i style="background:#ffb12a"></i>medium <i style="background:#ff5a5a"></i>hard <i style="background:#ff3df2"></i>insane</span> &middot; Stars: finish &middot; 30+ grazes &middot; no phasing. Practice respawns you at green checkpoints and saves nothing.</p></div></div>`);
    this.mount('worlds', el);
  }

  shop() {
    const s = this.app.save, k = this.tab, list = SHOP[k];
    const tiles = list.map((it) => {
      const own = s.owned[k].includes(it.id), eq = s.eq[k] === it.id;
      const can = s.sparks >= it.price;
      return `<button class="item ${eq ? 'eq' : ''} ${own ? 'own' : ''} ${!own && !can ? 'poor' : ''}" data-a="item" data-k="${k}" data-id="${it.id}">
        <canvas width="160" height="80" data-prev="${k}:${it.id}"></canvas>
        <b>${it.name}</b><small>${eq ? 'EQUIPPED' : own ? 'EQUIP' : SPARK + ' ' + fmt(it.price)}</small></button>`;
    }).join('');
    const el = $(`<div class="card wide"><header><h2>SHOP</h2><div class="sparks inline">${SPARK}<b>${fmt(s.sparks)}</b></div>
      <button class="btn x" data-a="back" aria-label="Back">&#10005;</button></header>
      <div class="body"><div class="tabs">
        <button class="tab ${k === 'arrow' ? 'on' : ''}" data-a="tab" data-t="arrow">ARROWS</button>
        <button class="tab ${k === 'trail' ? 'on' : ''}" data-a="tab" data-t="trail">TRAILS</button>
        <button class="tab ${k === 'death' ? 'on' : ''}" data-a="tab" data-t="death">DEATHS</button></div>
        <div class="items">${tiles}</div>
        <p class="note">Every graze earns 1 Spark. Missions pay extra. Everything here is cosmetic.</p></div></div>`);
    this.mount('shop', el);
    el.querySelectorAll('canvas[data-prev]').forEach((cv) => this.app.drawPreview(cv, ...cv.dataset.prev.split(':')));
  }

  missions() {
    const ms = activeMissions(this.app.save);
    const el = $(`<div class="card"><header><h2>MISSIONS</h2><button class="btn x" data-a="back" aria-label="Back">&#10005;</button></header>
      <div class="body">${ms.map((m) => `<div class="mission"><div class="mt"><b>${m.text}</b><span>${SPARK} ${m.reward}</span></div>
        <div class="bar"><i style="width:${(m.prog / m.goal) * 100}%"></i></div><small>${fmt(m.prog)} / ${fmt(m.goal)}</small></div>`).join('')}
        <p class="note">Missions update while you play. A finished mission is replaced by a new one.</p></div></div>`);
    this.mount('missions', el);
  }

  sliders(el) {
    const s = this.app.save.set;
    el.querySelectorAll('input[type=range]').forEach((r) => {
      r.value = s[r.name];
      r.addEventListener('input', () => { s[r.name] = +r.value; this.app.applySettings(); });
      r.addEventListener('change', () => { this.app.persist(); if (r.name === 'sfx') this.app.audio.play('graze', 4); });
    });
  }
  setRows() {
    const s = this.app.save.set;
    return `<label class="set">MUSIC<input type="range" name="music" min="0" max="1" step="0.05"></label>
      <label class="set">EFFECTS<input type="range" name="sfx" min="0" max="1" step="0.05"></label>
      <div class="set">SCREEN SHAKE<button class="toggle ${s.shake ? 'on' : ''}" data-a="shake"><i></i>${s.shake ? 'ON' : 'OFF'}</button></div>`;
  }
  settings() {
    const el = $(`<div class="card small"><header><h2>SOUND</h2><button class="btn x" data-a="back" aria-label="Back">&#10005;</button></header>
      <div class="body">${this.setRows()}</div></div>`);
    this.mount('settings', el); this.sliders(el);
  }
  pause() {
    const app = this.app, g = app.game;
    const label = g.mode === 'run' ? 'RUN' : g.mode === 'daily' ? 'DAILY #' + g.daily.num : `${g.spec.w + 1}-${g.spec.l + 1} ${WORLDS[g.spec.w].levels[g.spec.l].name}`;
    const share = g.mode === 'daily' && app.save.daily[g.daily.key];
    const el = $(`<div class="card small"><header><h2>PAUSED</h2><span class="sub">${label}${g.practice ? ' &middot; practice' : ''}</span></header>
      <div class="body"><div class="menu">
        <button class="btn primary" data-a="resume">RESUME</button>
        <div class="row2"><button class="btn" data-a="restart">RESTART</button><button class="btn" data-a="title">QUIT</button></div>
        ${share ? '<button class="btn" data-a="copy">COPY DAILY RESULT</button>' : ''}
      </div>${this.setRows()}<p class="note">Esc resumes. R or Enter restarts instantly while playing.</p></div></div>`);
    this.mount('pause', el); this.sliders(el);
  }

  levelResult(r) {
    const W = WORLDS[r.w], L = W.levels[r.l];
    const labels = ['FINISH', '30+ GRAZES', 'NO PHASE'];
    const hasNext = r.l < 5 || r.w < 3;
    const el = $(`<div class="card result" style="--wc:${W.accent}"><header><h2>${r.practice ? 'PRACTICE CLEAR' : 'LEVEL CLEAR'}</h2><span class="sub">${r.w + 1}-${r.l + 1} ${L.name}</span></header>
      <div class="body">
        ${r.practice ? '' : `<div class="bigstars">${r.got.map((g, i) => `<div class="bs ${g ? 'on' : ''} ${r.fresh[i] ? 'pop' : ''}" style="animation-delay:${0.15 + i * 0.18}s">${STAR}<small>${labels[i]}</small></div>`).join('')}</div>`}
        <div class="stats"><div><b>${fmt(r.score)}</b><small>SCORE</small></div><div><b>${r.grazes}</b><small>GRAZES</small></div><div><b>${r.phases}</b><small>PHASES</small></div><div><b>${r.attempts}</b><small>ATTEMPTS</small></div></div>
        <div class="menu">
          ${r.practice ? '<button class="btn primary" data-a="real">PLAY FOR REAL</button>' : hasNext && this.app.levelUnlockedAfter(r) ? '<button class="btn primary" data-a="next">NEXT LEVEL</button>' : ''}
          <div class="row2"><button class="btn ${r.practice || !(hasNext && this.app.levelUnlockedAfter(r)) ? 'primary' : ''}" data-a="${r.practice ? 'retryPractice' : 'retry'}">RETRY</button><button class="btn" data-a="worlds">WORLDS</button></div>
        </div></div></div>`);
    this.mount('result', el);
  }

  dailyResult(r) {
    // the last 7 days' strips (today's is the share line above)
    const dl = this.app.save.daily;
    const hist = Object.keys(dl).filter((k) => k !== r.key && dl[k].strip).sort().reverse().slice(0, 7);
    const histHtml = hist.length ? `<div class="hist">${hist.map((k) => `<div><small>${k.slice(5)}</small><span>${dl[k].strip}</span><b>${dl[k].finished ? fmt(dl[k].bestScore) : dl[k].best + '%'}</b></div>`).join('')}</div>` : '';
    const el = $(`<div class="card result"><header><h2>DAILY CLEAR</h2><span class="sub">#${r.num} &middot; ${r.key}</span></header>
      <div class="body">
        <div class="stats"><div><b>${fmt(r.score)}</b><small>SCORE</small></div><div><b>${r.grazes}</b><small>GRAZES</small></div><div><b>${r.phases}</b><small>PHASES</small></div><div><b>${r.attempts}</b><small>TRIES</small></div></div>
        <pre class="share">${r.share}</pre>${histHtml}
        <div class="menu"><button class="btn primary" data-a="copy">COPY RESULT</button>
        <div class="row2"><button class="btn" data-a="restart">PLAY AGAIN</button><button class="btn" data-a="title">MENU</button></div></div>
        <p class="note">A new course every day at midnight. Your best score today is what you share.</p></div></div>`);
    this.mount('result', el);
  }

  toast(text, sub) {
    const t = $(`<div class="toast"><b>${text}</b>${sub ? `<span>${sub}</span>` : ''}</div>`);
    this.toasts.append(t);
    setTimeout(() => t.classList.add('out'), 2600);
    setTimeout(() => t.remove(), 3100);
  }
  sparkIcon() { return SPARK; }
}
export { ARROWS };
