// HTML menus on top of the canvas: title, bomb select, pause, results, key list, HUD.
import { CAMPAIGN, todayKey } from './levels.js';

const $ = (sel, root = document) => root.querySelector(sel);
const fmtT = (s) => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

export class UI {
  constructor(G) { this.G = G; this.root = $('#ui'); this.hud = $('#hud'); this.screen = null; }
  clear() { this.root.innerHTML = ''; this.screen = null; }
  set(html, name) {
    this.root.innerHTML = html; this.screen = name;
    this.root.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); b.blur(); this.G.audio.unlock(); this.G.audio.play('ui'); this.G.action(b.dataset.a, b.dataset.v); }));
  }

  title() {
    const s = this.G.save, next = Math.min(s.unlocked, CAMPAIGN.length) - 1;
    const total = s.stars.reduce((a, b) => a + (b || 0), 0);
    const daily = s.daily && s.daily.key === todayKey() && s.daily.best != null ? 'best ' + fmtT(s.daily.best) + ' left' : 'one new bomb a day';
    this.set(`<div class="title"><div class="tleft">
      <div class="logo"><h1>BOMB<br><span>SQUAD</span></h1><div class="tape">SNIP · FLIP · READ · DON'T PANIC</div></div>
      <div class="menu">
        <button class="btn red big" data-a="campaign" data-v="${next}">Defuse <small>bomb ${next + 1} · ${CAMPAIGN[next].name}</small></button>
        <div class="row2">
          <button class="btn" data-a="select">Bombs<small>★ ${total}/${CAMPAIGN.length * 3}</small></button>
          <button class="btn" data-a="endless">Endless<small>best ${s.endless}</small></button>
          <button class="btn" data-a="daily">Daily<small>${daily}</small></button>
        </div>
        <div class="row2"><button class="btn" data-a="keys"><small>⌨</small> Keys</button><button class="btn" data-a="settings">Sound</button></div>
      </div></div>
      <div class="credit">Click or press Enter · the manual is on your desk</div>
    </div>`, 'title');
  }

  select() {
    const s = this.G.save;
    const cells = CAMPAIGN.map((L, i) => {
      const locked = i >= s.unlocked, st = s.stars[i] || 0;
      const n = typeof L.mods === 'number' ? L.mods : L.mods.length;
      return `<button class="stage ${locked ? 'locked' : ''} ${i === s.unlocked - 1 ? 'next' : ''}" ${locked ? '' : `data-a="campaign" data-v="${i}"`}>
        <b>${i + 1}</b><span>${'★'.repeat(st)}${'☆'.repeat(3 - st)}</span><small>${locked ? 'locked' : L.name}</small><small>${n} mod${n > 1 ? 's' : ''}${L.needy ? ' + vent' : ''} · ${L.time}s</small></button>`;
    }).join('');
    this.set(`<div class="scrim"><div class="card wide"><header><h2>BOMBS</h2><button class="ibtn" style="margin-left:auto" data-a="title">✕</button></header>
      <div class="body"><div class="starkey"><span>★ defuse it</span><span>★ no strikes</span><span>★ a third of the clock left</span></div><div class="grid">${cells}</div></div></div></div>`, 'select');
  }

  pause() {
    const a = this.G.audio;
    this.set(`<div class="scrim"><div class="card"><header><h2>PAUSED</h2></header><div class="body">
      <p style="margin:0 0 12px;font-family:'Special Elite'">The bomb is covered while you're paused. No peeking.</p>
      <div class="set"><span>Music</span><input type="range" min="0" max="1" step="0.05" value="${a.music}" data-s="music"><span>Effects</span><input type="range" min="0" max="1" step="0.05" value="${a.sfx}" data-s="sfx"><span>Mute all</span><label><input type="checkbox" data-s="muted" ${a.muted ? 'checked' : ''}> silent</label></div>
      <div class="menu"><button class="btn red big" data-a="resume">Resume <kbd>Esc</kbd></button>
      <div class="row2"><button class="btn" data-a="retry">Restart <kbd>R</kbd></button><button class="btn" data-a="keys">Keys</button><button class="btn" data-a="title">Quit</button></div></div>
    </div></div></div>`, 'pause');
    this.bindSound();
  }
  settings() {
    const a = this.G.audio;
    this.set(`<div class="scrim"><div class="card"><header><h2>SOUND</h2></header><div class="body">
      <div class="set"><span>Music</span><input type="range" min="0" max="1" step="0.05" value="${a.music}" data-s="music"><span>Effects</span><input type="range" min="0" max="1" step="0.05" value="${a.sfx}" data-s="sfx"><span>Mute all</span><label><input type="checkbox" data-s="muted" ${a.muted ? 'checked' : ''}> silent</label></div>
      <button class="btn red" style="width:100%" data-a="title">Done</button></div></div></div>`, 'settings');
    this.bindSound();
  }
  bindSound() {
    this.root.querySelectorAll('[data-s]').forEach(inp => inp.addEventListener('input', () => {
      const a = this.G.audio, k = inp.dataset.s;
      a[k] = k === 'muted' ? inp.checked : +inp.value; a.apply(); this.G.saveVol();
      if (k === 'sfx') a.play('tick');
    }));
  }
  keys(back) {
    this.set(`<div class="scrim"><div class="card"><header><h2>KEYS</h2></header><div class="body"><div class="keys">
      <span class="k">Click / tap</span><span>pick a module and use it (its manual page opens)</span>
      <span class="k">Tab</span><span>next unsolved module (Shift+Tab goes back)</span>
      <span class="k">H</span><span>this list · <span class="k">M</span> show/hide manual · <span class="k">Esc</span> pause</span>
      <h4>On the picked module</h4>
      <span class="k">1 - 6</span><span>wires: cut · switches: flip · keypad: press</span>
      <span class="k">Space</span><span>button: hold, let go to release</span>
      <span class="k">Enter</span><span>switches SET · code wheel SUBMIT</span>
      <span class="k">Arrows</span><span>Simon pads (↑ red → blue ↓ green ← yellow) · steer the maze · code wheel: ←→ pick, ↑↓ spin</span>
      <span class="k">Z X C</span><span>vent valves, from anywhere</span>
      <span class="k">R</span><span>retry · <span class="k">Enter</span> next bomb</span>
    </div><button class="btn red" style="width:100%;margin-top:14px" data-a="${back || 'closekeys'}">Got it</button></div></div></div>`, 'keys');
  }

  defused(r) {
    const G = this.G;
    let body;
    if (r.mode === 'endless') {
      body = `<div class="stats"><div><b>${r.count}</b><small>defused</small></div><div><b>${fmtT(r.left)}</b><small>left</small></div></div>
        <button class="btn green big" style="width:100%" data-a="next">Next bomb <kbd>Enter</kbd></button><div class="bar"><i style="animation-duration:${r.auto}s"></i></div>`;
    } else {
      const stars = [1, 2, 3].map(i => `<i class="${i <= r.stars ? 'on' : ''}" style="animation-delay:${0.15 + i * 0.22}s">★</i>`).join('');
      body = `${r.mode === 'campaign' ? `<div class="stars">${stars}</div><div class="starkey"><span>${'✓'} defused</span><span>${r.strikes ? '✗' : '✓'} no strikes</span><span>${r.left >= r.total * 0.34 ? '✓' : '✗'} third of the clock</span></div>` : ''}
        <div class="stats"><div><b>${fmtT(r.left)}</b><small>time left</small></div><div><b>${r.strikes}</b><small>strikes</small></div>${r.best != null ? `<div><b>${fmtT(r.best)}</b><small>best left</small></div>` : ''}</div>
        ${r.unlock ? `<div class="why">New bomb unlocked: <b>${r.unlock}</b></div>` : ''}
        <div class="menu">${r.hasNext ? `<button class="btn green big" data-a="next">Next bomb <kbd>Enter</kbd></button>` : ''}
        <div class="row2"><button class="btn" data-a="retry">Again <kbd>R</kbd></button><button class="btn" data-a="${r.mode === 'campaign' ? 'select' : 'title'}">${r.mode === 'campaign' ? 'Bombs' : 'Menu'}</button></div></div>`;
    }
    this.set(`<div class="scrim clear low"><div class="card"><header class="good"><h2>DEFUSED</h2></header><div class="body">${body}</div></div></div>`, 'result');
    void G;
  }
  boom(r) {
    const stats = r.mode === 'endless'
      ? `<div class="stats"><div><b>${r.count}</b><small>defused</small></div><div><b>${r.best}</b><small>best</small></div></div>${r.newBest ? '<div class="why">New best run!</div>' : ''}`
      : '';
    this.set(`<div class="scrim clear low"><div class="card"><header class="bad"><h2>BOOM</h2></header><div class="body">
      <p style="margin:0 0 8px;font:500 18px Oswald">${r.reason}</p>
      ${r.why ? `<div class="why">${r.why}</div>` : ''}${stats}
      <div class="menu"><button class="btn red big" data-a="retry">${r.mode === 'endless' ? 'New run' : 'Retry'} <kbd>R</kbd></button>
      <div class="row2"><button class="btn" data-a="${r.mode === 'campaign' ? 'select' : 'title'}">${r.mode === 'campaign' ? 'Bombs' : 'Menu'}</button></div></div>
    </div></div></div>`, 'result');
  }

  setHud(html) { this.hud.innerHTML = html; this.hud.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); b.blur(); this.G.audio.unlock(); this.G.action(b.dataset.a); })); }
}
export { fmtT };
