// HTML menus: title, stages, new-enemy brief, pause (with settings), how to play, results.
import { STAGES, INFO } from './stages.js';
import * as D from './draw.js';

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const starSvg = (on, big) => `<svg class="star ${on ? 'on' : ''} ${big ? 'big' : ''}" viewBox="-12 -12 24 24"><path d="M0,-10 L2.6,-3.4 9.5,-3.1 4.1,1.3 5.9,8.1 0,4.2 -5.9,8.1 -4.1,1.3 -9.5,-3.1 -2.6,-3.4Z"/></svg>`;
const shieldSvg = `<svg class="emblem" viewBox="-50 -50 100 100"><circle r="46" fill="#c9d3e0" stroke="#1a1424" stroke-width="6"/><circle r="35" fill="#2b4fae" stroke="#1a1424" stroke-width="4"/><path d="M0,-26 L6,-6 26,0 6,6 0,26 -6,6 -26,0 -6,-6Z" fill="#ffd23f" stroke="#1a1424" stroke-width="3" stroke-linejoin="round"/></svg>`;

export class UI {
  constructor(g) {
    this.g = g;
    this.root = document.getElementById('ui');
    this.el = null; this.panel = null;
    this.pauseBtn = h('button', 'pausebtn', '<i></i><i></i>');
    this.pauseBtn.setAttribute('aria-label', 'Pause');
    this.pauseBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); this.g.audio.unlock(); this.g.pause(); });
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
    el.addEventListener('input', (e) => {
      const k = e.target.dataset.set; if (!k) return;
      const A = this.g.audio, S = this.g.save;
      A[k] = +e.target.value / 100; S[k] = A[k]; A.apply(); this.g.persist();
    });
    this.root.appendChild(el);
    if (kind === 'result') this.animateStars(data);
    if (kind === 'brief') this.drawBrief(data);
  }
  back() {
    if (this.panel === 'pause') { this.g.resume(); return; }
    if (this.g.mode === 'brief') { this.g.toTitle(); return; }
    if (this.panel === 'title') return;
    if (this.g.mode === 'results') { this.g.toTitle(); return; }
    this.show('title');
  }
  primary() { const b = this.el && this.el.querySelector('[data-primary]'); if (b) b.click(); }
  act(a, arg) {
    const g = this.g, S = g.save, A = g.audio;
    switch (a) {
      case 'play': g.startStage(this.nextStage() - 1); break;
      case 'stage': g.startStage(+arg); break;
      case 'stages': if (g.mode === 'paused' || g.mode === 'results') g.toTitle(); this.show('stages'); break;
      case 'endless': if (S.unlocked >= 5) g.startEndless(); break;
      case 'howto': this.show('howto'); break;
      case 'settings': this.show('settings'); break;
      case 'back': this.back(); break;
      case 'resume': g.resume(); break;
      case 'restart': this.close(); g.restart(); break;
      case 'next': g.startStage(Math.min(STAGES.length - 1, g.stage + 1)); break;
      case 'title': g.toTitle(); break;
      case 'fight': g.startStage(g.briefStage, true); break;
      case 'toggle': A[arg] = !A[arg]; S[arg] = A[arg]; A.apply(); g.persist(); this.refresh(); break;
      case 'touch': S.touch = arg; g.persist(); this.refresh(); break;
      case 'offset': S.offset = Math.max(-150, Math.min(150, (S.offset || 0) + +arg)); A.offset = S.offset / 1000; g.persist(); this.refresh(); break;
    }
  }
  refresh() { const k = this.panel; const sc = this.el && this.el.querySelector('.body'); const top = sc ? sc.scrollTop : 0; this.show(k, this.data); const sc2 = this.el.querySelector('.body'); if (sc2) sc2.scrollTop = top; }
  nextStage() { const s = this.g.save; for (let n = 1; n <= STAGES.length; n++) if (!(s.stars[n] && s.stars[n][0])) return Math.min(n, s.unlocked); return STAGES.length; }
  totalStars() { return Object.values(this.g.save.stars).reduce((a, st) => a + st.filter(Boolean).length, 0); }

  p_title() {
    const S = this.g.save, n = this.nextStage(), any = Object.keys(S.stars).length > 0, endless = S.unlocked >= 5;
    return `<div class="title"><div class="logo">${shieldSvg}<h1>PARRY</h1><p>Block to the beat. Perfect it, send it back.</p></div>
      <div class="bottom"><div class="menu"><button class="btn gold" data-act="play" data-primary>${any ? `Continue <small>stage ${n}</small>` : 'Play'}</button>
      <div class="row2"><button class="btn" data-act="stages">Stages <small>${this.totalStars()}/${STAGES.length * 3}</small></button>
      <button class="btn ${endless ? '' : 'locked'}" data-act="endless" ${endless ? '' : 'disabled'}>Endless <small>${endless ? 'best ' + (S.endlessBest || 0).toLocaleString() : 'clear stage 4'}</small></button></div>
      <div class="row2"><button class="btn small" data-act="howto">How to play</button><button class="btn small" data-act="settings">Settings</button></div></div>
      <div class="hint">${matchMedia('(pointer: coarse)').matches ? 'Tap the side an attack comes from' : 'Arrow keys or WASD to block'}</div></div></div>`;
  }
  p_stages() {
    const S = this.g.save;
    const cards = STAGES.map((st, i) => {
      const n = i + 1, locked = n > S.unlocked, stars = S.stars[n] || [];
      return `<button class="stage bg-${st.bg} ${locked ? 'locked' : ''}" data-act="stage" data-arg="${i}" ${locked ? 'disabled' : ''}>
        <b>${n}</b><span class="nm">${st.name}</span><span class="sr">${[0, 1, 2].map((k) => starSvg(stars[k])).join('')}</span><small>${locked ? 'locked' : S.best[n] ? 'best ' + S.best[n].toLocaleString() : st.boss.name}</small></button>`;
    }).join('');
    const endless = S.unlocked >= 5;
    return `<div class="card wide"><header><h2>Stages</h2><span class="tot">${this.totalStars()} / ${STAGES.length * 3}</span><button class="btn x" data-act="back">&times;</button></header>
      <div class="body"><div class="grid">${cards}</div>
      <button class="btn endlessbtn ${endless ? '' : 'locked'}" data-act="endless" ${endless ? '' : 'disabled'}>Endless mode <small>${endless ? 'best ' + (S.endlessBest || 0).toLocaleString() : 'clear stage 4 to unlock'}</small></button>
      <p class="note">Stars: survive the 60 seconds · beat the score target · perfect-parry every boss attack.</p></div></div>`;
  }
  p_brief(d) {
    const st = STAGES[d.si];
    const items = d.types.map((k, i) => `<div class="newfoe"><canvas data-foe="${k}" width="150" height="150"></canvas><div><h3>${INFO[k][0]}</h3><p>${INFO[k][1]}</p></div></div>`).join('');
    return `<div class="card"><header><h2>Stage ${d.si + 1} · ${st.name}</h2></header><div class="body"><div class="tag">New enemy</div>${items}
      <button class="btn gold block" data-act="fight" data-primary>Fight! <small>any key</small></button></div></div>`;
  }
  drawBrief(d) {
    for (const cv of this.el.querySelectorAll('canvas[data-foe]')) {
      const k = cv.dataset.foe, c = cv.getContext('2d'), dpr = Math.min(2, devicePixelRatio || 1);
      cv.width = 150 * dpr; cv.height = 150 * dpr; c.scale(dpr, dpr); c.lineJoin = 'round'; c.lineCap = 'round';
      c.fillStyle = '#2b2440'; c.beginPath(); c.arc(75, 75, 72, 0, Math.PI * 2); c.fill();
      const kinds = { arrow: 'archer', sword: 'swords', axe: 'axeman', fire: 'mage', feint: 'rogue', double: 'ninja', boulder: 'ogre', bomb: 'bomber' };
      D.figure(c, { x: 58, y: 128, s: 1.25, kind: kinds[k], view: 'side', aim: 0, raise: k === 'feint' || k === 'sword' ? 1 : 0.7, holdBomb: true, t: 0 });
      const col = k === 'bomb' ? '#ff3b5c' : k === 'boulder' ? '#d58bff' : k === 'feint' ? '#7df9ff' : '#fff3a0';
      D.ring(c, 120, 52, 20, col, 4, 1, k === 'feint' ? [6, 5] : null);
      if (k === 'bomb') { c.strokeStyle = col; c.lineWidth = 4; c.beginPath(); c.moveTo(112, 44); c.lineTo(128, 60); c.moveTo(128, 44); c.lineTo(112, 60); c.stroke(); }
      if (k === 'boulder') { c.fillStyle = col; c.font = '16px "Lilita One"'; c.textAlign = 'center'; c.fillText('HOLD', 120, 22); }
    }
  }
  p_pause() {
    return `<div class="card small"><header><h2>Paused</h2><button class="btn x" data-act="resume">&times;</button></header><div class="body">
      <div class="menu"><button class="btn gold" data-act="resume" data-primary>Resume</button>
      <div class="row2"><button class="btn small" data-act="restart">Restart <small>R</small></button><button class="btn small" data-act="title">Quit</button></div></div>
      ${this.settingsRows()}</div></div>`;
  }
  p_settings() {
    return `<div class="card small"><header><h2>Settings</h2><button class="btn x" data-act="back">&times;</button></header><div class="body">${this.settingsRows()}
      <button class="btn gold block" data-act="back" data-primary>Done</button></div></div>`;
  }
  settingsRows() {
    const A = this.g.audio, S = this.g.save;
    const tg = (k) => `<button class="tgl ${A[k] ? 'on' : ''}" data-act="toggle" data-arg="${k}">${A[k] ? 'ON' : 'OFF'}</button>`;
    return `<div class="set"><span>Music</span><div>${tg('musicOn')}<input type="range" min="0" max="100" value="${Math.round(A.musicVol * 100)}" data-set="musicVol"></div></div>
      <div class="set"><span>Sound FX</span><div>${tg('sfxOn')}<input type="range" min="0" max="100" value="${Math.round(A.sfxVol * 100)}" data-set="sfxVol"></div></div>
      <div class="set"><span>Touch</span><div class="seg"><button class="${S.touch !== 'swipe' ? 'on' : ''}" data-act="touch" data-arg="tap">Tap side</button><button class="${S.touch === 'swipe' ? 'on' : ''}" data-act="touch" data-arg="swipe">Swipe</button></div></div>
      <div class="set"><span>Audio offset</span><div class="seg"><button data-act="offset" data-arg="-10">-</button><b>${S.offset > 0 ? '+' : ''}${S.offset || 0} ms</b><button data-act="offset" data-arg="10">+</button></div></div>
      <p class="note">If the music feels late against the rings, lower the offset; if early, raise it.</p>`;
  }
  p_howto() {
    const rows = [
      ['&uarr;&darr;', 'Block with the arrow keys or WASD. On a phone, tap the side the attack comes from (or swipe, in settings).'],
      ['&#9711;', 'A ring closes on the target in each lane. Block when it lands: that is the beat.'],
      ['&#9733;', '<b>PERFECT</b> (inside 45 ms) knocks it back and kills the thrower. <b>GOOD</b> just blocks. A miss costs a heart.'],
      ['x8', 'Perfects in a row build a score multiplier, up to x8. A good, a miss, or blocking at nothing resets it.'],
      ['&#8230;', 'Dashed cyan ring = a feint. Wait one more beat.'],
      ['&#9650;', 'Purple ring = HOLD the block until the bar fills.'],
      ['&times;', 'Red ring with an X = a bomb. Do NOT block; let it fly over you.'],
      ['&#9819;', 'Every stage ends with a boss. Survive its song to knock it out.'],
    ];
    return `<div class="card"><header><h2>How to play</h2><button class="btn x" data-act="back">&times;</button></header><div class="body">
      ${rows.map(([k, t]) => `<div class="how"><span class="hk">${k}</span><span>${t}</span></div>`).join('')}
      <button class="btn gold block" data-act="back" data-primary>Got it</button></div></div>`;
  }
  p_result(d) {
    const stat = `<div class="stats"><div><b>${d.perfects}</b><small>perfect</small></div><div><b>${d.goods}</b><small>good</small></div><div><b>${d.misses}</b><small>miss</small></div><div><b>${d.maxStreak}</b><small>best streak</small></div></div>`;
    if (d.endless) {
      const m = Math.floor(d.time / 60), s = String(Math.floor(d.time % 60)).padStart(2, '0');
      return `<div class="card result"><div class="body"><h2 class="rt lose">Endless over</h2>
        <div class="score"><b>${d.score.toLocaleString()}</b>${d.isBest ? '<span class="newbest">NEW BEST</span>' : `<small>best ${d.best.toLocaleString()}</small>`}</div>
        <p class="sub">Survived ${m}:${s}</p>${stat}
        <div class="btns"><button class="btn gold" data-act="restart" data-primary>Retry <small>R</small></button><button class="btn" data-act="title">Menu</button></div></div></div>`;
    }
    const st = STAGES[d.si], last = d.si >= STAGES.length - 1;
    const labels = ['Survive', `Score ${d.target.toLocaleString()}`, 'Perfect boss'];
    return `<div class="card result"><div class="body">
      <h2 class="rt ${d.survived ? 'win' : 'lose'}">${d.survived ? (last ? 'The King falls!' : 'Stage clear!') : 'Defeated'}</h2>
      <p class="sub">Stage ${d.si + 1} · ${st.name}</p>
      <div class="starrow">${[0, 1, 2].map((i) => `<div class="st" data-i="${i}">${starSvg(false, true)}<small>${labels[i]}</small></div>`).join('')}</div>
      <div class="score"><b>${d.score.toLocaleString()}</b>${d.isBest ? '<span class="newbest">NEW BEST</span>' : `<small>best ${d.best.toLocaleString()}</small>`}</div>
      ${stat}
      ${d.endlessNew ? '<div class="unlock">Endless mode unlocked!</div>' : ''}
      <div class="btns"><button class="btn ${d.survived ? '' : 'gold'}" data-act="restart" ${d.survived ? '' : 'data-primary'}>Retry <small>R</small></button>
      ${d.survived && !last ? '<button class="btn gold" data-act="next" data-primary>Next stage</button>' : ''}
      <button class="btn" data-act="stages">Stages</button></div></div></div>`;
  }
  animateStars(d) {
    if (d.endless) return;
    d.got.forEach((on, i) => {
      if (!on) return;
      setTimeout(() => {
        const el = this.el && this.el.querySelector(`.st[data-i="${i}"] .star`);
        if (!el) return; el.classList.add('on', 'pop'); this.g.audio.play('star', 1, 1 + i * 0.12);
      }, 380 + i * 300);
    });
  }
}
