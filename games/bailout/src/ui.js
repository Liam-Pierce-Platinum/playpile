// HTML menus: title, level select, garage, bailout gallery, daily, pause,
// results. Everything is one click from riding.
import { LEVELS, WORLDS, THEMES, MEDALS, MEDAL_NAMES, MEDAL_COLS, dailyInfo } from './levels.js';
import { BIKES, BIKE, HELMETS, SUITS } from './bikes.js';
import { Bike } from './physics.js';
import { drawBike, setLineWidth } from './draw.js';
import { TROPHIES, unlockedTrophies } from './trophies.js';
import { fmtTime } from './util.js';

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const MEDAL_COL = MEDAL_COLS;
const medal = (m, big) => `<span class="medal ${big ? 'big' : ''} ${m ? 'on' : ''} ${m === 4 ? 'plat' : ''}" style="--mc:${MEDAL_COL[m]}"></span>`;
const coin = (n) => `<span class="coin"></span>${n}`;

export class UI {
  constructor(g) {
    this.g = g;
    this.root = document.getElementById('ui');
    this.el = null; this.panel = null;
    this.tab = 0; this.gtab = 'bikes';
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
      const k = e.target.dataset.set;
      if (k) { this.g.audio[k] = +e.target.value / 100; this.g.save[k] = this.g.audio[k]; this.g.audio.apply(); this.g.persist(); }
    });
    this.root.appendChild(el);
    if (kind === 'garage') this.drawPreview();
    if (kind === 'result') this.animateResult(data);
  }
  back() {
    const g = this.g;
    if (g.mode === 'title') { if (this.panel !== 'title') this.show('title'); return; }
    if (g.mode === 'result') { this.show('result', this.lastResult); return; }
    if (['settings', 'levels', 'garage', 'gallery'].includes(this.panel) && g.mode === 'play') this.show('pause');
    else this.close();
  }
  primary() { const b = this.el && this.el.querySelector('[data-primary]'); if (b) b.click(); }
  act(a, arg) {
    const g = this.g, S = g.save;
    switch (a) {
      case 'play': g.startLevel(g.nextLevel()); break;
      case 'level': if (g.unlocked(+arg)) g.startLevel(+arg); else g.audio.play('deny'); break;
      case 'levels': this.tab = arg != null ? +arg : this.curWorld(); this.show('levels'); break;
      case 'wtab': this.tab = +arg; this.show('levels'); break;
      case 'daily': g.startDaily(); break;
      case 'endless': g.startEndless(); break;
      case 'garage': this.show('garage'); break;
      case 'gtab': this.gtab = arg; this.show('garage'); break;
      case 'gallery': this.show('gallery'); break;
      case 'settings': this.show('settings'); break;
      case 'back': this.back(); break;
      case 'resume': this.close(); break;
      case 'retry': g.restart(); break;
      case 'checkpoint': this.close(); g.respawn(true); break;
      case 'next': { const r = this.lastResult; if (r && r.kind === 'level' && r.hasNext) g.startLevel(r.levelId + 1); else g.restart(); break; }
      case 'menu': g.toTitle(); break;
      case 'mute': g.audio.muted = !g.audio.muted; S.muted = g.audio.muted; g.audio.apply(); g.persist(); this.show(this.panel, this.data); break;
      case 'pedals': S.pedals = !S.pedals; g.showPedals = g.coarse || S.pedals; g.persist(); this.show(this.panel, this.data); break;
      case 'share': {
        const txt = this.data.share;
        try { navigator.clipboard.writeText(txt).then(() => this.toast('Copied!'), () => this.toast('Copy failed')); } catch (e) { this.toast('Copy failed'); }
        break;
      }
      case 'buy': this.buy(arg); break;
      case 'reset': if (confirm('Erase all BAILOUT progress?')) { try { localStorage.removeItem('pd.bailout'); } catch (e) { /* blocked */ } location.reload(); } break;
    }
  }
  curWorld() { return Math.floor(this.g.nextLevel() / 8); }
  toast(t) { const e = h('div', 'toast', t); this.root.appendChild(e); setTimeout(() => e.remove(), 1400); }

  buy(arg) {
    const g = this.g, S = g.save;
    const [kind, id] = arg.split(':');
    const list = kind === 'bike' ? BIKES : kind === 'helmet' ? HELMETS : SUITS;
    const item = list.find((x) => x.id === id);
    const owned = kind === 'bike' ? g.bikeOwned(id) : kind === 'helmet' ? S.ownedH[id] : S.ownedS[id];
    if (!owned) {
      if (item.price < 0 || S.coins < item.price) { g.audio.play('deny'); this.toast(item.price < 0 ? 'Gold every level to unlock' : 'Not enough coins'); return; }
      S.coins -= item.price;
      if (kind === 'bike') S.owned[id] = 1; else if (kind === 'helmet') S.ownedH[id] = 1; else S.ownedS[id] = 1;
      g.audio.play('medal');
    }
    if (kind === 'bike') S.bike = id; else if (kind === 'helmet') S.helmet = id; else S.suit = id;
    g.persist();
    if (g.mode === 'title') { const keep = this.gtab; g.toTitle(); this.gtab = keep; }
    this.show('garage');
  }

  // ------------------------------------------------------------------ panels
  p_title() {
    const g = this.g, S = g.save, nl = g.nextLevel(), L = LEVELS[nl];
    const di = dailyInfo();
    const dDone = S.daily.day === di.day && S.daily.best;
    return `<div class="titlewrap">
      <div class="coins">${coin(S.coins)}</div>
      <div class="logo"><h1>BAIL<span>OUT</span></h1><p>flip it, stick it, or go flying</p></div>
      <div class="menu">
        <button class="btn big go" data-act="play" data-primary><b>RIDE</b><small>${WORLDS.indexOf(L.world) + 1}-${L.num} ${L.name}</small></button>
        <div class="row2">
          <button class="btn" data-act="levels"><b>LEVELS</b><small>${this.medalCount()}/120 medals</small></button>
          <button class="btn daily" data-act="daily"><b>DAILY #${di.day}</b><small>${dDone ? 'best ' + fmtTime(S.daily.best.t) : 'new course today'}${S.daily.streak > 1 ? ' · ' + S.daily.streak + ' day streak' : ''}</small></button>
        </div>
        <div class="row2">
          <button class="btn" data-act="endless"><b>FREEFALL</b><small>best ${S.endless.best} m</small></button>
          <button class="btn" data-act="garage"><b>GARAGE</b><small>${BIKE[S.bike].name}</small></button>
        </div>
        <div class="row3">
          <button class="btn small" data-act="gallery">Gallery · ${g.trophyCount()}/${TROPHIES.length} trophies</button>
          <button class="btn small" data-act="settings">Sound</button>
        </div>
      </div>
      <div class="keys">
        <div class="kk"><i class="pedal gas"></i><span class="kc">→</span><span class="kc">D</span><em>gas</em></div>
        <div class="kk"><i class="pedal brake"></i><span class="kc">←</span><span class="kc">A</span><em>brake</em></div>
        <div class="kk air"><i class="spin"></i><em>in the air: <b>tap gas</b> = backflip · <b>tap brake</b> = frontflip · <b>let go</b> = auto-level</em></div>
      </div>
    </div>`;
  }
  medalCount() { let n = 0; for (const k in this.g.save.levels) n += Math.min(3, this.g.save.levels[k].medal || 0); return n; }
  p_levels() {
    const g = this.g, S = g.save;
    const wi = this.tab, W = WORLDS[wi], T = THEMES[W];
    const tabs = WORLDS.map((w, i) => {
      const open = g.unlocked(i * 8);
      return `<button class="wtab ${i === wi ? 'on' : ''} ${open ? '' : 'locked'}" style="--a:${THEMES[w].ground};--b:${THEMES[w].top}" data-act="wtab" data-arg="${i}">${open ? THEMES[w].name : '🔒'}</button>`;
    }).join('');
    let tiles = '';
    for (let k = 0; k < 8; k++) {
      const i = wi * 8 + k, L = LEVELS[i], rec = S.levels[i], open = g.unlocked(i);
      const M = MEDALS[i];
      // medal targets only appear once a level has been played (a first go is not a demand)
      tiles += `<button class="lvl ${open ? '' : 'locked'} ${rec ? 'done' : ''}" data-act="level" data-arg="${i}" ${open ? '' : 'disabled'}>
        <b>${wi + 1}-${k + 1}</b><span>${open ? L.name : 'Locked'}</span>
        <em>${medal(rec ? rec.medal : 0)}${rec ? fmtTime(rec.best) + (M && rec.medal < 3 ? ' <i>gold ' + fmtTime(M[0]) + '</i>' : M && M[3] && rec.medal < 4 ? ' <i>plat ' + fmtTime(M[3]) + '</i>' : '') : open ? 'not played' : ''}</em></button>`;
    }
    const golds = []; for (let k = 0; k < 8; k++) { const r = S.levels[wi * 8 + k]; if (r && r.medal >= 3) golds.push(k); }
    return `<div class="card wide" style="--wa:${T.ground};--wb:${T.top}">
      <header><h2>Levels</h2><div class="coins in">${coin(S.coins)}</div><button class="btn x" data-act="back">✕</button></header>
      <div class="tabs">${tabs}</div>
      <div class="body"><div class="grid">${tiles}</div>
      <p class="note">Every full flip you land takes 1 s off your time. Gold on most levels wants a flip or two; platinum is for the fearless. ${golds.length}/8 gold in ${T.name}.</p></div></div>`;
  }
  p_garage() {
    const g = this.g, S = g.save, t = this.gtab;
    const tabs = ['bikes', 'helmets', 'suits'].map((k) => `<button class="gtab ${k === t ? 'on' : ''}" data-act="gtab" data-arg="${k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('');
    let items = '';
    if (t === 'bikes') {
      for (const b of BIKES) {
        const own = g.bikeOwned(b.id), eq = S.bike === b.id;
        const bars = Object.entries(b.stats).map(([k, v]) => `<div class="stat"><span>${k}</span><i style="--v:${v * 20}%"></i></div>`).join('');
        items += `<button class="item ${eq ? 'eq' : ''}" data-act="buy" data-arg="bike:${b.id}"><div class="swatch" style="background:${b.color}"></div><div class="it"><b>${b.name}</b><small>${b.desc}</small>${bars}</div>
          <div class="price">${eq ? 'RIDING' : own ? 'RIDE' : b.price < 0 ? '🔒 all gold' : coin(b.price)}</div></button>`;
      }
    } else {
      const list = t === 'helmets' ? HELMETS : SUITS, own = t === 'helmets' ? S.ownedH : S.ownedS, cur = t === 'helmets' ? S.helmet : S.suit, kind = t === 'helmets' ? 'helmet' : 'suit';
      for (const it of list) {
        const eq = cur === it.id;
        items += `<button class="item small ${eq ? 'eq' : ''}" data-act="buy" data-arg="${kind}:${it.id}"><div class="swatch ${kind}" style="background:${it.c1};--c2:${it.c2}"></div><div class="it"><b>${it.name}</b></div>
          <div class="price">${eq ? 'ON' : own[it.id] ? 'WEAR' : coin(it.price)}</div></button>`;
      }
    }
    return `<div class="card wide">
      <header><h2>Garage</h2><div class="coins in">${coin(S.coins)}</div><button class="btn x" data-act="back">✕</button></header>
      <div class="garage"><canvas class="preview" width="520" height="300"></canvas><div class="tabs">${tabs}</div><div class="items ${t}">${items}</div></div></div>`;
  }
  drawPreview() {
    const cv = this.el.querySelector('.preview');
    if (!cv) return;
    const ctx = cv.getContext('2d'), g = this.g;
    const b = new Bike(BIKE[g.save.bike] || BIKE.dirt);
    b.place(0, 40, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    const grd = ctx.createLinearGradient(0, 0, 0, cv.height); grd.addColorStop(0, '#7fd3ff'); grd.addColorStop(1, '#d6f3ff');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = '#e2734a'; ctx.fillRect(0, 230, cv.width, 70); ctx.fillStyle = '#f6c47a'; ctx.fillRect(0, 222, cv.width, 12);
    ctx.fillStyle = '#1b1b2a'; ctx.fillRect(0, 220, cv.width, 3);
    ctx.save(); ctx.translate(cv.width / 2, 182); ctx.scale(2.2, 2.2);
    setLineWidth(1.4);
    b.lean = 0.2;
    drawBike(ctx, b, g.look, 0);
    ctx.restore();
  }
  p_gallery() {
    const S = this.g.save, G = S.gallery;
    const card = (v, l, s) => `<div class="gcard"><b>${v}</b><span>${l}</span><small>${s}</small></div>`;
    const got = new Set(unlockedTrophies(S).map((t) => t.id));
    const trophies = TROPHIES.map((t) => `<div class="trophy ${got.has(t.id) ? 'on' : ''}"><i>🏆</i><div><b>${t.name}</b><small>${t.desc}</small></div></div>`).join('');
    return `<div class="card wide">
      <header><h2>Bailout Gallery</h2><span class="streak">${got.size}/${TROPHIES.length} trophies</span><button class="btn x" data-act="back">✕</button></header>
      <div class="body"><div class="gstats">
        ${card(G.bailouts, 'Total bailouts', 'every one of them hurt')}
        ${card(G.air.toFixed(2) + ' s', 'Longest ragdoll airtime', 'frequent flyer')}
        ${card(G.slide.toFixed(1) + ' m', 'Longest face slide', 'gravel rash')}
        ${card(G.speed.toFixed(1) + ' m/s', 'Fastest tumble', 'terminal velocity')}
        ${card(G.combo + 'x', 'Biggest flip combo', 'landed, not crashed')}
        ${card(G.flips, 'Flips landed', 'lifetime')}
        ${card(G.tnt, 'TNT launches', 'boom')}
        ${card(G.lava, 'Lava dips', 'medium rare')}
      </div>
      <h4 class="th">Trophies</h4><div class="trophies">${trophies}</div></div></div>`;
  }
  p_settings() {
    const g = this.g, A = g.audio;
    return `<div class="card small">
      <header><h2>Sound & options</h2><button class="btn x" data-act="back">✕</button></header>
      <div class="body">
        <label class="set">Music <input type="range" min="0" max="100" value="${Math.round(A.music * 100)}" data-set="music"></label>
        <label class="set">Effects <input type="range" min="0" max="100" value="${Math.round(A.sfx * 100)}" data-set="sfx"></label>
        <div class="row2"><button class="btn small" data-act="mute">${A.muted ? 'Unmute all' : 'Mute all'}</button>
        <button class="btn small" data-act="pedals">${g.save.pedals ? 'Hide' : 'Show'} on-screen pedals</button></div>
        <p class="note">Keys: → / D / W / ↑ gas · ← / A / S / ↓ brake · R restart level · Enter back to checkpoint · Esc pause. Touch: right half gas, left half brake.</p>
        <button class="btn small danger" data-act="reset">Erase progress</button>
      </div></div>`;
  }
  p_pause() {
    const g = this.g, r = g.run, A = g.audio;
    const name = r.kind === 'level' ? `${WORLDS.indexOf(LEVELS[r.levelId].world) + 1}-${LEVELS[r.levelId].num} ${LEVELS[r.levelId].name}` : r.kind === 'daily' ? 'Daily #' + r.day : 'Freefall Mountain';
    return `<div class="card small">
      <header><h2>Paused</h2><button class="btn x" data-act="resume">▶</button></header>
      <div class="body menu">
        <p class="sub">${name}</p>
        <button class="btn go" data-act="resume" data-primary><b>RESUME</b></button>
        <div class="row2"><button class="btn" data-act="retry"><b>RESTART</b><small>R</small></button>
        ${r.kind !== 'endless' ? '<button class="btn" data-act="checkpoint"><b>CHECKPOINT</b><small>Enter</small></button>' : ''}</div>
        <div class="row2"><button class="btn small" data-act="levels">Levels</button><button class="btn small" data-act="menu">Main menu</button></div>
        <label class="set">Music <input type="range" min="0" max="100" value="${Math.round(A.music * 100)}" data-set="music"></label>
        <label class="set">Effects <input type="range" min="0" max="100" value="${Math.round(A.sfx * 100)}" data-set="sfx"></label>
        <button class="btn small" data-act="mute">${A.muted ? 'Unmute all' : 'Mute all'}</button>
      </div></div>`;
  }
  p_result(d) {
    this.lastResult = d;
    if (d.kind === 'endless') {
      return `<div class="card small result">
        <header><h2>Freefall over</h2></header>
        <div class="body">
          <div class="bigstat"><b>${d.dist} m</b><span>${d.newBest ? 'NEW BEST!' : 'best ' + Math.max(d.prev, d.dist) + ' m'}</span></div>
          <div class="lines"><div><span>Flips landed</span><b>${d.flips}</b></div><div><span>Coins</span><b>${coin('+' + d.coins)}</b></div></div>
          ${this.trophyNews(d)}
          <div class="btns"><button class="btn small" data-act="menu">Menu</button><button class="btn go" data-act="retry" data-primary><b>AGAIN</b><small>R</small></button></div>
        </div></div>`;
    }
    const M = d.medals || [0, 0, 0, 0];
    const lines = `<div class="lines">
      <div><span>Ride time</span><b>${fmtTime(d.raw)}</b></div>
      <div><span>Flip bonus (${d.flips} flips)</span><b class="good">-${d.bonus.toFixed(1)} s</b></div>
      <div><span>Bailouts</span><b>${d.bailouts}</b></div>
      <div class="tot"><span>Final</span><b>${fmtTime(d.time)}</b></div>
      <div><span>Coins</span><b>${coin('+' + d.coins)}</b></div></div>`;
    // targets: gold / silver / bronze, plus platinum once gold is in the bag
    const tiers = [[3, M[0]], [2, M[1]], [1, M[2]]];
    if (M[3] && d.medal >= 3) tiers.unshift([4, M[3]]);
    const targets = `<div class="targets">${tiers.map(([m, tt]) => `<div class="tg ${d.medal >= m ? 'hit' : ''}">${medal(m)}<span>${fmtTime(tt)}</span></div>`).join('')}</div>`;
    if (d.kind === 'daily') {
      const rivals = [['ACE', M[0] * 0.93], ['MOSS', M[0]], ['DUSTY', (M[0] + M[1]) / 2], ['ROOKIE', M[1]], ['GRAN', M[2]]].map(([n, t]) => ({ n: n + ' (CPU)', t, cpu: true }));
      const rows = d.runs.map((x, i) => ({ n: 'YOU' + (i ? ' #' + (i + 1) : ''), t: x.t, you: true })).concat(rivals).sort((a, b) => a.t - b.t).slice(0, 8);
      const board = rows.map((x, i) => `<div class="lb ${x.you ? 'you' : ''}"><i>${i + 1}</i><span>${x.n}</span><b>${fmtTime(x.t)}</b></div>`).join('');
      const y = d.yesterday;
      const beat = y ? (d.time < y.t ? `<p class="beat good">Beat yesterday (${fmtTime(y.t)}) by ${(y.t - d.time).toFixed(2)} s!</p>` : `<p class="beat">Yesterday you did ${fmtTime(y.t)} - ${(d.time - y.t).toFixed(2)} s to beat it.</p>`) : '';
      const hist = (d.hist || []).filter((hh) => hh.day !== d.day).slice(-6).map((hh) => `<span class="hday"><i>#${hh.day}</i>${fmtTime(hh.t)}</span>`).join('');
      return `<div class="card wide result">
        <header><h2>Daily #${d.day}</h2>${d.streak > 1 ? `<span class="streak">🔥 ${d.streak} day streak</span>` : ''}</header>
        <div class="body twocol"><div>
          <div class="medalrow">${medal(d.medal, true)}<div><h3>${fmtTime(d.time)}</h3><p>${d.newBest ? 'Your best today!' : 'Best today ' + fmtTime(d.best.t)}</p></div></div>
          ${beat}
          ${lines}
          ${this.trophyNews(d)}
          <div class="sharecard"><b>BAILOUT</b><span>${d.share}</span></div>
        </div><div><h4>Today's board</h4><div class="board">${board}</div>${targets}${hist ? `<h4>Your last days</h4><div class="hist">${hist}</div>` : ''}</div></div>
        <div class="btns pad"><button class="btn small" data-act="menu">Menu</button><button class="btn small" data-act="share">Copy result</button><button class="btn go" data-act="retry" data-primary><b>RETRY</b><small>R</small></button></div>
      </div>`;
    }
    const L = LEVELS[d.levelId];
    return `<div class="card result">
      <header><h2>${WORLDS.indexOf(L.world) + 1}-${L.num} ${L.name}</h2></header>
      <div class="body">
        <div class="resgrid">
        <div class="medalrow">${medal(d.medal, true)}<div><h3>${MEDAL_NAMES[d.medal]}</h3><p>${d.newBest ? (d.prevBest != null ? 'New best! (was ' + fmtTime(d.prevBest) + ')' : 'Level complete!') : 'Best ' + fmtTime(d.best)}</p></div></div>
        ${lines}${targets}
        </div>
        ${d.worldUnlocked ? `<p class="unlock">New world unlocked: ${THEMES[d.worldUnlocked].name}!</p>` : ''}
        ${d.rocket ? '<p class="unlock">ROCKET BIKE unlocked in the garage!</p>' : ''}
        ${this.trophyNews(d)}
        <div class="btns"><button class="btn small" data-act="levels">Levels</button><button class="btn" data-act="retry"><b>RETRY</b><small>R</small></button><button class="btn go" data-act="next" data-primary><b>${d.hasNext ? 'NEXT' : 'AGAIN'}</b><small>Enter</small></button></div>
      </div></div>`;
  }
  trophyNews(d) {
    if (!d.newTrophies || !d.newTrophies.length) return '';
    return d.newTrophies.map((t) => `<p class="unlock trophy-new">🏆 Trophy: ${t.name} - ${t.desc}</p>`).join('');
  }
  animateResult(d) {
    const m = this.el.querySelector('.medal.big');
    if (m) { m.classList.add('pop'); if (d.medal) setTimeout(() => this.g.audio.play('medal'), 250); }
  }
}
