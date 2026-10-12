// TANK DUEL - boot, loop, input, UI screens, saving, test hooks.
import { Terrain, W, H, THEMES } from './terrain.js';
import { Fx } from './fx.js';
import { Sfx } from './audio.js';
import { Game, RANKS, TURN_TIME } from './game.js';
import { WEAPONS, WEAPON_BY_ID } from './weapons.js';
import { Renderer, weaponIcon } from './render.js';

const KEY = 'pd.tank-duel';
const params = new URLSearchParams(location.search);
const save = load();
function load() {
  const d = { fired: 0, unlocked: 0, rank: 0, wins: [0, 0, 0, 0], losses: [0, 0, 0, 0], streak: 0, bestStreak: 0, pvp: 0, muted: false, played: 0 };
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s) Object.assign(d, s); } catch (e) { /* storage blocked */ }
  return d;
}
function store() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } }

const canvas = document.getElementById('c');
const ui = document.getElementById('ui');
const terrain = new Terrain();
const fx = new Fx();
const sfx = new Sfx();
const nullSfx = new Proxy({}, { get: () => () => {} });
sfx.setMuted(save.muted);
const game = new Game(terrain, fx, nullSfx);
game.compact = window.innerHeight > window.innerWidth * 1.05;
const R = new Renderer(canvas);
let state = 'title';
let view = { s: 1, ox: 0, oy: 0, vw: 1, vh: 1, dpr: 1 };
let camX = W / 2, zoom = 0;
const aim = { show: true, drag: null };

// ---------------------------------------------------------------- DOM
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const $ = (sel) => ui.querySelector(sel);

ui.innerHTML = `
<div id="title" class="screen">
  <div class="tcard">
    <div class="logo"><h1>TANK<span>DUEL</span></h1><p>Pull back. Let go. Make a crater.</p></div>
    <button class="btn play" id="bPlay"><span class="lbl">PLAY</span><small id="playSub">vs Rookie bot</small></button>
    <div class="ranks" id="ranks"></div>
    <button class="btn alt" id="bPvp"><span class="lbl">2 PLAYERS</span><small>same device, take turns</small></button>
    <div class="tstats" id="tstats"></div>
    <div class="rot"><i></i>best in landscape</div>
  </div>
</div>
<div id="hud" class="hidden">
  <div class="pcard p0"><div class="pname"><i></i><b id="n0">YOU</b><span class="pips" id="pip0"></span></div><div class="hpbar"><div class="hpghost" id="g0"></div><div class="hpfill" id="h0"></div><em id="hv0">100</em></div></div>
  <div class="mid">
    <div class="round" id="roundLbl">ROUND 1</div>
    <div class="wind" id="wind"><small class="wl">WIND</small><span class="warr" id="warrL">&#9664;</span><b id="windV">0</b><span class="warr" id="warrR">&#9654;</span></div>
    <div class="timer" id="timer"></div>
    <div class="rot"><i></i>rotate for a bigger view</div>
  </div>
  <div class="pcard p1"><div class="pname"><span class="pips" id="pip1"></span><b id="n1">BOT</b><i></i></div><div class="hpbar"><div class="hpghost" id="g1"></div><div class="hpfill" id="h1"></div><em id="hv1">100</em></div></div>
</div>
<div id="bar" class="hidden">
  <div class="wsel">
    <button class="ibtn" id="wPrev" aria-label="previous weapon">&#9664;</button>
    <button class="wbtn" id="wBtn"><span class="wic" id="wIcon"></span><span class="wtx"><b id="wName">Shell</b><small id="wAmmo">&infin;</small></span></button>
    <button class="ibtn" id="wNext" aria-label="next weapon">&#9654;</button>
  </div>
  <div class="readout"><div><small>ANGLE</small><b id="angV">50&deg;</b></div><div><small>POWER</small><b id="powV">62</b></div></div>
  <div class="moves"><button class="ibtn" id="mL" aria-label="move left">&#9664;</button><div><small>MOVE</small><b id="movV">2</b></div><button class="ibtn" id="mR" aria-label="move right">&#9654;</button></div>
  <button class="fire" id="bFire">FIRE</button>
</div>
<div id="wtip" class="wtip"></div>
<div id="hint" class="hint hidden">Drag anywhere to aim &middot; let go to fire</div>
<div id="banner" class="banner hidden"></div>
<div id="picker" class="scrim hidden"><div class="panel"><div class="ph"><b>WEAPONS</b><button class="ibtn x" id="pClose">&times;</button></div><div class="grid" id="pGrid"></div><div class="pdesc" id="pDesc"></div></div></div>
<div id="results" class="scrim hidden"><div class="panel res"></div></div>
<div id="pause" class="scrim hidden"><div class="panel"><div class="ph"><b>PAUSED</b></div>
  <div class="col"><button class="btn play" id="pRes"><span class="lbl">RESUME</span></button><button class="btn alt" id="pRestart"><span class="lbl">RESTART MATCH</span></button><button class="btn alt" id="pMenu"><span class="lbl">MAIN MENU</span></button></div></div></div>
<button class="corner pausebtn hidden" id="bPause" aria-label="pause"><i></i><i></i></button>
<button class="corner mutebtn" id="bMute" aria-label="mute"></button>
`;

const els = {};
['title', 'hud', 'bar', 'banner', 'picker', 'results', 'pause', 'bPause', 'bMute', 'hint', 'ranks', 'playSub', 'tstats', 'n0', 'n1', 'pip0', 'pip1', 'h0', 'h1', 'g0', 'g1', 'hv0', 'hv1', 'roundLbl', 'windV', 'warrL', 'warrR', 'timer', 'wIcon', 'wName', 'wAmmo', 'angV', 'powV', 'movV', 'bFire', 'pGrid', 'pDesc', 'wtip'].forEach((id) => { els[id] = document.getElementById(id); });
const show = (el, on) => el.classList.toggle('hidden', !on);
const iconCache = {};
// icons are drawn once and kept as data URLs (toDataURL every turn cost 10 ms+ per turn, seconds on the first call)
const icon = (id, size) => { const k = id + size; if (!iconCache[k]) iconCache[k] = weaponIcon(id, size).toDataURL(); const img = new Image(); img.src = iconCache[k]; img.width = size; img.height = size; return img; };

function setMuteIcon() { els.bMute.innerHTML = sfx.muted ? '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2" fill="none"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 8.5a5 5 0 010 7M18.5 6a8.5 8.5 0 010 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>'; }
setMuteIcon();
function toggleMute() { sfx.unlock(); sfx.setMuted(!sfx.muted); save.muted = sfx.muted; store(); setMuteIcon(); }
els.bMute.onclick = toggleMute;

// ---------------------------------------------------------------- title
function buildTitle() {
  els.ranks.innerHTML = '';
  RANKS.forEach((r, i) => {
    const locked = i > save.unlocked;
    const b = h('button', 'chip' + (i === save.rank ? ' on' : '') + (locked ? ' locked' : ''), `${locked ? '<svg viewBox="0 0 24 24"><path d="M7 11V8a5 5 0 0110 0v3h1v10H6V11h1zm2 0h6V8a3 3 0 00-6 0v3z"/></svg>' : ''}${r.name}${save.wins[i] ? `<em>${save.wins[i]}</em>` : ''}`);
    b.onclick = () => {
      if (locked) { b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); els.playSub.textContent = `Beat ${RANKS[i - 1].name} to unlock`; return; }
      save.rank = i; store(); buildTitle(); sfx.unlock(); sfx.click();
    };
    els.ranks.appendChild(b);
  });
  els.playSub.textContent = `vs ${RANKS[save.rank].name} bot · best of 5`;
  const tw = save.wins.reduce((a, b) => a + b, 0), tl = save.losses.reduce((a, b) => a + b, 0);
  els.tstats.innerHTML = tw + tl ? `<span>Wins <b>${tw}</b></span><span>Losses <b>${tl}</b></span><span>Best streak <b>${save.bestStreak}</b></span>` : '<span>12 weapons · wind · craters · best of 5</span>';
}
$('#bPlay').onclick = () => { sfx.unlock(); sfx.click(); startMatch('bot', save.rank); };
$('#bPvp').onclick = () => { sfx.unlock(); sfx.click(); startMatch('pvp', 0); };

function toTitle() {
  state = 'title';
  game.sfx = nullSfx; sfx.whistleStop();
  game.newMatch('demo', 2);
  buildTitle();
  show(els.title, true); show(els.hud, false); show(els.bar, false); show(els.bPause, false); show(els.results, false); show(els.pause, false); show(els.picker, false); show(els.hint, false);
}
function startMatch(mode, rank) {
  state = 'play';
  game.sfx = sfx;
  game.newMatch(mode, rank);
  show(els.title, false); show(els.hud, true); show(els.bar, true); show(els.bPause, true); show(els.results, false); show(els.pause, false); show(els.picker, false);
  els.n0.textContent = game.tanks[0].name; els.n1.textContent = game.tanks[1].name;
  show(els.hint, true); hintShown = true;
  refreshWeapon();
}
let hintShown = false;

// ---------------------------------------------------------------- banners
let bannerT = 0;
function banner(html, cls = '', t = 1.3) {
  els.banner.className = 'banner ' + cls; els.banner.innerHTML = html; bannerT = t;
  void els.banner.offsetWidth; els.banner.classList.add('in');
}
game.on('round', (n) => {
  if (state !== 'play') return;
  banner(`<small>${THEMES[game.themeKey].name}</small>ROUND ${n}`, 'big', 1.4);
  sfx.roundBell(); refreshWeapon();
});
game.on('turn', ({ first }) => {
  if (state !== 'play') return;
  refreshWeapon();
  const tk = game.cur;
  if (game.mode === 'pvp' && !first) banner(`<span style="color:${tk.col}">${tk.name}</span> - your turn`, 'small', 1.0);
});
game.on('roundEnd', (wi) => {
  if (state !== 'play') return;
  let txt;
  if (wi < 0) txt = 'DRAW!';
  else if (game.mode === 'bot') txt = wi === 0 ? 'ROUND WON!' : 'ROUND LOST';
  else txt = `${game.tanks[wi].name} TAKES IT`;
  banner(`${txt}<small>${game.score[0]} - ${game.score[1]}</small>`, 'big ' + (game.mode === 'bot' && wi === 1 ? 'bad' : 'good'), 2.2);
  sfx.jingle(game.mode !== 'bot' || wi === 0);
});
game.on('matchEnd', (wi) => { if (state === 'play') setTimeout(() => showResults(wi), 300); });
game.on('fire', () => {
  if (hintShown) { show(els.hint, false); hintShown = false; }
  closePicker();
  if (state === 'play' && !game.cur.isBot) { save.fired = (save.fired || 0) + 1; if (save.fired <= 3) store(); }
});

// ---------------------------------------------------------------- results
function showResults(wi) {
  state = 'results';
  sfx.whistleStop();
  const st = game.stats, bot = game.mode === 'bot';
  let unlockMsg = '';
  if (bot) {
    save.played++;
    if (wi === 0) {
      save.wins[game.rank]++; save.streak++; save.bestStreak = Math.max(save.bestStreak, save.streak);
      if (game.rank === save.unlocked && save.unlocked < RANKS.length - 1) { save.unlocked++; unlockMsg = `<div class="unlock">NEW RANK UNLOCKED: <b>${RANKS[save.unlocked].name.toUpperCase()}</b></div>`; }
    } else { save.losses[game.rank]++; save.streak = 0; }
  } else save.pvp++;
  store();
  const head = bot ? (wi === 0 ? 'VICTORY!' : 'DEFEAT') : `${game.tanks[wi].name} WINS!`;
  const acc = (i) => (st.shots[i] ? Math.round((st.hits[i] / st.shots[i]) * 100) : 0) + '%';
  const nextRank = bot && wi === 0 && game.rank < RANKS.length - 1 && game.rank + 1 <= save.unlocked;
  const p = $('#results .panel');
  p.className = 'panel res ' + (bot && wi === 1 ? 'lose' : 'win');
  p.innerHTML = `
    <div class="rhead">${head}</div>
    <div class="rscore"><span style="color:${game.tanks[0].col}">${game.score[0]}</span><i>-</i><span style="color:${game.tanks[1].col}">${game.score[1]}</span></div>
    ${unlockMsg}
    <table class="rstats"><tr><th></th><th style="color:${game.tanks[0].col}">${game.tanks[0].name}</th><th style="color:${game.tanks[1].col}">${game.tanks[1].name}</th></tr>
      <tr><td>Damage</td><td>${st.dmg[0]}</td><td>${st.dmg[1]}</td></tr>
      <tr><td>Accuracy</td><td>${acc(0)}</td><td>${acc(1)}</td></tr>
      <tr><td>Direct hits</td><td>${st.direct[0]}</td><td>${st.direct[1]}</td></tr>
      <tr><td>Best shot</td><td>${st.best[0]}</td><td>${st.best[1]}</td></tr></table>
    ${bot ? `<div class="rstreak">Win streak <b>${save.streak}</b> &middot; best <b>${save.bestStreak}</b></div>` : ''}
    <div class="col">
      ${nextRank ? `<button class="btn play" id="rNext"><span class="lbl">NEXT: ${RANKS[game.rank + 1].name.toUpperCase()}</span><small>tougher bot</small></button>` : ''}
      <button class="btn ${nextRank ? 'alt' : 'play'}" id="rAgain"><span class="lbl">REMATCH</span><small>Space / Enter</small></button>
      <button class="btn alt" id="rMenu"><span class="lbl">MENU</span></button>
    </div>`;
  show(els.results, true); show(els.bar, false); show(els.bPause, false); els.banner.classList.remove('in'); bannerT = 0;
  sfx.jingle(!bot || wi === 0);
  $('#rAgain').onclick = () => { sfx.click(); startMatch(game.mode, game.rank); };
  $('#rMenu').onclick = () => { sfx.click(); toTitle(); };
  if (nextRank) $('#rNext').onclick = () => { sfx.click(); save.rank = game.rank + 1; store(); startMatch('bot', save.rank); };
}

// ---------------------------------------------------------------- pause
function pause(on) {
  if (on && state !== 'play') return;
  if (!on && state !== 'paused') return;
  state = on ? 'paused' : 'play';
  show(els.pause, on);
  if (on) sfx.whistleStop();
}
els.bPause.onclick = () => { sfx.click(); pause(true); };
$('#pRes').onclick = () => pause(false);
$('#pRestart').onclick = () => { show(els.pause, false); startMatch(game.mode, game.rank); };
$('#pMenu').onclick = () => toTitle();

// ---------------------------------------------------------------- weapons
const canAct = () => state === 'play' && game.phase === 'aim' && !game.cur.isBot;
let wtipT = 0;
function weaponTip() {
  const w = WEAPON_BY_ID[game.cur.weapon];
  els.wtip.innerHTML = `<b>${w.name}</b> ${w.desc}`; els.wtip.classList.add('in'); wtipT = 2.4;
  if (hintShown) { show(els.hint, false); hintShown = false; } // same spot as the first-turn hint
}
function refreshWeapon() {
  const tk = game.cur; if (!tk) return;
  const w = WEAPON_BY_ID[tk.weapon];
  if (els.wIcon.dataset.id !== w.id) { els.wIcon.innerHTML = ''; els.wIcon.appendChild(icon(w.id, 34)); els.wIcon.dataset.id = w.id; }
  els.wName.textContent = w.name;
  els.wAmmo.innerHTML = tk.ammo[w.id] === Infinity ? '&infin;' : 'x' + tk.ammo[w.id];
}
$('#wPrev').onclick = () => { if (!canAct()) return; game.cycleWeapon(-1); sfx.click(); refreshWeapon(); weaponTip(); };
$('#wNext').onclick = () => { if (!canAct()) return; game.cycleWeapon(1); sfx.click(); refreshWeapon(); weaponTip(); };
$('#wBtn').onclick = () => { if (!canAct()) return; openPicker(); };
function openPicker() {
  const tk = game.cur;
  els.pGrid.innerHTML = '';
  WEAPONS.forEach((w) => {
    const n = tk.ammo[w.id];
    const b = h('button', 'wtile' + (w.id === tk.weapon ? ' on' : '') + (n > 0 ? '' : ' out'));
    b.appendChild(icon(w.id, 40));
    b.appendChild(h('b', '', w.name));
    b.appendChild(h('small', '', n === Infinity ? '&infin;' : 'x' + n));
    b.onmouseenter = () => { els.pDesc.textContent = w.desc; };
    b.onclick = () => { if (n > 0) { game.selectWeapon(w.id); sfx.click(); refreshWeapon(); closePicker(); weaponTip(); } };
    els.pGrid.appendChild(b);
  });
  els.pDesc.textContent = WEAPON_BY_ID[tk.weapon].desc;
  show(els.picker, true);
}
function closePicker() { show(els.picker, false); }
$('#pClose').onclick = closePicker;
els.picker.addEventListener('pointerdown', (e) => { if (e.target === els.picker) closePicker(); });

// ---------------------------------------------------------------- moves + fire
$('#mL').onclick = () => { if (canAct() && game.move(-1)) refreshBar(true); };
$('#mR').onclick = () => { if (canAct() && game.move(1)) refreshBar(true); };
els.bFire.onclick = () => { sfx.unlock(); if (canAct()) game.fire(); };

// ---------------------------------------------------------------- pointer aiming (slingshot)
const maxPull = () => Math.max(110, Math.min(300, Math.min(view.vw, view.vh) * 0.42));
canvas.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  if (!canAct()) return;
  canvas.setPointerCapture(e.pointerId);
  aim.drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, live: false, a0: game.cur.angle, p0: game.cur.power };
});
canvas.addEventListener('pointermove', (e) => {
  const d = aim.drag; if (!d || d.id !== e.pointerId) return;
  d.x = e.clientX; d.y = e.clientY;
  if (!canAct()) { aim.drag = null; return; }
  const dx = d.sx - d.x, dy = d.sy - d.y, len = Math.hypot(dx, dy);
  if (len < 16) { if (d.live) { game.setAim(d.a0, d.p0); d.live = false; } return; }
  d.live = true;
  let ang = Math.atan2(-dy, dx) * 180 / Math.PI;
  if (ang < 0) ang = ang < -90 ? 180 : 0;
  const pw = Math.min(100, 5 + (len - 16) / (maxPull() - 16) * 95);
  const before = Math.round(game.cur.power / 5);
  game.setAim(ang, pw);
  if (Math.round(pw / 5) !== before) sfx.tick();
});
const endDrag = (e) => {
  const d = aim.drag; if (!d || d.id !== e.pointerId) return;
  aim.drag = null;
  if (d.live && canAct() && e.type === 'pointerup') game.fire();
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

// ---------------------------------------------------------------- keyboard
const keys = {};
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyM') { toggleMute(); return; }
  if (e.code === 'Escape' || e.code === 'KeyP') { if (state === 'play') pause(true); else if (state === 'paused') pause(false); else if (!els.picker.classList.contains('hidden')) closePicker(); return; }
  if (state === 'title' && (e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); sfx.unlock(); startMatch('bot', save.rank); return; }
  if (state === 'results' && (e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); startMatch(game.mode, game.rank); return; }
  if (!canAct()) return;
  if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); sfx.unlock(); game.fire(); }
  else if (e.code === 'KeyQ') { game.cycleWeapon(-1); refreshWeapon(); weaponTip(); sfx.click(); }
  else if (e.code === 'KeyE' || e.code === 'Tab') { e.preventDefault(); game.cycleWeapon(1); refreshWeapon(); weaponTip(); sfx.click(); }
  else if (e.code === 'KeyA') game.move(-1);
  else if (e.code === 'KeyD') game.move(1);
  else if (e.code === 'KeyW') { if (els.picker.classList.contains('hidden')) openPicker(); else closePicker(); }
  if (e.code.startsWith('Arrow')) e.preventDefault();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
function keyAim(dt) {
  if (!canAct()) return;
  const tk = game.cur, f = keys.ShiftLeft || keys.ShiftRight ? 0.2 : 1;
  let a = tk.angle, p = tk.power;
  if (keys.ArrowLeft) a += 45 * f * dt;
  if (keys.ArrowRight) a -= 45 * f * dt;
  if (keys.ArrowUp) p += 35 * f * dt;
  if (keys.ArrowDown) p -= 35 * f * dt;
  if (a !== tk.angle || p !== tk.power) game.setAim(a, p);
}

// ---------------------------------------------------------------- HUD refresh
const cache = {};
const setT = (el, key, v) => { if (cache[key] !== v) { cache[key] = v; el.innerHTML = v; } };
function refreshBar(force) {
  const tk = game.cur; if (!tk) return;
  const disp = tk.angle > 90 ? 180 - tk.angle : tk.angle;
  setT(els.angV, 'ang', Math.round(disp) + '&deg;' + (tk.angle > 90 ? '<i>&#8598;</i>' : '<i>&#8599;</i>'));
  setT(els.powV, 'pow', String(Math.round(tk.power)));
  setT(els.movV, 'mov', String(tk.moves));
  const act = canAct();
  els.bar.classList.toggle('off', !act);
  if (force) cache.mov = null;
}
function refreshHud() {
  game.tanks.forEach((tk, i) => {
    els['h' + i].style.width = Math.max(0, tk.hp) + '%';
    els['g' + i].style.width = Math.max(0, tk.shownHp) + '%';
    setT(els['hv' + i], 'hv' + i, String(Math.ceil(tk.hp)));
    els['h' + i].className = 'hpfill' + (tk.hp <= 25 ? ' low' : tk.hp <= 50 ? ' mid' : '');
    setT(els['pip' + i], 'pip' + i, [0, 1, 2].map((k) => `<i class="${k < game.score[i] ? 'on' : ''}"></i>`).join(''));
  });
  document.querySelectorAll('.pcard').forEach((el, i) => el.classList.toggle('turn', game.turn === i && game.phase === 'aim'));
  setT(els.roundLbl, 'rl', `ROUND ${game.round}`);
  const w = game.wind;
  setT(els.windV, 'wv', w === 0 ? 'CALM' : String(Math.abs(w)));
  els.warrL.style.opacity = w < 0 ? Math.min(1, 0.35 + Math.abs(w) / 8) : 0.12;
  els.warrR.style.opacity = w > 0 ? Math.min(1, 0.35 + Math.abs(w) / 8) : 0.12;
  const showTimer = game.phase === 'aim' && !game.cur.isBot && game.turnT < TURN_TIME - 0.5;
  const tt = Math.ceil(game.turnT);
  setT(els.timer, 'tm', showTimer && tt <= 15 ? tt + 's' : '');
  els.timer.classList.toggle('urgent', tt <= 5);
}

// ---------------------------------------------------------------- layout
function layout() {
  const vw = window.innerWidth, vh = window.innerHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(vw * dpr) || canvas.height !== Math.round(vh * dpr)) { canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr); }
  const portrait = vh > vw * 1.05;
  const barH = els.bar.classList.contains('hidden') ? 0 : els.bar.offsetHeight || (portrait ? 150 : 70);
  const bottom = vh - Math.max(0, barH - (portrait ? 0 : 22));
  const availH = bottom;
  game.compact = portrait; // next round's pads go closer together in portrait
  let s = Math.min(vw / W, availH / (H - 300));
  if (portrait) {
    const sep = game.tanks.length === 2 ? Math.abs(game.tanks[0].x - game.tanks[1].x) : W * 0.8;
    const target = Math.min(availH / (H - 300), Math.max(vw / (W * 0.86), vw / (sep + 330)));
    zoom = zoom ? zoom + (target - zoom) * 0.12 : target;
    if (Math.abs(zoom - target) < 0.002) zoom = target;
    s = zoom;
  } else zoom = 0;
  const ww = W * s;
  let ox;
  if (ww <= vw + 1) ox = (vw - ww) / 2;
  else {
    let fxp;
    if (game.phase === 'aim' || game.phase === 'idle') fxp = game.cur ? (game.cur.x + game.other.x) / 2 : W / 2;
    else fxp = game.focus().x;
    camX += (fxp - camX) * (game.phase === 'fly' ? 0.09 : 0.06);
    ox = Math.max(vw - ww, Math.min(0, vw / 2 - camX * s));
  }
  view = { s, ox, oy: bottom - H * s, vw, vh, dpr, portrait };
}
window.addEventListener('resize', layout);

// ---------------------------------------------------------------- loop
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!G.frozen) tick(dt);
  requestAnimationFrame(frame);
}
function tick(dt) {
  if (state === 'play' || state === 'title' || state === 'results') {
    keyAim(dt);
    game.update(dt);
    if (state === 'title' && game.phase === 'matchEnd') game.newMatch('demo', 2);
  }
  R.update(dt, game.wind);
  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) els.banner.classList.remove('in'); }
  if (wtipT > 0) { wtipT -= dt; if (wtipT <= 0 || state !== 'play' || game.phase !== 'aim') { wtipT = 0; els.wtip.classList.remove('in'); } }
  layout();
  aim.show = state === 'play';
  R.draw(game, view, aim);
  game.hitScale = R.tsc || 1;
  drawDrag(); drawGhost(dt);
  if (state === 'play' || state === 'paused') { refreshHud(); refreshBar(); }
}
let ghostT = 0;
function drawGhost(dt) {
  // a ghost finger pulls back from the tank like a slingshot, so the first shot is obvious
  if (!(state === 'play' && canAct() && !aim.drag && (save.fired || 0) < 3 && game.cur.angle === (game.cur.i === 0 ? 50 : 130))) { ghostT = 0; return; }
  ghostT += dt;
  const tk = game.cur, s = view.s, dir = tk.x < game.other.x ? 1 : -1;
  const ax = view.ox + tk.x * s + dir * Math.min(view.vw * 0.22, 160); let ay = view.oy + (tk.y - 60) * s;
  const cyc = ghostT % 2.2, u = Math.min(1, Math.max(0, (cyc - 0.35) / 1.1)), e = u * u * (3 - 2 * u);
  const pull = Math.min(110, view.vw * 0.25);
  const barTop = els.bar.getBoundingClientRect().top || view.vh;
  ay = Math.min(ay, barTop - pull * 0.65 - 112); // clear of the bar and the weapon tip above it
  const hx = ax - dir * pull * 0.75 * e, hy = ay + pull * 0.65 * e;
  const alpha = cyc < 0.25 ? cyc / 0.25 : cyc > 1.85 ? Math.max(0, (2.2 - cyc) / 0.35) : 1;
  const c = R.ctx; c.setTransform(view.dpr, 0, 0, view.dpr, 0, 0); c.save(); c.globalAlpha = alpha * 0.9;
  if (e > 0.02) { c.strokeStyle = '#fff'; c.lineWidth = 3; c.setLineDash([6, 6]); c.beginPath(); c.moveTo(ax, ay); c.lineTo(hx, hy); c.stroke(); c.setLineDash([]);
    // where the shot goes: opposite of the pull
    c.strokeStyle = '#ffe14d'; c.lineWidth = 4; c.lineCap = 'round'; const fx2 = ax + (ax - hx) * 0.6, fy2 = ay + (ay - hy) * 0.6;
    c.beginPath(); c.moveTo(ax, ay); c.lineTo(fx2, fy2); c.stroke();
    const ang = Math.atan2(fy2 - ay, fx2 - ax); c.fillStyle = '#ffe14d'; c.beginPath(); c.moveTo(fx2 + Math.cos(ang) * 12, fy2 + Math.sin(ang) * 12); c.lineTo(fx2 + Math.cos(ang + 2.4) * 11, fy2 + Math.sin(ang + 2.4) * 11); c.lineTo(fx2 + Math.cos(ang - 2.4) * 11, fy2 + Math.sin(ang - 2.4) * 11); c.closePath(); c.fill(); }
  c.fillStyle = 'rgba(255,255,255,0.35)'; c.strokeStyle = '#fff'; c.lineWidth = 3;
  c.beginPath(); c.arc(ax, ay, 9, 0, Math.PI * 2); c.fill(); c.stroke();
  // fingertip
  c.fillStyle = '#fff'; c.strokeStyle = '#1d1b2e'; c.lineWidth = 3;
  c.beginPath(); c.arc(hx, hy, 15 - (cyc > 0.25 && cyc < 1.6 ? 3 : 0), 0, Math.PI * 2); c.fill(); c.stroke();
  c.font = "700 16px Fredoka, sans-serif"; c.textAlign = 'center'; c.lineWidth = 4; c.strokeStyle = 'rgba(20,16,40,0.85)'; c.fillStyle = '#fff';
  const lbl = e < 0.5 ? 'PRESS' : 'PULL BACK';
  c.strokeText(lbl, hx, hy + 36); c.fillText(lbl, hx, hy + 36);
  c.restore();
}
function drawDrag() {
  const d = aim.drag; if (!d || !d.live) return;
  const c = R.ctx; c.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 3; c.setLineDash([6, 6]); c.lineCap = 'round';
  c.beginPath(); c.moveTo(d.sx, d.sy); c.lineTo(d.x, d.y); c.stroke(); c.setLineDash([]);
  c.fillStyle = 'rgba(255,255,255,0.35)'; c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 2;
  c.beginPath(); c.arc(d.sx, d.sy, 10, 0, Math.PI * 2); c.fill(); c.stroke();
  c.fillStyle = game.cur.col; c.beginPath(); c.arc(d.x, d.y, 14, 0, Math.PI * 2); c.fill(); c.stroke();
  c.font = "700 15px Fredoka, sans-serif"; c.textAlign = 'center'; c.fillStyle = '#fff'; c.strokeStyle = 'rgba(20,16,40,0.85)'; c.lineWidth = 4;
  const lbl = Math.round(game.cur.power) + '%';
  c.strokeText(lbl, d.x, d.y - 24); c.fillText(lbl, d.x, d.y - 24);
}
document.addEventListener('visibilitychange', () => { if (document.hidden) { sfx.whistleStop(); if (state === 'play') pause(true); } });

// ---------------------------------------------------------------- test hooks
const G = window.__G = {
  frozen: false, // tests: stop the real-time loop so step() frames are deterministic
  get state() { return state; }, game, terrain, fx, save, view: () => view, R,
  step(sec, dt = 1 / 60) { for (let t = 0; t < sec; t += dt) tick(dt); },
  // simulation only (no drawing) for fast headless bots
  fast(sec, dt = 1 / 60) { for (let t = 0; t < sec; t += dt) { game.update(dt); if (bannerT > 0) bannerT -= dt; } },
  start: startMatch, toTitle, pause, showResults,
  aimFire(angle, power, weapon) { if (weapon) game.selectWeapon(weapon); game.setAim(angle, power); return game.fire(); },
  solve() { const tk = game.cur; return game.botSolve(tk, tk.weapon); },
  canAct, openPicker, closePicker,
};

toTitle();
if (params.get('play') === '1') startMatch(params.get('pvp') === '1' ? 'pvp' : 'bot', params.has('rank') ? Math.min(3, +params.get('rank')) : save.rank);
layout();
requestAnimationFrame(frame);
