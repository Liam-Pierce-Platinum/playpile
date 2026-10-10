// Menus in HTML: title, match setup, shop, results, pause, settings, how to play,
// plus the pause button and the touch action buttons.
import { MAPS, MODES, MODE_ORDER } from './maps.js';
import { drawKid, HATS, SCARVES, COATS } from './draw.js';

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const coin = '<span class="coin"></span>';

export class UI {
  constructor(g) {
    this.g = g;
    this.root = document.getElementById('ui');
    this.el = null; this.panel = null;
    this.sel = { mode: g.save.lastMode, map: g.save.lastMap };
    this.pauseBtn = h('button', 'pausebtn', '<i></i><i></i>');
    this.pauseBtn.setAttribute('aria-label', 'Pause');
    this.pauseBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); g.pause(); });
    this.root.appendChild(this.pauseBtn);
    // touch buttons
    this.tb = h('div', 'touchbtns');
    const mk = (cls, label, sub, down, upf) => {
      const b = h('button', 'tbtn ' + cls, `<b>${label}</b><span>${sub}</span>`);
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); g.audio.unlock(); b.classList.add('down'); down(); });
      for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => { b.classList.remove('down'); if (upf) upf(); });
      this.tb.appendChild(b);
      return b;
    };
    mk('dive', 'DIVE', 'slide', () => { g.queue.dive = true; });
    mk('wall', 'WALL', '3 snow', () => { g.queue.wall = true; });
    mk('roll', 'ROLL', 'hold', () => { g.touch.roll = true; }, () => { g.touch.roll = false; });
    mk('scoop', 'SCOOP', 'hold', () => { g.touch.scoop = true; }, () => { g.touch.scoop = false; });
    this.root.appendChild(this.tb);
    this.hud(false);
  }
  get open() { return !!this.el; }
  hud(on) { this.pauseBtn.style.display = on ? '' : 'none'; this.tb.style.display = on ? '' : 'none'; document.body.classList.toggle('playing', on); }
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
    this.paintPreviews();
    if (kind === 'result') this.animateResult(data);
  }
  back() {
    const g = this.g;
    if (g.state === 'play' && ['settings', 'howto'].includes(this.panel)) this.show('pause');
    else if (g.state === 'play') this.close();
    else if (g.state === 'results' && ['settings', 'howto', 'shop'].includes(this.panel)) this.show('result', g.result);
    else this.show('title');
  }
  primary() { const b = this.el && this.el.querySelector('[data-primary]'); if (b) b.click(); }
  act(a, arg) {
    const g = this.g, S = g.save;
    switch (a) {
      case 'quick': g.quickPlay(); break;
      case 'setup': this.sel = { mode: S.lastMode, map: Math.min(S.lastMap, S.unlocked - 1) }; this.show('setup'); break;
      case 'mode': this.sel.mode = arg; this.show('setup'); break;
      case 'map': this.sel.map = +arg; this.show('setup'); break;
      case 'start': g.startMatch({ mode: this.sel.mode, map: this.sel.map }); break;
      case 'shop': this.show('shop'); break;
      case 'howto': this.show('howto'); break;
      case 'settings': this.show('settings'); break;
      case 'back': this.back(); break;
      case 'resume': this.close(); break;
      case 'restart': g.restart(); break;
      case 'next': g.startMatch({ mode: g.cfg.mode, map: this.data.next ?? g.cfg.map }); break;
      case 'title': g.state = 'title'; g.toTitle(); break;
      case 'mute': g.audio.muted = !g.audio.muted; S.muted = g.audio.muted; g.audio.apply(); g.persist(); this.show(this.panel); break;
      case 'coat': S.coat = +arg; g.persist(); this.show('shop'); break;
      case 'hat': case 'scarf': {
        const list = a === 'hat' ? HATS : SCARVES, owned = a === 'hat' ? S.owned.hats : S.owned.scarves;
        if (!owned.includes(arg)) {
          const price = list[arg].price;
          if (S.coins < price) { g.audio.play('empty'); return; }
          S.coins -= price; owned.push(arg); g.audio.play('coin');
        }
        S[a] = arg; g.persist(); this.show('shop'); break;
      }
    }
  }

  p_title() {
    const S = this.g.save, m = MODES[S.lastMode], map = MAPS[Math.min(S.lastMap, S.unlocked - 1)];
    return `<div class="title"><div class="logo"><div class="flakes"><i></i><i></i><i></i></div><h1><span>SNOWBALL</span><span class="r">ROYALE</span></h1><p>Duck behind walls. Roll a big one. Be the last kid standing.</p></div>
      <div class="menu"><button class="btn gold big" data-act="quick" data-primary>Play <small>${m.short} · ${map.name}</small></button>
      <button class="btn" data-act="setup">Modes &amp; maps <small>${S.unlocked}/${MAPS.length} maps</small></button>
      <button class="btn" data-act="shop">Hats &amp; scarves <small>${coin}${S.coins}</small></button>
      <div class="row2"><button class="btn small" data-act="howto">How to play</button><button class="btn small" data-act="settings">Settings</button></div></div>
      <div class="credit">a PLAYPILE game · wins ${S.wins}</div></div>`;
  }
  p_setup() {
    const S = this.g.save, sel = this.sel;
    const modes = MODE_ORDER.map((k) => `<button class="mode ${sel.mode === k ? 'on' : ''}" data-act="mode" data-arg="${k}"><b>${MODES[k].name}</b><small>${MODES[k].blurb}</small><em>best ${S.best[k] || 0}</em></button>`).join('');
    const maps = MAPS.map((m, i) => {
      const locked = i >= S.unlocked;
      return `<button class="mapc ${sel.map === i ? 'on' : ''} ${locked ? 'locked' : ''}" data-act="map" data-arg="${i}" ${locked ? 'disabled' : ''}><b>${locked ? '🔒 ' : ''}${m.name}</b><small>${locked ? `Do well on ${MAPS[i - 1].name} to unlock` : m.blurb}</small></button>`;
    }).join('');
    return `<div class="card wide"><header><h2>Pick a fight</h2><button class="btn x" data-act="back">✕</button></header><div class="body">
      <h3>Mode</h3><div class="modes">${modes}</div>
      <h3>Map <small>harder kids on later maps</small></h3><div class="maps">${maps}</div>
      <div class="btns"><button class="btn gold" data-act="start" data-primary>Start ▶</button></div></div></div>`;
  }
  p_shop() {
    const S = this.g.save;
    const coats = COATS.map((c, i) => `<button class="sw ${S.coat === i ? 'on' : ''}" data-act="coat" data-arg="${i}" style="--c:${c}" aria-label="coat ${i + 1}"></button>`).join('');
    const item = (kind, key, it, owned, eq) => `<button class="item ${eq ? 'on' : ''} ${owned ? '' : 'buy'} ${!owned && S.coins < it.price ? 'poor' : ''}" data-act="${kind}" data-arg="${key}"><canvas width="96" height="96" data-prev="${kind}:${key}"></canvas><b>${it.name}</b><small>${eq ? 'wearing' : owned ? 'wear' : coin + it.price}</small></button>`;
    const hats = Object.entries(HATS).map(([k, it]) => item('hat', k, it, S.owned.hats.includes(k), S.hat === k)).join('');
    const scarves = Object.entries(SCARVES).map(([k, it]) => item('scarf', k, it, S.owned.scarves.includes(k), S.scarf === k)).join('');
    return `<div class="card wide"><header><h2>Hats &amp; scarves</h2><span class="coins">${coin}${S.coins}</span><button class="btn x" data-act="back">✕</button></header><div class="body">
      <div class="shoptop"><canvas class="me" width="200" height="200" data-prev="me"></canvas><div><h3>Coat</h3><div class="swatches">${coats}</div><p class="note">Coins come from every round: score ÷ 20, plus 5 for a win.</p></div></div>
      <h3>Hats</h3><div class="items">${hats}</div>
      <h3>Scarves</h3><div class="items">${scarves}</div>
      <div class="btns"><button class="btn gold" data-act="back" data-primary>Done</button></div></div></div>`;
  }
  paintPreviews() {
    if (!this.el) return;
    const S = this.g.save;
    for (const cv of this.el.querySelectorAll('canvas[data-prev]')) {
      const [kind, key] = cv.dataset.prev.split(':');
      const c = cv.getContext('2d'); c.clearRect(0, 0, cv.width, cv.height);
      const kid = { x: 0, y: 0, face: 1.2, vx: 0, vy: 0, coat: COATS[S.coat % COATS.length], skin: '#f7d5bd', hair: '#4a2e1f', hat: S.hat, scarf: S.scarf, ring: '#ffd23f', step: 0, hp: 3, maxhp: 3, id: 1, isPlayer: true, invuln: 0, squash: 0, prone: 0, stun: 0 };
      if (kind === 'hat') kid.hat = key;
      if (kind === 'scarf') kid.scarf = key;
      c.save();
      if (kind === 'me') { c.translate(100, 168); c.scale(2.6, 2.6); } else { c.translate(48, 84); c.scale(kind === 'hat' ? 1.9 : 1.7, kind === 'hat' ? 1.9 : 1.7); if (kind === 'hat') c.translate(0, 14); }
      drawKid(c, kid, 1, { noRing: kind !== 'me', noPips: true });
      c.restore();
    }
  }
  p_result(d) {
    const rows = d.rows.map((r) => `<div class="rrow ${r.isPlayer ? 'me' : ''}"><span class="rk">${r.rank}</span><span class="dot" style="--c:${r.coat}"></span><b>${r.name}</b><small>${r.persona}</small><span class="kos">${r.kos} KO</span><span class="ex">${r.extra}</span></div>`).join('');
    return `<div class="card result"><header class="${d.win ? 'win' : ''}"><h2>${d.title}</h2><span class="sub">${d.sub}</span></header><div class="body">
      <div class="scoreline"><div><small>score</small><b class="count" data-to="${d.score}">0</b>${d.newBest ? '<em class="nb">NEW BEST</em>' : `<em>best ${d.best}</em>`}</div><div><small>coins</small><b>${coin}+${d.coins}</b><em>${d.stats.hits} hits · ${d.stats.kos} KOs${d.stats.flat ? ` · ${d.stats.flat} flattened` : ''}</em></div></div>
      ${d.unlock ? `<div class="unlock">New map unlocked: <b>${d.unlock}</b></div>` : ''}
      <div class="rows">${rows}</div>
      <div class="btns"><button class="btn" data-act="title">Menu</button>${d.next != null ? '<button class="btn" data-act="next">Next map ▶</button>' : ''}<button class="btn gold" data-act="restart" data-primary>↺ Again</button></div>
      <p class="note">Space or R to go again</p></div></div>`;
  }
  animateResult(d) {
    const el = this.el && this.el.querySelector('.count');
    if (!el) return;
    const to = d.score, t0 = performance.now();
    const step = () => { if (!this.el || !el.isConnected) return; const f = Math.min(1, (performance.now() - t0) / 700); el.textContent = Math.round(to * (1 - Math.pow(1 - f, 3))); if (f < 1) requestAnimationFrame(step); else if (d.coins) this.g.audio.play('coin'); };
    requestAnimationFrame(step);
  }
  p_pause() {
    return `<div class="card small"><header><h2>Paused</h2></header><div class="body menu">
      <button class="btn gold" data-act="resume" data-primary>Resume</button><button class="btn" data-act="restart">Restart round</button>
      <button class="btn" data-act="howto">How to play</button><button class="btn" data-act="settings">Sound</button><button class="btn" data-act="title">Quit to menu</button></div></div>`;
  }
  p_settings() {
    const a = this.g.audio;
    return `<div class="card small"><header><h2>Sound</h2><button class="btn x" data-act="back">✕</button></header><div class="body">
      <label class="set">Music <input type="range" min="0" max="100" value="${Math.round(a.music * 100)}" data-set="music"></label>
      <label class="set">Effects <input type="range" min="0" max="100" value="${Math.round(a.sfx * 100)}" data-set="sfx"></label>
      <div class="set">Mute everything <button class="btn small tog ${a.muted ? 'on' : ''}" data-act="mute">${a.muted ? 'Muted' : 'Off'}</button></div>
      <button class="btn" data-act="back" data-primary>Back</button></div></div>`;
  }
  p_howto() {
    const r = (k, t) => `<div class="how"><span class="hk">${k}</span><span>${t}</span></div>`;
    return `<div class="card"><header><h2>How to play</h2><button class="btn x" data-act="back">✕</button></header><div class="body">
      ${r('●', '<b>Click</b> to throw a fast, flat snowball. <b>Hold</b> click to charge a <b>lob</b> that arcs over walls and lands on the yellow ring.')}
      ${r('▮', 'Snow walls stop flat throws. <b>Q</b> builds one in front of you (costs 3 snowballs). Hits wear walls down.')}
      ${r('✋', 'Out of snow? <b>Stand still</b> on fresh snow, or hold <b>E</b>, to scoop 2 more. Scooped patches stay bare.')}
      ${r('◯', 'Hold <b>R</b> and walk to <b>roll</b> a snowball. It grows over snow and slows you down. Let go to shove it. A big one crushes walls and flattens kids.')}
      ${r('➜', '<b>Space</b> (or right click) dives. Diving ducks flat throws, slides on ice and tackles anyone in the way.')}
      ${r('♥', 'Three hits and you are out to the sidelines. Hit a tree to dump its snow on whoever is underneath. Watch out for the dog.')}
      ${r('📱', 'On a phone: left thumb moves, right thumb aims. Let go to throw, hold first for a lob. Buttons for dive, wall, roll and scoop.')}
      <button class="btn gold" data-act="back" data-primary>Got it</button></div></div>`;
  }
}
