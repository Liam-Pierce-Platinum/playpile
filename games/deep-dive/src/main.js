// Boot, game loop, screens (title / missions / upgrades / pause / results), save, test hooks.
import { MISSIONS, TYPES, TYPE_ORDER, UPGRADES, loadSave, writeSave } from './data.js';
import { World } from './world.js';
import { Renderer } from './render.js';
import { buildSprites } from './sprites.js';
import { initInput, pollInput, input } from './input.js';
import { initAudio, setMuted, isMuted, ambience, sfx } from './audio.js';
import { botThink } from './bot.js';
import { fmtTime } from './util.js';

const qs = new URLSearchParams(location.search);
let save = loadSave();
setMuted(!!save.muted);
buildSprites();
const canvas = document.getElementById('c');
const R = new Renderer(canvas);
let state = 'title', world = null, attract = null, botOn = qs.has('bot'), lastMission = 0, scale = 1;
const $ = id => document.getElementById(id);
const ui = $('ui');

function resize() {
  const W = innerWidth, H = innerHeight;
  scale = Math.max(1, Math.round(Math.min(W, H) / 190));
  const vw = Math.ceil(W / scale), vh = Math.ceil(H / scale);
  R.resize(vw, vh);
  canvas.style.width = vw * scale + 'px'; canvas.style.height = vh * scale + 'px';
  $('hudbtns').style.top = (24 * scale) + 'px';
  for (const w of [world, attract]) if (w) { w.vw = vw; w.vh = vh; }
}
addEventListener('resize', resize);
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') pause(); });

// ---------------- screens
function show(html, cls = '') { ui.innerHTML = html; ui.className = 'show ' + cls; bindButtons(); }
function hide() { ui.innerHTML = ''; ui.className = ''; }
function bindButtons() {
  ui.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); initAudio(); sfx.click(); act(b.dataset.a, b.dataset.v); }));
}
function nextMission() { return Math.min(save.unlocked - 1, MISSIONS.length - 1); }
const starsHtml = (arr) => [0, 1, 2].map(k => `<i class="st ${arr && arr[k] ? 'on' : ''}">★</i>`).join('');
const coinsHtml = () => `<div class="coins"><b class="ci"></b>${save.coins}</div>`;
const muteHtml = () => `<button class="mini" data-a="mute">${isMuted() ? 'SOUND OFF' : 'SOUND ON'}</button>`;

function title() {
  state = 'title'; world = null;
  if (!attract) makeAttract();
  const m = MISSIONS[nextMission()];
  show(`<div class="panel title">
    <div class="logo">DEEP<br>DIVE</div>
    <div class="sub">RESCUE DIVER</div>
    <button class="big" data-a="play">PLAY</button>
    <div class="next">${TYPES[m.type].label} - ${m.name}</div>
    <div class="row"><button data-a="missions">MISSIONS</button><button data-a="mayday">MAYDAY</button><button data-a="shop">UPGRADES</button></div>
    <div class="row">${coinsHtml()} ${muteHtml()}</div>
    <div class="keys">WASD / ARROWS SWIM - SHIFT KICK - E / SPACE ACT - Q SONAR - P PAUSE - M MUTE</div>
  </div>`, 'menu');
}
function missions() {
  state = 'missions';
  let h = `<div class="panel wide"><h2>MISSIONS</h2><div class="mgrid">`;
  TYPE_ORDER.forEach(type => {
    h += `<div class="mrow"><div class="mtype">${TYPES[type].label}</div>`;
    MISSIONS.filter(m => m.type === type).forEach(m => {
      const locked = m.i >= save.unlocked;
      h += `<button class="mcard ${locked ? 'locked' : ''}" ${locked ? '' : `data-a="start" data-v="${m.i}"`}><span class="mn">${m.i + 1}. ${m.name}</span><span class="ms">${locked ? 'LOCKED' : starsHtml(save.stars[m.i])}</span><span class="mp">${m.survivors} TRAPPED</span></button>`;
    });
    h += `</div>`;
  });
  h += `</div><div class="row"><button data-a="title">BACK</button><button data-a="mayday">MAYDAY (ENDLESS)</button><span class="best">BEST MAYDAY: ${save.mayday || 0} SAVED</span></div></div>`;
  show(h, 'menu');
}
function shop(from) {
  state = 'shop'; shop.from = from || shop.from || 'title';
  let h = `<div class="panel wide"><h2>UPGRADES</h2>${coinsHtml()}<div class="ugrid">`;
  for (const u of UPGRADES) {
    const lv = save.up[u.id] || 0, max = u.vals.length - 1, cost = u.cost[lv];
    const pips = u.vals.slice(1).map((_, k) => `<i class="pip ${k < lv ? 'on' : ''}"></i>`).join('');
    h += `<div class="ucard"><div class="un">${u.name}</div><div class="ud">${u.desc}</div><div class="pips">${pips}</div><div class="uv">${u.fmt(u.vals[lv])}${lv < max ? ' &gt; ' + u.fmt(u.vals[lv + 1]) : ''}</div>
      ${lv >= max ? '<button disabled>MAXED</button>' : `<button data-a="buy" data-v="${u.id}" ${save.coins < cost ? 'class="poor"' : ''}><b class="ci"></b>${cost}</button>`}</div>`;
  }
  h += `</div><div class="row"><button data-a="${shop.from === 'results' ? 'retry' : 'title'}">${shop.from === 'results' ? 'RETRY' : 'BACK'}</button><button class="go" data-a="play">PLAY</button></div></div>`;
  show(h, 'menu');
}
function pause() {
  if (state !== 'play') return;
  state = 'pause';
  show(`<div class="panel"><h2>PAUSED</h2><button class="big" data-a="resume">RESUME</button><div class="row"><button data-a="retry">RESTART</button><button data-a="quit">MENU</button></div><div class="row">${muteHtml()}</div></div>`, 'menu dim');
}
function results(r) {
  state = 'results';
  save.coins += r.coins; save.plays = (save.plays || 0) + 1;
  let head, sub = '';
  if (r.mayday) {
    const best = r.rescued > (save.mayday || 0); if (best) save.mayday = r.rescued;
    head = 'MAYDAY OVER'; sub = `${r.rescued} SAVED - WAVE ${r.wave}${best ? ' - NEW BEST!' : ''}`;
  } else {
    const m = r.mission;
    const old = save.stars[m.i] || [false, false, false];
    if (r.passed) { save.stars[m.i] = old.map((v, k) => v || r.stars[k]); save.unlocked = Math.max(save.unlocked, Math.min(MISSIONS.length, m.i + 2)); }
    head = !r.survived ? 'YOU BLACKED OUT' : r.passed ? (r.rescued === r.total ? 'ALL SAVED!' : 'MISSION COMPLETE') : 'MISSION FAILED';
    sub = `${m.name} - ${r.rescued}/${r.total} RESCUED - ${fmtTime(r.time)}`;
  }
  writeSave(save);
  r.passed || r.mayday ? (r.rescued ? sfx.win() : 0) : 0;
  const stars = r.mayday ? '' : `<div class="bigstars">${r.stars.map((s, k) => `<div class="sb ${s && r.passed ? 'on' : ''}" style="animation-delay:${0.15 + k * 0.25}s">★<span>${['ALL SAVED', 'UNDER PAR', 'NO DAMAGE'][k]}</span></div>`).join('')}</div>`;
  const canNext = !r.mayday && r.passed && r.mission.i + 1 < MISSIONS.length;
  show(`<div class="panel">
    <h2 class="${r.passed || r.mayday ? 'good' : 'bad'}">${head}</h2>
    <div class="sub">${sub}</div>${stars}
    <div class="earn"><b class="ci"></b>+${r.coins} <span>(TOTAL ${save.coins})</span></div>
    ${!r.mayday && !r.passed && r.survived ? '<div class="hint">RESCUE AT LEAST HALF TO PASS</div>' : ''}
    <button class="big" data-a="${canNext ? 'next' : 'retry'}">${canNext ? 'NEXT MISSION' : 'RETRY'}</button>
    <div class="row">${canNext ? '<button data-a="retry">RETRY (R)</button>' : ''}<button data-a="shopr">UPGRADES</button><button data-a="quit">MENU</button></div>
  </div>`, 'menu dim');
}

function act(a, v) {
  if (a === 'play') startMission(nextMission());
  else if (a === 'start') startMission(+v);
  else if (a === 'mayday') startMayday();
  else if (a === 'missions') missions();
  else if (a === 'shop') shop('title');
  else if (a === 'shopr') shop('results');
  else if (a === 'title' || a === 'quit') title();
  else if (a === 'resume') { state = 'play'; hide(); }
  else if (a === 'retry') { if (lastMission === 'mayday') startMayday(); else startMission(lastMission); }
  else if (a === 'next') startMission(Math.min(MISSIONS.length - 1, lastMission + 1));
  else if (a === 'mute') { setMuted(!isMuted()); save.muted = isMuted(); writeSave(save); ui.querySelectorAll('[data-a=mute]').forEach(b => b.textContent = isMuted() ? 'SOUND OFF' : 'SOUND ON'); $('bMute').textContent = isMuted() ? '♪̸' : '♪'; }
  else if (a === 'buy') {
    const u = UPGRADES.find(x => x.id === v), lv = save.up[v] || 0;
    if (lv < u.vals.length - 1 && save.coins >= u.cost[lv]) { save.coins -= u.cost[lv]; save.up[v] = lv + 1; writeSave(save); sfx.buy(); shop(); }
  }
}

function startMission(i) {
  initAudio();
  lastMission = i; world = new World({ mission: MISSIONS[i] }, save); world.vw = R.vw; world.vh = R.vh; world.snapCam();
  state = 'play'; hide(); sfx.splash(); $('bPing').classList.toggle('off', !world.up.sonar);
}
function startMayday() {
  initAudio();
  lastMission = 'mayday'; world = new World({ mayday: true }, save); world.vw = R.vw; world.vh = R.vh; world.snapCam();
  state = 'play'; hide(); sfx.splash(); $('bPing').classList.toggle('off', !world.up.sonar);
}
function makeAttract() {
  attract = new World({ mission: MISSIONS[(Math.random() * 8) | 0], attract: true }, Object.assign({}, save, { up: { light: 2, sonar: 0, sled: 1 } }));
  attract.vw = R.vw; attract.vh = R.vh; attract.snapCam();
}

// ---------------- input
initInput(e => {
  initAudio();
  const c = e.code;
  if (c === 'KeyM') act('mute');
  if (state === 'play' && (c === 'Escape' || c === 'KeyP')) pause();
  else if (state === 'pause' && (c === 'Escape' || c === 'KeyP')) act('resume');
  if ((state === 'play' || state === 'pause' || state === 'results') && c === 'KeyR') act('retry');
  if (state === 'results' && (c === 'Enter' || c === 'Space')) { const b = ui.querySelector('button.big'); b && b.click(); }
  if (state === 'title' && (c === 'Enter' || c === 'Space')) act('play');
  if ((state === 'missions' || state === 'shop') && c === 'Escape') title();
});
$('bPause').addEventListener('click', e => { e.stopPropagation(); if (state === 'play') pause(); else if (state === 'pause') act('resume'); });
$('bMute').addEventListener('click', e => { e.stopPropagation(); act('mute'); });
$('bMute').textContent = isMuted() ? '♪̸' : '♪';

// ---------------- loop
const DT = 1 / 60;
let acc = 0, last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const el = Math.min(0.1, (now - last) / 1000); last = now; acc += el;
  pollInput();
  if (input.ping) pingLatch = true; if (input.boostPressed) boostLatch = true;
  R.touch = input.touch;
  document.body.classList.toggle('playing', state === 'play');
  let steps = 0;
  while (acc >= DT && steps < 6) { tick(DT); acc -= DT; steps++; }
  if (acc > DT) acc = 0;
  const w = state === 'title' || state === 'missions' || state === 'shop' ? attract : world;
  if (w) R.draw(w, { noHud: w.attract || state === 'results' });
}
let pingLatch = false, boostLatch = false;
function tick(dt) {
  if (state === 'play' && world) {
    if (botOn) world.inp = botThink(world, dt);
    else world.inp = { mx: input.mx, my: input.my, act: input.act, boost: input.boost, ping: pingLatch, boostPressed: boostLatch };
    pingLatch = boostLatch = false;
    world.update(dt);
    const d = world.diver;
    ambience(1, Math.min(1, d.wy / 800));
    if (world.state === 'done') results(world.result);
  } else if (attract && (state === 'title' || state === 'missions' || state === 'shop')) {
    attract.inp = botThink(attract, dt); attract.update(dt);
    if (attract.state === 'done' || attract.time > 150) makeAttract();
    ambience(0.5, 0.3);
  } else ambience(0.35, 0.3);
}

// ---------------- test hooks
window.__G = {
  get state() { return state; }, get world() { return world; }, get save() { return save; },
  start: i => startMission(i), mayday: () => startMayday(), title: () => title(), act,
  bot(on) { botOn = on; },
  setSave(s) { save = Object.assign(loadSave(), s); writeSave(save); },
  // run the simulation headlessly for `sec` seconds (no rendering), returns the world
  step(sec) { const n = Math.round(sec / DT); for (let k = 0; k < n && state === 'play'; k++) tick(DT); return world; },
  missions: MISSIONS, renderer: R,
};

resize();
if (qs.has('mission')) startMission(Math.max(0, Math.min(MISSIONS.length - 1, +qs.get('mission'))));
else if (qs.get('mode') === 'mayday') startMayday();
else if (qs.has('play') || (!qs.has('title') && !save.plays && save.unlocked <= 1)) startMission(nextMission()); // first visit lands straight in mission 1
else title();
addEventListener('pointerdown', () => initAudio(), { capture: true });
requestAnimationFrame(frame);
