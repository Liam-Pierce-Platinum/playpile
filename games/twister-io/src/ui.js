// HTML overlay: HUD (timer, live top-5, size-tier ring, pop-ups, banners, name
// tags, touch controls) and the menu screens (title, perks, skins, missions,
// trophies, pause, results).
import { SKINS, PERKS, TIER_MASS, TIER_COLORS, CHASE_MEDALS, shortName } from './game.js';
import { TIER_NAMES } from './geo.js';
import { MISSIONS } from './save.js';

const $ = (s, r = document) => r.querySelector(s);
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
export const fmtT = (t) => { t = Math.max(0, Math.ceil(t)); return ((t / 60) | 0) + ':' + String(t % 60).padStart(2, '0'); };
export const fmtM = (m) => Math.round(m).toLocaleString('en-US');
const swirl = (col, size = 44) => `<i class="swirl" style="--c:${col};width:${size}px;height:${size}px"></i>`;
const MEDALS = ['GOLD', 'SILVER', 'BRONZE'];

export class UI {
  constructor(app) {
    this.app = app;
    this.root = $('#ui');
    this.hud = $('#hud');
    this.tags = $('#tags');
    this.pops = $('#pops');
    this.tagEls = new Map();
    this.lastBoard = '';
    this.popQ = [];
    this.lastPop = null;
  }
  // ---------------- HUD ----------------
  showHud(on, mode) {
    this.hud.classList.toggle('hidden', !on);
    this.tags.classList.toggle('hidden', !on && mode !== 'attract');
    this.hud.dataset.mode = mode || '';
  }
  clearTags() { this.tags.innerHTML = ''; this.tagEls.clear(); this.pops.innerHTML = ''; }
  // big: this rival can strip us, so its tag goes red (readable before contact)
  tag(st, x, y, vis, big = false) {
    let e = this.tagEls.get(st);
    if (!e) {
      e = h('div', 'tag' + (st.isPlayer ? ' you' : ''), `<i style="background:${st.color}"></i><span></span>`);
      e.querySelector('span').textContent = st.name;
      this.tags.appendChild(e);
      this.tagEls.set(st, e);
    }
    if (!vis) { e.style.display = 'none'; return; }
    e.style.display = '';
    if (e.classList.contains('big') !== big) e.classList.toggle('big', big);
    e.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
  }
  timer(t, label, warn) {
    $('#tVal').textContent = typeof t === 'string' ? t : fmtT(t);
    $('#tLabel').textContent = label;
    $('#timer').classList.toggle('warn', !!warn);
  }
  board(list, me) {
    const top = list.slice(0, 5);
    const narrow = innerWidth < 420;
    const nm = (s) => esc(narrow && !s.isPlayer ? shortName(s.name) : s.name);
    let html = top.map((s, i) => `<li class="${s === me ? 'you' : ''}${s.dead ? ' dead' : ''}"><em>${i + 1}</em><i style="background:${s.color}"></i><span>${nm(s)}</span><b>${fmtM(s.mass)}</b></li>`).join('');
    const mi = list.indexOf(me);
    if (me && mi >= 5) html += `<li class="you sep"><em>${mi + 1}</em><i style="background:${me.color}"></i><span>YOU</span><b>${fmtM(me.mass)}</b></li>`;
    if (html !== this.lastBoard) { $('#board').innerHTML = `<h4>LEADERBOARD</h4><ol>${html}</ol>`; this.lastBoard = html; }
  }
  me(st, ringCap) {
    const t = st.tier;
    const lo = TIER_MASS[t], hi = TIER_MASS[t + 1];
    const p = hi ? Math.max(0, Math.min(1, (st.mass - lo) / (hi - lo))) : 1;
    $('#ringProg').style.strokeDashoffset = String(289 * (1 - p));
    $('#mass').textContent = fmtM(st.mass);
    if (this.catT !== t) { this.catT = t; const c = $('#cat'); c.textContent = 'CAT ' + (t + 1); c.style.background = TIER_COLORS[t]; c.style.color = t === 0 ? '#263045' : '#fff'; }
    $('#nextTxt').innerHTML = hi ? `Next: <b>${TIER_NAMES[t + 1].toUpperCase()}</b> at ${fmtM(hi)}` : '<b>MAXIMUM STORM</b>';
    const ammo = $('#ammo');
    ammo.textContent = st.ring.length;
    $('#flingBtn').classList.toggle('empty', !st.ring.length);
    $('#debris').innerHTML = `<i style="width:${(st.ring.length / ringCap) * 100}%"></i>`;
    $('#debrisN').textContent = `${st.ring.length}/${ringCap}`;
  }
  // Score pops. Same-label pops within 0.9 s merge into one counter ("+CAR ×3"),
  // so a Category 6 storm eating a block reads as a few big labels, not a
  // cloud of text. At most POP_MAX are alive; the oldest is dropped early.
  pop(label, mass, x, y, big) {
    const now = performance.now();
    const L = this.popQ.find((q) => q.label === label && q.el.isConnected && now - q.t < 900);
    if (L) {
      L.n++; L.mass += mass; L.t = now;
      L.el.querySelector('b').textContent = '+' + label + (L.n > 1 ? ' ×' + L.n : '');
      L.el.querySelector('small').textContent = '+' + fmtM(L.mass);
      L.el.classList.remove('bump'); void L.el.offsetWidth; L.el.classList.add('bump');
      return;
    }
    const e = h('div', 'pop' + (big ? ' big' : ''), `<b>+${label}</b><small>+${fmtM(mass)}</small>`);
    this.place(e, x, y, big ? 0 : 1);
    this.popQ.push({ label, mass, n: 1, t: now, el: e });
  }
  flyText(text, x, y, cls = '') {
    const now = performance.now();
    if (cls === 'hit') {
      const L = this.popQ.find((q) => q.label === '#hit' && q.el.isConnected && now - q.t < 700);
      const n = +(String(text).match(/\d+/) || [1])[0];
      if (L) { L.n += n; L.t = now; L.el.querySelector('b').textContent = 'HIT! −' + L.n; L.el.classList.remove('bump'); void L.el.offsetWidth; L.el.classList.add('bump'); return; }
      const e = h('div', 'pop hit', `<b>${text}</b>`);
      this.place(e, x, y, 0);
      this.popQ.push({ label: '#hit', n, t: now, el: e });
      return;
    }
    const e = h('div', 'pop ' + cls, `<b>${text}</b>`);
    this.place(e, x, y, 0);
  }
  place(e, x, y, spread) {
    // fan new pops out so they never stack on the same pixel
    const live = this.popQ.filter((q) => q.el.isConnected);
    if (live.length >= 7) { live[0].el.remove(); }
    this.popQ = this.popQ.filter((q) => q.el.isConnected);
    const k = live.length % 5;
    e.style.left = x + (spread ? (k - 2) * 44 : 0) + 'px'; e.style.top = y - (spread ? (k % 2) * 26 : 0) + 'px';
    this.pops.appendChild(e);
    setTimeout(() => e.remove(), 1150);
  }
  banner(big, small, col) {
    const b = $('#banner');
    b.innerHTML = `<b style="--c:${col || '#ff7a6b'}">${big}</b>${small ? '<span>' + small + '</span>' : ''}`;
    b.classList.remove('go'); void b.offsetWidth; b.classList.add('go');
  }
  toast(html) {
    const t = h('div', 'toast', html);
    $('#toasts').appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }
  dead(on, killer, t) {
    const d = $('#dead');
    d.classList.toggle('on', on);
    if (on) d.innerHTML = `<b>ABSORBED!</b><span>by <i style="color:${killer.color}">${esc(killer.name)}</i></span><small>back in ${Math.max(0, t).toFixed(1)}s</small>`;
  }
  arrow(on, ang, dist) {
    const a = $('#arrow');
    a.style.display = on ? '' : 'none';
    if (on) { a.style.transform = `translate(-50%,-50%) rotate(${ang}rad) translate(110px) `; a.querySelector('span').textContent = Math.round(dist) + 'm'; }
  }
  // ---------------- screens ----------------
  clear() { this.root.innerHTML = ''; }
  title(d) {
    const app = this.app;
    this.clear();
    const s = h('div', 'screen title');
    const modes = [
      { id: 'classic', name: 'CLASSIC', sub: '2:00 vs 9 storms' },
      { id: 'daily', name: 'DAILY TOWN', sub: d.daily.streak ? `Streak ${d.daily.streak} 🔥` : 'Same town for everyone' },
      { id: 'chase', name: 'STORM CHASE', sub: d.chaseBest ? `Best ${d.chaseBest.toFixed(1)}s` : 'Clear a village, fast' },
    ];
    // a fresh player sees the modes and PLAY; perks appear after the first round
    const showPerks = d.rounds >= 1 || d.stars >= 6;
    const perks = showPerks ? `<div class="perks"><span class="lbl">PERK</span>${PERKS.map((p) => {
      const lock = d.stars < p.stars && !(d.unlocked || []).includes(p.id);
      return `<button class="perk ${d.perk === p.id ? 'on' : ''} ${lock ? 'locked' : ''}" data-perk="${p.id}" title="${p.desc}"><b>${p.name}</b><small>${lock ? '🔒 ' + p.stars + '★' : p.desc}</small></button>`;
    }).join('')}</div>` : '';
    const sw = swirl((SKINS.find((k) => k.id === d.skin) || SKINS[0]).skin, 22);
    const row = app.touch
      ? `<button class="sbtn" data-a="locker">${sw} Locker</button>`
      : `<button class="sbtn" data-a="skins">${sw} Skins</button><button class="sbtn" data-a="missions">🎯 Missions</button><button class="sbtn" data-a="trophies">🏆 Trophies</button>`;
    s.innerHTML = `
      <div class="topbar"><div class="stars">★ <b>${d.stars}</b></div>
        <button class="ibtn" data-a="mute" title="Sound">${d.sfx ? '🔊' : '🔈'}</button></div>
      <div class="logo"><div class="logo-swirl"></div><h1>TWISTER<span>.io</span></h1><p>Suck up the town. Fling it at rivals. Biggest storm wins.</p></div>
      <div class="modes">${modes.map((m) => `<button class="mode ${d.mode === m.id ? 'on' : ''}" data-mode="${m.id}"><b>${m.name}</b><small>${m.sub}</small></button>`).join('')}</div>
      ${perks}
      <button class="play" data-a="play">PLAY</button>
      <div class="row">${row}</div>
      <div class="hint">${app.touch ? 'Drag anywhere to steer · FLING and DASH buttons' : 'Mouse steers · Click to fling · Shift to dash &nbsp;|&nbsp; WASD works too'}</div>`;
    s.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      app.snd.init(); app.snd.click();
      if (b.dataset.mode) { d.mode = b.dataset.mode; app.persist(); this.title(d); }
      else if (b.dataset.perk) { if (!b.classList.contains('locked')) { d.perk = b.dataset.perk; app.persist(); this.title(d); } }
      else if (b.dataset.a === 'play') app.play(d.mode);
      else if (b.dataset.a === 'skins') this.skins(d);
      else if (b.dataset.a === 'missions') this.missions(d);
      else if (b.dataset.a === 'trophies') this.trophies(d);
      else if (b.dataset.a === 'locker') this.locker(d, 'skins');
      else if (b.dataset.a === 'mute') { d.sfx = d.music = !d.sfx; app.snd.setSfx(d.sfx); app.snd.setMusic(d.music); app.persist(); this.title(d); }
    });
    this.root.appendChild(s);
  }
  // phones: Skins / Missions / Trophies in one tabbed modal
  locker(d, tab) {
    const wrap = h('div', 'locker');
    const tabs = h('div', 'tabs', ['skins', 'missions', 'trophies'].map((t) => `<button class="tab ${t === tab ? 'on' : ''}" data-tab="${t}">${t === 'skins' ? 'Skins' : t === 'missions' ? '🎯 Missions' : '🏆 Trophies'}</button>`).join(''));
    const body = tab === 'skins' ? this.skinsBody(d) : tab === 'missions' ? this.missionsBody(d) : this.trophiesBody(d);
    wrap.append(tabs, body);
    const m = this.modal('Locker', wrap, () => this.title(d));
    tabs.addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (!b) return; this.app.snd.click(); m.remove(); this.locker(d, b.dataset.tab); });
    body.addEventListener('click', (e) => {
      const s = e.target.closest('[data-skin]');
      if (!s || s.classList.contains('locked')) return;
      d.skin = s.dataset.skin; this.app.persist(); this.app.snd.click();
      m.remove(); this.title(d); this.locker(d, 'skins');
    });
  }
  modal(title, body, onBack) {
    const m = h('div', 'scrim');
    m.innerHTML = `<div class="card"><header><h2>${title}</h2><button class="x" data-a="x">✕</button></header><div class="body"></div></div>`;
    m.querySelector('.body').appendChild(body);
    m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-a=x]')) { this.app.snd.click(); m.remove(); onBack && onBack(); } });
    this.root.appendChild(m);
    return m;
  }
  skinsBody(d) {
    const b = h('div', 'skins');
    b.innerHTML = SKINS.map((k) => {
      const lock = d.stars < k.stars;
      return `<button class="skin ${d.skin === k.id ? 'on' : ''} ${lock ? 'locked' : ''}" data-skin="${k.id}">${swirl(k.skin, 58).replace('class="swirl"', `class="swirl" data-d="${k.dust}"`)}<b>${k.name}</b><small>${lock ? '🔒 ' + k.stars + '★' : d.skin === k.id ? 'Equipped' : 'Tap to use'}</small></button>`;
    }).join('') + `<p class="note">Earn ★ from rank, destruction and missions. You have <b>${d.stars}★</b>.</p>`;
    return b;
  }
  skins(d) {
    const b = this.skinsBody(d);
    const m = this.modal('Storm Skins', b, () => this.title(d));
    b.addEventListener('click', (e) => {
      const s = e.target.closest('[data-skin]');
      if (!s || s.classList.contains('locked')) return;
      d.skin = s.dataset.skin; this.app.persist(); this.app.snd.click();
      m.remove(); this.title(d); this.skins(d);
    });
  }
  missionsBody(d) {
    const b = h('div', 'missions');
    const act = d.missions.active.map((id) => MISSIONS.find((m) => m.id === id)).filter(Boolean);
    b.innerHTML = `<h3>Active · +2★ each</h3>` + act.map((m) => `<div class="mis">🎯 ${m.text}</div>`).join('') +
      `<h3>Done (${d.missions.done.length}/${MISSIONS.length})</h3>` + (d.missions.done.map((id) => `<div class="mis done">✔ ${MISSIONS.find((m) => m.id === id)?.text || id}</div>`).join('') || '<p class="note">None yet. Go wreck something.</p>');
    return b;
  }
  missions(d) { this.modal('Missions', this.missionsBody(d), () => this.title(d)); }
  trophiesBody(d) {
    const b = h('div', 'shelf');
    const it = (icon, label, val) => `<div class="trophy"><div class="ic">${icon}</div><b>${val}</b><small>${label}</small></div>`;
    b.innerHTML = it('🌪️', 'Record mass', fmtM(d.recMass)) + it('🏠', 'Biggest lift', d.recObj || '—') + it('👑', 'Wins', d.wins) +
      it('💥', 'Rivals absorbed', d.absorbs) + it('⏱️', 'Chase best', d.chaseBest ? d.chaseBest.toFixed(1) + 's' : '—') + it('🔥', 'Daily streak', d.daily.streak || 0) +
      it('🎮', 'Rounds', d.rounds) + it('★', 'Stars', d.stars);
    return b;
  }
  trophies(d) { this.modal('Trophy Shelf', this.trophiesBody(d), () => this.title(d)); }
  pause(d, onResume, onQuit, onRestart) {
    const b = h('div', 'menu');
    const draw = () => {
      b.innerHTML = `<button class="btn big" data-a="r">▶ Resume</button>
        <div class="row2"><button class="btn" data-a="m">Music: ${d.music ? 'ON' : 'OFF'}</button><button class="btn" data-a="s">Sound: ${d.sfx ? 'ON' : 'OFF'}</button></div>
        <div class="row2"><button class="btn" data-a="re">↻ Restart</button><button class="btn" data-a="q">Menu</button></div>
        <p class="note">Mouse steers · Click/E fling · Shift/Space dash · Esc pause · R restart</p>`;
    };
    draw();
    const m = this.modal('Paused', b, onResume);
    b.addEventListener('click', (e) => {
      const a = e.target.closest('button')?.dataset.a;
      if (!a) return;
      this.app.snd.click();
      if (a === 'r') { m.remove(); onResume(); }
      else if (a === 'q') { m.remove(); onQuit(); }
      else if (a === 're') { m.remove(); onRestart(); }
      else if (a === 'm') { d.music = !d.music; this.app.snd.setMusic(d.music); this.app.persist(); draw(); }
      else if (a === 's') { d.sfx = !d.sfx; this.app.snd.setSfx(d.sfx); this.app.persist(); draw(); }
    });
    this.pauseEl = m;
  }
  results(r, d, onAgain, onMenu, onShare) {
    this.clear();
    const s = h('div', 'scrim res');
    const chase = r.mode === 'chase';
    const pod = chase ? '' : `<div class="podium">${[1, 0, 2].map((i) => {
      const st = r.list[i];
      if (!st) return '';
      return `<div class="pod p${i + 1} ${st.isPlayer ? 'you' : ''}">${swirl(st.color, i === 0 ? 64 : 50)}<span>${esc(st.name)}</span><b>${fmtM(st.mass)}</b><div class="step">${i + 1}</div></div>`;
    }).join('')}</div>`;
    const head = chase
      ? (r.cleared ? `<h1 class="rank">${r.time.toFixed(1)}s</h1><div class="medal m${r.medal}">${r.medal < 3 ? MEDALS[r.medal] : 'CLEARED'}</div>` : `<h1 class="rank">${Math.floor(r.pct)}%</h1><div class="medal m3">TIME UP</div>`)
      : `<h1 class="rank">#${r.rank}<small> of ${r.list.length}</small></h1><div class="medal ${r.rank === 1 ? 'm0' : 'm3'}">${r.rank === 1 ? 'BIGGEST STORM!' : r.rank <= 3 ? 'PODIUM!' : 'STORM OVER'}</div>`;
    const medalInfo = chase ? `<p class="note">Gold ${CHASE_MEDALS[0]}s · Silver ${CHASE_MEDALS[1]}s · Bronze ${CHASE_MEDALS[2]}s</p>` : '';
    // one context tip on a losing card, so a bad round still teaches something
    let tip = '';
    if (!chase && r.rank > 3) {
      if (r.deaths >= 2 || (r.deaths >= 1 && r.tier <= 1)) tip = `A red name tag or a red ring means a storm can eat you: run, and ${this.app.touch ? 'hit DASH' : 'dash with Shift'}.`;
      else if (r.tier <= 1) tip = 'Stay on cones, bins and people until Category 2, then go for cars.';
      else if (r.hits === 0) tip = `${this.app.touch ? 'Tap FLING' : 'Fling (click)'} at storms your own size to knock their armour off.`;
      else tip = 'When your block is empty, dash to the next one instead of circling.';
      tip = `<div class="tip">💡 ${tip}</div>`;
    }
    s.innerHTML = `<div class="card wide"><div class="body">
      ${head}${pod}
      <div class="stats">
        <div><b>${fmtM(r.mass)}</b><small>mass${r.newRec ? ' · NEW RECORD' : ''}</small></div>
        <div><b>${r.pct.toFixed(1)}%</b><small>town destroyed</small></div>
        <div><b>${r.best || '—'}</b><small>biggest lift</small></div>
        <div><b>${r.kills}</b><small>rivals absorbed</small></div>
      </div>
      ${medalInfo}${tip}
      <div class="earn">+${r.stars}★${r.missionsDone.length ? `<div class="mchips">${r.missionsDone.map((m) => `<span>🎯 ${esc(m.text)} <b>+2★</b></span>`).join('')}</div>` : ''}${r.unlocks.length ? `<div class="unl">Unlocked: ${r.unlocks.join(', ')}</div>` : ''}</div>
      ${r.mode === 'daily' ? `<div class="daily">Daily Town ${r.date} · Streak ${d.daily.streak} 🔥 · Today's best ${fmtM(d.daily.best[r.date] || 0)}</div>` : ''}
      <div class="row2">
        <button class="btn big go" data-a="again">↻ Play again</button>
        ${r.mode === 'daily' ? '<button class="btn" data-a="share">Share</button>' : ''}
        <button class="btn" data-a="menu">Menu</button>
      </div>
      ${this.app.touch ? "" : `<p class="note">Enter / R / Space to play again</p>`}
    </div></div>`;
    s.addEventListener('click', (e) => {
      const a = e.target.closest('button')?.dataset.a;
      if (!a) return;
      this.app.snd.click();
      if (a === 'again') onAgain(); else if (a === 'menu') onMenu(); else if (a === 'share') onShare(s.querySelector('[data-a=share]'));
    });
    this.root.appendChild(s);
  }
}
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }
